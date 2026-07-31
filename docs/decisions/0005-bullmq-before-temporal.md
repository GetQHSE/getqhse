# ADR 0005: BullMQ before Temporal

**Status:** Accepted

BullMQ covers the current bounded background jobs with retries, progress, and failure retention while
reusing Redis. Temporal would add operational and conceptual cost before durable multi-day workflows
exist. Idempotency keys and explicit job envelopes preserve a later migration path.
