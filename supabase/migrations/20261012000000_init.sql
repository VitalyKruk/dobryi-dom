-- «Добрый дом»: данные приюта в Postgres (Supabase).
--
-- Каждая таблица хранит запись целиком в data (jsonb) — ровно в том виде, в каком её отдаёт API, —
-- а поля, по которым ищут и сортируют, вынесены в отдельные колонки с индексами.
-- Доступ только с сервера по service_role: RLS включён на всех таблицах и политик нет,
-- поэтому публичный anon-ключ не прочитает и не изменит ничего.

create table public.pets (
  id text primary key,
  name text not null,
  species text not null check (species in ('cat', 'dog')),
  status text not null check (status in ('available', 'reserved', 'adopted')),
  added_at timestamptz not null,
  data jsonb not null
);
create index pets_status_idx on public.pets (status);

create table public.applications (
  id text primary key,
  pet_id text not null,
  email text not null,
  status text not null check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null,
  data jsonb not null
);
create index applications_pet_idx on public.applications (pet_id);
create index applications_status_idx on public.applications (status);
create index applications_created_idx on public.applications (created_at desc);

create table public.users (
  id text primary key,
  email text not null unique,
  role text not null check (role in ('user', 'volunteer', 'admin')),
  data jsonb not null
);

-- Пароли отдельно от профилей: scrypt-хеш, ключ — email
create table public.passwords (
  email text primary key,
  hash text not null
);

-- Сессии: sha-256 токена, сам токен на сервере не хранится
create table public.sessions (
  token text primary key,
  user_id text not null,
  created_at timestamptz not null
);

create table public.volunteers (
  id text primary key,
  data jsonb not null
);

create table public.audit (
  id text primary key,
  at timestamptz not null,
  action text not null,
  data jsonb not null
);
create index audit_at_idx on public.audit (at desc);

-- Анкеты волонтёров, отзывы, подписки — только добавляются
create table public.volunteer_requests (
  pos integer primary key,
  data jsonb not null
);

create table public.feedback (
  pos integer primary key,
  data jsonb not null
);

create table public.subscribers (
  email text primary key
);

-- Переходы по кнопкам функций в разработке (фейкдоры)
create table public.fake_doors (
  feature text primary key,
  count integer not null,
  last_at timestamptz not null
);

-- Служебные значения: следующий номер заявки
create table public.meta (
  key text primary key,
  value jsonb not null
);

alter table public.pets enable row level security;
alter table public.applications enable row level security;
alter table public.users enable row level security;
alter table public.passwords enable row level security;
alter table public.sessions enable row level security;
alter table public.volunteers enable row level security;
alter table public.audit enable row level security;
alter table public.volunteer_requests enable row level security;
alter table public.feedback enable row level security;
alter table public.subscribers enable row level security;
alter table public.fake_doors enable row level security;
alter table public.meta enable row level security;

-- Фото питомцев: закрытый бакет. Отдаёт их наш API по адресу /uploads/<имя>,
-- поэтому ссылки на фото не зависят от того, где лежат файлы.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pet-photos', 'pet-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
