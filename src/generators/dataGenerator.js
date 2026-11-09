/**
 * Maps scanned field types to localized, *coherent* mock values.
 *
 * Instead of picking every value independently, the generator builds a single
 * "persona" per fill run. This keeps a form internally consistent:
 *   - the e-mail and username are derived from the first/last name,
 *   - "password" and "confirm password" receive the same value,
 *   - city, district, postal code and phone area code belong together,
 *   - birth date, age and birth year agree with each other,
 *   - gender radios / selects match the persona's first name.
 *
 * Besides the primary value, the generator can list *alternative* encodings
 * (digits only, ASCII only, other date formats, ...) that the content script
 * tries when the page's validation rejects the first attempt, and *preferred
 * option labels* used to pick a matching entry in dropdowns.
 *
 * This module is DOM-free so it can be reused by the popup preview and tests.
 */
import { FIELD_TYPES as T } from '../shared/constants.js';
import { fitLength, foldText, slugify } from '../shared/textUtils.js';
import { detectDatePart } from '../content/fieldRules.js';
import { TEST_CARDS, formatGrouped } from './identifiers.js';
import { createRandom, securePassword } from './random.js';

const SAFE_EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net'];
const DEFAULT_PASSWORD_LENGTH = 14;
const PHONE_COUNTRY_CODES = { tr: '90', en: '1', de: '49' };

const HINTS = {
  birth: /\b(birth|born|dob|bday|dogum|geburt\w*|nacimiento)\b/,
  age: /\b(age|yas|yasiniz|alter|edad)\b/,
  year: /\b(year|yil|yili|jahr|ano)\b/,
  experience: /\b(experience|deneyim|tecrube|kidem|erfahrung|berufserfahrung)\b/,
  quantity: /\b(quantity|qty|adet|miktar|anzahl|menge|count|cantidad)\b/,
  taxOffice: /\b(vergi ?dairesi|tax ?office|finanzamt)\b/,
  houseNumber: /\b(no|numara|numarasi|nr|number|num|kapi|daire|apt|apartment|hausnummer)\b/,
};

/** Option labels that mean female / male in the supported languages (folded). */
const GENDER_SYNONYMS = {
  female: ['female', 'woman', 'women', 'f', 'kadin', 'k', 'bayan', 'kiz', 'weiblich', 'frau', 'w', 'mrs', 'ms', 'miss', 'madam', 'fem'],
  male: ['male', 'man', 'men', 'm', 'erkek', 'e', 'bay', 'mannlich', 'herr', 'mr', 'sir', 'masc'],
};

const pad2 = (n) => String(n).padStart(2, '0');
const uniq = (values) => [...new Set(values.filter((v) => v !== null && v !== undefined && v !== ''))];

/** ISO yyyy-mm-dd in local time (not UTC, to avoid off-by-one days). */
export function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Formats with DD / MM / YYYY / YY tokens, e.g. "DD.MM.YYYY" → "07.03.1991". */
export function formatDate(date, pattern = 'YYYY-MM-DD') {
  return pattern
    .replace('YYYY', String(date.getFullYear()))
    .replace('YY', String(date.getFullYear()).slice(-2))
    .replace('MM', pad2(date.getMonth() + 1))
    .replace('DD', pad2(date.getDate()));
}

