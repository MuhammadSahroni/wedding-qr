# Multi-stage Docker build for Wedding QR Check-in System
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root and subpackage definitions
COPY package*.json ./
COPY server/package*.json ./server/
COPY scanner-app/package*.json ./scanner-app/
COPY display-app/package*.json ./display-app/

# Install all dependencies
RUN npm install
RUN cd server && npm install
RUN cd scanner-app && npm install
RUN cd display-app && npm install

# Copy source codes
COPY server/ ./server/
COPY scanner-app/ ./scanner-app/
COPY display-app/ ./display-app/
COPY guests.json ./
COPY guests.json ./server/guests.json

# Build frontend static files
RUN cd scanner-app && npm run build
RUN cd display-app && npm run build

# ============================================================
# Production Runner Image
# ============================================================
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Copy built server & dist files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server ./server
COPY --from=builder /app/scanner-app/dist ./scanner-app/dist
COPY --from=builder /app/display-app/dist ./display-app/dist
COPY --from=builder /app/guests.json ./
COPY --from=builder /app/guests.json ./server/guests.json

# Expose port
EXPOSE 3001

# Run server
CMD ["node", "server/server.js"]
