/**
 * scripts/lib/pdf-table.mjs
 *
 * 从 extract-pdf.mjs 产出的「带坐标文本层」中还原文献表格。
 *
 * 三个由实测得出的关键结论（见 scripts/.cache 下的 .txt 坐标转储）：
 *   1. 数值单元格为「居中」排版，同一列数值的 (x + width) 会因位数不同分成 1–2 个
 *      相距 ≤2pt 的子簇；列与列相距 35–58pt。故按右缘就近归列非常稳。
 *   2. 下标 / 上标脚注的基线比正文低 / 高约 3.5–3.7pt（"H₂O" 的 2、脚注上标 "3"），
 *      必须先按 y 合并成逻辑行，再按基线高低把上标拆成 footnotes。
 *   3. 不同页的 y 坐标会互相重叠，必须逐页处理，否则会串页。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '.cache');

/** 形如 12.34 / -0.06 的数值（要求带小数点，以排除脚注编号 "3"、归属下标 "2"） */
const NUM_RE = /^-?\d+\.\d+$/;
export const isNumeric = (s) => NUM_RE.test(s);

export function loadPdf(slug) {
  return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `${slug}.lines.json`), 'utf8'));
}

/** 过滤出指定页 + y 区间的所有 token */
export function sliceTokens(pdf, ranges) {
  const out = [];
  for (const r of ranges) {
    const pg = pdf.pages[r.page - 1];
    if (!pg) continue;
    for (const ln of pg.lines) {
      if (ln.y < r.yMin || ln.y > r.yMax) continue;
      for (const it of ln.items) {
        if (!it.s.trim()) continue; // 丢弃纯空白 token
        out.push({ s: it.s, x: it.x, y: ln.y, w: it.w || 0, page: r.page });
      }
    }
  }
  return out;
}

/** 把 token 重新按 y 合并为逻辑行（tol 需 > 下标偏移 3.7pt，< 行距 8.9pt） */
export function toLogicalLines(tokens, tol = 5.5) {
  const sorted = [...tokens].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const t of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - t.y) <= tol) last.items.push(t);
    else lines.push({ y: t.y, items: [t] });
  }
  for (const ln of lines) ln.items.sort((a, b) => a.x - b.x);
  return lines;
}

/** 逻辑行内出现次数最多的 y —— 即该行的正文基线 */
function dominantY(items) {
  const count = new Map();
  for (const it of items) {
    const k = Math.round(it.y);
    count.set(k, (count.get(k) || 0) + 1);
  }
  let best = items[0]?.y ?? 0;
  let bestN = -1;
  for (const [k, n] of count) {
    if (n > bestN || (n === bestN && k > best)) {
      bestN = n;
      best = k;
    }
  }
  return best;
}

/**
 * 读取某个 x 区间内的文本。
 * 基线明显高于正文的「单个数字」token 是脚注上标（如 "q, 7 ⁶"、"OH s ³"），
 * 单独剥离，不混进裂分/归属字段。
 *
 * 另需剔除「右缘落在数值列中心上」的 token：
 * 数值单元格为居中排版，长数值（如 ¹³C 的 "151.55"，宽 24.4pt）左缘会伸进
 * 归属列区间（1997 ¹³C 表：归属列 140–185，而 151.55 左缘仅 184.96），
 * 若不过滤，归属会变成 "C(1)151.55"。按右缘是否落在列中心（±5pt）判定，
 * 比按 x 上界判定可靠，且不会误伤裂分列里的偶合常数（它们位于列中心之间）。
 */
function readField(items, xMin, xMax, baseY, centers = []) {
  const band = items.filter((i) => i.x >= xMin && i.x < xMax && i.s.trim());
  const footnotes = [];
  const kept = [];
  for (const it of band) {
    if (centers.length && columnOf(centers, it, 5) >= 0) continue; // 属于数值列
    if (/^\d$/.test(it.s) && it.y > baseY + 2) footnotes.push(it.s);
    else kept.push(it);
  }
  return {
    text: kept
      .map((i) => i.s)
      .join('')
      .replace(/\s+/g, ' ')
      .trim(),
    footnotes,
  };
}

/**
 * 由数值 token 的右缘聚类出列中心。
 * @param {{x:number,w:number,s:string}[]} items
 * @param {number} expected 期望列数（1997=7，2010 SI=12）
 */
export function detectColumnCenters(items, expected, gap = 8) {
  const rights = items
    .filter((i) => isNumeric(i.s))
    .map((i) => i.x + i.w)
    .sort((a, b) => a - b);

  if (rights.length === 0) return [];

  const groups = [[rights[0]]];
  for (let i = 1; i < rights.length; i++) {
    const g = groups[groups.length - 1];
    if (rights[i] - g[g.length - 1] <= gap) g.push(rights[i]);
    else groups.push([rights[i]]);
  }

  const avg = (g) => g.reduce((a, b) => a + b, 0) / g.length;

  // 只保留「样本数最多」的 expected 个簇。
  // 溶剂自身信号行里用于表示位移波动范围的括号值（如 77.16 (0.06) 中的 0.06）
  // 会形成样本数很少的伪簇，按计数排序即可自然剔除。
  let picked = groups.map((g) => ({ center: avg(g), count: g.length }));
  if (picked.length > expected) {
    picked = [...picked].sort((a, b) => b.count - a.count).slice(0, expected);
  }

  const centers = picked.map((p) => p.center).sort((a, b) => a - b);
  return centers.map((c) => Math.round(c * 100) / 100);
}

