import fs from "node:fs";
import path from "node:path";
import { zipProject } from "../builder/zipProject";
import type { SeedstrProjectBuilderLike } from "../integrations/platform";

export class ProjectBuilderAdapter implements SeedstrProjectBuilderLike {
  constructor(private readonly projectRoot: string) {
    fs.mkdirSync(projectRoot, { recursive: true });
  }

  async createFile(params: { path: string; content: string }): Promise<void> {
    const fullPath = path.join(this.projectRoot, params.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, params.content, "utf8");
  }

  async finalizeProject(): Promise<{ zipPath?: string; fileCount?: number }> {
    const zipPath = zipProject(this.projectRoot, `${this.projectRoot}.zip`);
    return { zipPath: zipPath ?? undefined };
  }
}
