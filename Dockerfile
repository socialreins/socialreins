# syntax=docker/dockerfile:1
# Base images are pinned by digest so a rebuild runs the same bytes. The readable tag stays in
# front of the digest so Dependabot's docker ecosystem can see the version and bump both.
# node:24-alpine is Node 24.22.3 on Alpine 3.24 (built 2026-11-11). The digest is the
# multi-arch index, so linux/amd64 (CI, Railway) and linux/arm64 (image.yml) both resolve.
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
# Railway passes its commit as a build argument; next.config.ts uses it as the deployment id.
ARG RAILWAY_GIT_COMMIT_SHA
COPY . .
RUN npm run build

# The same node:24-alpine digest as the builder stage.
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
WORKDIR /app
# Set BRAIN_URL at run time: one image serves any domain.
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
