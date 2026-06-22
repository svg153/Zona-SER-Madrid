#!/bin/bash
# setup.sh - Script completo para inicializar el proyecto desde cero

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "================================"
echo "Zona SER Madrid - Setup Completo"
echo "================================"
echo ""

# Instalar dependencias del sistema
echo "📦 Instalando dependencias GDAL..."
if ! command -v sudo >/dev/null 2>&1; then
	echo "❌ No se encontró 'sudo' para instalar dependencias del sistema."
	echo "👉 Alternativa recomendada: bash scripts/docker-run.sh"
	exit 1
fi

sudo apt-get update > /dev/null 2>&1 || {
	echo "❌ Error ejecutando apt-get update."
	echo "👉 Alternativa recomendada: bash scripts/docker-run.sh"
	exit 1
}

sudo apt-get install -y gdal-bin curl unzip jq > /dev/null 2>&1 || {
	echo "❌ No se pudieron instalar dependencias (gdal-bin, curl, unzip, jq)."
	echo "👉 Alternativa recomendada: bash scripts/docker-run.sh"
	exit 1
}

echo "✅ Dependencias instaladas"
echo ""

# Ejecutar actualización de datos
bash scripts/update-data.sh

echo ""
echo "Próximos pasos:"
echo "  1. Iniciar web:   bash run.sh"
echo "  2. Abrir:         http://127.0.0.1:8000/index.html"
echo ""
echo "Alternativa Docker para actualizar datos:"
echo "  bash scripts/docker-run.sh"
echo ""
