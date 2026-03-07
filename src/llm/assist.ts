import fs from "node:fs";
import path from "node:path";
import { ContentLlmAssist, PromptSpec, VerificationResult } from "../types/spec";

interface LlmConfig {
  provider: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxCallsPerJob: number;
}

interface LlmBudget {
  remainingCalls: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

export function createLlmBudget(): LlmBudget {
  return {
    remainingCalls: Math.max(0, parseInt(process.env.LLM_MAX_CALLS_PER_JOB ?? "1", 10) || 1)
  };
}

export function canUseLlm(config = readLlmConfig()): boolean {
  return config.provider === "openai" && config.apiKey.length > 0 && config.maxCallsPerJob > 0;
}

export async function maybeGenerateContentAssist(spec: PromptSpec, budget: LlmBudget): Promise<ContentLlmAssist | null> {
  const config = readLlmConfig();
  if (!shouldUseAssist(spec, config, budget)) return null;

  const response = await callOpenAiJson(
    [
      "You generate structured writing artifacts for a deterministic build pipeline.",
      "Return strict JSON only with keys: main, variants, checklist, keywords.",
      "Rules:",
      "- main: full markdown deliverable, production-ready.",
      "- variants: exactly 3 complete alternate drafts as markdown blocks.",
      "- checklist: 5-8 concise quality checks.",
      "- keywords: 1-3 core prompt tokens that should appear in main.",
      "- Never return placeholders like TBD, Lorem, etc.",
      "- No code fences around JSON."
    ].join("\n"),
    [
      `Prompt: ${spec.rawPrompt}`,
      `Goal: ${spec.goal}`,
      "Return content that directly matches the prompt."
    ].join("\n"),
    config,
    budget
  );

  return sanitizeContentAssist(response);
}

export async function attemptLlmRepair(
  projectDir: string,
  spec: PromptSpec,
  verification: VerificationResult[],
  budget: LlmBudget
): Promise<boolean> {
  if (spec.appType !== "content") return false;
  const config = readLlmConfig();
  if (!shouldUseAssist(spec, config, budget)) return false;
  if (!verification.some((check) => !check.ok && check.step.startsWith("acceptance:keywords"))) return false;

  const mainPath = path.join(projectDir, "deliverables/01_main.md");
  const variantsPath = path.join(projectDir, "deliverables/02_variants.md");
  const checklistPath = path.join(projectDir, "deliverables/03_checklist.md");

  const currentMain = fs.existsSync(mainPath) ? fs.readFileSync(mainPath, "utf8") : "";
  const failedChecks = verification
    .filter((check) => !check.ok)
    .map((check) => `${check.step}: ${check.detail}`)
    .join("\n");

  const response = await callOpenAiJson(
    [
      "You are repairing content drift in a deterministic pipeline.",
      "Return strict JSON only with keys: main, variants, checklist, keywords.",
      "Ensure keywords are explicitly present in main and keep output concise and usable.",
      "No code fences."
    ].join("\n"),
    [
      `Original prompt: ${spec.rawPrompt}`,
      `Current main markdown:\n${currentMain}`,
      `Failed checks:\n${failedChecks}`
    ].join("\n\n"),
    config,
    budget
  );

  const repaired = sanitizeContentAssist(response);
  if (!repaired) return false;

  fs.mkdirSync(path.dirname(mainPath), { recursive: true });
  fs.writeFileSync(mainPath, `${repaired.main.trim()}\n`, "utf8");
  fs.writeFileSync(variantsPath, formatVariants(repaired.variants), "utf8");
  fs.writeFileSync(checklistPath, formatChecklist(repaired.checklist), "utf8");
  spec.llmAssist = repaired;
  return true;
}

function shouldUseAssist(spec: PromptSpec, config: LlmConfig, budget: LlmBudget): boolean {
  if (spec.appType !== "content") return false;
  if (!canUseLlm(config)) return false;
  if (budget.remainingCalls <= 0) return false;
  return true;
}

function readLlmConfig(): LlmConfig {
  return {
    provider: (process.env.LLM_PROVIDER ?? "").trim().toLowerCase(),
    apiKey: (process.env.OPENAI_API_KEY ?? "").trim(),
    model: (process.env.LLM_MODEL ?? "gpt-4.1-mini").trim(),
    timeoutMs: Math.max(1000, parseInt(process.env.LLM_TIMEOUT_MS ?? "8000", 10) || 8000),
    maxCallsPerJob: Math.max(0, parseInt(process.env.LLM_MAX_CALLS_PER_JOB ?? "1", 10) || 1)
  };
}

async function callOpenAiJson(
  systemPrompt: string,
  userPrompt: string,
  config: LlmConfig,
  budget: LlmBudget
): Promise<unknown | null> {
  if (budget.remainingCalls <= 0) return null;
  budget.remainingCalls -= 1;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as ChatCompletionResponse;
    const text = extractMessageText(payload);
    if (!text) return null;
    return parseJsonLoose(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractMessageText(payload: ChatCompletionResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function parseJsonLoose(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function sanitizeContentAssist(input: unknown): ContentLlmAssist | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as {
    main?: unknown;
    variants?: unknown;
    checklist?: unknown;
    keywords?: unknown;
  };
  const main = typeof raw.main === "string" ? raw.main.trim() : "";
  const variants = Array.isArray(raw.variants)
    ? raw.variants.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  const checklist = Array.isArray(raw.checklist)
    ? raw.checklist.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  if (!main) return null;
  const finalizedVariants = variants.slice(0, 3);
  while (finalizedVariants.length < 3) {
    finalizedVariants.push(main);
  }
  const finalizedChecklist = checklist.length ? checklist.slice(0, 8) : defaultChecklist();
  return {
    main,
    variants: finalizedVariants,
    checklist: finalizedChecklist,
    keywords
  };
}

function defaultChecklist(): string[] {
  return [
    "Matches the prompt and target audience.",
    "Uses concrete language with no placeholder text.",
    "Contains a clear call to action or next step.",
    "Formatting is clean and ready to send.",
    "Key prompt terms are present in the primary deliverable."
  ];
}

function formatVariants(variants: string[]): string {
  const blocks = variants.slice(0, 3).map((variant, index) => `## Variant ${String.fromCharCode(65 + index)}\n\n${variant.trim()}`);
  return `# Variants\n\n${blocks.join("\n\n")}\n`;
}

function formatChecklist(items: string[]): string {
  return `# Delivery Checklist\n\n${items.map((item) => `- ${item}`).join("\n")}\n`;
}
