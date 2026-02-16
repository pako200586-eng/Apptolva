#!/bin/bash

# AppTolva Build Script for Netlify Deployment
# This script injects environment variables into HTML files
# Environment variables should be configured in Netlify Dashboard

set -e  # Exit on error

echo "Starting AppTolva build process..."

# Change to the directory where the script is located
cd "$(dirname "$0")"

# Verify required environment variables
MISSING_VARS=0

if [ -z "$GOOGLE_AI_API_KEY" ]; then
  echo "❌ ERROR: GOOGLE_AI_API_KEY is not set."
  MISSING_VARS=1
else
  echo "✅ GOOGLE_AI_API_KEY is configured."
fi

if [ -z "$FIREBASE_API_KEY" ]; then
  echo "❌ ERROR: FIREBASE_API_KEY is not set."
  MISSING_VARS=1
else
  echo "✅ FIREBASE_API_KEY is configured."
fi

# Exit if any required variable is missing
if [ $MISSING_VARS -eq 1 ]; then
  echo ""
  echo "❌ Build failed: Missing required environment variables."
  echo "Please configure the environment variables in Netlify Dashboard."
  echo "See DEPLOY_GUIDE.md for detailed instructions."
  exit 1
fi

# Replace placeholders with environment variables in HTML files
echo "Injecting GOOGLE_AI_API_KEY into index.html..."
sed -i "s|__GOOGLE_AI_API_KEY__|$GOOGLE_AI_API_KEY|g" index.html

echo "Injecting FIREBASE_API_KEY into index.html and bitacora_master.html..."
sed -i "s|__FIREBASE_API_KEY__|$FIREBASE_API_KEY|g" index.html
sed -i "s|__FIREBASE_API_KEY__|$FIREBASE_API_KEY|g" bitacora_master.html

# Verify replacements were made
if grep -q "__GOOGLE_AI_API_KEY__" index.html; then
  echo "⚠️  Warning: GOOGLE_AI_API_KEY placeholder still present in index.html"
fi

if grep -q "__FIREBASE_API_KEY__" index.html || grep -q "__FIREBASE_API_KEY__" bitacora_master.html; then
  echo "⚠️  Warning: FIREBASE_API_KEY placeholder still present in HTML files"
fi

echo "✅ Build completed successfully!"
echo "Ready for deployment to Netlify."
