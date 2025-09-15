import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatCurrency, formatDateYYYYMMDD } from "../lib/format";

export default function OrdersChart({ data }) {
  const normalized = buildSeries(Array.isArray(data) ? data : []);
  const hasIncomingData = Array.isArray(data) && data.some((d) => Number(d?.orders) > 0 || Number(d?.revenue) > 0);
  return (
    <div className="rounded-xl shadow-card p-4 bg-white/90 backdrop-blur">
      <h3 className="font-medium mb-2">Orders & Revenue</h3>
      <div style={{ width: "100%", height: 360 }} className="relative">
        {!hasIncomingData && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">No data yet for this tenant</div>
          </div>
        )}
        <ResponsiveContainer>
          <AreaChart data={normalized} margin={{ top: 10, right: 24, bottom: 10, left: 8 }}>
            <defs>
              <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="orders" name="Orders" yAxisId="left" stroke="#6366f1" strokeWidth={2} fill="url(#ordersGradient)" dot={{ r: 2 }} activeDot={{ r: 4 }} />
            <Area type="monotone" dataKey="revenue" name="Revenue" yAxisId="right" stroke="#10b981" strokeWidth={2} fill="url(#revenueGradient)" dot={{ r: 2 }} activeDot={{ r: 4 }} />
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d)=>formatDateYYYYMMDD(d)} />
            <YAxis yAxisId="left" allowDecimals={false} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v)=>formatCurrency(v)} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: 8 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const orders = payload.find((p) => p.dataKey === "orders");
    const revenue = payload.find((p) => p.dataKey === "revenue");
    return (
      <div className="rounded-lg bg-white/95 backdrop-blur px-3 py-2 shadow-card border border-gray-100">
        <div className="text-xs text-gray-500">{`Date: ${formatDateYYYYMMDD(label)}`}</div>
        <div className="mt-1 text-sm">
          {orders && (
            <div className="flex items-center space-x-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#6366f1" }} />
              <span className="text-gray-700">Orders:</span>
              <span className="font-medium">{orders.value}</span>
            </div>
          )}
          {revenue && (
            <div className="flex items-center space-x-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#10b981" }} />
              <span className="text-gray-700">Revenue:</span>
              <span className="font-medium">{formatCurrency(revenue.value)}</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
}

function buildSeries(input) {
  // Normalize to the last 14 days so chart always renders a continuous series
  const today = new Date();
  const days = 14;
  const map = new Map();
  for (const d of input) {
    const key = formatDateYYYYMMDD(d?.date);
    map.set(key, {
      orders: Number(d?.orders) || 0,
      revenue: Number(d?.revenue) || 0,
    });
  }
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - i);
    const key = dt.toISOString().slice(0, 10);
    const v = map.get(key) || { orders: 0, revenue: 0 };
    series.push({ date: key, orders: v.orders, revenue: v.revenue });
  }
  return series;
}

