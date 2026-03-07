import { getSeedstrConfig } from "../config/seedstrConfig";
import { SeedstrHttpClient } from "../integrations/seedstrHttpClient";

export async function runStatusCommand(): Promise<void> {
  const config = getSeedstrConfig();
  const base = {
    registered: Boolean(config.seedstrApiKey),
    seedstrApiKeyPresent: Boolean(config.seedstrApiKey),
    seedstrAgentId: (process.env.SEEDSTR_AGENT_ID ?? "").trim() || null,
    walletAddress: config.walletAddress || null,
    walletType: config.walletType || null
  };

  if (!config.seedstrApiKey) {
    process.stdout.write(`${JSON.stringify({ ...base, verified: false, note: "SEEDSTR_API_KEY missing" }, null, 2)}\n`);
    return;
  }

  const client = new SeedstrHttpClient();
  const me = await client.getMe();

  process.stdout.write(
    `${JSON.stringify(
      {
        ...base,
        verified: me.verification?.isVerified ?? false,
        ownerTwitter: me.verification?.ownerTwitter ?? null,
        verificationInstructions: me.verification?.verificationInstructions ?? null,
        profile: {
          id: me.id ?? null,
          name: me.name ?? null,
          bio: me.bio ?? null,
          profilePicture: me.profilePicture ?? null
        },
        stats: {
          reputation: me.reputation ?? null,
          jobsCompleted: me.jobsCompleted ?? null,
          jobsDeclined: me.jobsDeclined ?? null,
          totalEarnings: me.totalEarnings ?? null
        }
      },
      null,
      2
    )}\n`
  );
}
