/**
 * Real-time input masks and parsers for Brazilian formats (BRL currency,
 * phone/mobile, CPF/CNPJ, BR date, and non-negative integers).
 *
 * All parsers return clean primitives / digit strings compatible with the
 * BenchOS backend DTO contracts.
 */

const MAX_CURRENCY_DIGITS = 11; // up to R$ 999.999.999,99

export function unmaskDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function maskInteger(value: string, maxLength = 4): string {
  return unmaskDigits(value).slice(0, maxLength);
}

/**
 * Formats raw user input into BRL currency string without the "R$" prefix
 * (e.g. "123456" -> "1.234,56"). Uses ATM-style right-to-left cent entry
 * so it works reliably with `keyboardType="number-pad"` on Android & iOS.
 */
export function maskCurrencyBRL(raw: string): string {
  const digits = unmaskDigits(raw).slice(0, MAX_CURRENCY_DIGITS);
  if (!digits) return '';

  const cents = Number.parseInt(digits, 10);
  if (!Number.isFinite(cents) || cents <= 0) return '';

  const padded = String(cents).padStart(3, '0');
  const integerPart = padded.slice(0, -2);
  const decimalPart = padded.slice(-2);
  const formattedInt = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${formattedInt},${decimalPart}`;
}

/**
 * Formats a numeric amount (e.g. 1234.5) into the BRL input mask ("1.234,56").
 * Returns empty string for 0 or invalid values so placeholders show cleanly.
 */
export function formatCurrencyInput(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '';
  }
  const cents = Math.round(value * 100);
  return maskCurrencyBRL(String(cents));
}

/**
 * Parses a BRL-masked string ("1.234,56") or standard decimal string into a
 * non-negative number rounded to 2 decimal places. Returns 0 when empty/invalid.
 */
export function parseCurrencyBRL(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  if (trimmed.includes(',')) {
    const normalized = trimmed.replace(/[^\d,]/g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
  }

  const cleaned = trimmed.replace(/[^\d.]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
}

/**
 * Progressively masks Brazilian phone / mobile numbers:
 * - Landline (10 digits): (11) 3333-4444
 * - Mobile   (11 digits): (11) 99999-9999
 */
export function maskPhoneBR(raw: string): string {
  const digits = unmaskDigits(raw).slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return digits.replace(/^(\d{2})(\d+)/, '($1) $2');
  }
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d+)/, '($1) $2-$3');
  }
  return digits.replace(/^(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

/**
 * Progressively masks CPF (up to 11 digits) or CNPJ (12-14 digits):
 * - CPF:  000.000.000-00
 * - CNPJ: 00.000.000/0001-00
 */
export function maskCpfCnpj(raw: string): string {
  const digits = unmaskDigits(raw).slice(0, 14);
  if (!digits) return '';

  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

/**
 * Progressively masks DD/MM/AAAA dates (up to 8 digits).
 */
export function maskDateBR(raw: string): string {
  const digits = unmaskDigits(raw).slice(0, 8);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.replace(/^(\d{2})(\d+)/, '$1/$2');
  return digits.replace(/^(\d{2})(\d{2})(\d+)/, '$1/$2/$3');
}
