import { AppType } from "../types/spec";
import { normalizeText } from "./normalizeText";

export interface PromptIntent {
  verb: string;
  object: string;
  clause: string;
}

export interface PromptStructure {
  normalizedPrompt: string;
  intents: PromptIntent[];
  deliverableHint: AppType | null;
  subjectName: string | null;
  subjectDescriptor: string | null;
  audience: string | null;
  brandTone: string[];
  includeItems: string[];
  pageItems: string[];
  domainKeywords: string[];
}

const VERBS = ["build", "create", "write", "generate", "draft", "design", "analyze", "visualize", "provide", "list"];
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "your", "their", "include", "brand", "tone", "page", "pages",
  "build", "create", "write", "generate", "draft", "design", "analyze", "visualize", "provide", "list", "high", "focused"
]);

function splitList(input: string): string[] {
  return input
    .split(/,| and | & /i)
    .map((item) => item.replace(/["“”]/g, "").trim())
    .filter((item) => item.length > 0);
}

function extractDelimitedList(prompt: string, pattern: RegExp, cap = 14): string[] {
  const hit = prompt.match(pattern)?.[1] ?? "";
  return splitList(hit).slice(0, cap);
}

function detectDeliverable(lower: string): AppType | null {
  if (/audit|security review|smart contract|erc-20|erc20|vulnerab/.test(lower)) return "audit";
  if (/landing page|website|marketing page/.test(lower)) return "landing";
  if (/dashboard|overview|reports|pipeline|settings/.test(lower)) return "dashboard";
  if (/admin panel|crud|manage\s+[a-z]/.test(lower)) return "crud";
  if (/visualize|chart|graph|plot|csv/.test(lower)) return "viz";
  if (/help center|documentation|docs|knowledge base/.test(lower)) return "docs";
  if (/browser game|game where|keyboard controls/.test(lower)) return "game";
  if (/interactive story|choice nodes|multiple endings/.test(lower)) return "story";
  if (/email|newsletter|tweet thread|twitter thread|pitch deck|market analysis|proposal|copy/.test(lower)) return "content";
  return null;
}

function extractDomainKeywords(text: string): string[] {
  const tokens = normalizeText(text)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .filter((token) => !STOPWORDS.has(token));
  return Array.from(new Set(tokens)).slice(0, 8);
}

export function parsePromptStructure(rawPrompt: string): PromptStructure {
  const normalizedPrompt = normalizeText(rawPrompt);
  const clauses = rawPrompt
    .replace(/\r\n/g, "\n")
    .split(/[\n.]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const intents: PromptIntent[] = clauses
    .map((clause) => {
      const match = clause.match(new RegExp(`^(${VERBS.join("|")})\\s+(.+)$`, "i"));
      if (!match) return null;
      return { verb: match[1].toLowerCase(), object: match[2].trim(), clause };
    })
    .filter((item): item is PromptIntent => item !== null);

  const subjectName =
    rawPrompt.match(/for\s+["“]([^"”]{2,80})["”]/i)?.[1]?.trim() ??
    rawPrompt.match(/for\s+'([^']{2,80})'/i)?.[1]?.trim() ??
    rawPrompt.match(/\bfor\s+([A-Za-z0-9&' -]{2,80})(?=,|\s+(?:a|an)\s+|\.|\n|$)/i)?.[1]?.trim() ??
    null;

  const appositiveMatch = rawPrompt.match(/for\s+["“]?[^,"”\n]+["”]?\s*,\s*(?:a|an)\s+([^.\n]+)/i);
  const subjectDescriptor = appositiveMatch?.[1]?.trim() ?? null;
  const audience = subjectDescriptor?.match(/\bfor\s+([^.,\n]+)/i)?.[1]?.trim() ?? null;

  const brandToneRaw =
    rawPrompt.match(/brand tone\s*:\s*([^.\n]+)/i)?.[1] ??
    rawPrompt.match(/tone\s*:\s*([^.\n]+)/i)?.[1] ??
    "";
  const brandTone = splitList(brandToneRaw).slice(0, 6);

  const includeItems = Array.from(
    new Set(
      [
        ...extractDelimitedList(rawPrompt, /include(?:s|d|ing)?\s*:?\s*([^.\n]+)/i, 12),
        ...extractDelimitedList(rawPrompt, /\bwith\s+([^.\n]+)/i, 12)
      ]
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, 14);

  const pagesRaw = rawPrompt.match(/pages?\s*:\s*([^.\n]+)/i)?.[1] ?? "";
  const pageItems = splitList(pagesRaw).slice(0, 10);

  const deliverableHint = detectDeliverable(normalizedPrompt);
  const domainKeywords = extractDomainKeywords(
    [subjectDescriptor ?? "", audience ?? "", includeItems.join(" "), normalizedPrompt].join(" ")
  );

  return {
    normalizedPrompt,
    intents,
    deliverableHint,
    subjectName,
    subjectDescriptor,
    audience,
    brandTone,
    includeItems,
    pageItems,
    domainKeywords
  };
}
