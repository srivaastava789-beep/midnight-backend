FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build the frontend (Vite)
RUN npm run build

# Production environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start the Express server
CMD ["npx", "tsx", "server.ts"]
