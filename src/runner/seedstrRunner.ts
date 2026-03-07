import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { getSeedstrConfig } from "../config/seedstrConfig";
import { SeedstrApiError, SeedstrHttpClient, type Job } from "../integrations/seedstrHttpClient";
import { formatResponseContent } from "../skills/responseFormatter";
import { decideWithSkill, loadSkillConfig } from "../skills/skillLoader";
import { runExternalLookups, serializeLookupsForPrompt } from "../skills/lookupEngine";
import { handleSeedstrJob } from "../integrations/seedstrJobHandler";
import { createLogger } from "../utils/logger";
import { zipProject } from "../builder/zipProject";
import { JobStore } from "./jobStore";
import { LearningStore } from "./learningStore";
import { runBuiltInTools, serializeToolResults } from "../tools";

export interface RunnerOptions {
  outputRootDir: string;
}

function effectiveBudget(job: Job): number {
  return job.jobType === "SWARM" && job.budgetPerAgent ? job.budgetPerAgent : job.budget;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFrontendBuildable(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const blocked = ["deploy on aws", "terraform", "kubernetes", "live stripe keys", "production database migration"];
  return !blocked.some((term) => lower.includes(term));
}

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function nextRetryIso(delayMs: number): string {
  return new Date(Date.now() + delayMs).toISOString();
}

function isFinalApiSkip(error: unknown): string | null {
  if (!(error instanceof SeedstrApiError)) return null;

  if (error.kind === "conflict") return error.message;
  if (error.kind === "not_found") return error.message;
  if (error.kind === "validation") {
    const lower = error.message.toLowerCase();
    if (lower.includes("already responded") || lower.includes("already submitted") || lower.includes("expired")) {
      return error.message;
    }
  }

  return null;
}

function criticalVerificationFailure(verification: Array<{ step: string; ok: boolean }>): string | null {
  const criticalPrefixes = [
    "file:",
    "scripts:",
    "acceptance:file:",
    "acceptance:script:",
    "zip:contains-generated-files",
    "lockfile:package-lock.json"
  ];

  for (const check of verification) {
    if (check.ok) continue;
    if (check.step === "npm run build") return check.step;
    if (check.step === "npm install" || check.step === "npm ci" || check.step === "build-repair") return check.step;
    if (criticalPrefixes.some((prefix) => check.step.startsWith(prefix))) return check.step;
  }

  return null;
}

export class SeedstrRunner {
  private readonly config = getSeedstrConfig();
  private readonly logger = createLogger(this.config.logLevel);
  private readonly client = new SeedstrHttpClient();
  private readonly store = new JobStore();
  private readonly learning = new LearningStore();
  private readonly skill = loadSkillConfig();
  private readonly processing = new Set<string>();
  private pusher: { disconnect: () => void } | null = null;
  private wsConnected = false;
  private running = false;
  private pollFailures = 0;

  constructor(private readonly options: RunnerOptions) {}

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.config.seedstrApiKey) {
      throw new Error("SEEDSTR_API_KEY is required to listen/respond.");
    }

    this.running = true;
    this.logger.info("Seedstr runner starting");
    await this.connectWebSocket();
    void this.pollLoop();
  }

  async stop(): Promise<void> {
    this.running = false;

    try {
      this.pusher?.disconnect();
    } catch {
      // Ignore disconnect failures.
    }

    this.pusher = null;
    this.wsConnected = false;
    this.logger.info("Seedstr runner stopped");
  }

  private async connectWebSocket(): Promise<void> {
    if (!this.config.useWebSocket) {
      this.logger.info("WebSocket disabled");
      return;
    }

    if (!this.config.pusherKey) {
      this.logger.warn("PUSHER_KEY not set; polling only");
      return;
    }

    const agentId = process.env.SEEDSTR_AGENT_ID?.trim();
    if (!agentId) {
      this.logger.warn("SEEDSTR_AGENT_ID not set; polling only");
      return;
    }

    let PusherModule: unknown;
    try {
      PusherModule = await import("pusher-js");
    } catch {
      this.logger.warn("pusher-js not installed; polling only");
      return;
    }

    const Pusher = (PusherModule as { default?: new (...args: unknown[]) => any }).default ?? PusherModule;
    const pusher = new (Pusher as new (...args: unknown[]) => any)(this.config.pusherKey, {
      cluster: this.config.pusherCluster,
      channelAuthorization: {
        endpoint: `${this.config.seedstrApiUrlV2}/pusher/auth`,
        transport: "ajax",
        headers: {
          Authorization: `Bearer ${this.config.seedstrApiKey}`
        }
      }
    });

    pusher.connection.bind("connected", () => {
      this.wsConnected = true;
      this.logger.info("WebSocket connected");
    });

    pusher.connection.bind("disconnected", () => {
      this.wsConnected = false;
      this.logger.warn("WebSocket disconnected");
    });

    pusher.connection.bind("error", (error: unknown) => {
      this.wsConnected = false;
      this.logger.error("WebSocket error", error);
    });

    const channel = pusher.subscribe(`private-agent-${agentId}`);
    channel.bind("pusher:subscription_succeeded", () => {
      this.logger.info(`Subscribed to private-agent-${agentId}`);
    });

    channel.bind("pusher:subscription_error", (error: unknown) => {
      this.logger.error("WebSocket subscription error", error);
    });

    channel.bind("job:new", async (event: { jobId: string }) => {
      try {
        const job = await this.client.getJobV2(event.jobId);
        await this.maybeProcess(job);
      } catch (error) {
        this.logger.error("Failed handling WS job", error);
      }
    });

    this.pusher = pusher as { disconnect: () => void };
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        const response = await this.client.listJobsV2(this.config.pollLimit, 0);
        this.pollFailures = 0;

        for (const job of response.jobs) {
          if (!this.running) break;
          await this.maybeProcess(job);
        }
      } catch (error) {
        this.pollFailures += 1;
        this.logger.error("Polling failed", error);
        if (error instanceof SeedstrApiError && error.kind === "auth") {
          this.logger.error("Authentication failed; stopping runner");
          await this.stop();
          return;
        }
      }

      const baseDelayMs = this.config.pollIntervalSec * 1000;
      const backoffMs = Math.min(this.pollFailures * 5000, 30000);
      const wsFactor = this.wsConnected ? 3 : 1;
      const jitterMs = Math.floor(Math.random() * 750);
      await sleep(baseDelayMs * wsFactor + backoffMs + jitterMs);
    }
  }

  private async maybeProcess(job: Job): Promise<void> {
    if (this.store.isFinal(job.id) || this.processing.has(job.id)) return;
    if (!this.store.canRetry(job.id)) return;
    if (this.processing.size >= this.config.maxConcurrentJobs) return;
    if (job.status !== "OPEN") {
      this.store.markSkipped(job.id, `Job status ${job.status}`);
      return;
    }

    const budget = effectiveBudget(job);
    const learnedBudgetPolicy = this.learning.recommendBudgetFloor(this.config.minBudget);
    const minBudget = learnedBudgetPolicy?.floor ?? this.config.minBudget;
    if (budget < minBudget) {
      this.logger.info(`Skipping job ${job.id} below budget floor`, budget);
      const reason = learnedBudgetPolicy
        ? `Below learned budget floor ${minBudget}: ${budget}. ${learnedBudgetPolicy.reason}`
        : `Below budget floor: ${budget}`;
      this.store.markSkipped(job.id, reason);
      this.learning.record({
        prompt: job.prompt,
        budget,
        outcome: "skipped"
      });
      return;
    }

    const skillDecision = decideWithSkill(this.skill, job);
    if (skillDecision?.action === "DECLINE" || skillDecision?.action === "CLARIFY") {
      this.logger.info(`Skipping job ${job.id} based on skill rules`, {
        jobId: job.id,
        phase: "filter",
        reason: skillDecision.reason,
        action: skillDecision.action
      });
      this.store.markSkipped(job.id, `Skill rule: ${skillDecision.reason}`);
      this.learning.record({
        prompt: job.prompt,
        budget,
        outcome: "skipped"
      });
      return;
    }

    if (!isFrontendBuildable(job.prompt)) {
      this.logger.info(`Skipping job ${job.id} because prompt is not frontend-buildable`);
      this.store.markSkipped(job.id, "Prompt requires external infra");
      this.learning.record({
        prompt: job.prompt,
        budget,
        outcome: "skipped"
      });
      return;
    }

    if (this.store.attempts(job.id) >= this.config.maxAttemptsPerJob) {
      this.logger.warn(`Skipping job ${job.id}; max attempts reached`);
      this.store.markSkipped(job.id, "Max attempts reached");
      this.learning.record({
        prompt: job.prompt,
        budget,
        outcome: "skipped"
      });
      return;
    }

    this.processing.add(job.id);
    this.store.incrementAttempts(job.id);

    try {
      if (job.jobType === "SWARM") {
        await this.acceptAndProcessSwarm(job);
      } else {
        await this.processJob(job);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finalSkip = isFinalApiSkip(error);
      if (finalSkip) {
        this.store.markSkipped(job.id, finalSkip);
        this.learning.record({
          prompt: job.prompt,
          budget,
          outcome: "skipped"
        });
        this.logger.warn(`Job ${job.id} skipped`, finalSkip);
      } else {
        const attempts = this.store.attempts(job.id);
        const retryDelay =
          error instanceof SeedstrApiError && error.kind === "rate_limit"
            ? this.config.retryBackoffMs * Math.max(attempts, 1) * 2
            : this.config.retryBackoffMs * Math.max(attempts, 1);
        this.store.markFailed(job.id, message, nextRetryIso(retryDelay));
        this.learning.record({
          prompt: job.prompt,
          budget,
          outcome: "failed"
        });
        this.logger.error(`Job ${job.id} failed`, error);
      }

      if (error instanceof SeedstrApiError && error.kind === "auth") {
        this.logger.error("Authentication failed during job processing; stopping runner");
        await this.stop();
      }
    } finally {
      this.processing.delete(job.id);
    }
  }

  private async acceptAndProcessSwarm(job: Job): Promise<void> {
    try {
      await this.client.acceptJobV2(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("job_full") || message.includes("All agent slots")) {
        this.logger.info(`Swarm job ${job.id} is already full`);
        this.store.markSkipped(job.id, "Swarm full");
        this.learning.record({
          prompt: job.prompt,
          budget: effectiveBudget(job),
          outcome: "skipped"
        });
        return;
      }

      if (error instanceof SeedstrApiError && error.kind === "validation") {
        const lower = error.message.toLowerCase();
        if (lower.includes("not open") || lower.includes("expired")) {
          this.store.markSkipped(job.id, error.message);
          this.learning.record({
            prompt: job.prompt,
            budget: effectiveBudget(job),
            outcome: "skipped"
          });
          return;
        }
      }

      throw error;
    }

    await this.processJob(job);
  }

  private async processJob(job: Job): Promise<void> {
    const startedAt = Date.now();
    this.logger.info(`Processing job ${job.id}`);

    const toolResults = await runBuiltInTools(job.prompt);
    if (toolResults.items.length) {
      this.logger.info(`Built-in tools added context for job ${job.id}`, {
        jobId: job.id,
        phase: "tools",
        items: toolResults.items.map((item) => item.tool)
      });
    }
    if (toolResults.warnings.length) {
      this.logger.warn(`Tool warnings for job ${job.id}`, toolResults.warnings);
    }

    const lookups = await runExternalLookups(job.prompt);
    if (lookups.items.length) {
      this.logger.info(`Lookup enrichment added for job ${job.id}`, {
        jobId: job.id,
        phase: "lookup",
        items: lookups.items.map((item) => item.type)
      });
    }
    if (lookups.warnings.length) {
      this.logger.warn(`Lookup warnings for job ${job.id}`, lookups.warnings);
    }

    const lookupPromptBlock = serializeLookupsForPrompt(lookups);
    const toolPromptBlock = serializeToolResults(toolResults);
    const learnedHints = this.learning.guidanceForPrompt(job.prompt);
    const learnedHintBlock = learnedHints.length
      ? ["## LEARNED EXECUTION HINTS", ...learnedHints.map((hint) => `- ${hint}`)].join("\n")
      : "";
    const contextBlocks = [toolPromptBlock, lookupPromptBlock, learnedHintBlock].filter((block) => block.trim().length > 0);
    const enrichedPrompt = contextBlocks.length ? `${job.prompt}\n\n${contextBlocks.join("\n\n")}` : job.prompt;

    const runId = randomUUID().slice(0, 8);
    const outputDir = path.join(this.options.outputRootDir, `job-${job.id}-${runId}`);
    const result = await handleSeedstrJob({
      job: { id: job.id, prompt: enrichedPrompt },
      outputDir
    });

    if (!result.zipPath) {
      throw new Error("Build did not produce a zip archive");
    }

    const verificationFailure = criticalVerificationFailure(result.verification);
    if (verificationFailure) {
      this.store.markSkipped(job.id, `Critical verification failed: ${verificationFailure}`);
      this.learning.record({
        prompt: job.prompt,
        budget: effectiveBudget(job),
        outcome: "skipped",
        templateId: result.templateId,
        durationMs: elapsedMs(startedAt)
      });
      this.logger.warn(`Skipping job ${job.id}; critical verification failure`, {
        jobId: job.id,
        phase: "verify",
        step: verificationFailure
      });
      return;
    }

    const zipSizeBytes = fs.statSync(result.zipPath).size;
    const zipSizeMb = zipSizeBytes / (1024 * 1024);
    if (zipSizeMb > this.config.maxZipSizeMb) {
      this.store.markSkipped(job.id, `Zip too large: ${zipSizeMb.toFixed(2)} MB`);
      this.learning.record({
        prompt: job.prompt,
        budget: effectiveBudget(job),
        outcome: "skipped",
        templateId: result.templateId,
        durationMs: elapsedMs(startedAt)
      });
      this.logger.warn(`Skipping job ${job.id}; zip too large`, {
        jobId: job.id,
        phase: "zip",
        zipSizeMb: zipSizeMb.toFixed(2)
      });
      return;
    }

    const uploadedFile = await this.withRetry(
      () => this.client.uploadZip(result.zipPath as string),
      `upload:${job.id}`
    );
    const verificationNotes = result.verification
      .filter((check) => check.step === "npm-install-network" || check.step === "build-verification-skipped-network")
      .map((check) => `- ${check.detail.split("\n")[0]}`);
    const content = [
      formatResponseContent({ result, lookups }),
      verificationNotes.length ? ["", "## Verification Notes", ...verificationNotes].join("\n") : ""
    ]
      .filter((part) => part.trim().length > 0)
      .join("\n\n");

    await this.withRetry(
      () =>
        this.client.respondV2({
          jobId: job.id,
          responseType: "FILE",
          content,
          files: [uploadedFile]
        }),
      `respond:${job.id}`
    );

    this.store.markProcessed(job.id);
    this.learning.record({
      prompt: job.prompt,
      budget: effectiveBudget(job),
      outcome: "processed",
      templateId: result.templateId,
      durationMs: elapsedMs(startedAt)
    });
    this.logger.info(`Submitted FILE response for job ${job.id}`, {
      jobId: job.id,
      phase: "respond",
      ms: elapsedMs(startedAt),
      templateId: result.templateId,
      zipSizeBytes,
      zipSizeMb: zipSizeMb.toFixed(2)
    });
  }

  private async withRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < 3) {
      attempt += 1;
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (!(error instanceof SeedstrApiError)) {
          if (attempt >= 3) throw error;
          await sleep(this.config.retryBackoffMs * attempt);
          continue;
        }

        if (error.kind === "auth") throw error;
        if (!error.retryable || attempt >= 3) throw error;

        const delay =
          error.kind === "rate_limit"
            ? this.config.retryBackoffMs * attempt * 2
            : this.config.retryBackoffMs * attempt;

        this.logger.warn(`Retrying ${label}`, {
          attempt,
          delay,
          kind: error.kind,
          message: error.message
        });
        await sleep(delay);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async smokeTest(): Promise<void> {
    const response = await this.client.listJobsV2(Math.min(this.config.pollLimit, 10), 0);
    const openJob = response.jobs.find((job) => job.status === "OPEN");

    this.logger.info("Smoke test job summary", {
      total: response.jobs.length,
      firstOpenJobId: openJob?.id ?? null
    });

    if (!openJob) return;

    const job = await this.client.getJobV2(openJob.id);
    this.logger.info("Smoke test fetched job", {
      jobId: job.id,
      budget: effectiveBudget(job),
      status: job.status
    });

    if (job.jobType === "SWARM") {
      try {
        await this.client.acceptJobV2(job.id);
        await this.client.declineJobV2(job.id, "Smoke test");
        this.logger.info("Smoke test accept/decline completed", { jobId: job.id });
      } catch (error) {
        this.logger.warn("Smoke test swarm accept/decline failed", error);
      }
    }

    const smokeDir = path.join(this.options.outputRootDir, "smoke-upload");
    fs.mkdirSync(smokeDir, { recursive: true });
    const notePath = path.join(smokeDir, "README.txt");
    fs.writeFileSync(notePath, `Seedstr smoke upload\nGenerated: ${new Date().toISOString()}\n`, "utf8");
    const zipPath = zipProject(smokeDir, path.join(this.options.outputRootDir, "smoke-upload.zip"));
    if (!zipPath) {
      throw new Error("Smoke zip creation failed");
    }

    const uploaded = await this.client.uploadZip(zipPath);
    this.logger.info("Smoke test upload completed", {
      name: uploaded.name,
      size: uploaded.size,
      type: uploaded.type
    });
  }
}
