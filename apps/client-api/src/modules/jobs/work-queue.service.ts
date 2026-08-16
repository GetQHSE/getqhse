import { createHash } from "node:crypto";

import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from "@nestjs/common";
import {
  jobEnvelopeSchema,
  workQueueNames,
  type JobEnvelope,
  type WorkQueueName,
} from "@qhse/contracts";
import { Queue } from "bullmq";

const redisUrl = new URL(process.env["REDIS_URL"] ?? "redis://localhost:6379");

@Injectable()
export class WorkQueueService implements OnModuleDestroy {
  private readonly queues = new Map<WorkQueueName, Queue<JobEnvelope>>();

  private queue(queueName: WorkQueueName): Queue<JobEnvelope> {
    const existing = this.queues.get(queueName);
    if (existing) return existing;
    const queue = new Queue<JobEnvelope>(queueName, {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
        ...(redisUrl.password ? { password: redisUrl.password } : {}),
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      },
    });
    this.queues.set(queueName, queue);
    return queue;
  }

  async enqueue(queueName: WorkQueueName, jobName: string, envelope: JobEnvelope) {
    if (!Object.values(workQueueNames).includes(queueName)) {
      throw new BadRequestException("Unknown work queue");
    }
    const queue = this.queue(queueName);
    const validated = jobEnvelopeSchema.parse(envelope);
    const jobId = createHash("sha256")
      .update(`${validated.organizationId}:${queueName}:${validated.idempotencyKey}`)
      .digest("hex");
    const job = await queue.add(jobName, validated, { jobId });
    return { jobId: job.id, queue: queueName, correlationId: validated.correlationId };
  }

  async assertWorkerAvailable(queueName: WorkQueueName): Promise<void> {
    try {
      const count = await this.queue(queueName).getWorkersCount();
      if (count > 0) return;
    } catch {
      // Redis/queue discovery failures are indistinguishable from an unavailable consumer here.
    }
    throw new ServiceUnavailableException({
      code: "REGULATORY_WORKER_UNAVAILABLE",
      message: "No regulatory analysis worker is currently registered",
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }
}
