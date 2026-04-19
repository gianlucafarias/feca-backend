# FECA Mobile API Spec

Contrato final del backend FECA para la app móvil.

## Principios

- Base URL pública: `EXPO_PUBLIC_API_BASE_URL` sin slash final.
- Auth: salvo rutas públicas de auth, toda request usa `Authorization: Bearer <feca_access_token>`.
- Errores: todas las respuestas de error incluyen al menos `{ "message": "..." }`.
- Paginación estándar: `limit` default `20`, máximo `50`; `offset` default `0`.
- Write model canónico para visitas, guardados, diarios y eventos: `placeId`.
- Grafo social canónico: `following` / `followers`. No existe una entidad REST de `friends`.
- Fechas de negocio: `YYYY-MM-DD`. Timestamps de auditoría: ISO 8601 UTC.

## Tipos compartidos

### UserPublic

```json
{
  "id": "usr_01H...",
  "username": "muni",
  "displayName": "Muni",
  "avatarUrl": "https://...",
  "city": "Buenos Aires"
}
```

### PlaceSummary

```json
{
  "id": "plc_01H...",
  "googlePlaceId": "ChIJ2abc...",
  "name": "Café Tortoni",
  "address": "Av. de Mayo 825, CABA",
  "photoUrl": "https://..."
}
```

Notas:

- `googlePlaceId` puede ser `null` en lugares manuales.
- `photoUrl` puede ser `null` si no hay imagen.

### Visit

```json
{
  "id": "vis_01H...",
  "user": {
    "id": "usr_...",
    "username": "muni",
    "displayName": "Muni",
    "avatarUrl": null,
    "city": "Buenos Aires"
  },
  "place": {
    "id": "plc_01H...",
    "googlePlaceId": "ChIJ...",
    "name": "Café Tortoni",
    "address": "Av. de Mayo 825",
    "photoUrl": null
  },
  "rating": 4,
  "note": "Flat white excelente",
  "tags": ["cafe"],
  "visitedAt": "2026-04-07",
  "createdAt": "2026-04-07T14:30:00.000Z"
}
```

## Auth y perfil propio

### `POST /v1/auth/google/mobile`

Respuesta:

```json
{
  "isNewUser": true,
  "session": {
    "accessToken": "jwt",
    "refreshToken": "refresh",
    "accessTokenExpiresAt": "2026-04-07T12:00:00.000Z",
    "refreshTokenExpiresAt": "2026-05-07T12:00:00.000Z",
    "user": {
      "id": "usr_123",
      "email": "muni@gmail.com",
      "username": "muni",
      "displayName": "Muni",
      "avatarUrl": "https://...",
      "bio": "Cafe y brunch",
      "city": "Montevideo",
      "cityGooglePlaceId": "ChIJs5ydy5hexkcRj85ZX8H8OAU",
      "lat": -34.9011,
      "lng": -56.1645
    }
  }
}
```

### `POST /v1/auth/refresh`

```json
{
  "session": { "...": "mismo shape de session" }
}
```

### `POST /v1/auth/logout`

```json
{}
```

### `GET /v1/me`

Respuesta:

```json
{
  "user": {
    "id": "usr_123",
    "email": "muni@gmail.com",
    "username": "muni",
    "displayName": "Muni",
    "avatarUrl": "https://...",
    "bio": "Cafe y brunch",
    "city": "Montevideo",
    "cityGooglePlaceId": "ChIJs5ydy5hexkcRj85ZX8H8OAU",
    "lat": -34.9011,
    "lng": -56.1645,
    "followersCount": 20,
    "followingCount": 54,
    "savedCount": 12,
    "visitCount": 38,
    "outingPreferences": null
  }
}
```

Campo opcional `outingPreferences` (JSON privado, solo en la sesión del usuario): preferencias de salida para personalizar ranking en `GET /v1/places/nearby`, `GET /v1/explore/context` y el feed. No se expone en `GET /v1/users/:id`.

### `PATCH /v1/me`

Parcial para perfil y contexto de ciudad. Si se envía ubicación, debe enviarse el bloque completo:

```json
{
  "username": "munito",
  "displayName": "Muni",
  "city": "Buenos Aires",
  "cityGooglePlaceId": "ChIJQ0fP1C5KvJUR3L7xCz6zB4Q",
  "lat": -34.6037,
  "lng": -58.3816
}
```

