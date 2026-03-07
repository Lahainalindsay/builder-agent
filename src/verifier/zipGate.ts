import { spawnSync } from "node:child_process";
import { VerificationResult } from "../types/spec";

function parseZipList(stdout: string): string[] {
  const names: string[] = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trimEnd();
    const match = line.match(/^\s*\d+\s+\S+\s+\S+\s+(.+)$/);
    if (!match) continue;
    const fileName = match[1].trim();
    if (!fileName || fileName === "Name") continue;
    names.push(fileName);
  }
  return names;
}

export function verifyZipContainsFiles(
  zipPath: string,
  rootPrefix: string,
  requiredRelativeFiles: string[]
): VerificationResult {
  const list = spawnSync("unzip", ["-l", zipPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10000
  });

  if (list.status !== 0) {
    return {
      step: "zip:contains-generated-files",
      ok: false,
      detail: `Unable to inspect zip with unzip -l: ${(list.stderr || "").trim() || "unknown error"}`
    };
  }

  const entries = parseZipList(list.stdout || "");
  const required = requiredRelativeFiles.map((file) => `${rootPrefix}/${file}`.replace(/\\/g, "/"));
  const missing = required.filter((file) => !entries.includes(file));

  return {
    step: "zip:contains-generated-files",
    ok: missing.length === 0,
    detail: missing.length
      ? `Missing in zip: ${missing.slice(0, 10).join(", ")}`
      : `Zip contains all generated files (${required.length}).`
  };
}
