/* eslint-disable @next/next/no-img-element */

import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import {
  joinClassNames,
  MarkdownFlowPresentationRoot,
  type MarkdownFlowPresentationProps,
} from "./components/markdown/presentation";

export interface RichMarkdownCoreProps extends MarkdownFlowPresentationProps {
  /** Markdown source rendered with GitHub-flavored Markdown support. */
  content: string;
  /** Overrides for standard Markdown HTML elements. Source Markdown remains sanitized before these render. */
  components?: Components;
}

/**
 * A lightweight Markdown Flow entry point for products that do not need
 * charts, diagrams, mathematical notation, or interactive rich blocks.
 * Import `markdown-flow/core.css` once in the consuming application.
 */
export function RichMarkdownCore({ content, components, appearance, theme, className, classes, style }: RichMarkdownCoreProps) {
  return (
    <MarkdownFlowPresentationRoot appearance={appearance} theme={theme} className={joinClassNames("markdown-render-core", className)} classes={classes} style={style}>
      <div className={joinClassNames("mf-content", classes?.content)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ children }) => <h1 className="mf-heading mf-h1">{children}</h1>,
          h2: ({ children }) => <h2 className="mf-heading mf-h2">{children}</h2>,
          h3: ({ children }) => <h3 className="mf-heading mf-h3">{children}</h3>,
          h4: ({ children }) => <h4 className="mf-heading mf-h4">{children}</h4>,
          h5: ({ children }) => <h5 className="mf-heading mf-h5">{children}</h5>,
          h6: ({ children }) => <h6 className="mf-heading mf-h6">{children}</h6>,
          p: ({ children }) => <p className="mf-paragraph">{children}</p>,
          strong: ({ children }) => <strong className="mf-strong">{children}</strong>,
          em: ({ children }) => <em className="mf-emphasis">{children}</em>,
          del: ({ children }) => <del className="mf-deleted">{children}</del>,
          blockquote: ({ children }) => <blockquote className="mf-blockquote">{children}</blockquote>,
          ul: ({ children }) => <ul className="mf-list mf-list-unordered">{children}</ul>,
          ol: ({ children }) => <ol className="mf-list mf-list-ordered">{children}</ol>,
          li: ({ children }) => <li className="mf-list-item">{children}</li>,
          input: ({ checked, type }) => <input checked={checked} readOnly type={type} className="mf-task-input" />,
          code: ({ children, className }) => {
            const language = /language-([\w-]+)/.exec(className || "")?.[1];
            if (language) return <code className="mf-code-source">{children}</code>;
            return <code className="mf-inline-code">{children}</code>;
          },
          pre: ({ children }) => <pre className={joinClassNames("internal-scroll mf-code", classes?.code)}>{children}</pre>,
          table: ({ children }) => <div className="internal-scroll mf-table-scroll"><table className={joinClassNames("mf-table", classes?.table)}>{children}</table></div>,
          thead: ({ children }) => <thead className="mf-table-head">{children}</thead>,
          tbody: ({ children }) => <tbody className="mf-table-body">{children}</tbody>,
          tr: ({ children }) => <tr className="mf-table-row">{children}</tr>,
          th: ({ children }) => <th className="mf-table-header-cell">{children}</th>,
          td: ({ children }) => <td className="mf-table-cell">{children}</td>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="mf-link">{children}</a>,
          hr: () => <hr className="mf-divider" />,
          img: ({ src, alt, title }) => <img src={src || ""} alt={alt || ""} title={title} className="mf-markdown-image" loading="lazy" />,
          ...components,
        }}
      >
        {content}
      </ReactMarkdown>
      </div>
    </MarkdownFlowPresentationRoot>
  );
}

export type {
  MarkdownFlowAppearance,
  MarkdownFlowClasses,
  MarkdownFlowTheme,
  MarkdownFlowThemeVariables,
} from "./components/markdown/presentation";
