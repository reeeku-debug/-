"use client";

// 依存ライブラリなしの軽量SVGチャート（折れ線・積み上げ縦棒・ドーナツ・横棒）。
// 系列色は媒体ごとに固定（apps.ts）。ホバーでツールチップを表示する。

import { useEffect, useRef, useState } from "react";
import { yen, yenCompact } from "@/lib/revenue/format";

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  values: Array<number | null>;
}

type Formatter = (n: number) => string;

/** サーバーコンポーネントから関数は渡せないため、書式はキーで指定する */
export type FormatKey = "yen" | "yenCompact" | "people";

const FORMATTERS: Record<FormatKey, Formatter> = {
  yen,
  yenCompact,
  people: (n) => `${Math.round(n).toLocaleString("ja-JP")}人`,
};

const INK = "#0b0b0b";
const INK_2 = "#52514e";
const MUTED = "#898781";
const GRID = "#e6e5e0";
const SURFACE = "#ffffff";

function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function Legend({ series }: { series: Array<{ id: string; label: string; color: string }> }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
      {series.map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({
  x,
  y,
  width,
  title,
  rows,
}: {
  x: number;
  y: number;
  width: number;
  title: string;
  rows: Array<{ label: string; value: string; color?: string; bold?: boolean }>;
}) {
  const left = x > width * 0.6 ? undefined : x + 12;
  const right = x > width * 0.6 ? width - x + 12 : undefined;
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[140px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{ top: Math.max(0, y), left, right }}
    >
      <p className="mb-1 font-semibold text-gray-900">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-3 text-gray-600">
          <span className="inline-flex items-center gap-1.5">
            {r.color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className={r.bold ? "font-semibold text-gray-900" : "tabular-nums text-gray-900"}>{r.value}</span>
        </p>
      ))}
    </div>
  );
}

const PAD = { top: 12, right: 16, bottom: 28, left: 64 };

function YAxis({ ticks, y, width, format }: { ticks: number[]; y: (v: number) => number; width: number; format: Formatter }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
          <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={MUTED}>
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

function XLabels({ labels, x, height, every }: { labels: string[]; x: (i: number) => number; height: number; every: number }) {
  return (
    <g>
      {labels.map((l, i) =>
        i % every === 0 || i === labels.length - 1 ? (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={MUTED}>
            {l}
          </text>
        ) : null
      )}
    </g>
  );
}

/** 折れ線グラフ（媒体別の推移比較） */
export function LineChart({
  labels,
  series,
  format: formatKey,
  height = 260,
  ariaLabel,
}: {
  labels: string[];
  series: ChartSeries[];
  format: FormatKey;
  height?: number;
  ariaLabel: string;
}) {
  const format = FORMATTERS[formatKey];
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const innerW = width - PAD.left - PAD.right;
  const step = labels.length > 1 ? innerW / (labels.length - 1) : 0;
  const x = (i: number) => PAD.left + (labels.length > 1 ? i * step : innerW / 2);
  const y = (v: number) => PAD.top + (1 - v / top) * (height - PAD.top - PAD.bottom);
  const every = Math.ceil(labels.length / Math.max(2, Math.floor(innerW / 56)));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = labels.length > 1 ? Math.round(px / step) : 0;
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  };

  return (
    <div>
      <Legend series={series} />
      <div ref={ref} className="relative">
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <YAxis ticks={ticks} y={y} width={width} format={format} />
          <XLabels labels={labels} x={x} height={height} every={every} />
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke={MUTED} strokeWidth={1} />
          )}
          {series.map((s) => {
            let d = "";
            s.values.forEach((v, i) => {
              if (v === null) return;
              d += `${d === "" || s.values[i - 1] === null ? "M" : "L"}${x(i)},${y(v)}`;
            });
            return (
              <g key={s.id}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {s.values.map((v, i) =>
                  v !== null && (i === s.values.length - 1 || i === hover) ? (
                    <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />
                  ) : null
                )}
              </g>
            );
          })}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={Math.max(0, innerW)}
            height={height - PAD.top - PAD.bottom}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover !== null && (
          <Tooltip
            x={x(hover)}
            y={PAD.top}
            width={width}
            title={labels[hover]}
            rows={series.map((s) => ({
              label: s.label,
              color: s.color,
              value: s.values[hover] === null ? "-" : format(s.values[hover] as number),
            }))}
          />
        )}
      </div>
    </div>
  );
}

