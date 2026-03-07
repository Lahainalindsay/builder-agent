import fs from "node:fs";
import path from "node:path";
import { getSeedstrConfig } from "../config/seedstrConfig";

export type JobType = "STANDARD" | "SWARM";
export type ResponseType = "TEXT" | "FILE";
export type PaymentChain = "ETH" | "SOL";

export interface FileAttachment {
  url: string;
  name: string;
  size: number;
  type: string;
}

export interface Job {
  id: string;
  prompt: string;
  budget: number;
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  createdAt: string;
  responseCount: number;
  paymentChain?: PaymentChain;
  jobType?: JobType;
  maxAgents?: number | null;
  budgetPerAgent?: number | null;
  requiredSkills?: string[];
  acceptedCount?: number;
  minReputation?: number | null;
}

export interface JobsListResponse {
  jobs: Job[];
  pagination?: { limit: number; offset: number; hasMore: boolean };
}

export interface SkillsResponse {
  skills: string[];
}

export interface AcceptJobResult {
  success: boolean;
  acceptance: {
    id: string;
    jobId: string;
    status: string;
    responseDeadline: string;
    budgetPerAgent: number | null;
  };
  slotsRemaining: number;
  isFull: boolean;
}

export interface SubmitResponseResult {
  success: boolean;
  response: { id: string };
}

export interface CancelJobResponse {
  success: boolean;
  message: string;
  refund?: {
    total?: number;
    currency?: string;
    [key: string]: unknown;
  };
}

export interface RegisterResponse {
  success: boolean;
  apiKey: string;
  agentId: string;
}

export interface CreateJobRequest {
  prompt: string;
  budget: number;
  walletAddress?: string;
  txSignature?: string;
  paymentChain?: PaymentChain;
  jobType?: JobType;
  maxAgents?: number;
  requiredSkills?: string[];
  minReputation?: number;
}

export interface CreateJobResponse {
  success: boolean;
  job: Job;
}

export interface AgentVerificationInfo {
  isVerified: boolean;
  ownerTwitter?: string;
  verificationInstructions?: string;
  verificationRequired?: boolean;
}

export interface AgentInfo {
  id: string;
  walletAddress?: string;
  walletType?: PaymentChain;
  name?: string;
  bio?: string;
  profilePicture?: string;
  skills?: string[];
  reputation?: number;
  jobsCompleted?: number;
  jobsDeclined?: number;
  totalEarnings?: number;
  createdAt?: string;
  verification: AgentVerificationInfo;
}

export interface VerifyResponse {
  success?: boolean;
  isVerified: boolean;
  ownerTwitter?: string;
  message?: string;
}

export interface UpdateProfileResponse {
  success: boolean;
  agent: AgentInfo;
}

export interface PublicAgentProfile {
  id: string;
  name?: string;
  bio?: string;
  profilePicture?: string;
  reputation?: number;
  jobsCompleted?: number;
  jobsDeclined?: number;
  totalEarnings?: number;
  [key: string]: unknown;
}

export interface LeaderboardEntry {
  id: string;
  name?: string;
  reputation?: number;
  jobsCompleted?: number;
  totalEarnings?: number;
  [key: string]: unknown;
}

export interface LeaderboardResponse {
  agents: LeaderboardEntry[];
}

export interface PlatformStatsResponse {
  totalJobs?: number;
  completedJobs?: number;
  openJobs?: number;
  totalAgents?: number;
  verifiedAgents?: number;
  totalPayout?: number;
  [key: string]: unknown;
}

export type SeedstrErrorKind =
  | "auth"
  | "rate_limit"
  | "not_found"
  | "conflict"
  | "server"
  | "network"
  | "validation"
  | "unknown";

export class SeedstrApiError extends Error {
  constructor(
    message: string,
    public readonly kind: SeedstrErrorKind,
    public readonly status?: number,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "SeedstrApiError";
  }
}

function asErrorMessage(status: number, statusText: string, data: unknown): string {
  if (typeof data === "object" && data !== null && "message" in data) {
    return String((data as { message: unknown }).message);
  }

  return `HTTP ${status} ${statusText}`;
}

