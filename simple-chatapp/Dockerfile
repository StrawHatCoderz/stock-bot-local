FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the Vite frontend
RUN npm run build

# Set production env
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Run the server using tsx
CMD ["npx", "tsx", "server/main.ts"]
