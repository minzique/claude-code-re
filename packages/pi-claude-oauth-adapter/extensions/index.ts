import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const DOCS_MARKER =
  "Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):";
const IDENTITY_BLOCK = "You are Claude Code, Anthropic's official CLI for Claude.";
const CUSTOM_TYPE = "claude-oauth-docs-context";
const END_MARKERS = ["\n\n# Project Context", "\n\n<available_skills>", "\nCurrent date:"] as const;
const PI_TOPIC_REGEX =
  /\b(pi|@mariozechner\/pi-|pi-mono|coding agent harness|pi sdk|pi extension|pi theme|pi skill|pi tui|pi package|prompt templates?|keybindings?|custom providers?|adding models?)\b/i;
const DEFAULT_CLAUDE_CODE_VERSION = "2.1.96";
const BILLING_SALT = "59cf53e54c78";
const DEFAULT_ENTRYPOINT = "pi";
const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));

type ReinjectionMode = "none" | "prepend-custom-message" | "append-custom-message" | "user-reminder";
type ReinjectionScope = "never" | "always" | "pi-only";

interface ActiveTurnState {
  docsSection: string;
  shouldInject: boolean;
  mode: ReinjectionMode;
  prompt: string;
  timestamp: number;
}

interface TextContentPart {
  type: "text";
  text: string;
}

interface ImageContentPart {
  type: "image";
  source: unknown;
}

type MessageContentPart = TextContentPart | ImageContentPart;

type CustomLikeMessage = {
  role: "custom";
  customType: string;
  content: string | MessageContentPart[];
  display: boolean;
  timestamp: number;
};

type UserLikeMessage = Extract<AgentMessage, { role: "user" }>;

type TextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral"; ttl?: "1h" };
};

interface PayloadLike {
  system?: unknown;
  messages?: unknown;
  tools?: unknown;
}

let activeTurn: ActiveTurnState | null = null;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPayloadLike(value: unknown): value is PayloadLike {
  return isObject(value);
}

function isTextBlock(value: unknown): value is TextBlock {
  return isObject(value) && value.type === "text" && typeof value.text === "string";
}

function isUserMessage(message: AgentMessage): message is UserLikeMessage {
  return message.role === "user";
}

function getEnvMode(): ReinjectionMode {
  const value = process.env.PI_CLAUDE_OAUTH_REINJECT_MODE;
  if (value === "none" || value === "prepend-custom-message" || value === "append-custom-message" || value === "user-reminder") {
    return value;
  }
  return "prepend-custom-message";
}

function getEnvScope(): ReinjectionScope {
  const value = process.env.PI_CLAUDE_OAUTH_REINJECT_SCOPE;
  if (value === "never" || value === "always" || value === "pi-only") {
    return value;
  }
  return "pi-only";
}

function getClaudeCodeVersion(): string {
  return process.env.PI_CLAUDE_CODE_VERSION ?? process.env.CLAUDE_CODE_VERSION ?? DEFAULT_CLAUDE_CODE_VERSION;
}

function getEntrypoint(): string {
  return process.env.PI_CLAUDE_CODE_ENTRYPOINT ?? process.env.CLAUDE_CODE_ENTRYPOINT ?? DEFAULT_ENTRYPOINT;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getBillingMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is Record<string, unknown> => isObject(block) && block.type === "text" && typeof block.text === "string")
    .map((block) => String(block.text))
    .join("\n");
}

function buildBillingHeader(messages: unknown, entrypoint: string = getEntrypoint()): string {
  const list = Array.isArray(messages) ? messages : [];
  const firstUserMessage = list.find((message) => isObject(message) && message.role === "user") as Record<string, unknown> | undefined;
  const messageText = firstUserMessage ? getBillingMessageText(firstUserMessage.content) : "";
  const version = getClaudeCodeVersion();
  const sampledChars = [4, 7, 20].map((index) => messageText[index] ?? "0").join("");
  const versionHash = sha256Hex(`${BILLING_SALT}${sampledChars}${version}`).slice(0, 3);
  const cch = sha256Hex(messageText).slice(0, 5);
  return `x-anthropic-billing-header: cc_version=${version}.${versionHash}; cc_entrypoint=${entrypoint}; cch=${cch};`;
}

