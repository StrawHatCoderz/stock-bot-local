# ---- Build client ----
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

# ---- Compile server ----
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npm run build

# ---- Production image: backend only ----
FROM node:20-alpine AS production
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/server/dist ./dist
COPY --from=client-build /app/client/dist ./public

EXPOSE 3001

CMD ["node", "dist/main.js"]
