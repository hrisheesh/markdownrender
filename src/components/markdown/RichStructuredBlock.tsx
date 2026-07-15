"use client";

import React, { useId, useMemo, useState } from "react";
import JSON5 from "json5";
import { Check, ChevronDown, CircleAlert, CircleCheck, File, Folder, Info, Lightbulb, Quote } from "lucide-react";

import { useMarkdownFlowClass } from "./presentation";

type BlockType = "callout" | "metrics" | "timeline" | "steps" | "comparison" | "accordion" | "tabs" | "cards" | "filetree" | "progress" | "checklist" | "status" | "quote";

type StructuredConfig = {
  title?: string;
  eyebrow?: string;
  tone?: "note" | "insight" | "success" | "warning";
  body?: string;
  metrics?: { label: string; value: string | number; change?: string; detail?: string }[];
  items?: { date?: string; title: string; description?: string; status?: "complete" | "current" | "upcoming" | "blocked"; meta?: string; open?: boolean; content?: string; value?: number; total?: number; checked?: boolean }[];
  columns?: string[];
  rows?: { label: string; values: (string | boolean | number)[] }[];
  tabs?: { label: string; title?: string; content: string }[];
  cards?: { title: string; description?: string; meta?: string; eyebrow?: string }[];
  files?: { name: string; type?: "file" | "folder"; detail?: string; depth?: number }[];
  attribution?: string;
  role?: string;
};

const toneIcons = { note: Info, insight: Lightbulb, success: CircleCheck, warning: CircleAlert };

function InvalidBlock() {
  const className = useMarkdownFlowClass("fallback", "mf-block", "mf-fallback");
  return <div role="alert" className={className}>This block needs a valid JSON configuration.</div>;
}

function EmptyBlock({ title }: { title?: string }) {
  const className = useMarkdownFlowClass("fallback", "mf-block", "mf-fallback", "mf-empty");
  return <section className={className}><BlockTitle title={title} /><p className="mf-block-copy">No items were provided for this section.</p></section>;
}

function BlockTitle({ title, eyebrow }: { title?: string; eyebrow?: string }) {
  if (!title) return null;
  return <header className="mf-block-header">{eyebrow && <p className="mf-block-eyebrow">{eyebrow}</p>}<h3 className="mf-block-title">{title}</h3></header>;
}

function Callout({ config }: { config: StructuredConfig }) {
  const { title, body, tone = "note" } = config;
  const Icon = toneIcons[tone];
  const className = useMarkdownFlowClass("callout", "mf-block", "mf-callout");
  return <aside className={className} data-mf-tone={tone}><span className="mf-callout-icon" aria-hidden="true"><Icon /></span><div className="mf-callout-content"><p className="mf-block-title">{title || "Note"}</p>{body && <p className="mf-block-copy">{body}</p>}</div></aside>;
}

function Metrics({ config }: { config: StructuredConfig }) {
  const className = useMarkdownFlowClass("metrics", "mf-block", "mf-metrics-block");
  const metricClassName = useMarkdownFlowClass("metric", "mf-metric");
  if (Array.isArray(config.metrics) && !config.metrics.length) return <EmptyBlock title={config.title} />;
  if (!config.metrics) return <InvalidBlock />;
  return <section className={className}><BlockTitle title={config.title} eyebrow={config.eyebrow} /><div className="mf-metrics">{config.metrics.map((metric, index) => <article key={`metric-${index}`} className={metricClassName}><p className="mf-metric-label">{metric.label}</p><p className="mf-metric-value">{metric.value}</p><div className="mf-metric-meta"><span className="mf-metric-change" data-mf-trend={metric.change?.startsWith("-") ? "down" : "up"}>{metric.change}</span>{metric.detail && <span className="mf-metric-detail">{metric.detail}</span>}</div></article>)}</div></section>;
}

