-- TuOrden POS · Panel online (Supabase)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere: 1 usuario gerente creado en Authentication → Users (email + password).
-- La app móvil y el panel web usan ese MISMO usuario (login único de gerente).

-- 1) Tabla: un snapshot por día (upsert por `day`)
create table if not exists public.panel_snapshots (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  device_label text not null default 'caja-1',
  kpis jsonb not null default '{}'::jsonb,
  products jsonb not null default '[]'::jsonb,
  materials jsonb not null default '[]'::jsonb,
  low_stock jsonb not null default '[]'::jsonb,
  sales_by_day jsonb not null default '[]'::jsonb,
  by_payment jsonb not null default '[]'::jsonb,
  include_costs boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 2) RLS: solo usuarios autenticados (el gerente) pueden leer/escribir.
-- Anon (sin login) no ve nada → el panel exige login.
alter table public.panel_snapshots enable row level security;

drop policy if exists "gerente read" on public.panel_snapshots;
drop policy if exists "gerente insert" on public.panel_snapshots;
drop policy if exists "gerente update" on public.panel_snapshots;

create policy "gerente read"
  on public.panel_snapshots for select
  to authenticated
  using (true);

create policy "gerente insert"
  on public.panel_snapshots for insert
  to authenticated
  with check (true);

create policy "gerente update"
  on public.panel_snapshots for update
  to authenticated
  using (true)
  with check (true);

-- Sin política de delete: nadie borra desde la app/panel (solo desde Dashboard si hace falta).

-- 3) Realtime (para que el panel se actualice solo sin recargar).
-- Incluido aquí: NO necesitas tocar Database → Replication.
do $$
begin
  alter publication supabase_realtime add table public.panel_snapshots;
exception when duplicate_object then
  null;
end
$$;

-- 4) Limpieza opcional: borrar snapshots de más de 60 días (ejecutar manual o con pg_cron)
-- delete from public.panel_snapshots where day < current_date - interval '60 days';
