# ADR 0006: PostgreSQL and pgvector

**Status:** Accepted

Transactional and vector data share PostgreSQL initially. This simplifies tenant filtering, backups,
and consistency. Embeddings always carry `organizationId`; retrieval filters the tenant before
ranking. Revisit a separate search system only after measured scale demands it.