function getLogFile(): string | null {
  const path = process.env.PI_CLAUDE_OAUTH_LOG_FILE;
  return path ? resolve(path) : null;
}

function log(event: string, details: Record<string, unknown>): void {
  const logFile = getLogFile();
  if (!logFile) return;
  mkdirSync(dirname(logFile), { recursive: true });
  appendFileSync(
    logFile,
    `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...details })}\n`,
    "utf8",
  );
}

function shouldApply(ctx: ExtensionContext): boolean {
  const model = ctx.model;
  return !!model && model.provider === "anthropic" && ctx.modelRegistry.isUsingOAuth(model);
}

function shouldInjectDocs(prompt: string): boolean {
  const scope = getEnvScope();
  if (scope === "never") return false;
  if (scope === "always") return true;
  return PI_TOPIC_REGEX.test(prompt);
}

function extractDocsSection(systemPrompt: string): { docsSection: string; strippedPrompt: string } | null {
  const start = systemPrompt.indexOf(DOCS_MARKER);
  if (start < 0) return null;

  let end = systemPrompt.length;
  for (const marker of END_MARKERS) {
    const index = systemPrompt.indexOf(marker, start);
    if (index >= 0 && index < end) end = index;
  }

  const docsSection = systemPrompt.slice(start, end).trim();
  const before = systemPrompt.slice(0, start).trimEnd();
  const after = systemPrompt.slice(end).trimStart();
  const strippedPrompt = [before, after].filter((part) => part.length > 0).join("\n\n").trim();
  return { docsSection, strippedPrompt };
}

function getPiPackageRoot(): string | null {
  const cliPath = process.argv[1];
  if (!cliPath) return null;

  try {
    const resolvedCliPath = realpathSync(cliPath);
    return dirname(dirname(resolvedCliPath));
  } catch {
    return null;
  }
}

function buildDynamicFallbackDocsSection(): string | null {
  const piRoot = getPiPackageRoot();
  if (!piRoot) return null;

  const readmePath = join(piRoot, "README.md");
  const docsPath = join(piRoot, "docs");
  const examplesPath = join(piRoot, "examples");
  return [
    DOCS_MARKER,
    `- Main documentation: ${readmePath}`,
    `- Additional docs: ${docsPath}`,
    `- Examples: ${examplesPath} (extensions, custom tools, SDK)`,
    "- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md)",
    "- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing",
    "- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)",
  ].join("\n");
}

function readFallbackDocsSection(): string | null {
  const override = process.env.PI_CLAUDE_OAUTH_DOCS_FILE;
  if (override) {
    const path = resolve(override);
    if (existsSync(path)) {
      const content = readFileSync(path, "utf8").trim();
      if (content.length > 0) return content;
    }
  }

  return buildDynamicFallbackDocsSection();
}

function wrapDocsContext(docsSection: string): string {
  return `<pi-docs-context>\n${docsSection}\n</pi-docs-context>`;
}

function summarizeMessages(messages: AgentMessage[]): Array<Record<string, unknown>> {
  return messages.slice(-4).map((message) => {
    if (message.role === "user" || message.role === "assistant" || message.role === "toolResult") {
      const content = Array.isArray(message.content)
        ? message.content
            .filter((part): part is TextContentPart => isObject(part) && part.type === "text" && typeof part.text === "string")
            .map((part) => part.text)
            .join("\n")
        : String(message.content);
      return { role: message.role, text: content.slice(0, 140) };
    }

    if (message.role === "custom") {
      const content = typeof message.content === "string"
        ? message.content
        : message.content
            .filter((part): part is TextContentPart => part.type === "text")
            .map((part) => part.text)
            .join("\n");
      return { role: message.role, customType: message.customType, text: content.slice(0, 140) };
    }

    return { role: message.role };
  });
}

