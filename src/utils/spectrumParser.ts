/* ============================================================================
 * spectrumParser.ts — 谱图数据文件本地解析
 *
 * 支持：
 *   - CSV / TXT：两列 (ppm, intensity)；或单列峰位列表（每行 / 单行多值）
 *   - JCAMP-DX：##PEAK TABLE (XY..XY) 直接读取；
 *               ##XYDATA (X++(Y..Y) / (X++(X,Y)) 解析数值 + '@' 重复压缩
 *
 * 局限：不解析 SQZ/完整 ASDF 幂次压缩，也不解析 Bruker/Varian 原始目录。
 * 遇到无法解析的数据会给出 warnings，提示改用 PEAK TABLE / CSV 导出。
 * ========================================================================== */

export interface SpectrumPeak {
  shift: number;
  intensity: number;
}

export interface ParsedSpectrum {
  format: string;
  peaks: SpectrumPeak[];
  warnings: string[];
}

export interface PickOptions {
  /** 相对最大强度的下限 */
  minHeightRatio?: number;
  /** 最多保留的峰数（按强度取前 N） */
  maxPeaks?: number;
}

const NUM_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
/** 含 '@' 重复标记的 token */
const TOKEN_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|@\d*/g;

function roundShift(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

/** 数组中的局部极大值，按强度取前 N 后按位移降序返回（NMR 惯例） */
export function pickPeaks(
  points: SpectrumPeak[],
  { minHeightRatio = 0.05, maxPeaks = 200 }: PickOptions = {},
): SpectrumPeak[] {
  if (!points.length) return [];
  const maxI = Math.max(...points.map((p) => p.intensity), 0);
  if (maxI <= 0) return [];
  const threshold = maxI * minHeightRatio;

  const local: SpectrumPeak[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    if (cur.intensity < threshold) continue;
    const prev = points[i - 1];
    const next = points[i + 1];
    if ((!prev || cur.intensity >= prev.intensity) && (!next || cur.intensity >= next.intensity)) {
      local.push(cur);
    }
  }
  local.sort((a, b) => b.intensity - a.intensity);
  const top = local.slice(0, maxPeaks);
  top.sort((a, b) => b.shift - a.shift);
  const norm = Math.max(...top.map((p) => p.intensity), 1);
  return top.map((p) => ({ shift: roundShift(p.shift), intensity: p.intensity / norm }));
}

export function peakShifts(peaks: SpectrumPeak[]): number[] {
  return peaks.map((p) => p.shift);
}

/* ------------------------------ CSV / TXT ------------------------------- */

export function parseDelimitedText(text: string): ParsedSpectrum {
  const warnings: string[] = [];
  const rows: number[][] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';') || trimmed.startsWith('//')) continue;
    const nums = trimmed.match(NUM_RE)?.map(Number) ?? [];
    if (nums.length) rows.push(nums);
  }

  if (!rows.length) {
    return { format: 'CSV/TXT', peaks: [], warnings: ['未从文件中解析出任何数值'] };
  }

  const twoColumn = rows.every((r) => r.length === 2);
  let peaks: SpectrumPeak[];
  if (twoColumn) {
    peaks = rows.map(([shift, intensity]) => ({ shift, intensity }));
    if (peaks.length > 200) {
      peaks = pickPeaks(peaks, { maxPeaks: 200 });
      warnings.push('检测为全谱数据，已自动拾取局部极大值峰（最多 200 个）。');
    }
  } else {
    peaks = rows.flat().map((shift) => ({ shift, intensity: 1 }));
    warnings.push('按峰位列表解析（未含强度列）。');
  }

  peaks.sort((a, b) => b.shift - a.shift);
  return { format: twoColumn ? 'CSV/TXT（ppm, intensity）' : 'CSV/TXT（峰位列表）', peaks, warnings };
}

/* ------------------------------- JCAMP-DX ------------------------------- */

/** 收集 ##KEY= value 及后续的行，形成数据块 */
function collectBlocks(text: string): Record<string, string> {
  const blocks: Record<string, string> = {};
  let key: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (key) blocks[key] = buf.join('\n');
  };

  for (const line of text.split(/\r?\n/)) {
    const m = /^##\s*([^=]+?)\s*=\s?(.*)$/.exec(line);
    if (m) {
      flush();
      key = m[1].trim().toUpperCase();
      buf = [m[2]];
    } else if (key !== null) {
      buf.push(line);
    }
  }
  flush();
  return blocks;
}

