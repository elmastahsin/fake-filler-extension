/**
 * Non-native "widgets" that are not <input>/<select>/<textarea>:
 *
 *  - Rich-text / contenteditable editors (Quill, TinyMCE inline, Draft.js,
 *    Lexical, ProseMirror/Tiptap, CKEditor 5, plain [contenteditable]).
 *  - Custom dropdowns following the ARIA combobox / listbox pattern
 *    (React-Select, MUI Select & Autocomplete, Headless UI, Radix, Ant Design,
 *    Downshift, Vuetify, PrimeVue, ng-select ...).
 *
 * These widgets keep their state in JS, so we drive them through the same
 * events a user would produce (focus, mousedown/click, keyboard, insertText)
 * and verify the outcome instead of writing the DOM directly.
 */
import { isPlaceholderOption, matchPreferred, pickRandom } from '../generators/inputHandlers.js';

const OPTION_SELECTOR = [
  '[role="option"]',
  '[id*="-option-"]',
  '[class*="__option"]:not([class*="__options"])',
  '.ant-select-item-option',
  '.el-select-dropdown__item',
  '.v-list-item',
  '.p-dropdown-item',
  '.ng-option',
  '.vs__dropdown-option',
  '.multiselect__option',
].join(', ');

const VALUE_DISPLAY_SELECTOR = [
  '[class*="singleValue"]', '[class*="single-value"]', '[class*="multiValue"]', '[class*="multi-value"]',
  '.ant-select-selection-item', '.MuiChip-root', '.ng-value', '.vs__selected', '.multiselect__single', '.p-dropdown-label:not(.p-placeholder)',
].join(', ');

const PLACEHOLDER_TEXT_RE = /^(select|choose|please|pick|seç|seçiniz|lütfen|bitte|wählen|auswählen|-+|\.\.\.)/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls `fn` until it returns a truthy value or the timeout elapses. */
async function waitFor(fn, timeout = 800, interval = 40) {
  const start = performance.now();
  for (;;) {
    let result = null;
    try {
      result = fn();
    } catch {
      result = null;
    }
    if (result) return result;
    if (performance.now() - start >= timeout) return null;
    await sleep(interval);
  }
}

function isShown(el) {
  if (!el?.isConnected) return false;
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  const rect = el.getBoundingClientRect();
  return rect.width >= 2 && rect.height >= 2;
}

function safeDispatch(el, event) {
  try {
    el.dispatchEvent(event);
  } catch {
    /* Page listener threw — ignore. */
  }
}

function pointerInit(el) {
  const rect = el.getBoundingClientRect();
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    buttons: 1,
    clientX: rect.left + Math.min(rect.width / 2, 20),
    clientY: rect.top + rect.height / 2,
  };
}

/** Full pointer + mouse + click sequence, as produced by a real left click. */
export function clickLikeUser(el) {
  const init = pointerInit(el);
  const PointerCtor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  safeDispatch(el, new PointerCtor('pointerover', init));
  safeDispatch(el, new MouseEvent('mouseover', init));
  safeDispatch(el, new PointerCtor('pointermove', init));
  safeDispatch(el, new MouseEvent('mousemove', init));
  safeDispatch(el, new PointerCtor('pointerdown', { ...init, pointerType: 'mouse', isPrimary: true }));
  safeDispatch(el, new MouseEvent('mousedown', init));
  safeDispatch(el, new PointerCtor('pointerup', { ...init, buttons: 0, pointerType: 'mouse', isPrimary: true }));
  safeDispatch(el, new MouseEvent('mouseup', { ...init, buttons: 0 }));
  safeDispatch(el, new MouseEvent('click', { ...init, buttons: 0 }));
}

function pressKey(el, key, code = key) {
  const keyCodes = { ArrowDown: 40, Enter: 13, Escape: 27, ' ': 32, Tab: 9 };
  const init = { key, code, keyCode: keyCodes[key] || 0, which: keyCodes[key] || 0, bubbles: true, cancelable: true, composed: true };
  safeDispatch(el, new KeyboardEvent('keydown', init));
  safeDispatch(el, new KeyboardEvent('keyup', init));
}

/* ------------------------------------------------------------------ */
/* contenteditable                                                      */
/* ------------------------------------------------------------------ */

/** Text currently shown by a rich-text editor (ignoring zero-width chars). */
export function editableText(el) {
  return (el.textContent || '').replace(/[\u200b\u00a0\s]+/g, ' ').trim();
}

/**
 * Replaces the content of a contenteditable editor via `insertText`, which
 * fires `beforeinput`/`input` so editor frameworks update their models.
 * @param {HTMLElement} el
 * @param {string} text
 */
