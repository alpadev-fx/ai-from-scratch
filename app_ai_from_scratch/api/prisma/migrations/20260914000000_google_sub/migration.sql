-- Identidad de Google, opcional: una cuenta puede no tener ninguna.
--
-- UNIQUE y no solo indexada: dos filas con el mismo `sub` significaría que una
-- misma identidad de Google abre dos cuentas distintas, y cual de las dos abre
-- dependeria del orden de la consulta. El indice lo impide en la base, que es el
-- unico sitio donde no depende de que el codigo se acuerde.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_sub" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_google_sub_key" ON "public"."users"("google_sub");
