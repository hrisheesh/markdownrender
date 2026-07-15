"use client";

import React from "react";

import { diagnoseMarkdownFlowCitations, type MarkdownFlowCitationDiagnostic, type MarkdownFlowSourceInput } from "./citations";
import type { MarkdownFlowStreamSnapshot } from "./stream";
import type { MarkdownFlowTelemetryEvent } from "./telemetry";

export interface AIResponseInspectorEvent {
  event: MarkdownFlowTelemetryEvent;
  timestamp: number;
}

export interface AIResponseInspectorProps {
  snapshot: MarkdownFlowStreamSnapshot;
  events?: readonly AIResponseInspectorEvent[];
  /** Optional source metadata; legacy stream citations are used by default. */
  sources?: readonly MarkdownFlowSourceInput[];
}

/** Development-only view of parser state. It deliberately never sends data anywhere. */
export function AIResponseInspector({ snapshot, events = [], sources }: AIResponseInspectorProps) {
  const diagnostics = snapshot.diagnostics;
  const citationDiagnostics = React.useMemo(
    () => diagnoseMarkdownFlowCitations(snapshot.content, sources ?? snapshot.citations),
    [snapshot.citations, snapshot.content, sources],
  );
  const citationDiagnosticKey = citationDiagnostics.map((diagnostic) => (
    diagnostic.type === "invalid-source-id"
      ? `${diagnostic.type}:${diagnostic.sourceId}`
      : diagnostic.type === "unmatched-citation-token"
        ? `${diagnostic.type}:${diagnostic.citationId}`
        : diagnostic.type
  )).join("|");

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    citationDiagnostics.forEach((diagnostic) => {
      const detail = diagnostic.type === "no-citation-tokens"
        ? "sources were supplied but the response contains no citation tokens"
        : diagnostic.type === "unmatched-citation-token" ? diagnostic.citationId : diagnostic.sourceId;
      console.warn(`[Markdown Flow] ${diagnostic.type}: ${detail}`);
    });
  }, [citationDiagnosticKey, citationDiagnostics]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <details className="mf-inspector" data-markdown-flow-inspector>
      <summary className="mf-inspector-summary">Markdown Flow development inspector</summary>
      <dl className="mf-inspector-details">
        <dt>Status</dt><dd>{snapshot.status}</dd>
        <dt>Segments</dt><dd>{snapshot.segments.length}</dd>
        <dt>Chunks</dt><dd>{diagnostics?.chunkCount ?? 0}</dd>
        <dt>Characters received</dt><dd>{diagnostics?.characterCount ?? snapshot.content.length}</dd>
        <dt>Elapsed</dt><dd>{diagnostics?.startedAt ? `${Math.max(0, (diagnostics.updatedAt - diagnostics.startedAt) / 1000).toFixed(2)}s` : "—"}</dd>
      </dl>
      <ol className="mf-inspector-list" aria-label="Response segments">
        {snapshot.segments.map((segment, index) => (
          <li key={segment.id} className="mf-inspector-item">
            <strong>#{index + 1} {segment.type}</strong>
            {segment.type !== "markdown" && <> · {segment.language} · {segment.lifecycle}</>}
            <pre className="internal-scroll mf-inspector-source"><code>{segment.content}</code></pre>
          </li>
        ))}
      </ol>
      <h3 className="mf-inspector-heading">Validation and resolution events</h3>
      {events.length ? (
        <ol className="mf-inspector-list mf-inspector-list-compact" aria-label="Validation and resolution events">
          {events.map(({ event, timestamp }, index) => <li key={`${timestamp}-${index}`} className="mf-inspector-item"><code>{event.type}</code> · {event.outcome}{"blockType" in event ? ` · ${event.blockType}` : ""}{"resolver" in event ? ` · ${event.resolver}` : ""}</li>)}
        </ol>
      ) : <p className="mf-inspector-muted">No validation, fallback, or resolver events have occurred.</p>}
      <h3 className="mf-inspector-heading">Source citation events</h3>
      {citationDiagnostics.length ? (
        <ol className="mf-inspector-list mf-inspector-list-compact" aria-label="Source citation events">
          {citationDiagnostics.map((diagnostic, index) => <CitationDiagnosticEvent key={`${citationDiagnosticKey}-${index}`} diagnostic={diagnostic} />)}
        </ol>
      ) : <p className="mf-inspector-muted">No source citation issues detected.</p>}
      <p className="mf-inspector-muted mf-inspector-footer">Development only. This panel is not rendered in production and does not emit telemetry.</p>
    </details>
  );
}

function CitationDiagnosticEvent({ diagnostic }: { diagnostic: MarkdownFlowCitationDiagnostic }) {
  const detail = diagnostic.type === "no-citation-tokens"
    ? "sources were supplied but the response contains no citation tokens"
    : diagnostic.type === "unmatched-citation-token" ? diagnostic.citationId : diagnostic.sourceId;
  return <li className="mf-inspector-item"><code>{diagnostic.type}</code> · {detail}</li>;
}
