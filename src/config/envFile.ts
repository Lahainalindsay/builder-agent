import fs from "node:fs";
import path from "node:path";

function stringifyValue(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

export function upsertEnvValues(values: Record<string, string>, rootDir = process.cwd()): void {
  const envPath = path.join(rootDir, ".env");
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8").split("\n") : [];
  const pending = new Map(Object.entries(values));
  const nextLines = existing.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;

    const separator = line.indexOf("=");
    if (separator < 0) return line;

    const key = line.slice(0, separator).trim();
    const replacement = pending.get(key);
    if (replacement == null) return line;

    pending.delete(key);
    return `${key}=${stringifyValue(replacement)}`;
  });

  for (const [key, value] of pending.entries()) {
    nextLines.push(`${key}=${stringifyValue(value)}`);
  }

  fs.writeFileSync(envPath, `${nextLines.join("\n").replace(/\n+$/g, "")}\n`, "utf8");
}
