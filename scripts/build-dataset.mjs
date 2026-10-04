/**
 * scripts/build-dataset.mjs
 *
 * 把四个来源的归一化结果合并成单一自包含数据集：
 *   scripts/.cache/normalized-gottlieb1997.json
 *   scripts/.cache/normalized-fulmer2010.json
 *   scripts/.cache/normalized-babij2016.json
 *   scripts/.cache/normalized-cseri2023.json
 *        ↓
 *   public/data/nmr_data_v1.json
 *
 * 三条合并规则：
 *   1. 化合物 / 溶剂命名不一致 —— 由 lib/compounds.mjs、lib/solvents.mjs 归一，
 *      合并时只认规范 ID，不认原始写法。
 *   2. 冲突值 —— 按 PRECEDENCE（babij2016 > fulmer2010 > gottlieb1997 > cseri2023）
 *      取高优先级；2023 仅作补充，只在其独有的化合物/溶剂组合上成为主数据；
 *      低优先级的值不丢弃，写进该信号的 superseded[]。
 *      同一 (化合物, 溶剂, 核) 下，低优先级来源「多出来」的信号会被并入，
 *      并标注其自身来源（提升召回，不牺牲可追溯性）。
 *   3. 溶剂自身信号（残余质子 / 水峰 / ¹³C 溶剂峰）不属化合物，上提到 SolventMeta。
 *
 * 不在此脚本内做 PubChem 富集（CAS / 分子式 / 分子量 / SMILES / 中文名），
 * 这几项先留空，由 scripts/enrich-pubchem.mjs 补齐后标记 meta.external。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOLVENTS, buildSolventAliasMap } from './lib/solvents.mjs';
import { SOLVENT_REFERENCE, SOLVENT_REFERENCE_SOURCE } from './lib/solvent-reference.mjs';
import { resolveCompound, normalizeName, COMPOUND_ALIAS_INDEX, COMPOUND_CHINESE } from './lib/compounds.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, '.cache');
const OUT_FILE = path.join(ROOT, 'public', 'data', 'nmr_data_v1.json');
/** PubChem 富集缓存（由 scripts/enrich-pubchem.mjs 生成）；不存在则跳过富集 */
const PUBCHEM_CACHE = path.join(CACHE, 'pubchem.json');

/**
 * 冲突时取值的优先级（高 → 低）。
 * 1997/2010/2016 同属「常见溶剂痕量位移」表的延续，互为对照且归属标注规整，
 * 故沿用旧源为主；2023 覆盖面更广，但归属改用位次标注（H1/H2…，意义不明），
 * 仅作补充：只在其独有的化合物/溶剂组合上成为主数据。
 */
const PRECEDENCE = ['babij2016', 'fulmer2010', 'gottlieb1997', 'cseri2023'];
const RANK = Object.fromEntries(PRECEDENCE.map((s, i) => [s, i]));

/** 判定「两个来源报的是同一个信号」的位移容差（同溶剂、同核素内比较） */
const SAME_SIGNAL_TOL = { '1H': 0.05, '13C': 0.5 };
/** 位移差小于此值视为「同一个数」，不再记入 superseded（纯四舍五入噪声） */
const NEGLIGIBLE = { '1H': 0.005, '13C': 0.01 };

const round = (v) => Math.round(v * 1e4) / 1e4;

/* ------------------------------- 读取源数据 ------------------------------- */

function loadSource(id) {
  const file = path.join(CACHE, `normalized-${id}.json`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    info: { id, citation: raw.citation, doi: raw.doi, usedPart: raw.usedPart },
    rows: raw.rows.map((r) => ({ ...r, kind: r.kind ?? 'compound', source: id })),
  };
}

const sources = PRECEDENCE.map(loadSource);
const allRows = sources.flatMap((s) => s.rows);

/* ------------------------------- 溶剂自身信号 ------------------------------ */

