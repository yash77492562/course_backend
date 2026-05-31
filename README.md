# Riva Data Backend - Microservices Architecture

## Overview
This backend follows a microservices architecture where each service runs on a specific port and handles one specific function.

## Services & Ports

### API Gateway
- **Port**: 3000
- **Purpose**: Routes requests to appropriate microservices
- **Command**: `npm run start:gateway`

### User Services
- **Register Service** - Port 3005: Handles user registration only
- **Login Service** - Port 3006: Handles user login only  
- **Details Service** - Port 3007: Returns user profile data
- **Refresh Service** - Port 3008: Validates refresh tokens and generates new access tokens

## Prerequisites

1. **MongoDB**: Make sure MongoDB is running on `localhost:27017`
2. **Redis**: Make sure Redis is running on `localhost:6379`
3. **Node.js**: Version 18+ recommended

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Update the .env file with your database URLs
   ```

3. **Database Setup**
   ```bash
   npm run prisma:generate
   npm run prisma:push
   ```

## Running Services

### Option 1: Run All Services Together
```bash
npm run start:all
```

### Option 2: Run Services Individually

**Start API Gateway:**
```bash
npm run start:gateway
```

**Start User Services:**
```bash
# In separate terminals:
npm run start:user-register    # Port 3005
npm run start:user-login       # Port 3006  
npm run start:user-details     # Port 3007
npm run start:user-refresh     # Port 3008
```

**Start All User Services:**
```bash
npm run start:all-user-services
```

## API Response Format

All APIs return responses in this format:

```json
{
  "success": boolean,
  "status": number,
  "message": "User-friendly message",
  "data": {} // Only when needed
}
```

## API Endpoints

### User Registration (Port 3005)
- **POST** `/api/auth/register`
- **Returns**: success, status, message (no data)

### User Login (Port 3006)  
- **POST** `/api/auth/login`
- **Returns**: success, status, message, data: { accessToken, refreshToken }

### User Details (Port 3007)
- **GET** `/api/users/:id`
- **Returns**: success, status, message, data: { user profile }

### Refresh Token (Port 3008)
- **POST** `/api/auth/refresh`
- **Returns**: success, status, message, data: { accessToken }

## Features

- **Rate Limiting**: Built-in rate limiting using Redis
- **Caching**: User profiles cached in Redis for performance
- **Security**: Passwords hashed with bcrypt, JWT tokens for auth
- **Validation**: Input validation with class-validator
- **Error Handling**: User-friendly error messages
- **Database**: MongoDB with Prisma ORM
- **Documentation**: Swagger API docs at `/api/docs`

## Folder Structure

```
src/
├── user/                    # User service (all user-related code)
│   ├── controllers/         # User controllers
│   ├── services/           # User business logic
│   ├── dto/                # Data transfer objects
│   ├── modules/            # User module
│   └── ports/              # Individual service entry points
├── database/               # Prisma service and module
├── redis/                  # Redis service and module (global cache)
├── gateway/                # API Gateway
└── types/                  # Shared TypeScript types
```

## Development

- **Linting**: `npm run lint`
- **Testing**: `npm run test`
- **Build**: `npm run build`
- **Prisma Studio**: `npm run prisma:studio`

## Notes

- Each service is focused on one specific function
- Redis is used globally for caching and rate limiting
- All user-related code is organized in the `user/` folder
- Messages are user-friendly and easy to understand
- Only necessary data is returned to the frontend