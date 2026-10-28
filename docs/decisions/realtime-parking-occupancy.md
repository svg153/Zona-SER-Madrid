# ADR: ocupación de parkings en tiempo real

- Estado: aceptado
- Fecha: 2026-09-24
- Issue: #29

## Decisión

Mantener la aplicación principal en **GitHub Pages** y, si se implementa la ocupación en tiempo real, añadir únicamente una **función serverless mínima** que actúe como adaptador del servicio municipal de aparcamientos.

No se migra la aplicación completa a Vercel.

La función serverless debe:

1. consultar la interfaz pública municipal de información de aparcamientos;
2. normalizar la respuesta a JSON pequeño y estable;
3. devolver cabeceras CORS para el origen de GitHub Pages;
4. aplicar timeout, caché corta y manejo explícito de errores;
5. no almacenar históricos ni datos de usuarios.

## Por qué

### La fuente en tiempo real existe y no requiere credenciales

El Ayuntamiento publica el conjunto `50027-0-aparcamientosocupacionyservicios`, con frecuencia de actualización declarada como tiempo real. La documentación describe aparcamientos rotacionales públicos y privados adheridos voluntariamente y expone ocupación, plazas, accesos, horarios, tarifas y servicios.

Fuente del dataset:

https://datos.madrid.es/dataset/50027-0-aparcamientosocupacionyservicios

WSDL actual publicado:

https://servayto.madrid.es/MTPAR_WSINFO/InfoParking?wsdl

La documentación técnica municipal también define una interfaz REST JSON con operaciones `listParking` y `detailParking`. La documentación histórica usa el host `webmint`; consumidores públicos actuales muestran el equivalente bajo `servayto`.

Un consumidor público de referencia, `madrono-ucm/madronoTFM`, ha probado el servicio sin autenticación ni API key y normaliza:

- `parking_id`
- `name`
- `address`
- `latitude`
- `longitude`
- `free_spaces`
- `measured_at`
- `total_spaces`, obtenido mediante detalle

Referencia:

https://github.com/madrono-ucm/madronoTFM/blob/2e93c3037eaf9cd5217c16b738259b31c48e90ab/ingesta/capturas/aparcamientos_madrid.py

### El DataStore CKAN no es una base fiable para el frontend

La página del recurso muestra de forma automática ejemplos de CKAN Data API y JSONP para:

`50027-0-aparcamientosocupacionyservicios-api`

Sin embargo, el propio enlace de ejemplo `datastore_search` devuelve actualmente HTTP 404. Por tanto, la presencia del ejemplo JSONP en la interfaz del portal no demuestra que el recurso de ocupación esté realmente disponible a través de CKAN DataStore.

No se debe construir la funcionalidad sobre ese endpoint mientras siga en ese estado.

### GitHub Pages no puede resolver de forma robusta la frontera actual

La interfaz REST municipal es una buena candidata para consumo desde servidor, pero en esta investigación no se ha podido demostrar una política CORS estable para consumo directo desde `https://svg153.github.io`.

La interfaz SOAP requiere además peticiones POST y cabeceras específicas. Aunque es pública, no es una frontera adecuada para acoplar directamente al navegador.

Depender de CORS no documentado convertiría una ventaja de GitHub Pages en un punto de fallo en runtime.

## Alternativas evaluadas

### A. Fetch directo desde GitHub Pages

No adoptado por ahora.

Ventajas:

- cero infraestructura adicional;
- latencia mínima;
- no requiere secretos.

Problema bloqueante:

- no existe evidencia suficiente de CORS estable en el endpoint REST actual.

Se puede reconsiderar si una prueba desde el origen real de GitHub Pages demuestra CORS estable y se añade un test de contrato.

### B. CKAN DataStore / JSONP

No adoptado.

La UI oficial genera un ejemplo JSONP, pero la consulta de ejemplo del propio recurso devuelve 404 actualmente. No se debe interpretar la plantilla genérica de CKAN como disponibilidad real del feed.

### C. Snapshot periódico con GitHub Actions

No adoptado para una etiqueta de "tiempo real".

Podría producir información reciente, pero la programación de Actions no ofrece una cadencia ni puntualidad suficientes para afirmar ocupación en tiempo real. Tampoco merece consumir ejecuciones continuas para un dato que ya dispone de una API operativa.

Un snapshot podría mantenerse solo como fallback futuro si se etiqueta explícitamente con su timestamp y nunca como dato vivo.

