export const SUPPORTED_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "CAD",
  "AUD",
  "DKK",
  "NOK",
  "SEK",
  "PLN",
  "CZK",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  EUR: "EUR: Euro",
  USD: "USD: US dollar",
  GBP: "GBP: Pound sterling",
  CHF: "CHF: Swiss franc",
  CAD: "CAD: Canadian dollar",
  AUD: "AUD: Australian dollar",
  DKK: "DKK: Danish krone",
  NOK: "NOK: Norwegian krone",
  SEK: "SEK: Swedish krona",
  PLN: "PLN: Polish złoty",
  CZK: "CZK: Czech koruna",
};

export const isSupportedCurrency = (
  value: string,
): value is SupportedCurrency =>
  (SUPPORTED_CURRENCIES as readonly string[]).includes(value);

/**
 * Converts a lowest-unit amount and rounds once at the destination. Every
 * supported dashboard currency uses two decimal places, so cents stay cents.
 */
export const convertCents = (cents: number, rate: number): number => {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error("Money amount must be a non-negative safe integer");
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Exchange rate must be positive");
  }
  const converted = Math.round(cents * rate);
  if (!Number.isSafeInteger(converted)) {
    throw new Error("Converted money amount exceeds the safe integer range");
  }
  return converted;
};

/** Convert an EUR catalog estimate with a persisted parts-per-million rate. */
export const convertEurCents = (cents: number, ratePpm = 1_000_000): number =>
  convertCents(cents, ratePpm / 1_000_000);

/** Normalize a native amount into a reporting currency via EUR-based rates. */
export const normalizeCurrencyCents = (
  cents: number,
  fromRatePpm: number,
  toRatePpm: number,
): number => {
  if (fromRatePpm <= 0 || toRatePpm <= 0) {
    throw new Error("Persisted currency rates must be positive");
  }
  return convertCents(cents, toRatePpm / fromRatePpm);
};
