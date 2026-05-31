# Backend Dockerfile - Multi-stage build for production
# Stage 1: Build stage
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ ffmpeg openssl

WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy Prisma schema
COPY src/database/prisma/schema.prisma ./prisma/schema.prisma

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Copy environment file (baked into image)
COPY .env.docker .env

# Build the application (compiles TypeScript to JavaScript)
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Stage 2: Production stage (ONLY built code, no source)
FROM node:20-alpine AS production

# Install only runtime dependencies
RUN apk add --no-cache ffmpeg openssl

WORKDIR /app

# Copy ONLY production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy ONLY built JavaScript files (not TypeScript source)
COPY --from=builder /app/dist ./dist

# Copy environment file from builder
COPY --from=builder /app/.env ./.env

# Copy Prisma schema and generated client
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy package.json (needed for npm scripts)
COPY --from=builder /app/package*.json ./

# Copy docker entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create uploads directory
RUN mkdir -p /app/uploads

# Set production environment
ENV NODE_ENV=production

# Expose gateway port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use entrypoint script to run migrations before starting app
ENTRYPOINT ["docker-entrypoint.sh"]
