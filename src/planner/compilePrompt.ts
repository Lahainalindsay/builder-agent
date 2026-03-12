import {
  AcceptanceCheck,
  AppType,
  EntitySpec,
  FeaturePack,
  FeatureSpec,
  PromptIntent,
  PromptStructure,
  PromptSpec,
  RouteSpec
} from "../types/spec";
import { normalizeText } from "../utils/normalizeText";
import { parsePromptStructure } from "../utils/promptStructure";
import { parsePromptIntent } from "./intent";

export function compilePrompt(rawPrompt: string, analysisContext?: string): PromptSpec {
  const prompt = normalize([rawPrompt, analysisContext ?? ""].filter(Boolean).join("\n\n"));
  const promptStructure = parsePromptStructure(rawPrompt);
  const intent = parsePromptIntent(rawPrompt);
  const normalizedPrompt = normalizeText(prompt);
  const appType = classifyAppType(normalizedPrompt, promptStructure, intent);
  const designTone = inferDesignTone(normalizedPrompt);
  const goal = inferGoal(prompt, promptStructure);
  const appName = inferAppName(rawPrompt, prompt, goal, promptStructure);
  const users = inferUsers(normalizedPrompt);
  const pages = inferPages(normalizedPrompt, appType, promptStructure);
  const entities = inferEntities(normalizedPrompt, appType);
  const features = inferFeatures(normalizedPrompt, appType, pages, entities, promptStructure);
  const featurePacks = inferFeaturePacks(appType, pages, features);
  const mustHave = features.filter((feature) => feature.priority === "must").map((feature) => feature.description);
  const constraints = inferConstraints(normalizedPrompt);
  const assumptions = inferAssumptions(normalizedPrompt, appType);
  const repoPrinciples = extractRepoPrinciples(prompt);
  const lookupSummaries = extractLookupSummaries(prompt);
  const lookupSources = extractLookupSources(prompt);
  const lookupRetrievedAt = extractLookupRetrievedAt(prompt);
  const acceptanceChecks = buildAcceptanceChecks(appType, pages, features);

  return {
    rawPrompt: rawPrompt.trim(),
    appType,
    appName,
    designTone,
    goal,
    users,
    pages,
    routes: pages,
    dataModel: { entities },
    entities,
    features,
    featurePacks,
    mustHave,
    niceToHave: [
      "Readable empty states",
      "Responsive layout",
      "Accessible color contrast",
      "Consistent spacing and typography"
    ],
    constraints,
    assumptions: [
      ...assumptions,
      ...repoPrinciples.map((line) => `Repo principle: ${line}`),
      ...(lookupRetrievedAt ? [`Lookup retrieved at: ${lookupRetrievedAt}`] : []),
      ...lookupSummaries.map((line) => `Lookup: ${line}`),
      ...lookupSources.map((line) => `Source: ${line}`)
    ].slice(0, 14),
    intent,
    promptStructure,
    acceptanceChecks
  };
}

