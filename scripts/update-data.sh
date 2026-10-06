#!/bin/bash
# scripts/update-data.sh - Actualizar datos sin instalar dependencias (reutilizable)
# Uso: bash scripts/update-data.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

CURL_COMMON=(--fail --silent --show-error --location --retry 3 --retry-all-errors)

validate_parking_download() {
  local path="$1"
  local label="$2"
  local url="$3"

  if ! jq -e '(.type == "FeatureCollection" and (.features | type == "array")) or ((."@graph" // null) | type == "array")' "$path" > /dev/null 2>&1; then
    echo "❌ Descarga inválida para $label"
    echo "   URL: $url"
    echo "   Se esperaba GeoJSON FeatureCollection o JSON-LD con @graph."
    echo -n "   Inicio de la respuesta: "
    head -c 180 "$path" | tr '\\n' ' '
    echo
    echo "   Diagnóstico del payload:"
    python3 - "$path" <<'PY' || true
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
raw = path.read_bytes()
print("   bytes:", len(raw), "prefix:", repr(raw[:120]))
for encoding in ("utf-8-sig", "latin-1"):
    try:
        text = raw.decode(encoding)
    except UnicodeDecodeError as exc:
        print("   decode", encoding, "ERROR:", exc)
        continue
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        print("   json", encoding, "ERROR:", exc)
        lines = text.splitlines()
        start = max(0, exc.lineno - 3)
        end = min(len(lines), exc.lineno + 2)
        for number in range(start, end):
            print(f"   line {number + 1}: {lines[number][:220]!r}")
        continue
    print("   json", encoding, "OK")
    if isinstance(payload, dict):
        print("   keys:", list(payload.keys())[:20])
        graph = payload.get("@graph")
        print("   @graph type:", type(graph).__name__)
        if isinstance(graph, dict):
            print("   @graph keys:", list(graph.keys())[:20])
    break
PY
    exit 1
  fi
}

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
DISUASORIOS_URL="https://datos.madrid.es/dataset/300531-0-aparcamientos-publicos/resource/300531-2-aparcamientos-publicos-json/download/300531-2-aparcamientos-publicos-json.json"
curl "${CURL_COMMON[@]}" "$DISUASORIOS_URL" -o disuasorios_raw.geojson
validate_parking_download disuasorios_raw.geojson "aparcamientos disuasorios municipales" "$DISUASORIOS_URL"
echo "✅ Aparcamientos disuasorios descargados"

echo "⬇️  Descargando aparcamientos públicos municipales..."
PUBLICOS_URL="https://datos.madrid.es/dataset/202625-0-aparcamientos-publicos/resource/202625-5-aparcamientos-publicos-json/download/202625-5-aparcamientos-publicos-json.json"
curl "${CURL_COMMON[@]}" "$PUBLICOS_URL" -o parkings_publicos_raw.geojson
validate_parking_download parkings_publicos_raw.geojson "aparcamientos públicos municipales" "$PUBLICOS_URL"
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

# Aparca+T no expone actualmente una distribución estable identificable en el nuevo catálogo.
# Se regenera desde el catálogo revisado y falla si lleva más de 120 días sin verificar.
python3 scripts/build_aparcat_geojson.py sources/aparcat.json web/aparcat.geojson --max-age-days 120

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
for geojson in web/zonas.geojson web/objects.geojson web/disuasorios.geojson web/parkings-publicos.geojson web/aparcat.geojson; do
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
