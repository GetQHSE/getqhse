import { Module } from "@nestjs/common";

import { WorkQueueService } from "./work-queue.service.js";

@Module({ providers: [WorkQueueService], exports: [WorkQueueService] })
export class JobsModule {}
