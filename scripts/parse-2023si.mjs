/**
 * scripts/parse-2023si.mjs
 *
 * Cseri, L.; Kumar, S.; Palchuber, P.; Székely, G. —— 2023 Supporting Information。
 * "NMR Chemical Shifts of Emerging Green Solvents, Acids, and Bases for Facile
 *  Trace Impurity Analysis"（DOI 10.1021/acssuschemeng.3c00244）。
 *
 * 只用 Part 4「Combined impurity signal tables sorted by chemical shift」（pp.15–201）。
 * 该部分是「位移为主行」(shift-major)：每一行 = 一个信号，按 δ 降序排列；
 * 被测物（绿色溶剂 / 酸 / 碱）以痕量溶于 8 种氘代溶剂中，列出其 ¹H / ¹³C 位移。
 *
 * 版面（每页表头重复）：
 *   ¹H  页  δ [ppm] | Name | Multiplicity, J (Hz) | Proton | ∫ | Comment | Source
 *   ¹³C 页  δ [ppm] | Name | Carbon | Comment | Source
 *
 * 实测得出的关键版面特征（见 scripts/.cache 的坐标转储）：
 *   1. δ 列为最左列，δ 值（**必带小数点**）的 x≈76–99；列内偶见被拆成两 token 的
 *      数值（"8.4"+"0"），以及区间破折号 "–"（en dash，x≈92–104）。
 *   2. Name 列为**居中**排版，长名称会折成上下相邻行，最短的名称片段可左伸到 x≈108
 *      （仍是字母/整数，非小数），故「δ=小数且 x<130」可无歧义地区分 δ 与名称。
 *   3. 一个信号的「字段行」= 含归属 token（¹H 的 H1/H2b…、¹³C 的 C1/C5,C6…）的行；
 *      δ（区间时两行夹住字段行）、多列(J)、归属、积分、Comment、Source 都可能落在
 *      字段行的相邻行上。
 *   4. 相邻字段行的 y 中点切分并不可靠：J 值续行、区间下界行常更靠近「下一个」字段行。
 *      实测把每个非字段行按 |Δy| 就近归给**最近的字段行**才正确。
 *
 * 输出：scripts/.cache/normalized-cseri2023.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPdf } from './lib/pdf-table.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, '.cache');
const SLUG = 'sc3c00244_si_001';
const SOURCE = 'cseri2023';

/** Part 4 分节（页范围依据 SI 目录）：8 溶剂 × {¹H, ¹³C}。 */
const SECTIONS = [
  { nucleus: '1H', solventId: 'cdcl3', first: 15, last: 27 },
  { nucleus: '1H', solventId: 'dmso_d6', first: 28, last: 41 },
  { nucleus: '1H', solventId: 'd2o', first: 42, last: 52 },
  { nucleus: '1H', solventId: 'thf_d8', first: 53, last: 61 },
  { nucleus: '1H', solventId: 'cd3od', first: 62, last: 74 },
  { nucleus: '1H', solventId: 'cd3cn', first: 75, last: 88 },
  { nucleus: '1H', solventId: 'acetone_d6', first: 89, last: 101 },
  { nucleus: '1H', solventId: 'toluene_d8', first: 102, last: 109 },
  { nucleus: '13C', solventId: 'cdcl3', first: 110, last: 122 },
  { nucleus: '13C', solventId: 'dmso_d6', first: 123, last: 136 },
  { nucleus: '13C', solventId: 'd2o', first: 137, last: 146 },
  { nucleus: '13C', solventId: 'thf_d8', first: 147, last: 154 },
  { nucleus: '13C', solventId: 'cd3od', first: 155, last: 167 },
  { nucleus: '13C', solventId: 'cd3cn', first: 168, last: 180 },
  { nucleus: '13C', solventId: 'acetone_d6', first: 181, last: 193 },
  { nucleus: '13C', solventId: 'toluene_d8', first: 194, last: 201 },
];

/** δ 列：δ 数值（含被拆成 "3"+".00"、"8.4"+"0" 的碎片）x<103，区间破折号 x<120 */
const NUM_RE = /^-?\d+(?:\.\d+)?$/;
const DASH_RE = /^[\u2013\u2014]$/;
const DELTA_X = 103;
const DASH_MAX_X = 120;

/**
 * 裂分描述（含尾点写法 "quint." / "sext." 及组合写法 "quint.d" / "dquint."）；
 * x 下限另行判定，避免误伤名称。
 */
