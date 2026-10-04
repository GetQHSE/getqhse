CREATE TABLE planning_states (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 module TEXT NOT NULL CHECK (module IN ('policy','processes')), revision INTEGER NOT NULL DEFAULT 0 CHECK (revision>=0), document JSONB NOT NULL, fingerprint TEXT NOT NULL, updated_at TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX planning_states_project_id_module_key ON planning_states(project_id,module);
CREATE TABLE planning_versions (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('policy','objectives','processes')), version INTEGER NOT NULL CHECK(version>0), document JSONB NOT NULL, sources JSONB NOT NULL, fingerprint TEXT NOT NULL, author_id TEXT NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX planning_versions_project_id_kind_version_key ON planning_versions(project_id,kind,version);
CREATE TABLE planning_runs (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 module TEXT NOT NULL CHECK (module IN ('policy','processes')), stage TEXT NOT NULL CHECK (stage IN ('axes','statement','objectives','processes','interactions')), revision INTEGER NOT NULL,
 fingerprint TEXT NOT NULL, input_snapshot JSONB NOT NULL, output_snapshot JSONB,
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','RUNNING','COMPLETED','FAILED')), model TEXT, error TEXT, applied_at TIMESTAMP(3), completed_at TIMESTAMP(3), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((module='policy' AND stage IN ('axes','statement','objectives')) OR (module='processes' AND stage IN ('processes','interactions')))
);
CREATE INDEX planning_runs_project_id_module_created_at_idx ON planning_runs(project_id,module,created_at);
CREATE UNIQUE INDEX planning_one_active_run ON planning_runs(project_id,module) WHERE status IN ('DRAFT','RUNNING');
CREATE TABLE planning_corrections (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 module TEXT NOT NULL, kind TEXT NOT NULL, author_id TEXT NOT NULL, previous JSONB NOT NULL, next JSONB NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX planning_corrections_project_id_module_created_at_idx ON planning_corrections(project_id,module,created_at);
CREATE TRIGGER planning_version_immutable BEFORE UPDATE ON planning_versions FOR EACH ROW EXECUTE FUNCTION scope_preserve_audit();
CREATE TRIGGER planning_correction_immutable BEFORE UPDATE ON planning_corrections FOR EACH ROW EXECUTE FUNCTION scope_preserve_audit();
CREATE TRIGGER planning_run_snapshot_immutable BEFORE UPDATE ON planning_runs FOR EACH ROW EXECUTE FUNCTION pip_preserve_run_snapshot();
