# Shopify Data Ingestion + Dashboard

A production-ready scaffold for a multi-tenant Shopify ingestion backend (Node.js + Express + Prisma + PostgreSQL) and a Next.js dashboard (Tailwind + NextAuth email login). Ready to deploy on Vercel (frontend) and Render/Railway (backend) with Supabase/Railway Postgres.

## Monorepo Structure

```
/ backend   # Express API, Prisma ORM, webhooks, OAuth
/ frontend  # Next.js app, NextAuth email login, Tailwind dashboard
```

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database (local or hosted)
- Shopify development store + a custom app (API Key/Secret)

### 1) Install dependencies

```bash
npm run install:all
```

### 2) Configure environments

- Copy env examples and fill values

Backend:
```bash
cp backend/.env.example backend/.env
```
Frontend:
```bash
# Create frontend/.env.local and copy values from frontend/.env.example
```

Required variables:
- Backend: `PORT`, `DATABASE_URL`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES`, `SHOPIFY_APP_URL`, `CORS_ORIGIN`
- Frontend: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `EMAIL_*`, `BACKEND_API_URL` (or `NEXT_PUBLIC_BACKEND_API_URL`)

### 3) Setup database

```bash
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate
```

### 4) Run apps (dev)

```bash
npm run dev
```
- Frontend at http://localhost:3000
- Backend at http://localhost:4000

## Shopify App Setup

1. Create a Shopify custom app for your development store.
2. Set the app OAuth callback URL to: `http://localhost:4000/auth/callback`
3. Add required API scopes: `read_products, read_orders, read_customers`.
4. Install the app via: `http://localhost:4000/auth/install?shop=<your-store>.myshopify.com`
5. After install, optionally trigger a backfill: `POST http://localhost:4000/api/sync/<tenantId>` (You can get tenants at `GET /api/tenants`).

## Backend

- Node.js + Express + Prisma ORM + PostgreSQL
- Multi-tenant model keyed by `Tenant` (a Shopify store)
- OAuth install and callback routes
- Webhooks with HMAC verification for orders/customers/products
- Sync and metrics endpoints for the dashboard

### Run
```bash
cd backend
npm run dev
```

### Env
- See `backend/.env.example`

### Prisma Schema
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

### API Endpoints

- Auth
  - `GET /auth/install?shop=...` – Start OAuth
  - `GET /auth/callback` – Handle OAuth, store tenant + token
- Webhooks (HMAC verified)
  - `POST /webhooks/orders/create`
  - `POST /webhooks/customers/create`
  - `POST /webhooks/products/create`
- Sync
  - `POST /api/sync/:tenantId`
- Metrics
  - `GET /api/metrics/summary?tenantId=...`
  - `GET /api/metrics/orders-by-date?tenantId=...&from=...&to=...`
  - `GET /api/metrics/top-customers?tenantId=...&limit=5`
- Utility
  - `GET /api/tenants` – list tenants

### Shopify Notes
- Webhooks are verified via `X-Shopify-Hmac-Sha256` header using `SHOPIFY_API_SECRET`.
- For production, register webhooks post-install.
- Implement pagination for Admin API backfills.

## Frontend

- Next.js + Tailwind + NextAuth (email magic link)
- Dashboard with summary, chart, and top customers

### Run
```bash
cd frontend
npm run dev
```

### Env
- Create `frontend/.env.local` with values similar to `frontend/.env.example`:
  - `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
  - SMTP creds: `EMAIL_SERVER_*`, `EMAIL_FROM`
  - `BACKEND_API_URL` or `NEXT_PUBLIC_BACKEND_API_URL`

### Pages & Components
- `pages/index.js` – simple sign-in page
- `pages/dashboard.js` – main dashboard with tenant selector
- `components/SummaryCards.js`
- `components/OrdersChart.js`
- `components/TopCustomersTable.js`

## Deployment

### Backend (Render/Railway)
- Build command: `npm install && npm run prisma:generate && npm run prisma:deploy`
- Start command: `npm start`
- Env vars: from `backend/.env.example`

### Frontend (Vercel)
- Framework: Next.js
- Env vars: from `frontend/.env.example`
- Set `NEXT_PUBLIC_BACKEND_API_URL` to your backend URL

## Architecture (high level)

```
[Shopify Store] --(OAuth)--> [Backend API] --(Prisma)--> [PostgreSQL]
      |                           ^   |
      |-(Webhooks: orders, customers, products)-|

[Frontend (Next.js)] --(fetch)--> [Backend API]
[NextAuth Email] --(SMTP)--> [User]
```

## Notes for Extension
- Replace webhook route bodies with robust upsert + validation logic.
- Add webhook registration after OAuth.
- Add pagination and retry/backoff for sync.
- Consider background jobs for large backfills.
- Improve auth (sessions/tenants) as needed.
