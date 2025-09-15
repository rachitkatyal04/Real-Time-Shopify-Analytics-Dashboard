import { useEffect, useState, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import SummaryCards from "../components/SummaryCards";
import OrdersChart from "../components/OrdersChart";
import TopCustomersTable from "../components/TopCustomersTable";
import { getTenants, getSummary, getOrdersByDate, getTopCustomers } from "../lib/api";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState("");
  const [summary, setSummary] = useState({ customers: 0, orders: 0, revenue: 0 });
  const [series, setSeries] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (status === "authenticated") {
      getTenants().then((t) => {
        setTenants(t);
        if (t?.[0]) setTenantId(t[0].id);
      }).catch(() => {});
    }
  }, [status]);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [sum, s, top] = await Promise.all([
        getSummary(tenantId),
        getOrdersByDate(tenantId),
        getTopCustomers(tenantId, 5),
      ]);
      setSummary(sum);
      setSeries(s);
      setTopCustomers(top);
      setLastUpdated(new Date());
    } catch (_) {}
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    // initial load
    refresh();
    // faster polling for near-instant reflection of new orders
    const id = setInterval(() => { if (!cancelled) refresh(); }, 3_000);
    // refresh on tab focus
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [tenantId, refresh]);

  if (status === "loading") return null;
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white p-6 rounded shadow text-center">
          <p className="mb-4">You must sign in to view the dashboard.</p>
          <button className="bg-black text-white px-4 py-2 rounded" onClick={() => signIn("email")}>Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="absolute -z-10 inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-primary-300 opacity-30 blur-3xl" />
          <div className="absolute top-1/3 -right-16 h-72 w-72 rounded-full bg-accent-300 opacity-30 blur-3xl" />
          <div className="absolute bottom-10 left-1/4 h-56 w-56 rounded-full bg-cyan-300 opacity-30 blur-3xl" />
        </div>
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-hero-gradient opacity-90" />
          <header className="relative px-5 py-6 flex items-center justify-between text-white">
            <div className="flex items-center space-x-3">
              <div className="h-9 w-9 rounded-lg bg-white/20 text-white grid place-items-center shadow-glow">S</div>
              <div>
                <h1 className="text-2xl font-semibold leading-tight">Dashboard</h1>
                {lastUpdated && (
                  <div className="text-xs text-white/80">Last updated {lastUpdated.toLocaleTimeString()}</div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm text-white/80">Tenant</label>
              <select
                className="select bg-white text-gray-900"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.shopDomain}</option>
                ))}
              </select>
              <button className="btn-secondary" onClick={refresh}>Refresh</button>
              <button className="btn-outline" onClick={() => signOut()}>Sign out</button>
            </div>
          </header>
        </div>

        <SummaryCards customers={summary.customers} orders={summary.orders} revenue={summary.revenue} />

        <OrdersChart data={series} />

        <TopCustomersTable customers={topCustomers} />

        <div className="rounded-xl shadow-card p-4 bg-white/90 backdrop-blur">
          <h3 className="font-medium mb-2">Extra visualization</h3>
          <p className="text-sm text-gray-500">Placeholder for revenue by product category.</p>
        </div>
      </div>
    </div>
  );
}

