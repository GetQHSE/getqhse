# ADR 0001: Modular monolith

**Status:** Accepted

Use one customer API organized into explicit domain/application/infrastructure/presentation modules.
This keeps transactions, authorization, deployments, and debugging simple while boundaries are still
changing. The worker and Docling remain independently deployable where their runtime characteristics
actually differ. Extract a module only when measured scaling or ownership needs justify it.
