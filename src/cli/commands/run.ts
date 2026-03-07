import { AgentRunner } from "../../agent";

export async function runCommand(options?: { smoke?: boolean }): Promise<void> {
  const runner = new AgentRunner({ outputRootDir: ".runs" });

  if (options?.smoke) {
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

