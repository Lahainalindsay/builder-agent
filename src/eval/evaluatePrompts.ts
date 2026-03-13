import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { buildProject } from "../builder/projectAssembler";
import { AppType } from "../types/spec";
import { runCommand } from "../utils/exec";
import { runStaticChecks } from "../verifier/buildGate";

interface ScoreBreakdown {
  functionality: number;
  design: number;
  speed: number;
  total: number;
  notes: string[];
}

interface EvalCaseResult {
  name: string;
  promptFile: string;
  outputDir: string;
  zipPath: string | null;
  templateId: string;
  ms: number;
  fileCount: number;
  depCount: number;
  verificationOk: boolean;
  buildReady: boolean | null;
  sampleBuild: {
    attempted: boolean;
    installOk: boolean | null;
    buildOk: boolean | null;
    detail?: string;
  };
  staticOk: boolean;
  acceptanceOk: boolean;
  promptCoverageOk: boolean;
  classifierOptimal: boolean;
  expectedAppType: AppType | "unknown";
  behaviorOk: boolean;
  scores: ScoreBreakdown;
}

function listPromptFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".txt"))
    .map((file) => path.join(dir, file))
    .sort();
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function collectSearchableText(root: string): string {
  const parts: string[] = [];

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!/\.(md|json|tsx|ts|html|css|cjs)$/i.test(entry.name)) continue;
      parts.push(fs.readFileSync(fullPath, "utf8"));
    }
  }

  walk(root);
  return parts.join("\n").toLowerCase();
}

function countDeps(packageJsonPath: string): number {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.devDependencies ?? {}).length;
  } catch {
    return 999;
  }
}

