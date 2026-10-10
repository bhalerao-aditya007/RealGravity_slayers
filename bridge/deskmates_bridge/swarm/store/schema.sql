CREATE TABLE IF NOT EXISTS swarm_run (
  run_id TEXT PRIMARY KEY,
  mode TEXT,
  n INTEGER,
  privacy_mode TEXT,
  root_path TEXT,
  supervisor_policy TEXT,
  task_kind TEXT,
  state TEXT,
  started_at REAL,
  ended_at REAL,
  budget_json TEXT
);

CREATE TABLE IF NOT EXISTS swarm_agent (
  agent_id TEXT PRIMARY KEY,
  run_id TEXT,
  role TEXT,
  tier TEXT,
  model TEXT,
  family TEXT,
  cell_id TEXT,
  state TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  calls INTEGER DEFAULT 0,
  meta_json TEXT
);

CREATE TABLE IF NOT EXISTS swarm_cell (
  cell_id TEXT PRIMARY KEY,
  run_id TEXT,
  title TEXT,
  difficulty REAL,
  verifiable INTEGER,
  write_set_json TEXT,
  contract_json TEXT,
  state TEXT,
  token_cap INTEGER,
  token_used INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS swarm_msg (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  msg_id TEXT,
  run_id TEXT,
  ts REAL,
  from_agent TEXT,
  to_agent TEXT,
  topic TEXT,
  type TEXT,
  cell_id TEXT,
  round INTEGER,
  refs_json TEXT,
  payload_json TEXT,
  trust TEXT,
  tokens INTEGER
);

CREATE TABLE IF NOT EXISTS swarm_candidate (
  cand_id TEXT PRIMARY KEY,
  cell_id TEXT,
  agent_id TEXT,
  round INTEGER,
  patch TEXT,
  reason TEXT,
  linked_check TEXT,
  l0 INTEGER,
  l1 INTEGER,
  l2 INTEGER,
  cross_pass REAL,
  cluster_id TEXT,
  critic_score REAL,
  score REAL,
  status TEXT
);

CREATE TABLE IF NOT EXISTS swarm_fact (
  fact_id TEXT PRIMARY KEY,
  run_id TEXT,
  kind TEXT,
  text TEXT,
  evidence_json TEXT,
  author_family TEXT,
  confirmations_json TEXT,
  status TEXT,
  version INTEGER
);

CREATE TABLE IF NOT EXISTS swarm_directive (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT,
  type TEXT,
  args_json TEXT,
  rationale TEXT,
  validated INTEGER,
  executed INTEGER
);

CREATE TABLE IF NOT EXISTS egress_audit (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT,
  ts REAL,
  provider TEXT,
  model TEXT,
  key_id TEXT,
  bytes INTEGER,
  payload_sha256 TEXT,
  labels_json TEXT,
  redactions_json TEXT,
  consent_id TEXT
);

CREATE TABLE IF NOT EXISTS capacity_sample (
  ts REAL,
  provider TEXT,
  model TEXT,
  quota_group TEXT,
  rpm REAL,
  tpm REAL,
  rpd_left INTEGER,
  tpd_left INTEGER,
  p50_ms REAL,
  state TEXT
);

CREATE TABLE IF NOT EXISTS swarm_seat (
  seat_id TEXT PRIMARY KEY,
  run_id TEXT,
  seat_no INTEGER,
  persona TEXT,
  function_role TEXT,
  model TEXT,
  family TEXT,
  temperature REAL,
  color TEXT,
  ring INTEGER,
  angle REAL
);

CREATE TABLE IF NOT EXISTS swarm_phase (
  run_id TEXT,
  phase TEXT,
  state TEXT,
  calls_planned INTEGER,
  calls_done INTEGER DEFAULT 0,
  tokens_planned INTEGER,
  tokens_used INTEGER DEFAULT 0,
  quorum REAL,
  started_at REAL,
  ended_at REAL,
  PRIMARY KEY (run_id, phase)
);

CREATE TABLE IF NOT EXISTS swarm_proposal (
  proposal_id TEXT PRIMARY KEY,
  run_id TEXT,
  seat_id TEXT,
  title TEXT,
  body TEXT,
  assumptions_json TEXT,
  risks_json TEXT,
  confidence REAL,
  cluster_id TEXT,
  is_outlier INTEGER DEFAULT 0,
  rerolled INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS swarm_cluster (
  cluster_id TEXT PRIMARY KEY,
  run_id TEXT,
  name TEXT,
  summary TEXT,
  member_ids_json TEXT,
  family_coverage REAL,
  seat_share REAL,
  is_outlier_tray INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS swarm_critique (
  critique_id TEXT PRIMARY KEY,
  run_id TEXT,
  seat_id TEXT,
  cluster_id TEXT,
  objection TEXT,
  evidence TEXT,
  severity TEXT,
  fix TEXT,
  weight REAL,
  merged_into TEXT
);

CREATE TABLE IF NOT EXISTS swarm_vote (
  vote_id TEXT PRIMARY KEY,
  run_id TEXT,
  seat_id TEXT,
  ranking_json TEXT,
  confidence REAL,
  veto_cluster TEXT,
  veto_objection TEXT,
  cancelled INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS swarm_estimate (
  run_id TEXT PRIMARY KEY,
  n INTEGER,
  task_kind TEXT,
  calls_planned INTEGER,
  tokens_planned INTEGER,
  time_low_s INTEGER,
  time_high_s INTEGER,
  cooldown_pressure TEXT,
  profile_age_s INTEGER,
  calls_actual INTEGER DEFAULT 0,
  tokens_actual INTEGER DEFAULT 0,
  time_actual_s INTEGER DEFAULT 0
);
