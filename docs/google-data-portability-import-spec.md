# FECA Google Data Portability Import Spec

Objetivo: importar desde Google una copia de los lugares que el usuario quiere visitar y de los lugares que ya visitó, para mejorar la precisión de recomendaciones en FECA.

## Resumen ejecutivo

La integración recomendada es Google Data Portability API, no un scraping de Google Maps ni una lectura directa de listas compartidas.

Para el caso de uso actual de FECA, el alcance mínimo útil es:

- `https://www.googleapis.com/auth/dataportability.saved.collections`
- `https://www.googleapis.com/auth/dataportability.myactivity.maps`

Scope opcional, solo si luego queremos cubrir el legado de "estrellas":

- `https://www.googleapis.com/auth/dataportability.maps.starred_places`

No mezclar scopes de Data Portability con scopes estándar como `userinfo.email`.

## Por qué este camino

Google Maps expone listas compartidas y guardados dentro de la app de Maps, pero no hay una API pública normal para leer favoritos privados en tiempo real.
Data Portability sí permite pedir una copia de datos del usuario con consentimiento explícito.

## Revisión del backend actual

El backend ya tiene las piezas base para consumir este tipo de import:

- `User` guarda ciudad, lat/lng y preferencias.
- `Place` ya distingue `source = google | manual` y `sourcePlaceId`.
- `Visit` ya representa actividad pasada del usuario.
- `PlaceSave` ya representa lugares guardados por el usuario.
- `PlacesService` y `PlacesRepository` ya resuelven y persisten lugares de Google Places.

Conclusión: no hace falta inventar un modelo paralelo. Hace falta una capa de importación que traduzca la exportación de Google al modelo existente.

## Scope del MVP

### Incluir

- Lugares guardados para "quiero ir" o listas equivalentes.
- Visitas históricas de Maps.
- Normalización y deduplicación contra `Place.sourcePlaceId`.
- Import puntual por usuario con consentimiento explícito.

### Excluir por ahora

- Sincronización en tiempo real.
- Importación de otros productos de Google.
- Uso de identidad Google para login principal de FECA.
- Lectura de listas compartidas de terceros.

## Flujo propuesto

### 1. Conexión

El usuario autenticado en FECA inicia el flujo de importación desde la app.

El backend genera o expone la URL de consentimiento OAuth de Google Data Portability.

### 2. Consentimiento

Google muestra:

- cuenta de Google
- scopes solicitados
- duración del acceso: una vez o por tiempo limitado

Punto importante:

- en estado `Testing`, los tokens expiran a los 7 días aunque el usuario elija 30 o 180 días
- para renovación normal y uso de producción, el cliente OAuth debe estar en `In production`

### 3. Inicio del archivado

Con el token OAuth, el backend llama a `InitiatePortabilityArchive`.

### 4. Polling

El backend consulta `GetPortabilityArchiveState` hasta que el job esté completo.

### 5. Descarga y parseo

El backend descarga los archivos firmados y procesa cada grupo de recursos:

- `saved.collections` para lo guardado / quiero ir
- `myactivity.maps` para visitas

### 6. Persistencia

El backend convierte los datos importados en:

- `PlaceSave` para lugares guardados
- `Visit` para lugares visitados
- `Place` nuevo solo si no existe ya un match razonable

## Reglas de mapeo

### Lugares guardados

Prioridad de mapeo:

1. Si el item tiene URL de Maps y se puede extraer un `googlePlaceId`, resolver o reutilizar el `Place` existente.
2. Si no hay match directo, intentar búsqueda por texto con Google Places.
3. Si sigue sin resolver, dejar el item como importado pendiente de revisión.

Resultado deseado:

- crear `PlaceSave`
- opcionalmente asignar `reason = "google_data_portability"`

### Visitas

Para actividad de Maps:

- convertir visitas a FECA `Visit` solo cuando exista un lugar razonablemente identificable
- si el match es débil, guardar el origen importado como señal de preferencia, no como visita canónica

Regla de producto:

- las visitas importadas deben mejorar ranking y contexto
- no deben contaminar el historial con falsos positivos

## Modelo de datos propuesto

Recomiendo una tabla de importación separada para auditar el proceso:

### `GoogleDataImport`

- `id`
- `userId`
- `status` (`pending`, `authorizing`, `fetching`, `processing`, `complete`, `failed`, `revoked`)
- `requestedScopes` JSON o array
- `consentType` (`one_time`, `time_based`)
- `archiveJobId`
- `tokenExpiresAt`
- `lastError`
- `createdAt`
- `updatedAt`
- `completedAt`

### `GoogleDataImportItem`

- `id`
- `importId`
- `resourceGroup`
- `sourceKey`
- `rawTitle`
- `rawUrl`
- `rawPayload` JSON
- `mappedPlaceId`
- `kind` (`saved_place`, `visit`)
- `confidence` (`high`, `medium`, `low`)
- `status` (`parsed`, `matched`, `skipped`, `manual_review`)

Esto permite:

- reintentar importaciones
- auditar qué se importó
- evitar duplicados
- depurar errores de mapeo

