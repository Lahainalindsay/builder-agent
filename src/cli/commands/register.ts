import { runRegisterCommand } from "../../cli/register";

export async function registerCommand(): Promise<void> {
  await runRegisterCommand();
}