function countFilesRecursively(root: string): number {
  let count = 0;

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else count += 1;
    }
  }

  walk(root);
  return count;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreCase(params: {
  ms: number;
  verificationOk: boolean;
  buildReady: boolean | null;
  staticOk: boolean;
  acceptanceOk: boolean;
  hasSpec: boolean;
  hasReadme: boolean;
  depCount: number;
  fileCount: number;
  appTsx: string;
  promptCoverageOk: boolean;
  behaviorOk: boolean;
  classifierOptimal: boolean;
  expectedAppType: AppType | "unknown";
}): ScoreBreakdown {
  const notes: string[] = [];

  let functionality = 0;
  if (params.staticOk) functionality += 3;
  if (params.acceptanceOk) functionality += 1;
  if (params.promptCoverageOk) functionality += 2;
  if (params.behaviorOk) functionality += 1;
  if (params.hasReadme) functionality += 1;
  if (params.hasSpec) functionality += 1;
  if (params.classifierOptimal) functionality += 0.5;
  if (params.buildReady === true) functionality += 1;
  if (params.buildReady === null) notes.push("Build readiness unknown in sandbox");
  if (params.buildReady === false) notes.push("Build verification failed");
  if (!params.promptCoverageOk) notes.push("Prompt coverage snippets missing");
  if (!params.staticOk) notes.push("Static verification failed");
  if (!params.acceptanceOk) notes.push("Structured acceptance checks failed");
  if (!params.behaviorOk) notes.push("Behavioral surface missing");
  if (!params.classifierOptimal) notes.push(`Classifier mismatch: expected ${params.expectedAppType}`);
  if (params.buildReady !== true) {
    functionality = Math.min(functionality, 9);
  }
  functionality = clamp(Math.round(functionality * 10) / 10, 0, 10);

  let design = 0;
  const hasTailwind = params.appTsx.includes("className=") && params.appTsx.includes("rounded");
  const hasResponsive = /md:|lg:|xl:/.test(params.appTsx);
  const hasHierarchy = /max-w-|shadow-|border-/.test(params.appTsx);
  if (hasTailwind) design += 4;
  if (hasResponsive) design += 2;
  if (hasHierarchy) design += 2;
  if (params.fileCount <= 16) design += 1;
  if (params.depCount <= 12) design += 1;
  if (!hasResponsive) notes.push("Design proxy: missing responsive class markers");
  design = clamp(design, 0, 10);

  let speed = 10;
  const seconds = params.ms / 1000;
  if (seconds > 1) speed -= Math.floor((seconds - 1) / 2);
  if (params.depCount > 10) speed -= 1;
  if (params.depCount > 12) speed -= 2;
  if (params.depCount > 16) speed -= 2;
  if (params.fileCount > 14) speed -= 1;
  if (params.fileCount > 20) speed -= 2;
  if (!params.classifierOptimal) speed -= 1;
  speed = clamp(speed, 0, 10);

  const total = clamp(Math.round((functionality + design + speed) * 10) / 10, 0, 30);
  return { functionality, design, speed, total, notes };
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function printTable(rows: Array<Record<string, string | number | boolean>>): void {
  const columns = Object.keys(rows[0] ?? {});
  const widths = columns.map((column) => Math.max(column.length, ...rows.map((row) => String(row[column]).length)));
  const formatLine = (values: string[]) => values.map((value, index) => value.padEnd(widths[index])).join("  ");

  console.log(formatLine(columns));
  console.log(formatLine(columns.map((_, index) => "-".repeat(widths[index]))));
  for (const row of rows) {
    console.log(formatLine(columns.map((column) => String(row[column]))));
  }
}

function parseNumberFlag(name: string): number | null {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!raw) return null;
  const value = Number.parseInt(raw.slice(name.length + 1), 10);
  return Number.isFinite(value) ? value : null;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function inferBehaviorOk(appType: AppType, searchable: string): boolean {
  switch (appType) {
    case "crud":
      return includesAll(searchable, ["localstorage", "save", "records"]) || (searchable.includes("setitem") && searchable.includes("queue"));
    case "docs":
      return includesAll(searchable, ["search", "docs", "getting started"]) || (searchable.includes("docs index") && searchable.includes("search docs"));
    case "dashboard":
      return includesAll(searchable, ["revenue", "performance breakdown", "recent activity"]);
    case "form":
      return includesAll(searchable, ["sign in", "input", "settings"]) || (searchable.includes("agent-session-email") && searchable.includes("notifications"));
    case "viz":
      return includesAll(searchable, ["trend", "value", "weekly"]) || searchable.includes("lightweight bars");
    case "landing":
      return includesAll(searchable, ["hero", "feature", "cta"]) || (searchable.includes("get started") && searchable.includes("feature"));
    case "game":
      return (
        includesAll(searchable, ["keyboard", "score", "restart"]) &&
        (searchable.includes("asteroid") ||
          searchable.includes("obstacle") ||
          searchable.includes("downhill") ||
          searchable.includes("coin"))
      );
    case "story":
      return includesAll(searchable, ["choice", "ending", "story state"]) || searchable.includes("restart story");
    case "fallback":
    default:
      return searchable.includes("prompt") && searchable.includes("execution policy");
  }
}

function expectedAppTypeFromPrompt(prompt: string): AppType | "unknown" {
  const lower = prompt.toLowerCase();
  if (includesAny(lower, ["knowledge base", "help center", "documentation", "docs"])) return "docs";
  if (includesAny(lower, ["sign in", "login", "auth", "settings console", "profile settings"])) return "form";
  if (includesAny(lower, ["landing page", "marketing site", "hero cta", "hero section"])) return "landing";
  if (includesAny(lower, ["dashboard", "kpi", "metrics", "reports page", "analytics dashboard"])) return "dashboard";
  if (includesAny(lower, ["visualize", "trend", "lightweight bar", "lightweight charts"])) return "viz";
  if (includesAny(lower, ["manage", "create and list", "track vendor records", "support create", "filter by status", "local persistence"])) {
    return "crud";
  }
  return "unknown";
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function includesAll(haystack: string, needles: string[]): boolean {
  return needles.every((needle) => haystack.includes(needle));
}

function selectSampleIndexes(total: number, count: number): Set<number> {
  const safeCount = Math.max(0, Math.min(count, total));
  if (safeCount === 0) return new Set<number>();
  if (safeCount >= total) return new Set(Array.from({ length: total }, (_, index) => index));

  const picks = new Set<number>();
  for (let i = 0; i < safeCount; i += 1) {
    const index = Math.round((i * (total - 1)) / Math.max(1, safeCount - 1));
    picks.add(index);
  }
  return picks;
}

function attemptSampleBuild(projectDir: string): {
  attempted: boolean;
  installOk: boolean | null;
  buildOk: boolean | null;
  detail?: string;
} {
  const lockfile = path.join(projectDir, "package-lock.json");
  const installCommand = fs.existsSync(lockfile) ? ["ci"] : ["install"];
  const install = runCommand("npm", installCommand, projectDir);
  if (!install.ok) {
    return {
      attempted: true,
      installOk: false,
      buildOk: null,
      detail: install.detail
    };
  }

  const build = runCommand("npm", ["run", "build"], projectDir);
  return {
    attempted: true,
    installOk: true,
    buildOk: build.ok,
    detail: build.detail
  };
}

async function main(): Promise<void> {
  const quick = process.argv.includes("--quick");
  const verifyBuilds = process.argv.includes("--verify-builds");
  const sampleBuildCount = parseNumberFlag("--sample-builds") ?? 0;
  const promptDir = path.join(process.cwd(), "examples", "prompts");
  const promptFiles = (quick ? listPromptFiles(promptDir).slice(0, 6) : listPromptFiles(promptDir));
  const sampleIndexes = selectSampleIndexes(promptFiles.length, sampleBuildCount);

  if (!promptFiles.length) {
    console.error(`No prompts found at ${promptDir}. Add .txt files to run eval.`);
    process.exit(1);
  }

  const outputRoot = path.join(process.cwd(), ".runs", "eval");
  ensureDir(outputRoot);

  const results: EvalCaseResult[] = [];
  const previousAutoInstall = process.env.AUTO_INSTALL_GENERATED_DEPS;
  if (verifyBuilds) {
    process.env.AUTO_INSTALL_GENERATED_DEPS = "true";
  }

  for (const [index, promptFile] of promptFiles.entries()) {
    const promptText = readFile(promptFile);
    const name = path.basename(promptFile, ".txt");
    const outputDir = path.join(outputRoot, toSlug(name));
    const expectedAppType = expectedAppTypeFromPrompt(promptText);

    const startedAt = performance.now();
    const result = await buildProject(promptText, outputDir);
    const ms = Math.round(performance.now() - startedAt);

    const packageJsonPath = path.join(result.outputDir, "package.json");
    const appPath = path.join(result.outputDir, "src", "App.tsx");
    const specPath = path.join(result.outputDir, "SPEC.md");
    const readmePath = path.join(result.outputDir, "README.md");

    const depCount = countDeps(packageJsonPath);
    const fileCount = countFilesRecursively(result.outputDir);
    const appTsx = fs.existsSync(appPath) ? readFile(appPath) : "";
    const staticVerification = runStaticChecks(result.outputDir);
    const acceptanceVerification = runStaticChecks(result.outputDir, result.spec);
    const staticOk = !staticVerification.some((verification) => !verification.ok);
    const acceptanceOk = !acceptanceVerification.some((verification) => !verification.ok);
    const buildReady = result.verification.some((verification) => verification.step === "npm run build")
      ? !result.verification.some((verification) => verification.step === "npm run build" && !verification.ok)
      : null;
    const sampleBuild = sampleIndexes.has(index)
      ? attemptSampleBuild(result.outputDir)
      : { attempted: false, installOk: null, buildOk: null as boolean | null };
    const verificationOk = !result.verification.some(
      (verification) => !verification.ok && !verification.step.startsWith("dependencies")
    );
    const searchable = collectSearchableText(result.outputDir);
    const promptCoverageOk = result.spec.features
      .filter((feature) => feature.priority === "must")
      .every((feature) => feature.signals.some((signal) => searchable.includes(signal.toLowerCase())));
    const classifierOptimal = expectedAppType === "unknown" ? true : result.spec.appType === expectedAppType;
    const behaviorOk = inferBehaviorOk(result.spec.appType, searchable);

    const scores = scoreCase({
      ms,
      verificationOk,
      buildReady,
      staticOk,
      acceptanceOk,
      hasSpec: fs.existsSync(specPath),
      hasReadme: fs.existsSync(readmePath),
      depCount,
      fileCount,
      appTsx,
      promptCoverageOk,
      behaviorOk,
      classifierOptimal,
      expectedAppType
    });

    results.push({
      name,
      promptFile,
      outputDir: result.outputDir,
      zipPath: result.zipPath,
      templateId: result.templateId,
      ms,
      fileCount,
      depCount,
      verificationOk,
      buildReady,
      sampleBuild,
      staticOk,
      acceptanceOk,
      promptCoverageOk,
      classifierOptimal,
      expectedAppType,
      behaviorOk,
      scores
    });
  }

  if (previousAutoInstall == null) delete process.env.AUTO_INSTALL_GENERATED_DEPS;
  else process.env.AUTO_INSTALL_GENERATED_DEPS = previousAutoInstall;

  const summary = {
    generatedAt: new Date().toISOString(),
    cases: results.length,
    modes: {
      quick,
      verifyBuilds,
      sampleBuildCount
    },
    average: {
      functionality: average(results.map((result) => result.scores.functionality)),
      design: average(results.map((result) => result.scores.design)),
      speed: average(results.map((result) => result.scores.speed)),
      total: average(results.map((result) => result.scores.total))
    },
    classifierAudit: {
      suboptimalCases: results
        .filter((result) => !result.classifierOptimal)
        .map((result) => ({
          case: result.name,
          expectedAppType: result.expectedAppType,
          actualAppType: result.templateId
        }))
    },
    results
  };

  writeJson(path.join(outputRoot, "report.json"), summary);

  printTable(
    results.map((result) => ({
      case: result.name,
      template: result.templateId,
      ms: result.ms,
      deps: result.depCount,
      files: result.fileCount,
      ok: result.verificationOk,
      build: result.buildReady === null ? "unknown" : result.buildReady,
      sample: result.sampleBuild.attempted ? (result.sampleBuild.buildOk === true ? "pass" : result.sampleBuild.installOk === false ? "install-fail" : "build-fail") : "-",
      static: result.staticOk,
      acceptance: result.acceptanceOk,
      coverage: result.promptCoverageOk,
      behavior: result.behaviorOk,
      optimal: result.classifierOptimal,
      func: result.scores.functionality,
      design: result.scores.design,
      speed: result.scores.speed,
      total: result.scores.total
    }))
  );

  console.log(`\nWrote report: ${path.join(outputRoot, "report.json")}`);

  if (results.some((result) => !result.staticOk || !result.acceptanceOk || !result.promptCoverageOk)) {
    process.exitCode = 1;
  }

  const suboptimal = results.filter((result) => !result.classifierOptimal);
  if (suboptimal.length) {
    console.log("\nClassifier audit:");
    for (const result of suboptimal) {
      console.log(`- ${result.name}: expected ${result.expectedAppType}, got ${result.templateId}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
