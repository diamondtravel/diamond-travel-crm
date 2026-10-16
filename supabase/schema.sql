-- =====================================================================
-- DIAMOND TRAVEL CRM — Estructura de la base de datos (Supabase)
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede ejecutar más de una vez sin borrar datos.
-- =====================================================================

-- Correo que será administrador automáticamente al crear su usuario.
-- (Si cambias el correo del administrador, cámbialo también aquí.)
create or replace function public.correo_admin_inicial() returns text
language sql immutable as $$ select 'reservasdiamondtravel@gmail.com'::text $$;

-- ---------------------------------------------------------------------
-- 1. PERFILES DEL EQUIPO (uno por cada usuario que inicia sesión)
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null default '',
  nombre      text not null default '',
  rol         text not null default 'asesor' check (rol in ('admin','asesor')),
  activo      boolean not null default false,
  creado_en   timestamptz not null default now()
);

-- Configuración general (condiciones predeterminadas, visibilidad, etc.)
create table if not exists public.config (
  clave           text primary key,
  valor           jsonb not null default '{}'::jsonb,
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id) on delete set null
);

-- Funciones de permisos (se ejecutan con privilegios del sistema para evitar ciclos)
create or replace function public.es_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo);
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo and rol = 'admin');
$$;

-- ¿El usuario puede ver todos los clientes? Admin siempre; asesores solo si el admin lo habilita.
create or replace function public.ve_todo() returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin() or (
    public.es_activo() and coalesce(
      (select (valor->>'asesoresVenTodo')::boolean from public.config where clave = 'visibilidad'), false)
  );
$$;

-- Crear el perfil automáticamente cuando se crea un usuario.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare es_inicial boolean := lower(coalesce(new.email,'')) = public.correo_admin_inicial();
begin
  insert into public.perfiles (id, email, nombre, rol, activo)
  values (new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'nombre',''),
          case when es_inicial then 'admin' else 'asesor' end, es_inicial)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

-- Perfiles para usuarios que ya existían antes de ejecutar este script.
insert into public.perfiles (id, email, rol, activo)
select u.id, coalesce(u.email,''),
       case when lower(coalesce(u.email,'')) = public.correo_admin_inicial() then 'admin' else 'asesor' end,
       lower(coalesce(u.email,'')) = public.correo_admin_inicial()
from auth.users u
on conflict (id) do nothing;

-- Proteger cambios de rol y estado: solo el admin; y nunca quedarse sin administrador.
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id;
  new.email := old.email;
  new.creado_en := old.creado_en;
  if not public.es_admin() then
    new.rol := old.rol;
    new.activo := old.activo;
  end if;
  if old.rol = 'admin' and old.activo and (new.rol <> 'admin' or not new.activo)
     and not exists (select 1 from public.perfiles where rol = 'admin' and activo and id <> old.id) then
    raise exception 'Debe quedar al menos un administrador activo.';
  end if;
  return new;
end $$;
drop trigger if exists antes_de_actualizar_perfil on public.perfiles;
create trigger antes_de_actualizar_perfil before update on public.perfiles
  for each row execute function public.proteger_perfil();

-- ---------------------------------------------------------------------
-- 2. CLIENTES
-- ---------------------------------------------------------------------
create table if not exists public.clientes (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (length(trim(nombre)) > 0),
  telefono         text not null default '',
  email            text not null default '',
  ciudad           text not null default '',
  origen           text not null default '',
  destinos         text not null default '',
  tipo_viaje       text not null default '',
  fecha_viaje      date,
  adultos          integer check (adultos between 0 and 99),
  ninos            integer check (ninos between 0 and 99),
  presupuesto      numeric(14,0) check (presupuesto >= 0),
  intereses        text[] not null default '{}',
  preferencias     text not null default '',
  etapa            text not null default 'nuevo'
                   check (etapa in ('nuevo','contactado','cotizado','negociacion','ganado','perdido')),
  asesor_id        uuid references public.perfiles(id) on delete set null default auth.uid(),
  creado_por       uuid references public.perfiles(id) on delete set null default auth.uid(),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  ultimo_contacto  timestamptz,
  cerrado_en       timestamptz,
  ejemplo          boolean not null default false
);
create index if not exists clientes_asesor_idx on public.clientes (asesor_id);

-- Historial de seguimientos (solo se agregan registros; nadie los edita).
create table if not exists public.historial (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  fecha       timestamptz not null default now(),
  tipo        text not null default 'Nota',
  texto       text not null check (length(texto) <= 4000),
  autor       uuid references public.perfiles(id) on delete set null default auth.uid()
);
create index if not exists historial_cliente_idx on public.historial (cliente_id, fecha desc);

