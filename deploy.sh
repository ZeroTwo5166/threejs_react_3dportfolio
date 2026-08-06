#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/root/threejs_react_3dportfolio"
APP_NAME="portfolio"

cd "$REPO_DIR"

echo "==> Fetching latest master..."
git fetch origin master
git reset --hard origin/master

echo "==> Installing dependencies..."
npm ci

echo "==> Building..."
npm run build

echo "==> Restarting pm2 process..."
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start server.mjs --name "$APP_NAME" --update-env
fi

pm2 save

echo "==> Deploy complete."
