FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_IDE_BASE_PATH=""
ARG NEXT_PUBLIC_JUDGE_API_URL="https://juezvirtual.com.bo/api"
ARG NEXT_PUBLIC_JUDGE_WS_URL=""
ENV NEXT_PUBLIC_IDE_BASE_PATH=$NEXT_PUBLIC_IDE_BASE_PATH
ENV NEXT_PUBLIC_JUDGE_API_URL=$NEXT_PUBLIC_JUDGE_API_URL
ENV NEXT_PUBLIC_JUDGE_WS_URL=$NEXT_PUBLIC_JUDGE_WS_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOST=0.0.0.0
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "start"]
