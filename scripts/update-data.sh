#!/bin/bash
# scripts/update-data.sh - Actualizar datos sin instalar dependencias (reutilizable)
# Uso: bash scripts/update-data.sh
#
# Validaciones:
#   - Feature count mínimo por archivo (detecta geoportal caído)
#   - Schema básico (type, features array)
#   - Diff size razonable (no más de 50% de crecimiento)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Umbral de crecimiento máximo (50%)
MAX_GROWTH_PCT=50

# Feature counts mínimos (si baja de aquí, algo va mal)
MIN_FEATURES=(
  "web/zonas.geojson:1"
  "web/objects.geojson:1"
  "web/calles.geojson:1"
  "web/crosses.geojson:1"
  "web/parquimetros.geojson:1"
)

# Propiedades mínimas que debe tener cada archivo
MIN_PROPS=(
  "web/zonas.geojson:NOMBAR,zona"
  "web/objects.geojson:ID"
  "web/calles.geojson:ID"
  "web/crosses.geojson:ID"
  "web/parquimetros.geojson:ID"
)


# ── Descargar datos ──────────────────────────────────────────────────
echo "⬇️  Descargando bandas de aparcamiento (SHP)..."
mkdir -p sources
cd sources
curl -L "https://geoportal.madrid.es/fsdescargas/IDEAM_WBGEOPORTAL/MOVILIDAD/ZONA_SER/SHP_ZIP.zip" \
-o BARRIOS_APARCAMIENTOS_SER.zip \
--progress-bar
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
curl -sL "https://sigma.madrid.es/hosted/rest/services/GEOPORTAL/SERVICIO_DE_ESTACIONAMIENTO_REGULADO/MapServer/3/query?where=1%3D1&outFields=*&outSR=4326&f=geojson" \
  -o barrios.geojson
echo "✅ Barrios descargados"

echo "⬇️  Descargando parquímetros desde REST API (con paginación)..."
PARQ_URL="https://sigma.madrid.es/hosted/rest/services/GEOPORTAL/SERVICIO_DE_ESTACIONAMIENTO_REGULADO/MapServer/5/query"
PARQ_TOTAL=$(curl -sL "${PARQ_URL}?where=1%3D1&returnCountOnly=true&f=json" | jq '.count')
PARQ_PAGE=2000
PARQ_OFFSET=0
PARQ_TMP=$(mktemp -d)
while [ "$PARQ_OFFSET" -lt "$PARQ_TOTAL" ]; do
  curl -sL "${PARQ_URL}?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultOffset=${PARQ_OFFSET}&resultRecordCount=${PARQ_PAGE}" \
    -o "${PARQ_TMP}/page_${PARQ_OFFSET}.geojson"
  PARQ_OFFSET=$((PARQ_OFFSET + PARQ_PAGE))
done
jq -s '{type: "FeatureCollection", features: [.[].features[]]}' "${PARQ_TMP}"/page_*.geojson > parquimetros_raw.geojson
rm -rf "$PARQ_TMP"
echo "✅ Parquímetros descargados ($PARQ_TOTAL features)"
echo ""

cd ..

# ── Verificar datos descargados ──────────────────────────────────────
echo "🔍 Verificando integridad de datos..."

# SHP de bandas de aparcamiento
SHP="sources/SER_BANDA_APARCAMIENTO.shp"
if [ -f "$SHP" ]; then
  COUNT=$(ogrinfo -ro "$SHP" SER_BANDA_APARCAMIENTO -so 2>/dev/null | grep "Feature Count:" | grep -oE "[0-9]+")
  echo "   ✓ SER_BANDA_APARCAMIENTO.shp: $COUNT features"
else
  echo "   ✗ FALTA: $SHP"
  exit 1
fi

# GeoJSON de barrios y parquímetros
for json in sources/barrios.geojson sources/parquimetros_raw.geojson; do
  if [ -f "$json" ]; then
    COUNT=$(jq '.features | length' "$json" 2>/dev/null || echo "?")
    echo "   ✓ $(basename "$json"): $COUNT features"
  else
    echo "   ✗ FALTA: $json"
    exit 1
  fi
done
echo "✅ Todos los datos intactos"
echo ""

