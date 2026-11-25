# THE UNSEEN hosted auditor: Fastify API + compiled React SPA in one image.
# Build from the repository root:  docker build -f apps/web/Dockerfile -t unseen-web .
#
# The Playwright base image is pinned to the exact Playwright version in package-lock.json (1.65.1).
# Playwright refuses to launch a browser build that belongs to another version, so change both together.

# ---- build: install everything, compile core, mcp and web ------------------------------------------
FROM mcr.microsoft.com/playwright:v1.65.1-noble AS build
WORKDIR /app

# Manifests first, so the install layer is cached until a dependency changes.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/mcp/package.json packages/mcp/
COPY apps/web/package.json apps/web/
COPY apps/cursed-shop/package.json apps/cursed-shop/
RUN npm ci

COPY packages packages
COPY apps apps
# Order matters: mcp and web import the compiled core.
RUN npm run build -w @the-unseen/core \
 && npm run build -w @the-unseen/mcp \
 && npm run build -w @the-unseen/web

# ---- runtime: production dependencies and compiled output only -------------------------------------
FROM mcr.microsoft.com/playwright:v1.65.1-noble AS runtime
WORKDIR /app

# PORT is read by the server; platforms (Fly.io, Render, Railway) may override it.
# An empty UNSEEN_CHROMIUM_CHANNEL means the Chromium build that ships in this image.
ENV NODE_ENV=production \
    PORT=8080 \
    UNSEEN_CHROMIUM_CHANNEL="" \
    UNSEEN_MAX_CONCURRENCY=2

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/mcp/package.json packages/mcp/
COPY apps/web/package.json apps/web/
COPY apps/cursed-shop/package.json apps/cursed-shop/
# The playwright package is a peer dependency of core, so npm installs it even without dev dependencies.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/mcp/dist packages/mcp/dist
COPY --from=build /app/apps/web/dist apps/web/dist
# Pre-baked audits of the Cursed Shop. They are served as files; nothing re-audits them at start-up.
COPY apps/web/samples apps/web/samples
# The sample pages record /cursed-shop/... as their URL, and the server serves that folder.
COPY apps/cursed-shop/index.html apps/cursed-shop/product.html apps/cursed-shop/checkout.html apps/cursed-shop/
COPY apps/cursed-shop/img apps/cursed-shop/img

USER pwuser
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "apps/web/dist/server/main.js"]
