import { runProfileCommand } from "../../cli/profile";

export async function profileCommand(): Promise<void> {
  await runProfileCommand();
}

