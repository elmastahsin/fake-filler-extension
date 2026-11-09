/**
 * LinguaFill popup controller.
 *  - Renders settings from chrome.storage.sync and auto-saves every change.
 *  - Shows a live persona preview using the same generator as the content script.
 *  - Delegates the actual fill to the background worker (single code path for
 *    popup clicks and keyboard shortcuts).
 */
import { AUTO_LOCALE, COMMANDS, FIELD_TYPE_META, MESSAGES } from '../shared/constants.js';
import { getSettings, saveSettings } from '../shared/settings.js';
import { SUPPORTED_LOCALES, detectBrowserLocale, getDataset, resolveLocale } from '../locales/index.js';
import { DataGenerator, formatDate } from '../generators/dataGenerator.js';

const BEHAVIOR_OPTIONS = [
  { key: 'overwriteExisting', title: 'Overwrite filled fields', desc: 'Replace values that are already present' },
  { key: 'highlightFilled', title: 'Highlight filled fields', desc: 'Briefly outline every field that was filled' },
  { key: 'fillUnknown', title: 'Fill unrecognized fields', desc: 'Use a short contextual phrase as fallback' },
  { key: 'fillSelects', title: 'Fill dropdowns', desc: 'Pick an option in <select> and custom dropdowns' },
  { key: 'fillCheckboxes', title: 'Check consent boxes', desc: 'Tick required / agreement checkboxes & groups' },
  { key: 'acceptMarketing', title: 'Accept marketing opt-ins', desc: 'Also tick newsletter and promotional checkboxes' },
  { key: 'fillCustomControls', title: 'Rich editors & ARIA widgets', desc: 'Fill contenteditable and custom comboboxes' },
  { key: 'dynamicRescan', title: 'Follow dependent fields', desc: 'Re-scan after filling (e.g. City → District)' },
  { key: 'safeEmails', title: 'Safe email domains', desc: 'Use example.com instead of real providers' },
];

const $ = (id) => document.getElementById(id);

const state = {
  settings: null,
  generator: null,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) node.append(child);
  return node;
}

let savedTimer;
function flashSaved() {
  const indicator = $('saved-indicator');
  indicator.classList.add('is-visible');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => indicator.classList.remove('is-visible'), 1200);
}

async function update(patch) {
  state.settings = await saveSettings(patch);
  flashSaved();
  return state.settings;
}

function localeMeta(code) {
  return SUPPORTED_LOCALES.find((l) => l.code === code);
}

/* ------------------------------------------------------------------ */
/* Renderers                                                            */
/* ------------------------------------------------------------------ */

function renderActiveLocale() {
  const code = resolveLocale(state.settings.locale);
  const meta = localeMeta(code);
  $('active-locale-pill').textContent = `${meta.flag} ${code.toUpperCase()}`;
}

function renderLocaleOptions() {
  const detected = localeMeta(detectBrowserLocale());
  $('detected-locale').textContent = `Browser: ${detected.flag} ${detected.label}`;

  const options = [
    { code: AUTO_LOCALE, flag: '🌐', label: 'Auto' },
    ...SUPPORTED_LOCALES.map(({ code, flag, label }) => ({ code, flag, label })),
  ];
  const container = $('locale-options');
  container.replaceChildren(
    ...options.map((opt) =>
      el(
        'button',
        {
          type: 'button',
          className: 'segmented__option',
          role: 'radio',
          id: `locale-${opt.code}`,
          title: opt.code === AUTO_LOCALE ? `Follow browser language (${detected.label})` : opt.label,
          'aria-checked': String(state.settings.locale === opt.code),
          dataset: { locale: opt.code },
        },
        [el('span', { className: 'segmented__flag', textContent: opt.flag }), el('span', { className: 'segmented__label', textContent: opt.label })]
      )
    )
  );
}

function renderPersona() {
  const code = resolveLocale(state.settings.locale);
  const dataset = getDataset(code);
  if (!state.generator || state.generator.dataset !== dataset || state.generator.options.safeEmails !== state.settings.safeEmails) {
    state.generator = new DataGenerator(dataset, { safeEmails: state.settings.safeEmails });
  }
  const p = state.generator.persona;
  const rows = [
    ['Name', `${p.fullName} (${p.genderLabel})`],
    ['Email', p.email, true],
    ['Phone', p.phone, true],
    ['National ID', p.nationalId, true],
    ['IBAN', p.iban, true],
    ['Address', p.address.full],
    ['Birthday', `${formatDate(p.birthDate, dataset.dateFormat)} (${p.age})`],
    ['Company', `${p.company} — ${p.jobTitle}`],
  ];
  $('persona').replaceChildren(
    ...rows.flatMap(([label, value, mono]) => [
      el('dt', { textContent: label }),
      el('dd', { textContent: value, title: value, className: mono ? 'mono' : '' }),
    ])
  );
}

function renderFieldToggles() {
  $('field-toggles').replaceChildren(
    ...FIELD_TYPE_META.map(({ type, label, icon }) =>
      el(
        'button',
        {
          type: 'button',
          className: 'chip',
          id: `field-${type.toLowerCase()}`,
          'aria-pressed': String(state.settings.enabledFields[type] !== false),
          dataset: { field: type },
        },
        [el('span', { className: 'chip__icon', textContent: icon, 'aria-hidden': 'true' }), label]
      )
    )
  );
}

