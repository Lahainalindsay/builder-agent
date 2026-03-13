import fs from "node:fs";
import path from "node:path";
import { ContentLlmAssist, LandingLlmAssist, PromptSpec, VerificationResult } from "../types/spec";

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

  if (isMarketAnalysisPrompt(spec)) {
    const marketAssist = await maybeGenerateMarketAnalysisAssist(spec, config, budget);
    if (marketAssist) return marketAssist;
  }

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

export async function maybeGenerateLandingAssist(spec: PromptSpec, budget: LlmBudget): Promise<LandingLlmAssist | null> {
  const config = readLlmConfig();
  if (!shouldUseLandingAssist(spec, config, budget)) return null;

  const response = await callOpenAiJson(
    [
      "You are a landing-page copy generator for a deterministic build pipeline.",
      "Return ONLY strict JSON.",
      "No markdown. No commentary. No extra keys.",
      "Avoid generic filler like 'Your Product', 'modern teams', or 'clear value props'.",
      "If the prompt is about a physical product, avoid generic SaaS monthly pricing.",
      "Never invent logos, certifications, or fake quantitative claims.",
      "Schema:",
      "{",
      '  "brandName": "string",',
      '  "tagline": "string?",',
      '  "hero": { "headline": "string", "subheadline": "string", "primaryCta": "string", "secondaryCta": "string?" },',
      '  "sections": {',
      '    "features": [{ "title": "string", "description": "string" }],',
      '    "socialProof": ["string"],',
      '    "testimonials": [{ "quote": "string", "author": "string", "role": "string" }],',
      '    "pricing": [{ "name": "string", "price": "string", "blurb": "string" }],',
      '    "faq": [{ "q": "string", "a": "string" }]',
      "  },",
      '  "signup": {',
      '    "title": "string",',
      '    "button": "string",',
      '    "fields": [{ "name": "name|email", "label": "string", "placeholder": "string" }],',
      '    "successMessage": "string"',
      "  },",
      '  "style": {',
      '    "vibeKeywords": ["string"],',
      '    "accentHex": "#RRGGBB",',
      '    "heroImageQuery": "string",',
      '    "iconMotif": "bolt|leaf|shield|sparkles|rocket|compass?"',
      "  },",
      '  "compliance": { "noFakeClaims": true, "noCustomerLogos": true }',
      "}",
      "Rules:",
      "- features must be exactly 6",
      "- testimonials must be exactly 2",
      "- pricing must be exactly 3",
      "- faq must be 4 to 6 items",
      "- signup.fields must include exactly name + email"
    ].join("\n"),
    [
      `Prompt: ${spec.rawPrompt}`,
      `App name: ${spec.appName}`,
      `Intent brand: ${spec.intent?.brandName ?? "unknown"}`,
      `Intent domain: ${spec.intent?.domain ?? "generic"}`,
      `Intent audience: ${spec.intent?.audienceDetail ?? spec.intent?.audience ?? "general"}`,
      `Intent requirements: ${(spec.intent?.requirements ?? []).join(" | ") || "none"}`,
      `Intent sections: ${(spec.intent?.sections ?? []).join(" | ") || "none"}`
    ].join("\n"),
    config,
    budget
  );

  return sanitizeLandingAssist(response);
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

function isMarketAnalysisPrompt(spec: PromptSpec): boolean {
  const lower = spec.rawPrompt.toLowerCase();
  return lower.includes("market analysis") || lower.includes("defi landscape") || lower.includes("investment opportunities");
}

async function maybeGenerateMarketAnalysisAssist(
  spec: PromptSpec,
  config: LlmConfig,
  budget: LlmBudget
): Promise<ContentLlmAssist | null> {
  const lookupNotes = spec.assumptions
    .filter((entry) => entry.startsWith("Lookup: "))
    .map((entry) => entry.replace(/^Lookup:\s*/, "").trim())
    .filter(Boolean);
  const lookupSources = spec.assumptions
    .filter((entry) => entry.startsWith("Source: "))
    .map((entry) => entry.replace(/^Source:\s*/, "").trim())
    .filter(Boolean);
  const retrievedAt =
    spec.assumptions.find((entry) => entry.startsWith("Lookup retrieved at:"))?.replace(/^Lookup retrieved at:\s*/, "").trim() ?? "unknown";

  const response = await callOpenAiJson(
    [
      "You write market analysis deliverables for a deterministic build pipeline.",
      "Return strict JSON only with keys: main, variants, checklist, keywords.",
      "Use the provided lookup data as the factual basis for market metrics.",
      "Do not invent market numbers, rankings, or sources that are not present in the lookup context.",
      "If lookup context is missing, state that explicitly and avoid numeric claims.",
      "main must be production-ready markdown with these sections in order:",
      "1. Executive Summary",
      "2. Current Market Snapshot",
      "3. Emerging Trends",
      "4. Investment Opportunities",
      "5. Key Risks",
      "6. Sources",
      "variants should be 3 concise alternate executive-summary angles.",
      "keywords should include market, analysis, and one prompt-specific keyword when natural.",
      "No code fences."
    ].join("\n"),
    [
      `Prompt: ${spec.rawPrompt}`,
      `Goal: ${spec.goal}`,
      `Lookup retrieved at: ${retrievedAt}`,
      `Lookup summaries:\n${lookupNotes.length ? lookupNotes.map((line) => `- ${line}`).join("\n") : "- none"}`,
      `Lookup sources:\n${lookupSources.length ? lookupSources.map((line) => `- ${line}`).join("\n") : "- none"}`
    ].join("\n\n"),
    config,
    budget
  );

  return sanitizeContentAssist(response);
}

function shouldUseLandingAssist(spec: PromptSpec, config: LlmConfig, budget: LlmBudget): boolean {
  if (spec.appType !== "landing") return false;
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

function sanitizeLandingAssist(input: unknown): LandingLlmAssist | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<LandingLlmAssist>;
  if (!raw.brandName || typeof raw.brandName !== "string") return null;
  if (!raw.hero || typeof raw.hero.headline !== "string" || typeof raw.hero.subheadline !== "string" || typeof raw.hero.primaryCta !== "string") {
    return null;
  }
  const features = raw.sections?.features ?? [];
  const pricing = raw.sections?.pricing ?? [];
  const testimonials = raw.sections?.testimonials ?? [];
  const faq = raw.sections?.faq ?? [];
  if (!Array.isArray(features) || features.length !== 6) return null;
  if (!Array.isArray(pricing) || pricing.length !== 3) return null;
  if (!Array.isArray(testimonials) || testimonials.length !== 2) return null;
  if (!Array.isArray(faq) || faq.length < 4 || faq.length > 6) return null;

  const accentHex = raw.style?.accentHex;
  if (typeof accentHex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(accentHex)) return null;

  const fields = raw.signup?.fields ?? [];
  const names = Array.isArray(fields) ? fields.map((field) => field?.name) : [];
  if (!names.includes("name") || !names.includes("email")) return null;

  return {
    brandName: raw.brandName.trim(),
    tagline: typeof raw.tagline === "string" ? raw.tagline.trim() : undefined,
    hero: {
      headline: raw.hero.headline.trim(),
      subheadline: raw.hero.subheadline.trim(),
      primaryCta: raw.hero.primaryCta.trim(),
      secondaryCta: typeof raw.hero.secondaryCta === "string" ? raw.hero.secondaryCta.trim() : undefined
    },
    sections: {
      features: features
        .filter((item): item is { title: string; description: string } => !!item && typeof item.title === "string" && typeof item.description === "string")
        .slice(0, 6),
      socialProof: Array.isArray(raw.sections?.socialProof)
        ? raw.sections.socialProof.filter((item): item is string => typeof item === "string").slice(0, 4)
        : [],
      testimonials: testimonials
        .filter((item): item is { quote: string; author: string; role: string } => !!item && typeof item.quote === "string" && typeof item.author === "string" && typeof item.role === "string")
        .slice(0, 2),
      pricing: pricing
        .filter((item): item is { name: string; price: string; blurb: string } => !!item && typeof item.name === "string" && typeof item.price === "string" && typeof item.blurb === "string")
        .slice(0, 3),
      faq: faq
        .filter((item): item is { q: string; a: string } => !!item && typeof item.q === "string" && typeof item.a === "string")
        .slice(0, 6)
    },
    signup: {
      title: typeof raw.signup?.title === "string" ? raw.signup.title.trim() : "Get updates",
      button: typeof raw.signup?.button === "string" ? raw.signup.button.trim() : "Sign up",
      fields: [
        { name: "name", label: "Name", placeholder: "Full name" },
        { name: "email", label: "Email", placeholder: "Email address" }
      ],
      successMessage: typeof raw.signup?.successMessage === "string" ? raw.signup.successMessage.trim() : "Thanks, you're on the list."
    },
    style: {
      vibeKeywords: Array.isArray(raw.style?.vibeKeywords)
        ? raw.style!.vibeKeywords.filter((item): item is string => typeof item === "string").slice(0, 6)
        : [],
      accentHex,
      heroImageQuery: typeof raw.style?.heroImageQuery === "string" ? raw.style.heroImageQuery.trim() : "product hero",
      iconMotif: raw.style?.iconMotif
    },
    compliance: {
      noFakeClaims: true,
      noCustomerLogos: true
    }
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
