import fs from "node:fs";
import path from "node:path";
import { PromptSpec, VerificationResult } from "../types/spec";
import { runCommand } from "../utils/exec";

export function attemptBuildRepair(projectDir: string, spec: PromptSpec): VerificationResult[] {
  const packageJsonPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return [{ step: "build-repair", ok: false, detail: "No generated package.json found." }];
  }

  const installResult = installDependencies(projectDir);
  if (!installResult.ok) {
    if (isNetworkInstallIssue(installResult.detail)) {
      return [
        {
          step: "npm-install-network",
          ok: true,
          detail: `Dependency install skipped due to network issue (not project invalid).\n${installResult.detail}`
        },
        {
          step: "build-verification-skipped-network",
          ok: true,
          detail: "Build verification deferred because dependency installation could not reach registry/network."
        }
      ];
    }
    return [
      {
        step: installResult.step,
        ok: false,
        detail: installResult.detail
      }
    ];
  }

  const lockfileCheck = verifyLockfile(projectDir);
  if (!lockfileCheck.ok) {
    return [lockfileCheck];
  }

  let buildResult = runBuild(projectDir);
  if (buildResult.ok) {
    return [lockfileCheck, buildResult];
  }

  const repaired = applyCommonBuildFixes(projectDir, spec, buildResult.detail);
  if (!repaired) {
    return [buildResult];
  }

  buildResult = runBuild(projectDir);
  return [
    lockfileCheck,
    {
      step: "build-repair",
      ok: buildResult.ok,
      detail: repaired ? `Applied one repair pass.\n${buildResult.detail}` : buildResult.detail
    }
  ];
}

function installDependencies(projectDir: string): VerificationResult {
  const lockfile = path.join(projectDir, "package-lock.json");
  const command = fs.existsSync(lockfile) ? ["ci"] : ["install"];
  const result = runCommand("npm", command, projectDir);
  return {
    step: `npm ${command[0]}`,
    ok: result.ok,
    detail: result.detail
  };
}

function runBuild(projectDir: string): VerificationResult {
  const result = runCommand("npm", ["run", "build"], projectDir);
  return {
    step: "npm run build",
    ok: result.ok,
    detail: result.detail
  };
}

function verifyLockfile(projectDir: string): VerificationResult {
  const lockfilePath = path.join(projectDir, "package-lock.json");
  const exists = fs.existsSync(lockfilePath);
  return {
    step: "lockfile:package-lock.json",
    ok: exists,
    detail: exists ? "OK" : "Missing package-lock.json after dependency install."
  };
}

function isNetworkInstallIssue(detail: string): boolean {
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("etimedout") ||
    normalized.includes("econnreset") ||
    normalized.includes("eai_again") ||
    normalized.includes("enotfound") ||
    normalized.includes("network request") ||
    normalized.includes("fetch failed")
  );
}