# ── Guardar counts anteriores para comparar ──────────────────────────
declare -A OLD_FEATURES
for entry in "${MIN_FEATURES[@]}"; do
  file="${entry%%:*}"
  if [ -f "$file" ]; then
    count=$(jq '.features | length' "$file" 2>/dev/null || echo "0")
    OLD_FEATURES["$file"]=$count
  fi
done

# ── Procesar y generar GeoJSON ───────────────────────────────────────
echo "⚙️  Procesando datos (esto puede tardar ~2 min)..."
bash src/process_shp.sh > /tmp/process.log 2>&1
if [ $? -eq 0 ]; then
  echo "✅ GeoJSON generado correctamente"
else
  echo "❌ Error procesando datos:"
  cat /tmp/process.log
  exit 1
fi
echo ""

# ── Validaciones post-generación ─────────────────────────────────────
echo "🔍 Validando GeoJSON generado..."
VALID=true

for entry in "${MIN_FEATURES[@]}"; do
  file="${entry%%:*}"
  min="${entry##*:}"
  
  if [ ! -f "$file" ]; then
    echo "   ✗ FALTA: $file"
    VALID=false
    continue
  fi
  
  # Validar JSON parseable
  if ! jq empty "$file" 2>/dev/null; then
    echo "   ✗ JSON inválido: $file"
    VALID=false
    continue
  fi
  
  # Validar type
  ftype=$(jq -r '.type' "$file" 2>/dev/null)
  if [ "$ftype" != "FeatureCollection" ]; then
    echo "   ✗ type != FeatureCollection: $file (got '$ftype')"
    VALID=false
    continue
  fi
  
  # Validar features array
  count=$(jq '.features | length' "$file" 2>/dev/null || echo "0")
  if [ "$count" -lt "$min" ]; then
    echo "   ✗ Features insuficientes: $file ($count < $min)"
    VALID=false
    continue
  fi
  
  # Validar diff size (crecimiento razonable)
  if [ -n "${OLD_FEATURES[$file]+x}" ] && [ "${OLD_FEATURES[$file]}" -gt 0 ]; then
    growth=$(( (count - OLD_FEATURES[$file]) * 100 / OLD_FEATURES[$file] ))
    if [ "$growth" -gt "$MAX_GROWTH_PCT" ]; then
      echo "   ⚠️  Crecimiento excesivo: $file (+${growth}%)"
      # Warning pero no falla - datos reales pueden crecer
    elif [ "$growth" -lt "-$MAX_GROWTH_PCT" ]; then
      echo "   ✗ Caída excesiva: $file (${growth}%)"
      VALID=false
    else
      echo "   ✓ $file: $count features (diff: ${growth:+$growth}%) "
    fi
  else
    echo "   ✓ $file: $count features (nuevo)"
  fi
  
  # Validar propiedades mínimas
  for prop_entry in "${MIN_PROPS[@]}"; do
    prop_file="${prop_entry%%:*}"
    if [ "$prop_file" = "$file" ]; then
      props="${prop_entry##*:}"
      IFS=',' read -ra REQUIRED_PROPS <<< "$props"
      for req in "${REQUIRED_PROPS[@]}"; do
        has=$(jq --arg p "$req" '.features[0].properties | has($p)' "$file" 2>/dev/null || echo "false")
        if [ "$has" != "true" ]; then
          echo "   ✗ Propiedad faltante '$req' en $file"
          VALID=false
        fi
      done
    fi
  done
done

echo ""

if [ "$VALID" = false ]; then
  echo "❌ Validación falló - abortando PR"
  exit 1
fi

echo "✅ Todas las validaciones pasaron"
echo ""

# ── Limpiar archivos temporales ──────────────────────────────────────
echo "🧹 Limpiando archivos temporales..."
rm -f sources/*.zip sources/*.CPG sources/*.cpg sources/*.dbf sources/*.gpkg \
       sources/*.prj sources/*.sbn sources/*.sbx sources/*.shp sources/*.shx \
       sources/*.xml sources/*.geojson
rm -f /tmp/process.log
echo "✅ Archivos temporales eliminados"
echo ""

echo "🎉 Datos actualizados exitosamente!"
