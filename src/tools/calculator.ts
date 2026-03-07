import { ToolResultItem } from "./types";

function extractExpression(prompt: string): string | null {
  const explicit = prompt.match(/(?:calculate|compute|solve)\s*[:\-]?\s*([0-9+\-*/().\s^%]{3,120})/i)?.[1];
  if (explicit) return explicit.trim();
  const inline = prompt.match(/\b([0-9][0-9+\-*/().\s^%]{2,120})\b/)?.[1];
  return inline?.trim() ?? null;
}

function safeEval(expression: string): number {
  const normalized = expression.replace(/\^/g, "**");
  if (!/^[0-9+\-*/().%\s*]+$/.test(normalized)) {
    throw new Error("Expression contains unsupported characters.");
  }
  // eslint-disable-next-line no-new-func
  const value = Function(`"use strict"; return (${normalized});`)();
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Expression did not evaluate to a finite number.");
  }
  return value;
}

export async function runCalculatorTool(prompt: string): Promise<ToolResultItem | null> {
  const expression = extractExpression(prompt);
  if (!expression) return null;
  const value = safeEval(expression);
  return {
    tool: "calculator",
    summary: `Computed expression "${expression}" = ${value}`,
    details: {
      expression,
      result: value
    },
    references: []
  };
}

