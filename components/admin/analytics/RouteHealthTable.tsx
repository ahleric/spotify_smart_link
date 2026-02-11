'use client';

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
    return <div className="h-72 animate-pulse rounded-xl bg-slate-800/70" />;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/75 p-4 ring-1 ring-white/5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">路由健康度</h3>
        <label className="flex items-center gap-2 text-[11px] text-white/65">
          排序
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="min-h-9 rounded-lg border border-white/15 bg-slate-800 px-2 text-[11px] text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="success_rate">按成功率</option>
            <option value="open_success">按打开成功</option>
            <option value="click">按点击</option>
            <option value="fallback_rate">按回退率</option>
          </select>
        </label>
      </div>
      <div className="overflow-auto rounded-lg border border-white/10">
        <table className="min-w-full text-left text-xs text-white/80">
          <thead className="sticky top-0 bg-slate-900 text-[11px] uppercase tracking-wide text-white/55">
            <tr>
              <th className="px-3 py-2">系统</th>
              <th className="px-3 py-2">应用内浏览器</th>
              <th className="px-3 py-2">策略</th>
              <th className="px-3 py-2">点击</th>
              <th className="px-3 py-2">打开尝试</th>
              <th className="px-3 py-2">打开成功</th>
              <th className="px-3 py-2">回退打开</th>
              <th className="px-3 py-2">成功率</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-white/50">暂无路由健康数据</td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.key} className="border-t border-white/5 odd:bg-white/[0.02]">
                  <td className="px-3 py-2">{toOsLabel(row.os)}</td>
                  <td className="px-3 py-2">{toBrowserLabel(row.inAppBrowser)}</td>
                  <td className="px-3 py-2">{toStrategyLabel(row.strategy)}</td>
                  <td className="px-3 py-2">{row.click}</td>
                  <td className="px-3 py-2">{row.openAttempt}</td>
                  <td className="px-3 py-2">{row.openSuccess}</td>
                  <td className="px-3 py-2">{row.openFallback}</td>
                  <td className="px-3 py-2 text-emerald-300">{row.openSuccessRatePct}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