/** ISO-8601 week string for <input type="week">, e.g. "2026-W43". */
function toISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad2(week)}`;
}

function parseDateAttr(value) {
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function digitsOnly(value) {
  return String(value).replace(/\D/g, '');
}

/** "Şükrü Öztürk" → "Sukru Ozturk" (case preserved, for ASCII-only patterns). */
export function asciiFold(value) {
  const map = { ı: 'i', İ: 'I', ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ç: 'c', Ç: 'C', ö: 'o', Ö: 'O', ü: 'u', Ü: 'U', ß: 'ss' };
  return String(value)
    .replace(/[ıİşŞğĞçÇöÖüÜß]/g, (ch) => map[ch])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function monthNames(locale, monthIndex) {
  const names = [];
  for (const tag of uniq([locale, 'en-US'])) {
    try {
      const date = new Date(2000, monthIndex, 1);
      names.push(new Intl.DateTimeFormat(tag, { month: 'long' }).format(date));
      names.push(new Intl.DateTimeFormat(tag, { month: 'short' }).format(date));
    } catch {
      /* Intl not available — numeric labels still work. */
    }
  }
  return names;
}

function buildEmail(firstName, lastName, birthYear, rnd, domains) {
  const f = slugify(firstName);
  const l = slugify(lastName);
  const yy = String(birthYear).slice(-2);
  const local = rnd.pick([
    `${f}.${l}`,
    `${f}${l}`,
    `${f}_${l}`,
    `${f[0]}${l}`,
    `${f}.${l}${yy}`,
    `${f}${l}${rnd.int(1, 99)}`,
  ]);
  return `${local}@${rnd.pick(domains)}`;
}

function buildUsername(firstName, lastName, birthYear, rnd) {
  const f = slugify(firstName);
  const l = slugify(lastName);
  return rnd.pick([`${f}.${l}`, `${f}${l[0]}${String(birthYear).slice(-2)}`, `${f}_${l}`, `${f}${rnd.int(10, 999)}`]);
}

/** Alphanumeric-only password for sites that reject symbols. */
function simplePassword(length, rnd) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789'];
  const all = sets.join('');
  const chars = sets.map((s) => s[rnd.int(0, s.length - 1)]);
  while (chars.length < Math.max(length, 3)) chars.push(all[rnd.int(0, all.length - 1)]);
  return rnd.sample(chars, chars.length).join('');
}

/**
 * Creates one consistent fake identity from a locale dataset.
 * @param {import('../locales/index.js').LocaleDataset} dataset
 * @param {ReturnType<typeof createRandom>} rnd
 * @param {{safeEmails?: boolean}} [options]
 */
export function buildPersona(dataset, rnd, { safeEmails = false } = {}) {
  const gender = rnd.bool() ? 'female' : 'male';
  const firstName = rnd.pick(dataset.firstNames[gender]);
  const lastName = rnd.pick(dataset.lastNames);

  const today = new Date();
  const age = rnd.int(21, 62);
  const birthDate = new Date(today.getFullYear() - age, rnd.int(0, 11), rnd.int(1, 28));
  // Correct age if the birthday has not happened yet this year.
  const hadBirthday =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  const realAge = hadBirthday ? age : age - 1;

  const city = rnd.pick(dataset.cities);
  const address = dataset.formats.address(rnd, city);
  const domains = safeEmails ? SAFE_EMAIL_DOMAINS : dataset.emailDomains;
  const company = rnd.pick(dataset.companies);
  const companySlug = slugify(company.split(/\s(?:A\.Ş\.|Ltd|LLC|Inc|GmbH|AG|Co|San\.)/)[0]) || 'example';

  const card = rnd.pick(TEST_CARDS);
  const expiry = new Date(today.getFullYear() + rnd.int(1, 5), rnd.int(0, 11), 1);

  return {
    locale: dataset.code,
    gender,
    genderLabel: dataset.genders?.[gender] || gender,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    username: buildUsername(firstName, lastName, birthDate.getFullYear(), rnd),
    email: buildEmail(firstName, lastName, birthDate.getFullYear(), rnd, domains),
    phone: dataset.formats.phone(rnd, city),
    password: securePassword(DEFAULT_PASSWORD_LENGTH),
    company,
    website: `https://www.${companySlug}.com`,
    jobTitle: rnd.pick(dataset.jobTitles || ['Specialist']),
    birthDate,
    age: realAge,
    country: dataset.country || '',
    nationalId: dataset.formats.nationalId ? dataset.formats.nationalId(rnd) : rnd.digits(11),
    taxId: dataset.formats.taxId ? dataset.formats.taxId(rnd) : rnd.digits(10),
    iban: dataset.formats.iban ? dataset.formats.iban(rnd) : '',
    card: { brand: card.brand, number: card.number, expiry, cvv: rnd.digits(3) },
    address: { ...address, city: city.name, district: address.district || city.name },
  };
}

