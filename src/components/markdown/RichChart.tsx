"use client";

import React, { useId, useMemo } from "react";
import JSON5 from "json5";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMarkdownFlowClass } from "./presentation";

export type ChartConfig = {
  type: "bar" | "line" | "pie" | "area" | "radar" | "composed" | "sparkline" | "scatter" | "funnel" | "gauge" | "heatmap" | "waterfall" | "cohort";
  title?: string;
  data: Record<string, string | number>[];
  /** Field used for category labels or the horizontal axis. Defaults to `name`. */
  x?: string;
  /** Field used for the primary numeric series. Defaults to `value`. */
  y?: string;
  keys?: string[];
  colors?: string[];
  lines?: string[];
  bars?: string[];
  areas?: string[];
  max?: number;
};

type TooltipPayloadEntry = { color?: string; name?: string; value?: string | number };

const DEFAULT_COLORS = [
  "var(--mf-chart-1, var(--mf-accent))",
  "var(--mf-chart-2, var(--mf-success))",
  "var(--mf-chart-3, #9a62c7)",
  "var(--mf-chart-4, var(--mf-warning))",
  "var(--mf-chart-5, var(--mf-danger))",
];
const chartHeight = 304;

function uniqueValues(values: readonly string[]) {
  return [...new Set(values)];
}

