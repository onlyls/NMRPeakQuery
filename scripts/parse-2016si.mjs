/**
 * scripts/parse-2016si.mjs
 *
 * Babij, N. R.; McCusker, E. O.; Whiteker, G. T.; Canturk, B.; Choy, N.;
 * Creemer, L. C.; Amicangelo, J. C.; Le, D.; 2016 —— Supporting Information。
 *
 * 为什么用 SI 而不是正文表格：正文（acs.oprd.5b00417.pdf）的表格是图片，无法复制文本；
 * SI 的 Table S1–S12 是同一套数据的可复制版本。
 *
 * 版面：Table S1–S12 = 6 个溶剂 × {¹H, ¹³C}，每页「位移为主行」(shift-major)：
 *   ¹H  页：2 组，每组 4 个子列  shift | solvent | proton | mult
 *   ¹³C 页：3 组，每组 3 个子列  shift | solvent | carbon
 *          （D2O ¹³C 例外，只有 2 组）
 * 子列左对齐且各页 x 略有差异，故子列边界由表头关键字（shift/solvent/proton/carbon/mult）
 * 的 x 取相邻中点推导，而不是硬编码。
 *
 * 位移可能是区间（"8.62-8.61"），此时间取中值并保留 shiftRange。
 *
 * 输出：scripts/.cache/normalized-babij2016.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPdf, toLogicalLines } from './lib/pdf-table.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, '.cache');
const SLUG = 'op5b00417_si_001';
const SOURCE = 'babij2016';

/** 页 → { 核, 溶剂 }，依据各页标题 "Table Sn. ¹H/¹³C NMR data ... in <溶剂>" */
const PAGES = [
  { page: 3, nucleus: '1H', solventId: 'cdcl3' },
  { page: 4, nucleus: '13C', solventId: 'cdcl3' },
  { page: 5, nucleus: '1H', solventId: 'acetone_d6' },
  { page: 6, nucleus: '13C', solventId: 'acetone_d6' },
  { page: 7, nucleus: '1H', solventId: 'dmso_d6' },
  { page: 8, nucleus: '13C', solventId: 'dmso_d6' },
  { page: 9, nucleus: '1H', solventId: 'cd3cn' },
  { page: 10, nucleus: '13C', solventId: 'cd3cn' },
  { page: 11, nucleus: '1H', solventId: 'cd3od' },
  { page: 12, nucleus: '13C', solventId: 'cd3od' },
  { page: 13, nucleus: '1H', solventId: 'd2o' },
  { page: 14, nucleus: '13C', solventId: 'd2o' },
];

const HEADER_KEY = /^(shift|solvent|olvent|S|proton|carbon|arbon|C|mult)$/;

/**
 * 由表头行推导子列：返回 roles（顺序 + 角色）与 boundaries（子列右边界）。
 * 表头里 solvent / carbon 偶尔被 PDF 拆成两个 token（"S"+"olvent"、"C"+"arbon"），
 * 拆出的碎片是同一子列，忽略后一个。
 */
function buildLayout(nucleus) {
  const roles = [];
  const push = (role, x) => {
    const last = roles[roles.length - 1];
    if (
      (role === 'solvent' && last?.role === 'solvent') ||
      (role === 'carbon' && last?.role === 'carbon')
    ) {
      return; // 拆分碎片的续接，忽略
    }
    roles.push({ role, x });
  };
  return { roles, push };
}

function roleOf(text, nucleus) {
  switch (text) {
    case 'shift':
      return 'shift';
    case 'solvent':
    case 'olvent':
    case 'S':
      return 'solvent';
    case 'proton':
      return 'proton';
    case 'carbon':
    case 'arbon':
    case 'C':
      return 'carbon';
    case 'mult':
      return 'mult';
    default:
      return null;
  }
}

/** 拆分裂分描述："tt, 7.6, 1.8" → { multiplicity:'tt', coupling:[7.6,1.8] } */
function splitMult(raw) {
  const s = (raw || '').trim();
  if (!s) return { multiplicityRaw: '', multiplicity: '', coupling: [] };
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  const coupling = parts
    .slice(1)
    .flatMap((p) => p.match(/-?\d+(?:\.\d+)?/g) || [])
    .map(Number);
  return { multiplicityRaw: s, multiplicity: parts[0] || '', coupling };
}

/** "8.62-8.61" → { shift: 8.615, shiftRange: [8.61, 8.62] }；"-4.33" → { shift: -4.33 } */
function parseShift(text) {
  const s = text.replace(/\s+/g, '');
  const m = s.match(/^(-?\d+(?:\.\d+)?)[-–](-?\d+(?:\.\d+)?)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return { shift: Math.round(((lo + hi) / 2) * 1000) / 1000, shiftRange: [lo, hi] };
  }
  const v = Number(s);
  return Number.isFinite(v) ? { shift: v } : null;
}

/** 同一子列内的 token 拼接：间距 ≤1.5pt 视为连写（"CH"+"3"→"CH3"），否则补空格（"br"+"s"→"br s"） */
function joinTokens(tokens) {
  let out = '';
  let prev = null;
  for (const t of tokens || []) {
    if (prev) {
      const gap = t.x - (prev.x + (prev.w || 0));
      out += gap > 1.5 ? ' ' : '';
    }
    out += t.s;
    prev = t;
  }
  return out.replace(/\s+/g, ' ').trim();
}

