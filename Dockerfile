# Use Node 22 (matching your package.json)
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy application code
COPY . .

# Expose port (Cloud Run uses PORT environment variable)
EXPOSE 8080

# Start the application
CMD ["node", "server.js"]
