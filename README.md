# OneChain Racing Game - Backend

Backend server untuk OneChain Racing Game. Built with Node.js, TypeScript, Express, PostgreSQL, dan Redis.

## Features

- **Game Engine**: Server-authoritative physics simulation untuk 3 game modes (Drag Race, Endless Race, Royal Rumble)
- **Blockchain Integration**: Indexer untuk OneChain events, Ed25519 signature verification
- **Gacha System**: Commit-Reveal mechanism dengan backend pricing
- **Marketplace**: NFT trading untuk Cars dan SpareParts
- **Prediction Market**: Pool-based betting system
- **Quest System**: Daily/Weekly quests dengan rewards
- **RWA Physical Claim**: Integration untuk physical diecast fulfillment
- **WebSocket**: Real-time game communication dan spectator mode

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 14
- Redis >= 6
- npm >= 9.0.0

## Installation

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env dengan konfigurasi yang sesuai

# Generate Prisma Client
npm run prisma:generate

# Run database migrations
npm run migrate

# Run development server
npm run dev
```

## Project Structure

```
backend/
├── src/
│   ├── app.ts                  # Entry point
│   ├── config/                 # Configuration files
│   ├── middleware/             # Express middleware
│   ├── services/               # Business logic
│   │   ├── game/              # Game engine
│   │   ├── gacha/             # Gacha system
│   │   ├── signing/           # Ed25519 signing
│   │   └── ...
│   ├── routes/                # API routes
│   ├── websocket/             # WebSocket handlers
│   ├── indexer/               # Blockchain event listener
│   ├── models/                # Database models
│   └── utils/                 # Utility functions
├── prisma/
│   └── schema.prisma          # Database schema
└── package.json
```

## Available Scripts

- `npm run dev` - Start development server dengan hot reload
- `npm run build` - Build untuk production
- `npm start` - Run production server
- `npm run migrate` - Run database migrations
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:studio` - Open Prisma Studio (DB GUI)
- `npm run indexer` - Run blockchain indexer
- `npm test` - Run tests
- `npm run lint` - Lint code
- `npm run format` - Format code dengan Prettier

## API Endpoints

### Auth
- `POST /api/auth/connect` - Wallet connect + JWT
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Get current user

### Game
- `POST /api/game/room/create` - Create room
- `POST /api/game/room/:id/join` - Join room
- `GET /api/game/rooms` - List active rooms
- `WS /ws/game/:roomId` - Game WebSocket

### Gacha
- `GET /api/gacha/tiers` - Get tiers & probabilities
- `POST /api/gacha/commit` - Commit gacha pull
- `POST /api/gacha/reveal` - Reveal result
- `GET /api/gacha/history` - Get history

### Marketplace
- `GET /api/marketplace/listings` - List all listings
- `POST /api/marketplace/list` - Create listing
- `POST /api/marketplace/buy/:id` - Buy NFT
- `POST /api/marketplace/cancel/:id` - Cancel listing

### Prediction
- `GET /api/prediction/pools` - List active pools
- `POST /api/prediction/bet` - Place bet
- `POST /api/prediction/claim/:roomId` - Claim payout

### Quest
- `GET /api/quest/daily` - Get daily quests
- `POST /api/quest/claim/:questId` - Claim reward

### Inventory
- `GET /api/inventory/cars` - Get user's cars
- `GET /api/inventory/spareparts` - Get user's spareparts
- `POST /api/inventory/equip` - Equip part
- `POST /api/inventory/unequip` - Unequip part

### RWA
- `POST /api/rwa/claim` - Claim physical diecast
- `GET /api/rwa/claims` - Get claim history
- `GET /api/rwa/claim/:carUid/status` - Get shipping status

## Environment Variables

Lihat `.env.example` untuk daftar lengkap environment variables yang dibutuhkan.

## Database Schema

Database menggunakan PostgreSQL dengan Prisma ORM. Schema mencakup:

- **Users**: Player accounts
- **Cars & SpareParts**: NFT metadata
- **Rooms & Races**: Game rooms dan race results
- **MarketListings**: Marketplace listings
- **Bets & PredictionPools**: Prediction market
- **Quests & QuestProgress**: Quest system
- **PhysicalClaims**: RWA claim tracking
- **EventLogs**: Blockchain event logs

## Security

- JWT authentication untuk API endpoints
- Ed25519 signature verification untuk blockchain transactions
- Rate limiting per endpoint
- CORS configuration
- Nonce-based anti-replay protection
- Bcrypt password hashing (jika menggunakan email/password auth)

## Deployment

```bash
# Build
npm run build

# Run migrations
npm run migrate:deploy

# Start production server
npm start
```

Atau gunakan Docker:

```bash
docker-compose up -d
```

## License

MIT