También se acepta `outingPreferences` (objeto con `schemaVersion: 1` y campos opcionales `typicalOutingSlots`, `typicalCompanies` (array), `placePriorities`) o `null` para borrar. El backend aún acepta el campo legacy `typicalCompany` (string) y lo normaliza a `typicalCompanies`.

### `GET /v1/me/settings/social`

### `PATCH /v1/me/settings/social`

Endpoint dedicado para `activityVisibility`, `diaryVisibility` y `groupInvitePolicy`.

Nota:

- esta es la fuente canonica de preferencias sociales
- la app movil puede tardar en migrar por completo; no asumir que `GET /v1/me` expone `settings`

## Usuarios, seguidores y búsqueda

### `GET /v1/users/:id`

Respuesta:

```json
{
  "user": {
    "id": "usr_123",
    "username": "muni",
    "displayName": "Muni",
    "avatarUrl": "https://...",
    "bio": "Cafe y brunch",
    "city": "Montevideo",
    "lat": -34.9011,
    "lng": -56.1645,
    "followersCount": 20,
    "followingCount": 54,
    "savedCount": 12,
    "visitCount": 38
  },
  "social": {
    "following": true,
    "followsYou": true,
    "mutual": true
  }
}
```

### `GET /v1/users/search?q=&limit=&offset=`

Reglas:

- `q` es obligatorio y debe tener al menos 2 caracteres útiles.
- Se normaliza `@` inicial.
- Si `q` tiene menos de 2 caracteres, el backend responde `400`.
- Respuesta pura `UserPublic[]`.

```json
{
  "users": [
    {
      "id": "usr_123",
      "username": "muni",
      "displayName": "Muni",
      "avatarUrl": "https://...",
      "city": "Montevideo"
    }
  ],
  "total": 1
}
```

### `POST /v1/users/:id/follow`

### `DELETE /v1/users/:id/follow`

Ambas rutas son idempotentes y responden:

```json
{
  "following": true
}
```

### `GET /v1/me/following`

```json
{
  "users": [
    {
      "id": "usr_123",
      "username": "muni",
      "displayName": "Muni",
      "avatarUrl": "https://...",
      "city": "Montevideo"
    }
  ],
  "total": 8
}
```

### `GET /v1/me/followers`

Mismo shape que `GET /v1/me/following`.

## Taste

### `GET /v1/taste-options`

Respuesta:

```json
{
  "options": [
    { "id": "small_bar", "label": "Te gustan las barras chicas" },
    { "id": "wifi_outlets", "label": "Te importan wifi y enchufes" }
  ]
}
```

### `GET /v1/me/taste`

### `PATCH /v1/me/taste`

Respuesta:

```json
{
  "taste": {
    "selectedIds": ["wifi_outlets", "quiet"],
    "preferences": [
      { "id": "wifi_outlets", "label": "Te importan wifi y enchufes" },
      { "id": "quiet", "label": "Valoras lugares tranquilos" }
    ]
  }
}
```

Body aceptado en `PATCH /v1/me/taste`:

```json
{
  "selectedIds": ["wifi_outlets", "quiet"]
}
```

Tambien se aceptan `preferenceIds` o `preferences[{ id, weight? }]` por compatibilidad de escritura.

### `GET /v1/users/:id/taste`

Devuelve el mismo shape de `taste`. Cuando el viewer consulta el taste de otro usuario, el backend expone un subconjunto acotado de preferencias seleccionadas.

## Lugares, guardados y visitas

### `GET /v1/places/nearby`

Query:

- `query` opcional: texto libre para buscar por nombre o categoria
- `type` opcional: `cafe` o `restaurant`
- `variant` opcional: `home_city` o `home_network` (home FECA: misma zona pero distinta semilla de ranking y entrada de cache para que “Tu red” vs “Tu ciudad” no se vean identicos)
- `lat` y `lng` opcionales: si faltan, el backend intenta usar la ubicacion guardada en el perfil
- `limit` opcional: default `20`, max `20`

Comportamiento:

