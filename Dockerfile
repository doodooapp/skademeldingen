FROM node:20-slim

# Installer pdftk
RUN apt-get update && apt-get install -y pdftk && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Kopier server
COPY server/package*.json ./
RUN npm install --production

COPY server/ ./
COPY public/ ./public/

EXPOSE 3000
CMD ["node", "index.js"]
