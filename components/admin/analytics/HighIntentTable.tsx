'use client';

import { useMemo, useState } from 'react';
import type { HighIntentResponse } from './types';

type HighIntentTableProps = {
  data: HighIntentResponse | null;
  loading: boolean;
};

type SortKey = 'qualified' | 'recent';

function toTierLabel(value: string) {
  if (value === 'qualified') return '已合格';
  if (value === 'warm') return '温热';
  if (value === 'clicker') return '点击用户';
  if (value === 'unknown') return '未知';
  return value || '-';
}

function shorten(value: string, left = 8, right = 6) {
  if (value.length <= left + right + 2) return value;
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

export default function HighIntentTable({ data, loading }: HighIntentTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('qualified');
  const sortedRows = useMemo(() => {
    const rows = data?.rows || [];
    const cloned = [...rows];
    cloned.sort((a, b) => {
      if (sortKey === 'recent') return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      if (b.qualified !== a.qualified) return b.qualified - a.qualified;
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
    });
    return cloned;
  }, [data, sortKey]);

  if (loading) {
    return <div className="h-72 animate-pulse rounded-xl bg-slate-800/70" />;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/75 p-4 ring-1 ring-white/5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">高意向人群</h3>
          <p className="text-[11px] text-white/55">仅运营信号（不包含直接身份信息）</p>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-white/65">
          排序
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="min-h-9 rounded-lg border border-white/15 bg-slate-800 px-2 text-[11px] text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="qualified">按合格数</option>
            <option value="recent">按最近出现</option>
          </select>
        </label>
      </div>
      <div className="overflow-auto rounded-lg border border-white/10">
        <table className="min-w-full text-left text-xs text-white/80">
          <thead className="sticky top-0 bg-slate-900 text-[11px] uppercase tracking-wide text-white/55">
            <tr>
              <th className="px-3 py-2">人群键</th>
              <th className="px-3 py-2">分层</th>
              <th className="px-3 py-2">活动（UTM）</th>
              <th className="px-3 py-2">点击</th>
              <th className="px-3 py-2">打开成功</th>
              <th className="px-3 py-2">合格</th>
              <th className="px-3 py-2">最近出现</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-white/50">暂无高意向人群数据</td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={`${row.audienceKey}-${row.lastSeenAt}`} className="border-t border-white/5 odd:bg-white/[0.02]">
                  <td className="px-3 py-2 font-mono" title={row.audienceKey}>{shorten(row.audienceKey)}</td>
                  <td className="px-3 py-2 text-emerald-300">{toTierLabel(row.audienceTier)}</td>
                  <td className="max-w-[220px] truncate px-3 py-2" title={row.utmCampaign}>{row.utmCampaign}</td>
                  <td className="px-3 py-2">{row.click}</td>
                  <td className="px-3 py-2">{row.openSuccess}</td>
                  <td className="px-3 py-2">{row.qualified}</td>
                  <td className="px-3 py-2">{row.lastSeenAt.slice(0, 19).replace('T', ' ')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
