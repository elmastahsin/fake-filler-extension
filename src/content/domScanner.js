/**
 * DOM scanner: finds fillable form controls (including inside open shadow
 * roots), filters out anything that should not be touched, extracts textual
 * signals and classifies each control via `fieldRules.js`.
 *
 * Supported control kinds:
 *   - `input`, `textarea`, `select` (including Select2/Chosen hidden selects
 *     whose replacement widget is visible)
 *   - `checkbox` (single consent/terms box, or a group sharing `name` / fieldset)
 *   - `radio`    (grouped by scope + `name`, or by an enclosing `role="radiogroup"`)
 *   - `editable` (`[contenteditable]`, `role="textbox"` rich-text editors)
 *   - `combobox` (`role="combobox"` / `aria-haspopup="listbox"` custom dropdowns)
 */
import { FIELD_TYPES as T } from '../shared/constants.js';
import { cleanText, foldText } from '../shared/textUtils.js';
import { classifyField, NAME_AMBIGUOUS } from './fieldRules.js';
import { isMaskPlaceholderValue, isPlaceholderOption } from '../generators/inputHandlers.js';
import { comboboxHasValue, editableText } from './widgets.js';

const NATIVE_SELECTOR = 'input, textarea, select';
const CUSTOM_SELECTOR = '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"], [role="combobox"], [aria-haspopup="listbox"]';

/** Input types we never fill. */
const NON_FILLABLE_INPUT_TYPES = new Set([
  'hidden', 'submit', 'button', 'reset', 'image', 'file',
  'range', 'color', 'search',
]);

/** Anti-bot traps, captchas and site search boxes. */
const TRAP_RE = /\b(honeypot|honey ?pot|hp|bot ?field|leave ?(this )?(field )?(blank|empty)|do ?not ?fill|captcha|recaptcha|hcaptcha|turnstile|csrf|xsrf|token)\b/;
const SEARCH_RE = /^(q|s|query|search|keyword|keywords|ara|arama|suche)$/;

/** Consent / required-agreement vs. marketing / negative checkboxes. */
const CONSENT_RE = /\b(kvkk|gdpr|dsgvo|aydinlatma|acik ?riza|sartlar|kosullar|sozlesme|uyelik ?sozlesmesi|kullanim ?(kosullari|sartlari)|gizlilik|privacy|terms|conditions|tos\b|policy|agreement|consent|agree|accept|onay|onayliyorum|kabul|okudum|acknowledge|datenschutz|agb|nutzungsbedingungen|einverstanden|zustimmen)/;
const MARKETING_RE = /\b(newsletter|bulten|ebulten|kampanya|promosyon|promotion|marketing|pazarlama|reklam|ticari ?elektronik ?ileti|sms ?ile|bilgilendirme ?almak|haberdar|angebot|werbung)/;
const NEGATIVE_CHECKBOX_RE = /\b(istemiyorum|reddediyorum|hayir|do ?not|don ?t|unsubscribe|opt ?out|ablehnen|kein)\b/;

/** Select2 / Chosen / NiceSelect / TomSelect / SlimSelect wrappers next to a hidden <select>. */
const SELECT_WRAPPER_SELECTOR = '.select2, .select2-container, .chosen-container, .nice-select, .ts-wrapper, .ss-main, .choices';

const MAX_NEARBY_TEXT = 100;

/**
 * Collects elements matching `selector` from `root` and every open shadow root.
 * @param {Document|ShadowRoot|Element} root
 * @param {string} selector
 * @returns {Element[]}
 */
