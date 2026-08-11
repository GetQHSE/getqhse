FROM node:24.17.0-alpine AS build

ENV CI=true
ENV HUSKY=0

RUN corepack enable

WORKDIR /workspace

COPY . .

RUN pnpm install --frozen-lockfile --config.confirmModulesPurge=false

RUN pnpm --filter @qhse/database db:generate

RUN pnpm deploy --legacy --filter @qhse/database /out


FROM node:24.17.0-alpine

ENV NODE_ENV=production
ENV CI=true

RUN corepack enable

USER node
WORKDIR /app

COPY --from=build --chown=node:node /out .

CMD ["pnpm", "db:deploy"]