import { Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DatabaseService } from "../../database/database.service";
import {
  CreateVoiceRoomInput,
  CreateVoiceSessionInput,
  UpdateVoiceRoomInput,
  UpdateVoiceSessionInput,
  VoiceRepositoryMode,
  VoiceRoomRecord,
  VoiceRoomStatus,
  VoiceSessionRecord,
  VoiceSessionRecordingStatus,
} from "../types/voice.types";
import { MockVoiceRepository } from "./voice.mock-repository";
import { VoiceRepository } from "./voice.repository";

type RawDatabaseClient = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<T>;
  $executeRaw(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<number>;
};

type DbVoiceRoomRow = {
  id: string;
  workspaceId: string;
  meetingId: string | null;
  livekitRoomName: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DbVoiceSessionRow = {
  id: string;
  voiceRoomId: string;
  meetingId: string | null;
  memberId: string | null;
  recordingStatus: string;
  startedAt: Date | string | null;
  endedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

@Injectable()
export class RuntimeVoiceRepository implements VoiceRepository {
  private readonly memory = new MockVoiceRepository();

  constructor(@Optional() private readonly database?: DatabaseService) {}

  get mode(): VoiceRepositoryMode {
    return this.shouldUseDatabase ? "database" : "mock";
  }

  async createVoiceRoom(
    input: CreateVoiceRoomInput,
  ): Promise<VoiceRoomRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.createVoiceRoom(input);
    }

    const rows = await this.db.$queryRaw<DbVoiceRoomRow[]>`
      INSERT INTO voice_rooms (
        workspace_id,
        meeting_id,
        livekit_room_name
      )
      VALUES (
        ${input.workspaceId}::uuid,
        ${input.meetingId ?? null}::uuid,
        ${input.livekitRoomName ?? null}
      )
      RETURNING ${voiceRoomSelectColumns}
    `;

    return toVoiceRoomRecord(requireSingleRow(rows, "Voice room"));
  }

  async findVoiceRoomById(
    voiceRoomId: string,
  ): Promise<VoiceRoomRecord | null> {
    if (!this.shouldUseDatabase) {
      return this.memory.findVoiceRoomById(voiceRoomId);
    }

    const rows = await this.db.$queryRaw<DbVoiceRoomRow[]>`
      SELECT ${voiceRoomSelectColumns}
      FROM voice_rooms
      WHERE id = ${voiceRoomId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toVoiceRoomRecord(rows[0]) : null;
  }

  async findVoiceRoomByMeetingId(
    meetingId: string,
  ): Promise<VoiceRoomRecord | null> {
    if (!this.shouldUseDatabase) {
      return this.memory.findVoiceRoomByMeetingId(meetingId);
    }

    const rows = await this.db.$queryRaw<DbVoiceRoomRow[]>`
      SELECT ${voiceRoomSelectColumns}
      FROM voice_rooms
      WHERE meeting_id = ${meetingId}::uuid
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `;

    return rows[0] ? toVoiceRoomRecord(rows[0]) : null;
  }

  async updateVoiceRoom(
    voiceRoomId: string,
    input: UpdateVoiceRoomInput,
  ): Promise<VoiceRoomRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.updateVoiceRoom(voiceRoomId, input);
    }

    const rows = await this.db.$queryRaw<DbVoiceRoomRow[]>`
      UPDATE voice_rooms
      SET
        status = ${input.status},
        updated_at = ${input.updatedAt}::timestamptz
      WHERE id = ${voiceRoomId}::uuid
      RETURNING ${voiceRoomSelectColumns}
    `;

    return toVoiceRoomRecord(requireSingleRow(rows, "Voice room"));
  }

  async createVoiceSession(
    input: CreateVoiceSessionInput,
  ): Promise<VoiceSessionRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.createVoiceSession(input);
    }

    const rows = await this.db.$queryRaw<DbVoiceSessionRow[]>`
      INSERT INTO voice_sessions (
        voice_room_id,
        meeting_id,
        member_id,
        started_at
      )
      VALUES (
        ${input.voiceRoomId}::uuid,
        ${input.meetingId ?? null}::uuid,
        (
          SELECT wm.id
          FROM workspace_members wm
          JOIN voice_rooms vr ON vr.workspace_id = wm.workspace_id
          WHERE wm.id = ${input.memberId ?? null}::uuid
            AND vr.id = ${input.voiceRoomId}::uuid
          LIMIT 1
        ),
        now()
      )
      RETURNING ${voiceSessionSelectColumns}
    `;

    return toVoiceSessionRecord(requireSingleRow(rows, "Voice session"));
  }

  async listVoiceSessionsByVoiceRoom(
    voiceRoomId: string,
  ): Promise<VoiceSessionRecord[]> {
    if (!this.shouldUseDatabase) {
      return this.memory.listVoiceSessionsByVoiceRoom(voiceRoomId);
    }

    const rows = await this.db.$queryRaw<DbVoiceSessionRow[]>`
      SELECT ${voiceSessionSelectColumns}
      FROM voice_sessions
      WHERE voice_room_id = ${voiceRoomId}::uuid
      ORDER BY created_at ASC, id ASC
    `;

    return rows.map(toVoiceSessionRecord);
  }

  async findVoiceSessionById(
    voiceSessionId: string,
  ): Promise<VoiceSessionRecord | null> {
    if (!this.shouldUseDatabase) {
      return this.memory.findVoiceSessionById(voiceSessionId);
    }

    const rows = await this.db.$queryRaw<DbVoiceSessionRow[]>`
      SELECT ${voiceSessionSelectColumns}
      FROM voice_sessions
      WHERE id = ${voiceSessionId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toVoiceSessionRecord(rows[0]) : null;
  }

  async findActiveVoiceSessionByMember(
    voiceRoomId: string,
    memberId: string | null,
  ): Promise<VoiceSessionRecord | null> {
    if (!this.shouldUseDatabase) {
      return this.memory.findActiveVoiceSessionByMember(voiceRoomId, memberId);
    }

    const rows = await this.db.$queryRaw<DbVoiceSessionRow[]>`
      SELECT ${voiceSessionSelectColumns}
      FROM voice_sessions
      WHERE voice_room_id = ${voiceRoomId}::uuid
        AND ended_at IS NULL
        AND (
          member_id = ${memberId ?? null}::uuid
          OR member_id IS NULL
        )
      ORDER BY started_at ASC, id ASC
      LIMIT 1
    `;

    return rows[0] ? toVoiceSessionRecord(rows[0]) : null;
  }

  async updateVoiceSession(
    voiceSessionId: string,
    input: UpdateVoiceSessionInput,
  ): Promise<VoiceSessionRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.updateVoiceSession(voiceSessionId, input);
    }

    const keepRecordingStatus = input.recordingStatus === undefined;
    const recordingStatus = input.recordingStatus ?? null;
    const keepEndedAt = input.endedAt === undefined;
    const endedAt = input.endedAt ?? null;
    const rows = await this.db.$queryRaw<DbVoiceSessionRow[]>`
      UPDATE voice_sessions
      SET
        recording_status = CASE
          WHEN ${keepRecordingStatus} THEN recording_status
          ELSE ${recordingStatus}
        END,
        ended_at = CASE
          WHEN ${keepEndedAt} THEN ended_at
          ELSE ${endedAt}::timestamptz
        END,
        updated_at = ${input.updatedAt}::timestamptz
      WHERE id = ${voiceSessionId}::uuid
      RETURNING ${voiceSessionSelectColumns}
    `;

    return toVoiceSessionRecord(requireSingleRow(rows, "Voice session"));
  }

  private get shouldUseDatabase() {
    return Boolean(
      this.database && process.env.PILO_SKIP_DATABASE_CONNECT !== "true",
    );
  }

  private get db(): RawDatabaseClient {
    if (!this.database) {
      throw new Error("DatabaseService is required for Voice DB mode");
    }

    return this.database as RawDatabaseClient;
  }
}

