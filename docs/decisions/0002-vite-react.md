# ADR 0002: Vite instead of Next.js

**Status:** Accepted

The customer application is an authenticated operational SPA without an SEO or server-rendering
requirement. Vite provides a small, fast build/runtime boundary and avoids coupling UI deployment to
a Node web server. React Router owns routing and TanStack Query owns server state.
