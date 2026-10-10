FROM debian:bookworm-slim
ARG OPENCODE_VERSION=2.0.22

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ripgrep curl ca-certificates python3 python3-pip universal-ctags \
      build-essential nodejs npm jq \
    && rm -rf /var/lib/apt/lists/*

RUN ARCH=$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/') && \
    curl -fsSL "https://registry.npmjs.org/@opencode/cli-linux-${ARCH}/-/cli-linux-${ARCH}-${OPENCODE_VERSION}.tgz" \
      | tar -xz -O package/bin/opencode > /usr/local/bin/opencode && chmod +x /usr/local/bin/opencode

RUN useradd -m -u 1000 agent && mkdir -p /work && chown agent /work
USER agent
WORKDIR /work
ENV HTTP_PROXY=http://egress:3128 HTTPS_PROXY=http://egress:3128 \
    NO_PROXY=localhost,127.0.0.1,::1,llmproxy,searxng \
    PAG_CTX_TIER=3
ENTRYPOINT ["opencode", "--standalone"]
