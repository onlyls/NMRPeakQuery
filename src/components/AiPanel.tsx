/* ============================================================================
 * AiPanel.tsx — AI 助手容器
 *
 * 通道解析（BYOK 优先）→ 未配置时提示配置 API Key；
 * 能力开关（总开关 + 子开关）决定展示哪些子工具。
 *   本面板：实验方法解析 / 谱图核验与归属
 *   「数据集核验」子开关作用于按峰位查 / 按名称查结果卡片，不在本面板内。
 * ========================================================================== */
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Info,
  Loader2,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { fetchAiStatus, resolveAiRuntime } from '../utils/aiClient';
import { AI_CAPABILITY_META, isByokConfigured, useAiSettings } from '../utils/aiSettings';
import type { AiStatus, AiTask } from '../types/ai';
import MethodAnalyzer from './ai/MethodAnalyzer';
import SpectrumAnalyzer from './ai/SpectrumAnalyzer';

/** 面板内实际承载的子工具（verify 已在查询页实现，不在此面板） */
const PANEL_TASKS: AiTask[] = ['method', 'spectrum'];
const TOOLS = AI_CAPABILITY_META.filter((t) => PANEL_TASKS.includes(t.id));

export default function AiPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const settings = useAiSettings();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [tool, setTool] = useState<AiTask>('method');

  useEffect(() => {
    let alive = true;
    fetchAiStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const runtime = resolveAiRuntime(settings, status);
  const tools = TOOLS.filter((t) => settings.capabilities[t.id]);
  const activeTool = tools.some((t) => t.id === tool) ? tool : tools[0]?.id;
  /** 浏览器 Key 填了一半（未完整）→ 回退云端时给出说明 */
  const byokPartial =
    !isByokConfigured(settings) &&
    Boolean(settings.baseUrl.trim() || settings.apiKey.trim() || settings.model.trim());

  const settingsButton = (
    <button
      type="button"
      onClick={onOpenSettings}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
    >
      <Settings className="h-3.5 w-3.5" />
      设置
    </button>
  );

  /* ------------------------- 未启用 / 无可用能力 ------------------------- */

  if (!settings.enabled) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <span>AI 助手已在浏览器端关闭。</span>
        {settingsButton}
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <span>可用 AI 能力均已在浏览器端关闭。</span>
        {settingsButton}
      </div>
    );
  }

  /* --------------------------- 未配置 API Key --------------------------- */

  // 已配置浏览器自带 Key 时无需等待云端状态，直接渲染
  if (status === null && !isByokConfigured(settings)) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在检查 AI 服务配置…
      </div>
    );
  }

  if (!runtime.source) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <div className="font-medium">尚未配置 API Key，无法使用 AI 功能</div>
            <div className="text-xs leading-relaxed">
              两种方式任选其一：在浏览器里填写自己的 API Key（仅存本机），
              或在部署端（Cloudflare Pages 环境变量）配置服务器 Key。
            </div>
          </div>
        </div>
        {settingsButton}
      </div>
    );
  }

  /* ------------------------------ 正常渲染 ------------------------------ */

  return (
    <div className="space-y-5">
      {/* 状态条 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
          <Sparkles className="h-3.5 w-3.5 text-sky-600" />
          模型 {runtime.model}
        </span>
        <span className="inline-flex items-center gap-1">
          {runtime.source === 'byok' ? (
            <>
              <ShieldCheck className="h-3 w-3 text-emerald-600" />
              浏览器自带 Key（直连，Key 不经过服务器）
            </>
          ) : (
            <>
              <Info className="h-3 w-3" />
              云端配置（经同源代理）
              {byokPartial && ' · 浏览器 Key 未填完整，已回退云端'}
            </>
          )}
        </span>
        <span className="inline-flex items-center gap-1">
          <Info className="h-3 w-3" />
          视觉模型：{runtime.visionModel ?? '未配置（图片解析不可用）'}
        </span>
        <span className="ml-auto">{settingsButton}</span>
      </div>

      {/* 子工具切换 */}
      <div className="flex flex-wrap gap-1.5">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTool(t.id)}
            title={t.hint}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              activeTool === t.id
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {activeTool === 'method' && <MethodAnalyzer />}
        {activeTool === 'spectrum' && (
          <SpectrumAnalyzer visionAvailable={Boolean(runtime.visionModel)} />
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-400">
        所有 AI 结论均为独立参考，可能存在幻觉；本地文献数据集为权威来源，请结合实验实际判断。
      </p>
    </div>
  );
}