-- The agent budget is gone: generation no longer needs a grant or a quote.
DELETE FROM settings WHERE key = 'agent_budget_grant';

CREATE TABLE agent_generation_jobs_next (
  request_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  project_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  usage_request_id TEXT NOT NULL UNIQUE,
  model_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  estimate_json TEXT,
  reported_microusd INTEGER,
  provider_called INTEGER,
  status TEXT NOT NULL DEFAULT 'accepted',
  result_json TEXT,
  error TEXT,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Earlier jobs were submitted from quotes, so no request fingerprint can match them and their request IDs stay used.
-- Their estimates remain in the usage ledger.
INSERT INTO agent_generation_jobs_next (
  request_id, job_id, request_fingerprint, project_id, subject_id, usage_request_id, model_id, kind,
  estimate_json, reported_microusd, provider_called, status, result_json, error, warnings_json, created_at, updated_at
)
SELECT
  request_id, job_id, 'quote:' || quote_id, project_id, subject_id, usage_request_id, model_id, kind,
  NULL, reported_microusd, provider_called, status, result_json, error, warnings_json, created_at, updated_at
FROM agent_generation_jobs;
DROP TABLE agent_generation_jobs;
ALTER TABLE agent_generation_jobs_next RENAME TO agent_generation_jobs;
CREATE INDEX agent_generation_jobs_project ON agent_generation_jobs(project_id, created_at);
