import fs from "node:fs";
import path from "node:path";

type Outcome = "processed" | "failed" | "skipped";

interface Counter {
  attempts: number;
  processed: number;
  failed: number;
  skipped: number;
}

interface TemplateCounter extends Counter {
  avgDurationMs?: number;
}

interface BudgetBucket extends Counter {
  min: number;
  max: number | null;
}

interface LearningState {
  version: number;
  updatedAt: string;
  totals: Counter;
  templates: Record<string, TemplateCounter>;
  tokens: Record<string, Counter>;
  budgetBuckets: BudgetBucket[];
}

interface RecordInput {
  prompt: string;
  budget: number;
  outcome: Outcome;
  templateId?: string;
  durationMs?: number;
}

export interface LearnedBudgetPolicy {
  floor: number;
  reason: string;
}

const VERSION = 1;
const MAX_TOKEN_ENTRIES = 2000;
const BUCKET_RANGES: Array<{ min: number; max: number | null }> = [
  { min: 0, max: 1 },
  { min: 1, max: 2 },
  { min: 2, max: 5 },
  { min: 5, max: 10 },
  { min: 10, max: null }
];

function emptyCounter(): Counter {
  return {
    attempts: 0,
    processed: 0,
    failed: 0,
    skipped: 0
  };
}

function makeBudgetBuckets(): BudgetBucket[] {
  return BUCKET_RANGES.map((range) => ({
    ...range,
    ...emptyCounter()
  }));
}

function tokenizePrompt(prompt: string): string[] {
  const words = prompt.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  const filtered = words.filter((word) => word.length >= 4 && !/^\d+$/.test(word));
  return Array.from(new Set(filtered)).slice(0, 20);
}

function applyOutcome(counter: Counter, outcome: Outcome): void {
  counter.attempts += 1;
  if (outcome === "processed") counter.processed += 1;
  if (outcome === "failed") counter.failed += 1;
  if (outcome === "skipped") counter.skipped += 1;
}

function successRate(counter: Counter): number {
  return counter.attempts > 0 ? counter.processed / counter.attempts : 0;
}

function bucketLabel(bucket: BudgetBucket): string {
  if (bucket.max == null) return `$${bucket.min}+`;
  return `$${bucket.min}-$${bucket.max}`;
}

export class LearningStore {
  private readonly filePath: string;
  private state: LearningState;

  constructor(rootDir = process.cwd()) {
    const dir = path.join(rootDir, ".seedstr");
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "learning.json");
    this.state = this.load();
  }

  private load(): LearningState {
    try {
      if (!fs.existsSync(this.filePath)) {
        return {
          version: VERSION,
          updatedAt: new Date().toISOString(),
          totals: emptyCounter(),
          templates: {},
          tokens: {},
          budgetBuckets: makeBudgetBuckets()
        };
      }

      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<LearningState>;
      if (parsed.version !== VERSION) {
        return {
          version: VERSION,
          updatedAt: new Date().toISOString(),
          totals: emptyCounter(),
          templates: {},
          tokens: {},
          budgetBuckets: makeBudgetBuckets()
        };
      }

      return {
        version: VERSION,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
        totals: parsed.totals ?? emptyCounter(),
        templates: parsed.templates ?? {},
        tokens: parsed.tokens ?? {},
        budgetBuckets:
          Array.isArray(parsed.budgetBuckets) && parsed.budgetBuckets.length === BUCKET_RANGES.length
            ? parsed.budgetBuckets
            : makeBudgetBuckets()
      };
    } catch {
      return {
        version: VERSION,
        updatedAt: new Date().toISOString(),
        totals: emptyCounter(),
        templates: {},
        tokens: {},
        budgetBuckets: makeBudgetBuckets()
      };
    }
  }

  private persist(): void {
    this.state.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
  }

  private pruneTokens(): void {
    const entries = Object.entries(this.state.tokens);
    if (entries.length <= MAX_TOKEN_ENTRIES) return;

    const trimmed = entries
      .sort((a, b) => b[1].attempts - a[1].attempts)
      .slice(0, MAX_TOKEN_ENTRIES);
    this.state.tokens = Object.fromEntries(trimmed);
  }

  private findBudgetBucket(budget: number): BudgetBucket {
    const bucket =
      this.state.budgetBuckets.find((item) => budget >= item.min && (item.max == null || budget < item.max)) ??
      this.state.budgetBuckets[this.state.budgetBuckets.length - 1];
    return bucket;
  }

  record(input: RecordInput): void {
    applyOutcome(this.state.totals, input.outcome);

    const bucket = this.findBudgetBucket(input.budget);
    applyOutcome(bucket, input.outcome);

    if (input.templateId) {
      if (!this.state.templates[input.templateId]) {
        this.state.templates[input.templateId] = { ...emptyCounter() };
      }
      const templateCounter = this.state.templates[input.templateId];
      applyOutcome(templateCounter, input.outcome);
      if (typeof input.durationMs === "number" && input.durationMs > 0) {
        const attempts = Math.max(templateCounter.processed, 1);
        const current = templateCounter.avgDurationMs ?? input.durationMs;
        templateCounter.avgDurationMs = Math.round(current + (input.durationMs - current) / attempts);
      }
    }

    for (const token of tokenizePrompt(input.prompt)) {
      if (!this.state.tokens[token]) {
        this.state.tokens[token] = { ...emptyCounter() };
      }
      applyOutcome(this.state.tokens[token], input.outcome);
    }

    this.pruneTokens();
    this.persist();
  }

  recommendBudgetFloor(baseFloor: number): LearnedBudgetPolicy | null {
    let floor = baseFloor;
    const reasons: string[] = [];

    for (const bucket of this.state.budgetBuckets) {
      if (bucket.max == null) continue;
      if (bucket.attempts < 5) continue;
      const rate = successRate(bucket);
      if (rate <= 0.15 && bucket.failed >= 3 && bucket.max > floor) {
        floor = bucket.max;
        reasons.push(`${bucketLabel(bucket)} success rate ${(rate * 100).toFixed(0)}% over ${bucket.attempts} attempts`);
      }
    }

    if (floor <= baseFloor) return null;

    return {
      floor,
      reason: reasons.slice(0, 2).join("; ")
    };
  }

  guidanceForPrompt(prompt: string): string[] {
    const tokens = tokenizePrompt(prompt);
    if (!tokens.length) return [];

    const strongSignals = tokens
      .map((token) => ({ token, counter: this.state.tokens[token] }))
      .filter((entry): entry is { token: string; counter: Counter } => Boolean(entry.counter))
      .filter((entry) => entry.counter.attempts >= 3)
      .sort((a, b) => successRate(b.counter) - successRate(a.counter));

    const good = strongSignals.filter((entry) => successRate(entry.counter) >= 0.6).slice(0, 3);
    const weak = strongSignals
      .filter((entry) => successRate(entry.counter) <= 0.2 && entry.counter.failed >= 2)
      .slice(0, 2);

    const notes: string[] = [];
    if (good.length) {
      notes.push(
        `Prior successful prompt themes: ${good
          .map((entry) => `${entry.token} (${Math.round(successRate(entry.counter) * 100)}% win)`)
          .join(", ")}.`
      );
    }

    if (weak.length) {
      notes.push(
        `Prior failure-prone themes: ${weak
          .map((entry) => `${entry.token} (${Math.round(successRate(entry.counter) * 100)}% win)`)
          .join(", ")}. Favor simpler UI scope and robust interactions.`
      );
    }

    return notes;
  }
}
