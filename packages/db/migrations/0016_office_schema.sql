-- Office schema — internal chat with AI agents for super admins

CREATE SCHEMA IF NOT EXISTS office;

-- Enum for message roles
DO $$ BEGIN
  CREATE TYPE conversation_role AS ENUM ('user', 'agent', 'system', 'tool');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Conversations (map to Anthropic Managed Agents sessions)
CREATE TABLE office.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id),
  agent_id TEXT NOT NULL,
  session_id TEXT,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX conversations_user_idx ON office.conversations (user_id);

-- Messages (local cache of agent conversation history)
CREATE TABLE office.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES office.conversations(id) ON DELETE CASCADE,
  role conversation_role NOT NULL,
  agent_id TEXT,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_idx ON office.messages (conversation_id, created_at);
