FROM node:22-bookworm AS whisper-builder

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        build-essential \
        ca-certificates \
        cmake \
        curl \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN git clone --filter=blob:none https://github.com/ggml-org/whisper.cpp.git \
        whisper.cpp \
    && cd whisper.cpp \
    && git checkout --detach 927cfce34f31707e17f2bff35c349632fb9e2c3a \
    && test "$(git rev-parse HEAD)" = "927cfce34f31707e17f2bff35c349632fb9e2c3a" \
    && cmake -S . -B build \
        -DCMAKE_BUILD_TYPE=Release \
        -DGGML_NATIVE=OFF \
        -DWHISPER_BUILD_TESTS=OFF \
        -DWHISPER_BUILD_EXAMPLES=ON \
    && cmake --build build --config Release --target whisper-cli --parallel

RUN curl --fail --location --retry 3 \
        --output /build/ggml-base.bin \
        https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin \
    && echo "465707469ff3a37a2b9b8d8f89f2f99de7299dac  /build/ggml-base.bin" \
        | sha1sum --check --strict

FROM node:22-bookworm AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

RUN npm ci

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=development \
    CODEX_HOME=/home/node/.codex \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    PATH=/app/node_modules/.bin:$PATH \
    WHISPER_CPP_PATH=/opt/whisper/bin/whisper-cli \
    WHISPER_MODEL_PATH=/opt/whisper/models/ggml-base.bin

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=whisper-builder /build/whisper.cpp/build/bin/ /opt/whisper/bin/
COPY --from=whisper-builder /build/ggml-base.bin /opt/whisper/models/ggml-base.bin
COPY --chown=node:node . .

RUN mkdir -p /app/chats /home/node/.codex \
    && chown -R node:node /app/chats /home/node/.codex \
    && chmod -R a+rX /opt/whisper

ENV LD_LIBRARY_PATH=/opt/whisper/bin

USER node

EXPOSE 5173

CMD ["npm", "start"]
