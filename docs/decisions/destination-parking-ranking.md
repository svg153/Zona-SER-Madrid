# ADR / Discovery: búsqueda por destino y recomendaciones de aparcamiento

- Estado: propuesta validada para MVP
- Fecha: 2026-10-06
- Issue: #30
- Parent: #18

## Decisión

Mantener el mapa en **GitHub Pages** y construir el primer recomendador como lógica cliente sobre los GeoJSON ya generados.

El MVP no intentará producir una única puntuación opaca ni prometer "la mejor plaza". Devolverá recomendaciones explicables por estrategia:

1. **más barata con coste conocido** para la duración solicitada;
2. **más cercana al destino** entre las alternativas legalmente compatibles;
3. **Park & Ride desde origen**, solo cuando el usuario aporte un origen.

Las recomendaciones son estrategias y ubicaciones conocidas, no disponibilidad garantizada.

## Por qué el origen es necesario para Park & Ride

Un destino por sí solo no permite decidir qué disuasorio tiene sentido.

Para un usuario que entra desde Rivas, por ejemplo, un aparcamiento al oeste de Madrid puede quedar relativamente cerca del destino en línea recta y ser, sin embargo, una mala opción de acceso. El Park & Ride depende del corredor de entrada y después de la conexión de transporte público.

Por tanto:

- sin origen, los disuasorios se muestran en el mapa pero **no se proclaman como el mejor Park & Ride**;
- con origen, el MVP puede hacer una primera ordenación heurística por proximidad al origen;
- la ruta real en coche + transporte se delega a un proveedor de navegación mediante enlace externo hasta que exista routing multimodal fiable.

## Geocoding: reutilizar Leaflet Control Geocoder

No se implementará un cliente Nominatim propio.

Se reutilizará **Leaflet Control Geocoder**, que ya integra OSM/Nominatim y en su versión actual incorpora específicamente:

- caché de consultas repetidas;
- límite de una petición por segundo para el servicio público;
- rechazo de autocomplete con Nominatim para respetar su política de uso;
- posibilidad de cambiar de proveedor en el futuro.

Repositorio:

https://github.com/perliedman/leaflet-control-geocoder

La búsqueda será explícita al enviar el formulario, no autocomplete.

Además, el usuario siempre podrá seleccionar el destino directamente sobre el mapa. Así, si el geocoder falla o cambia de política, la aplicación sigue siendo útil.

## Política Nominatim para este MVP

El servicio público de Nominatim:

- limita el uso a un máximo absoluto de 1 petición/s;
- exige Referer/User-Agent identificable;
- prohíbe autocomplete client-side;
- exige atribución.

El control elegido implementa las protecciones principales de caché/rate-limit y evita `suggest()`.

Si el tráfico del proyecto creciera o el servicio público dejara de ser apropiado, se cambiará el proveedor o se añadirá una frontera serverless específica. **No se introduce backend ahora.**

## Input del MVP

Obligatorio:

- destino, mediante geocoder o punto del mapa;
- duración estimada.

Opcional:

- hora de llegada;
- origen, mediante búsqueda o geolocalización voluntaria.

No se persisten origen/destino en servidor.

## Datos candidatos

### SER

El ranking solo debe incluir un tipo SER cuando su duración máxima soporte la estancia.

Ejemplos:

- verde no residente: descartar por encima de 2 h;
- azul: descartar por encima de 4 h;
- larga estancia/disuasorio naranja: hasta 12 h y coste conocido de 0,50 €/h según el catálogo actual.

No se interpreta una línea SER como "hay plaza". El resultado debe usar lenguaje como "zona compatible" o "tramo de larga estancia cercano".

### Parkings públicos municipales

Son candidatos de cercanía al destino.

El precio se considera **desconocido** hasta disponer de una fuente estructurada fiable. No se inventa un coste ni se penaliza silenciosamente como si fuese caro.

### Disuasorios municipales y Aparca+T

Se consideran estrategia Park & Ride.

Sin origen:

- visibles;
- filtrables;
- no rankeados como "mejor" disuasorio.

Con origen:

- primera heurística: proximidad al origen/corredor;
- mostrar explícitamente que falta validar la ruta real de transporte.

