#!/usr/bin/env node

import { access, readFile, realpath, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SUPPORTED_FORMATS = new Set(["json"]);

export const usage = `Usage: markdown-flow <command> [options]

Commands:
  prompt           Print optional model instructions (compact by default).
  verify           Validate model instructions from stdin or a file.
  doctor           Check that the installed package API is available.
  generate-prompt, verify-prompt, and generate-config remain supported aliases.

Options:
  --preset <name>  One of minimal, chat, rag, technical, analytics, showcase (default: chat).
  --blocks <list>  Comma-separated task-specific blocks, for example chart,timeline.
  --compact        Emit the compact contract (the default for prompt).
  --strict         Emit or verify the full strict contract.
  --format <name>  Output format for generate-config (default: json).
  --output <path>  Write generated output to a file instead of stdout.
  --input <path>   Read verify input from a file instead of stdin.
  --help           Show this help message.`;

const COMMAND_ALIASES = new Map([
  ["prompt", "prompt"],
  ["generate-prompt", "prompt"],
  ["verify", "verify"],
  ["verify-prompt", "verify"],
  ["generate-config", "config"],
  ["config", "config"],
  ["doctor", "doctor"],
]);

function cliError(message) {
  const error = new Error(message);
  error.isCliError = true;
  return error;
}

export function parseArguments(argv) {
  const [requestedCommand, ...tokens] = argv;
  if (!requestedCommand || requestedCommand === "--help" || requestedCommand === "-h") return { help: true };
  const command = COMMAND_ALIASES.get(requestedCommand);
  if (!command) {
    throw cliError(`Unknown command: ${requestedCommand}. Run \`markdown-flow --help\` for usage.`);
  }

  const options = { command };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--help" || token === "-h") return { help: true };
    if (!token.startsWith("--")) {
      if (command === "verify" && !options.input) {
        options.input = token;
        continue;
      }
      if ((command === "prompt" || command === "config") && !options.output) {
        options.output = token;
        continue;
      }
      throw cliError(`Unexpected argument: ${token}. Run \`markdown-flow ${command} --help\` for usage.`);
    }
    const key = token.slice(2);
    if (key === "compact" || key === "strict") {
      if (command !== "prompt" && command !== "verify") throw cliError(`${token} is only supported by prompt and verify.`);
      if (key in options) throw cliError(`Option ${token} may only be provided once.`);
      options[key] = true;
      continue;
    }
    if (!new Set(["preset", "blocks", "format", "output", "input"]).has(key)) {
      throw cliError(`Unknown option: ${token}. Run \`markdown-flow ${command} --help\` for usage.`);
    }
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) throw cliError(`Option ${token} requires a value.`);
    index += 1;
    if (key === "preset" && !["prompt", "config", "verify"].includes(command)) {
      throw cliError("--preset is only supported by prompt, config, and verify.");
    }
    if (key === "blocks" && !["prompt", "verify"].includes(command)) throw cliError("--blocks is only supported by prompt and verify.");
    if (key === "input" && command !== "verify") throw cliError("--input is only supported by verify.");
    if (key === "format" && command !== "config") throw cliError("--format is only supported by generate-config.");
    if (key === "output" && !["prompt", "config"].includes(command)) throw cliError("--output is only supported by generated output commands.");
    if (key in options) throw cliError(`Option ${token} may only be provided once.`);
    options[key] = value;
  }
  if (options.compact && options.strict) throw cliError("--compact and --strict cannot be used together.");
  return options;
}

async function loadApi() {
  try {
    return await import("markdown-flow/ai");
  } catch (publicApiError) {
    const bundledApi = resolve(PACKAGE_ROOT, "dist/ai/index.mjs");
    try {
      await access(bundledApi, constants.R_OK);
      return await import(pathToFileURL(bundledApi).href);
    } catch {
      throw cliError(`Markdown Flow's bundled AI API could not be loaded. Reinstall markdown-flow, or run \`npm run build:package\` before using this checkout. (${publicApiError.message})`);
    }
  }
}

async function loadPackageMetadata() {
  try {
    return JSON.parse(await readFile(resolve(PACKAGE_ROOT, "package.json"), "utf8"));
  } catch (error) {
    throw cliError(`Markdown Flow package metadata could not be read: ${error.message}`);
  }
}

function getPreset(api, requestedPreset) {
  const preset = requestedPreset ?? "chat";
  if (!api.AI_RESPONSE_PRESETS.includes(preset)) {
    throw cliError(`Unknown preset: ${preset}. Supported presets: ${api.AI_RESPONSE_PRESETS.join(", ")}.`);
  }
  return preset;
}

function promptRequirements(api, preset) {
  const policy = api.getAIResponsePresetPolicy(preset);
  return {
    protocol: api.MARKDOWN_FLOW_PROTOCOL,
    allowedBlocks: policy.allowedBlocks ?? [],
  };
}

function parseBlocks(api, value, fallback) {
  if (!value) return fallback;
  const blocks = [...new Set(value.split(",").map((block) => block.trim()).filter(Boolean))];
  if (!blocks.length) throw cliError("--blocks requires at least one block name.");
  const known = Array.isArray(api.MARKDOWN_FLOW_LLM_BLOCK_TYPES) ? new Set(api.MARKDOWN_FLOW_LLM_BLOCK_TYPES) : undefined;
  const unknown = known ? blocks.filter((block) => !known.has(block)) : [];
  if (unknown.length) throw cliError(`Unknown block${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`);
  return blocks;
}

