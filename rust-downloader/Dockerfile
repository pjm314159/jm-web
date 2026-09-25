# ---- Build stage ----
FROM rust:1.88-alpine AS builder

RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
    && apk add --no-cache musl-dev pkgconfig

WORKDIR /app
# crates 源可选镜像加速：
# - 海外环境（如 GitHub Actions）保持默认 false，走官方 crates.io（rsproxy 在海外反而超时）
# - 国内网络构建时传 --build-arg USE_CRATES_MIRROR=true 启用 rsproxy
ARG USE_CRATES_MIRROR=false
COPY .cargo /cargo-mirror/
COPY Cargo.toml Cargo.lock* ./
COPY src/ src/
RUN if [ "$USE_CRATES_MIRROR" = "true" ]; then \
        cp /cargo-mirror/config.toml /usr/local/cargo/config.toml; \
    fi \
    && cargo build --release

# ---- Runtime stage ----
FROM alpine:3.21

RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
    && apk add --no-cache ca-certificates wget

COPY --from=builder /app/target/release/jm-downloader /usr/local/bin/jm-downloader

EXPOSE 3080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=5s \
  CMD wget -q --spider http://127.0.0.1:3080/health || exit 1

ENTRYPOINT ["jm-downloader"]
