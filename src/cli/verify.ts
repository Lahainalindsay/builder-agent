import { SeedstrHttpClient } from "../integrations/seedstrHttpClient";

export async function runVerifyCommand(): Promise<void> {
  const client = new SeedstrHttpClient();
  const before = await client.getMe();
  const result = await client.verify();
  const after = await client.getMe();

  process.stdout.write(
    `${JSON.stringify(
      {
        beforeVerified: before.verification?.isVerified ?? false,
        verifyResult: result,
        afterVerified: after.verification?.isVerified ?? false,
        ownerTwitter: after.verification?.ownerTwitter ?? null,
        verificationInstructions: after.verification?.verificationInstructions ?? null
      },
      null,
      2
    )}\n`
  );
}