- si hay `query`, el backend usa busqueda textual
- si no hay `query`, devuelve lugares cercanos rankeados alrededor de la ubicacion resuelta
- si faltan `lat` / `lng` y el usuario no tiene coordenadas guardadas, responde `{ "places": [] }`

```json
{
  "places": [
    {
      "googlePlaceId": "ChIJ2abc...",
      "name": "Ronda Cafe",
      "address": "Av. 18 de Julio 1234, Montevideo",
      "lat": -34.9011,
      "lng": -56.1645,
      "rating": 4.5,
      "userRatingCount": 123,
      "types": ["cafe", "food"],
      "primaryType": "cafe",
      "photoUrl": "https://...",
      "openNow": true
    }
  ]
}
```

### `GET /v1/explore/context?intent=&lat=&lng=&limit=`

Usado por la pantalla Explorar para chips y contextos rapidos.

Query:

- `intent` obligatorio. Valores soportados hoy:
  - `open_now`
  - `work_2h`
  - `brunch_long`
  - `solo`
  - `first_date`
  - `snack_fast`
  - `reading`
  - `group_4`
- `lat` y `lng` opcionales: si faltan, el backend intenta usar la ubicacion guardada en el perfil
- `limit` opcional: default `12`, max `20`

Respuesta:

```json
{
  "places": [
    {
      "googlePlaceId": "ChIJ2abc...",
      "name": "Ronda Cafe",
      "address": "Av. 18 de Julio 1234, Montevideo",
      "lat": -34.9011,
      "lng": -56.1645,
      "rating": 4.5,
      "userRatingCount": 123,
      "types": ["cafe", "food"],
      "primaryType": "cafe",
      "photoUrl": "https://...",
      "openNow": true,
      "reason": "Cafe y foco para trabajar un rato"
    }
  ]
}
```

Si faltan `lat` / `lng` y el usuario no tiene coordenadas guardadas, responde `{ "places": [] }`.

## Ciudades

### `GET /v1/cities/autocomplete?q=&lat=&lng=&sessionToken=&limit=`

Query:

- `q` obligatorio
- `lat` y `lng` opcionales para sesgo geografico
- `sessionToken` opcional
- `limit` opcional: default `5`, max `10`

Comportamiento:

- si `q` tiene menos de 2 caracteres utiles, responde `{ "cities": [] }`

Respuesta:

```json
{
  "cities": [
    {
      "city": "Montevideo",
      "cityGooglePlaceId": "ChIJs5ydy5hexkcRj85ZX8H8OAU",
      "displayName": "Montevideo, Departamento de Montevideo, Uruguay"
    }
  ]
}
```

### `GET /v1/cities/reverse?lat=&lng=`

Respuesta:

```json
{
  "city": {
    "city": "Montevideo",
    "cityGooglePlaceId": "ChIJs5ydy5hexkcRj85ZX8H8OAU",
    "displayName": "Montevideo, Departamento de Montevideo, Uruguay",
    "lat": -34.9011,
    "lng": -56.1645
  }
}
```

### `GET /v1/cities/resolve?cityGooglePlaceId=`

Helper soportado por backend para resolver y persistir una ciudad canonica desde Google Place ID.

Respuesta: mismo shape que `GET /v1/cities/reverse`.

### `GET /v1/places/:googlePlaceId`

Incluye capa Google + capa FECA:

- `reviews`: reseñas Google.
- `fecaReviews`: visitas/reseñas FECA.
- `social`: contexto social adicional del lugar.

### `POST /v1/places/resolve`

Body:

```json
{
  "source": "google",
  "sourcePlaceId": "ChIJ..."
}
```

### `POST /v1/places/manual`

Body:

```json
{
  "name": "Cafe Nuevo",
  "address": "Calle 1234",
  "city": "Montevideo",
  "cityGooglePlaceId": "ChIJs5ydy5hexkcRj85ZX8OAU",
  "lat": -34.9,
  "lng": -56.18
}
```

### Guardados

- `GET /v1/places/:googlePlaceId/saved`
- `POST /v1/places/:googlePlaceId/save`
- `DELETE /v1/places/:googlePlaceId/save`
- `GET /v1/me/saved`

Ejemplo de `GET /v1/me/saved`:

