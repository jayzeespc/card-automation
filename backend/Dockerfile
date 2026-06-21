FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY backend/package.json backend/package-lock.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy backend code
COPY backend/ ./

# Create data directories
RUN mkdir -p data/cache data/reports data/logs

# Expose port
EXPOSE 3000

# Default environment
ENV APP_ENV=qa
ENV NODE_ENV=production

# Start backend
CMD ["node", "server.js"]
