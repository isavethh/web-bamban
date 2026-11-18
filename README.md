# ChurAPP API

Backend de **ChurAPP** (empleo, turismo, comunidad y emprendimientos en Bolivia). La app
Flutter vive en el repositorio [`aplicaciondeempleo`](https://github.com/isavethh/aplicaciondeempleo)
y consume esta API.

- **Node.js 22 + Express 5**, ES modules.
- **PostgreSQL** (15+; Supabase, Neon o propio) con el driver `pg`.
- Autenticación con **JWT** y contraseñas con **bcrypt**.
- Validación de entrada con **zod**, `helmet`, CORS por lista blanca y límites de peticiones.
- La clave de OpenAI vive **solo** aquí; la app nunca la ve.

## Puesta en marcha

Requisitos: Node 22 y Docker (o un PostgreSQL propio).

```bash
cp .env.example .env            # completa JWT_SECRET
docker compose up -d db         # PostgreSQL local en el puerto 5433
npm install
npm run db:migrate              # crea las tablas
npm run db:seed                 # datos de demostración (idempotente)
npm run directory:import        # 30.667 empresas del Excel → labor_companies
npm run dev                     # http://localhost:3000
```

Con `docker compose up --build` se levantan la base y la API juntas; la API migra
y carga los datos demo al arrancar.

En esta carpeta conviene arrancar sin `--watch` si el proyecto está dentro de OneDrive
(`node --env-file=.env src/server.js`): la sincronización toca los archivos y reinicia
el servidor a mitad de las peticiones.

La app Flutter se apunta a esta API al compilar:

```bash
flutter run -d chrome --dart-define=API_URL=http://localhost:3000/api
```

## Variables de entorno

| Variable                         | Para qué                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | Cadena de conexión de PostgreSQL: `postgresql://usuario:clave@host:5432/base`.                                  |
| `DB_SSL`                         | `true` (por defecto) con proveedores gestionados; `false` con la base local.                                    |
| `DB_POOL_MAX`                    | Conexiones simultáneas (`5` por defecto). Los planes gratuitos admiten pocas.                                   |
| `JWT_SECRET`                     | Mínimo 32 caracteres. Generarlo con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| `JWT_EXPIRES_IN`                 | Vigencia de la sesión (`7d` por defecto).                                                                       |
| `CORS_ORIGINS`                   | Orígenes del frontend separados por comas.                                                                      |
| `DEMO_LOGIN_ENABLED`             | Habilita los botones «Probar como…» (cuentas demo sin contraseña conocida).                                     |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Búsqueda con IA. Sin clave, responde sugerencias genéricas.                                                     |

La configuración se valida al arrancar: si falta algo, el proceso termina con un
mensaje que dice qué.

## Estructura

```
src/
  app.js                 Express: middlewares y rutas
  server.js              arranque y apagado ordenado
  config/env.js          variables de entorno validadas
  db/
    pool.js              pool de PostgreSQL y helpers parametrizados (`@nombre`)
    migrate.js           ejecuta migrations/*.sql en orden, cada una en su transacción
    migrations/          esquema versionado
    seed/                datos de demostración
  middleware/            auth (JWT), validación, errores, rate limit
  modules/
    users/               registro, ingreso, perfil, perfiles públicos
    cv/                  hoja de vida y enlace público
    opportunities/       tablero, postulaciones, guardados, reclutamiento
    stores/              emprendimientos (tiendas) de los profesionales
    business/            rubros, perfil de negocio, ofertas, promociones, consultas y búsqueda turística
    community/           publicaciones, reacciones, comentarios
    directory/           directorio laboral e importador del Excel
    ai/                  proxy a OpenAI
scripts/                 migrate, seed, import-directory
data/                    Excel original del directorio laboral
test/                    pruebas de integración contra PostgreSQL real
```

## API

Todas las rutas cuelgan de `/api`. Las respuestas de error son
`{ "error": "mensaje para mostrar" }`. 🔒 = requiere `Authorization: Bearer <token>`.

**Cuentas**: profesional o técnico `seeker` (también es quien tiene emprendimientos), empresa
`employer` (se registra con `businessSector` y `businessType`), turista `tourist` y quien busca un
técnico `serviceSeeker`.

| Método      | Ruta              |                                                                  |
| ----------- | ----------------- | ---------------------------------------------------------------- |
| POST        | `/auth/register`  | Crea la cuenta y devuelve `{ token, user }`                      |
| POST        | `/auth/login`     | `{ email, password }` → `{ token, user }`                        |
| POST        | `/auth/demo`      | `{ role }` → sesión con la cuenta demo (si `DEMO_LOGIN_ENABLED`) |
| GET / PATCH | `/me` 🔒          | Perfil propio / editarlo                                         |
| PUT         | `/me/password` 🔒 | `{ oldPassword, newPassword }`                                   |
| GET         | `/profiles?role=` | Perfiles públicos                                                |

**Hoja de vida**: `GET/PUT /me/cv` 🔒 · `GET /cvs/:slug` (pública).

**Oportunidades**

| Método             | Ruta                                      |                                    |
| ------------------ | ----------------------------------------- | ---------------------------------- |
| GET                | `/opportunities`                          | Tablero completo                   |
| POST / DELETE      | `/opportunities[/:id]` 🔒                 | Publicar / borrar lo propio        |
| POST               | `/opportunities/:id/applications` 🔒      | Postular (guarda una copia del CV) |
| DELETE             | `/opportunities/:id/applications/mine` 🔒 | Retirar la postulación             |
| GET                | `/me/applications` 🔒                     | Mis postulaciones                  |
| GET / PUT / DELETE | `/me/saved-opportunities[/:id]` 🔒        | Guardadas                          |
| GET                | `/me/completed-works` 🔒                  | Trabajos con reseña                |
| GET                | `/employer/applicants` 🔒                 | Postulantes a mis vacantes         |
| PATCH              | `/employer/applicants/:id` 🔒             | `{ status }`                       |
| POST               | `/employer/applicants/:id/notes` 🔒       | `{ text }`                         |

**Emprendimientos** (de un profesional; no hay cuentas aparte de emprendedor)

| Método              | Ruta                       |                                         |
| ------------------- | -------------------------- | --------------------------------------- |
| GET                 | `/stores`, `/stores/:slug` | Tiendas públicas                        |
| GET                 | `/me/stores` 🔒            | Mis emprendimientos                     |
| POST / PUT / DELETE | `/me/stores[/:id]` 🔒      | Crear (solo `seeker`) y editar los míos |

**Negocios y turismo**. El rubro decide cómo se ve la página y qué se publica: hospedaje →
habitaciones (`room`), turismo (agencias, operadores, guías, transporte) → paquetes (`package`),
gastronomía → platos (`dish`), el resto → servicios (`service`). Los profesionales publican
talleres (`workshop`), tours (`tour`) o servicios. Lo que ofrece una cadena hotelera vale en todas
sus sedes (`attributes.branches`).

| Método                    | Ruta                                          |                                                                                  |
| ------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| GET                       | `/catalog/business-sectors`                   | Rubros y tipos de empresa                                                        |
| GET                       | `/businesses?sector=&department=&q=`          | Negocios (con sedes)                                                             |
| GET                       | `/businesses/:id`                             | Negocio, lo que ofrece y sus promociones                                         |
| GET                       | `/offerings?ownerId=&kind=`                   | Ofertas públicas                                                                 |
| GET                       | `/promotions`                                 | Promociones vigentes                                                             |
| GET                       | `/explore?category=&department=&province=&q=` | Búsqueda del turista: negocios, ofertas, guías y artesanos, promociones, tiendas |
| GET / PUT                 | `/me/business` 🔒                             | Perfil del negocio (empresa)                                                     |
| GET / POST / PUT / DELETE | `/me/offerings[/:id]` 🔒                      | Ofertas propias (el tipo depende del rubro)                                      |
| GET / POST / PUT / DELETE | `/me/promotions[/:id]` 🔒                     | Promociones (un profesional puede atarlas a su tienda)                           |
| POST                      | `/inquiries` 🔒                               | Consulta a una empresa o profesional (fecha, personas, WhatsApp)                 |
| GET                       | `/me/inquiries?box=sent\|received` 🔒         | Consultas enviadas o recibidas                                                   |
| PATCH                     | `/me/inquiries/:id` 🔒                        | Responder o cerrar (solo quien la recibió)                                       |

**Comunidad**: `GET /posts` · `POST /posts` 🔒 · `PATCH/DELETE /posts/:id` 🔒 ·
`POST /posts/:id/likes` 🔒 (alterna) · `POST /posts/:id/comments` 🔒. Un profesional
publica como uno de sus emprendimientos enviando `asStoreId`.

**Directorio laboral**: `GET /directory/facets` · `GET /directory/companies?q=&department=&sector=&favorites=&page=&pageSize=`
· `GET/PUT/DELETE /directory/favorites[/:id]` 🔒.

**IA**: `POST /ai/job-search` `{ userQuery }` (también `POST /openai`, la ruta anterior).

**Salud**: `GET /health` comprueba la base de datos; `GET /` sirve para despertar la instancia.

## Pruebas y calidad

```bash
npm test                # integración contra PostgreSQL (base churapp_test, se vacía)
npm run lint
npm run format:check
```

Las pruebas usan `TEST_DATABASE_URL` (del entorno o de `.env.test`), nunca
`DATABASE_URL`, para no vaciar por accidente la base de desarrollo. Con la base de
`docker compose` es `postgresql://postgres:local_dev_pg@localhost:5433/churapp_test`.
La CI de GitHub Actions levanta PostgreSQL como servicio y corre lint, formato,
pruebas y `npm audit`.

## Despliegue

1. Base de datos: un PostgreSQL gestionado. Con **Supabase** (plan gratuito, sin
   tarjeta): crear el proyecto y copiar la cadena **Session pooler** de _Connect_
   (funciona por IPv4, que es lo que usa Render). El plan gratuito pausa el proyecto
   tras una semana sin actividad; se reactiva desde su panel.
2. API: cualquier servicio que ejecute Node o el `Dockerfile` (Render, Railway…).
   Variables: las de la tabla, con `NODE_ENV=production` y `DB_SSL=true`.
3. Arranque en Render: `npm run db:migrate && npm run db:seed && npm start`. Ambos
   pasos son idempotentes. El directorio laboral se carga una vez, desde cualquier
   máquina, con `npm run directory:import` apuntando `DATABASE_URL` a producción.
4. En el frontend (Vercel), definir `API_URL=https://<tu-api>/api` y añadir el
   dominio del frontend a `CORS_ORIGINS`.

## Seguridad

- Las cuentas demo tienen una contraseña aleatoria que nadie conoce; solo se entra
  por `/auth/demo`, que se apaga con `DEMO_LOGIN_ENABLED=false`.
- Todas las consultas son parametrizadas; ningún valor se concatena en el SQL.
- El ingreso y el registro tienen límite de intentos; la IA, límite por minuto.
- Los logs ocultan tokens y contraseñas.
- **Importante:** una clave de OpenAI quedó publicada en el historial de git de
  este repositorio y del frontend. Debe revocarse en el panel de OpenAI y
  reemplazarse por una nueva, guardada solo en `OPENAI_API_KEY` del servidor.
