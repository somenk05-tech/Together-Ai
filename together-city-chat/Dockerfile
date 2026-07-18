# Together City API (NestJS + Prisma). Works on Railway, Render, Fly.io, or any Docker host.
FROM node:20-slim
WORKDIR /app

# OpenSSL is required by Prisma's engines.
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install deps (keep dev deps: the Prisma CLI + nest build run in this image).
COPY package*.json ./
RUN npm ci

# Generate the Prisma client. Prisma 7 reads its settings from prisma.config.ts,
# so it must be present before generate runs. No database is needed at this step —
# the DATABASE_URL in the config is resolved lazily, only by commands that connect.
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate

# Build the Nest app.
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

# On boot: if committed migrations exist, apply them (production-correct); otherwise push the
# schema directly (first deploy, no migration history yet). Then start the API.
CMD ["sh", "-c", "if [ -d prisma/migrations ] && [ \"$(ls -A prisma/migrations 2>/dev/null)\" ]; then npx prisma migrate deploy; else npx prisma db push --accept-data-loss; fi && node dist/main.js"]
