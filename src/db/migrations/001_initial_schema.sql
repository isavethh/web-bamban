-- Esquema inicial de Tucan.
-- Los identificadores son NVARCHAR para conservar los ids legibles de los
-- datos de demostración ('t1', 'e1'...); los nuevos registros usan UUID.
-- Las listas de texto (habilidades, etiquetas, productos...) se guardan como
-- JSON validado con ISJSON: se leen y se escriben siempre enteras.

CREATE TABLE users (
  id                    NVARCHAR(64)  NOT NULL CONSTRAINT pk_users PRIMARY KEY,
  email                 NVARCHAR(254) NOT NULL,
  password_hash         NVARCHAR(100) NOT NULL,
  role                  NVARCHAR(20)  NOT NULL
    CONSTRAINT ck_users_role CHECK (role IN ('seeker', 'serviceSeeker', 'employer')),
  name                  NVARCHAR(150) NOT NULL,
  phone                 NVARCHAR(30)  NULL,
  city                  NVARCHAR(120) NULL,
  department            NVARCHAR(60)  NULL,
  province              NVARCHAR(120) NULL,
  photo                 NVARCHAR(MAX) NULL,
  career                NVARCHAR(150) NULL,
  specialty             NVARCHAR(150) NULL,
  summary               NVARCHAR(2000) NULL,
  company_name          NVARCHAR(150) NULL,
  tax_id                NVARCHAR(30)  NULL,
  is_employer_verified  BIT           NOT NULL CONSTRAINT df_users_verified DEFAULT 0,
  is_profile_public     BIT           NOT NULL CONSTRAINT df_users_public DEFAULT 1,
  rating                DECIMAL(3, 2) NULL,
  details               NVARCHAR(MAX) NOT NULL CONSTRAINT df_users_details DEFAULT N'{}'
    CONSTRAINT ck_users_details CHECK (ISJSON(details) = 1),
  is_demo               BIT           NOT NULL CONSTRAINT df_users_demo DEFAULT 0,
  created_at            DATETIME2(3)  NOT NULL CONSTRAINT df_users_created DEFAULT SYSUTCDATETIME(),
  updated_at            DATETIME2(3)  NOT NULL CONSTRAINT df_users_updated DEFAULT SYSUTCDATETIME()
);
CREATE UNIQUE INDEX ux_users_email ON users (email);
CREATE INDEX ix_users_role ON users (role) INCLUDE (is_profile_public);
GO

CREATE TABLE cvs (
  user_id     NVARCHAR(64)  NOT NULL CONSTRAINT pk_cvs PRIMARY KEY
    CONSTRAINT fk_cvs_user REFERENCES users (id) ON DELETE CASCADE,
  slug        NVARCHAR(160) NOT NULL,
  data        NVARCHAR(MAX) NOT NULL CONSTRAINT ck_cvs_data CHECK (ISJSON(data) = 1),
  updated_at  DATETIME2(3)  NOT NULL CONSTRAINT df_cvs_updated DEFAULT SYSUTCDATETIME()
);
CREATE UNIQUE INDEX ux_cvs_slug ON cvs (slug);
GO

CREATE TABLE completed_works (
  id            NVARCHAR(64)  NOT NULL CONSTRAINT pk_completed_works PRIMARY KEY,
  user_id       NVARCHAR(64)  NOT NULL
    CONSTRAINT fk_completed_works_user REFERENCES users (id) ON DELETE CASCADE,
  title         NVARCHAR(200) NOT NULL,
  organization  NVARCHAR(200) NOT NULL,
  period        NVARCHAR(100) NOT NULL,
  description   NVARCHAR(2000) NOT NULL,
  rating        DECIMAL(3, 2) NOT NULL,
  review        NVARCHAR(1000) NOT NULL,
  rubro         NVARCHAR(100) NOT NULL,
  skills        NVARCHAR(MAX) NOT NULL CONSTRAINT df_completed_works_skills DEFAULT N'[]'
    CONSTRAINT ck_completed_works_skills CHECK (ISJSON(skills) = 1)
);
CREATE INDEX ix_completed_works_user ON completed_works (user_id);
GO

