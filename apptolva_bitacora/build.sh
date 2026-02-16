#!/bin/bash

# Replace placeholders with environment variables in index.html
if [ -n "$GOOGLE_AI_API_KEY" ]; then
  sed -i "s|__GOOGLE_AI_API_KEY__|$GOOGLE_AI_API_KEY|g" index.html
else
  echo "Warning: GOOGLE_AI_API_KEY is not set."
fi

if [ -n "$FIREBASE_API_KEY" ]; then
  sed -i "s|__FIREBASE_API_KEY__|$FIREBASE_API_KEY|g" index.html
  sed -i "s|__FIREBASE_API_KEY__|$FIREBASE_API_KEY|g" bitacora_master.html
else
  echo "Warning: FIREBASE_API_KEY is not set."
fi

echo "Build script completed."
