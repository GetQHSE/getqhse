import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { JobEnvelope } from "@qhse/contracts";

import { queueNames } from "../queues.js";

abstract class RepresentativeProcessor extends WorkerHost {
  async process(job: Job<JobEnvelope>) {
    await job.updateProgress({ phase: "processing", progress: 50 });
    await this.perform(job.data);
    await job.updateProgress({ phase: "completed", progress: 100 });
    return { processed: true, idempotencyKey: job.data.idempotencyKey };
  }

  protected abstract perform(envelope: JobEnvelope): Promise<void>;
}

@Processor(queueNames.embeddingGeneration, { concurrency: 4 })
export class EmbeddingGenerationProcessor extends RepresentativeProcessor {
  protected async perform(): Promise<void> {
    // Provider interface will be injected here; paid APIs are never called by unit tests.
  }
}

@Processor(queueNames.evidenceAnalysis, { concurrency: 2 })
export class EvidenceAnalysisProcessor extends RepresentativeProcessor {
  protected async perform(): Promise<void> {}
}

@Processor(queueNames.reportGeneration, { concurrency: 2 })
export class ReportGenerationProcessor extends RepresentativeProcessor {
  protected async perform(): Promise<void> {}
}

@Processor(queueNames.notifications, { concurrency: 8 })
export class NotificationProcessor extends RepresentativeProcessor {
  protected async perform(): Promise<void> {}
}
