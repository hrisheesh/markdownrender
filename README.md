# Markdown Flow

Native, adaptive, zero-config Markdown and AI response rendering for React.

Markdown Flow starts with ordinary Markdown and progressively enhances output when useful. It inherits the host application’s typography and color, stays transparent, supports growing-string streaming, and never requires a model protocol, CLI, Tailwind setup, or security allowlist for the basic path.

## Five-minute quick start

### 1. Install

```bash
npm install markdown-flow
```

### 2. Import the stylesheet once

```tsx
// app/layout.tsx
import "./globals.css";
import "markdown-flow/styles.css";
```

For Next.js App Router, keep this import in the root layout. Do not import the package stylesheet from an individual `"use client"` answer component.

### 3. Replace the component that renders the assistant answer

```tsx
import { AIResponse } from "markdown-flow/ai";

export function Answer({ answer }: { answer: string }) {
  return <AIResponse content={answer} />;
}
```

That is the complete default integration. It supports ordinary Markdown, GFM tables and task lists, highlighted code, math, Mermaid, images, streamed growing strings, and rich blocks when they are present. The stylesheet is compiled CSS and is scoped to Markdown Flow; the consuming application does not need Tailwind or a separate math stylesheet.

Replace the active branch that currently displays raw text (for example, `<p>{content}</p>`). Adding a separate wrapper has no effect until the live chat answer component renders `AIResponse`.

### 4. Add sources when you have them

```tsx
import { AIResponse, type MarkdownFlowSource } from "markdown-flow/ai";

const sources: MarkdownFlowSource[] = [
  {
    id: "policy-42",
    title: "Retention policy",
    preview: "Customer data is retained for 30 days.",
    url: "/policies/42",
  },
];

<AIResponse content={answer} sources={sources} />;
```

Passing `sources` enables citation rendering automatically. The answer cites a source with `[cite:policy-42]`. A preset is not required.

## What works without backend changes

You can pass any normal model response directly to `AIResponse`. Markdown Flow renders:

- headings, paragraphs, links, images, lists, task lists, quotes, and tables;
- inline and fenced code with syntax highlighting;
- inline and display math;
- Mermaid fences;
- append-only streaming content;
- citations when trusted source metadata is supplied;
- recognizable structured data with readable fallbacks when it cannot be enhanced confidently.

Rich blocks are progressive enhancement. If your model emits only Markdown, the package is still doing its primary job. It does not need to transform every answer into cards.

## Streaming is the same component

Keep the response in a growing string. No package-specific stream protocol or hook is required.

```tsx
"use client";

import { useState } from "react";
import { AIResponse } from "markdown-flow/ai";

export function StreamingAnswer() {
  const [content, setContent] = useState("");

  async function ask(question: string) {
    setContent("");
    const response = await fetch("/api/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (!response.ok || !response.body) throw new Error("The answer could not be loaded.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      setContent((current) => current + decoder.decode(value, { stream: true }));
    }
    setContent((current) => current + decoder.decode());
  }

  return <AIResponse content={content} />;
}
```

Append-only updates process the new suffix. Completed sections retain stable identity, and an unfinished rich fence waits for its closing fence. Use `useAIResponse`, `readMarkdownFlowSSE`, or provider adapters only when your transport already exposes explicit events.

## Optional rich-output prompt

No prompt is needed for ordinary Markdown. When a task benefits from intentional charts, timelines, comparisons, or other rich blocks, add the compact prompt on the server:

```ts
import { MARKDOWN_FLOW_COMPACT_PROMPT } from "markdown-flow/ai";

const response = await model.generate({
  system: MARKDOWN_FLOW_COMPACT_PROMPT,
  prompt: userPrompt,
});
```

The compact contract is stable and under 250 tokens. It asks for ordinary Markdown by default, explains optional fences, lists block names, prevents empty placeholders, and defines citation tokens.

For a task that only needs particular blocks:

```ts
import { createMarkdownFlowInstructions } from "markdown-flow/ai";

const instructions = createMarkdownFlowInstructions({
  blocks: ["chart", "comparison"],
  detail: "compact",
});
```

For strict controlled generation, explicitly request the full contract:

```ts
const instructions = createMarkdownFlowInstructions({
  preset: "analytics",
  blocks: ["metrics", "chart", "comparison"],
  detail: "full",
  mode: "strict",
});
```

## Universal Node setup helper

`createMarkdownFlow()` provides both prompt levels and the related integration metadata without making you assemble them yourself:

```ts
import { createMarkdownFlow } from "markdown-flow/ai";

const flow = createMarkdownFlow({ blocks: ["chart", "comparison"] });

const answer = await model.generate({
  system: flow.compactPrompt,
  prompt: userPrompt,
});
```

It returns:

| Field | Purpose |
| --- | --- |
| `compactPrompt` | Recommended token-efficient instruction. |
| `fullPrompt` | Validator-aligned examples for advanced strict generation. |
| `instructions` | Compatibility field; compact unless `detail: "full"` is selected. |
| `policy` | Host-owned render policy for advanced low-level integrations. |
| `blockTypes` | Blocks requested for generation. |
| `themeVariables` | Stable `--mf-*` customization variables. |
| `citationFormat` | The exact `[cite:source-id]` token form. |
| `version` | Protocol identifier for persisted contracts. |

`blocks` guides model output; it is not a hidden render allowlist. Use an explicit `policy` or the compatibility `allowedBlocks` option only when you intentionally want a restriction.

## Static prompts for non-Node backends

The package ships ready-to-copy prompt assets:

