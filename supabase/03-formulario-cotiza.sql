-- =====================================================================
-- DIAMOND TRAVEL CRM — Actualización 3: Formulario público "Cotiza tu viaje"
-- Cómo usarlo: Supabase → SQL Editor → New query (+) → pegar TODO → Run.
-- Requiere haber ejecutado antes schema.sql y 02-seguimientos-y-plantillas.sql.
-- Se puede ejecutar más de una vez sin borrar datos.
--
-- Seguridad: quien llena el formulario NO puede leer nada del CRM. Solo puede
-- llamar a la función registrar_solicitud, que revisa cada dato, limita la
-- cantidad de envíos y guarda la solicitud.
-- =====================================================================

-- Cada envío del formulario queda registrado (también sirve como constancia
-- de la autorización de tratamiento de datos que aceptó la persona).
create table if not exists public.solicitudes (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  creado_en      timestamptz not null default now(),
  telefono_norm  text not null default '',
  nuevo_cliente  boolean not null default true,
  datos          jsonb not null default '{}'::jsonb
);
create index if not exists solicitudes_cliente_idx on public.solicitudes (cliente_id);
create index if not exists solicitudes_fecha_idx on public.solicitudes (creado_en desc);
create index if not exists solicitudes_tel_idx on public.solicitudes (telefono_norm, creado_en desc);

alter table public.solicitudes enable row level security;
revoke all on public.solicitudes from anon, public;
grant select, delete on public.solicitudes to authenticated;

-- Se ve si el cliente es visible para el usuario; solo el admin borra.
drop policy if exists solicitudes_leer on public.solicitudes;
create policy solicitudes_leer on public.solicitudes for select to authenticated
  using (public.es_activo() and exists (select 1 from public.clientes c where c.id = cliente_id));
drop policy if exists solicitudes_borrar on public.solicitudes;
create policy solicitudes_borrar on public.solicitudes for delete to authenticated
  using (public.es_admin());

-- Nueva regla de seguimiento: "Responder solicitud del formulario".
alter table public.seguimientos drop constraint if exists seguimientos_regla_check;
alter table public.seguimientos add constraint seguimientos_regla_check
  check (regla in ('cotizacion','contacto','viaje','regreso','solicitud'));

