"use client";

import React, { useMemo, useState } from "react";
import JSON5 from "json5";
import { Check, ChevronDown, CircleAlert, CircleCheck, Info, Lightbulb } from "lucide-react";

type BlockType = "callout" | "metrics" | "timeline" | "steps" | "comparison" | "accordion";

type StructuredConfig = {
  title?: string;
  tone?: "note" | "insight" | "success" | "warning";
  body?: string;
  metrics?: { label: string; value: string | number; change?: string; detail?: string }[];
  items?: { date?: string; title: string; description?: string; status?: "complete" | "current" | "upcoming"; meta?: string; open?: boolean; content?: string }[];
  columns?: string[];
  rows?: { label: string; values: (string | boolean | number)[] }[];
};

const toneStyles = {
  note: { icon: Info, accent: "text-[#007aff]", surface: "border-[#007aff]/15 bg-[#f0f7ff]" },
  insight: { icon: Lightbulb, accent: "text-[#af52de]", surface: "border-[#af52de]/15 bg-[#faf5ff]" },
  success: { icon: CircleCheck, accent: "text-[#248a3d]", surface: "border-[#34c759]/18 bg-[#f2fbf3]" },
  warning: { icon: CircleAlert, accent: "text-[#c76a00]", surface: "border-[#ff9f0a]/20 bg-[#fff8ed]" },
};

function InvalidBlock() {
  return <div className="my-8 border-y border-black/[0.08] bg-[#fbfbfd] px-5 py-4 text-sm text-[#6e6e73]">This block needs a valid JSON configuration.</div>;
}

function BlockTitle({ title, eyebrow }: { title?: string; eyebrow?: string }) {
  if (!title) return null;
  return <div className="mb-4"><p className="text-[11px] font-medium text-[#86868b]">{eyebrow}</p><h3 className="mt-1 text-[17px] font-semibold tracking-[-0.025em] text-[#1d1d1f]">{title}</h3></div>;
}

function Callout({ config }: { config: StructuredConfig }) {
  const { title, body, tone = "note" } = config;
  const style = toneStyles[tone];
  const Icon = style.icon;
  return (
    <aside className={`my-8 rounded-2xl border px-5 py-4 sm:px-6 ${style.surface}`}>
      <div className="flex gap-3.5"><Icon className={`mt-0.5 size-[18px] shrink-0 ${style.accent}`} strokeWidth={1.9} aria-hidden="true" />
        <div><p className="text-sm font-semibold tracking-[-0.015em] text-[#1d1d1f]">{title || "Note"}</p>{body && <p className="mt-1.5 text-sm leading-6 text-[#515154]">{body}</p>}</div>
      </div>
    </aside>
  );
}

function Metrics({ config }: { config: StructuredConfig }) {
  if (!config.metrics?.length) return <InvalidBlock />;
  return (
    <section className="my-10 border-y border-black/[0.08] py-5 sm:py-6">
      <BlockTitle title={config.title} eyebrow="Snapshot" />
      <div className="grid gap-px overflow-hidden rounded-2xl border border-black/[0.08] bg-black/[0.08] sm:grid-cols-2 lg:grid-cols-3">
        {config.metrics.map((metric) => <div key={metric.label} className="bg-[#fbfbfd] px-5 py-5"><p className="text-xs font-medium text-[#6e6e73]">{metric.label}</p><p className="mt-2 text-[28px] font-semibold tracking-[-0.045em] text-[#1d1d1f]">{metric.value}</p><div className="mt-2 flex gap-2 text-xs"><span className={metric.change?.startsWith("-") ? "text-[#d70015]" : "text-[#248a3d]"}>{metric.change}</span>{metric.detail && <span className="text-[#86868b]">{metric.detail}</span>}</div></div>)}
      </div>
    </section>
  );
}

