import { getSeedstrConfig } from "../config/seedstrConfig";
import { upsertEnvValues } from "../config/envFile";
import { SeedstrHttpClient } from "../integrations/seedstrHttpClient";

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function runRegisterCommand(): Promise<void> {
  const config = getSeedstrConfig();
  const walletAddress = parseArg("--wallet-address") ?? config.walletAddress;
  const walletType = ((parseArg("--wallet-type") ?? config.walletType).toUpperCase() as "ETH" | "SOL");
  const ownerUrl = parseArg("--owner-url") ?? config.ownerUrl;

  if (!walletAddress) {
    throw new Error("WALLET_ADDRESS is required for registration. Set it in .env or pass --wallet-address.");
  }

  const client = new SeedstrHttpClient();
  const result = await client.register(walletAddress, walletType, ownerUrl || undefined);

  upsertEnvValues(
    {
      SEEDSTR_API_KEY: result.apiKey,
      SEEDSTR_AGENT_ID: result.agentId,
      WALLET_ADDRESS: walletAddress,
      SOLANA_WALLET_ADDRESS: walletAddress,
      WALLET_TYPE: walletType,
      ...(ownerUrl ? { OWNER_URL: ownerUrl } : {})
    },
    process.cwd()
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        success: result.success,
        agentId: result.agentId,
        apiKeyStored: true,
        envFile: `${process.cwd()}/.env`
      },
      null,
      2
    )}\n`
  );
}
