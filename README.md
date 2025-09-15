# Real‑Time Shopify Analytics

Real-Time Shopify Analytics is a multi-tenant analytics dashboard for Shopify store owners. The goal of this project is to provide a seamless way for merchants to connect their stores and get real-time insights into their sales, customers, and revenue without any complex setup.

I've built a scalable, secure, and real-time analytics platform designed to give Shopify merchants the instant insights they need to grow their business.

Production‑ready scaffold for a multi‑tenant Shopify ingestion backend (Node.js + Express + Prisma + PostgreSQL) and a modern Next.js dashboard (Tailwind + NextAuth). Supports both email magic link and password‑based login.

## Monorepo

```
/backend   Express API, Prisma ORM, webhooks, OAuth, metrics
/frontend  Next.js app, NextAuth auth, Tailwind UI
```

## Setup (local)

### Prerequisites

- Node.js 18+
- PostgreSQL (local or hosted)
- Shopify development store + custom app (API Key/Secret)

### 1) Install deps

```bash
npm run install:all
```

### 2) Environment

- Backend: create `backend/.env` (see example below)
- Frontend: create `frontend/.env.local`

Backend required:

- DATABASE_URL=postgres://...
- PORT=4000 (optional)
- CORS_ORIGIN=http://localhost:3000
- SHOPIFY_API_KEY=...
- SHOPIFY_API_SECRET=...
- SHOPIFY_SCOPES=read_products,read_orders,read_customers
- SHOPIFY_APP_URL=http://localhost:4000
- Optional: AUTO_REGISTER_WEBHOOKS_ON_BOOT=true, AUTO_SYNC_ENABLED=false

Frontend required:

- DATABASE_URL=postgres://... (NextAuth tables)
- NEXTPUBLIC_BACKEND_API_URL or NEXT_PUBLIC_BACKEND_API_URL=http://localhost:4000
- NEXTAUTH_URL=http://localhost:3000
- NEXTAUTH_SECRET=<long random string>
- EMAIL_SERVER_HOST, EMAIL_SERVER_PORT, EMAIL_SERVER_USER, EMAIL_SERVER_PASSWORD
- EMAIL_FROM="App <no-reply@example.com>"

### 3) Database & Prisma

```bash
# Backend schema
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:deploy

# Frontend (NextAuth) schema
npx --prefix frontend prisma generate
npx --prefix frontend prisma migrate dev --name init
```

### 4) Run (dev)

```bash
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:4000 (health: `/healthz`)

### 5) Shopify app (dev)

1. Create a custom app for your dev store
2. OAuth redirect: `http://localhost:4000/auth/callback`
3. Scopes: `read_products,read_orders,read_customers`
4. Install: `http://localhost:4000/auth/install?shop=<store>.myshopify.com`
5. After install you can backfill: `POST /api/sync/:tenantId`

## Architecture

```text
┌───────────────┐     OAuth      ┌────────────┐
│ Shopify Store │ ─────────────▶ │  Backend   │ ── Prisma ──▶ PostgreSQL
└──────┬────────┘  Webhooks      └─────┬──────┘
       │  orders/customers/products     │
       │                                 │ REST/JSON
       ▼                                 ▼
   (Shopify)                      Next.js Frontend  ── NextAuth (Email + Password) ── SMTP
```

## Backend

- Express + Prisma + PostgreSQL
- Multi‑tenant keyed by `Tenant`
- OAuth, HMAC‑verified webhooks, sync APIs, metrics APIs

### API Endpoints

- Health
  - `GET /healthz` → `{ ok: true }`
- OAuth
  - `GET /auth/install?shop=...` → Redirect to Shopify
  - `GET /auth/callback` → Saves `Tenant` and access token
- Webhooks (HMAC verified)
  - `POST /webhooks/orders/create`
  - `POST /webhooks/orders/updated`
  - `POST /webhooks/customers/create`
  - `POST /webhooks/customers/update`
  - `POST /webhooks/products/create`
- Sync
  - `POST /api/sync/:tenantId` → optional backfill (customers/products/orders)
  - `GET  /api/sync/diagnose/:tenantId` → quick access checks
- Metrics
  - `GET /api/metrics/summary?tenantId=...`
  - `GET /api/metrics/orders-by-date?tenantId=...&from=...&to=...`
  - `GET /api/metrics/top-customers?tenantId=...&limit=5`
