# Game Engine Service

Server-authoritative game engine for OneChain Racing.

## Overview

This service implements real-time racing game logic with server-side validation to prevent cheating. The engine runs at 60 FPS and manages game physics, collisions, and state synchronization.

## Architecture

```
GameEngineService (Orchestrator)
    ├─→ EndlessRaceEngine (Game Logic)
    │   ├─→ PhysicsEngine (Arcade Physics)
    │   ├─→ ObstacleManager (Obstacle System)
    │   └─→ PowerUpManager (Power-Up System)
    │
    ├─→ Redis (Real-time State)
    ├─→ PostgreSQL (Persistence)
    └─→ SigningService (Result Verification)
```

## Components

### GameEngineService.ts

Main orchestrator that manages:
- Room lifecycle (create, join, start, stop)
- Game loop @ 60 FPS
- Player state management
- Integration with database and Redis
- Race result signing

**Usage:**
```typescript
import { gameEngineService } from './services/game/GameEngineService';

// Create room
const room = await gameEngineService.createRoom(
  'ENDLESS_RACE',
  playerAddress,
  4,
  '1000000',
  deadline
);

// Join room
await gameEngineService.joinRoom(roomUid, playerAddress, carUid);

// Start game (auto-starts when all players ready)
await gameEngineService.startGame(roomUid);
```

### EndlessRaceEngine.ts

Implements Endless Race game mode:
- Auto-run forward (infinite runner)
- Obstacle avoidance
- Power-up collection
- Collision detection
- Winner determination (furthest distance)

**Game Flow:**
1. Initialize state with player positions
2. Each tick (16ms):
   - Update player physics
   - Spawn obstacles/power-ups
   - Check collisions
   - Update rankings
3. Game ends when:
   - Max duration reached (5 min)
   - Only 1 player remains
   - All players eliminated

### PhysicsEngine.ts

Simple arcade-style physics:
- Velocity-based movement
- Acceleration/braking
- Turning with handling stat
- AABB collision detection
- Friction and drag

**Not a realistic simulation** - optimized for fun gameplay and mobile performance.

### ObstacleManager.ts

Manages obstacle spawning and lifecycle:

**Obstacle Types:**
- `BARRIER` - Instant elimination
- `HAZARD` - 50% slow
- `SLOW_ZONE` - 30% slow

**Spawning:**
- Every 2 seconds
- 50 units ahead of furthest player
- Random lane placement
- Max 20 active obstacles

### PowerUpManager.ts

Manages power-up spawning and effects:

**Power-Up Types:**
- `BOOST` - +50% speed for 5 seconds
- `SHIELD` - Block 1 obstacle hit
- `SLOW_OTHERS` - All others -30% speed for 3 seconds

**Spawning:**
- Every 5 seconds (30% chance)
- 60 units ahead of furthest player
- Random lane placement
- Max 10 active power-ups

## API Endpoints

### Room Management

```bash
POST   /api/game/room/create       # Create room
POST   /api/game/room/:id/join     # Join room
POST   /api/game/room/:id/ready    # Mark ready
GET    /api/game/room/:id          # Get room info
GET    /api/game/rooms              # List rooms
```

### Game State (Polling - WebSocket coming soon)

```bash
GET    /api/game/:roomId/state     # Get current state
POST   /api/game/:roomId/input     # Submit input
```

### Results

```bash
GET    /api/game/:roomId/result    # Get race result
```

## State Storage

### Redis Keys

```
game:room:{roomId}:state    → Full game state (JSON)
game:room:{roomId}:inputs   → Player input queue
game:room:{roomId}:result   → Final race result

TTL: 1 hour
```

### PostgreSQL Tables

- `rooms` - Room metadata
- `room_players` - Player participation
- `races` - Final results with signed data

## Testing with Postman

### 1. Create Room

```bash
POST http://localhost:3000/api/game/room/create
Authorization: Bearer <JWT>

{
  "gameMode": "ENDLESS_RACE",
  "maxPlayers": 2,
  "entryFee": "1000000",
  "deadline": "2025-12-31T23:59:59Z"
}
```

### 2. Join Room

```bash
POST http://localhost:3000/api/game/room/:roomUid/join
Authorization: Bearer <JWT>

{
  "carUid": "0x..."
}
```

### 3. Mark Ready

```bash
POST http://localhost:3000/api/game/room/:roomUid/ready
Authorization: Bearer <JWT>
```

Game auto-starts when all players ready!

### 4. Poll Game State

```bash
GET http://localhost:3000/api/game/:roomUid/state
Authorization: Bearer <JWT>
```

### 5. Submit Input (Optional - Auto-run)

```bash
POST http://localhost:3000/api/game/:roomUid/input
Authorization: Bearer <JWT>

{
  "action": "TURN_LEFT"
}
```

### 6. Get Result

```bash
GET http://localhost:3000/api/game/:roomUid/result
Authorization: Bearer <JWT>
```

## Game Loop Details

**Tick Rate:** 60 FPS (~16.67ms per tick)

**Tick Sequence:**
1. Get state from Redis
2. Process pending inputs
3. Update player physics
4. Check collisions
5. Spawn obstacles/power-ups
6. Clean up old objects
7. Update rankings
8. Check win condition
9. Save state to Redis

**Performance:**
- ~50MB RAM per active game
- ~5% CPU per game @ 60 FPS
- ~1MB Redis per game state

## Car Stats Integration

Stats are fetched from database:
```typescript
const stats = {
  speed: car.baseSpeed + equippedParts.bonusSpeed,
  acceleration: car.baseAcceleration + equippedParts.bonusAcceleration,
  handling: car.baseHandling + equippedParts.bonusHandling,
  drift: car.baseDrift + equippedParts.bonusDrift
};
```

## Security

1. **Server Authority** - All physics calculated server-side
2. **Input Validation** - All inputs validated
3. **Rate Limiting** - Max 10 inputs/second per player
4. **Signed Results** - Race results signed with Ed25519
5. **Anti-Cheat** - Clients can't fake positions/speeds

## Future Enhancements

1. **WebSocket Integration** - Real-time state updates (replace polling)
2. **Other Game Modes** - DragRace, RoyalRumble
3. **Spectator Mode** - Watch live races
4. **Replays** - Store and playback races
5. **Advanced Physics** - Drift mechanics, boost chains
6. **More Obstacles** - Moving obstacles, patterns
7. **Team Modes** - 2v2, relay races

## Troubleshooting

### Game not starting

- Check all players marked ready
- Check room has max players
- Check room status is 'COUNTDOWN' or 'RACING'
- Check Redis connection

### State not updating

- Check game loop is running (check logs)
- Check Redis TTL not expired
- Verify tick rate (should be ~60 FPS)

### Players teleporting

- Check deltaTime calculation
- Verify physics constants
- Check for NaN values in positions

## Development

```bash
# Run backend
npm run dev

# Check active games
GET /api/game/active

# Force stop game
POST /api/game/:roomUid/stop
```

## References

- [Game Plan](../../../../GAME_ENGINE_PLAN.md)
- [Types](../../types/game.ts)
- [Smart Contracts](../../../../onechain_project/SMART_CONTRACT_FUNCTIONS.md)