```json
{
  "places": [
    {
      "savedAt": "2026-04-01T12:00:00.000Z",
      "place": {
        "id": "plc_01H...",
        "googlePlaceId": "ChIJ...",
        "name": "Café Tortoni",
        "address": "Av. de Mayo 825, CABA",
        "photoUrl": null
      },
      "reason": ""
    }
  ],
  "total": 15
}
```

### `POST /v1/visits`

Se aceptan tres modos de escritura:

1. Canónico:

```json
{
  "placeId": "plc_01H...",
  "rating": 4,
  "note": "Flat white excelente",
  "tags": ["cafe"],
  "visitedAt": "2026-04-07"
}
```

2. Conveniencia con Google:

```json
{
  "googlePlaceId": "ChIJ2abc...",
  "rating": 4,
  "note": "Flat white excelente",
  "tags": ["cafe"],
  "visitedAt": "2026-04-07"
}
```

3. Alta manual robusta:

```json
{
  "placeName": "Café nuevo",
  "placeAddress": "Calle 1234, Montevideo",
  "rating": 4,
  "note": "Flat white excelente",
  "tags": ["cafe"],
  "visitedAt": "2026-04-07"
}
```

Reglas:

- Si viene `placeId`, tiene prioridad.
- Si viene `googlePlaceId`, el backend resuelve o reutiliza un lugar FECA.
- Si no viene ninguno, el backend exige `placeName` + `placeAddress`.
- La vía manual requiere ciudad canónica configurada en el perfil del usuario; si no, responde `422`.

Respuesta:

```json
{
  "visit": { "...": "shape Visit" }
}
```

### Listados de visitas

- `GET /v1/me/visits`
- `GET /v1/users/:id/visits`
- `GET /v1/feed`

Orden: en `mode=city` las visitas públicas de la ciudad van por `visitedAt desc`. En `mode=network` el backend rankea un pool reciente (volvería, rating, solape de taste con el viewer, recencia) con ligera rotación estable. En `mode=nearby` y `mode=now` aplica ranking heurístico + taste del viewer.

## Diarios / guías

### `POST /v1/diaries`

```json
{
  "name": "Palermo specialty",
  "description": "Notas de cafés en Palermo",
  "intro": "Tres paradas para una tarde larga",
  "visibility": "public"
}
```

### `GET /v1/me/diaries`

### `GET /v1/users/:id/diaries`

### `GET /v1/diaries/:id`

Todas devuelven `ApiDiary` con `orderedPlaces` como forma canónica de orden:

```json
{
  "id": "dry_01H...",
  "name": "Palermo specialty",
  "description": "Notas de cafés en Palermo",
  "intro": "Tres paradas para una tarde larga",
  "places": [],
  "orderedPlaces": [],
  "createdBy": { "...": "UserPublic" },
  "createdAt": "2026-04-07T12:00:00.000Z",
  "visibility": "public",
  "coverImageUrl": null,
  "publishedAt": "2026-04-07T12:00:00.000Z"
}
```

### `GET /v1/diaries/search?q=&limit=&offset=`

Reglas:

- `q` obligatorio y con al menos 2 caracteres.
- Solo devuelve diarios con `visibility = public`.
- Busca en `name`, `description` e `intro`.
- Ordena por relevancia simple y luego por `publishedAt` / `createdAt`.

```json
{
  "diaries": [ { "...": "ApiDiary" } ],
  "total": 10
}
```

### `POST /v1/diaries/:id/places`

```json
{
  "placeId": "plc_01H...",
  "googlePlaceId": "ChIJ...",
  "note": "Pedir flat white",
  "position": 0
}
```

Regla: `placeId` o `googlePlaceId` son aceptados; `placeId` sigue siendo el identificador canónico.

## Grupos y planes

### `POST /v1/groups`

Body:

```json
{
  "name": "Cafe de los viernes",
  "memberIds": ["usr_02", "usr_03"]
}
```

### `GET /v1/me/groups`

### `GET /v1/groups/:id`

### `POST /v1/groups/:id/members`

Body:

```json
{
  "memberIds": ["usr_04", "usr_05"]
}
```

Respuesta:

```json
{
  "group": { "...": "shape Group" },
  "rejectedInvites": [
    { "userId": "usr_99", "reason": "invite_policy" }
  ]
}
```