function renderBehaviorSwitches() {
  $('behavior-switches').replaceChildren(
    ...BEHAVIOR_OPTIONS.map(({ key, title, desc }) =>
      el('label', { className: 'switch', htmlFor: `opt-${key}` }, [
        el('span', { className: 'switch__text' }, [
          el('span', { className: 'switch__title', textContent: title }),
          el('span', { className: 'switch__desc', textContent: desc }),
        ]),
        el('input', { type: 'checkbox', id: `opt-${key}`, checked: Boolean(state.settings[key]), dataset: { option: key } }),
        el('span', { className: 'switch__track', 'aria-hidden': 'true' }),
      ])
    )
  );
}

async function renderShortcut() {
  try {
    const commands = await chrome.commands.getAll();
    const shortcut = commands.find((c) => c.name === COMMANDS.FILL_FORM)?.shortcut;
    $('shortcut-value').textContent = shortcut || 'Not set';
    const hint = $('fill-shortcut-hint');
    hint.textContent = shortcut || '';
    hint.hidden = !shortcut;
  } catch {
    $('shortcut-value').textContent = 'Unavailable';
  }
}

const TYPE_LABELS = Object.fromEntries(FIELD_TYPE_META.map(({ type, label }) => [type, label.toLowerCase()]));

function showStatus(kind, title, detail = '') {
  const icons = { success: '✓', warning: '!', error: '✕' };
  const box = $('status');
  box.className = `status status--${kind}`;
  $('status-icon').textContent = icons[kind];
  $('status-title').textContent = title;
  $('status-detail').textContent = detail;
  box.hidden = false;
}

function renderResult(result) {
  if (!result?.ok) {
    showStatus('error', 'Could not fill this page', result?.error || 'Unknown error');
    return;
  }
  const meta = localeMeta(result.locale);
  if (!result.filled) {
    const detail = result.total
      ? `${result.total} field(s) found but none were filled. Check the field toggles.`
      : result.skipped
        ? `${result.skipped} field(s) skipped (already filled, hidden or read-only).`
        : 'No fillable form fields were found.';
    showStatus('warning', 'Nothing to fill', detail);
    return;
  }
  const top = Object.entries(result.byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, n]) => `${n} ${TYPE_LABELS[type] || 'text'}`)
    .join(' · ');
  const extras = [result.skipped && `${result.skipped} skipped`, result.failed && `${result.failed} failed`].filter(Boolean).join(', ');
  showStatus(
    result.failed ? 'warning' : 'success',
    `Filled ${result.filled} field${result.filled === 1 ? '' : 's'} in ${meta ? `${meta.flag} ${meta.label}` : result.locale}`,
    [top, extras].filter(Boolean).join(' — ')
  );
}

/* ------------------------------------------------------------------ */
/* Event wiring                                                         */
/* ------------------------------------------------------------------ */

function bindEvents() {
  $('fill-button').addEventListener('click', async () => {
    const button = $('fill-button');
    button.disabled = true;
    button.classList.add('is-loading');
    $('fill-button-label').textContent = 'Filling…';
    try {
      renderResult(await chrome.runtime.sendMessage({ type: MESSAGES.FILL_ACTIVE_TAB }));
    } catch (error) {
      renderResult({ ok: false, error: String(error?.message || error) });
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
      $('fill-button-label').textContent = 'Fill this page';
    }
  });

  $('locale-options').addEventListener('click', async (event) => {
    const option = event.target.closest('[data-locale]');
    if (!option) return;
    await update({ locale: option.dataset.locale });
    renderLocaleOptions();
    renderActiveLocale();
    renderPersona();
  });

  $('locale-options').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const options = [...event.currentTarget.querySelectorAll('[role="radio"]')];
    const index = options.indexOf(document.activeElement);
    const next = options[(index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
    next?.focus();
    next?.click();
  });

  $('shuffle-button').addEventListener('click', () => {
    state.generator?.reroll();
    renderPersona();
  });

  $('field-toggles').addEventListener('click', async (event) => {
    const chip = event.target.closest('[data-field]');
    if (!chip) return;
    const type = chip.dataset.field;
    const enabled = chip.getAttribute('aria-pressed') !== 'true';
    chip.setAttribute('aria-pressed', String(enabled));
    await update({ enabledFields: { [type]: enabled } });
  });

  const setAllFields = async (enabled) => {
    await update({ enabledFields: Object.fromEntries(FIELD_TYPE_META.map(({ type }) => [type, enabled])) });
    renderFieldToggles();
  };
  $('fields-all').addEventListener('click', () => setAllFields(true));
  $('fields-none').addEventListener('click', () => setAllFields(false));

  $('behavior-switches').addEventListener('change', async (event) => {
    const key = event.target.dataset.option;
    if (!key) return;
    await update({ [key]: event.target.checked });
    if (key === 'safeEmails') renderPersona();
  });

  // Chrome does not allow extensions to change shortcuts programmatically;
  // the dedicated settings page is the supported way.
  $('shortcut-button').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                 */
/* ------------------------------------------------------------------ */

async function init() {
  state.settings = await getSettings();
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  renderActiveLocale();
  renderLocaleOptions();
  renderPersona();
  renderFieldToggles();
  renderBehaviorSwitches();
  bindEvents();
  await renderShortcut();
}

init().catch((error) => {
  console.error('[LinguaFill] Popup init failed', error);
  showStatus('error', 'Popup failed to load', String(error?.message || error));
});
