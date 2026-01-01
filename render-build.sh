#!/usr/bin/env bash
set -o errexit

echo "Instalando dependencias..."
npm install

echo "Instalando chrome-headless-shell..."
npx @puppeteer/browsers install chrome-headless-shell@stable

echo "Listo: chrome-headless-shell instalado"
