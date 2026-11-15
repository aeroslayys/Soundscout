# SoundScout

SoundScout is a map-based web app for discovering places by **how they sound**.

Instead of relying only on photos or generic venue reviews, SoundScout lets people log quietness ratings, optionally analyze a short ambient recording, compare sound levels by time of day, and find calmer places nearby.

## Features

- Interactive Leaflet map with venue markers
- Quietness ratings on a 1–5 scale
  - 1 = Loud
  - 2 = Lively
  - 3 = Moderate
  - 4 = Calm
  - 5 = Silent
- Optional 5–10 second ambient audio analysis
- Mean and maximum recording level analysis in **dBFS** using FFmpeg
- Average recorded-level display for venues
- Time-of-day recorded sound graph
- Recent sound reports
- Sound heatmap
- **Quiet Near Me** filtering
- Browser geolocation with an accuracy indicator
- Venue search through OpenStreetMap Nominatim
- Accessibility and gender-neutral toilet tags
- Passwordless email OTP authentication
- User profiles
- Admin operations dashboard with searchable venues, ratings, users, and audit history
- Soft-delete and restore for ratings and venues, with required moderation reasons
- Venue approval/rejection and likely-duplicate detection
- Community flags and moderation queue
- User suspension controls enforced by the backend
- Light and dark themes
- Responsive mobile layout

## Audio privacy

SoundScout does **not** persist uploaded or recorded audio clips.

A clip is temporarily uploaded to the backend, analyzed with FFmpeg, and deleted immediately after analysis. The application stores only derived information such as the measured dBFS value and whether audio analysis was used.

> dBFS is a digital recording level, not a calibrated sound-pressure-level (dB SPL) measurement. Results can vary between microphones and devices.

## Tech stack

### Frontend

- HTML
- CSS
- Vanilla JavaScript
- Leaflet
- Leaflet.heat
- OpenStreetMap

### Backend

- Node.js
- Express
- PostgreSQL
- PostGIS
- JSON Web Tokens
- bcryptjs
- Nodemailer / Mailtrap
- Multer
- FFmpeg

## Architecture

```text
Browser / Phone
      |
      v
SoundScout frontend
      |
      | HTTPS / REST
      v
Node.js + Express
      |
      +--> PostgreSQL + PostGIS
      |
      +--> FFmpeg
      |     temporary audio analysis
      |     clip deleted after analysis
      |
      +--> Mailtrap
            OTP email delivery
```

The project can be self-hosted and exposed securely over HTTPS using a service such as **Tailscale Funnel**.

## Project structure

```text
Soundscout/
├── index.html
├── login.css
├── login.js
├── home/
│   ├── home.html
│   ├── home.css
│   └── home.js
├── profile/
├── admin/
└── Backend/
    ├── package.json
    └── src/
        ├── server.js
        ├── db.js
        ├── mailer.js
        ├── middleware/
        └── routes/
            ├── auth.js
            ├── audio.js
            ├── venues.js
            ├── users.js
            └── admin.js
```

## Requirements

Before running the backend, install:

- Node.js 18 or newer
- PostgreSQL
- PostGIS
- FFmpeg

A PostgreSQL database with the SoundScout tables is also required. The current application expects tables including users, OTP codes, venues, and ratings.

## Backend setup

Clone the repository:

```bash
git clone https://github.com/aeroslayys/Soundscout.git
cd Soundscout/Backend
```

Install dependencies:

```bash
npm install
```

Create a `.env` file inside `Backend/`.

Example:

```env
PORT=4000

DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE

JWT_SECRET=replace-with-a-long-random-secret
ADMIN_EMAIL=admin@example.com

CORS_ORIGIN=https://your-soundscout-url.example
PUBLIC_WEB_URL=https://jellyfin-server.tail0a3780.ts.net

# Google OAuth (create a Web application OAuth client in Google Cloud)
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=https://jellyfin-server.tail0a3780.ts.net/api/auth/google/callback
MOBILE_AUTH_REDIRECT_URI=mobile://auth

DATABASE_SSL=true # Use false for a local PostgreSQL server without TLS

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
MAIL_FROM=no-reply@example.com
MAIL_FROM_NAME=SoundScout

# Legacy MAILTRAP_* variables are also supported.

OTP_EXPIRY_MINUTES=10
OTP_RESEND_COOLDOWN_SECONDS=30
```

Do not commit your real `.env` file or credentials.

