import fs from "node:fs";
import path from "node:path";
import { PromptSpec, VerificationResult } from "../types/spec";
import { normalizeText } from "../utils/normalizeText";

function extractLikelyBrandTokens(prompt: string): string[] {
  const normalized = normalizeText(prompt);
  const hit =
    normalized.match(/\b(?:called|named)\s+([a-z0-9][a-z0-9\s-]{2,50})/) ??
    normalized.match(/\blanding page for\s+([a-z0-9][a-z0-9\s-]{2,50})/) ??
    normalized.match(/["“]([^"”]{2,50})["”]/) ??
    normalized.match(/'([^']{2,50})'/);

  if (!hit?.[1]) return [];
  return hit[1]
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .filter((token) => !["company", "product", "startup", "landing", "page", "called", "named"].includes(token))
    .slice(0, 2);
}

function extractExpectedBrandName(prompt: string): string | null {
  const normalized = normalizeText(prompt);
  const isLikelyBrand = (value: string): boolean => {
    const cleaned = value.trim();
    if (!cleaned) return false;
    if (/^(a|an|the)\b/.test(cleaned)) return false;
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length > 3) return false;
    if (/\b(product|company|startup|service|tool|website|landing page|app)\b/.test(cleaned)) return false;
    if (/\bwith\b/.test(cleaned)) return false;
    return true;
  };

  const quoted = (
    normalized.match(/["“]([^"”]{2,70})["”]/) ??
    normalized.match(/'([^']{2,70})'/)
  )?.[1]?.trim();
  if (quoted && isLikelyBrand(quoted)) return quoted;
  const called = normalized.match(/\b(?:called|named)\s+([a-z0-9][a-z0-9\s-]{2,70})/)?.[1]?.trim();
  if (called && isLikelyBrand(called)) return called;
  const forMatch = normalized.match(/\bfor\s+([a-z0-9][a-z0-9\s-]{2,70}?)(?=,|\s+\(|\s+(?:a|an|the)\b|\.|$)/)?.[1]?.trim();
  if (forMatch && isLikelyBrand(forMatch)) return forMatch;
  return null;
}

function inferLandingDomainTokens(prompt: string): string[] {
  const lower = normalizeText(prompt);
  const tokens: string[] = [];
  if (/soda|drink|beverage|flavor|nutrition|ingredient|calorie/.test(lower)) tokens.push("flavor", "nutrition", "drink");
  if (/web3|crypto|defi|wallet|token/.test(lower)) tokens.push("web3", "wallet");
  if (/invoice|billing|freelancer|payment/.test(lower)) tokens.push("invoice", "payment");
  if (/moving|mover|storage|relocation|packing|unpacking|haul/.test(lower)) tokens.push("moving", "storage");
  if (/landscap|lawn|yard|garden/.test(lower)) tokens.push("landscap");
  if (/flower|floral|bouquet|wedding|santa cruz/.test(lower)) tokens.push("flower", "bouquet");
  if (/joke|sarcastic|comeback|shirt|sticker|fun/.test(lower)) tokens.push("sarcastic", "sticker");
  return Array.from(new Set(tokens)).slice(0, 3);
}

