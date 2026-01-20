<p align="center">
  <h1 align="center">BagStats Backend</h1>
</p>

<p align="center">
  <strong>API server for BagStats iOS app</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-green.svg" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/Express-4.x-lightgrey.svg" alt="Express">
  <img src="https://img.shields.io/badge/SQLite-3-blue.svg" alt="SQLite">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License"></a>
</p>

---

## Overview

Backend server for [BagStats iOS](https://github.com/Pavelevich/bagstats-ios) - proxies requests to Bags.fm API, handles caching, and manages push notifications.

## Features

- **Bags.fm API Proxy** — Secure API key handling
- **Wallet Stats** — Aggregates claimed + unclaimed fees
- **Token Metadata** — Fetches logos from Jupiter API
- **Push Notifications** — APNs integration for iOS
- **Caching** — 5-minute TTL to avoid rate limits
- **Share Cards** — Generate PNG images for social sharing

## Requirements

- Node.js 18+
- npm or yarn
- Bags.fm API key (get at [bags.fm](https://bags.fm))
- Apple Developer account (for push notifications)

## Installation

```bash
# Clone the repository
git clone https://github.com/Pavelevich/bagstats-backend.git
cd bagstats-backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env

# Start server
npm start
```

## Configuration

Create a `.env` file based on `.env.example`:

```env
# Server
PORT=3001
NODE_ENV=development

# Bags.fm API (required)
BAGS_API_KEY=your_bags_api_key_here

# Database
DATABASE_PATH=./data/bagstats.db

# Apple Push Notifications (optional)
APNS_KEY_PATH=./certs/AuthKey.p8
APNS_KEY_ID=your_key_id
APNS_TEAM_ID=your_team_id
APNS_BUNDLE_ID=xyz.bagstats.app
```

## API Endpoints

### Wallet Stats

```
GET /api/wallet/:address/stats
```

Returns wallet earnings from Bags.fm:

```json
{
  "totalEarned": 1234.56,
  "unclaimedFees": 123.45,
  "claimedFees": 1111.11,
  "tokensCount": 5,
  "positionsCount": 8,
  "tokens": [...]
}
```

### Push Notifications

```
POST /api/subscriptions
Body: { "deviceToken": "...", "wallet": "...", "platform": "ios" }

DELETE /api/subscriptions/:wallet
Headers: X-Device-Token: ...

GET /api/subscriptions
Headers: X-Device-Token: ...
```

### Share Image

```
GET /api/share-image?total=$1,234&unclaimed=$123&claimed=$1,111&tokens=5&positions=8
```

Returns a PNG image for social sharing.

### Health Check

```
GET /health
```

## Project Structure

```
backend/
├── src/
│   ├── index.js           # Main server + routes
│   ├── routes/
│   │   └── subscriptions.js
│   └── services/
│       ├── apns.js        # Apple Push Notifications
│       ├── bagMonitor.js  # Polling for new bags
│       └── database.js    # SQLite queries
├── certs/                 # APNs certificates (not in git)
├── data/                  # SQLite database (not in git)
├── .env.example
└── package.json
```

## Push Notifications Setup

1. Go to [Apple Developer Portal](https://developer.apple.com)
2. Create a new Key for APNs
3. Download the `.p8` file
4. Place it in `certs/AuthKey.p8`
5. Add Key ID and Team ID to `.env`

## Development

```bash
# Run with auto-reload
npm run dev

# Run production
npm start
```

## Deployment

Works with any Node.js hosting:

- **Railway** — `railway up`
- **Render** — Connect GitHub repo
- **DigitalOcean** — Use App Platform or Droplet
- **Vercel** — Not recommended (serverless limitations)

### PM2 (VPS)

```bash
npm install -g pm2
pm2 start src/index.js --name bagstats
pm2 save
```

## Related

- [BagStats iOS](https://github.com/Pavelevich/bagstats-ios) — Native iOS app

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built by <a href="https://github.com/Pavelevich">Tetsuo Corp.</a>
</p>

<p align="center">
  <sub>Free to use, fork, and build on.</sub>
</p>
