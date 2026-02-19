# Auth Service

Web3 wallet authentication system using signature-based verification and JWT tokens.

## Overview

The auth service implements a **signature-based authentication** flow where users prove ownership of their wallet by signing a message. No passwords required!

## Authentication Flow

```
1. Client: Request nonce for wallet address
   ↓
2. Backend: Generate nonce + sign message
   ↓
3. Client: Sign message with wallet
   ↓
4. Backend: Verify signature
   ↓
5. Backend: Issue JWT tokens (access + refresh)
   ↓
6. Client: Use access token for API requests
```

## API Endpoints

### POST /api/auth/nonce
Get nonce for wallet signing.

**Request:**
```json
{
  "address": "0x4482a362abba1279a198816e7f914414ceb5642f329d06468e76f4d8ef09ea15"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "nonce": "a1b2c3d4e5f6...",
    "message": "OneChain Racing Game - Sign in\n\nWallet Address: 0x4482...\nNonce: a1b2c3d4...\n\nThis request will not trigger a blockchain transaction or cost any gas fees."
  }
}
```

### POST /api/auth/connect
Wallet connect - verify signature and get JWT.

**Request:**
```json
{
  "address": "0x4482a362abba1279a198816e7f914414ceb5642f329d06468e76f4d8ef09ea15",
  "signature": "0xabcd1234...",
  "message": "OneChain Racing Game - Sign in\n\n..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid-123",
      "address": "0x4482...",
      "username": "player123"
    }
  },
  "message": "Authentication successful"
}
```

### POST /api/auth/refresh
Refresh access token using refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Token refreshed successfully"
}
```

### GET /api/auth/me
Get current user info (requires authentication).

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-123",
    "address": "0x4482...",
    "username": "player123",
    "email": "player@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "lastLogin": "2024-01-15T10:30:00.000Z"
  }
}
```

### POST /api/auth/logout
Logout and invalidate refresh token.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### PUT /api/auth/profile
Update user profile.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request:**
```json
{
  "username": "newusername",
  "email": "newemail@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-123",
    "address": "0x4482...",
    "username": "newusername",
    "email": "newemail@example.com"
  },
  "message": "Profile updated successfully"
}
```

### GET /api/auth/check-username/:username
Check if username is available.

**Response:**
```json
{
  "success": true,
  "data": {
    "username": "player123",
    "available": true
  }
}
```

### GET /api/auth/user/:address
Get public user info by wallet address.

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "0x4482...",
    "username": "player123",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## Client Implementation Example

### React/TypeScript

```typescript
import axios from 'axios';

class AuthClient {
  private baseUrl = 'http://localhost:3000/api/auth';
  private accessToken: string | null = null;

  // Step 1: Get nonce
  async getNonce(address: string): Promise<{ nonce: string; message: string }> {
    const response = await axios.post(`${this.baseUrl}/nonce`, { address });
    return response.data.data;
  }

  // Step 2: Sign message with wallet
  async signMessage(message: string): Promise<string> {
    // Use wallet provider to sign (e.g., Sui Wallet)
    // This is pseudocode - actual implementation depends on wallet
    const signature = await window.suiWallet.signMessage(message);
    return signature;
  }

  // Step 3: Connect and get JWT
  async connect(address: string): Promise<void> {
    // Get nonce
    const { nonce, message } = await this.getNonce(address);

    // Sign message
    const signature = await this.signMessage(message);

    // Authenticate
    const response = await axios.post(`${this.baseUrl}/connect`, {
      address,
      signature,
      message,
    });

    // Store tokens
    this.accessToken = response.data.data.accessToken;
    localStorage.setItem('refreshToken', response.data.data.refreshToken);
  }

  // Get authenticated user
  async getMe() {
    const response = await axios.get(`${this.baseUrl}/me`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });
    return response.data.data;
  }

  // Refresh token
  async refresh() {
    const refreshToken = localStorage.getItem('refreshToken');
    const response = await axios.post(`${this.baseUrl}/refresh`, {
      refreshToken,
    });
    this.accessToken = response.data.data.accessToken;
    localStorage.setItem('refreshToken', response.data.data.refreshToken);
  }

  // Logout
  async logout() {
    await axios.post(`${this.baseUrl}/logout`, null, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });
    this.accessToken = null;
    localStorage.removeItem('refreshToken');
  }
}

// Usage
const authClient = new AuthClient();
await authClient.connect('0x4482...');
const user = await authClient.getMe();
```

## Security Features

### Nonce System
- Each wallet address has a unique nonce
- Nonce changes after every successful login
- Prevents replay attacks
- Stored in both cache (5 min TTL) and database

### JWT Tokens
- **Access Token**: Short-lived (7 days default)
  - Used for API authentication
  - Stored in memory (not localStorage for security)
- **Refresh Token**: Long-lived (30 days default)
  - Used to get new access tokens
  - Stored in Redis with user ID
  - Can be invalidated on logout

### Signature Verification
- Message includes wallet address and nonce
- Standard format prevents phishing
- Clearly states "no gas fees" to user
- TODO: Implement proper Sui signature verification

### Rate Limiting
- Auth endpoints have strict rate limits
- 5 requests per minute for sensitive operations
- Prevents brute force attacks

## Token Management

### Access Token
```
Expiry: 7 days (configurable via JWT_EXPIRES_IN)
Payload: { userId, address, username }
```

### Refresh Token
```
Expiry: 30 days (configurable via JWT_REFRESH_EXPIRES_IN)
Payload: { userId, address, username }
Storage: Redis (invalidated on logout)
```

### Token Rotation
On refresh:
1. Verify refresh token
2. Check if exists in Redis
3. Generate new access + refresh tokens
4. Update Redis with new refresh token
5. Old refresh token is invalidated

## Error Handling

### Common Errors

| Error | Status | Reason |
|-------|--------|--------|
| User not found | 404 | Address not registered |
| Invalid nonce | 400 | Nonce expired or mismatch |
| Invalid signature | 400 | Signature verification failed |
| Invalid token | 401 | JWT expired or malformed |
| Username taken | 400 | Username already exists |

## Configuration

Environment variables:

```env
# JWT Configuration
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRES_IN=30d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  address VARCHAR(66) UNIQUE NOT NULL,
  username VARCHAR(20) UNIQUE,
  email VARCHAR(255) UNIQUE,
  nonce VARCHAR(255) NOT NULL,
  last_login TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Indexes
```sql
CREATE INDEX idx_users_address ON users(address);
CREATE INDEX idx_users_username ON users(username);
```

## Testing

### Manual Testing with cURL

```bash
# 1. Get nonce
curl -X POST http://localhost:3000/api/auth/nonce \
  -H "Content-Type: application/json" \
  -d '{"address":"0x4482a362abba1279a198816e7f914414ceb5642f329d06468e76f4d8ef09ea15"}'

# 2. Sign message with wallet (manual step)

# 3. Connect
curl -X POST http://localhost:3000/api/auth/connect \
  -H "Content-Type: application/json" \
  -d '{
    "address":"0x4482...",
    "signature":"0xabcd...",
    "message":"OneChain Racing Game - Sign in..."
  }'

# 4. Get user info
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## TODO

- [ ] Implement proper Sui wallet signature verification
- [ ] Add support for multiple wallet types (Sui Wallet, Martian, etc.)
- [ ] Add email verification (optional)
- [ ] Add 2FA support (optional)
- [ ] Implement session management
- [ ] Add user activity tracking

## License

MIT
