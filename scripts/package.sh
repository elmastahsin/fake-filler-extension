#!/usr/bin/env bash
# Packages only the runtime files required by the Chrome extension into
# dist/linguafill-<version>.zip (excludes store/, scripts/, test/, *.md, .DS_Store).
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(node -p "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')).version")"
OUT_DIR="dist"
OUT_FILE="${OUT_DIR}/linguafill-${VERSION}.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_FILE"

RUNTIME_FILES=(
  manifest.json
  assets/icons/icon16.png
  assets/icons/icon32.png
  assets/icons/icon48.png
  assets/icons/icon128.png
  src/background/background.js
  src/content/content.js
  src/content/domScanner.js
  src/content/fieldRules.js
  src/content/widgets.js
  src/generators/dataGenerator.js
  src/generators/identifiers.js
  src/generators/inputHandlers.js
  src/generators/patternGenerator.js
  src/generators/random.js
  src/locales/index.js
  src/locales/data/de.js
  src/locales/data/en.js
  src/locales/data/tr.js
  src/popup/popup.css
  src/popup/popup.html
  src/popup/popup.js
  src/shared/constants.js
  src/shared/settings.js
  src/shared/textUtils.js
)

zip -q -X "$OUT_FILE" "${RUNTIME_FILES[@]}"
echo "Created ${OUT_FILE} ($(du -h "$OUT_FILE" | awk '{print $1}'))"
unzip -l "$OUT_FILE"
