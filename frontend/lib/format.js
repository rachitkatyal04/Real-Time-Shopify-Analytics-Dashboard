export function formatCurrency(amount, { currency = "USD", locale = "en-US" } = {}) {
  const num = Number(amount || 0);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(isNaN(num) ? 0 : num);
  } catch (_e) {
    // Fallback: plain number with symbol
    return `$${Number.isFinite(num) ? num.toLocaleString() : "0"}`;
  }
}

export function formatDateYYYYMMDD(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toISOString().slice(0, 10);
  } catch (_e) {
    return String(dateStr);
  }
}


