/**
 * Text normalisation helpers used by the field classifier and data generator.
 *
 * Why fold text? Regex `\b` and character classes in JS are ASCII-centric, and
 * Turkish casing is notoriously tricky ("İ".toLowerCase() === "i̇", "I" → "ı").
 * Folding everything to lowercase ASCII words separated by single spaces lets
 * us write simple, robust multilingual patterns such as /\bsifre/ or /\bdogum/.
 */

const SPECIAL_CHAR_MAP = {
  ı: 'i', İ: 'i', I: 'i',
  ş: 's', Ş: 's',
  ğ: 'g', Ğ: 'g',
  ç: 'c', Ç: 'c',
  ö: 'o', Ö: 'o',
  ü: 'u', Ü: 'u',
  ß: 'ss',
  æ: 'ae', Æ: 'ae',
  ø: 'o', Ø: 'o',
  ł: 'l', Ł: 'l',
};
const SPECIAL_CHAR_RE = /[ıİIşŞğĞçÇöÖüÜßæÆøØłŁ]/g;

/**
 * Converts arbitrary attribute / label text into lowercase ASCII words.
 *   "firstName"        → "first name"
 *   "Adınız Soyadınız" → "adiniz soyadiniz"
 *   "E-Posta Adresi*"  → "e posta adresi"
 *   "address_line1"    → "address line 1"
 * @param {unknown} input
 * @returns {string}
 */
export function foldText(input) {
  if (input == null) return '';
  return String(input)
    .replace(/([a-z\d])([A-Z])/g, '$1 $2') // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // HTMLInput → HTML Input
    .replace(/([a-zA-Z])(\d)/g, '$1 $2') // line1 → line 1
    .replace(SPECIAL_CHAR_RE, (ch) => SPECIAL_CHAR_MAP[ch])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics (é → e)
    .toLowerCase()
    .replace(/[^a-z\d]+/g, ' ')
    .trim();
}

/** "Şükrü Öztürk" → "sukruozturk" — safe for e-mail local parts / usernames. */
export function slugify(input) {
  return foldText(input).replace(/\s+/g, '');
}

/** Collapses whitespace and trims; returns '' for nullish input. */
export function cleanText(input, maxLength = 200) {
  if (input == null) return '';
  const text = String(input).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

/**
 * Shortens text to `maxLength`, preferring a word boundary.
 * @param {string} text
 * @param {number|null|undefined} maxLength
 */
export function fitLength(text, maxLength) {
  if (!maxLength || maxLength <= 0 || text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice).trim();
}
