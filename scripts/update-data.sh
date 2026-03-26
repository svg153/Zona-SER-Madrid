#!/bin/bash
# scripts/update-data.sh - Actualizar datos sin instalar dependencias (reutilizable)
# Uso: bash scripts/update-data.sh [--clean-only]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"


# Descargar datos
echo "⬇️  Descargando datos de geoportal.madrid.es..."
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
echo "✅ Shapefiles extraídos"
echo ""

# Borrar ZIP descargado
rm -rf BARRIOS_APARCAMIENTOS_SER.zip

cd ..

# Verificar shapefiles
echo "🔍 Verificando integridad de datos..."
SHAPEFILES=(
  "sources/Barrios_Zona_SER.shp"
  "sources/Parquimetros.shp"
  "sources/Bandas_de_Aparcamiento.shp"
)

for shp in "${SHAPEFILES[@]}"; do
  if [ -f "$shp" ]; then
    COUNT=$(ogrinfo -ro "$shp" "$(basename "$shp" .shp)" -so 2>/dev/null | grep "Feature Count:" | grep -oE "[0-9]+")
    echo "   ✓ $(basename "$shp"): $COUNT features"
  else
    echo "   ✗ FALTA: $shp"
    exit 1
  fi
done
echo "✅ Todos los datos intactos"
echo ""

# Procesar y generar GeoJSON
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

# Verificar salida (solo archivos principales)
echo "✓ Verificando GeoJSON generado:"
for geojson in web/zonas.geojson web/objects.geojson; do
  if [ -f "$geojson" ]; then
    COUNT=$(jq '.features | length' "$geojson" 2>/dev/null || echo "?")
    SIZE=$(du -h "$geojson" | cut -f1)
    echo "   ✓ $(basename "$geojson"): $COUNT features ($SIZE)"
  fi
done
echo ""

# Limpiar archivos temporales
echo "🧹 Limpiando archivos temporales..."
rm -rf sources/*.zip
rm -rf sources/*.CPG
rm -rf sources/*.cpg
rm -rf sources/*.dbf
rm -rf sources/*.gpkg
rm -rf sources/*.prj
rm -rf sources/*.sbn
rm -rf sources/*.sbx
rm -rf sources/*.shp
rm -rf sources/*.shx
rm -rf sources/*.xml
rm -rf /tmp/process.log
echo "✅ Archivos temporales eliminados"
echo ""

echo "🎉 Datos actualizados exitosamente!"
