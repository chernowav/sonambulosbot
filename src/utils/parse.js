function parseAmount(value, { fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    return fallback !== undefined ? fallback : NaN;
  }
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) return NaN;
  return amount;
}

// Interpreta la sintaxis libre "/send [X] tokens to @destino", con X
// opcional (por defecto 1, como documenta /help).
function parseSendArgs(args) {
  const target = args.find((a) => a.startsWith('@')) || args.find((a) => /^\d{7,}$/.test(a));
  if (!target) return { error: 'target' };

  const amountArg = args.find((a) => a !== target && /^\d{1,6}$/.test(a));
  const amount = parseAmount(amountArg, { fallback: 1 });
  if (Number.isNaN(amount)) return { error: 'amount' };

  return { target: target.replace('@', ''), amount };
}

module.exports = { parseAmount, parseSendArgs };
