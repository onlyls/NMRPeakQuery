/* ============================================================================
 * aiClient.ts — 前端 AI 传输层
 *
 * 两条调用路径，优先级为「浏览器自带 Key（BYOK）> 云端配置」：
 *   1. 浏览器已配置 baseUrl/apiKey/model → 直接请求 {baseUrl}/chat/completions，
 *      Key 与请求体都不经过部署方服务器（受服务商 CORS 策略约束）；
 *   2. 否则 → 同源 POST /api/ai/chat，由 Cloudflare Pages Functions 代理，
 *      浏览器端不接触云端 Key。
 * ========================================================================== */
import type { AiCallResult, AiStatus, AiTask } from '../types/ai';
import { getAiSettings, isByokConfigured, type AiSettings } from './aiSettings';
import { readVerifyCache, verifyCacheKey, writeVerifyCache } from './verifyCache';
import {
  AI_TIMEOUT_MS,
  DEFAULT_MAX_TOKENS,
  buildMessages,
  validateAiInput,
} from './aiPrompts';

/** BASE_URL 保证部署在子路径时也能命中 */
const API_BASE = `${import.meta.env.BASE_URL}api/ai`;

export type AiSource = 'byok' | 'cloud';

/** 当前实际生效的 AI 通道 */
export interface AiRuntime {
  /** null 表示两条路径都未配置 */
  source: AiSource | null;
  model: string | null;
  /** 为空表示谱图图片解析不可用 */
  visionModel: string | null;
}

/** 按「BYOK 优先」解析当前生效的通道 */
export function resolveAiRuntime(local: AiSettings, cloud: AiStatus | null): AiRuntime {
  if (isByokConfigured(local)) {
    return {
      source: 'byok',
      model: local.model.trim(),
      visionModel: local.visionModel.trim() || null,
    };
  }
  if (cloud?.configured) {
    return { source: 'cloud', model: cloud.model, visionModel: cloud.visionModel };
  }
  return { source: null, model: null, visionModel: null };
}

let statusCache: AiStatus | null = null;
let statusPromise: Promise<AiStatus> | null = null;

async function doFetchStatus(): Promise<AiStatus> {
  try {
    const res = await fetch(`${API_BASE}/status`);
    if (!res.ok) throw new Error();
    const data = (await res.json()) as Partial<AiStatus>;
    const status: AiStatus = {
      configured: Boolean(data.configured),
      model: data.model ?? null,
      visionModel: data.visionModel ?? null,
    };
    statusCache = status;
    return status;
  } catch {
    // 失败不写缓存，下次仍会重试
    return { configured: false, model: null, visionModel: null };
  }
}

/**
 * 查询云端是否已配置（失败一律视为未配置，不打断页面）。
 * 成功结果模块级缓存，并发调用复用同一请求；force 可强制刷新。
 */
export async function fetchAiStatus(force = false): Promise<AiStatus> {
  if (!force && statusCache) return statusCache;
  statusPromise ??= doFetchStatus().finally(() => {
    statusPromise = null;
  });
  return statusPromise;
}

export interface AiCallParams {
  task: AiTask;
  input: Record<string, unknown>;
  /** data URL 列表，仅 spectrum 图片场景 */
  images?: string[];
  /** 为 true 时跳过缓存读取（用于「强制更新」），但仍会写入新结果 */
  bypassCache?: boolean;
}

/** 调用 AI 并解析出结构化 JSON；失败抛带中文信息的 Error */
export async function callAi<T>({
  task,
  input,
  images,
  bypassCache,
}: AiCallParams): Promise<AiCallResult<T>> {
  const local = getAiSettings();
  const invalid = validateAiInput(task, input as Record<string, any>);
  if (invalid) throw new Error(invalid);

  const extra = local.promptExtras[task] ?? '';
  const cacheable = task === 'verify' && !images?.length;
  const key = cacheable ? verifyCacheKey({ input, extra }) : '';

  if (cacheable && !bypassCache) {
    const cached = readVerifyCache<T>(key);
    if (cached) return { ...cached, fromCache: true };
  }

  const res = isByokConfigured(local)
    ? await callDirect<T>(local, { task, input, images })
    : await callViaFunction<T>({ task, input, images });

  if (cacheable) writeVerifyCache(key, res);
  return res;
}

