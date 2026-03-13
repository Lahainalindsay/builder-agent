export type AppType =
  | "landing"
  | "dashboard"
  | "crud"
  | "viz"
  | "form"
  | "docs"
  | "game"
  | "story"
  | "content"
  | "audit"
  | "fallback";

export interface RouteSpec {
  path: string;
  title: string;
  purpose?: string;
}

export interface EntityField {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "id";
  required?: boolean;
}

export interface EntitySpec {
  name: string;
  plural?: string;
  fields?: EntityField[];
}

export type FeaturePriority = "must" | "should" | "could";
export type FeatureSurface = "page" | "component" | "workflow" | "data" | "integration" | "behavior";

export interface FeatureSpec {
  id: string;
  description: string;
  priority: FeaturePriority;
  surface: FeatureSurface;
  signals: string[];
}

export type FeaturePack =
  | "router-pack"
  | "table-pack"
  | "form-pack"
  | "settings-form-pack"
  | "persistence-pack"
  | "export-pack"
  | "auth-stub-pack"
  | "docs-search-pack";

export interface DataModelSpec {
  entities: EntitySpec[];
}

export type AcceptanceCheckType =
  | "files"
  | "scripts"
  | "routes"
  | "ui"
  | "behavior"
  | "build";

export interface AcceptanceCheck {
  id: string;
  type: AcceptanceCheckType;
  description: string;
  requiredFiles?: string[];
  requiredScripts?: string[];
  requiredRoutes?: string[];
  containsSnippets?: string[];
  command?: string;
}

export interface PromptSpec {
  rawPrompt: string;
  appType: AppType;
  appName: string;
  designTone: "neutral" | "playful" | "luxury";
  goal: string;
  users: string[];
  pages: RouteSpec[];
  routes: RouteSpec[];
  dataModel: DataModelSpec;
  entities: EntitySpec[];
  features: FeatureSpec[];
  featurePacks: FeaturePack[];
  mustHave: string[];
  niceToHave: string[];
  constraints: string[];
  assumptions: string[];
  intent?: PromptIntent;
  promptStructure?: PromptStructure;
  llmAssist?: ContentLlmAssist;
  landingLlmAssist?: LandingLlmAssist;
  acceptanceChecks: AcceptanceCheck[];
}

export type DeliverableType =
  | "landing_page"
  | "tweet_thread"
  | "email"
  | "pitch_deck"
  | "newsletter_ideas"
  | "market_analysis"
  | "audit_report"
  | "dashboard_app"
  | "crud_app"
  | "viz_app"
  | "docs_app"
  | "game_app"
  | "story_app"
  | "unknown";

export type AudienceType =
  | "freelancers"
  | "real_estate_agents"
  | "developer_team"
  | "finance_team"
  | "support_team"
  | "founders"
  | "general";

export type DomainType =
  | "invoicing"
  | "accounting"
  | "real_estate"
  | "devtools"
  | "customer_support"
  | "crypto_web3"
  | "ecommerce"
  | "moving_storage"
  | "landscaping"
  | "floral"
  | "generic";

export interface PromptIntent {
  deliverable: DeliverableType;
  audience: AudienceType;
  domain: DomainType;
  goal?: "conversion" | "informational" | "portfolio";
  primaryAction?: "shop" | "email_signup" | "book" | "contact" | "learn_more";
  secondaryAction?: "shop" | "email_signup" | "book" | "contact" | "learn_more";
  audienceSegments?: string[];
  audienceDetail?: string;
  brandStyle?: string[];
  brandName?: string;
  productType?: string;
  subject?: string;
  requirements: string[];
  sections: string[];
  normalizedSections?: string[];
  tone?: "direct" | "friendly" | "professional" | "hype" | "technical";
}

export interface ClauseIntent {
  verb: string;
  object: string;
  clause: string;
}

export interface PromptStructure {
  normalizedPrompt: string;
  intents: ClauseIntent[];
  deliverableHint: AppType | null;
  subjectName: string | null;
  subjectDescriptor: string | null;
  audience: string | null;
  brandTone: string[];
  includeItems: string[];
  pageItems: string[];
  domainKeywords: string[];
}

export interface ContentLlmAssist {
  main: string;
  variants: string[];
  checklist: string[];
  keywords: string[];
}

export interface LandingLlmAssist {
  brandName: string;
  tagline?: string;
  hero: {
    headline: string;
    subheadline: string;
    primaryCta: string;
    secondaryCta?: string;
  };
  sections: {
    features: Array<{ title: string; description: string }>;
    socialProof?: string[];
    testimonials: Array<{ quote: string; author: string; role: string }>;
    pricing: Array<{ name: string; price: string; blurb: string }>;
    faq: Array<{ q: string; a: string }>;
  };
  signup: {
    title: string;
    button: string;
    fields: Array<{ name: "name" | "email"; label: string; placeholder: string }>;
    successMessage: string;
  };
  style: {
    vibeKeywords: string[];
    accentHex: string;
    heroImageQuery: string;
    iconMotif?: "bolt" | "leaf" | "shield" | "sparkles" | "rocket" | "compass";
  };
  compliance: {
    noFakeClaims: true;
    noCustomerLogos: true;
  };
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface TemplateDefinition {
  id: string;
  label: string;
  appType: AppType;
  generate(spec: PromptSpec): GeneratedFile[];
}

export interface BuildResult {
  spec: PromptSpec;
  templateId: string;
  files: GeneratedFile[];
  outputDir: string;
  zipPath: string | null;
  verification: VerificationResult[];
  repairApplied: boolean;
}

export interface VerificationResult {
  step: string;
  ok: boolean;
  detail: string;
}

export function formatAcceptanceChecksMarkdown(checks: AcceptanceCheck[]): string {
  return checks
    .map((check) => {
      const extras: string[] = [];
      if (check.requiredFiles?.length) extras.push(`files: ${check.requiredFiles.join(", ")}`);
      if (check.requiredScripts?.length) extras.push(`scripts: ${check.requiredScripts.join(", ")}`);
      if (check.requiredRoutes?.length) extras.push(`routes: ${check.requiredRoutes.join(", ")}`);
      if (check.command) extras.push(`cmd: ${check.command}`);
      const suffix = extras.length ? ` _( ${extras.join(" | ")} )_` : "";
      return `- **${check.type}**: ${check.description}${suffix}`;
    })
    .join("\n");
}
