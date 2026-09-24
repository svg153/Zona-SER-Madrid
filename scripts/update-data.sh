#!/bin/bash
# scripts/update-data.sh - Actualizar datos sin instalar dependencias (reutilizable)
# Uso: bash scripts/update-data.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

CURL_COMMON=(--fail --silent --show-error --location --retry 3 --retry-all-errors)

# Descargar datos
echo "⬇️  Descargando bandas de aparcamiento (SHP)..."
mkdir -p sources
cd sources
curl "${CURL_COMMON[@]}" \
  "https://geoportal.madrid.es/fsdescargas/IDEAM_WBGEOPORTAL/MOVILIDAD/ZONA_SER/SHP_ZIP.zip" \
  -o BARRIOS_APARCAMIENTOS_SER.zip
echo "✅ ZIP descargado"
echo ""

# Extraer shapefiles
echo "📦 Extrayendo shapefiles..."
unzip -jo BARRIOS_APARCAMIENTOS_SER.zip > /dev/null
rm -f BARRIOS_APARCAMIENTOS_SER.zip
echo "✅ Shapefile extraído: SER_BANDA_APARCAMIENTO.shp"
echo ""

# Descargar barrios y parquímetros desde el servicio REST
echo "⬇️  Descargando barrios SER desde REST API..."
curl "${CURL_COMMON[@]}" \
  "https://sigma.madrid.es/hosted/rest/services/GEOPORTAL/SERVICIO_DE_ESTACIONAMIENTO_REGULADO/MapServer/3/query?where=1%3D1&outFields=*&outSR=4326&f=geojson" \
  -o barrios.geojson
echo "✅ Barrios descargados"

echo "⬇️  Descargando parquímetros desde REST API (con paginación)..."
PARQ_URL="https://sigma.madrid.es/hosted/rest/services/GEOPORTAL/SERVICIO_DE_ESTACIONAMIENTO_REGULADO/MapServer/5/query"
PARQ_TOTAL=$(curl "${CURL_COMMON[@]}" "${PARQ_URL}?where=1%3D1&returnCountOnly=true&f=json" | jq -er '.count | numbers')
PARQ_PAGE=2000
PARQ_OFFSET=0
PARQ_TMP=$(mktemp -d)
while [ "$PARQ_OFFSET" -lt "$PARQ_TOTAL" ]; do
  curl "${CURL_COMMON[@]}" \
    "${PARQ_URL}?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultOffset=${PARQ_OFFSET}&resultRecordCount=${PARQ_PAGE}" \
    -o "${PARQ_TMP}/page_${PARQ_OFFSET}.geojson"
  jq -e '.type == "FeatureCollection" and (.features | type == "array")' \
    "${PARQ_TMP}/page_${PARQ_OFFSET}.geojson" > /dev/null
  PARQ_OFFSET=$((PARQ_OFFSET + PARQ_PAGE))
done
jq -s '{type: "FeatureCollection", features: [.[].features[]]}' "${PARQ_TMP}"/page_*.geojson > parquimetros_raw.geojson
rm -rf "$PARQ_TMP"
echo "✅ Parquímetros descargados ($PARQ_TOTAL features)"
echo ""

# Fuentes oficiales diarias de aparcamientos municipales.
echo "⬇️  Descargando aparcamientos disuasorios municipales..."
DISUASORIOS_URL="https://datos.madrid.es/dataset/300531-0-aparcamientos-publicos/resource/300531-0-aparcamientos-publicos-geo/download/300531-0-aparcamientos-publicos.geo"
curl "${CURL_COMMON[@]}" "$DISUASORIOS_URL" -o disuasorios_raw.geojson
echo "✅ Aparcamientos disuasorios descargados"

echo "⬇️  Descargando aparcamientos públicos municipales..."
PUBLICOS_URL="https://datos.madrid.es/dataset/202625-0-aparcamientos-publicos/resource/202625-4-aparcamientos-publicos-geo/download/202625-0-aparcamientos-publicos.geo"
curl "${CURL_COMMON[@]}" "$PUBLICOS_URL" -o parkings_publicos_raw.geojson
echo "✅ Aparcamientos públicos municipales descargados"
echo ""

cd ..

# Verificar datos descargados
echo "🔍 Verificando integridad de datos..."

SHP="sources/SER_BANDA_APARCAMIENTO.shp"
if [ -f "$SHP" ]; then
  COUNT=$(ogrinfo -ro "$SHP" SER_BANDA_APARCAMIENTO -so 2>/dev/null | grep "Feature Count:" | grep -oE "[0-9]+")
  if [ -z "$COUNT" ] || [ "$COUNT" -le 0 ]; then
    echo "   ✗ SHP sin features válidas: $SHP"
    exit 1
  fi
  echo "   ✓ SER_BANDA_APARCAMIENTO.shp: $COUNT features"
else
  echo "   ✗ FALTA: $SHP"
  exit 1
fi

for json in sources/barrios.geojson sources/parquimetros_raw.geojson; do
  if [ ! -f "$json" ]; then
    echo "   ✗ FALTA: $json"
    exit 1
  fi

  if ! jq -e '.type == "FeatureCollection" and (.features | type == "array")' "$json" > /dev/null; then
    echo "   ✗ ESQUEMA GeoJSON INVÁLIDO: $json"
    exit 1
  fi

  COUNT=$(jq '.features | length' "$json")
  if [ "$COUNT" -le 0 ]; then
    echo "   ✗ SIN FEATURES: $json"
    exit 1
  fi
  echo "   ✓ $(basename "$json"): $COUNT features"
done

# Estas familias se normalizan desde GeoJSON o desde el JSON-LD histórico.
python3 scripts/normalize_parkings.py sources/disuasorios_raw.geojson web/disuasorios.geojson
python3 scripts/normalize_parkings.py \
  sources/parkings_publicos_raw.geojson \
  web/parkings-publicos.geojson \
  --kind municipal_public_parking \
  --dataset-url "https://datos.madrid.es/dataset/202625-0-aparcamientos-publicos" \
  --fallback-name "Aparcamiento público municipal"

echo "✅ Todos los datos intactos"
echo ""

# Procesar y generar GeoJSON
echo "⚙️  Procesando datos..."
if bash src/process_shp.sh > /tmp/process.log 2>&1; then
  echo "✅ GeoJSON generado correctamente"
else
  echo "❌ Error procesando datos:"
  cat /tmp/process.log
  exit 1
fi
echo ""

echo "✓ Verificando GeoJSON generado:"
for geojson in web/zonas.geojson web/objects.geojson web/disuasorios.geojson web/parkings-publicos.geojson; do
  if [ -f "$geojson" ]; then
    COUNT=$(jq '.features | length' "$geojson" 2>/dev/null || echo "?")
    SIZE=$(du -h "$geojson" | cut -f1)
    echo "   ✓ $(basename "$geojson"): $COUNT features ($SIZE)"
  fi
done
echo ""

# Limpiar archivos temporales
echo "🧹 Limpiando archivos temporales..."
rm -f sources/*.zip sources/*.CPG sources/*.cpg sources/*.dbf sources/*.gpkg \
       sources/*.prj sources/*.sbn sources/*.sbx sources/*.shp sources/*.shx \
       sources/*.xml sources/*.geojson
rm -f /tmp/process.log
echo "✅ Archivos temporales eliminados"
echo ""

echo "🎉 Datos actualizados exitosamente!"