export function fillEditable(el, text) {
  try {
    const doc = el.ownerDocument || document;
    el.focus({ preventScroll: true });
    const selection = doc.getSelection();
    const range = doc.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);

    let inserted = false;
    try {
      inserted = doc.execCommand('insertText', false, text);
    } catch {
      inserted = false;
    }
    if (!inserted || !editableText(el)) {
      el.textContent = text;
      safeDispatch(el, new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
    }
    selection.removeAllRanges();
    el.blur();
    return editableText(el) !== '';
  } catch (error) {
    console.debug('[LinguaFill] Could not fill editor', el, error);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* ARIA combobox / custom dropdowns                                     */
/* ------------------------------------------------------------------ */

/** Best-effort: does the custom dropdown already show a selected value? */
export function comboboxHasValue(el) {
  const container =
    el.closest('[class*="-container"], [class*="-control"], .MuiAutocomplete-root, .MuiInputBase-root, .ant-select, .ng-select, .v-select, .multiselect, .p-dropdown') ||
    el.parentElement;
  if (container?.querySelector(VALUE_DISPLAY_SELECTOR)) return true;
  if (el.tagName === 'INPUT') return el.value.trim() !== '';
  if (el.querySelector('[class*="placeholder"]')) return false;
  const text = editableText(el);
  return Boolean(text) && !PLACEHOLDER_TEXT_RE.test(text);
}

function rootsFor(el) {
  const roots = [el.ownerDocument || document];
  const root = el.getRootNode();
  if (root && root !== roots[0]) roots.unshift(root);
  return roots;
}

function visibleOptionsIn(scope) {
  return [...scope.querySelectorAll(OPTION_SELECTOR)].filter((o) => isShown(o) && !o.closest('select'));
}

/** Options belonging to the popup opened by `el`. */
function findOptions(el, before) {
  const ids = `${el.getAttribute('aria-controls') || ''} ${el.getAttribute('aria-owns') || ''}`.trim().split(/\s+/).filter(Boolean);
  for (const root of rootsFor(el)) {
    for (const id of ids) {
      const popup = root.getElementById?.(id);
      if (popup && isShown(popup)) {
        const options = visibleOptionsIn(popup);
        if (options.length) return options;
      }
    }
  }
  for (const root of rootsFor(el)) {
    const options = visibleOptionsIn(root).filter((o) => !before.has(o) && !el.contains(o));
    if (options.length) return options;
  }
  return null;
}

function optionText(option) {
  return (option.getAttribute('aria-label') || option.textContent || '').replace(/\s+/g, ' ').trim();
}

function usableOptions(options) {
  return options
    .filter((o) => o.getAttribute('aria-disabled') !== 'true' && !o.classList.contains('disabled') && !/--is-disabled|is-disabled|-disabled\b/.test(o.className || ''))
    .map((node, index) => ({ node, text: optionText(node), value: node.getAttribute('data-value') || node.getAttribute('value') || '' }))
    .filter((o, index) => o.text && !(index === 0 && isPlaceholderOption({ value: o.text, textContent: o.text }, 0)));
}

/** Tries the usual ways to open a custom dropdown and waits for options. */
async function openPopup(el, before) {
  const isInput = el.tagName === 'INPUT';
  const attempts = isInput
    ? [
        () => {
          el.focus({ preventScroll: true });
          safeDispatch(el, new MouseEvent('mousedown', pointerInit(el)));
        },
        () => pressKey(el, 'ArrowDown'),
        () => clickLikeUser(el),
      ]
    : [
        () => {
          const init = pointerInit(el);
          safeDispatch(el, new (typeof PointerEvent === 'function' ? PointerEvent : MouseEvent)('pointerdown', init));
          safeDispatch(el, new MouseEvent('mousedown', init));
        },
        () => clickLikeUser(el),
        () => {
          el.focus?.({ preventScroll: true });
          pressKey(el, 'ArrowDown');
        },
        () => pressKey(el, 'Enter'),
      ];
  for (const attempt of attempts) {
    attempt();
    const options = await waitFor(() => findOptions(el, before), 350);
    if (options) return options;
  }
  return null;
}

function closePopup(el) {
  pressKey(el, 'Escape');
  if (el.tagName === 'INPUT') el.blur();
  safeDispatch(el, new FocusEvent('focusout', { bubbles: true, composed: true }));
}

/**
 * Opens a custom dropdown, picks the preferred (or a random) option and
 * closes it. For free-text comboboxes (autocomplete inputs) that show no
 * options until something is typed, `typeFallback` is typed first.
 * @param {HTMLElement} el
 * @param {{preferred?: string[], normalize: (s:string)=>string, typeFallback?: (el:HTMLElement)=>boolean}} options
 * @returns {Promise<{ok:boolean, text?:string, reason?:string}>}
 */
export async function fillCombobox(el, { preferred = [], normalize, typeFallback = null }) {
  try {
    const before = new Set(rootsFor(el).flatMap((root) => visibleOptionsIn(root)));
    let options = await openPopup(el, before);

    if (!options && el.tagName === 'INPUT' && typeFallback) {
      // Autocomplete inputs (city search, address lookup...) — type, then pick a suggestion.
      if (!typeFallback(el)) return { ok: false, reason: 'type-failed' };
      el.focus({ preventScroll: true });
      options = await waitFor(() => findOptions(el, before), 1200);
      if (!options) {
        el.blur();
        return { ok: el.value.trim() !== '', text: el.value, reason: 'typed' };
      }
    }
    if (!options) {
      closePopup(el);
      return { ok: false, reason: 'no-options' };
    }

    const candidates = usableOptions(options);
    if (!candidates.length) {
      closePopup(el);
      return { ok: false, reason: 'no-usable-options' };
    }
    const choice = matchPreferred(candidates, preferred, normalize) || pickRandom(candidates, (c) => c.text, normalize);
    choice.node.scrollIntoView?.({ block: 'nearest' });
    clickLikeUser(choice.node);
    await sleep(60);

    // Keyboard fallback when the click was ignored (option still visible & nothing selected).
    if (isShown(choice.node) && !comboboxHasValue(el)) {
      el.focus?.({ preventScroll: true });
      pressKey(el, 'Enter');
      await sleep(40);
    }
    if (isShown(choice.node)) closePopup(el);
    else safeDispatch(el, new FocusEvent('focusout', { bubbles: true, composed: true }));
    return { ok: true, text: choice.text };
  } catch (error) {
    console.debug('[LinguaFill] Could not fill combobox', el, error);
    return { ok: false, reason: 'error' };
  }
}

