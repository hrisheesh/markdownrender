import type { ReactNode } from "react";

import type { MarkdownFlowResolverResult } from "./data";
import type { MarkdownFlowRenderPolicy } from "./protocol";

export interface MarkdownFlowArtifactValidationSuccess<T> {
  valid: true;
  value: T;
}

export interface MarkdownFlowArtifactValidationFailure {
  valid: false;
  reason: string;
}

export type MarkdownFlowArtifactValidationResult<T> = MarkdownFlowArtifactValidationSuccess<T> | MarkdownFlowArtifactValidationFailure;

/** A strict, host-owned schema parser for the model-provided artifact input. */
export interface MarkdownFlowArtifactSchema<T> {
  parse(input: unknown): MarkdownFlowArtifactValidationResult<T>;
}

export interface MarkdownFlowArtifactFallbackProps {
  name: string;
  version: string;
  reason: string;
  state: "invalid" | "denied" | "loading" | "unavailable" | "error";
  retry?: () => void;
}

export interface MarkdownFlowArtifactRenderProps<TInput, TValue> {
  name: string;
  version: string;
  input: TInput;
  value: TValue;
  refresh?: () => void;
}

export interface MarkdownFlowArtifactDefinition<TInput = unknown, TValue = TInput> {
  name: string;
  version: string;
  schema: MarkdownFlowArtifactSchema<TInput>;
  render(props: MarkdownFlowArtifactRenderProps<TInput, TValue>): ReactNode;
  fallback(props: MarkdownFlowArtifactFallbackProps): ReactNode;
  /** Resolve host-authorized data. Authorization must remain enforced by the host. */
  resolver?: (input: TInput) => Promise<MarkdownFlowResolverResult<TValue>>;
  /** A synchronous, artifact-specific permission boundary in addition to render policy. */
  authorize?: (input: TInput) => boolean;
}

export interface MarkdownFlowArtifactRegistry {
  get(name: string, version: string): MarkdownFlowArtifactDefinition | undefined;
  readonly artifacts: readonly MarkdownFlowArtifactDefinition[];
}

export interface MarkdownFlowValidatedArtifact<TInput = unknown, TValue = TInput> {
  definition: MarkdownFlowArtifactDefinition<TInput, TValue>;
  input: TInput;
}

export type MarkdownFlowArtifactBlockValidationResult =
  | { valid: true; artifact: MarkdownFlowValidatedArtifact }
  | (MarkdownFlowArtifactValidationFailure & {
    definition?: MarkdownFlowArtifactDefinition;
    state?: "invalid" | "denied";
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Creates an immutable registry; duplicate name/version pairs fail during application startup. */
export function createMarkdownFlowArtifactRegistry(
  artifacts: readonly MarkdownFlowArtifactDefinition[],
): MarkdownFlowArtifactRegistry {
  const entries = new Map<string, MarkdownFlowArtifactDefinition>();
  for (const artifact of artifacts) {
    if (!artifact.name || !artifact.version) {
      throw new Error("Markdown Flow artifacts require a non-empty name and version.");
    }
    const key = `${artifact.name}\u0000${artifact.version}`;
    if (entries.has(key)) throw new Error(`Duplicate Markdown Flow artifact: ${artifact.name}@${artifact.version}.`);
    entries.set(key, artifact);
  }
  const registered = Object.freeze([...artifacts]);
  return Object.freeze({
    artifacts: registered,
    get: (name: string, version: string) => entries.get(`${name}\u0000${version}`),
  });
}

/** Validates the strict JSON envelope used by model-generated custom artifacts. */
export function validateMarkdownFlowArtifactBlock(
  code: string,
  registry: MarkdownFlowArtifactRegistry | undefined,
  policy: MarkdownFlowRenderPolicy | undefined,
): MarkdownFlowArtifactBlockValidationResult {
  if (!registry) return { valid: false, reason: "Custom artifacts require an artifact registry." };
  if (!policy) return { valid: false, reason: "Custom artifacts require a render policy." };
  if (code.length > (policy.maxBlockCharacters ?? 20_000)) return { valid: false, reason: "This artifact exceeds the configured size limit." };

  let envelope: unknown;
  try {
    envelope = JSON.parse(code);
  } catch {
    return { valid: false, reason: "Custom artifact configuration must be valid JSON." };
  }
  if (!isRecord(envelope) || Object.keys(envelope).some((key) => !["name", "version", "input"].includes(key))) {
    return { valid: false, reason: "Custom artifact configuration must contain only name, version, and input." };
  }
  if (typeof envelope.name !== "string" || !envelope.name || typeof envelope.version !== "string" || !envelope.version || !isRecord(envelope.input)) {
    return { valid: false, reason: "Custom artifacts require a name, version, and object input." };
  }
  if (!policy.allowedArtifacts?.includes(envelope.name)) {
    return { valid: false, reason: "This custom artifact is not permitted." };
  }
  const allowedVersions = policy.allowedArtifactVersions?.[envelope.name];
  if (!allowedVersions?.includes(envelope.version)) {
    return { valid: false, reason: "This custom artifact version is not permitted." };
  }
  const definition = registry.get(envelope.name, envelope.version);
  if (!definition) return { valid: false, reason: "This custom artifact is not registered." };
  const parsed = definition.schema.parse(envelope.input);
  if (!parsed.valid) return { ...parsed, definition, state: "invalid" };
  try {
    if (definition.authorize && !definition.authorize(parsed.value)) {
      return { valid: false, reason: "You do not have access to this custom artifact.", definition, state: "denied" };
    }
  } catch {
    return { valid: false, reason: "You do not have access to this custom artifact.", definition, state: "denied" };
  }
  return { valid: true, artifact: { definition, input: parsed.value } };
}
