export default function SummaryCards({ customers, orders, revenue }) {
  const items = [
    { label: "Customers", value: customers },
    { label: "Orders", value: orders },
    { label: "Revenue", value: `$${Number(revenue || 0).toLocaleString()}` },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {items.map((item, idx) => (
        <div
          key={item.label}
          className={`rounded-xl p-5 shadow-card border border-white/60 text-white bg-gradient-to-br ${[
            "from-primary-500 to-primary-700",
            "from-accent-500 to-accent-700",
            "from-cyan-500 to-blue-600",
          ][idx]}`}
        >
          <div className="text-sm flex items-center justify-between opacity-90">
            <span>{item.label}</span>
            <span className="bg-white/20 text-white rounded-full px-2 py-0.5 text-[10px]">Live</span>
          </div>
          <div className="text-3xl font-semibold mt-1">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

