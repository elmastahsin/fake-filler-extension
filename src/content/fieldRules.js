/**
 * Pure field classification heuristics (no DOM access → unit-testable).
 *
 * Classification pipeline (first confident answer wins):
 *   1. `autocomplete` attribute tokens (the most explicit signal a page gives)
 *   2. Input `type` (email / password / tel / url / date-like)
 *   3. Multilingual keyword rules applied to each text source in priority order:
 *      label → aria-label → name → id → title → placeholder → nearby text
 *   4. Placeholder "shape" (e.g. "ornek@mail.com", "05xx xxx xx xx", "AA/YY")
 *   5. Structural fallback (textarea → TEXT_AREA, number → NUMBER, else UNKNOWN)
 *
 * All keyword matching is done on folded text (lowercase ASCII words), see
 * `foldText` — so "Şifre", "ŞİFRE" and "sifre" are all the same token "sifre".
 */
import { FIELD_TYPES as T } from '../shared/constants.js';
import { foldText } from '../shared/textUtils.js';

/**
 * A bare "Name"/"İsim" label is ambiguous: it means FIRST_NAME when the same
 * form also has a surname field, FULL_NAME otherwise. The DOM scanner resolves
 * this marker after the whole form has been classified.
 */
export const NAME_AMBIGUOUS = 'NAME_AMBIGUOUS';

/** Non-person "name" contexts: "product name", "ürün adı", "file name", "vergi dairesi adı", ... */
const NON_PERSON_NAME = /\b(urun|product|produkt|company|firma|sirket|unternehmen|file|dosya|datei|project|proje|projekt|category|kategori|domain|site|website|app|event|etkinlik|course|kurs|ders|title|baslik|kart|bank|banka|brand|marka|team|takim|group|grup|store|magaza|shop|item|tag|role|rol|display|daire|dairesi|office|sube|branch|bolum|department|abteilung|okul|school|schule|universite|university|hastane|hospital|country|ulke|city|sehir|street|sokak|cadde|mahalle|plan|paket|package|server|sunucu|device|cihaz|wifi|network|ag)\b/;

/**
 * Ordered rule list. Order matters — more specific concepts come first:
 *  - "email address" must be EMAIL before ADDRESS can match,
 *  - card holder name must be FULL_NAME before CREDIT_CARD / name rules,
 *  - location rules (country / district / city / address) come before the
 *    person-name rules so "Şehir Adı" or "Firma Adresi" are not names,
 *  - "company name" must be COMPANY before the generic name rules.
 * @type {Array<{type:string, any:RegExp[], not?:RegExp}>}
 */
