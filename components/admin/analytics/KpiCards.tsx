import type { SummaryResponse } from './types';

type KpiCardsProps = {
  summary: SummaryResponse | null;
  loading: boolean;
};

function KpiItem({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/75 p-4 shadow-[0_8px_24px_rgba(2,6,23,0.25)]">
      <p className="text-[11px] tracking-wide text-white/60">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      {hint ? <p className="mt-2 text-xs text-emerald-300">{hint}</p> : null}
    </div>
  );
}

export default function KpiCards({ summary, loading }: KpiCardsProps) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-xl bg-slate-800/70" />
        ))}
      </div>
    );
  }

  if (!summary?.totals || !summary?.rates) {
    return (
      <div className="rounded-xl bg-slate-900/75 p-4 text-sm text-white/60 ring-1 ring-white/5">
        请选择艺人或歌曲后查看关键指标。
      </div>
    );
  }

  const { totals, rates, windows } = summary;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <KpiItem label="浏览量" value={totals.view.toLocaleString()} />
      <KpiItem label="点击量" value={totals.click.toLocaleString()} hint={`点击率 ${rates.clickRatePct}%`} />
      <KpiItem label="打开成功" value={totals.openSuccess.toLocaleString()} hint={`成功率 ${rates.openSuccessRatePct}%`} />
      <KpiItem label="合格事件" value={totals.qualified.toLocaleString()} hint={`合格率 ${rates.qualifiedRatePct}%`} />
      <KpiItem label="回退打开" value={totals.openFallback.toLocaleString()} />
      <KpiItem
        label="统计口径"
        value={`${summary.range?.startDate || '-'} → ${summary.range?.endDate || '-'}`}
        hint={`打开成功率起算：${windows?.openSuccessRateStart?.slice(0, 10) || '-'} / 合格率起算：${windows?.qualifiedRateStart?.slice(0, 10) || '-'}`}
      />
    </div>
  );
}
