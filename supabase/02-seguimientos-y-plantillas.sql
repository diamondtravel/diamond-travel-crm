-- =====================================================================
-- DIAMOND TRAVEL CRM — Actualización 2: Seguimientos y plantillas de cotización
-- Cómo usarlo: Supabase → SQL Editor → New query (+) → pegar TODO → Run.
-- Requiere haber ejecutado antes schema.sql. Se puede ejecutar más de una vez.
-- =====================================================================

-- Registro de cada seguimiento enviado u omitido (evita que se repita).
create table if not exists public.seguimientos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  cotizacion_id  uuid references public.cotizaciones(id) on delete set null,
  regla          text not null check (regla in ('cotizacion','contacto','viaje','regreso')),
  clave          text not null unique check (length(clave) <= 300),
  resultado      text not null default 'enviado' check (resultado in ('enviado','omitido')),
  mensaje        text not null default '' check (length(mensaje) <= 4000),
  autor          uuid references public.perfiles(id) on delete set null default auth.uid(),
  fecha          timestamptz not null default now()
);
create index if not exists seguimientos_cliente_idx on public.seguimientos (cliente_id);
create index if not exists seguimientos_fecha_idx on public.seguimientos (fecha desc);

alter table public.seguimientos enable row level security;
revoke all on public.seguimientos from anon;
grant select, insert, delete on public.seguimientos to authenticated;

-- Se ve si el cliente es visible para el usuario.
drop policy if exists seguimientos_leer on public.seguimientos;
create policy seguimientos_leer on public.seguimientos for select to authenticated
  using (exists (select 1 from public.clientes c where c.id = cliente_id));
-- Se registra en nombre propio y solo para clientes visibles.
drop policy if exists seguimientos_crear on public.seguimientos;
create policy seguimientos_crear on public.seguimientos for insert to authenticated
  with check (public.es_activo() and autor = auth.uid()
              and exists (select 1 from public.clientes c where c.id = cliente_id));
-- Solo el administrador puede deshacer un registro.
drop policy if exists seguimientos_borrar on public.seguimientos;
create policy seguimientos_borrar on public.seguimientos for delete to authenticated
  using (public.es_admin());

-- Fecha y autor los pone la base de datos (no se pueden falsificar).
create or replace function public.al_crear_seguimiento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.fecha := now();
  if not public.es_admin() then new.autor := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists seguimientos_al_crear on public.seguimientos;
create trigger seguimientos_al_crear before insert on public.seguimientos
  for each row execute function public.al_crear_seguimiento();

-- ---------------------------------------------------------------------
-- Plantillas de cotización (destinos frecuentes reutilizables)
-- ---------------------------------------------------------------------
create table if not exists public.plantillas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (length(trim(nombre)) between 1 and 120),
  datos           jsonb not null default '{}'::jsonb,
  creado_por      uuid references public.perfiles(id) on delete set null default auth.uid(),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create unique index if not exists plantillas_nombre_idx on public.plantillas (lower(trim(nombre)));

alter table public.plantillas enable row level security;
revoke all on public.plantillas from anon;
grant select, insert, update, delete on public.plantillas to authenticated;

-- Todo el equipo activo las usa y las mejora; solo quien la creó o el admin la borra.
drop policy if exists plantillas_leer on public.plantillas;
create policy plantillas_leer on public.plantillas for select to authenticated using (public.es_activo());
drop policy if exists plantillas_crear on public.plantillas;
create policy plantillas_crear on public.plantillas for insert to authenticated
  with check (public.es_activo() and creado_por = auth.uid());
drop policy if exists plantillas_editar on public.plantillas;
create policy plantillas_editar on public.plantillas for update to authenticated
  using (public.es_activo()) with check (public.es_activo());
drop policy if exists plantillas_borrar on public.plantillas;
create policy plantillas_borrar on public.plantillas for delete to authenticated
  using (public.es_admin() or (public.es_activo() and creado_por = auth.uid()));

create or replace function public.al_guardar_plantilla() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.actualizado_en := now();
  if tg_op = 'UPDATE' then
    new.creado_por := old.creado_por;
    new.creado_en := old.creado_en;
  else
    new.creado_en := now();
    if not public.es_admin() then new.creado_por := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists plantillas_al_guardar on public.plantillas;
create trigger plantillas_al_guardar before insert or update on public.plantillas
  for each row execute function public.al_guardar_plantilla();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.seguimientos; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.plantillas;   exception when duplicate_object then null; end;
  end if;
end $$;

-- Comprobación: debe mostrar "plantillas | true" y "seguimientos | true".
select tablename as tabla, rowsecurity as rls_activo
from pg_tables where schemaname = 'public' and tablename in ('seguimientos','plantillas')
order by tablename;