function classifyHttpError(status: number, message: string): SeedstrApiError {
  if (status === 401 || status === 403) return new SeedstrApiError(message, "auth", status, false);
  if (status === 404) return new SeedstrApiError(message, "not_found", status, false);
  if (status === 409) return new SeedstrApiError(message, "conflict", status, false);
  if (status === 429) return new SeedstrApiError(message, "rate_limit", status, true);
  if (status >= 500) return new SeedstrApiError(message, "server", status, true);
  if (status >= 400) return new SeedstrApiError(message, "validation", status, false);
  return new SeedstrApiError(message, "unknown", status, false);
}

export class SeedstrHttpClient {
  private readonly config = getSeedstrConfig();

  private async request<T>(baseUrl: string, endpoint: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");

    if (this.config.seedstrApiKey) {
      headers.set("Authorization", `Bearer ${this.config.seedstrApiKey}`);
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${endpoint}`, {
        ...init,
        headers
      });
    } catch (error) {
      throw new SeedstrApiError(
        error instanceof Error ? error.message : String(error),
        "network",
        undefined,
        true
      );
    }

    const text = await response.text();
    const data = text ? (JSON.parse(text) as unknown) : {};

    if (!response.ok) {
      throw classifyHttpError(response.status, asErrorMessage(response.status, response.statusText, data));
    }

    return data as T;
  }

  async listJobsV2(limit = 20, offset = 0): Promise<JobsListResponse> {
    return this.request<JobsListResponse>(this.config.seedstrApiUrlV2, `/jobs?limit=${limit}&offset=${offset}`, {
      method: "GET"
    });
  }

  async listSkillsV2(): Promise<SkillsResponse> {
    return this.request<SkillsResponse>(this.config.seedstrApiUrlV2, "/skills", {
      method: "GET"
    });
  }

  async getAgentProfileV2(agentId: string): Promise<PublicAgentProfile> {
    return this.request<PublicAgentProfile>(this.config.seedstrApiUrlV2, `/agents/${agentId}`, {
      method: "GET"
    });
  }

  async getLeaderboardV2(params?: {
    sortBy?: "reputation" | "earnings" | "jobs";
    limit?: number;
  }): Promise<LeaderboardResponse> {
    const search = new URLSearchParams();
    if (params?.sortBy) search.set("sortBy", params.sortBy);
    if (params?.limit != null) search.set("limit", String(params.limit));
    const query = search.toString();
    return this.request<LeaderboardResponse>(this.config.seedstrApiUrlV2, `/leaderboard${query ? `?${query}` : ""}`, {
      method: "GET"
    });
  }

  async getPlatformStatsV2(): Promise<PlatformStatsResponse> {
    return this.request<PlatformStatsResponse>(this.config.seedstrApiUrlV2, "/stats", {
      method: "GET"
    });
  }

  async createJobV2(payload: CreateJobRequest): Promise<CreateJobResponse> {
    if (this.config.mockJobCreationForTesting) {
      const now = new Date().toISOString();
      const fakeId = `local-${Date.now().toString(36)}`;
      return {
        success: true,
        job: {
          id: fakeId,
          prompt: payload.prompt,
          budget: payload.budget,
          status: "OPEN",
          paymentChain: payload.paymentChain ?? "SOL",
          jobType: payload.jobType ?? "STANDARD",
          maxAgents: payload.maxAgents ?? null,
          requiredSkills: payload.requiredSkills ?? [],
          minReputation: payload.minReputation ?? null,
          responseCount: 0,
          acceptedCount: 0,
          expiresAt: now,
          createdAt: now
        }
      };
    }

    const walletAddress =
      payload.walletAddress ??
      (this.config.allowUnpaidTestJobs ? "TEST_WALLET_ADDRESS_PLACEHOLDER" : undefined);
    const txSignature =
      payload.txSignature ??
      (this.config.allowUnpaidTestJobs ? `TEST_TX_${Date.now().toString(36)}` : undefined);

    if (!walletAddress || !txSignature) {
      throw new SeedstrApiError(
        "createJobV2 requires walletAddress and txSignature unless ALLOW_UNPAID_TEST_JOBS=true or MOCK_JOB_CREATION_FOR_TESTING=true",
        "validation",
        400,
        false
      );
    }

    return this.request<CreateJobResponse>(this.config.seedstrApiUrlV2, "/jobs", {
      method: "POST",
      body: JSON.stringify({
        prompt: payload.prompt,
        budget: payload.budget,
        walletAddress,
        txSignature,
        paymentChain: payload.paymentChain ?? "SOL",
        ...(payload.jobType ? { jobType: payload.jobType } : {}),
        ...(payload.maxAgents != null ? { maxAgents: payload.maxAgents } : {}),
        ...(payload.requiredSkills?.length ? { requiredSkills: payload.requiredSkills } : {}),
        ...(payload.minReputation != null ? { minReputation: payload.minReputation } : {})
      })
    });
  }

  async register(walletAddress: string, walletType: "ETH" | "SOL", ownerUrl?: string): Promise<RegisterResponse> {
    return this.request<RegisterResponse>(this.config.seedstrApiUrlV2, "/register", {
      method: "POST",
      body: JSON.stringify({
        walletAddress,
        walletType,
        ...(ownerUrl ? { ownerUrl } : {})
      })
    });
  }

  async getMe(): Promise<AgentInfo> {
    return this.request<AgentInfo>(this.config.seedstrApiUrlV2, "/me", {
      method: "GET"
    });
  }

  async verify(): Promise<VerifyResponse> {
    return this.request<VerifyResponse>(this.config.seedstrApiUrlV2, "/verify", {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  async updateProfile(params: {
    name?: string;
    bio?: string;
    profilePicture?: string;
    skills?: string[];
  }): Promise<UpdateProfileResponse> {
    return this.request<UpdateProfileResponse>(this.config.seedstrApiUrlV2, "/me", {
      method: "PATCH",
      body: JSON.stringify(params)
    });
  }

  async getJobV2(jobId: string): Promise<Job> {
    return this.request<Job>(this.config.seedstrApiUrlV2, `/jobs/${jobId}`, {
      method: "GET"
    });
  }

  async acceptJobV2(jobId: string): Promise<AcceptJobResult> {
    return this.request<AcceptJobResult>(this.config.seedstrApiUrlV2, `/jobs/${jobId}/accept`, {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  async declineJobV2(jobId: string, reason?: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(this.config.seedstrApiUrlV2, `/jobs/${jobId}/decline`, {
      method: "POST",
      body: JSON.stringify({ reason })
    });
  }

  async cancelJobV2(jobId: string): Promise<CancelJobResponse> {
    return this.request<CancelJobResponse>(this.config.seedstrApiUrlV2, `/jobs/${jobId}/cancel`, {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  async respondV2(params: {
    jobId: string;
    content: string;
    responseType: ResponseType;
    files?: FileAttachment[];
  }): Promise<SubmitResponseResult> {
    return this.request<SubmitResponseResult>(this.config.seedstrApiUrlV2, `/jobs/${params.jobId}/respond`, {
      method: "POST",
      body: JSON.stringify({
        content: params.content,
        responseType: params.responseType,
        ...(params.files?.length ? { files: params.files } : {})
      })
    });
  }

  async uploadZipV1(zipPath: string): Promise<FileAttachment> {
    return this.uploadZipToBase(this.config.seedstrApiUrlV1, zipPath);
  }

  async uploadZipV2(zipPath: string): Promise<FileAttachment> {
    return this.uploadZipToBase(this.config.seedstrApiUrlV2, zipPath);
  }

  async uploadZip(zipPath: string): Promise<FileAttachment> {
    try {
      return await this.uploadZipV2(zipPath);
    } catch (error) {
      if (
        error instanceof SeedstrApiError &&
        (error.kind === "not_found" || error.kind === "validation" || error.kind === "server" || error.kind === "network")
      ) {
        return this.uploadZipV1(zipPath);
      }
      throw error;
    }
  }

  private async uploadZipToBase(baseUrl: string, zipPath: string): Promise<FileAttachment> {
    const payload = {
      files: [
        {
          name: path.basename(zipPath),
          content: fs.readFileSync(zipPath).toString("base64"),
          type: "application/zip"
        }
      ]
    };

    const response = await this.request<{
      success: boolean;
      files: FileAttachment[];
    }>(baseUrl, "/upload", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (!response.success || !response.files[0]) {
      throw new Error("Upload failed: no file returned");
    }

    return response.files[0];
  }
}
