-- Office tasks & executions — autonomous agent orchestration

-- Enums
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE execution_status AS ENUM ('running', 'pending_approval', 'approved', 'rejected', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tasks
CREATE TABLE IF NOT EXISTS office.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'single',
  title TEXT NOT NULL,
  agents JSONB NOT NULL,
  prompt TEXT NOT NULL,
  cron_expression TEXT,
  recipients JSONB,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  status task_status NOT NULL DEFAULT 'active',
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_status_idx ON office.tasks (status);
CREATE INDEX IF NOT EXISTS tasks_next_run_idx ON office.tasks (next_run);

-- Executions
CREATE TABLE IF NOT EXISTS office.executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES office.tasks(id) ON DELETE CASCADE,
  status execution_status NOT NULL DEFAULT 'running',
  output JSONB,
  agent_logs JSONB,
  agents_used JSONB,
  duration_ms INTEGER,
  approved_by TEXT REFERENCES "user"(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS executions_task_idx ON office.executions (task_id);
CREATE INDEX IF NOT EXISTS executions_status_idx ON office.executions (status);
