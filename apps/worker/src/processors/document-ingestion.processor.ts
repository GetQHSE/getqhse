import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { JobEnvelope } from "@qhse/contracts";

import { queueNames } from "../queues.js";
import { BaseJobProcessor } from "./base.processor.js";

@Processor(queueNames.documentIngestion, { concurrency: 2 })
export class DocumentIngestionProcessor extends WorkerHost {
  private readonly base = new (class extends BaseJobProcessor {
    execute(job: Job<JobEnvelope>) {
      return this.run(job, async () => {
        await job.updateProgress({ phase: "extracting", progress: 50 });
      });
    }
  })();

  process(job: Job<JobEnvelope>) {
    return this.base.execute(job);
  }
}
