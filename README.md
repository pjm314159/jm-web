# JM-Website

[中文文档](./README_zh.md)

A personal comic management web app built on [jmcomic](https://github.com/hect0x7/JMComic-Crawler-Python):
online search & reading, one-click download to library, local media browsing. Front-end and back-end separated, with a Rust microservice handling downloads and image deobfuscation.

## Features

- **Online Search & Filtering**: keyword / tag / author search + leaderboard browsing (monthly / weekly / daily), supports sorting, time range, category, and subcategory filters; leave keyword blank to browse all works by filters alone
- **Online Reading**: album details, chapter list, comment section (level / avatar / badge display), images deobfuscated by frontend WASM decoder (GIF rendered as-is)
- **One-Click Download**: submitted to Rust microservice for concurrent download + deobfuscation + disk write, supports resume, jitter retry, and progress callback; GIF saved as-is; failed chapters can be retried individually or all at once
- **Local Comic Library**: downloaded album management (list / details / delete), remote update detection, local reader, comment section (collapsed by default, click to expand)
- **Local Media Browsing**: image / video folder browsing, online video playback (Nginx Range direct serving + Django-authenticated X-Accel)
- **Account System**: registration gate key + JWT login (access / refresh 7 days, rotation + blacklist)
- **Profile**: link JM account (strongly encrypted password storage) and sync favorites, display level / avatar / badges and more

## Tech Stack

| Component | Technology |
| --- | --- |
| Backend | Django 6 + Django REST Framework + Gunicorn |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS + TanStack Query |
| Download Service | Rust (axum + reqwest + tokio), replacing Celery |
| Database | SQLite (WAL mode, PRAGMA optimized) |
| Cache | Redis (Django cache + local media scan results) |
| Reverse Proxy | Nginx (static hosting + media direct serving + API proxy) |
| Dependency Mgmt | uv (Python), pnpm (frontend), cargo (Rust) |
| Deployment | Docker Compose (redis / web / rust_downloader / nginx) |

## Architecture

```text
Browser (React SPA)
      │
      ▼
Nginx :8000
  ├── /                  Frontend static assets (Vite build output)
  ├── /api/              Django API (Gunicorn :8000)
  ├── /media/images/     Image directory direct serving
  ├── /media/videos/     Video direct serving (Range / X-Accel support)
  └── /static/           Django static files

Django ── jmcomic ─────────► JMComic site (search / details / comments / metadata)
Rust   ── JM image CDN ─────► Download + deobfuscation + disk write
Redis  ── Django cache / local media scan results
SQLite ── Album and chapter metadata
```

Key design:

- Nginx is the single public entry point; `/` serves the React build, `/api/` reverse-proxies to Django, media files are served directly by Nginx.
- Django handles authentication, jmcomic metadata fetching, task orchestration, and database read/write; download orchestration calls the Rust microservice via internal HTTP (`rust_downloader:3080` in containers).
- Rust microservice: concurrent image download, deobfuscation decoding, resume, jitter retry, progress callback, failure cleanup, periodic local media directory scan; task queue is in-process memory; Redis is used for Django cache and local media scan results.

## Quick Start (Docker)

### 1. Clone the project

```bash
git clone https://github.com/pjm314159/jm-web.git
cd jm-web
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and modify at least the following variables:

| Variable | Description |
| --- | --- |
| `ALLOWED_HOST` | Access domain or IP (single primary domain; 127.0.0.1 / localhost auto-allowed) |
| `DJANGO_SECRET_KEY` | Django secret key, must be changed |
| `REGISTRATION_SECRET_KEY` | Registration gate key, required when registering |
| `CSRF_TRUSTED_ORIGINS` | CSRF trusted origins, comma-separated |
| `CORS_ALLOWED_ORIGINS` | CORS allowed origins, comma-separated |

Optional: set `PROXY=http://127.0.0.1:10808` if a proxy is needed (shared by jmcomic and Rust image download; leave empty for direct connection).

Generate a Django Secret Key:

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### 3. Start services

```bash
docker compose up -d --build
```

First startup will automatically:

- Run database migrations and collect static files in the `web` container;
- Initialize local media directory cache (Redis);
- Build the frontend during the `nginx` build stage.

### 4. Access

Open `http://localhost:8000`, create an account with the registration key, then log in.

## Common Commands

```bash
# View logs
docker compose logs -f web
docker compose logs -f rust_downloader
docker compose logs -f nginx

# Rebuild after code updates
docker compose up -d --build

# Stop / remove containers (data volumes preserved)
docker compose down

# Execute management commands inside the container
docker exec -it jm_django_web python manage.py createsuperuser
docker exec -it jm_django_web python manage.py shell
```

## Local Development

Prerequisites: Python 3.12+, Node.js 22+, Rust toolchain, Redis.

### Backend

```bash
uv sync --locked --group dev
uv run python JmWebProject/manage.py migrate
uv run python JmWebProject/manage.py runserver
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

### Rust Download Service

```bash
cd rust-downloader
REDIS_URL=redis://127.0.0.1:6379/0 MEDIA_ROOT=../JmWebProject/media cargo run
```

Also supports `config.toml` (see `config.example.toml`), specify via `--config <path>` or `JM_CONFIG_FILE`.

### Redis

```bash
docker run -d -p 6379:6379 redis:alpine
```

### Lint / Test

```bash
uv run ruff check JmWebProject/ tests/
uv run pytest
cd frontend && pnpm build && pnpm lint
cd rust-downloader && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Configuration

- All configurable parameters (backend env vars, Rust config.toml, frontend VITE_*, Nginx, Docker) are documented in [docs/config.md](docs/config.md).
- Gunicorn startup parameters are documented in the root [config.md](config.md).
- Environment variable examples: `.env.example` (backend), `frontend/.env.example` (frontend).

## Project Structure

```text
jm-web/
├── JmWebProject/
│   ├── JmWebProject/     # Django project config (settings / urls)
│   ├── comic/            # Core app: models / views / serializers / services
│   │   └── services/     # Business layer (search / crawl / library / local_media / jm_sync / jm_async)
│   ├── user/             # User authentication app
│   ├── media/            # Media files (downloaded images / videos)
│   └── db/               # SQLite database
├── frontend/             # React SPA (Vite + TypeScript)
│   ├── src/pages/        # Pages
│   ├── src/components/   # Components (incl. reader / WASM decoder)
│   └── wasm/             # Rust → WASM decoder source
├── rust-downloader/      # Download microservice (axum + reqwest)
├── nginx/                # Nginx config and frontend build image
├── tests/                # Backend tests
├── docs/                 # Design / planning / config docs
├── docker-compose.yml
├── Dockerfile
├── config.md
└── .env.example
```

## Notes

- This project is developed for personal use; do not deploy it as a public website.
- Media files are persisted via bind mounts; `docker compose down` will not delete data; `db_data` / `redis_data` are named volumes.
- For builds in mainland China: the `web` image uses Tsinghua PyPI mirror for uv by default (override with `--build-arg PIP_INDEX_URL=...`), the Rust image uses Alibaba Cloud apk mirror and ByteDance rsproxy for acceleration.
- Cover paths have been unified to the album root directory; old data `cover_path` will not be migrated automatically.

## Thanks

Thanks to the developers of [JMComic-Crawler-Python](https://github.com/hect0x7/JMComic-Crawler-Python).

## License

[GPL-3.0](./LICENSE)
