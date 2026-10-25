# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-bookworm
ARG WHISPER_REVISION=927cfce34f31707e17f2bff35c349632fb9e2c3a

FROM node:${NODE_VERSION} AS whisper-builder

ARG WHISPER_REVISION

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        build-essential \
        ca-certificates \
        cmake \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Build for Docker's target architecture. Disabling native CPU tuning keeps the
# result portable between machines of the same architecture; static project
# libraries make the runtime independent of whisper.cpp build-tree .so files.
RUN curl --fail --location --retry 3 \
        --output whisper.cpp.tar.gz \
        "https://github.com/ggml-org/whisper.cpp/archive/${WHISPER_REVISION}.tar.gz" \
    && mkdir whisper.cpp \
    && tar --extract --gzip --file whisper.cpp.tar.gz \
        --directory whisper.cpp --strip-components=1 \
    && cmake -S whisper.cpp -B whisper.cpp/build \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SHARED_LIBS=OFF \
        -DGGML_NATIVE=OFF \
        -DWHISPER_BUILD_EXAMPLES=ON \
        -DWHISPER_BUILD_TESTS=OFF \
    && cmake --build whisper.cpp/build \
        --config Release --target whisper-cli --parallel

RUN curl --fail --location --retry 3 \
        --output ggml-base.bin \
        https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin \
    && echo "465707469ff3a37a2b9b8d8f89f2f99de7299dac  ggml-base.bin" \
        | sha1sum --check --strict

FROM node:${NODE_VERSION} AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

RUN npm ci

FROM node:${NODE_VERSION}-slim AS development

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=development \
    CODEX_HOME=/home/node/.codex \
    HOME=/home/node \
    XDG_CACHE_HOME=/home/node/.codex/cache \
    XDG_CONFIG_HOME=/home/node/.codex/config \
    TMPDIR=/home/node/.codex/tmp \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    PATH=/app/node_modules/.bin:$PATH \
    WHISPER_CPP_PATH=/opt/whisper/bin/whisper-cli \
    WHISPER_MODEL_PATH=/opt/whisper/models/ggml-base.bin

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=whisper-builder \
    /build/whisper.cpp/build/bin/whisper-cli \
    /opt/whisper/bin/whisper-cli
COPY --from=whisper-builder \
    /build/ggml-base.bin \
    /opt/whisper/models/ggml-base.bin
COPY --chown=node:node . .

RUN mkdir -p \
        /app/chats \
        /home/node/.codex/cache \
        /home/node/.codex/config \
        /home/node/.codex/tmp \
    && chown -R node:node /app/chats /home/node/.codex \
    && chmod 0755 /app/scripts/docker-entrypoint.sh \
    && chmod 0755 /opt/whisper/bin/whisper-cli \
    && ffmpeg -version >/dev/null \
    && /opt/whisper/bin/whisper-cli --help >/dev/null

USER node

EXPOSE 5173

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["npm", "start"]
