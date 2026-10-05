# Despliegue del adaptador de ocupación

Issue: #42

## Arquitectura

El mapa sigue desplegado en GitHub Pages.

La única pieza dinámica es `api/parking-occupancy.js`, una función pequeña que:

1. intenta primero el REST público de Madrid InfoParking;
2. usa SOAP `GetListParking` como fallback;
3. normaliza la respuesta;
4. aplica timeout y caché;
5. limita CORS al origen del mapa y a desarrollo local.

No necesita base de datos ni secretos del Ayuntamiento.

## Reutilización

La implementación se apoya en contratos públicos ya usados por proyectos existentes:

- `alvaroocano/ParkingMadrid` para la ruta REST `restInfoParking/listParking` y el esquema `occupations`;
- `madrono-ucm/madronoTFM` para el endpoint SOAP, SOAPAction y campos de `GetListParking`.

Esto evita inventar un contrato alternativo alrededor de InfoParking.

## Proveedor elegido

Para la primera implementación se elige **Vercel Functions**.

Motivos:

- una función Node en `/api` es suficiente;
- no exige migrar el frontend;
- permite cachear la respuesta en CDN mediante `s-maxage`;
- encaja con un repositorio GitHub ya existente;
- no hay estado ni secretos que justifiquen una plataforma más compleja.

Cloudflare Workers sigue siendo una alternativa válida si en operación ofrece mejor coste o latencia, pero no aporta una ventaja suficiente para mantener dos implementaciones.

## Configuración

`vercel.json` limita la función a 10 segundos. El código usa un timeout upstream de 5 segundos.

CORS permitido por defecto:

- `https://svg153.github.io`
- `http://localhost:<puerto>`
- `http://127.0.0.1:<puerto>`

Se pueden añadir orígenes mediante:

`PARKING_OCCUPANCY_ALLOWED_ORIGINS=https://preview.example`

## Endpoint

`GET /api/parking-occupancy`

Respuesta mínima:

```json
{
  "source": "madrid-info-parking",
  "transport": "rest",
  "fetchedAt": "2026-10-06T10:00:00.000Z",
  "parkings": [
    {
      "id": "5",
      "name": "Parking",
      "address": "Calle",
      "lat": 40.4,
      "lon": -3.7,
      "freeSpaces": 42,
      "measuredAt": "2026-10-06T09:59:30.000Z"
    }
  ]
}
```

El cliente nunca interpreta ausencia de dato como plaza libre.

## Caché

La función mantiene una caché de 45 segundos por instancia caliente y devuelve:

`Cache-Control: public, s-maxage=45, stale-while-revalidate=60`

La caché CDN es el mecanismo principal para evitar que cada visitante genere una llamada al Ayuntamiento.

## Frontend

GitHub Pages solo consulta el adaptador cuando se configura:

```html
<script>
window.ZONA_SER_CONFIG = {
  parkingOccupancyEndpoint: "https://<proyecto>.vercel.app/api/parking-occupancy"
};
</script>
```

Si el endpoint no está configurado, el mapa funciona como hasta ahora.

Si el endpoint falla, los parkings estáticos continúan visibles y el popup muestra que la ocupación no está disponible.

## Matching

No se asumen IDs compartidos.

La unión dinámica-estática usa:

- distancia máxima 250 m;
- similitud de nombre/dirección;
- umbrales más estrictos a mayor distancia;
- margen mínimo entre el mejor y segundo candidato.

Los casos ambiguos permanecen sin asociar.

## Estados

- `available`
- `full`
- `stale`
- `no_data`
- `unmatched`
- `unavailable`

El umbral inicial de stale es 5 minutos.

## Despliegue

1. Conectar este repositorio a un proyecto Vercel.
2. Mantener el root del proyecto en la raíz del repositorio.
3. Desplegar la rama principal.
4. Probar `/api/parking-occupancy`.
5. Añadir la URL de producción a `web/runtime-config.js`.
6. Verificar desde `https://svg153.github.io/Zona-SER-Madrid/` que CORS funciona.
7. Comprobar que una caída simulada del endpoint no rompe el mapa.

## Coste y límites

La función está diseñada para un volumen compatible con los tiers de entrada: una llamada municipal por ventana de caché y sin almacenamiento. Los límites concretos del plan deben verificarse en la cuenta elegida en el momento del despliegue, porque pueden cambiar.

## Rollback

El rollback no requiere retirar GitHub Pages.

Basta con dejar vacío `parkingOccupancyEndpoint` en `web/runtime-config.js`. El frontend deja de consultar la función y conserva todas las capas estáticas.
