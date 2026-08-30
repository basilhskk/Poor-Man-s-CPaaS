# UI
FROM node:20-alpine AS ui-builder
WORKDIR /app
COPY ui/package*.json ./ui/
RUN npm ci --prefix ui
COPY ui/ ./ui/
RUN npm run --prefix ui build

# server
FROM node:20-alpine AS server-builder
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN mkdir -p src/db/migrations
RUN npm run build

# runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=server-builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-builder /app/dist ./dist
RUN mkdir -p dist/db/migrations
COPY --from=server-builder /app/src/db/migrations ./dist/db/migrations/
COPY --from=ui-builder /app/ui/dist ./public
COPY server/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
