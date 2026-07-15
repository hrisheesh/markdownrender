# Security and strict mode

Markdown Flow treats model output as untrusted presentation data. Safe built-in presentation works without configuration; executable behavior does not.

## Default boundary

The renderer does not execute model-generated:

- JavaScript, JSX, React components, or CSS;
- event handlers, tools, or actions;
- arbitrary URL protocols;
- unregistered artifacts;
- model-selected protected datasets.

It validates URL protocols, blocks prototype-pollution keys, bounds payload sizes, and requires application authorization for datasets and artifacts. Ordinary schema variation is a compatibility concern, not a security incident, and normally becomes normalized output or a readable fallback.

## Strict rendering

Use strict mode when an enterprise or regulated workflow requires exact schemas:

```tsx
<AIResponse
  content={content}
  mode="strict"
  policy={{
    allowedBlocks: ["chart", "timeline"],
    allowExternalUrls: false,
  }}
/>
```

Generate the matching full prompt:

```ts
const flow = createMarkdownFlow({
  blocks: ["chart", "timeline"],
  allowedBlocks: ["chart", "timeline"],
  detail: "full",
  mode: "strict",
});
```

`blocks` guides generation. `allowedBlocks` is the deliberate policy restriction.

## Sources and RAG

Authenticate and authorize retrieval before calling the model. Give the model only approved excerpts and source IDs. Send only display-safe, authorized source metadata to the browser. A citation token is a reference, not permission to retrieve a document.

## Datasets

An allowed dataset ID in render policy is not sufficient authorization. The resolver must independently verify the current user, tenant, requested fields, and row bounds before returning data. Never accept the model’s authorization decision.

## Registered artifacts

Artifacts are application code registered by name and version. Validate their input with a bounded schema, authorize protected lookups on the server, and keep mutations in normal confirmed application flows. Never evaluate JSX or component code from the response.

## External media

Allow external URLs only when the product needs them. Markdown Flow rejects dangerous protocols; the host application should additionally enforce trusted hosts, CSP, privacy, and proxying requirements appropriate to its environment.

## Responsibility split

Markdown Flow owns safe rendering and presentation validation. The application owns authentication, authorization, tenancy, retrieval, secrets, factual verification, rate limiting, logging, and action confirmation.
