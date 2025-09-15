const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || process.env.BACKEND_API_URL || "http://localhost:4000";

export async function fetchJSON(path, init = {}) {
  // Bust caches for GETs to avoid stale 304 responses in the browser
  let url = `${BASE_URL}${path}`;
  const isGet = !init.method || String(init.method).toUpperCase() === "GET";
  if (isGet) {
    url += (url.includes("?") ? "&" : "?") + `_ts=${Date.now()}`;
  }
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", ...(init.headers || {}) },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

export async function getTenants() {
  return fetchJSON(`/api/tenants`);
}

export async function getSummary(tenantId) {
  return fetchJSON(`/api/metrics/summary?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function getOrdersByDate(tenantId, from, to) {
  const qs = new URLSearchParams({ tenantId });
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  return fetchJSON(`/api/metrics/orders-by-date?${qs.toString()}`);
}

export async function getTopCustomers(tenantId, limit = 5) {
  return fetchJSON(`/api/metrics/top-customers?tenantId=${encodeURIComponent(tenantId)}&limit=${limit}`);
}

