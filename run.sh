#!/bin/bash
# run.sh - Inicia el servidor web

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$SCRIPT_DIR/web"

# Verificar que existen los GeoJSON
if [ ! -f "$WEB_DIR/zonas.geojson" ]; then
  echo "❌ Error: zonas.geojson no encontrado"
  echo "Ejecuta primero: bash setup.sh"
  exit 1
fi

echo "🚀 Iniciando servidor web..."
echo "📍 http://127.0.0.1:8000/index.html"
echo ""
echo "Press Ctrl+C para detener"
echo ""

cd "$WEB_DIR"
python3 -m http.server 8000
