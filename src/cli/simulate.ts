import { getSeedstrConfig } from "../config/seedstrConfig";
import { SeedstrHttpClient } from "../integrations/seedstrHttpClient";

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function runSimulateCommand(): Promise<void> {
  const config = getSeedstrConfig();
  const prompt = parseArg("--prompt") ?? "Create a responsive landing page for a local business.";
  const budget = parseNumber(parseArg("--budget"), 3);
  const jobType = ((parseArg("--job-type") ?? "STANDARD").toUpperCase() as "STANDARD" | "SWARM");
  const paymentChain = ((parseArg("--payment-chain") ?? config.walletType).toUpperCase() as "ETH" | "SOL");
  const maxAgentsRaw = parseArg("--max-agents");
  const maxAgents =
    jobType === "SWARM" && maxAgentsRaw ? Math.max(1, Number.parseInt(maxAgentsRaw, 10) || 3) : undefined;
  const requiredSkillsRaw = parseArg("--required-skills");
  const requiredSkills = requiredSkillsRaw
    ? requiredSkillsRaw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;

  const client = new SeedstrHttpClient();
  const result = await client.createJobV2({
    prompt,
    budget,
    paymentChain,
    jobType,
    ...(maxAgents != null ? { maxAgents } : {}),
    ...(requiredSkills?.length ? { requiredSkills } : {})
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        success: result.success,
        note:
          config.allowUnpaidTestJobs || config.mockJobCreationForTesting
            ? "Created in test mode (payment fields auto-handled)."
            : "Created using configured wallet/payment signature.",
        job: result.job
      },
      null,
      2
    )}\n`
  );
}
