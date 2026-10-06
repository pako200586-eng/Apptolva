#!/bin/bash
set -e

# La configuración web de Firebase se inyecta en el build desde la variable
# FIREBASE_API_KEY (Netlify > Project configuration > Environment variables).
if [ -z "$FIREBASE_API_KEY" ]; then
  echo "Error: FIREBASE_API_KEY no está configurada; el inicio de sesión no funcionaría." >&2
  exit 1
fi

../node_modules/.bin/esbuild js/firebase-sdk-entry.js \
  --bundle \
  --format=esm \
  --target=es2020 \
  --minify \
  --outfile=js/firebase-sdk.js

for archivo in index.html bitacora_master.html admin.html viewer.html; do
  sed -i "s|__FIREBASE_API_KEY__|$FIREBASE_API_KEY|g" "$archivo"
done

if grep -q "__FIREBASE_API_KEY__" index.html bitacora_master.html admin.html viewer.html; then
  echo "Error: quedaron marcadores __FIREBASE_API_KEY__ sin reemplazar." >&2
  exit 1
fi

echo "Build script completed."
