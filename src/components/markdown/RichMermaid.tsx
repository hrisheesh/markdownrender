"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Maximize2, Minus, Plus, ScanLine } from "lucide-react";
import mermaid from "mermaid";
import { useMarkdownFlowClass } from "./presentation";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const MERMAID_COLOR = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\([^)]*\)|[a-z]+)$/i;
const CSS_COLOR_KEYWORDS = new Set(["currentcolor", "inherit", "initial", "revert", "revert-layer", "transparent", "unset"]);

function mermaidColor(computed: CSSStyleDeclaration | null, name: string, fallback: string): string {
  const value = computed?.getPropertyValue(name).trim();
  if (!value || CSS_COLOR_KEYWORDS.has(value.toLowerCase()) || !MERMAID_COLOR.test(value)) return fallback;
  return value;
}

export default function RichMermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [isRendering, setIsRendering] = useState(true);
  const [zoom, setZoom] = useState(1);
  const renderHostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLElement>(null);
  const reactId = React.useId().replace(/:/g, "");
  const generatedId = `markdown-diagram-${reactId}`;
  const className = useMarkdownFlowClass("mermaid", "mf-block", "mf-mermaid", "rich-block-frame");

  useEffect(() => {
    let mounted = true;
    // The loading shell must be restored before the asynchronous renderer resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsRendering(true);
    setError("");

    const renderHost = renderHostRef.current;
    const cleanChart = chart.replace(/^`+|`+$/g, "").trim();

    try {
      const computed = containerRef.current ? getComputedStyle(containerRef.current) : null;
      const inheritedText = computed?.color || "#24272b";
      const inheritedFont = computed?.fontFamily || "system-ui, sans-serif";
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        themeVariables: {
          primaryColor: mermaidColor(computed, "--mf-surface-raised", "#f5f6ff"),
          primaryTextColor: mermaidColor(computed, "--mf-text", inheritedText),
          primaryBorderColor: mermaidColor(computed, "--mf-border-strong", "#aab3e8"),
          lineColor: mermaidColor(computed, "--mf-accent", inheritedText),
          secondaryColor: mermaidColor(computed, "--mf-surface-subtle", "#f8f8f7"),
          tertiaryColor: mermaidColor(computed, "--mf-surface", "#eef0fa"),
          fontFamily: computed?.getPropertyValue("--mf-font").trim() || inheritedFont,
          fontSize: "14px",
        },
        flowchart: { useMaxWidth: true, htmlLabels: true, curve: "basis" },
      });

      mermaid.render(generatedId, cleanChart, renderHost ?? undefined).then(({ svg: renderedSvg }) => {
        if (mounted) {
          setSvg(renderedSvg);
          setIsRendering(false);
        }
      }).catch((renderError: unknown) => {
        if (mounted) {
          setError(getErrorMessage(renderError, "Unable to render this diagram."));
          setIsRendering(false);
        }
      });
    } catch (renderError: unknown) {
      if (mounted) {
        setError(getErrorMessage(renderError, "Unable to render this diagram."));
        setIsRendering(false);
      }
    }

    return () => {
      mounted = false;
      renderHost?.replaceChildren();
    };
  }, [chart, generatedId]);

  async function openFullscreen() {
    try {
      await containerRef.current?.requestFullscreen();
    } catch {
      // Fullscreen is an enhancement; diagrams remain fully usable inline.
    }
  }

  const controls = (
    <div className="mf-mermaid-controls">
      <button
        type="button"
        onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.15).toFixed(2))))}
        className="mf-control rich-block-control"
        aria-label="Zoom out"
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setZoom((value) => Math.min(1.8, Number((value + 0.15).toFixed(2))))}
        className="mf-control rich-block-control"
        aria-label="Zoom in"
      >
        <Plus size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={openFullscreen}
        className="mf-control rich-block-control"
        aria-label="Open diagram fullscreen"
      >
        <Maximize2 size={14} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <section ref={containerRef} className={className}>
      <div ref={renderHostRef} className="mf-mermaid-render-host" aria-hidden="true" />
      <header className="mf-mermaid-header">
        <div className="mf-mermaid-label">
          <ScanLine size={14} strokeWidth={1.8} aria-hidden="true" />
          Diagram
        </div>
        {controls}
      </header>

      {isRendering && (
        <div className="mf-mermaid-loading" role="status" aria-label="Rendering diagram">
          <div className="mf-mermaid-skeleton">
            <div /><div /><div /><div />
          </div>
        </div>
      )}

      {error && !isRendering && (
        <div className="mf-mermaid-error-wrap">
          <div role="alert" className="mf-mermaid-error">
            <AlertTriangle size={17} aria-hidden="true" />
            <div>
              <p className="mf-item-title">This diagram needs a small correction.</p>
              <p className="mf-block-copy">{error}</p>
            </div>
          </div>
          <details className="mf-mermaid-source">
            <summary>Show diagram source</summary>
            <pre className="internal-scroll">{chart}</pre>
          </details>
        </div>
      )}

      {svg && !isRendering && !error && (
        <div className="internal-scroll mf-mermaid-viewport">
          <div
            className="mf-mermaid-diagram"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center", width: `${100 / zoom}%` }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      )}
    </section>
  );
}
