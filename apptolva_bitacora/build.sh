#!/bin/bash

if [ -n "$FIREBASE_API_KEY" ]; then
  sed -i "s|__FIREBASE_API_KEY__|$FIREBASE_API_KEY|g" index.html
  sed -i "s|__FIREBASE_API_KEY__|$FIREBASE_API_KEY|g" bitacora_master.html
  sed -i "s|__FIREBASE_API_KEY__|$FIREBASE_API_KEY|g" admin.html
else
  echo "Warning: FIREBASE_API_KEY is not set."
fi

if [ -n "$ADMIN_EMAILS" ]; then
  sed -i "s|__ADMIN_EMAILS__|$ADMIN_EMAILS|g" admin.html
else
  echo "Warning: ADMIN_EMAILS is not set."
fi

echo "Build script completed."
