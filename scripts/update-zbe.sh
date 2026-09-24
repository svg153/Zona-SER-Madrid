#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="https://sigma.madrid.es/hosted/rest/services/GEOPORTAL/SERVICIO_DE_ESTACIONAMIENTO_REGULADO/MapServer"
CURL=(curl --fail --silent --show-error --location --retry 3 --retry-all-errors)

fetch_layer() {
  local layer_id="$1"
  local output="$2"
  local label="$3"
  local url="${BASE}/${layer_id}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson"

  echo "⬇️  Descargando ${label} (layer ${layer_id})..."
  "${CURL[@]}" "$url" -o "$output"
  jq -e '.type == "FeatureCollection" and (.features | type == "array") and (.features | length > 0)' "$output" > /dev/null
  echo "✅ ${label}: $(jq '.features | length' "$output") features"
}

# Capas de límite a escala detallada del servicio SER oficial.
fetch_layer 62 web/zbe-madrid.geojson "Madrid ZBE"
fetch_layer 61 web/zbedep-centro.geojson "ZBEDEP Distrito Centro"
fetch_layer 60 web/zbedep-plaza-eliptica.geojson "ZBEDEP Plaza Elíptica"
