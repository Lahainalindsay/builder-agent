import { AudienceType, DeliverableType, DomainType, PromptIntent } from "../types/spec";

type Pattern = { re: RegExp; score: number };

function score(prompt: string, patterns: Pattern[]): number {
  return patterns.reduce((acc, pattern) => acc + (pattern.re.test(prompt) ? pattern.score : 0), 0);
}

const SECTION_HINTS = [
  "hero",
  "feature",
  "features",
  "featured",
  "featured products",
  "feature grid",
  "services",
  "services grid",
  "pricing",
  "pricing tiers",
  "testimonials",
  "testimonial",
  "faq",
  "questions",
  "signup",
  "sign up",
  "email capture",
  "cta",
  "call to action",
  "booking form",
  "form",
  "social proof",
  "timeline",
  "installation timeline",
  "how it works"
];

function normalizeSection(value: string): string {
  const v = cleanPhrase(value.toLowerCase().replace(/["“”]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " "));
  if (!v) return v;
  if (v.includes("social proof") || v.includes("trusted by")) return "social_proof";
  if (v.includes("email capture") || v.includes("signup") || v.includes("sign up")) return "email_signup";
  if (v.includes("booking") || v.includes("schedule") || v.includes("book a call")) return "booking";
  if (v.includes("feature") || v.includes("featured products")) return "featured_products";
  if (v.includes("services")) return "featured_products";
  if (v.includes("how it works") || v.includes("process") || v.includes("steps")) return "how_it_works";
  if (v.includes("pricing")) return "pricing";
  if (v.includes("testimonial")) return "testimonials";
  if (v.includes("faq")) return "faq";
  if (v.includes("hero")) return "hero";
  if (v.includes("care tips")) return "care_tips";
  return v.replace(/\s+/g, "_");
}

function splitPhraseList(input: string): string[] {
  return input
    .split(/,| and | & /i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanPhrase(input: string): string {
  return input
    .replace(/^[\s:;-]+/, "")
    .replace(/[\s:;.,!?-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSectionPhrase(value: string): boolean {
  const normalized = cleanPhrase(value.toLowerCase().replace(/["“”]/g, ""));
  if (!normalized) return false;
  if (/^(section|block)\s+/.test(normalized)) return true;
  if (/\bsection\b/.test(normalized)) return true;
  return SECTION_HINTS.some((hint) => normalized.includes(hint));
}

function titleCaseWordCount(value: string): number {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => /^[A-Z][A-Za-z0-9'’-]*$/.test(word) || /^[A-Z0-9]{2,}$/.test(word)).length;
}

function extractBrandName(raw: string): string | undefined {
  const quoted = raw.match(/["“]([^"”]{2,60})["”]/);
  if (quoted?.[1]) return quoted[1].trim();

  const called = raw.match(/\b(?:called|named)\s+([A-Za-z0-9&'’\- ]{2,60})/i);
  if (called?.[1]) return called[1].trim();

  const forMatch = raw.match(/\bfor\s+([A-Za-z0-9&'’\- ]{2,60}?)(?=,|\s+-|\s+—|\s+(?:a|an|the)\b|\s+(?:that|which|who)\b|$)/i);
  if (forMatch?.[1]) {
    const candidate = cleanPhrase(forMatch[1].trim());
    const words = candidate.split(/\s+/).filter(Boolean);
    const titleCaseWords = titleCaseWordCount(candidate);
    const shortEnough = words.length <= 2;
    const looksLikeInstruction = /\b(tool|service|company|platform|startup|product)\b/i.test(candidate);
    const startsWithArticle = /^(a|an|the)\b/i.test(candidate);
    if (shortEnough && titleCaseWords >= Math.max(1, Math.ceil(words.length * 0.7)) && !looksLikeInstruction && !startsWithArticle) {
      return candidate;
    }
  }

  return undefined;
}

function normalizeProductType(value: string): string | undefined {
  const trimmed = cleanPhrase(value.replace(/["“”]/g, "").replace(/\s+(?:with|include|including)\b[\s\S]*$/i, ""));
  if (!trimmed) return undefined;
  if (trimmed.split(/\s+/).length < 2) return undefined;
  if (isSectionPhrase(trimmed)) return undefined;
  if (/\b(home\s?page|landing\s?page|website|dashboard|admin panel|app|application|ui)\b/i.test(trimmed)) return undefined;
  return trimmed;
}

function extractProductType(raw: string, brandName?: string): string | undefined {
  if (brandName) {
    const escaped = brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const inParens = raw.match(new RegExp(`\\bfor\\s+["“]?${escaped}["”]?\\s*\\(([^)]+)\\)`, "i"));
    const normalizedInParens = normalizeProductType(inParens?.[1] ?? "");
    if (normalizedInParens) return normalizedInParens;

    const afterFor = raw.match(new RegExp(`\\bfor\\s+["“]?${escaped}["”]?\\s*,\\s*(?:a|an)\\s+([^\\.\\n,]+)`, "i"));
    const normalizedAfterFor = normalizeProductType(afterFor?.[1] ?? "");
    if (normalizedAfterFor) return normalizedAfterFor;

    const afterCalled = raw.match(new RegExp(`\\b(?:called|named)\\s+["“]?${escaped}["”]?\\s*,\\s*(?:a|an)\\s+([^\\.\\n,]+)`, "i"));
    const normalizedAfterCalled = normalizeProductType(afterCalled?.[1] ?? "");
    if (normalizedAfterCalled) return normalizedAfterCalled;
  }

  const appositive = raw.match(/,\s*(?:a|an)\s+([^.\n,]{6,120})/i);
  const normalizedAppositive = normalizeProductType(appositive?.[1] ?? "");
  if (normalizedAppositive) return normalizedAppositive;

  const generic = raw.match(/\b(?:a|an)\s+([a-z][^.\n,]{6,120})/i);
  const normalizedGeneric = normalizeProductType(generic?.[1] ?? "");
  if (normalizedGeneric) return normalizedGeneric;

  return undefined;
}

function extractRequirements(raw: string): { requirements: string[]; sections: string[] } {
  const requirements: string[] = [];
  const sections: string[] = [];
  const clauses = raw
    .split(/\n|\. /g)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of clauses) {
    const include = line.match(/\b(?:include|including)\b\s*:?\s*(.+)$/i);
    if (include?.[1]) {
      for (const item of splitPhraseList(include[1])) {
        const cleaned = cleanPhrase(item);
        if (!cleaned) continue;
        if (isSectionPhrase(cleaned)) {
          sections.push(cleaned);
        } else {
          requirements.push(cleaned);
        }
      }
    }

    const must = line.match(/\bmust\b\s+(.+)$/i);
    if (must?.[1]) requirements.push(cleanPhrase(must[1]));

    const support = line.match(/\bsupport\b\s+(.+)$/i);
    if (support?.[1]) requirements.push(cleanPhrase(support[1]));

    const pages = line.match(/\bpages?\s*:\s*(.+)$/i);
    if (pages?.[1]) {
      sections.push(...splitPhraseList(pages[1]).map(cleanPhrase).filter(Boolean));
    }
  }

  for (const section of SECTION_HINTS) {
    if (new RegExp(`\\b${section}\\b`, "i").test(raw)) sections.push(section);
  }

  return {
    requirements: Array.from(new Set(requirements.filter(Boolean))).slice(0, 20),
    sections: Array.from(new Set(sections)).slice(0, 20)
  };
}

function inferAudience(lower: string): AudienceType {
  if (/real estate|realtor|listing|open house|mls/.test(lower)) return "real_estate_agents";
  if (/\bdeveloper\b|\bengineering\b|\bdev team\b|\bqa\b|\bci\b|\brepo\b/.test(lower)) return "developer_team";
  if (/finance team|accounting|bookkeeper|controller|reconcile/.test(lower)) return "finance_team";
  if (/support team|helpdesk|tickets|csat|sla/.test(lower)) return "support_team";
  if (/founder|startup founder|ceo/.test(lower)) return "founders";
  if (/freelancer|solo|independent/.test(lower)) return "freelancers";
  return "general";
}

function extractAudienceDetail(raw: string): string | undefined {
  const patterns = [
    /\bbuilt for\s+([^.,\n]+?)(?=\s+with\s+|\s+that\s+|\s+who\s+|,|\.|$)/i,
    /\bdesigned for\s+([^.,\n]+?)(?=\s+with\s+|\s+that\s+|\s+who\s+|,|\.|$)/i,
    /\btargeting\s+([^.,\n]+?)(?=\s+with\s+|\s+that\s+|\s+who\s+|,|\.|$)/i,
    /\bfor\s+([^.,\n]+?)(?=\s+with\s+|\s+that\s+|\s+who\s+|,|\.|$)/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match?.[1]) continue;
    let candidate = cleanPhrase(match[1].replace(/["“”]/g, ""));
    const parenthetical = candidate.match(/\(([^)]+)\)/)?.[1];
    if (parenthetical) candidate = cleanPhrase(parenthetical);
    if (!candidate) continue;
    if (/plant\s+shop|floral|flower\s+shop|nursery/.test(candidate.toLowerCase())) return "plant shop customers";
    if (/^[A-Z][A-Za-z0-9'’-]*(\s+[A-Z][A-Za-z0-9'’-]*)?$/.test(candidate)) continue;
    if (/^[A-Z][A-Za-z0-9'’-]+(\s+[A-Z][A-Za-z0-9'’-]+){0,2}$/.test(candidate)) continue;
    if (/^(a|an|the)\s+/.test(candidate.toLowerCase())) {
      const base = candidate.replace(/^(a|an|the)\s+/i, "");
      if (/plant\s+shop|floral|flower\s+shop|nursery/.test(base.toLowerCase())) return "plant shop customers";
      if (/service|company|business|startup|product|platform|tool/.test(base.toLowerCase())) return `${base} customers`;
      return `${base} users`;
    }
    return candidate;
  }

  const lower = raw.toLowerCase();
  if (/plant|houseplant|succulent|floral|flower|nursery/.test(lower)) return "plant lovers and local shoppers";
  return undefined;
}

function inferDomain(lower: string): DomainType {
  if (/invoice|invoicing|billing|late payment|reminders?|ach|payment link/.test(lower)) return "invoicing";
  if (/accounting|bookkeeping|reconcile|close the books|general ledger|p&l|balance sheet/.test(lower)) return "accounting";
  if (/real estate|realtor|listing|open house|mls|showing/.test(lower)) return "real_estate";
  if (/devtools|\bci\b|deploy|\bqa\b|testing|observability|\bide\b/.test(lower)) return "devtools";
  if (/support|helpdesk|tickets|kb|knowledge base|csat|sla/.test(lower)) return "customer_support";
  if (/crypto|web3|defi|wallet|token|nft/.test(lower)) return "crypto_web3";
  if (/ecommerce|shopify|orders|inventory/.test(lower)) return "ecommerce";
  if (/moving|mover|storage|relocation|packing|unpacking|haul/.test(lower)) return "moving_storage";
  if (/landscap|lawn|yard|garden/.test(lower)) return "landscaping";
  if (/flower|floral|bouquet|wedding/.test(lower)) return "floral";
  return "generic";
}

function inferDeliverable(lower: string): DeliverableType {
  const candidates: Array<[DeliverableType, Pattern[]]> = [
    [
      "landing_page",
      [
        { re: /\blanding page\b/i, score: 6 },
        { re: /\bwebsite\b/i, score: 3 },
        { re: /\bhero\b/i, score: 2 },
        { re: /\bpricing\b/i, score: 2 },
        { re: /\btestimonials?\b/i, score: 2 },
        { re: /\bsignup\b|\bemail capture\b/i, score: 2 }
      ]
    ],
    ["tweet_thread", [{ re: /\b(tweet thread|thread)\b/i, score: 6 }, { re: /\b10[-\s]?tweet\b/i, score: 4 }, { re: /\bviral\b/i, score: 2 }]],
    ["email", [{ re: /\b(cold email|outreach email|partnership email|email)\b/i, score: 6 }, { re: /\bsubject line\b/i, score: 2 }, { re: /\bfollow[-\s]?up\b/i, score: 2 }]],
    ["pitch_deck", [{ re: /\bpitch deck\b/i, score: 6 }, { re: /\bslides?\b/i, score: 2 }]],
    ["newsletter_ideas", [{ re: /\bnewsletter\b/i, score: 6 }, { re: /\bideas?\b/i, score: 2 }]],
    ["market_analysis", [{ re: /\bmarket analysis\b/i, score: 7 }, { re: /\bcompetitive landscape\b/i, score: 2 }, { re: /\bmarket size\b/i, score: 2 }]],
    ["audit_report", [{ re: /\baudit\b/i, score: 7 }, { re: /\berc[-\s]?20\b|\berc20\b/i, score: 4 }, { re: /\bvulnerab/i, score: 3 }]],
    ["dashboard_app", [{ re: /\bdashboard\b/i, score: 6 }, { re: /\bkpi\b|\bmetrics\b/i, score: 2 }, { re: /\breports?\b/i, score: 2 }]],
    ["crud_app", [{ re: /\bcrud\b|\badmin panel\b|\bmanage\b/i, score: 6 }, { re: /\badd\/edit\/delete\b|\badd\b.*\bedit\b.*\bdelete\b/i, score: 3 }]],
    ["viz_app", [{ re: /\bvisualize\b|\bchart\b|\bgraph\b|\bplot\b/i, score: 6 }, { re: /\bexport\b/i, score: 1 }]],
    ["docs_app", [{ re: /\bdocs\b|\bhelp center\b|\bknowledge base\b|\bdocumentation\b/i, score: 6 }]],
    ["game_app", [{ re: /\bgame\b/i, score: 6 }, { re: /\bscore\b|\brestart\b|\bkeyboard\b/i, score: 2 }]],
    ["story_app", [{ re: /\binteractive story\b/i, score: 7 }, { re: /\bendings?\b|\bchoice\b/i, score: 2 }]]
  ];

  let best: DeliverableType = "unknown";
  let bestScore = 0;
  for (const [deliverable, patterns] of candidates) {
    const current = score(lower, patterns);
    if (current > bestScore) {
      best = deliverable;
      bestScore = current;
    }
  }
  return bestScore >= 4 ? best : "unknown";
}

function inferGoal(lower: string): "conversion" | "informational" | "portfolio" {
  if (/\bconversion|high[-\s]?converting|lead gen|cta|signup|purchase|checkout|book now/.test(lower)) return "conversion";
  if (/\bportfolio|showcase|gallery|case studies/.test(lower)) return "portfolio";
  return "informational";
}

function inferActions(lower: string, goal: "conversion" | "informational" | "portfolio"): {
  primaryAction: "shop" | "email_signup" | "book" | "contact" | "learn_more";
  secondaryAction: "shop" | "email_signup" | "book" | "contact" | "learn_more";
} {
  if (/shop|product|catalog|buy|checkout/.test(lower)) return { primaryAction: "shop", secondaryAction: "email_signup" };
  if (/book|booking|schedule|appointment|quote/.test(lower)) return { primaryAction: "book", secondaryAction: "contact" };
  if (/newsletter|email capture|signup/.test(lower)) return { primaryAction: "email_signup", secondaryAction: "learn_more" };
  if (goal === "conversion") return { primaryAction: "contact", secondaryAction: "learn_more" };
  return { primaryAction: "learn_more", secondaryAction: "contact" };
}

function inferAudienceSegments(lower: string): string[] {
  const segments: string[] = [];
  if (/plant|garden|floral|botanical/.test(lower)) segments.push("plant_lovers");
  if (/beginner|new to|first[-\s]?time/.test(lower) || /care tips|care guide/.test(lower)) segments.push("beginner_buyers");
  if (/home decor|interior|lifestyle|aesthetic/.test(lower) || /coastal/.test(lower)) segments.push("home_decor_shoppers");
  if (/freelancer|solo/.test(lower)) segments.push("freelancers");
  if (/developer|engineering|api|devops/.test(lower)) segments.push("developer_teams");
  if (/real estate|realtor|broker/.test(lower)) segments.push("real_estate_agents");
  if (!segments.length) segments.push("general_buyers");
  return Array.from(new Set(segments)).slice(0, 4);
}

function inferBrandStyle(lower: string): string[] {
  const style: string[] = [];
  if (/coastal|beach|ocean|harbor/.test(lower)) style.push("coastal");
  if (/natural|organic|plant|garden|botanical/.test(lower)) style.push("natural");
  if (/relaxed|calm|minimal|clean/.test(lower)) style.push("relaxed");
  if (/luxury|premium|high[-\s]?end/.test(lower)) style.push("premium");
  if (/playful|fun|vibrant/.test(lower)) style.push("playful");
  if (/professional|enterprise/.test(lower)) style.push("professional");
  if (!style.length) style.push("modern");
  return Array.from(new Set(style)).slice(0, 4);
}

export function parsePromptIntent(rawPrompt: string): PromptIntent {
  const lower = rawPrompt.toLowerCase();
  const deliverable = inferDeliverable(lower);
  const goal = inferGoal(lower);
  const { primaryAction, secondaryAction } = inferActions(lower, goal);
  const audience = inferAudience(lower);
  const audienceDetail = extractAudienceDetail(rawPrompt);
  const audienceSegments = inferAudienceSegments(lower);
  const domain = inferDomain(lower);
  const brandStyle = inferBrandStyle(lower);
  const brandName = extractBrandName(rawPrompt);
  const productType = extractProductType(rawPrompt, brandName);
  const { requirements, sections } = extractRequirements(rawPrompt);
  const normalizedSections = Array.from(new Set(sections.map((value) => normalizeSection(value)).filter(Boolean))).slice(0, 20);

  const tone =
    /\bviral\b|\bhype\b|\blaunch\b/i.test(rawPrompt)
      ? "hype"
      : /\btechnical\b|\bengineer\b|\bapi\b/i.test(rawPrompt)
        ? "technical"
        : /\bprofessional\b|\benterprise\b/i.test(rawPrompt)
          ? "professional"
          : /\bfriendly\b|\bplayful\b|\bwarm\b/i.test(rawPrompt)
            ? "friendly"
            : "direct";

  const subject = productType ?? (domain !== "generic" ? domain.replace("_", " ") : undefined);

  return {
    deliverable,
    goal,
    primaryAction,
    secondaryAction,
    audience,
    audienceDetail,
    audienceSegments,
    domain,
    brandStyle,
    brandName,
    productType,
    subject,
    requirements,
    sections,
    normalizedSections,
    tone
  };
}
