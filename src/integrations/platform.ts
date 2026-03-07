import { BuildResult, GeneratedFile } from "../types/spec";

export interface SubmissionClient {
  submit(result: BuildResult): Promise<void>;
}

export interface SeedstrProjectBuilderLike {
  createFile(params: { path: string; content: string }): Promise<void>;
  finalizeProject(): Promise<{ zipPath?: string; fileCount?: number }>;
}

export async function materializeToSeedstrBuilder(
  builder: SeedstrProjectBuilderLike,
  files: GeneratedFile[]
): Promise<{ zipPath?: string; fileCount?: number }> {
  for (const file of files) {
    await builder.createFile({ path: file.path, content: file.content });
  }

  return builder.finalizeProject();
}

export class DryRunSubmissionClient implements SubmissionClient {
  async submit(result: BuildResult): Promise<void> {
    const summary = {
      templateId: result.templateId,
      outputDir: result.outputDir,
      zipPath: result.zipPath,
      verification: result.verification,
      repairApplied: result.repairApplied
    };

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  }
}

export class SeedstrStarterAdapter implements SubmissionClient {
  constructor(private readonly builder?: SeedstrProjectBuilderLike) {}

  async submit(result: BuildResult): Promise<void> {
    if (!this.builder) {
      throw new Error(
        "No Seedstr project builder provided. Pass the official starter's ProjectBuilder-like object to SeedstrStarterAdapter."
      );
    }

    await materializeToSeedstrBuilder(this.builder, result.files);
  }
}
