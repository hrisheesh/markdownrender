# Backend recipes

Markdown Flow does not call a model. The server keeps credentials private, authorizes retrieval, and returns text. The browser only needs the resulting string and optional trusted source metadata.

Ordinary Markdown needs no special prompt. For intentional rich output, use the compact prompt constant in Node or vendor one of the package’s `prompts/*.txt` assets in another backend.

## Node

```ts
import { MARKDOWN_FLOW_COMPACT_PROMPT } from "markdown-flow/ai";

export async function answer(question: string) {
  return model.generate({
    system: MARKDOWN_FLOW_COMPACT_PROMPT,
    prompt: question,
  });
}
```

For a focused analytics task:

```ts
import { createMarkdownFlow } from "markdown-flow/ai";

const flow = createMarkdownFlow({ blocks: ["metrics", "chart", "comparison"] });
const answer = await model.generate({ system: flow.compactPrompt, prompt: question });
```

## Next.js App Router

Import styles once:

```tsx
// app/layout.tsx
import "./globals.css";
import "markdown-flow/styles.css";
```

Keep this as the only package stylesheet import. Render `AIResponse` from the component that the chat actually uses for assistant text; importing it in a separate test wrapper will not replace an existing raw-text branch. Pass trusted sources to that same component when inline citations are used.

Return a plain text stream from the server route. Replace `modelTextStream` with the provider’s text iterable; do not send provider events or tool arguments as response text.

```ts
// app/api/answer/route.ts
import { MARKDOWN_FLOW_COMPACT_PROMPT } from "markdown-flow/ai";

export async function POST(request: Request) {
  const { question } = await request.json();
  const chunks = await modelTextStream({
    system: MARKDOWN_FLOW_COMPACT_PROMPT,
    prompt: String(question),
  });
  const encoder = new TextEncoder();

  return new Response(new ReadableStream({
    async start(controller) {
      try {
        for await (const text of chunks) controller.enqueue(encoder.encode(text));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  }), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
```

```tsx
// app/answer.tsx
"use client";

import { useState } from "react";
import { AIResponse } from "markdown-flow/ai";

export function Answer() {
  const [content, setContent] = useState("");

  async function ask(question: string) {
    setContent("");
    const response = await fetch("/api/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (!response.ok || !response.body) throw new Error("Unable to load answer");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      setContent((current) => current + decoder.decode(value, { stream: true }));
    }
  }

  return <AIResponse content={content} />;
}
```

## Python and FastAPI

Copy `markdown-flow/prompts/compact.txt` into `prompts/markdown-flow.txt`. Resolve it from an explicit application root and fail when deployment omits it.

```python
# app/main.py
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

APP_ROOT = Path(os.environ.get("APP_ROOT", Path.cwd())).resolve()
PROMPT_PATH = APP_ROOT / "prompts" / "markdown-flow.txt"
if not PROMPT_PATH.is_file():
    raise RuntimeError(f"Markdown Flow prompt not found: {PROMPT_PATH}")
MARKDOWN_FLOW_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")

app = FastAPI()

class Question(BaseModel):
    question: str

@app.post("/answer")
async def answer(body: Question):
    if not body.question.strip():
        raise HTTPException(400, "question is required")

    async def text():
        async for chunk in model_text_stream(
            system=MARKDOWN_FLOW_PROMPT,
            prompt=body.question,
        ):
            yield chunk

    return StreamingResponse(text(), media_type="text/plain")
```

Avoid chains of `Path(__file__).parent.parent...`; moving the module silently changes the resolved location.

## .NET minimal API

Copy `compact.txt` to `Prompts/markdown-flow.txt` and set it to copy to the output directory.

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var promptPath = Path.Combine(app.Environment.ContentRootPath, "Prompts", "markdown-flow.txt");
if (!File.Exists(promptPath)) throw new FileNotFoundException("Markdown Flow prompt is missing", promptPath);
var markdownFlowPrompt = await File.ReadAllTextAsync(promptPath);

app.MapPost("/answer", async (Question body, HttpResponse response, CancellationToken ct) => {
    response.ContentType = "text/plain; charset=utf-8";
    await foreach (var chunk in ModelTextStream(markdownFlowPrompt, body.Question, ct)) {
        await response.WriteAsync(chunk, ct);
        await response.Body.FlushAsync(ct);
    }
});

app.Run();
record Question(string Question);
```

## Java and Spring

Place `compact.txt` at `src/main/resources/prompts/markdown-flow.txt`.

```java
@RestController
final class AnswerController {
  private final String markdownFlowPrompt;

  AnswerController(ResourceLoader resources) throws IOException {
    var resource = resources.getResource("classpath:prompts/markdown-flow.txt");
    if (!resource.exists()) throw new FileNotFoundException("Markdown Flow prompt is missing");
    this.markdownFlowPrompt = resource.getContentAsString(StandardCharsets.UTF_8);
  }

  @PostMapping(value = "/answer", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  Flux<String> answer(@RequestBody Question request) {
    return modelTextStream(markdownFlowPrompt, request.question());
  }
}

record Question(String question) {}
```

If the frontend consumes SSE rather than raw text, append each event’s text payload to the `content` string or use `readMarkdownFlowSSE` for Markdown Flow event envelopes.

## Go

Embed the vendored prompt so deployment cannot lose it:

```go
package main

import (
  "embed"
  "fmt"
  "net/http"
)

//go:embed prompts/markdown-flow.txt
var promptFS embed.FS

func answer(w http.ResponseWriter, r *http.Request) {
  prompt, err := promptFS.ReadFile("prompts/markdown-flow.txt")
  if err != nil { http.Error(w, "prompt unavailable", 500); return }
  w.Header().Set("Content-Type", "text/plain; charset=utf-8")

  for chunk := range modelTextStream(r.Context(), string(prompt), readQuestion(r)) {
    if _, err := fmt.Fprint(w, chunk); err != nil { return }
    if flusher, ok := w.(http.Flusher); ok { flusher.Flush() }
  }
}
```

## RAG with citations

Only the server performs retrieval and authorization. Give the model approved excerpts and IDs, then send display-safe source metadata to the client.

```ts
const sources = authorizedDocuments.map((document) => ({
  id: document.publicId,
  title: document.title,
  preview: document.preview,
  url: document.allowedUrl,
}));

const flow = createMarkdownFlow({ sources, blocks: ["comparison", "steps"] });
const content = await model.generate({
  system: flow.compactPrompt,
  prompt: `${question}\n\nApproved context:\n${approvedExcerpts}`,
});

return { content, sources };
```

```tsx
<AIResponse content={result.content} sources={result.sources} />
```

## Strict enterprise mode

Use strict mode only when exact schemas and an explicit presentation allowlist are requirements:

```ts
const flow = createMarkdownFlow({
  blocks: ["chart", "timeline"],
  allowedBlocks: ["chart", "timeline"],
  detail: "full",
  mode: "strict",
});
```

```tsx
<AIResponse
  content={content}
  mode="strict"
  policy={{ allowedBlocks: ["chart", "timeline"], allowExternalUrls: false }}
/>
```
