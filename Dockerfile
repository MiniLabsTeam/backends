FROM node:18-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ALL dependencies (need devDeps for build)
RUN npm ci

# Copy source and prisma
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./

# Generate Prisma client and build TypeScript
RUN npx prisma generate && npm run build

# Remove devDependencies after build
RUN npm prune --omit=dev

# Expose port
EXPOSE 3000

# Start directly (schema already pushed to Neon)
CMD ["node", "dist/app.js"]
