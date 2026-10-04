/**
 * scripts/parse-2010si.mjs
 *
 * Fulmer, Miller, Sherden, Gottlieb, Nudelman, Stoltz, Bercaw, Goldberg,
 * Organometallics 2010, 29, 2176–2179 —— 以其 Supporting Information 为准。
 *
 * 为什么用 SI 而不是正文表格：SI 的 Table S1/S2 是正文表格的「修订版」，
 * 补齐了正文缺失的化合物，并修正了若干原始错误（见 SI 的
 * "Corrections and Comments"）。正文 OM_2010_2176.pdf 的表格因此弃用。
 *
 *   Table S1 (pages 3–4) ¹H  — 化合物为主行，12 个溶剂列
 *   Table S2 (pages 5–6) ¹³C — 同上
 *
 * 列顺序：THF-d8, CD2Cl2, CDCl3, toluene-d8, C6D6, C6D5Cl,
 *         (CD3)2CO, (CD3)2SO, CD3CN, TFE-d3, CD3OD, D2O
 *
 * 输出：scripts/.cache/normalized-fulmer2010.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCompoundMajor } from './lib/pdf-table.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, '.cache');
const SLUG = 'om100106e_si_001';
const SOURCE = 'fulmer2010';

const SOLVENT_ORDER = [
  'thf_d8',
  'dcm_d2',
  'cdcl3',
  'toluene_d8',
  'c6d6',
  'chlorobenzene_d5',
  'acetone_d6',
  'dmso_d6',
  'cd3cn',
  'tfe_d3',
  'cd3od',
  'd2o',
];

function classify(nameRaw) {
  const n = nameRaw.toLowerCase();
  if (n === 'water') return 'water';
  if (n.startsWith('solvent residual')) return 'residual';
  if (n === 'solvent signals') return 'solventCarbon';
  return 'compound';
}

/** 页眉 / 页脚 / 下载水印等版面噪声 */
const FURNITURE_RE = /Downloaded from|Supporting Information|^S\d+$|^Table S\d/i;
function isPageFurniture(name) {
  return FURNITURE_RE.test(name) || name.length > 60;
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

const H = parseCompoundMajor({
  slug: SLUG,
  ranges: [
    { page: 3, yMin: 50, yMax: 758 },
    { page: 4, yMin: 50, yMax: 780 },
  ],
  expectedCols: 12,
  nameMaxX: 95,
  assignMaxX: 133,
  multMaxX: 175,
});

const C = parseCompoundMajor({
  slug: SLUG,
  ranges: [
    { page: 5, yMin: 50, yMax: 758 },
    { page: 6, yMin: 50, yMax: 780 },
  ],
  expectedCols: 12,
  nameMaxX: 95,
  assignMaxX: 133,
});

const rows = [];

function emit(table, nucleus) {
  if (table.columns.length !== SOLVENT_ORDER.length) {
    throw new Error(
      `[2010 ${nucleus}] 检测到 ${table.columns.length} 列，期望 ${SOLVENT_ORDER.length}`,
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
    'Fulmer, G. R.; Miller, A. J. M.; Sherden, N. H.; Gottlieb, H. E.; Nudelman, A.; Stoltz, B. M.; Bercaw, J. E.; Goldberg, K. I. Organometallics 2010, 29, 2176–2179.',
  doi: '10.1021/om100106e',
  usedPart: 'Supporting Information, Table S1 (¹H) & S2 (¹³C)',
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
console.log(`[2010] ¹H 列中心: ${H.columns.join(', ')}`);
console.log(`[2010] ¹³C 列中心: ${C.columns.join(', ')}`);
console.log(`[2010] 表行数: ¹H=${H.rows.length}  ¹³C=${C.rows.length}`);
console.log(`[2010] 信号行: ${rows.length}  化合物: ${compounds.size}`);
console.log(`[2010] 化合物清单:\n  ${[...compounds].join('\n  ')}`);
