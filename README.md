# Tucan API

Backend de **Tucan** (empleo, comunidad y emprendimientos en Bolivia). La app
Flutter vive en el repositorio [`aplicaciondeempleo`](https://github.com/isavethh/aplicaciondeempleo)
y consume esta API.

- **Node.js 22 + Express 5**, ES modules.
- **SQL Server** (2019+ o Azure SQL) con el driver `mssql`.
- Autenticación con **JWT** y contraseñas con **bcrypt**.
- Validación de entrada con **zod**, `helmet`, CORS por lista blanca y límites de peticiones.
- La clave de OpenAI vive **solo** aquí; la app nunca la ve.

## Puesta en marcha

Requisitos: Node 22 y Docker (o un SQL Server propio).

```bash
cp .env.example .env            # completa DB_PASSWORD y JWT_SECRET
docker compose up -d db         # SQL Server local en el puerto 1433
npm install
npm run db:migrate              # crea la base y las tablas
npm run db:seed                 # datos de demostración (idempotente)
npm run directory:import        # 30.667 empresas del Excel → labor_companies
npm run dev                     # http://localhost:3000
```

Con `docker compose up --build` se levantan la base y la API juntas; la API migra
y carga los datos demo al arrancar.

La app Flutter se apunta a esta API al compilar:

```bash
flutter run -d chrome --dart-define=API_URL=http://localhost:3000/api
```

## Variables de entorno

| Variable                                                    | Para qué                                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión a SQL Server.                                                                                          |
| `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`                 | `true`/`false`. En Azure SQL: cifrado sí, confiar en el certificado no.                                         |
| `JWT_SECRET`                                                | Mínimo 32 caracteres. Generarlo con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| `JWT_EXPIRES_IN`                                            | Vigencia de la sesión (`7d` por defecto).                                                                       |
| `CORS_ORIGINS`                                              | Orígenes del frontend separados por comas.                                                                      |
| `DEMO_LOGIN_ENABLED`                                        | Habilita los botones «Probar como…» (cuentas demo sin contraseña conocida).                                     |
| `OPENAI_API_KEY`, `OPENAI_MODEL`                            | Búsqueda con IA. Sin clave, responde sugerencias genéricas.                                                     |

La configuración se valida al arrancar: si falta algo, el proceso termina con un
mensaje que dice qué.

## Estructura

```
src/
  app.js                 Express: middlewares y rutas
  server.js              arranque y apagado ordenado
  config/env.js          variables de entorno validadas
  db/
    pool.js              pool de SQL Server y helpers parametrizados
    migrate.js           ejecuta migrations/*.sql en orden (separadas por GO)
    migrations/          esquema versionado
    seed/                datos de demostración
  middleware/            auth (JWT), validación, errores, rate limit
  modules/
    users/               registro, ingreso, perfil, perfiles públicos
    cv/                  hoja de vida y enlace público
    opportunities/       tablero, postulaciones, guardados, reclutamiento
    stores/              cuentas de emprendedor y tiendas
    community/           publicaciones, reacciones, comentarios
    directory/           directorio laboral e importador del Excel
    ai/                  proxy a OpenAI
scripts/                 migrate, seed, import-directory
data/                    Excel original del directorio laboral
test/                    pruebas de integración contra SQL Server real
```

## API

Todas las rutas cuelgan de `/api`. Las respuestas de error son
`{ "error": "mensaje para mostrar" }`. 🔒 = requiere `Authorization: Bearer <token>`.

**Cuentas** (personas: profesional `seeker`, empresa `employer`, quien busca servicios `serviceSeeker`)

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

**Emprendimientos** (cuentas con usuario, no correo; varias tiendas por cuenta)

| Método              | Ruta                            |                                 |
| ------------------- | ------------------------------- | ------------------------------- |
| GET                 | `/stores`, `/stores/:slug`      | Tiendas públicas                |
| POST                | `/owners/register`              | `{ username, password, store }` |
| POST                | `/owners/login`, `/owners/demo` | Sesión de emprendedor           |
| GET                 | `/owners/me` 🔒                 | Cuenta y sus tiendas            |
| POST / PUT / DELETE | `/owners/me/stores[/:id]` 🔒    | Gestionar tiendas propias       |

**Comunidad**: `GET /posts` · `POST /posts` 🔒 · `PATCH/DELETE /posts/:id` 🔒 ·
`POST /posts/:id/likes` 🔒 (alterna) · `POST /posts/:id/comments` 🔒. Un emprendedor
publica como una de sus tiendas enviando `asStoreId`.

**Directorio laboral**: `GET /directory/facets` · `GET /directory/companies?q=&department=&sector=&favorites=&page=&pageSize=`
· `GET/PUT/DELETE /directory/favorites[/:id]` 🔒.

**IA**: `POST /ai/job-search` `{ userQuery }` (también `POST /openai`, la ruta anterior).

**Salud**: `GET /health` comprueba la base de datos; `GET /` sirve para despertar la instancia.

## Pruebas y calidad

```bash
npm test                # integración contra SQL Server (base tucan_test, se vacía)
npm run lint
npm run format:check
```

Las pruebas usan las variables `DB_*` del entorno o de `.env.test`. La CI de
GitHub Actions levanta SQL Server como servicio y corre lint, formato, pruebas y
`npm audit`.

## Despliegue

1. Base de datos: Azure SQL o un SQL Server gestionado. Crear un usuario con
   permisos sobre la base (no usar `sa` en producción).
2. API: cualquier servicio que ejecute el `Dockerfile` (Render, Azure App Service,
   Railway…). Variables: las de la tabla, con `NODE_ENV=production`.
3. Antes del primer arranque: `npm run db:migrate`, `npm run directory:import` y,
   si se quiere la demo, `npm run db:seed`.
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
