export type IntegerInputResult =
  | { ok: true; value: number }
  | { ok: false; value: number; message: string };

export function parseIntegerInRange(rawValue: string, min: number, max: number): IntegerInputResult {
  const raw = rawValue.trim();
  if (!raw) return { ok: false, value: Number.NaN, message: "A value is required." };
  if (!/^-?\d+$/.test(raw)) {
    return { ok: false, value: Number.NaN, message: "Value must be a whole number." };
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    return { ok: false, value, message: `Value must be between ${min} and ${max}.` };
  }

  return { ok: true, value };
}