const voiceRoomSelectColumns = Prisma.sql`
  id::text AS id,
  workspace_id::text AS "workspaceId",
  meeting_id::text AS "meetingId",
  livekit_room_name AS "livekitRoomName",
  status,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const voiceSessionSelectColumns = Prisma.sql`
  id::text AS id,
  voice_room_id::text AS "voiceRoomId",
  meeting_id::text AS "meetingId",
  member_id::text AS "memberId",
  recording_status AS "recordingStatus",
  started_at AS "startedAt",
  ended_at AS "endedAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

function requireSingleRow<T>(rows: T[], entityName: string): T {
  const row = rows[0];

  if (!row) {
    throw new Error(`${entityName} not found`);
  }

  return row;
}

function toVoiceRoomRecord(row: DbVoiceRoomRow): VoiceRoomRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    meetingId: row.meetingId,
    livekitRoomName: row.livekitRoomName,
    status: row.status as VoiceRoomStatus,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toVoiceSessionRecord(row: DbVoiceSessionRow): VoiceSessionRecord {
  return {
    id: row.id,
    voiceRoomId: row.voiceRoomId,
    meetingId: row.meetingId,
    memberId: row.memberId,
    recordingStatus: row.recordingStatus as VoiceSessionRecordingStatus,
    startedAt: toIsoStringOrNull(row.startedAt),
    endedAt: toIsoStringOrNull(row.endedAt),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toIsoStringOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIsoString(value);
}
