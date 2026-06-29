-- MVP DB rebaseline: align the SQL bootstrap with the Prisma-backed TaskDraft model.
-- This migration is idempotent so it can be applied to an existing local dev DB.

CREATE TABLE IF NOT EXISTS task_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_type VARCHAR(80),
  source_id UUID,
  title VARCHAR(240) NOT NULL,
  description TEXT,
  assignee_member_id UUID,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_by_member_id UUID,
  approved_by_member_id UUID,
  rejected_by_member_id UUID,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_drafts_status_check CHECK (status IN ('draft', 'approved', 'rejected')),
  CONSTRAINT task_drafts_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT task_drafts_assignee_member_fk FOREIGN KEY (workspace_id, assignee_member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE SET NULL,
  CONSTRAINT task_drafts_created_by_member_fk FOREIGN KEY (workspace_id, created_by_member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE SET NULL,
  CONSTRAINT task_drafts_approved_by_member_fk FOREIGN KEY (workspace_id, approved_by_member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE SET NULL,
  CONSTRAINT task_drafts_rejected_by_member_fk FOREIGN KEY (workspace_id, rejected_by_member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE SET NULL,
  UNIQUE (workspace_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_task_drafts_workspace_status ON task_drafts(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_task_drafts_task_id ON task_drafts(task_id);