### Apply the admin-console database migration

Before starting the updated backend, apply the additive migration to the same PostgreSQL database configured by `DATABASE_URL`. It adds soft-delete fields, venue approval state, account suspension fields, moderation flags, and admin audit logs. Existing venues are marked approved by default; newly submitted venues wait for admin approval.

Run this from the `Backend/` directory, with `DATABASE_URL` set in your shell:

```bash
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f src/migrations/20261029_admin_console.sql
```

Back up the database before applying schema changes. The migration is designed to be repeatable, but it should still be applied to the intended database and verified before deploying the updated API.

Start the backend:

```bash
npm start
```

For development with Node's watch mode:

```bash
npm run dev
```

The default API port is:

```text
http://localhost:4000
```

Health check:

```text
GET /health
```

## Main API areas

```text
/api/auth
/api/audio
/api/venues
/api/users
/api/admin
```

Venue creation, ratings, user actions, and admin operations use authenticated API routes where appropriate.

## Audio analysis

SoundScout accepts a short audio clip as multipart form data at:

```text
POST /api/audio/analyze
```

The backend runs FFmpeg's `volumedetect` filter and returns values such as:

```json
{
  "mean_volume_dbfs": -36.8,
  "max_volume_dbfs": -20.1,
  "loudness_10": 4,
  "suggested_score": 4
}
```

The temporary audio file is removed after analysis.

## Authentication

SoundScout supports passwordless email OTP and Google sign-in. Google OAuth runs through the backend authorization-code flow; the client secret stays on the server, Google identity tokens are signature-verified against Google's rotating public keys, and a short-lived one-time exchange code is returned to the web or Android app. Existing accounts are matched by their verified Google email address. New Google accounts are asked for age and sound-sensitivity details before a SoundScout JWT is issued.

To enable Google sign-in:

1. Create an OAuth 2.0 **Web application** client in Google Cloud Console and configure the OAuth consent screen.
2. Add `https://jellyfin-server.tail0a3780.ts.net/api/auth/google/callback` as an authorized redirect URI (replace the host if your public app URL differs).
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in the backend environment. Keep the client secret private.
4. Rebuild/redeploy the backend and web containers. Android uses the existing `mobile` URL scheme and the backend redirects back to `mobile://auth`; no Google client secret belongs in the APK.

Typical email OTP flow:

```text
Choose Google sign-in or enter email
    |
    v
Google OAuth or request email OTP
    |
    v
Mailtrap sends verification code
    |
    v
Verify code
    |
    v
JWT issued
```

JWTs are used by the frontend for authenticated API requests.

## Deployment

The application can be hosted on a Linux machine with:

- Node.js / Express
- PostgreSQL + PostGIS
- FFmpeg

For a self-hosted setup, Tailscale Funnel can provide a public HTTPS endpoint without directly exposing the database.

Only the web/API service should be exposed. PostgreSQL should remain private.

### Docker and Nginx

The deployment files are:

- `Backend/Dockerfile`: backend image with FFmpeg installed.
- `Dockerfile.web`: static frontend served by Nginx.
- `nginx.conf`: forwards `/api/` requests to a backend service named `backend` on port `4000`.

The web and backend containers must share a Docker network, and the backend service must resolve as `backend` for the Nginx upstream to work. These files do not include a Compose manifest; keep the existing deployment orchestration and do not commit `.env` files or credentials.

## Security notes

- Keep `JWT_SECRET`, database credentials, and Mailtrap credentials outside source control.
- Do not expose PostgreSQL directly to the public internet.
- Use HTTPS in production.
- Audio clips should remain temporary and should not be persisted.
- OTP codes are hashed before being stored.
- OTPs expire and are marked as consumed after successful verification.

## Status

SoundScout is under active development.

Current focus areas include improving the venue sound-data experience, mobile usability, deployment, and production email delivery.

## Author

**Shwetha Partibane**

- GitHub: [@aeroslayys](https://github.com/aeroslayys)

---

Built around a simple idea: **find places that sound right for you.**

## Release notes

The public landing page reads published release notes from `GET /api/release-notes`. Administrators manage drafts and published entries from the Admin Console under **Release notes**.

Apply `Backend/src/migrations/20261115_release_notes.sql` to the production PostgreSQL database before deploying the updated backend. Create a draft in the admin console, review it, and publish it when ready. Unpublishing moves it back to drafts; only published entries are exposed publicly.
