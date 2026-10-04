/**
 * scripts/validate-dataset.mjs
 *
 * 合并结果的校验门。三类检查：
 *   1. 计数门 —— 三个来源解析出的化合物/信号行数必须与已核对过的基线一致；
 *   2. 锚点峰 —— 人工从原文抄录的若干位移，逐条比对（防止列错位、错配）；
 *   3. 异常值扫描 —— 超出生理范围的位移、被覆盖值的巨大偏差、结构完整性。
 *
 * 任一硬性检查失败即以非零码退出，可直接接进 CI。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOLVENTS } from './lib/solvents.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, '.cache');
const DATASET = path.join(ROOT, 'public', 'data', 'nmr_data_v1.json');

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/* -------------------------------- 1. 计数门 ------------------------------- */

/** 已人工核对过的解析基线（来自三篇文献原文 / SI） */
const PARSED_BASELINE = {
  gottlieb1997: { compounds: 34, rows: 845 },
  fulmer2010: { compounds: 57, rows: 2671 },
  babij2016: { compounds: 51, rows: 1707 },
};

for (const [id, expect] of Object.entries(PARSED_BASELINE)) {
  const raw = JSON.parse(fs.readFileSync(path.join(CACHE, `normalized-${id}.json`), 'utf8'));
  const compounds = new Set(
    raw.rows.filter((r) => (r.kind ?? 'compound') === 'compound').map((r) => r.compoundRaw),
  ).size;
  if (compounds !== expect.compounds) {
    fail(`[计数] ${id} 化合物 ${compounds}，基线 ${expect.compounds}`);
  }
  if (raw.rows.length !== expect.rows) {
    fail(`[计数] ${id} 信号行 ${raw.rows.length}，基线 ${expect.rows}`);
  }
}

/* ------------------------------- 数据集载入 ------------------------------ */

const ds = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
const byId = new Map(ds.compounds.map((c) => [c.id, c]));
const bySolvent = new Map(ds.solvents.map((s) => [s.id, s]));

if (ds.solvents.length !== SOLVENTS.length) {
  fail(`[结构] 溶剂数 ${ds.solvents.length}，期望 ${SOLVENTS.length}`);
}
for (const s of SOLVENTS) if (!bySolvent.has(s.id)) fail(`[结构] 缺少溶剂 ${s.id}`);

/* -------------------------------- 2. 锚点峰 ------------------------------- */

/**
 * 按归属取信号。同一归属可能对应多条信号（2016 SI 把乙酸乙酯的 CH3 与 CH2 都标成
 * "CH2CH3"），故取位移最接近期望值的那条。
 */
function signalAt(compoundId, solventId, nucleus, assignment, want) {
  const c = byId.get(compoundId);
  const arr = c?.signals?.[solventId]?.[nucleus] ?? [];
  const key = (assignment ?? '').replace(/\s+/g, '').toLowerCase();
  const hits = arr.filter((s) => (s.assignment ?? '').replace(/\s+/g, '').toLowerCase() === key);
  if (!hits.length) return undefined;
  return hits.reduce((a, b) => (Math.abs(b.shift - want) < Math.abs(a.shift - want) ? b : a));
}

/** [化合物, 溶剂, 核, 归属, 期望位移, 容差] */
const ANCHORS = [
  ['pyridine', 'cdcl3', '1H', 'CH (2,6)', 8.615, 0.01],
  ['pyridine', 'cdcl3', '1H', 'CH (4)', 7.68, 0.01],
  ['pyridine', 'cd3cn', '13C', 'CH (3,5)', 124.77, 0.01],
  ['pyridine', 'cd3cn', '13C', 'CH (2,6)', 150.78, 0.01],
  ['tert-butanol', 'cd3od', '1H', 'CH3', 1.22, 0.01],
  ['acetone', 'cdcl3', '1H', 'CH3', 2.17, 0.01],
  ['acetonitrile', 'cdcl3', '1H', 'CH3', 2.1, 0.01],
  ['ethylacetate', 'cdcl3', '1H', 'CH3CO', 2.05, 0.01],
  ['ethylacetate', 'cdcl3', '1H', 'CH2CH3', 4.12, 0.01],
  ['acetonitrile', 'c6d6', '1H', 'CH3', 0.58, 0.01],
  ['aceticacid', 'c6d6', '1H', 'CH3', 1.52, 0.01],
  ['1,2-dimethoxyethane', 'dmso_d6', '13C', 'CH2', 71.17, 0.01],
  ['bht', 'c6d6', '13C', 'CH(3,5)', 125.83, 0.01],
  ['bht', 'c6d6', '13C', 'C(4)', 128.52, 0.01],
];

