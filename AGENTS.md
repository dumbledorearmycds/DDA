# Base44 Dev Environment

## Project Overview
Static single-page app — a single `index.html` (~18k lines, self-contained HTML/CSS/JS) plus an `images/` folder of `.webp` assets. No build step, no backend, no dependencies.

## Setup
- Served by `nginx:alpine` via `docker-compose.base44.yml`.
- A custom `nginx.base44.conf` runs nginx as `root` because the sandbox source directory has `700` permissions (nginx's default `nginx` user can't read it otherwise).
- Source is bind-mounted read-only at `/usr/share/nginx/html`; edits to `index.html` or `images/` are immediately visible on browser refresh.
- Port 3000 → nginx port 80.

## Running
```
docker compose -f docker-compose.base44.yml up -d
```

## Verifying
```
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/   # expect 200
```

## Secrets
None required — fully static, no external services.