-- ---------------------------------------------------------------------
-- Función que recibe el formulario (la única puerta abierta al público)
-- ---------------------------------------------------------------------
create or replace function public.registrar_solicitud(p jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  t_nombre   text := left(btrim(regexp_replace(coalesce(p->>'nombre',''), '\s+', ' ', 'g')), 200);
  t_tel      text := left(btrim(coalesce(p->>'telefono','')), 40);
  t_email    text := lower(left(btrim(coalesce(p->>'email','')), 200));
  t_ciudad   text := left(btrim(coalesce(p->>'ciudad','')), 200);
  t_destino  text := left(btrim(coalesce(p->>'destino','')), 300);
  t_ida      text := btrim(coalesce(p->>'fechaIda',''));
  t_regreso  text := btrim(coalesce(p->>'fechaRegreso',''));
  t_flex     boolean := lower(coalesce(p->>'fechasFlexibles','')) in ('true','1','si','sí','on');
  t_adultos  text := btrim(coalesce(p->>'adultos',''));
  t_ninos    text := btrim(coalesce(p->>'ninos',''));
  t_edades   text := left(btrim(coalesce(p->>'edadesNinos','')), 60);
  t_presup   text := btrim(coalesce(p->>'presupuesto',''));
  t_conocio  text := left(btrim(coalesce(p->>'comoNosConocio','')), 60);
  t_coment   text := left(btrim(coalesce(p->>'comentarios','')), 1200);
  t_autoriza boolean := lower(coalesce(p->>'autorizaDatos','')) in ('true','1','si','sí','on');
  t_texto_aut text := left(btrim(coalesce(p->>'textoAutorizacion','')), 1500);
  tel_norm   text;
  d_ida      date;
  d_regreso  date;
  n_adultos  integer;
  n_ninos    integer;
  n_presup   numeric(14,0);
  v_asesor   uuid;
  v_cli      public.clientes%rowtype;
  v_nuevo    boolean := false;
  v_id       uuid;
  resumen    text;
begin
  -- Trampa para robots: el formulario tiene un campo oculto que una persona nunca llena.
  if coalesce(p->>'web','') <> '' then return jsonb_build_object('ok', true); end if;

  -- Validaciones (mensajes claros para quien llena el formulario)
  if length(t_nombre) < 2 or length(t_nombre) > 120 then
    raise exception 'Escribe tu nombre completo.' using errcode = 'P0001';
  end if;
  tel_norm := regexp_replace(t_tel, '\D', '', 'g');
  if length(tel_norm) < 7 or length(tel_norm) > 15 then
    raise exception 'Escribe un número de WhatsApp válido.' using errcode = 'P0001';
  end if;
  tel_norm := right(tel_norm, 10);
  if t_email <> '' and (length(t_email) > 160 or t_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Revisa el correo electrónico.' using errcode = 'P0001';
  end if;
  if length(t_destino) < 2 or length(t_destino) > 200 then
    raise exception 'Cuéntanos a qué destino quieres viajar.' using errcode = 'P0001';
  end if;
  if length(t_ciudad) > 120 then raise exception 'Revisa la ciudad.' using errcode = 'P0001'; end if;
  if not t_autoriza then
    raise exception 'Para enviar la solicitud debes autorizar el tratamiento de tus datos.' using errcode = 'P0001';
  end if;
  begin
    if t_ida <> '' then d_ida := t_ida::date; end if;
    if t_regreso <> '' then d_regreso := t_regreso::date; end if;
  exception when others then
    raise exception 'Revisa las fechas del viaje.' using errcode = 'P0001';
  end;
  if d_ida is not null and (d_ida < current_date - 1 or d_ida > current_date + 1100) then
    raise exception 'La fecha de ida debe ser una fecha futura.' using errcode = 'P0001';
  end if;
  if d_regreso is not null and (d_regreso > current_date + 1200 or (d_ida is not null and d_regreso < d_ida)) then
    raise exception 'La fecha de regreso debe ser posterior a la de ida.' using errcode = 'P0001';
  end if;
  if t_adultos !~ '^\d{1,2}$' or t_adultos::int < 1 then
    raise exception 'Indica cuántos adultos viajan.' using errcode = 'P0001';
  end if;
  n_adultos := t_adultos::int;
  if t_ninos <> '' and t_ninos !~ '^\d{1,2}$' then
    raise exception 'Revisa el número de niños.' using errcode = 'P0001';
  end if;
  n_ninos := coalesce(nullif(t_ninos,'')::int, 0);
  t_presup := regexp_replace(t_presup, '\D', '', 'g');
  if t_presup <> '' then
    if length(t_presup) > 12 then raise exception 'Revisa el presupuesto.' using errcode = 'P0001'; end if;
    n_presup := t_presup::numeric;
    if n_presup = 0 then n_presup := null; end if;
  end if;

  -- Límites contra abuso: el mismo número no se registra dos veces en 10 minutos
  -- (doble toque) y en total se aceptan máximo 40 solicitudes por hora.
  perform pg_advisory_xact_lock(hashtext('registrar_solicitud:' || tel_norm));
  if exists (select 1 from public.solicitudes s
             where s.telefono_norm = tel_norm and s.creado_en > now() - interval '10 minutes') then
    return jsonb_build_object('ok', true);
  end if;
  if (select count(*) from public.solicitudes s where s.creado_en > now() - interval '1 hour') >= 40 then
    raise exception 'Estamos recibiendo muchas solicitudes. Escríbenos directamente por WhatsApp, por favor.' using errcode = 'P0001';
  end if;

  -- ¿A quién se asigna? Al asesor elegido en Equipo → Formulario; si no, al administrador.
  select pf.id into v_asesor from public.perfiles pf
   where pf.activo and pf.id::text = (select c.valor->>'asesorId' from public.config c where c.clave = 'formulario');
  if v_asesor is null then
    select pf.id into v_asesor from public.perfiles pf where pf.activo and pf.rol = 'admin' order by pf.creado_en limit 1;
  end if;

  resumen := 'Destino: ' || t_destino
    || case when d_ida is not null then ' · Ida: ' || to_char(d_ida, 'DD/MM/YYYY') else '' end
    || case when d_regreso is not null then ' · Regreso: ' || to_char(d_regreso, 'DD/MM/YYYY') else '' end
    || case when t_flex then ' · Fechas flexibles' else '' end
    || ' · Adultos: ' || n_adultos
    || case when n_ninos > 0 then ' · Niños: ' || n_ninos || case when t_edades <> '' then ' (edades: ' || t_edades || ')' else '' end else '' end
    || case when n_presup is not null then ' · Presupuesto aprox.: $' || to_char(n_presup, 'FM999G999G999G999') else '' end
    || case when t_ciudad <> '' then ' · Sale desde: ' || t_ciudad else '' end
    || case when t_conocio <> '' then ' · Nos conoció por: ' || t_conocio else '' end
    || case when t_coment <> '' then E'\nComentarios: ' || t_coment else '' end;

  -- ¿Ya existe el cliente (mismo WhatsApp)? Se agrega la solicitud a su ficha sin borrar nada.
  select * into v_cli from public.clientes c
   where right(regexp_replace(c.telefono, '\D', '', 'g'), 10) = tel_norm
   order by c.creado_en limit 1;

  if v_cli.id is null then
    v_nuevo := true;
    insert into public.clientes (nombre, telefono, email, ciudad, origen, destinos, fecha_viaje, adultos, ninos,
                                 presupuesto, preferencias, etapa, asesor_id, creado_por)
    values (t_nombre, t_tel, t_email, t_ciudad,
            'Formulario web' || case when t_conocio <> '' then ' · ' || t_conocio else '' end,
            t_destino, d_ida, n_adultos, n_ninos, n_presup,
            left(trim(both E'\n ' from
              case when d_regreso is not null then 'Regreso aprox.: ' || to_char(d_regreso, 'DD/MM/YYYY') || '. ' else '' end
              || case when t_flex then 'Fechas flexibles. ' else '' end
              || case when t_edades <> '' then 'Edades de los niños: ' || t_edades || '. ' else '' end
              || t_coment), 2000),
            'nuevo', v_asesor, null)
    returning * into v_cli;
  else
    update public.clientes set
      email       = case when email = '' then t_email else email end,
      ciudad      = case when ciudad = '' then t_ciudad else ciudad end,
      destinos    = case when destinos = '' then t_destino else destinos end,
      fecha_viaje = coalesce(fecha_viaje, d_ida),
      adultos     = coalesce(adultos, n_adultos),
      presupuesto = coalesce(presupuesto, n_presup),
      etapa       = case when etapa = 'perdido' then 'nuevo' else etapa end,
      asesor_id   = coalesce(asesor_id, v_asesor)
    where id = v_cli.id;
  end if;

  insert into public.historial (cliente_id, tipo, texto, autor)
  values (v_cli.id, 'Formulario',
          left(case when v_nuevo then 'Llegó por el formulario "Cotiza tu viaje". '
                    else 'Envió una nueva solicitud por el formulario "Cotiza tu viaje". ' end || resumen, 4000),
          null);

  insert into public.solicitudes (cliente_id, telefono_norm, nuevo_cliente, datos)
  values (v_cli.id, tel_norm, v_nuevo, jsonb_build_object(
    'nombre', t_nombre, 'telefono', t_tel, 'email', t_email, 'ciudad', t_ciudad, 'destino', t_destino,
    'fechaIda', d_ida, 'fechaRegreso', d_regreso, 'fechasFlexibles', t_flex,
    'adultos', n_adultos, 'ninos', n_ninos, 'edadesNinos', t_edades, 'presupuesto', n_presup,
    'comoNosConocio', t_conocio, 'comentarios', t_coment,
    'autorizaDatos', true, 'textoAutorizacion', t_texto_aut, 'autorizadoEn', now()))
  returning id into v_id;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.registrar_solicitud(jsonb) from public;
grant execute on function public.registrar_solicitud(jsonb) to anon, authenticated;

-- Tiempo real: la solicitud aparece al instante en el CRM.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.solicitudes; exception when duplicate_object then null; end;
  end if;
end $$;

-- Comprobación: debe mostrar "solicitudes | true".
select tablename as tabla, rowsecurity as rls_activo
from pg_tables where schemaname = 'public' and tablename = 'solicitudes';