for (const [c, sol, nuc, asg, want, tol] of ANCHORS) {
  const sig = signalAt(c, sol, nuc, asg, want);
  if (!sig) fail(`[锚点] 缺失 ${c} / ${sol} / ${nuc} / ${asg}`);
  else if (Math.abs(sig.shift - want) > tol) {
    fail(`[锚点] ${c} / ${sol} / ${nuc} / ${asg} = ${sig.shift}，期望 ${want}`);
  }
}

/** 溶剂自身信号的锚点：[溶剂, 类别, 核, 期望位移] */
const SOLVENT_ANCHORS = [
  ['cdcl3', 'residual', '1H', 7.26],
  ['cdcl3', 'water', '1H', 1.56],
  ['cdcl3', 'solventCarbon', '13C', 77.16],
  ['dmso_d6', 'residual', '1H', 2.5],
  ['dmso_d6', 'water', '1H', 3.33],
  ['dmso_d6', 'solventCarbon', '13C', 39.52],
  ['d2o', 'residual', '1H', 4.79],
];
for (const [sol, kind, nuc, want] of SOLVENT_ANCHORS) {
  const sig = (bySolvent.get(sol)?.signals ?? []).find((s) => s.kind === kind && s.nucleus === nuc);
  if (!sig) fail(`[锚点] 溶剂 ${sol} 缺 ${kind}/${nuc}`);
  else if (Math.abs(sig.shift - want) > 0.01) {
    fail(`[锚点] 溶剂 ${sol} ${kind}/${nuc} = ${sig.shift}，期望 ${want}`);
  }
}

/* ------------------------------ 3. 异常值扫描 ----------------------------- */

const RANGE = { '1H': [-2, 16], '13C': [-20, 250] };
const VALID_SOURCES = new Set(Object.keys(PARSED_BASELINE));
let signalCount = 0;
let supersededCount = 0;
let hugeDelta = 0;
const solventCoverage = new Map();

for (const c of ds.compounds) {
  if (!c.id || !c.name) fail(`[结构] 化合物缺 id/name: ${JSON.stringify(c.id)}`);
  if (!c.nameRaw?.length) warn(`[结构] ${c.id} 缺 nameRaw`);
  const byNucTotal = { '1H': 0, '13C': 0 };
  for (const [solventId, byNuc] of Object.entries(c.signals)) {
    if (!bySolvent.has(solventId)) fail(`[结构] ${c.id} 出现未知溶剂 ${solventId}`);
    for (const [nucleus, arr] of Object.entries(byNuc)) {
      if (!RANGE[nucleus]) fail(`[结构] 未知核素 ${nucleus}（${c.id}）`);
      if (!arr.length) warn(`[结构] ${c.id}/${solventId}/${nucleus} 是空数组`);
      for (const s of arr) {
        signalCount += 1;
        byNucTotal[nucleus] += 1;
        if (!VALID_SOURCES.has(s.source)) fail(`[结构] ${c.id} 的信号来源非法: ${s.source}`);
        if (!Number.isFinite(s.shift)) fail(`[结构] ${c.id} 位移非数值`);
        else if (s.shift < RANGE[nucleus][0] || s.shift > RANGE[nucleus][1]) {
          warn(`[异常] ${c.id}/${solventId}/${nucleus} 位移 ${s.shift} 超出参考范围`);
        }
        for (const sup of s.superseded ?? []) {
          supersededCount += 1;
          if (Math.abs(sup.shift - s.shift) > 20) {
            hugeDelta += 1;
            warn(
              `[异常] ${c.id}/${solventId}/${nucleus} ${s.assignment} 被覆盖值偏差 ${(
                sup.shift - s.shift
              ).toFixed(2)} ppm（${sup.source}）`,
            );
          }
        }
      }
      solventCoverage.set(solventId, (solventCoverage.get(solventId) ?? 0) + arr.length);
    }
  }
  if (byNucTotal['1H'] + byNucTotal['13C'] === 0) fail(`[结构] ${c.id} 没有任何信号`);
}

if (ds.meta.counts.signals !== signalCount) {
  fail(`[计数] meta.counts.signals=${ds.meta.counts.signals}，实算 ${signalCount}`);
}
if (ds.meta.counts.compounds !== ds.compounds.length) {
  fail(`[计数] meta.counts.compounds=${ds.meta.counts.compounds}，实算 ${ds.compounds.length}`);
}
if (!ds.meta.precedence?.length) fail('[结构] meta.precedence 缺失');
for (const id of Object.keys(PARSED_BASELINE)) {
  if (!(id in ds.meta.counts.bySource)) fail(`[结构] meta.counts.bySource 缺 ${id}`);
}

