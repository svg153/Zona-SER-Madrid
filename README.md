# Zona-SER-Madrid

Herramienta para ver online las distintas zonas de la Zona SER de Madrid, sus plazas de aparcamiento por colores y la ubicación de los parquímetros en un mapa.

## 🌐 Visor web

**GitHub Pages:** https://svg153.github.io/Zona-SER-Madrid/

Se actualiza automáticamente cada lunes a las 2:00 UTC con datos del geoportal oficial.

## ⚡ Inicio rápido local

```bash
git clone https://github.com/svg153/Zona-SER-Madrid.git
cd Zona-SER-Madrid
bash setup.sh          # Descarga datos, genera GeoJSON (~2:30 min)
bash run.sh            # Abre http://127.0.0.1:8000/index.html
```

Para más detalles, ver [Quickstart](specs/001-add-missing-ser-zones/quickstart.md)

## Servicio de Estacionamiento Regulado (SER)

Madrid tiene desde hace años limitado el aparcamiento de vehículos dentro de (más o menos) la M-30. Los vecinos pueden aparcar (previo pago de una tarifa) en su zona en las plazas verdes. Así mismo, los tickets de estacionamiento para el resto están limitados para una zona específica y color. Visite la web del ayuntamiento para ver las condiciones de aparcamiento dependiendo del color de la plaza.

Este visor web pretende facilitar la ubicación de las plazas por colores y parquímetros dentro de la Zona SER de Madrid de una forma ágil en un mapa interactivo.

![image](https://user-images.githubusercontent.com/534414/116054093-a0915780-a67b-11eb-8e73-2577726a5d54.png)

## Origen de los datos

Los datos de las zonas, plazas y parquímetros proceden del ["Servicio de Estacionamiento Regulado (SER)"](https://geoportal.madrid.es/IDEAM_WBGEOPORTAL/dataset.iam?id=9506daa5-e317-11ec-8359-60634c31c0aa) del ayuntamiento de Madrid. Los ficheros fuente en formato SHP se encuentran en la carpeta [sources](sources).

Esta web no puede ser usada como fuente inequívoca para temas jurídicos. En ese caso póngase en contacto con el ayuntamiento directamente. Es meramente de consulta, y no está mantenida por el ayuntamiento de Madrid ni por ningún organismo público.

## Visor web

El visor web hecho con [Leaflet](https://leafletjs.com/) muestra inicialmente las 65 zonas marcadas en violeta. Haciendo click en cualquiera de ellas se muestran las plazas de aparcamiento por colores (líneas verdes, azules, rojas, naranjas, etc.) y los parquímetros (puntos negros). Al hacer click en los elementos aparece un diálogo con información del mismo.

- **Plazas verdes**: Residentes con tarifa
- **Plazas azules**: Otros colores y restricciones
- **Plazas rojas**: Zona especial (La Paz)
- **Plazas naranjas**: Ámbitos especiales (Templo de Debod, Cuesta de la Vega)
- **Plazas cyan**: Alta Rotación

No se muestran todas las plazas inicialmente para no ralentizar el navegador. Selecciona solo las zonas que necesites para mejor rendimiento.

## Actualización de datos

La versión actual está hecha el 6 de noviembre de 2025 e incluye los 14 distritos de la zona SER (últimas adiciones: Usera, Comillas en Carabanchel).

## Estructura del proyecto

- **`web/`**: Visor web interactivo con Leaflet y datos GeoJSON
- **`src/`**: Script `process_shp.sh` para convertir datos SHP a GeoJSON
- **`sources/`**: Ficheros SHP descargados del ayuntamiento
- **`specs/`**: Especificaciones y documentación de features

## 🚀 Deployment y Automatización

**GitHub Actions Workflows:**

- **Weekly Data Update** → Cada lunes 02:00 UTC: descarga datos, genera GeoJSON, crea PR
- **Deploy to GitHub Pages** → Al hacer push a `master`: despliega en GitHub Pages

Ver [GITHUB_PAGES.md](GITHUB_PAGES.md) para configuración detallada.

## Licencia

Todo el contenido original de este repositorio está bajo la licencia [BSD-3-Clause](LICENSE).
