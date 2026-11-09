/**
 * Locale registry & language detection.
 *
 * Adding a language:
 *   1. Create `./data/<code>.js` exporting a dataset that follows `LocaleDataset`.
 *   2. Import it below and add it to `DATASETS`.
 * Nothing else needs to change — the popup, detector and generator pick it up.
 *
 * Datasets are imported statically (they are small) so this module works in
 * every context, including the service worker where dynamic `import()` is
 * not allowed.
 *
 * @typedef {Object} RandomHelper
 * @property {(min:number, max:number) => number} int
 * @property {<T>(items:T[]) => T} pick
 * @property {(p?:number) => boolean} bool
 * @property {(count:number) => string} digits
 *
 * @typedef {Object} AddressParts
 * @property {string} line        Single-line street address.
 * @property {string} full        Multi-part address incl. postal code & city.
 * @property {string|null} district
 * @property {string} postalCode
 *
 * @typedef {Object} LocaleDataset
 * @property {string} code               ISO 639-1 code ("tr").
 * @property {string} label              Native name ("Türkçe").
 * @property {string} englishLabel
 * @property {string} flag
 * @property {string} dateFormat         Tokens: DD, MM, YYYY.
 * @property {string} intlLocale         BCP-47 tag for Intl APIs (month names).
 * @property {string} country            Native country name ("Türkiye").
 * @property {string[]} countryAliases   Labels a country dropdown may use.
 * @property {{female:string, male:string}} genders
 * @property {string[]} jobTitles
 * @property {{male:string[], female:string[]}} firstNames
 * @property {string[]} lastNames
 * @property {string[]} emailDomains
 * @property {string[]} companies
 * @property {Array<{name:string}>} cities
 * @property {string[]} shortTexts
 * @property {string[]} sentences
 * @property {{
 *   phone:(rnd:RandomHelper, city:object) => string,
 *   address:(rnd:RandomHelper, city:object) => AddressParts,
 *   nationalId:(rnd:RandomHelper) => string,
 *   taxId:(rnd:RandomHelper) => string,
 *   iban:(rnd:RandomHelper) => string
 * }} formats
 */
import { AUTO_LOCALE } from '../shared/constants.js';
import tr from './data/tr.js';
import en from './data/en.js';
import de from './data/de.js';

/** @type {Record<string, LocaleDataset>} */
const DATASETS = Object.freeze({ tr, en, de });

export const DEFAULT_LOCALE = 'en';

/** Lightweight metadata for UIs (no data pools). */
export const SUPPORTED_LOCALES = Object.freeze(
  Object.values(DATASETS).map(({ code, label, englishLabel, flag }) => ({ code, label, englishLabel, flag }))
);

export function isSupportedLocale(code) {
  return typeof code === 'string' && Object.hasOwn(DATASETS, code);
}

/**
 * Ordered list of the user's preferred languages, most important first.
 * `navigator.languages` reflects the user's Accept-Language ordering; the
 * Chrome UI language is appended as a final hint.
 */
export function getBrowserLanguages() {
  const languages = [];
  try {
    if (typeof navigator !== 'undefined') {
      if (Array.isArray(navigator.languages)) languages.push(...navigator.languages);
      if (navigator.language) languages.push(navigator.language);
    }
    if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
      languages.push(chrome.i18n.getUILanguage());
    }
  } catch {
    /* Non-browser environment — fall through to default. */
  }
  return [...new Set(languages.filter(Boolean))];
}

/**
 * Maps BCP-47 tags ("tr-TR", "en_US", "de") to the first supported base locale.
 * @param {string[]} [candidates]
 */
export function detectBrowserLocale(candidates = getBrowserLanguages()) {
  for (const tag of candidates) {
    const base = String(tag).toLowerCase().split(/[-_]/)[0];
    if (isSupportedLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * Resolves the effective locale: a valid manual override wins, otherwise the
 * browser language is used, falling back to English.
 * @param {string} [preference] 'auto' or a locale code
 */
export function resolveLocale(preference = AUTO_LOCALE) {
  if (preference !== AUTO_LOCALE && isSupportedLocale(preference)) return preference;
  return detectBrowserLocale();
}

/** @returns {LocaleDataset} */
export function getDataset(code) {
  return DATASETS[isSupportedLocale(code) ? code : DEFAULT_LOCALE];
}
