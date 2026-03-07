import { ToolResultItem } from "./types";

function extractCode(prompt: string): { language: string; code: string } | null {
  const fenced = prompt.match(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/);
  if (!fenced) return null;
  return {
    language: (fenced[1] || "unknown").toLowerCase(),
    code: fenced[2]
  };
}

export async function runCodeInterpreterTool(prompt: string): Promise<ToolResultItem | null> {
  const extracted = extractCode(prompt);
  if (!extracted) return null;

  const lines = extracted.code.split("\n").map((line) => line.trim());
  const nonEmpty = lines.filter(Boolean);
  const todoCount = nonEmpty.filter((line) => /todo|fixme/i.test(line)).length;
  const consoleCount = nonEmpty.filter((line) => /console\.log|print\(/i.test(line)).length;
  const importCount = nonEmpty.filter((line) => /^import\s+|^from\s+["']/.test(line)).length;

  return {
    tool: "code-interpreter",
    summary: `Code snippet analyzed (${extracted.language}): ${nonEmpty.length} non-empty lines, ${todoCount} TODO/FIXME, ${consoleCount} debug prints.`,
    details: {
      language: extracted.language,
      nonEmptyLines: nonEmpty.length,
      todoCount,
      debugPrintCount: consoleCount,
      importCount
    },
    references: []
  };
}

