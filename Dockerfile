# -------- Stage 1: Build --------

    FROM node:lts-alpine AS builder

    WORKDIR /app

    # better-sqlite3 is a native module with no prebuilt musl binary, so it is
    # compiled from source.
    RUN apk add --no-cache python3 make g++

    COPY package*.json ./

    # The schema has to be here before npm install: the postinstall hook runs
    # `prisma generate`, which fails outright without prisma/schema.prisma.
    COPY prisma ./prisma
    COPY prisma.config.ts ./

    RUN npm install

    COPY . .

    RUN npm run build

# -------- Stage 2: Production --------

    FROM node:lts-alpine

    # Install tini for proper signal handling
    RUN apk add --no-cache tini

    ENV NODE_ENV=production

    WORKDIR /app

    # Copy only the output we need
    COPY --from=builder /app/package*.json ./
    COPY --from=builder /app/node_modules ./node_modules
    COPY --from=builder /app/.next ./.next
    COPY --from=builder /app/next.config.ts ./

    # Prisma schema and migrations are applied at start-up
    COPY --from=builder /app/prisma ./prisma
    COPY --from=builder /app/prisma.config.ts ./
    COPY --from=builder /app/lib ./lib
    COPY --from=builder /app/tsconfig.json ./

    # The SQLite file lives here, on a volume declared in docker-compose.yml.
    RUN mkdir -p /app/data
    ENV DATABASE_URL="file:/app/data/phoneme.db"

    ENTRYPOINT ["/sbin/tini", "--"]

    EXPOSE 3001

    CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npm start"]