/** (溶剂, 类别, 核素, 位移) 去重，高优先级来源先写入 */
const solventSignalIndex = new Map();
for (const src of PRECEDENCE) {
  for (const r of allRows) {
    if (r.source !== src || r.kind === 'compound') continue;
    const key = `${r.solventId}|${r.kind}|${r.nucleus}|${round(r.shift)}`;
    // 1997 用括号给出溶剂峰在不同样品中的波动幅度，如 77.16 (0.06)
    const spread = (r.extraShifts || []).map(Math.abs).filter((v) => v > 0);
    const range = spread.length
      ? [round(r.shift - Math.max(...spread)), round(r.shift + Math.max(...spread))]
      : null;

    if (solventSignalIndex.has(key)) {
      // 2010 优先且不给波动幅度，但 1997 给了 —— 补上不冲突的补充信息
      const existing = solventSignalIndex.get(key);
      if (range && !existing.shiftRange) existing.shiftRange = range;
      continue;
    }

    const sig = { kind: r.kind, nucleus: r.nucleus, shift: r.shift, source: r.source };
    if (r.multiplicity) sig.multiplicity = r.multiplicity;
    if (r.coupling?.length) sig.coupling = r.coupling;
    if (range) sig.shiftRange = range;
    solventSignalIndex.set(key, sig);
  }
}

/**
 * D2O 没有「残余质子峰」，4.79 ppm 那条就是 HDO 峰本身；
 * 其位移强烈依赖温度，故挂上 1997 给出的换算公式（Eq 1）。
 */
const WATER_TEMP_FORMULA = 'δ(HDO) = 5.060 − 0.0122·T + 2.11e−5·T²（T/°C，1997 Eq 1）';
for (const sig of solventSignalIndex.values()) {
  if (sig.kind === 'residual' && sig.nucleus === '1H' && sig.shift === 4.79) {
    sig.temperatureNote = 'D2O 中的 HDO 峰，位移随温度显著变化';
    sig.waterTempFormula = WATER_TEMP_FORMULA;
  }
}

const solventSignals = new Map(); // solventId -> SolventSignal[]
for (const [key, sig] of solventSignalIndex) {
  const solventId = key.split('|')[0];
  if (!solventSignals.has(solventId)) solventSignals.set(solventId, []);
  solventSignals.get(solventId).push(sig);
}
for (const arr of solventSignals.values()) arr.sort((a, b) => a.shift - b.shift);

/**
 * 溶剂定义 + 文献溶剂自身信号 + 参考表数据（物理性质 / 参考溶剂峰）。
 * 注意：referenceSignals 与 signals 分开存放 —— 参考表与一级文献口径不同
 * （如 CDCl3 残余峰参考表 7.24 vs 文献 7.26），参考值仅展示、不参与检索与合并。
 */
const solvents = SOLVENTS.map((s) => {
  const ref = SOLVENT_REFERENCE[s.id];
  const meta = {
    id: s.id,
    label: s.label,
    formula: s.formula,
    aliases: s.aliases,
    signals: solventSignals.get(s.id) ?? [],
  };
  if (s.referenceOnly) meta.referenceOnly = true;
  if (ref) {
    meta.properties = {
      ...(ref.cas ? { cas: ref.cas } : {}),
      ...(Number.isFinite(ref.mw) ? { mw: ref.mw } : {}),
      ...(Number.isFinite(ref.density) ? { density: ref.density } : {}),
      ...(Number.isFinite(ref.meltingPoint) ? { meltingPoint: ref.meltingPoint } : {}),
      ...(Number.isFinite(ref.boilingPoint) ? { boilingPoint: ref.boilingPoint } : {}),
      ...(Number.isFinite(ref.dielectricConstant)
        ? { dielectricConstant: ref.dielectricConstant }
        : {}),
      ...(ref.physicalNote ? { physicalNote: ref.physicalNote } : {}),
      source: SOLVENT_REFERENCE_SOURCE.id,
    };
    meta.referenceSignals = ref.signals;
  }
  return meta;
});

/* --------------------------------- 化合物 -------------------------------- */

