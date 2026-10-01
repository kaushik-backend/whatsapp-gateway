FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

FROM node:20-alpine

WORKDIR /app

# Install ffmpeg for voice message conversion
RUN apk add --no-cache ffmpeg

COPY --from=builder /app .

ENV NODE_ENV=production

EXPOSE 3000

USER node

CMD ["node", "src/server.js"]
