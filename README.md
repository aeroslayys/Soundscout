# SoundScout

SoundScout is a map-based platform for discovering places by **how they sound**.

Instead of relying only on photos or generic venue reviews, SoundScout helps people understand a venue's sound environment before visiting. Users can contribute quietness ratings, optionally analyze a short ambient recording, compare sound levels by time of day, and find calmer places nearby.

The project includes a browser-based web application and a React Native mobile application built with Expo.

## Features

### Venue discovery and sound data

- Interactive map with venue markers (Leaflet on web; native map integration on Android)
- Quietness ratings on a 1–5 scale:
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
- Browser/device location support
- Venue search through OpenStreetMap Nominatim
- Accessibility and gender-neutral toilet tags

### Accounts and moderation

- Passwordless email OTP authentication
- User profiles
- Admin operations dashboard with searchable venues, ratings, users, and audit history
- Soft-delete and restore for ratings and venues, with required moderation reasons
- Venue approval/rejection and likely-duplicate detection
- Community flags and moderation queue
- User suspension controls enforced by the backend
- Light and dark themes
- Responsive web layout

### Mobile application

The mobile client lives in `mobile/` and uses **React Native and Expo**.

- Expo Router-based application structure
- Native Android application with package ID `com.soundscout.mobile`
- Native map support through `react-native-maps`
- Location and microphone/audio permissions
- Expo Audio integration for recording-related functionality
- Shared SoundScout backend/API
- Android release APK build through Gradle
- EAS Build configuration for cloud iOS builds

The Android native project is checked in so its Gradle configuration, manifest settings, and native resources are versioned with the app. Generated build output and machine-specific files should not be committed.

An iOS EAS build has not yet been published. Building for iOS distribution requires Apple signing credentials and an Apple Developer Program membership.

## Audio privacy

SoundScout does **not** persist uploaded or recorded audio clips.

A clip is temporarily uploaded to the backend, analyzed with FFmpeg, and deleted immediately after analysis. The application stores only derived information such as the measured dBFS value and whether audio analysis was used.

> dBFS is a digital recording level, not a calibrated sound-pressure-level (dB SPL) measurement. Results can vary between microphones and devices.

## Tech stack

### Web frontend

- HTML
- CSS
- Vanilla JavaScript
- Leaflet and Leaflet.heat
- OpenStreetMap

### Mobile frontend

- React Native
- Expo
- Expo Router
- react-native-maps
- Expo Audio

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

### Deployment

- Docker
- Nginx
- Tailscale Funnel (self-hosted public HTTPS access)

## Architecture

```text
Web browser                 iOS / Android app
     |                             |
     v                             v
Web frontend                 React Native + Expo
     |                             |
     +-------------+---------------+
                   |
                   | HTTPS / REST
                   v
             Node.js + Express
                   |
          +--------+--------+
          |        |        |
          v        v        v
     PostgreSQL  FFmpeg   Mail service
      + PostGIS  temporary   OTP delivery
                 audio
                 analysis
```

The project can be self-hosted and exposed securely over HTTPS using a service such as **Tailscale Funnel**.

## Project structure

```text
Soundscout/
├── index.html
├── login.css
├── login.js
├── home/
├── profile/
├── admin/
├── mobile/
│   ├── app/
│   ├── assets/
│   ├── android/
│   ├── app.json
│   ├── eas.json
│   └── package.json
└── Backend/
    ├── package.json
    └── src/
        ├── server.js
        ├── db.js
        ├── mailer.js
        ├── middleware/
        ├── routes/
        └── migrations/
```

## Requirements

### Backend

- Node.js 18 or newer
- PostgreSQL
- PostGIS
- FFmpeg

A PostgreSQL database with the SoundScout tables is also required. The current application expects tables including users, OTP codes, venues, and ratings.

### Mobile development

- Node.js and npm
- Android SDK and a compatible JDK for local Android builds
- Expo dependencies installed from `mobile/package.json`
- An Android device or emulator for testing

iOS native builds require macOS/Xcode when building locally, or EAS Build with Apple signing credentials when building in the cloud.

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

## Mobile setup

From the repository root:

```bash
cd mobile
npm install
```

Start the Expo development server:

```bash
npx expo start
```

### Android release APK

The native Android project is in `mobile/android/`. To build a release APK locally:

```bash
cd mobile/android
./gradlew assembleRelease
```

The APK is generated at:

```text
app/build/outputs/apk/release/app-release.apk
```

#### Google Maps API key

For local Android builds, place the Google Maps key in `mobile/android/local.properties`:

```properties
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

The Android Gradle configuration passes this value to the manifest through a placeholder. Do not commit `local.properties` or hardcode a real key in the manifest. Restrict the key in Google Cloud Console to the Android application ID and signing certificate fingerprints used for the relevant builds, and enable only the APIs the app needs.

### EAS Build

The mobile project includes `eas.json` for cloud builds. After installing or invoking the EAS CLI and signing in:

```bash
cd mobile
npx eas-cli build --platform android --profile production
```

For iOS cloud builds:

```bash
npx eas-cli build --platform ios --profile production
```

iOS distribution requires Apple signing credentials. An EAS configuration alone does not mean an iOS build has been published.

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

SoundScout uses passwordless email OTP authentication.

Typical flow:

```text
Enter email
    |
    v
Request OTP
    |
    v
Mail service sends verification code
    |
    v
Verify code
    |
    v
JWT issued
```

JWTs are used by the frontend for authenticated API requests.

## Deployment

The backend can be hosted on a Linux machine with:

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

- Keep `JWT_SECRET`, database credentials, mail credentials, and API keys out of source control.
- Restrict Google Maps API keys by application and signing certificate; a key embedded in a mobile app can be extracted from the app package.
- Do not expose PostgreSQL directly to the public internet.
- Use HTTPS in production.
- Audio clips should remain temporary and should not be persisted.
- OTP codes are hashed before being stored.
- OTPs expire and are marked as consumed after successful verification.
- Review the contents of release APKs before publishing them. Do not include private endpoints, credentials, or development-only configuration.

## Status

SoundScout is under active development.

The web application, backend, admin/moderation features, and Android mobile build are part of the current project. Mobile polish, release hardening, iOS signing/distribution, and further improvements to venue sound-data coverage remain ongoing work.

## Author

**Shwetha Partibane**

- GitHub: [@aeroslayys](https://github.com/aeroslayys)

---

Built around a simple idea: **find places that sound right for you.**
