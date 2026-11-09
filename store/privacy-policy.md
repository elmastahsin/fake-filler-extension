# Privacy Policy for LinguaFill — Localized Form Filler

**Effective Date:** November 9, 2026  
**Last Updated:** November 9, 2026

**LinguaFill — Localized Form Filler** ("LinguaFill", "the Extension") is a browser extension for Google Chrome that populates web forms with synthetic, localized test data for software development and quality-assurance testing.

## 1. Summary

- **No Personal Data Collection:** LinguaFill does not collect, read, store, or transmit any personal data, browsing history, or form contents.
- **100% Offline Operation:** All mock datasets and data-generation algorithms are bundled inside the extension package. LinguaFill makes **zero network requests** to any external server.
- **No Analytics or Tracking:** The Extension contains no analytics scripts, telemetry, crash reporters, advertisements, or third-party SDKs.

## 2. How the Extension Works

1. LinguaFill remains inactive until you explicitly trigger it by clicking **"Fill this page"** in the extension popup or pressing the configured keyboard shortcut (`Alt+Shift+F`).
2. When triggered, Chrome grants temporary access to the currently active tab via the `activeTab` permission, and the Extension injects its local content script (`src/content/content.js`) using the `scripting` API.
3. The content script inspects form attributes (`name`, `id`, `type`, `placeholder`, `autocomplete`, `aria-label`, `<label>`) strictly within the local browser memory to classify each field and fill it with synthetic mock data generated on your device.
4. Existing values Entered by you are never read or exfiltrated; by default, fields that already contain a value are skipped unless you explicitly enable the *"Overwrite filled fields"* setting.

## 3. Data Stored Locally (`chrome.storage`)

LinguaFill uses the browser's built-in `chrome.storage` API solely to persist your extension preferences:

- **`chrome.storage.sync` (`settings`):** Stores your chosen data language (`auto`, `tr`, `en`, `de`), per-field enable/disable toggles, and behavior switches (e.g., highlight filled fields, overwrite existing values, safe email domains).
- **`chrome.storage.local` (`detectedLocale`):** Caches the two-letter language code detected from your browser UI language (`tr`, `en`, or `de`).

This configuration data never leaves your browser (except via Google Chrome's own encrypted profile sync if you have Chrome Sync enabled in your browser settings) and can be cleared at any time by uninstalling the Extension.

## 4. Permissions Used

| Permission | Purpose |
| :--- | :--- |
| `activeTab` | Grants temporary, user-initiated access to the active tab when you click "Fill this page" or press the keyboard shortcut. |
| `scripting` | Injects the bundled form-filling script into the active tab on demand. |
| `storage` | Saves your language and field preferences in `chrome.storage`. |

LinguaFill does **not** request broad host permissions (`<all_urls>`) and cannot run automatically in the background on websites you visit.

## 5. Third-Party Services & Data Sharing

LinguaFill does not share, sell, rent, or transfer any data to third parties. No external APIs or remote code are used.

## 6. Changes to This Privacy Policy

If this policy is updated in future versions of the Extension, the revised version will be published in this file with an updated "Last Updated" date.

## 7. Contact

If you have any questions about this Privacy Policy or the Extension's practices, please contact:

- **Developer:** Tahsin Elmas
- **Email:** [tahsinelmasdev@gmail.com](mailto:tahsinelmasdev@gmail.com)
