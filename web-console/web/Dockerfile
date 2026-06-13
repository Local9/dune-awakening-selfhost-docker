# Dev/build targets for the web-console UI. Production image uses web-console/Dockerfile.
FROM node:24-bookworm-slim AS base

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS development

COPY . .

COPY scripts/docker-dev-entrypoint.sh /docker-dev-entrypoint.sh
RUN chmod +x /docker-dev-entrypoint.sh

EXPOSE 5173

ENTRYPOINT ["/docker-dev-entrypoint.sh"]
CMD ["pnpm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM base AS builder

COPY . .
RUN pnpm run build
