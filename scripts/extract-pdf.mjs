/**
 * scripts/extract-pdf.mjs
 *
 * 从 SupportingDatas/*.pdf 抽取「带坐标」的文本层，供各来源解析器重建表格列。
 *
 * 之所以不用简单 join(' ')：1997 / 2010 的表格存在大量空单元格，
 * 单纯线性化会错位，必须依赖每个文本片段的 x 坐标还原列边界。
 *
 * 输出：
 *   scripts/.cache/<slug>.lines.json  结构化（按 y 分行，保留 x/宽度）
 *   scripts/.cache/<slug>.txt         纯文本（便于人工比对）
 *
 * 用法：node scripts/extract-pdf.mjs [pdf 路径...]
 *       不带参数时抽取 SupportingDatas 下全部 PDF。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'SupportingDatas');
const CACHE_DIR = path.join(__dirname, '.cache');

/** 同一行判定阈值（pt） */
const LINE_TOL = 2.5;

function slugify(name) {
  return path
    .basename(name, '.pdf')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_');
}

async function extractOne(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false })
    .promise;

  const pages = [];
  const textChunks = [`FILE: ${pdfPath}`, `PAGES: ${doc.numPages}`, ''];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();

    const items = [];
    for (const it of tc.items) {
      if (typeof it.str !== 'string' || it.str.length === 0) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      items.push({ s: it.str, x: round(x), y: round(y), w: round(it.width) });
    }

    // 按 y 分行（y 从大到小 = 从上到下）
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    let cur = null;
    for (const it of sorted) {
      if (!cur || Math.abs(cur.y - it.y) > LINE_TOL) {
        cur = { y: it.y, items: [] };
        lines.push(cur);
      }
      cur.items.push(it);
    }
    for (const ln of lines) ln.items.sort((a, b) => a.x - b.x);

    pages.push({
      page: p,
      width: round(viewport.width),
      height: round(viewport.height),
      lines,
    });

    textChunks.push(`===== PAGE ${p} =====`);
    for (const ln of lines) {
      textChunks.push(
        `y=${String(ln.y).padStart(7)} | ` + ln.items.map((i) => `${i.s}@${i.x}`).join(' | '),
      );
    }
    textChunks.push('');
  }

  const slug = slugify(pdfPath);
  fs.writeFileSync(
    path.join(CACHE_DIR, `${slug}.lines.json`),
    JSON.stringify({ file: pdfPath, pages }, null, 1),
    'utf8',
  );
  fs.writeFileSync(path.join(CACHE_DIR, `${slug}.txt`), textChunks.join('\n'), 'utf8');

  console.log(`  ✓ ${slug}  (${doc.numPages} pages)`);
  return slug;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  let targets = process.argv.slice(2);
  if (targets.length === 0) {
    targets = fs
      .readdirSync(SRC_DIR)
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
      .map((f) => path.join(SRC_DIR, f));
  }

  console.log(`Extracting ${targets.length} PDF(s) → ${CACHE_DIR}`);
  for (const t of targets) {
    if (!fs.existsSync(t)) {
      console.warn(`  ! skip (not found): ${t}`);
      continue;
    }
    await extractOne(t);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
