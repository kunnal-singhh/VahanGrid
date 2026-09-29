/**
 * Formatting utilities for Indian EV mobility numbers, currencies, and timestamps.
 */

export function formatCurrency(amount, currency = 'INR') {
  const curr = currency || 'INR';
  if (typeof amount !== 'number' || isNaN(amount)) {
    return `${curr === 'INR' ? '₹' : curr + ' '}0.00`;
  }
  try {
    return new Intl.NumberFormat(curr === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (_) {
    const symbol = curr === 'INR' ? '₹' : `${curr} `;
    return `${symbol}${amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

export function formatCompactCurrency(amount, currency = 'INR') {
  const curr = currency || 'INR';
  if (typeof amount !== 'number' || isNaN(amount)) {
    return `${curr === 'INR' ? '₹' : curr + ' '}0`;
  }
  try {
    return new Intl.NumberFormat(curr === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: curr,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch (_) {
    const symbol = curr === 'INR' ? '₹' : `${curr} `;
    return `${symbol}${amount.toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    })}`;
  }
}

export function formatKwh(kwh) {
  if (typeof kwh !== 'number') return '0.0 kWh';
  return `${kwh.toFixed(1)} kWh`;
}

export function formatKw(kw) {
  if (typeof kw !== 'number') return '0 kW';
  return `${kw} kW`;
}

export function formatDistance(km) {
  if (typeof km !== 'number') return '0 km';
  return `${Math.round(km)} km`;
}

export function formatDuration(mins) {
  if (typeof mins !== 'number' || mins <= 0) return '0 min';
  const hours = Math.floor(mins / 60);
  const remainingMins = Math.round(mins % 60);
  if (hours > 0) {
    return `${hours}h ${remainingMins}m`;
  }
  return `${remainingMins} min`;
}

export function formatTimestampIST(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
