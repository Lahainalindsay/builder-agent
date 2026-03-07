import fs from "node:fs";
import path from "node:path";
import { GeneratedFile } from "../types/spec";

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeFiles(rootDir: string, files: GeneratedFile[]): void {
  for (const file of files) {
    const fullPath = path.join(rootDir, file.path);
    ensureDir(path.dirname(fullPath));
    fs.writeFileSync(fullPath, file.content, "utf8");
  }
}
