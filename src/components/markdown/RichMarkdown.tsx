"use client";

import React, { ReactNode } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import type { MarkdownFlowRenderPolicy } from "../../ai/protocol";
import { useMarkdownFlowCitations, type MarkdownFlowCitationResolver, type MarkdownFlowDatasetResolver } from "../../ai/data";
import type { MarkdownFlowArtifactRegistry } from "../../ai/artifacts";
import { emitMarkdownFlowTelemetry, type MarkdownFlowTelemetry } from "../../ai/telemetry";
import { extractMarkdownFlowCitationIds, tokenizeMarkdownFlowCitations } from "../../ai/citations";
import type { MarkdownFlowNormalizationMode } from "../../ai/model";
import {
  enhanceMarkdownFlowContent,
  type MarkdownFlowEnhancementMode,
} from "../../ai/enhancement";
import RichBlockRenderer from "./RichBlockRenderer";
import {
  MarkdownFlowPresentationRoot,
  type MarkdownFlowPresentationProps,
  useMarkdownFlowClass,
  useMarkdownFlowPresentation,
} from "./presentation";

export interface Citation {
  id: string;
  chunk_id: string;
  document_id: string;
  filename: string;
  contextual_header?: string;
  text_preview: string;
}

function CitationBadge({ citation }: { citation: Citation }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLSpanElement>(null);
  const detailsId = React.useId();
  const citationClassName = useMarkdownFlowClass("citation", "mf-citation");

  React.useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <span ref={ref} className={citationClassName}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mf-citation-trigger"
        title={`Source: ${citation.filename}`}
        aria-label={`Show source: ${citation.filename}`}
        aria-expanded={open}
        aria-controls={detailsId}
      >
        {citation.id.replace(/[\[\]]/g, "")}
      </button>

      {open && (
        <div id={detailsId} role="dialog" aria-label={`Source details: ${citation.filename}`} className="mf-citation-popover">
          <div className="mf-citation-title">{citation.filename}</div>
          {citation.contextual_header && (
            <div className="mf-citation-context">{citation.contextual_header}</div>
          )}
          <p className="mf-citation-preview">{citation.text_preview}</p>
        </div>
      )}
    </span>
  );
}

function getCitationMap(citations?: readonly Citation[]) {
  const map = new Map<string, Citation>();

  citations?.forEach((citation) => {
    map.set(citation.id, citation);
    map.set(citation.id.replace(/[\[\]]/g, ""), citation);
  });

  return map;
}

function InlineWithCitations({
  children,
  citations,
}: {
  children: ReactNode;
  citations?: readonly Citation[];
}) {
  const citationMap = React.useMemo(() => getCitationMap(citations), [citations]);

  const renderNode = (node: ReactNode, keyPrefix: string): ReactNode => {
    if (typeof node === "string") {
      return tokenizeMarkdownFlowCitations(node).map((part, index) => {
        if (part.type === "citation") {
          const citation = citationMap.get(part.id);
          if (citation) return <CitationBadge key={`${keyPrefix}-citation-${part.id}-${index}`} citation={citation} />;
        }
        return <React.Fragment key={`${keyPrefix}-text-${index}`}>{part.value}</React.Fragment>;
      });
    }

    if (Array.isArray(node)) {
      return node.map((child, index) => renderNode(child, `${keyPrefix}-${index}`));
    }

    if (React.isValidElement<{ children?: ReactNode }>(node)) {
      return React.cloneElement(node, {
        children: renderNode(node.props.children, `${keyPrefix}-child`),
      });
    }

    return node;
  };

  return <>{renderNode(children, "inline")}</>;
}