/**
 * @typedef {Object} FieldConstraints
 * @property {string} [tag]         'input' | 'textarea' | 'select' | 'editable' | 'combobox'
 * @property {string} [inputType]   Lower-cased input `type`.
 * @property {number|null} [maxLength]
 * @property {number|null} [minLength]
 * @property {string|null} [min]
 * @property {string|null} [max]
 * @property {string|null} [step]
 * @property {string|null} [pattern]
 * @property {string} [autocomplete]
 * @property {boolean} [multiline]
 * @property {string} [hint]        Folded label/name/id text for sub-type hints.
 */

export class DataGenerator {
  /**
   * @param {import('../locales/index.js').LocaleDataset} dataset
   * @param {{safeEmails?: boolean, seed?: number}} [options]
   */
  constructor(dataset, options = {}) {
    this.dataset = dataset;
    this.options = { safeEmails: false, ...options };
    this.rnd = createRandom(options.seed);
    this.reroll();
  }

  /** Creates a fresh persona (e.g. for the popup "shuffle" button). */
  reroll() {
    this.persona = buildPersona(this.dataset, this.rnd, this.options);
    this.passwordCache = new Map([[DEFAULT_PASSWORD_LENGTH, this.persona.password]]);
    this.acceptedPassword = null;
    return this.persona;
  }

  /**
   * Returns a value for a field type, adapted to the control's constraints, or
   * `null` when no sensible value can be produced.
   * @param {string} type One of FIELD_TYPES
   * @param {FieldConstraints} [c]
   * @returns {string|null}
   */
  generate(type, c = {}) {
    const p = this.persona;
    switch (type) {
      case T.FIRST_NAME: return fitLength(p.firstName, c.maxLength);
      case T.LAST_NAME: return fitLength(p.lastName, c.maxLength);
      case T.FULL_NAME: return fitLength(p.fullName, c.maxLength);
      case T.USERNAME: return fitLength(p.username, c.maxLength);
      case T.EMAIL: return this.email(c);
      case T.PHONE: return this.phone(c);
      case T.PASSWORD: return this.password(c);
      case T.ADDRESS: return fitLength(c.multiline ? p.address.full : p.address.line, c.maxLength);
      case T.CITY: return fitLength(p.address.city, c.maxLength);
      case T.DISTRICT: return fitLength(p.address.district, c.maxLength);
      case T.COUNTRY: return fitLength(p.country, c.maxLength);
      case T.POSTAL_CODE: return p.address.postalCode;
      case T.COMPANY: return fitLength(p.company, c.maxLength);
      case T.JOB_TITLE: return fitLength(p.jobTitle, c.maxLength);
      case T.GENDER: return p.genderLabel;
      case T.WEBSITE: return p.website;
      case T.NATIONAL_ID: return this.fitDigits(p.nationalId, c);
      case T.TAX_ID: return this.fitDigits(p.taxId, c);
      case T.IBAN: return this.iban(c);
      case T.CREDIT_CARD: return this.cardNumber(c);
      case T.CARD_EXPIRY: return this.cardExpiry(c);
      case T.CVV: return c.maxLength && c.maxLength < 3 ? null : p.card.cvv;
      case T.DATE: return this.date(c);
      case T.NUMBER: return this.number(c);
      case T.TEXT_AREA: return this.paragraph(c);
      case T.UNKNOWN:
      default:
        return this.shortText(c);
    }
  }

  /* -------------------------------------------------------------- */
  /* Per-type helpers                                                 */
  /* -------------------------------------------------------------- */

  email(c) {
    const { email } = this.persona;
    if (!c.maxLength || email.length <= c.maxLength) return email;
    const [, domain] = email.split('@');
    const short = `${slugify(this.persona.firstName)[0]}${slugify(this.persona.lastName)}`;
    return `${short}@${domain}`.slice(0, c.maxLength);
  }

  /** Locale-formatted phone; degrades to digits when `maxlength` is tight. */
  phone(c) {
    let value = this.persona.phone;
    if (c.inputType === 'number') value = digitsOnly(value);
    if (c.maxLength && value.length > c.maxLength) {
      value = digitsOnly(value);
      // e.g. TR "05321234567" with maxlength=10 → "5321234567" (drop trunk 0)
      if (value.length > c.maxLength) value = value.slice(-c.maxLength);
    }
    return value;
  }