export const KEYWORD_RULES = [
  {
    type: T.EMAIL,
    any: [/\be ?mail/, /\bmail\b/, /\be ?posta/, /\beposta/, /\bcorreo\b/, /\bcourriel\b/],
  },
  {
    type: T.PASSWORD,
    any: [/\bpass ?word/, /\bpasswd\b/, /\bpwd\b/, /\bsifre/, /\bparola/, /\bpasswort/, /\bkennwort/, /\bcontrasena\b/],
  },
  {
    type: T.CVV,
    any: [/\bcvv/, /\bcvc/, /\bcv2\b/, /\bcvn\b/, /\bcsc\b/, /\bsecurity ?code/, /\bguvenlik ?kod/, /\bkart ?dogrulama/, /\bpruf ?(nummer|ziffer)/, /\bcard ?code\b/],
  },
  {
    type: T.CARD_EXPIRY,
    any: [/\bexp(iry|iration|ire|ires)?\b/, /\bexpir/, /\bvalid ?(thru|through|until)/, /\bson ?kullanma/, /\bskt\b/, /\bgecerlilik/, /\bablauf/, /\bgultig ?bis/, /\b(mm|aa) ?(yy|yyyy)\b/, /\bcc ?(month|year|exp)/],
  },
  {
    type: T.FULL_NAME,
    any: [/\bcard ?holder/, /\bname on (the )?card/, /\bkart ?sahibi/, /\bkart (uzerindeki )?(isim|ad)/, /\bkarten ?inhaber/, /\bcc ?name/],
  },
  {
    type: T.CREDIT_CARD,
    any: [/\bcard ?(number|num|no)\b/, /\bcard ?number/, /\bcc ?(number|num|no)\b/, /\bccnum/, /\bcredit ?card/, /\bdebit ?card/, /\bkredi ?karti/, /\bbanka ?karti/, /\bkart ?(numarasi|no)\b/, /\bkarten ?nummer/],
  },
  {
    type: T.IBAN,
    any: [/\biban\b/],
  },
  {
    type: T.TAX_ID,
    any: [/\bvergi ?(no|numarasi|kimlik)/, /\bvkn\b/, /\btax ?(id|number|no|code)/, /\bvat\b/, /\bein ?(number|no)\b/, /\btin\b/, /\bsteuer ?(nummer|id|identifikationsnummer)/, /\bust ?id/],
    not: /\bdaire/,
  },
  {
    type: T.NATIONAL_ID,
    any: [
      /\bt ?c ?(kimlik|no|kn)\b/, /\btckn?\b/, /\btckimlik/, /\bt c\b/, /\bkimlik ?(no|numarasi|numaraniz)/, /\bnational ?(id|identity|number)/,
      /\bid ?number/, /\bidentity ?(number|no)/, /\bssn\b/, /\bsocial ?security/, /\bpersonal ?(id|number)/, /\bpersonalausweis/,
      /\bausweis ?nummer/, /\bdni\b/, /\bpassport ?(no|number)/, /\bpasaport/,
    ],
  },
  {
    type: T.PHONE,
    any: [/\bphone/, /\btel\b/, /\btelephone/, /\btelefon/, /\bmobile?\b/, /\bmobil\b/, /\bcell/, /\bgsm\b/, /\bcep\b/, /\bhandy\b/, /\bmsisdn\b/, /\bwhatsapp\b/, /\bfax\b/],
  },
  {
    type: T.POSTAL_CODE,
    any: [/\bzip/, /\bpostal/, /\bpost ?code/, /\bposta ?kod/, /\bplz\b/, /\bpostleitzahl/, /\bcodigo postal\b/, /\bcode postal\b/],
  },
  {
    type: T.WEBSITE,
    any: [/\bweb ?site/, /\bweb ?sitesi/, /\bweb ?adres/, /\bhome ?page/, /\burl\b/, /\blinkedin/, /\bportfolio/, /\bgithub/, /\bwebseite/, /\binternet ?seite/, /\binternet ?adres/],
  },
  {
    type: T.DATE,
    any: [/\bdate\b/, /\bdob\b/, /\bbirth ?(day|date)?\b/, /\bbday\b/, /\btarih/, /\bdogum (tarih|gunu)/, /\bgeburts?(datum|tag)\b/, /\bdatum\b/, /\bfecha\b/],
    not: /\b(place|yer|yeri|ort|lugar)\b/,
  },
  {
    type: T.COUNTRY,
    any: [/\bcountry/, /\bulke/, /\bland\b/, /\bnationality/, /\buyruk/, /\bstaatsangehorigkeit/, /\bpais\b/, /\bpays\b/],
  },
  {
    type: T.DISTRICT,
    any: [/\bilce/, /\bdistrict/, /\bsemt\b/, /\bbezirk/, /\bstadtteil/, /\bcounty\b/, /\bstate\b/, /\bbundesland/],
  },
  {
    type: T.CITY,
    any: [
      /\bcity\b/, /\btown\b/, /\bsehir/, /\bil\b/, /\bstadt\b/, /\bort\b/, /\bwohnort\b/, /\bciudad\b/, /\bville\b/, /\blocality\b/,
      /\bprovince\b/, /\bdogum ?yeri/, /\bbirth ?place/, /\bplace of birth/, /\bgeburtsort/,
    ],
  },
  {
    type: T.ADDRESS,
    any: [/\baddress/, /\baddr\b/, /\badres/, /\bstreet/, /\bsokak/, /\bcadde/, /\bmahalle/, /\bstrasse/, /\banschrift/, /\bdireccion\b/, /\badresse\b/],
  },
  {
    type: T.GENDER,
    any: [/\bgender\b/, /\bsex\b/, /\bcinsiyet/, /\bgeschlecht\b/, /\banrede\b/, /\bsalutation\b/, /\bhitap/],
  },
  {
    type: T.USERNAME,
    any: [/\buser ?name\b/, /\buser ?id\b/, /\blogin\b/, /\bkullanici ?adi/, /\bkullanici\b/, /\bbenutzer ?name/, /\bnick ?name/, /\bhandle\b/],
  },
  {
    type: T.COMPANY,
    any: [/\bcompany/, /\borgani[sz]ation/, /\bfirma/, /\bsirket/, /\bunternehmen/, /\bkurum\b/, /\bkurulus/, /\bbusiness ?name/, /\bemployer\b/, /\bisyeri/, /\bticari ?unvan/, /\bisveren/],
  },
  {
    type: T.JOB_TITLE,
    any: [/\bjob ?title/, /\bjob\b/, /\bposition\b/, /\bpozisyon/, /\bunvan/, /\bmeslek/, /\boccupation/, /\bprofession/, /\bberuf/, /\bgorev/, /\bdesignation\b/],
  },
  {
    type: T.FULL_NAME,
    any: [
      /\bfull ?name/, /\bad ?soyad/, /\badi ?soyadi/, /\badiniz ?soyadiniz/, /\bisim ?soyisim/,
      /\bname ?surname/, /\byour ?name\b/, /\bcontact ?name/, /\bvoll(standiger)? ?name/, /\bnombre completo\b/,
    ],
  },
  {
    type: T.LAST_NAME,
    any: [/\blast ?name/, /\bsur ?name/, /\bfamily ?name/, /\bsoyad/, /\bsoy ?isim/, /\bnach ?name/, /\bfamilien ?name/, /\blname\b/, /\bapellido/],
  },
  {
    type: T.FIRST_NAME,
    any: [/\bfirst ?name/, /\bgiven ?name/, /\bfore ?name/, /\bfname\b/, /\bad\b/, /\badi\b/, /\badiniz\b/, /\bilk ?ad/, /\bvor ?name/, /\bprenom/, /\bnombre\b/],
    not: NON_PERSON_NAME,
  },
  {
    type: NAME_AMBIGUOUS,
    any: [/\bname\b/, /\bisim\b/, /\bisminiz\b/, /\bnamen?\b/, /\bnom\b/],
    not: NON_PERSON_NAME,
  },
  {
    type: T.NUMBER,
    any: [/\bage\b/, /\byas\b/, /\byasiniz\b/, /\balter\b/, /\bquantity/, /\bqty\b/, /\badet\b/, /\bmiktar/, /\banzahl\b/, /\bmenge\b/, /\bcount\b/, /\bamount/, /\btutar/, /\bnumber of\b/, /\bdeneyim/, /\btecrube/, /\bexperience\b/],
  },
  {
    type: T.TEXT_AREA,
    any: [/\bmessage/, /\bmesaj/, /\bcomment/, /\byorum/, /\baciklama/, /\bdescription/, /\babout\b/, /\bhakkinda/, /\bbio\b/, /\bnachricht/, /\bkommentar/, /\bbemerkung/, /\bfeedback/, /\bgeri bildirim/, /\bnotes?\b/, /\bnotlar/],
  },
];