/** `${compoundId}|${solventId}|${nucleus}` -> rows[] */
const groups = new Map();
const rawNamesByCompound = new Map(); // compoundId -> Set<raw>

for (const r of allRows) {
  if (r.kind !== 'compound') continue;
  const { id } = resolveCompound(r.compoundRaw);
  if (!rawNamesByCompound.has(id)) rawNamesByCompound.set(id, new Map());
  rawNamesByCompound.get(id).set(normalizeName(r.compoundRaw), r.compoundRaw);
  const key = `${id}|${r.solventId}|${r.nucleus}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

function toSignal(r) {
  const s = {
    shift: r.shift,
    coupling: r.coupling ?? [],
    footnoteRefs: r.footnotes ?? [],
    source: r.source,
    rawText: r.rawText,
  };
  if (r.shiftRange) s.shiftRange = r.shiftRange;
  if (r.assignment) s.assignment = r.assignment;
  if (r.multiplicityRaw) s.multiplicityRaw = r.multiplicityRaw;
  if (r.multiplicity) s.multiplicity = r.multiplicity;
  return s;
}

/** 在候选信号里找位移最近的一条 */
function nearest(signals, shift) {
  let best = null;
  let bd = Infinity;
  for (const s of signals) {
    const d = Math.abs(s.shift - shift);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best ? { signal: best, delta: bd } : null;
}

/** `化合物|溶剂|核素` 分组 -> 该组最终信号列表（高优先级来源为准） */
function mergeGroup(rows, nucleus) {
  const sorted = [...rows].sort((a, b) => RANK[a.source] - RANK[b.source]);
  const primarySource = sorted[0].source;
  const base = sorted.filter((r) => r.source === primarySource);
  const others = sorted.filter((r) => r.source !== primarySource);

  const signals = base.map(toSignal);
  const tol = SAME_SIGNAL_TOL[nucleus];

  for (const r of others) {
    const key = normalizeName(r.assignment ?? '');

    // 判定「同一个信号」有两条独立依据，按可靠度依次尝试：
    //   a) 位移几乎相同 —— 归属写法不同也认（1997 的 C(4) 与 2010 的 CH(3,5) 归属颠倒，
    //      但数值 128.52 完全一致，此时按数值配对才不会错配）；
    //      比较时把 superseded 里的历史值也算作候选，否则同一个旧值会被
    //      第二个来源重复认成一条新信号（pyridine ¹³C/CD3CN 的 127.76）。
    //   b) 归属完全相同 —— 位移差得多也认（pyridine ¹³C/CD3CN 由 2010 的 127.76
    //      更正为 2016 的 124.77，差值 3 ppm 远超容差，只有归属能证明是同一峰）。
    let hit = null;
    let bd = Infinity;
    for (const s of signals) {
      const shifts = [s.shift, ...(s.superseded ?? []).map((x) => x.shift)];
      for (const v of shifts) {
        const d = Math.abs(v - r.shift);
        if (d < bd) {
          bd = d;
          hit = s;
        }
      }
    }
    if (bd > tol) hit = null;
    if (!hit && key) {
      const sameKey = signals.filter((s) => normalizeName(s.assignment ?? '') === key);
      hit = nearest(sameKey, r.shift)?.signal ?? null;
    }

    if (!hit) {
      signals.push(toSignal(r)); // 高优先级来源没报过这条，保留并标注自身来源
      continue;
    }
    const recorded = (hit.superseded ?? []).some(
      (x) => Math.abs(x.shift - r.shift) <= NEGLIGIBLE[nucleus],
    );
    if (Math.abs(hit.shift - r.shift) > NEGLIGIBLE[nucleus] && !recorded) {
      (hit.superseded ??= []).push({
        shift: r.shift,
        source: r.source,
        note: `${primarySource} 优先，${r.source} 报 ${r.shift}`,
      });
    }
  }

  // 来源自身可能把同一重叠峰拆成两行（2016 SI 的 benzyl alcohol 芳香氢列了两条
  // 完全相同的 "CH 7.33 m"），同归属 + 同位移 + 同裂分视为同一条，去掉重复。
  const deduped = signals.filter(
    (s, i) =>
      !signals.some(
        (o, j) =>
          j < i &&
          Math.abs(o.shift - s.shift) <= NEGLIGIBLE[nucleus] &&
          normalizeName(o.assignment ?? '') === normalizeName(s.assignment ?? '') &&
          (o.multiplicityRaw ?? '') === (s.multiplicityRaw ?? ''),
      ),
  );

  deduped.sort((a, b) => a.shift - b.shift);
  return { primarySource, signals: deduped };
}

/** compoundId -> CompoundData */
const compoundMap = new Map();
for (const [key, rows] of groups) {
  const [id, solventId, nucleus] = key.split('|');
  const { signals } = mergeGroup(rows, nucleus);
  if (!compoundMap.has(id)) {
    const raws = [...(rawNamesByCompound.get(id)?.values() ?? [])];
    const { name, category } = resolveCompound(raws[0] ?? id);
    compoundMap.set(id, {
      id,
      name,
      nameRaw: raws,
      chineseName: '',
      cas: '',
      formula: '',
      mw: 0,
      category,
      signals: {},
    });
  }
  const c = compoundMap.get(id);
  (c.signals[solventId] ??= {})[nucleus] = signals;
}

const compounds = [...compoundMap.values()].sort((a, b) => a.id.localeCompare(b.id));

/* --------------------------- PubChem 富集（可选） -------------------------- */

/**
 * CAS / 分子式 / 分子量 / SMILES / 中文名来自 PubChem，非文献原文，
 * 故统一标记 `external`。缓存缺失时这几项保持占位（''），不阻断构建。
 */
const pubchemEntries = fs.existsSync(PUBCHEM_CACHE)
  ? (JSON.parse(fs.readFileSync(PUBCHEM_CACHE, 'utf8')).entries ?? {})
  : {};
let enrichedCount = 0;
for (const c of compounds) {
  const e = pubchemEntries[c.id];
  if (!e || !Number.isFinite(e.cid)) continue;
  c.chineseName = e.chineseName || '';
  c.cas = e.cas || '';
  c.formula = e.formula || '';
  c.mw = Number.isFinite(e.mw) ? e.mw : 0;
  if (e.smiles) c.smiles = e.smiles;
  c.external = { source: 'PubChem', cid: e.cid, fetchedAt: e.fetchedAt };
  enrichedCount += 1;
}

/**
 * 中文名：PubChem 不收录，改由 lib/compounds.mjs 的人工整理表提供，
 * 故来源单独标记，不与 PubChem 的 CAS / 分子式混淆。
 */
let chineseCount = 0;
for (const c of compounds) {
  if (c.chineseName) continue; // PubChem 给了就用（实际不会）
  const zh = COMPOUND_CHINESE[c.id];
  if (!zh) continue;
  c.chineseName = zh;
  c.chineseNameSource = 'manual';
  chineseCount += 1;
}

/* --------------------------------- 元信息 -------------------------------- */

/** 文献在 SI 更正页里明示的修订（数值确凿者） */
const corrections = [
  {
    compoundId: 'aceticacid',
    solventId: 'c6d6',
    nucleus: '1H',
    assignment: 'CH3',
    from: 1.55,
    to: 1.52,
    reportedBy: 'fulmer2010',
    note: '2010 SI "Corrections and Comments"：原文误报为 1.55 ppm',
  },
  {
    compoundId: 'acetonitrile',
    solventId: 'c6d6',
    nucleus: '1H',
    assignment: 'CH3',
    from: 1.55,
    to: 0.58,
    reportedBy: 'fulmer2010',
    note: '2010 SI "Corrections and Comments"：原文误报为 1.55 ppm',
  },
  {
    compoundId: 'tert-butanol',
    solventId: 'c6d6',
    nucleus: '1H',
    assignment: 'OH',
    from: 1.55,
    to: 0.63,
    reportedBy: 'fulmer2010',
    note: '2010 SI "Corrections and Comments"：原文误报为 1.55 ppm',
  },
  {
    compoundId: '2-propanol',
    solventId: 'cd3od',
    nucleus: '1H',
    assignment: 'CH3',
    from: 1.5,
    to: 1.15,
    reportedBy: 'fulmer2010',
    note: '2010 SI "Corrections and Comments"：1997 报 1.50 ppm，更正为 1.15 ppm',
  },
  {
    compoundId: '1,2-dimethoxyethane',
    solventId: 'dmso_d6',
    nucleus: '13C',
    assignment: 'CH2',
    from: 17.07,
    to: 71.17,
    reportedBy: 'fulmer2010',
    note: '1997 原文该值(17.07)与 2010 SI(71.17)相差 >50 ppm，按优先级取 2010 值',
  },
];

const compoundAliases = {};
for (const [alias, id] of Object.entries(COMPOUND_ALIAS_INDEX)) compoundAliases[alias] = id;
for (const [id, raws] of rawNamesByCompound) {
  for (const norm of raws.keys()) compoundAliases[norm] ??= id;
}

const bySource = Object.fromEntries(PRECEDENCE.map((s) => [s, 0]));
let signalCount = 0;
for (const c of compounds) {
  for (const byNuc of Object.values(c.signals)) {
    for (const arr of Object.values(byNuc)) {
      signalCount += arr.length;
      for (const s of arr) bySource[s.source] += 1;
    }
  }
}
// 参考表的溶剂自身信号单列计数（不参与化合物信号统计）
bySource[SOLVENT_REFERENCE_SOURCE.id] = solvents.reduce(
  (n, s) => n + (s.referenceSignals?.length ?? 0),
  0,
);

const dataset = {
  meta: {
    version: '1.2.0',
    generatedAt: new Date().toISOString(),
    sources: [...sources.map((s) => s.info), SOLVENT_REFERENCE_SOURCE],
    precedence: PRECEDENCE,
    corrections,
    solventAliases: buildSolventAliasMap(),
    compoundAliases,
    counts: { compounds: compounds.length, signals: signalCount, bySource },
  },
  solvents,
  compounds,
};

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(dataset, null, 1), 'utf8');

/* --------------------------------- 报告 --------------------------------- */

const supersededTotal = compounds.reduce((n, c) => {
  let k = 0;
  for (const byNuc of Object.values(c.signals))
    for (const arr of Object.values(byNuc))
      for (const s of arr) k += s.superseded?.length ?? 0;
  return n + k;
}, 0);

const singleSource = compounds.filter((c) => {
  const srcs = new Set();
  for (const byNuc of Object.values(c.signals))
    for (const arr of Object.values(byNuc)) for (const s of arr) srcs.add(s.source);
  return srcs.size === 1;
});

console.log(`[build] 输出 ${path.relative(ROOT, OUT_FILE)}`);
console.log(`[build] 溶剂 ${solvents.length} 种，其中含自身信号的 ${[...solventSignals.keys()].length} 种`);
console.log(
  `[build] 溶剂参考表覆盖 ${solvents.filter((s) => s.referenceSignals?.length).length} 种，` +
    `含物理性质 ${solvents.filter((s) => s.properties).length} 种`,
);
console.log(
  `[build] 化合物 ${compounds.length} 个，信号 ${signalCount} 条（¹H/¹³C 合计，不含溶剂自身信号）`,
);
console.log(`[build] 各来源贡献: ${JSON.stringify(bySource)}`);
console.log(`[build] superseded 记录: ${supersededTotal} 条`);
console.log(`[build] 仅单一来源出现的化合物: ${singleSource.length} 个`);
console.log(`[build] PubChem 富集化合物: ${enrichedCount} 个`);
console.log(`[build] 人工中文名: ${chineseCount} 个`);
console.log(`[build] 文件大小: ${(fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);
