# SoundScout

**Find places that sound right for you.**

SoundScout is a community-powered, map-based web application for discovering places by how they sound. Instead of relying only on photos or generic venue reviews, people can compare quietness ratings, review sound patterns by time of day, and check recent venue updates before visiting.

- **Public landing page:** https://aeroslayys.github.io/Soundscout/
- **Repository:** https://github.com/aeroslayys/Soundscout

## What SoundScout does

### Discover places by sound
- Interactive map built with Leaflet and OpenStreetMap.
- Browse approved venues and search for places by name or location.
- Filter venues by category, wheelchair/step-free access, and gender-neutral toilet availability.
- View community quietness ratings, recent reports, recorded sound measurements, and time-of-day trends.
- Explore a sound heatmap and use **Quiet Near Me** with browser geolocation.
- Compare quietness across four time periods: morning, afternoon, evening, and night.
- Venue location search uses OpenStreetMap Nominatim.

### Contribute community sound data
- Add a venue and submit its first quietness rating.
- Rate a place on a five-point scale:
  1. Loud
  2. Lively
  3. Moderate
  4. Calm
  5. Silent
- Optionally submit a short ambient recording for on-demand audio analysis.
- Add accessibility information for wheelchair/step-free access and gender-neutral toilets.
- Review your own contribution history from your profile.

### Understand recorded sound
- Optional short audio analysis runs on the backend with FFmpeg.
- SoundScout reports mean and maximum digital recording levels in **dBFS**.
- Venue views can show average recorded levels and time-of-day sound trends.

> **Measurement note:** dBFS is a digital recording level, not a calibrated sound-pressure-level (dB SPL) measurement. Results vary with microphones, devices, and recording conditions. A community quietness rating is not a professional acoustic measurement.

### Venue partner tools
SoundScout includes an invitation-based venue partner role alongside the regular community account.

- Admins invite a partner by email for a specific approved venue.
- Invitations are time-limited and tied to the invited email address.
- Partners sign in through the existing SoundScout account system and accept their invitation.
- Partners can manage their assigned venues, review recent community ratings, and view rating trends.
- Partners can publish, edit, and cancel event announcements.
- Event details include event type, schedule, expected crowd level, description, and whether amplified music is expected.
- Admins can activate or revoke partner access and invitations.

### Admin and community operations
The Admin Console provides:
- Dashboard metrics and recent administrative activity.
- Searchable venue management, venue editing, approval/rejection, duplicate detection, and deleted-venue restoration.
- Rating and sound-report management, including soft-delete and restore.
- Community flags and a moderation queue.
- User lookup and account suspension controls.
- Venue partner invitations and access management.
- Email announcement campaigns, including an option to target active venue partners only.
- Release-note drafting, publishing, unpublishing, and deletion.
- An audit log for administrative actions.

Moderation actions that require a reason are recorded in the audit history. User suspension is enforced by the backend, not only hidden in the interface.

### Installable web experience
- Responsive desktop and mobile layouts.
- Progressive Web App manifest, service worker, and install prompt.
- Mobile navigation for Map, Venues, and My Ratings.
- Light and dark themes on supported application surfaces.

The installable phone experience is the web app/PWA. The repository's `mobile/` directory is not currently a complete standalone native application.

## Audio privacy

SoundScout does **not** retain uploaded or recorded audio clips.

A clip is temporarily uploaded to the backend, analyzed with FFmpeg, and removed after analysis. The application stores derived information such as measured dBFS values and whether audio analysis was used, rather than the audio itself.

## Technology

| Area | Technologies |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Maps | Leaflet, Leaflet.heat, OpenStreetMap, Nominatim |
| Backend | Node.js, Express |
| Database | PostgreSQL, PostGIS |
| Authentication | Email OTP, Google OAuth, JWT |
| Password/security utilities | bcryptjs, server-side token verification |
| Audio | FFmpeg, Multer |
| Email | Nodemailer, Gmail SMTP (legacy Mailtrap configuration is also supported) |
| Deployment | Docker images, Nginx, HTTPS reverse proxy |