  /** Same password for every field with the same length → confirm fields match. */
  password(c) {
    if (this.acceptedPassword && (!c.maxLength || this.acceptedPassword.length <= c.maxLength)) {
      return this.acceptedPassword;
    }
    const min = c.minLength || 0;
    const max = c.maxLength || 64;
    const length = Math.min(Math.max(DEFAULT_PASSWORD_LENGTH, min), max);
    if (!this.passwordCache.has(length)) this.passwordCache.set(length, securePassword(length));
    return this.passwordCache.get(length);
  }

  /**
   * Called when the page accepted a value that differs from the first attempt,
   * so dependent fields (password confirmation) stay consistent.
   */
  remember(type, value) {
    if (type === T.PASSWORD) this.acceptedPassword = value;
  }

  /** Strips separators when the control is numeric or too short for them. */
  fitDigits(value, c) {
    if (c.inputType === 'number' || (c.maxLength && value.length > c.maxLength)) {
      const digits = digitsOnly(value);
      return c.maxLength ? digits.slice(0, c.maxLength) : digits;
    }
    return value;
  }

  iban(c) {
    const raw = this.persona.iban;
    if (!raw) return null;
    const grouped = formatGrouped(raw);
    if (c.maxLength && grouped.length > c.maxLength) return raw.slice(0, c.maxLength);
    // Many IBAN inputs already render the "TR" prefix outside the field.
    if (c.maxLength && c.maxLength === raw.length - 2) return raw.slice(2);
    return c.inputType === 'number' ? digitsOnly(raw) : grouped;
  }

  cardNumber(c) {
    const { number } = this.persona.card;
    const grouped = formatGrouped(number);
    if (c.inputType === 'number' || (c.maxLength && grouped.length > c.maxLength)) return number;
    return grouped;
  }

  cardExpiry(c) {
    const { expiry } = this.persona.card;
    const month = pad2(expiry.getMonth() + 1);
    const year = String(expiry.getFullYear());
    if (c.inputType === 'month') return `${year}-${month}`;
    const part = this.datePartFor(c);
    if (part === 'month') return month;
    if (part === 'year') return c.maxLength === 2 || /\byy\b/.test(c.hint || '') ? year.slice(-2) : year;
    if (c.maxLength === 4) return `${month}${year.slice(-2)}`;
    if (c.maxLength && c.maxLength >= 7 && /\byyyy\b/.test(c.hint || '')) return `${month}/${year}`;
    return `${month}/${year.slice(-2)}`;
  }

  /** Date part only for controls that clearly hold a single component. */
  datePartFor(c) {
    const isSmall = c.tag === 'select' || c.tag === 'combobox' || c.inputType === 'number' || (c.maxLength && c.maxLength <= 4);
    const fromAutocomplete = /-(day|month|year)\b/.test(c.autocomplete || '');
    return isSmall || fromAutocomplete ? detectDatePart(c) : null;
  }

  date(c) {
    const isBirth = HINTS.birth.test(c.hint || '');
    let date;
    if (isBirth) {
      date = new Date(this.persona.birthDate);
    } else {
      // Generic dates (appointment, start date, ...) → within the next 60 days.
      date = new Date();
      date.setDate(date.getDate() + this.rnd.int(1, 60));
    }

    const min = parseDateAttr(c.min);
    const max = parseDateAttr(c.max);
    if (min && max && min <= max) {
      if (date < min || date > max) date = new Date(min.getTime() + this.rnd.next() * (max - min));
    } else if (min && date < min) {
      date = new Date(min.getTime() + this.rnd.int(0, 30) * 86400000);
    } else if (max && date > max) {
      date = new Date(max.getTime() - this.rnd.int(0, 30) * 86400000);
    }

    const part = this.datePartFor(c);
    if (part === 'day') return String(date.getDate());
    if (part === 'month') return String(date.getMonth() + 1);
    if (part === 'year') return String(date.getFullYear());

    const time = `${pad2(this.rnd.int(9, 17))}:${this.rnd.pick(['00', '15', '30', '45'])}`;
    switch (c.inputType) {
      case 'date': return toISODate(date);
      case 'datetime-local': return `${toISODate(date)}T${time}`;
      case 'month': return toISODate(date).slice(0, 7);
      case 'week': return toISOWeek(date);
      case 'time': return time;
      default: return formatDate(date, this.dataset.dateFormat);
    }
  }

