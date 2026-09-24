# ——— Сборка ———
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ——— Раздача статики ———
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
