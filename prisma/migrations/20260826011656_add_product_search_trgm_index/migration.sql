-- Este índice fue creado manualmente y NO está declarado en schema.prisma
-- como extensión de Prisma (postgresqlExtensions fue deprecado en 6.16).
-- El índice SÍ está declarado en schema.prisma con @@index para evitar
-- que Prisma detecte "drift" y quiera eliminarlo en migraciones futuras.
-- Si en el futuro alguien corre `prisma migrate dev` y Prisma sugiere
-- eliminar este índice, NO lo hagan — es un índice manual necesario.

-- Extensión necesaria para índices de similitud de texto (trigram)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index con trigram ops para acelerar ILIKE '%término%' en búsquedas
-- de productos por nombre (pattern: contains + insensitive en Prisma).
-- CONCURRENTLY evita bloquear escrituras sobre "products" mientras se
-- construye el índice — importante en producción aunque hoy el catálogo sea chico.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_products_name_trgm"
  ON "products" USING GIN ("name" gin_trgm_ops);
