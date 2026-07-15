"use client";

import React, { useState } from "react";
import { Check, Copy, WrapText } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useMarkdownFlowClass } from "./presentation";

export default function RichCodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(false);
  const className = useMarkdownFlowClass("code", "mf-block", "mf-code", "rich-block-frame");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={className}>
      <header className="mf-code-header">
        <div className="mf-code-language">
          <span className="mf-code-indicator" aria-hidden="true" />
          <span>
            {language || "text"}
          </span>
        </div>
        <div className="mf-code-controls">
          <button
            type="button"
            onClick={() => setWrapLines((value) => !value)}
            className="mf-control rich-block-control"
            data-mf-active={wrapLines || undefined}
            aria-label={wrapLines ? "Disable line wrapping" : "Wrap long lines"}
            title={wrapLines ? "Disable line wrapping" : "Wrap long lines"}
          >
            <WrapText size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="mf-control rich-block-control"
            aria-label={copied ? "Code copied" : "Copy code"}
          >
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </header>
      <div className="internal-scroll mf-code-scroll">
        <SyntaxHighlighter
          language={language || "text"}
          style={oneLight}
          customStyle={{ margin: 0, background: "transparent", overflow: "visible" }}
          wrapLongLines={wrapLines}
          wrapLines={wrapLines}
          showLineNumbers
          lineNumberStyle={{
            minWidth: "2.25em",
            paddingRight: "1.5em",
            color: "var(--mf-text-subtle)",
            textAlign: "right",
            userSelect: "none",
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </section>
  );
}
