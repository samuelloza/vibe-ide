FROM node:22-bookworm-slim AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    VIBE_IDE_BASE_PATH=/ide \
    NEXT_PUBLIC_BASE_PATH=/ide

COPY package*.json ./
RUN npm ci
COPY . ./
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOST=0.0.0.0 \
    VIBE_IDE_BASE_PATH=/ide \
    NEXT_PUBLIC_BASE_PATH=/ide

COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
