# syntax=docker/dockerfile:1

# ---------- Stage 1: build ----------
FROM node:24-slim AS builder
WORKDIR /app

# npm ci completo (con devDependencies): hace falta typescript para
# compilar y el CLI de prisma para "prisma generate" (postinstall).
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Se copian los node_modules YA resueltos del builder (incluye
# devDependencies) en vez de reinstalar con --omit=dev en este stage.
# Motivo: el postinstall (prisma generate) se dispara en cualquier
# "npm ci" de este proyecto sin importar --omit=dev, y fallaría acá
# por no encontrar el CLI de prisma (vive en devDependencies, correcto
# para no incluirlo en runtime). Copiar evita ese problema sin trucos
# de --ignore-scripts + copiar solo el cliente generado. Trade-off
# consciente: la imagen pesa más de lo estrictamente necesario —
# optimizarlo queda como mejora futura si el tamaño se vuelve un
# problema real.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "--import", "./dist/instrument.js", "dist/server.js"]
