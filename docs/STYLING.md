# Styling and themes

Markdown Flow renders response content, not the surrounding chat shell. The root inherits the host font and text color, remains transparent, and does not set page width, chat padding, or a message background.

## Appearance modes

```tsx
<AIResponse content={content} appearance="native" />
<AIResponse content={content} appearance="polished" />
<AIResponse content={content} appearance="unstyled" />
```

- `native` is the default. It uses restrained borders and surfaces derived from the host color.
- `polished` uses richer surfaces and stronger accents while staying scoped.
- `unstyled` preserves semantic markup, accessibility, and structural class hooks while removing package presentation.

## Theme inheritance

The default is `theme="inherit"`. It follows the color and `color-scheme` of the nearest host container, including applications that switch dark mode with a class.

```tsx
<AIResponse content={content} theme="inherit" />
<AIResponse content={content} theme="light" />
<AIResponse content={content} theme="dark" />
```

Prefer `inherit`; use an explicit theme only when the response surface intentionally differs from its parent.

## Theme object

```tsx
<AIResponse
  content={content}
  theme={{
    accent: "#6366f1",
    surface: "transparent",
    radius: "10px",
    font: "inherit",
  }}
/>
```

The object sets scoped CSS variables on this renderer. It does not inject a style tag or mutate global variables.

## CSS variables

```css
.brand-answer {
  --mf-font: inherit;
  --mf-text: currentColor;
  --mf-text-muted: color-mix(in srgb, currentColor 62%, transparent);
  --mf-text-subtle: color-mix(in srgb, currentColor 46%, transparent);
  --mf-accent: #6366f1;
  --mf-success: #16803c;
  --mf-warning: #b35c00;
  --mf-danger: #c62828;
  --mf-surface: transparent;
  --mf-surface-subtle: color-mix(in srgb, currentColor 4%, transparent);
  --mf-surface-raised: color-mix(in srgb, currentColor 6%, transparent);
  --mf-border: color-mix(in srgb, currentColor 13%, transparent);
  --mf-border-strong: color-mix(in srgb, currentColor 20%, transparent);
  --mf-radius-sm: 6px;
  --mf-radius-md: 10px;
  --mf-radius-lg: 14px;
  --mf-block-gap: 1.5rem;
  --mf-section-gap: 2rem;
}
```

Apply them through `className`:

```tsx
<AIResponse content={content} className="brand-answer" />
```

Do not override internal generated utility combinations. Use semantic variables or stable hooks such as `mf-root`, `mf-block`, `mf-callout`, `mf-metrics`, `mf-metric`, `mf-timeline`, `mf-step`, `mf-chart`, `mf-mermaid`, `mf-code`, `mf-table`, `mf-citation`, and `mf-fallback`.

## Per-part classes

```tsx
<AIResponse
  content={content}
  classes={{ metric: "dashboard-metric", chart: "dashboard-chart" }}
/>
```

Keep overrides under an application class so they remain local:

```css
.support-chat .dashboard-metric {
  font-variant-numeric: tabular-nums;
}
```

## Host CSS checklist

- Import `markdown-flow/styles.css` once at the application shell.
- Remove old copied playground rules and `.chat-markdown` overrides.
- Do not add Tailwind processing for Markdown Flow’s CSS.
- Let the package handle local overflow for code, tables, charts, and diagrams.
- Style chat bubble width, background, padding, and radius in the host application.
- Check broad host rules such as `.message * { ... }` when a control looks wrong.
