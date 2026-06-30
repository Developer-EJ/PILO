import { Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DatabaseService } from "../../database/database.service";
import {
  CreateMeetingActionItemInput,
  CreateMeetingAgendaInput,
  CreateMeetingDecisionInput,
  CreateMeetingInput,
  CreateMeetingMemoInput,
  CreateMeetingParticipantInput,
  CreateMeetingReportInput,
  CreateMeetingReportNextAgendaInput,
  CreateMeetingReportRiskInput,
  CreateTranscriptSegmentInput,
  MeetingActionItemRecord,
  MeetingActionItemStatus,
  MeetingAgendaRecord,
  MeetingAgendaStatus,
  MeetingDecisionRecord,
  MeetingDecisionStatus,
  MeetingMemoRecord,
  MeetingParticipantRecord,
  MeetingRecord,
  MeetingReportNextAgendaRecord,
  MeetingReportRecord,
  MeetingReportRiskRecord,
  MeetingReportRiskSeverity,
  MeetingRepositoryMode,
  MeetingStatus,
  TranscriptSegmentRecord,
  TranscriptSource,
  UpdateMeetingActionItemInput,
  UpdateMeetingAgendaInput,
  UpdateMeetingInput,
} from "../types/meeting.types";
import { MockMeetingRepository } from "./meeting.mock-repository";
import { MeetingRepository } from "./meeting.repository";

type RawDatabaseClient = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<T>;
  $executeRaw(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<number>;
  $transaction?<T>(
    operation: (client: RawDatabaseClient) => Promise<T>,
  ): Promise<T>;
};