-- ---------------------------------------------------------------------
-- 3. COTIZACIONES (número consecutivo garantizado por la base de datos)
-- ---------------------------------------------------------------------
create sequence if not exists public.cotizacion_numero_seq;

create table if not exists public.cotizaciones (
  id                 uuid primary key default gen_random_uuid(),
  numero             bigint not null unique,  -- lo asigna la base de datos al crear
  estado             text not null default 'borrador'
                     check (estado in ('borrador','enviada','aceptada','vencida','cancelada')),
  cliente_id         uuid references public.clientes(id) on delete set null,
  asesor_id          uuid references public.perfiles(id) on delete set null default auth.uid(),
  fecha_elaboracion  date not null default current_date,
  fecha_vencimiento  date,
  moneda             text not null default 'COP' check (moneda in ('COP','USD','EUR')),
  total              numeric(14,0),
  datos              jsonb not null default '{}'::jsonb,
  historial_estados  jsonb not null default '[]'::jsonb,
  ejemplo            boolean not null default false,
  creado_por         uuid references public.perfiles(id) on delete set null default auth.uid(),
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);
create index if not exists cotizaciones_cliente_idx on public.cotizaciones (cliente_id);
create index if not exists cotizaciones_asesor_idx on public.cotizaciones (asesor_id);
alter sequence public.cotizacion_numero_seq owned by public.cotizaciones.numero;

-- Fechas de actualización y campos que no deben cambiar
create or replace function public.al_actualizar() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  new.creado_en := old.creado_en;
  new.creado_por := old.creado_por;
  if tg_table_name = 'cotizaciones' then new.numero := old.numero; end if;
  return new;
end $$;
-- Al crear: los asesores no pueden elegir el número ni figurar como otra persona.
create or replace function public.al_crear() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then
    new.creado_por := auth.uid();
    new.creado_en := now();
  end if;
  if tg_table_name = 'cotizaciones' then
    if new.numero is null or not public.es_admin() then
      new.numero := nextval('public.cotizacion_numero_seq');
    end if;
  end if;
  new.actualizado_en := now();
  return new;
end $$;
drop trigger if exists clientes_al_crear on public.clientes;
create trigger clientes_al_crear before insert on public.clientes
  for each row execute function public.al_crear();
drop trigger if exists cotizaciones_al_crear on public.cotizaciones;
create trigger cotizaciones_al_crear before insert on public.cotizaciones
  for each row execute function public.al_crear();

drop trigger if exists clientes_al_actualizar on public.clientes;
create trigger clientes_al_actualizar before update on public.clientes
  for each row execute function public.al_actualizar();
drop trigger if exists cotizaciones_al_actualizar on public.cotizaciones;
create trigger cotizaciones_al_actualizar before update on public.cotizaciones
  for each row execute function public.al_actualizar();

-- ---------------------------------------------------------------------
-- 4. PERMISOS (Row Level Security): cada consulta se revisa en el servidor
-- ---------------------------------------------------------------------
alter table public.perfiles     enable row level security;
alter table public.config       enable row level security;
alter table public.clientes     enable row level security;
alter table public.historial    enable row level security;
alter table public.cotizaciones enable row level security;

-- Nadie sin sesión puede leer ni escribir nada.
revoke all on public.perfiles, public.config, public.clientes, public.historial, public.cotizaciones from anon;
revoke all on sequence public.cotizacion_numero_seq from anon;
grant select, insert, update, delete on public.perfiles, public.config, public.clientes, public.historial, public.cotizaciones to authenticated;
grant usage, select on sequence public.cotizacion_numero_seq to authenticated;

-- Perfiles: cada quien ve el suyo; los activos ven al equipo; solo el admin cambia roles.
drop policy if exists perfiles_leer on public.perfiles;
create policy perfiles_leer on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_activo());
drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles for update to authenticated
  using (id = auth.uid() or public.es_admin())
  with check (id = auth.uid() or public.es_admin());

-- Configuración: la leen los activos; solo el admin la cambia.
drop policy if exists config_leer on public.config;
create policy config_leer on public.config for select to authenticated using (public.es_activo());
drop policy if exists config_crear on public.config;
create policy config_crear on public.config for insert to authenticated with check (public.es_admin());
drop policy if exists config_editar on public.config;
create policy config_editar on public.config for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists config_borrar on public.config;
create policy config_borrar on public.config for delete to authenticated using (public.es_admin());

