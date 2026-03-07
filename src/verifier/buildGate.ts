import fs from "node:fs";
import path from "node:path";
import { PromptSpec, VerificationResult } from "../types/spec";
import { normalizeText } from "../utils/normalizeText";

function extractPromptKeywords(prompt: string): string[] {
  const lower = normalizeText(prompt);

  const named: string[] = [];
  const calledMatch =
    lower.match(/\b(?:called|named)\s+([a-z0-9][a-z0-9\s-]{2,40})/i) ??
    lower.match(/\bproject\s+called\s+([a-z0-9][a-z0-9\s-]{2,40})/i);
  if (calledMatch?.[1]) {
    const phrase = calledMatch[1].trim().replace(/\s+/g, " ");
    const parts = phrase.split(" ").filter(Boolean);
    if (parts[0]) named.push(parts[0]);
    if (parts[1] && parts[1].length >= 4) named.push(parts[1]);
  }

  const strongAnchors: string[] = [];
  const pushIf = (cond: boolean, token: string): void => {
    if (cond) strongAnchors.push(token);
  };

  pushIf(/\bnft\b/.test(lower), "nft");
  pushIf(/\bnewsletter\b/.test(lower), "newsletter");
  pushIf(/\bthread\b/.test(lower), "thread");
  pushIf(/\btweet\b/.test(lower), "tweet");
  pushIf(/\bpitch\s*deck\b/.test(lower), "deck");
  pushIf(/\baudit\b/.test(lower) || /\bvulnerab/i.test(lower), "audit");
  pushIf(/\berc[-\s]?20\b/.test(lower) || /\berc20\b/.test(lower), "erc");
  pushIf(/\bqa\b/.test(lower), "qa");
  pushIf(/\bweb\s+apps?\b/.test(lower), "web");
  pushIf(/\blanding\b/.test(lower), "landing");
  pushIf(/\bcold\s+email\b/.test(lower), "email");
  pushIf(/\boutreach\b/.test(lower), "outreach");
  pushIf(/\bmarket\s+analysis\b/.test(lower), "analysis");
  pushIf(/\btools?\b/.test(lower), "tools");

  const stop = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "to",
    "for",
    "with",
    "in",
    "on",
    "of",
    "at",
    "by",
    "from",
    "into",
    "about",
    "that",
    "this",
    "these",
    "those",
    "me",
    "my",
    "your",
    "their",
    "our",
    "we",
    "you",
    "write",
    "create",
    "generate",
    "produce",
    "build",
    "design",
    "draft",
    "provide",
    "give",
    "list",
    "explain",
    "explaining",
    "include",
    "including",
    "should",
    "must",
    "project",
    "called",
    "named",
    "new",
    "weekly",
    "short",
    "basic",
    "top",
    "best",
    "major",
    "startup",
    "app",
    "apps",
    "platform",
    "platforms",
    "company",
    "product",
    "copy",
    "document",
    "report",
    "outline",
    "ideas",
    "manager",
    "managers"
  ]);

  const candidates = lower
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .filter((token) => !stop.has(token))
    .filter((token) => !/^\d+$/.test(token));

  const ordered =
    named.length + strongAnchors.length >= 2
      ? [...named, ...strongAnchors]
      : [...named, ...strongAnchors, ...candidates];
  const uniq: string[] = [];
  for (const token of ordered) {
    if (!uniq.includes(token)) uniq.push(token);
  }

  return uniq.slice(0, 3);
}

function keywordCoverageResult(prompt: string, body: string): { ok: boolean; detail: string } {
  const normalizedPrompt = normalizeText(prompt);
  const normalizedBody = normalizeText(body);

  const keywords = extractPromptKeywords(normalizedPrompt);
  if (keywords.length === 0) {
    return { ok: true, detail: "OK (no keywords extracted)" };
  }
  const missing = keywords.filter((k) => !normalizedBody.includes(k));
  return {
    ok: missing.length === 0,
    detail: missing.length ? `Missing keywords: ${missing.join(", ")} (expected: ${keywords.join(", ")})` : `OK (${keywords.join(", ")})`
  };
}

export function verifyGeneratedProject(projectDir: string, spec?: PromptSpec): VerificationResult[] {
  const staticChecks = runStaticChecks(projectDir, spec);
  return staticChecks;
}