function prependCustomMessage(messages: AgentMessage[], docsSection: string, timestamp: number): AgentMessage[] {
  const customMessage: CustomLikeMessage = {
    role: "custom",
    customType: CUSTOM_TYPE,
    content: wrapDocsContext(docsSection),
    display: false,
    timestamp,
  };

  const latestUserIndex = [...messages].findLastIndex((message) => isUserMessage(message));
  if (latestUserIndex < 0) return [...messages, customMessage as AgentMessage];

  const nextMessages = [...messages];
  nextMessages.splice(latestUserIndex, 0, customMessage as AgentMessage);
  return nextMessages;
}

function appendCustomMessage(messages: AgentMessage[], docsSection: string, timestamp: number): AgentMessage[] {
  const customMessage: CustomLikeMessage = {
    role: "custom",
    customType: CUSTOM_TYPE,
    content: wrapDocsContext(docsSection),
    display: false,
    timestamp,
  };

  const latestUserIndex = [...messages].findLastIndex((message) => isUserMessage(message));
  if (latestUserIndex < 0) return [...messages, customMessage as AgentMessage];

  const nextMessages = [...messages];
  nextMessages.splice(latestUserIndex + 1, 0, customMessage as AgentMessage);
  return nextMessages;
}

function prependReminderToLatestUser(messages: AgentMessage[], docsSection: string): AgentMessage[] {
  const latestUserIndex = [...messages].findLastIndex((message) => isUserMessage(message));
  if (latestUserIndex < 0) return messages;

  const reminder = `<system-reminder>\n${docsSection}\n</system-reminder>\n\n`;
  const nextMessages = structuredClone(messages);
  const latestUser = nextMessages[latestUserIndex];
  if (!isUserMessage(latestUser)) return messages;

  if (typeof latestUser.content === "string") {
    if (!latestUser.content.startsWith("<system-reminder>")) {
      latestUser.content = `${reminder}${latestUser.content}`;
    }
    return nextMessages;
  }

  const firstTextIndex = latestUser.content.findIndex((part) => part.type === "text");
  if (firstTextIndex < 0) {
    latestUser.content.unshift({ type: "text", text: reminder } as TextContentPart);
    return nextMessages;
  }

  const firstText = latestUser.content[firstTextIndex];
  if (firstText.type === "text" && !firstText.text.startsWith("<system-reminder>")) {
    latestUser.content[firstTextIndex] = { ...firstText, text: `${reminder}${firstText.text}` };
  }
  return nextMessages;
}

function injectDocs(messages: AgentMessage[], state: ActiveTurnState): AgentMessage[] {
  if (!state.shouldInject || state.mode === "none") return messages;

  switch (state.mode) {
    case "prepend-custom-message":
      return prependCustomMessage(messages, state.docsSection, state.timestamp);
    case "append-custom-message":
      return appendCustomMessage(messages, state.docsSection, state.timestamp);
    case "user-reminder":
      return prependReminderToLatestUser(messages, state.docsSection);
    case "none":
      return messages;
  }
}

function cloneBlock(block: TextBlock): TextBlock {
  return block.cache_control ? { ...block, cache_control: { ...block.cache_control } } : { ...block };
}

function ensurePromptBlock(blocks: TextBlock[], ctx: ExtensionContext): TextBlock[] {
  if (blocks.some((block) => !block.text.startsWith("x-anthropic-billing-header:"))) {
    return blocks;
  }

  const systemPrompt = ctx.getSystemPrompt();
  const extracted = extractDocsSection(systemPrompt);
  const text = extracted?.strippedPrompt ?? systemPrompt;
  if (!text.trim()) return blocks;

  const template = blocks.find((block) => block.cache_control)?.cache_control;
  return [
    ...blocks,
    template ? { type: "text", text, cache_control: { ...template } } : { type: "text", text },
  ];
}

