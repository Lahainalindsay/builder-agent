import { spawnSync } from "node:child_process";

export function runCommand(command: string, args: string[], cwd: string): { ok: boolean; detail: string } {
  const timeoutMs = Number.parseInt(process.env.COMMAND_TIMEOUT_MS ?? "90000", 10);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 90000
  });

  if (result.error) {
    return { ok: false, detail: result.error.message };
  }

  const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return { ok: result.status === 0, detail: detail || `Exited with status ${result.status ?? "unknown"}` };
}
