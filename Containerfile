FROM public.ecr.aws/docker/library/node:24.12.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM public.ecr.aws/docker/library/node:24.12.0-bookworm-slim
ENV NODE_ENV=production PORT=3001 FLUX_HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server
USER node
EXPOSE 3001
CMD ["node", "--max-old-space-size=768", "dist-server/index.mjs"]
