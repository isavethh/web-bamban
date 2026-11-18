-- Esquema de ChurAPP para PostgreSQL.
-- Los identificadores son texto para conservar los ids legibles de los
-- datos de demostración ('t1', 'e1'...); los nuevos registros usan UUID.
-- Las listas de texto (habilidades, etiquetas, productos...) se guardan como
-- JSON en columnas de texto, validado al escribir: se leen y se escriben
-- siempre enteras.

CREATE TABLE users (
  id                    VARCHAR(64)  NOT NULL CONSTRAINT pk_users PRIMARY KEY,
  email                 VARCHAR(254) NOT NULL,
  password_hash         VARCHAR(100) NOT NULL,
  role                  VARCHAR(20)  NOT NULL
    CONSTRAINT ck_users_role CHECK (role IN ('seeker', 'serviceSeeker', 'employer', 'tourist')),
  name                  VARCHAR(150) NOT NULL,
  phone                 VARCHAR(30)  NULL,
  city                  VARCHAR(120) NULL,
  department            VARCHAR(60)  NULL,
  province              VARCHAR(120) NULL,
  photo                 TEXT NULL,
  career                VARCHAR(150) NULL,
  specialty             VARCHAR(150) NULL,
  summary               VARCHAR(2000) NULL,
  company_name          VARCHAR(150) NULL,
  tax_id                VARCHAR(30)  NULL,
  is_employer_verified  BOOLEAN           NOT NULL DEFAULT FALSE,
  is_profile_public     BOOLEAN           NOT NULL DEFAULT TRUE,
  rating                DECIMAL(3, 2) NULL,
  details               TEXT NOT NULL DEFAULT '{}'
    CONSTRAINT ck_details_json CHECK (details::jsonb IS NOT NULL),
  is_demo               BOOLEAN           NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ(3)  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ(3)  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_users_email ON users (email);
CREATE INDEX ix_users_role ON users (role) INCLUDE (is_profile_public);

CREATE TABLE cvs (
  user_id     VARCHAR(64)  NOT NULL CONSTRAINT pk_cvs PRIMARY KEY
    CONSTRAINT fk_cvs_user REFERENCES users (id) ON DELETE CASCADE,
  slug        VARCHAR(160) NOT NULL,
  data        TEXT NOT NULL
    CONSTRAINT ck_data_json CHECK (data::jsonb IS NOT NULL),
  updated_at  TIMESTAMPTZ(3)  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_cvs_slug ON cvs (slug);

CREATE TABLE completed_works (
  id            VARCHAR(64)  NOT NULL CONSTRAINT pk_completed_works PRIMARY KEY,
  user_id       VARCHAR(64)  NOT NULL
    CONSTRAINT fk_completed_works_user REFERENCES users (id) ON DELETE CASCADE,
  title         VARCHAR(200) NOT NULL,
  organization  VARCHAR(200) NOT NULL,
  period        VARCHAR(100) NOT NULL,
  description   VARCHAR(2000) NOT NULL,
  rating        DECIMAL(3, 2) NOT NULL,
  review        VARCHAR(1000) NOT NULL,
  rubro         VARCHAR(100) NOT NULL,
  skills        TEXT NOT NULL DEFAULT '[]'
    CONSTRAINT ck_skills_json CHECK (skills::jsonb IS NOT NULL)
);
CREATE INDEX ix_completed_works_user ON completed_works (user_id);

CREATE TABLE opportunities (
  id              VARCHAR(64)  NOT NULL CONSTRAINT pk_opportunities PRIMARY KEY,
  owner_user_id   VARCHAR(64)  NULL
    CONSTRAINT fk_opportunities_owner REFERENCES users (id) ON DELETE SET NULL,
  type            VARCHAR(20)  NOT NULL
    CONSTRAINT ck_opportunities_type
      CHECK (type IN ('trabajo', 'pasantia', 'beca', 'curso', 'evento', 'competencia')),
  title           VARCHAR(200) NOT NULL,
  organization    VARCHAR(200) NOT NULL,
  publisher_type  VARCHAR(20)  NOT NULL
    CONSTRAINT ck_opportunities_publisher
      CHECK (publisher_type IN ('empresa', 'universidad', 'profesional', 'organizacion')),
  rubro           VARCHAR(100) NOT NULL,
  city            VARCHAR(120) NOT NULL,
  modality        VARCHAR(40)  NOT NULL,
  description     VARCHAR(4000) NOT NULL,
  deadline        TIMESTAMPTZ(3)  NOT NULL,
  requirements    TEXT NOT NULL DEFAULT '[]'
    CONSTRAINT ck_requirements_json CHECK (requirements::jsonb IS NOT NULL),
  benefits        TEXT NOT NULL DEFAULT '[]'
    CONSTRAINT ck_benefits_json CHECK (benefits::jsonb IS NOT NULL),
  tags            TEXT NOT NULL DEFAULT '[]'
    CONSTRAINT ck_tags_json CHECK (tags::jsonb IS NOT NULL),
  compensation    VARCHAR(200) NULL,
  duration        VARCHAR(100) NULL,
  start_date      TIMESTAMPTZ(3)  NULL,
  spots           INT           NULL,
  contact         VARCHAR(200) NULL,
  published_by    VARCHAR(150) NULL,
  is_featured     BOOLEAN           NOT NULL DEFAULT FALSE,
  published_at    TIMESTAMPTZ(3)  NOT NULL DEFAULT now()
);
CREATE INDEX ix_opportunities_owner ON opportunities (owner_user_id);
CREATE INDEX ix_opportunities_type ON opportunities (type, published_at DESC);

-- Una postulación es a la vez «mi postulación» para el profesional y
-- «un postulante» para la empresa: es la misma fila vista desde dos lados.
CREATE TABLE applications (
  id                 VARCHAR(64)  NOT NULL CONSTRAINT pk_applications PRIMARY KEY,
  opportunity_id     VARCHAR(64)  NOT NULL
    CONSTRAINT fk_applications_opportunity REFERENCES opportunities (id) ON DELETE CASCADE,
  applicant_user_id  VARCHAR(64)  NULL
    CONSTRAINT fk_applications_user REFERENCES users (id),
  status             VARCHAR(20)  NOT NULL DEFAULT 'enviada'
    CONSTRAINT ck_applications_status
      CHECK (status IN ('enviada', 'enRevision', 'entrevista', 'aceptada', 'rechazada')),
  message            VARCHAR(2000) NULL,
  cv_file_name       VARCHAR(200) NULL,
  sent_cv            BOOLEAN           NOT NULL DEFAULT FALSE,
  -- Copia del CV en el momento de postular: si luego lo edita, la empresa
  -- sigue viendo el que recibió.
  cv                 TEXT NOT NULL
    CONSTRAINT ck_cv_json CHECK (cv::jsonb IS NOT NULL),
  name               VARCHAR(150) NOT NULL,
  headline           VARCHAR(200) NOT NULL DEFAULT '',
  city               VARCHAR(120) NOT NULL DEFAULT '',
  phone              VARCHAR(30)  NOT NULL DEFAULT '',
  email              VARCHAR(254) NOT NULL DEFAULT '',
  photo              TEXT NULL,
  applied_at         TIMESTAMPTZ(3)  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ(3)  NOT NULL DEFAULT now()
);
CREATE INDEX ix_applications_opportunity ON applications (opportunity_id, applied_at DESC);
CREATE UNIQUE INDEX ux_applications_user_opportunity
  ON applications (applicant_user_id, opportunity_id) WHERE applicant_user_id IS NOT NULL;

CREATE TABLE application_notes (
  id              VARCHAR(64)  NOT NULL CONSTRAINT pk_application_notes PRIMARY KEY,
  application_id  VARCHAR(64)  NOT NULL
    CONSTRAINT fk_application_notes_application REFERENCES applications (id) ON DELETE CASCADE,
  author          VARCHAR(150) NOT NULL,
  text            VARCHAR(2000) NOT NULL,
  created_at      TIMESTAMPTZ(3)  NOT NULL DEFAULT now()
);
CREATE INDEX ix_application_notes_application ON application_notes (application_id, created_at);

CREATE TABLE saved_opportunities (
  user_id         VARCHAR(64) NOT NULL
    CONSTRAINT fk_saved_user REFERENCES users (id) ON DELETE CASCADE,
  opportunity_id  VARCHAR(64) NOT NULL
    CONSTRAINT fk_saved_opportunity REFERENCES opportunities (id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT pk_saved_opportunities PRIMARY KEY (user_id, opportunity_id)
);

CREATE TABLE stores (
  id             VARCHAR(64)  NOT NULL CONSTRAINT pk_stores PRIMARY KEY,
  -- El profesional dueño de la tienda: no hay cuentas aparte de emprendedor.
  owner_user_id  VARCHAR(64)  NOT NULL
    CONSTRAINT fk_stores_owner_user REFERENCES users (id) ON DELETE CASCADE,
  name           VARCHAR(150) NOT NULL,
  slug           VARCHAR(170) NOT NULL,
  description    VARCHAR(3000) NULL,
  category       VARCHAR(60)  NOT NULL DEFAULT 'Otro',
  phone          VARCHAR(30)  NULL,
  department     VARCHAR(60)  NULL,
  province       VARCHAR(120) NULL,
  city           VARCHAR(120) NULL,
  address        VARCHAR(250) NULL,
  hours          VARCHAR(120) NULL,
  rating         DECIMAL(3, 2) NULL,
  reviews_count  INT           NOT NULL DEFAULT 0,
  tags           TEXT NOT NULL DEFAULT '[]'
    CONSTRAINT ck_tags_json CHECK (tags::jsonb IS NOT NULL),
  delivery       BOOLEAN           NOT NULL DEFAULT FALSE,
  owner_name     VARCHAR(150) NULL,
  instagram      VARCHAR(100) NULL,
  image1         TEXT NULL,
  image2         TEXT NULL,
  products       TEXT NOT NULL DEFAULT '[]'
    CONSTRAINT ck_products_json CHECK (products::jsonb IS NOT NULL),
  created_at     TIMESTAMPTZ(3)  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ(3)  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_stores_slug ON stores (slug);
CREATE INDEX ix_stores_owner_user ON stores (owner_user_id);

-- Publicaciones de la comunidad. El autor se guarda como «quién era al
-- publicar» (nombre, rol, ciudad...) además de su id: el id de la persona
-- o 'store:<id>' cuando publica un emprendimiento.
CREATE TABLE posts (
  id          VARCHAR(64)  NOT NULL CONSTRAINT pk_posts PRIMARY KEY,
  author_id   VARCHAR(80)  NOT NULL,
  author      TEXT NOT NULL
    CONSTRAINT ck_author_json CHECK (author::jsonb IS NOT NULL),
  kind        VARCHAR(20)  NOT NULL
    CONSTRAINT ck_posts_kind CHECK (kind IN ('seeking', 'achievement', 'offering', 'news')),
  body        VARCHAR(3000) NOT NULL,
  created_at  TIMESTAMPTZ(3)  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ(3)  NOT NULL DEFAULT now()
);
CREATE INDEX ix_posts_created ON posts (created_at DESC);
CREATE INDEX ix_posts_author ON posts (author_id);

CREATE TABLE post_likes (
  post_id     VARCHAR(64) NOT NULL
    CONSTRAINT fk_post_likes_post REFERENCES posts (id) ON DELETE CASCADE,
  actor_id    VARCHAR(80) NOT NULL,
  created_at  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT pk_post_likes PRIMARY KEY (post_id, actor_id)
);

CREATE TABLE post_comments (
  id          VARCHAR(64)  NOT NULL CONSTRAINT pk_post_comments PRIMARY KEY,
  post_id     VARCHAR(64)  NOT NULL
    CONSTRAINT fk_post_comments_post REFERENCES posts (id) ON DELETE CASCADE,
  author_id   VARCHAR(80)  NOT NULL,
  author      TEXT NOT NULL
    CONSTRAINT ck_author_json CHECK (author::jsonb IS NOT NULL),
  body        VARCHAR(1000) NOT NULL,
  created_at  TIMESTAMPTZ(3)  NOT NULL DEFAULT now()
);
CREATE INDEX ix_post_comments_post ON post_comments (post_id, created_at);

-- Directorio laboral importado del Excel «BASE DE DATOS- INSERCION LABORAL».
CREATE TABLE labor_companies (
  id            VARCHAR(40)  NOT NULL CONSTRAINT pk_labor_companies PRIMARY KEY,
  name          VARCHAR(400) NOT NULL,
  department    VARCHAR(40)  NOT NULL,
  sector        VARCHAR(60)  NOT NULL,
  activity      TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  phone         VARCHAR(400) NOT NULL DEFAULT '',
  email         VARCHAR(400) NOT NULL DEFAULT '',
  source_sheet  VARCHAR(100) NOT NULL,
  source_row    INT           NOT NULL,
  -- Texto normalizado (minúsculas, sin tildes) para buscar sin distinguirlas.
  search_text   TEXT NOT NULL
);
CREATE INDEX ix_labor_companies_filters ON labor_companies (department, sector, name);

CREATE TABLE labor_favorites (
  user_id     VARCHAR(64) NOT NULL
    CONSTRAINT fk_labor_favorites_user REFERENCES users (id) ON DELETE CASCADE,
  company_id  VARCHAR(40) NOT NULL
    CONSTRAINT fk_labor_favorites_company REFERENCES labor_companies (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT pk_labor_favorites PRIMARY KEY (user_id, company_id)
);

-- Negocios por rubro, lo que ofrecen, promociones y consultas de turistas.

CREATE TABLE business_profiles (
  user_id        VARCHAR(64)  NOT NULL CONSTRAINT pk_business_profiles PRIMARY KEY
    CONSTRAINT fk_business_profiles_user REFERENCES users (id) ON DELETE CASCADE,
  sector         VARCHAR(40)  NOT NULL,
  business_type  VARCHAR(40)  NOT NULL,
  tagline        VARCHAR(200) NULL,
  description    VARCHAR(3000) NULL,
  department     VARCHAR(60)  NULL,
  province       VARCHAR(120) NULL,
  city           VARCHAR(120) NULL,
  address        VARCHAR(250) NULL,
  phone          VARCHAR(30)  NULL,
  email          VARCHAR(254) NULL,
  website        VARCHAR(300) NULL,
  hours          VARCHAR(150) NULL,
  cover_image    TEXT NULL,
  -- Datos propios del rubro: estrellas, servicios, horarios de entrada y
  -- salida, idiomas, destinos, tipo de cocina, sedes de una cadena...
  attributes     TEXT NOT NULL DEFAULT '{}'
    CONSTRAINT ck_attributes_json CHECK (attributes::jsonb IS NOT NULL),
  updated_at     TIMESTAMPTZ(3)  NOT NULL DEFAULT now()
);
CREATE INDEX ix_business_profiles_sector ON business_profiles (sector, business_type);
CREATE INDEX ix_business_profiles_location ON business_profiles (department, province);

CREATE TABLE offerings (
  id              VARCHAR(64)  NOT NULL CONSTRAINT pk_offerings PRIMARY KEY,
  owner_user_id   VARCHAR(64)  NOT NULL
    CONSTRAINT fk_offerings_owner REFERENCES users (id) ON DELETE CASCADE,
  kind            VARCHAR(20)  NOT NULL
    CONSTRAINT ck_offerings_kind
      CHECK (kind IN ('room', 'package', 'dish', 'service', 'workshop', 'tour')),
  title           VARCHAR(200) NOT NULL,
  description     VARCHAR(3000) NULL,
  price           VARCHAR(80)  NULL,
  price_amount    DECIMAL(12, 2) NULL,
  unit            VARCHAR(60)  NULL,
  duration        VARCHAR(80)  NULL,
  capacity        INT           NULL,
  department      VARCHAR(60)  NULL,
  province        VARCHAR(120) NULL,
  city            VARCHAR(120) NULL,
  image           TEXT NULL,
  -- Lista de lo que incluye, itinerario, camas, categoría del plato...
  details         TEXT NOT NULL DEFAULT '{}'
    CONSTRAINT ck_details_json CHECK (details::jsonb IS NOT NULL),
  is_active       BOOLEAN           NOT NULL DEFAULT TRUE,
  sort_order      INT           NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ(3)  NOT NULL DEFAULT now()
);
CREATE INDEX ix_offerings_owner ON offerings (owner_user_id, sort_order);
CREATE INDEX ix_offerings_kind ON offerings (kind, department, province);

CREATE TABLE promotions (
  id              VARCHAR(64)  NOT NULL CONSTRAINT pk_promotions PRIMARY KEY,
  owner_user_id   VARCHAR(64)  NOT NULL
    CONSTRAINT fk_promotions_owner REFERENCES users (id) ON DELETE CASCADE,
  store_id        VARCHAR(64)  NULL
    CONSTRAINT fk_promotions_store REFERENCES stores (id),
  title           VARCHAR(200) NOT NULL,
  description     VARCHAR(2000) NULL,
  discount        VARCHAR(60)  NULL,
  valid_until     DATE          NULL,
  department      VARCHAR(60)  NULL,
  province        VARCHAR(120) NULL,
  city            VARCHAR(120) NULL,
  image           TEXT NULL,
  created_at      TIMESTAMPTZ(3)  NOT NULL DEFAULT now()
);
CREATE INDEX ix_promotions_owner ON promotions (owner_user_id);
CREATE INDEX ix_promotions_location ON promotions (department, province, valid_until);

-- Consultas: un turista (o cualquier persona con cuenta) pregunta a una
-- empresa o a un profesional por disponibilidad, precios o un paquete.
CREATE TABLE inquiries (
  id              VARCHAR(64)  NOT NULL CONSTRAINT pk_inquiries PRIMARY KEY,
  from_user_id    VARCHAR(64)  NOT NULL
    CONSTRAINT fk_inquiries_from REFERENCES users (id),
  to_user_id      VARCHAR(64)  NOT NULL
    CONSTRAINT fk_inquiries_to REFERENCES users (id),
  offering_id     VARCHAR(64)  NULL
    CONSTRAINT fk_inquiries_offering REFERENCES offerings (id) ON DELETE SET NULL,
  message         VARCHAR(2000) NOT NULL,
  travel_date     DATE          NULL,
  people          INT           NULL,
  contact_phone   VARCHAR(30)  NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'nueva'
    CONSTRAINT ck_inquiries_status CHECK (status IN ('nueva', 'respondida', 'cerrada')),
  reply           VARCHAR(2000) NULL,
  replied_at      TIMESTAMPTZ(3)  NULL,
  created_at      TIMESTAMPTZ(3)  NOT NULL DEFAULT now()
);
CREATE INDEX ix_inquiries_to ON inquiries (to_user_id, created_at DESC);
CREATE INDEX ix_inquiries_from ON inquiries (from_user_id, created_at DESC);
