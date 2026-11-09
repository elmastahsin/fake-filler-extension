/**
 * Settings persistence helpers (chrome.storage.sync).
 * `mergeSettings` is pure and safe to use anywhere; the async helpers require
 * the `storage` permission and an extension context.
 */
import { DEFAULT_SETTINGS } from './constants.js';

const STORAGE_KEY = 'settings';

/**
 * Deep-merges a (possibly partial / outdated) settings object with defaults so
 * newly introduced options always have a sane value.
 * @param {Partial<typeof DEFAULT_SETTINGS>} [raw]
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function mergeSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    ...DEFAULT_SETTINGS,
    ...source,
    enabledFields: {
      ...DEFAULT_SETTINGS.enabledFields,
      ...(source.enabledFields && typeof source.enabledFields === 'object' ? source.enabledFields : {}),
    },
  };
}

/** @returns {Promise<typeof DEFAULT_SETTINGS>} */
export async function getSettings() {
  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    return mergeSettings(stored[STORAGE_KEY]);
  } catch (error) {
    console.warn('[LinguaFill] Could not read settings, using defaults.', error);
    return mergeSettings();
  }
}

/**
 * Persists a partial settings update and returns the full merged result.
 * @param {Partial<typeof DEFAULT_SETTINGS>} patch
 */
export async function saveSettings(patch) {
  const current = await getSettings();
  const next = mergeSettings({
    ...current,
    ...patch,
    enabledFields: { ...current.enabledFields, ...(patch.enabledFields || {}) },
  });
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  return next;
}

/** Writes defaults on first install while preserving any existing user choices. */
export async function initSettings() {
  const current = await getSettings();
  await chrome.storage.sync.set({ [STORAGE_KEY]: current });
  return current;
}
