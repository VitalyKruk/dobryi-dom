# Прод: выкладка на сервер

Сайт: https://dobryi-dom-s-hvostikamy.ru. Сервер — Rocky Linux 9, вход по SSH только по ключу (`rocky@171.22.180.208`, команды Docker — через `sudo`).

```
интернет → Caddy :80/:443 (HTTPS, Let's Encrypt) → web (nginx, статика) → api (Node) → db (Postgres)
```

- **Снаружи открыты** только 22, 80 и 443 (firewalld). Порты web, api и db на хост не публикуются.
- **Демо-вход выключен.** На `/login` нет кнопок демо-входа (`VITE_DEMO_LOGIN=0`), API не принимает демо-пароль (`DEMO_LOGIN=0`). Персоналу пароли задаёт [server/set-password.ts](../server/set-password.ts).
- **Данные** лежат в томах Docker: `dobryi-dom_db-data` (Postgres), `dobryi-dom_caddy-data` (сертификаты).

## Что лежит на сервере

`/opt/dobryi-dom` (владелец root):

| Файл                       | Откуда                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `compose.yaml`             | из репозитория                                                                                         |
| `deploy/compose.prod.yaml` | из репозитория: Caddy, закрытые порты, прод-настройки                                                  |
| `deploy/Caddyfile`         | из репозитория                                                                                         |
| `.env` (права 600)         | только на сервере: `COMPOSE_FILE`, `DOMAIN`, `IMAGE_TAG`, `POSTGRES_PASSWORD` — в git его не добавлять |

## Обновление сайта

Образы собираются на своём компьютере: на сервере 2 ГБ памяти, сборки фронтенда там нет. Контекст сборки — закоммиченный код (`git archive`), незакоммиченные правки в образ не попадут.

```bash
TAG=$(git rev-parse --short HEAD)
git archive HEAD | docker build --target api -t dobryi-dom-api:$TAG --build-arg APK_UPGRADE_DATE=$(date +%F) -
git archive HEAD | docker build -t dobryi-dom:$TAG --build-arg VITE_DEMO_LOGIN=0 --build-arg APK_UPGRADE_DATE=$(date +%F) -
docker save dobryi-dom:$TAG dobryi-dom-api:$TAG | gzip | ssh rocky@171.22.180.208 "gunzip | sudo docker load"
```

На сервере: в `/opt/dobryi-dom/.env` поменять `IMAGE_TAG` на новый тег и перезапустить.

```bash
cd /opt/dobryi-dom
sudo sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<тег>/" .env
sudo docker compose up -d
```

Откат — то же самое с прошлым тегом: старые образы остаются на сервере (`sudo docker image ls dobryi-dom`).

Если менялись `compose.yaml`, `deploy/compose.prod.yaml` или `deploy/Caddyfile`, их нужно скопировать в `/opt/dobryi-dom` (`scp` во временную папку, затем `sudo install -m 644`). После правки Caddyfile: `sudo docker compose restart caddy`.

## Пароли персонала

```bash
cd /opt/dobryi-dom
sudo docker compose stop api
sudo docker compose run --rm --no-deps api node server/set-password.ts olga@dobryi-dom.ru
sudo docker compose start api
```

Пароль печатается один раз. API на это время останавливается, потому что держит данные в памяти. Сессии пользователя закрываются.

## Логи и состояние

```bash
sudo docker compose ps
sudo docker compose logs -f api      # JSON-логи API
sudo docker compose logs caddy       # выпуск и продление сертификата
```

Логи контейнеров ротируются: не больше 3 файлов по 10 МБ на контейнер (`/etc/docker/daemon.json`).

## Настройка сервера (уже сделана)

- **firewalld**, зона `public`: только `ssh`, `http`, `https`, `443/udp` (HTTP/3). Системный rpcbind слушает порт 111, но снаружи он закрыт файрволом.
- **SSH**: вход по паролю выключен (`/etc/ssh/sshd_config.d/01-hardening.conf`).
- **Обновления безопасности** ставятся сами: `dnf-automatic` (`upgrade_type = security`), таймер `dnf-automatic.timer`. Перезагрузки нет — после обновления ядра сервер нужно перезагрузить вручную (`sudo needs-restarting -r` подскажет).
- **Docker** — из официального репозитория `download.docker.com`. Пользователь `rocky` не в группе `docker` (она равна root), команды — через `sudo`.
