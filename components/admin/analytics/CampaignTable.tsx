'use client';

import { ArrowDownWideNarrow, Megaphone } from 'lucide-react';
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
    return <div className="h-80 animate-pulse rounded-2xl bg-slate-800/70" />;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/75 p-4 ring-1 ring-white/5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-cyan-400/16 p-2 text-cyan-300"><Megaphone className="h-4 w-4" /></span>
          <h3 className="text-lg font-semibold text-white">Ad Set / Ad 表现</h3>
        </div>
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white/75">
          <ArrowDownWideNarrow className="h-4 w-4 text-emerald-300" />
          排序
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-white/15 bg-slate-800 px-2 py-1 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="qualified">按合格数</option>
            <option value="rate">按合格率</option>
            <option value="open">按打开成功</option>
            <option value="click">按点击</option>
          </select>
        </label>
      </div>

      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="min-w-full text-left text-sm text-white/85">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
            <tr className="text-xs tracking-wide text-white/60">
              <th className="px-3 py-2.5">Ad Set</th>
              <th className="px-3 py-2.5">Ad</th>
              <th className="px-3 py-2.5">浏览</th>
              <th className="px-3 py-2.5">点击</th>
              <th className="px-3 py-2.5">打开成功</th>
              <th className="px-3 py-2.5">合格</th>
              <th className="px-3 py-2.5">合格率</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-white/50">暂无活动数据</td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.key} className="border-t border-white/5 odd:bg-white/[0.02] hover:bg-emerald-500/10">
                  <td className="max-w-[260px] px-3 py-2.5">
                    <p className="truncate text-white" title={row.adSetName || row.adSetId}>
                      {row.adSetName || '（未拿到名称）'}
                    </p>
                    <p className="truncate text-xs text-white/55" title={row.adSetId}>
                      ID: {row.adSetId}
                    </p>
                  </td>
                  <td className="max-w-[260px] px-3 py-2.5">
                    <p className="truncate text-white/90" title={row.adName || row.adId}>
                      {row.adName || '（未拿到名称）'}
                    </p>
                    <p className="truncate text-xs text-white/55" title={row.adId}>
                      ID: {row.adId}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">{row.view.toLocaleString()}</td>
                  <td className="px-3 py-2.5">{row.click.toLocaleString()}</td>
                  <td className="px-3 py-2.5">{row.openSuccess.toLocaleString()}</td>
                  <td className="px-3 py-2.5 font-semibold text-emerald-200">{row.qualified.toLocaleString()}</td>
                  <td className="px-3 py-2.5 font-semibold text-emerald-300">{row.qualifiedRatePct}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
