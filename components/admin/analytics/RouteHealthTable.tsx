'use client';

import { ArrowDownWideNarrow, Route } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RouteHealthResponse } from './types';

type RouteHealthTableProps = {
  data: RouteHealthResponse | null;
  loading: boolean;
};

type SortKey = 'success_rate' | 'open_success' | 'click' | 'fallback_rate';

function toOsLabel(value: string) {
  if (value === 'ios') return 'iOS';
  if (value === 'android') return 'Android';
  if (value === 'desktop') return '桌面';
  if (value === 'unknown') return '未知';
  return value || '-';
}

function toBrowserLabel(value: string) {
  if (value === 'instagram') return 'Instagram';
  if (value === 'facebook') return 'Facebook';
  if (value === 'tiktok') return 'TikTok';
  if (value === 'none') return '无';
  if (value === 'unknown') return '未知';
  return value || '-';
}

function toStrategyLabel(value: string) {
  if (value === 'deep-link-first') return '深链优先';
  if (value === 'universal-link-first') return '通用链接优先';
  if (value === 'web-only') return '仅网页';
  if (value === 'view') return '浏览';
  if (value === 'unknown') return '未知';
  return value || '-';
}

export default function RouteHealthTable({ data, loading }: RouteHealthTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('success_rate');
  const sortedRows = useMemo(() => {
    const rows = data?.rows || [];
    const cloned = [...rows];
    cloned.sort((a, b) => {
      if (sortKey === 'fallback_rate') return b.fallbackRatePct - a.fallbackRatePct;
      if (sortKey === 'open_success') return b.openSuccess - a.openSuccess;
      if (sortKey === 'click') return b.click - a.click;
      return b.openSuccessRatePct - a.openSuccessRatePct;
    });
    return cloned;
  }, [data, sortKey]);

  if (loading) {
    return <div className="h-72 animate-pulse rounded-2xl bg-slate-800/70" />;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/75 p-4 ring-1 ring-white/5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-amber-400/18 p-2 text-amber-200"><Route className="h-4 w-4" /></span>
          <h3 className="text-lg font-semibold text-white">路由健康度</h3>
        </div>
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white/75">
          <ArrowDownWideNarrow className="h-4 w-4 text-emerald-300" />
          排序
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-white/15 bg-slate-800 px-2 py-1 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="success_rate">按成功率</option>
            <option value="open_success">按打开成功</option>
            <option value="click">按点击</option>
            <option value="fallback_rate">按回退率</option>
          </select>
        </label>
      </div>

      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="min-w-full text-left text-sm text-white/85">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
            <tr className="text-xs tracking-wide text-white/60">
              <th className="px-3 py-2.5">系统</th>
              <th className="px-3 py-2.5">应用内浏览器</th>
              <th className="px-3 py-2.5">策略</th>
              <th className="px-3 py-2.5">点击</th>
              <th className="px-3 py-2.5">打开尝试</th>
              <th className="px-3 py-2.5">打开成功</th>
              <th className="px-3 py-2.5">回退打开</th>
              <th className="px-3 py-2.5">成功率</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-white/50">暂无路由健康数据</td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.key} className="border-t border-white/5 odd:bg-white/[0.02] hover:bg-amber-400/10">
                  <td className="px-3 py-2.5">{toOsLabel(row.os)}</td>
                  <td className="px-3 py-2.5">{toBrowserLabel(row.inAppBrowser)}</td>
                  <td className="px-3 py-2.5">{toStrategyLabel(row.strategy)}</td>
                  <td className="px-3 py-2.5">{row.click.toLocaleString()}</td>
                  <td className="px-3 py-2.5">{row.openAttempt.toLocaleString()}</td>
                  <td className="px-3 py-2.5">{row.openSuccess.toLocaleString()}</td>
                  <td className="px-3 py-2.5">{row.openFallback.toLocaleString()}</td>
                  <td className="px-3 py-2.5 font-semibold text-emerald-300">{row.openSuccessRatePct}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
