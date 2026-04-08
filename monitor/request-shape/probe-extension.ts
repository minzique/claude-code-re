import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type SystemSource = { text: string } | { file: string } | { current: CurrentRef };
type CurrentRef =
  | "billing"
  | "identity"
  | "prompt"
  | "all"
  | "all_after_billing"
  | "all_after_identity";

interface ProbeSpec {
  name?: string;
  systemStrategy?: "keep" | "replace";
  system?: SystemSource[];
  dropTools?: boolean;
  keepTools?: string[];
}

interface TextBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral"; ttl?: "1h" };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTextBlock(value: unknown): value is TextBlock {
  return isObject(value) && value.type === "text" && typeof value.text === "string";
}

function getSpec(): ProbeSpec | null {
  const inline = process.env.PI_PROBE_SPEC;
  if (inline) return JSON.parse(inline) as ProbeSpec;

  const specFile = process.env.PI_PROBE_SPEC_FILE;
  if (!specFile) return null;
  return JSON.parse(readFileSync(specFile, "utf8")) as ProbeSpec;
}

function getLogFile(): string {
  return resolve(process.env.PI_PROBE_LOG_FILE ?? join(process.cwd(), ".pi", "request-shape-probe.jsonl"));
}

function cloneTextBlock(block: TextBlock): TextBlock {
  return block.cache_control ? { ...block, cache_control: { ...block.cache_control } } : { ...block };
}

function createBlock(text: string, cacheTemplate?: TextBlock): TextBlock {
  const trimmed = text.replace(/\r\n/g, "\n");
  if (trimmed.startsWith("x-anthropic-billing-header:")) {
    return { type: "text", text: trimmed };
  }
  return cacheTemplate?.cache_control
    ? { type: "text", text: trimmed, cache_control: { ...cacheTemplate.cache_control } }
    : { type: "text", text: trimmed };
}

function resolveSystemSource(source: SystemSource, currentBlocks: TextBlock[], cacheTemplate?: TextBlock): TextBlock[] {
  if ("text" in source) return [createBlock(source.text, cacheTemplate)];
  if ("file" in source) return [createBlock(readFileSync(resolve(source.file), "utf8"), cacheTemplate)];

  const billingIndex = currentBlocks.findIndex((block) => block.text.startsWith("x-anthropic-billing-header:"));
  const identityIndex = currentBlocks.findIndex(
    (block, index) => index !== billingIndex && block.text.trim().length > 0,
  );

  switch (source.current) {
    case "billing":
      return billingIndex >= 0 ? [cloneTextBlock(currentBlocks[billingIndex])] : [];
    case "identity":
      return identityIndex >= 0 ? [cloneTextBlock(currentBlocks[identityIndex])] : [];
    case "prompt":
      return identityIndex >= 0 ? currentBlocks.slice(identityIndex + 1).map(cloneTextBlock) : [];
    case "all_after_billing":
      return billingIndex >= 0 ? currentBlocks.slice(billingIndex + 1).map(cloneTextBlock) : currentBlocks.map(cloneTextBlock);
    case "all_after_identity":
      return identityIndex >= 0 ? currentBlocks.slice(identityIndex + 1).map(cloneTextBlock) : [];
    case "all":
      return currentBlocks.map(cloneTextBlock);
  }
}

function summarizeSystem(system: TextBlock[]): string[] {
  return system.map((block, index) => `${index}: ${block.text.slice(0, 120)}`);
}

export default function (pi: ExtensionAPI) {
  const logFile = getLogFile();
  mkdirSync(dirname(logFile), { recursive: true });

  const baseUrl = process.env.PI_PROBE_BASE_URL;
  if (baseUrl) {
    pi.registerProvider("anthropic", { baseUrl });
  }

  pi.on("before_provider_request", (event) => {
    if (!isObject(event.payload)) return;
    if (!Array.isArray(event.payload.system) || !Array.isArray(event.payload.messages)) return;

    const spec = getSpec();
    const currentSystem = event.payload.system.filter(isTextBlock).map(cloneTextBlock);
    const cacheTemplate = currentSystem.find((block) => !block.text.startsWith("x-anthropic-billing-header:"));

    let nextPayload: Record<string, unknown> = { ...event.payload };
    if (spec?.systemStrategy === "replace" && spec.system) {
      const nextSystem = spec.system.flatMap((source) => resolveSystemSource(source, currentSystem, cacheTemplate));
      nextPayload = { ...nextPayload, system: nextSystem };
    }

    if (spec?.dropTools) {
      nextPayload = { ...nextPayload, tools: [] };
    } else if (spec?.keepTools && Array.isArray(nextPayload.tools)) {
      const keep = new Set(spec.keepTools.map((tool) => tool.toLowerCase()));
      nextPayload = {
        ...nextPayload,
        tools: (nextPayload.tools as Array<Record<string, unknown>>).filter(
          (tool) => typeof tool.name === "string" && keep.has(tool.name.toLowerCase()),
        ),
      };
    }

    appendFileSync(
      logFile,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        specName: spec?.name ?? "baseline",
        before: {
          system: summarizeSystem(currentSystem),
          toolCount: Array.isArray(event.payload.tools) ? event.payload.tools.length : 0,
        },
        after: {
          system: Array.isArray(nextPayload.system) ? summarizeSystem((nextPayload.system as unknown[]).filter(isTextBlock)) : [],
          toolCount: Array.isArray(nextPayload.tools) ? nextPayload.tools.length : 0,
        },
        payload: nextPayload,
      })}\n`,
      "utf8",
    );

    return nextPayload;
  });
}