/** autocomplete token → field type (https://html.spec.whatwg.org/#autofill). */
const AUTOCOMPLETE_MAP = {
  'given-name': T.FIRST_NAME,
  'additional-name': T.FIRST_NAME,
  'family-name': T.LAST_NAME,
  name: T.FULL_NAME,
  'honorific-prefix': T.GENDER,
  sex: T.GENDER,
  nickname: T.USERNAME,
  username: T.USERNAME,
  email: T.EMAIL,
  tel: T.PHONE,
  'tel-national': T.PHONE,
  'tel-local': T.PHONE,
  'new-password': T.PASSWORD,
  'current-password': T.PASSWORD,
  'street-address': T.ADDRESS,
  'address-line1': T.ADDRESS,
  'address-line2': T.ADDRESS,
  'address-line3': T.ADDRESS,
  'address-level3': T.DISTRICT,
  'address-level2': T.CITY,
  country: T.COUNTRY,
  'country-name': T.COUNTRY,
  'postal-code': T.POSTAL_CODE,
  bday: T.DATE,
  'bday-day': T.DATE,
  'bday-month': T.DATE,
  'bday-year': T.DATE,
  organization: T.COMPANY,
  'organization-title': T.JOB_TITLE,
  url: T.WEBSITE,
  'cc-name': T.FULL_NAME,
  'cc-given-name': T.FIRST_NAME,
  'cc-family-name': T.LAST_NAME,
  'cc-number': T.CREDIT_CARD,
  'cc-exp': T.CARD_EXPIRY,
  'cc-exp-month': T.CARD_EXPIRY,
  'cc-exp-year': T.CARD_EXPIRY,
  'cc-csc': T.CVV,
  'transaction-amount': T.NUMBER,
};

