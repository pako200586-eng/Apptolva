#!/bin/bash
set -e

if [ -z "$FIREBASE_STAGING_CONFIG_JSON" ] || [ -z "$FIREBASE_PRODUCTION_CONFIG_JSON" ]; then
  echo "Error: configura FIREBASE_STAGING_CONFIG_JSON y FIREBASE_PRODUCTION_CONFIG_JSON en el entorno de build." >&2
  exit 1
fi

node js/generate-firebase-config.js

../node_modules/.bin/esbuild js/firebase-sdk-entry.js \
  --bundle \
  --format=esm \
  --target=es2020 \
  --minify \
  --outfile=js/firebase-sdk.js

echo "Build script completed."
