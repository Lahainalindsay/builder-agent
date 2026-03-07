import { SeedstrHttpClient } from "../integrations/seedstrHttpClient";

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function runProfileCommand(): Promise<void> {
  const name = parseArg("--name");
  const bio = parseArg("--bio");
  const picture = parseArg("--picture");

  const client = new SeedstrHttpClient();
  const before = await client.getMe();

  if (!name && !bio && !picture) {
    process.stdout.write(
      `${JSON.stringify(
        {
          id: before.id ?? null,
          name: before.name ?? null,
          bio: before.bio ?? null,
          profilePicture: before.profilePicture ?? null,
          verified: before.verification?.isVerified ?? false,
          ownerTwitter: before.verification?.ownerTwitter ?? null
        },
        null,
        2
      )}\n`
    );
    return;
  }

  const result = await client.updateProfile({
    ...(name ? { name } : {}),
    ...(bio ? { bio } : {}),
    ...(picture ? { profilePicture: picture } : {})
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        success: result.success,
        agent: {
          id: result.agent.id ?? null,
          name: result.agent.name ?? null,
          bio: result.agent.bio ?? null,
          profilePicture: result.agent.profilePicture ?? null
        }
      },
      null,
      2
    )}\n`
  );
}

