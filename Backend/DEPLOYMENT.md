# Backend deployment

## Configuration

Copy `Backend/.env.example` to the environment file used by the existing Compose deployment. Set `DATABASE_URL`, SMTP credentials, a unique `JWT_SECRET` of at least 32 bytes, and the exact frontend origins in `CORS_ORIGIN` (comma-separated; no wildcard). The backend defaults to verified PostgreSQL TLS. Set `DATABASE_SSL=false` only for an explicitly local, non-production database. If the database uses a private CA, mount its PEM file read-only into the backend container and set `DATABASE_SSL_CA` to that container path. The image includes Debian CA certificates; custom CA files are read by the Node process.

`nginx.conf` sends forwarded client IP headers and proxies to `backend:4000`. `TRUST_PROXY_HOPS=1` is appropriate only when that nginx instance is the sole proxy hop and the backend is not directly internet-accessible. If the actual chain differs, set the hop count to `0` until it is reviewed; do not trust arbitrary forwarded headers. The server accepts only `0` or `1` to avoid broad hop-count trust.

Rate limits use the shared Supabase/PostgreSQL store, keyed by HMACs derived from `JWT_SECRET`. Defaults: one OTP per email per 30 seconds, five OTP sends per email per hour, 20 request-OTP calls per IP per hour, and 60 verify calls per IP per 15 minutes. The database table is cleaned hourly. Rotating `JWT_SECRET` invalidates outstanding rate-limit keys; treat this as a reset of active windows.

Audio defaults: at most eight concurrent uploads and eight active FFmpeg processes per backend process, with no queue; uploads completing while FFmpeg capacity is full receive HTTP 429. Configure with `AUDIO_MAX_CONCURRENT_UPLOADS`, `AUDIO_MAX_CONCURRENT_FFMPEG`, and `AUDIO_ANALYSIS_TIMEOUT_MS` (bounded positive integers). These limits multiply across backend replicas.

## Database migration

The applied `20261116_otp_attempt_limits.sql` migration is assumed to be present; do not rerun or alter it. Apply only the new additive rate-limit migration once, before deploying the new backend:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f Backend/src/migrations/20261117_auth_rate_limits.sql
```

The migration creates `auth_rate_limits`; it does not alter OTP rows or the existing attempt-limit migration.

## Compose rollout

No Compose manifest is included in this repository. The checked-in nginx config expects a backend service named `backend` on port 4000; it also changes the audio upload body limit. From the directory containing the production Compose file, first identify the service built from `Dockerfile.web`, update its environment file, and confirm that `backend` is private behind nginx:

```sh
docker compose config --services
```

Assuming that service is named `web`, apply the backend configuration and new migration, then rebuild/restart only `backend` and `web`:

```sh
docker compose build backend web
docker compose up -d backend web
docker compose logs --tail=100 backend web
docker compose exec backend id
docker compose exec backend ffmpeg -version
```

If the frontend service has another name, substitute the service built from `Dockerfile.web` in those commands. The backend image is Node 22 Bookworm slim; it installs `ffmpeg` and `ca-certificates`, keeps `/tmp` writable, and runs as non-root `node`. No Python or additional runtime utilities are installed. No volume is required for audio uploads; Multer writes to container temporary storage and deletes each file. Nginx allows 16 MiB bodies on `/api/audio/`, above the backend's 15 MiB file limit.

The production Compose file and host Docker daemon were not available in this checkout, so build context, actual service names, port exposure, mounted CA permissions, environment injection, and proxy topology remain unverified. Only the backend and web services need rebuilding; other services are unaffected.