  number(c) {
    const hint = c.hint || '';
    const min = c.min !== null && c.min !== undefined && c.min !== '' ? Number(c.min) : NaN;
    const max = c.max !== null && c.max !== undefined && c.max !== '' ? Number(c.max) : NaN;
    const hasMin = Number.isFinite(min);
    const hasMax = Number.isFinite(max);

    let value;
    if (HINTS.experience.test(hint)) value = this.rnd.int(1, Math.max(1, Math.min(15, this.persona.age - 20)));
    else if (HINTS.age.test(hint)) value = this.persona.age;
    else if (HINTS.year.test(hint)) value = this.persona.birthDate.getFullYear();
    else if (HINTS.quantity.test(hint)) value = this.rnd.int(1, 5);
    else value = this.rnd.int(hasMin ? min : 1, hasMax ? max : (hasMin ? min + 100 : 100));

    if (hasMin) value = Math.max(value, min);
    if (hasMax) value = Math.min(value, max);

    const step = Number(c.step);
    if (Number.isFinite(step) && step > 0) {
      const base = hasMin ? min : 0;
      value = base + Math.round((value - base) / step) * step;
      if (hasMax && value > max) value -= step;
      // Avoid float noise such as 0.30000000000000004.
      const decimals = (String(c.step).split('.')[1] || '').length;
      return value.toFixed(decimals);
    }
    return String(Math.round(value));
  }

  /** 2–3 natural sentences; extends to satisfy `minlength` when needed. */
  paragraph(c) {
    const { sentences } = this.dataset;
    const picked = this.rnd.sample(sentences, this.rnd.int(2, 3));
    let text = picked.join(' ');
    let guard = 0;
    while (c.minLength && text.length < c.minLength && guard < 20) {
      text += ` ${this.rnd.pick(sentences)}`;
      guard += 1;
    }
    return fitLength(text, c.maxLength);
  }

  shortText(c) {
    const hint = c.hint || '';
    const { address } = this.persona;
    if (c.inputType === 'url') return this.persona.website;
    if (HINTS.taxOffice.test(hint)) {
      const office = { tr: `${address.district} Vergi Dairesi`, de: `Finanzamt ${address.city}` }[this.dataset.code] || `${address.city} Tax Office`;
      return fitLength(office, c.maxLength);
    }
    if (HINTS.houseNumber.test(hint) && (!c.maxLength || c.maxLength <= 10)) return String(this.rnd.int(1, 150));
    let text = this.rnd.pick(this.dataset.shortTexts);
    if (c.minLength && text.length < c.minLength) text = this.paragraph({ minLength: c.minLength, maxLength: c.maxLength });
    return fitLength(text, c.maxLength);
  }

  /* -------------------------------------------------------------- */
  /* Dropdown preferences & validation fallbacks                      */
  /* -------------------------------------------------------------- */

  /**
   * Option labels/values that would be the *coherent* choice for a dropdown
   * of the given type, most preferred first. Empty → pick randomly.
   * @param {string} type
   * @param {FieldConstraints} [c]
   * @returns {string[]}
   */
  selectPreferences(type, c = {}) {
    const p = this.persona;
    const locale = this.dataset.intlLocale || this.dataset.code;
    const datePrefs = (date, part) => {
      if (part === 'day') return [String(date.getDate()), pad2(date.getDate())];
      if (part === 'month') {
        const m = date.getMonth();
        return [String(m + 1), pad2(m + 1), ...monthNames(locale, m)];
      }
      if (part === 'year') return [String(date.getFullYear()), String(date.getFullYear()).slice(-2)];
      return [];
    };
    switch (type) {
      case T.CITY: return [p.address.city];
      case T.DISTRICT: return [p.address.district];
      case T.COUNTRY: return uniq([p.country, ...(this.dataset.countryAliases || [])]);
      case T.GENDER: return uniq([p.genderLabel, ...GENDER_SYNONYMS[p.gender]]);
      case T.DATE: return datePrefs(HINTS.birth.test(c.hint || '') ? p.birthDate : new Date(), detectDatePart({ ...c, maxLength: 4 }));
      case T.CARD_EXPIRY: return datePrefs(p.card.expiry, detectDatePart({ ...c, maxLength: 4 }));
      case T.JOB_TITLE: return [p.jobTitle];
      case T.NUMBER: {
        const hint = c.hint || '';
        if (HINTS.age.test(hint)) return [String(p.age)];
        if (HINTS.year.test(hint) && !HINTS.experience.test(hint)) return [String(p.birthDate.getFullYear())];
        return [];
      }
      default: return [];
    }
  }

