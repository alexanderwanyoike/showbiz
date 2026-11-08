import type { DatabaseSync } from "node:sqlite";
import type { AgentJob } from "../../shared/agent-generation";

export type NewAgentJob = Pick<
  AgentJob,
  | "job_id"
  | "request_id"
  | "quote_id"
  | "grant_id"
  | "project_id"
  | "subject_id"
  | "usage_request_id"
  | "model_id"
  | "kind"
  | "reserved_microusd"
>;
export type AgentJobUpdate = Partial<
  Pick<
    AgentJob,
    | "status"
    | "reported_microusd"
    | "provider_called"
    | "result"
    | "error"
    | "warnings"
  >
>;
type Row = Omit<AgentJob, "provider_called" | "result" | "warnings"> & {
  provider_called: number | null;
  result_json: string | null;
  warnings_json: string;
};

function fromRow({ provider_called, result_json, warnings_json, ...row }: Row): AgentJob {
  return {
    ...row,
    provider_called: provider_called === null ? null : provider_called === 1,
    result: result_json ? (JSON.parse(result_json) as AgentJob["result"]) : null,
    warnings: JSON.parse(warnings_json) as string[],
  };
}

/** Device-wide record of agent jobs. Its request ID key is what stops a retry from paying twice. */
export function createAgentJobLedger(db: DatabaseSync, now: () => number = Date.now) {
  const timestamp = () => new Date(now()).toISOString();
  const get = (jobId: string) => {
    const row = db
      .prepare("SELECT * FROM agent_generation_jobs WHERE job_id = ?")
      .get(jobId) as Row | undefined;
    return row ? fromRow(row) : null;
  };
  return {
    get,
    find(requestId: string): AgentJob | null {
      const row = db
        .prepare("SELECT * FROM agent_generation_jobs WHERE request_id = ?")
        .get(requestId) as Row | undefined;
      return row ? fromRow(row) : null;
    },
    list(projectId: string, offset: number, limit: number): AgentJob[] {
      return (
        db
          .prepare(
            "SELECT * FROM agent_generation_jobs WHERE project_id = ? ORDER BY created_at DESC, job_id DESC LIMIT ? OFFSET ?",
          )
          .all(projectId, limit, offset) as Row[]
      ).map(fromRow);
    },
    insert(job: NewAgentJob): AgentJob {
      const at = timestamp();
      db.prepare(
        `INSERT INTO agent_generation_jobs(request_id,job_id,quote_id,grant_id,project_id,subject_id,usage_request_id,model_id,kind,reserved_microusd,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        job.request_id,
        job.job_id,
        job.quote_id,
        job.grant_id,
        job.project_id,
        job.subject_id,
        job.usage_request_id,
        job.model_id,
        job.kind,
        job.reserved_microusd,
        at,
        at,
      );
      return get(job.job_id)!;
    },
    update(jobId: string, patch: AgentJobUpdate): AgentJob | null {
      const current = get(jobId);
      if (!current) return null;
      const next = { ...current, ...patch };
      db.prepare(
        `UPDATE agent_generation_jobs SET status = ?, reported_microusd = ?, provider_called = ?, result_json = ?, error = ?, warnings_json = ?, updated_at = ? WHERE job_id = ?`,
      ).run(
        next.status,
        next.reported_microusd,
        next.provider_called === null ? null : Number(next.provider_called),
        next.result ? JSON.stringify(next.result) : null,
        next.error,
        JSON.stringify(next.warnings),
        timestamp(),
        jobId,
      );
      return get(jobId);
    },
    unfinished(): number {
      return (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM agent_generation_jobs WHERE status IN ('accepted','running')",
          )
          .get() as { count: number }
      ).count;
    },
    recoverInterrupted(): void {
      db.prepare(
        "UPDATE agent_generation_jobs SET status = 'interrupted', updated_at = ? WHERE status IN ('accepted','running')",
      ).run(timestamp());
    },
    /** A hold becomes the confirmed charge; it is released only when the provider was never called. */
    spend(grantId: string): { committed_microusd: number; frozen: boolean } {
      const row = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE
               WHEN reported_microusd IS NOT NULL THEN reported_microusd
               WHEN provider_called = 0 THEN 0
               ELSE reserved_microusd END), 0) AS committed,
             COALESCE(MAX(reported_microusd > reserved_microusd), 0) AS frozen
           FROM agent_generation_jobs WHERE grant_id = ?`,
        )
        .get(grantId) as { committed: number; frozen: number };
      return { committed_microusd: row.committed, frozen: row.frozen === 1 };
    },
  };
}