## Architecture

```text
Browser / Installed PWA
        |
        | HTTPS / REST API
        v
Nginx / Web frontend
        |
        v
Node.js + Express API
   |       |        |
   |       |        +--> Gmail SMTP / email provider
   |       |
   |       +-----------> FFmpeg
   |                     temporary audio analysis
   |
   +-------------------> PostgreSQL + PostGIS
                          venues, ratings, accounts,
                          moderation, partners,
                          events, campaigns, release notes
```

The web frontend is served as static files. Nginx can forward `/api/` requests to the backend service. PostgreSQL should remain private and should not be exposed directly to the public internet.

## Repository layout

```text
Soundscout/
├── Backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── server.js
│       ├── db.js
│       ├── mailer.js
│       ├── middleware/
│       ├── routes/
│       │   ├── auth.js
│       │   ├── audio.js
│       │   ├── venues.js
│       │   ├── users.js
│       │   ├── admin.js
│       │   ├── adminPartners.js
│       │   ├── partner.js
│       │   └── releaseNotes.js
│       └── migrations/
├── admin/                 # Admin Console
├── assets/                # Shared brand assets
├── docs/                  # Public GitHub Pages landing page
├── home/                  # Main map and discovery experience
├── partner/               # Venue partner dashboard
├── profile/               # User profile and contribution history
├── pwa/                   # PWA install prompt assets
├── index.html             # Authentication entry point
├── login.css
├── login.js
├── manifest.webmanifest
├── sw.js
├── Dockerfile.web
└── nginx.conf
```

## Requirements

For local backend development:

- Node.js 18 or newer
- PostgreSQL with PostGIS enabled
- FFmpeg available on the backend host
- A configured SMTP account for email delivery
- A Google OAuth Web application client if Google sign-in is enabled

The application also depends on an existing base SoundScout database schema. The SQL files listed below are additive migrations; they are not a replacement for provisioning the original users, OTP, venues, and ratings tables.

## Local backend setup

Clone the repository and install backend dependencies:

```bash
git clone https://github.com/aeroslayys/Soundscout.git
cd Soundscout/Backend
npm install
```

Create `Backend/.env`:

```env
PORT=4000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_SSL=true

JWT_SECRET=replace-with-a-long-random-secret
ADMIN_EMAIL=admin@example.com

# Comma-separated list of browser origins allowed to call the API
CORS_ORIGIN=http://127.0.0.1:5500,https://aeroslayys.github.io

# Public web application URL used when generating email links
PUBLIC_WEB_URL=https://your-public-soundscout-host.example
PUBLIC_APP_URL=https://your-public-soundscout-host.example

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=https://your-public-soundscout-host.example/api/auth/google/callback
MOBILE_AUTH_REDIRECT_URI=mobile://auth

# Gmail SMTP (use an App Password where required)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
MAIL_FROM=no-reply@example.com
MAIL_FROM_NAME=SoundScout

OTP_EXPIRY_MINUTES=10
OTP_RESEND_COOLDOWN_SECONDS=30
```

Use only the origins and URLs that actually belong to your deployment. If you are not using Google sign-in, the Google OAuth variables can be omitted. Keep real credentials and `.env` files out of source control.

Install and start the API:

```bash
npm start
```

For development with Node's watch mode:

```bash
npm run dev
```

The API listens on port `4000` by default. Check its health endpoint at:

```text
GET http://localhost:4000/health
```

## Database migrations

Apply migrations to the same PostgreSQL database configured by `DATABASE_URL`. Back up the database first, and apply each migration once in chronological order after the original SoundScout schema is present.

From the `Backend/` directory:

```bash
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f src/migrations/20261029_admin_console.sql
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f src/migrations/20261104_email_announcements.sql
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f src/migrations/20261111_venue_partners.sql
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f src/migrations/20261115_release_notes.sql
```

