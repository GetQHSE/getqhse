FROM node:24.17.0-alpine AS build
ENV HUSKY=0
RUN corepack enable
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @qhse/worker... build
RUN pnpm deploy --legacy --filter @qhse/worker --prod /out

FROM node:24.17.0-alpine
ENV NODE_ENV=production
USER node
WORKDIR /app
COPY --from=build --chown=node:node /out .
STOPSIGNAL SIGTERM
CMD ["node", "dist/main.js"]
