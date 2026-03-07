import { profileCommand } from "./commands/profile";
import { registerCommand } from "./commands/register";
import { runCommand } from "./commands/run";
import { simulateCommand } from "./commands/simulate";
import { statusCommand } from "./commands/status";
import { verifyCommand } from "./commands/verify";
import { loadEnvFromRoot } from "../config/seedstrConfig";

export type CliCommand = "run" | "register" | "status" | "verify" | "profile" | "simulate" | "smoke";

function commandFromArgv(argv = process.argv): CliCommand {
  const cmd = argv[2]?.trim().toLowerCase();
  if (!cmd) return "run";
  if (cmd === "register") return "register";
  if (cmd === "status") return "status";
  if (cmd === "verify") return "verify";
  if (cmd === "profile") return "profile";
  if (cmd === "simulate") return "simulate";
  if (cmd === "smoke") return "smoke";
  return "run";
}

export async function runCli(argv = process.argv): Promise<void> {
  const command = commandFromArgv(argv);

  if (command === "register") return registerCommand();
  if (command === "status") return statusCommand();
  if (command === "verify") return verifyCommand();
  if (command === "profile") return profileCommand();
  if (command === "simulate") return simulateCommand();
  if (command === "smoke") return runCommand({ smoke: true });
  return runCommand();
}

async function main(): Promise<void> {
  loadEnvFromRoot();
  await runCli(process.argv);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
