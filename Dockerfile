# Use Node.js image
FROM node:18

# Install Chrome/Chromium dependencies for Puppeteer/WhatsApp Web
RUN apt-get update && apt-get install -y \
    chromium-browser \
    ca-certificates \
    fontconfig \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application with PM2
CMD ["npm", "start"]
