import fs from "node:fs";
import path from "node:path";
import { GeneratedFile, PromptSpec, TemplateDefinition } from "../types/spec";
import { templates } from "../templates/library";

export function attemptRepair(projectDir: string, spec: PromptSpec, preferredTemplateId: string): boolean {
  const template = templates.find((entry) => entry.id === preferredTemplateId) ?? templates.find((entry) => entry.appType === spec.appType);
  if (!template) return false;

  const requiredFiles = template.generate(spec);
  let repaired = false;

  for (const file of requiredFiles) {
    const fullPath = path.join(projectDir, file.path);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.content, "utf8");
      repaired = true;
    }
  }

  repaired = repairReadme(projectDir, spec) || repaired;
  repaired = repairPackageScripts(projectDir) || repaired;

  return repaired;
}

function repairReadme(projectDir: string, spec: PromptSpec): boolean {
  const readmePath = path.join(projectDir, "README.md");
  if (fs.existsSync(readmePath)) return false;

  fs.writeFileSync(
    readmePath,
    `# ${spec.appName}

## Run

\`\`\`bash
npm install
npm run dev
npm run build
\`\`\`
`,
    "utf8"
  );
  return true;
}

function repairPackageScripts(projectDir: string): boolean {
  const packageJsonPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) return false;

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };

  const nextScripts = {
    dev: packageJson.scripts?.dev ?? "vite",
    build: packageJson.scripts?.build ?? "tsc && vite build",
    preview: packageJson.scripts?.preview ?? "vite preview"
  };

  const changed =
    packageJson.scripts?.dev !== nextScripts.dev ||
    packageJson.scripts?.build !== nextScripts.build ||
    packageJson.scripts?.preview !== nextScripts.preview;

  if (!changed) return false;

  packageJson.scripts = nextScripts;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  return true;
}

export function filesFromTemplate(spec: PromptSpec, templateId: string): GeneratedFile[] {
  const template = templates.find((entry) => entry.id === templateId);
  return template ? template.generate(spec) : [];
}