export function collectElements(root = document, selector = NATIVE_SELECTOR) {
  const found = [];
  const visit = (node) => {
    found.push(...node.querySelectorAll(selector));
    for (const el of node.querySelectorAll('*')) {
      if (el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(root);
  return found;
}

/** Backwards-compatible alias returning native controls only. */
export const collectControls = (root = document) => collectElements(root, NATIVE_SELECTOR);

/** Text content of `node` excluding form-control internals (option lists etc.). */
function textWithoutControls(node) {
  if (!node) return '';
  const doc = node.ownerDocument || document;
  const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
    acceptNode(textNode) {
      const parent = textNode.parentElement;
      if (parent && parent.closest('select, textarea, option, script, style, noscript, button, [role="listbox"]')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let text = '';
  while (walker.nextNode()) text += ` ${walker.currentNode.nodeValue}`;
  return cleanText(text);
}

function resolveAriaRefs(el, attrName) {
  const raw = el.getAttribute(attrName);
  if (!raw) return '';
  const root = el.getRootNode();
  const parts = [];
  for (const id of raw.split(/\s+/)) {
    const ref = root.getElementById?.(id) || document.getElementById(id);
    if (ref) parts.push(textWithoutControls(ref));
  }
  return parts.filter(Boolean).join(' ');
}

function getLabelText(el) {
  const parts = [];
  try {
    if (el.labels?.length) {
      for (const label of el.labels) parts.push(textWithoutControls(label));
    } else {
      const wrapping = el.closest('label');
      if (wrapping) parts.push(textWithoutControls(wrapping));
      else if (el.id) {
        const root = el.getRootNode();
        const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id.replace(/"/g, '');
        const explicit = root.querySelector?.(`label[for="${escaped}"]`);
        if (explicit) parts.push(textWithoutControls(explicit));
      }
    }
    const labelledBy = resolveAriaRefs(el, 'aria-labelledby');
    if (labelledBy) parts.push(labelledBy);
  } catch {
    /* Ignore exotic DOM structures. */
  }
  return cleanText(parts.filter(Boolean).join(' '));
}

/**Legend or heading for a group of radios / checkboxes. */
function getGroupLabel(el) {
  const fieldset = el.closest('fieldset, [role="radiogroup"], [role="group"]');
  if (!fieldset) return '';
  const legend = fieldset.querySelector('legend');
  if (legend) return textWithoutControls(legend);
  return cleanText(fieldset.getAttribute('aria-label') || resolveAriaRefs(fieldset, 'aria-labelledby'));
}

/**
 * Best-effort label for div-based forms: the previous sibling's text, or the
 * text of the closest ancestor that wraps *only this* control.
 */
function getNearbyText(el) {
  const prev = el.previousElementSibling;
  if (prev && !prev.matches(NATIVE_SELECTOR)) {
    const text = textWithoutControls(prev);
    if (text && text.length <= MAX_NEARBY_TEXT) return text;
  }
  let node = el.parentElement;
  for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
    if (node.querySelectorAll(NATIVE_SELECTOR).length > 1) break;
    const label = node.querySelector('label, [class*="label"], [class*="Label"]');
    if (label && !label.contains(el)) {
      const text = textWithoutControls(label);
      if (text && text.length <= MAX_NEARBY_TEXT) return text;
    }
    const text = textWithoutControls(node);
    if (text) return text.length <= MAX_NEARBY_TEXT ? text : '';
  }
  return '';
}

function isElementVisible(el) {
  if (!el?.isConnected) return false;
  if (typeof el.checkVisibility === 'function') {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  } else {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') {
      return false;
    }
  }
  if (el.closest('[aria-hidden="true"], [inert]')) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  if (rect.right + window.scrollX < 0 || rect.bottom + window.scrollY < 0) return false;
  return true;
}

/**
 * Many CSS frameworks hide `<input type="checkbox|radio">` with `opacity:0` or
 * `width:0` and style its `<label>` or next sibling instead; Select2/Chosen
 * hide `<select>` and insert a sibling container. Treat the control as visible
 * when its visual proxy is visible.
 */
function isVisible(el) {
  if (isElementVisible(el)) return true;
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
    if (el.closest('[aria-hidden="true"], [inert]')) return false;
    const proxy = el.labels?.[0] || el.closest('label') || el.nextElementSibling || el.parentElement;
    return Boolean(proxy && isElementVisible(proxy));
  }
  if (tag === 'select') {
    const wrapper = el.nextElementSibling?.matches?.(SELECT_WRAPPER_SELECTOR)
      ? el.nextElementSibling
      : el.parentElement?.querySelector?.(SELECT_WRAPPER_SELECTOR);
    return Boolean(wrapper && isElementVisible(wrapper));
  }
  return false;
}

function hasExistingValue(el, kind = el.tagName.toLowerCase()) {
  if (kind === 'select' || el instanceof HTMLSelectElement) {
    const index = el.selectedIndex;
    if (index < 0) return false;
    const opt = el.options[index];
    if (isPlaceholderOption(opt, index)) return false;
    // A browser defaults an unmarked <select> to index 0 when no option has the
    // `selected` attribute; only treat index 0 as "already chosen" if the page
    // explicitly marked an option with `defaultSelected`.
    if (index === 0 && !Array.from(el.options).some((o) => o.defaultSelected)) return false;
    return true;
  }
  if (kind === 'checkbox' || kind === 'radio') return Boolean(el.checked);
  if (kind === 'editable') return editableText(el) !== '';
  if (kind === 'combobox') return comboboxHasValue(el);
  const val = (el.value || '').trim();
  return val !== '' && !isMaskPlaceholderValue(val);
}

function isCustomCombobox(el) {
  if (el.tagName === 'SELECT') return false;
  const role = (el.getAttribute('role') || '').toLowerCase();
  if (role === 'combobox') return true;
  if (el.getAttribute('aria-haspopup') === 'listbox') return true;
  if (el.tagName === 'INPUT' && el.getAttribute('aria-autocomplete') === 'list') return true;
  return false;
}

function isEditableWidget(el) {
  if (el.matches(NATIVE_SELECTOR) || isCustomCombobox(el)) return false;
  // Nested formatting nodes inside an editor are part of the outer editor.
  if (el.parentElement?.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]')) {
    return false;
  }
  return el.isContentEditable || (el.getAttribute('role') || '').toLowerCase() === 'textbox';
}

function detectKind(el) {
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (tag === 'input' && type === 'checkbox') return 'checkbox';
  if (tag === 'input' && type === 'radio') return 'radio';
  if (isCustomCombobox(el)) return 'combobox';
  if (isEditableWidget(el)) return 'editable';
  return tag;
}

/**
 * Returns a reason string if the control must be skipped, otherwise null.
 * @param {Element} el
 * @param {{includeFilled:boolean}} options
 */
export function getSkipReason(el, { includeFilled }) {
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();
  const kind = detectKind(el);
  if (tag === 'input' && NON_FILLABLE_INPUT_TYPES.has(type)) return 'non-fillable-type';
  if (el.matches?.(':disabled')) return 'disabled'; // also covers <fieldset disabled>
  if (kind === 'input' || kind === 'textarea') {
    if (el.readOnly) return 'readonly';
  }
  if (el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-readonly') === 'true') return 'aria-disabled';
  if ((el.getAttribute('autocomplete') || '').includes('one-time-code')) return 'one-time-code';
  const identity = foldText(`${el.getAttribute('name') || ''} ${el.id || ''} ${el.getAttribute('aria-label') || ''}`);
  if (TRAP_RE.test(identity)) return 'trap';
  if (SEARCH_RE.test(foldText(`${el.getAttribute('name') || ''} ${el.id || ''}`)) || el.getAttribute('role') === 'searchbox' || el.closest('[role="search"]')) {
    return 'search';
  }
  if (!isVisible(el)) return 'hidden';
  if (!includeFilled && kind !== 'radio' && kind !== 'checkbox' && hasExistingValue(el, kind)) return 'has-value';
  return null;
}

/**
 * Extracts all textual / structural signals for a control.
 * @param {HTMLElement} el
 */
export function extractSignals(el) {
  const attr = (name) => cleanText(el.getAttribute(name));
  const kind = detectKind(el);
  const tag = kind === 'editable' || kind === 'combobox' ? kind : el.tagName.toLowerCase();
  const signals = {
    tag,
    type: tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tag,
    autocomplete: attr('autocomplete'),
    name: attr('name'),
    id: el.id || '',
    placeholder: attr('placeholder') || attr('data-placeholder'),
    ariaLabel: attr('aria-label'),
    title: attr('title'),
    label: getLabelText(el),
    groupLabel: kind === 'radio' || kind === 'checkbox' ? getGroupLabel(el) : '',
    nearby: '',
    multiline: kind === 'textarea' || (kind === 'editable' && el.getAttribute('aria-multiline') !== 'false'),
  };
  if (!signals.label && !signals.ariaLabel) signals.nearby = getNearbyText(el);
  return signals;
}

function buildConstraints(el, signals) {
  const num = (v) => (Number.isFinite(v) && v > 0 ? v : null);
  return {
    tag: signals.tag,
    inputType: signals.type,
    maxLength: num(el.maxLength),
    minLength: num(el.minLength),
    min: el.getAttribute('min'),
    max: el.getAttribute('max'),
    step: el.getAttribute('step'),
    pattern: el.getAttribute('pattern'),
    required: Boolean(el.required || el.getAttribute('aria-required') === 'true'),
    autocomplete: signals.autocomplete,
    multiline: Boolean(signals.multiline),
    hint: foldText([signals.groupLabel, signals.label, signals.ariaLabel, signals.name, signals.id, signals.placeholder, signals.nearby, resolveAriaRefs(el, 'aria-describedby')].join(' ')),
  };
}

/** A bare "Name" means first name if the same form/scope also has a surname field. */
function resolveAmbiguousNames(fields) {
  const scopeOf = (el) => el.form || el.getRootNode();
  const scopesWithLastName = new Set(fields.filter((f) => f.type === T.LAST_NAME).map((f) => scopeOf(f.element)));
  for (const field of fields) {
    if (field.type !== NAME_AMBIGUOUS) continue;
    field.type = scopesWithLastName.has(scopeOf(field.element)) ? T.FIRST_NAME : T.FULL_NAME;
  }
}

/**
 * Groups radio inputs into one logical field per group, and classifies checkboxes
 * as `consent` / `marketing` / `group` / `optional` so the filler can decide
 * which ones to tick without guessing blindly.
 */
function buildCheckableFields(radios, checkboxes, { includeFilled }) {
  const fields = [];
  const skipped = [];
  const scopeId = (el) => el.closest('fieldset, [role="radiogroup"], [role="group"]') || el.form || el.getRootNode();

  // --- Radio groups ---
  const radioGroups = new Map();
  let anonIndex = 0;
  for (const { element, signals } of radios) {
    const key = signals.name ? `name:${signals.name}` : `anon:${(anonIndex += 1)}`;
    const scope = scopeId(element);
    let bucket = radioGroups.get(scope);
    if (!bucket) {
      bucket = new Map();
      radioGroups.set(scope, bucket);
    }
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push({ element, signals });
  }
  for (const bucket of radioGroups.values()) {
    for (const members of bucket.values()) {
      if (!includeFilled && members.some((m) => m.element.checked)) {
        for (const m of members) skipped.push({ element: m.element, reason: 'has-value' });
        continue;
      }
      const first = members[0];
      const groupSignals = {
        ...first.signals,
        label: first.signals.groupLabel || first.signals.label,
        nearby: first.signals.groupLabel ? '' : first.signals.nearby,
      };
      const classified = classifyField(groupSignals);
      const optionLabels = members.map((m) => foldText(`${m.signals.label} ${m.element.value || ''}`));
      const looksLikeGender =
        classified === T.GENDER ||
        (optionLabels.some((l) => /\b(kadin|female|weiblich|frau|bayan)\b/.test(l)) &&
          optionLabels.some((l) => /\b(erkek|male|mannlich|herr|bay)\b/.test(l)));
      fields.push({
        element: first.element,
        options: members.map((m) => ({ element: m.element, label: m.signals.label || m.signals.nearby || m.element.value || '' })),
        kind: 'radio',
        type: looksLikeGender ? T.GENDER : T.CHOICE,
        signals: groupSignals,
        constraints: buildConstraints(first.element, groupSignals),
      });
    }
  }

  // --- Checkboxes (grouped when they share `name` or a multi-checkbox fieldset) ---
  const checkboxGroups = new Map();
  for (const item of checkboxes) {
    const fieldset = item.element.closest('fieldset, [role="group"]');
    const key = item.signals.name ? `name:${item.signals.name}` : fieldset ? `fs:${ checkboxes.indexOf(item) && ''}` : null;
    const groupKey = item.signals.name || fieldset || item;
    if (!checkboxGroups.has(groupKey)) checkboxGroups.set(groupKey, []);
    checkboxGroups.get(groupKey).push(item);
  }
  for (const members of checkboxGroups.values()) {
    if (members.length > 1) {
      if (!includeFilled && members.some((m) => m.element.checked)) {
        for (const m of members) skipped.push({ element: m.element, reason: 'has-value' });
        continue;
      }
      const first = members[0];
      fields.push({
        element: first.element,
        options: members.map((m) => ({ element: m.element, label: m.signals.label || m.signals.nearby || m.element.value || '' })),
        kind: 'checkbox-group',
        type: T.CHECKBOX,
        signals: first.signals,
        constraints: buildConstraints(first.element, first.signals),
      });
      continue;
    }
    const { element, signals } = members[0];
    if (!includeFilled && element.checked) {
      skipped.push({ element, reason: 'has-value' });
      continue;
    }
    const constraints = buildConstraints(element, signals);
    const hint = constraints.hint;
    let role = 'optional';
    if (NEGATIVE_CHECKBOX_RE.test(hint)) role = 'negative';
    else if (MARKETING_RE.test(hint) && !constraints.required) role = 'marketing';
    else if (constraints.required || CONSENT_RE.test(hint)) role = 'consent';
    fields.push({
      element,
      kind: 'checkbox',
      checkboxRole: role,
      type: T.CHECKBOX,
      signals,
      constraints,
    });
  }

  return { fields, skipped };
}

/**
 * @typedef {Object} ScannedField
 * @property {HTMLElement} element
 * @property {'input'|'textarea'|'select'|'checkbox'|'checkbox-group'|'radio'|'editable'|'combobox'} kind
 * @property {string} type FIELD_TYPES value
 * @property {object} signals
 * @property {import('../generators/dataGenerator.js').FieldConstraints} constraints
 * @property {Array<{element:HTMLInputElement, label:string}>} [options]
 * @property {'consent'|'marketing'|'negative'|'optional'} [checkboxRole]
 */

/**
 * Scans the document for fillable controls.
 * @param {Document|ShadowRoot|Element} [root]
 * @param {{includeFilled?: boolean, includeCustom?: boolean}} [options]
 * @returns {{fields: ScannedField[], skipped: Array<{element: Element, reason: string}>}}
 */
export function scanFields(root = document, { includeFilled = false, includeCustom = true } = {}) {
  const fields = [];
  const skipped = [];
  const radios = [];
  const checkboxes = [];
  const selector = includeCustom ? `${NATIVE_SELECTOR}, ${CUSTOM_SELECTOR}` : NATIVE_SELECTOR;
  const seen = new Set();

  for (const element of collectElements(root, selector)) {
    if (seen.has(element)) continue;
    seen.add(element);
    try {
      const kind = detectKind(element);
      if (!includeCustom && (kind === 'editable' || kind === 'combobox')) continue;
      if (kind === 'editable' && !isEditableWidget(element)) continue;
      // If a wrapper (`div[role="combobox"]`) contains an inner `<input>`, let the
      // inner input or the outer wrapper win — never both.
      if (kind === 'combobox' && element.tagName !== 'INPUT') {
        const innerInput = element.querySelector('input:not([type="hidden"])');
        if (innerInput && isCustomCombobox(innerInput)) continue;
      }
      const reason = getSkipReason(element, { includeFilled });
      if (reason) {
        skipped.push({ element, reason });
        continue;
      }
      const signals = extractSignals(element);
      if (kind === 'radio') {
        radios.push({ element, signals });
        continue;
      }
      if (kind === 'checkbox') {
        checkboxes.push({ element, signals });
        continue;
      }
      fields.push({
        element,
        kind,
        type: classifyField(signals),
        signals,
        constraints: buildConstraints(element, signals),
      });
    } catch (error) {
      skipped.push({ element, reason: 'error' });
      console.debug('[LinguaFill] Scan error', element, error);
    }
  }

  const checkables = buildCheckableFields(radios, checkboxes, { includeFilled });
  fields.push(...checkables.fields);
  skipped.push(...checkables.skipped);

  resolveAmbiguousNames(fields);
  return { fields, skipped };
}
