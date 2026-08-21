# DocQuery API Endpoints — Phase 1

## Base URL

```
http://localhost:3000/api/v1
```

## Response Format

All responses follow a consistent structure:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

---

## Authentication

### POST /auth/register

Register a new user. Creates a default workspace automatically.

**Auth Required:** No

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "StrongPass123!"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "john@example.com",
      "name": "John Doe",
      "createdAt": "...",
      "updatedAt": "..."
    },
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG..."
  }
}
```

**Errors:**
| Code | Status | Description |
|------|--------|-------------|
| `AUTH_EMAIL_EXISTS` | 409 | Email already registered |
| `VALIDATION_ERROR` | 422 | Invalid input |

---

### POST /auth/login

Authenticate with email and password.

**Auth Required:** No

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "StrongPass123!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG..."
  }
}
```

**Errors:**
| Code | Status | Description |
|------|--------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong email or password (generic) |

---

### POST /auth/refresh

Get a new access token using a valid refresh token.

**Auth Required:** No

**Request Body:**
```json
{
  "refreshToken": "eyJhbG..."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG..."
  }
}
```

**Errors:**
| Code | Status | Description |
|------|--------|-------------|
| `AUTH_INVALID_REFRESH_TOKEN` | 401 | Token is invalid |
| `AUTH_REFRESH_TOKEN_REVOKED` | 401 | Token was revoked (logout) |
| `AUTH_REFRESH_TOKEN_EXPIRED` | 401 | Token has expired |

---

### POST /auth/logout

Revoke the refresh token. The access token remains valid until natural expiry.

**Auth Required:** Yes (Bearer token)

**Request Body:**
```json
{
  "refreshToken": "eyJhbG..."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

---

### GET /auth/me

Get the current authenticated user with their organization memberships.

**Auth Required:** Yes (Bearer token)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "john@example.com",
      "name": "John Doe",
      "createdAt": "...",
      "updatedAt": "...",
      "organizations": [
        {
          "id": "uuid",
          "name": "John Doe's Workspace",
          "role": "OWNER",
          "joinedAt": "..."
        }
      ]
    }
  }
}
```

---

## Organizations

### POST /organizations

Create a new organization. Creator becomes OWNER.

**Auth Required:** Yes

**Request Body:**
```json
{
  "name": "Acme Corp"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "uuid",
      "name": "Acme Corp",
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}
```

---

### GET /organizations

List all organizations the authenticated user belongs to.

**Auth Required:** Yes

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "organizations": [
      {
        "id": "uuid",
        "name": "Acme Corp",
        "role": "OWNER",
        "joinedAt": "...",
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
}
```

---

### GET /organizations/:id

Get a single organization. Returns 403 if user is not a member.

**Auth Required:** Yes

---

## Members

All member endpoints require `X-Organization-Id` header.

### GET /organizations/:id/members

List all members of the organization.

**Auth Required:** Yes  
**Required Role:** Any member  
**Required Header:** `X-Organization-Id: <uuid>`

---

### POST /organizations/:id/members

Add a user to the organization by email.

**Auth Required:** Yes  
**Required Role:** OWNER or ADMIN  
**Required Header:** `X-Organization-Id: <uuid>`

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "role": "MEMBER"
}
```

**Errors:**
| Code | Status | Description |
|------|--------|-------------|
| `USER_NOT_FOUND` | 404 | Email not registered |
| `MEMBER_ALREADY_EXISTS` | 409 | Already a member |
| `ROLE_INSUFFICIENT` | 403 | Caller lacks permission |

---

### PATCH /organizations/:id/members/:userId

Update a member's role.

**Auth Required:** Yes  
**Required Role:** OWNER or ADMIN

**Request Body:**
```json
{
  "role": "ADMIN"
}
```

**Errors:**
| Code | Status | Description |
|------|--------|-------------|
| `ROLE_OWNER_PROTECTED` | 403 | Cannot modify OWNER |
| `ROLE_PROMOTION_DENIED` | 403 | Only OWNER can promote to OWNER |
| `ROLE_LAST_OWNER` | 400 | Cannot demote the last owner |

---

### DELETE /organizations/:id/members/:userId

Remove a member from the organization.

**Auth Required:** Yes  
**Required Role:** OWNER or ADMIN

**Errors:**
| Code | Status | Description |
|------|--------|-------------|
| `ROLE_OWNER_PROTECTED` | 403 | ADMIN cannot remove OWNER |
| `ROLE_LAST_OWNER` | 400 | Cannot remove the last owner |