export function runStaticChecks(projectDir: string, spec?: PromptSpec): VerificationResult[] {
  const checks: VerificationResult[] = [];
  const requiredFiles =
    spec?.appType === "content"
      ? [
          "README.md",
          "SPEC.md",
          "deliverables/01_main.md",
          "deliverables/02_variants.md",
          "deliverables/03_checklist.md",
          "deliverables/04_summary.txt"
        ]
      : spec?.appType === "audit"
      ? [
          "README.md",
          "SPEC.md",
          "deliverables/audit_report.md",
          "deliverables/risk_matrix.md",
          "deliverables/remediation_checklist.md"
        ]
      : [
          "README.md",
          "SPEC.md",
          "package.json",
          "index.html",
          "src/main.tsx",
          "src/App.tsx",
          "src/index.css",
          "vite.config.ts",
          "tailwind.config.ts",
          "postcss.config.cjs"
        ];

  for (const relativePath of requiredFiles) {
    const fullPath = path.join(projectDir, relativePath);
    checks.push({
      step: `file:${relativePath}`,
      ok: fs.existsSync(fullPath),
      detail: fs.existsSync(fullPath) ? "OK" : `Missing required file ${relativePath}`
    });
  }

  if (spec?.appType !== "content" && spec?.appType !== "audit") {
    const packageJsonPath = path.join(projectDir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
      checks.push({
        step: "scripts:build",
        ok: Boolean(packageJson.scripts?.build),
        detail: packageJson.scripts?.build ? packageJson.scripts.build : "Missing build script"
      });
      checks.push({
        step: "scripts:dev",
        ok: Boolean(packageJson.scripts?.dev),
        detail: packageJson.scripts?.dev ? packageJson.scripts.dev : "Missing dev script"
      });
    }
  }

  if (!spec) {
    return checks;
  }

  // Hard-fail keyword coverage for content/audit packs to prevent prompt drift.
  try {
    const promptText = spec.rawPrompt ?? "";

    if (spec.appType === "content") {
      const mainPath = path.join(projectDir, "deliverables/01_main.md");
      if (fs.existsSync(mainPath)) {
        const body = fs.readFileSync(mainPath, "utf8");
        const cov = keywordCoverageResult(promptText, body);
        checks.push({
          step: "acceptance:keywords:deliverables/01_main.md",
          ok: cov.ok,
          detail: cov.detail
        });
      } else {
        checks.push({
          step: "acceptance:keywords:deliverables/01_main.md",
          ok: false,
          detail: "Missing deliverables/01_main.md for keyword coverage check"
        });
      }
    }

    if (spec.appType === "audit") {
      const auditPath = path.join(projectDir, "deliverables/audit_report.md");
      if (fs.existsSync(auditPath)) {
        const body = fs.readFileSync(auditPath, "utf8");
        const cov = keywordCoverageResult(promptText, body);
        checks.push({
          step: "acceptance:keywords:deliverables/audit_report.md",
          ok: cov.ok,
          detail: cov.detail
        });
      } else {
        checks.push({
          step: "acceptance:keywords:deliverables/audit_report.md",
          ok: false,
          detail: "Missing deliverables/audit_report.md for keyword coverage check"
        });
      }
    }
  } catch (error) {
    checks.push({
      step: "acceptance:keywords:error",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  if (spec.appType === "audit") {
    const promptLower = spec.rawPrompt.toLowerCase();
    if (promptLower.includes("erc-20") || promptLower.includes("erc20")) {
      const reportPath = path.join(projectDir, "deliverables/audit_report.md");
      const report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8").toLowerCase() : "";
      const ok = report.includes("erc-20") || report.includes("erc20") || report.includes("erc");
      checks.push({
        step: "acceptance:keywords:audit-report",
        ok,
        detail: ok ? "OK (erc)" : "Missing ERC-20/ERC20 keyword in audit report"
      });
    }
  }

  const searchableFiles = collectSearchableFiles(projectDir);

  for (const check of spec.acceptanceChecks) {
    if (check.requiredFiles?.length) {
      for (const relativePath of check.requiredFiles) {
        const fullPath = path.join(projectDir, relativePath);
        checks.push({
          step: `acceptance:file:${check.id}:${relativePath}`,
          ok: fs.existsSync(fullPath),
          detail: fs.existsSync(fullPath) ? "OK" : `Missing required file ${relativePath}`
        });
      }
    }

    if (check.requiredScripts?.length) {
      const packageJsonPath = path.join(projectDir, "package.json");
      const packageJson = fs.existsSync(packageJsonPath)
        ? (JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { scripts?: Record<string, string> })
        : { scripts: {} };
      for (const scriptName of check.requiredScripts) {
        checks.push({
          step: `acceptance:script:${check.id}:${scriptName}`,
          ok: Boolean(packageJson.scripts?.[scriptName]),
          detail: packageJson.scripts?.[scriptName] ? packageJson.scripts[scriptName] : `Missing script ${scriptName}`
        });
      }
    }

    if (check.requiredRoutes?.length) {
      const routeSource = searchableFiles.find((file) => file.path.endsWith("src/routes.tsx"))?.content ?? "";
      const appSource = searchableFiles.find((file) => file.path.endsWith("src/App.tsx"))?.content ?? "";
      for (const route of check.requiredRoutes) {
        const routeToken = route === "/" ? "index: true" : route.replace(/^\/+/, "");
        const routeFound = routeSource.includes(routeToken) || appSource.includes(route);
        checks.push({
          step: `acceptance:route:${check.id}:${route}`,
          ok: routeFound,
          detail: routeFound ? "OK" : `Route ${route} not found in generated source`
        });
      }
    }

    if (check.containsSnippets?.length) {
      const haystack = searchableFiles.map((file) => file.content.toLowerCase()).join("\n");
      const matched = check.containsSnippets.filter((snippet) => haystack.includes(snippet.toLowerCase()));
      const missing = check.containsSnippets.filter((snippet) => !haystack.includes(snippet.toLowerCase()));
      checks.push({
        step: `acceptance:snippets:${check.id}`,
        ok: matched.length > 0,
        detail: matched.length > 0 ? `Matched snippets: ${matched.join(", ")}` : `Missing snippets: ${missing.join(", ")}`
      });
    }
  }

  return checks;
}

function collectSearchableFiles(projectDir: string): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];

  function walk(currentDir: string): void {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!/\.(md|json|tsx|ts|html|css|cjs)$/i.test(entry.name)) continue;
      files.push({
        path: fullPath,
        content: fs.readFileSync(fullPath, "utf8")
      });
    }
  }

  walk(projectDir);
  return files;
}
