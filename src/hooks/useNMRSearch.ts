/* ============================================================================
 * useNMRSearch.ts — 数据集加载与查询状态
 *
 * - useDataset：模块级单例加载（React StrictMode 双挂载也只 fetch 一次）；
 * - usePeakSearch：1 个峰走单峰检索，≥2 个峰自动切换多峰协同；
 * - useNameSearch：名称 / CAS 检索。
 * 计算全部同步且数据量小，直接 useMemo，不做 debounce。
 * ========================================================================== */
import { useEffect, useMemo, useState } from 'react';
import type {
  CompoundData,
  MultiPeakMatch,
  NMRDataset,
  NucleusType,
  SearchResult,
  SolventId,
} from '../types/nmr';
import {
  getDataset,
  hydrate,
  loadDataset,
  matchMultiPeak,
  searchByName,
  searchByPeak,
  type NameHit,
} from '../utils/searchEngine';

type DatasetStatus = 'loading' | 'ready' | 'error';

let datasetPromise: Promise<NMRDataset> | null = null;

function fetchDataset(): Promise<NMRDataset> {
  if (getDataset()) return Promise.resolve(getDataset() as NMRDataset);
  datasetPromise ??= loadDataset(new AbortController().signal).then((ds) => {
    hydrate(ds);
    return ds;
  });
  return datasetPromise;
}

export function useDataset(): {
  status: DatasetStatus;
  dataset: NMRDataset | null;
  error: string;
} {
  const [status, setStatus] = useState<DatasetStatus>(() =>
    getDataset() ? 'ready' : 'loading',
  );
  const [dataset, setDataset] = useState<NMRDataset | null>(() => getDataset());
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchDataset()
      .then((ds) => {
        if (!alive) return;
        setDataset(ds);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  return { status, dataset, error };
}

/* -------------------------------- 峰检索 -------------------------------- */

export interface PeakSearchParams {
  solventId: SolventId | 'all';
  nucleus: NucleusType;
  shifts: number[];
  tolerance: number;
}

export type PeakSearchResult =
  | { mode: 'idle' }
  | { mode: 'single'; hits: SearchResult[] }
  | { mode: 'multi'; matches: MultiPeakMatch[] };

export function usePeakSearch(params: PeakSearchParams): PeakSearchResult {
  const { status } = useDataset();

  return useMemo<PeakSearchResult>(() => {
    if (status !== 'ready') return { mode: 'idle' };
    const shifts = params.shifts.filter((x) => Number.isFinite(x));
    if (!shifts.length) return { mode: 'idle' };

    if (shifts.length === 1) {
      return {
        mode: 'single',
        hits: searchByPeak({
          solventId: params.solventId,
          nucleus: params.nucleus,
          shift: shifts[0],
          tolerance: params.tolerance,
          limit: 200,
        }),
      };
    }
    return {
      mode: 'multi',
      matches: matchMultiPeak({
        solventId: params.solventId,
        nucleus: params.nucleus,
        shifts,
        tolerance: params.tolerance,
        limit: 200,
      }),
    };
  }, [status, params.solventId, params.nucleus, params.tolerance, params.shifts]);
}

/* ------------------------------- 名称检索 -------------------------------- */

export function useNameSearch(keyword: string): NameHit[] {
  const { status } = useDataset();
  return useMemo(
    () => (status === 'ready' && keyword.trim() ? searchByName(keyword) : []),
    [status, keyword],
  );
}

/** 便捷：按 id 取化合物 */
export function useCompound(id: string | null): CompoundData | null {
  const { dataset } = useDataset();
  return useMemo(
    () => (dataset && id ? dataset.compounds.find((c) => c.id === id) ?? null : null),
    [dataset, id],
  );
}
