-- Turistas, negocios por rubro y emprendimientos de profesionales.
--
-- 1. Nuevo rol `tourist`.
-- 2. Perfil de negocio de cada empresa: rubro, tipo y datos que dependen del
--    rubro (estrellas y servicios de un hotel, idiomas de una agencia...).
-- 3. Lo que ofrecen empresas y profesionales (habitaciones, paquetes,
--    platos, talleres, tours), promociones y consultas de los turistas.
-- 4. Las tiendas pasan a ser de un profesional: ya no hay cuentas aparte de
--    emprendedor. Las cuentas que existían se convierten en profesionales.

ALTER TABLE users DROP CONSTRAINT ck_users_role;
ALTER TABLE users ADD CONSTRAINT ck_users_role
  CHECK (role IN ('seeker', 'serviceSeeker', 'employer', 'tourist'));
GO

CREATE TABLE business_profiles (
  user_id        NVARCHAR(64)  NOT NULL CONSTRAINT pk_business_profiles PRIMARY KEY
    CONSTRAINT fk_business_profiles_user REFERENCES users (id) ON DELETE CASCADE,
  sector         NVARCHAR(40)  NOT NULL,
  business_type  NVARCHAR(40)  NOT NULL,
  tagline        NVARCHAR(200) NULL,
  description    NVARCHAR(3000) NULL,
  department     NVARCHAR(60)  NULL,
  province       NVARCHAR(120) NULL,
  city           NVARCHAR(120) NULL,
  address        NVARCHAR(250) NULL,
  phone          NVARCHAR(30)  NULL,
  email          NVARCHAR(254) NULL,
  website        NVARCHAR(300) NULL,
  hours          NVARCHAR(150) NULL,
  cover_image    NVARCHAR(MAX) NULL,
  -- Datos propios del rubro: estrellas, servicios, horarios de entrada y
  -- salida, idiomas, destinos, tipo de cocina, sedes de una cadena...
  attributes     NVARCHAR(MAX) NOT NULL CONSTRAINT df_business_attributes DEFAULT N'{}'
    CONSTRAINT ck_business_attributes CHECK (ISJSON(attributes) = 1),
  updated_at     DATETIME2(3)  NOT NULL CONSTRAINT df_business_updated DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_business_profiles_sector ON business_profiles (sector, business_type);
CREATE INDEX ix_business_profiles_location ON business_profiles (department, province);
GO

CREATE TABLE offerings (
  id              NVARCHAR(64)  NOT NULL CONSTRAINT pk_offerings PRIMARY KEY,
  owner_user_id   NVARCHAR(64)  NOT NULL
    CONSTRAINT fk_offerings_owner REFERENCES users (id) ON DELETE CASCADE,
  kind            NVARCHAR(20)  NOT NULL
    CONSTRAINT ck_offerings_kind
      CHECK (kind IN ('room', 'package', 'dish', 'service', 'workshop', 'tour')),
  title           NVARCHAR(200) NOT NULL,
  description     NVARCHAR(3000) NULL,
  price           NVARCHAR(80)  NULL,
  price_amount    DECIMAL(12, 2) NULL,
  unit            NVARCHAR(60)  NULL,
  duration        NVARCHAR(80)  NULL,
  capacity        INT           NULL,
  department      NVARCHAR(60)  NULL,
  province        NVARCHAR(120) NULL,
  city            NVARCHAR(120) NULL,
  image           NVARCHAR(MAX) NULL,
  -- Lista de lo que incluye, itinerario, camas, categoría del plato...
  details         NVARCHAR(MAX) NOT NULL CONSTRAINT df_offerings_details DEFAULT N'{}'
    CONSTRAINT ck_offerings_details CHECK (ISJSON(details) = 1),
  is_active       BIT           NOT NULL CONSTRAINT df_offerings_active DEFAULT 1,
  sort_order      INT           NOT NULL CONSTRAINT df_offerings_sort DEFAULT 0,
  created_at      DATETIME2(3)  NOT NULL CONSTRAINT df_offerings_created DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_offerings_owner ON offerings (owner_user_id, sort_order);
CREATE INDEX ix_offerings_kind ON offerings (kind, department, province);
GO

CREATE TABLE promotions (
  id              NVARCHAR(64)  NOT NULL CONSTRAINT pk_promotions PRIMARY KEY,
  owner_user_id   NVARCHAR(64)  NOT NULL
    CONSTRAINT fk_promotions_owner REFERENCES users (id) ON DELETE CASCADE,
  store_id        NVARCHAR(64)  NULL
    CONSTRAINT fk_promotions_store REFERENCES stores (id),
  title           NVARCHAR(200) NOT NULL,
  description     NVARCHAR(2000) NULL,
  discount        NVARCHAR(60)  NULL,
  valid_until     DATE          NULL,
  department      NVARCHAR(60)  NULL,
  province        NVARCHAR(120) NULL,
  city            NVARCHAR(120) NULL,
  image           NVARCHAR(MAX) NULL,
  created_at      DATETIME2(3)  NOT NULL CONSTRAINT df_promotions_created DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_promotions_owner ON promotions (owner_user_id);
CREATE INDEX ix_promotions_location ON promotions (department, province, valid_until);
GO

-- Consultas: un turista (o cualquier persona con cuenta) pregunta a una
-- empresa o a un profesional por disponibilidad, precios o un paquete.
CREATE TABLE inquiries (
  id              NVARCHAR(64)  NOT NULL CONSTRAINT pk_inquiries PRIMARY KEY,
  from_user_id    NVARCHAR(64)  NOT NULL
    CONSTRAINT fk_inquiries_from REFERENCES users (id),
  to_user_id      NVARCHAR(64)  NOT NULL
    CONSTRAINT fk_inquiries_to REFERENCES users (id),
  offering_id     NVARCHAR(64)  NULL
    CONSTRAINT fk_inquiries_offering REFERENCES offerings (id) ON DELETE SET NULL,
  message         NVARCHAR(2000) NOT NULL,
  travel_date     DATE          NULL,
  people          INT           NULL,
  contact_phone   NVARCHAR(30)  NULL,
  status          NVARCHAR(20)  NOT NULL CONSTRAINT df_inquiries_status DEFAULT 'nueva'
    CONSTRAINT ck_inquiries_status CHECK (status IN ('nueva', 'respondida', 'cerrada')),
  reply           NVARCHAR(2000) NULL,
  replied_at      DATETIME2(3)  NULL,
  created_at      DATETIME2(3)  NOT NULL CONSTRAINT df_inquiries_created DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_inquiries_to ON inquiries (to_user_id, created_at DESC);
CREATE INDEX ix_inquiries_from ON inquiries (from_user_id, created_at DESC);
GO

-- Tiendas de profesionales.
ALTER TABLE stores ADD
  owner_user_id NVARCHAR(64) NULL,
  department    NVARCHAR(60) NULL,
  province      NVARCHAR(120) NULL;
GO

INSERT INTO users (id, email, password_hash, role, name, city, specialty, is_demo)
SELECT o.id,
       LOWER(o.username) + N'@emprendedores.tucan.bo',
       o.password_hash,
       'seeker',
       COALESCE(o.display_name, o.username),
       (SELECT TOP (1) s.city FROM stores s WHERE s.owner_id = o.id),
       (SELECT TOP (1) s.category FROM stores s WHERE s.owner_id = o.id),
       o.is_demo
FROM store_owners o
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = o.id);

UPDATE stores SET owner_user_id = owner_id;
GO

ALTER TABLE stores DROP CONSTRAINT fk_stores_owner;
DROP INDEX ix_stores_owner ON stores;
ALTER TABLE stores DROP COLUMN owner_id;
ALTER TABLE stores ALTER COLUMN owner_user_id NVARCHAR(64) NOT NULL;
ALTER TABLE stores ADD CONSTRAINT fk_stores_owner_user
  FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE;
CREATE INDEX ix_stores_owner_user ON stores (owner_user_id);
DROP TABLE store_owners;
GO
