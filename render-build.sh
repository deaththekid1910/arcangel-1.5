#!/usr/bin/env bash
set -o errexit

# Instalamos dependencias
npm install

# Definimos directorio persistente para cache de Puppeteer
export PUPPETEER_CACHE_DIR=/opt/render/project/.cache/puppeteer

# Instalamos Chrome estable
npx puppeteer browsers install chrome-stable

# Si hay cache previo, lo copiamos (para deploys siguientes)
if [[ -d $PUPPETEER_CACHE_DIR/chrome ]]; then
  echo "Copiando cache de Chrome existente..."
  cp -R $PUPPETEER_CACHE_DIR/chrome /opt/render/.cache/puppeteer/
else
  echo "Guardando Chrome en cache persistente..."
  mkdir -p $PUPPETEER_CACHE_DIR
  cp -R /opt/render/.cache/puppeteer/chrome $PUPPETEER_CACHE_DIR/
fi

echo "Chrome configurado correctamente para Render"