function Timeline({ config }: { config: StructuredConfig }) {
  const className = useMarkdownFlowClass("timeline", "mf-block", "mf-timeline");
  if (Array.isArray(config.items) && !config.items.length) return <EmptyBlock title={config.title} />;
  if (!config.items) return <InvalidBlock />;
  return <section className={className}><BlockTitle title={config.title} eyebrow={config.eyebrow} /><ol className="mf-timeline-list">{config.items.map((item, index) => <li key={`timeline-item-${index}`} className="mf-timeline-item" data-mf-state={item.status ?? "upcoming"}><span className="mf-timeline-marker" aria-hidden="true" /><div className="mf-timeline-content"><div className="mf-timeline-heading"><h3 className="mf-item-title">{item.title}</h3>{item.date && <time className="mf-item-meta">{item.date}</time>}</div>{item.description && <p className="mf-block-copy">{item.description}</p>}</div></li>)}</ol></section>;
}

function Steps({ config }: { config: StructuredConfig }) {
  const className = useMarkdownFlowClass("step", "mf-block", "mf-steps");
  if (Array.isArray(config.items) && !config.items.length) return <EmptyBlock title={config.title} />;
  if (!config.items) return <InvalidBlock />;
  return <section className={className}><BlockTitle title={config.title} eyebrow={config.eyebrow} /><ol className="mf-steps-list">{config.items.map((item, index) => <li key={`step-${index}`} className="mf-step"><span className="mf-step-number">{String(index + 1).padStart(2, "0")}</span><div className="mf-step-content"><h3 className="mf-item-title">{item.title}</h3>{item.description && <p className="mf-block-copy">{item.description}</p>}{item.meta && <p className="mf-item-meta">{item.meta}</p>}</div></li>)}</ol></section>;
}

function Comparison({ config }: { config: StructuredConfig }) {
  const className = useMarkdownFlowClass("comparison", "mf-block", "mf-comparison");
  const tableClassName = useMarkdownFlowClass("table", "mf-table", "mf-comparison-table");
  const { columns, rows } = config;
  if ((Array.isArray(columns) && !columns.length) || (Array.isArray(rows) && !rows.length)) return <EmptyBlock title={config.title} />;
  if (!columns || !rows) return <InvalidBlock />;
  return <section className={className}><BlockTitle title={config.title} eyebrow={config.eyebrow} /><div className="internal-scroll mf-table-scroll"><table className={tableClassName}><thead className="mf-table-head"><tr className="mf-table-row"><th className="mf-table-header-cell">Feature</th>{columns.map((column, index) => <th key={`comparison-header-${index}`} className="mf-table-header-cell">{column}</th>)}</tr></thead><tbody className="mf-table-body">{rows.map((row, rowIndex) => <tr key={`comparison-row-${rowIndex}`} className="mf-table-row"><th className="mf-table-header-cell">{row.label}</th>{columns.map((_, columnIndex) => { const value = row.values[columnIndex]; return <td key={`comparison-cell-${rowIndex}-${columnIndex}`} className="mf-table-cell">{value === true ? <Check className="mf-included" aria-label="Included" /> : value === false ? <span className="mf-not-included">—</span> : value}</td>; })}</tr>)}</tbody></table></div></section>;
}

function Accordion({ config }: { config: StructuredConfig }) {
  const initialOpen = config.items?.findIndex((item) => item.open) ?? -1;
  const [open, setOpen] = useState<number | null>(initialOpen >= 0 ? initialOpen : null);
  const accordionId = useId().replace(/:/g, "");
  const className = useMarkdownFlowClass("accordion", "mf-block", "mf-accordion");
  if (Array.isArray(config.items) && !config.items.length) return <EmptyBlock title={config.title} />;
  if (!config.items) return <InvalidBlock />;
  return <section className={className}><BlockTitle title={config.title} eyebrow={config.eyebrow} />{config.items.map((item, index) => { const isOpen = open === index; const panelId = `${accordionId}-panel-${index}`; return <div key={`accordion-item-${index}`} className="mf-accordion-item"><button type="button" onClick={() => setOpen(isOpen ? null : index)} aria-expanded={isOpen} aria-controls={panelId} className="mf-accordion-trigger"><span>{item.title}</span><ChevronDown className="mf-accordion-icon" aria-hidden="true" /></button>{isOpen && <div id={panelId} role="region" aria-label={item.title} className="mf-accordion-panel">{item.content || item.description}</div>}</div>; })}</section>;
}