CREATE TABLE opportunities (
  id              NVARCHAR(64)  NOT NULL CONSTRAINT pk_opportunities PRIMARY KEY,
  owner_user_id   NVARCHAR(64)  NULL
    CONSTRAINT fk_opportunities_owner REFERENCES users (id) ON DELETE SET NULL,
  type            NVARCHAR(20)  NOT NULL
    CONSTRAINT ck_opportunities_type
      CHECK (type IN ('trabajo', 'pasantia', 'beca', 'curso', 'evento', 'competencia')),
  title           NVARCHAR(200) NOT NULL,
  organization    NVARCHAR(200) NOT NULL,
  publisher_type  NVARCHAR(20)  NOT NULL
    CONSTRAINT ck_opportunities_publisher
      CHECK (publisher_type IN ('empresa', 'universidad', 'profesional', 'organizacion')),
  rubro           NVARCHAR(100) NOT NULL,
  city            NVARCHAR(120) NOT NULL,
  modality        NVARCHAR(40)  NOT NULL,
  description     NVARCHAR(4000) NOT NULL,
  deadline        DATETIME2(3)  NOT NULL,
  requirements    NVARCHAR(MAX) NOT NULL CONSTRAINT df_opp_req DEFAULT N'[]'
    CONSTRAINT ck_opp_req CHECK (ISJSON(requirements) = 1),
  benefits        NVARCHAR(MAX) NOT NULL CONSTRAINT df_opp_ben DEFAULT N'[]'
    CONSTRAINT ck_opp_ben CHECK (ISJSON(benefits) = 1),
  tags            NVARCHAR(MAX) NOT NULL CONSTRAINT df_opp_tags DEFAULT N'[]'
    CONSTRAINT ck_opp_tags CHECK (ISJSON(tags) = 1),
  compensation    NVARCHAR(200) NULL,
  duration        NVARCHAR(100) NULL,
  start_date      DATETIME2(3)  NULL,
  spots           INT           NULL,
  contact         NVARCHAR(200) NULL,
  published_by    NVARCHAR(150) NULL,
  is_featured     BIT           NOT NULL CONSTRAINT df_opp_featured DEFAULT 0,
  published_at    DATETIME2(3)  NOT NULL CONSTRAINT df_opp_published DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_opportunities_owner ON opportunities (owner_user_id);
CREATE INDEX ix_opportunities_type ON opportunities (type, published_at DESC);
GO

-- Una postulación es a la vez «mi postulación» para el profesional y
-- «un postulante» para la empresa: es la misma fila vista desde dos lados.
CREATE TABLE applications (
  id                 NVARCHAR(64)  NOT NULL CONSTRAINT pk_applications PRIMARY KEY,
  opportunity_id     NVARCHAR(64)  NOT NULL
    CONSTRAINT fk_applications_opportunity REFERENCES opportunities (id) ON DELETE CASCADE,
  applicant_user_id  NVARCHAR(64)  NULL
    CONSTRAINT fk_applications_user REFERENCES users (id),
  status             NVARCHAR(20)  NOT NULL CONSTRAINT df_applications_status DEFAULT 'enviada'
    CONSTRAINT ck_applications_status
      CHECK (status IN ('enviada', 'enRevision', 'entrevista', 'aceptada', 'rechazada')),
  message            NVARCHAR(2000) NULL,
  cv_file_name       NVARCHAR(200) NULL,
  sent_cv            BIT           NOT NULL CONSTRAINT df_applications_sent_cv DEFAULT 0,
  -- Copia del CV en el momento de postular: si luego lo edita, la empresa
  -- sigue viendo el que recibió.
  cv                 NVARCHAR(MAX) NOT NULL CONSTRAINT ck_applications_cv CHECK (ISJSON(cv) = 1),
  name               NVARCHAR(150) NOT NULL,
  headline           NVARCHAR(200) NOT NULL CONSTRAINT df_applications_headline DEFAULT N'',
  city               NVARCHAR(120) NOT NULL CONSTRAINT df_applications_city DEFAULT N'',
  phone              NVARCHAR(30)  NOT NULL CONSTRAINT df_applications_phone DEFAULT N'',
  email              NVARCHAR(254) NOT NULL CONSTRAINT df_applications_email DEFAULT N'',
  photo              NVARCHAR(MAX) NULL,
  applied_at         DATETIME2(3)  NOT NULL CONSTRAINT df_applications_applied DEFAULT SYSUTCDATETIME(),
  updated_at         DATETIME2(3)  NOT NULL CONSTRAINT df_applications_updated DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_applications_opportunity ON applications (opportunity_id, applied_at DESC);
CREATE UNIQUE INDEX ux_applications_user_opportunity
  ON applications (applicant_user_id, opportunity_id) WHERE applicant_user_id IS NOT NULL;
GO

CREATE TABLE application_notes (
  id              NVARCHAR(64)  NOT NULL CONSTRAINT pk_application_notes PRIMARY KEY,
  application_id  NVARCHAR(64)  NOT NULL
    CONSTRAINT fk_application_notes_application REFERENCES applications (id) ON DELETE CASCADE,
  author          NVARCHAR(150) NOT NULL,
  text            NVARCHAR(2000) NOT NULL,
  created_at      DATETIME2(3)  NOT NULL CONSTRAINT df_application_notes_created DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_application_notes_application ON application_notes (application_id, created_at);
GO

CREATE TABLE saved_opportunities (
  user_id         NVARCHAR(64) NOT NULL
    CONSTRAINT fk_saved_user REFERENCES users (id) ON DELETE CASCADE,
  opportunity_id  NVARCHAR(64) NOT NULL
    CONSTRAINT fk_saved_opportunity REFERENCES opportunities (id) ON DELETE CASCADE,
  created_at      DATETIME2(3) NOT NULL CONSTRAINT df_saved_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT pk_saved_opportunities PRIMARY KEY (user_id, opportunity_id)
);
GO

-- Cuentas de emprendedor: ingresan con usuario (no correo) y una cuenta
-- puede tener varias tiendas.
CREATE TABLE store_owners (
  id             NVARCHAR(64)  NOT NULL CONSTRAINT pk_store_owners PRIMARY KEY,
  username       NVARCHAR(60)  NOT NULL,
  password_hash  NVARCHAR(100) NOT NULL,
  display_name   NVARCHAR(150) NULL,
  is_demo        BIT           NOT NULL CONSTRAINT df_store_owners_demo DEFAULT 0,
  created_at     DATETIME2(3)  NOT NULL CONSTRAINT df_store_owners_created DEFAULT SYSUTCDATETIME()
);
CREATE UNIQUE INDEX ux_store_owners_username ON store_owners (username);
GO

CREATE TABLE stores (
  id             NVARCHAR(64)  NOT NULL CONSTRAINT pk_stores PRIMARY KEY,
  owner_id       NVARCHAR(64)  NOT NULL
    CONSTRAINT fk_stores_owner REFERENCES store_owners (id) ON DELETE CASCADE,
  name           NVARCHAR(150) NOT NULL,
  slug           NVARCHAR(170) NOT NULL,
  description    NVARCHAR(3000) NULL,
  category       NVARCHAR(60)  NOT NULL CONSTRAINT df_stores_category DEFAULT N'Otro',
  phone          NVARCHAR(30)  NULL,
  city           NVARCHAR(120) NULL,
  address        NVARCHAR(250) NULL,
  hours          NVARCHAR(120) NULL,
  rating         DECIMAL(3, 2) NULL,
  reviews_count  INT           NOT NULL CONSTRAINT df_stores_reviews DEFAULT 0,
  tags           NVARCHAR(MAX) NOT NULL CONSTRAINT df_stores_tags DEFAULT N'[]'
    CONSTRAINT ck_stores_tags CHECK (ISJSON(tags) = 1),
  delivery       BIT           NOT NULL CONSTRAINT df_stores_delivery DEFAULT 0,
  owner_name     NVARCHAR(150) NULL,
  instagram      NVARCHAR(100) NULL,
  image1         NVARCHAR(MAX) NULL,
  image2         NVARCHAR(MAX) NULL,
  products       NVARCHAR(MAX) NOT NULL CONSTRAINT df_stores_products DEFAULT N'[]'
    CONSTRAINT ck_stores_products CHECK (ISJSON(products) = 1),
  created_at     DATETIME2(3)  NOT NULL CONSTRAINT df_stores_created DEFAULT SYSUTCDATETIME(),
  updated_at     DATETIME2(3)  NOT NULL CONSTRAINT df_stores_updated DEFAULT SYSUTCDATETIME()
);
CREATE UNIQUE INDEX ux_stores_slug ON stores (slug);
CREATE INDEX ix_stores_owner ON stores (owner_id);
GO

-- Publicaciones de la comunidad. El autor se guarda como «quién era al
-- publicar» (nombre, rol, ciudad...) además de su id: el id de la persona
-- o 'store:<id>' cuando publica un emprendimiento.
CREATE TABLE posts (
  id          NVARCHAR(64)  NOT NULL CONSTRAINT pk_posts PRIMARY KEY,
  author_id   NVARCHAR(80)  NOT NULL,
  author      NVARCHAR(MAX) NOT NULL CONSTRAINT ck_posts_author CHECK (ISJSON(author) = 1),
  kind        NVARCHAR(20)  NOT NULL
    CONSTRAINT ck_posts_kind CHECK (kind IN ('seeking', 'achievement', 'offering', 'news')),
  body        NVARCHAR(3000) NOT NULL,
  created_at  DATETIME2(3)  NOT NULL CONSTRAINT df_posts_created DEFAULT SYSUTCDATETIME(),
  updated_at  DATETIME2(3)  NOT NULL CONSTRAINT df_posts_updated DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_posts_created ON posts (created_at DESC);
CREATE INDEX ix_posts_author ON posts (author_id);
GO

CREATE TABLE post_likes (
  post_id     NVARCHAR(64) NOT NULL
    CONSTRAINT fk_post_likes_post REFERENCES posts (id) ON DELETE CASCADE,
  actor_id    NVARCHAR(80) NOT NULL,
  created_at  DATETIME2(3) NOT NULL CONSTRAINT df_post_likes_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT pk_post_likes PRIMARY KEY (post_id, actor_id)
);
GO

CREATE TABLE post_comments (
  id          NVARCHAR(64)  NOT NULL CONSTRAINT pk_post_comments PRIMARY KEY,
  post_id     NVARCHAR(64)  NOT NULL
    CONSTRAINT fk_post_comments_post REFERENCES posts (id) ON DELETE CASCADE,
  author_id   NVARCHAR(80)  NOT NULL,
  author      NVARCHAR(MAX) NOT NULL CONSTRAINT ck_post_comments_author CHECK (ISJSON(author) = 1),
  body        NVARCHAR(1000) NOT NULL,
  created_at  DATETIME2(3)  NOT NULL CONSTRAINT df_post_comments_created DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_post_comments_post ON post_comments (post_id, created_at);
GO

-- Directorio laboral importado del Excel «BASE DE DATOS- INSERCION LABORAL».
CREATE TABLE labor_companies (
  id            NVARCHAR(40)  NOT NULL CONSTRAINT pk_labor_companies PRIMARY KEY,
  name          NVARCHAR(400) NOT NULL,
  department    NVARCHAR(40)  NOT NULL,
  sector        NVARCHAR(60)  NOT NULL,
  activity      NVARCHAR(MAX) NOT NULL CONSTRAINT df_labor_activity DEFAULT N'',
  address       NVARCHAR(MAX) NOT NULL CONSTRAINT df_labor_address DEFAULT N'',
  phone         NVARCHAR(400) NOT NULL CONSTRAINT df_labor_phone DEFAULT N'',
  email         NVARCHAR(400) NOT NULL CONSTRAINT df_labor_email DEFAULT N'',
  source_sheet  NVARCHAR(100) NOT NULL,
  source_row    INT           NOT NULL,
  -- Texto normalizado (minúsculas, sin tildes) para buscar sin distinguirlas.
  search_text   NVARCHAR(MAX) NOT NULL
);
CREATE INDEX ix_labor_companies_filters ON labor_companies (department, sector, name);
GO

CREATE TABLE labor_favorites (
  user_id     NVARCHAR(64) NOT NULL
    CONSTRAINT fk_labor_favorites_user REFERENCES users (id) ON DELETE CASCADE,
  company_id  NVARCHAR(40) NOT NULL
    CONSTRAINT fk_labor_favorites_company REFERENCES labor_companies (id) ON DELETE CASCADE,
  created_at  DATETIME2(3) NOT NULL CONSTRAINT df_labor_favorites_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT pk_labor_favorites PRIMARY KEY (user_id, company_id)
);
GO
