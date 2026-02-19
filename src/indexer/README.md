# OneChain Blockchain Indexer

Real-time blockchain event listener and database synchronizer for OneChain Racing Game.

## Overview

The indexer listens to all smart contract events from the deployed OneChain package and automatically syncs data to the PostgreSQL database. This ensures that the backend has an up-to-date view of all on-chain state changes.

## Architecture

```
Blockchain Events → EventListener → EventDecoder → EventHandler → Database
```

### Components

1. **EventListener.ts**
   - Listens to blockchain events via polling or WebSocket
   - Manages checkpoints for resumable indexing
   - Handles batch processing and rate limiting

2. **EventDecoder.ts**
   - Decodes raw event payloads into typed objects
   - Validates event structure
   - Extracts relevant data from each event type

3. **EventHandler.ts**
   - Processes decoded events
   - Updates database records
   - Ensures data consistency
   - Logs all events for auditing

4. **index.ts**
   - Main entry point
   - Manages indexer lifecycle
   - Implements retry logic and error handling

## Supported Events

### NFT Events
- `CarMinted` - New car NFT minted
- `CarBurned` - Car NFT burned (RWA claim)
- `SparePartMinted` - New sparepart NFT minted
- `SparePartBurned` - Sparepart NFT burned (RWA claim)

### Equipment Events
- `PartEquipped` - Sparepart equipped to car
- `PartUnequipped` - Sparepart removed from car

### Game Events
- `RoomCreated` - New race room created
- `RoomApproved` - Player approved and paid entry fee
- `RoomStarted` - Race started
- `RaceFinalized` - Race finished with results

### Gacha Events
- `GachaCommitted` - Gacha pull committed
- `GachaResult` - Gacha result revealed

### Marketplace Events
- `CarListed` - Car listed for sale
- `SparePartListed` - Sparepart listed for sale
- `NFTSold` - NFT sold
- `ListingCancelled` - Listing cancelled

### Prediction Events
- `PoolCreated` - Prediction pool created
- `BetPlaced` - Bet placed on race outcome
- `PredictionSettled` - Prediction pool settled
- `PayoutClaimed` - Winning bet payout claimed

### RWA Events
- `PhysicalClaimed` - Physical diecast claimed

## Configuration

Environment variables (set in `.env`):

```env
# Indexer Configuration
INDEXER_START_CHECKPOINT=0        # Starting checkpoint (0 = from beginning)
INDEXER_BATCH_SIZE=100            # Events per batch
INDEXER_POLL_INTERVAL=5000        # Polling interval in ms

# Blockchain
ONECHAIN_RPC_URL=https://rpc.onechain.network
ONECHAIN_WSS_URL=wss://wss.onechain.network
PACKAGE_ID=0x6464f5548466c1b01f2ce008ea14807540e15c5c68df1af17a208524c2ba17a6
```

## Running the Indexer

### Development
```bash
npm run indexer
```

### Production
```bash
npm run build
node dist/indexer/index.js
```

### As a Service (PM2)
```bash
pm2 start dist/indexer/index.js --name onechain-indexer
pm2 save
pm2 startup
```

### Docker
```bash
docker-compose up indexer
```

## Features

### Checkpoint-Based Resume
The indexer tracks the last processed transaction digest. If the indexer stops and restarts, it resumes from the last checkpoint, preventing duplicate processing.

### Automatic Retry
If an error occurs during event processing, the indexer implements exponential backoff retry logic:
- Initial retry delay: 5 seconds
- Max retry delay: 60 seconds
- Max retries: 5 attempts

### Event Logging
All events are logged to the `event_logs` table for debugging and auditing:
```sql
SELECT * FROM event_logs
WHERE event_type = 'CarMinted'
ORDER BY indexed_at DESC
LIMIT 10;
```

### User Auto-Creation
When an event references a user address that doesn't exist in the database, the indexer automatically creates a user record.

### Data Consistency
The indexer uses database transactions and upserts to ensure data consistency even during restarts or concurrent processing.

## Monitoring

### Check Indexer Status
```bash
# View logs
tail -f logs/combined.log

# Check last processed event
SELECT * FROM event_logs ORDER BY indexed_at DESC LIMIT 1;

# Count events by type
SELECT event_type, COUNT(*) as count
FROM event_logs
GROUP BY event_type
ORDER BY count DESC;
```

### Health Checks
The indexer logs heartbeat messages and connection status. Monitor these to ensure it's running correctly.

## Troubleshooting

### Indexer Not Processing Events
1. Check blockchain connection: `ONECHAIN_RPC_URL` is correct
2. Verify package ID matches deployed contract
3. Check database connection
4. Review logs for errors

### Duplicate Events
The indexer uses `upsert` operations keyed by transaction digest to prevent duplicates. If you see duplicates:
1. Check `txDigest` unique constraints
2. Verify checkpoint is being updated correctly

### Missing Events
If events are missing from the database:
1. Check `INDEXER_START_CHECKPOINT` - may need to reindex from 0
2. Verify event types are correct in `blockchain.ts`
3. Check if event decoding is failing (review logs)

### High Memory Usage
If indexer consumes too much memory:
1. Reduce `INDEXER_BATCH_SIZE`
2. Increase `INDEXER_POLL_INTERVAL`
3. Consider using WebSocket mode instead of polling

## Development

### Adding New Event Type

1. Add event type to `config/blockchain.ts`:
```typescript
export const eventTypes = {
  // ... existing events
  NewEvent: `${env.packageId}::module::NewEvent`,
};
```

2. Add type definition to `types/blockchain.ts`:
```typescript
export interface NewEventData {
  field1: string;
  field2: number;
}
```

3. Add decoder in `EventDecoder.ts`:
```typescript
case eventTypes.NewEvent:
  return this.decodeNewEvent(event);
```

4. Add handler in `EventHandler.ts`:
```typescript
case eventTypes.NewEvent:
  await this.handleNewEvent(event, decodedEvent);
  break;
```

5. Implement the handler:
```typescript
private static async handleNewEvent(
  event: SuiEvent,
  data: NewEventData
): Promise<void> {
  // Update database
  await prismaClient.someTable.create({
    data: { ... }
  });

  logger.info(`New event processed: ${data.field1}`);
}
```

## Performance

The indexer is designed to handle high throughput:
- Batch processing: Up to 100 events per batch
- Concurrent handlers: Multiple event types processed in parallel
- Efficient queries: Uses indexes and upserts
- Connection pooling: Reuses database connections

Expected performance:
- **Polling mode**: 20-50 events/second
- **WebSocket mode**: 100+ events/second

## Security

- Read-only blockchain access (no private keys needed)
- Database writes are validated and sanitized
- Event signatures are verified before processing
- Nonce checking prevents replay attacks

## License

MIT
