import type { SolventId } from '../types/nmr';
import { useDataset } from '../hooks/useNMRSearch';

interface Props {
  value: SolventId | 'all';
  onChange: (id: SolventId | 'all') => void;
}

/**
 * 氘代溶剂选择器。默认 "all"（跨 12 种溶剂）；
 * 实际解谱时通常知道所用氘代溶剂，限定后命中率与速度都更好。
 */
export default function SolventSelector({ value, onChange }: Props) {
  const { dataset } = useDataset();

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">氘代溶剂</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SolventId | 'all')}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        <option value="all">全部溶剂（12 种）</option>
        {dataset?.solvents.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}（{s.formula}）
          </option>
        ))}
      </select>
    </label>
  );
}