export function verifyPrompt(prompt, requirements) {
  const failures = [];
  if (!prompt.trim()) failures.push("prompt is empty");
  if (!prompt.includes(requirements.protocol)) failures.push(`missing protocol declaration (${requirements.protocol})`);
  const missingBlocks = requirements.allowedBlocks.filter((block) => !prompt.includes(block));
  if (missingBlocks.length) failures.push(`missing requested blocks (${missingBlocks.join(", ")})`);
  if (requirements.strict && !prompt.includes("strict JSON")) failures.push("missing strict JSON requirement");
  if (!prompt.includes("[cite:source-id]")) failures.push("missing citation-token requirement");
  if (!/Never (?:emit|invent)|Do not invent/.test(prompt)) failures.push("missing source and data safety requirement");
  if (!/meaningful|non-empty|placeholder/.test(prompt)) failures.push("missing meaningful-data requirement");
  return failures;
}

async function writeOutput(output, value, io) {
  if (output) {
    const destination = resolve(process.cwd(), output);
    try {
      await writeFile(destination, value, "utf8");
    } catch (error) {
      throw cliError(`Could not write output file ${destination}: ${error.message}`);
    }
    io.stdout.write(`Wrote ${destination}\n`);
  } else {
    io.stdout.write(value);
  }
}

async function readStdin(io) {
  let value = "";
  for await (const chunk of io.stdin) value += chunk;
  return value;
}

export async function runCli(argv, { api = undefined, io = process } = {}) {
  const options = parseArguments(argv);
  if (options.help) {
    io.stdout.write(`${usage}\n`);
    return 0;
  }
  const markdownFlow = api ?? await loadApi();
  const preset = options.command === "doctor" ? undefined : getPreset(markdownFlow, options.preset);

  if (options.command === "prompt") {
    const blocks = parseBlocks(markdownFlow, options.blocks, promptRequirements(markdownFlow, preset).allowedBlocks);
    const output = `${markdownFlow.createMarkdownFlowInstructions({
      blocks,
      detail: options.strict ? "full" : "compact",
      mode: options.strict ? "strict" : "normalize",
    })}\n`;
    await writeOutput(options.output, output, io);
    return 0;
  }
  if (options.command === "config") {
    const format = options.format ?? "json";
    if (!SUPPORTED_FORMATS.has(format)) throw cliError(`Unsupported config format: ${format}. Supported formats: json.`);
    const config = {
      protocol: markdownFlow.MARKDOWN_FLOW_PROTOCOL,
      preset,
      renderPolicy: markdownFlow.getAIResponsePresetPolicy(preset),
    };
    await writeOutput(options.output, `${JSON.stringify(config, null, 2)}\n`, io);
    return 0;
  }
  if (options.command === "verify") {
    let prompt;
    if (options.input) {
      const source = resolve(process.cwd(), options.input);
      try {
        prompt = await readFile(source, "utf8");
      } catch (error) {
        throw cliError(`Could not read prompt file ${source}: ${error.message}`);
      }
    } else {
      prompt = await readStdin(io);
    }
    const requirements = promptRequirements(markdownFlow, preset);
    const failures = verifyPrompt(prompt, {
      ...requirements,
      allowedBlocks: parseBlocks(markdownFlow, options.blocks, requirements.allowedBlocks),
      strict: options.strict === true,
    });
    if (failures.length) throw cliError(`Prompt verification failed: ${failures.join("; ")}.`);
    io.stdout.write(`Prompt verified for preset \"${preset}\".\n`);
    return 0;
  }

  const bundledApi = resolve(PACKAGE_ROOT, "dist/ai/index.mjs");
  const packageMetadata = await loadPackageMetadata();
  const checks = [
    ["installed version", typeof packageMetadata.version === "string" && packageMetadata.version.length > 0],
    ["public AI API", typeof markdownFlow.createMarkdownFlowInstructions === "function"],
    ["compact prompt", typeof markdownFlow.MARKDOWN_FLOW_COMPACT_PROMPT === "string" && markdownFlow.MARKDOWN_FLOW_COMPACT_PROMPT.length > 0],
    ["protocol", typeof markdownFlow.MARKDOWN_FLOW_PROTOCOL === "string"],
    ["presets", Array.isArray(markdownFlow.AI_RESPONSE_PRESETS)],
    ["bundled AI module", await access(bundledApi, constants.R_OK).then(() => true, () => false)],
  ];
  const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
  for (const [name, passed] of checks) io.stdout.write(`${passed ? "✓" : "✗"} ${name}\n`);
  if (failed.length) throw cliError(`Doctor found unavailable components: ${failed.join(", ")}. Run \`npm run build:package\` or reinstall markdown-flow.`);
  return 0;
}

async function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  const [entrypoint, modulePath] = await Promise.all([
    realpath(process.argv[1]),
    realpath(fileURLToPath(import.meta.url)),
  ]);
  return entrypoint === modulePath;
}

if (await isCliEntrypoint()) {
  runCli(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`markdown-flow: ${error.message}\n`);
      process.exitCode = error.isCliError ? 2 : 1;
    },
  );
}