/** 数值 token 归列：按右缘就近，超出 30pt 视为噪声 */
function columnOf(centers, item, tol = 30) {
  const r = item.x + item.w;
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const d = Math.abs(r - centers[i]);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return bd <= tol ? best : -1;
}

/**
 * 解析「化合物为主行」的表格（1997 Table 1/2、2010 SI Table S1/S2）。
 *
 * @param {object} cfg
 * @param {string} cfg.slug           缓存文件名（不含扩展名）
 * @param {{page:number,yMin:number,yMax:number}[]} cfg.ranges 按页顺序给出
 * @param {number} cfg.expectedCols   期望的溶剂列数
 * @param {number} cfg.nameMaxX       化合物名称列的 x 上界
 * @param {number} cfg.assignMaxX     归属列的 x 上界
 * @param {number} [cfg.multMaxX]     裂分列的 x 上界（¹³C 表无此列）
 * @returns {{columns:number[], rows:object[]}}
 */
export function parseCompoundMajor(cfg) {
  const pdf = loadPdf(cfg.slug);

  const rows = [];
  let cur = null;
  let centers = [];

  for (const range of cfg.ranges) {
    const tokens = sliceTokens(pdf, [range]);
    if (tokens.length === 0) continue;
    if (centers.length === 0) centers = detectColumnCenters(tokens, cfg.expectedCols);
    const lines = toLogicalLines(tokens);

    for (const ln of lines) {
      const baseY = dominantY(ln.items);

      // 化合物名称列：脚注上标（"H grease⁸"、"pyrrolidine¹⁰"）是独立 token，
      // 其 y 与名称正文字形不同（上标高 ~3.6pt）。不能用整行的 dominantY 判断：
      // ¹³C 表中同一化合物的多列数值可能被 PDF 拆到相邻 y（相差 ~2.8pt）再被
      // 合并成一条逻辑行，导致 dominantY 落在数值而非名称上。故以「名称列内
      // 含字母且最长的 token」的 y 作名称基线。
      const nameBand = ln.items.filter((it) => it.x < cfg.nameMaxX && it.s.trim());
      const lettered = nameBand.filter((it) => /[A-Za-z]/.test(it.s));
      const nameBaseY = lettered.length
        ? lettered.reduce((a, b) =>
            b.s.replace(/[^A-Za-z]/g, '').length > a.s.replace(/[^A-Za-z]/g, '').length ? b : a,
          ).y
        : baseY;

      const rowFootnotes = [];
      const nameItems = [];
      for (const it of nameBand) {
        // 只剥「上标」（y 高于名称基线）；下标（H₂O 的 2、CH₃ 的 3）低于基线，须保留
        if (/^\d+$/.test(it.s) && it.y - nameBaseY > 2) {
          rowFootnotes.push(it.s);
          continue;
        }
        nameItems.push(it);
      }
      if (nameItems.length > 1 && /^[a-z]$/.test(nameItems[nameItems.length - 1].s)) {
        rowFootnotes.push(nameItems.pop().s);
      }
      const name = nameItems
        .map((i) => i.s)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      const isNew = name.length > 0 && !/^\d+$/.test(name);

      if (isNew) {
        cur = { compoundRaw: name, footnotes: [...rowFootnotes], lines: [] };
        rows.push(cur);
      } else if (cur) {
        cur.footnotes.push(...rowFootnotes);
      }
      if (!cur) continue;

      // 归属 / 裂分（每条逻辑行 = 一个独立信号，不能跨行累加）
      const a = readField(ln.items, cfg.nameMaxX, cfg.assignMaxX, baseY, centers);
      const m =
        cfg.multMaxX != null
          ? readField(ln.items, cfg.assignMaxX, cfg.multMaxX, baseY, centers)
          : { text: '', footnotes: [] };

      // 数值归列
      const values = centers.map(() => null);
      for (const it of ln.items) {
        if (!isNumeric(it.s)) continue;
        const ci = columnOf(centers, it);
        if (ci < 0) continue;
        const v = Number(it.s);
        if (!values[ci]) values[ci] = { shift: v, extra: [] };
        else values[ci].extra.push(v);
      }

      cur.lines.push({
        assignment: a.text,
        multRaw: m.text,
        footnotes: [...rowFootnotes, ...a.footnotes, ...m.footnotes],
        values,
        rawText: ln.items.map((i) => i.s).join(' | '),
      });
    }
  }

  return { columns: centers, rows };
}
