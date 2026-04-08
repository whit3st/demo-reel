# Stage 1: Build TypeScript
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY src/ src/
COPY tsconfig.json ./
COPY templates/ templates/
RUN pnpm run build:tsc

# Stage 2: Piper TTS binary + Dutch voice model
FROM debian:bookworm-slim AS piper

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

RUN curl -sL https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz \
    | tar -xz -C /opt

RUN mkdir -p /piper-voices && \
    curl -sL https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx \
      -o /piper-voices/nl_NL-mls-medium.onnx && \
    curl -sL https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx.json \
      -o /piper-voices/nl_NL-mls-medium.onnx.json

# Stage 3: Lean runtime
FROM node:22-slim AS runtime

# System deps for Chromium + FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libwayland-client0 \
    fonts-liberation fonts-noto-color-emoji \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Piper binary + voice models
COPY --from=piper /opt/piper /opt/piper
COPY --from=piper /piper-voices /root/.local/share/piper-voices
ENV PATH="/opt/piper:$PATH"

# Application
WORKDIR /app
COPY --from=builder /build/node_modules node_modules/
COPY --from=builder /build/dist dist/
COPY --from=builder /build/templates templates/
COPY --from=builder /build/package.json ./
COPY --from=builder /build/pnpm-lock.yaml ./

# Install Playwright Chromium browser
RUN npx playwright install chromium

WORKDIR /work

ENV NODE_ENV=production

ENTRYPOINT ["node", "/app/dist/cli.js"]
CMD ["--help"]
