# Tenant isolation

1. Better Auth validates the secure session cookie.
2. `TenantContextGuard` resolves the user and verifies membership for the requested organization.
3. Controllers pass the resulting server-side tenant context into application services.
4. Repositories require `organizationId` and include it in every read and mutation predicate.
5. Cross-resource references must resolve both IDs under the same `organizationId`.
6. Object keys are prefixed with the organization ID and only signed after authorization.
7. Vector search applies the tenant predicate before ranking or returning results.
8. Audit entries record organization, actor, request ID, action, and entity without sensitive content.

The security suite includes a mandatory resource/operation matrix. Production readiness also requires
database-backed API tests for every implemented resource and, where supported, PostgreSQL row-level
security as defense in depth.
