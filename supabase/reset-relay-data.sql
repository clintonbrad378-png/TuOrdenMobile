-- TuOrden POS · Limpieza de datos del relay (Supabase)
-- Borra TODOS los datos de sincronización: negocios, links, dispositivos,
-- catálogos publicados y ventas en el buzón. Las tablas y políticas quedan intactas.
-- Ejecutar en Supabase Dashboard → SQL Editor. Acción irreversible.
--
-- NOTA: panel_snapshots (panel web obsoleto) NO se toca. Si también quieres
-- vaciarlo, descomenta la última línea.

begin;

truncate table
  public.sales_batches,
  public.catalog_snapshots,
  public.links,
  public.devices,
  public.businesses
restart identity cascade;

-- truncate table public.panel_snapshots restart identity cascade; -- opcional

commit;

-- Verificación: todo debe quedar en 0
select 'businesses' as tabla, count(*) from public.businesses
union all select 'links', count(*) from public.links
union all select 'devices', count(*) from public.devices
union all select 'catalog_snapshots', count(*) from public.catalog_snapshots
union all select 'sales_batches', count(*) from public.sales_batches;