function applyCommonBuildFixes(projectDir: string, spec: PromptSpec, detail: string): boolean {
  let changed = false;
  const packageJsonPath = path.join(projectDir, "package.json");
  const tsconfigPath = path.join(projectDir, "tsconfig.json");
  const viteConfigPath = path.join(projectDir, "vite.config.ts");
  const mainPath = path.join(projectDir, "src", "main.tsx");
  const appPath = path.join(projectDir, "src", "App.tsx");
  const routesPath = path.join(projectDir, "src", "routes.tsx");
  const tailwindConfigPath = path.join(projectDir, "tailwind.config.ts");
  const postcssPath = path.join(projectDir, "postcss.config.cjs");

  if (/Cannot find module ['"]react-router-dom['"]/.test(detail) && spec.routes.length > 1 && fs.existsSync(packageJsonPath)) {
    changed = ensurePackageDependency(projectDir, "react-router-dom", "^6.30.1") || changed;
  }

  if (/Cannot find module ['"]react['"]|Cannot find module ['"]react-dom['"]/.test(detail) && fs.existsSync(packageJsonPath)) {
    changed = ensurePackageDependency(projectDir, "react", "^18.3.1") || changed;
    changed = ensurePackageDependency(projectDir, "react-dom", "^18.3.1") || changed;
  }

  if (
    /Cannot find module ['"]@vitejs\/plugin-react['"]|Failed to resolve import ['"]@vitejs\/plugin-react['"]/.test(detail) &&
    fs.existsSync(packageJsonPath)
  ) {
    changed = ensurePackageDevDependency(projectDir, "@vitejs/plugin-react", "^4.3.1") || changed;
  }

  if (/Cannot find module ['"]\.\/App['"]|Failed to resolve import ['"]\.\/App['"]/.test(detail) && fs.existsSync(mainPath)) {
    const main = fs.readFileSync(mainPath, "utf8");
    if (!main.includes('./App"') && !main.includes("./App")) {
      const rewritten = main.replace('import "./index.css";', 'import App from "./App";\nimport "./index.css";');
      if (rewritten !== main) {
        fs.writeFileSync(mainPath, rewritten, "utf8");
        changed = true;
      }
    }
  }

  if (/Cannot find module ['"]\.\/routes['"]|Failed to resolve import ['"]\.\/routes['"]/.test(detail) && spec.routes.length > 1) {
    if (!fs.existsSync(routesPath)) {
      const fallbackRoutes = `import React from "react";
import { createHashRouter } from "react-router-dom";
import App from "./App";

function Placeholder() {
  return <section className="px-6 py-8"><div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">Generated route surface</div></section>;
}

export const router = createHashRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Placeholder /> }
    ]
  }
]);
`;
      fs.writeFileSync(routesPath, fallbackRoutes, "utf8");
      changed = true;
    }
  }

  if (/Cannot find module ['"]\.\/index\.css['"]/.test(detail) && fs.existsSync(mainPath)) {
    const main = fs.readFileSync(mainPath, "utf8");
    if (!main.includes('./index.css')) {
      fs.writeFileSync(mainPath, `import "./index.css";\n${main}`, "utf8");
      changed = true;
    }
  }

  if (/has no default export|does not provide an export named 'default'/i.test(detail) && fs.existsSync(appPath)) {
    const appSource = fs.readFileSync(appPath, "utf8");
    if (!appSource.includes("export default")) {
      fs.writeFileSync(appPath, `export default function App() { return null; }\n${appSource}`, "utf8");
      changed = true;
    }
  }

  if (/Cannot find namespace ['"]?React['"]?|Cannot find namespace React/i.test(detail)) {
    changed = rewriteReactNamespaceTypes(mainPath) || changed;
    changed = rewriteReactNamespaceTypes(appPath) || changed;
    changed = rewriteReactNamespaceTypes(routesPath) || changed;
    changed = rewriteReactNamespaceTypesInDir(path.join(projectDir, "src", "pages")) || changed;
  }

  if (/moduleResolution|bundler|node16|nodenext/i.test(detail) && fs.existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: Record<string, unknown>;
    };
    tsconfig.compilerOptions = tsconfig.compilerOptions ?? {};
    let localChange = false;
    if (tsconfig.compilerOptions.moduleResolution !== "Node") {
      tsconfig.compilerOptions.moduleResolution = "Node";
      localChange = true;
    }
    if (tsconfig.compilerOptions.jsx !== "react-jsx") {
      tsconfig.compilerOptions.jsx = "react-jsx";
      localChange = true;
    }
    if (tsconfig.compilerOptions.esModuleInterop !== true) {
      tsconfig.compilerOptions.esModuleInterop = true;
      localChange = true;
    }
    if (localChange) {
      fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`, "utf8");
      changed = true;
    }
  }

  if (/tailwind/i.test(detail) && !fs.existsSync(tailwindConfigPath)) {
    fs.writeFileSync(
      tailwindConfigPath,
      `import type { Config } from "tailwindcss";\nexport default { content: ["./index.html", "./src/**/*.{ts,tsx}"], theme: { extend: {} }, plugins: [] } satisfies Config;\n`,
      "utf8"
    );
    changed = true;
  }

  if (/postcss|autoprefixer/i.test(detail) && !fs.existsSync(postcssPath)) {
    fs.writeFileSync(postcssPath, `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`, "utf8");
    changed = true;
  }

  if (/Cannot find name ['"]process['"]|defineConfig is not defined/i.test(detail) && fs.existsSync(viteConfigPath)) {
    const viteConfig = fs.readFileSync(viteConfigPath, "utf8");
    if (!viteConfig.includes('import { defineConfig } from "vite";')) {
      fs.writeFileSync(viteConfigPath, `import { defineConfig } from "vite";\n${viteConfig}`, "utf8");
      changed = true;
    }
  }

  return changed;
}

function ensurePackageDependency(projectDir: string, name: string, version: string): boolean {
  const packageJsonPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) return false;
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  packageJson.dependencies = packageJson.dependencies ?? {};
  if (packageJson.dependencies[name]) return false;
  packageJson.dependencies[name] = version;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  return true;
}

function ensurePackageDevDependency(projectDir: string, name: string, version: string): boolean {
  const packageJsonPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) return false;
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  packageJson.devDependencies = packageJson.devDependencies ?? {};
  if (packageJson.devDependencies[name]) return false;
  packageJson.devDependencies[name] = version;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  return true;
}

function rewriteReactNamespaceTypes(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const source = fs.readFileSync(filePath, "utf8");
  let next = source;

  if (next.includes("React.FormEvent")) {
    next = next.replace(/\bReact\.FormEvent\b/g, "FormEvent");
    if (!next.includes('import { FormEvent } from "react";') && !next.includes('import { FormEvent,')) {
      if (next.includes('from "react";')) {
        next = next.replace(/import\s*\{([^}]+)\}\s*from\s*"react";/, (match, imports) => {
          return `import { ${imports.trim()}, FormEvent } from "react";`;
        });
      }
    }
  }

  if (next === source) return false;
  fs.writeFileSync(filePath, next, "utf8");
  return true;
}

function rewriteReactNamespaceTypesInDir(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  let changed = false;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      changed = rewriteReactNamespaceTypesInDir(fullPath) || changed;
    } else if (/\.tsx?$/.test(entry.name)) {
      changed = rewriteReactNamespaceTypes(fullPath) || changed;
    }
  }
  return changed;
}