- Utility
  - `GET /api/tenants` → list tenants
  - `POST /api/tenants` → create tenant (manual, needs accessToken)

### Backend Prisma schema

```prisma
model Tenant {
  id          String     @id @default(uuid())
  shopDomain  String     @unique
  accessToken String
  createdAt   DateTime   @default(now())

  customers   Customer[]
  products    Product[]
  orders      Order[]
}

model Customer {
  id         String   @id @default(uuid())
  shopifyId  BigInt
  tenantId   String
  email      String?
  firstName  String?
  lastName   String?
  createdAt  DateTime @default(now())

  tenant     Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  orders     Order[]

  @@unique([tenantId, shopifyId])
}

model Product {
  id         String   @id @default(uuid())
  shopifyId  BigInt
  tenantId   String
  title      String
  price      Decimal  @db.Decimal(12, 2)
  createdAt  DateTime @default(now())

  tenant     Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, shopifyId])
}

model Order {
  id                 String   @id @default(uuid())
  shopifyId          BigInt
  tenantId           String
  customerShopifyId  BigInt?
  totalPrice         Decimal  @db.Decimal(12, 2)
  createdAt          DateTime @default(now())

  tenant             Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  customer           Customer? @relation(fields: [tenantId, customerShopifyId], references: [tenantId, shopifyId])

  @@unique([tenantId, shopifyId])
  @@index([tenantId, createdAt])
  @@index([tenantId, customerShopifyId])
}
```

## Frontend

- Next.js + Tailwind CSS
- NextAuth with Email (magic link) and Credentials (email+password)

### Auth pages

- `pages/auth/signin.js` – email magic link + password login
- `pages/auth/register.js` – password registration (hashes with bcrypt)

### Frontend Prisma (NextAuth) schema (excerpt)

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  passwordHash  String?   @db.Text

  accounts Account[]
  sessions Session[]
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

## Deployment (Render)

### Backend service (root: `backend/`)

- Build: `npm ci && npx prisma generate && npx prisma migrate deploy`
- Start: `npm run start`
- Health check path: `/healthz`
- Env:
  - DATABASE_URL: Render Postgres internal URL
  - CORS_ORIGIN: https://<FRONTEND>.onrender.com
  - SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES
  - SHOPIFY_APP_URL: https://<BACKEND>.onrender.com
  - Optional: AUTO_REGISTER_WEBHOOKS_ON_BOOT, AUTO_SYNC_ENABLED, AUTO_SYNC_MINUTES

### Frontend service (root: `frontend/`)

- Add `frontend/.npmrc` with `workspaces=false`
- Build: `npm ci && npx prisma migrate deploy && npm run build`
- Start: `npm start`
- Env:
  - DATABASE_URL: same Postgres (NextAuth)
  - NEXT_PUBLIC_BACKEND_API_URL: https://<BACKEND>.onrender.com
  - NEXTAUTH_URL: https://<FRONTEND>.onrender.com
  - NEXTAUTH_SECRET: long random string
  - EMAIL_SERVER_HOST, EMAIL_SERVER_PORT, EMAIL_SERVER_USER, EMAIL_SERVER_PASSWORD, EMAIL_FROM

### Post‑deploy checks

- Backend: `GET /healthz` → `{ ok: true }`
- Frontend: sign in (email link or password) → dashboard loads

## Known limitations & assumptions

- Shopify Protected Customer Data (PCD) can block customer fields; code falls back, but full data may require PCD approval.
- Free dynos may sleep (cold starts) causing webhook failures; prefer paid or external pinger.
- Magic link redirects require `NEXTAUTH_URL` to exactly match the public frontend URL (HTTPS in prod).
- CORS must exactly match the frontend origin; otherwise API calls will fail.
- Password auth uses bcrypt but no rate‑limiting/lockout is included; add an edge/firewall rule for brute‑force protection.
- Multi‑tenant data appears only after OAuth install or manual tenant creation.
- Not affiliated with Shopify.

## Troubleshooting

- ENOWORKSPACES during frontend build: add `frontend/.npmrc` with `workspaces=false`.
- Prisma engine or generate errors on Render: ensure build runs `prisma generate` and `migrate deploy` and `DATABASE_URL` is set.
- EmailSignin loop: verify `NEXTAUTH_URL` equals the deployed frontend URL and email link host matches; we default redirects to `/dashboard`.
- Backend 404 at `/`: use `/healthz` for probes; root path isn’t served.

## License

MIT
