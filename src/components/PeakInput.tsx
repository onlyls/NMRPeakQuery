import { DEFAULT_TOLERANCE, type NucleusType } from '../types/nmr';

interface Props {
  nucleus: NucleusType;
  onNucleusChange: (n: NucleusType) => void;
  rawText: string;
  onRawTextChange: (text: string) => void;
  tolerance: number;
  onToleranceChange: (v: number) => void;
}

/** 把 "7.26, 1.10 3.45；72.8" 之类的自由输入解析成数字（自动去重、去无效值） */
export function parseShifts(text: string): number[] {
  const nums = text
    .split(/[\s,，;；、]+/)
    .map((t) => Number.parseFloat(t))
    .filter((n) => Number.isFinite(n) && n > -50 && n < 300);
  return [...new Set(nums.map((n) => Math.round(n * 1e4) / 1e4))].sort((a, b) => a - b);
}

const NUCLEUS_TABS: { id: NucleusType; label: string; range: string }[] = [
  { id: '1H', label: '¹H', range: '0–12 ppm' },
  { id: '13C', label: '¹³C', range: '0–220 ppm' },
];

export default function PeakInput({
  nucleus,
  onNucleusChange,
  rawText,
  onRawTextChange,
  tolerance,
  onToleranceChange,
}: Props) {
  const shifts = parseShifts(rawText);

  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-500">核素</span>
        <div className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5">
          {NUCLEUS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onNucleusChange(t.id)}
              className={`rounded px-4 py-1.5 text-sm font-medium transition ${
                nucleus === t.id
                  ? 'bg-white text-sky-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="mb-1 flex items-baseline justify-between text-xs font-medium text-slate-500">
          <span>观测峰位（ppm）</span>
          <span className="font-normal text-slate-400">
            {NUCLEUS_TABS.find((t) => t.id === nucleus)?.range}
          </span>
        </span>
        <input
          value={rawText}
          onChange={(e) => onRawTextChange(e.target.value)}
          placeholder={
            nucleus === '1H' ? '如 7.26 或 4.12, 2.05, 1.26' : '如 170.5, 60.4, 14.2'
          }
          inputMode="decimal"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm shadow-sm placeholder:font-sans placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        {shifts.length > 0 && (
          <span className="mt-1 block text-[11px] text-slate-400">
            已识别 {shifts.length} 个峰：
            <span className="font-mono">{shifts.map((s) => s.toString()).join('、')}</span>
          </span>
        )}
      </label>

      <label className="block">
        <span className="mb-1 flex items-baseline justify-between text-xs font-medium text-slate-500">
          <span>容差 ±(ppm)</span>
          <button
            type="button"
            onClick={() => onToleranceChange(DEFAULT_TOLERANCE[nucleus])}
            className="font-normal text-sky-600 hover:underline"
          >
            用默认 {DEFAULT_TOLERANCE[nucleus]}
          </button>
        </span>
        <input
          type="number"
          min={0}
          step={nucleus === '1H' ? 0.01 : 0.1}
          value={tolerance}
          onChange={(e) => onToleranceChange(Number.parseFloat(e.target.value) || 0)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </label>
    </div>
  );
}
