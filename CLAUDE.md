# CLAUDE.md — `backend/`

> Rules for the NestJS + Prisma backend.
> Also read the root `CLAUDE.md` before working here.

---

## What This App Is

A single NestJS application that serves as the API for both `frontend/` and `admin/`.
Uses Prisma ORM for database access. Has its own Docker setup.

## Stack

- NestJS (TypeScript)
- Prisma ORM
- Docker / docker-compose
- TypeScript (strict — no `any`)

---

## Folder Structure

```
backend/
├── prisma/
│   ├── schema.prisma     ← Single source of truth for DB schema
│   └── migrations/
│
└── src/
    ├── main.ts           ← App bootstrap, port config
    ├── app.module.ts     ← Root module
    │
    ├── auth/             ← Auth module
    │   ├── auth.module.ts
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   ├── auth.guard.ts
    │   └── dto/
    │       ├── login.dto.ts
    │       └── register.dto.ts
    │
    ├── users/            ← Users module
    │   ├── users.module.ts
    │   ├── users.controller.ts
    │   ├── users.service.ts
    │   └── dto/
    │
    ├── videos/           ← Videos module
    │   ├── videos.module.ts
    │   ├── videos.controller.ts
    │   ├── videos.service.ts
    │   └── dto/
    │
    ├── common/           ← Shared guards, interceptors, pipes, decorators
    │   ├── guards/
    │   ├── interceptors/
    │   ├── pipes/
    │   └── decorators/
    │
    └── prisma/           ← Prisma service (injectable wrapper)
        └── prisma.service.ts
```

---

## Module Rules

Every feature must have its own NestJS module. The pattern is always:

```
<feature>/
├── <feature>.module.ts       ← Declares controller + service, imports PrismaModule
├── <feature>.controller.ts   ← HTTP layer only — validates input, calls service
├── <feature>.service.ts      ← Business logic + all Prisma queries
└── dto/
    ├── create-<feature>.dto.ts
    └── update-<feature>.dto.ts
```

### Controller — HTTP Layer Only
```ts
// ✅ Controllers only: parse request, call service, return response
@Post()
async create(@Body() dto: CreateVideoDto, @Request() req) {
  return this.videosService.create(dto, req.user.id);
}

// ❌ Never put Prisma queries in a controller
@Post()
async create(@Body() dto: CreateVideoDto) {
  return this.prisma.video.create({ data: dto }); // WRONG
}
```

### Service — Business Logic + DB
```ts
// ✅ All Prisma queries live in the service
async create(dto: CreateVideoDto, userId: string): Promise<Video> {
  return this.prisma.video.create({
    data: { ...dto, userId },
  });
}
```

---

## Prisma Rules

- Schema changes go in `prisma/schema.prisma` only
- Run `npx prisma migrate dev` after every schema change
- `PrismaService` is injected via the shared `prisma/prisma.service.ts` module
- Never instantiate `PrismaClient` directly inside a feature module
- Never expose raw Prisma errors — catch in service, throw `HttpException`

```ts
// ✅ Correct error handling in service
async findOne(id: string) {
  const video = await this.prisma.video.findUnique({ where: { id } });
  if (!video) throw new NotFoundException(`Video ${id} not found`);
  return video;
}
```

---

## DTO Rules

- Every endpoint that accepts a body must have a DTO
- Use `class-validator` decorators on all DTOs
- DTOs live in `<feature>/dto/`

```ts
// ✅ Example DTO
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateVideoDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;
}
```

---

## Port Rules

This is a **single NestJS application**. It runs on one port.

| Environment | Port |
|---|---|
| Development | `:3000` (or as set in `.env`) |
| Docker | Defined in `docker-compose.yml` |

> The port is set via `process.env.PORT` in `main.ts`. Never hardcode it.

```ts
// main.ts
await app.listen(process.env.PORT ?? 3000);
```

---

## Security Rules

- All protected routes use the `AuthGuard` (JWT)
- Never return passwords, tokens, or internal IDs in API responses
- Use `@Exclude()` from `class-transformer` on sensitive entity fields
- Validate all incoming data with `ValidationPipe` (global in `main.ts`)

---

## File Naming

| Type | Pattern | Example |
|---|---|---|
| Module | `<feature>.module.ts` | `videos.module.ts` |
| Controller | `<feature>.controller.ts` | `videos.controller.ts` |
| Service | `<feature>.service.ts` | `videos.service.ts` |
| DTO | `<action>-<feature>.dto.ts` | `create-video.dto.ts` |
| Guard | `<name>.guard.ts` | `auth.guard.ts` |
| Decorator | `<name>.decorator.ts` | `current-user.decorator.ts` |

---

## PR Checklist

- [ ] Every new endpoint has a DTO with `class-validator` decorators
- [ ] No Prisma queries in controllers — service only
- [ ] No raw Prisma errors returned to client
- [ ] Schema changes have a migration (`prisma migrate dev`)
- [ ] Protected routes have `@UseGuards(AuthGuard)`
- [ ] Port read from `process.env.PORT` — never hardcoded
- [ ] No `any` types
- [ ] No browser/React code anywhere in this folder