function Timeline({ config }: { config: StructuredConfig }) {
  if (!config.items?.length) return <InvalidBlock />;
  return <section className="my-10"><BlockTitle title={config.title} eyebrow="Timeline" /><ol className="relative ml-2 border-l border-black/[0.1] pl-6 sm:pl-8">{config.items.map((item, index) => {
    const state = item.status ?? "upcoming";
    return <li key={`${item.title}-${index}`} className="relative pb-8 last:pb-0"><span className={`absolute -left-[31px] top-1 size-2.5 rounded-full ring-4 ring-white sm:-left-[39px] ${state === "complete" ? "bg-[#34c759]" : state === "current" ? "bg-[#007aff]" : "bg-[#d1d1d6]"}`} /><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="text-sm font-semibold tracking-[-0.015em] text-[#1d1d1f]">{item.title}</h3>{item.date && <span className="text-xs text-[#86868b]">{item.date}</span>}</div>{item.description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#515154]">{item.description}</p>}</li>;
  })}</ol></section>;
}

function Steps({ config }: { config: StructuredConfig }) {
  if (!config.items?.length) return <InvalidBlock />;
  return <section className="my-10"><BlockTitle title={config.title} eyebrow="Process" /><ol className="grid gap-3">{config.items.map((item, index) => <li key={`${item.title}-${index}`} className="flex gap-4 rounded-2xl border border-black/[0.08] bg-[#fbfbfd] p-4 sm:p-5"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#eef5ff] text-xs font-semibold text-[#007aff]">{index + 1}</span><div><h3 className="text-sm font-semibold tracking-[-0.015em] text-[#1d1d1f]">{item.title}</h3>{item.description && <p className="mt-1.5 text-sm leading-6 text-[#515154]">{item.description}</p>}{item.meta && <p className="mt-2 text-xs text-[#86868b]">{item.meta}</p>}</div></li>)}</ol></section>;
}

function Comparison({ config }: { config: StructuredConfig }) {
  if (!config.columns?.length || !config.rows?.length) return <InvalidBlock />;
  return <section className="my-10"><BlockTitle title={config.title} eyebrow="Compare" /><div className="internal-scroll overflow-x-auto rounded-2xl border border-black/[0.08]"><table className="w-full min-w-[34rem] border-collapse text-left"><thead><tr className="border-b border-black/[0.08] bg-[#fbfbfd]"><th className="px-5 py-4 text-xs font-medium text-[#6e6e73]">Feature</th>{config.columns.map((column) => <th key={column} className="px-5 py-4 text-sm font-semibold tracking-[-0.015em] text-[#1d1d1f]">{column}</th>)}</tr></thead><tbody>{config.rows.map((row) => <tr key={row.label} className="border-b border-black/[0.07] last:border-0"><th className="px-5 py-4 text-sm font-medium text-[#515154]">{row.label}</th>{config.columns.map((column, index) => { const value = row.values[index]; return <td key={column} className="px-5 py-4 text-sm text-[#515154]">{value === true ? <Check className="size-4 text-[#248a3d]" strokeWidth={2.4} aria-label="Included" /> : value === false ? <span className="text-[#aeaeb2]">—</span> : value}</td>; })}</tr>)}</tbody></table></div></section>;
}

function Accordion({ config }: { config: StructuredConfig }) {
  const initialOpen = config.items?.findIndex((item) => item.open) ?? -1;
  const [open, setOpen] = useState<number | null>(initialOpen >= 0 ? initialOpen : null);
  if (!config.items?.length) return <InvalidBlock />;
  return <section className="my-10"><BlockTitle title={config.title} eyebrow="Details" /><div className="overflow-hidden rounded-2xl border border-black/[0.08]">{config.items.map((item, index) => { const isOpen = open === index; return <div key={`${item.title}-${index}`} className="border-b border-black/[0.07] last:border-0"><button type="button" onClick={() => setOpen(isOpen ? null : index)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold tracking-[-0.015em] text-[#1d1d1f] transition-colors hover:bg-[#fbfbfd]"><span>{item.title}</span><ChevronDown className={`size-4 shrink-0 text-[#86868b] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} /></button>{isOpen && <div className="px-5 pb-5 text-sm leading-6 text-[#515154]">{item.content || item.description}</div>}</div>; })}</div></section>;
}

export default function RichStructuredBlock({ type, configStr }: { type: BlockType; configStr: string }) {
  const config = useMemo<StructuredConfig | null>(() => { try { return JSON5.parse(configStr.replace(/^`+|`+$/g, "").trim()); } catch { return null; } }, [configStr]);
  if (!config) return <InvalidBlock />;
  if (type === "callout") return <Callout config={config} />;
  if (type === "metrics") return <Metrics config={config} />;
  if (type === "timeline") return <Timeline config={config} />;
  if (type === "steps") return <Steps config={config} />;
  if (type === "comparison") return <Comparison config={config} />;
  return <Accordion config={config} />;
}
