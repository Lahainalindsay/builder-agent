import fs from "node:fs";
import path from "node:path";

export type JobStatus = "processed" | "skipped" | "failed";

export interface JobRecord {
  id: string;
  status: JobStatus;
  attempts: number;
  lastError?: string;
  updatedAt: string;
  nextRetryAt?: string;
}

interface JobStoreState {
  jobs: Record<string, JobRecord>;
}

export class JobStore {
  private readonly filePath: string;
  private state: JobStoreState;

  constructor(rootDir = process.cwd()) {
    const storeDir = path.join(rootDir, ".seedstr");
    fs.mkdirSync(storeDir, { recursive: true });
    this.filePath = path.join(storeDir, "state.json");
    this.state = this.load();
  }

  private load(): JobStoreState {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { jobs: {} };
      }

      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<JobStoreState>;
      return {
        jobs: parsed.jobs && typeof parsed.jobs === "object" ? parsed.jobs : {}
      };
    } catch {
      return { jobs: {} };
    }
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
  }

  get(jobId: string): JobRecord | undefined {
    return this.state.jobs[jobId];
  }

  has(jobId: string): boolean {
    return Boolean(this.get(jobId));
  }

  isFinal(jobId: string): boolean {
    const record = this.get(jobId);
    return record?.status === "processed" || record?.status === "skipped";
  }

  canRetry(jobId: string, now = new Date()): boolean {
    const record = this.get(jobId);
    if (!record) return true;
    if (record.status === "processed" || record.status === "skipped") return false;
    if (!record.nextRetryAt) return true;
    return new Date(record.nextRetryAt).getTime() <= now.getTime();
  }

  attempts(jobId: string): number {
    return this.get(jobId)?.attempts ?? 0;
  }

  incrementAttempts(jobId: string): number {
    const nextAttempts = this.attempts(jobId) + 1;
    this.state.jobs[jobId] = {
      id: jobId,
      status: this.get(jobId)?.status ?? "failed",
      attempts: nextAttempts,
      lastError: this.get(jobId)?.lastError,
      updatedAt: new Date().toISOString(),
      nextRetryAt: this.get(jobId)?.nextRetryAt
    };
    this.persist();
    return nextAttempts;
  }

  markProcessed(jobId: string): void {
    this.state.jobs[jobId] = {
      id: jobId,
      status: "processed",
      attempts: this.attempts(jobId),
      updatedAt: new Date().toISOString(),
      nextRetryAt: undefined
    };
    this.prune();
    this.persist();
  }

  markSkipped(jobId: string, reason: string): void {
    this.state.jobs[jobId] = {
      id: jobId,
      status: "skipped",
      attempts: this.attempts(jobId),
      lastError: reason,
      updatedAt: new Date().toISOString(),
      nextRetryAt: undefined
    };
    this.prune();
    this.persist();
  }

  markFailed(jobId: string, error: string, nextRetryAt?: string): void {
    this.state.jobs[jobId] = {
      id: jobId,
      status: "failed",
      attempts: this.attempts(jobId),
      lastError: error,
      updatedAt: new Date().toISOString(),
      nextRetryAt
    };
    this.prune();
    this.persist();
  }

  private prune(): void {
    const entries = Object.entries(this.state.jobs);
    if (entries.length <= 1500) return;

    const trimmed = entries
      .sort((a, b) => a[1].updatedAt.localeCompare(b[1].updatedAt))
      .slice(entries.length - 1500);

    this.state.jobs = Object.fromEntries(trimmed);
  }
}
