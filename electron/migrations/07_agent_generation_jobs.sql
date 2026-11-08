CREATE TABLE agent_generation_jobs (
  request_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  quote_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  usage_request_id TEXT NOT NULL UNIQUE,
  model_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  reserved_microusd INTEGER NOT NULL,
  reported_microusd INTEGER,
  provider_called INTEGER,
  status TEXT NOT NULL DEFAULT 'accepted',
  result_json TEXT,
  error TEXT,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX agent_generation_jobs_grant ON agent_generation_jobs(grant_id);
CREATE INDEX agent_generation_jobs_project ON agent_generation_jobs(project_id, created_at);
