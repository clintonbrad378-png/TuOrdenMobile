-- TuOrden POS · Sync gerente <-> dependiente (Opcion C)
-- Relay: catalogo down (gerente->dependiente) + ventas up (dependiente->gerente).
-- Los telefonos trabajan offline en SQLite; Supabase solo es buzon.
-- Ejecutar en Supabase Dashboard → SQL Editor despues de 001_panel.sql.
-- El panel web (panel_snapshots) queda obsoleto y se elimina del frontend;
-- la tabla se conserva por historial pero ya no se escribe.

-- 1) Negocios: un gerente = un business
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mi negocio',
  gerente_device_id text,
  created_at timestamptz not null default now()
);

-- 2) Links de emparejamiento: codigo corto 6 digitos + token largo (hash)
create table if not exists public.links (
  code text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  max_uses int not null default 5,
  used int not null default 0,
  created_at timestamptz not null default now()
);

-- 3) Dispositivos emparejados
create table if not exists public.devices (
  device_id text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  role text not null default 'dependiente' check (role in ('gerente','dependiente')),
  label text not null default 'caja',
  last_seen timestamptz not null default now()
);

-- 4) Catalogo: un snapshot por version (gana gerente siempre)
create table if not exists public.catalog_snapshots (
  business_id uuid not null references public.businesses(id) on delete cascade,
  version bigint not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (business_id, version)
);

-- 5) Ventas: append-only idempotente (nunca se borra desde app)
-- unique(business, device, kind, local_id) permite reintentos seguros.
create table if not exists public.sales_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_id text not null,
  kind text not null default 'sale' check (kind in ('sale','credit','credit_payment')),
  local_id bigint not null,
  payload jsonb not null,
  created_at_device text,
  created_at timestamptz not null default now(),
  unique (business_id, device_id, kind, local_id)
);
create index if not exists idx_sales_batches_business on public.sales_batches(business_id, created_at desc);

alter table public.businesses enable row level security;
alter table public.links enable row level security;
alter table public.devices enable row level security;
alter table public.catalog_snapshots enable row level security;
alter table public.sales_batches enable row level security;

-- Politicas abiertas para anon/authenticated: el control real es por
-- business_id + token de emparejamiento a nivel aplicacion (MVP 1-2 cajas).
-- Endurecer despues con JWT custom si crece a 10+ dependientes.
drop policy if exists "open all businesses" on public.businesses;
drop policy if exists "open all links" on public.links;
drop policy if exists "open all devices" on public.devices;
drop policy if exists "open all catalog" on public.catalog_snapshots;
drop policy if exists "open all batches" on public.sales_batches;

create policy "open all businesses" on public.businesses for all to anon, authenticated using (true) with check (true);
create policy "open all links" on public.links for all to anon, authenticated using (true) with check (true);
create policy "open all devices" on public.devices for all to anon, authenticated using (true) with check (true);
create policy "open all catalog" on public.catalog_snapshots for all to anon, authenticated using (true) with check (true);
create policy "open all batches" on public.sales_batches for all to anon, authenticated using (true) with check (true);

-- Realtime para auto-refresh con app abierta
do $$
begin
  alter publication supabase_realtime add table public.catalog_snapshots;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.sales_batches;
exception when duplicate_object then null;
end $$;

-- Canje de codigo: valida expiracion/usos e incrementa contador atomicamente
create or replace function public.redeem_link(p_code text)
returns table (business_id uuid, uses_left int) as $$
declare
  r record;
begin
  select * into r from public.links where code = upper(trim(p_code));
  if not found then raise exception 'Código no válido'; end if;
  if r.expires_at < now() then raise exception 'Código vencido, genera uno nuevo'; end if;
  if r.used >= r.max_uses then raise exception 'Código agotado, genera uno nuevo'; end if;
  update public.links set used = used + 1 where code = r.code;
  return query select r.business_id, (r.max_uses - r.used - 1);
end;
$$ language plpgsql security definer;