function verifyLandingQuality(prompt: string, appSource: string): VerificationResult[] {
  const checks: VerificationResult[] = [];
  const source = normalizeText(appSource);
  const promptLower = normalizeText(prompt);

  const brandTokens = extractLikelyBrandTokens(prompt);
  const exactBrand = extractExpectedBrandName(prompt);
  if (exactBrand) {
    const normalizedBrand = normalizeText(exactBrand);
    checks.push({
      step: "acceptance:landing:brand-exact-mention",
      ok: source.includes(normalizedBrand),
      detail: source.includes(normalizedBrand)
        ? `OK (${exactBrand})`
        : `Missing exact brand mention in landing page: ${exactBrand}`
    });
  }

  if (brandTokens.length) {
    const missingBrand = brandTokens.filter((token) => !source.includes(token));
    checks.push({
      step: "acceptance:landing:brand-mention",
      ok: missingBrand.length === 0,
      detail:
        missingBrand.length === 0
          ? `OK (${brandTokens.join(", ")})`
          : `Missing brand tokens in landing page: ${missingBrand.join(", ")}`
    });
  }

  const domainTokens = inferLandingDomainTokens(prompt);
  if (domainTokens.length) {
    const hasDomainSignal = domainTokens.some((token) => source.includes(token));
    checks.push({
      step: "acceptance:landing:domain-context",
      ok: hasDomainSignal,
      detail: hasDomainSignal
        ? `OK (${domainTokens.join(", ")})`
        : `Missing domain context tokens in landing page (${domainTokens.join(", ")})`
    });
  }

  const featuresMatch = appSource.match(/const FEATURES = \[(.*?)\] as const;/s);
  const isPlantFloralPrompt = /plant|houseplant|succulent|bouquet|flowers?|floral|nursery/.test(promptLower);
  if (isPlantFloralPrompt) {
    const plantWhitelist = ["plant", "delivery", "care", "bouquet", "subscription", "succulent", "local", "pickup", "gift"];
    const featuresScope = (featuresMatch?.[1] ?? "").toLowerCase();
    const hits = plantWhitelist.filter((token) => featuresScope.includes(token));
    checks.push({
      step: "acceptance:landing:domain-specificity",
      ok: hits.length >= 3,
      detail: hits.length >= 3 ? `OK (${hits.join(", ")})` : `Need >=3 plant/floral terms in FEATURES, found ${hits.length} (${hits.join(", ") || "none"})`
    });
  }
  const featureCount = featuresMatch ? (featuresMatch[1].match(/","|',\s*'/g)?.length ?? 0) + 1 : 0;
  const hasPlaceholderFeature = /primary service|premium service|managed support/i.test(featuresMatch?.[1] ?? "");
  checks.push({
    step: "acceptance:landing:feature-quality",
    ok: featureCount >= 3 && !hasPlaceholderFeature,
    detail:
      featureCount >= 3 && !hasPlaceholderFeature
        ? `OK (${featureCount} non-placeholder features)`
        : `Need >=3 non-placeholder features (found ${featureCount})`
  });

  const hasValidationSignals =
    /validEmail/.test(appSource) &&
    /Please enter a valid name and email\./.test(appSource) &&
    /Signup captured/.test(appSource);
  checks.push({
    step: "acceptance:landing:form-validation",
    ok: hasValidationSignals,
    detail: hasValidationSignals
      ? "OK (form has validation + success state)"
      : "Missing form validation and/or success confirmation state"
  });

  const bannedScaffoldPhrases = [
    "local-first item management",
    "build a landing page for",
    "this prompt",
    "your company",
    "clarify your offer",
    "present trust and proof",
    "convert with a clear cta",
    "a focused landing experience built to communicate value clearly",
    "your product",
    "your web3 product",
    "happy customer"
  ];
  const scaffoldHits = bannedScaffoldPhrases.filter((phrase) => source.includes(phrase));
  checks.push({
    step: "acceptance:landing:no-scaffold-copy",
    ok: scaffoldHits.length === 0,
    detail:
      scaffoldHits.length === 0
        ? "OK"
        : `Scaffold phrases detected: ${scaffoldHits.join(", ")}`
  });

  const isInvoicingPrompt = /invoice|invoicing|billing|freelancer|payment/.test(promptLower);
  if (isInvoicingPrompt) {
    const invoicingTokens = [
      "invoice",
      "invoic",
      "overdue",
      "reminder",
      "payment link",
      "payment",
      "ach",
      "client",
      "due date",
      "tax",
      "receipt",
      "freelancer"
    ];
    const presentTokens = invoicingTokens.filter((token) => source.includes(token));
    checks.push({
      step: "acceptance:landing:invoicing-domain-coverage",
      ok: presentTokens.length >= 6,
      detail:
        presentTokens.length >= 6
          ? `OK (${presentTokens.length} domain tokens)`
          : `Need >=6 invoicing tokens, found ${presentTokens.length} (${presentTokens.join(", ") || "none"})`
    });

    const featureEntries = Array.from(appSource.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
    const featureScoped = featureEntries.filter((entry) => /invoice|payment|client|due|reminder|ach|receipt|tax|overdue/i.test(entry));
    checks.push({
      step: "acceptance:landing:feature-specificity",
      ok: featureScoped.length >= 4,
      detail:
        featureScoped.length >= 4
          ? `OK (${featureScoped.length} feature/pricing strings include domain terms)`
          : `Need domain-specific features; only ${featureScoped.length} matched invoicing terms`
    });

    const heroSpecific = /freelancer/.test(source) && (/invoice|get paid|payment/.test(source));
    checks.push({
      step: "acceptance:landing:hero-specificity",
      ok: heroSpecific,
      detail: heroSpecific ? "OK" : "Hero copy missing audience/job-to-be-done specificity"
    });

    const pricingBlurbMatches = Array.from(appSource.matchAll(/blurb":"([^"]+)"/g)).map((m) => m[1]);
    const pricingDomain = pricingBlurbMatches.filter((blurb) => /invoice|payment|reminder|client|workflow|billing|freelancer/i.test(blurb));
    checks.push({
      step: "acceptance:landing:pricing-coherence",
      ok: pricingDomain.length >= 2,
      detail:
        pricingDomain.length >= 2
          ? `OK (${pricingDomain.length} pricing blurbs tied to domain)`
          : `Pricing blurbs are generic; only ${pricingDomain.length} mention invoicing workflow terms`
    });
  }

  return checks;
}

function extractPromptKeywords(prompt: string): string[] {
  const lower = normalizeText(prompt);
  const isCommunicationPrompt =
    /\bemail\b/.test(lower) ||
    /\boutreach\b/.test(lower) ||
    /\bnewsletter\b/.test(lower) ||
    /\btweet\b/.test(lower) ||
    /\bthread\b/.test(lower);

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
  // For communication/copy prompts, prioritize channel intent terms over domain acronyms like QA.
  pushIf(/\bqa\b/.test(lower) && !isCommunicationPrompt, "qa");
  pushIf(/\bweb\s+apps?\b/.test(lower), "web");
  pushIf(/\blanding\b/.test(lower), "landing");
  pushIf(/\bcold\s+email\b/.test(lower) || /\boutreach\s+email\b/.test(lower) || /\bemail\b/.test(lower), "email");
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
    "analyze",
    "viral",
    "twitter",
    "deploying",
    "automate",
    "smart",
    "contract",
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
    "topic",
    "topics",
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
  const hasKeyword = (keyword: string): boolean => {
    if (normalizedBody.includes(keyword)) return true;
    if (keyword.endsWith("s") && normalizedBody.includes(keyword.slice(0, -1))) return true;
    if (keyword.endsWith("ing") && normalizedBody.includes(keyword.slice(0, -3))) return true;
    if (keyword.endsWith("ed") && normalizedBody.includes(keyword.slice(0, -2))) return true;
    return false;
  };

  const missing = keywords.filter((k) => !hasKeyword(k));
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

  if (spec.appType === "landing") {
    const appPath = path.join(projectDir, "src/App.tsx");
    if (fs.existsSync(appPath)) {
      const appSource = fs.readFileSync(appPath, "utf8");
      checks.push(...verifyLandingQuality(spec.rawPrompt ?? "", appSource));
    } else {
      checks.push({
        step: "acceptance:landing:source",
        ok: false,
        detail: "Missing src/App.tsx for landing quality checks"
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