const MULT_RE =
  /^(?:br)?(?:s|d|t|q|m|h|p|dd|dt|td|dq|qd|tt|ddd|dtd|ddt|ttd|dtt|dqd|ddq|dddd|ddddd|non|nonet|quin|quint|quintet|sext|sextet|sept|septet|hept|heptet|dquint|dqunt|dsext|dhept|tquint|tsext|complex|spt|tq|qt)(?:\.(?:d|t|q|m|s))?\.?$/;

/** J 值 token："7.5" / "7.8, 3.3" / "12.4," */
const J_RE = /^\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)*,?$/;

/** 积分 token："2H" / "0.24H" / "H" / "N/A" / "3"（区间积分端点） */
const INT_RE = /^(?:\d+(?:\.\d+)?H|H|N\/A|\d+(?:\.\d+)?)$/;

/** token 拼接：间距 ≤1.5pt 视为连写，否则补空格 */
function joinTokens(tokens) {
  let out = '';
  let prev = null;
  for (const t of tokens) {
    if (prev) {
      const gap = t.x - (prev.x + (prev.w || 0));
      out += gap > 1.5 ? ' ' : '';
    }
    out += t.s;
    prev = t;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** 名称清理：连字符/逗号/括号两侧去空白（PDF 会把 "-" "(" 拆成独立 token） */
function cleanName(raw) {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*,\s*/g, ',')
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .replace(/\s+trace$/i, '') // 痕量备注（"… trace"）不是化合物名的一部分
    .trim()
    .replace(/^[\s.\-–—,;:]+/, '')
    .replace(/[\s.\-–—,;:]+$/, '');
}

/**
 * 取一行开头的 δ 片段：从最左 token 起，连续接受「δ 列内的数值 / 破折号」。
 * 名称折行若以整数（"1"@109.82）或字母开头，会在 x 下限处立即停下。
 * 返回 { tokens, numbers }（tokens 用于从名称候选中排除）。
 */
function deltaOf(line) {
  const toks = [...line.items].sort((a, b) => a.x - b.x);
  const picked = [];
  for (const t of toks) {
    if (NUM_RE.test(t.s) && t.x < DELTA_X) {
      picked.push(t);
      continue;
    }
    if (DASH_RE.test(t.s) && t.x < DASH_MAX_X) {
      picked.push(t);
      continue;
    }
    break;
  }
  if (!picked.length) return { tokens: picked, numbers: [] };
  const text = joinTokens(picked);
  const numbers = (text.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  return { tokens: picked, numbers };
}

/** 解析某一节。返回 rows[] */
function parseSection(pdf, sect, report) {
  const isC = sect.nucleus === '13C';
  const assignRe = isC ? /^C\d/ : /^H\d/;
  const rows = [];

  for (let p = sect.first; p <= sect.last; p++) {
    const pg = pdf.pages[p - 1];
    if (!pg) throw new Error(`[2023] 缺页 ${p}`);

    const lines = pg.lines
      .map((ln) => ({ y: ln.y, items: ln.items.filter((it) => it.s.trim()) }))
      .filter((ln) => ln.items.length > 0);

    // ---- 表头：含 Name 且含 Multiplicity,/Carbon ----
    const header = lines.find(
      (ln) =>
        ln.items.some((it) => it.s === 'Name') &&
        ln.items.some((it) => (isC ? it.s === 'Carbon' : it.s === 'Multiplicity,')),
    );
    if (!header) throw new Error(`[2023] 第 ${p} 页找不到表头`);
    const headerY = header.y;
    const hdrItems = lines
      .filter((ln) => Math.abs(ln.y - headerY) <= 13)
      .flatMap((ln) => ln.items);
    const anchor = (name) => hdrItems.find((it) => it.s === name)?.x;
    const xName = anchor('Name') ?? (isC ? 188 : 150);
    const xMult = isC ? null : anchor('Multiplicity,') ?? 225;
    const xAssign = anchor(isC ? 'Carbon' : 'Proton') ?? (isC ? 292 : 300);
    const xInt = isC ? null : anchor('∫') ?? 345;
    const xComment = anchor('Comment') ?? 400;
    const xSource = anchor('Source') ?? 488;

    const dataLines = lines.filter(
      (ln) =>
        ln.y < headerY - 3 &&
        ln.y > 55 &&
        !ln.items.some((it) => /^Table S/.test(it.s)) &&
        !ln.items.some((it) => it.s === '[ppm]' || it.s === 'δ'),
    );

    // ---- 列区间（按表头锚点推导，各页 x 略漂移） ----
    //  δ 列 | Name | [Multiplicity] | J | 归属 | [∫] | Comment | Source
    const srcLo = xSource - 22;
    const comLo = xComment - 40;
    const multLo = isC ? null : xMult - (xMult - xName) * 0.45;
    const assignLo = isC ? xAssign - 32 : xAssign - 45;
    const assignHi = isC ? xComment - 40 : xInt - 12;
    const jLo = isC ? null : xMult + 20;
    const intLo = isC ? null : xInt - 40;
    const intHi = isC ? null : xComment - 30;

    // ---- 记录主行（field line）：「Source 列有值」是最可靠的行锚点 ----
    //      多行名称 / 折行归属会把主行的归属 token 挤到相邻行（如 Eucalyptol 的
    //      "H6 (pro-S)" 上下各半），故不能只凭归属 token 判定主行。
    const isField = (ln) =>
      ln.items.some((it) => it.x >= srcLo && /^(?:This|Refs?\.|N\/A)/.test(it.s));
    const fieldLines = dataLines.filter(isField).sort((a, b) => b.y - a.y);
    if (!fieldLines.length) continue;

    // ---- 非主行按 |Δy| 就近归给最近的主行 ----
    /** @type {Map<object, object[]>} */
    const groups = new Map();
    for (const f of fieldLines) groups.set(f, [f]);
    for (const ln of dataLines) {
      if (groups.has(ln)) continue;
      let best = null;
      let bd = Infinity;
      for (const f of fieldLines) {
        const d = Math.abs(f.y - ln.y);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      if (best && bd <= 11) groups.get(best).push(ln);
      else report.orphan.push({ page: p, y: +ln.y.toFixed(2), raw: rawOf(ln) });
    }

    // ---- 逐字段行生成记录 ----
    for (const f of fieldLines) {
      const group = groups.get(f).sort((a, b) => b.y - a.y); // 自上而下（阅读顺序）

      const nameParts = [];
      const commentParts = [];
      const jParts = [];
      let multRaw = '';
      let assignment = '';
      let integral = '';
      let source = '';
      const numbers = [];

      for (const ln of group) {
        const d = deltaOf(ln);
        if (d.numbers.length) numbers.push(...d.numbers);
        const deltaSet = new Set(d.tokens);

        const lineName = [];
        for (const it of ln.items) {
          if (deltaSet.has(it)) continue;
          const s = it.s;
          const x = it.x;

          if (x < DELTA_X + 2) {
            // δ 列里的非数值 token（如 ¹³C 耦合备注 "(quint.;" "20.7)"）
            commentParts.push(s);
            continue;
          }
          if (x >= srcLo) {
            source += (source ? ' ' : '') + s;
            continue;
          }
          // ∫ 列：数值端点 + 区间破折号（"22 – 28H" 的破折号也在本列）
          if (
            !isC &&
            x >= intLo &&
            x < intHi &&
            (INT_RE.test(s) || DASH_RE.test(s) || s === '-')
          ) {
            integral += (integral ? ' ' : '') + s;
            continue;
          }
          if (!isC && x > jLo && J_RE.test(s)) {
            jParts.push(s);
            continue;
          }
          if (x >= assignLo && x <= assignHi) {
            assignment += (assignment ? ' ' : '') + s;
            continue;
          }
          if (!isC && !multRaw && MULT_RE.test(s) && x >= multLo) {
            multRaw = s;
            continue;
          }
          // ∫/J/归属/裂分列之外、Comment 列起始之后的文字才是 Comment；
          // 放在各列判定之后，避免 ∫ 区间破折号被误吞。
          if (x >= comLo) {
            commentParts.push(s);
            continue;
          }
          lineName.push(it);
        }
        const t = joinTokens(lineName);
        if (t) nameParts.push(t);
      }

      // ---- 位移：单值 / 区间 ----
      const uniq = [...new Set(numbers)].sort((a, b) => a - b);
      if (!uniq.length) {
        report.badShift.push({ page: p, y: +f.y.toFixed(2), raw: rawOf(f) });
        continue;
      }
      let shift;
      let shiftRange;
      if (uniq.length >= 2) {
        const lo = uniq[0];
        const hi = uniq[uniq.length - 1];
        shift = Math.round(((lo + hi) / 2) * 1000) / 1000;
        shiftRange = [lo, hi];
      } else {
        shift = uniq[0];
      }

      const nameRaw = cleanName(nameParts.join(' '));
      const mult = splitMult(multRaw);
      rows.push({
        source: SOURCE,
        nucleus: sect.nucleus,
        compoundRaw: nameRaw,
        solventId: sect.solventId,
        shift,
        shiftRange,
        assignment,
        multiplicityRaw: mult.multiplicityRaw,
        multiplicity: mult.multiplicity,
        coupling: mult.coupling,
        integral,
        provenance: source.trim().startsWith('This') ? 'this-work' : 'literature',
        comment: commentParts.join(' ').replace(/\s+/g, ' ').trim(),
        sourceRaw: source,
        rawText: rawOf(f),
      });
      if (!nameRaw) report.emptyName.push({ page: p, y: +f.y.toFixed(2), raw: rawOf(f) });
      if (!assignment) report.emptyAssign.push({ page: p, y: +f.y.toFixed(2), raw: rawOf(f) });
    }
  }

  return rows;
}

/** 拆分裂分描述："tt, 7.6, 1.8" → { multiplicity:'tt', coupling:[7.6,1.8] } */
function splitMult(raw) {
  const s = (raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return { multiplicityRaw: '', multiplicity: '', coupling: [] };
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  const coupling = parts
    .slice(1)
    .flatMap((p) => p.match(/-?\d+(?:\.\d+)?/g) || [])
    .map(Number);
  return { multiplicityRaw: s, multiplicity: parts[0] || '', coupling };
}

function rawOf(ln) {
  return ln.items.map((i) => i.s).join(' | ');
}

// ─────────────────────────────── main ───────────────────────────────
const report = { badShift: [], emptyName: [], emptyAssign: [], orphan: [] };

const pdf = loadPdf(SLUG);
const allRows = [];
const sectionStats = [];
for (const sect of SECTIONS) {
  const before = allRows.length;
  const rows = parseSection(pdf, sect, report);
  allRows.push(...rows);
  sectionStats.push({ ...sect, signals: allRows.length - before });
}

// 「Solvent residual signal」是溶剂自身残余峰，不是分析物（其位移已由溶剂参考数据覆盖），
// 作为化合物收录会污染检索结果，故剔除。
const SKIP_NAME_RE = /^solvent residual signal$/i;
const omitted = allRows.filter((r) => SKIP_NAME_RE.test(r.compoundRaw));
const rows = allRows.filter((r) => !SKIP_NAME_RE.test(r.compoundRaw));

const out = {
  source: SOURCE,
  citation:
    'Cseri, L.; Kumar, S.; Palchuber, P.; Székely, G. NMR Chemical Shifts of Emerging Green Solvents, Acids, and Bases for Facile Trace Impurity Analysis. 2023.',
  doi: '10.1021/acssuschemeng.3c00244',
  usedPart: 'Supporting Information, Part 4（pp.15–201，8 溶剂 × ¹H/¹³C 位移排序表）',
  rows,
};

fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(path.join(CACHE, `normalized-${SOURCE}.json`), JSON.stringify(out, null, 1), 'utf8');

const byNuc = { '1H': 0, '13C': 0 };
for (const r of rows) byNuc[r.nucleus]++;
const compounds = new Map();
for (const r of rows) compounds.set(r.compoundRaw, (compounds.get(r.compoundRaw) ?? 0) + 1);

console.log(`[2023] 信号行: ${rows.length}  (¹H=${byNuc['1H']}, ¹³C=${byNuc['13C']})`);
console.log(`[2023] 剔除溶剂残余峰行: ${omitted.length}`);
console.log(`[2023] 范围内信号: ${rows.filter((r) => r.shiftRange).length}`);
console.log(`[2023] 化合物原始名 ${compounds.size} 个`);
console.log('[2023] 分节统计:');
for (const s of sectionStats) console.log(`   ${s.nucleus} in ${s.solventId}: ${s.signals} 条`);
console.log(
  `[2023] 异常: 无位移=${report.badShift.length} 空名称=${report.emptyName.length} 空归属=${report.emptyAssign.length} 孤立行=${report.orphan.length}`,
);
if (report.badShift.length) console.log('无位移样例:\n' + report.badShift.slice(0, 10).map((r) => `   p${r.page} ${r.raw}`).join('\n'));
if (report.emptyName.length) console.log('空名称样例:\n' + report.emptyName.slice(0, 10).map((r) => `   p${r.page} ${r.raw}`).join('\n'));
if (report.emptyAssign.length) console.log('空归属样例:\n' + report.emptyAssign.slice(0, 10).map((r) => `   p${r.page} ${r.raw}`).join('\n'));
if (report.orphan.length) console.log('孤立行样例:\n' + report.orphan.slice(0, 15).map((r) => `   p${r.page} ${r.raw}`).join('\n'));
console.log('[2023] 化合物清单（原始名 : 出现次数）:');
for (const [n, c] of [...compounds].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`   ${n} : ${c}`);
}