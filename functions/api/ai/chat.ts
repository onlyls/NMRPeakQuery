/* ============================================================================
 * functions/api/ai/chat.ts — Cloudflare Pages Function
 *   POST /api/ai/chat
 *
 * 统一代理到「自定义 OpenAI 兼容端点」的 /chat/completions：
 *   - 三类任务 verify / method / spectrum，prompt 与校验复用 src/utils/aiPrompts；
 *   - API Key 只从环境变量读取，绝不下发浏览器；
 *   - 带图时优先使用 AI_VISION_MODEL。
 *
 * 请求体：{ task, input, images?, promptExtra? }
 * 成功响应：{ content, model, usage? }
 * 失败响应：{ error }（含 400 / 502 / 503）
 ========================================================================== */

import {
  AI_TIMEOUT_MS,
  DEFAULT_MAX_TOKENS,
  MAX_PROMPT_EXTRA_CHARS,
  buildMessages,
  validateAiInput,
  type ChatMessage,
} from '../../../src/utils/aiPrompts';

interface Env {
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  AI_VISION_MODEL?: string;
  AI_MAX_TOKENS?: string;
}

interface Ctx {
  request: Request;
  env: Env;
}

type Task = 'verify' | 'method' | 'spectrum';

const MAX_BODY_BYTES = 12 * 1024 * 1024; // 12 MB

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/* ------------------------------ 上游调用 -------------------------------- */

async function callProvider(
  env: Env,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<{ content: string; usage?: unknown }> {
  const base = (env.AI_BASE_URL ?? '').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.AI_API_KEY ?? ''}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      const summary = text.slice(0, 500);
      throw Object.assign(new Error(`上游返回 ${res.status}：${summary}`), { upstreamStatus: res.status });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('上游返回非 JSON 响应');
    }
    const content: string = parsed?.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error('上游响应中缺少 content');
    return { content, usage: parsed?.usage };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------- 路由 ---------------------------------- */

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  if (!env.AI_BASE_URL || !env.AI_API_KEY || !env.AI_MODEL) {
    return json({ error: 'AI 未配置：请在环境变量中设置 AI_BASE_URL / AI_API_KEY / AI_MODEL' }, 503);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: '请求体过大（上限 12 MB）' }, 400);
  }

  let body: { task?: Task; input?: Record<string, any>; images?: unknown; promptExtra?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: '请求体不是合法 JSON' }, 400);
  }

  const task = body.task;
  if (task !== 'verify' && task !== 'method' && task !== 'spectrum') {
    return json({ error: '未知任务类型 task' }, 400);
  }

  const input = (body.input ?? {}) as Record<string, any>;
  const images: string[] = Array.isArray(body.images)
    ? body.images.filter((x): x is string => typeof x === 'string')
    : [];
  // 仅接受「追加」文本并强制截断；默认基础 Prompt 始终由服务端生成，避免代理被当作通用 AI 网关滥用
  const promptExtra =
    typeof body.promptExtra === 'string' ? body.promptExtra.slice(0, MAX_PROMPT_EXTRA_CHARS) : '';

  const invalid = validateAiInput(task, input);
  if (invalid) return json({ error: invalid }, 400);

  if (images.length && !env.AI_VISION_MODEL) {
    return json({ error: '未配置 AI_VISION_MODEL，无法解析谱图图片' }, 400);
  }

  const model = images.length ? (env.AI_VISION_MODEL as string) : (env.AI_MODEL as string);
  const maxTokens = Math.max(256, Number.parseInt(env.AI_MAX_TOKENS ?? '', 10) || DEFAULT_MAX_TOKENS);

  const messages = buildMessages(task, input, images, promptExtra);

  try {
    const { content, usage } = await callProvider(env, model, messages, maxTokens);
    return json({ content, model, usage });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 502);
  }
};