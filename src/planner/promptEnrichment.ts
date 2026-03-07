import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

interface GitHubRepoRef {
  owner: string;
  repo: string;
}

function extractGitHubRef(prompt: string): GitHubRepoRef | null {
  const match = prompt.match(/https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i);
  if (!match) return null;
  return {
    owner: match[1].replace(/[.,!?;:]+$/g, ""),
    repo: match[2].replace(/\.git$/i, "").replace(/[.,!?;:]+$/g, "")
  };
}

async function fetchJson<T>(url: string, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string, timeoutMs = 6000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github.raw+json" }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function compactReadme(readme: string): string {
  return readme.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1800);
}

function cloneOrReuseRepo(ref: GitHubRepoRef): string | null {
  const cacheRoot = path.join(process.cwd(), ".seedstr", "repo-cache");
  fs.mkdirSync(cacheRoot, { recursive: true });
  const repoDir = path.join(cacheRoot, `${ref.owner}__${ref.repo}`);

  if (!fs.existsSync(repoDir)) {
    const clone = spawnSync(
      "git",
      ["clone", "--depth", "1", `https://github.com/${ref.owner}/${ref.repo}.git`, repoDir],
      { stdio: "ignore", timeout: 20000 }
    );
    if (clone.status !== 0) {
      const localCandidate = path.join(os.homedir(), ref.repo);
      if (fs.existsSync(localCandidate) && repoMatchesRemote(localCandidate, ref)) return localCandidate;
      const fallback = fs
        .readdirSync(os.homedir(), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .find((name) => name.toLowerCase() === ref.repo.toLowerCase());
      if (fallback) {
        const fallbackPath = path.join(os.homedir(), fallback);
        if (repoMatchesRemote(fallbackPath, ref)) return fallbackPath;
      }
      return null;
    }
  } else {
    spawnSync("git", ["-C", repoDir, "pull", "--ff-only"], { stdio: "ignore", timeout: 10000 });
  }

  return repoDir;
}

function repoMatchesRemote(repoDir: string, ref: GitHubRepoRef): boolean {
  const remote = spawnSync("git", ["-C", repoDir, "remote", "get-url", "origin"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000
  });
  if (remote.status !== 0) return false;
  const url = (remote.stdout ?? "").trim().toLowerCase();
  const needle = `${ref.owner}/${ref.repo}`.toLowerCase();
  return url.includes(needle);
}

function readRepoReadme(repoDir: string): string {
  const candidates = ["README.md", "readme.md", "Readme.md"];
  const found = candidates.find((name) => fs.existsSync(path.join(repoDir, name)));
  if (!found) return "";
  return fs.readFileSync(path.join(repoDir, found), "utf8");
}

function extractReadmePrinciples(readme: string): string[] {
  const headings = readme
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{1,3}\s+/.test(line))
    .map((line) => line.replace(/^#{1,3}\s+/, "").trim())
    .slice(0, 10);

  const bullets = readme
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => /feature|principle|goal|value|workflow|design|ux|ui|product/i.test(line))
    .slice(0, 10);

  return Array.from(new Set([...headings, ...bullets])).slice(0, 12);
}

function extractTechStack(repoDir: string): string[] {
  const packageJsonPath = path.join(repoDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) return [];

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });
    const stack = deps
      .filter((dep) =>
        ["react", "next", "vite", "tailwindcss", "typescript", "astro", "svelte", "vue"].includes(dep)
      )
      .slice(0, 8);
    const scripts = Object.keys(pkg.scripts ?? {}).slice(0, 6).map((name) => `script:${name}`);
    return [...stack, ...scripts];
  } catch {
    return [];
  }
}

export async function enrichPromptForBuild(rawPrompt: string): Promise<string> {
  if (process.env.NO_EXTERNAL_LOOKUPS === "true") return rawPrompt;

  const repoRef = extractGitHubRef(rawPrompt);
  if (!repoRef) return rawPrompt;

  const repoDir = cloneOrReuseRepo(repoRef);
  const localReadme = repoDir ? readRepoReadme(repoDir) : "";
  const stack = repoDir ? extractTechStack(repoDir) : [];

  const repoUrl = `https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}`;
  const readmeUrl = `https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}/readme`;
  const [repoMetaRaw, readmeRaw] = await Promise.all([
    fetchJson<Record<string, unknown>>(repoUrl).catch(() => ({})),
    fetchText(readmeUrl).catch(() => "")
  ]);
  const repoMeta = repoMetaRaw as Record<string, unknown>;

  const principles = extractReadmePrinciples(localReadme || readmeRaw);
  const hasContext = Boolean(repoDir || readmeRaw || Object.keys(repoMeta).length);
  if (!hasContext) return rawPrompt;

  const summary = [
    "## EXTERNAL_REPO_CONTEXT",
    `Repository: ${String(repoMeta.full_name ?? `${repoRef.owner}/${repoRef.repo}`)}`,
    `Description: ${String(repoMeta.description ?? "N/A")}`,
    `Primary language: ${String(repoMeta.language ?? "N/A")}`,
    `Topics: ${Array.isArray(repoMeta.topics) ? repoMeta.topics.join(", ") : "N/A"}`,
    `Default branch: ${String(repoMeta.default_branch ?? "main")}`,
    repoDir ? `Cloned repo path: ${repoDir}` : "Cloned repo path: unavailable",
    principles.length ? `Repo principles/headings:\n- ${principles.join("\n- ")}` : "Repo principles/headings: unavailable",
    stack.length ? `Detected stack/scripts: ${stack.join(", ")}` : "Detected stack/scripts: unavailable",
    (localReadme || readmeRaw) ? `README excerpt:\n${compactReadme(localReadme || readmeRaw)}` : "README excerpt: unavailable",
    "Use this context to tailor landing sections, terminology, visual direction, and CTA language to the repository."
  ].join("\n");

  return `${rawPrompt.trim()}\n\n${summary}\n`;
}
