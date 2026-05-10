-- Phase: persistent Contract Intelligence reports.
--
-- Each /api/contract-intelligence/run that resolves to a verified
-- Sourcify address writes one row here. The web app reads the table
-- via GET /api/contract-intelligence/runs (newest first) and renders
-- a clickable list so reports survive a page refresh.

CREATE TABLE IF NOT EXISTS contract_intel_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  kind TEXT NOT NULL,
  sourcify_match TEXT NOT NULL,
  report TEXT NOT NULL,
  llm TEXT NOT NULL,
  model TEXT,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS contract_intel_runs_ts ON contract_intel_runs(ts DESC);
CREATE INDEX IF NOT EXISTS contract_intel_runs_address ON contract_intel_runs(address);
