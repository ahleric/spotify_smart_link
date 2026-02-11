import { CheckCircle2, MousePointerClick, RotateCcw, TrendingUp, View } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SummaryResponse } from './types';

type KpiCardsProps = {
  summary: SummaryResponse | null;
  loading: boolean;
};

type KpiItemProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: 'default' | 'emerald' | 'cyan' | 'amber';
};

function KpiItem({ label, value, hint, icon: Icon, tone = 'default' }: KpiItemProps) {
  const iconToneClass = tone === 'emerald'
    ? 'bg-emerald-500/18 text-emerald-300'
    : tone === 'cyan'
      ? 'bg-cyan-400/16 text-cyan-300'
      : tone === 'amber'
        ? 'bg-amber-400/18 text-amber-200'
        : 'bg-white/10 text-white/82';

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/75 p-3 shadow-[0_10px_28px_rgba(2,6,23,0.3)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-white/72">{label}</p>
        <span className={`rounded-lg p-2 ${iconToneClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-1 text-[30px] font-bold leading-none text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-emerald-300">{hint}</p> : null}
    </div>
  );
}

export default function KpiCards({ summary, loading }: KpiCardsProps) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-[112px] animate-pulse rounded-2xl bg-slate-800/70" />
        ))}
      </div>
    );
  }

  if (!summary?.totals || !summary?.rates) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/75 p-4 text-base text-white/65 ring-1 ring-white/5">
        暂无关键指标数据。
      </div>
    );
  }

  const { totals, rates } = summary;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <KpiItem label="浏览量" value={totals.view.toLocaleString()} icon={View} />
      <KpiItem
        label="点击量"
        value={totals.click.toLocaleString()}
        hint={`点击率 ${rates.clickRatePct}%`}
        icon={MousePointerClick}
        tone="cyan"
      />
      <KpiItem
        label="打开成功"
        value={totals.openSuccess.toLocaleString()}
        hint={`成功率 ${rates.openSuccessRatePct}%`}
        icon={TrendingUp}
        tone="amber"
      />
      <KpiItem
        label="合格事件"
        value={totals.qualified.toLocaleString()}
        hint={`合格率 ${rates.qualifiedRatePct}%`}
        icon={CheckCircle2}
        tone="emerald"
      />
      <KpiItem label="回退打开" value={totals.openFallback.toLocaleString()} icon={RotateCcw} />
    </div>
  );
}
