import fs from "node:fs";
import path from "node:path";
import { buildProject } from "./builder/projectAssembler";
import { runProfileCommand } from "./cli/profile";
import { runRegisterCommand } from "./cli/register";
import { runSimulateCommand } from "./cli/simulate";
import { runStatusCommand } from "./cli/status";
import { runVerifyCommand } from "./cli/verify";
import { getSeedstrConfig, loadEnvFromRoot } from "./config/seedstrConfig";
import { DryRunSubmissionClient, SeedstrStarterAdapter, SubmissionClient } from "./integrations/platform";
import { SeedstrRunner } from "./runner/seedstrRunner";

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readPrompt(): string {
  const promptFile = parseArg("--prompt-file");
  const promptText = parseArg("--prompt");

  if (promptText) return promptText;
  if (promptFile) return fs.readFileSync(path.resolve(promptFile), "utf8").trim();

  throw new Error("Provide --prompt or --prompt-file.");
}

function outputDir(): string {
  const fromArg = parseArg("--output-dir");
  return path.resolve(fromArg ?? path.join(process.cwd(), ".runs", String(Date.now())));
}

function isDryRunMode(): boolean {
  return Boolean(parseArg("--prompt") || parseArg("--prompt-file"));
}

function isSmokeMode(): boolean {
  return process.argv.includes("--smoke");
}

function isRegisterMode(): boolean {
  return process.argv.includes("--register");
}

function isStatusMode(): boolean {
  return process.argv.includes("--status");
}

function isVerifyMode(): boolean {
  return process.argv.includes("--verify");
}

function isProfileMode(): boolean {
  return process.argv.includes("--profile");
}

function isSimulateMode(): boolean {
  return process.argv.includes("--simulate");
}

function submissionClient(): SubmissionClient {
  return process.env.SEEDSTR_MODE === "api" ? new SeedstrStarterAdapter() : new DryRunSubmissionClient();
}

async function runDryMode(): Promise<void> {
  const prompt = readPrompt();
  const result = await buildProject(prompt, outputDir());
  await submissionClient().submit(result);
}

async function runListenerMode(): Promise<void> {
  const config = getSeedstrConfig();
  if (!config.seedstrApiKey) {
    throw new Error("SEEDSTR_API_KEY is required for listener mode. Use --prompt for a local dry run.");
  }

  const runner = new SeedstrRunner({ outputRootDir: ".runs" });
  if (isSmokeMode()) {
    await runner.smokeTest();
    return;
  }
  await runner.start();

  const stop = async () => {
    await runner.stop();
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

async function main(): Promise<void> {
  loadEnvFromRoot();

  if (isRegisterMode()) {
    await runRegisterCommand();
    return;
  }

  if (isStatusMode()) {
    await runStatusCommand();
    return;
  }

  if (isVerifyMode()) {
    await runVerifyCommand();
    return;
  }

  if (isProfileMode()) {
    await runProfileCommand();
    return;
  }

  if (isSimulateMode()) {
    await runSimulateCommand();
    return;
  }

  if (isDryRunMode()) {
    await runDryMode();
    return;
  }

  await runListenerMode();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