type DbMeetingRow = {
  id: string;
  workspaceId: string;
  canvasBoardId: string | null;
  title: string;
  purpose: string | null;
  status: string;
  startedAt: Date | string | null;
  endedAt: Date | string | null;
  createdByMemberId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DbMeetingParticipantRow = {
  id: string;
  meetingId: string;
  memberId: string;
  role: string | null;
  joinedAt: Date | string;
  leftAt: Date | string | null;
};

type DbMeetingAgendaRow = {
  id: string;
  meetingId: string;
  title: string;
  status: string;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DbMeetingMemoRow = {
  id: string;
  meetingId: string;
  authorMemberId: string | null;
  body: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DbTranscriptSegmentRow = {
  id: string;
  meetingId: string;
  speakerMemberId: string | null;
  source: string;
  body: string;
  startedAt: Date | string | null;
  endedAt: Date | string | null;
  createdAt: Date | string;
};

type DbMeetingReportRow = {
  id: string;
  meetingId: string;
  summary: string;
  createdByMemberId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DbMeetingDecisionRow = {
  id: string;
  reportId: string;
  content: string;
  status: string;
  linkedTaskId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DbMeetingReportRiskRow = {
  id: string;
  reportId: string;
  content: string;
  severity: string;
  sortOrder: number;
  createdAt: Date | string;
};

type DbMeetingReportNextAgendaRow = {
  id: string;
  reportId: string;
  title: string;
  sortOrder: number;
  createdAt: Date | string;
};

type DbMeetingActionItemRow = {
  id: string;
  reportId: string;
  title: string;
  description: string | null;
  assigneeSuggestionMemberId: string | null;
  dueDateSuggestion: Date | string | null;
  status: string;
  convertedTaskId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DbSortOrderRow = {
  sortOrder: number | null;
};

@Injectable()
export class RuntimeMeetingRepository implements MeetingRepository {
  private readonly memory = new MockMeetingRepository();

  constructor(@Optional() private readonly database?: DatabaseService) {
  }

  get mode(): MeetingRepositoryMode {
    return this.shouldUseDatabase ? "database" : "mock";
  }

  listMeetingStatusValues() {
    return this.memory.listMeetingStatusValues();
  }

  async createMeeting(
    input: CreateMeetingInput,
  ): Promise<MeetingRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.createMeeting(input);
    }

    const rows = await this.db.$queryRaw<DbMeetingRow[]>`
      INSERT INTO meetings (
        workspace_id,
        canvas_board_id,
        title,
        purpose,
        created_by_member_id
      )
      VALUES (
        ${input.workspaceId}::uuid,
        ${input.canvasBoardId ?? null}::uuid,
        ${input.title},
        ${input.purpose ?? null},
        (
          SELECT wm.id
          FROM workspace_members wm
          WHERE wm.id = ${input.createdByMemberId}::uuid
            AND wm.workspace_id = ${input.workspaceId}::uuid
          LIMIT 1
        )
      )
      RETURNING ${meetingSelectColumns}
    `;

    return toMeetingRecord(requireSingleRow(rows, "Meeting"));
  }

  async listMeetingsByWorkspace(
    workspaceId: string,
  ): Promise<MeetingRecord[]> {
    if (!this.shouldUseDatabase) {
      return this.memory.listMeetingsByWorkspace(workspaceId);
    }

    const rows = await this.db.$queryRaw<DbMeetingRow[]>`
      SELECT ${meetingSelectColumns}
      FROM meetings
      WHERE workspace_id = ${workspaceId}::uuid
      ORDER BY created_at ASC, id ASC
    `;

    return rows.map(toMeetingRecord);
  }

  async findMeetingById(
    meetingId: string,
  ): Promise<MeetingRecord | null> {
    if (!this.shouldUseDatabase) {
      return this.memory.findMeetingById(meetingId);
    }

    return this.findDbMeetingById(this.db, meetingId);
  }

  async updateMeeting(
    meetingId: string,
    input: UpdateMeetingInput,
  ): Promise<MeetingRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.updateMeeting(meetingId, input);
    }

    const keepStartedAt = input.startedAt === undefined;
    const startedAt = input.startedAt ?? null;
    const keepEndedAt = input.endedAt === undefined;
    const endedAt = input.endedAt ?? null;
    const rows = await this.db.$queryRaw<DbMeetingRow[]>`
      UPDATE meetings
      SET
        status = ${input.status},
        started_at = CASE
          WHEN ${keepStartedAt} THEN started_at
          ELSE ${startedAt}::timestamptz
        END,
        ended_at = CASE
          WHEN ${keepEndedAt} THEN ended_at
          ELSE ${endedAt}::timestamptz
        END,
        updated_at = ${input.updatedAt}::timestamptz
      WHERE id = ${meetingId}::uuid
      RETURNING ${meetingSelectColumns}
    `;

    return toMeetingRecord(requireSingleRow(rows, "Meeting"));
  }

  async addParticipant(
    input: CreateMeetingParticipantInput,
  ): Promise<MeetingParticipantRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.addParticipant(input);
    }

    const rows = await this.db.$queryRaw<DbMeetingParticipantRow[]>`
      INSERT INTO meeting_participants (meeting_id, member_id, role)
      VALUES (
        ${input.meetingId}::uuid,
        ${input.memberId}::uuid,
        ${input.role ?? null}
      )
      RETURNING ${participantSelectColumns}
    `;

    return toParticipantRecord(requireSingleRow(rows, "Meeting participant"));
  }

  async listParticipantsByMeeting(
    meetingId: string,
  ): Promise<MeetingParticipantRecord[]> {
    if (!this.shouldUseDatabase) {
      return this.memory.listParticipantsByMeeting(meetingId);
    }

    const rows = await this.db.$queryRaw<DbMeetingParticipantRow[]>`
      SELECT ${participantSelectColumns}
      FROM meeting_participants
      WHERE meeting_id = ${meetingId}::uuid
      ORDER BY joined_at ASC, id ASC
    `;

    return rows.map(toParticipantRecord);
  }

  async findParticipantById(
    participantId: string,
  ): Promise<MeetingParticipantRecord | null> {
    if (!this.shouldUseDatabase) {
      return this.memory.findParticipantById(participantId);
    }

    const rows = await this.db.$queryRaw<DbMeetingParticipantRow[]>`
      SELECT ${participantSelectColumns}
      FROM meeting_participants
      WHERE id = ${participantId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toParticipantRecord(rows[0]) : null;
  }

  async leaveParticipant(
    participantId: string,
    leftAt: string,
  ): Promise<MeetingParticipantRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.leaveParticipant(participantId, leftAt);
    }

    const rows = await this.db.$queryRaw<DbMeetingParticipantRow[]>`
      UPDATE meeting_participants
      SET left_at = COALESCE(left_at, ${leftAt}::timestamptz)
      WHERE id = ${participantId}::uuid
      RETURNING ${participantSelectColumns}
    `;

    return toParticipantRecord(requireSingleRow(rows, "Meeting participant"));
  }

  async createAgenda(
    input: CreateMeetingAgendaInput,
  ): Promise<MeetingAgendaRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.createAgenda(input);
    }

    return this.withDatabaseTransaction(async (database) => {
      const sortOrder =
        input.sortOrder ?? (await this.nextDbAgendaSortOrder(database, input.meetingId));
      const rows = await database.$queryRaw<DbMeetingAgendaRow[]>`
        INSERT INTO meeting_agendas (meeting_id, title, sort_order)
        VALUES (
          ${input.meetingId}::uuid,
          ${input.title},
          ${sortOrder}
        )
        RETURNING ${agendaSelectColumns}
      `;

      return toAgendaRecord(requireSingleRow(rows, "Meeting agenda"));
    });
  }

  async listAgendasByMeeting(
    meetingId: string,
  ): Promise<MeetingAgendaRecord[]> {
    if (!this.shouldUseDatabase) {
      return this.memory.listAgendasByMeeting(meetingId);
    }

    const rows = await this.db.$queryRaw<DbMeetingAgendaRow[]>`
      SELECT ${agendaSelectColumns}
      FROM meeting_agendas
      WHERE meeting_id = ${meetingId}::uuid
      ORDER BY sort_order ASC, created_at ASC, id ASC
    `;

    return rows.map(toAgendaRecord);
  }

  async findAgendaById(
    agendaId: string,
  ): Promise<MeetingAgendaRecord | null> {
    if (!this.shouldUseDatabase) {
      return this.memory.findAgendaById(agendaId);
    }

    return this.findDbAgendaById(this.db, agendaId);
  }

  async updateAgenda(
    agendaId: string,
    input: UpdateMeetingAgendaInput,
  ): Promise<MeetingAgendaRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.updateAgenda(agendaId, input);
    }

    return this.withDatabaseTransaction(async (database) => {
      const agenda = await this.findDbAgendaById(database, agendaId);

      if (!agenda) {
        throw new Error(`Meeting agenda not found: ${agendaId}`);
      }

      const nextStatus = input.status ?? agenda.status;
      const nextSortOrder = input.sortOrder ?? agenda.sortOrder;

      if (nextSortOrder !== agenda.sortOrder) {
        await database.$executeRaw`
          UPDATE meeting_agendas
          SET sort_order = -1, updated_at = ${input.updatedAt}::timestamptz
          WHERE id = ${agendaId}::uuid
        `;
        await database.$executeRaw`
          UPDATE meeting_agendas
          SET sort_order = ${agenda.sortOrder}, updated_at = ${input.updatedAt}::timestamptz
          WHERE meeting_id = ${agenda.meetingId}::uuid
            AND sort_order = ${nextSortOrder}
            AND id <> ${agendaId}::uuid
        `;
      }

      const rows = await database.$queryRaw<DbMeetingAgendaRow[]>`
        UPDATE meeting_agendas
        SET
          status = ${nextStatus},
          sort_order = ${nextSortOrder},
          updated_at = ${input.updatedAt}::timestamptz
        WHERE id = ${agendaId}::uuid
        RETURNING ${agendaSelectColumns}
      `;

      return toAgendaRecord(requireSingleRow(rows, "Meeting agenda"));
    });
  }

  async createMemo(
    input: CreateMeetingMemoInput,
  ): Promise<MeetingMemoRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.createMemo(input);
    }

    const rows = await this.db.$queryRaw<DbMeetingMemoRow[]>`
      INSERT INTO meeting_memos (meeting_id, author_member_id, body)
      VALUES (
        ${input.meetingId}::uuid,
        (
          SELECT wm.id
          FROM workspace_members wm
          JOIN meetings m ON m.workspace_id = wm.workspace_id
          WHERE wm.id = ${input.authorMemberId ?? null}::uuid
            AND m.id = ${input.meetingId}::uuid
          LIMIT 1
        ),
        ${input.body}
      )
      RETURNING ${memoSelectColumns}
    `;

    return toMemoRecord(requireSingleRow(rows, "Meeting memo"));
  }

  async listMemosByMeeting(
    meetingId: string,
  ): Promise<MeetingMemoRecord[]> {
    if (!this.shouldUseDatabase) {
      return this.memory.listMemosByMeeting(meetingId);
    }

    const rows = await this.db.$queryRaw<DbMeetingMemoRow[]>`
      SELECT ${memoSelectColumns}
      FROM meeting_memos
      WHERE meeting_id = ${meetingId}::uuid
      ORDER BY created_at ASC, id ASC
    `;

    return rows.map(toMemoRecord);
  }

  async createTranscriptSegment(
    input: CreateTranscriptSegmentInput,
  ): Promise<TranscriptSegmentRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.createTranscriptSegment(input);
    }

    const rows = await this.db.$queryRaw<DbTranscriptSegmentRow[]>`
      INSERT INTO transcript_segments (
        meeting_id,
        speaker_member_id,
        source,
        body,
        started_at,
        ended_at
      )
      VALUES (
        ${input.meetingId}::uuid,
        (
          SELECT wm.id
          FROM workspace_members wm
          JOIN meetings m ON m.workspace_id = wm.workspace_id
          WHERE wm.id = ${input.speakerMemberId ?? null}::uuid
            AND m.id = ${input.meetingId}::uuid
          LIMIT 1
        ),
        ${input.source},
        ${input.body},
        ${input.startedAt ?? null}::timestamptz,
        ${input.endedAt ?? null}::timestamptz
      )
      RETURNING ${transcriptSegmentSelectColumns}
    `;

    return toTranscriptSegmentRecord(
      requireSingleRow(rows, "Transcript segment"),
    );
  }

  async listTranscriptSegmentsByMeeting(
    meetingId: string,
  ): Promise<TranscriptSegmentRecord[]> {
    if (!this.shouldUseDatabase) {
      return this.memory.listTranscriptSegmentsByMeeting(meetingId);
    }

    const rows = await this.db.$queryRaw<DbTranscriptSegmentRow[]>`
      SELECT ${transcriptSegmentSelectColumns}
      FROM transcript_segments
      WHERE meeting_id = ${meetingId}::uuid
      ORDER BY created_at ASC, id ASC
    `;

    return rows.map(toTranscriptSegmentRecord);
  }

  async createReport(
    input: CreateMeetingReportInput,
  ): Promise<MeetingReportRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.createReport(input);
    }

    const rows = await this.db.$queryRaw<DbMeetingReportRow[]>`
      INSERT INTO meeting_reports (meeting_id, summary, created_by_member_id)
      VALUES (
        ${input.meetingId}::uuid,
        ${input.summary},
        (
          SELECT wm.id
          FROM workspace_members wm
          JOIN meetings m ON m.workspace_id = wm.workspace_id
          WHERE wm.id = ${input.createdByMemberId ?? null}::uuid
            AND m.id = ${input.meetingId}::uuid
          LIMIT 1
        )
      )
      ON CONFLICT (meeting_id) DO NOTHING
      RETURNING ${reportSelectColumns}
    `;

    if (rows[0]) {
      return toReportRecord(rows[0]);
    }

    const existingReport = await this.findDbReportByMeetingId(
      this.db,
      input.meetingId,
    );

    if (!existingReport) {
      throw new Error(`Meeting report not found for meeting: ${input.meetingId}`);
    }

    return existingReport;
  }

  async findReportById(
    reportId: string,
  ): Promise<MeetingReportRecord | null> {
    if (!this.shouldUseDatabase) {
      return this.memory.findReportById(reportId);
    }

    const rows = await this.db.$queryRaw<DbMeetingReportRow[]>`
      SELECT ${reportSelectColumns}
      FROM meeting_reports
      WHERE id = ${reportId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toReportRecord(rows[0]) : null;
  }

  async findReportByMeetingId(
    meetingId: string,
  ): Promise<MeetingReportRecord | null> {
    if (!this.shouldUseDatabase) {
      return this.memory.findReportByMeetingId(meetingId);
    }

    return this.findDbReportByMeetingId(this.db, meetingId);
  }

  async listReports(): Promise<MeetingReportRecord[]> {
    if (!this.shouldUseDatabase) {
      return this.memory.listReports();
    }

    const rows = await this.db.$queryRaw<DbMeetingReportRow[]>`
      SELECT ${reportSelectColumns}
      FROM meeting_reports
      ORDER BY created_at DESC, id ASC
    `;

    return rows.map(toReportRecord);
  }

  async createDecision(
    input: CreateMeetingDecisionInput,
  ): Promise<MeetingDecisionRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.createDecision(input);
    }

    const rows = await this.db.$queryRaw<DbMeetingDecisionRow[]>`
      INSERT INTO meeting_decisions (
        report_id,
        content,
        status,
        linked_task_id
      )
      VALUES (
        ${input.reportId}::uuid,
        ${input.content},
        ${input.status ?? "decided"},
        ${input.linkedTaskId ?? null}::uuid
      )
      RETURNING ${decisionSelectColumns}
    `;

    return toDecisionRecord(requireSingleRow(rows, "Meeting decision"));
  }

  async listDecisionsByReport(
    reportId: string,
  ): Promise<MeetingDecisionRecord[]> {
    if (!this.shouldUseDatabase) {
      return this.memory.listDecisionsByReport(reportId);
    }

    const rows = await this.db.$queryRaw<DbMeetingDecisionRow[]>`
      SELECT ${decisionSelectColumns}
      FROM meeting_decisions
      WHERE report_id = ${reportId}::uuid
      ORDER BY created_at ASC, id ASC
    `;

    return rows.map(toDecisionRecord);
  }

  async createRisk(
    input: CreateMeetingReportRiskInput,
  ): Promise<MeetingReportRiskRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.createRisk(input);
    }

    return this.withDatabaseTransaction(async (database) => {
      const sortOrder =
        input.sortOrder ?? (await this.nextDbRiskSortOrder(database, input.reportId));
      const rows = await database.$queryRaw<DbMeetingReportRiskRow[]>`
        INSERT INTO meeting_report_risks (
          report_id,
          content,
          severity,
          sort_order
        )
        VALUES (
          ${input.reportId}::uuid,
          ${input.content},
          ${input.severity ?? "medium"},
          ${sortOrder}
        )
        RETURNING ${riskSelectColumns}
      `;

      return toRiskRecord(requireSingleRow(rows, "Meeting report risk"));
    });
  }

  async listRisksByReport(
    reportId: string,
  ): Promise<MeetingReportRiskRecord[]> {
    if (!this.shouldUseDatabase) {
      return this.memory.listRisksByReport(reportId);
    }

    const rows = await this.db.$queryRaw<DbMeetingReportRiskRow[]>`
      SELECT ${riskSelectColumns}
      FROM meeting_report_risks
      WHERE report_id = ${reportId}::uuid
      ORDER BY sort_order ASC, created_at ASC, id ASC
    `;

    return rows.map(toRiskRecord);
  }

  async createNextAgenda(
    input: CreateMeetingReportNextAgendaInput,
  ): Promise<MeetingReportNextAgendaRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.createNextAgenda(input);
    }

    return this.withDatabaseTransaction(async (database) => {
      const sortOrder =
        input.sortOrder ??
        (await this.nextDbNextAgendaSortOrder(database, input.reportId));
      const rows = await database.$queryRaw<DbMeetingReportNextAgendaRow[]>`
        INSERT INTO meeting_report_next_agendas (report_id, title, sort_order)
        VALUES (
          ${input.reportId}::uuid,
          ${input.title},
          ${sortOrder}
        )
        RETURNING ${nextAgendaSelectColumns}
      `;

      return toNextAgendaRecord(
        requireSingleRow(rows, "Meeting report next agenda"),
      );
    });
  }

  async listNextAgendasByReport(
    reportId: string,
  ): Promise<MeetingReportNextAgendaRecord[]> {
    if (!this.shouldUseDatabase) {
      return this.memory.listNextAgendasByReport(reportId);
    }

    const rows = await this.db.$queryRaw<DbMeetingReportNextAgendaRow[]>`
      SELECT ${nextAgendaSelectColumns}
      FROM meeting_report_next_agendas
      WHERE report_id = ${reportId}::uuid
      ORDER BY sort_order ASC, created_at ASC, id ASC
    `;

    return rows.map(toNextAgendaRecord);
  }

  async createActionItem(
    input: CreateMeetingActionItemInput,
  ): Promise<MeetingActionItemRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.createActionItem(input);
    }

    const rows = await this.db.$queryRaw<DbMeetingActionItemRow[]>`
      INSERT INTO meeting_action_items (
        report_id,
        title,
        description,
        assignee_suggestion_member_id,
        due_date_suggestion
      )
      VALUES (
        ${input.reportId}::uuid,
        ${input.title},
        ${input.description ?? null},
        (
          SELECT wm.id
          FROM workspace_members wm
          JOIN meetings m ON m.workspace_id = wm.workspace_id
          JOIN meeting_reports r ON r.meeting_id = m.id
          WHERE wm.id = ${input.assigneeSuggestionMemberId ?? null}::uuid
            AND r.id = ${input.reportId}::uuid
          LIMIT 1
        ),
        ${input.dueDateSuggestion ?? null}::date
      )
      RETURNING ${actionItemSelectColumns}
    `;

    return toActionItemRecord(requireSingleRow(rows, "Meeting action item"));
  }

  async listActionItemsByReport(
    reportId: string,
  ): Promise<MeetingActionItemRecord[]> {
    if (!this.shouldUseDatabase) {
      return this.memory.listActionItemsByReport(reportId);
    }

    const rows = await this.db.$queryRaw<DbMeetingActionItemRow[]>`
      SELECT ${actionItemSelectColumns}
      FROM meeting_action_items
      WHERE report_id = ${reportId}::uuid
      ORDER BY created_at ASC, id ASC
    `;

    return rows.map(toActionItemRecord);
  }

  async findActionItemById(
    actionItemId: string,
  ): Promise<MeetingActionItemRecord | null> {
    if (!this.shouldUseDatabase) {
      return this.memory.findActionItemById(actionItemId);
    }

    const rows = await this.db.$queryRaw<DbMeetingActionItemRow[]>`
      SELECT ${actionItemSelectColumns}
      FROM meeting_action_items
      WHERE id = ${actionItemId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toActionItemRecord(rows[0]) : null;
  }

  async updateActionItem(
    actionItemId: string,
    input: UpdateMeetingActionItemInput,
  ): Promise<MeetingActionItemRecord> {
    if (!this.shouldUseDatabase) {
      return this.memory.updateActionItem(actionItemId, input);
    }

    const keepConvertedTaskId = input.convertedTaskId === undefined;
    const convertedTaskId = input.convertedTaskId ?? null;
    const rows = await this.db.$queryRaw<DbMeetingActionItemRow[]>`
      UPDATE meeting_action_items
      SET
        status = ${input.status},
        converted_task_id = CASE
          WHEN ${keepConvertedTaskId} THEN converted_task_id
          ELSE ${convertedTaskId}::uuid
        END,
        updated_at = ${input.updatedAt}::timestamptz
      WHERE id = ${actionItemId}::uuid
      RETURNING ${actionItemSelectColumns}
    `;

    return toActionItemRecord(requireSingleRow(rows, "Meeting action item"));
  }

  private get shouldUseDatabase() {
    return Boolean(
      this.database && process.env.PILO_SKIP_DATABASE_CONNECT !== "true",
    );
  }

  private get db(): RawDatabaseClient {
    if (!this.database) {
      throw new Error("DatabaseService is required for Meeting DB mode");
    }

    return this.database as RawDatabaseClient;
  }

  private async withDatabaseTransaction<T>(
    operation: (client: RawDatabaseClient) => Promise<T>,
  ): Promise<T> {
    const db = this.db;

    if (db.$transaction) {
      return db.$transaction((client) => operation(client));
    }

    return operation(db);
  }

  private async findDbMeetingById(
    database: RawDatabaseClient,
    meetingId: string,
  ): Promise<MeetingRecord | null> {
    const rows = await database.$queryRaw<DbMeetingRow[]>`
      SELECT ${meetingSelectColumns}
      FROM meetings
      WHERE id = ${meetingId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toMeetingRecord(rows[0]) : null;
  }

  private async findDbAgendaById(
    database: RawDatabaseClient,
    agendaId: string,
  ): Promise<MeetingAgendaRecord | null> {
    const rows = await database.$queryRaw<DbMeetingAgendaRow[]>`
      SELECT ${agendaSelectColumns}
      FROM meeting_agendas
      WHERE id = ${agendaId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toAgendaRecord(rows[0]) : null;
  }

  private async findDbReportByMeetingId(
    database: RawDatabaseClient,
    meetingId: string,
  ): Promise<MeetingReportRecord | null> {
    const rows = await database.$queryRaw<DbMeetingReportRow[]>`
      SELECT ${reportSelectColumns}
      FROM meeting_reports
      WHERE meeting_id = ${meetingId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toReportRecord(rows[0]) : null;
  }

  private async nextDbAgendaSortOrder(
    database: RawDatabaseClient,
    meetingId: string,
  ) {
    const rows = await database.$queryRaw<DbSortOrderRow[]>`
      SELECT COALESCE(MAX(sort_order) + 1, 0)::integer AS "sortOrder"
      FROM meeting_agendas
      WHERE meeting_id = ${meetingId}::uuid
    `;

    return rows[0]?.sortOrder ?? 0;
  }

  private async nextDbRiskSortOrder(
    database: RawDatabaseClient,
    reportId: string,
  ) {
    const rows = await database.$queryRaw<DbSortOrderRow[]>`
      SELECT COALESCE(MAX(sort_order) + 1, 0)::integer AS "sortOrder"
      FROM meeting_report_risks
      WHERE report_id = ${reportId}::uuid
    `;

    return rows[0]?.sortOrder ?? 0;
  }

  private async nextDbNextAgendaSortOrder(
    database: RawDatabaseClient,
    reportId: string,
  ) {
    const rows = await database.$queryRaw<DbSortOrderRow[]>`
      SELECT COALESCE(MAX(sort_order) + 1, 0)::integer AS "sortOrder"
      FROM meeting_report_next_agendas
      WHERE report_id = ${reportId}::uuid
    `;

    return rows[0]?.sortOrder ?? 0;
  }
}

const meetingSelectColumns = Prisma.sql`
  id::text AS id,
  workspace_id::text AS "workspaceId",
  canvas_board_id::text AS "canvasBoardId",
  title,
  purpose,
  status,
  started_at AS "startedAt",
  ended_at AS "endedAt",
  created_by_member_id::text AS "createdByMemberId",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const participantSelectColumns = Prisma.sql`
  id::text AS id,
  meeting_id::text AS "meetingId",
  member_id::text AS "memberId",
  role,
  joined_at AS "joinedAt",
  left_at AS "leftAt"
`;

const agendaSelectColumns = Prisma.sql`
  id::text AS id,
  meeting_id::text AS "meetingId",
  title,
  status,
  sort_order AS "sortOrder",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const memoSelectColumns = Prisma.sql`
  id::text AS id,
  meeting_id::text AS "meetingId",
  author_member_id::text AS "authorMemberId",
  body,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const transcriptSegmentSelectColumns = Prisma.sql`
  id::text AS id,
  meeting_id::text AS "meetingId",
  speaker_member_id::text AS "speakerMemberId",
  source,
  body,
  started_at AS "startedAt",
  ended_at AS "endedAt",
  created_at AS "createdAt"
`;

const reportSelectColumns = Prisma.sql`
  id::text AS id,
  meeting_id::text AS "meetingId",
  summary,
  created_by_member_id::text AS "createdByMemberId",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const decisionSelectColumns = Prisma.sql`
  id::text AS id,
  report_id::text AS "reportId",
  content,
  status,
  linked_task_id::text AS "linkedTaskId",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const riskSelectColumns = Prisma.sql`
  id::text AS id,
  report_id::text AS "reportId",
  content,
  severity,
  sort_order AS "sortOrder",
  created_at AS "createdAt"
`;

const nextAgendaSelectColumns = Prisma.sql`
  id::text AS id,
  report_id::text AS "reportId",
  title,
  sort_order AS "sortOrder",
  created_at AS "createdAt"
`;

const actionItemSelectColumns = Prisma.sql`
  id::text AS id,
  report_id::text AS "reportId",
  title,
  description,
  assignee_suggestion_member_id::text AS "assigneeSuggestionMemberId",
  due_date_suggestion AS "dueDateSuggestion",
  status,
  converted_task_id::text AS "convertedTaskId",
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

function toMeetingRecord(row: DbMeetingRow): MeetingRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    canvasBoardId: row.canvasBoardId,
    title: row.title,
    purpose: row.purpose,
    status: row.status as MeetingStatus,
    startedAt: toIsoStringOrNull(row.startedAt),
    endedAt: toIsoStringOrNull(row.endedAt),
    createdByMemberId: row.createdByMemberId,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toParticipantRecord(
  row: DbMeetingParticipantRow,
): MeetingParticipantRecord {
  return {
    id: row.id,
    meetingId: row.meetingId,
    memberId: row.memberId,
    role: row.role,
    joinedAt: toIsoString(row.joinedAt),
    leftAt: toIsoStringOrNull(row.leftAt),
  };
}

function toAgendaRecord(row: DbMeetingAgendaRow): MeetingAgendaRecord {
  return {
    id: row.id,
    meetingId: row.meetingId,
    title: row.title,
    status: row.status as MeetingAgendaStatus,
    sortOrder: Number(row.sortOrder),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toMemoRecord(row: DbMeetingMemoRow): MeetingMemoRecord {
  return {
    id: row.id,
    meetingId: row.meetingId,
    authorMemberId: row.authorMemberId,
    body: row.body,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toTranscriptSegmentRecord(
  row: DbTranscriptSegmentRow,
): TranscriptSegmentRecord {
  return {
    id: row.id,
    meetingId: row.meetingId,
    speakerMemberId: row.speakerMemberId,
    source: row.source as TranscriptSource,
    body: row.body,
    startedAt: toIsoStringOrNull(row.startedAt),
    endedAt: toIsoStringOrNull(row.endedAt),
    createdAt: toIsoString(row.createdAt),
  };
}

function toReportRecord(row: DbMeetingReportRow): MeetingReportRecord {
  return {
    id: row.id,
    meetingId: row.meetingId,
    summary: row.summary,
    createdByMemberId: row.createdByMemberId,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toDecisionRecord(row: DbMeetingDecisionRow): MeetingDecisionRecord {
  return {
    id: row.id,
    reportId: row.reportId,
    content: row.content,
    status: row.status as MeetingDecisionStatus,
    linkedTaskId: row.linkedTaskId,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toRiskRecord(row: DbMeetingReportRiskRow): MeetingReportRiskRecord {
  return {
    id: row.id,
    reportId: row.reportId,
    content: row.content,
    severity: row.severity as MeetingReportRiskSeverity,
    sortOrder: Number(row.sortOrder),
    createdAt: toIsoString(row.createdAt),
  };
}

function toNextAgendaRecord(
  row: DbMeetingReportNextAgendaRow,
): MeetingReportNextAgendaRecord {
  return {
    id: row.id,
    reportId: row.reportId,
    title: row.title,
    sortOrder: Number(row.sortOrder),
    createdAt: toIsoString(row.createdAt),
  };
}

function toActionItemRecord(
  row: DbMeetingActionItemRow,
): MeetingActionItemRecord {
  return {
    id: row.id,
    reportId: row.reportId,
    title: row.title,
    description: row.description,
    assigneeSuggestionMemberId: row.assigneeSuggestionMemberId,
    dueDateSuggestion: toDateOnlyOrNull(row.dueDateSuggestion),
    status: row.status as MeetingActionItemStatus,
    convertedTaskId: row.convertedTaskId,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoStringOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIsoString(value);
}

function toDateOnlyOrNull(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
}
