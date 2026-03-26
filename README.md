# Zona-SER-Madrid

Visor web de la zona SER de Madrid con:

- Zonas SER (polígonos)
- Bandas/plazas de aparcamiento por color
- Parquímetros

Los datos se generan automáticamente desde fuentes oficiales del Ayuntamiento de Madrid.

## 🌐 Visor web

Si GitHub Pages está activado en este repositorio, el visor se publica en:

`https://<owner>.github.io/Zona-SER-Madrid/`

También puedes abrirlo en local con `bash run.sh`.

## ⚡ Inicio rápido

### Opción A: local (instala dependencias del sistema)

```bash
git clone https://github.com/<owner>/Zona-SER-Madrid.git
cd Zona-SER-Madrid
bash setup.sh
bash run.sh
```

### Opción B: Docker (recomendada)

```bash
git clone https://github.com/<owner>/Zona-SER-Madrid.git
cd Zona-SER-Madrid
bash scripts/docker-run.sh
bash run.sh
```

`run.sh` abre el visor en `http://127.0.0.1:8000/index.html`.

## 🗺️ Origen de los datos

Fuente oficial: [Servicio de Estacionamiento Regulado (SER)](https://geoportal.madrid.es/IDEAM_WBGEOPORTAL/dataset.iam?id=9506daa5-e317-11ec-8359-60634c31c0aa)

Pipeline de datos:

1. Descarga de bandas de aparcamiento (SHP)
2. Descarga de barrios y parquímetros (REST API)
3. Conversión y enriquecimiento con GDAL/OGR
4. Generación de `web/*.geojson`

> Nota: la carpeta `sources/` se usa como área temporal durante el proceso y se limpia al final de cada actualización.

## 🔄 Actualización de datos

- Script principal: `scripts/update-data.sh`
- Ejecución semanal automática: lunes a las 02:00 UTC (GitHub Actions)
- Si hay cambios en `web/*.geojson`, se crea una PR automática

## 🚀 Automatización y despliegue

Workflows incluidos:

- `Weekly Data Update`: actualiza datos y abre PR si hay cambios
- `Deploy to GitHub Pages`: publica `web/` al hacer push a `master`

## Estructura del proyecto

- `web/`: visor Leaflet + GeoJSON generados
- `src/`: transformación geoespacial (`process_shp.sh`)
- `scripts/`: utilidades de actualización local/Docker
- `.github/workflows/`: automatización CI/CD

## Aviso legal

Este proyecto es de consulta y no sustituye la información oficial con validez jurídica. Para uso normativo o sancionador, consulta siempre fuentes oficiales del Ayuntamiento de Madrid.

## Licencia

Todo el contenido original de este repositorio está bajo [BSD-3-Clause](LICENSE).