## API propuesta

### `POST /v1/me/google-data-imports`

Inicia el flujo de conexión/importación para el usuario autenticado.

Respuesta sugerida:

```json
{
  "import": {
    "id": "gdi_01H...",
    "status": "authorizing",
    "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
    "requestedScopes": [
      "https://www.googleapis.com/auth/dataportability.saved.collections",
      "https://www.googleapis.com/auth/dataportability.myactivity.maps"
    ]
  }
}
```

### `GET /v1/me/google-data-imports/:id`

Devuelve estado, progreso y conteos:

```json
{
  "import": {
    "id": "gdi_01H...",
    "status": "processing",
    "savedPlacesImported": 24,
    "visitsImported": 41,
    "skippedItems": 8,
    "lastError": null
  }
}
```

### `POST /v1/me/google-data-imports/:id/retry`

Reintenta parseo/procesamiento si el archive ya existe pero falló el import.

### `DELETE /v1/me/google-data-imports/:id`

Revoca y borra la conexión/importación local.

## Servicio / módulos a crear

### Nuevo módulo

- `GoogleDataPortabilityModule`

### Nuevos servicios

- `GoogleDataPortabilityAuthService`
- `GoogleDataPortabilityArchiveService`
- `GoogleDataPortabilityParserService`
- `GoogleDataPortabilityImportService`

### Integraciones existentes

- `AuthService` solo debe conocer el vínculo con `userId`, no la cuenta Google.
- `PlacesService` debe reutilizarse para resolver o crear lugares.
- `SocialRepository` debe reutilizar `savePlace` y `createVisit` cuando el import ya esté normalizado.

## Seguridad y privacidad

- No usar `userinfo.email` en el mismo consentimiento que Data Portability.
- Guardar la relación por `FECA userId`, no por email de Google.
- Si se guarda refresh token, cifrarlo o aislarlo con el mismo estándar que las credenciales sensibles del backend.
- Exponer al usuario qué se va a importar y permitir borrado completo del import.

## Implementación recomendada por fases

### Fase 1

- `saved.collections`
- import puntual
- estado y auditoría
- sin renovación

### Fase 2

- `myactivity.maps`
- import de visitas
- deduplicación y scoring de confianza

### Fase 3

- renovación temporal
- reimportación controlada
- posible soporte de `maps.starred_places` si aporta valor

## Cambios de UI en la app

Sí, hay cambios concretos que conviene hacer en la app móvil para que el import sea descubrible y confiable.

### Punto de entrada

El acceso principal debería vivir donde el usuario ya gestiona sus lugares:

- pantalla de guardados
- perfil / ajustes
- onboarding si queremos capturar valor antes

Recomendación:

- añadir una card o bloque "Importar desde Google Maps" en `saved`
- añadir un acceso secundario en perfil/ajustes

### Flujo de conexión

La UI debería mostrar:

- qué se va a importar
- por qué mejora las recomendaciones
- que es una copia de los datos, no acceso permanente a la cuenta
- tiempo estimado o aviso de que puede tardar varios minutos

### Estados visibles

La app necesita estados claros:

- `Not connected`
- `Connecting`
- `Waiting for Google consent`
- `Importing`
- `Processing`
- `Completed`
- `Completed with review needed`
- `Failed`
- `Revoked`

### Pantalla de resultado

Después del import, mostrar:

- número de lugares guardados importados
- número de visitas importadas
- número de items omitidos
- si hay items dudosos, un CTA de revisión manual

### Revisión manual

Los items con match débil no deberían entrar silenciosamente como verdad absoluta.

La UI debería permitir:

- revisar items no resueltos
- confirmar o descartar un match sugerido
- convertir un item dudoso en guardado o visita manual

### Reutilización de pantallas existentes

Lugares donde encaja bien hoy:

- [app/saved.tsx](/Users/gian/Proyectos/feca-app/app/saved.tsx)
- [app/(tabs)/profile.tsx](/Users/gian/Proyectos/feca-app/app/(tabs)/profile.tsx)
- onboarding de preferencias o lugares previos, si queremos empujar la activación temprana

### Copy recomendado

Evitar promesas vagas tipo "sincroniza tu Google Maps".

Mejor:

- "Importa una copia de tus lugares guardados y visitas de Google Maps"
- "Usaremos esa información para afinar tus recomendaciones"
- "Puedes borrar esta importación cuando quieras"

## Criterios de aceptación

- Un usuario FECA puede conectar su cuenta Google y autorizar el import.
- El backend importa lugares guardados sin duplicar lo ya existente.
- El backend importa visitas con un nivel de confianza explícito.
- El usuario puede ver el estado del import.
- El import se puede borrar o revocar.
- En desarrollo se puede probar el flujo sin producción, pero la app debe respetar que los tokens de Testing expiran en 7 días.

## Preguntas abiertas

- Si el import debe ejecutarse en background job o en request síncrona.
- Si queremos persistir refresh token para reimportaciones.
- Si las visitas importadas se materializan como `Visit` o primero como señal de taste.
- Qué UX de revisión manual queremos para items con match débil.
