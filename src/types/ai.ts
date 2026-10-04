/* ============================================================================
 * ai.ts — AI 助手相关类型
 *
 * 三类任务的请求 input 与模型返回 payload 契约，与
 * functions/api/ai/chat.ts 中内置的 prompt/JSON schema 保持一致。
 * ========================================================================== */

export type AiTask = 'verify' | 'method' | 'spectrum';

/** GET /api/ai/status 返回；永不包含 API Key */
export interface AiStatus {
  configured: boolean;
  model: string | null;
  visionModel: string | null;
}

export interface AiCallResult<T> {
  data: T;
  model: string;
  /** 模型原始文本，解析失败时供折叠展示 */
  raw: string;
  /** 命中本地核验缓存时为 true（结果可能随时间变化，可强制更新） */
  fromCache?: boolean;
}

export type AiConfidence = 'high' | 'medium' | 'low';

/* --------------------- 能力一：数据集信号核验（位移/裂分/J） --------------------- */

export interface AiVerifySignal {
  shift: number;
  multiplicity?: string;
  /** 偶合常数 J (Hz)，未知留空 */
  coupling?: number[];
  /** 归属片段，如 "CH3" / "CH(2,6)" */
  assignment?: string;
  note?: string;
}

export interface AiVerifyPayload {
  signals?: AiVerifySignal[];
  summary?: string;
  caveats?: string[];
}

/* --------------------------- 能力二：实验方法解析 ----------------------------- */

export interface AiResidualSolvent {
  name: string;
  cas?: string;
  reason?: string;
}

export interface AiMethodPayload {
  deuteratedSolvents?: string[];
  expectedResidualSolvents?: AiResidualSolvent[];
  summary?: string;
  caveats?: string[];
}

/* --------------------------- 能力三：谱图核验与归属 --------------------------- */

export type AiMatchLevel = 'consistent' | 'partial' | 'inconsistent';

export interface AiVerdict {
  level: AiMatchLevel;
  confidence?: AiConfidence;
  reason?: string;
}

export interface AiAssignment {
  shift: number;
  assignment: string;
  multiplicity?: string;
  expectedShift?: number;
  deviation?: number;
  confidence?: AiConfidence;
  note?: string;
}

export interface AiSolventPeak {
  shift: number;
  kind: 'residual' | 'water' | 'solventCarbon';
  note?: string;
}

export interface AiUnassignedPeak {
  shift: number;
  note?: string;
}

export interface AiSpectrumPayload {
  verdict?: AiVerdict;
  assignments?: AiAssignment[];
  solventPeaks?: AiSolventPeak[];
  unassignedPeaks?: AiUnassignedPeak[];
  summary?: string;
  caveats?: string[];
}