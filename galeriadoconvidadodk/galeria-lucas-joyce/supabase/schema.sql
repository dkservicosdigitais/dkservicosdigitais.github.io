-- ============================================================
-- GALERIA DE CONVIDADOS — LUCAS & JOYCE
-- Execute este script no SQL Editor do Supabase.
-- ============================================================

-- Extensão para gerar UUIDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Tabela principal de fotos
-- ------------------------------------------------------------
create table if not exists public.photos (
  id                    uuid primary key default gen_random_uuid(),
  wedding_id            uuid not null default '00000000-0000-0000-0000-000000000001',
  wedding_slug          text not null default 'lucas-joyce',

  -- Cloudinary
  cloudinary_public_id  text not null unique,
  secure_url            text not null,
  original_url          text not null,
  thumbnail_url         text not null,

  -- Convidado
  guest_name            text not null,
  caption               text,

  -- Metadados do arquivo
  original_width        integer not null default 0,
  original_height       integer not null default 0,
  format                text,
  bytes                 bigint not null default 0,

  -- Posição persistente no globo (nunca muda depois de criada)
  position_latitude     double precision not null,
  position_longitude    double precision not null,
  position_depth        double precision not null default 1.0,
  rotation_x            double precision not null default 0,
  rotation_y            double precision not null default 0,
  rotation_z            double precision not null default 0,
  visual_scale          double precision not null default 1.0,

  -- Estado
  status                text not null default 'approved'
                        check (status in ('pending','approved','rejected')),
  is_favorite           boolean not null default false,
  is_hidden             boolean not null default false,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists photos_wedding_slug_idx on public.photos (wedding_slug);
create index if not exists photos_status_idx       on public.photos (wedding_slug, status, is_hidden);
create index if not exists photos_created_at_idx   on public.photos (wedding_slug, created_at desc);

-- Atualiza updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists photos_set_updated_at on public.photos;
create trigger photos_set_updated_at
before update on public.photos
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Segurança (Row Level Security)
-- ------------------------------------------------------------
alter table public.photos enable row level security;

-- Visitantes (chave anônima) podem apenas LER fotos aprovadas e visíveis.
drop policy if exists "public pode ver fotos aprovadas" on public.photos;
create policy "public pode ver fotos aprovadas"
on public.photos for select
to anon
using (status = 'approved' and is_hidden = false);

-- Usuários autenticados (os noivos) podem LER tudo.
drop policy if exists "noivos podem ver tudo" on public.photos;
create policy "noivos podem ver tudo"
on public.photos for select
to authenticated
using (true);

-- NENHUMA política de insert/update/delete para anon ou authenticated:
-- escrita acontece exclusivamente pelo backend com a service_role
-- (a service_role ignora RLS por padrão).

-- ------------------------------------------------------------
-- Tempo real: publicar mudanças da tabela photos
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'photos'
  ) then
    alter publication supabase_realtime add table public.photos;
  end if;
end $$;

-- ------------------------------------------------------------
-- (Opcional) Foto de demonstração inicial
-- Todo cloud do Cloudinary possui a imagem pública "sample".
-- Remova este bloco se preferir enviar a primeira foto pelo site.
-- ------------------------------------------------------------
insert into public.photos (
  cloudinary_public_id, secure_url, original_url, thumbnail_url,
  guest_name, caption,
  original_width, original_height, format, bytes,
  position_latitude, position_longitude, position_depth,
  rotation_x, rotation_y, rotation_z, visual_scale,
  status
) values (
  'sample',
  'https://res.cloudinary.com/dotko9ym/image/upload/sample.jpg',
  'https://res.cloudinary.com/dotko9ym/image/upload/sample.jpg',
  'https://res.cloudinary.com/dotko9ym/image/upload/c_fill,w_512,q_auto,f_auto/sample.jpg',
  'Lucas & Joyce', 'Onde tudo começa',
  864, 576, 'jpg', 120253,
  8.0, 0.0, 1.0,
  0, 0, -0.02, 1.0,
  'approved'
)
on conflict (cloudinary_public_id) do nothing;
