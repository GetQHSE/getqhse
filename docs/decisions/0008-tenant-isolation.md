# ADR 0008: Enforce tenancy in session, application, and repository layers

**Status:** Accepted

The authenticated session identifies the user. Organization selection is accepted only after a
membership lookup. Application services receive an immutable tenant context and repositories require
the tenant key in every method. Cross-resource IDs are re-resolved under that tenant. Tests cover
read, mutation, deletion, search, export, reference, file, and vector paths.
