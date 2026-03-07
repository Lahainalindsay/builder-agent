import fs from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface SeedstrConfig {
  seedstrApiKey: string;
  seedstrApiUrlV1: string;
  seedstrApiUrlV2: string;
  walletAddress: string;
  solanaWalletAddress: string;
  walletType: "ETH" | "SOL";
  ownerUrl: string;
  minBudget: number;
  pollIntervalSec: number;
  pollLimit: number;
  maxConcurrentJobs: number;
  maxAttemptsPerJob: number;
  retryBackoffMs: number;
  maxZipSizeMb: number;
  useWebSocket: boolean;
  pusherKey: string;
  pusherCluster: string;
  allowUnpaidTestJobs: boolean;
  mockJobCreationForTesting: boolean;
  logLevel: LogLevel;
}

function parseDotEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

export function loadEnvFromRoot(rootDir = process.cwd()): void {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) return;

  const parsed = parseDotEnv(fs.readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

export function getSeedstrConfig(): SeedstrConfig {
  const walletAddress = (process.env.WALLET_ADDRESS ?? process.env.SOLANA_WALLET_ADDRESS ?? "").trim();
  return {
    seedstrApiKey: (process.env.SEEDSTR_API_KEY ?? "").trim(),
    seedstrApiUrlV1: (process.env.SEEDSTR_API_URL_V1 ?? "https://www.seedstr.io/api/v1").trim(),
    seedstrApiUrlV2: (process.env.SEEDSTR_API_URL_V2 ?? "https://www.seedstr.io/api/v2").trim(),
    walletAddress,
    solanaWalletAddress: walletAddress,
    walletType: ((process.env.WALLET_TYPE ?? "SOL").trim().toUpperCase() as "ETH" | "SOL"),
    ownerUrl: (process.env.OWNER_URL ?? "").trim(),
    minBudget: Number.parseFloat(process.env.MIN_BUDGET ?? "0.5"),
    pollIntervalSec: Number.parseInt(process.env.POLL_INTERVAL ?? "30", 10),
    pollLimit: Number.parseInt(process.env.POLL_LIMIT ?? "20", 10),
    maxConcurrentJobs: Number.parseInt(process.env.MAX_CONCURRENT_JOBS ?? "2", 10),
    maxAttemptsPerJob: Number.parseInt(process.env.MAX_ATTEMPTS_PER_JOB ?? "3", 10),
    retryBackoffMs: Number.parseInt(process.env.RETRY_BACKOFF_MS ?? "2000", 10),
    maxZipSizeMb: Number.parseInt(process.env.MAX_ZIP_SIZE_MB ?? "20", 10),
    useWebSocket: (process.env.USE_WEBSOCKET ?? "true") !== "false",
    pusherKey: (process.env.PUSHER_KEY ?? "").trim(),
    pusherCluster: (process.env.PUSHER_CLUSTER ?? "us2").trim(),
    allowUnpaidTestJobs: (process.env.ALLOW_UNPAID_TEST_JOBS ?? "false") === "true",
    mockJobCreationForTesting: (process.env.MOCK_JOB_CREATION_FOR_TESTING ?? "false") === "true",
    logLevel: ((process.env.LOG_LEVEL as LogLevel | undefined) ?? "info")
  };
}