```text
markdown-flow/prompts/compact.txt
markdown-flow/prompts/rag.txt
markdown-flow/prompts/analytics.txt
```

Vendor the appropriate text file with a Python, .NET, Java, or Go service. Resolve it from an explicit application root and fail loudly if it is missing; do not calculate a fragile path from the nesting depth of the current source file.

The CLI remains available for customization and CI, but is not part of onboarding:

```bash
npx markdown-flow prompt
npx markdown-flow prompt --blocks chart,timeline
npx markdown-flow prompt --strict --output prompts/strict.txt
npx markdown-flow verify --input prompts/strict.txt --strict
npx markdown-flow doctor
```

Legacy names such as `generate-prompt`, `verify-prompt`, and `generate-config` remain supported.

## Styling and themes

The default appearance is native: inherited font and text color, transparent root, restrained surfaces, and automatic compatibility with a host light or dark container.

```tsx
<AIResponse content={answer} theme="inherit" appearance="native" />
```

Use the component theme API for a local adjustment:

```tsx
<AIResponse
  content={answer}
  theme={{ accent: "#7c3aed", radius: "12px" }}
/>
```

Or set package-scoped variables on your own wrapper:

```css
.support-answer {
  --mf-accent: #7c3aed;
  --mf-radius-md: 12px;
  --mf-surface: transparent;
  --mf-surface-subtle: color-mix(in srgb, currentColor 5%, transparent);
}
```

```tsx
<AIResponse className="support-answer" content={answer} />
```

Use `appearance="polished"` for stronger surfaces or `appearance="unstyled"` for semantic structure and class hooks without package presentation. See [Styling and themes](./docs/STYLING.md) for variables, appearance modes, dark mode, and class overrides.

## Built-in rich blocks

These are optional presentation formats, not required response schemas:

| Block | Best use |
| --- | --- |
| `callout` | One important note or warning. |
| `metrics` | A few headline values. |
| `timeline` | Dated milestones. |
| `steps` | Ordered instructions. |
| `comparison` | Options on shared criteria. |
| `accordion` | Secondary details. |
| `tabs` | Alternate reader views. |
| `cards` | Peer summaries or resources. |
| `filetree` | Project structure. |
| `progress` | Completion against a total. |
| `checklist` | Actionable tasks. |
| `status` | Project or rollout state. |
| `quote` | A short attributed quotation. |
| `chart` | A trend or numeric comparison. |
| `mermaid` | A flow, relationship, or architecture diagram. |
| `embed`, `image`, `map` | Trusted media or location presentation. |

Normal mode accepts common field aliases, harmless extra metadata, JSON-style model output, and familiar chart shapes. If data is ambiguous or invalid, Markdown Flow preserves a readable representation. Only actually dangerous input—such as executable URLs, event handlers, prototype-pollution keys, unauthorized datasets, or oversized payloads—is blocked.

## Advanced security

Defaults are open for safe built-in presentation and closed to executable behavior. Strictness is opt-in:

```tsx
<AIResponse
  content={answer}
  mode="strict"
  policy={{
    allowedBlocks: ["chart", "timeline"],
    allowExternalUrls: false,
  }}
/>
```

Markdown Flow never executes model-generated JavaScript, JSX, CSS, React components, event handlers, tools, or actions. Your server remains responsible for authentication, retrieval authorization, tenant boundaries, provider secrets, and determining whether a claim is true. Read [Security and strict mode](./docs/SECURITY.md) before enabling datasets or registered artifacts.

## Backend and framework recipes

Complete copy-paste examples are in [Backend recipes](./docs/BACKENDS.md):

- Node and a provider-neutral model client;
- Next.js App Router with streamed text;
- Python and FastAPI;
- .NET minimal APIs;
- Java with Spring;
- Go with `net/http`;
- RAG citations and strict enterprise mode.

## Troubleshooting

Start with this decision tree:

```text
Nothing rich rendered?
├─ Ordinary Markdown looks correct → integration works; rich output is optional.
├─ Raw output has no rich fences → add the compact prompt if rich UI is wanted.
└─ Raw output has fences but shows a fallback → enable debug in development.

Host UI changed?
├─ Confirm only markdown-flow/styles.css is imported.
├─ Remove copied playground or old .chat-markdown overrides.
└─ Check application selectors targeting all descendants of the chat bubble.
```

Use development diagnostics locally:

```tsx
<AIResponse content={answer} debug />
```

Do not expose debug output in production because it may contain response details. See the full [Troubleshooting guide](./docs/TROUBLESHOOTING.md).

## Package entry points

| Import | Use |
| --- | --- |
| `markdown-flow/ai` | `AIResponse`, prompts, streaming, citations, policies, datasets, and artifacts. |
| `markdown-flow` | Full authored Markdown via `RichMarkdown`. |
| `markdown-flow/core` | Lightweight sanitized GFM. |
| `markdown-flow/server` | Server-safe static rendering. |
| `markdown-flow/styles.css` | Complete scoped styles, including math. |

React 18 and 19 are supported. Import the stylesheet once in the application shell. For Next.js App Router, import it from `app/layout.tsx`.

## Documentation

- [Five-minute quick start](./docs/QUICK_START.md)
- [Backend recipes](./docs/BACKENDS.md)
- [Styling and themes](./docs/STYLING.md)
- [Troubleshooting](./docs/TROUBLESHOOTING.md)
- [Security and strict mode](./docs/SECURITY.md)
- [Release history](./CHANGELOG.md)

The product principle is simple: **Markdown Flow adapts to the application, the model output, and the user’s design system. The application should never have to adapt itself to Markdown Flow.**
