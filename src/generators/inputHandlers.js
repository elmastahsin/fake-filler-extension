/**
 * Value injection that modern SPA frameworks actually notice.
 *
 * Why not just `el.value = x`?
 *  - React installs a value tracker on each controlled input and only fires
 *    onChange when the DOM value differs from the tracked value *at the time
 *    an `input` event is dispatched*. Writing through the native prototype
 *    setter and then dispatching `input` guarantees React sees a change.
 *    (Content scripts run in an isolated world, so React's instance-level
 *    property override is not visible here anyway — the prototype setter is the
 *    explicit, world-independent way to do it.)
 *  - Vue's v-model listens to `input` (or `change` with `.lazy`).
 *  - Angular's DefaultValueAccessor listens to `input`; `blur` marks the
 *    control as touched so validation messages render.
 *
 * Every handler is defensive: failures are caught and reported as `false` so
 * a single odd control can never break the host page or the fill run.
 */

const FILL_MARK_STYLE = Object.freeze({
  outline: '2px solid rgba(124, 92, 255, 0.9)',
  'outline-offset': '2px',
  transition: 'outline-color 0.4s ease',
});

/** Returns the native `value` setter for the element's own prototype. */
function getNativeValueSetter(el) {
  let proto = Object.getPrototypeOf(el);
  // Walk up in case the page subclassed the element (custom elements extends).
  while (proto && proto !== HTMLElement.prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) return descriptor.set;
    proto = Object.getPrototypeOf(proto);
  }
  return null;
}

function writeNativeValue(el, value) {
  const setter = getNativeValueSetter(el);
  if (setter) setter.call(el, value);
  else el.value = value;
}

function safeDispatch(el, event) {
  try {
    el.dispatchEvent(event);
  } catch {
    /* A page listener threw — ignore, the value is already set. */
  }
}

/**
 * Synthetic focus/blur events. We intentionally do NOT call el.focus(): that
 * would scroll the page, steal focus and could open pickers/autocomplete UIs.
 */
function dispatchFocus(el) {
  safeDispatch(el, new FocusEvent('focus', { bubbles: false }));
  safeDispatch(el, new FocusEvent('focusin', { bubbles: true, composed: true }));
}

function dispatchBlur(el) {
  safeDispatch(el, new FocusEvent('blur', { bubbles: false }));
  safeDispatch(el, new FocusEvent('focusout', { bubbles: true, composed: true }));
}

function dispatchValueEvents(el, value) {
  let inputEvent;
  try {
    inputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: false,
      composed: true, // crosses shadow DOM boundaries (Lit, Stencil, ...)
      inputType: 'insertReplacementText',
      data: value,
    });
  } catch {
    inputEvent = new Event('input', { bubbles: true, composed: true });
  }
  safeDispatch(el, inputEvent);
  safeDispatch(el, new Event('change', { bubbles: true }));
}

/**
 * Sets the value of an <input> or <textarea> and notifies frameworks.
 * @param {HTMLInputElement|HTMLTextAreaElement} el
 * @param {string} value
 * @returns {boolean} true if the control ended up with a non-empty value.
 */
export function setInputValue(el, value) {
  try {
    if (el.disabled || el.readOnly) return false;
    const stringValue = String(value);
    dispatchFocus(el);
    writeNativeValue(el, stringValue);
    dispatchValueEvents(el, stringValue);
    dispatchBlur(el);
    // Input masks may legitimately reformat the value, so we only verify that
    // the browser accepted *something* (e.g. type=number rejects "abc").
    return el.value !== '';
  } catch (error) {
    console.debug('[LinguaFill] Could not fill input', el, error);
    return false;
  }
}

const PLACEHOLDER_OPTION_RE = /^(-+|\.\.\.|select|choose|please|pick|none|seç|lütfen|bitte|wählen|auswählen|--.*--|\(.*\)$)/i;

