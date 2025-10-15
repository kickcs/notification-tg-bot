FROM node:18-slim AS base

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

FROM base AS dependencies

RUN npm ci --only=production

FROM base AS build

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN npm install
RUN npx prisma generate
RUN npm run build

FROM base AS production

ENV NODE_ENV=production

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package*.json ./

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('child_process').exec('ps aux | grep \"node dist/index.js\" | grep -v grep', (err, stdout) => { if (!stdout) process.exit(1); })"

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
