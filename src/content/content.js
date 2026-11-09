/**
 * LinguaFill content script — main entry point inside the target page.
 *
 * Injection model
 * ---------------
 * The extension only holds `activeTab` + `scripting` (no host permissions), so
 * this file is injected on demand by the background service worker whenever
 * the user clicks "Fill" or presses the shortcut. It is a *classic* script
 * (chrome.scripting cannot inject ES modules directly) that lazily loads the
 * modular engine via dynamic `import()` from web-accessible extension URLs.
 *
 * The script is idempotent: repeated injections into the same frame reuse the
 * already-registered `globalThis.__linguaFill` API (globals live in the
 * extension's isolated world and are invisible to the page).
 */
(() => {
  'use strict';

  if (globalThis.__linguaFill) return;

  const MODULES = {
    scanner: 'src/content/domScanner.js',
    widgets: 'src/content/widgets.js',
    generator: 'src/generators/dataGenerator.js',
    handlers: 'src/generators/inputHandlers.js',
    patterns: 'src/generators/patternGenerator.js',
    locales: 'src/locales/index.js',
    settings: 'src/shared/settings.js',
    constants: 'src/shared/constants.js',
    text: 'src/shared/textUtils.js',
  };

  const MAX_ROUNDS = 3;
  const MAX_DETAILS = 40;

  let modulesPromise = null;
  let running = false;

  /** Loads all engine modules once per frame; retries on next call if it fails. */
  function loadModules() {
    if (!modulesPromise) {
      const entries = Object.entries(MODULES);
      modulesPromise = Promise.all(entries.map(([, path]) => import(chrome.runtime.getURL(path))))
        .then((loaded) => Object.fromEntries(entries.map(([key], i) => [key, loaded[i]])))
        .catch((error) => {
          modulesPromise = null;
          throw error;
        });
    }
    return modulesPromise;
  }

  /**
   * Waits briefly for DOM mutations (e.g. a district <select> populated after
   * a city is selected, or a conditional section revealed by a radio/checkbox).
   */
  function waitForDomSettle(quietMs = 90, maxMs = 450) {
    return new Promise((resolve) => {
      let mutated = false;
      let quietTimer = null;
      const done = () => {
        observer.disconnect();
        clearTimeout(quietTimer);
        clearTimeout(maxTimer);
        resolve(mutated);
      };
      const observer = new MutationObserver(() => {
        mutated = true;
        clearTimeout(quietTimer);
        quietTimer = setTimeout(done, quietMs);
      });
      observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'hidden', 'class', 'style', 'aria-hidden'],
      });
      quietTimer = setTimeout(done, quietMs);
      const maxTimer = setTimeout(done, maxMs);
    });
  }

  function isFieldEnabled(field, settings, T) {
    if ((field.kind === 'select' || field.kind === 'combobox') && !settings.fillSelects) return false;
    if ((field.kind === 'checkbox' || field.kind === 'checkbox-group') && !settings.fillCheckboxes) return false;
    if (field.type === T.UNKNOWN) return settings.fillUnknown;
    return settings.enabledFields[field.type] !== false;
  }

  /**
   * Sets a text input's value, then verifies that the browser and any input
   * mask accepted it. If validation fails (pattern, maxlength, mask...), tries:
   *   1. user-like per-character typing (activates input-mask libraries),
   *   2. alternative encodings from the generator (digits-only, ASCII, ...),
   *   3. a value synthesised directly from the `pattern` attribute.
   */
  function fillTextControl(field, generator, m) {
    const { element, type, constraints } = field;
    const { setInputValue, isValueAccepted, isMaskPlaceholderValue, typeText } = m.handlers;
    const primary = generator.generate(type, constraints);
    if (primary === null || primary === undefined || primary === '') return null;

    const tryValue = (val) => {
      const hadMask = isMaskPlaceholderValue(element.value);
      if (hadMask) {
        typeText(element, val.replace(/\D/g, '') || val);
        if (isValueAccepted(element)) return element.value;
      }
      if (setInputValue(element, val) && isValueAccepted(element)) return element.value;
      if (typeText(element, val) && isValueAccepted(element)) return element.value;
      return null;
    };

    const first = tryValue(primary);
    if (first !== null) {
      generator.remember(type, first);
      return first;
    }

    for (const alt of generator.alternatives(type, constraints, primary)) {
      const accepted = tryValue(alt);
      if (accepted !== null) {
        generator.remember(type, accepted);
        return accepted;
      }
    }

    if (constraints.pattern) {
      const fromPattern = m.patterns.generateFromPattern(constraints.pattern, generator.rnd, {
        maxLength: constraints.maxLength,
        minLength: constraints.minLength,
      });
      if (fromPattern !== null) {
        const accepted = tryValue(fromPattern);
        if (accepted !== null) {
          generator.remember(type, accepted);
          return accepted;
        }
      }
    }

    // Last resort: if the control at least holds a non-empty value, keep it.
    return element.value && !isMaskPlaceholderValue(element.value) ? element.value : null;
  }

  function fillRadioGroup(field, generator, m) {
    const { options } = field;
    if (!options?.length) return null;
    const normalize = m.text.foldText;
    let choice = null;
    if (field.type === m.constants.FIELD_TYPES.GENDER) {
      choice = options.find((o) => generator.matchesGender(o.label) || generator.matchesGender(o.element.value));
    }
    if (!choice) {
      choice = m.handlers.pickRandom(options, (o) => o.label, normalize);
    }
    return m.handlers.setChecked(choice.element, true) ? choice.label || choice.element.value || '✓' : null;
  }

  function fillCheckbox(field, settings, m) {
    if (field.kind === 'checkbox-group') {
      const choice = m.handlers.pickRandom(field.options, (o) => o.label, m.text.foldText);
      return m.handlers.setChecked(choice.element, true) ? choice.label || '✓' : null;
    }
    const role = field.checkboxRole;
    if (role === 'negative') return false; // Leave "Do not contact me" unticked.
    if (role === 'marketing' && !settings.acceptMarketing) return false;
    if (role === 'optional' && !field.constraints.required) {
      // Standalone optional feature flag — tick Consent boxes and required ones;
      // for generic single checkboxes, tick them so test forms get full coverage.
    }
    return m.handlers.setChecked(field.element, true) ? '✓' : null;
  }

  async function fillField(field, generator, settings, m) {
    const preferred = generator.selectPreferences(field.type, field.constraints);
    const normalize = m.text.foldText;

    switch (field.kind) {
      case 'select': {
        const ok = m.handlers.fillSelect(field.element, { preferred, normalize });
        if (!ok) return { status: 'failed' };
        const selected = field.element.options[field.element.selectedIndex];
        return { status: 'filled', value: selected?.textContent?.trim() || field.element.value };
      }
      case 'combobox': {
        const res = await m.widgets.fillCombobox(field.element, {
          preferred,
          normalize,
          typeFallback: (el) => {
            const v = preferred[0] || generator.generate(field.type, field.constraints);
            return v ? m.handlers.setInputValue(el, v) : false;
          },
        });
        return res.ok ? { status: 'filled', value: res.text || '✓' } : { status: 'failed' };
      }
      case 'editable': {
        const value = generator.generate(field.type, field.constraints);
        if (!value) return { status: 'failed' };
        return m.widgets.fillEditable(field.element, value) ? { status: 'filled', value } : { status: 'failed' };
      }
      case 'radio': {
        const chosen = fillRadioGroup(field, generator, m);
        return chosen ? { status: 'filled', value: chosen } : { status: 'failed' };
      }
      case 'checkbox':
      case 'checkbox-group': {
        const res = fillCheckbox(field, settings, m);
        if (res === false) return { status: 'ignored' };
        return res ? { status: 'filled', value: res } : { status: 'failed' };
      }
      default: {
        const value = fillTextControl(field, generator, m);
        return value !== null ? { status: 'filled', value } : { status: 'failed' };
      }
    }
  }

  /** Sort order: selects & radios first so dependent fields unlock before we scan again. */
  const KIND_PRIORITY = { radio: 0, select: 1, combobox: 2, input: 3, textarea: 4, editable: 5, 'checkbox-group': 6, checkbox: 7 };

  function describeField(field) {
    const s = field.signals || {};
    return s.label || s.groupLabel || s.ariaLabel || s.placeholder || s.name || s.id || s.nearby || field.kind;
  }

  function maskIfSensitive(field, value, T) {
    if (!value) return '';
    if (field.type === T.PASSWORD || field.type === T.CVV) return '••••••••';
    return String(value).slice(0, 40);
  }

  /**
   * Scans this frame and fills every eligible control, repeating up to
   * `MAX_ROUNDS` times when filling a control reveals or populates new ones
   * (e.g. İl → İlçe cascading dropdowns).
   * Always resolves (never rejects) with a JSON-serialisable result object.
   * @param {object} rawSettings Settings snapshot from chrome.storage.
   */
  async function run(rawSettings = {}) {
    if (running) return { ok: false, busy: true, error: 'A fill is already in progress.' };
    running = true;
    const startedAt = performance.now();

    try {
      const m = await loadModules();
      const T = m.constants.FIELD_TYPES;
      const settings = m.settings.mergeSettings(rawSettings);
      const locale = m.locales.resolveLocale(settings.locale);
      const generator = new m.generator.DataGenerator(m.locales.getDataset(locale), {
        safeEmails: settings.safeEmails,
      });

      const stats = { filled: 0, failed: 0, ignored: 0, skipped: 0, byType: {} };
      const filledElements = [];
      const handled = new Set();
      const failedSet = new Set();
      const details = [];
      let totalDiscovered = 0;

      const maxRounds = settings.dynamicRescan !== false ? MAX_ROUNDS : 1;

      for (let round = 0; round < maxRounds; round += 1) {
        const { fields, skipped } = m.scanner.scanFields(document, {
          includeFilled: round === 0 ? settings.overwriteExisting : false,
          includeCustom: settings.fillCustomControls !== false,
        });
        if (round === 0) stats.skipped = skipped.length;

        const pending = fields
          .filter((f) => !handled.has(f.element))
          .sort((a, b) => (KIND_PRIORITY[a.kind] ?? 9) - (KIND_PRIORITY[b.kind] ?? 9));

        if (!pending.length) break;
        totalDiscovered += pending.length;

        let filledThisRound = 0;
        for (const field of pending) {
          if (!isFieldEnabled(field, settings, T)) {
            handled.add(field.element);
            stats.ignored += 1;
            continue;
          }
          let outcome = { status: 'failed' };
          try {
            outcome = await fillField(field, generator, settings, m);
          } catch (error) {
            console.debug('[LinguaFill] Fill error', field.element, error);
          }

          if (outcome.status === 'filled') {
            handled.add(field.element);
            if (failedSet.delete(field.element)) stats.failed -= 1;
            stats.filled += 1;
            filledThisRound += 1;
            stats.byType[field.type] = (stats.byType[field.type] || 0) + 1;
            filledElements.push(field.element);
            if (details.length < MAX_DETAILS) {
              details.push({ label: describeField(field), type: field.type, kind: field.kind, status: 'filled', value: maskIfSensitive(field, outcome.value, T) });
            }
          } else if (outcome.status === 'ignored') {
            handled.add(field.element);
            stats.ignored += 1;
          } else if (!failedSet.has(field.element)) {
            // Do not add to `handled` yet: a currently-empty <select> may get
            // its <option>s after an async fetch triggered by an earlier field.
            failedSet.add(field.element);
            stats.failed += 1;
          }
        }

        if (!filledThisRound || round + 1 >= maxRounds) break;
        await waitForDomSettle();
      }

      if (settings.highlightFilled && filledElements.length) {
        m.handlers.highlight(filledElements);
      }

      return {
        ok: true,
        locale,
        isTopFrame: window === window.top,
        frameUrl: location.href,
        total: totalDiscovered,
        durationMs: Math.round(performance.now() - startedAt),
        details,
        ...stats,
      };
    } catch (error) {
      console.warn('[LinguaFill] Run failed', error);
      return { ok: false, error: String(error?.message || error) };
    } finally {
      running = false;
    }
  }

  Object.defineProperty(globalThis, '__linguaFill', {
    value: Object.freeze({ version: chrome.runtime.getManifest().version, run }),
    configurable: false,
    writable: false,
  });
})();
