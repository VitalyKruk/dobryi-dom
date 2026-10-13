-- «Добрый дом»: схема Postgres. API применяет её при каждом запуске (всё — if not exists),
-- поэтому отдельного шага миграций нет.
--
-- Каждая таблица хранит запись целиком в data (jsonb) — ровно в том виде, в каком её отдаёт API, —
-- а поля, по которым ищут и сортируют, вынесены в колонки с индексами.

create table if not exists pets (
  id text primary key,
  name text not null,
  species text not null check (species in ('cat', 'dog')),
  status text not null check (status in ('available', 'reserved', 'adopted')),
  added_at timestamptz not null,
  data jsonb not null
);
create index if not exists pets_status_idx on pets (status);

create table if not exists applications (
  id text primary key,
  pet_id text not null,
  email text not null,
  status text not null check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null,
  data jsonb not null
);
create index if not exists applications_pet_idx on applications (pet_id);
create index if not exists applications_status_idx on applications (status);
create index if not exists applications_created_idx on applications (created_at desc);

create table if not exists users (
  id text primary key,
  email text not null unique,
  role text not null check (role in ('user', 'volunteer', 'admin')),
  data jsonb not null
);

-- Пароли отдельно от профилей: scrypt-хеш, ключ — email
create table if not exists passwords (
  email text primary key,
  hash text not null
);

-- Сессии: sha-256 токена, сам токен на сервере не хранится
create table if not exists sessions (
  token text primary key,
  user_id text not null,
  created_at timestamptz not null
);

create table if not exists volunteers (
  id text primary key,
  data jsonb not null
);

create table if not exists audit (
  id text primary key,
  at timestamptz not null,
  action text not null,
  data jsonb not null
);
create index if not exists audit_at_idx on audit (at desc);

-- Анкеты волонтёров, отзывы, подписки — только добавляются
create table if not exists volunteer_requests (
  pos integer primary key,
  data jsonb not null
);

create table if not exists feedback (
  pos integer primary key,
  data jsonb not null
);

create table if not exists subscribers (
  email text primary key
);

-- Переходы по кнопкам функций в разработке (фейкдоры)
create table if not exists fake_doors (
  feature text primary key,
  count integer not null,
  last_at timestamptz not null
);

-- Служебные значения: следующий номер заявки
create table if not exists meta (
  key text primary key,
  value jsonb not null
);

-- Загруженные фото питомцев (до 5 МБ каждое). Отдаёт их API по адресу /uploads/<имя>.
create table if not exists uploads (
  name text primary key check (name ~ '^[a-f0-9]{32}\.(jpg|png|webp)$'),
  content_type text not null,
  body bytea not null,
  created_at timestamptz not null default now()
);
