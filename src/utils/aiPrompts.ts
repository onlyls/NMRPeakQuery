/* ============================================================================
 * aiPrompts.ts — 三类任务的 prompt 与输入校验
 *
 * 浏览器端（BYOK 直连服务商）与 Cloudflare Pages Functions（云端代理）
 * 共用同一份 prompt / 校验逻辑，避免两处实现漂移。
 * 本文件必须保持纯 TS（不依赖 DOM / Node API），以便在 Worker 中执行。
 * ========================================================================== */
import type { AiTask } from '../types/ai';

export const DEFAULT_MAX_TOKENS = 2048;
export const MAX_PROCEDURE_CHARS = 20000;
/** 用户附加自定义指令的长度上限（浏览器直连与云端代理共用） */
export const MAX_PROMPT_EXTRA_CHARS = 2000;
/** 直接/代理调用上游的超时时间 */
export const AI_TIMEOUT_MS = 60000;

/** 在内置默认系统 Prompt 之后追加用户自定义指令（不改动默认规则与 JSON 契约） */
function withExtra(system: string, extra?: string): string {
  const e = (extra ?? '').trim().slice(0, MAX_PROMPT_EXTRA_CHARS);
  return e
    ? `${system}\n\nAdditional user requirements (must still obey the JSON schema above):\n${e}`
    : system;
}

export interface ChatContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string | ChatContentPart[];
}

const NUCLEUS = new Set(['1H', '13C']);

/* ----------------------------- prompt 构建 ------------------------------ */

export function buildPrompts(
  task: AiTask,
  input: Record<string, any>,
  extra = '',
): { system: string; user: string } {
  if (task === 'verify') {
    const system = [
      'You are an NMR spectroscopy expert. Given a compound (name / CAS / formula / SMILES),',
      'a deuterated solvent and a nucleus, report the LITERATURE reference chemical shifts of',
      'that compound in that solvent for the requested nucleus, based on standard literature',
      '(Gottlieb 1997, Fulmer 2010, Babij 2016) and general NMR knowledge.',
      '',
      'Rules:',
      '- One entry per distinct signal; shift is the center value in ppm.',
      "- multiplicity such as 's', 'd', 't', 'q', 'quint', 'sept', 'm', 'br s'.",
      '- coupling: array of J values in Hz when known; use [] if unknown.',
      '- assignment: the structural fragment, e.g. "CH3" / "CH(2,6)" / "OCH3" / "C=O".',
      '- Do not invent data; omit a signal if you are unsure.',
      '- Textual fields (note, summary, caveats) must be in Simplified Chinese.',
      '',
      'Output STRICT JSON only, no code fence, no extra text:',
      '{"signals":[{"shift":0,"multiplicity":"","coupling":[],"assignment":"","note":""}],"summary":"","caveats":[""]}',
    ].join('\n');
    const user = [
      `化合物名称 (compound): ${input.compoundName ?? ''}`,
      `中文名 (chineseName): ${input.chineseName ?? '（未填）'}`,
      `CAS: ${input.cas ?? '（未填）'}`,
      `分子式 (formula): ${input.formula ?? '（未填）'}`,
      `SMILES: ${input.smiles ?? '（未填）'}`,
      `氘代溶剂 (solvent): ${input.solventLabel ?? ''}`,
      `观测核素 (nucleus): ${input.nucleus ?? ''}`,
    ].join('\n');
    return { system: withExtra(system, extra), user };
  }

  if (task === 'method') {
    const system = [
      'You are an expert synthetic organic chemist. From the given experimental procedure,',
      'identify the deuterated solvent(s) used for the NMR measurement, and predict which',
      'solvents from the procedure may remain as residual solvent peaks in the sample.',
      '',
      'Rules:',
      '- deuteratedSolvents: names as written (e.g. CDCl3, DMSO-d6, D2O). If not explicitly',
      '  stated, infer from context and explain in summary.',
      '- expectedResidualSolvents: solvents likely to remain (e.g. EtOAc, hexanes, DMF,',
      '  toluene, triethylamine); reason must reference the procedure step.',
      '- Textual fields in Simplified Chinese.',
      '',
      'Output STRICT JSON only, no code fence, no extra text:',
      '{"deuteratedSolvents":[""],"expectedResidualSolvents":[{"name":"","cas":"","reason":""}],"summary":"","caveats":[""]}',
    ].join('\n');
    const user = `实验方法 (experimental procedure):\n${input.procedure ?? ''}`;
    return { system: withExtra(system, extra), user };
  }

  // spectrum
  const system = [
    'You are an expert NMR spectroscopist. You are given a candidate compound (SMILES) and',
    'an NMR spectrum (an image and/or a list of observed peaks, with nucleus and deuterated',
    'solvent context). Determine whether the spectrum is consistent with the proposed',
    'structure, and assign each observed peak to a structural fragment / functional group.',
    '',
    'Rules:',
    '- First interpret the SMILES: list fragments and their expected shifts for the nucleus.',
    '- Assign each observed peak; assignment describes the fragment (e.g. "CH3 (酯基)",',
    '  "CH(2,6) 芳环").',
    '- expectedShift = your theoretical shift for that fragment; deviation = observed - expectedShift (3 decimals).',
    "- solventPeaks: peaks attributable to residual solvent / water / 13C solvent peak; give kind.",
    '- unassignedPeaks: observed peaks not explained by the structure or solvent.',
    "- verdict.level: 'consistent' if assignments cover the main peaks with small deviations;",
    "  'partial' if some peaks unexplained or moderate deviations; 'inconsistent' if the",
    '  pattern contradicts the structure. confidence: high | medium | low.',
    '- Be honest about uncertainty; never force assignments.',
    '- Textual fields (assignment, reason, note, summary, caveats) in Simplified Chinese.',
    '',
    'Output STRICT JSON only, no code fence, no extra text:',
    '{"verdict":{"level":"consistent|partial|inconsistent","confidence":"high|medium|low","reason":""},' +
      '"assignments":[{"shift":0,"assignment":"","multiplicity":"","expectedShift":0,"deviation":0,"confidence":"high|medium|low","note":""}],' +
      '"solventPeaks":[{"shift":0,"kind":"residual|water|solventCarbon","note":""}],' +
      '"unassignedPeaks":[{"shift":0,"note":""}],"summary":"","caveats":[""]}',
  ].join('\n');

  const peaks: number[] = Array.isArray(input.peaks) ? input.peaks : [];
  const user = [
    `观测核素 (nucleus): ${input.nucleus ?? ''}`,
    `候选化合物 SMILES: ${input.smiles ?? ''}`,
    `化合物名称 (name): ${input.compoundName ?? '（未填）'}`,
    `分子式 (formula): ${input.formula ?? '（未填）'}`,
    `氘代溶剂 (solvent): ${input.solventLabel ?? '（未指定）'}`,
    `数据来源 (fileFormat): ${input.fileFormat ?? '（未指定）'}`,
    `观测峰位 (ppm): ${peaks.length ? peaks.join(', ') : '（见谱图图片 / 未提供）'}`,
    `补充说明 (notes): ${input.notes ?? '（无）'}`,
    '',
    '（若提供了谱图图片，请结合图片中的峰形、裂分与积分进行判断。）',
  ].join('\n');
  return { system: withExtra(system, extra), user };
}