These migrations add:
- Admin moderation, soft-delete/restore, venue approval, suspension, flags, and audit support.
- Announcement preferences, unsubscribe tokens, campaign records, and delivery history.
- Invitation-based venue partner access, venue events, and event audit history.
- Draft and published release notes.

The migrations enable row-level security or revoke client-facing table privileges on sensitive feature tables. The trusted backend database connection is expected to perform those operations. Verify database role permissions and migration results before deploying.

## Authentication

SoundScout supports:
- **Email OTP:** users request a one-time code by email and exchange a verified code for a JWT.
- **Google sign-in:** an optional backend-managed OAuth authorization-code flow. The Google client secret remains on the server.

Configure SMTP for OTP and transactional email delivery. Configure the Google OAuth redirect URI in Google Cloud Console to match `GOOGLE_REDIRECT_URI`. Never place the Google client secret in frontend code.

Venue partner invitations are accepted after signing in with the email address to which the invitation was sent. A normal account does not automatically receive partner permissions; an administrator must issue and manage the invitation.

## Main API areas

| Route | Purpose |
|---|---|
| `/health` | Backend health check |
| `/api/auth` | Email OTP and Google authentication |
| `/api/audio` | Temporary audio analysis |
| `/api/venues` | Venue discovery, search, submission, and ratings |
| `/api/users` | User profile and account actions |
| `/api/admin` | Admin dashboard, moderation, and management |
| `/api/admin/partners` | Partner invitations and access administration |
| `/api/partner` | Partner venues, ratings, and event management |
| `/api/release-notes` | Public published release notes |
| `/api/admin/release-notes` | Admin release-note management |

Authenticated routes require a valid SoundScout JWT unless the endpoint is explicitly public.

## Audio analysis

Submit a short clip as multipart form data to:

```text
POST /api/audio/analyze
```

The backend uses FFmpeg's `volumedetect` filter and returns derived measurements such as mean and maximum volume in dBFS, along with a suggested quietness score. Temporary uploaded files are removed after processing.

## Deployment

The repository includes:
- `Backend/Dockerfile` for the API image, including FFmpeg.
- `Dockerfile.web` for the static frontend served by Nginx.
- `nginx.conf` for forwarding API requests to a backend service named `backend` on port `4000`.

The production Compose/orchestration file and environment configuration are deployment-specific and are not included in this repository. Keep the web and backend containers on a shared Docker network so the Nginx upstream can resolve `backend`. Expose the web/API endpoint over HTTPS; keep PostgreSQL private.

For a self-hosted deployment, a private-network or tunnel-based HTTPS endpoint can be used. Do not expose the database directly to the internet.

## Release notes

Published release notes are served by `GET /api/release-notes` and displayed on the public landing page in `docs/`. Administrators can create drafts, edit entries, publish or unpublish them, and remove entries from **Admin Console → Release notes**.

Apply `20261115_release_notes.sql` before deploying the release-note API. Only published entries are returned by the public endpoint.

## Security and operational notes

- Never commit `.env`, JWT secrets, database credentials, SMTP passwords, or OAuth client secrets.
- Use HTTPS in production and keep PostgreSQL private.
- Keep `CORS_ORIGIN` limited to the origins that should access the API; multiple origins are comma-separated.
- OTPs are time-limited and consumed after successful verification.
- Google identity tokens are verified server-side.
- Audio uploads are temporary and should not be persisted.
- Sensitive partner, campaign, release-note, and moderation operations are performed through authenticated backend routes.
- Back up the database before applying migrations and verify the target database before running SQL.

## Project status

SoundScout is an actively developed web application with working discovery, community rating, audio-analysis, account, admin, and venue-partner feature areas. The installable mobile experience is delivered as a PWA. Features that depend on deployment configuration—such as SMTP delivery, Google OAuth, database migrations, and public HTTPS access—must be configured in the target environment.

## Author

**Shwetha Partibane**

- GitHub: [@aeroslayys](https://github.com/aeroslayys)

---

Built around a simple idea: **find places that sound right for you.**
