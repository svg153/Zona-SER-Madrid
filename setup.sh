#!/bin/bash
# setup.sh - Script completo para inicializar el proyecto desde cero

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "================================"
echo "Zona SER Madrid - Setup Completo"
echo "================================"
echo ""

# Instalar dependencias del sistema
echo "📦 Instalando dependencias GDAL..."
sudo apt-get update > /dev/null 2>&1
sudo apt-get install -y gdal-bin curl unzip jq > /dev/null 2>&1
echo "✅ Dependencias instaladas"
echo ""

# Ejecutar actualización de datos
bash scripts/update-data.sh

echo ""
echo "Próximos pasos:"
echo "  1. Iniciar web:   bash run.sh"
echo "  2. Abrir:         http://127.0.0.1:8000/index.html"
echo ""
