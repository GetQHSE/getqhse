# ADR 0004: Isolate Docling in Python

**Status:** Accepted

Docling and its model dependencies belong in a dedicated Python container. TypeScript code sees only
the `DocumentExtractor` port and a normalized response. This contains Python dependencies, supports
independent resource limits, and prevents Docling-specific shapes from leaking into domain code.
