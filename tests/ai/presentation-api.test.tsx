// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

import { AIResponse } from "../../src/ai/AIResponse";

describe("AIResponse presentation API", () => {
  it("is native and theme-inheriting by default", () => {
    const { container } = render(<AIResponse content="Hello" status="complete" />);
    const root = container.querySelector("[data-markdown-flow]");

    expect(root).toHaveClass("markdown-render", "mf-root");
    expect(root).toHaveAttribute("data-mf-appearance", "native");
    expect(root).toHaveAttribute("data-mf-theme", "inherit");
  });

  it("scopes theme variables and custom classes to the response root", () => {
    const { container } = render(
      <AIResponse
        content="Hello"
        status="complete"
        appearance="polished"
        theme={{ accent: "#7c3aed", radius: "12px", variables: { "--mf-space-block": "2rem" } }}
        className="my-answer"
        classes={{ root: "brand-root", content: "brand-content" }}
      />,
    );
    const root = container.querySelector<HTMLElement>("[data-markdown-flow]");

    expect(root).toHaveClass("my-answer", "brand-root");
    expect(root).toHaveAttribute("data-mf-appearance", "polished");
    expect(root?.style.getPropertyValue("--mf-accent")).toBe("#7c3aed");
    expect(root?.style.getPropertyValue("--mf-radius-md")).toBe("12px");
    expect(root?.style.getPropertyValue("--mf-space-block")).toBe("2rem");
    expect(container.querySelector(".mf-content")).toHaveClass("brand-content");
  });

  it("applies component class hooks to structured output", () => {
    const content = '```metrics\n{"metrics":[{"label":"Users","value":"24.8K"}]}\n```';
    const { container } = render(<AIResponse content={content} status="complete" classes={{ metrics: "brand-metrics", metric: "brand-metric" }} />);

    expect(container.querySelector(".mf-metrics-block")).toHaveClass("brand-metrics");
    expect(container.querySelector(".mf-metric")).toHaveClass("brand-metric");
  });

  it("turns supplied sources into citations without requiring a preset", () => {
    render(
      <AIResponse
        content="Supported claim [cite:guide]"
        status="complete"
        sources={[{ id: "guide", title: "Integration guide", preview: "Verified source" }]}
      />,
    );

    expect(screen.getByRole("button", { name: "Show source: Integration guide" })).toBeInTheDocument();
  });

  it("exposes unstyled and explicit color-scheme modes without changing markup semantics", () => {
    const { container } = render(<AIResponse content="# Heading" status="complete" appearance="unstyled" theme="dark" />);
    const root = container.querySelector("[data-markdown-flow]");

    expect(root).toHaveAttribute("data-mf-appearance", "unstyled");
    expect(root).toHaveAttribute("data-mf-theme", "dark");
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("mf-heading", "mf-h1");
  });

  it("safely enhances obvious ordinary Markdown without backend instructions", () => {
    const content = "- [x] Install the package\n- [ ] Render the answer";
    const { container } = render(<AIResponse content={content} status="complete" />);

    expect(container.querySelector(".mf-checklist")).toBeInTheDocument();
    expect(container.querySelectorAll(".mf-checklist-item")).toHaveLength(2);
  });

  it("allows enhancement to be disabled and reports integration health", () => {
    const onDiagnostics = vi.fn();
    const content = "- [x] Install the package\n- [ ] Render the answer";
    const { container } = render(
      <AIResponse content={content} status="complete" enhance="off" onDiagnostics={onDiagnostics} />,
    );

    expect(container.querySelector(".mf-checklist")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".mf-task-input")).toHaveLength(2);
    expect(onDiagnostics).toHaveBeenCalledWith(expect.objectContaining({
      markdownRendered: true,
      blocksDetected: 0,
      blocksRendered: 0,
    }));
  });
});
