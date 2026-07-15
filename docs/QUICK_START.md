# Five-minute quick start

## Install

```bash
npm install markdown-flow
```

## Import styles once

Import the complete stylesheet once from the application shell. In Next.js App Router, use `app/layout.tsx`; do not import it inside a `"use client"` component.

```tsx
// app/layout.tsx
import "./globals.css";
import "markdown-flow/styles.css";
```

## Render the active answer component

Replace the component that currently renders the assistant message as raw text.

```tsx
import { AIResponse } from "markdown-flow/ai";

export function Answer({ answer }: { answer: string }) {
  return <AIResponse content={answer} />;
}
```

No preset, policy, prompt, CLI, Tailwind configuration, separate math CSS, or chat-shell styles are required. Creating a separate wrapper is not enough: the component used by the live chat must render `AIResponse`.

## Stream

Update the same `content` prop as text arrives:

```tsx
const [answer, setAnswer] = useState("");

for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  setAnswer((current) => current + decoder.decode(value, { stream: true }));
}

return <AIResponse content={answer} />;
```

## Cite sources

```tsx
const sources = [
  { id: "policy-42", title: "Retention policy", url: "/policies/42" },
];

<AIResponse content={answer} sources={sources} />
```

The response uses `[cite:policy-42]`. Source metadata must come from your application, not from the model.

## Customize locally

```tsx
<AIResponse
  content={answer}
  theme={{ accent: "#7c3aed", radius: "12px" }}
/>
```

You are done. Add [`MARKDOWN_FLOW_COMPACT_PROMPT`](../README.md#optional-rich-output-prompt) on the backend only if you want the model to intentionally produce optional rich blocks.
