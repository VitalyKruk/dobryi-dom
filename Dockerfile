# ——— Сборка фронтенда ———
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ——— API (server/) ———
# Node 24 запускает TypeScript напрямую, сборка не нужна. Данные — в томе /data.
FROM node:24-alpine AS api
RUN apk upgrade --no-cache
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIR=/data
COPY package.json package-lock.json ./
# npm нужен только для установки: в рантайме удаляем его вместе с его уязвимыми зависимостями
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY server ./server
COPY src/lib/seed.ts src/lib/types.ts src/lib/format.ts src/lib/pets-query.ts ./src/lib/
RUN rm -f server/*.test.ts && mkdir -p /data && chown node:node /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1
CMD ["node", "server/index.ts"]

# ——— Раздача статики (цель по умолчанию) ———
# nginx-unprivileged работает от пользователя nginx (uid 101) и слушает 8080 — root не нужен
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
USER root
# Базовый образ отстаёт от исправлений Alpine — подтягиваем их при сборке
RUN apk upgrade --no-cache
USER 101
COPY --chown=101:101 nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
