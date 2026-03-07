import fs from "node:fs";
import path from "node:path";
import { Job } from "../integrations/seedstrHttpClient";

export type SkillAction = "ACCEPT" | "DECLINE" | "CLARIFY";

export interface SkillRule {
  condition: string;
  action: SkillAction;
  reason?: string;
}

export interface SkillConfig {
  name: string;
  description: string;
  tags: string[];
  rules: SkillRule[];
}

export interface SkillDecision {
  matched: boolean;
  action: SkillAction;
  reason: string;
  condition?: string;
}

const DEFAULT_SKILL: SkillConfig = {
  name: "default-skill",
  description: "Default behavior when no SKILL.md is present",
  tags: [],
  rules: []
};

function parseFrontmatter(raw: string): { body: string; name: string; description: string; tags: string[] } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { body: raw, name: "agent-skill", description: "", tags: [] };
  }

  const frontmatter = match[1];
  const body = raw.slice(match[0].length);
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "agent-skill";
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";

  const tagsInline = frontmatter.match(/tags:\s*([^\n]+)/m)?.[1]?.trim() ?? "";
  const tags =
    tagsInline.length > 0
      ? tagsInline
          .split(/[,\s]+/)
          .map((value) => value.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean)
      : [];

  return { body, name, description, tags };
}

function parseRuleTable(body: string): SkillRule[] {
  const lines = body.split("\n");
  const rules: SkillRule[] = [];

  for (const line of lines) {
    if (!line.includes("|")) continue;
    const columns = line
      .split("|")
      .map((col) => col.trim())
      .filter(Boolean);

    if (columns.length < 3) continue;
    if (/condition/i.test(columns[0]) && /action/i.test(columns[1])) continue;
    if (/^-+$/.test(columns[0])) continue;

    const actionRaw = columns[1].toUpperCase();
    if (actionRaw !== "ACCEPT" && actionRaw !== "DECLINE" && actionRaw !== "CLARIFY") continue;

    rules.push({
      condition: columns[0],
      action: actionRaw as SkillAction,
      reason: columns[2]
    });
  }

  return rules;
}

function loadRuleMarkdownFiles(rootDir: string): string[] {
  const rulesDir = path.join(rootDir, "skills", "rules");
  if (!fs.existsSync(rulesDir)) return [];

  const entries = fs.readdirSync(rulesDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => path.join(rulesDir, entry.name));

  return files.map((filePath) => fs.readFileSync(filePath, "utf8"));
}

export function loadSkillConfig(rootDir = process.cwd()): SkillConfig {
  const skillPath = path.join(rootDir, "skills", "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    return DEFAULT_SKILL;
  }

  const raw = fs.readFileSync(skillPath, "utf8");
  const parsed = parseFrontmatter(raw);
  const ruleFiles = loadRuleMarkdownFiles(rootDir);
  const allRuleBodies = [parsed.body, ...ruleFiles].join("\n\n");
  return {
    name: parsed.name,
    description: parsed.description,
    tags: parsed.tags,
    rules: parseRuleTable(allRuleBodies)
  };
}

function extractBudgetThreshold(condition: string): { op: "<" | "<=" | ">" | ">="; value: number } | null {
  const match = condition.match(/budget\s*(<=|>=|<|>)\s*\$?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return null;
  return {
    op: match[1] as "<" | "<=" | ">" | ">=",
    value: Number.parseFloat(match[2])
  };
}

function matchesBudgetCondition(condition: string, budget: number): boolean | null {
  const parsed = extractBudgetThreshold(condition);
  if (!parsed) return null;

  if (parsed.op === "<") return budget < parsed.value;
  if (parsed.op === "<=") return budget <= parsed.value;
  if (parsed.op === ">") return budget > parsed.value;
  if (parsed.op === ">=") return budget >= parsed.value;
  return null;
}

function matchesPromptContains(condition: string, prompt: string): boolean | null {
  const quoted = condition.match(/prompt\s+contains\s+["']([^"']+)["']/i)?.[1];
  if (quoted) {
    return prompt.toLowerCase().includes(quoted.toLowerCase());
  }

  const bare = condition.match(/prompt\s+contains\s+([a-z0-9_-]+)/i)?.[1];
  if (bare) {
    return prompt.toLowerCase().includes(bare.toLowerCase());
  }

  return null;
}

function matchesPromptLength(condition: string, prompt: string): boolean | null {
  const match = condition.match(/prompt\.length\s*(<=|>=|<|>)\s*([0-9]+)/i);
  if (!match) return null;
  const op = match[1];
  const value = Number.parseInt(match[2], 10);

  if (op === "<") return prompt.length < value;
  if (op === "<=") return prompt.length <= value;
  if (op === ">") return prompt.length > value;
  if (op === ">=") return prompt.length >= value;
  return null;
}

function matchesCategoryCondition(condition: string, prompt: string): boolean | null {
  const match = condition.match(/category\s*==\s*["']([^"']+)["']/i);
  if (!match) return null;
  const expected = match[1].toLowerCase();
  const lower = prompt.toLowerCase();

  if (expected.includes("code-review")) {
    return lower.includes("code review") || lower.includes("review this code");
  }
  if (expected.includes("creative-writing")) {
    return lower.includes("story") || lower.includes("poem") || lower.includes("creative writing");
  }

  return lower.includes(expected);
}

function evaluateCondition(condition: string, job: Job): boolean {
  const checks = [
    matchesBudgetCondition(condition, job.budget),
    matchesPromptContains(condition, job.prompt),
    matchesPromptLength(condition, job.prompt),
    matchesCategoryCondition(condition, job.prompt)
  ];

  for (const result of checks) {
    if (result != null) return result;
  }

  return false;
}

export function decideWithSkill(skill: SkillConfig, job: Job): SkillDecision | null {
  for (const rule of skill.rules) {
    if (!evaluateCondition(rule.condition, job)) continue;
    const reason = rule.reason?.trim() || `Matched rule: ${rule.condition}`;
    return {
      matched: true,
      action: rule.action,
      reason,
      condition: rule.condition
    };
  }

  if (skill.tags.length && job.requiredSkills?.length) {
    const tagSet = new Set(skill.tags.map((tag) => tag.toLowerCase()));
    const overlap = job.requiredSkills.some((skillName) => tagSet.has(skillName.toLowerCase()));
    if (!overlap) {
      return {
        matched: true,
        action: "DECLINE",
        reason: "Required skills do not match this agent skill profile.",
        condition: "requiredSkills overlap"
      };
    }
  }

  return null;
}