### D. Adaptador serverless mínimo

**Adoptado.**

Puede vivir en Vercel Functions, Cloudflare Workers o equivalente. La elección concreta del proveedor pertenece al issue de implementación.

El frontend continúa siendo estático en GitHub Pages.

## Contrato propuesto

Primera versión del adaptador:

`GET /api/parking-occupancy`

Respuesta:

```json
{
  "source": "madrid-info-parking",
  "fetchedAt": "2026-09-24T18:00:00+02:00",
  "parkings": [
    {
      "id": "5",
      "name": "Nuestra Señora del Recuerdo",
      "address": "Calle de la Hiedra",
      "lat": 40.472181,
      "lon": -3.67916,
      "freeSpaces": 431,
      "measuredAt": "2026-08-12T03:17:36+02:00"
    }
  ]
}
```

`totalSpaces` puede incorporarse de forma opcional cuando esté disponible sin convertir cada refresco en un N+1 costoso. La primera entrega no debe bloquearse por porcentaje de ocupación si el listado ya proporciona plazas libres y timestamp.

## Estados de UI

El frontend no debe reducir todos los casos a verde/rojo.

- `available`: existe ocupación reciente y `freeSpaces > 0`.
- `full`: existe ocupación reciente y `freeSpaces == 0`.
- `stale`: existe ocupación pero el timestamp supera el umbral de frescura.
- `no_data`: el parking existe pero no comparte ocupación.
- `unmatched`: registro dinámico que no se ha podido asociar con seguridad a un parking estático.
- `unavailable`: el adaptador o la fuente municipal no responden.

Umbral inicial recomendado: **5 minutos** desde `measuredAt`. Debe ser configurable y validarse con observaciones reales antes de considerarlo contrato permanente.

Nunca se debe mostrar una ocupación antigua como si fuera actual.

## Frecuencia y caché

- caché serverless inicial: 30 a 60 segundos;
- cliente: no consultar con más frecuencia de una vez por minuto;
- refresco solo mientras la capa o el popup correspondiente esté en uso;
- timeout upstream: aproximadamente 5 segundos;
- una caída upstream conserva las capas estáticas y muestra `sin dato`/`servicio no disponible`.

No se necesita persistencia.

## Unión con `parkings-publicos.geojson` (#25)

No se asumirá que el `parking_id` del servicio dinámico coincide con un identificador del dataset estático.

Estrategia:

1. conservar el `parking_id` municipal del feed dinámico;
2. emparejar inicialmente por proximidad geográfica y nombre/dirección normalizados;
3. aceptar coincidencia automática solo cuando sea inequívoca;
4. mantener overrides versionados para discrepancias conocidas;
5. dejar registros no resueltos como `unmatched`, nunca asociarlos por aproximación silenciosa.

La posición es especialmente útil porque `listParking` devuelve coordenadas WGS84. Un ejemplo público real del parking id `5`, Nuestra Señora del Recuerdo, usa `40.472181, -3.679160`.

El issue de implementación debe medir cuántos parkings de `#25` se pueden unir automáticamente y revisar los restantes.

## Cobertura

El servicio dinámico incluye aparcamientos públicos y privados que participan voluntariamente. Esto no significa que el mapa deba convertir automáticamente todos esos registros en el catálogo estático principal.

Primera política:

- enriquecer los parkings estáticos que tengan match fiable;
- no añadir parkings privados a la capa base como efecto lateral de activar ocupación;
- una futura capa específica de "parkings con ocupación" puede mostrar participantes adicionales si se decide explícitamente.

## Privacidad y secretos

No hay datos personales ni credenciales en la fuente.

La función serverless no necesita base de datos ni secreto del Ayuntamiento. Su valor es de compatibilidad y operación:

- CORS controlado;
- normalización;
- caché;
- timeout/retry;
- aislamiento ante cambios de SOAP/REST.

## Coste operativo

La cuenta que aloja el adaptador usa el plan Hobby activo. Vercel describe Hobby como gratuito y orientado a proyectos personales y no comerciales. En Hobby no hay consumo de pago por uso: al superar los límites incluidos, Vercel pausa el uso afectado hasta que se restablezca, en vez de facturar excedentes. No hay método de pago ni presupuesto de equipo configurados en la captura del panel.

Límites de funciones publicados por Vercel, consultados el 28 de octubre de 2026:

