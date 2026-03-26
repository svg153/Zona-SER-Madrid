#!/bin/bash
# scripts/docker-run.sh
# Actualiza los datos dentro de Docker sin necesitar dependencias del sistema.
# Los ficheros generados en web/ quedan con el usuario del host.
#
# Uso: bash scripts/docker-run.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
IMAGE="zona-ser-update"

echo "🐳 Construyendo imagen Docker..."
docker build -t "$IMAGE" "$PROJECT_DIR"
echo ""

echo "🚀 Ejecutando actualización de datos..."
docker run --rm \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    -v "$PROJECT_DIR:/workspace" \
    "$IMAGE" \
    bash scripts/update-data.sh

echo ""
echo "✅ Ficheros actualizados en web/"
