FROM node:24.17.0-alpine AS build
ENV HUSKY=0
ARG VITE_ADMIN_API_URL=http://localhost:3001
ENV VITE_ADMIN_API_URL=$VITE_ADMIN_API_URL
RUN corepack enable
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @qhse/admin-web... build

FROM nginx:1.30.4-alpine
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/admin-web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O - http://127.0.0.1/healthz || exit 1
