import type { Job } from "bullmq";
import { jobEnvelopeSchema, type JobEnvelope } from "@qhse/contracts";

export abstract class BaseJobProcessor {
  protected async run(
    job: Job<JobEnvelope>,
    operation: (envelope: JobEnvelope) => Promise<void>,
  ): Promise<{ processed: true; idempotencyKey: string }> {
    const envelope = jobEnvelopeSchema.parse(job.data);
    await job.updateProgress({ phase: "started", progress: 5 });
    try {
      await operation(envelope);
      await job.updateProgress({ phase: "completed", progress: 100 });
      return { processed: true, idempotencyKey: envelope.idempotencyKey };
    } catch (error: unknown) {
      const safeError = error instanceof Error ? error.name : "UnknownError";
      await job.log(
        JSON.stringify({
          event: "job_failed",
          errorCode: safeError,
          correlationId: envelope.correlationId,
        }),
      );
      throw error;
    }
  }
}
