FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# El admin-sql agent lee docs/ANALYTICS_SCHEMA.md en runtime como schema card.
COPY --from=build /app/docs ./docs
# Necesarios para `npm run seed` desde dentro del contenedor:
# scripts/seed.ts compila on-the-fly con ts-node y resuelve los aliases @/...
# vía tsconfig-paths usando tsconfig.scripts.json + el código en src/.
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/tsconfig.scripts.json ./tsconfig.scripts.json
EXPOSE 3000
CMD ["npm", "start"]
