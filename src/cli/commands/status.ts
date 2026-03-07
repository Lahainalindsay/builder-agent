import { runStatusCommand } from "../../cli/status";

export async function statusCommand(): Promise<void> {
  await runStatusCommand();
}

