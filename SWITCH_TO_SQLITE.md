# 🔄 Switch Database: PostgreSQL → SQLite (Local Dev)

## Kenapa Pakai SQLite untuk Local?

✅ **Zero Configuration** - No install PostgreSQL/Redis
✅ **File-based** - Database = 1 file (portable)
✅ **Fast Setup** - Langsung jalan tanpa server
✅ **Perfect for Testing** - Mudah reset & backup
✅ **Production pakai PostgreSQL** - Best practice!

---

## 🚀 Step-by-Step Migration

### Step 1: Update Prisma Schema

Edit `E:\MiniLabs\backend\prisma\schema.prisma`:

```prisma
// BEFORE (PostgreSQL):
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// AFTER (SQLite):
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

**ATAU** bisa tetap dinamis dengan env:

```prisma
datasource db {
  provider = "sqlite"  // Ubah ini
  url      = env("DATABASE_URL")
}
```

### Step 2: Update .env

Edit `E:\MiniLabs\backend\.env`:

```env
# BEFORE (PostgreSQL):
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/onechain_racing

# AFTER (SQLite):
DATABASE_URL=file:./dev.db
```

### Step 3: Run Migrations

```bash
cd E:\MiniLabs\backend

# Generate Prisma Client
npx prisma generate

# Create database & run migrations
npx prisma migrate dev --name switch_to_sqlite

# Seed dummy data
npx prisma db seed
# ATAU manual run SQL:
# sqlite3 dev.db < seed-test-data.sql (need to convert to SQLite syntax)
```

### Step 4: Start Backend

```bash
npm run dev
```

**Expected output:**
```
✅ Database connected successfully
✅ Redis connected successfully
🚀 Server listening on http://localhost:3000
```

---

## 📊 Comparison

| Feature | SQLite (Local) | PostgreSQL (Production) |
|---------|----------------|-------------------------|
| Setup | ✅ 0 minutes | ⚠️ 10+ minutes |
| Configuration | ✅ None | ⚠️ User/password/port |
| Performance (local) | ✅ Fast | ⚠️ Network overhead |
| Concurrent writes | ⚠️ Limited | ✅ Excellent |
| Production-ready | ❌ No | ✅ Yes |
| Size limit | ⚠️ 140 TB (enough!) | ✅ Unlimited |

---

## 🔧 Redis Alternative for Local

Jika tidak mau install Redis juga, bisa pakai:

### Option 1: In-Memory Store (No Redis)

Edit `src/config/redis.ts`:

```typescript
// Temporary in-memory store for local dev
const memoryStore = new Map();

export class RedisCache {
  async get(key: string): Promise<any> {
    return memoryStore.get(key) || null;
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    memoryStore.set(key, value);
    if (ttl) {
      setTimeout(() => memoryStore.delete(key), ttl * 1000);
    }
    return true;
  }

  // ... other methods
}
```

### Option 2: Redis Docker (Easiest)

```bash
# One-liner to start Redis
docker run -d -p 6379:6379 --name redis-local redis:alpine

# Stop
docker stop redis-local

# Start again
docker start redis-local
```

### Option 3: Redis Windows (Without Docker)

Download: https://github.com/tporadowski/redis/releases
- Download `Redis-x64-5.0.14.1.msi`
- Install dengan default settings
- Auto-start on Windows boot

---

## 🎯 Recommended Setup untuk Local Testing

```env
# .env for LOCAL DEVELOPMENT
NODE_ENV=development
PORT=3000

# SQLite Database (file-based, no server)
DATABASE_URL=file:./dev.db

# Redis (Docker atau in-memory)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT (random string untuk local)
JWT_SECRET=local-dev-secret-key-onechain-2024
JWT_EXPIRES_IN=7d

# Blockchain (testnet OK untuk local)
ONECHAIN_RPC_URL=https://rpc-testnet.onelabs.cc:443
BACKEND_PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000001
```

---

## 🚀 Production Deployment (.env.production)

```env
# .env.production (for Railway/Vercel/AWS)
NODE_ENV=production
PORT=3000

# PostgreSQL (cloud database)
DATABASE_URL=postgresql://user:pass@db.railway.app:5432/production_db

# Redis (cloud)
REDIS_HOST=redis.railway.app
REDIS_PORT=6379
REDIS_PASSWORD=strong-password-here

# JWT (generate secure random)
JWT_SECRET=<generate-with-openssl-rand-hex-64>
JWT_EXPIRES_IN=7d

# Blockchain (mainnet)
ONECHAIN_RPC_URL=https://rpc-mainnet.onelabs.cc:443
BACKEND_PRIVATE_KEY=<your-real-private-key>
```

---

## 🔄 Migration Path

```
Local Development (SQLite + in-memory)
         ↓
Testing/Staging (SQLite + Redis Docker)
         ↓
Production (PostgreSQL + Redis Cloud)
```

**Key Point:** Prisma ORM abstracts the database, jadi code tetap sama!

---

## 📝 Quick Commands

```bash
# Reset database (SQLite)
rm dev.db
npx prisma migrate dev --name reset

# View database (SQLite)
npx prisma studio
# Opens browser to view/edit data

# Backup database (SQLite)
cp dev.db dev.db.backup

# Switch back to PostgreSQL
# Just change provider in schema.prisma and DATABASE_URL in .env
```

---

## ✅ Testing Checklist

After switching to SQLite:

- [ ] `npx prisma migrate dev` works
- [ ] `npm run dev` starts without errors
- [ ] Can create dummy users via SQL/Prisma Studio
- [ ] Can generate JWT tokens
- [ ] WebSocket connects successfully
- [ ] Game runs locally

---

**BOTTOM LINE:**
- ✅ **Local Dev:** SQLite (super easy!)
- ✅ **Production:** PostgreSQL (scalable!)
- ✅ **Code:** Same code works for both!

🚀 Ready to test dengan SQLite!
