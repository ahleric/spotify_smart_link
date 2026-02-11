'use client';

import { ArrowDownWideNarrow, UsersRound } from 'lucide-react';
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
    return <div className="h-72 animate-pulse rounded-2xl bg-slate-800/70" />;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/75 p-4 ring-1 ring-white/5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-emerald-500/16 p-2 text-emerald-300"><UsersRound className="h-4 w-4" /></span>
            <h3 className="text-lg font-semibold text-white">高意向人群</h3>
          </div>
          <p className="mt-1 text-sm text-white/62">仅保留运营信号，不展示直接身份信息。</p>
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
            <option value="recent">按最近出现</option>
          </select>
        </label>
      </div>

      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="min-w-full text-left text-sm text-white/85">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
            <tr className="text-xs tracking-wide text-white/60">
              <th className="px-3 py-2.5">人群键</th>
              <th className="px-3 py-2.5">分层</th>
              <th className="px-3 py-2.5">活动（UTM）</th>
              <th className="px-3 py-2.5">点击</th>
              <th className="px-3 py-2.5">打开成功</th>
              <th className="px-3 py-2.5">合格</th>
              <th className="px-3 py-2.5">最近出现</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-white/50">暂无高意向人群数据</td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={`${row.audienceKey}-${row.lastSeenAt}`} className="border-t border-white/5 odd:bg-white/[0.02] hover:bg-emerald-500/10">
                  <td className="px-3 py-2.5 font-mono" title={row.audienceKey}>{shorten(row.audienceKey)}</td>
                  <td className="px-3 py-2.5 font-semibold text-emerald-300">{toTierLabel(row.audienceTier)}</td>
                  <td className="max-w-[240px] truncate px-3 py-2.5" title={row.utmCampaign}>{row.utmCampaign || '-'}</td>
                  <td className="px-3 py-2.5">{row.click.toLocaleString()}</td>
                  <td className="px-3 py-2.5">{row.openSuccess.toLocaleString()}</td>
                  <td className="px-3 py-2.5 font-semibold text-emerald-200">{row.qualified.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-white/75">{row.lastSeenAt.slice(0, 19).replace('T', ' ')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