export function resolveChartFields(config: Pick<ChartConfig, "x" | "y" | "keys" | "bars" | "lines" | "areas">) {
  return {
    xKey: config.x ?? "name",
    seriesKeys: uniqueValues(config.keys?.length ? config.keys : config.y ? [config.y] : ["value"]),
    bars: uniqueValues(config.bars ?? []),
    lines: uniqueValues(config.lines ?? []),
    areas: uniqueValues(config.areas ?? []),
  };
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string | number }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="mf-chart-tooltip">
      <p className="mf-chart-tooltip-label">{label}</p>
      <div className="mf-chart-tooltip-list">
        {payload.map((entry, index) => (
          <div key={`tooltip-entry-${index}`} className="mf-chart-tooltip-entry">
            <span className="mf-chart-swatch" style={{ backgroundColor: entry.color }} />
            <span>{entry.name}</span>
            <span className="mf-chart-tooltip-value">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RichChart({ configStr, config: suppliedConfig }: { configStr?: string; config?: ChartConfig }) {
  const chartId = useId().replace(/:/g, "");
  const className = useMarkdownFlowClass("chart", "mf-block", "mf-chart", "rich-block-frame");
  const fallbackClassName = useMarkdownFlowClass("fallback", "mf-block", "mf-fallback");
  const config = useMemo<ChartConfig | null>(() => {
    try {
      return suppliedConfig ?? JSON5.parse((configStr ?? "").replace(/^`+|`+$/g, "").trim());
    } catch {
      return null;
    }
  }, [configStr, suppliedConfig]);

  if (!config?.data || !config.type) {
    return <div role="alert" className={fallbackClassName}>This chart configuration is incomplete.</div>;
  }

  if (config.data.length === 0) {
    return <section className={fallbackClassName} aria-label={config.title || "Chart"}><p className="mf-block-title">{config.title || "Chart"}</p><p className="mf-block-copy">There are no observations to display yet.</p></section>;
  }

  const { type, title, data, max = 100 } = config;
  // LLM output is untrusted: de-duplicate series names so a repeated field cannot
  // create duplicate React keys, duplicate SVG IDs, or duplicate chart traces.
  const { xKey, seriesKeys: keys, bars: configuredBars, lines: configuredLines, areas: configuredAreas } = resolveChartFields(config);
  const colors = config.colors?.length ? config.colors : DEFAULT_COLORS;
  const bars = configuredBars.length || type !== "composed" ? configuredBars : keys;
  const lines = configuredLines.filter((key) => !bars.includes(key));
  const areas = configuredAreas.filter((key) => !bars.includes(key) && !lines.includes(key));
  const series = type === "pie" || type === "funnel" || type === "gauge"
    ? data.map((item) => String(item[xKey] ?? "value"))
    : type === "composed"
      ? [...bars, ...lines, ...areas]
      : ["bar", "line", "area", "radar"].includes(type)
        ? keys
        : [];
  const axisProps = { tick: { fontSize: 11, fill: "var(--mf-text-subtle)", fontWeight: 500 }, axisLine: false, tickLine: false, tickMargin: 10 };
  const grid = <CartesianGrid strokeDasharray="2 7" vertical={false} stroke="var(--mf-border)" />;
  const chartMargin = { top: 18, right: 12, left: -18, bottom: 2 };
  const gradientId = (key: string, index: number) => `chart-${chartId}-${index}-${key.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const scatterXKey = config.x ?? (keys.includes("x") ? "x" : keys[0] ?? xKey);
  const scatterYKey = config.y ?? keys.find((key) => key !== scatterXKey) ?? "value";

  const renderChart = () => {
    if (type === "sparkline") return (
      <ResponsiveContainer width="100%" height={110}>
        <LineChart data={data} margin={{ top: 10, right: 2, left: 2, bottom: 2 }}><Tooltip cursor={{ stroke: "var(--mf-border-strong)", strokeWidth: 1 }} content={<CustomTooltip />} />{keys.map((key, index) => <Line key={key} type="monotone" dataKey={key} stroke={colors[index % colors.length]} strokeWidth={2.75} dot={false} activeDot={{ r: 4, stroke: "var(--mf-surface)", strokeWidth: 2 }} isAnimationActive={false} />)}</LineChart>
      </ResponsiveContainer>
    );
    if (type === "scatter") return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ScatterChart margin={chartMargin}><CartesianGrid strokeDasharray="2 8" stroke="var(--mf-border)" /><XAxis dataKey={scatterXKey} name={scatterXKey} {...axisProps} type="number" /><YAxis dataKey={scatterYKey} name={scatterYKey} {...axisProps} type="number" /><Tooltip cursor={{ strokeDasharray: "2 6" }} content={<CustomTooltip />} /><Scatter data={data} fill={colors[0]} isAnimationActive={false} /></ScatterChart>
      </ResponsiveContainer>
    );
    if (type === "funnel") {
      const valueKey = keys[0] || "value";
      const values = data.map((item) => Math.max(Number(item[valueKey]) || 0, 0));
      const largest = Math.max(...values, 1);

      return (
        <div className="mf-chart-funnel">
          {data.map((item, index) => {
            const value = values[index];
            const previous = values[index - 1];
            const conversion = index === 0 || previous === 0 ? null : Math.round((value / previous) * 100);
            const width = Math.max((value / largest) * 100, 18);
            const color = colors[index % colors.length];

            return (
              <div key={`funnel-row-${index}`} className="mf-chart-funnel-row">
                <div className="mf-chart-funnel-label"><p className="mf-item-title">{item[xKey]}</p>{conversion !== null && <p className="mf-item-meta">{conversion}% continue</p>}</div>
                <div className="mf-chart-funnel-track">
                  <div className="mf-chart-funnel-value" style={{ width: `${width}%`, backgroundColor: color }} />
                </div>
                <span className="mf-chart-funnel-total">{value.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      );
    }
    if (type === "gauge") {
      const value = Math.min(Math.max(Number(data[0]?.[keys[0]]) || 0, 0), max);
      return <div className="mf-chart-gauge"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ name: "value", value }, { name: "remaining", value: max - value }]} dataKey="value" startAngle={180} endAngle={0} cx="50%" cy="68%" innerRadius="62%" outerRadius="88%" paddingAngle={0} stroke="none" isAnimationActive={false}><Cell fill={colors[0]} /><Cell fill="var(--mf-border)" /></Pie></PieChart></ResponsiveContainer><div className="mf-chart-gauge-label"><p className="mf-chart-gauge-value">{value}</p><p className="mf-item-meta">of {max}</p></div></div>;
    }
    if (type === "heatmap" || type === "cohort") return <div className="mf-chart-heatmap" style={{ gridTemplateColumns: `minmax(4.5rem, 1fr) repeat(${keys.length}, minmax(2.5rem, 1fr))` }}><span />{keys.map((key) => <span key={key} className="mf-chart-heatmap-heading">{key}</span>)}{data.flatMap((row, rowIndex) => [<span key={`label-${rowIndex}`} className="mf-chart-heatmap-label">{row[xKey]}</span>, ...keys.map((key, keyIndex) => { const raw = Number(row[key]) || 0; const opacity = Math.min(Math.max(raw / max, 0.08), 1); return <span key={`${rowIndex}-${keyIndex}`} title={`${row[xKey]} · ${key}: ${raw}`} className="mf-chart-heatmap-cell" style={{ backgroundColor: `color-mix(in srgb, ${colors[0]} ${Math.round(opacity * 100)}%, transparent)` }}>{raw}</span>; })])}</div>;
    if (type === "waterfall") {
      let running = 0;
      const waterfall = data.map((item) => { const amount = Number(item[keys[0]]) || 0; const start = running; running += amount; return { name: String(item[xKey] ?? ""), start, end: running, amount, direction: amount >= 0 ? "gain" : "loss" }; });
      const highest = Math.max(...waterfall.flatMap((item) => [item.start, item.end]), 0);
      const lowest = Math.min(...waterfall.flatMap((item) => [item.start, item.end]), 0);
      const padding = Math.max((highest - lowest) * 0.12, 12);
      const domainMin = lowest - padding;
      const domainMax = highest + padding;
      const height = 248;
      const top = 18;
      const baseline = 34;
      const plotHeight = height - top - baseline;
      const y = (value: number) => top + ((domainMax - value) / (domainMax - domainMin || 1)) * plotHeight;
      const step = 680 / Math.max(waterfall.length, 1);
      const barWidth = Math.min(94, step * 0.58);

      return <div className="mf-chart-waterfall"><svg viewBox={`0 0 720 ${height}`} role="img" aria-label={title || "Waterfall chart"}>{[0.25, 0.5, 0.75].map((fraction) => <line key={fraction} x1="28" x2="704" y1={top + plotHeight * fraction} y2={top + plotHeight * fraction} stroke="var(--mf-border)" strokeDasharray="2 6" />)}{waterfall.map((item, index) => { const x = 42 + index * step; const startY = y(item.start); const endY = y(item.end); const rectY = Math.min(startY, endY); const rectHeight = Math.max(Math.abs(endY - startY), 3); const color = item.direction === "gain" ? colors[0] : "var(--mf-danger)"; return <g key={`waterfall-bar-${index}`} className="mf-chart-waterfall-bar"><title>{`${item.name}: ${item.amount >= 0 ? "+" : ""}${item.amount.toLocaleString()} · total ${item.end.toLocaleString()}`}</title>{index > 0 && <line x1={x - step + barWidth} x2={x} y1={y(waterfall[index - 1].end)} y2={startY} stroke="var(--mf-border-strong)" strokeDasharray="3 3" /> }<rect x={x} y={rectY} width={barWidth} height={rectHeight} rx="7" fill={color} /><text x={x + barWidth / 2} y={rectY - 8} textAnchor="middle" className="mf-chart-waterfall-value">{`${item.amount >= 0 ? "+" : ""}${item.amount}`}</text><text x={x + barWidth / 2} y={height - 8} textAnchor="middle" className="mf-chart-waterfall-label">{String(item.name)}</text></g>; })}</svg></div>;
    }
    if (type === "bar") return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} margin={chartMargin}>
          <defs>{keys.map((key, index) => <linearGradient key={key} id={gradientId(key, index)} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors[index % colors.length]} stopOpacity="0.94" /><stop offset="100%" stopColor={colors[index % colors.length]} stopOpacity="0.62" /></linearGradient>)}</defs>
          {grid}<XAxis dataKey={xKey} {...axisProps} /><YAxis {...axisProps} /><Tooltip cursor={{ fill: "var(--mf-surface-subtle)" }} content={<CustomTooltip />} />
          {keys.map((key, index) => <Bar key={key} dataKey={key} fill={`url(#${gradientId(key, index)})`} radius={[6, 6, 2, 2]} maxBarSize={38} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    );
    if (type === "line") return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <LineChart data={data} margin={chartMargin}>
          {grid}<XAxis dataKey={xKey} {...axisProps} /><YAxis {...axisProps} /><Tooltip cursor={{ stroke: "var(--mf-border-strong)", strokeWidth: 1 }} content={<CustomTooltip />} />
          {keys.map((key, index) => <Line key={key} type="monotone" dataKey={key} stroke={colors[index % colors.length]} strokeWidth={2.75} dot={false} activeDot={{ r: 4.5, strokeWidth: 3, stroke: "var(--mf-surface)", fill: colors[index % colors.length] }} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    );
    if (type === "area") return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <AreaChart data={data} margin={chartMargin}>
          <defs>{keys.map((key, index) => <linearGradient key={key} id={gradientId(key, index)} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors[index % colors.length]} stopOpacity="0.3" /><stop offset="78%" stopColor={colors[index % colors.length]} stopOpacity="0.06" /><stop offset="100%" stopColor={colors[index % colors.length]} stopOpacity="0" /></linearGradient>)}</defs>
          {grid}<XAxis dataKey={xKey} {...axisProps} /><YAxis {...axisProps} /><Tooltip cursor={{ stroke: "var(--mf-border-strong)", strokeWidth: 1 }} content={<CustomTooltip />} />
          {keys.map((key, index) => <Area key={key} type="monotone" dataKey={key} stroke={colors[index % colors.length]} fill={`url(#${gradientId(key, index)})`} strokeWidth={2.75} activeDot={{ r: 4.5 }} isAnimationActive={false} />)}
        </AreaChart>
      </ResponsiveContainer>
    );
    if (type === "radar") return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid stroke="var(--mf-border)" /><PolarAngleAxis dataKey={xKey} tick={{ fill: "var(--mf-text-subtle)", fontSize: 11, fontWeight: 500 }} /><PolarRadiusAxis tick={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          {keys.map((key, index) => <Radar key={key} name={key} dataKey={key} stroke={colors[index % colors.length]} fill={colors[index % colors.length]} fillOpacity={0.16} strokeWidth={2.4} isAnimationActive={false} />)}
        </RadarChart>
      </ResponsiveContainer>
    );
    if (type === "composed") return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart data={data} margin={{ top: 22, right: 2, left: -18, bottom: 2 }} barCategoryGap="38%">
          <defs>{bars.map((key, index) => <linearGradient key={key} id={gradientId(key, index)} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors[index % colors.length]} stopOpacity="0.9" /><stop offset="100%" stopColor={colors[index % colors.length]} stopOpacity="0.48" /></linearGradient>)}</defs>
          {grid}<XAxis dataKey={xKey} {...axisProps} /><YAxis yAxisId="bars" {...axisProps} width={42} /><YAxis yAxisId="lines" orientation="right" tick={{ fontSize: 11, fill: "var(--mf-text-subtle)", fontWeight: 500 }} axisLine={false} tickLine={false} tickMargin={9} width={42} />
          <Tooltip cursor={{ fill: "var(--mf-surface-subtle)" }} content={<CustomTooltip />} />
          {areas.map((key, index) => <Area key={key} yAxisId="lines" type="monotone" dataKey={key} fill={colors[(bars.length + lines.length + index) % colors.length]} fillOpacity={0.09} stroke="none" isAnimationActive={false} />)}
          {bars.map((key, index) => <Bar key={key} yAxisId="bars" dataKey={key} fill={`url(#${gradientId(key, index)})`} radius={[7, 7, 3, 3]} maxBarSize={32} isAnimationActive={false} />)}
          {lines.map((key, index) => <Line key={key} yAxisId="lines" type="monotone" dataKey={key} stroke={colors[(bars.length + index) % colors.length]} strokeWidth={3} dot={{ r: 2.5, fill: "var(--mf-surface)", strokeWidth: 2, stroke: colors[(bars.length + index) % colors.length] }} activeDot={{ r: 5, fill: colors[(bars.length + index) % colors.length], stroke: "var(--mf-surface)", strokeWidth: 3 }} isAnimationActive={false} />)}
        </ComposedChart>
      </ResponsiveContainer>
    );
    const pieKey = keys[0];
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <PieChart><Tooltip content={<CustomTooltip />} /><Pie data={data} dataKey={pieKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={102} innerRadius={74} paddingAngle={2} stroke="var(--mf-surface)" strokeWidth={3} isAnimationActive={false}>{data.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}</Pie></PieChart>
      </ResponsiveContainer>
    );
  };

  const frameSize = type === "sparkline"
    ? "compact"
    : type === "heatmap" || type === "cohort"
      ? "matrix"
      : "standard";

  return (
    <section className={className} aria-label={`${title || "Untitled"} ${type} chart`}>
      <div className="mf-chart-header">
        <div><h3 className="mf-block-title">{title || "Untitled chart"}</h3><p className="mf-item-meta">{data.length} observations</p></div>
        {series.length > 0 && <div className="mf-chart-legend" aria-label="Chart legend">{series.map((name, index) => <span key={`legend-item-${index}`} className="mf-chart-legend-item"><span className="mf-chart-swatch" style={{ backgroundColor: colors[index % colors.length] }} />{name}</span>)}</div>}
      </div>
      <div
        className="internal-scroll mf-chart-viewport"
        data-mf-chart-size={frameSize}
        role="group"
        aria-label={`${title || "Untitled"} ${type} chart plot with ${data.length} observations`}
      >
        <div className="mf-chart-plot">{renderChart()}</div>
      </div>
    </section>
  );
}
