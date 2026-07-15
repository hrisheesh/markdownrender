# Troubleshooting

## Nothing rich rendered

1. Inspect the raw response string.
2. If there are no rich fences, Markdown Flow is correctly rendering ordinary Markdown. Add `MARKDOWN_FLOW_COMPACT_PROMPT` only if the task benefits from rich output.
3. If fences exist, confirm the block name is built in and the closing fence arrived.
4. Enable `debug` in development to distinguish detected, normalized, rendered, fallback, and blocked states.

```tsx
<AIResponse content={content} debug />
```

Do not enable debug in production; diagnostics may include response details.

## A block became readable text instead of rich UI

This is a fallback, not necessarily a security rejection. Common causes are ambiguous chart values, mismatched comparison rows, or malformed data that cannot be repaired confidently. The user should still be able to read the answer.

Check the raw block and remove empty arrays or placeholder values. Normal mode accepts common aliases and familiar model formats. Use strict mode only when you intentionally require exact schemas.

## “This section could not be displayed”

The block could not be parsed into a readable representation. In development, inspect diagnostics and raw output. If the input contains an executable URL, event-handler key, prototype key, unauthorized dataset, unregistered executable artifact, or excessive payload, the block is intentionally prevented from rendering.

## Ordinary Markdown looks wrong

- Confirm `markdown-flow/styles.css` is imported once.
- Remove duplicate `core.css` or old copied package styles.
- Check whether the host chat bubble applies broad selectors to every `p`, `table`, `button`, or descendant.
- Confirm the container has usable width; Markdown Flow does not set message width.
- For Next.js, import package CSS in `app/layout.tsx`, not inside a Server Component rendered conditionally.

## The host application changed after importing CSS

- Confirm you are testing the current package version.
- Remove playground CSS or `.chat-markdown` overrides copied during an earlier integration.
- Search the built CSS for a stale global import if you cache package build artifacts.
- Clear the framework CSS cache and restart the development server.
- Create a minimal page with one button outside and one renderer inside; outside computed styles should not change.

## Next.js reports a missing module in the React Client Manifest

After installing or replacing a local tarball, Next.js can retain an RSC manifest that references the previous `node_modules` tree. If the error includes `React Client Manifest`, a package path such as `lucide-react`, or an `*.mjs#default` reference, stop the development server, remove only the Next build cache, and start it again:

```bash
rm -rf .next
npm run dev
```

This is a Next.js cache recovery step after a dependency change; it is not required for ordinary Markdown Flow usage or source edits.

## Citations do not appear

- Pass `sources` to `AIResponse`.
- Use a bare stable source ID such as `policy-42`.
- Cite it exactly as `[cite:policy-42]`.
- Do not include brackets or the `cite:` prefix in the source object’s `id`.
- Ensure the server returns source metadata authorized for the current user.

## Streaming flickers or restarts

- Preserve the existing string as an exact prefix when appending chunks.
- Do not trim or rewrite earlier content on each update.
- Flush the decoder after the stream completes.
- Keep provider event JSON and tool-call arguments out of the rendered text.
- A changed prefix is a replacement and is intentionally reparsed.

## The CLI cannot load the AI API

For a repository checkout, run the package build before the CLI. For an installed package, reinstall the exact version and run:

```bash
npx markdown-flow doctor
```

The CLI is optional. React rendering and the exported compact prompt do not depend on it.

## A backend prompt file is missing

Resolve prompt assets from a framework or environment application root, and throw during startup if the file is absent. Do not silently append an empty string. Avoid source-depth calculations such as repeated `dirname(__file__)` or `.parent.parent.parent`; they change when code moves.