export interface RichMarkdownProps extends MarkdownFlowPresentationProps {
  /** Markdown source, including optional rich fenced blocks. */
  content: string;
  /** Source references rendered as accessible inline citation badges. */
  citations?: readonly Citation[];
  /** Explicit renderers for fenced block languages. These receive text-only code after Markdown sanitization. */
  blockRenderers?: RichBlockRenderers;
  /** Enables strict validation and host-controlled limits for Markdown Flow's built-in AI blocks. */
  renderPolicy?: MarkdownFlowRenderPolicy;
  /** Host-owned, versioned business artifacts available to strict AI output. */
  artifactRegistry?: MarkdownFlowArtifactRegistry;
  /** Resolves host-authorized chart data referenced by an AI block. */
  datasetResolver?: MarkdownFlowDatasetResolver;
  /** Resolves source metadata when a narrative references a citation not sent in its envelope. */
  citationResolver?: MarkdownFlowCitationResolver;
  /** Optional privacy-safe production observability hook. Model content is never included. */
  telemetry?: MarkdownFlowTelemetry;
  /** Overrides for standard Markdown HTML elements. Source Markdown remains sanitized before these render. */
  components?: Components;
  /** Enables KaTeX parsing when the content contains math delimiters. Set false to keep math as plain Markdown. */
  enableMath?: boolean;
  /** Recovers predictable LLM aliases by default; strict mode requires canonical blocks. */
  validationMode?: MarkdownFlowNormalizationMode;
  /** Progressively upgrades only high-confidence ordinary Markdown structures. */
  enhance?: MarkdownFlowEnhancementMode;
}

export interface RichBlockRendererProps {
  /** The fenced block language, for example `alert` from a ` ```alert ` block. */
  language: string;
  /** Text-only fenced block content. */
  code: string;
}

export type RichBlockRenderer = (props: RichBlockRendererProps) => ReactNode;
export type RichBlockRenderers = Readonly<Record<string, RichBlockRenderer | undefined>>;

export interface RichMarkdownContentProps extends Omit<RichMarkdownProps, "enableMath"> {
  mathPlugins?: Pick<Options, "remarkPlugins" | "rehypePlugins">;
}