  /**
   * True if `label` (an option text, radio label, ...) means the persona's gender.
   * Exact folded match only, so "Female" never matches "male".
   */
  matchesGender(label) {
    const folded = foldText(label);
    if (!folded) return false;
    return [foldText(this.persona.genderLabel), ...GENDER_SYNONYMS[this.persona.gender]].includes(folded);
  }

  /**
   * Alternative encodings of the same information, tried in order when the
   * control rejects the primary value (pattern / maxlength / type mismatch).
   * @param {string} type
   * @param {FieldConstraints} c
   * @param {string} value The value that was rejected.
   * @returns {string[]}
   */
  alternatives(type, c, value) {
    const p = this.persona;
    const out = [];
    const digits = digitsOnly(value);
    switch (type) {
      case T.PHONE: {
        const all = digitsOnly(p.phone);
        const national = all.replace(/^0+/, '');
        const cc = PHONE_COUNTRY_CODES[this.dataset.code] || '';
        out.push(all, national, `0${national}`, `+${cc}${national}`, `${cc}${national}`, `+${cc} ${national}`);
        break;
      }
      case T.POSTAL_CODE:
      case T.NATIONAL_ID:
      case T.TAX_ID:
      case T.CVV:
        out.push(digits);
        break;
      case T.IBAN:
        out.push(p.iban, formatGrouped(p.iban), p.iban.slice(2), p.iban.slice(4), digitsOnly(p.iban));
        break;
      case T.CREDIT_CARD:
        out.push(p.card.number, formatGrouped(p.card.number), formatGrouped(p.card.number).replace(/ /g, '-'));
        break;
      case T.CARD_EXPIRY: {
        const m = pad2(p.card.expiry.getMonth() + 1);
        const y = String(p.card.expiry.getFullYear());
        out.push(`${m}/${y.slice(-2)}`, `${m}${y.slice(-2)}`, `${m}/${y}`, `${m} / ${y.slice(-2)}`, `${m}-${y.slice(-2)}`, `${y}-${m}`);
        break;
      }
      case T.DATE: {
        const date = HINTS.birth.test(c.hint || '') ? p.birthDate : null;
        if (date) {
          for (const fmt of ['DD.MM.YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD-MM-YYYY', 'DDMMYYYY']) out.push(formatDate(date, fmt));
        }
        break;
      }
      case T.EMAIL: {
        const [, domain] = p.email.split('@');
        out.push(`${slugify(p.firstName)}.${slugify(p.lastName)}@${domain}`, `${slugify(p.firstName)[0]}${slugify(p.lastName)}@example.com`);
        break;
      }
      case T.PASSWORD: {
        const length = Math.min(Math.max(c.minLength || 8, 10), c.maxLength || 64);
        out.push(simplePassword(length, this.rnd), securePassword(Math.max(8, Math.min(length, c.maxLength || length))));
        break;
      }
      case T.USERNAME:
        out.push(slugify(p.username), `${slugify(p.firstName)}${this.rnd.int(100, 999)}`);
        break;
      case T.NUMBER:
        out.push(String(this.rnd.int(1, 9)));
        break;
      default:
        break;
    }
    // Generic fallbacks for every type.
    out.push(asciiFold(value), asciiFold(value).replace(/[^A-Za-z0-9 ]/g, ''));
    if (c.maxLength) out.push(value.slice(0, c.maxLength));
    if (c.minLength && value.length < c.minLength) out.push(value.padEnd(c.minLength, digits ? '0' : 'a'));
    return uniq(out).filter((v) => v !== value && (!c.maxLength || v.length <= c.maxLength));
  }
}
