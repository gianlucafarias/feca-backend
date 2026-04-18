# FECA Social Graph

Reglas de producto y contrato p\u00fablico para la capa social de FECA.

## Decisi\u00f3n

FECA usa un grafo dirigido de `follow` como relaci\u00f3n social can\u00f3nica.

Esto implica:

- la relaci\u00f3n base es `following` / `followers`
- no existe una entidad REST de `friends`
- si la app quiere mostrar “amigos”, debe derivarlos como relaci\u00f3n mutua (`mutual = true`)

Por qu\u00e9:

- el descubrimiento es m\u00e1s simple y sin fricci\u00f3n
- los perfiles p\u00fablicos no requieren flujos de aprobaci\u00f3n
- la privacidad se controla con visibilidad y settings, no con una segunda relaci\u00f3n social paralela

Fuera de alcance en esta fase:

- solicitudes de amistad
- block / mute / report
- sync de contactos
- sugerencias algor\u00edtmicas complejas

## Conceptos

### Social State

Para cualquier par `viewer -> target`:

- `following`: el viewer sigue al target
- `followsYou`: el target sigue al viewer
- `mutual`: ambos se siguen

### Visibility

#### `activityVisibility`

Controla:

- `GET /v1/feed`
- `GET /v1/users/:id/visits`

Valores:

- `public`
- `followers`
- `private`

#### `diaryVisibility`

Controla:

- `GET /v1/users/:id/diaries`
- `GET /v1/diaries/:id`

Valores:

- `public`
- `followers`
- `private`

### Group Invite Policy

Controla qui\u00e9n puede invitar a un usuario a un grupo.

Valores:

- `anyone`
- `following_only`
- `mutuals_only`

Sem\u00e1ntica:

- `anyone`: cualquier usuario autenticado puede invitar
- `following_only`: solo puede invitar alguien a quien el target ya siga
- `mutuals_only`: solo puede invitar alguien con follow mutuo

## Defaults

- `activityVisibility = public`
- `diaryVisibility = public`
- `groupInvitePolicy = anyone`

## Reglas del servidor

Estas reglas existen como l\u00f3gica interna del backend. No todas se exponen como campos p\u00fablicos de la API.

### Can View Activity

- el due\u00f1o siempre puede ver su propia actividad
- `public`: permitido
- `followers`: permitido solo si el viewer sigue al owner
- `private`: denegado salvo owner

### Can View Diaries

- el due\u00f1o siempre puede ver sus diarios
- `public`: permitido
- `followers`: permitido solo si el viewer sigue al owner
- `private`: denegado salvo owner

### Can Invite To Group

- nadie puede invitarse a s\u00ed mismo
- `anyone`: permitido
- `following_only`: permitido solo si el target sigue al viewer
- `mutuals_only`: permitido solo si hay follow mutuo

## Matriz de relaci\u00f3n

| Viewer vs owner | Social state | Activity public | Activity followers | Activity private | Diaries followers | Puede invitar con `following_only` | Puede invitar con `mutuals_only` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Same user | self | yes | yes | yes | yes | no | no |
| Viewer follows owner | following | yes | yes | no | yes | depends on reverse follow | no |
| Owner follows viewer | followsYou | yes | no | no | no | yes | no |
| Mutual follow | mutual | yes | yes | no | yes | yes | yes |
| No relation | none | yes | no | no | no | no | no |

## API p\u00fablica

### Perfil p\u00fablico

`GET /v1/users/:id`

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

### B\u00fasqueda de usuarios

`GET /v1/users/search?q=&limit=&offset=`

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

Cada item es `UserPublic` puro. No incluye `permissions`, `social` ni `stats`.

### Follow / Unfollow

`POST /v1/users/:id/follow`

`DELETE /v1/users/:id/follow`

```json
{
  "following": true
}
```

Ambas rutas son idempotentes.

### Following / Followers

`GET /v1/me/following`

`GET /v1/me/followers`

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

No existe `GET /v1/me/friends`.

### Perfil propio

`GET /v1/me`

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
    "lat": -34.9011,
    "lng": -56.1645,
    "followersCount": 20,
    "followingCount": 54,
    "savedCount": 12,
    "visitCount": 38
  }
}
```

Los contadores viven dentro de `user`.

### Social Settings

`GET /v1/me/settings/social`

`PATCH /v1/me/settings/social`

```json
{
  "settings": {
    "activityVisibility": "public",
    "diaryVisibility": "public",
    "groupInvitePolicy": "anyone"
  }
}
```

## Gu\u00eda para frontend

- usar `followers` / `following` como modelo social base
- derivar “amigos” con `mutual = true` cuando la UI lo necesite
- leer contadores desde `user.followersCount`, `user.followingCount`, `user.savedCount` y `user.visitCount`
- usar `GET /v1/me/settings/social` para preferencias sociales; no esperar `settings` dentro de `GET /v1/me`
- usar `GET /v1/users/search` para discovery
- usar `POST /v1/users/:id/follow` y `DELETE /v1/users/:id/follow` para el CTA de seguir
