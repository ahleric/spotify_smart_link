'use client';

import { useState } from 'react';
import type { TimeseriesResponse } from './types';

type TrendChartProps = {
  data: TimeseriesResponse | null;
  loading: boolean;
};

type Point = {
  x: number;
  y: number;
};

const WIDTH = 760;
const HEIGHT = 292;
const PADDING_X = 38;
const PADDING_Y = 24;
const X_AXIS_LABEL_SPACE = 34;
const CHART_BOTTOM = HEIGHT - PADDING_Y - X_AXIS_LABEL_SPACE;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatCompact(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${value}`;
}

function seriesPointX(index: number, total: number) {
  if (total <= 1) return PADDING_X;
  const step = (WIDTH - PADDING_X * 2) / (total - 1);
  return PADDING_X + index * step;
}

function buildPoints(values: number[], maxValue: number) {
  const safeMax = Math.max(maxValue, 1);
  const usableHeight = CHART_BOTTOM - PADDING_Y;
  return values.map((value, index) => ({
    x: seriesPointX(index, values.length),
    y: CHART_BOTTOM - (value / safeMax) * usableHeight,
  }));
}

// Slightly smoothed line using Catmull-Rom to Bezier conversion.
function buildCurvedPath(points: Point[], minY: number, maxY: number) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const smoothness = 0.82;
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = index > 0 ? points[index - 1] : points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = index !== points.length - 2 ? points[index + 2] : p2;

    const cp1x = p1.x + ((p2.x - p0.x) / 6) * smoothness;
    const cp1y = clamp(p1.y + ((p2.y - p0.y) / 6) * smoothness, minY, maxY);
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * smoothness;
    const cp2y = clamp(p2.y - ((p3.y - p1.y) / 6) * smoothness, minY, maxY);

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return path;
}

function SeriesLine({ values, color, maxValue }: { values: number[]; color: string; maxValue: number }) {
  const points = buildPoints(values, maxValue);
  const path = buildCurvedPath(points, PADDING_Y, CHART_BOTTOM);
  return <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />;
}

function DashedSeriesLine({ values, color, maxValue }: { values: number[]; color: string; maxValue: number }) {
  const points = buildPoints(values, maxValue);
  const path = buildCurvedPath(points, PADDING_Y, CHART_BOTTOM);
  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray="6 4"
    />
  );
}

export default function TrendChart({ data, loading }: TrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  if (loading) {
    return <div className="h-72 animate-pulse rounded-xl bg-slate-800/70" />;
  }

  const series = data?.series || [];
  if (series.length === 0) {
    return (
      <div className="rounded-xl bg-slate-900/75 p-4 text-sm text-white/60">
        暂无趋势数据。
      </div>
    );
  }

  const viewValues = series.map((d) => d.view);
  const clickValues = series.map((d) => d.click);
  const openValues = series.map((d) => d.openSuccess);
  const qualifiedValues = series.map((d) => d.qualified);
  const isDenseXAxis = series.length > 16;
  const maxValue = Math.max(...viewValues, ...clickValues, ...openValues, ...qualifiedValues, 1);
  const tickValues = [maxValue, Math.round(maxValue / 2), 0];
  const hovered = hoverIndex !== null ? series[hoverIndex] : null;

  const tooltipLayout = (() => {
    if (hoverIndex === null) return null;
    const x = seriesPointX(hoverIndex, series.length);
    const width = 228;
    const height = 140;
    const preferredX = x + 10;
    const fallbackX = x - width - 10;
    const safeRight = WIDTH - PADDING_X;
    const finalX = preferredX + width > safeRight ? Math.max(PADDING_X + 2, fallbackX) : preferredX;
    const finalY = PADDING_Y + 6;
    return { x, tooltipX: finalX, tooltipY: finalY, width, height };
  })();

  return (
    <div className="h-[372px] rounded-xl border border-white/10 bg-slate-900/75 p-3.5 flex flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-white">每日趋势（统一坐标）</h3>
        <div className="flex flex-wrap items-center gap-3 text-sm text-white/75">
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-slate-300" />浏览</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-cyan-400" />点击</span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            打开成功
          </span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-spotify-400" />合格</span>
        </div>
      </div>
      <div className="w-full overflow-hidden flex-1">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block h-full w-full"
          role="img"
          aria-label="事件趋势图"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="transparent" />

          {tickValues.map((tick) => {
            const y = CHART_BOTTOM - (tick / Math.max(maxValue, 1)) * (CHART_BOTTOM - PADDING_Y);
            return (
              <g key={tick}>
                <line
                  x1={PADDING_X}
                  y1={y}
                  x2={WIDTH - PADDING_X}
                  y2={y}
                  stroke="rgba(255,255,255,0.16)"
                  strokeDasharray={tick === 0 ? undefined : '3 4'}
                />
                <text x={6} y={y + 4} fill="rgba(255,255,255,0.62)" fontSize={12}>
                  {formatCompact(tick)}
                </text>
              </g>
            );
          })}

          <line x1={PADDING_X} y1={PADDING_Y} x2={PADDING_X} y2={CHART_BOTTOM} stroke="rgba(255,255,255,0.2)" />
          <line x1={PADDING_X} y1={CHART_BOTTOM} x2={WIDTH - PADDING_X} y2={CHART_BOTTOM} stroke="rgba(255,255,255,0.22)" />
          <SeriesLine values={viewValues} color="#cbd5e1" maxValue={maxValue} />
          <SeriesLine values={clickValues} color="#22d3ee" maxValue={maxValue} />
          <SeriesLine values={qualifiedValues} color="#1DB954" maxValue={maxValue} />
          <DashedSeriesLine values={openValues} color="#fcd34d" maxValue={maxValue} />

          {series.map((item, index) => {
            const x = seriesPointX(index, series.length);
            const dayLabel = item.day.slice(5);
            return (
              <g key={`x-tick-${item.day}`}>
                <circle cx={x} cy={CHART_BOTTOM} r={2} fill="rgba(255,255,255,0.55)" />
                <text
                  x={x}
                  y={CHART_BOTTOM + (isDenseXAxis ? 18 : 16)}
                  fill="rgba(255,255,255,0.68)"
                  fontSize={11}
                  textAnchor={isDenseXAxis ? 'end' : 'middle'}
                  transform={isDenseXAxis ? `rotate(-38 ${x} ${CHART_BOTTOM + 18})` : undefined}
                >
                  {dayLabel}
                </text>
              </g>
            );
          })}

          {series.map((item, index) => {
            const left = index === 0
              ? PADDING_X
              : (seriesPointX(index - 1, series.length) + seriesPointX(index, series.length)) / 2;
            const right = index === series.length - 1
              ? WIDTH - PADDING_X
              : (seriesPointX(index, series.length) + seriesPointX(index + 1, series.length)) / 2;
            return (
              <rect
                key={`hover-zone-${item.day}`}
                x={left}
                y={PADDING_Y}
                width={Math.max(1, right - left)}
                height={CHART_BOTTOM - PADDING_Y}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(index)}
                onMouseMove={() => setHoverIndex(index)}
              />
            );
          })}

          {hovered && tooltipLayout ? (
            <g>
              <line
                x1={tooltipLayout.x}
                y1={PADDING_Y}
                x2={tooltipLayout.x}
                y2={CHART_BOTTOM}
                stroke="rgba(255,255,255,0.35)"
                strokeDasharray="4 4"
              />
              <rect
                x={tooltipLayout.tooltipX}
                y={tooltipLayout.tooltipY}
                rx={9}
                ry={9}
                width={tooltipLayout.width}
                height={tooltipLayout.height}
                fill="rgba(2,6,23,0.94)"
                stroke="rgba(148,163,184,0.45)"
              />
              <text
                x={tooltipLayout.tooltipX + 10}
                y={tooltipLayout.tooltipY + 18}
                fill="rgba(255,255,255,0.9)"
                fontSize={13}
                fontWeight="600"
              >
                日期：{hovered.day.slice(5)}
              </text>
              {[
                { label: '浏览', color: '#cbd5e1', value: hovered.view },
                { label: '点击', color: '#22d3ee', value: hovered.click },
                { label: '打开成功', color: '#fcd34d', value: hovered.openSuccess },
                { label: '合格', color: '#1DB954', value: hovered.qualified },
              ].map((line, index) => (
                <g key={line.label}>
                  <circle
                    cx={tooltipLayout.tooltipX + 12}
                    cy={tooltipLayout.tooltipY + 42 + index * 22}
                    r={4}
                    fill={line.color}
                  />
                  <text
                    x={tooltipLayout.tooltipX + 22}
                    y={tooltipLayout.tooltipY + 47 + index * 22}
                    fill="rgba(255,255,255,0.86)"
                    fontSize={12.5}
                  >
                    {line.label}：{line.value.toLocaleString()}
                  </text>
                </g>
              ))}
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
}
