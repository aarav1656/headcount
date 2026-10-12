FROM node:24-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=optional --no-audit --no-fund && npm install tsx@4 --no-save
COPY . .
ENV PORT=8080
CMD ["npx", "tsx", "server.ts"]
