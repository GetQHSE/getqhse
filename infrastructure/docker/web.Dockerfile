FROM node:24.17.0-alpine AS build
ENV HUSKY=0
ARG VITE_API_URL=http://localhost:3000
ARG VITE_DEFAULT_LOCALE=fr
ENV VITE_API_URL=$VITE_API_URL \
    VITE_DEFAULT_LOCALE=$VITE_DEFAULT_LOCALE
RUN corepack enable
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @qhse/client-web... build

FROM nginx:1.30.4-alpine
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/client-web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O - http://127.0.0.1/healthz || exit 1
