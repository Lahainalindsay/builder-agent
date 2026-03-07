import { runCalculatorTool } from "./calculator";
import { runCodeInterpreterTool } from "./codeInterpreter";
import { ToolResultItem, ToolRunResult } from "./types";
import { runWebSearchTool } from "./webSearch";

function shouldDisableLookups(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return [
    "email",
    "tweet",
    "thread",
    "newsletter",
    "marketing copy",
    "landing page copy",
    "pitch deck outline",
    "partnership outreach",
    "cold email"
  ].some((token) => lower.includes(token));
}

export async function runBuiltInTools(prompt: string): Promise<ToolRunResult> {
  const items: ToolResultItem[] = [];
  const warnings: string[] = [];
  if (shouldDisableLookups(prompt)) {
    return { items, warnings };
  }

  try {
    const search = await runWebSearchTool(prompt);
    if (search) items.push(search);
  } catch (error) {
    warnings.push(`web-search failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const calc = await runCalculatorTool(prompt);
    if (calc) items.push(calc);
  } catch (error) {
    warnings.push(`calculator failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const code = await runCodeInterpreterTool(prompt);
    if (code) items.push(code);
  } catch (error) {
    warnings.push(`code-interpreter failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { items, warnings };
}

export function serializeToolResults(result: ToolRunResult): string {
  if (!result.items.length && !result.warnings.length) return "";

  const lines: string[] = ["## Built-in Tool Context"];
  for (const item of result.items) {
    lines.push(`- [${item.tool}] ${item.summary}`);
  }
  for (const warning of result.warnings) {
    lines.push(`- [warning] ${warning}`);
  }
  return lines.join("\n");
}
