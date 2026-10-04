/* ============================================================================
 * chemText.ts — 化学文本的上下标渲染
 *
 * 统一使用 Unicode 下标 / 上标字符（而非 <sub>/<sup> 标签），原因：
 *   1. 数据集里的分子式、溶剂标签、归属都是纯字符串，且会出现在原生 <select>
 *      的 <option> 中——HTML 标签在 <option> 里不生效，只有 Unicode 能覆盖；
 *   2. 同一份字符串可直接喂给检索/AI，无需区分渲染路径。
 *
 * 三种场景各用一套保守规则，避免把位次数字（H1、C2、CH(2,6)）误转成下标：
 *   formatFormula  —— 分子式 / 溶剂标签：字母或 ')' 之后的数字串转下标
 *                     （CDCl3→CDCl₃、(CD3)2CO→(CD₃)₂CO、Pyridine-d5→Pyridine-d₅）；
 *   formatAssignment —— 谱峰归属：仅「元素计数」转下标（CH3→CH₃、CCl4→CCl₄、
 *                     (CH3)2→(CH₃)₂），位次标注（H1/C2/H1a/(2,6)）保持原样；
 *   formatNucleus  —— 核素：'1H'→'¹H'、'13C'→'¹³C'（已是上标写法时原样返回）。
 * ========================================================================== */

const SUB_DIGITS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
};

const SUP_DIGITS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

function mapDigits(run: string, table: Record<string, string>): string {
  return [...run].map((c) => table[c] ?? c).join('');
}

/**
 * 分子式 / 溶剂标签的下标化。
 * 规则：紧跟在字母或右括号之后的数字串视为原子计数 / 氘代个数，转下标。
 * 名称前缀的位次数字（如 1,4-Dioxane 的 1、4）前接非字母，保持不变。
 */
export function formatFormula(text: string | undefined | null): string {
  if (!text) return '';
  return text.replace(/([A-Za-z)])(\d+)/g, (_, prev: string, run: string) =>
    prev + mapDigits(run, SUB_DIGITS),
  );
}

/**
 * 谱峰归属的下标化（保守）。
 * 仅当数字串前两个字符构成元素符号（两个字母，如 C-H、C-O、C-Cl、C-S）
 * 或紧跟右括号时才转下标；句首的位次标注（H1、C2、H1a）与括号内位次
 * （CH(2,6)、(1,3)）一律保持原样。
 */
export function formatAssignment(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/([A-Za-z][A-Za-z)])(\d+)/g, (_, prev: string, run: string) =>
      prev + mapDigits(run, SUB_DIGITS),
    )
    .replace(/\)(\d+)/g, (_, run: string) => ')' + mapDigits(run, SUB_DIGITS));
}

/**
 * 核素上标化：'1H' → '¹H'、'13C' → '¹³C'。
 * 已是 Unicode 上标写法（如 '¹H'）或非「数字+元素」形式时原样返回。
 */
export function formatNucleus(nucleus: string | undefined | null): string {
  if (!nucleus) return '';
  return nucleus.replace(/^(\d+)([A-Za-z]+)$/, (_, run: string, el: string) =>
    mapDigits(run, SUP_DIGITS) + el,
  );
}