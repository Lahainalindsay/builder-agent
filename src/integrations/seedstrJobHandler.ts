import { buildProject } from "../builder/projectAssembler";
import { BuildResult } from "../types/spec";
import { materializeToSeedstrBuilder, SeedstrProjectBuilderLike } from "./platform";

export interface SeedstrJobLike {
  id: string;
  prompt: string;
}

export interface HandleSeedstrJobOptions {
  job: SeedstrJobLike;
  projectBuilder?: SeedstrProjectBuilderLike;
  outputDir: string;
}

export async function handleSeedstrJob(options: HandleSeedstrJobOptions): Promise<BuildResult> {
  const result = await buildProject(options.job.prompt, options.outputDir);
  if (options.projectBuilder) {
    await materializeToSeedstrBuilder(options.projectBuilder, result.files);
  }
  return result;
}
