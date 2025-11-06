#! /bin/bash
set -euo pipefail

# Get absolute paths to ensure consistency regardless of CWD
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "$SCRIPT_DIR/../sources" && pwd)"
DST="$(cd "$SCRIPT_DIR/../web" && pwd)"
TOTAL="$SRC/total.gpkg"
rm -f "$TOTAL"
rm -f "$DST/crosses.geojson"
rm -f "$DST/zonas.geojson"
rm -f "$DST/calles.geojson"
rm -f "$DST/objects.geojson"
rm -f "$DST/parquimetros.geojson"

# https://geoportal.madrid.es/IDEAM_WBGEOPORTAL/dataset.iam?id=9506daa5-e317-11ec-8359-60634c31c0aa

# Import direct shapefiles from sources/
ogr2ogr -f gpkg $TOTAL "$SRC/Barrios_Zona_SER.shp" -nln Limite_Barrios_Zona_SER
ogr2ogr -f gpkg -append $TOTAL "$SRC/Parquimetros.shp" -nln PARQUIMETROS
ogr2ogr -f gpkg -append $TOTAL "$SRC/Bandas_de_Aparcamiento.shp" -nln BANDAS_DE_APARCAMIENTO

ogrinfo $TOTAL -sql "ALTER TABLE Limite_Barrios_Zona_SER ADD COLUMN zona Text"
ogrinfo $TOTAL -sql "ALTER TABLE Limite_Barrios_Zona_SER ADD COLUMN name Text"
ogrinfo $TOTAL -dialect SQLite -sql "UPDATE Limite_Barrios_Zona_SER SET zona = CODDIS||CODBAR"
ogrinfo $TOTAL -dialect SQLite -sql "UPDATE Limite_Barrios_Zona_SER SET name = zona||' - '||NOMBAR"

ogrinfo $TOTAL -sql "ALTER TABLE PARQUIMETROS ADD COLUMN zona Text"
ogrinfo $TOTAL -sql "ALTER TABLE PARQUIMETROS ADD COLUMN description Text"
# Note: Parquimetros shapefile only has MATRICULA; enrichment from CSV would require separate join
ogrinfo $TOTAL -dialect SQLite -sql "UPDATE PARQUIMETROS SET description = 'Parquímetro: ' || MATRICULA"

ogrinfo $TOTAL -sql "ALTER TABLE BANDAS_DE_APARCAMIENTO ADD COLUMN description Text"
ogrinfo $TOTAL -dialect SQLite -sql "UPDATE BANDAS_DE_APARCAMIENTO SET description = 'Aparcamiento: ' || Bateria_Li || '<br>Plazas: ' || Res_NumPla  || '<br>Color: ' || Color"


# https://spatialthoughts.com/2015/07/12/ogr-spatial-join/
# https://www.gaia-gis.it/gaia-sins/spatialite-sql-4.2.0.html
ogr2ogr $DST/zonas.geojson $TOTAL -t_srs EPSG:4326 -lco COORDINATE_PRECISION=7 Limite_Barrios_Zona_SER -nln zonas
ogr2ogr $DST/parquimetros.geojson $TOTAL -t_srs EPSG:4326 -lco COORDINATE_PRECISION=7 PARQUIMETROS -nln data
ogr2ogr $DST/calles.geojson $TOTAL -sql "SELECT b.*, l.zona from BANDAS_DE_APARCAMIENTO b, Limite_Barrios_Zona_SER l WHERE ST_INTERSECTS(b.geom, l.geom)" -dialect SQLITE -t_srs EPSG:4326 -lco COORDINATE_PRECISION=7 -nln data
ogr2ogr -f GeoJSON -append $DST/objects.geojson $DST/parquimetros.geojson
ogr2ogr -f GeoJSON -append -addfields $DST/objects.geojson $DST/calles.geojson

# crosses: están en dos zonas!
ogr2ogr $DST/crosses.geojson $TOTAL -sql "SELECT b.*, l.zona from BANDAS_DE_APARCAMIENTO b, Limite_Barrios_Zona_SER l WHERE ST_CROSSES(b.geom, l.geom)" -dialect SQLITE -t_srs EPSG:4326 -lco COORDINATE_PRECISION=7 -nln crosses