/* ------------------------------ 4. 富集覆盖率 ----------------------------- */

/**
 * CAS / 分子式 / 分子量 / SMILES 来自 PubChem（meta.external），非文献原文。
 * 这里只做「有没有补上、补得对不对」的核对：全部是 warning 级，
 * 因为缺中文名 / 缺 CAS 属正常（PubChem 本身未必收录），不影响数据集可用。
 */
const noEnrichSet = new Set(['pump-oil', 'silicone-grease', 'apiezon-h-grease']);
let enriched = 0;
const missingExternal = [];
const missingChinese = [];
const noCas = [];

/** 硬锚点：[化合物, 期望分子式, 期望分子量, 容差] —— 仅在该化合物已富集时校验 */
const ENRICH_ANCHORS = [
  ['aceticacid', 'C2H4O2', 60.05, 0.05],
  ['pyridine', 'C5H5N', 79.1, 0.05],
  ['acetone', 'C3H6O', 58.08, 0.05],
  ['bht', 'C15H24O', 220.35, 0.05],
  ['benzene', 'C6H6', 78.11, 0.05],
];

for (const c of ds.compounds) {
  if (!c.chineseName) missingChinese.push(c.id);
  else if (c.chineseNameSource !== 'manual') {
    // 目前中文名只能来自人工表；出现别的来源说明有人改了管线却忘了同步这里
    warn(`[富集] ${c.id} 中文名来源未知: ${c.chineseNameSource}`);
  }

  if (noEnrichSet.has(c.id)) {
    if (c.external) fail(`[富集] ${c.id} 不应有 external（混合物/商品名）`);
    continue;
  }
  if (!c.external) {
    missingExternal.push(c.id);
    continue;
  }
  if (c.external.source !== 'PubChem') fail(`[富集] ${c.id} external.source 非 PubChem`);
  if (!Number.isFinite(c.external.cid)) fail(`[富集] ${c.id} external.cid 非法`);
  if (!c.formula || !(c.mw > 0)) fail(`[富集] ${c.id} 已富集但 formula/mw 缺失`);
  enriched += 1;
  if (!c.cas) noCas.push(c.id);
}

for (const [id, formula, mw, tol] of ENRICH_ANCHORS) {
  const c = byId.get(id);
  if (!c?.external) continue; // 未富集时跳过，不误报
  if (c.formula !== formula) fail(`[富集锚点] ${id} 分子式 ${c.formula}，期望 ${formula}`);
  if (Math.abs(c.mw - mw) > tol) fail(`[富集锚点] ${id} 分子量 ${c.mw}，期望 ${mw}`);
}

if (missingExternal.length) {
  warn(`[富集] ${missingExternal.length} 个化合物未富集: ${missingExternal.join(', ')}`);
}
if (missingChinese.length) {
  warn(`[富集] ${missingChinese.length} 个化合物缺中文名: ${missingChinese.join(', ')}`);
}
if (noCas.length) warn(`[富集] ${noCas.length} 个化合物 PubChem 未给 CAS（可接受）`);

/**
 * 同一个 CID 挂在两个 id 下 = 同一物质被拆成两条（文献命名不一致所致）。
 * 富集前无从发现，故在此暴露，供人工确认是否并入同义组。
 */
const cidIndex = new Map();
for (const c of ds.compounds) {
  if (!Number.isFinite(c.external?.cid)) continue;
  const list = cidIndex.get(c.external.cid) ?? [];
  list.push(c.id);
  cidIndex.set(c.external.cid, list);
}
for (const [cid, list] of cidIndex) {
  if (list.length > 1) warn(`[富集] CID ${cid} 被多个 id 引用（疑同一物质）: ${list.join(', ')}`);
}

/* --------------------------------- 输出 --------------------------------- */

console.log(`化合物 ${ds.compounds.length}，信号 ${signalCount}，superseded ${supersededCount}`);
console.log(`各来源贡献: ${JSON.stringify(ds.meta.counts.bySource)}`);
console.log(
  `溶剂化合物信号覆盖: ${[...solventCoverage.entries()].map(([k, v]) => `${k}=${v}`).join(' ')}`,
);
if (hugeDelta) console.log(`跨来源偏差 >20 ppm 的记录: ${hugeDelta} 条（见下方 warning）`);
console.log(
  `PubChem 富集: ${enriched}/${ds.compounds.length} 个（另有 ${noEnrichSet.size} 个混合物/商品名不富集）`,
);

for (const w of warnings) console.log(`  WARN  ${w}`);
for (const e of errors) console.log(`  FAIL  ${e}`);
console.log(errors.length ? `\n校验未通过：${errors.length} 项失败` : '\n校验通过');
process.exit(errors.length ? 1 : 0);
