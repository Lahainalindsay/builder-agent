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
  llmAssist?: ContentLlmAssist;
  acceptanceChecks: AcceptanceCheck[];
}

export interface ContentLlmAssist {
  main: string;
  variants: string[];
  checklist: string[];
  keywords: string[];
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
