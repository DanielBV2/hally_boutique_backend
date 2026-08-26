-- GIN index con trigram ops para acelerar ILIKE '%término%' en búsquedas
-- de productos por nombre (pattern: contains + insensitive en Prisma).
-- CONCURRENTLY evita bloquear escrituras sobre "products" mientras se
-- construye el índice — importante en producción aunque hoy el catálogo sea chico.
-- Este índice NO está declarado en schema.prisma (postgresqlExtensions fue
-- deprecado en Prisma 6.16), pero el @@index SÍ está en schema.prisma
-- para evitar que Prisma detecte drift y quiera eliminarlo.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_products_name_trgm"
  ON "products" USING GIN ("name" gin_trgm_ops);