-- Clientes: el asesor ve y edita los suyos (o todos si el admin lo habilita); solo el admin borra.
drop policy if exists clientes_leer on public.clientes;
create policy clientes_leer on public.clientes for select to authenticated
  using (public.es_activo() and (public.ve_todo() or asesor_id = auth.uid()));
drop policy if exists clientes_crear on public.clientes;
create policy clientes_crear on public.clientes for insert to authenticated
  with check (public.es_activo() and (public.es_admin() or asesor_id = auth.uid()));
drop policy if exists clientes_editar on public.clientes;
create policy clientes_editar on public.clientes for update to authenticated
  using (public.es_activo() and (public.ve_todo() or asesor_id = auth.uid()))
  with check (public.es_admin() or asesor_id = auth.uid());
drop policy if exists clientes_borrar on public.clientes;
create policy clientes_borrar on public.clientes for delete to authenticated using (public.es_admin());

-- Historial: visible si el cliente es visible; se agrega en nombre propio; no se edita ni se borra.
drop policy if exists historial_leer on public.historial;
create policy historial_leer on public.historial for select to authenticated
  using (exists (select 1 from public.clientes c where c.id = cliente_id));
drop policy if exists historial_crear on public.historial;
create policy historial_crear on public.historial for insert to authenticated
  with check (public.es_activo() and (autor = auth.uid() or public.es_admin())
              and exists (select 1 from public.clientes c where c.id = cliente_id));

-- Cotizaciones: mismas reglas que los clientes.
drop policy if exists cotizaciones_leer on public.cotizaciones;
create policy cotizaciones_leer on public.cotizaciones for select to authenticated
  using (public.es_activo() and (public.ve_todo() or asesor_id = auth.uid()));
drop policy if exists cotizaciones_crear on public.cotizaciones;
create policy cotizaciones_crear on public.cotizaciones for insert to authenticated
  with check (public.es_activo() and (public.es_admin() or asesor_id = auth.uid()));
drop policy if exists cotizaciones_editar on public.cotizaciones;
create policy cotizaciones_editar on public.cotizaciones for update to authenticated
  using (public.es_activo() and (public.ve_todo() or asesor_id = auth.uid()))
  with check (public.es_admin() or asesor_id = auth.uid());
drop policy if exists cotizaciones_borrar on public.cotizaciones;
create policy cotizaciones_borrar on public.cotizaciones for delete to authenticated using (public.es_admin());

-- ---------------------------------------------------------------------
-- 5. FUNCIONES DE APOYO
-- ---------------------------------------------------------------------
-- Evita clientes duplicados aunque el asesor no pueda ver al otro cliente.
create or replace function public.buscar_duplicado(p_telefono text, p_email text)
returns table (id uuid, nombre text, asesor text, visible boolean)
language plpgsql stable security definer set search_path = public as $$
declare tel text := right(regexp_replace(coalesce(p_telefono,''), '\D', '', 'g'), 10);
        mail text := lower(trim(coalesce(p_email,'')));
begin
  if not public.es_activo() then return; end if;
  return query
    select c.id, c.nombre, coalesce(nullif(p.nombre,''), p.email, 'otro asesor'),
           (public.ve_todo() or c.asesor_id = auth.uid())
    from public.clientes c left join public.perfiles p on p.id = c.asesor_id
    where (length(tel) >= 7 and right(regexp_replace(c.telefono, '\D', '', 'g'), 10) = tel)
       or (mail <> '' and lower(trim(c.email)) = mail)
    limit 1;
end $$;

-- Tras restaurar un respaldo, el consecutivo continúa después del número más alto.
create or replace function public.ajustar_consecutivo() returns bigint
language plpgsql security definer set search_path = public as $$
declare m bigint;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto.'; end if;
  select max(numero) into m from public.cotizaciones;
  if m is not null and m > 0 then
    perform setval('public.cotizacion_numero_seq', greatest(m, (select last_value from public.cotizacion_numero_seq)), true);
  end if;
  return coalesce(m, 0);
end $$;

revoke all on function public.buscar_duplicado(text, text), public.ajustar_consecutivo() from anon, public;
grant execute on function public.buscar_duplicado(text, text), public.ajustar_consecutivo() to authenticated;

-- ---------------------------------------------------------------------
-- 6. TIEMPO REAL (todos ven los cambios al instante)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.clientes;     exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.cotizaciones; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.historial;    exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.perfiles;     exception when duplicate_object then null; end;
  end if;
end $$;

-- Listo. Comprobación: debe mostrar las 5 tablas con "rls_activo = true".
select tablename as tabla, rowsecurity as rls_activo
from pg_tables where schemaname = 'public'
  and tablename in ('perfiles','config','clientes','historial','cotizaciones')
order by tablename;
