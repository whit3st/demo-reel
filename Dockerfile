# Stage 1: Install production dependencies
FROM node:25-slim AS deps

RUN npm install -g pnpm@10.32.1

WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# Stage 2: Build TypeScript
FROM node:25-slim AS builder

RUN npm install -g pnpm@10.32.1

WORKDIR /build
COPY --from=deps /build/node_modules node_modules/
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY src/ src/
COPY tsconfig.json ./
RUN pnpm run build

# Stage 3: Piper TTS binary + voice models
FROM debian:bookworm-slim@sha256:4724b8cc51e33e398f0e2e15e18d5ec2851ff0c2280647e1310bc1642182655d AS piper

ARG PIPER_VERSION=2023.11.14-2
ARG PIPER_TARBALL_SHA256=a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992
ARG PIPER_NL_MODEL_SHA256=88312e0fbf505b87caf2373d94c1384892e86b1bf2ee482cf65dc8ba179cc7d3
ARG PIPER_NL_MODEL_JSON_SHA256=6ddb215d38f1392ab935ad45441b82ada1eeae0452a2d6849ed71ea4f2e0aa63
ARG PIPER_EN_MODEL_SHA256=b3a6e47b57b8c7fbe6a0ce2518161a50f59a9cdd8a50835c02cb02bdd6206c18
ARG PIPER_EN_MODEL_JSON_SHA256=95a23eb4d42909d38df73bb9ac7f45f597dbfcde2d1bf9526fdeaf5466977d77

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    archive="$(mktemp)"; \
    curl -fsSL "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_x86_64.tar.gz" -o "$archive"; \
    echo "${PIPER_TARBALL_SHA256}  $archive" | sha256sum -c -; \
    tar -xzf "$archive" -C /opt; \
    rm -f "$archive"

RUN set -eux; \
    mkdir -p /piper-voices; \
    curl -fsSL "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx" -o /piper-voices/nl_NL-mls-medium.onnx; \
    echo "${PIPER_NL_MODEL_SHA256}  /piper-voices/nl_NL-mls-medium.onnx" | sha256sum -c -; \
    curl -fsSL "https://huggingface.co/rhasspy/piper-voices/resolve/main/nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx.json" -o /piper-voices/nl_NL-mls-medium.onnx.json; \
    echo "${PIPER_NL_MODEL_JSON_SHA256}  /piper-voices/nl_NL-mls-medium.onnx.json" | sha256sum -c -; \
    curl -fsSL "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx" -o /piper-voices/en_US-amy-medium.onnx; \
    echo "${PIPER_EN_MODEL_SHA256}  /piper-voices/en_US-amy-medium.onnx" | sha256sum -c -; \
    curl -fsSL "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json" -o /piper-voices/en_US-amy-medium.onnx.json; \
    echo "${PIPER_EN_MODEL_JSON_SHA256}  /piper-voices/en_US-amy-medium.onnx.json" | sha256sum -c -

# Stage 4: Install Playwright browser in isolation
FROM node:25-slim AS playwright-browser

# Must be set before `playwright install` so the browser lands in the shared cache path.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app
COPY --from=deps /build/package.json ./
COPY --from=deps /build/pnpm-lock.yaml ./
COPY --from=deps /build/node_modules node_modules/

RUN mkdir -p /ms-playwright && npx playwright install chromium && chmod -R a+rX /ms-playwright

# Stage 5: Lean runtime
FROM node:25-slim AS runtime

LABEL org.opencontainers.image.title="demo-reel" \
      org.opencontainers.image.description="Create demo videos from web apps using Playwright" \
      org.opencontainers.image.version="0.1.4"

# System deps for Chromium + FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libwayland-client0 \
    fonts-liberation fonts-noto-color-emoji \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system appuser && useradd --system --gid appuser --create-home --home-dir /home/appuser appuser

# Piper binary + voice models
COPY --from=piper /opt/piper /opt/piper
COPY --from=piper /piper-voices /opt/piper-voices
RUN chmod -R a+rX /opt/piper /opt/piper-voices
ENV PATH="/opt/piper:$PATH"
ENV PIPER_VOICE_DIR=/opt/piper-voices
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Application
WORKDIR /app
COPY --from=builder /build/package.json ./
COPY --from=builder /build/pnpm-lock.yaml ./
COPY --from=deps /build/node_modules node_modules/
COPY --from=playwright-browser /ms-playwright /ms-playwright

COPY --from=builder /build/dist dist/
COPY templates/ templates/

RUN mkdir -p /work && chown -R appuser:appuser /app /work /ms-playwright

ENV HOME=/home/appuser
ENV NODE_ENV=production

USER appuser

VOLUME ["/work"]
WORKDIR /work

ENTRYPOINT ["node", "/app/dist/cli.js"]
CMD ["--help"]
