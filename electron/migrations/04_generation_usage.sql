CREATE TABLE generation_usage (
  request_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subject_id TEXT,
  price_basis_json TEXT,
  kind TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  settings_json TEXT NOT NULL,
  estimated_min_microusd INTEGER,
  estimated_max_microusd INTEGER,
  price_source TEXT,
  price_checked_at TEXT,
  reported_microusd INTEGER,
  provider_request_id TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX generation_usage_project_date ON generation_usage(project_id, started_at);
