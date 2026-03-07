import path from "node:path";
import { compilePrompt } from "../planner/compilePrompt";
import { enrichPromptForBuild } from "../planner/promptEnrichment";
import { selectTemplate } from "../router/selectTemplate";
import { writeFiles } from "../utils/fs";
import { verifyGeneratedProject } from "../verifier/buildGate";
import { verifyZipContainsFiles } from "../verifier/zipGate";
import { attemptBuildRepair } from "./buildAttempt";
import { attemptRepair } from "./repairProject";
import { zipProject } from "./zipProject";
import { BuildResult } from "../types/spec";
import { runExternalLookups, serializeLookupsForPrompt } from "../skills/lookupEngine";
import { attemptLlmRepair, createLlmBudget, maybeGenerateContentAssist } from "../llm/assist";

export async function buildProject(rawPrompt: string, outputDir: string): Promise<BuildResult> {
  const llmBudget = createLlmBudget();
  let enrichedPrompt = await enrichPromptForBuild(rawPrompt);
  if (shouldAttachLookupContext(rawPrompt)) {
    const lookup = await runExternalLookups(rawPrompt);
    const lookupBlock = serializeLookupsForPrompt(lookup);
    if (lookupBlock.trim().length > 0) {
      enrichedPrompt = `${enrichedPrompt.trim()}\n\n${lookupBlock}`;
    }
  }
  const analysisContext =
    enrichedPrompt.trim() === rawPrompt.trim() ? undefined : enrichedPrompt.slice(rawPrompt.length).trim();
  const spec = compilePrompt(rawPrompt, analysisContext);
  const contentAssist = await maybeGenerateContentAssist(spec, llmBudget);
  if (contentAssist) {
    spec.llmAssist = contentAssist;
    if (contentAssist.keywords.length) {
      spec.assumptions = [...spec.assumptions, `LLM keywords: ${contentAssist.keywords.join(", ")}`].slice(0, 18);
    }
  }
  const template = selectTemplate(spec);
  const files = template.generate(spec);
  const projectRoot = path.join(outputDir, slugify(spec.appName));

  writeFiles(projectRoot, files);

  let verification = verifyGeneratedProject(projectRoot, spec);
  let repairApplied = false;

  if (verification.some((check) => !check.ok)) {
    repairApplied = attemptRepair(projectRoot, spec, template.id);
    if (repairApplied) {
      verification = verifyGeneratedProject(projectRoot, spec);
    }
  }

  if (verification.some((check) => !check.ok)) {
    const llmRepairApplied = await attemptLlmRepair(projectRoot, spec, verification, llmBudget);
    if (llmRepairApplied) {
      repairApplied = true;
      verification = verifyGeneratedProject(projectRoot, spec);
    }
  }

  const shouldRunBuildCheck = process.env.SKIP_INSTALL_BUILD_VERIFY !== "true";
  const requiresFrontendBuild = !["content", "audit"].includes(spec.appType);
  if (shouldRunBuildCheck && requiresFrontendBuild) {
    const buildVerification = attemptBuildRepair(projectRoot, spec);
    verification = [...verification, ...buildVerification];
  }

  const zipPath = zipProject(projectRoot, `${projectRoot}.zip`);
  if (zipPath) {
    const requiredZipFiles = requiresFrontendBuild
      ? [...files.map((file) => file.path), "package-lock.json"]
      : files.map((file) => file.path);
    verification = [
      ...verification,
      verifyZipContainsFiles(zipPath, path.basename(projectRoot), requiredZipFiles)
    ];
  } else {
    verification = [
      ...verification,
      {
        step: "zip:contains-generated-files",
        ok: false,
        detail: "Zip file was not created."
      }
    ];
  }

  return {
    spec,
    templateId: template.id,
    files,
    outputDir: projectRoot,
    zipPath,
    verification,
    repairApplied
  };
}

function shouldAttachLookupContext(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    lower.includes("market analysis") ||
    lower.includes("market size") ||
    lower.includes("current price") ||
    lower.includes("best crypto") ||
    lower.includes("invest in now") ||
    lower.includes("top 5")
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
