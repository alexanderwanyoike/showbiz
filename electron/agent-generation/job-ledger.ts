import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  agentJobEstimateSchema,
  agentJobResultSchema,
  type AgentJob,
} from "../../shared/agent-generation";

const resultSchema = agentJobResultSchema.nullable();
const estimateSchema = agentJobEstimateSchema.nullable();
const warningsSchema = z.array(z.string());

export type NewAgentJob = Pick<
  AgentJob,
  | "job_id"
  | "request_id"
  | "request_fingerprint"
  | "project_id"
  | "subject_id"
  | "usage_request_id"
  | "model_id"
  | "kind"
  | "estimate"
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
type Row = Omit<AgentJob, "provider_called" | "result" | "warnings" | "charge_status" | "estimate"> & {
  provider_called: number | null;
  estimate_json: string | null;
  result_json: string | null;
  warnings_json: string;
};
const parseJson = (json: string | null): unknown => (json ? JSON.parse(json) : null);

function fromRow({ provider_called, estimate_json, result_json, warnings_json, ...row }: Row): AgentJob {
  const called = provider_called === null ? null : provider_called === 1;
  const estimate = estimateSchema.parse(parseJson(estimate_json));
  return {
    ...row,
    estimate,
    provider_called: called,
    charge_status:
      row.reported_microusd !== null
        ? "confirmed"
        : called === false
          ? "released"
          : estimate
            ? "estimated"
            : "unknown",
    result: resultSchema.parse(parseJson(result_json)),
    warnings: warningsSchema.parse(JSON.parse(warnings_json)),
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
        `INSERT INTO agent_generation_jobs(request_id,job_id,request_fingerprint,project_id,subject_id,usage_request_id,model_id,kind,estimate_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        job.request_id,
        job.job_id,
        job.request_fingerprint,
        job.project_id,
        job.subject_id,
        job.usage_request_id,
        job.model_id,
        job.kind,
        job.estimate ? JSON.stringify(job.estimate) : null,
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
  };
}