## Algoritmo

### 1. Filtros duros

Antes de ordenar:

- duración compatible;
- geometría/coordenadas válidas;
- restricciones conocidas que hagan la estrategia imposible.

Las ZBE no se usan como filtro duro sin conocer el vehículo. Se muestran como advertencia.

### 2. Recomendaciones por objetivo

No se mezclan euros, minutos y kilómetros en una puntuación arbitraria.

Se seleccionan candidatos distintos para:

- `cheapest_known`: menor coste calculable; desempate por distancia;
- `closest`: menor distancia al destino;
- `park_ride_from_origin`: disuasorio más próximo al origen entre los compatibles; desempate por cercanía al destino.

Se eliminan duplicados para que una misma alternativa no ocupe tres tarjetas.

### 3. Coste

Solo se calcula cuando la regla es estructurada y verificable.

Para larga estancia actual:

`coste = duración × 0,50 €`

respetando su límite de 12 h.

El motor ya admite `fixedCost`, `costPerHour` y `maxBillableHours` para futuras fuentes.

### 4. Distancia

El prototipo usa Haversine para puntos.

Para tramos SER, la implementación de UI deberá obtener el punto más próximo sobre la línea. En vez de reimplementar geometría compleja, se evaluará usar **Turf `nearestPointOnLine`** o preprocesar puntos representativos en CI. La decisión se toma en el issue de implementación según coste de bundle/rendimiento.

## Transporte público

No se implementa routing multimodal dentro del MVP.

Motivos:

- es una dependencia significativamente mayor que el ranking de parking;
- elegir un disuasorio correctamente requiere origen, horarios y red;
- no debe bloquear el valor de "parking cerca del destino".

Primera versión:

- recomendar Park & Ride solo como estrategia;
- ofrecer enlace de navegación/transporte para verificar el trayecto;
- diseñar routing multimodal como evolución separada si existe una fuente/servicio estable.

## ZBE

No se pide matrícula ni distintivo ambiental.

Si un candidato o destino intersecta una capa ZBE/ZBEDEP:

- mostrar advertencia;
- enlazar la fuente oficial;
- no afirmar "puedes/no puedes entrar" sin datos del vehículo.

## Prototipo

Se añade `web/parking-ranking.js` como núcleo puro, todavía sin conectarlo a la UI.

El prototipo:

- calcula distancias Haversine;
- aplica duración como filtro duro;
- calcula costes únicamente cuando son conocidos;
- produce recomendaciones explicables;
- requiere origen antes de recomendar Park & Ride.

`tests/test_parking_ranking.js` cubre estos comportamientos.

## Frontera de arquitectura

### GitHub Pages

Suficiente para:

- formulario;
- punto en mapa;
- geocoding submit-only;
- ranking;
- cálculo de distancia/coste;
- advertencias ZBE;
- enlaces externos de navegación.

### Serverless

No requerido para el MVP de #30.

Solo se reconsidera para:

- geocoder que exija clave/secreto;
- routing multimodal con credenciales;
- proxy necesario por CORS;
- límites de uso incompatibles con navegador.

La ocupación en tiempo real sigue su frontera separada definida por #29/#42.

## Degradación

Si falla el geocoder:

- el mapa sigue funcionando;
- el destino puede seleccionarse manualmente;
- las capas existentes siguen disponibles.

Si falta coste:

- se muestra "precio no disponible";
- el candidato puede ser "más cercano";
- no puede ganar "más barato conocido".

Si falta origen:

- Park & Ride no se presenta como recomendación óptima;
- se explica que añadir origen permite comparar esa estrategia.

## No objetivos

- disponibilidad garantizada de plazas SER;
- navegación turn-by-turn;
- routing multimodal propio;
- reserva de parkings privados;
- cálculo exhaustivo de tarifas variables SER;
- persistencia de búsquedas;
- perfil permanente de vehículo.

## Siguientes issues

La implementación se puede separar para paralelizar:

1. selector de destino/geocoder + selección manual de mapa;
2. motor local de candidatos/ranking y geometría SER;
3. panel de recomendaciones e integración final.

El punto 3 depende de los dos primeros y de que #47 haya restaurado el pipeline de datos.