/**
 * `address-level1` means "state" in the US but "il" (province) in Turkey, so
 * it is only a fallback: keyword rules may still say CITY.
 */
const WEAK_AUTOCOMPLETE = { 'address-level1': T.DISTRICT };

const DATE_INPUT_TYPES = new Set(['date', 'datetime-local', 'month', 'week', 'time']);
/** Types whose values can be expressed as digits only (OK for type=number). */
const NUMERIC_COMPATIBLE = new Set([T.PHONE, T.POSTAL_CODE, T.NUMBER, T.NATIONAL_ID, T.TAX_ID, T.CREDIT_CARD, T.CVV, T.CARD_EXPIRY]);

function autocompleteTokens(value) {
  if (!value) return [];
  return String(value).toLowerCase().trim().split(/\s+/);
}

function fromAutocomplete(value, map = AUTOCOMPLETE_MAP) {
  const tokens = autocompleteTokens(value);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const type = map[tokens[i]];
    if (type) return type;
  }
  return null;
}

/**
 * Runs the keyword rules against a single folded text source.
 * @param {string} folded
 * @returns {string|null}
 */
export function matchKeywords(folded) {
  if (!folded) return null;
  for (const rule of KEYWORD_RULES) {
    if (rule.any.some((re) => re.test(folded)) && !(rule.not && rule.not.test(folded))) {
      return rule.type;
    }
  }
  return null;
}

/** Recognises values *shaped* like a type, typically placeholders. */
function fromValueShape(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) || /^@|@\w/.test(text)) return T.EMAIL;
  if (/^https?:\/\/|^www\./i.test(text)) return T.WEBSITE;
  if (/^[A-Z]{2}\d{2}[\s\dX]{10,}$/i.test(text) && /^tr|^de|^gb/i.test(text)) return T.IBAN;
  if (/^([\dx*•]{4}[\s-]?){3}[\dx*•]{4}$/i.test(text)) return T.CREDIT_CARD;
  if (/^(mm|aa|\d{2})\s*\/\s*(yy|yyyy|\d{2}|\d{4})$/i.test(text) && !/^\d{2}\s*\/\s*\d{4}$/.test(text)) return T.CARD_EXPIRY;
  if (/^\+?[\d\s()x-]{7,}$/i.test(text) && /\d|x{3}/i.test(text)) return T.PHONE;
  if (/^(\d{1,2}|dd|gg|tt|mm)[./-](\d{1,2}|mm|aa)[./-](\d{2,4}|yyyy|jjjj)$/i.test(text)) return T.DATE;
  return null;
}

