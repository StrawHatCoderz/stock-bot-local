FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Start the server
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
