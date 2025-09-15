import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import crypto from "crypto";
import axios from "axios";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || "";
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || "read_products,read_orders,read_customers";
const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL || `http://localhost:${PORT}`;
const AUTO_SYNC_ENABLED = String(process.env.AUTO_SYNC_ENABLED || "false").toLowerCase() === "true";
const AUTO_SYNC_MINUTES = Number(process.env.AUTO_SYNC_MINUTES || 5);
const AUTO_SYNC_SECONDS = Number(process.env.AUTO_SYNC_SECONDS || 0);
const AUTO_REGISTER_WEBHOOKS_ON_BOOT = String(process.env.AUTO_REGISTER_WEBHOOKS_ON_BOOT || "false").toLowerCase() === "true";

// Standard middleware for non-webhook routes
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(morgan("dev"));
app.use((req, res, next) => {
  // Disable caching so dashboard always sees fresh values
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
app.use(express.json());

app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

// ===== Shopify OAuth =====
// GET /auth/install?shop=your-store.myshopify.com
app.get("/auth/install", async (req, res) => {
  try {
    const { shop } = req.query;
    if (!shop || typeof shop !== "string" || !shop.endsWith(".myshopify.com")) {
      return res.status(400).send("Missing or invalid 'shop' parameter");
    }
    const redirectUri = `${SHOPIFY_APP_URL}/auth/callback`;

    // TODO: Store and validate a proper anti-CSRF state value in a DB/session
    const state = crypto.randomBytes(16).toString("hex");

    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(
      SHOPIFY_API_KEY
    )}&scope=${encodeURIComponent(SHOPIFY_SCOPES)}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&state=${encodeURIComponent(state)}`;
    return res.redirect(installUrl);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/auth/install error", err);
    res.status(500).send("Internal error");
  }
});

// GET /auth/callback?code=...&hmac=...&shop=...&state=...
app.get("/auth/callback", async (req, res) => {
  try {
    const { shop, code } = req.query;
    if (!shop || !code) {
      return res.status(400).send("Missing shop or code");
    }
    // TODO: Validate 'state' param against stored value

    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const tokenResp = await axios.post(tokenUrl, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    });

    const accessToken = tokenResp.data.access_token;
    if (!accessToken) {
      return res.status(400).send("Failed to obtain access token");
    }

    // Save tenant
    const tenant = await prisma.tenant.upsert({
      where: { shopDomain: String(shop) },
      update: { accessToken },
      create: { shopDomain: String(shop), accessToken },
    });

    // Register webhooks so future Shopify changes sync automatically
    try {
      await registerWebhooks(tenant);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Webhook registration failed", e?.response?.data || e);
    }

    return res.status(200).send(`App installed for ${tenant.shopDomain}. You may close this window.`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/auth/callback error", err?.response?.data || err);
    res.status(500).send("OAuth callback error");
  }
});

// ===== Webhook verification =====
function verifyShopifyWebhook(req, res, next) {
  try {
    if (String(process.env.SHOPIFY_SKIP_WEBHOOK_VERIFY || "").toLowerCase() === "true") {
      // eslint-disable-next-line no-console
      console.warn("Skipping Shopify HMAC verification (development mode)");
      return next();
    }
    const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
    if (!hmacHeader) return res.status(401).send("Missing HMAC header");
    // Always use the exact raw body captured by the raw body saver
    const body = typeof req.rawBody === "string" ? req.rawBody : (Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {}));
    const digest = crypto
      .createHmac("sha256", SHOPIFY_API_SECRET)
      .update(body, "utf8")
      .digest("base64");
    if (digest !== hmacHeader) return res.status(401).send("Invalid HMAC");
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Webhook verify error", err);
    res.status(400).send("Webhook verification failed");
  }
}

// Raw body parser for Shopify webhooks
function rawBodySaver(req, res, buf) {
  if (buf && buf.length) {
    req.rawBody = buf.toString("utf8");
  }
}

// ===== Tenant resolution middleware =====
function getTenantIdFromReq(req) {
  const val = req.params?.tenantId || req.query?.tenantId || req.get("X-Tenant-Id");
  return val ? String(val) : "";
}

async function requireTenant(req, res, next) {
  try {
    const tenantId = getTenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ error: "tenantId required" });
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    req.tenant = tenant;
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("requireTenant error", err);
    res.status(500).json({ error: "Failed" });
  }
}

// Webhook routes must use raw body
app.post(
  "/webhooks/orders/create",
  express.raw({ type: "application/json", verify: rawBodySaver }),
  verifyShopifyWebhook,
  async (req, res) => {
    try {
      const shopDomain = req.get("X-Shopify-Shop-Domain");
      const topic = req.get("X-Shopify-Topic");
      const payload = JSON.parse(req.rawBody);

      // Upsert order
      const tenant = await prisma.tenant.findUnique({ where: { shopDomain } });
      if (!tenant) return res.status(404).send("Tenant not found");

      const totalPrice = payload.total_price ? String(payload.total_price) : "0";
      await prisma.order.upsert({
        where: { tenantId_shopifyId: { tenantId: tenant.id, shopifyId: BigInt(payload.id) } },
        update: {
          totalPrice: totalPrice,
          customerShopifyId: payload.customer?.id ? BigInt(payload.customer.id) : null,
          createdAt: new Date(payload.created_at || payload.processed_at || Date.now()),
        },
        create: {
          tenantId: tenant.id,
          shopifyId: BigInt(payload.id),
          totalPrice: totalPrice,
          customerShopifyId: payload.customer?.id ? BigInt(payload.customer.id) : null,
          createdAt: new Date(payload.created_at || payload.processed_at || Date.now()),
        },
      });

      res.status(200).send("OK");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("orders/create webhook error", err);
      res.status(500).send("Error");
    }
  }
);

// orders/updated → same upsert logic as create
app.post(
  "/webhooks/orders/updated",
  express.raw({ type: "application/json", verify: rawBodySaver }),
  verifyShopifyWebhook,
  async (req, res) => {
    try {
      const shopDomain = req.get("X-Shopify-Shop-Domain");
      const payload = JSON.parse(req.rawBody);
      const tenant = await prisma.tenant.findUnique({ where: { shopDomain } });
      if (!tenant) return res.status(404).send("Tenant not found");

      const totalPrice = payload.total_price ? String(payload.total_price) : "0";
      await prisma.order.upsert({
        where: { tenantId_shopifyId: { tenantId: tenant.id, shopifyId: BigInt(payload.id) } },
        update: {
          totalPrice: totalPrice,
          customerShopifyId: payload.customer?.id ? BigInt(payload.customer.id) : null,
          createdAt: new Date(payload.created_at || payload.processed_at || Date.now()),
        },
        create: {
          tenantId: tenant.id,
          shopifyId: BigInt(payload.id),
          totalPrice: totalPrice,
          customerShopifyId: payload.customer?.id ? BigInt(payload.customer.id) : null,
          createdAt: new Date(payload.created_at || payload.processed_at || Date.now()),
        },
      });

      res.status(200).send("OK");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("orders/updated webhook error", err);
      res.status(500).send("Error");
    }
  }
);

app.post(
  "/webhooks/customers/create",
  express.raw({ type: "application/json", verify: rawBodySaver }),
  verifyShopifyWebhook,
  async (req, res) => {
    try {
      const shopDomain = req.get("X-Shopify-Shop-Domain");
      const payload = JSON.parse(req.rawBody);
      const tenant = await prisma.tenant.findUnique({ where: { shopDomain } });
      if (!tenant) return res.status(404).send("Tenant not found");

      await prisma.customer.upsert({
        where: { tenantId_shopifyId: { tenantId: tenant.id, shopifyId: BigInt(payload.id) } },
        update: {
          email: payload.email || null,
          firstName: payload.first_name || null,
          lastName: payload.last_name || null,
          createdAt: new Date(payload.created_at || Date.now()),
        },
        create: {
          tenantId: tenant.id,
          shopifyId: BigInt(payload.id),
          email: payload.email || null,
          firstName: payload.first_name || null,
          lastName: payload.last_name || null,
          createdAt: new Date(payload.created_at || Date.now()),
        },
      });
      res.status(200).send("OK");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("customers/create webhook error", err);
      res.status(500).send("Error");
    }
  }
);

// customers/update → same upsert logic as create
app.post(
  "/webhooks/customers/update",
  express.raw({ type: "application/json", verify: rawBodySaver }),
  verifyShopifyWebhook,
  async (req, res) => {
    try {
      const shopDomain = req.get("X-Shopify-Shop-Domain");
      const payload = JSON.parse(req.rawBody);
      const tenant = await prisma.tenant.findUnique({ where: { shopDomain } });
      if (!tenant) return res.status(404).send("Tenant not found");

      await prisma.customer.upsert({
        where: { tenantId_shopifyId: { tenantId: tenant.id, shopifyId: BigInt(payload.id) } },
        update: {
          email: payload.email || null,
          firstName: payload.first_name || null,
          lastName: payload.last_name || null,
          createdAt: new Date(payload.created_at || Date.now()),
        },
        create: {
          tenantId: tenant.id,
          shopifyId: BigInt(payload.id),
          email: payload.email || null,
          firstName: payload.first_name || null,
          lastName: payload.last_name || null,
          createdAt: new Date(payload.created_at || Date.now()),
        },
      });
      res.status(200).send("OK");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("customers/update webhook error", err);
      res.status(500).send("Error");
    }
  }
);

app.post(
  "/webhooks/products/create",
  express.raw({ type: "application/json", verify: rawBodySaver }),
  verifyShopifyWebhook,
  async (req, res) => {
    try {
      const shopDomain = req.get("X-Shopify-Shop-Domain");
      const payload = JSON.parse(req.rawBody);
      const tenant = await prisma.tenant.findUnique({ where: { shopDomain } });
      if (!tenant) return res.status(404).send("Tenant not found");

      const priceStr = payload.variants?.[0]?.price ? String(payload.variants[0].price) : "0";
      await prisma.product.upsert({
        where: { tenantId_shopifyId: { tenantId: tenant.id, shopifyId: BigInt(payload.id) } },
        update: {
          title: payload.title || "Untitled",
          price: priceStr,
          createdAt: new Date(payload.created_at || Date.now()),
        },
        create: {
          tenantId: tenant.id,
          shopifyId: BigInt(payload.id),
          title: payload.title || "Untitled",
          price: priceStr,
          createdAt: new Date(payload.created_at || Date.now()),
        },
      });
      res.status(200).send("OK");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("products/create webhook error", err);
      res.status(500).send("Error");
    }
  }
);

// ===== Sync API =====
app.post("/api/sync/:tenantId", requireTenant, async (req, res) => {
  try {
    const tenant = req.tenant;
    const skipCustomers = String(req.query.skipCustomers || "false").toLowerCase() === "true";

    // NOTE: This is a minimal backfill example. In production, implement pagination & retries.
    if (!skipCustomers) {
      await backfillCustomers(tenant);
    }
    await backfillProducts(tenant);
    await backfillOrders(tenant);

    res.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    const details = err?.response?.data || err?.message || String(err);
    console.error("/api/sync error", details);
    res.status(500).json({ error: "Sync failed", details });
  }
});

// Lightweight diagnostics to test Shopify access with the stored token
app.get("/api/sync/diagnose/:tenantId", async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const client = await shopifyClient(tenant);
    const [customers, orders] = await Promise.all([
      client.get(`/customers/count.json`).then(r => r.data).catch(e => ({ error: e?.response?.status, data: e?.response?.data })),
      client.get(`/orders/count.json`, { params: { status: "any" } }).then(r => r.data).catch(e => ({ error: e?.response?.status, data: e?.response?.data })),
    ]);
    res.json({ ok: true, shop: tenant.shopDomain, customers, orders });
  } catch (err) {
    const details = err?.response?.data || err?.message || String(err);
    res.status(500).json({ ok: false, error: details });
  }
});

async function shopifyClient(tenant) {
  const baseUrl = `https://${tenant.shopDomain}/admin/api/2024-07`;
  const client = axios.create({
    baseURL: baseUrl,
    headers: { "X-Shopify-Access-Token": tenant.accessToken },
  });
  return client;
}

async function backfillCustomers(tenant) {
  const client = await shopifyClient(tenant);
  try {
    // TODO: Implement pagination with Link header (rel="next")
    const resp = await client.get(`/customers.json`, { params: { limit: 250 } });
    const customers = resp.data.customers || [];
    for (const c of customers) {
      await prisma.customer.upsert({
        where: { tenantId_shopifyId: { tenantId: tenant.id, shopifyId: BigInt(c.id) } },
        update: {
          email: c.email || null,
          firstName: c.first_name || null,
          lastName: c.last_name || null,
          createdAt: new Date(c.created_at || Date.now()),
        },
        create: {
          tenantId: tenant.id,
          shopifyId: BigInt(c.id),
          email: c.email || null,
          firstName: c.first_name || null,
          lastName: c.last_name || null,
          createdAt: new Date(c.created_at || Date.now()),
        },
      });
    }
  } catch (e) {
    const message = e?.response?.data || e?.message || String(e);
    const isPCD = typeof message === "object" && message?.errors && String(message.errors).toLowerCase().includes("protected customer data");
    if (isPCD || String(message).includes("protected customer data")) {
      // eslint-disable-next-line no-console
      console.warn("Skipping customer backfill due to Protected Customer Data restrictions");
      return; // proceed with orders/products only
    }
    throw e;
  }
}

async function backfillProducts(tenant) {
  const client = await shopifyClient(tenant);
  const resp = await client.get(`/products.json`, { params: { limit: 250 } });
  const products = resp.data.products || [];
  for (const p of products) {
    const priceStr = p.variants?.[0]?.price ? String(p.variants[0].price) : "0";
    await prisma.product.upsert({
      where: { tenantId_shopifyId: { tenantId: tenant.id, shopifyId: BigInt(p.id) } },
      update: {
        title: p.title || "Untitled",
        price: priceStr,
        createdAt: new Date(p.created_at || Date.now()),
      },
      create: {
        tenantId: tenant.id,
        shopifyId: BigInt(p.id),
        title: p.title || "Untitled",
        price: priceStr,
        createdAt: new Date(p.created_at || Date.now()),
      },
    });
  }
}

async function backfillOrders(tenant) {
  const client = await shopifyClient(tenant);
  try {
    // With PCD approval, request customer as well to capture customerShopifyId
    let resp;
    try {
      resp = await client.get(`/orders.json`, {
        params: { limit: 250, status: "any", fields: "id,created_at,processed_at,total_price,customer" },
      });
    } catch (_e) {
      // Some shops may not allow nested fields selection; fall back to full object
      resp = await client.get(`/orders.json`, { params: { limit: 250, status: "any" } });
    }
    const orders = resp.data.orders || [];
    for (const o of orders) {
      const totalPrice = o.total_price ? String(o.total_price) : "0";
      await prisma.order.upsert({
        where: { tenantId_shopifyId: { tenantId: tenant.id, shopifyId: BigInt(o.id) } },
        update: {
          totalPrice: totalPrice,
          customerShopifyId: o.customer?.id ? BigInt(o.customer.id) : null,
          createdAt: new Date(o.created_at || o.processed_at || Date.now()),
        },
        create: {
          tenantId: tenant.id,
          shopifyId: BigInt(o.id),
          totalPrice: totalPrice,
          customerShopifyId: o.customer?.id ? BigInt(o.customer.id) : null,
          createdAt: new Date(o.created_at || o.processed_at || Date.now()),
        },
      });
    }
  } catch (e) {
    const message = e?.response?.data || e?.message || String(e);
    const isPCD = typeof message === "object" && message?.errors && String(message.errors).includes("protected customer data");
    if (isPCD || String(message).includes("protected customer data")) {
      // eslint-disable-next-line no-console
      console.warn("Skipping orders backfill due to Protected Customer Data restrictions");
      return; // proceed without historical orders
    }
    throw e;
  }
}

// ========== Webhook registration helper ==========
async function registerWebhooks(tenant) {
  const client = await shopifyClient(tenant);
  // Fetch existing webhooks to make registration idempotent
  let existing = [];
  try {
    const listResp = await client.get(`/webhooks.json`, { params: { limit: 250 } });
    existing = listResp.data.webhooks || [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("List webhooks failed", e?.response?.data || e);
  }

  const desired = [
    { topic: "orders/create", address: `${SHOPIFY_APP_URL}/webhooks/orders/create` },
    { topic: "orders/updated", address: `${SHOPIFY_APP_URL}/webhooks/orders/updated` },
    { topic: "customers/create", address: `${SHOPIFY_APP_URL}/webhooks/customers/create` },
    { topic: "customers/update", address: `${SHOPIFY_APP_URL}/webhooks/customers/update` },
    { topic: "products/create", address: `${SHOPIFY_APP_URL}/webhooks/products/create` },
  ];

  for (const { topic, address } of desired) {
    const match = existing.find((w) => w.topic === topic);
    try {
      if (!match) {
        await client.post(`/webhooks.json`, { webhook: { topic, address, format: "json" } });
      } else if (match.address !== address) {
        await client.put(`/webhooks/${match.id}.json`, { webhook: { id: match.id, address, format: "json" } });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`Register webhook failed for ${topic}`, e?.response?.data || e);
    }
  }
}

// Manual registration endpoint for existing tenants
app.post("/api/webhooks/register/:tenantId", async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    await registerWebhooks(tenant);
    res.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Manual webhook registration failed", err?.response?.data || err);
    res.status(500).json({ error: "Failed" });
  }
});

// ===== Dashboard APIs =====
app.get("/api/metrics/summary", requireTenant, async (req, res) => {
  try {
    const tenantId = req.tenant.id;

    const [rawCustomersCount, ordersCount, orderSum] = await Promise.all([
      prisma.customer.count({ where: { tenantId } }),
      prisma.order.count({ where: { tenantId } }),
      prisma.order.aggregate({ where: { tenantId }, _sum: { totalPrice: true } }),
    ]);

    let customersCount = rawCustomersCount;
    if (customersCount === 0) {
      // Fallback: count distinct non-null customerShopifyId from orders
      const distinct = await prisma.order.findMany({
        where: { tenantId, customerShopifyId: { not: null } },
        select: { customerShopifyId: true },
        distinct: ["customerShopifyId"],
      });
      customersCount = distinct.length;
    }

    let revenue = orderSum._sum.totalPrice ? orderSum._sum.totalPrice.toString() : "0";

    // If DB is empty, fetch lightweight counts directly from Shopify so the dashboard isn't blank
    if (customersCount === 0 && ordersCount === 0) {
      try {
        if (req.tenant) {
          const client = await shopifyClient(req.tenant);
          const [custCountResp, orderCountResp] = await Promise.all([
            client.get(`/customers/count.json`).then(r => r.data).catch(() => ({ count: 0 })),
            client.get(`/orders/count.json`, { params: { status: "any" } }).then(r => r.data).catch(() => ({ count: 0 })),
          ]);
          customersCount = Number(custCountResp?.count || 0);
          const shopifyOrderCount = Number(orderCountResp?.count || 0);
          // Try to compute revenue with minimal fields; ignore if blocked
          try {
            const resp = await client.get(`/orders.json`, { params: { limit: 50, status: "any", fields: "id,total_price,created_at" } });
            const orders = resp.data?.orders || [];
            const sum = orders.reduce((acc, o) => acc + (Number(o.total_price) || 0), 0);
            revenue = String(sum);
            // Prefer Shopify order count if DB has 0
            res.json({ customers: customersCount, orders: shopifyOrderCount, revenue });
            return;
          } catch (_e) {
            res.json({ customers: customersCount, orders: shopifyOrderCount, revenue });
            return;
          }
        }
      } catch (_e) {
        // ignore and return DB values
      }
    }

    res.json({ customers: customersCount, orders: ordersCount, revenue });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/metrics/summary error", err);
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/api/metrics/orders-by-date", requireTenant, async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;

    const where = { tenantId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const orders = await prisma.order.findMany({ where, select: { createdAt: true, totalPrice: true } });
    const grouped = {};
    for (const o of orders) {
      const dateKey = o.createdAt.toISOString().slice(0, 10);
      const num = Number(o.totalPrice);
      if (!grouped[dateKey]) grouped[dateKey] = { date: dateKey, orders: 0, revenue: 0 };
      grouped[dateKey].orders += 1;
      grouped[dateKey].revenue += isNaN(num) ? 0 : num;
    }
    const series = Object.values(grouped).sort((a, b) => (a.date < b.date ? -1 : 1));
    res.json(series);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/metrics/orders-by-date error", err);
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/api/metrics/top-customers", requireTenant, async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const limit = Number(req.query.limit || 5);

    const orders = await prisma.order.findMany({
      where: { tenantId, customerShopifyId: { not: null } },
      select: { customerShopifyId: true, totalPrice: true },
    });
    const spendByCustomer = new Map();
    for (const o of orders) {
      const key = String(o.customerShopifyId);
      const prev = spendByCustomer.get(key) || 0;
      spendByCustomer.set(key, prev + Number(o.totalPrice));
    }
    const sorted = Array.from(spendByCustomer.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
    const results = [];
    for (const [shopifyIdStr, spend] of sorted) {
      const shopifyId = BigInt(shopifyIdStr);
      const customer = await prisma.customer.findFirst({ where: { tenantId, shopifyId } });
      results.push({
        shopifyId: shopifyId.toString(),
        email: customer?.email || null,
        name: `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim(),
        spend,
      });
    }
    res.json(results);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/metrics/top-customers error", err);
    res.status(500).json({ error: "Failed" });
  }
});

// Utility endpoint for frontend to list tenants
app.get("/api/tenants", async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true, shopDomain: true, createdAt: true } });
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

// Debug: list recent orders for a tenant
app.get("/api/debug/recent-orders", requireTenant, async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const limit = Number(req.query.limit || 10);
    const orders = await prisma.order.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { shopifyId: true, totalPrice: true, createdAt: true },
      take: limit,
    });
    res.json(orders.map(o => ({ shopifyId: o.shopifyId.toString(), totalPrice: o.totalPrice.toString(), createdAt: o.createdAt })));
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});
// Create or update a tenant manually (no OAuth) using a store's Custom app token
app.post("/api/tenants", async (req, res) => {
  try {
    const shopDomain = String(req.body?.shopDomain || "").trim();
    const accessToken = String(req.body?.accessToken || "").trim();
    if (!shopDomain || !shopDomain.endsWith(".myshopify.com")) {
      return res.status(400).json({ error: "Valid shopDomain like store.myshopify.com required" });
    }
    if (!accessToken) return res.status(400).json({ error: "accessToken required" });

    const tenant = await prisma.tenant.upsert({
      where: { shopDomain },
      update: { accessToken },
      create: { shopDomain, accessToken },
    });
    res.json({ id: tenant.id, shopDomain: tenant.shopDomain });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("POST /api/tenants error", err);
    res.status(500).json({ error: "Failed" });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${PORT}`);
  if (AUTO_REGISTER_WEBHOOKS_ON_BOOT) {
    (async () => {
      try {
        const tenants = await prisma.tenant.findMany();
        for (const t of tenants) {
          try {
            await registerWebhooks(t);
            // eslint-disable-next-line no-console
            console.log(`Webhooks ensured for ${t.shopDomain}`);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(`Webhook ensure failed for ${t.shopDomain}`, e?.response?.data || e?.message || e);
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Failed to auto-register webhooks on boot", e?.message || e);
      }
    })();
  }
  if (AUTO_SYNC_ENABLED) {
    const intervalMs = AUTO_SYNC_SECONDS > 0 ? AUTO_SYNC_SECONDS * 1000 : Math.max(1, AUTO_SYNC_MINUTES) * 60 * 1000;
    // eslint-disable-next-line no-console
    console.log(`Auto-sync enabled. Interval: ${AUTO_SYNC_SECONDS > 0 ? AUTO_SYNC_SECONDS + ' second(s)' : AUTO_SYNC_MINUTES + ' minute(s)'}`);
    const run = async () => {
      try {
        const tenants = await prisma.tenant.findMany();
        for (const t of tenants) {
          try {
            await backfillOrders(t);
            // Optionally sync customers/products if desired
            // await backfillCustomers(t);
            // await backfillProducts(t);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(`Auto-sync failed for ${t.shopDomain}`, e?.response?.data || e?.message || e);
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Auto-sync iteration failed", e);
      }
    };
    // Kick off immediately, then on interval
    run();
    setInterval(run, intervalMs);
  }
});