/* --------------------------- 路径一：浏览器直连 --------------------------- */

async function fetchDirect(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('AI 请求超时（60 秒），请稍后重试或更换端点');
    }
    throw new Error(
      '无法直连该端点：可能是网络不可达，或服务商未允许浏览器跨域（CORS）调用；' +
        '可改用 Cloudflare 服务端配置。',
    );
  } finally {
    clearTimeout(timer);
  }
}

function readContent(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

async function callDirect<T>(
  cfg: AiSettings,
  { task, input, images }: AiCallParams,
): Promise<AiCallResult<T>> {
  const imgs = images ?? [];
  const model = imgs.length ? cfg.visionModel.trim() : cfg.model.trim();
  if (imgs.length && !model) {
    throw new Error('未配置视觉模型（visionModel），无法解析谱图图片');
  }

  const base = cfg.baseUrl.trim().replace(/\/+$/, '');
  const res = await fetchDirect(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(task, input as Record<string, any>, imgs, cfg.promptExtras[task] ?? ''),
      temperature: 0.2,
      max_tokens: DEFAULT_MAX_TOKENS,
    }),
  });

  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`端点返回非 JSON 响应：HTTP ${res.status}`);
  }

  if (!res.ok) {
    const detail = parsed?.error?.message ?? parsed?.error ?? text.slice(0, 300);
    throw new Error(`端点返回 ${res.status}：${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }

  const raw = readContent(parsed);
  if (!raw) throw new Error('端点响应中缺少 content');
  return { data: extractJson<T>(raw), model, raw };
}

/** 连通性自检：发一条最小请求，用于排查 BYOK 端点的 CORS / Key 问题 */
export async function testDirectConnection(cfg: {
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<string> {
  const base = cfg.baseUrl.trim().replace(/\/+$/, '');
  if (!base || !cfg.apiKey.trim() || !cfg.model.trim()) {
    throw new Error('请先填写 Base URL、API Key 与模型名');
  }
  const res = await fetchDirect(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: cfg.model.trim(),
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`端点返回 ${res.status}：${text.slice(0, 300)}`);
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('端点返回非 JSON 响应');
  }
  return parsed?.model ?? cfg.model.trim();
}

/* -------------------------- 路径二：同源 Function ------------------------- */

async function callViaFunction<T>({ task, input, images }: AiCallParams): Promise<AiCallResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task,
        input,
        images,
        promptExtra: getAiSettings().promptExtras[task] ?? '',
      }),
    });
  } catch {
    throw new Error('无法连接到 AI 服务（本地联调请先运行 npm run dev:api）');
  }

  const text = await res.text();
  let payload: { content?: string; model?: string; error?: string };
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`AI 响应异常：HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(payload.error || `AI 请求失败：HTTP ${res.status}`);

  const raw = payload.content ?? '';
  const data = extractJson<T>(raw);
  return { data, model: payload.model ?? '', raw };
}

/* ------------------------------ JSON 解析 ------------------------------- */

/** 宽松解析：剥离代码围栏，截取首个 { 到末个 } */
export function extractJson<T>(content: string): T {
  const trimmed = content.trim();
  const unfenced = trimmed.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  const slice = start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;
  try {
    return JSON.parse(slice) as T;
  } catch {
    throw new Error('AI 返回内容不是合法 JSON，可在下方查看原始输出');
  }
}

/* ------------------------------ 图片处理 -------------------------------- */

function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解析失败'));
    img.src = src;
  });
}

/** 等比降采样并压成 JPEG，控制体积与 token 消耗 */
export async function imageToDataUrl(
  file: File,
  maxDim = 1600,
  quality = 0.85,
): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale >= 1 && dataUrl.length < 2_000_000) return dataUrl;

  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}