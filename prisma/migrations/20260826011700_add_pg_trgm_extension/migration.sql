-- Extensión necesaria para índices de similitud de texto (trigram).
-- Creada en su propia migración porque CONCURRENTLY (en la migración
-- siguiente) no puede ejecutarse dentro de una transacción, y Prisma
-- envuelve cada migración en transacción por defecto.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
