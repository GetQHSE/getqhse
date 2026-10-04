CREATE TABLE process_sheets (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 process_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),content JSONB NOT NULL, source_snapshot JSONB NOT NULL, fingerprint TEXT NOT NULL, updated_at TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX process_sheets_project_id_process_id_key ON process_sheets(project_id,process_id);
CREATE TABLE process_sheet_versions (
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,sheet_id TEXT NOT NULL REFERENCES process_sheets(id) ON DELETE CASCADE,
 process_id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),content JSONB NOT NULL,source_snapshot JSONB NOT NULL,fingerprint TEXT NOT NULL,validated_by_id TEXT NOT NULL,validated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX process_sheet_versions_sheet_id_version_key ON process_sheet_versions(sheet_id,version);
CREATE INDEX process_sheet_versions_project_id_validated_at_idx ON process_sheet_versions(project_id,validated_at);
CREATE TABLE process_sheet_runs (
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,sheet_id TEXT NOT NULL REFERENCES process_sheets(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL,fingerprint TEXT NOT NULL,input_snapshot JSONB NOT NULL,output_snapshot JSONB,status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','RUNNING','COMPLETED','FAILED')),model TEXT,error TEXT,applied_at TIMESTAMP(3),completed_at TIMESTAMP(3),created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX process_sheet_runs_project_id_created_at_idx ON process_sheet_runs(project_id,created_at);
CREATE INDEX process_sheet_runs_sheet_id_idx ON process_sheet_runs(sheet_id);
CREATE UNIQUE INDEX process_sheet_one_active_run ON process_sheet_runs(sheet_id) WHERE status IN ('DRAFT','RUNNING');
CREATE TABLE process_sheet_corrections (
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,sheet_id TEXT NOT NULL REFERENCES process_sheets(id) ON DELETE CASCADE,
 kind TEXT NOT NULL,previous JSONB NOT NULL,next JSONB NOT NULL,author_id TEXT NOT NULL,created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX process_sheet_corrections_project_id_created_at_idx ON process_sheet_corrections(project_id,created_at);
CREATE INDEX process_sheet_corrections_sheet_id_idx ON process_sheet_corrections(sheet_id);
CREATE TRIGGER process_sheet_version_immutable BEFORE UPDATE ON process_sheet_versions FOR EACH ROW EXECUTE FUNCTION scope_preserve_audit();
CREATE TRIGGER process_sheet_correction_immutable BEFORE UPDATE ON process_sheet_corrections FOR EACH ROW EXECUTE FUNCTION scope_preserve_audit();
CREATE TRIGGER process_sheet_run_snapshot_immutable BEFORE UPDATE ON process_sheet_runs FOR EACH ROW EXECUTE FUNCTION pip_preserve_run_snapshot();
