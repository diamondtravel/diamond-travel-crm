-- =====================================================================
-- DIAMOND TRAVEL CRM — Actualización 4: Reservas y voucher de viaje
-- Cómo usarlo: Supabase → SQL Editor → New query (+) → pegar TODO → Run.
-- Requiere haber ejecutado antes schema.sql, 02 y 03. Se puede ejecutar más de una vez.
-- =====================================================================

create sequence if not exists public.reserva_numero_seq;

create table if not exists public.reservas (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint not null unique,  -- lo asigna la base de datos (RS-0001, RS-0002…)
  estado          text not null default 'por_confirmar'
                  check (estado in ('por_confirmar','confirmada','en_viaje','finalizada','cancelada')),
  cliente_id      uuid references public.clientes(id) on delete set null,
  cotizacion_id   uuid references public.cotizaciones(id) on delete set null,
  asesor_id       uuid references public.perfiles(id) on delete set null default auth.uid(),
  destino         text not null default '' check (length(destino) <= 300),
  fecha_inicio    date,
  fecha_fin       date,
  datos           jsonb not null default '{}'::jsonb,
  voucher_enviado_en timestamptz,
  ejemplo         boolean not null default false,
  creado_por      uuid references public.perfiles(id) on delete set null default auth.uid(),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists reservas_cliente_idx on public.reservas (cliente_id);
create index if not exists reservas_asesor_idx on public.reservas (asesor_id);
create index if not exists reservas_inicio_idx on public.reservas (fecha_inicio);
alter sequence public.reserva_numero_seq owned by public.reservas.numero;

-- Al crear: número consecutivo (el admin puede conservar números al restaurar un respaldo).
create or replace function public.al_crear_reserva() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null or not public.es_admin() then
    new.numero := nextval('public.reserva_numero_seq');
  end if;
  if not public.es_admin() then
    new.creado_por := auth.uid();
    new.creado_en := now();
  end if;
  new.actualizado_en := now();
  return new;
end $$;
drop trigger if exists reservas_al_crear on public.reservas;
create trigger reservas_al_crear before insert on public.reservas
  for each row execute function public.al_crear_reserva();

-- Al editar: el número, el creador y la fecha de creación no cambian.
create or replace function public.al_actualizar_reserva() returns trigger
language plpgsql as $$
begin
  new.numero := old.numero;
  new.creado_por := old.creado_por;
  new.creado_en := old.creado_en;
  new.actualizado_en := now();
  return new;
end $$;
drop trigger if exists reservas_al_actualizar on public.reservas;
create trigger reservas_al_actualizar before update on public.reservas
  for each row execute function public.al_actualizar_reserva();

-- Permisos: iguales a las cotizaciones.
alter table public.reservas enable row level security;
revoke all on public.reservas from anon, public;
revoke all on sequence public.reserva_numero_seq from anon, public;
grant select, insert, update, delete on public.reservas to authenticated;
grant usage, select on sequence public.reserva_numero_seq to authenticated;

drop policy if exists reservas_leer on public.reservas;
create policy reservas_leer on public.reservas for select to authenticated
  using (public.es_activo() and (public.ve_todo() or asesor_id = auth.uid()));
drop policy if exists reservas_crear on public.reservas;
create policy reservas_crear on public.reservas for insert to authenticated
  with check (public.es_activo() and (public.es_admin() or asesor_id = auth.uid()));
drop policy if exists reservas_editar on public.reservas;
create policy reservas_editar on public.reservas for update to authenticated
  using (public.es_activo() and (public.ve_todo() or asesor_id = auth.uid()))
  with check (public.es_admin() or asesor_id = auth.uid());
drop policy if exists reservas_borrar on public.reservas;
create policy reservas_borrar on public.reservas for delete to authenticated using (public.es_admin());

-- Tras restaurar un respaldo, el consecutivo de reservas continúa después del número más alto.
create or replace function public.ajustar_consecutivo_reservas() returns bigint
language plpgsql security definer set search_path = public as $$
declare m bigint;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto.'; end if;
  select max(numero) into m from public.reservas;
  if m is not null and m > 0 then
    perform setval('public.reserva_numero_seq', greatest(m, (select last_value from public.reserva_numero_seq)), true);
  end if;
  return coalesce(m, 0);
end $$;
revoke all on function public.ajustar_consecutivo_reservas() from anon, public;
grant execute on function public.ajustar_consecutivo_reservas() to authenticated;

-- Tiempo real
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.reservas; exception when duplicate_object then null; end;
  end if;
end $$;

-- Comprobación: debe mostrar "reservas | true".
select tablename as tabla, rowsecurity as rls_activo
from pg_tables where schemaname = 'public' and tablename = 'reservas';
