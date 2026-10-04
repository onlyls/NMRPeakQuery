/**
 * scripts/parse-1997.mjs
 *
 * Gottlieb, Kotlyar, Nudelman, J. Org. Chem. 1997, 62, 7512–7515.
 *   Table 1 (page 2) ¹H  — 化合物为主行，7 个溶剂列
 *   Table 2 (page 3) ¹³C — 同上
 *
 * 列顺序：CDCl3, (CD3)2CO, (CD3)2SO, C6D6, CD3CN, CD3OD, D2O
 *
 * 输出：scripts/.cache/normalized-gottlieb1997.json
 *   { source, rows: LongRow[] }
 * 其中 LongRow 为「一化合物 × 一溶剂 × 一核素 × 一信号」的长表行。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCompoundMajor } from './lib/pdf-table.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, '.cache');
const SLUG = '1997_JOCEAH_062_07512';
const SOURCE = 'gottlieb1997';

/** 1997 的溶剂列顺序 */
const SOLVENT_ORDER = [
  'cdcl3',
  'acetone_d6',
  'dmso_d6',
  'c6d6',
  'cd3cn',
  'cd3od',
  'd2o',
];

/** 归一到水 / 残余峰 / 溶剂自身碳信号 */
function classify(nameRaw) {
  const n = nameRaw.toLowerCase();
  if (n === 'h2o' || n === 'water') return 'water';
  if (n.startsWith('solvent residual')) return 'residual';
  if (n === 'solvent signals') return 'solventCarbon';
  return 'compound';
}

/** 页眉 / 页脚 / 下载水印等版面噪声（ACS 的下载戳是竖排文字，会落在表格区域左侧） */
const FURNITURE_RE =
  /Downloaded by|Publication Date|doi:|https?:|J\. Org\. Chem\.|^Notes$|^Table \d/i;
function isPageFurniture(name) {
  return FURNITURE_RE.test(name) || name.length > 60;
}

/** 拆分裂分描述："t, 7" → { multiplicity:'t', coupling:[7] } */
function splitMult(raw) {
  const s = (raw || '').trim();
  if (!s) return { multiplicityRaw: '', multiplicity: '', coupling: [] };
  const parts = s.split(/[,،]/).map((p) => p.trim()).filter(Boolean);
  const coupling = parts
    .slice(1)
    .flatMap((p) => p.match(/-?\d+(?:\.\d+)?/g) || [])
    .map(Number);
  return { multiplicityRaw: s, multiplicity: parts[0] || '', coupling };
}

const H = parseCompoundMajor({
  slug: SLUG,
  ranges: [{ page: 2, yMin: 105, yMax: 730 }],
  expectedCols: 7,
  nameMaxX: 158,
  assignMaxX: 210,
  multMaxX: 255,
});

const C = parseCompoundMajor({
  slug: SLUG,
  ranges: [{ page: 3, yMin: 105, yMax: 730 }],
  expectedCols: 7,
  nameMaxX: 140,
  assignMaxX: 185,
});

const rows = [];

function emit(table, nucleus) {
  if (table.columns.length !== SOLVENT_ORDER.length) {
    throw new Error(
      `[1997 ${nucleus}] 检测到 ${table.columns.length} 列，期望 ${SOLVENT_ORDER.length}`,
    );
  }
  for (const r of table.rows) {
    const kind = classify(r.compoundRaw);
    if (kind === 'compound' && isPageFurniture(r.compoundRaw)) continue;
    for (const ln of r.lines) {
      const { multiplicityRaw, multiplicity, coupling } = splitMult(ln.multRaw);
      table.columns.forEach((_, i) => {
        const cell = ln.values[i];
        if (!cell) return;
        rows.push({
          source: SOURCE,
          nucleus,
          compoundRaw: r.compoundRaw,
          solventId: SOLVENT_ORDER[i],
          kind,
          shift: cell.shift,
          extraShifts: cell.extra,
          assignment: ln.assignment,
          multiplicityRaw,
          multiplicity,
          coupling,
          footnotes: [...new Set([...r.footnotes, ...ln.footnotes])],
          rawText: ln.rawText,
        });
      });
    }
  }
}

emit(H, '1H');
emit(C, '13C');

const out = {
  source: SOURCE,
  citation:
    'Gottlieb, H. E.; Kotlyar, V.; Nudelman, A. J. Org. Chem. 1997, 62, 7512–7515.',
  doi: '10.1021/jo971176v',
  usedPart: 'Tables 1 (¹H) & 2 (¹³C)',
  columns: { '1H': H.columns, '13C': C.columns },
  rows,
};

fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(
  path.join(CACHE, `normalized-${SOURCE}.json`),
  JSON.stringify(out, null, 1),
  'utf8',
);

const compounds = new Set(rows.filter((r) => r.kind === 'compound').map((r) => r.compoundRaw));
console.log(`[1997] ¹H 列中心: ${H.columns.join(', ')}`);
console.log(`[1997] ¹³C 列中心: ${C.columns.join(', ')}`);
console.log(`[1997] 表行数: ¹H=${H.rows.length}  ¹³C=${C.rows.length}`);
console.log(`[1997] 信号行: ${rows.length}  化合物: ${compounds.size}`);
console.log(`[1997] 化合物清单:\n  ${[...compounds].join('\n  ')}`);
