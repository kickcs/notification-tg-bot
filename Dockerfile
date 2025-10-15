FROM node:18-slim AS base

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json yarn.lock ./

FROM base AS dependencies

RUN corepack enable && corepack prepare yarn@stable --activate
RUN yarn install --frozen-lockfile

FROM base AS build

RUN corepack enable && corepack prepare yarn@stable --activate
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN yarn prisma:generate
RUN yarn build

FROM base AS production

RUN corepack enable && corepack prepare yarn@stable --activate

ENV NODE_ENV=production

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('child_process').exec('ps aux | grep \"node dist/index.js\" | grep -v grep', (err, stdout) => { if (!stdout) process.exit(1); })"

CMD ["sh", "-c", "yarn prisma migrate deploy && node dist/index.js"]