function normalizeSystemBlocks(blocks: TextBlock[], ctx: ExtensionContext, messages: unknown): { blocks: TextBlock[]; billingAdded: boolean } {
  let billingAdded = false;
  const nextBlocks: TextBlock[] = [];

  for (const block of blocks) {
    if (block.text === IDENTITY_BLOCK) {
      continue;
    }

    if (block.text.startsWith("x-anthropic-billing-header:")) {
      nextBlocks.push(cloneBlock(block));
      continue;
    }

    if (!block.text.includes(DOCS_MARKER)) {
      nextBlocks.push(cloneBlock(block));
      continue;
    }

    const extracted = extractDocsSection(block.text);
    if (!extracted || extracted.strippedPrompt.length === 0) {
      continue;
    }
    nextBlocks.push({ ...cloneBlock(block), text: extracted.strippedPrompt });
  }

  if (!nextBlocks.some((block) => block.text.startsWith("x-anthropic-billing-header:"))) {
    nextBlocks.unshift({ type: "text", text: buildBillingHeader(messages) });
    billingAdded = true;
  }

  return { blocks: ensurePromptBlock(nextBlocks, ctx), billingAdded };
}

export default function claudeOauthAdapter(pi: ExtensionAPI) {
  pi.on("before_agent_start", (event, ctx) => {
    if (!shouldApply(ctx)) {
      activeTurn = null;
      return;
    }

    const extracted = extractDocsSection(event.systemPrompt);
    const docsSection = extracted?.docsSection ?? readFallbackDocsSection();
    if (!docsSection) {
      activeTurn = null;
      return;
    }

    activeTurn = {
      docsSection,
      shouldInject: shouldInjectDocs(event.prompt),
      mode: getEnvMode(),
      prompt: event.prompt,
      timestamp: Date.now(),
    };

    log("before_agent_start", {
      prompt: event.prompt,
      shouldInject: activeTurn.shouldInject,
      mode: activeTurn.mode,
      scope: getEnvScope(),
      docsLength: docsSection.length,
      strippedFromSystem: !!extracted,
    });

    if (extracted) {
      return { systemPrompt: extracted.strippedPrompt };
    }

    return;
  });

  pi.on("context", (event, ctx) => {
    if (!shouldApply(ctx) || !activeTurn) return;
    const nextMessages = injectDocs(event.messages, activeTurn);
    log("context", {
      mode: activeTurn.mode,
      shouldInject: activeTurn.shouldInject,
      messagesBefore: summarizeMessages(event.messages),
      messagesAfter: summarizeMessages(nextMessages),
    });
    return { messages: nextMessages };
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!shouldApply(ctx) || !isPayloadLike(event.payload)) return;

    const currentBlocks = Array.isArray(event.payload.system) ? event.payload.system.filter(isTextBlock) : [];
    const normalized = normalizeSystemBlocks(currentBlocks, ctx, event.payload.messages);
    const changed =
      normalized.billingAdded ||
      normalized.blocks.length !== currentBlocks.length ||
      normalized.blocks.some((block, index) => currentBlocks[index]?.text !== block.text);

    const nextPayload = changed
      ? { ...event.payload, system: normalized.blocks }
      : event.payload;

    log("before_provider_request", {
      changed,
      billingAdded: normalized.billingAdded,
      systemBefore: currentBlocks.map((block, index) => `${index}: ${block.text.slice(0, 140)}`),
      systemAfter: normalized.blocks.map((block, index) => `${index}: ${block.text.slice(0, 140)}`),
      messageCount: Array.isArray(nextPayload.messages) ? nextPayload.messages.length : undefined,
      toolCount: Array.isArray(nextPayload.tools) ? nextPayload.tools.length : undefined,
    });

    return nextPayload;
  });

  pi.on("agent_end", () => {
    activeTurn = null;
  });
}
