# ---- Build stage ----
FROM rust:1.88-alpine AS builder

RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
    && apk add --no-cache musl-dev pkgconfig

WORKDIR /app
# 使用字节跳动 rsproxy 镜像加速 crates.io
COPY .cargo/config.toml /usr/local/cargo/config.toml
COPY Cargo.toml Cargo.lock* ./
COPY src/ src/
RUN cargo build --release

# ---- Runtime stage ----
FROM alpine:3.21

RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
    && apk add --no-cache ca-certificates wget

COPY --from=builder /app/target/release/jm-downloader /usr/local/bin/jm-downloader

EXPOSE 3080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=5s \
  CMD wget -q --spider http://127.0.0.1:3080/health || exit 1

ENTRYPOINT ["jm-downloader"]