function extractRepoPrinciples(prompt: string): string[] {
  const blockMatch = prompt.match(/Repo principles\/headings:\s*\n([\s\S]*?)(?:\n[A-Z][^\n]*:|$)/i);
  if (!blockMatch) return [];
  return blockMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function extractLookupSummaries(prompt: string): string[] {
  const blockMatch = prompt.match(/## External Lookup Context\s*\n([\s\S]*?)(?:\n## |\n[A-Z][^\n]*:|$)/i);
  if (!blockMatch) return [];
  return blockMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ["))
    .map((line) => line.replace(/^- \[[^\]]+\]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function extractLookupSources(prompt: string): string[] {
  const blockMatch = prompt.match(/## External Lookup Context\s*\n([\s\S]*?)(?:\n## |\n[A-Z][^\n]*:|$)/i);
  if (!blockMatch) return [];
  return blockMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- source:"))
    .map((line) => line.replace(/^- source:\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

function extractLookupRetrievedAt(prompt: string): string | null {
  const match = prompt.match(/Retrieved at:\s*([0-9TZ:.\-+]+)/i);
  return match?.[1]?.trim() ?? null;
}

function normalize(input: string): string {
  return input.replace(/\r\n/g, "\n").trim();
}

function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

function inferGoal(prompt: string, structure?: PromptStructure): string {
  if (structure?.intents.length) {
    return `${structure.intents[0].verb} ${structure.intents[0].object}`.trim();
  }
  const firstLine = prompt.split("\n").find((line) => line.trim())?.trim() ?? "";
  const cleaned = firstLine.replace(/^prompt:\s*/i, "");
  if (cleaned.length >= 12 && cleaned.length <= 120) return cleaned;

  const match = prompt.replace(/\n+/g, " ").match(/^(.{20,140}?)([.!?]|$)/);
  return match ? match[1].trim() : "Build a small, usable app that satisfies the prompt.";
}

function inferAppName(rawPrompt: string, prompt: string, goal: string, structure?: PromptStructure): string {
  if (structure?.subjectName) {
    return titleCase(cleanTitle(structure.subjectName));
  }
  const explicit = prompt.match(/app\s*name\s*:\s*(.+)/i)?.[1]?.trim();
  if (explicit) return titleCase(cleanTitle(explicit));

  const githubMatch = rawPrompt.match(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/([A-Za-z0-9_.-]+)/i)?.[1];
  if (githubMatch) {
    const repoName = githubMatch.replace(/\.git$/i, "").replace(/[-_]+/g, " ");
    return titleCase(cleanTitle(repoName));
  }

  const cleaned = cleanTitle(goal);
  return cleaned.length >= 6 ? titleCase(cleaned) : "Seedstr App";
}

function inferDesignTone(prompt: string): "neutral" | "playful" | "luxury" {
  if (containsAny(prompt, ["luxury", "premium", "elegant", "high-end"])) return "luxury";
  if (containsAny(prompt, ["playful", "fun", "cute", "vibrant", "colorful"])) return "playful";
  return "neutral";
}

function appTypeFromIntent(intent: PromptIntent): AppType | null {
  switch (intent.deliverable) {
    case "landing_page":
      return "landing";
    case "tweet_thread":
    case "email":
    case "pitch_deck":
    case "newsletter_ideas":
    case "market_analysis":
      return "content";
    case "audit_report":
      return "audit";
    case "dashboard_app":
      return "dashboard";
    case "crud_app":
      return "crud";
    case "viz_app":
      return "viz";
    case "docs_app":
      return "docs";
    case "game_app":
      return "game";
    case "story_app":
      return "story";
    default:
      return null;
  }
}

function classifyAppType(prompt: string, structure?: PromptStructure, intent?: PromptIntent): AppType {
  if (intent) {
    const fromIntent = appTypeFromIntent(intent);
    if (fromIntent) return fromIntent;
  }
  if (structure?.deliverableHint) return structure.deliverableHint;
  const lower = prompt.toLowerCase();
  const hasAudit = containsAny(lower, [
    "smart contract audit",
    "contract audit",
    "security review",
    "threat model",
    "security audit",
    "erc-20",
    "erc20",
    "vulnerabilities",
    "audit report"
  ]);
  const hasContentPack = containsAny(lower, [
    "partnership outreach",
    "partnership proposal",
    "partnership proposal template",
    "nft collection copy",
    "nft collection",
    "nft descriptions",
    "marketing copy",
    "outreach email",
    "newsletter ideas",
    "newsletter topic ideas",
    "newsletter topics",
    "subject line variations",
    "pitch deck outline",
    "pitch deck",
    "market analysis",
    "competitive landscape",
    "ai agent strategy",
    "strategy document",
    "strategy for",
    "cold email",
    "cold outreach email",
    "viral tweet thread",
    "twitter thread",
    "tweet thread",
    "subject line"
  ]);
  const wantsLandingPage = containsAny(lower, ["landing page", "website"]);
  const listStyleRequest =
    /^(list|list out|what are)\b/.test(lower.trim()) ||
    containsAny(lower, ["required tools", "tool list", "tools for", "what are the required"]);
  const appBuildIntent = containsAny(lower, [
    "build",
    "create an app",
    "web app",
    "website",
    "frontend",
    "dashboard",
    "crud",
    "game",
    "user interface"
  ]);
  const hasGame = containsAny(lower, ["browser game", "game", "spaceship", "asteroid", "player controls", "restart system"]);
  const hasStory = containsAny(lower, [
    "interactive story",
    "choose your own adventure",
    "reader can make choices",
    "choices that affect",
    "multiple endings",
    "affect the ending"
  ]);
  const hasDocs = containsAny(lower, ["knowledge base", "help center", "documentation", "docs"]);
  const hasLanding = containsAny(lower, ["landing page", "marketing page", "hero section", "cta"]);
  const hasViz = containsAny(lower, ["visualize", "trend", "plot", "graph", "bar chart", "line chart"]);
  const hasExplicitDashboard = containsAny(lower, ["dashboard", "analytics dashboard", "kpi dashboard", "metrics dashboard"]);
  const hasDashboard = containsAny(lower, ["dashboard", "analytics", "kpi", "metrics", "insights", "chart", "reports"]);
  const hasOpsShell = containsAny(lower, ["operations", "ops workspace", "workspace"]);
  const hasAuth = containsAny(lower, ["login", "sign in", "signin", "sign up", "signup", "auth", "authentication"]);
  const hasSettings = containsAny(lower, ["settings", "preferences", "profile"]);
  const hasCrud = containsAny(lower, [
    "crud",
    "admin panel",
    "manage",
    "edit",
    "delete",
    "track",
    "review records",
    "vendor records",
    "support records",
    "add and review",
    "list records",
    "create records"
  ]);
  const hasPerformanceReporting = containsAny(lower, [
    "campaign performance",
    "performance trends",
    "reporting view",
    "breakdown",
    "retention"
  ]);

  if (hasAudit) return "audit";
  if (wantsLandingPage) return "landing";
  if (listStyleRequest && !appBuildIntent) return "content";
  if (hasContentPack) return "content";
  if (hasGame) return "game";
  if (hasStory) return "story";
  if (hasDocs) return "docs";
  if (hasLanding) return "landing";
  if (hasAuth && !containsAny(lower, ["reports", "analytics", "kpi", "metrics"])) return "form";
  if (hasViz && !hasExplicitDashboard) return "viz";
  if (hasSettings && hasDashboard) return "dashboard";
  if ((hasDashboard || hasPerformanceReporting) && (containsAny(lower, ["reports", "analytics"]) || hasOpsShell || hasSettings)) {
    return "dashboard";
  }
  if (hasAuth) return "form";
  if (hasSettings && !containsAny(lower, ["reports", "analytics", "operations", "workspace"])) return "form";
  if (hasCrud && !containsAny(lower, ["analytics", "breakdown", "performance", "reports", "dashboard"])) return "crud";
  if (hasCrud && hasOpsShell && !hasDashboard) return "crud";
  if (hasDashboard) return "dashboard";
  if (hasCrud) return "crud";
  return "fallback";
}

function inferUsers(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const users: string[] = [];

  if (containsAny(lower, ["admin", "operator", "moderator"])) users.push("admin");
  if (containsAny(lower, ["creator", "influencer"])) users.push("creator");
  if (containsAny(lower, ["customer", "buyer", "client", "user"])) users.push("user");

  return users.length ? dedupe(users) : ["user"];
}

function inferPages(prompt: string, appType: AppType, structure?: PromptStructure): RouteSpec[] {
  const lower = prompt.toLowerCase();

  if (appType === "content" || appType === "audit") {
    return [];
  }

  if (appType === "game") {
    return [{ path: "/", title: "Game", purpose: "Playable browser game loop with controls and scoring." }];
  }

  if (appType === "story") {
    return [{ path: "/", title: "Story", purpose: "Interactive branching story with multiple endings." }];
  }

  if (appType === "landing") {
    return [{ path: "/", title: "Home", purpose: "Marketing landing page" }];
  }

  const pages: RouteSpec[] = [{ path: "/", title: "Overview", purpose: "Primary overview" }];

  if (structure?.pageItems?.length) {
    const mapped = structure.pageItems
      .map((pageTitle) => {
        const safe = pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const path = safe === "overview" ? "/" : `/${safe || "page"}`;
        return { path, title: titleCase(pageTitle), purpose: `${titleCase(pageTitle)} view` };
      })
      .slice(0, 6);
    if (mapped.length) return dedupeByPath(mapped);
  }

  if (containsAny(lower, ["report", "reports"])) {
    pages.push({ path: "/reports", title: "Reports", purpose: "Reporting view" });
  }
  if (containsAny(lower, ["activity", "audit", "timeline", "log"])) {
    pages.push({ path: "/activity", title: "Activity", purpose: "Recent events" });
  }
  if (containsAny(lower, ["settings", "preferences"])) {
    pages.push({ path: "/settings", title: "Settings", purpose: "Preferences" });
  }
  if (containsAny(lower, ["docs", "documentation", "knowledge base", "help center"])) {
    pages.push({ path: "/docs", title: "Docs", purpose: "Documentation" });
  }
  if (appType === "crud" && pages.length === 1) {
    pages.push({ path: "/manage", title: "Manage", purpose: "CRUD management surface" });
  }

  return pages.slice(0, 6);
}

function dedupeByPath(pages: RouteSpec[]): RouteSpec[] {
  const seen = new Set<string>();
  const ordered: RouteSpec[] = [];
  for (const page of pages) {
    if (seen.has(page.path)) continue;
    seen.add(page.path);
    ordered.push(page);
  }
  return ordered;
}

function inferEntities(prompt: string, appType: AppType): EntitySpec[] {
  if (appType === "content" || appType === "audit") {
    return [];
  }
  const lower = prompt.toLowerCase();
  const candidates: string[] = [];
  const patterns = [
    /manage\s+([a-z][a-z0-9\s-]{2,32})/gi,
    /crud\s+(?:for|of)\s+([a-z][a-z0-9\s-]{2,32})/gi,
    /list\s+of\s+([a-z][a-z0-9\s-]{2,32})/gi,
    /marketplace\s+for\s+([a-z][a-z0-9\s-]{2,32})/gi
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lower))) {
      candidates.push(match[1].trim());
    }
  }

  const inferred = dedupe(candidates)
    .map((candidate) => candidate.replace(/[^a-z0-9\s-]/g, "").trim())
    .filter((candidate) => candidate.length >= 3 && candidate.length <= 24)
    .slice(0, 3);

  const base = inferred.length ? inferred : defaultEntitiesFor(appType, lower);

  return base.map((name) => ({
    name: titleCase(singularize(name)),
    plural: titleCase(pluralize(name)),
    fields: [
      { name: "id", type: "id", required: true },
      { name: "name", type: "string", required: true },
      { name: "status", type: "string" },
      { name: "updatedAt", type: "date" }
    ]
  }));
}

function inferFeatures(
  prompt: string,
  appType: AppType,
  pages: RouteSpec[],
  entities: EntitySpec[],
  structure?: PromptStructure
): FeatureSpec[] {
  const lower = prompt.toLowerCase();
  const features: FeatureSpec[] = [];
  const add = (
    id: string,
    description: string,
    priority: FeatureSpec["priority"],
    surface: FeatureSpec["surface"],
    signals: string[]
  ) => {
    features.push({ id, description, priority, surface, signals });
  };

  if (appType === "content") {
    add("content-main", "Provide a primary markdown deliverable in deliverables/01_main.md", "must", "workflow", [
      "deliverables/01_main.md",
      "primary deliverable"
    ]);
    add("content-variants", "Provide variants in deliverables/02_variants.md", "must", "workflow", [
      "deliverables/02_variants.md",
      "variants"
    ]);
    add("content-checklist", "Provide a usage checklist in deliverables/03_checklist.md", "must", "workflow", [
      "deliverables/03_checklist.md",
      "checklist"
    ]);
    add("content-readme", "README explains included deliverables and usage", "must", "workflow", ["readme", "deliverables"]);
    return normalizeFeatureList(features);
  }

  if (appType === "audit") {
    add("audit-report", "Provide audit report markdown deliverable", "must", "workflow", [
      "deliverables/audit_report.md",
      "audit report"
    ]);
    add("audit-risk", "Provide risk matrix markdown deliverable", "must", "workflow", [
      "deliverables/risk_matrix.md",
      "risk matrix"
    ]);
    add("audit-remediation", "Provide remediation checklist markdown deliverable", "must", "workflow", [
      "deliverables/remediation_checklist.md",
      "remediation"
    ]);
    add("audit-readme", "README explains audit scope and constraints", "must", "workflow", ["without code access", "scope"]);
    return normalizeFeatureList(features);
  }

  add("run-steps", "Project runs with npm install + npm run dev/build", "must", "workflow", ["npm install", "npm run dev", "npm run build"]);
  add("readme", "README includes clear run and usage steps", "must", "workflow", ["## run", "readme", "generated by"]);
  if (requiresFrontendBridge(lower)) {
    add(
      "frontend-bridge",
      "Frontend-first delivery with mocked API/integration surface for backend or automation asks",
      "must",
      "integration",
      ["frontend-first", "mock api", "integration status"]
    );
  }

  if (appType === "dashboard") {
    add("kpis", "Show KPI cards and a performance breakdown section", "must", "page", ["dashboard", "kpi", "metrics"]);
    add("activity", "Show a recent activity feed", "should", "component", ["activity", "timeline", "events"]);
  }
  if (appType === "crud") {
    const entity = entities[0]?.name ?? "Item";
    add("crud-form", `Create ${entity} records via a form`, "must", "workflow", ["create", "form", "add"]);
    add("crud-list", `List ${entity} records with empty state`, "must", "page", ["list", "table", "records"]);
    add("persistence", "Persist records locally (localStorage)", "should", "behavior", ["offline", "localstorage", "persist"]);
  }
  if (appType === "landing") {
    const includes = structure?.includeItems.map((item) => item.toLowerCase()) ?? [];
    const wantsHero = includes.some((item) => item.includes("hero")) || includes.length === 0;
    const wantsFeatures = includes.some((item) => item.includes("feature") || item.includes("services"));
    const wantsPricing = includes.some((item) => item.includes("pricing"));
    const wantsTestimonials = includes.some((item) => item.includes("testimonial") || item.includes("social proof"));
    const wantsFaq = includes.some((item) => item.includes("faq"));
    const wantsSignup = includes.some((item) => item.includes("signup") || item.includes("booking") || item.includes("cta"));
    if (wantsHero) add("hero", "Hero section with CTA and value props", "must", "page", ["landing", "hero", "cta"]);
    if (wantsFeatures || includes.length === 0) add("features", "Feature/services grid section", "must", "page", ["features", "services"]);
    if (wantsPricing) add("pricing", "Pricing tiers section", "must", "page", ["pricing", "tiers"]);
    if (wantsTestimonials) add("testimonials", "Testimonials or social proof section", "must", "page", ["testimonials", "social proof"]);
    if (wantsFaq) add("faq", "FAQ section with objection handling", "should", "page", ["faq"]);
    if (wantsSignup) add("signup", "CTA-focused signup/booking form", "must", "workflow", ["signup", "booking", "cta"]);
  }
  if (appType === "viz") {
    add("viz", "Show a simple visualization (lightweight bars)", "must", "page", ["chart", "visualization", "trend"]);
  }
  if (appType === "docs") {
    add("docs-index", "Provide a docs-style content layout", "must", "page", ["docs", "documentation", "knowledge base"]);
  }
  if (appType === "form") {
    add("auth-stub", "Include an auth or form-driven workflow surface", "must", "workflow", ["sign in", "agent-session-email", "local session"]);
  }
  if (appType === "game") {
    add("game-loop", "Playable loop with keyboard controls, score tracking, and restart", "must", "behavior", [
      "keyboard",
      "score",
      "restart",
      "asteroid"
    ]);
  }
  if (appType === "story") {
    add("story-choices", "Interactive branching narrative with choices that lead to different endings", "must", "behavior", [
      "choice",
      "ending",
      "branch",
      "story"
    ]);
  }

  if (containsAny(lower, ["search", "filter", "sort"])) {
    add("table-controls", "Include search/filter/sort controls on data views", "should", "component", ["search", "filter", "sort"]);
  }
  if (containsAny(lower, ["export", "csv"])) {
    add("export", "Provide an export action (CSV) for relevant data", "could", "workflow", ["export", "csv"]);
  }
  if (
    appType === "form" ||
    (appType !== "landing" && containsAny(lower, ["login", "sign in", "signin", "sign up", "signup", "authentication flow"]))
  ) {
    add("auth-session", "Include a local auth/session stub", "should", "integration", ["auth", "login"]);
  }

  if (pages.some((page) => page.path === "/reports")) {
    add("reports-page", "Include a Reports page surface", "should", "page", ["reports"]);
  }
  if (pages.some((page) => page.path === "/settings")) {
    add("settings-page", "Include a Settings page surface", "should", "page", ["settings"]);
  }
  if (pages.some((page) => page.path === "/docs")) {
    add("docs-page", "Include a Docs page surface", "could", "page", ["docs"]);
  }

  return normalizeFeatureList(features);
}

function inferFeaturePacks(appType: AppType, pages: RouteSpec[], features: FeatureSpec[]): FeaturePack[] {
  if (appType === "content" || appType === "audit") {
    return [];
  }
  const packs: FeaturePack[] = [];

  if (pages.length > 1) packs.push("router-pack");
  if (appType === "crud" || features.some((feature) => feature.id === "table-controls")) packs.push("table-pack");
  if (appType === "crud" || appType === "form") packs.push("form-pack");
  if (pages.some((page) => page.path === "/settings") || appType === "form") packs.push("settings-form-pack");
  if (features.some((feature) => feature.id === "persistence")) packs.push("persistence-pack");
  if (features.some((feature) => feature.id === "export")) packs.push("export-pack");
  if (appType === "form" || features.some((feature) => feature.id === "auth-session")) packs.push("auth-stub-pack");
  if (appType === "docs" || features.some((feature) => feature.id === "docs-index")) packs.push("docs-search-pack");

  return dedupe(packs);
}

function inferConstraints(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  if (containsAny(lower, ["partnership outreach", "nft collection copy", "newsletter ideas", "pitch deck outline", "viral tweet thread"])) {
    return dedupe([
      "Produce a structured markdown content pack in a zip archive",
      "Keep outputs concise, usable, and variant-rich",
      "Avoid fabricated external claims"
    ]).slice(0, 8);
  }
  if (containsAny(lower, ["smart contract audit", "security review", "threat model"])) {
    return dedupe([
      "Produce an audit-style markdown pack in a zip archive",
      "Clearly label assumptions when source code is missing",
      "Include risk severity and remediation guidance"
    ]).slice(0, 8);
  }
  const constraints = [
    "Prefer simple dependencies",
    "Must build cleanly",
    "Use mock data unless prompt demands live APIs"
  ];
  if (requiresFrontendBridge(lower)) {
    constraints.push("Deliver a runnable frontend experience first, with mocked integrations for backend/automation workflows.");
  }

  if (containsAny(lower, ["no backend", "frontend only"])) constraints.push("Frontend-only deliverable");
  if (containsAny(lower, ["offline"])) constraints.push("Should work offline with local data");
  if (containsAny(lower, ["fast", "quick", "speed"])) constraints.push("Optimize for speed of delivery");

  return dedupe(constraints).slice(0, 8);
}

function inferAssumptions(prompt: string, appType: AppType): string[] {
  const lower = prompt.toLowerCase();
  const assumptions: string[] = [];

  if (appType === "content") {
    assumptions.push("Deliverable is a markdown content pack instead of a frontend app.");
    assumptions.push("Variants are provided for quick A/B usage.");
    return assumptions.slice(0, 8);
  }

  if (appType === "audit") {
    assumptions.push("Audit output is framework/checklist based unless source code is provided.");
    assumptions.push("Findings are presented as risk tiers with remediation steps.");
    return assumptions.slice(0, 8);
  }

  if (!containsAny(lower, ["api", "backend", "database"])) {
    assumptions.push("Uses mock or local data unless an API is explicitly required.");
  }
  if (appType !== "landing" && !containsAny(lower, ["routing", "multi-page"])) {
    assumptions.push("Navigation stays lightweight unless multiple views are requested.");
  }
  if (requiresFrontendBridge(lower)) {
    assumptions.push("Backend or automation asks are represented with mocked API adapters and integration status panels in the UI.");
  }
  assumptions.push("Accessibility basics are included through contrast and readable typography.");

  return assumptions.slice(0, 8);
}

function buildAcceptanceChecks(appType: AppType, pages: RouteSpec[], features: FeatureSpec[]): AcceptanceCheck[] {
  const checks: AcceptanceCheck[] = [];

  if (appType === "content") {
    checks.push({
      id: "content-files",
      type: "files",
      description: "Content pack files exist",
      requiredFiles: [
        "README.md",
        "SPEC.md",
        "deliverables/01_main.md",
        "deliverables/02_variants.md",
        "deliverables/03_checklist.md",
        "deliverables/04_summary.txt"
      ]
    });
    return checks;
  }

  if (appType === "audit") {
    checks.push({
      id: "audit-files",
      type: "files",
      description: "Audit pack files exist",
      requiredFiles: [
        "README.md",
        "SPEC.md",
        "deliverables/audit_report.md",
        "deliverables/risk_matrix.md",
        "deliverables/remediation_checklist.md"
      ]
    });
    return checks;
  }

  const requiredFiles = [
    "README.md",
    "SPEC.md",
    "package.json",
    "index.html",
    "src/main.tsx",
    "src/App.tsx",
    "src/index.css",
    "vite.config.ts"
  ];

  checks.push({
    id: "files-base",
    type: "files",
    description: "Required project entrypoints exist",
    requiredFiles: pages.length > 1 ? [...requiredFiles, "src/routes.tsx"] : requiredFiles
  });
  checks.push({
    id: "scripts",
    type: "scripts",
    description: "package.json exposes dev/build scripts",
    requiredScripts: ["dev", "build"]
  });

  if (pages.length > 1) {
    checks.push({
      id: "routes",
      type: "routes",
      description: "Routes are represented in the generated app",
      requiredRoutes: pages.map((page) => page.path)
    });
  }

  const mustFeatures = features.filter((feature) => feature.priority === "must").slice(0, 6);
  for (const feature of mustFeatures) {
    checks.push({
      id: `feature-${feature.id}`,
      type: "ui",
      description: `Prompt coverage: ${feature.description}`,
      containsSnippets: feature.signals.slice(0, 4)
    });
  }

  if (appType === "crud") {
    checks.push({
      id: "behavior-local-storage",
      type: "behavior",
      description: "CRUD flows persist data locally",
      containsSnippets: ["localstorage", "setItem", "getItem"]
    });
  }

  if (features.some((feature) => feature.id === "table-controls")) {
    checks.push({
      id: "ui-table-controls",
      type: "ui",
      description: "Search or filter controls are rendered for data views",
      containsSnippets: ["search", "filter", "status"]
    });
  }

  if (features.some((feature) => feature.id === "export")) {
    checks.push({
      id: "ui-export",
      type: "ui",
      description: "An export action is visible when CSV/export is requested",
      containsSnippets: ["export", "csv"]
    });
  }

  if (appType === "form" || features.some((feature) => feature.id === "auth-session")) {
    checks.push({
      id: "behavior-auth-session",
      type: "behavior",
      description: "Auth stub stores local session state",
      containsSnippets: ["agent-session-email", "localstorage", "sign in"]
    });
  }

  if (appType === "docs") {
    checks.push({
      id: "behavior-docs-search",
      type: "behavior",
      description: "Docs experience includes client-side search/filter behavior",
      containsSnippets: ["searchterm", "filteredsections", "search docs"]
    });
  }

  if (appType === "form" || pages.some((page) => page.path === "/settings")) {
    checks.push({
      id: "behavior-settings-save",
      type: "behavior",
      description: "Settings form saves locally",
      containsSnippets: ["settings-storage-key", "save settings", "localstorage"]
    });
  }

  if (appType === "game") {
    checks.push({
      id: "behavior-game-loop",
      type: "behavior",
      description: "Game includes controls, score updates, and restart handling",
      containsSnippets: ["keydown", "score", "restart", "asteroid"]
    });
  }

  if (appType === "story") {
    checks.push({
      id: "behavior-story-branches",
      type: "behavior",
      description: "Story includes branching choices and multiple endings",
      containsSnippets: ["choice", "ending", "story state", "restart story"]
    });
  }

  checks.push({
    id: "build",
    type: "build",
    description: "Project can build successfully when dependencies are installed",
    command: "npm run build"
  });

  return checks.slice(0, 10);
}

function cleanTitle(value: string): string {
  return value
    .replace(/[`*_#]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\W+|\W+$/g, "")
    .slice(0, 64)
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeFeatureList(features: FeatureSpec[]): FeatureSpec[] {
  const seen = new Set<string>();
  const output: FeatureSpec[] = [];
  for (const feature of features) {
    const key = feature.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(feature);
  }
  return output.slice(0, 14);
}

function defaultEntitiesFor(appType: AppType, lower: string): string[] {
  if (containsAny(lower, ["creator", "influencer"])) return ["creator", "campaign"];
  if (appType === "crud") return ["item"];
  if (appType === "dashboard" || appType === "viz") return ["metric", "report"];
  return ["item"];
}

function requiresFrontendBridge(lower: string): boolean {
  return containsAny(lower, [
    "backend",
    "database",
    "sqlite",
    "python",
    "script",
    "command-line",
    "cli",
    "gmail",
    "google drive",
    "automation",
    "download attachments"
  ]);
}

function singularize(value: string): string {
  if (value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.endsWith("s") && !value.endsWith("ss")) return value.slice(0, -1);
  return value;
}

function pluralize(value: string): string {
  if (value.endsWith("y") && !/[aeiou]y$/i.test(value)) return `${value.slice(0, -1)}ies`;
  if (value.endsWith("s")) return value;
  return `${value}s`;
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
