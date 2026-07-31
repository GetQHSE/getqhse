import type { JobsOptions } from "bullmq";
import { workQueueNames } from "@qhse/contracts";

export const queueNames = workQueueNames;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];

export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800, count: 5_000 },
};
