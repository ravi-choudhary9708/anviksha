FROM node:20-slim

WORKDIR /usr/src/app

# Install native dependencies for ONNX runtime
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN npm install
RUN cd client && npm install

# Copy application files
COPY . .

# Build the client
RUN cd client && npm run build

# Expose the API and WebSocket port
EXPOSE 3001

# Start the server
CMD ["npm", "run", "dev:server"]
