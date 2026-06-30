import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Optional,
} from "@nestjs/common";
import { createSign } from "node:crypto";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_USER_AGENT = "pilo-app-server";

export interface GithubProviderRepository {
  owner: string;
  repoName: string;
  url: string;
  defaultBranch: string | null;
}

export interface GithubProviderPullRequest {
  number: number;
  title: string;
  authorLogin: string | null;
  state: string;
  branch: string | null;
  baseBranch: string | null;
  url: string;
  changedFilesCount: number;
  additions: number;
  deletions: number;
  openedAt: string | null;
  mergedAt: string | null;
  closedAt: string | null;
}

export interface GithubProviderResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

export type GithubProviderFetcher = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<GithubProviderResponse>;

@Injectable()
export class JuhyungGithubProviderClient {
  constructor(
    @Optional()
    private readonly fetcher: GithubProviderFetcher = defaultGithubFetcher,
  ) {}

  async createInstallationAccessToken(installationId: string): Promise<string> {
    const response = await this.requestJson(
      `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      {
        method: "POST",
        token: this.createAppJwt(),
      },
    );

    if (!isRecord(response) || typeof response.token !== "string") {
      throw new BadGatewayException(
        "GitHub installation token response was invalid",
      );
    }

    return response.token;
  }

  async listInstallationRepositories(
    accessToken: string,
  ): Promise<GithubProviderRepository[]> {
    const response = await this.requestJson("/installation/repositories", {
      method: "GET",
      token: accessToken,
      query: { per_page: "100" },
    });

    if (!isRecord(response) || !Array.isArray(response.repositories)) {
      throw new BadGatewayException(
        "GitHub installation repositories response was invalid",
      );
    }

    return response.repositories
      .map((repository) => this.toProviderRepository(repository))
      .filter((repository): repository is GithubProviderRepository =>
        Boolean(repository),
      );
  }

  async listPullRequests(
    accessToken: string,
    owner: string,
    repoName: string,
  ): Promise<GithubProviderPullRequest[]> {
    const response = await this.requestJson(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repoName,
      )}/pulls`,
      {
        method: "GET",
        token: accessToken,
        query: { state: "all", per_page: "100" },
      },
    );

    if (!Array.isArray(response)) {
      throw new BadGatewayException(
        "GitHub pull requests response was invalid",
      );
    }

    return response
      .map((pullRequest) => this.toProviderPullRequest(pullRequest))
      .filter((pullRequest): pullRequest is GithubProviderPullRequest =>
        Boolean(pullRequest),
      );
  }

  private async requestJson(
    path: string,
    options: {
      method: string;
      token: string;
      query?: Record<string, string>;
    },
  ) {
    const url = new URL(`${GITHUB_API_BASE_URL}${path}`);

    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const response = await this.fetcher(url.toString(), {
      method: options.method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${options.token}`,
        "User-Agent": GITHUB_USER_AGENT,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    });

    if (!response.ok) {
      throw new BadGatewayException(
        `GitHub API request failed with ${response.status} ${response.statusText}`,
      );
    }

    return response.json();
  }

  private createAppJwt() {
    const appId = process.env.GITHUB_APP_ID?.trim();
    const privateKey = normalizePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY);

    if (!appId || !privateKey) {
      throw new InternalServerErrorException(
        "GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required for GitHub sync",
      );
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const header = encodeJson({ alg: "RS256", typ: "JWT" });
    const payload = encodeJson({
      iat: nowInSeconds - 60,
      exp: nowInSeconds + 540,
      iss: appId,
    });
    const signingInput = `${header}.${payload}`;
    const signer = createSign("RSA-SHA256");

    signer.update(signingInput);
    signer.end();

    return `${signingInput}.${encodeBuffer(signer.sign(privateKey))}`;
  }

  private toProviderRepository(
    value: unknown,
  ): GithubProviderRepository | null {
    if (!isRecord(value)) {
      return null;
    }

    const owner = isRecord(value.owner) ? value.owner.login : undefined;

    if (
      typeof owner !== "string" ||
      typeof value.name !== "string" ||
      typeof value.html_url !== "string"
    ) {
      return null;
    }

    return {
      owner,
      repoName: value.name,
      url: value.html_url,
      defaultBranch:
        typeof value.default_branch === "string" ? value.default_branch : null,
    };
  }

  private toProviderPullRequest(
    value: unknown,
  ): GithubProviderPullRequest | null {
    if (
      !isRecord(value) ||
      typeof value.number !== "number" ||
      typeof value.title !== "string" ||
      typeof value.html_url !== "string"
    ) {
      return null;
    }

    return {
      number: value.number,
      title: value.title,
      authorLogin: isRecord(value.user)
        ? toNullableString(value.user.login)
        : null,
      state: toPullRequestState(value),
      branch: isRecord(value.head) ? toNullableString(value.head.ref) : null,
      baseBranch: isRecord(value.base)
        ? toNullableString(value.base.ref)
        : null,
      url: value.html_url,
      changedFilesCount: toNumber(value.changed_files),
      additions: toNumber(value.additions),
      deletions: toNumber(value.deletions),
      openedAt: toNullableString(value.created_at),
      mergedAt: toNullableString(value.merged_at),
      closedAt: toNullableString(value.closed_at),
    };
  }
}

async function defaultGithubFetcher(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<GithubProviderResponse> {
  return fetch(url, init) as Promise<GithubProviderResponse>;
}

function normalizePrivateKey(value?: string) {
  if (!value) {
    return "";
  }

  return value.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
}

function encodeJson(value: Record<string, unknown>) {
  return encodeBuffer(Buffer.from(JSON.stringify(value)));
}

function encodeBuffer(value: Buffer) {
  return value.toString("base64url");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toPullRequestState(value: Record<string, unknown>) {
  if (typeof value.merged_at === "string" && value.merged_at.length > 0) {
    return "merged";
  }

  return value.state === "closed" ? "closed" : "open";
}