/** 積み上げ縦棒（媒体別の内訳 + 合計）。系列が1つなら通常の縦棒 */
export function StackedColumns({
  labels,
  series,
  format: formatKey,
  height = 240,
  ariaLabel,
  showTotal = true,
}: {
  labels: string[];
  series: ChartSeries[];
  format: FormatKey;
  height?: number;
  ariaLabel: string;
  showTotal?: boolean;
}) {
  const format = FORMATTERS[formatKey];
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const totals = labels.map((_, i) => series.reduce((s, se) => s + (se.values[i] ?? 0), 0));
  const ticks = niceTicks(Math.max(0, ...totals));
  const top = ticks[ticks.length - 1] || 1;
  const innerW = width - PAD.left - PAD.right;
  const band = innerW / Math.max(1, labels.length);
  const barW = Math.min(24, band * 0.6);
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + (1 - v / top) * (height - PAD.top - PAD.bottom);
  const base = y(0);
  const every = Math.ceil(labels.length / Math.max(2, Math.floor(innerW / 56)));

  return (
    <div>
      <Legend series={series} />
      <div ref={ref} className="relative">
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <YAxis ticks={ticks} y={y} width={width} format={format} />
          <XLabels labels={labels} x={x} height={height} every={every} />
          {labels.map((_, i) => {
            let acc = 0;
            const segs = series
              .map((s) => ({ s, v: s.values[i] ?? 0 }))
              .filter((seg) => seg.v > 0);
            return (
              <g key={i} opacity={hover === null || hover === i ? 1 : 0.55}>
                {segs.map((seg, j) => {
                  const y0 = y(acc);
                  acc += seg.v;
                  const y1 = y(acc);
                  const isTop = j === segs.length - 1;
                  // セグメント間に2pxの隙間を空ける
                  const h = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0));
                  const yTop = y1;
                  const r = isTop ? Math.min(4, h / 2, barW / 2) : 0;
                  const left = x(i) - barW / 2;
                  const d = `M${left},${yTop + h} L${left},${yTop + r} Q${left},${yTop} ${left + r},${yTop} L${left + barW - r},${yTop} Q${left + barW},${yTop} ${left + barW},${yTop + r} L${left + barW},${yTop + h} Z`;
                  return <path key={seg.s.id} d={d} fill={seg.s.color} />;
                })}
                {showTotal && labels.length <= 12 && totals[i] > 0 && hover === i && (
                  <text x={x(i)} y={y(totals[i]) - 6} textAnchor="middle" fontSize={11} fill={INK_2}>
                    {format(totals[i])}
                  </text>
                )}
                <rect
                  x={x(i) - band / 2}
                  y={PAD.top}
                  width={band}
                  height={base - PAD.top}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <Tooltip
            x={x(hover)}
            y={PAD.top}
            width={width}
            title={labels[hover]}
            rows={[
              ...series.map((s) => ({
                label: s.label,
                color: s.color,
                value: format(s.values[hover] ?? 0),
              })),
              ...(series.length > 1 ? [{ label: "合計", value: format(totals[hover]), bold: true }] : []),
            ]}
          />
        )}
      </div>
    </div>
  );
}

/** ドーナツグラフ（構成比） */
export function DonutChart({
  items,
  format: formatKey,
  centerLabel,
  ariaLabel,
}: {
  items: Array<{ id: string; label: string; color: string; value: number }>;
  format: FormatKey;
  centerLabel: string;
  ariaLabel: string;
}) {
  const format = FORMATTERS[formatKey];
  const [hover, setHover] = useState<string | null>(null);
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0);
  const size = 180;
  const r = 78;
  const inner = 52;
  const cx = size / 2;
  const cy = size / 2;
  let angle = -Math.PI / 2;
  const gap = items.filter((i) => i.value > 0).length > 1 ? 0.02 : 0;

  const arcs = items.map((item) => {
    const frac = total > 0 ? Math.max(0, item.value) / total : 0;
    const a0 = angle + gap / 2;
    const a1 = angle + frac * Math.PI * 2 - gap / 2;
    angle += frac * Math.PI * 2;
    if (frac <= 0 || a1 <= a0) return { item, d: "" };
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, ang: number) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
    const d =
      frac >= 0.999
        ? `M${p(r, 0)} A${r},${r} 0 1 1 ${p(r, Math.PI)} A${r},${r} 0 1 1 ${p(r, 0)} M${p(inner, 0)} A${inner},${inner} 0 1 0 ${p(inner, Math.PI)} A${inner},${inner} 0 1 0 ${p(inner, 0)} Z`
        : `M${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} L${p(inner, a1)} A${inner},${inner} 0 ${large} 0 ${p(inner, a0)} Z`;
    return { item, d };
  });
  const focused = items.find((i) => i.id === hover);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <svg width={size} height={size} role="img" aria-label={ariaLabel} className="shrink-0">
        {total === 0 && <circle cx={cx} cy={cy} r={(r + inner) / 2} fill="none" stroke={GRID} strokeWidth={r - inner} />}
        {arcs.map(({ item, d }) =>
          d ? (
            <path
              key={item.id}
              d={d}
              fill={item.color}
              fillRule="evenodd"
              opacity={hover === null || hover === item.id ? 1 : 0.4}
              onPointerEnter={() => setHover(item.id)}
              onPointerLeave={() => setHover(null)}
            />
          ) : null
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill={MUTED}>
          {focused ? focused.label : centerLabel}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={14} fontWeight={600} fill={INK}>
          {focused ? format(focused.value) : format(total)}
        </text>
      </svg>
      <ul className="w-full space-y-2 text-sm">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3"
            onPointerEnter={() => setHover(item.id)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="inline-flex items-center gap-2 text-gray-700">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: item.color }} />
              {item.label}
            </span>
            <span className="whitespace-nowrap tabular-nums text-gray-900">
              <span className="font-semibold">{total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0"}%</span>
              <span className="ml-2 text-xs text-gray-500">{format(item.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 横棒（媒体ごとの生産性比較など、値ラベルは棒の先端） */
export function HorizontalBars({
  items,
  format: formatKey,
  ariaLabel,
}: {
  items: Array<{ id: string; label: string; color: string; value: number | null; note?: string }>;
  format: FormatKey;
  ariaLabel: string;
}) {
  const format = FORMATTERS[formatKey];
  const max = Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <div role="img" aria-label={ariaLabel} className="space-y-3">
      {items.map((item) => {
        const pct = item.value ? (item.value / max) * 100 : 0;
        return (
          <div key={item.id}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="text-gray-700">{item.label}</span>
              {item.note && <span className="text-xs text-gray-400">{item.note}</span>}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 flex-1">
                <div
                  className="h-5 rounded-r"
                  style={{ width: `${Math.max(pct, item.value ? 1 : 0)}%`, background: item.color, maxWidth: "100%" }}
                  title={item.value === null ? "-" : format(item.value)}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-gray-900">
                {item.value === null ? "-" : format(item.value)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
