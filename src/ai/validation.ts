import {
  DEFAULT_MARKDOWN_FLOW_RENDER_POLICY,
  isMarkdownFlowBlockType,
  type MarkdownFlowBlockType,
  type MarkdownFlowRenderPolicy,
} from "./protocol";
import JSON5 from "json5";

export type MarkdownFlowBlockValidationResult =
  | { valid: true }
  | { valid: false; reason: string; classification: "invalid" | "unsafe" };

export type MarkdownFlowNormalizationClassification = "exact" | "compatible" | "fallback" | "unsafe";

export type MarkdownFlowReadableFallback =
  | { kind: "source"; source: string }
  | { kind: "text"; lines: readonly string[] }
  | { kind: "list"; ordered: boolean; items: readonly string[] }
  | { kind: "sections"; sections: readonly { title: string; content?: string }[] }
  | { kind: "table"; columns: readonly string[]; rows: readonly (readonly (string | number | boolean)[])[] };

export type MarkdownFlowValidationMode = "normalize" | "strict";

export interface MarkdownFlowBlockValidationOptions {
  /** Accept harmless, documented block-language aliases. Defaults to `normalize`. */
  normalization?: MarkdownFlowValidationMode;
}

export interface MarkdownFlowNormalizedBlock {
  language: MarkdownFlowBlockType;
  code: string;
  normalized: boolean;
  /** Confidence that the canonical value preserves the model's intent. */
  confidence: number;
  /** Human-readable compatibility repairs applied in normalize mode. */
  transformations: readonly string[];
  /** Whether this block is exact, compatible, better rendered as fallback, or unsafe. */
  classification: MarkdownFlowNormalizationClassification;
  /** Readable content retained when rich rendering is not reliable. */
  fallback?: MarkdownFlowReadableFallback;
  /** True only for an actual security or policy boundary, never a schema mismatch. */
  unsafe?: boolean;
}

type JsonRecord = Record<string, unknown>;

const structuredTypes = new Set<MarkdownFlowBlockType>([
  "callout", "metrics", "timeline", "steps", "comparison", "accordion", "tabs", "cards", "filetree", "progress", "checklist", "status", "quote",
]);

const chartTypes = new Set(["bar", "line", "pie", "area", "radar", "composed", "sparkline", "scatter", "funnel", "gauge", "heatmap", "waterfall", "cohort"]);
const tones = new Set(["note", "insight", "success", "warning"]);
const itemStatuses = new Set(["complete", "current", "upcoming", "blocked"]);
const languageAliases: Readonly<Record<string, MarkdownFlowBlockType>> = {
  mermaidjs: "mermaid",
  "mermaid-js": "mermaid",
  alert: "callout",
  notice: "callout",
  stats: "metrics",
  statistics: "metrics",
  milestones: "timeline",
  stepper: "steps",
  compare: "comparison",
  faq: "accordion",
  tabbed: "tabs",
  cardgrid: "cards",
  "card-grid": "cards",
  tree: "filetree",
  "file-tree": "filetree",
  tasks: "checklist",
  blockquote: "quote",
  graph: "chart",
  diagram: "mermaid",
  gallery: "image",
};

function normalizeLanguage(language: string, options: MarkdownFlowBlockValidationOptions): MarkdownFlowBlockType | undefined {
  if (isMarkdownFlowBlockType(language)) return language;
  if (options.normalization === "strict") return undefined;

  const normalized = language.toLowerCase();
  return isMarkdownFlowBlockType(normalized) ? normalized : languageAliases[normalized];
}

function mergePolicy(policy?: MarkdownFlowRenderPolicy): Required<MarkdownFlowRenderPolicy> {
  return { ...DEFAULT_MARKDOWN_FLOW_RENDER_POLICY, ...policy };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renameKey(value: JsonRecord, from: string, to: string): boolean {
  if (!(from in value) || to in value) return false;
  value[to] = value[from];
  delete value[from];
  return true;
}

function firstDefined(value: JsonRecord, keys: readonly string[]): unknown {
  for (const key of keys) if (value[key] !== undefined) return value[key];
  return undefined;
}

function moveFirst(value: JsonRecord, to: string, aliases: readonly string[]): boolean {
  if (value[to] !== undefined) return false;
  const from = aliases.find((key) => value[key] !== undefined);
  if (!from) return false;
  value[to] = value[from];
  if (from !== to) delete value[from];
  return true;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "yes" || value === 1) return true;
  if (value === "false" || value === "no" || value === 0) return false;
  return undefined;
}

function keepKeys(value: JsonRecord, allowed: readonly string[]): boolean {
  let changed = false;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      delete value[key];
      changed = true;
    }
  }
  return changed;
}

function hasUnsafeObjectKeys(value: unknown, depth = 0): boolean {
  if (depth > 12 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasUnsafeObjectKeys(item, depth + 1));
  return Object.entries(value as JsonRecord).some(([key, child]) =>
    key === "__proto__"
    || key === "prototype"
    || key === "constructor"
    || /^on[a-z]/i.test(key)
    || hasUnsafeObjectKeys(child, depth + 1));
}

