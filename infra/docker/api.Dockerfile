# API image.
#
# Two stages, and the second stage carries the production dependencies only. The
# `migrate` service runs this same image with a different command, so a schema
# change and the code that expects it are always built from one commit.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN corepack enable
WORKDIR /app

# --- dependencies -----------------------------------------------------------
# Copied on their own so a source-only change does not reinstall the world.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY ops/package.json ops/
RUN pnpm install --frozen-lockfile

# --- build ------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @easyerp/contracts build \
 && pnpm --filter @easyerp/api prisma:generate \
 && pnpm --filter @easyerp/api build

# --- production dependencies ------------------------------------------------
# Re-resolved without dev dependencies, from the lockfile alone.
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY ops/package.json ops/
RUN pnpm install --frozen-lockfile --prod --filter @easyerp/api...

# --- runtime ----------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps
ENV TZ=Africa/Tunis
# `tini` reaps zombies and forwards SIGTERM, which is what makes a graceful
# shutdown — and therefore a deployment without dropped requests — possible.
RUN apt-get update \
 && apt-get install --no-install-recommends -y tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build /app/node_modules/.pnpm-store ./node_modules/.pnpm-store
COPY --from=build /app/apps/api/node_modules/.bin ./apps/api/node_modules/.bin
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Not root: a compromised API process should not own the filesystem.
USER node

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/api/dist/main.js"]
