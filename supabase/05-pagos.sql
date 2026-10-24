-- =====================================================================
-- DIAMOND TRAVEL CRM — Actualización 5: Pagos (cuotas de clientes y pagos a proveedores)
-- Cómo usarlo: Supabase → SQL Editor → New query (+) → pegar TODO → Run.
-- Requiere haber ejecutado antes schema.sql, 02, 03 y 04. Se puede ejecutar más de una vez.
-- =====================================================================

-- ¿El usuario puede cambiar los pagos de esta reserva? (el administrador, o el asesor dueño de la reserva)
create or replace function public.puede_editar_reserva(p_reserva uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_activo() and (public.es_admin() or exists (
    select 1 from public.reservas r where r.id = p_reserva and r.asesor_id = auth.uid()));
$$;

-- Cada cuota que debe pagar el cliente (tipo "cobro") o cada pago que la agencia debe hacer
-- a un proveedor (tipo "pago"), con su valor y su fecha límite.
create table if not exists public.pagos (
  id             uuid primary key default gen_random_uuid(),
  reserva_id     uuid not null references public.reservas(id) on delete cascade,
  tipo           text not null check (tipo in ('cobro','pago')),
  concepto       text not null default '' check (length(concepto) <= 200),
  proveedor      text not null default '' check (length(proveedor) <= 160),
  categoria      text not null default '' check (length(categoria) <= 60),
  valor          numeric(14,0) not null check (valor > 0),
  moneda         text not null default 'COP' check (moneda in ('COP','USD','EUR')),
  fecha_limite   date not null,
  orden          integer not null default 0,
  notas          text not null default '' check (length(notas) <= 1500),
  creado_por     uuid references public.perfiles(id) on delete set null default auth.uid(),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists pagos_reserva_idx on public.pagos (reserva_id);
create index if not exists pagos_fecha_idx on public.pagos (fecha_limite);

-- Cada pago recibido o realizado (un "abono"). Una cuota puede pagarse en varios abonos.
-- Los abonos de clientes reciben un número de recibo consecutivo (RC-0001…).
create sequence if not exists public.recibo_numero_seq;
create table if not exists public.abonos (
  id             uuid primary key default gen_random_uuid(),
  pago_id        uuid not null references public.pagos(id) on delete cascade,
  numero         bigint unique,
  valor          numeric(14,0) not null check (valor > 0),
  fecha          date not null default current_date,
  medio          text not null default '' check (length(medio) <= 60),
  referencia     text not null default '' check (length(referencia) <= 120),
  notas          text not null default '' check (length(notas) <= 1000),
  registrado_por uuid references public.perfiles(id) on delete set null default auth.uid(),
  registrado_en  timestamptz not null default now()
);
create index if not exists abonos_pago_idx on public.abonos (pago_id);
alter sequence public.recibo_numero_seq owned by public.abonos.numero;

-- Pagos: quién y cuándo lo crea lo pone la base de datos; la reserva y el tipo no cambian.
create or replace function public.al_guardar_pago() returns trigger
language plpgsql security definer set search_path = public as $$
declare pagado numeric;
begin
  new.actualizado_en := now();
  if tg_op = 'UPDATE' then
    new.reserva_id := old.reserva_id; new.tipo := old.tipo;
    new.creado_por := old.creado_por; new.creado_en := old.creado_en;
    select coalesce(sum(valor), 0) into pagado from public.abonos where pago_id = old.id;
    if new.valor < pagado then
      raise exception 'El valor no puede ser menor que lo ya pagado ($%).', replace(to_char(pagado, 'FM999,999,999,999'), ',', '.') using errcode = 'P0001';
    end if;
  else
    if not public.es_admin() then new.creado_por := auth.uid(); new.creado_en := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists pagos_al_guardar on public.pagos;
create trigger pagos_al_guardar before insert or update on public.pagos
  for each row execute function public.al_guardar_pago();

-- Abonos: no se puede pagar más de lo pendiente; número de recibo solo para cobros.
create or replace function public.al_crear_abono() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.pagos%rowtype; pagado numeric;
begin
  select * into p from public.pagos where id = new.pago_id for update;
  if p.id is null then raise exception 'El pago no existe.' using errcode = 'P0001'; end if;
  select coalesce(sum(valor), 0) into pagado from public.abonos where pago_id = p.id;
  if new.valor > p.valor - pagado then
    raise exception 'El valor supera lo pendiente ($%).', replace(to_char(p.valor - pagado, 'FM999,999,999,999'), ',', '.') using errcode = 'P0001';
  end if;
  if not public.es_admin() then
    new.registrado_por := auth.uid(); new.registrado_en := now(); new.numero := null;
  end if;
  if p.tipo = 'cobro' then
    if new.numero is null then new.numero := nextval('public.recibo_numero_seq'); end if;
  else
    new.numero := null;
  end if;
  return new;
end $$;
drop trigger if exists abonos_al_crear on public.abonos;
create trigger abonos_al_crear before insert on public.abonos
  for each row execute function public.al_crear_abono();

-- ¿El pago ya tiene abonos? (función aparte para no encadenar permisos entre tablas)
create or replace function public.pago_tiene_abonos(p_pago uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.abonos a where a.pago_id = p_pago);
$$;

-- Permisos
alter table public.pagos enable row level security;
alter table public.abonos enable row level security;
revoke all on public.pagos, public.abonos from anon, public;
revoke all on sequence public.recibo_numero_seq from anon, public;
grant select, insert, update, delete on public.pagos to authenticated;
grant select, insert, delete on public.abonos to authenticated;
grant usage, select on sequence public.recibo_numero_seq to authenticated;

-- Pagos: se ven si la reserva es visible; los cambia el admin o el asesor dueño de la reserva;
-- un pago con abonos solo lo puede borrar el admin.
drop policy if exists pagos_leer on public.pagos;
create policy pagos_leer on public.pagos for select to authenticated
  using (public.es_activo() and exists (select 1 from public.reservas r where r.id = reserva_id));
drop policy if exists pagos_crear on public.pagos;
create policy pagos_crear on public.pagos for insert to authenticated
  with check (public.puede_editar_reserva(reserva_id));
drop policy if exists pagos_editar on public.pagos;
create policy pagos_editar on public.pagos for update to authenticated
  using (public.puede_editar_reserva(reserva_id)) with check (public.puede_editar_reserva(reserva_id));
drop policy if exists pagos_borrar on public.pagos;
create policy pagos_borrar on public.pagos for delete to authenticated
  using (public.es_admin() or (public.puede_editar_reserva(reserva_id) and not public.pago_tiene_abonos(id)));

-- Abonos: se ven si el pago es visible; los registra quien puede editar la reserva;
-- solo el administrador puede deshacer (borrar) un abono.
drop policy if exists abonos_leer on public.abonos;
create policy abonos_leer on public.abonos for select to authenticated
  using (exists (select 1 from public.pagos p where p.id = pago_id));
drop policy if exists abonos_crear on public.abonos;
create policy abonos_crear on public.abonos for insert to authenticated
  with check (public.es_activo() and (registrado_por = auth.uid() or public.es_admin())
              and public.puede_editar_reserva((select p.reserva_id from public.pagos p where p.id = pago_id)));
drop policy if exists abonos_borrar on public.abonos;
create policy abonos_borrar on public.abonos for delete to authenticated using (public.es_admin());

-- Tras restaurar un respaldo, el consecutivo de recibos continúa después del número más alto.
create or replace function public.ajustar_consecutivo_recibos() returns bigint
language plpgsql security definer set search_path = public as $$
declare m bigint;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto.'; end if;
  select max(numero) into m from public.abonos;
  if m is not null and m > 0 then
    perform setval('public.recibo_numero_seq', greatest(m, (select last_value from public.recibo_numero_seq)), true);
  end if;
  return coalesce(m, 0);
end $$;
revoke all on function public.ajustar_consecutivo_recibos(), public.puede_editar_reserva(uuid), public.pago_tiene_abonos(uuid) from anon, public;
grant execute on function public.ajustar_consecutivo_recibos(), public.puede_editar_reserva(uuid), public.pago_tiene_abonos(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.pagos;  exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.abonos; exception when duplicate_object then null; end;
  end if;
end $$;

-- Comprobación: debe mostrar "abonos | true" y "pagos | true".
select tablename as tabla, rowsecurity as rls_activo
from pg_tables where schemaname = 'public' and tablename in ('pagos','abonos')
order by tablename;