/** 内置默认系统 Prompt（不含自定义指令），供设置页只读预览；三类任务的 system 均不依赖 input */
export function defaultSystemPrompt(task: AiTask): string {
  return buildPrompts(task, {}).system;
}

/** 组装上游 chat/completions 所需的 messages（含可选图片与自定义指令） */
export function buildMessages(
  task: AiTask,
  input: Record<string, any>,
  images: string[] = [],
  extra = '',
): ChatMessage[] {
  const { system, user } = buildPrompts(task, input, extra);
  const userContent: string | ChatContentPart[] = images.length
    ? [
        { type: 'text', text: user },
        ...images.map((url): ChatContentPart => ({ type: 'image_url', image_url: { url } })),
      ]
    : user;
  return [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ];
}

/* ------------------------------ 输入校验 -------------------------------- */

/** 返回错误信息；合法返回 null。浏览器直连与云端代理共用，保证行为一致。 */
export function validateAiInput(task: AiTask, input: Record<string, any>): string | null {
  if (task === 'verify') {
    const hasCompound =
      (typeof input.compoundName === 'string' && !!input.compoundName.trim()) ||
      (typeof input.cas === 'string' && !!input.cas.trim());
    if (!hasCompound) return 'verify 任务缺少 compoundName 或 cas';
    if (typeof input.solventLabel !== 'string' || !input.solventLabel.trim()) {
      return 'verify 任务缺少 solventLabel';
    }
    if (!NUCLEUS.has(input.nucleus)) return 'verify 任务 nucleus 非法';
    return null;
  }

  if (task === 'method') {
    const procedure = typeof input.procedure === 'string' ? input.procedure : '';
    if (!procedure.trim()) return 'method 任务缺少 procedure';
    if (procedure.length > MAX_PROCEDURE_CHARS) {
      return `procedure 过长（上限 ${MAX_PROCEDURE_CHARS} 字符）`;
    }
    return null;
  }

  if (typeof input.smiles !== 'string' || !input.smiles.trim()) {
    return 'spectrum 任务必须提供候选化合物 smiles';
  }
  if (!NUCLEUS.has(input.nucleus)) return 'spectrum 任务 nucleus 非法';
  return null;
}