/** 解析 '@n' 重复压缩：重复前一个数值 n 次（无数字则 1 次） */
function expandTokens(tokens: string[]): number[] {
  const out: number[] = [];
  for (const t of tokens) {
    if (t.startsWith('@')) {
      const n = t.length > 1 ? Number.parseInt(t.slice(1), 10) : 1;
      const last = out[out.length - 1];
      if (last !== undefined) for (let i = 0; i < n; i++) out.push(last);
      continue;
    }
    const v = Number(t);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

function parsePeakTable(labelAndData: string, warnings: string[]): SpectrumPeak[] {
  const body = labelAndData.replace(/\([^)]*\)/, ' ');
  const nums = body.match(NUM_RE)?.map(Number) ?? [];
  if (nums.length < 4) {
    warnings.push('##PEAK TABLE 数据不足，无法成对解析。');
    return [];
  }
  const peaks: SpectrumPeak[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    peaks.push({ shift: nums[i], intensity: nums[i + 1] });
  }
  return peaks.sort((a, b) => b.shift - a.shift);
}

function parseXYData(labelAndData: string, blocks: Record<string, string>, warnings: string[]): SpectrumPeak[] {
  const nl = labelAndData.indexOf('\n');
  const label = nl >= 0 ? labelAndData.slice(0, nl) : labelAndData;
  const body = nl >= 0 ? labelAndData.slice(nl + 1) : '';

  const tokens = body.match(TOKEN_RE) ?? [];
  const values = expandTokens(tokens);
  if (values.length < 2) {
    warnings.push('##XYDATA 未解析出足够的数据点。');
    return [];
  }

  const num = (k: string) => {
    const m = NUM_RE.exec(blocks[k] ?? '');
    NUM_RE.lastIndex = 0;
    return m ? Number(m[0]) : NaN;
  };

  // 成对：(X++(X,Y)) 或 (XY..XY)
  if (/X\s*,|XY/i.test(label)) {
    const peaks: SpectrumPeak[] = [];
    for (let i = 0; i + 1 < values.length; i += 2) {
      peaks.push({ shift: values[i], intensity: values[i + 1] });
    }
    return pickPeaks(peaks);
  }

  // (X++(Y..Y))：首个值为首个 X，其余为 Y
  const firstX = Number.isFinite(num('FIRSTX')) ? num('FIRSTX') : values[0];
  const y = values.slice(1);
  if (!y.length) {
    warnings.push('##XYDATA 缺少 Y 数据。');
    return [];
  }
  const lastX = num('LASTX');
  const npoints = Number.isFinite(num('NPOINTS')) ? num('NPOINTS') : y.length;
  let deltaX = num('DELTAX');
  if (!Number.isFinite(deltaX) && Number.isFinite(lastX) && npoints > 1) {
    deltaX = (firstX - lastX) / (npoints - 1);
  }
  if (!Number.isFinite(deltaX)) deltaX = -1;

  const points: SpectrumPeak[] = y.map((intensity, i) => ({
    shift: firstX + i * deltaX,
    intensity,
  }));
  const picked = pickPeaks(points);
  if (!picked.length) warnings.push('未从 ##XYDATA 中拾取到峰，可能为 SQZ/ASDF 压缩格式，建议改用 PEAK TABLE 导出。');
  return picked;
}

export function parseJCAMP(text: string): ParsedSpectrum {
  const warnings: string[] = [];
  const blocks = collectBlocks(text);

  const peakTable = blocks['PEAK TABLE'] ?? blocks['PEAKTABLE'];
  if (peakTable) {
    return { format: 'JCAMP-DX（PEAK TABLE）', peaks: parsePeakTable(peakTable, warnings), warnings };
  }

  const xyData = blocks['XYDATA'];
  if (xyData) {
    return { format: 'JCAMP-DX（XYDATA）', peaks: parseXYData(xyData, blocks, warnings), warnings };
  }

  return { format: 'JCAMP-DX', peaks: [], warnings: ['未找到 ##PEAK TABLE 或 ##XYDATA 数据块。'] };
}

export function isJcamp(text: string, filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    /\.(jdx|dx|jcamp)$/.test(lower) ||
    text.includes('##JCAMP-DX') ||
    /^##TITLE/m.test(text)
  );
}

/** 统一入口：按扩展名 / 内容特征选择解析器 */
export async function parseSpectrumFile(file: File): Promise<ParsedSpectrum> {
  const text = await file.text();
  const parsed = isJcamp(text, file.name) ? parseJCAMP(text) : parseDelimitedText(text);
  if (!parsed.peaks.length) {
    parsed.warnings.push('未能解析出峰位，请确认文件为 CSV/TXT 两列数据、峰位列表或 JCAMP-DX。');
  }
  return parsed;
}