import { formatCurrency } from "../lib/format";

export default function TopCustomersTable({ customers }) {
  return (
    <div className="rounded-2xl p-[1px] bg-gradient-to-br from-primary-400 via-accent-400 to-cyan-400">
      <div className="rounded-2xl shadow-card p-4 bg-white/95 backdrop-blur">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium">Top Customers</h3>
        <span className="text-xs badge bg-primary-50 text-primary-700">Last 90 days</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-2 pr-4">
                <div className="rounded-md px-2 py-1 text-white bg-gradient-to-r from-primary-500 to-primary-700 inline-block">Customer</div>
              </th>
              <th className="py-2 pr-4">
                <div className="rounded-md px-2 py-1 text-white bg-gradient-to-r from-accent-500 to-accent-700 inline-block">Email</div>
              </th>
              <th className="py-2 pr-4 text-right">
                <div className="rounded-md px-2 py-1 text-white bg-gradient-to-r from-cyan-500 to-blue-600 inline-block">Spend</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td className="py-6 text-center text-gray-500" colSpan={3}>No customers yet</td>
              </tr>
            ) : (
              customers.map((c, idx) => (
                <tr key={idx} className="border-t hover:bg-primary-50/40">
                  <td className="py-2 pr-4">{c.name || "-"}</td>
                  <td className="py-2 pr-4">{c.email || "-"}</td>
                  <td className="py-2 pr-4 text-right">{formatCurrency(c.spend)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

