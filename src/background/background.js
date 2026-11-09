/**
 * LinguaFill background service worker (MV3, ES module).
 *
 * Responsibilities
 *  - Extension lifecycle: seed default settings, detect browser locale.
 *  - Keyboard shortcut (`fill-form` command) handling.
 *  - Message routing for the popup ("fill the active tab").
 *  - On-demand injection of the content script into the active tab using the
 *    temporary host access granted by `activeTab` — so we never need broad
 *    host permissions.
 */
import { COMMANDS, MESSAGES } from '../shared/constants.js';
import { getSettings, initSettings } from '../shared/settings.js';
import { detectBrowserLocale } from '../locales/index.js';

const CONTENT_SCRIPT = 'src/content/content.js';
const BADGE_COLORS = { ok: '#7C5CFF', empty: '#64748B', error: '#E11D48' };
const BADGE_TIMEOUT_MS = 2500;

/* ------------------------------------------------------------------ */
/* Lifecycle                                                            */
/* ------------------------------------------------------------------ */

async function recordDetectedLocale() {
  const detectedLocale = detectBrowserLocale();
  await chrome.storage.local.set({ detectedLocale });
  return detectedLocale;
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  try {
    await initSettings();
    const locale = await recordDetectedLocale();
    console.info(`[LinguaFill] ${reason}: detected browser locale "${locale}".`);
  } catch (error) {
    console.error('[LinguaFill] onInstalled failed', error);
  }
});

chrome.runtime.onStartup.addListener(() => {
  recordDetectedLocale().catch((error) => console.error('[LinguaFill] onStartup failed', error));
});

/* ------------------------------------------------------------------ */
/* Core: inject + fill                                                  */
/* ------------------------------------------------------------------ */

function friendlyError(error) {
  const message = String(error?.message || error);
  if (/cannot be scripted|cannot access|chrome:\/\/|edge:\/\/|extensions gallery|webstore|Missing host permission/i.test(message)) {
    return 'This page is protected by the browser and cannot be filled.';
  }
  if (/No tab with id|Frame with ID 0 was removed/i.test(message)) {
    return 'The tab was closed or navigated away.';
  }
  return message;
}

/** Combines per-frame results into one summary. */
function aggregateResults(injectionResults) {
  const frames = injectionResults.map((r) => r?.result).filter(Boolean);
  const successful = frames.filter((f) => f.ok);
  if (!successful.length) {
    return { ok: false, error: frames.find((f) => f.error)?.error || 'No response from the page.' };
  }
  const top = successful.find((f) => f.isTopFrame) || successful[0];
  const summary = { ok: true, locale: top.locale, frames: successful.length, total: 0, filled: 0, failed: 0, ignored: 0, skipped: 0, byType: {}, details: [] };
  for (const frame of successful) {
    for (const key of ['total', 'filled', 'failed', 'ignored', 'skipped']) summary[key] += frame[key] || 0;
    for (const [type, count] of Object.entries(frame.byType || {})) {
      summary.byType[type] = (summary.byType[type] || 0) + count;
    }
    if (Array.isArray(frame.details)) summary.details.push(...frame.details);
  }
  return summary;
}

async function injectAndRun(target, settings) {
  await chrome.scripting.executeScript({ target, files: [CONTENT_SCRIPT] });
  return chrome.scripting.executeScript({
    target,
    // Runs in the same isolated world as content.js; returns a Promise that
    // executeScript awaits and serialises back to us.
    func: (s) => (globalThis.__linguaFill ? globalThis.__linguaFill.run(s) : { ok: false, error: 'LinguaFill engine not loaded.' }),
    args: [settings],
  });
}

/**
 * Fills all forms in the given tab.
 * Tries every frame first; if any frame is inaccessible (e.g. cross-origin
 * iframes not covered by activeTab), falls back to the top frame only.
 * @param {number} tabId
 */
async function fillTab(tabId) {
  if (typeof tabId !== 'number') return { ok: false, error: 'No active tab found.' };
  const settings = await getSettings();
  try {
    return aggregateResults(await injectAndRun({ tabId, allFrames: true }, settings));
  } catch (allFramesError) {
    try {
      return aggregateResults(await injectAndRun({ tabId, frameIds: [0] }, settings));
    } catch (error) {
      console.warn('[LinguaFill] Fill failed', allFramesError, error);
      return { ok: false, error: friendlyError(error) };
    }
  }
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

/** Short-lived per-tab badge feedback ("8", "0", "!"). */
async function showBadge(tabId, result) {
  if (typeof tabId !== 'number') return;
  const text = !result.ok ? '!' : String(result.filled);
  const color = !result.ok ? BADGE_COLORS.error : result.filled ? BADGE_COLORS.ok : BADGE_COLORS.empty;
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), BADGE_TIMEOUT_MS);
  } catch {
    /* Tab may have closed — badge is cosmetic. */
  }
}

async function fillAndReport(tabId) {
  const result = await fillTab(tabId);
  await showBadge(tabId, result);
  return result;
}

/* ------------------------------------------------------------------ */
/* Keyboard shortcut                                                    */
/* ------------------------------------------------------------------ */

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== COMMANDS.FILL_FORM) return;
  const tabId = tab?.id ?? (await getActiveTabId());
  await fillAndReport(tabId);
});

/* ------------------------------------------------------------------ */
/* Message routing                                                      */
/* ------------------------------------------------------------------ */

const handlers = {
  async [MESSAGES.FILL_ACTIVE_TAB]() {
    return fillAndReport(await getActiveTabId());
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only accept messages from our own extension pages.
  if (sender.id !== chrome.runtime.id) return false;
  const handler = handlers[message?.type];
  if (!handler) return false;
  handler(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: friendlyError(error) }));
  return true; // keep the channel open for the async response
});
