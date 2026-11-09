/**
 * Shared constants used across background, content, popup and generators.
 * This module must stay side-effect free and DOM/chrome-API free so it can be
 * imported from any context (service worker, content script, popup, Node tests).
 */

/** Canonical field categories produced by the DOM scanner. */
export const FIELD_TYPES = Object.freeze({
  FIRST_NAME: 'FIRST_NAME',
  LAST_NAME: 'LAST_NAME',
  FULL_NAME: 'FULL_NAME',
  USERNAME: 'USERNAME',
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  PASSWORD: 'PASSWORD',
  ADDRESS: 'ADDRESS',
  CITY: 'CITY',
  POSTAL_CODE: 'POSTAL_CODE',
  COMPANY: 'COMPANY',
  DATE: 'DATE',
  NUMBER: 'NUMBER',
  TEXT_AREA: 'TEXT_AREA',
  DISTRICT: 'DISTRICT',
  COUNTRY: 'COUNTRY',
  GENDER: 'GENDER',
  WEBSITE: 'WEBSITE',
  JOB_TITLE: 'JOB_TITLE',
  /** TC Kimlik No / SSN / national identity number. */
  NATIONAL_ID: 'NATIONAL_ID',
  /** Vergi No (VKN) / EIN / Steuernummer. */
  TAX_ID: 'TAX_ID',
  IBAN: 'IBAN',
  CREDIT_CARD: 'CREDIT_CARD',
  CARD_EXPIRY: 'CARD_EXPIRY',
  CVV: 'CVV',
  /** Single checkbox (consent, terms, ...) or checkbox group. */
  CHECKBOX: 'CHECKBOX',
  /** Radio group without a more specific meaning (yes/no, plan, ...). */
  CHOICE: 'CHOICE',
  /** Recognised as a text control, but no semantic match was found. */
  UNKNOWN: 'UNKNOWN',
});

/** UI metadata for the per-field toggles in the popup (order = display order). */
export const FIELD_TYPE_META = Object.freeze([
  { type: FIELD_TYPES.FIRST_NAME, label: 'First name', icon: '👤' },
  { type: FIELD_TYPES.LAST_NAME, label: 'Last name', icon: '👥' },
  { type: FIELD_TYPES.FULL_NAME, label: 'Full name', icon: '🪪' },
  { type: FIELD_TYPES.USERNAME, label: 'Username', icon: '🔖' },
  { type: FIELD_TYPES.EMAIL, label: 'Email', icon: '✉️' },
  { type: FIELD_TYPES.PHONE, label: 'Phone', icon: '📱' },
  { type: FIELD_TYPES.PASSWORD, label: 'Password', icon: '🔑' },
  { type: FIELD_TYPES.ADDRESS, label: 'Address', icon: '🏠' },
  { type: FIELD_TYPES.CITY, label: 'City', icon: '🏙️' },
  { type: FIELD_TYPES.POSTAL_CODE, label: 'Postal code', icon: '📮' },
  { type: FIELD_TYPES.COMPANY, label: 'Company', icon: '🏢' },
  { type: FIELD_TYPES.DATE, label: 'Date', icon: '📅' },
  { type: FIELD_TYPES.NUMBER, label: 'Number', icon: '🔢' },
  { type: FIELD_TYPES.TEXT_AREA, label: 'Long text', icon: '📝' },
  { type: FIELD_TYPES.DISTRICT, label: 'District / State', icon: '🗺️' },
  { type: FIELD_TYPES.COUNTRY, label: 'Country', icon: '🌍' },
  { type: FIELD_TYPES.GENDER, label: 'Gender', icon: '⚧' },
  { type: FIELD_TYPES.WEBSITE, label: 'Website', icon: '🔗' },
  { type: FIELD_TYPES.JOB_TITLE, label: 'Job title', icon: '💼' },
  { type: FIELD_TYPES.NATIONAL_ID, label: 'National ID', icon: '🆔' },
  { type: FIELD_TYPES.TAX_ID, label: 'Tax ID', icon: '🧾' },
  { type: FIELD_TYPES.IBAN, label: 'IBAN', icon: '🏦' },
  { type: FIELD_TYPES.CREDIT_CARD, label: 'Card number', icon: '💳' },
  { type: FIELD_TYPES.CARD_EXPIRY, label: 'Card expiry', icon: '⏳' },
  { type: FIELD_TYPES.CVV, label: 'CVV', icon: '🔒' },
  { type: FIELD_TYPES.CHECKBOX, label: 'Checkboxes', icon: '☑️' },
  { type: FIELD_TYPES.CHOICE, label: 'Radio choices', icon: '🔘' },
]);

/** Runtime message types (popup ⇄ background). */
export const MESSAGES = Object.freeze({
  FILL_ACTIVE_TAB: 'linguafill/fill-active-tab',
});

/** Command names declared in manifest.json → "commands". */
export const COMMANDS = Object.freeze({
  FILL_FORM: 'fill-form',
});

/** Value used for the locale setting when the browser language should be used. */
export const AUTO_LOCALE = 'auto';

/** Default user settings persisted in chrome.storage.sync. */
export const DEFAULT_SETTINGS = Object.freeze({
  /** 'auto' or a supported locale code ('tr', 'en', 'de', ...). */
  locale: AUTO_LOCALE,
  /** Per-field enable switches. Missing keys are treated as enabled. */
  enabledFields: Object.freeze(
    Object.fromEntries(FIELD_TYPE_META.map(({ type }) => [type, true]))
  ),
  /** Overwrite controls that already contain a value. */
  overwriteExisting: false,
  /** Briefly outline every filled control. */
  highlightFilled: true,
  /** Fill text inputs that could not be classified with a short contextual phrase. */
  fillUnknown: true,
  /** Pick a value for <select> elements. */
  fillSelects: true,
  /** Use RFC 2606 reserved domains (example.com) instead of real mail providers. */
  safeEmails: false,
  /** Tick required / consent checkboxes and pick one option in checkbox groups. */
  fillCheckboxes: true,
  /** Also tick marketing / newsletter opt-in boxes (off = realistic, unticked). */
  acceptMarketing: false,
  /** Fill rich-text editors and custom (ARIA) dropdowns such as React-Select / MUI. */
  fillCustomControls: true,
  /** Re-scan after filling to catch fields that appear dynamically (İl → İlçe, conditional sections). */
  dynamicRescan: true,
});
