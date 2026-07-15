"use client";

import React from "react";

export type MarkdownFlowAppearance = "native" | "polished" | "unstyled";
export type MarkdownFlowThemeName = "inherit" | "light" | "dark";

export interface MarkdownFlowThemeVariables {
  accent?: string;
  surface?: string;
  surfaceSubtle?: string;
  surfaceRaised?: string;
  text?: string;
  textMuted?: string;
  textSubtle?: string;
  border?: string;
  borderStrong?: string;
  success?: string;
  warning?: string;
  danger?: string;
  radius?: string;
  radiusSmall?: string;
  radiusLarge?: string;
  font?: string;
  variables?: Readonly<Record<`--mf-${string}`, string | number | undefined>>;
}

export type MarkdownFlowTheme = MarkdownFlowThemeName | MarkdownFlowThemeVariables;

export type MarkdownFlowClassSlot =
  | "root"
  | "content"
  | "block"
  | "callout"
  | "metrics"
  | "metric"
  | "timeline"
  | "step"
  | "comparison"
  | "accordion"
  | "tabs"
  | "cards"
  | "fileTree"
  | "progress"
  | "checklist"
  | "status"
  | "quote"
  | "chart"
  | "mermaid"
  | "code"
  | "table"
  | "citation"
  | "fallback"
  | "media"
  | "image"
  | "embed"
  | "map"
  | "artifact"
  | "stream";

export type MarkdownFlowClasses = Partial<Record<MarkdownFlowClassSlot, string>>;

export interface MarkdownFlowPresentationProps {
  appearance?: MarkdownFlowAppearance;
  theme?: MarkdownFlowTheme;
  className?: string;
  classes?: MarkdownFlowClasses;
  style?: React.CSSProperties;
}

interface PresentationContextValue {
  classes?: MarkdownFlowClasses;
}

const PresentationContext = React.createContext<PresentationContextValue | null>(null);

export function joinClassNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function useMarkdownFlowClass(slot: MarkdownFlowClassSlot, ...base: Array<string | false | null | undefined>): string {
  const presentation = React.useContext(PresentationContext);
  const isBlock = base.includes("mf-block");
  return joinClassNames(...base, isBlock && presentation?.classes?.block, presentation?.classes?.[slot]);
}

export function useMarkdownFlowPresentation(): PresentationContextValue | null {
  return React.useContext(PresentationContext);
}

function themeStyle(theme: MarkdownFlowTheme | undefined): React.CSSProperties {
  if (!theme || typeof theme === "string") return {};
  const variables: Record<string, string | number | undefined> = {
    "--mf-accent": theme.accent,
    "--mf-surface": theme.surface,
    "--mf-surface-subtle": theme.surfaceSubtle,
    "--mf-surface-raised": theme.surfaceRaised,
    "--mf-text": theme.text,
    "--mf-text-muted": theme.textMuted,
    "--mf-text-subtle": theme.textSubtle,
    "--mf-border": theme.border,
    "--mf-border-strong": theme.borderStrong,
    "--mf-success": theme.success,
    "--mf-warning": theme.warning,
    "--mf-danger": theme.danger,
    "--mf-radius-sm": theme.radiusSmall,
    "--mf-radius-md": theme.radius,
    "--mf-radius-lg": theme.radiusLarge,
    "--mf-font": theme.font,
    ...theme.variables,
  };
  return Object.fromEntries(Object.entries(variables).filter(([, value]) => value !== undefined)) as React.CSSProperties;
}

export function MarkdownFlowPresentationRoot({
  appearance = "native",
  theme = "inherit",
  className,
  classes,
  style,
  children,
  ...attributes
}: MarkdownFlowPresentationProps & React.HTMLAttributes<HTMLDivElement>) {
  const themeName = typeof theme === "string" ? theme : "inherit";
  const value = React.useMemo(() => ({ classes }), [classes]);
  const rootStyle = React.useMemo(() => ({ ...themeStyle(theme), ...style }), [style, theme]);

  return (
    <PresentationContext.Provider value={value}>
      <div
        {...attributes}
        data-markdown-flow=""
        data-mf-appearance={appearance}
        data-mf-theme={themeName}
        className={joinClassNames("markdown-render", "mf-root", classes?.root, className)}
        style={rootStyle}
      >
        {children}
      </div>
    </PresentationContext.Provider>
  );
}
