#!/usr/bin/env bash
set -o errexit

echo "=== Iniciando build para Puppeteer en Render ==="

# Instalamos dependencias
npm install

# Aseguramos directorio de cache persistente
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
mkdir -p $PUPPETEER_CACHE_DIR

# Instalamos chrome-headless-shell (ligero y compatible)
npx @puppeteer/browsers install chrome-headless-shell@stable

# Copiamos a cache persistente
echo "...Cacheando chrome-headless-shell"
cp -R ~/.cache/puppeteer/chrome-headless-shell/* $PUPPETEER_CACHE_DIR/

echo "=== Build completado: chrome-headless-shell listo ==="
