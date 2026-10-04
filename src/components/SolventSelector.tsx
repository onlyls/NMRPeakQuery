import type { SolventId, SolventMeta } from '../types/nmr';
import { useDataset } from '../hooks/useNMRSearch';

interface Props {
  value: SolventId | 'all';
  onChange: (id: SolventId | 'all') => void;
}

/**
 * 氘代溶剂选择器。
 * - 前 12 种为一级文献覆盖的溶剂（含化合物位移数据）；
 * - 后 9 种仅由厂商参考表覆盖（referenceOnly），无化合物数据，
 *   仅用于查询溶剂自身峰与物理性质，故单独分组并标注。
 */
export default function SolventSelector({ value, onChange }: Props) {
  const { dataset } = useDataset();
  const all = dataset?.solvents ?? [];
  const literature = all.filter((s) => !s.referenceOnly);
  const referenceOnly = all.filter((s) => s.referenceOnly);

  const optionText = (s: SolventMeta) =>
    `${s.label}（${s.formula}）`;

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">氘代溶剂</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SolventId | 'all')}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        <option value="all">全部溶剂（{literature.length} 种）</option>
        {literature.map((s) => (
          <option key={s.id} value={s.id}>
            {optionText(s)}
          </option>
        ))}
        {referenceOnly.length > 0 && (
          <optgroup label="参考溶剂（无化合物数据，仅溶剂峰 / 物性）">
            {referenceOnly.map((s) => (
              <option key={s.id} value={s.id}>
                {optionText(s)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}