function hasUnsafeUrlValues(value: unknown, depth = 0): boolean {
  if (depth > 12 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasUnsafeUrlValues(item, depth + 1));
  return Object.entries(value as JsonRecord).some(([key, child]) => {
    if (["url", "src", "href", "link"].includes(key.toLowerCase()) && typeof child === "string" && !/^https?:\/\//.test(child)) return true;
    return hasUnsafeUrlValues(child, depth + 1);
  });
}

function normalizeObjectArray(
  source: unknown,
  normalize: (value: unknown, index: number) => JsonRecord | undefined,
): { values: JsonRecord[]; changed: boolean } | undefined {
  if (!Array.isArray(source)) return undefined;
  const values = source.map(normalize).filter((value): value is JsonRecord => Boolean(value));
  return { values, changed: values.length !== source.length || values.some((value, index) => JSON.stringify(value) !== JSON.stringify(source[index])) };
}

function normalizeItem(value: unknown, index: number): JsonRecord | undefined {
  if (!isRecord(value)) {
    const title = stringValue(value);
    return title ? { title } : undefined;
  }
  const item = { ...value };
  moveFirst(item, "title", ["label", "name", "heading", "headline", "text"]);
  moveFirst(item, "description", ["summary", "detail", "details", "body"]);
  moveFirst(item, "meta", ["subtitle", "caption"]);
  moveFirst(item, "status", ["state"]);
  moveFirst(item, "checked", ["completed", "done", "complete"]);
  moveFirst(item, "date", ["time", "when", "period", "timestamp"]);
  moveFirst(item, "value", ["current", "amount", "progress", "percent", "percentage"]);
  moveFirst(item, "total", ["maximum", "max", "target"]);
  const title = stringValue(item.title) ?? stringValue(item.content) ?? stringValue(item.description) ?? `Item ${index + 1}`;
  const normalized: JsonRecord = { ...item, title };
  for (const key of ["date", "description", "status", "meta", "content"]) {
    const text = stringValue(normalized[key]);
    if (text !== undefined) normalized[key] = text;
    else delete normalized[key];
  }
  if (typeof normalized.status === "string") {
    const statusAliases: Readonly<Record<string, string>> = {
      done: "complete", completed: "complete", finished: "complete",
      active: "current", "in-progress": "current", "in_progress": "current",
      pending: "upcoming", planned: "upcoming", queued: "upcoming",
      failed: "blocked", error: "blocked",
    };
    normalized.status = statusAliases[normalized.status.toLowerCase()] ?? normalized.status.toLowerCase();
  }
  for (const key of ["value", "total"]) {
    const number = numberValue(normalized[key]);
    if (number !== undefined) normalized[key] = number;
    else delete normalized[key];
  }
  for (const key of ["open", "checked"]) {
    const bool = booleanValue(normalized[key]);
    if (bool !== undefined) normalized[key] = bool;
    else delete normalized[key];
  }
  keepKeys(normalized, ["date", "title", "description", "status", "meta", "open", "content", "value", "total", "checked"]);
  return normalized;
}

function normalizeStructuredArray(type: MarkdownFlowBlockType, config: JsonRecord): boolean {
  let changed = false;
  const itemTypes = ["timeline", "steps", "accordion", "progress", "checklist", "status"];
  if (itemTypes.includes(type)) {
    changed = moveFirst(config, "items", ["milestones", "events", "steps", "tasks", "services", "sections", "panels", "entries", "nodes", "features", "recommendations", "data"]) || changed;
    const result = normalizeObjectArray(config.items, normalizeItem);
    if (result) { config.items = result.values; changed = result.changed || changed; }
    if (type === "checklist" && Array.isArray(config.items)) {
      for (const item of config.items) {
        if (isRecord(item) && item.checked === undefined && item.status === "complete") { item.checked = true; changed = true; }
      }
    }
  }
  if (type === "metrics") {
    changed = moveFirst(config, "metrics", ["items", "stats", "statistics", "facts", "kpis", "data", "values"]) || changed;
    if (isRecord(config.metrics)) {
      config.metrics = Object.entries(config.metrics).map(([label, value]) => ({ label, value }));
      changed = true;
    }
    const result = normalizeObjectArray(config.metrics, (value, index) => {
      if (!isRecord(value)) return { label: `Metric ${index + 1}`, value: stringValue(value) ?? "" };
      const metric = { ...value };
      moveFirst(metric, "label", ["name", "title", "heading", "key"]);
      moveFirst(metric, "value", ["amount", "count", "number", "total"]);
      moveFirst(metric, "change", ["delta", "trend", "difference"]);
      moveFirst(metric, "detail", ["description", "details", "summary", "subtitle", "caption"]);
      metric.label = stringValue(metric.label) ?? `Metric ${index + 1}`;
      metric.value = typeof metric.value === "number" ? metric.value : stringValue(metric.value) ?? "";
      for (const key of ["change", "detail"]) {
        const text = stringValue(metric[key]);
        if (text !== undefined) metric[key] = text;
        else delete metric[key];
      }
      keepKeys(metric, ["label", "value", "change", "detail"]);
      return metric;
    });
    if (result) { config.metrics = result.values; changed = result.changed || changed; }
  }
  if (type === "tabs") {
    changed = moveFirst(config, "tabs", ["items", "sections", "panels", "views", "options", "data"]) || changed;
    const result = normalizeObjectArray(config.tabs, (value, index) => {
      if (!isRecord(value)) return { label: `Tab ${index + 1}`, content: stringValue(value) ?? "" };
      const tab = { ...value };
      moveFirst(tab, "label", ["name", "title", "heading"]);
      moveFirst(tab, "content", ["body", "description", "details", "summary", "text", "value"]);
      tab.label = stringValue(tab.label) ?? `Tab ${index + 1}`;
      tab.content = stringValue(tab.content) ?? stringValue(tab.title) ?? "";
      if (tab.title !== undefined) tab.title = stringValue(tab.title);
      keepKeys(tab, ["label", "title", "content"]);
      return tab;
    });
    if (result) { config.tabs = result.values; changed = result.changed || changed; }
  }
  if (type === "cards") {
    changed = moveFirst(config, "cards", ["items", "features", "recommendations", "results", "entries", "options", "data"]) || changed;
    const result = normalizeObjectArray(config.cards, (value, index) => {
      if (!isRecord(value)) return { title: stringValue(value) ?? `Card ${index + 1}` };
      const card = { ...value };
      moveFirst(card, "title", ["label", "name", "heading", "headline"]);
      moveFirst(card, "description", ["body", "content", "summary", "details", "text"]);
      moveFirst(card, "meta", ["subtitle", "caption", "footer"]);
      moveFirst(card, "eyebrow", ["category", "tag", "kicker"]);
      card.title = stringValue(card.title) ?? stringValue(card.description) ?? `Card ${index + 1}`;
      for (const key of ["description", "meta", "eyebrow"]) {
        const text = stringValue(card[key]);
        if (text !== undefined) card[key] = text;
        else delete card[key];
      }
      keepKeys(card, ["title", "description", "meta", "eyebrow"]);
      return card;
    });
    if (result) { config.cards = result.values; changed = result.changed || changed; }
  }
  if (type === "filetree") {
    changed = moveFirst(config, "files", ["entries", "items", "nodes", "tree", "paths", "data"]) || changed;
    const result = normalizeObjectArray(config.files, (value) => {
      if (!isRecord(value)) return { name: stringValue(value) ?? "File" };
      const file = { ...value };
      moveFirst(file, "name", ["path", "label", "title"]);
      moveFirst(file, "detail", ["description", "meta"]);
      moveFirst(file, "type", ["kind"]);
      file.name = stringValue(file.name) ?? "File";
      if (file.type === "directory" || file.type === "dir") file.type = "folder";
      if (file.type !== "file" && file.type !== "folder") file.type = typeof file.name === "string" && file.name.endsWith("/") ? "folder" : "file";
      const detail = stringValue(file.detail);
      if (detail !== undefined) file.detail = detail; else delete file.detail;
      const depth = numberValue(file.depth);
      if (depth !== undefined) file.depth = depth; else delete file.depth;
      keepKeys(file, ["name", "type", "detail", "depth"]);
      return file;
    });
    if (result) { config.files = result.values; changed = result.changed || changed; }
  }
  if (type === "comparison") {
    changed = moveFirst(config, "columns", ["headers", "options", "choices", "categories"]) || changed;
    changed = moveFirst(config, "rows", ["items", "features", "criteria", "entries", "data"]) || changed;
    if (Array.isArray(config.columns)) {
      const originalColumns = config.columns;
      const normalizedColumns = originalColumns.map((column, index) => isRecord(column)
        ? stringValue(firstDefined(column, ["label", "title", "name", "heading"])) ?? `Option ${index + 1}`
        : stringValue(column) ?? `Option ${index + 1}`);
      config.columns = normalizedColumns;
      changed = JSON.stringify(normalizedColumns) !== JSON.stringify(originalColumns) || changed;
    }
    const columns = Array.isArray(config.columns) ? config.columns.map(stringValue).filter(isString) : [];
    if (isRecord(config.rows)) {
      config.rows = Object.entries(config.rows).map(([label, values]) => ({ label, values: Array.isArray(values) ? values : [values] }));
      changed = true;
    }
    const result = normalizeObjectArray(config.rows, (value, index) => {
      if (!isRecord(value)) return { label: `Item ${index + 1}`, values: [stringValue(value) ?? ""] };
      const row = { ...value };
      moveFirst(row, "label", ["name", "title", "heading", "feature", "criterion"]);
      moveFirst(row, "values", ["data", "cells", "options"]);
      row.label = stringValue(row.label) ?? `Item ${index + 1}`;
      if (!Array.isArray(row.values) && columns.length) row.values = columns.map((column) => row[column]);
      if (!Array.isArray(row.values)) row.values = [];
      const values = row.values as unknown[];
      row.values = values.map((entry) => stringValue(entry) ?? entry).filter((entry) => typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean");
      keepKeys(row, ["label", "values"]);
      return row;
    });
    if (result) { config.rows = result.values; changed = result.changed || changed; }
  }
  return changed;
}

function normalizeStructuredConfig(type: MarkdownFlowBlockType, config: JsonRecord): boolean {
  let changed = false;
  changed = normalizeStructuredArray(type, config) || changed;
  if (type === "quote") changed = renameKey(config, "text", "body") || changed;
  if ((type === "callout" || type === "quote")) changed = moveFirst(config, "body", ["content", "description", "details", "summary", "text"]) || changed;
  changed = moveFirst(config, "title", ["name", "label", "heading"]) || changed;
  if (typeof config.tone === "string") {
    const toneAliases: Readonly<Record<string, string>> = { info: "note", informational: "note", tip: "insight", positive: "success", danger: "warning", error: "warning", caution: "warning" };
    const tone = toneAliases[config.tone.toLowerCase()];
    if (tone) { config.tone = tone; changed = true; }
  }

  if (Array.isArray(config.items)) {
    for (const item of config.items) {
      if (!isRecord(item)) continue;
      if (type !== "accordion") changed = renameKey(item, "content", "description") || changed;
      if (type === "checklist") changed = renameKey(item, "completed", "checked") || changed;
    }
  }
  for (const key of ["title", "body", "attribution", "role"]) {
    if (config[key] !== undefined) {
      const text = stringValue(config[key]);
      if (text !== undefined) config[key] = text;
      else { delete config[key]; changed = true; }
    }
  }
  changed = keepKeys(config, ["title", "tone", "body", "metrics", "items", "columns", "rows", "tabs", "cards", "files", "attribution", "role"]) || changed;
  return changed;
}

function unwrapConfig(language: MarkdownFlowBlockType, value: unknown): { config: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    const key = language === "metrics" ? "metrics"
      : language === "tabs" ? "tabs"
        : language === "cards" ? "cards"
          : language === "filetree" ? "files"
            : language === "image" ? "images"
              : language === "map" ? "locations"
                : language === "chart" ? "data"
                  : ["timeline", "steps", "accordion", "progress", "checklist", "status"].includes(language) ? "items" : undefined;
    return key ? { config: { [key]: value }, changed: true } : { config: value, changed: false };
  }
  if (!isRecord(value)) return { config: value, changed: false };
  for (const key of ["config", "props", "payload"]) {
    if (isRecord(value[key])) {
      const config = { ...value, ...value[key] as JsonRecord };
      delete config[key];
      return { config, changed: true };
    }
  }
  return { config: value, changed: false };
}

function normalizeChartConfig(config: JsonRecord): boolean {
  let changed = false;
  const chartKeys = new Set(["type", "title", "data", "dataset", "x", "y", "keys", "colors", "lines", "bars", "areas", "max", "labels", "categories", "datasets", "series", "values", "points", "xAxis", "yAxis", "xaxis", "yaxis", "xKey", "yKey", "categoryKey", "labelKey", "valueKey", "dataKey", "name", "heading"]);
  const directEntries = Object.entries(config);
  if (directEntries.length && directEntries.every(([key, value]) => !chartKeys.has(key) && numberValue(value) !== undefined)) {
    for (const key of Object.keys(config)) delete config[key];
    config.data = directEntries.map(([name, value]) => ({ name, value: numberValue(value) }));
    config.x = "name";
    config.y = "value";
    config.type = "bar";
    changed = true;
  }
  if (isRecord(config.data)) {
    const chartData = config.data;
    const entries = Object.entries(chartData);
    if (entries.length && entries.every(([, value]) => numberValue(value) !== undefined)) {
      config.data = entries.map(([name, value]) => ({ name, value: numberValue(value) }));
      config.x = config.x ?? "name";
      config.y = config.y ?? "value";
      changed = true;
    } else {
      if (config.labels === undefined && Array.isArray(chartData.labels)) config.labels = chartData.labels;
      if (config.categories === undefined && Array.isArray(chartData.categories)) config.categories = chartData.categories;
      if (config.datasets === undefined && Array.isArray(chartData.datasets)) config.datasets = chartData.datasets;
      if (config.series === undefined && Array.isArray(chartData.series)) config.series = chartData.series;
      delete config.data;
      changed = true;
    }
  }
  const categoryAxis = isRecord(config.xaxis) ? config.xaxis : isRecord(config.xAxis) ? config.xAxis : undefined;
  if (categoryAxis && config.categories === undefined && Array.isArray(categoryAxis.categories)) {
    config.categories = categoryAxis.categories;
    delete config.xaxis;
    delete config.xAxis;
    changed = true;
  }
  if (isRecord(config.yaxis)) { delete config.yaxis; changed = true; }
  if (isRecord(config.yAxis)) { delete config.yAxis; changed = true; }
  changed = moveFirst(config, "x", ["xAxis", "xKey", "categoryKey", "labelKey"]) || changed;
  changed = moveFirst(config, "y", ["yAxis", "yKey", "valueKey", "dataKey"]) || changed;
  changed = moveFirst(config, "data", ["values", "points"]) || changed;
  changed = moveFirst(config, "title", ["name", "heading"]) || changed;
  const typeAliases: Record<string, string> = { column: "bar", donut: "pie", doughnut: "pie", spline: "line" };
  if (typeof config.type === "string" && typeAliases[config.type.toLowerCase()]) { config.type = typeAliases[config.type.toLowerCase()]; changed = true; }

  const labels = Array.isArray(config.labels) ? config.labels : Array.isArray(config.categories) ? config.categories : undefined;
  const datasets = Array.isArray(config.datasets) ? config.datasets : Array.isArray(config.series) ? config.series : undefined;
  if (!Array.isArray(config.data) && labels && datasets?.every(isRecord)) {
    const rows = labels.map((label, index) => {
      const row: JsonRecord = { name: stringValue(label) ?? `Item ${index + 1}` };
      for (const [seriesIndex, series] of datasets.entries()) {
        const key = stringValue(firstDefined(series, ["name", "label", "dataKey"])) ?? `series${seriesIndex + 1}`;
        const values = Array.isArray(series.data) ? series.data : [];
        const numeric = numberValue(values[index]);
        if (numeric !== undefined) row[key] = numeric;
      }
      return row;
    });
    config.data = rows;
    config.x = config.x ?? "name";
    const keys = datasets.map((series, index) => stringValue(firstDefined(series, ["name", "label", "dataKey"])) ?? `series${index + 1}`);
    if (keys.length === 1) config.y = config.y ?? keys[0]; else config.keys = config.keys ?? keys;
    changed = true;
  } else if (!labels && Array.isArray(config.series) && config.series.every(isRecord)) {
    const series = config.series as JsonRecord[];
    const longest = Math.max(0, ...series.map((entry) => Array.isArray(entry.data) ? entry.data.length : 0));
    if (longest > 0 && series.every((entry) => Array.isArray(entry.data))) {
      const keys = series.map((entry, index) => stringValue(firstDefined(entry, ["name", "label", "dataKey"])) ?? `series${index + 1}`);
      config.data = Array.from({ length: longest }, (_, index) => {
        const row: JsonRecord = { name: String(index + 1) };
        series.forEach((entry, seriesIndex) => {
          const raw = (entry.data as unknown[])[index];
          const numeric = numberValue(raw);
          if (numeric !== undefined) row[keys[seriesIndex]] = numeric;
        });
        return row;
      });
      config.x = config.x ?? "name";
      if (keys.length === 1) config.y = config.y ?? keys[0]; else config.keys = config.keys ?? keys;
      changed = true;
    }
  } else if (Array.isArray(config.series) && Array.isArray(config.data)) {
    const keys = config.series.map((series) => isRecord(series) ? stringValue(firstDefined(series, ["dataKey", "key", "name"])) : stringValue(series)).filter(isString);
    if (keys.length === 1 && config.y === undefined) config.y = keys[0];
    else if (keys.length && config.keys === undefined) config.keys = keys;
    changed = true;
  }

  if (Array.isArray(config.data) && config.data.length > 0 && config.data.every((row) => Array.isArray(row) && row.length >= 2)) {
    config.data = (config.data as unknown[][]).map((tuple) => ({ x: numberValue(tuple[0]) ?? tuple[0], y: numberValue(tuple[1]) ?? tuple[1] }));
    config.x = config.x ?? "x";
    config.y = config.y ?? "y";
    config.type = config.type ?? "scatter";
    changed = true;
  }

  if (Array.isArray(config.data) && config.data.every(isRecord)) {
    const rows = config.data as JsonRecord[];
    const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const x = stringValue(config.x)
      ?? keys.find((key) => rows.every((row) => row[key] !== undefined && numberValue(row[key]) === undefined))
      ?? keys.find((key) => rows.some((row) => typeof row[key] === "string"))
      ?? keys[0];
    const numericKeys = keys.filter((key) => key !== x && rows.every((row) => numberValue(row[key]) !== undefined));
    for (const row of rows) for (const key of numericKeys) row[key] = numberValue(row[key]);
    if (x && config.x === undefined) { config.x = x; changed = true; }
    if (config.y === undefined && config.keys === undefined && numericKeys.length === 1) { config.y = numericKeys[0]; changed = true; }
    if (config.y === undefined && config.keys === undefined && numericKeys.length > 1) { config.keys = numericKeys; changed = true; }
    if (config.type === undefined) { config.type = "bar"; changed = true; }
  }
  delete config.labels;
  delete config.categories;
  delete config.datasets;
  delete config.series;
  changed = keepKeys(config, ["type", "title", "data", "dataset", "x", "y", "keys", "colors", "lines", "bars", "areas", "max"]) || changed;
  return changed;
}

function normalizeMediaConfig(type: MarkdownFlowBlockType, config: JsonRecord): boolean {
  let changed = false;
  if (type === "embed") {
    changed = moveFirst(config, "url", ["href", "link", "src"]) || changed;
    changed = moveFirst(config, "title", ["name", "label"]) || changed;
    changed = keepKeys(config, ["title", "url", "kind", "description", "publisher"]) || changed;
  } else if (type === "image") {
    changed = moveFirst(config, "images", ["items", "gallery", "data"]) || changed;
    if (!Array.isArray(config.images) && firstDefined(config, ["src", "url"]) !== undefined) {
      config.images = [{ src: firstDefined(config, ["src", "url"]), alt: firstDefined(config, ["alt", "title"]) }];
      changed = true;
    }
    const result = normalizeObjectArray(config.images, (value) => {
      if (typeof value === "string") return { src: value, alt: "" };
      if (!isRecord(value)) return undefined;
      const image = { ...value };
      moveFirst(image, "src", ["url", "href"]);
      moveFirst(image, "alt", ["title", "name"]);
      keepKeys(image, ["src", "alt", "caption", "label"]);
      return image;
    });
    if (result) { config.images = result.values; changed = result.changed || changed; }
    changed = keepKeys(config, ["title", "layout", "images"]) || changed;
  } else if (type === "map") {
    changed = moveFirst(config, "locations", ["items", "points", "markers", "data"]) || changed;
    const result = normalizeObjectArray(config.locations, (value, index) => {
      if (!isRecord(value)) return undefined;
      const location = { ...value };
      moveFirst(location, "name", ["label", "title"]);
      moveFirst(location, "detail", ["description", "meta"]);
      location.name = stringValue(location.name) ?? `Location ${index + 1}`;
      const x = numberValue(firstDefined(location, ["x", "left", "longitude", "lng"]));
      const y = numberValue(firstDefined(location, ["y", "top", "latitude", "lat"]));
      if (x !== undefined) location.x = x; else delete location.x;
      if (y !== undefined) location.y = y; else delete location.y;
      keepKeys(location, ["name", "detail", "x", "y"]);
      return location;
    });
    if (result) { config.locations = result.values; changed = result.changed || changed; }
    changed = keepKeys(config, ["title", "locations"]) || changed;
  }
  return changed;
}

function fallbackScalar(value: unknown): string | number | boolean | undefined {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

function readableFallback(type: MarkdownFlowBlockType, value: unknown, source: string): MarkdownFlowReadableFallback {
  if (!isRecord(value)) return { kind: "source", source: source.trim().slice(0, 20_000) };

  if (type === "chart") {
    const data = Array.isArray(value.data) ? value.data : [];
    if (data.length && data.every(isRecord)) {
      const columns = Array.from(new Set((data as JsonRecord[]).flatMap((row) => Object.keys(row))));
      return { kind: "table", columns, rows: (data as JsonRecord[]).map((row) => columns.map((column) => fallbackScalar(row[column]) ?? "")) };
    }
  }

  if (type === "comparison" && Array.isArray(value.columns) && Array.isArray(value.rows)) {
    const columns = ["", ...value.columns.map((column) => stringValue(column) ?? "")];
    const rows = value.rows.filter(isRecord).map((row) => [stringValue(row.label) ?? "", ...(Array.isArray(row.values) ? row.values.map((entry) => fallbackScalar(entry) ?? "") : [])]);
    return { kind: "table", columns, rows };
  }

  const container = type === "metrics" ? value.metrics
    : type === "tabs" ? value.tabs
      : type === "cards" ? value.cards
        : type === "filetree" ? value.files
          : value.items;
  if (Array.isArray(container)) {
    if (type === "tabs" || type === "cards") {
      const sections = container.map((entry, index) => isRecord(entry)
        ? { title: stringValue(firstDefined(entry, ["title", "label", "name", "heading"])) ?? `Section ${index + 1}`, content: stringValue(firstDefined(entry, ["content", "body", "description", "details", "summary", "text"])) }
        : { title: stringValue(entry) ?? `Section ${index + 1}` });
      return { kind: "sections", sections };
    }
    const items = container.map((entry) => {
      if (!isRecord(entry)) return stringValue(entry) ?? "";
      const title = stringValue(firstDefined(entry, ["title", "label", "name", "heading"])) ?? "";
      const detail = stringValue(firstDefined(entry, ["description", "details", "content", "body", "summary", "text", "value"])) ?? "";
      return [title, detail].filter(Boolean).join(": ");
    }).filter(Boolean);
    return { kind: "list", ordered: type === "timeline" || type === "steps", items };
  }

  const lines = ["title", "heading", "label", "name", "body", "description", "details", "content", "summary", "text"]
    .map((key) => stringValue(value[key]))
    .filter(isString);
  return lines.length ? { kind: "text", lines } : { kind: "source", source: source.trim().slice(0, 20_000) };
}

function chartNormalizationConfidence(config: JsonRecord): number {
  if (typeof config.dataset === "string") return 0.95;
  if (!Array.isArray(config.data) || config.data.length === 0 || !config.data.every(isRecord)) return 0.35;
  const rows = config.data as JsonRecord[];
  const series = [config.y, ...(Array.isArray(config.keys) ? config.keys : [])].filter(isString);
  if (!series.length || series.some((key) => rows.some((row) => numberValue(row[key]) === undefined))) return 0.45;
  return 0.92;
}

function structuredNormalizationConfidence(type: MarkdownFlowBlockType, config: JsonRecord): number {
  const reason = validateStructuredBlock(type, config, mergePolicy());
  if (reason) return 0.4;
  const generatedLabel = JSON.stringify(config).match(/"(?:Item|Metric|Card|Tab|Option|Section) \d+"/);
  return generatedLabel ? 0.78 : 0.98;
}

/**
 * Canonicalizes the documented, unambiguous LLM variations before validation
 * and rendering, including common provider-neutral chart schema variations.
 */
export function normalizeMarkdownFlowBlock(
  language: string,
  code: string,
  options: MarkdownFlowBlockValidationOptions = {},
): MarkdownFlowNormalizedBlock | undefined {
  const normalizedLanguage = normalizeLanguage(language, options);
  if (!normalizedLanguage) return undefined;
  const languageChanged = normalizedLanguage !== language;
  const languageTransformations = languageChanged ? [`Mapped block language "${language}" to "${normalizedLanguage}".`] : [];
  if (options.normalization === "strict" || normalizedLanguage === "mermaid") {
    return {
      language: normalizedLanguage,
      code,
      normalized: languageChanged,
      confidence: 1,
      transformations: languageTransformations,
      classification: languageChanged ? "compatible" : "exact",
    };
  }

  let config: unknown;
  let usedJson5 = false;
  try {
    const cleaned = code.replace(/^`+|`+$/g, "").trim();
    try { config = JSON.parse(cleaned); }
    catch { config = JSON5.parse(cleaned); usedJson5 = true; }
  } catch {
    return {
      language: normalizedLanguage,
      code,
      normalized: languageChanged,
      confidence: 0,
      transformations: languageTransformations,
      classification: "fallback",
      fallback: { kind: "source", source: code.trim().slice(0, 20_000) },
    };
  }
  // Never normalize executable-looking handlers or prototype-shaped input
  // away. Leave it intact so validation rejects it explicitly.
  if (hasUnsafeObjectKeys(config) || ((normalizedLanguage === "embed" || normalizedLanguage === "image") && hasUnsafeUrlValues(config))) {
    return {
      language: normalizedLanguage,
      code: JSON.stringify(config),
      normalized: languageChanged,
      confidence: 0,
      transformations: languageTransformations,
      classification: "unsafe",
      unsafe: true,
    };
  }
  const unwrapped = unwrapConfig(normalizedLanguage, config);
  config = unwrapped.config;
  if (!isRecord(config)) return {
    language: normalizedLanguage,
    code,
    normalized: languageChanged,
    confidence: 0,
    transformations: languageTransformations,
    classification: "fallback",
    fallback: readableFallback(normalizedLanguage, config, code),
  };

  const transformations = [...languageTransformations];
  if (usedJson5) transformations.push("Parsed JSON-compatible model syntax.");
  if (unwrapped.changed) transformations.push("Unwrapped the block payload into its canonical container.");
  let normalized = languageChanged || usedJson5 || unwrapped.changed;
  let shapeChanged = false;
  if (normalizedLanguage === "chart") {
    shapeChanged = normalizeChartConfig(config);
  } else if (structuredTypes.has(normalizedLanguage)) {
    shapeChanged = normalizeStructuredConfig(normalizedLanguage, config);
  } else {
    shapeChanged = normalizeMediaConfig(normalizedLanguage, config);
  }
  if (shapeChanged) transformations.push(normalizedLanguage === "chart" ? "Normalized chart fields and inferred unambiguous series." : "Normalized block-aware field and container aliases.");
  normalized = shapeChanged || normalized;
  const canonical = JSON.stringify(config);
  if (canonical !== code.trim() && transformations.length === 0) transformations.push("Canonicalized block JSON.");
  normalized = normalized || canonical !== code.trim();
  const confidence = !normalized ? 1
    : normalizedLanguage === "chart" ? chartNormalizationConfidence(config)
      : structuredTypes.has(normalizedLanguage) ? structuredNormalizationConfidence(normalizedLanguage, config)
        : 0.95;
  const classification: MarkdownFlowNormalizationClassification = confidence < 0.6 ? "fallback" : normalized ? "compatible" : "exact";
  return {
    language: normalizedLanguage,
    code: canonical,
    normalized,
    confidence,
    transformations,
    classification,
    fallback: readableFallback(normalizedLanguage, config, code),
  };
}

function hasOnlyKeys(value: JsonRecord, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function optionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === "number";
}

function validateItems(items: unknown, policy: Required<MarkdownFlowRenderPolicy>): string | null {
  if (!Array.isArray(items) || items.length > policy.maxTableRows) return "Items must be a bounded array.";

  const allowed = ["date", "title", "description", "status", "meta", "open", "content", "value", "total", "checked"];
  const valid = items.every((item) => isRecord(item)
    && hasOnlyKeys(item, allowed)
    && isString(item.title)
    && optionalString(item.date)
    && optionalString(item.description)
    && optionalString(item.meta)
    && optionalString(item.content)
    && optionalNumber(item.value)
    && optionalNumber(item.total)
    && (item.open === undefined || typeof item.open === "boolean")
    && (item.checked === undefined || typeof item.checked === "boolean")
    && (item.status === undefined || (isString(item.status) && itemStatuses.has(item.status))));

  return valid ? null : "Items contain unsupported or invalid values.";
}

function validateStructuredBlock(type: MarkdownFlowBlockType, config: JsonRecord, policy: Required<MarkdownFlowRenderPolicy>): string | null {
  const common = ["title", "tone", "body", "metrics", "items", "columns", "rows", "tabs", "cards", "files", "attribution", "role"];
  if (!hasOnlyKeys(config, common)) return "The block contains unsupported properties.";
  if (![config.title, config.body, config.attribution, config.role].every(optionalString)) return "Text properties must be strings.";
  if (config.tone !== undefined && (!isString(config.tone) || !tones.has(config.tone))) return "The block tone is not supported.";

  if (type === "callout") return config.title !== undefined || config.body !== undefined ? null : "A callout needs a title or body.";
  if (type === "quote") return isString(config.body) && config.body.length > 0 ? null : "A quote needs a body.";

  if (["timeline", "steps", "accordion", "progress", "checklist", "status"].includes(type)) return validateItems(config.items, policy);

  if (type === "metrics") {
    if (!Array.isArray(config.metrics) || config.metrics.length > policy.maxTableRows) return "Metrics must be a bounded array.";
    return config.metrics.every((metric) => isRecord(metric)
      && hasOnlyKeys(metric, ["label", "value", "change", "detail"])
      && isString(metric.label)
      && isStringOrNumber(metric.value)
      && optionalString(metric.change)
      && optionalString(metric.detail)) ? null : "Metrics contain unsupported or invalid values.";
  }

  if (type === "comparison") {
    const columns = config.columns;
    if (!Array.isArray(columns) || columns.length > 12 || !columns.every(isString)) return "Comparison columns must be a bounded array of strings.";
    if (!Array.isArray(config.rows) || config.rows.length > policy.maxTableRows) return "Comparison rows must be a bounded array.";
    return config.rows.every((row) => isRecord(row)
      && hasOnlyKeys(row, ["label", "values"])
      && isString(row.label)
      && Array.isArray(row.values)
      && row.values.length === columns.length
      && row.values.every((value) => isStringOrNumber(value) || typeof value === "boolean")) ? null : "Comparison rows contain unsupported or invalid values.";
  }

  if (type === "tabs") {
    if (!Array.isArray(config.tabs) || config.tabs.length > 12) return "Tabs must be a bounded array.";
    return config.tabs.every((tab) => isRecord(tab)
      && hasOnlyKeys(tab, ["label", "title", "content"])
      && isString(tab.label)
      && optionalString(tab.title)
      && isString(tab.content)) ? null : "Tabs contain unsupported or invalid values.";
  }

  if (type === "cards") {
    if (!Array.isArray(config.cards) || config.cards.length > policy.maxTableRows) return "Cards must be a bounded array.";
    return config.cards.every((card) => isRecord(card)
      && hasOnlyKeys(card, ["title", "description", "meta", "eyebrow"])
      && isString(card.title)
      && optionalString(card.description)
      && optionalString(card.meta)
      && optionalString(card.eyebrow)) ? null : "Cards contain unsupported or invalid values.";
  }

  if (type === "filetree") {
    if (!Array.isArray(config.files) || config.files.length > policy.maxTableRows) return "Files must be a bounded array.";
    return config.files.every((file) => isRecord(file)
      && hasOnlyKeys(file, ["name", "type", "detail", "depth"])
      && isString(file.name)
      && (file.type === undefined || file.type === "file" || file.type === "folder")
      && optionalString(file.detail)
      && optionalNumber(file.depth)) ? null : "Files contain unsupported or invalid values.";
  }

  return "The block type is not supported.";
}

function validateChart(config: JsonRecord, policy: Required<MarkdownFlowRenderPolicy>): string | null {
  if (!hasOnlyKeys(config, ["type", "title", "data", "dataset", "x", "y", "keys", "colors", "lines", "bars", "areas", "max"])) return "The chart contains unsupported properties.";
  if (!isString(config.type) || !chartTypes.has(config.type)) return "The chart type is not supported.";
  const datasetId = config.dataset;
  const isDatasetChart = datasetId !== undefined;
  if (isDatasetChart && !isString(datasetId)) return "The dataset reference must be a string.";
  if (isDatasetChart && config.data !== undefined) return "A chart must use inline data or a dataset reference, not both.";
  if (!isDatasetChart && (!Array.isArray(config.data) || !config.data.length || config.data.length > policy.maxChartDataPoints || !config.data.every(isRecord))) return "Chart data must be a non-empty, bounded array of objects.";
  if (isDatasetChart) {
    const approvedDatasetId = datasetId as string;
    if (!policy.allowedDatasetIds.includes(approvedDatasetId)) return "This dataset is disabled by this render policy.";
    const requestedFields = [config.x, config.y, ...(Array.isArray(config.keys) ? config.keys : []), ...(Array.isArray(config.lines) ? config.lines : []), ...(Array.isArray(config.bars) ? config.bars : []), ...(Array.isArray(config.areas) ? config.areas : [])];
    if (!requestedFields.length || !requestedFields.every(isString)) return "A dataset chart needs approved visual fields.";
    const allowedFields = policy.allowedDatasetFields[approvedDatasetId];
    if (!allowedFields || requestedFields.some((field) => !allowedFields.includes(field))) return "The chart requests fields outside the approved dataset schema.";
  }
  if (![config.title].every(optionalString) || !optionalNumber(config.max)) return "Chart text and numeric properties are invalid.";
  if (!["x", "y", "keys", "colors", "lines", "bars", "areas"].every((key) => config[key] === undefined || (key === "x" || key === "y" ? isString(config[key]) : Array.isArray(config[key]) && config[key].every(isString)))) return "Chart series properties must be strings or string arrays.";
  if (isDatasetChart) return null;
  if (config.type === "scatter" && (!isString(config.x) || !isString(config.y))) return 'Scatter charts require both numeric "x" and "y" fields.';

  const data = config.data as JsonRecord[];
  const xKey = (config.x as string | undefined) ?? "name";
  const seriesKeys = Array.isArray(config.keys) && config.keys.length ? config.keys as string[] : isString(config.y) ? [config.y] : ["value"];
  const fields = config.type === "composed"
    ? [...((config.bars as string[] | undefined) ?? []), ...((config.lines as string[] | undefined) ?? []), ...((config.areas as string[] | undefined) ?? [])]
    : seriesKeys;
  const numericFields = config.type === "scatter" ? [xKey, config.y as string] : fields.length ? fields : seriesKeys;
  const missingField = [xKey, ...numericFields].find((field) => data.some((row) => row[field] === undefined));
  if (missingField) return `Chart field "${missingField}" is missing from one or more data rows. Use an existing field name for "x", "y", or "keys".`;
  const nonNumeric = numericFields.find((field) => data.some((row) => typeof row[field] !== "number" || !Number.isFinite(row[field] as number)));
  if (nonNumeric) return `Chart series field "${nonNumeric}" must contain finite numeric values in every data row.`;
  return null;
}

function validateMedia(type: MarkdownFlowBlockType, config: JsonRecord, policy: Required<MarkdownFlowRenderPolicy>): string | null {
  const usesUrls = (url: unknown) => isString(url) && /^https?:\/\//.test(url);

  if (type === "embed") {
    if (!policy.allowExternalUrls) return "External media is disabled by this render policy.";
    return hasOnlyKeys(config, ["title", "url", "kind", "description", "publisher"])
      && usesUrls(config.url)
      && [config.title, config.description, config.publisher].every(optionalString)
      && (config.kind === undefined || config.kind === "link" || config.kind === "video" || config.kind === "document") ? null : "The embed configuration is invalid.";
  }

  if (type === "image") {
    if (!policy.allowExternalUrls) return "External media is disabled by this render policy.";
    return hasOnlyKeys(config, ["title", "layout", "images"])
      && optionalString(config.title)
      && (config.layout === undefined || config.layout === "gallery" || config.layout === "before-after")
      && Array.isArray(config.images)
      && config.images.length > 0
      && config.images.length <= policy.maxTableRows
      && config.images.every((image) => isRecord(image)
        && hasOnlyKeys(image, ["src", "alt", "caption", "label"])
        && usesUrls(image.src)
        && [image.alt, image.caption, image.label].every(optionalString)) ? null : "The image configuration is invalid.";
  }

  return hasOnlyKeys(config, ["title", "locations"])
    && optionalString(config.title)
    && Array.isArray(config.locations)
    && config.locations.length > 0
    && config.locations.length <= policy.maxTableRows
    && config.locations.every((location) => isRecord(location)
      && hasOnlyKeys(location, ["name", "detail", "x", "y"])
      && isString(location.name)
      && optionalString(location.detail)
      && typeof location.x === "number"
      && typeof location.y === "number") ? null : "The map configuration is invalid.";
}

function invalid(reason: string): MarkdownFlowBlockValidationResult {
  return { valid: false, reason, classification: "invalid" };
}

function unsafe(reason: string): MarkdownFlowBlockValidationResult {
  return { valid: false, reason, classification: "unsafe" };
}

function isUnsafeValidationFailure(type: MarkdownFlowBlockType, config: JsonRecord, reason: string, policy: Required<MarkdownFlowRenderPolicy>): boolean {
  if (hasUnsafeObjectKeys(config)) return true;
  if (/render policy|approved dataset|outside the approved|disabled by|not permitted|configured (?:size|limit)/i.test(reason)) return true;
  if (type === "chart") {
    if (config.dataset !== undefined) return true;
    if (Array.isArray(config.data) && config.data.length > policy.maxChartDataPoints) return true;
  }
  if (structuredTypes.has(type)) {
    const collections = [config.items, config.metrics, config.rows, config.cards, config.files];
    if (collections.some((collection) => Array.isArray(collection) && collection.length > policy.maxTableRows)) return true;
    if (Array.isArray(config.tabs) && config.tabs.length > 12) return true;
    if (Array.isArray(config.columns) && config.columns.length > 12) return true;
  }
  if (type === "image" && Array.isArray(config.images) && config.images.length > policy.maxTableRows) return true;
  if (type === "map" && Array.isArray(config.locations) && config.locations.length > policy.maxTableRows) return true;
  if (type === "embed" && typeof config.url === "string" && !/^https?:\/\//.test(config.url)) return true;
  if (type === "image" && Array.isArray(config.images) && config.images.some((image) => isRecord(image) && typeof image.src === "string" && !/^https?:\/\//.test(image.src))) return true;
  return false;
}

/** Validates LLM-facing blocks before they reach an interactive renderer. */
export function validateMarkdownFlowBlock(
  language: string,
  code: string,
  renderPolicy?: MarkdownFlowRenderPolicy,
  options: MarkdownFlowBlockValidationOptions = {},
): MarkdownFlowBlockValidationResult {
  const block = normalizeMarkdownFlowBlock(language, code, options);
  if (!block) {
    const reason = `Unsupported AI block language "${language}". Use an enabled Markdown Flow block type.`;
    return /<script|javascript:|onerror\s*=|onload\s*=/i.test(code) ? unsafe(reason) : invalid(reason);
  }
  const { language: normalizedLanguage, code: normalizedCode } = block;
  const policy = mergePolicy(renderPolicy);
  if (!policy.allowedBlocks.includes(normalizedLanguage)) return unsafe(`The "${normalizedLanguage}" block type is disabled by this render policy.`);
  if (normalizedCode.length > policy.maxBlockCharacters) return unsafe("This block exceeds the configured size limit.");
  if (normalizedLanguage === "mermaid") return normalizedCode.trim() ? { valid: true } : invalid("A Mermaid block cannot be empty. Put the diagram definition inside the fence.");
  if (block.unsafe) return unsafe("The block contains executable or prototype-shaped properties and was blocked.");

  let config: unknown;
  try {
    config = options.normalization === "strict" ? JSON.parse(normalizedCode) : JSON5.parse(normalizedCode);
  } catch (error) {
    const detail = error instanceof SyntaxError && error.message ? ` ${error.message}` : "";
    return invalid(`AI blocks must contain valid JSON.${detail}`);
  }
  if (!isRecord(config)) return invalid("A block configuration must be a JSON object.");

  const reason = structuredTypes.has(normalizedLanguage)
    ? validateStructuredBlock(normalizedLanguage, config, policy)
    : normalizedLanguage === "chart"
      ? validateChart(config, policy)
      : validateMedia(normalizedLanguage, config, policy);

  if (!reason) return { valid: true };
  return isUnsafeValidationFailure(normalizedLanguage, config, reason, policy) ? unsafe(reason) : invalid(reason);
}