function Tabs({ config }: { config: StructuredConfig }) {
  const [active, setActive] = useState(0);
  const tabsId = useId().replace(/:/g, "");
  const className = useMarkdownFlowClass("tabs", "mf-block", "mf-tabs");
  if (Array.isArray(config.tabs) && !config.tabs.length) return <EmptyBlock title={config.title} />;
  if (!config.tabs) return <InvalidBlock />;
  const selected = config.tabs[Math.min(active, config.tabs.length - 1)];
  return <section className={className}><BlockTitle title={config.title} eyebrow={config.eyebrow} /><div className="mf-tabs-surface"><div className="internal-scroll mf-tabs-list" role="tablist" aria-label={config.title || "Content tabs"}>{config.tabs.map((tab, index) => <button key={`tab-${index}`} id={`${tabsId}-tab-${index}`} type="button" role="tab" aria-selected={active === index} aria-controls={`${tabsId}-panel-${index}`} tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)} className="mf-tab">{tab.label}</button>)}</div><div id={`${tabsId}-panel-${active}`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${active}`} className="mf-tab-panel"><p className="mf-block-copy">{selected.content}</p></div></div></section>;
}

function Cards({ config }: { config: StructuredConfig }) {
  const className = useMarkdownFlowClass("cards", "mf-block", "mf-cards");
  if (Array.isArray(config.cards) && !config.cards.length) return <EmptyBlock title={config.title} />;
  if (!config.cards) return <InvalidBlock />;
  return <section className={className}><BlockTitle title={config.title} eyebrow={config.eyebrow} /><div className="mf-cards-grid">{config.cards.map((card, index) => <article key={`card-${index}`} className="mf-card">{card.eyebrow && <p className="mf-block-eyebrow">{card.eyebrow}</p>}<h3 className="mf-item-title">{card.title}</h3>{card.description && <p className="mf-block-copy">{card.description}</p>}{card.meta && <p className="mf-item-meta">{card.meta}</p>}</article>)}</div></section>;
}

function FileTree({ config }: { config: StructuredConfig }) {
  const className = useMarkdownFlowClass("fileTree", "mf-block", "mf-file-tree");
  if (Array.isArray(config.files) && !config.files.length) return <EmptyBlock title={config.title} />;
  if (!config.files) return <InvalidBlock />;
  return <section className={className}><BlockTitle title={config.title} eyebrow={config.eyebrow} /><div className="mf-file-list">{config.files.map((entry, index) => { const isFolder = entry.type === "folder"; const Icon = isFolder ? Folder : File; return <div key={`file-entry-${index}`} className="mf-file-entry" data-mf-depth={Math.max(entry.depth || 0, 0)}><Icon className="mf-file-icon" aria-hidden="true" /><span className="mf-file-name">{entry.name}</span>{entry.detail && <span className="mf-item-meta">{entry.detail}</span>}</div>; })}</div></section>;
}

function Progress({ config }: { config: StructuredConfig }) {
  const className = useMarkdownFlowClass("progress", "mf-block", "mf-progress");
  if (Array.isArray(config.items) && !config.items.length) return <EmptyBlock title={config.title} />;
  if (!config.items) return <InvalidBlock />;
  return <section className={className}><BlockTitle title={config.title} eyebrow={config.eyebrow} /><div className="mf-progress-list">{config.items.map((item, index) => { const total = item.total || 100; const value = Math.min(Math.max(item.value || 0, 0), total); const percentage = Math.round((value / total) * 100); return <div key={`progress-item-${index}`} className="mf-progress-item"><div className="mf-progress-heading"><span className="mf-item-title">{item.title}</span><span className="mf-item-meta">{item.meta || `${percentage}%`}</span></div><div role="progressbar" aria-label={item.title} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} className="mf-progress-track"><div className="mf-progress-value" style={{ "--mf-progress-value": `${percentage}%` } as React.CSSProperties} /></div>{item.description && <p className="mf-block-copy">{item.description}</p>}</div>; })}</div></section>;
}

function Checklist({ config }: { config: StructuredConfig }) {
  const className = useMarkdownFlowClass("checklist", "mf-block", "mf-checklist");
  if (Array.isArray(config.items) && !config.items.length) return <EmptyBlock title={config.title} />;
  if (!config.items) return <InvalidBlock />;
  return <section className={className}><BlockTitle title={config.title} eyebrow={config.eyebrow} /><ul className="mf-checklist-list">{config.items.map((item, index) => <li key={`checklist-item-${index}`} className="mf-checklist-item" data-mf-checked={item.checked || undefined}><span className="mf-checklist-control">{item.checked && <Check aria-hidden="true" />}</span><div className="mf-checklist-content"><p className="mf-item-title">{item.title}</p>{item.description && <p className="mf-block-copy">{item.description}</p>}</div></li>)}</ul></section>;
}

function Status({ config }: { config: StructuredConfig }) {
  const className = useMarkdownFlowClass("status", "mf-block", "mf-status");
  if (Array.isArray(config.items) && !config.items.length) return <EmptyBlock title={config.title} />;
  if (!config.items) return <InvalidBlock />;
  return <section className={className}><BlockTitle title={config.title} eyebrow={config.eyebrow} /><div className="mf-status-grid">{config.items.map((item, index) => <article key={`status-item-${index}`} className="mf-status-item" data-mf-state={item.status || "upcoming"}><div className="mf-status-heading"><span className="mf-status-dot" aria-hidden="true" /><h3 className="mf-item-title">{item.title}</h3></div>{item.description && <p className="mf-block-copy">{item.description}</p>}{item.meta && <p className="mf-item-meta">{item.meta}</p>}</article>)}</div></section>;
}

function PullQuote({ config }: { config: StructuredConfig }) {
  const className = useMarkdownFlowClass("quote", "mf-block", "mf-quote");
  if (!config.body) return <InvalidBlock />;
  return <figure className={className}><Quote className="mf-quote-icon" aria-hidden="true" /><blockquote className="mf-quote-body">“{config.body}”</blockquote>{config.attribution && <figcaption className="mf-quote-attribution">{config.attribution}{config.role && <span> · {config.role}</span>}</figcaption>}</figure>;
}

export default function RichStructuredBlock({ type, configStr }: { type: BlockType; configStr: string }) {
  const config = useMemo<StructuredConfig | null>(() => { try { return JSON5.parse(configStr.replace(/^`+|`+$/g, "").trim()); } catch { return null; } }, [configStr]);
  if (!config) return <InvalidBlock />;
  if (type === "callout") return <Callout config={config} />;
  if (type === "metrics") return <Metrics config={config} />;
  if (type === "timeline") return <Timeline config={config} />;
  if (type === "steps") return <Steps config={config} />;
  if (type === "comparison") return <Comparison config={config} />;
  if (type === "accordion") return <Accordion config={config} />;
  if (type === "tabs") return <Tabs config={config} />;
  if (type === "cards") return <Cards config={config} />;
  if (type === "filetree") return <FileTree config={config} />;
  if (type === "progress") return <Progress config={config} />;
  if (type === "checklist") return <Checklist config={config} />;
  if (type === "status") return <Status config={config} />;
  return <PullQuote config={config} />;
}
