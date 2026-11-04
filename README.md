# SoundScout

**Find places that sound right for you.**

🌐 **[Visit the SoundScout landing page](https://aeroslayys.github.io/Soundscout/)** — learn about the project, explore its features, and share feedback.

🖥️ **[Open SoundScout on the web](https://jellyfin-server.tail0a3780.ts.net)** — use SoundScout directly in your browser; no app installation needed.

📱 **[Get the Android beta APK](https://github.com/aeroslayys/Soundscout/releases)** — install the mobile app.

> [!NOTE]
> **We're still building the SoundScout data map, and we need your help!**
>
> SoundScout is in its early stages, so venue coverage and sound reports are currently limited. If you use the app, please help us grow the community dataset:
> - **Log the places you visit** by adding a quietness rating and a sound report.
> - **Include when you visited** and what the environment was like. Sound levels can change throughout the day.
> - **Contribute regularly** — even a quick rating helps someone else decide where to go.
> - **Try optional audio analysis** if you're comfortable doing so; a written observation is useful too.
>
> More real-world contributions mean better coverage, more useful comparisons, and a more helpful SoundScout for everyone. Start by [opening the web app](https://jellyfin-server.tail0a3780.ts.net) or [installing the Android beta](https://github.com/aeroslayys/Soundscout/releases).

SoundScout is a community-powered platform for discovering places based on their sound environment—not just their photos, menus, or star ratings.

A café can look perfect online and still be too loud to work in. A restaurant can have great reviews but be overwhelming for a quiet conversation. SoundScout helps people get a better idea of what a place may actually feel like before they visit.

SoundScout brings together community quietness ratings, optional short audio analysis, sound reports, and location-based discovery so people can make choices that suit their needs.

## Who is SoundScout for?

SoundScout is useful for anyone whose choice of venue is affected by its noise level or accessibility.

- **People who prefer quieter spaces** — find calmer cafés, restaurants, and other venues for reading, relaxing, or spending time.
- **Students and remote workers** — look for places that may be suitable for studying, working, or taking calls.
- **People who are sensitive to noise** — get more context about a venue's sound environment before making the trip.
- **People with accessibility needs** — check community-provided venue information, including accessibility features and gender-neutral toilet availability.
- **Friends, families, and groups** — choose a place where everyone can comfortably talk and spend time.
- **Local explorers** — contribute observations and help others discover places beyond the usual highly rated options.

SoundScout is intended to support informed decisions. It does not guarantee that a venue will be quiet or accessible at the time you visit.

## Why use SoundScout instead of ordinary maps and review apps?

Traditional map and review platforms are useful for finding businesses, checking directions, viewing photos, and reading general feedback. But a venue's sound environment is often difficult to understand from a star rating or a few reviews.

SoundScout focuses on that missing piece.

| What you want to know | Typical map or review app | SoundScout |
|---|---|---|
| Is this place generally loud or calm? | May be mentioned in free-form reviews | Dedicated community quietness ratings |
| How does its sound level vary? | Usually difficult to compare | Recorded sound information and time-of-day trends |
| Can I find calmer places nearby? | Usually requires reading many reviews | Quiet Near Me filtering |
| Can I contribute sound observations? | Not usually a dedicated workflow | Sound reports and optional audio analysis |
| Does the venue have accessibility information? | Coverage varies | Dedicated accessibility and gender-neutral toilet tags |

SoundScout is not intended to replace general-purpose maps, navigation, or review platforms. It complements them by making sound and relevant accessibility details easier to discover and compare.

## What you can do with SoundScout

### Discover places by sound

- Explore venues on an interactive map.
- View community quietness ratings on a 1–5 scale:
  - **1 — Loud**
  - **2 — Lively**
  - **3 — Moderate**
  - **4 — Calm**
  - **5 — Silent**
- Use **Quiet Near Me** to focus on calmer places around you.
- Filter venues by category and available accessibility facilities.
- View a sound heatmap to understand reported patterns across an area.
- Explore clustered venue markers and open venue details without leaving the map.

### Understand a venue's sound environment

- Read recent community sound reports.
- Compare recorded sound information across times of day.
- View average recorded-level information for venues.
- Optionally submit a short ambient recording for analysis.
- See sound-level information derived from recordings, including mean and maximum digital recording levels.
- Use audio-assisted rating suggestions as a starting point, then adjust the rating before submitting.

### Share useful venue information

- Submit quietness ratings and sound observations.
- Add a venue by searching for its location, confirming its exact map pin, selecting its category, and providing accessibility details.
- Submit a new venue together with its initial quietness rating.
- New venue submissions enter a pending review state and appear on the public map after admin approval.
- Contribute information that helps other people decide where to go.

### Manage your account and community

- Sign in or create an account using passwordless email verification codes.
- Complete the app's welcome flow and continue to venue discovery or contribution.
- Maintain a user profile.
- Flag community content for review.
- Benefit from venue approval and moderation workflows that help maintain the quality of community information.

### Mobile and web

SoundScout includes a browser-based experience and a native Android application built with React Native and Expo.

The Android app includes:
- A dedicated welcome and sign-in entry point.
- Native map discovery, venue markers, clustering, heatmap visualization, and venue detail sheets.
- Quiet Near Me and category/accessibility filters.
- Venue search and a guided add-venue flow with map pin confirmation.
- Audio recording and optional audio-assisted quietness ratings.
- Theme-aware screens and native navigation.

The Android application is distributed as an APK through the [GitHub Releases page](https://github.com/aeroslayys/Soundscout/releases). iOS distribution is not currently published.

## A note about audio measurements

SoundScout can analyze short ambient recordings and display derived digital recording levels.

**dBFS is not the same as calibrated sound pressure level (dB SPL).** Measurements can vary with the phone, microphone, recording settings, distance, and surrounding conditions. SoundScout's audio information should be treated as an additional point of reference—not as a laboratory-grade noise measurement or a guarantee of what you will hear when you arrive.

## Audio privacy

SoundScout does **not** persist uploaded or recorded audio clips.

A submitted clip is temporarily processed for analysis and deleted after analysis. The application stores derived information, such as measured digital recording levels and whether audio analysis was used, rather than retaining the recording itself.

## Current project status

SoundScout is under active development. The project includes venue discovery, community sound ratings and reports, optional audio analysis, passwordless user accounts, accessibility information, venue submission and approval, moderation tools, a web experience, and a native Android build.

The usefulness of SoundScout improves as more people contribute accurate, recent observations. Venue conditions can change by day, time, event, and crowd size, so community contributions are most helpful when they reflect when the observation was made.

## Author

**Shwetha Partibane**

- GitHub: [@aeroslayys](https://github.com/aeroslayys)

---

Built around a simple idea: **find places that sound right for you.**
