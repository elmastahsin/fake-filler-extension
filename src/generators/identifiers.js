/**
 * Checksum-valid identifiers: Turkish TC Kimlik No & VKN, IBAN (ISO 13616)
 * and Luhn-valid *test* card numbers.
 *
 * Many forms validate these client-side (or server-side) with the official
 * checksum algorithms, so random digits are rejected. Everything here is
 * DOM-free and deterministic for a seeded `rnd`.
 */

const sumDigits = (digits) => digits.reduce((a, b) => a + b, 0);

/* ------------------------------------------------------------------ */
/* TC Kimlik No (11 digits)                                             */
/* ------------------------------------------------------------------ */

/**
 * d1 ≠ 0; d10 = ((d1+d3+d5+d7+d9)·7 − (d2+d4+d6+d8)) mod 10; d11 = Σ(d1..d10) mod 10
 * @param {{int:(min:number,max:number)=>number}} rnd
 */
export function tcKimlikNo(rnd) {
  const d = [rnd.int(1, 9)];
  for (let i = 0; i < 8; i += 1) d.push(rnd.int(0, 9));
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  d.push((((odd * 7 - even) % 10) + 10) % 10);
  d.push(sumDigits(d) % 10);
  return d.join('');
}

export function isValidTcKimlikNo(value) {
  const s = String(value);
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const d = [...s].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  return d[9] === (((odd * 7 - even) % 10) + 10) % 10 && d[10] === sumDigits(d.slice(0, 10)) % 10;
}

/* ------------------------------------------------------------------ */
/* Vergi Kimlik No (VKN, 10 digits)                                     */
/* ------------------------------------------------------------------ */

function vknCheckDigit(nine) {
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    const tmp = (nine[i] + 9 - i) % 10;
    let v = (tmp * 2 ** (9 - i)) % 9;
    if (tmp !== 0 && v === 0) v = 9;
    sum += v;
  }
  return (10 - (sum % 10)) % 10;
}

export function vergiKimlikNo(rnd) {
  const d = [];
  for (let i = 0; i < 9; i += 1) d.push(rnd.int(0, 9));
  d.push(vknCheckDigit(d));
  return d.join('');
}

export function isValidVkn(value) {
  const s = String(value);
  if (!/^\d{10}$/.test(s)) return false;
  const d = [...s].map(Number);
  return d[9] === vknCheckDigit(d.slice(0, 9));
}

/* ------------------------------------------------------------------ */
/* IBAN                                                                 */
/* ------------------------------------------------------------------ */

function mod97(numeric) {
  let remainder = 0;
  for (const ch of numeric) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder;
}

const toNumeric = (s) => s.toUpperCase().replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

/**
 * @param {string} country ISO 3166 alpha-2, e.g. "TR"
 * @param {string} bban    Country specific basic bank account number
 */
export function buildIban(country, bban) {
  const check = 98 - mod97(toNumeric(`${bban}${country}00`));
  return `${country}${String(check).padStart(2, '0')}${bban}`;
}

export function isValidIban(value) {
  const s = String(value).replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z\d]{10,30}$/.test(s)) return false;
  return mod97(toNumeric(`${s.slice(4)}${s.slice(0, 4)}`)) === 1;
}

/** "TR330006100519786457841326" → "TR33 0006 1005 1978 6457 8413 26" */
export function formatGrouped(value, size = 4) {
  return String(value).replace(new RegExp(`(.{${size}})(?=.)`, 'g'), '$1 ');
}

/* ------------------------------------------------------------------ */
/* Payment cards — public sandbox test numbers only                     */
/* ------------------------------------------------------------------ */

/**
 * Well-known gateway *test* numbers (Stripe, Adyen, iyzico, PayTR...). Using
 * published test numbers instead of random Luhn-valid ones guarantees we never
 * generate a number that belongs to a real card.
 */
export const TEST_CARDS = Object.freeze([
  { brand: 'visa', number: '4111111111111111' },
  { brand: 'visa', number: '4242424242424242' },
  { brand: 'visa', number: '4012888888881881' },
  { brand: 'mastercard', number: '5555555555554444' },
  { brand: 'mastercard', number: '5105105105105100' },
  { brand: 'mastercard', number: '5528790000000008' },
]);

export function isValidLuhn(value) {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 12) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

