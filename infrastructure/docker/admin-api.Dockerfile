FROM node:24.17.0-alpine AS build
ENV HUSKY=0
RUN corepack enable
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @qhse/database db:generate
RUN pnpm --filter @qhse/admin-api... build
RUN pnpm deploy --legacy --filter @qhse/admin-api --prod /out

FROM node:24.17.0-alpine
ENV NODE_ENV=production
USER node
WORKDIR /app
COPY --from=build --chown=node:node /out .
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - http://localhost:3001/health/ready || exit 1
CMD ["node", "dist/main.js"]