`rejectedInvites` es opcional y puede omitirse o venir vacio.

### `POST /v1/groups/:id/events`

Body:

```json
{
  "placeId": "plc_01H...",
  "googlePlaceId": "ChIJ...",
  "date": "2026-04-15"
}
```

### `POST /v1/groups/join`

Body:

```json
{
  "code": "ABCD1234"
}
```

### `POST /v1/groups/:id/events/:eventId/rsvp`

Body:

```json
{
  "rsvp": "going"
}
```

Valores soportados: `going`, `maybe`, `declined`, `none`.

La respuesta de grupo incluye:

- `inviteCode`
- `members[].role`
- `members[].status`
- `members[].accepted`
- `events[].date` en `YYYY-MM-DD`
- `events[].myRsvp` cuando aplique

## Migración de frontend

## Notificaciones

### `GET /v1/me/notifications?limit=&offset=&unreadOnly=1`

Query:

- `limit` opcional: default `20`, max `50`
- `offset` opcional: default `0`
- `unreadOnly` opcional: acepta `1` o `true`

Respuesta:

```json
{
  "notifications": [
    {
      "id": "ntf_01H...",
      "type": "group_invite",
      "read": false,
      "createdAt": "2026-04-18T19:30:00.000Z",
      "actor": {
        "id": "usr_01H...",
        "username": "muni",
        "displayName": "Muni",
        "avatarUrl": "https://...",
        "city": "Montevideo"
      },
      "title": "Invitacion a un plan",
      "body": "Muni te invito a Cafe de los viernes",
      "deepLink": "/group/grp_01H...",
      "entity": {
        "kind": "group",
        "id": "grp_01H..."
      },
      "data": {
        "groupId": "grp_01H...",
        "groupName": "Cafe de los viernes",
        "inviteCode": "ABCD1234"
      }
    }
  ],
  "total": 12,
  "unreadTotal": 4
}
```

Tipos soportados hoy:

- `follow`
- `group_invite`
- `group_joined`
- `group_event_proposed`
- `group_event_rsvp`
- `visit_created`
- `diary_published`

Notas:

- `title`, `body` y `deepLink` son la superficie canonica para renderizar la notificacion en cliente.
- `actor` puede ser `null` en futuros eventos de sistema.
- `entity` puede ser `null` si el evento no referencia una entidad navegable.
- `data` es extensible y contiene contexto puntual del evento.

### `POST /v1/me/notifications/:id/read`

Marca una notificacion como leida.

Respuesta:

```json
{}
```

Comportamiento:

- es idempotente si la notificacion ya estaba leida
- responde `404` si la notificacion no existe o no pertenece al usuario autenticado

### `POST /v1/me/notifications/read-all`

Marca como leidas todas las notificaciones pendientes del usuario autenticado.

Respuesta:

```json
{
  "updatedCount": 4
}
```

## MigraciÃ³n de frontend

Breaking changes que el frontend debe asumir:

Nota para notificaciones:

- `GET /v1/me/notifications` ya no debe renderizarse solo con `type === "follow"`; el cliente debe usar `title`, `body` y `deepLink` como capa canonica de presentacion.

1. `GET /v1/me/friends` deja de existir. Usar `GET /v1/me/following`.
2. `GET /v1/me` ya no devuelve `stats` ni `settings`; leer contadores desde `user`. Las preferencias sociales viven en `GET /v1/me/settings/social`.
3. `GET /v1/users/:id` ya no devuelve `stats`, `permissions` ni `settings`; usar:
   - `user.followersCount`
   - `user.followingCount`
   - `user.savedCount`
   - `user.visitCount`
   - `social.following`
   - `social.followsYou`
   - `social.mutual`
4. `GET /v1/users/search` devuelve `users: UserPublic[]` puro. No esperar `user`, `social` ni `permissions` dentro de cada item.
5. `GET /v1/me/following` y `GET /v1/me/followers` devuelven `UserPublic[]` puro.
6. `POST /v1/users/:id/follow` y `DELETE /v1/users/:id/follow` devuelven solo `{ following: boolean }`.
7. El modelo canónico social es `followers/following`; si la UI muestra “amigos”, debe calcularlo como `mutual = true` en el perfil o desde cruces locales, no desde una ruta dedicada.
