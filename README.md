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

## Experiencia y rendimiento

El mapa permite filtrar capas, buscar aparcamientos y marcar un destino para ordenar parkings por distancia en línea recta. Las capas y los parámetros compartibles del visor original se conservan. La leyenda empieza plegada. El resultado no comprueba el acceso ZBE ni ofrece ocupación o precio actual.

Para reducir la carga inicial, las geometrías SER se dividen por tipo a partir de `web/objects.geojson`: el visor descarga la capa naranja inicialmente y obtiene el resto solo al activar sus filtros o un barrio. El trabajo de crear y mostrar geometrías se reparte en lotes y usa el renderizador Canvas. El catálogo completo de origen se conserva. La selección de todos los tipos o un barrio aún puede consumir recursos importantes en móviles lentos, especialmente porque los datos reales son voluminosos. Las teselas de IGN son externas y su latencia o disponibilidad no está bajo control de esta aplicación.

Los fragmentos `web/ser-data` se generan al desplegar en Pages y al iniciar `bash run.sh`, siempre a partir del `objects.geojson` correspondiente. Para un servidor estático manual, ejecutar antes `python3 scripts/split_ser_data.py`. No se versionan los fragmentos derivados. Los ficheros de parkings municipales de esta versión son una instantánea descargada el 27/10/2026 desde los recursos oficiales y normalizada con la corrección de la PR #48. Las ZBE se obtuvieron el mismo día mediante `scripts/update-zbe.sh`. PR #48 corrigió las fuentes del updater y el smoke test real del 27/10/2026 generó y validó todas las capas. Sigue pendiente comprobar el flujo completo posterior a la fusión, incluida la creación de PR cuando haya cambios; se mantiene como seguimiento en #47.

### Validación local y CI

- `python3 -m unittest discover -s tests -p 'test_*.py'` verifica, entre otras cosas, que los fragmentos correspondan al catálogo completo y el tamaño inicial de larga estancia.
- `node tests/test_layer_state.js` comprueba la compatibilidad de los enlaces compartidos.
- `python3 scripts/split_ser_data.py && npm ci && npx playwright install chromium && npm run test:browser` ejecuta interacciones móviles con una descarga SER deliberadamente retenida y un fallo recuperable. El test bloquea servicios externos, incluidas las teselas, para que el resultado no dependa de la latencia de un proveedor. No demuestra tiempos reales de carga ni sustituye mediciones con dispositivos, conexiones y proveedores reales.