const rows = [];

function parsePage(entry) {
  const pdf = loadPdf(SLUG);
  const pg = pdf.pages[entry.page - 1];
  if (!pg) throw new Error(`[2016] 找不到第 ${entry.page} 页`);
  const nucleus = entry.nucleus;

  const lines = toLogicalLines(
    pg.lines.flatMap((ln) =>
      ln.items
        .filter((it) => it.s.trim())
        .map((it) => ({ s: it.s, x: it.x, y: ln.y, w: it.w || 0 })),
    ),
  );

  const header = lines.find((l) => l.items.some((i) => i.s === 'shift'));
  if (!header) throw new Error(`[2016] 第 ${entry.page} 页找不到表头`);

  // 子列角色 + 边界
  const { roles, push } = buildLayout(nucleus);
  for (const it of header.items) {
    if (!HEADER_KEY.test(it.s)) continue;
    const role = roleOf(it.s, nucleus);
    if (role) push(role, it.x);
  }
  const starts = roles.map((r) => r.x);
  const bounds = starts.map((s, i) =>
    i < starts.length - 1 ? (s + starts[i + 1]) / 2 : s + (s - starts[i - 1]) / 2,
  );
  const colOf = (x) => {
    for (let i = 0; i < bounds.length; i++) if (x < bounds[i]) return i;
    return bounds.length - 1;
  };

  // 每组 = 以 shift 子列起头的一段（组内子列角色固定：shift / solvent / main / [mult]）
  const groups = roles
    .map((r, i) => (r.role === 'shift' ? i : -1))
    .filter((i) => i >= 0)
    .map((start, gi, all) => {
      const end = gi + 1 < all.length ? all[gi + 1] : roles.length;
      const sub = roles.slice(start, end);
      return {
        start,
        end,
        solventOff: sub.findIndex((r) => r.role === 'solvent'),
        mainOff: sub.findIndex((r) => r.role === 'proton' || r.role === 'carbon'),
        multOff: sub.findIndex((r) => r.role === 'mult'),
      };
    });

  let lastEntries = null;

  for (const ln of lines) {
    if (ln.y >= header.y - 3) continue; // 标题 / 表头
    if (ln.y < 60) continue; // 页脚 "SI n"
    if (ln.items.some((i) => /^Table S/.test(i.s))) continue;

    // 按子列分桶
    const cells = roles.map(() => []);
    for (const it of ln.items) cells[colOf(it.x)].push(it);

    const hasShift = groups.some((g) => cells[g.start].length > 0);

    if (!hasShift) {
      // 续行（长归属换行，如 CD3CN ¹³C 的 "CH (2,3,5,6)"）：并入上一条目
      if (lastEntries) {
        lastEntries.forEach((e, gi) => {
          const g = groups[gi];
          for (let k = g.start; k < g.end; k++) {
            if (cells[k].length) e.cells[k - g.start].push(...cells[k]);
          }
        });
      }
      continue;
    }

    const entries = groups.map((g) => ({ cells: cells.slice(g.start, g.end) }));
    lastEntries = entries;

    entries.forEach((e, gi) => {
      const g = groups[gi];
      const shiftText = joinTokens(e.cells[0]);
      const parsed = shiftText ? parseShift(shiftText) : null;
      if (!parsed) return;

      const compoundRaw = g.solventOff >= 0 ? joinTokens(e.cells[g.solventOff]) : '';
      if (!compoundRaw) return;
      const assignment = g.mainOff >= 0 ? joinTokens(e.cells[g.mainOff]) : '';
      const multRaw = g.multOff >= 0 ? joinTokens(e.cells[g.multOff]) : '';

      const { multiplicityRaw, multiplicity, coupling } = splitMult(multRaw);
      rows.push({
        source: SOURCE,
        nucleus,
        compoundRaw,
        solventId: entry.solventId,
        shift: parsed.shift,
        shiftRange: parsed.shiftRange,
        assignment,
        multiplicityRaw,
        multiplicity,
        coupling,
        rawText: ln.items.map((i) => i.s).join(' | '),
      });
    });
  }
}

for (const p of PAGES) parsePage(p);

const out = {
  source: SOURCE,
  citation:
    'Babij, N. R.; McCusker, E. O.; Whiteker, G. T.; Canturk, B.; Choy, N.; Creemer, L. C.; Amicangelo, J. C.; Le, D.; Webster, R. A. Org. Process Res. Dev. 2016, 20, 661–667.',
  doi: '10.1021/acs.oprd.5b00417',
  usedPart: 'Supporting Information, Tables S1–S12（6 溶剂 × ¹H/¹³C）',
  rows,
};

fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(
  path.join(CACHE, `normalized-${SOURCE}.json`),
  JSON.stringify(out, null, 1),
  'utf8',
);

const byNuc = { '1H': 0, '13C': 0 };
for (const r of rows) byNuc[r.nucleus]++;
const compounds = new Set(rows.map((r) => r.compoundRaw));
console.log(`[2016] 信号行: ${rows.length}  (¹H=${byNuc['1H']}, ¹³C=${byNuc['13C']})`);
console.log(`[2016] 化合物: ${compounds.size}`);
console.log(`[2016] 化合物清单:\n  ${[...compounds].sort().join('\n  ')}`);
