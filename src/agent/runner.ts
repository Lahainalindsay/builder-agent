import { SeedstrRunner } from "../runner/seedstrRunner";

export interface AgentRunnerOptions {
  outputRootDir?: string;
}

export class AgentRunner {
  private readonly runner: SeedstrRunner;

  constructor(options: AgentRunnerOptions = {}) {
    this.runner = new SeedstrRunner({
      outputRootDir: options.outputRootDir ?? ".runs"
    });
  }

  async start(): Promise<void> {
    await this.runner.start();
  }

  async stop(): Promise<void> {
    await this.runner.stop();
  }

  async smokeTest(): Promise<void> {
    await this.runner.smokeTest();
  }
}