/** True for options like "", "-- Select --", "Seçiniz", "Bitte wählen". */
export function isPlaceholderOption(option, index) {
  if (!option || option.disabled || option.hidden) return true;
  if (option.value === '') return true;
  const text = option.textContent.trim();
  if (!text) return true;
  return index === 0 && PLACEHOLDER_OPTION_RE.test(text);
}

/**
 * Finds the best option for a list of preferred labels: exact (folded) match
 * on text or value first, then "starts with" / "contains" for labels such as
 * "İstanbul (34)" or "34 - İstanbul".
 * @template {{text:string, value?:string}} O
 * @param {O[]} candidates
 * @param {string[]} preferred
 * @param {(s:string) => string} normalize
 * @returns {O|null}
 */
export function matchPreferred(candidates, preferred, normalize) {
  const targets = preferred.map((p) => normalize(p)).filter(Boolean);
  if (!targets.length) return null;
  const keyed = candidates.map((c) => ({ c, text: normalize(c.text), value: normalize(c.value || '') }));
  for (const target of targets) {
    const exact = keyed.find((k) => k.text === target || k.value === target);
    if (exact) return exact.c;
  }
  for (const target of targets) {
    if (target.length < 3) continue;
    const re = new RegExp(`(^|\\s)${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
    const partial = keyed.find((k) => re.test(k.text));
    if (partial) return partial.c;
  }
  return null;
}

/** Options we avoid picking at random ("Other", "Diğer", "Prefer not to say"). */
const AVOID_RANDOM_RE = /^(other|diger|sonstige|andere|prefer not|belirtmek istemiyorum|keine angabe|none|yok)\b/;

/**
 * Picks a random candidate, avoiding "Other"-style options when possible.
 * @template T
 * @param {T[]} candidates
 * @param {(c:T) => string} textOf
 * @param {(s:string) => string} normalize
 */
export function pickRandom(candidates, textOf, normalize) {
  const good = candidates.filter((c) => !AVOID_RANDOM_RE.test(normalize(textOf(c))));
  const pool = good.length ? good : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Selects an option in a <select>. If one of `preferred` matches an option
 * label (e.g. persona city "İzmir", gender "Kadın", birth month "Mart"), that
 * option is chosen; otherwise a random non-placeholder option is used.
 * @param {HTMLSelectElement} el
 * @param {{preferred?: string[], normalize?: (s:string) => string}} [options]
 * @returns {boolean}
 */
export function fillSelect(el, { preferred = [], normalize = (s) => s.toLowerCase().trim() } = {}) {
  try {
    if (el.disabled) return false;
    const candidates = Array.from(el.options)
      .filter((opt, i) => !isPlaceholderOption(opt, i))
      .map((opt) => ({ opt, text: opt.textContent.trim(), value: opt.value }));
    if (!candidates.length) return false;

    const choice = matchPreferred(candidates, preferred, normalize) || pickRandom(candidates, (c) => c.text, normalize);

    dispatchFocus(el);
    if (el.multiple) {
      choice.opt.selected = true;
    } else {
      writeNativeValue(el, choice.value);
      choice.opt.selected = true;
    }
    dispatchValueEvents(el, choice.value);
    dispatchBlur(el);
    return el.selectedIndex >= 0;
  } catch (error) {
    console.debug('[LinguaFill] Could not fill select', el, error);
    return false;
  }
}

/**
 * Checks / unchecks a checkbox or selects a radio the way a user would: a real
 * `click()` toggles the state *and* fires the click/input/change sequence that
 * React (which listens to `click` for checkables), Vue and Angular expect.
 * Falls back to setting `checked` directly if a page handler cancelled it.
 * @param {HTMLInputElement} el
 * @param {boolean} [checked]
 */
export function setChecked(el, checked = true) {
  try {
    if (el.disabled) return false;
    if (el.checked === checked) return true;
    el.click();
    if (el.checked !== checked) {
      el.checked = checked;
      safeDispatch(el, new Event('input', { bubbles: true, composed: true }));
      safeDispatch(el, new Event('change', { bubbles: true }));
    }
    return el.checked === checked;
  } catch (error) {
    console.debug('[LinguaFill] Could not toggle', el, error);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Masks, validation & user-like typing                                 */
/* ------------------------------------------------------------------ */

/**
 * True for values that are just an input mask's placeholder, e.g.
 * "(___) ___ __ __", "+90 (___) ___-____", "__.__.____".
 */
export function isMaskPlaceholderValue(value) {
  const text = String(value || '');
  return text.includes('_') && /^[\s_()+\-./:\d]*$/.test(text) && (text.match(/_/g) || []).length >= 2;
}

/**
 * Whether the browser (and an input mask) accepted the value: constraint
 * validation passes and no mask placeholders remain.
 * @param {HTMLInputElement|HTMLTextAreaElement} el
 */
export function isValueAccepted(el) {
  try {
    if (el.value === '' || isMaskPlaceholderValue(el.value)) return false;
    if (el.value.includes('_') && /_{2,}/.test(el.value)) return false;
    if (el.willValidate && el.validity && !el.validity.valid) {
      // `required`-only failures cannot happen here (the value is non-empty);
      // custom validity set by the page also counts as rejection.
      return false;
    }
    return true;
  } catch {
    return el.value !== '';
  }
}

/**
 * Types `text` character by character through the editing pipeline, as if the
 * user typed it. Input-mask libraries (Inputmask, IMask, Cleave, Maska, ...)
 * format on `beforeinput` / `input` + caret position, so they only work
 * reliably with real insertions. `execCommand('insertText')` produces exactly
 * those events; a manual per-character fallback is used if it is unavailable.
 * @param {HTMLInputElement|HTMLTextAreaElement} el
 * @param {string} text
 * @returns {boolean}
 */
export function typeText(el, text) {
  try {
    if (el.disabled || el.readOnly) return false;
    const doc = el.ownerDocument || document;
    el.focus({ preventScroll: true });
    // Clear the current content (incl. mask placeholders) as a user would.
    try {
      el.select();
    } catch {
      /* Some input types do not support selection. */
    }
    let usedCommand = false;
    try {
      usedCommand = doc.execCommand('delete', false) !== false;
    } catch {
      usedCommand = false;
    }
    if (!usedCommand) {
      writeNativeValue(el, '');
      dispatchValueEvents(el, '');
    }
    for (const ch of String(text)) {
      const key = { key: ch, bubbles: true, cancelable: true, composed: true };
      safeDispatch(el, new KeyboardEvent('keydown', key));
      safeDispatch(el, new KeyboardEvent('keypress', { ...key, charCode: ch.charCodeAt(0) }));
      let inserted = false;
      try {
        inserted = doc.execCommand('insertText', false, ch);
      } catch {
        inserted = false;
      }
      if (!inserted) {
        writeNativeValue(el, el.value + ch);
        safeDispatch(el, new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: ch }));
      }
      safeDispatch(el, new KeyboardEvent('keyup', key));
    }
    safeDispatch(el, new Event('change', { bubbles: true }));
    el.blur();
    return el.value !== '';
  } catch (error) {
    console.debug('[LinguaFill] Could not type into input', el, error);
    return false;
  }
}

/**
 * Briefly outlines filled controls, then restores the original inline styles
 * (including `!important` priorities) exactly as they were.
 * @param {Element[]} elements
 * @param {number} [duration]
 */
export function highlight(elements, duration = 1400) {
  for (const el of elements) {
    try {
      const saved = Object.keys(FILL_MARK_STYLE).map((prop) => [
        prop,
        el.style.getPropertyValue(prop),
        el.style.getPropertyPriority(prop),
      ]);
      for (const [prop, value] of Object.entries(FILL_MARK_STYLE)) {
        el.style.setProperty(prop, value, 'important');
      }
      setTimeout(() => {
        for (const [prop, value, priority] of saved) {
          if (value) el.style.setProperty(prop, value, priority);
          else el.style.removeProperty(prop);
        }
      }, duration);
    } catch {
      /* Styling is cosmetic; never fail the run because of it. */
    }
  }
}
