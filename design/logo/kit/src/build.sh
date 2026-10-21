#!/usr/bin/env bash
# Regenerates the whole kit in ../final from the generators in this folder.
#   PY    python with shapely, fonttools, brotli, uharfbuzz
#   FONT  Inter SemiBold (e.g. @fontsource/inter/files/inter-latin-600-normal.woff2)
#   SKILL folder with the logo-design scripts (export_variants.py, render_png.py)
set -euo pipefail
cd "$(dirname "$0")"
: "${PY:?set PY}" "${FONT:?set FONT}" "${SKILL:?set SKILL}"
OUT=../final
BLUE="#007AFF"; INK="#1D1D1F"

rm -rf "$OUT" && mkdir -p "$OUT"/{svg,png,web,glass/png}

"$PY" symbol.py "$OUT/svg"
"$PY" lockups.py "$FONT" "$OUT/svg"
mv "$OUT"/svg/logo-horizontal-glass-*.svg "$OUT/glass/"
"$PY" glass.py "$OUT/glass"

python3 "$SKILL/export_variants.py" "$OUT/svg/symbol-color.svg" --name symbol --out-dir "$OUT/svg" \
  --title "Tokens to Code" --mono "$BLUE" --mono "$INK" --icon-bg "#FFFFFF" --icon-fg keep \
  --icon-scale 0.72 --favicon-source "$OUT/svg/symbol-small-color.svg" --only white mono square favicon app-icon
python3 "$SKILL/export_variants.py" "$OUT/svg/symbol-color.svg" --name symbol --out-dir "$OUT/web" \
  --title "Tokens to Code" --icon-bg "#FFFFFF" --icon-fg keep --icon-scale 0.72 \
  --favicon-source "$OUT/svg/symbol-small-color.svg" --web-icons --only favicon app-icon

R="python3 $SKILL/render_png.py"
png() {  # svg out width
  local vb w h
  vb=$(grep -o 'viewBox="[^"]*"' "$1" | head -1 | tr -d '"' | cut -d= -f2)
  w=$(echo "$vb" | cut -d' ' -f3); h=$(echo "$vb" | cut -d' ' -f4)
  $R "$1" -o "$2" --width "$3" --height "$(python3 -c "print(round($3*$h/$w))")" > /dev/null
}

for f in "$OUT"/svg/logo-*.svg; do png "$f" "$OUT/png/$(basename "$f" .svg).png" 1600; done
for f in symbol-color symbol-black symbol-white; do png "$OUT/svg/$f.svg" "$OUT/png/$f.png" 1024; done
for n in 128 512; do png "$OUT/svg/icon-tile.svg" "$OUT/png/plugin-icon-flat-$n.png" $n; done

for v in icon-glass icon-glass-dark; do
  for n in 128 512 1024; do png "$OUT/glass/$v.svg" "$OUT/glass/png/$v-$n.png" $n; done
done
for f in symbol-glass-on-dark symbol-glass-on-light; do png "$OUT/glass/$f.svg" "$OUT/glass/png/$f-1024.png" 1024; done
for f in logo-horizontal-glass-on-dark logo-horizontal-glass-on-light; do png "$OUT/glass/$f.svg" "$OUT/glass/png/$f.png" 1600; done

echo "kit written to $OUT"
