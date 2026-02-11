import type { SummaryResponse } from './types';

type FunnelCardProps = {
  summary: SummaryResponse | null;
  loading: boolean;
};

function pct(next: number, base: number) {
  if (!base) return 0;
  return Number(((next / base) * 100).toFixed(2));
}

export default function FunnelCard({ summary, loading }: FunnelCardProps) {
  if (loading) {
    return <div className="h-56 animate-pulse rounded-xl bg-slate-800/70" />;
  }

  const totals = summary?.totals;
  if (!totals) {
    return (
      <div className="rounded-xl bg-slate-900/75 p-4 text-sm text-white/60 ring-1 ring-white/5">
        暂无漏斗数据。
      </div>
    );
  }

  const steps = [
    { key: 'view', label: '浏览', value: totals.view, width: 100, rate: 100 },
    { key: 'click', label: '点击', value: totals.click, width: pct(totals.click, totals.view), rate: pct(totals.click, totals.view) },
    { key: 'open-success', label: '打开成功', value: totals.openSuccess, width: pct(totals.openSuccess, totals.click), rate: pct(totals.openSuccess, totals.click) },
    { key: 'qualified', label: '合格', value: totals.qualified, width: pct(totals.qualified, totals.click), rate: pct(totals.qualified, totals.click) },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/75 p-4 ring-1 ring-white/5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">转化漏斗</h3>
        <p className="text-xs text-white/60">浏览 → 点击 → 打开成功 → 合格</p>
      </div>
      <div className="space-y-3">
        {steps.map((step) => (
          <div key={step.key} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-white/70">
              <span>{step.label}</span>
              <span>{step.value.toLocaleString()} ({step.rate}%)</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-800">
              <div
                className="h-2.5 rounded-full bg-emerald-400 transition-all"
                style={{ width: `${Math.max(4, Math.min(100, step.width))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
