/* ============================================================================
 * aiSettings.ts — 浏览器端 AI 设置（BYOK + 能力开关）
 *
 * 存储在 localStorage（key: nmrpeakquery.ai.settings.v1），仅留在用户本机，
 * 不会上传任何服务器。与 Cloudflare 环境变量配置共存：
 *   浏览器已配置 → 优先用浏览器配置直连服务商；
 *   否则云端已配置 → 走同源 Pages Functions 代理。
 * ========================================================================== */
import { useSyncExternalStore } from 'react';
import type { AiTask } from '../types/ai';

export interface AiCapabilityFlags {
  verify: boolean;
  method: boolean;
  spectrum: boolean;
}

/** 核验结果缓存的保留策略 */
export type VerifyCacheMode = 'session' | 'local' | 'off';

export interface AiSettings {
  /** 总开关：关闭后浏览器端整体隐藏 AI 助手入口 */
  enabled: boolean;
  /** 三项能力各自的开关，即使云端已配置 Key 也生效 */
  capabilities: AiCapabilityFlags;
  /** 以下为浏览器自带 Key（BYOK）配置；baseUrl / apiKey / model 任一为空即视为未配置 */
  baseUrl: string;
  apiKey: string;
  model: string;
  visionModel: string;
  /** 核验结果缓存保留策略：本次会话 / 永久 / 关闭 */
  verifyCache: VerifyCacheMode;
  /** 三类任务各自追加的自定义指令（拼接在内置默认 Prompt 之后，空串 = 仅用默认） */
  promptExtras: Record<AiTask, string>;
}

export const VERIFY_CACHE_META: { id: VerifyCacheMode; label: string; hint: string }[] = [
  { id: 'session', label: '本次会话', hint: '缓存存于会话存储，关闭标签页后自动清除' },
  { id: 'local', label: '永久保存', hint: '缓存存于浏览器本地，刷新后仍可复用，需手动清除' },
  { id: 'off', label: '不缓存', hint: '每次核验都重新请求 AI' },
];

export const AI_CAPABILITY_META: { id: AiTask; label: string; hint: string }[] = [
  { id: 'verify', label: '数据集核验', hint: '在按峰位查 / 按名称查中核验位移、裂分与耦合常数' },
  { id: 'method', label: '实验方法解析', hint: '识别氘代溶剂并预测残留溶剂' },
  { id: 'spectrum', label: '谱图核验与归属', hint: '谱图 + SMILES 判定并归属' },
];

const STORAGE_KEY = 'nmrpeakquery.ai.settings.v1';

function defaults(): AiSettings {
  return {
    enabled: true,
    capabilities: { verify: true, method: true, spectrum: true },
    baseUrl: '',
    apiKey: '',
    model: '',
    visionModel: '',
    verifyCache: 'session',
    promptExtras: { verify: '', method: '', spectrum: '' },
  };
}

const CACHE_MODES: VerifyCacheMode[] = ['session', 'local', 'off'];

function parseExtras(raw: unknown): Record<AiTask, string> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const pick = (k: AiTask) => (typeof o[k] === 'string' ? (o[k] as string) : '');
  return { verify: pick('verify'), method: pick('method'), spectrum: pick('spectrum') };
}

function parse(raw: string | null): AiSettings {
  const base = defaults();
  if (!raw) return base;
  try {
    const o = JSON.parse(raw) as Partial<AiSettings>;
    return {
      enabled: o.enabled !== false,
      capabilities: {
        verify: o.capabilities?.verify !== false,
        method: o.capabilities?.method !== false,
        spectrum: o.capabilities?.spectrum !== false,
      },
      baseUrl: typeof o.baseUrl === 'string' ? o.baseUrl : '',
      apiKey: typeof o.apiKey === 'string' ? o.apiKey : '',
      model: typeof o.model === 'string' ? o.model : '',
      visionModel: typeof o.visionModel === 'string' ? o.visionModel : '',
      verifyCache: CACHE_MODES.includes(o.verifyCache as VerifyCacheMode)
        ? (o.verifyCache as VerifyCacheMode)
        : 'session',
      promptExtras: parseExtras(o.promptExtras),
    };
  } catch {
    return base;
  }
}

/* --------------------------- 可订阅的快照存储 --------------------------- */

let snapshot: AiSettings =
  typeof window === 'undefined' ? defaults() : parse(window.localStorage.getItem(STORAGE_KEY));

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 当前设置（引用稳定，可直接用于 useSyncExternalStore） */
export function getAiSettings(): AiSettings {
  return snapshot;
}

export function saveAiSettings(next: AiSettings): void {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 隐私模式 / 配额不足时仅本次会话有效 */
  }
  emit();
}

export function updateAiSettings(patch: Partial<AiSettings>): void {
  saveAiSettings({ ...snapshot, ...patch });
}

export function updateAiCapability(id: AiTask, value: boolean): void {
  const capabilities = { ...snapshot.capabilities };
  capabilities[id] = value;
  saveAiSettings({ ...snapshot, capabilities });
}

/** 清空浏览器自带 Key（保留开关设置） */
export function clearByok(): void {
  updateAiSettings({ baseUrl: '', apiKey: '', model: '', visionModel: '' });
}

/** 跨标签页同步 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      snapshot = parse(e.newValue);
      emit();
    }
  });
}

/** React 绑定：设置变化时自动重渲染 */
export function useAiSettings(): AiSettings {
  return useSyncExternalStore(subscribe, getAiSettings, getAiSettings);
}

/* ------------------------------ 派生判断 -------------------------------- */

/** 浏览器端 BYOK 是否完整（baseUrl + apiKey + model 均非空） */
export function isByokConfigured(s: AiSettings): boolean {
  return Boolean(s.baseUrl.trim() && s.apiKey.trim() && s.model.trim());
}