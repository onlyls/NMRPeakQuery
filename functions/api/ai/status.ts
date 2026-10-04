/* ============================================================================
 * functions/api/ai/status.ts — Cloudflare Pages Function
 *   GET /api/ai/status
 *
 * 只暴露「是否已配置」与模型名，永不返回 API Key。
 * 供前端显示「AI 未配置 / 无视觉模型」提示并禁用相应入口。
 * ========================================================================== */

interface Env {
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  AI_VISION_MODEL?: string;
}

interface Ctx {
  request: Request;
  env: Env;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const onRequestGet = async ({ env }: Ctx): Promise<Response> => {
  const configured = Boolean(env.AI_BASE_URL && env.AI_API_KEY && env.AI_MODEL);
  return json({
    configured,
    model: env.AI_MODEL ?? null,
    visionModel: env.AI_VISION_MODEL ?? null,
  });
};