- Hasta 1.000.000 de invocaciones incluidas.
- Hasta 100 GB-horas de duración de funciones en la tabla del plan Hobby.
- La documentación de Fluid Compute presenta sus recursos por separado: 4 horas de CPU activa y 360 GB-horas de memoria provisionada incluidas. Revisar el medidor aplicable al modo de cómputo del proyecto en Usage.

Fuentes oficiales: [Hobby plan](https://vercel.com/docs/plans/hobby), [Function usage and pricing](https://vercel.com/docs/functions/usage-and-pricing), [Limits](https://vercel.com/docs/limits).

El plan Hobby solo cubre uso personal y no comercial según las [condiciones de Vercel](https://vercel.com/legal/terms). Si el mapa pasa a formar parte de un servicio comercial, revisar el plan antes de continuar con este hosting.

La caché CDN de 45 segundos reduce las ejecuciones del adaptador cuando la respuesta se reutiliza.

## Observabilidad mínima

Sin almacenar payloads históricos:

- contador de respuestas upstream correctas/fallidas;
- latencia;
- edad máxima de `measuredAt` observada;
- número de parkings con ocupación;
- timestamp del último éxito.

El frontend debe mostrar el timestamp de la ocupación, no solo un número de plazas.

## Criterio para volver a GitHub Pages puro

Eliminar el adaptador serverless solo si se demuestra que el REST municipal actual:

1. responde de forma estable en JSON;
2. permite CORS desde GitHub Pages;
3. mantiene el contrato necesario;
4. ofrece comportamiento de errores y límites razonable.

En ese caso el adaptador puede convertirse en un módulo client-side sin cambiar el resto del mapa.

## Consecuencia arquitectónica

Esta decisión **no es una migración de GitHub Pages a Vercel**.

La arquitectura queda:

```text
Madrid InfoParking REST/SOAP
          |
          v
adaptador serverless pequeño
          |
          | JSON + CORS + cache
          v
GitHub Pages / Leaflet
          |
          +-- parkings-publicos.geojson estático
          +-- ocupación dinámica opcional
```

GitHub Pages sigue siendo el sistema de hosting principal del producto.

## Registro de despliegue y operación

Validación de producción: **2026-10-28**.

- Endpoint: [https://zona-ser-occupancy.vercel.app/api/parking-occupancy](https://zona-ser-occupancy.vercel.app/api/parking-occupancy). Devuelve datos reales de InfoParking.
- Proyecto Vercel: `zona-ser-occupancy`, equipo `svg153's projects`, región de función `cdg1`.
- Despliegue de producción: [dpl_DURsos5mfoaXJcNvvfLYvie7XxgB](https://vercel.com/svg153s-projects/zona-ser-occupancy/DURsos5mfoaXJcNvvfLYvie7XxgB). El proyecto no está conectado a GitHub; la función se publicó mediante despliegue directo y los cambios futuros de `api/parking-occupancy.js` necesitan otro despliegue explícito.
- GitHub Pages tiene configurado el endpoint de producción. La carga de la ficha desde `https://svg153.github.io` comprobó el CORS permitido. El adaptador responde HTTP 403 a un origen no permitido y omite `Access-Control-Allow-Origin`; el test local comprueba esa respuesta.
- Se observó `X-Parking-Cache: HIT` en una respuesta repetida, con la caché configurada a 45 segundos.
- El endpoint devolvió 75 registros: 23 con plazas y 52 sin dato. En el mapa, Almagro mostró 324 plazas libres y Condesa de Gavia mostró “Sin dato de ocupación”. La muestra no contenía medidas stale; la clasificación stale está cubierta por tests.
- En la captura de Usage para Production, últimas 12 horas: 9 invocaciones, 0,00099 GB-horas y 0 % de errores. La captura de Billing muestra Hobby activo, sin presupuesto de equipo ni método de pago. El dato de uso no es un total mensual.

### Rollback

Panel del despliegue actual: [Vercel deployment inspector](https://vercel.com/svg153s-projects/zona-ser-occupancy/DURsos5mfoaXJcNvvfLYvie7XxgB). Para revertir una versión posterior, usar el rollback de Vercel al despliegue de producción anterior o `vercel rollback <deployment-id-or-url>`; Vercel limita Hobby al despliegue de producción inmediatamente anterior. En la validación inicial solo había un despliegue de producción, así que no existía una versión previa a promover. Mantener el código fuente en GitHub como referencia y comprobar que haya un despliegue anterior antes de depender del rollback.

Referencia: [Vercel CLI rollback](https://vercel.com/docs/cli/rollback).