export function RichMarkdownContent({ content, citations, blockRenderers, renderPolicy, artifactRegistry, datasetResolver, citationResolver, telemetry, components, mathPlugins, validationMode, appearance, theme, className, classes, style }: RichMarkdownContentProps) {
  const citationIds = React.useMemo(() => extractMarkdownFlowCitationIds(content), [content]);
  const resolvedCitations = useMarkdownFlowCitations(citationIds, citations, citationResolver, telemetry);
  const presentation = useMarkdownFlowPresentation();
  const contentClassName = useMarkdownFlowClass("content", "chat-markdown", "mf-content");
  const tableClassName = useMarkdownFlowClass("table", "mf-table");
  const explicitMaxBlocks = renderPolicy?.maxBlocks;
  const containsTooManyAiBlocks = (content.match(/^```(?:callout|metrics|timeline|steps|comparison|accordion|tabs|cards|filetree|progress|checklist|status|quote|chart|mermaid|embed|image|map|artifact)\b/gim)?.length ?? 0)
    > (explicitMaxBlocks ?? Number.POSITIVE_INFINITY);

  React.useEffect(() => {
    const blockCount = content.match(/^```[\w-]+\s*$/gm)?.length ?? 0;
    const startedAt = Date.now();
    const frame = requestAnimationFrame(() => {
      emitMarkdownFlowTelemetry(telemetry, { type: "render", outcome: "complete", durationMs: Date.now() - startedAt, contentLength: content.length, blockCount });
    });
    return () => cancelAnimationFrame(frame);
  }, [content, telemetry]);

  const rendered = (
    <div className={contentClassName}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, ...(mathPlugins?.remarkPlugins ?? [])]}
        rehypePlugins={[
          [
            rehypeSanitize,
            {
              ...defaultSchema,
              attributes: {
                ...defaultSchema.attributes,
                code: [...(defaultSchema.attributes?.code || []), "className"],
                div: [...(defaultSchema.attributes?.div || []), "className"],
                span: [...(defaultSchema.attributes?.span || []), "className"],
              },
            },
          ],
          ...(mathPlugins?.rehypePlugins ?? []),
        ]}
        components={{
          h1: ({ children }) => (
            <h1 className="mf-heading mf-h1">
              <InlineWithCitations citations={resolvedCitations}>{children}</InlineWithCitations>
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mf-heading mf-h2">
              <InlineWithCitations citations={resolvedCitations}>{children}</InlineWithCitations>
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mf-heading mf-h3">
              <InlineWithCitations citations={resolvedCitations}>{children}</InlineWithCitations>
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mf-heading mf-h4">
              <InlineWithCitations citations={resolvedCitations}>{children}</InlineWithCitations>
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="mf-heading mf-h5">
              <InlineWithCitations citations={resolvedCitations}>{children}</InlineWithCitations>
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="mf-heading mf-h6">
              <InlineWithCitations citations={resolvedCitations}>{children}</InlineWithCitations>
            </h6>
          ),
          p: ({ children }) => (
            <p className="mf-paragraph">
              <InlineWithCitations citations={resolvedCitations}>{children}</InlineWithCitations>
            </p>
          ),
          strong: ({ children }) => <strong className="mf-strong">{children}</strong>,
          em: ({ children }) => <em className="mf-emphasis">{children}</em>,
          del: ({ children }) => <del className="mf-deleted">{children}</del>,
          blockquote: ({ children }) => (
            <blockquote className="mf-blockquote">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => (
            <ul className="mf-list mf-list-unordered">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mf-list mf-list-ordered">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="mf-list-item">
              <InlineWithCitations citations={resolvedCitations}>{children}</InlineWithCitations>
            </li>
          ),
          input: ({ checked, type }) => (
            <span className="mf-task-control">
              <input checked={checked} readOnly type={type} className="mf-task-input" />
              {checked && <span className="mf-task-check" aria-hidden="true">✓</span>}
            </span>
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ children, className }) => {
            const language = /language-([\w-]+)/.exec(className || "")?.[1];
            const code = String(children).replace(/\n$/, "");
            if (language) return <RichBlockRenderer language={language} code={code} blockRenderers={blockRenderers} renderPolicy={renderPolicy} artifactRegistry={artifactRegistry} datasetResolver={datasetResolver} telemetry={telemetry} validationMode={validationMode} containsTooManyAiBlocks={containsTooManyAiBlocks} />;

            return (
              <code className="mf-inline-code">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="internal-scroll mf-table-scroll">
              <table className={tableClassName}>{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="mf-table-head">
              {children}
            </thead>
          ),
          tbody: ({ children }) => <tbody className="mf-table-body">{children}</tbody>,
          tr: ({ children }) => <tr className="mf-table-row">{children}</tr>,
          th: ({ children }) => (
            <th className="mf-table-header-cell">
              <InlineWithCitations citations={resolvedCitations}>{children}</InlineWithCitations>
            </th>
          ),
          td: ({ children }) => (
            <td className="mf-table-cell">
              <InlineWithCitations citations={resolvedCitations}>{children}</InlineWithCitations>
            </td>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="mf-link"
            >
              <InlineWithCitations citations={resolvedCitations}>{children}</InlineWithCitations>
            </a>
          ),
          hr: () => <hr className="mf-divider" />,
          img: ({ src, alt, title }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src || ""}
              alt={alt || ""}
              title={title}
              className="mf-markdown-image"
              loading="lazy"
            />
          ),
          ...components,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  if (presentation) return rendered;
  return (
    <MarkdownFlowPresentationRoot appearance={appearance} theme={theme} className={className} classes={classes} style={style}>
      {rendered}
    </MarkdownFlowPresentationRoot>
  );
}

const MathRichMarkdown = React.lazy(() => import("./MathRichMarkdown"));

function containsMath(content: string) {
  return /(?:^|[^\\])\$(?:[^$\n]|\\\$)+\$|\\\(|\\\[/.test(content);
}

/**
 * Rich Markdown with progressive math loading. Ordinary answers never import
 * KaTeX's Markdown plugins; a response with a math delimiter loads them on demand.
 */
export default function RichMarkdown({ enableMath = true, enhance = "safe", ...props }: RichMarkdownProps) {
  const content = React.useMemo(
    () => enhanceMarkdownFlowContent(props.content, enhance).content,
    [enhance, props.content],
  );
  const enhancedProps = { ...props, content };
  if (!enableMath || !containsMath(content)) return <RichMarkdownContent {...enhancedProps} />;

  return (
    <React.Suspense fallback={<RichMarkdownContent {...enhancedProps} />}>
      <MathRichMarkdown {...enhancedProps} />
    </React.Suspense>
  );
}
