/* ============================================================================
 * shared.tsx — AI 子工具共用小组件
 *
 * Caveats / RawOutput 原样迁自原 SolventVerify.tsx；AiError 统一三处错误渲染。
 * ========================================================================== */
import { AlertTriangle } from 'lucide-react';

export function Caveats({ items }: { items: string[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
      <div className="mb-1 font-medium">注意事项</div>
      <ul className="list-disc space-y-0.5 pl-4">
        {items.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

export function RawOutput({ raw }: { raw: string }) {
  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50/60">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700">
        查看 AI 原始输出
      </summary>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all px-3 pb-3 text-[11px] leading-relaxed text-slate-500">
        {raw}
      </pre>
    </details>
  );
}

export function AiError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}