# Chrome Web Store — Copy-Paste Submission Guide (LinguaFill)

Bu dosya Chrome Web Store Developer Dashboard'daki alanlara doğrudan yapıştırabileceğin hazır metinleri içerir.

---

## 1. Store Listing (Mağaza Sayfası)

### Title (manifest.json içinde tanımlı)
`LinguaFill — Localized Form Filler`

### Summary (manifest.json description — 132 karakter altı)
`Fills forms with realistic, context-aware mock data localized to your browser language.`

### Description (Store Listing → Description kutusuna yapıştır)

```text
LinguaFill is a fast, privacy-first form filler for developers, QA engineers, and product designers. Instead of filling inputs with random gibberish or mismatched data, LinguaFill generates a single coherent persona per run—localized to your browser language (Turkish, English, or German)—and populates modern web forms in one click.

WHY LINGUAFILL?
• Coherent Personas: First name, last name, username, email address, gender, birth date, age, city, district, postal code, and phone area code all belong to the same synthetic identity. Password and confirm-password fields always receive identical values.
• Checksum-Valid Identifiers: Generates algorithmically valid Turkish National IDs (11-digit T.C. Kimlik No), Turkish Tax IDs (10-digit VKN), US SSN/EIN formats, German IDs, ISO 13616 Mod-97 IBANs (TR, GB, DE), and Luhn-valid sandbox test payment cards.
• Cascading & Dynamic Forms: Fills parent dropdowns first (e.g., City / Province), waits for DOM updates via MutationObserver, and automatically fills newly unlocked dependent fields (e.g., District / State).
• SPA & Modern UI Ready: Writes through native HTML prototype value setters and dispatches realistic FocusEvent, InputEvent, KeyboardEvent, and PointerEvent sequences so React, Vue, Angular, input masks (IMask, Inputmask, Cleave), rich-text editors (contenteditable), and ARIA comboboxes update their internal state properly.
• Smart Validation Recovery: Checks HTML5 constraint validation (pattern, min/max, maxlength) after filling and automatically retries alternative formats or synthesizes values matching the field's regex pattern.
• Safe Consent Handling: Automatically ticks required agreement/terms checkboxes while leaving optional marketing/newsletter opt-ins unticked by default, and skips anti-bot honeypots, search bars, and OTP fields.

KEYBOARD SHORTCUTS
• Fill all forms on the active page: Alt+Shift+F
• Open the LinguaFill popup: Alt+Shift+L
(Shortcuts can be customized anytime at chrome://extensions/shortcuts)

GRANULAR CONTROLS IN THE POPUP
• Data Language: Auto (follows browser locale), Türkçe (TR), English (US), or Deutsch (DE)
• Live Persona Preview: Inspect or shuffle the sample persona before filling
• Per-Field Toggles: Enable or disable any of the 22 semantic field categories individually
• Behavior Switches: Overwrite filled fields, highlight filled controls, check consent boxes, accept marketing opt-ins, fill rich editors & ARIA widgets, follow dependent fields, or use RFC 2606 safe email domains (@example.com)

100% OFFLINE & PRIVATE BY DESIGN
LinguaFill runs entirely inside your browser. All mock datasets and generators are bundled locally with the extension. It makes zero network requests, uses no analytics or telemetry, and never reads, stores, or transmits the content of the forms you fill. Only your UI preferences are saved in chrome.storage.
```

### Category & Language
- **Category:** `Developer Tools`
- **Language:** `English`
- **Mature content:** `No`

### Graphic Assets (Yüklenecek Görseller)
- **Store icon (128×128):** `assets/icons/icon128.png` *(96×96 artwork + 16 px şeffaf kenar)*
- **Screenshots (1280×800, 24-bit PNG, no alpha):**
  1. `store/screenshots/screenshot-1.png`
  2. `store/screenshots/screenshot-2.png`
- **Small promo tile (440×280, no alpha):** `store/screenshots/promo-small-440x280.png`
- **Marquee promo tile (1400×560, no alpha):** `store/screenshots/promo-marquee-1400x560.png`

---

## 2. Privacy Tab (İnceleme Ekibi İçin İngilizce Yanıtlar)

### Single Purpose Description
```text
Fills web forms on the currently active tab with localized, context-aware mock test data when triggered by the user via the popup button or keyboard shortcut.
```

### Permission Justifications

- **`activeTab`**
  ```text
  Grants temporary access to the currently active tab only when the user explicitly clicks "Fill this page" in the popup or presses the Alt+Shift+F keyboard shortcut, allowing the extension to locate and populate form controls on that page without requiring broad host permissions.
  ```

- **`scripting`**
  ```text
  Used with activeTab to inject the form-scanning and mock-data filling script (src/content/content.js) on demand when the user triggers a fill action.
  ```

- **`storage`**
  ```text
  Saves the user's extension preferences (selected data locale, enabled field type toggles, and behavior switches) in chrome.storage.sync and caches the detected browser locale code in chrome.storage.local. No form data or personal information is ever stored.
  ```

> **Not (`host_permissions` hakkında):** Uzantıda hiçbir `host_permissions` (`<all_urls>` vb.) **yoktur**; yalnızca `activeTab` + `scripting` kullanılır. `manifest.json` içindeki `web_accessible_resources` ise içerik betiğinin kendi ES modüllerini (`src/generators/*.js`, `src/locales/*.js`) dinamik `import()` ile yükleyebilmesi içindir ve ekstra izin uyarısı tetiklemez.

### Remote Code
- Seçim: **`No, I am not using remote code`**
- (Gerekirse açıklama): `All JavaScript modules and localized mock datasets are bundled inside the extension package. The extension makes no external network requests.`

### Data Usage (Veri Kullanımı)
- **What user data do you plan to collect from users now or in the future?**
  Hiçbir kutuyu **işaretleme** (hepsi boş kalacak — uzantı hiçbir kullanıcı verisi toplamaz).
- **Certifications (Alttaki 3 onay kutusu):**
  - [x] *I do not sell or transfer user data to third parties, outside of the approved use cases*
  - [x] *I do not use or transfer user data for purposes that are unrelated to my item's single purpose*
  - [x] *I do not use or transfer user data to determine creditworthiness or for lending purposes*

---

## 3. Test Instructions (İnceleme Ekibi İçin — "Additional fields" / "Test instructions")

```text
No account, login, or external server is required to test LinguaFill:

1. Open any web page containing a form (for example, an onboarding, checkout, or contact form, or the bundled demo.html file in the repository).
2. Click the LinguaFill toolbar icon to open the popup (or press Alt+Shift+L).
3. Optionally select a data language (Auto, Türkçe, English, or Deutsch) and preview/shuffle the generated persona.
4. Click the "Fill this page" button (or press Alt+Shift+F directly on the page).
5. All visible, editable form inputs, dropdowns, radio groups, and required consent checkboxes on the active tab are immediately populated with coherent mock data and briefly outlined in purple.
```
