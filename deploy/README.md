# Сборка и выкатка на прод

Регламент выкатки «Добрый дом» на https://dobryi-dom-s-hvostikamy.ru. Его цель: каждое следующее обновление проходит одним и тем же проверенным путём, без догадок. Команды проверены на этом сервере 2026-10-14; восстановление базы и откат конфигов пока не выполнялись — они отмечены. Локальные команды выполняются в Git Bash из корня репозитория, серверные — через `ssh`.

## Шпаргалка

Обычная выкатка, если менялся только код приложения (проверьте это по [разделу 3](#3-перед-выкаткой)). Подробности — в разделах, указанных в комментариях.

```bash
SERVER=rocky@171.22.180.208
TAG=$(git rev-parse --short HEAD)
PROD_TAG=$(ssh $SERVER "sudo grep ^IMAGE_TAG= /opt/dobryi-dom/.env | cut -d= -f2")   # для отката

# Раздел 4 — сборка из закоммиченного кода
git archive HEAD | docker build --target api -t dobryi-dom-api:$TAG --build-arg APK_UPGRADE_DATE=$(date +%F) -
git archive HEAD | docker build -t dobryi-dom:$TAG --build-arg VITE_DEMO_LOGIN=0 --build-arg APK_UPGRADE_DATE=$(date +%F) -

# Раздел 5 — передача на сервер и резервная копия базы
docker save dobryi-dom:$TAG dobryi-dom-api:$TAG | gzip | ssh $SERVER "gunzip | sudo docker load"
ssh $SERVER 'cd /opt/dobryi-dom && sudo sh -c "umask 077; docker compose exec -T db pg_dump -U dobryi -Fc dobryi_dom > /root/dobryi-dom-$(date +%F-%H%M).dump"'

# Раздел 7 — переключение версии
ssh $SERVER "cd /opt/dobryi-dom && sudo sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/' .env && sudo docker compose up -d --wait"
```

После этого — [проверка](#проверка-после-выкатки). Если что-то не так — [откат](#8-откат).

## 1. Как устроен прод

```
интернет → Caddy :80/:443 (HTTPS, Let's Encrypt) → web (nginx, статика) → api (Node) → db (Postgres)
```

| Что             | Значение                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------- |
| Домен           | `dobryi-dom-s-hvostikamy.ru`, `www` перенаправляется на основной                         |
| DNS             | A-записи домена и `www` → `171.22.180.208`. AAAA нет: у сервера нет IPv6                 |
| Сервер          | Rocky Linux 9, 1 vCPU, 2 ГБ памяти без swap, 29 ГБ диска                                 |
| Вход            | `ssh rocky@171.22.180.208`, только по ключу. sudo без пароля. root по SSH не пускает     |
| Проект          | `/opt/dobryi-dom`, владелец root, права 755                                              |
| Версия на проде | `IMAGE_TAG` в `/opt/dobryi-dom/.env` — короткий хеш коммита, из которого собраны образы  |
| Сертификат      | Let's Encrypt, выпускает и продлевает Caddy сам. Хранится в томе `dobryi-dom_caddy-data` |

**Файлы на сервере** (`/opt/dobryi-dom`):

| Файл                       | Откуда                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `compose.yaml`             | копия из репозитория                                                                                                      |
| `deploy/compose.prod.yaml` | копия из репозитория: Caddy, закрытые порты, прод-переменные                                                              |
| `deploy/Caddyfile`         | копия из репозитория                                                                                                      |
| `.env` (права 600)         | только на сервере: `COMPOSE_FILE`, `COMPOSE_PROJECT_NAME`, `DOMAIN`, `IMAGE_TAG`, `APK_UPGRADE_DATE`, `POSTGRES_PASSWORD` |

`COMPOSE_FILE` в `.env` подключает оба compose-файла, поэтому на сервере хватает `sudo docker compose …` из `/opt/dobryi-dom`.

**Тома Docker:** `dobryi-dom_db-data` (Postgres — все данные и фото), `dobryi-dom_caddy-data` (сертификаты), `dobryi-dom_caddy-config`, `dobryi-dom_api-data` (пустой, остался от JSON-хранилища).

**Прод-настройки приложения** (в [compose.prod.yaml](compose.prod.yaml) и при сборке):

| Переменная        | Значение | Зачем                                                                                               |
| ----------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `VITE_DEMO_LOGIN` | `0`      | аргумент сборки web: на `/login` нет кнопок демо-входа                                              |
| `DEMO_LOGIN`      | `0`      | API не принимает общий демо-пароль ни при входе, ни при регистрации                                 |
| `TRUST_PROXY`     | `2`      | перед API два прокси (Caddy, nginx): по ним API находит настоящий IP посетителя в `X-Forwarded-For` |

**Настройка сервера** (сделана 2026-10-14, менять только с разрешения владельца):

- **firewalld**, зона `public`: только `ssh`, `http`, `https`, `443/udp` (HTTP/3). Системный rpcbind слушает 111, но снаружи закрыт файрволом.
- **SSH**: вход по паролю выключен (`/etc/ssh/sshd_config.d/01-hardening.conf`).
- **Обновления безопасности** ставит `dnf-automatic` (`upgrade_type = security`, таймер `dnf-automatic.timer`) без перезагрузки.
- **Docker** — из официального репозитория `download.docker.com`. `rocky` не в группе `docker` (это равно root), команды — через `sudo`. Логи контейнеров ротируются: 3 файла по 10 МБ (`/etc/docker/daemon.json`).
- После перезагрузки сервера все контейнеры поднимаются сами (проверено).

## 2. Правила

- **«Что не разрешено, то запрещено».** Выкатка приложения по этому регламенту — по запросу владельца проекта. Всё, что меняет сам сервер (пакеты, файрвол, SSH, службы, перезагрузка, права, новые порты), — только с явного разрешения владельца на конкретное действие.
- **Выкатывается только `main`**: изменения слиты, запушены, CI зелёный. Тег на проде = коммит в `main`, по нему всегда видно, что работает.
- **Образы собираются локально**, не на сервере: 2 ГБ памяти без swap не хватит на сборку фронтенда.
- **На сервер не попадают** токены GitHub, ключи и исходники. Туда едут только готовые образы и три конфига.
- **Порты web, api и db не публикуются.** Docker открывает опубликованные порты в обход firewalld, поэтому `ports:` у этих сервисов в проде запрещены. Наружу смотрит только Caddy.
- **Перед выкаткой — резервная копия базы** ([раздел 5](#5-передача-на-сервер-и-резервная-копия)). Автоматических бэкапов пока нет.

## 3. Перед выкаткой

**Код:**

```bash
git switch main && git pull --ff-only
git status --short                 # должно быть пусто: в образ попадает только закоммиченное
gh run list --branch main --limit 1   # последний CI по main — success
npm run lint && npm run build && npm run test:api
npm run db:start && npm run test:postgres
npm run security
```

**Что изменилось с прошлой выкатки:**

```bash
SERVER=rocky@171.22.180.208
PROD_TAG=$(ssh $SERVER "sudo grep ^IMAGE_TAG= /opt/dobryi-dom/.env | cut -d= -f2")
git log --oneline $PROD_TAG..HEAD
git diff --stat $PROD_TAG..HEAD -- compose.yaml deploy/compose.prod.yaml deploy/Caddyfile server/schema.sql src/lib/seed.ts
```

По списку изменённых файлов — что добавить к обычной выкатке:

| Изменился                                           | Что сделать                                                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ничего из списка                                    | обычная выкатка (шпаргалка)                                                                                           |
| `compose.yaml`, `deploy/compose.prod.yaml`          | [раздел 6](#6-конфиги-если-менялись) — скопировать конфиги до переключения                                            |
| `deploy/Caddyfile`                                  | раздел 6 и затем `sudo docker compose restart caddy`                                                                  |
| новая обязательная переменная (`${…:?…}`) в compose | добавить её в `/opt/dobryi-dom/.env` до переключения, иначе compose не запустится                                     |
| `server/schema.sql`                                 | новые таблицы и индексы `if not exists` применятся сами. Изменение существующих таблиц — [особый случай](#схема-базы) |
| версия образа `postgres` в `compose.yaml`           | **стоп** — [обновление Postgres](#обновление-postgres)                                                                |
| `src/lib/seed.ts`: новый демо-пользователь          | на проде он появится с демо-паролем, который не принимается. Нужен вход — [пароли](#пароли-персонала)                 |

## 4. Сборка образов

```bash
TAG=$(git rev-parse --short HEAD)
git archive HEAD | docker build --target api -t dobryi-dom-api:$TAG --build-arg APK_UPGRADE_DATE=$(date +%F) -
git archive HEAD | docker build -t dobryi-dom:$TAG --build-arg VITE_DEMO_LOGIN=0 --build-arg APK_UPGRADE_DATE=$(date +%F) -
```

- `git archive HEAD` — контекст сборки ровно из коммита, без `.env`, `data/`, `node_modules` и незакоммиченных правок.
- `APK_UPGRADE_DATE` подтягивает в образ свежие исправления Alpine.
- Без `VITE_DEMO_LOGIN=0` на проде появятся кнопки демо-входа. Проверка — ответ должен быть `0`:

```bash
docker run --rm --entrypoint sh dobryi-dom:$TAG -c 'grep -l "или демо-вход как" /usr/share/nginx/html/assets/*.js | wc -l'
```

## 5. Передача на сервер и резервная копия

```bash
docker save dobryi-dom:$TAG dobryi-dom-api:$TAG | gzip | ssh $SERVER "gunzip | sudo docker load"
ssh $SERVER 'sudo docker image ls --filter "reference=dobryi-dom*" --format "{{.Repository}}:{{.Tag}} {{.CreatedSince}}"'
```

Во втором списке должны появиться оба образа с новым тегом. Образы `postgres` и `caddy` сервер сам скачивает с Docker Hub.

**Резервная копия базы** — каждый раз перед переключением:

```bash
ssh $SERVER 'cd /opt/dobryi-dom && sudo sh -c "umask 077; docker compose exec -T db pg_dump -U dobryi -Fc dobryi_dom > /root/dobryi-dom-$(date +%F-%H%M).dump"'
ssh $SERVER 'sudo sh -c "ls -la /root/*.dump"'
```

Файл доступен только root. Восстановление — в разделе [«Откат»](#8-откат).

## 6. Конфиги (если менялись)

```bash
scp compose.yaml deploy/compose.prod.yaml deploy/Caddyfile $SERVER:/tmp/
ssh $SERVER 'cd /opt/dobryi-dom && sudo install -m 644 -o root -g root /tmp/compose.yaml compose.yaml && sudo install -m 644 -o root -g root /tmp/compose.prod.yaml /tmp/Caddyfile deploy/ && rm /tmp/compose.yaml /tmp/compose.prod.yaml /tmp/Caddyfile'
```

Сверка: на сервере должны лежать те же файлы, что в репозитории.

```bash
for f in compose.yaml deploy/compose.prod.yaml deploy/Caddyfile; do printf "%s: " $f; ssh $SERVER "cat /opt/dobryi-dom/$f" | diff -q - $f >/dev/null && echo совпадает || echo ОТЛИЧАЕТСЯ; done
```

После правки `Caddyfile` — `sudo docker compose restart caddy` (API управления Caddy выключен, перечитать конфиг на лету нельзя).

## 7. Переключение и проверка

### Переключение

```bash
ssh $SERVER "cd /opt/dobryi-dom && sudo sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=$TAG/' .env && sudo docker compose up -d --wait"
```

Compose пересоздаёт `web` и `api`, база и Caddy остаются. Сайт недоступен 10–20 секунд, пока API поднимается: в это время запросы к `/api` получают `502`. Счётчики лимитов входа живут в памяти API и при перезапуске обнуляются.

### Проверка после выкатки

**С сервера:**

```bash
ssh $SERVER 'cd /opt/dobryi-dom && sudo docker compose ps --format "{{.Service}} {{.Image}} {{.State}} {{.Health}}"; sudo docker compose logs --since 5m api | grep -oE "\"msg\":\"(started|uncaught_exception)\".{0,160}"; echo "ошибок Caddy: $(sudo docker compose logs --since 5m caddy | grep -c "\"level\":\"error\"")"; sudo docker ps --format "{{.Names}}: {{.Ports}}"'
```

| Что смотреть | Ожидаемо                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ps`         | `api`, `web`, `db` — `running healthy` с новым тегом; `caddy` — `running` (без healthcheck)                                                     |
| лог API      | `"msg":"started"` с `"storage":"postgres"` и `"source":"existing"`. `seed` означает, что база оказалась пустой — стоп, разбираться              |
| ошибки Caddy | `0`. Допустимы единичные `502` с `connection refused` в секунды переключения — кто-то зашёл, пока `web` пересоздавался. Остальные — разбираться |
| порты        | `0.0.0.0:…` только у `dobryi-dom-caddy-1` (80, 443). У остальных — только внутренние                                                            |

**Снаружи** (на Windows у curl нужен `--ssl-no-revoke`, см. [ловушки](#известные-ловушки)):

```bash
D=dobryi-dom-s-hvostikamy.ru; C="curl -sS -m 15 --ssl-no-revoke"
$C -o /dev/null -w "home: %{http_code}\n" https://$D/
$C -o /dev/null -w "http: %{http_code} %{redirect_url}\n" http://$D/
$C -o /dev/null -w "www: %{http_code} %{redirect_url}\n" https://www.$D/
$C -o /dev/null -w "spa: %{http_code}\n" https://$D/pet/persik
$C -o /dev/null -w "robots: %{http_code} %{content_type}\n" https://$D/robots.txt
$C https://$D/api/health; echo
$C -X POST -H 'content-type: application/json' -d '{"email":"anna@example.com","password":"demo1234"}' -w " [%{http_code}]\n" https://$D/api/auth/login
$C -I https://$D/ | grep -iE "^(strict-transport|x-content-type|x-frame|content-security|permissions-policy|server|via)"
$C -o /dev/null -w "api-redirect: %{http_code} %{redirect_url}\n" https://$D/api
$C -I http://$D/ | grep -iE "^(server|via)"   # редирект тоже без Server — пустой вывод
```

| Проверка                          | Ожидаемо                                                                                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `home` (главная)                  | `200`                                                                                                                                                                                                                                                          |
| `http`                            | `308 https://dobryi-dom-s-hvostikamy.ru/`                                                                                                                                                                                                                      |
| `www`                             | `301 https://dobryi-dom-s-hvostikamy.ru/`                                                                                                                                                                                                                      |
| `spa` (прямая ссылка на карточку) | `200`                                                                                                                                                                                                                                                          |
| `robots`                          | `200 text/plain` (если `text/html` — отдалась SPA-страница, файла нет в образе)                                                                                                                                                                                |
| health                            | `{"ok":true,"pets":…}`                                                                                                                                                                                                                                         |
| демо-вход                         | `{"error":"Неверный email или пароль. Попробуйте ещё раз."} [401]` — без слова «демо». Проверяем на anna, а не на админе: каждая попытка идёт в счётчик блокировки (5 неудач на email за 15 минут)                                                             |
| заголовки                         | `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy` (начинается с `default-src 'self'`), `Permissions-Policy` (начинается с `camera=()`); заголовков `Server` и `Via` нет — ни в ответе, ни в редиректе с HTTP |
| `api-redirect`                    | `301 https://dobryi-dom-s-hvostikamy.ru/api/` — тот же домен по HTTPS, без порта 8080                                                                                                                                                                          |

**В браузере:** главная и карточка питомца открываются, на `/login` нет кнопок демо-входа, в консоли нет ошибок. Затем вход персоналом и то, что менялось в этом релизе.

## 8. Откат

Предыдущие образы остаются на сервере, поэтому откат — переключение тега обратно (`PROD_TAG` — тег, который был до выкатки):

```bash
ssh $SERVER "cd /opt/dobryi-dom && sudo sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=$PROD_TAG/' .env && sudo docker compose up -d --wait"
```

Если в разделе 6 копировались конфиги, верните и их — из прошлого коммита (не проверялось на проде):

```bash
mkdir -p /tmp/rollback
git show $PROD_TAG:compose.yaml > /tmp/rollback/compose.yaml
git show $PROD_TAG:deploy/compose.prod.yaml > /tmp/rollback/compose.prod.yaml
git show $PROD_TAG:deploy/Caddyfile > /tmp/rollback/Caddyfile
scp /tmp/rollback/* $SERVER:/tmp/ && rm -rf /tmp/rollback
```

Дальше — та же команда `install`, что в разделе 6, затем `sudo docker compose up -d --wait` и, если менялся Caddyfile, `sudo docker compose restart caddy`.

**Восстановление базы из копии** (если новая версия испортила данные). Не проверялось на проде — выполнять внимательно, после неё проверить сайт:

```bash
ssh $SERVER
cd /opt/dobryi-dom
sudo docker compose stop api
sudo sh -c "docker compose exec -T db pg_restore -U dobryi -d dobryi_dom --clean --if-exists < /root/<файл>.dump"
sudo docker compose start api
```

Откат кода не откатывает данные: если новая версия успела записать в базу данные в новом формате, старая версия может их не понять. Тогда нужен откат и базы — из копии раздела 5.

## 9. Уборка

На сервере хранить текущий и один предыдущий тег:

```bash
ssh $SERVER 'sudo docker image ls --filter "reference=dobryi-dom*" --format "{{.Repository}}:{{.Tag}} {{.CreatedSince}}"'
ssh $SERVER 'sudo docker image rm dobryi-dom:<старый-тег> dobryi-dom-api:<старый-тег>'
ssh $SERVER 'sudo sh -c "ls -la /root/*.dump"'   # старые копии базы удалять вручную
```

Локальные образы — так же через `docker image rm`.

## Особые случаи

### Пароли персонала

Демо-пароль на проде не работает, у персонала свои пароли. Задать новый — сгенерировать случайный:

```bash
ssh $SERVER
cd /opt/dobryi-dom
sudo docker compose stop api
sudo docker compose run --rm --no-deps api node server/set-password.ts olga@dobryi-dom.ru
sudo docker compose start api
```

- Пароль печатается один раз — сразу в менеджер паролей. Чтобы не выводить его на экран, перенаправьте вывод в файл root: `sudo sh -c "umask 077; docker compose run --rm --no-deps -e LOG_LEVEL=silent api node server/set-password.ts <email> > /root/dobryi-dom-passwords.txt"`.
- API на это время останавливается: он держит данные в памяти и при следующей записи вернул бы старый пароль.
- Открытые сессии этого пользователя закрываются.

### Схема базы

`server/schema.sql` применяется при каждом запуске API, всё в нём — `if not exists`. Новые таблицы и индексы появятся сами. Изменения существующих таблиц (новая колонка, другой тип, ограничение) сами не применятся: для них нужна ручная миграция — SQL через `sudo docker compose exec -T db psql -U dobryi -d dobryi_dom`, обязательно после резервной копии и с разрешения владельца.

### Обновление Postgres

Dependabot предлагает новые версии образа `postgres` в `compose.yaml`. Минорное обновление (`17.11` → `17.12`) — обычная выкатка. **Мажорное (`17` → `18`) так выкатывать нельзя**: Postgres 18 не читает том, созданный Postgres 17, — база не поднимется. Нужна отдельная процедура: дамп, новый том, восстановление, проверка. Такой pull request не сливать, пока не готов план переноса.

### Обновление Caddy

Версия Caddy закреплена в [compose.prod.yaml](compose.prod.yaml) (`caddy:2.11.7-alpine`). Dependabot следит только за файлами в корне и этот файл не обновляет — версию поднимать вручную раз в несколько месяцев: поменять тег, выкатить конфиги (раздел 6), `sudo docker compose up -d caddy`.

### Перезагрузка сервера

`dnf-automatic` ставит обновления безопасности сам, но после обновления ядра нужна перезагрузка. Проверить: `ssh $SERVER 'sudo needs-restarting -r'`. Перезагрузка — только с разрешения владельца. После неё контейнеры поднимаются сами; проверка — как в разделе 7.

### Сертификат

Caddy продлевает его сам за месяц до истечения. Не удаляйте том `dobryi-dom_caddy-data`: при новом выпуске можно упереться в лимиты Let's Encrypt (5 одинаковых сертификатов в неделю). Проверить срок:

```bash
echo | openssl s_client -connect dobryi-dom-s-hvostikamy.ru:443 -servername dobryi-dom-s-hvostikamy.ru 2>/dev/null | openssl x509 -noout -dates
```

HTTP → HTTPS перенаправляет свой блок в [Caddyfile](Caddyfile), а не автоматический редирект Caddy (в том нельзя убрать `Server`). Проверки Let's Encrypt по HTTP Caddy обрабатывает раньше этого блока, а при продлении может пройти и проверку по порту 443. Если продление вдруг не прошло — в `sudo docker compose logs caddy` будет `challenge failed`; первое, что стоит попробовать, — убрать блок `http://…` и перезапустить Caddy.

### HSTS и поддомены

Сейчас `Strict-Transport-Security: max-age=31536000` — без `includeSubDomains` и `preload`. Из поддоменов есть только `www`, и он и так перенаправляет на HTTPS.

- **Появился поддомен** (`api.`, `admin.`, `mail.`…) — сначала убедитесь, что он работает по HTTPS, затем добавьте в Caddyfile `includeSubDomains` и выкатите конфиг (раздел 6). Без HTTPS на поддомене браузеры, видевшие заголовок, перестанут его открывать на год.
- **`preload`** — только осознанным решением владельца: домен попадает в список, зашитый в браузеры, и выйти из него можно лишь через месяцы. Нужны `includeSubDomains`, `max-age` не меньше года и заявка на hstspreload.org.

### Логи

```bash
ssh $SERVER 'cd /opt/dobryi-dom && sudo docker compose logs -f api'   # JSON-логи API
ssh $SERVER 'cd /opt/dobryi-dom && sudo docker compose logs api | grep -E "login_locked|rate_limited"'   # блокировки входа и лимиты, с IP
ssh $SERVER 'cd /opt/dobryi-dom && sudo docker compose logs caddy'   # выпуск и продление сертификата
```

## Известные ловушки

| Симптом                                                                         | Причина                                                     | Что делать                                                                                         |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| curl на Windows: `CRYPT_E_NO_REVOCATION_CHECK`                                  | schannel не может проверить отзыв сертификата Let's Encrypt | `curl --ssl-no-revoke` — цепочка проверяется, пропускается только проверка отзыва                  |
| Сканер портов с рабочего компьютера показывает открытыми все порты, даже пустые | сеть компьютера перехватывает исходящие соединения          | проверять на сервере: `sudo ss -tulpn`, `sudo firewall-cmd --list-all`, `sudo docker ps`           |
| `cd: /opt/dobryi-dom: Permission denied`                                        | у папки отобрали права на чтение                            | права папки — 755 (секрет только в `.env`, у него 600)                                             |
| `sudo команда > /root/файл` — `Permission denied`                               | перенаправление делает оболочка `rocky`, а не sudo          | `sudo sh -c "команда > /root/файл"`                                                                |
| `required variable IMAGE_TAG is missing`                                        | compose запущен не из `/opt/dobryi-dom` и не видит `.env`   | сначала `cd /opt/dobryi-dom`                                                                       |
| compose пытается собрать образ или `pull access denied for dobryi-dom`          | образа с тегом из `IMAGE_TAG` нет на сервере                | раздел 5 — передать образы                                                                         |
| `502` сразу после выкатки                                                       | API ещё запускается                                         | подождать `--wait`; если не прошло — `sudo docker compose logs api`                                |
| `429` при входе                                                                 | 5 неудач на email или 20 с IP за 15 минут                   | подождать 15 минут или `sudo docker compose restart api` (счётчики в памяти)                       |
| На `/login` видны кнопки демо-входа                                             | web собран без `--build-arg VITE_DEMO_LOGIN=0`              | пересобрать (раздел 4, там же проверка образа)                                                     |
| После правки Caddyfile ничего не изменилось                                     | API управления Caddy выключен                               | `sudo docker compose restart caddy`                                                                |
| В логе API `"source":"seed"` на проде                                           | API не нашёл данных в Postgres и создал демо-базу           | стоп: проверить том `dobryi-dom_db-data` и `POSTGRES_PASSWORD`, при необходимости — восстановление |
| Кириллица в `node -e "…"` или в `curl -w "…"` на Windows приходит искажённой    | кодировка аргументов командной строки                       | в аргументах — латиница; скрипты с кириллицей писать в файл и запускать `node файл.mjs`            |
