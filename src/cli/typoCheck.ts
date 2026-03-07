import fs from "node:fs";
import path from "node:path";
import { normalizeText } from "../utils/normalizeText";

type TypoCase = {
  prompt: string;
  expectTokens: string[];
};

function readJsonl(filePath: string): TypoCase[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const cases: TypoCase[] = [];
  for (const line of lines) {
    const parsed = JSON.parse(line) as TypoCase;
    if (!parsed.prompt || !Array.isArray(parsed.expectTokens)) {
      throw new Error(`Invalid JSONL line: ${line.slice(0, 80)}...`);
    }
    cases.push(parsed);
  }

  return cases;
}

function main(): void {
  const fileArg = process.argv.find((arg) => arg.startsWith("--file="))?.split("=", 2)[1];
  const filePath = fileArg
    ? path.resolve(process.cwd(), fileArg)
    : path.resolve(process.cwd(), "examples/prompts/typo-torture.jsonl");

  if (!fs.existsSync(filePath)) {
    console.error(`[typo-check] Missing file: ${filePath}`);
    process.exit(2);
  }

  const cases = readJsonl(filePath);
  let failed = 0;

  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index];
    const normalized = normalizeText(testCase.prompt);
    const missing = testCase.expectTokens.filter((token) => !normalized.includes(token));

    if (missing.length) {
      failed += 1;
      console.error(`\n[FAIL ${index + 1}] prompt: ${testCase.prompt}`);
      console.error(`[FAIL ${index + 1}] normalized: ${normalized}`);
      console.error(`[FAIL ${index + 1}] missing tokens: ${missing.join(", ")}`);
      continue;
    }

    console.log(`[OK ${index + 1}] ${testCase.expectTokens.join(", ")} | ${normalized}`);
  }

  if (failed > 0) {
    console.error(`\n[typo-check] Failed: ${failed}/${cases.length}`);
    process.exit(1);
  }

  console.log(`\n[typo-check] Passed: ${cases.length}/${cases.length}`);
}

main();
