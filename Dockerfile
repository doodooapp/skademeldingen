FROM node:20-slim

RUN apt-get update && apt-get install -y pdftk && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY index.js ./
COPY skjema.pdf ./
COPY index.html ./public/index.html

EXPOSE 3000
CMD ["node", "index.js"]
