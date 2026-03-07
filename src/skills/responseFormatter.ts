import fs from "node:fs";
import path from "node:path";
import { BuildResult } from "../types/spec";
import { LookupResult } from "./lookupEngine";

interface FormatParams {
  result: BuildResult;
  lookups: LookupResult;
}

function loadTechnicalTemplate(rootDir = process.cwd()): string | null {
  const templatePath = path.join(rootDir, "skills", "rules", "response-formats.md");
  if (!fs.existsSync(templatePath)) return null;
  const raw = fs.readFileSync(templatePath, "utf8");

  const sectionIndex = raw.toLowerCase().indexOf("technical response");
  if (sectionIndex < 0) return null;
  const section = raw.slice(sectionIndex);
  const codeBlock = section.match(/```[\w-]*\n([\s\S]*?)```/);
  if (!codeBlock) return null;
  return codeBlock[1].trim();
}

function buildReferences(lookups: LookupResult): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const item of lookups.items) {
    for (const reference of item.references) {
      if (seen.has(reference.url)) continue;
      seen.add(reference.url);
      refs.push(`- ${reference.label}: ${reference.url}`);
    }
  }
  return refs;
}

function defaultTemplate(params: FormatParams): string {
  const { result, lookups } = params;
  const implemented = result.spec.features
    .filter((feature) => feature.priority === "must" || feature.priority === "should")
    .slice(0, 8)
    .map((feature) => `- ${feature.description}`);
  const runBlock =
    result.spec.appType === "content" || result.spec.appType === "audit"
      ? ["```text", "Open README.md and files under deliverables/.", "Use 01_main or audit_report as the primary output.", "```"].join("\n")
      : ["```bash", "npm install", "npm run dev", "npm run build", "```"].join("\n");
  const lookupLines = lookups.items.map((item) => `- ${item.summary}`);
  const refs = buildReferences(lookups);

  return [
    "## Summary",
    `${result.spec.appName} was generated and packaged as a frontend deliverable.`,
    "",
    "## Implementation",
    ...implemented,
    "",
    "## Run",
    runBlock,
    "",
    "## External Data",
    ...(lookupLines.length ? lookupLines : ["- No external lookups were triggered for this prompt."]),
    "",
    "## References",
    ...(refs.length ? refs : ["- None"])
  ].join("\n");
}

export function formatResponseContent(params: FormatParams): string {
  const template = loadTechnicalTemplate();
  const { result, lookups } = params;
  if (!template) return defaultTemplate(params);

  const refs = buildReferences(lookups);
  const replacementMap: Record<string, string> = {
    "{brief_overview}": `${result.spec.appName} was generated and packaged as a frontend project.`,
    "{detailed_solution}": result.spec.features
      .filter((feature) => feature.priority === "must" || feature.priority === "should")
      .slice(0, 8)
      .map((feature) => `- ${feature.description}`)
      .join("\n"),
    "{code_snippet}":
      result.spec.appType === "content" || result.spec.appType === "audit"
        ? ["Open README.md", "Review deliverables/*.md", "Use the primary file for submission"].join("\n")
        : ["npm install", "npm run dev", "npm run build"].join("\n"),
    "{language}": "bash",
    "{source_1}": refs[0] ?? "None",
    "{source_2}": refs[1] ?? "None"
  };

  let output = template;
  for (const [token, value] of Object.entries(replacementMap)) {
    output = output.split(token).join(value);
  }
  return output;
}
