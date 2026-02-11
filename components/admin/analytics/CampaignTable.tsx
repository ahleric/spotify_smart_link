'use client';

import { useMemo, useState } from 'react';
import type { CampaignsResponse } from './types';

type CampaignTableProps = {
  data: CampaignsResponse | null;
  loading: boolean;
};

type SortKey = 'qualified' | 'open' | 'click' | 'rate';

export default function CampaignTable({ data, loading }: CampaignTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('qualified');
  const sortedRows = useMemo(() => {
    const rows = data?.rows || [];
    const cloned = [...rows];
    cloned.sort((a, b) => {
      if (sortKey === 'rate') return b.qualifiedRatePct - a.qualifiedRatePct;
      if (sortKey === 'open') return b.openSuccess - a.openSuccess;
      if (sortKey === 'click') return b.click - a.click;
      return b.qualified - a.qualified;
    });
    return cloned;
  }, [data, sortKey]);

  if (loading) {
    return <div className="h-80 animate-pulse rounded-xl bg-slate-800/70" />;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/75 p-4 ring-1 ring-white/5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Ad Set / Ad 表现</h3>
        <label className="flex items-center gap-2 text-[11px] text-white/65">
          排序
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="min-h-9 rounded-lg border border-white/15 bg-slate-800 px-2 text-[11px] text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="qualified">按合格数</option>
            <option value="rate">按合格率</option>
            <option value="open">按打开成功</option>
            <option value="click">按点击</option>
          </select>
        </label>
      </div>
      <div className="overflow-auto rounded-lg border border-white/10">
        <table className="min-w-full text-left text-xs text-white/80">
          <thead className="sticky top-0 bg-slate-900 text-[11px] uppercase tracking-wide text-white/55">
            <tr>
              <th className="px-3 py-2">Ad Set</th>
              <th className="px-3 py-2">Ad</th>
              <th className="px-3 py-2">浏览</th>
              <th className="px-3 py-2">点击</th>
              <th className="px-3 py-2">打开成功</th>
              <th className="px-3 py-2">合格</th>
              <th className="px-3 py-2">合格率</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-white/50">暂无活动数据</td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.key} className="border-t border-white/5 odd:bg-white/[0.02]">
                  <td className="max-w-[200px] truncate px-3 py-2" title={row.adSetId}>{row.adSetId}</td>
                  <td className="max-w-[200px] truncate px-3 py-2" title={row.adId}>{row.adId}</td>
                  <td className="px-3 py-2">{row.view}</td>
                  <td className="px-3 py-2">{row.click}</td>
                  <td className="px-3 py-2">{row.openSuccess}</td>
                  <td className="px-3 py-2">{row.qualified}</td>
                  <td className="px-3 py-2 text-emerald-300">{row.qualifiedRatePct}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
