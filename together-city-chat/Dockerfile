# Together City API (NestJS + Prisma). Works on Railway, Render, Fly.io, or any Docker host.
# Node 22: required by the PDF text extractor (pdf-parse/pdfjs use Promise.withResolvers)
# and by firebase-admin 14 / Prisma stream adapter.
FROM node:22-slim
WORKDIR /app

# OpenSSL is required by Prisma's engines; ffmpeg powers server-side video
# cover-frame extraction (Social "Set cover").
RUN apt-get update && apt-get install -y openssl ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*

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

# Startup is handled by docker-entrypoint.sh: verify DATABASE_URL (clear error if
# missing), wait for PostgreSQL to accept connections, apply migrations or push the
# schema, then start the API.
CMD ["sh", "docker-entrypoint.sh"]
