# Production-ready Node.js container
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy application source code
COPY . .

# Set production environment and port
ENV NODE_ENV=production
ENV PORT=3000

# Expose server port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
