FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy compiled source
COPY dist ./dist

# Expose port
EXPOSE 3000

# Run migrations then start
CMD npx prisma migrate deploy && node dist/app.js
