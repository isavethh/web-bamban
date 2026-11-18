-- Seguridad por filas en todas las tablas, sin políticas.
--
-- Supabase publica el esquema `public` por su API de datos (PostgREST): una
-- tabla sin seguridad por filas queda legible y editable con la clave pública
-- del proyecto. La app no usa esa API; toda lectura y escritura pasa por este
-- backend, que se conecta como dueño de las tablas y por eso no está sujeto a
-- estas reglas. Con la seguridad activada y ninguna política, la API de datos
-- no puede ver ni tocar nada.
--
-- En un PostgreSQL normal (local, CI) esto no cambia el comportamiento.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE completed_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
