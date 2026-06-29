import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface CreatePendingGithubConnectionIntentInput {
  workspaceId: string;
  connectedByMemberId: string;
  scopes: string[];
  stateNonce: string;
}

export interface CompleteGithubConnectionIntentInput {
  stateNonce: string;
  installationId: string;
  githubAccountLogin: string | null;
  scopes: string[];
}

export interface GithubConnectionSummary {
  id: string;
  workspaceId: string;
  provider: "github_app";
  installationId: string | null;
  githubAccountLogin: string | null;
  scopes: string[];
  connectedAt: string;
  revokedAt: string | null;
}

interface GithubConnectionSummaryRow {
  id: string;
  workspaceId: string;
  provider: string;
  installationId: string | null;
  githubAccountLogin: string | null;
  scopes: string[];
  connectedAt: Date | string;
  revokedAt: Date | string | null;
}

@Injectable()
export class JuhyungGithubConnectionRepository {
  constructor(private readonly database: DatabaseService) {}

  createPendingConnectionIntent(
    input: CreatePendingGithubConnectionIntentInput,
  ) {
    return this.database.githubConnection.create({
      data: {
        workspaceId: input.workspaceId,
        provider: "github_app",
        connectedByMemberId: input.connectedByMemberId,
        scopes: input.scopes,
        stateNonce: input.stateNonce,
      },
    });
  }

  async completeConnectionIntent(
    input: CompleteGithubConnectionIntentInput,
  ): Promise<GithubConnectionSummary> {
    const pendingConnection = await this.database.githubConnection.findFirst({
      where: {
        stateNonce: input.stateNonce,
        installationId: null,
        revokedAt: null,
      },
    });

    if (!pendingConnection) {
      throw new BadRequestException(
        "Valid GitHub connection state is required",
      );
    }

    const existingConnection = await this.database.githubConnection.findFirst({
      where: {
        installationId: input.installationId,
        revokedAt: null,
        NOT: { workspaceId: pendingConnection.workspaceId },
      },
    });

    if (existingConnection) {
      throw new ConflictException(
        "GitHub installation is already connected to another workspace",
      );
    }

    const now = new Date();
    const scopes =
      input.scopes.length > 0 ? input.scopes : pendingConnection.scopes;
    const connection = await this.updatePendingConnection(
      pendingConnection.id,
      input.stateNonce,
      {
        installationId: input.installationId,
        githubAccountLogin: input.githubAccountLogin,
        scopes,
        stateNonce: null,
        connectedAt: now,
        updatedAt: now,
      },
    );

    return this.toSummary(connection);
  }

  async listConnections(
    workspaceId: string,
  ): Promise<GithubConnectionSummary[]> {
    const connections = await this.database.githubConnection.findMany({
      where: {
        workspaceId,
        installationId: { not: null },
      },
      orderBy: [{ connectedAt: "desc" }, { createdAt: "desc" }],
    });

    return (connections as GithubConnectionSummaryRow[]).map((connection) =>
      this.toSummary(connection),
    );
  }

  async revokeConnection(
    workspaceId: string,
    connectionId: string,
  ): Promise<GithubConnectionSummary> {
    const connection = await this.database.githubConnection.findFirst({
      where: {
        id: connectionId,
        workspaceId,
        installationId: { not: null },
        revokedAt: null,
      },
    });

    if (!connection) {
      throw new NotFoundException("GitHub connection was not found");
    }

    const now = new Date();
    const revokedConnection = await this.database.githubConnection.update({
      where: { id: connection.id },
      data: {
        revokedAt: now,
        updatedAt: now,
      },
    });

    return this.toSummary(revokedConnection);
  }

  private toSummary(row: GithubConnectionSummaryRow): GithubConnectionSummary {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      provider: "github_app",
      installationId: row.installationId,
      githubAccountLogin: row.githubAccountLogin,
      scopes: row.scopes,
      connectedAt: this.toIsoString(row.connectedAt),
      revokedAt: row.revokedAt ? this.toIsoString(row.revokedAt) : null,
    };
  }

  private async updatePendingConnection(
    connectionId: string,
    stateNonce: string,
    data: {
      installationId: string;
      githubAccountLogin: string | null;
      scopes: string[];
      stateNonce: null;
      connectedAt: Date;
      updatedAt: Date;
    },
  ) {
    try {
      const updateResult = await this.database.githubConnection.updateMany({
        where: {
          id: connectionId,
          stateNonce,
          installationId: null,
          revokedAt: null,
        },
        data,
      });

      if (updateResult.count !== 1) {
        throw new BadRequestException(
          "Valid GitHub connection state is required",
        );
      }

      const connection = await this.database.githubConnection.findFirst({
        where: { id: connectionId },
      });

      if (!connection) {
        throw new BadRequestException(
          "Valid GitHub connection state is required",
        );
      }

      return connection;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          "GitHub installation is already connected to another workspace",
        );
      }

      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }

  private toIsoString(value: Date | string) {
    return value instanceof Date ? value.toISOString() : value;
  }
}