/** Makes a semantic match compatible with the physical control. */
function adapt(type, signals) {
  const tag = signals.tag;
  const inputType = (signals.type || '').toLowerCase();
  if (tag === 'input' && inputType === 'number' && !NUMERIC_COMPATIBLE.has(type) && type !== NAME_AMBIGUOUS) {
    return T.NUMBER;
  }
  return type;
}

/**
 * @typedef {Object} FieldSignals
 * @property {string} tag           'input' | 'textarea' | 'select' | 'editable' | 'combobox'
 * @property {string} [type]
 * @property {string} [autocomplete]
 * @property {string} [label]
 * @property {string} [ariaLabel]
 * @property {string} [name]
 * @property {string} [id]
 * @property {string} [title]
 * @property {string} [placeholder]
 * @property {string} [nearby]
 */

/**
 * Classifies a form control from its extracted signals.
 * @param {FieldSignals} signals
 * @returns {string} A FIELD_TYPES value or NAME_AMBIGUOUS.
 */
export function classifyField(signals) {
  const tag = signals.tag;
  const inputType = (signals.type || '').toLowerCase();

  // 1. autocomplete
  const auto = fromAutocomplete(signals.autocomplete);
  if (auto) return adapt(auto, signals);
  const weakAuto = fromAutocomplete(signals.autocomplete, WEAK_AUTOCOMPLETE);

  // 2. Strong input types
  if (tag === 'input') {
    if (inputType === 'email') return T.EMAIL;
    if (inputType === 'password') return T.PASSWORD;
    if (inputType === 'tel') return T.PHONE;
    if (inputType === 'url') return T.WEBSITE;
    if (DATE_INPUT_TYPES.has(inputType)) return T.DATE;
  }

  // 3. Keyword rules, source by source. An ambiguous "name" is remembered but
  //    lower-priority sources still get a chance to be more precise
  //    (label "Name" + id "firstName" → FIRST_NAME).
  const sources = [signals.label, signals.ariaLabel, signals.name, signals.id, signals.title, signals.placeholder, signals.nearby];
  let ambiguous = false;
  for (const source of sources) {
    const type = matchKeywords(foldText(source));
    if (!type) continue;
    if (type === NAME_AMBIGUOUS) {
      ambiguous = true;
      continue;
    }
    if (weakAuto && type !== T.CITY && type !== T.DISTRICT) break;
    return adapt(type, signals);
  }
  if (weakAuto) return adapt(weakAuto, signals);

  // 4. Placeholder shape
  const shaped = fromValueShape(signals.placeholder);
  if (shaped) return adapt(shaped, signals);

  if (ambiguous) return adapt(NAME_AMBIGUOUS, signals);

  // 5. Structural fallback
  if (tag === 'textarea') return T.TEXT_AREA;
  if (tag === 'editable') return signals.multiline === false ? T.UNKNOWN : T.TEXT_AREA;
  if (inputType === 'number') return T.NUMBER;
  return T.UNKNOWN;
}

/**
 * Which part of a date a control holds, for split day / month / year inputs
 * and selects ("Gün" / "Ay" / "Yıl", autocomplete bday-month, cc-exp-year...).
 * @param {{autocomplete?:string, hint?:string, maxLength?:number|null}} c
 * @returns {'day'|'month'|'year'|null}
 */
export function detectDatePart(c = {}) {
  const tokens = autocompleteTokens(c.autocomplete);
  if (tokens.some((t) => /-day$/.test(t))) return 'day';
  if (tokens.some((t) => /-month$/.test(t))) return 'month';
  if (tokens.some((t) => /-year$/.test(t))) return 'year';
  const hint = c.hint || '';
  if (/\b(year|yil|yili|jahr|ano|yyyy|yy)\b/.test(hint)) return 'year';
  if (/\b(month|ay|monat|mes|mm)\b/.test(hint)) return 'month';
  if (/\b(day|gun|tag|dia|dd|gg)\b/.test(hint)) return 'day';
  return null;
}
