-- Pruebas de permisos con datos ficticios. Cada bloque falla con EXCEPTION si algo no se cumple.
\set ON_ERROR_STOP on
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','reservasdiamondtravel@gmail.com'),
 ('00000000-0000-0000-0000-00000000000b','asesora1@ejemplo.com'),
 ('00000000-0000-0000-0000-00000000000c','asesor2@ejemplo.com'),
 ('00000000-0000-0000-0000-00000000000d','intruso@ejemplo.com');

create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.exige(c boolean, msg text) returns void language plpgsql as $$
begin if not c then raise exception 'FALLA: %', msg; end if; raise notice 'OK: %', msg; end $$;

select pg_temp.exige((select rol='admin' and activo from perfiles where email='reservasdiamondtravel@gmail.com'), 'El correo de la agencia queda como admin activo');
select pg_temp.exige((select rol='asesor' and not activo from perfiles where email='asesora1@ejemplo.com'), 'Usuario nuevo queda como asesor inactivo');

set role authenticated;
-- Usuario inactivo no ve nada ni puede crear
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.exige((select count(*) from perfiles)=1, 'Inactivo solo ve su propio perfil');
do $$ begin
  insert into clientes(nombre) values ('Intento inactivo');
  raise exception 'FALLA: inactivo pudo crear cliente';
exception when insufficient_privilege then raise notice 'OK: Inactivo no puede crear clientes'; end $$;
-- Inactivo no puede activarse a sí mismo
update perfiles set activo=true, rol='admin', nombre='Asesora Uno' where id=auth.uid();
select pg_temp.exige((select not activo and rol='asesor' and nombre='Asesora Uno' from perfiles where id=auth.uid()), 'No puede activarse ni volverse admin; sí cambiar su nombre');

-- Admin activa asesores
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update perfiles set activo=true where email in ('asesora1@ejemplo.com','asesor2@ejemplo.com');
select pg_temp.exige((select count(*) from perfiles where activo)=3, 'Admin activa a dos asesores');
do $$ begin
  update perfiles set activo=false where email='reservasdiamondtravel@gmail.com';
  raise exception 'FALLA: se pudo quedar sin admin';
exception when raise_exception then
  if sqlerrm like 'FALLA%' then raise; end if; raise notice 'OK: No se puede desactivar al último admin';
end $$;

-- Asesora 1 crea cliente y cotización
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into clientes(nombre,telefono) values ('Cliente Ficticio Uno','300 000 0001');
insert into historial(cliente_id,texto) select id,'Primer contacto' from clientes where nombre='Cliente Ficticio Uno';
insert into cotizaciones(cliente_id, numero, datos) select id, 999, '{"x":1}' from clientes where nombre='Cliente Ficticio Uno';
select pg_temp.exige((select numero from cotizaciones)=1, 'El asesor no puede elegir el número: recibe el consecutivo 1');
do $$ begin
  insert into clientes(nombre, asesor_id) values ('Para otro', '00000000-0000-0000-0000-00000000000c');
  raise exception 'FALLA: asesor creó cliente a nombre de otro';
exception when insufficient_privilege then raise notice 'OK: Asesor no crea clientes a nombre de otro'; end $$;

-- Asesor 2 no ve los clientes de la asesora 1 (modo por defecto)
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.exige((select count(*) from clientes)=0, 'Asesor 2 no ve clientes ajenos');
select pg_temp.exige((select count(*) from cotizaciones)=0, 'Asesor 2 no ve cotizaciones ajenas');
select pg_temp.exige((select count(*) from historial)=0, 'Asesor 2 no ve historial ajeno');
update clientes set nombre='Hackeado';
select pg_temp.exige((select count(*) from buscar_duplicado('3000000001',''))=1 and not (select visible from buscar_duplicado('3000000001','')), 'Detecta duplicado ajeno sin dar acceso');
insert into clientes(nombre) values ('Cliente Ficticio Dos');
insert into cotizaciones(cliente_id) select id from clientes where nombre='Cliente Ficticio Dos';
select pg_temp.exige((select numero from cotizaciones)=2, 'Consecutivo continúa en 2');
-- Asesor no puede borrar
delete from clientes where nombre='Cliente Ficticio Dos';
select pg_temp.exige((select count(*) from clientes)=1, 'Asesor no puede borrar clientes');
-- Asesor no cambia configuración
do $$ begin
  insert into config(clave,valor) values ('visibilidad','{"asesoresVenTodo":true}');
  raise exception 'FALLA: asesor cambió la configuración';
exception when insufficient_privilege then raise notice 'OK: Asesor no cambia la configuración'; end $$;

-- Admin ve todo, cambia visibilidad, borra
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.exige((select count(*) from clientes)=2 and (select nombre from clientes where telefono='300 000 0001')='Cliente Ficticio Uno', 'Admin ve todos y el intento de cambio ajeno no tuvo efecto');
insert into config(clave,valor) values ('visibilidad','{"asesoresVenTodo":true}');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.exige((select count(*) from clientes)=2, 'Con visibilidad abierta el asesor ve todos');
do $$ begin
  update clientes set asesor_id='00000000-0000-0000-0000-00000000000c' where nombre='Cliente Ficticio Uno';
  raise notice 'OK: Asesor puede tomar un cliente visible para sí';
end $$;
do $$ begin
  update clientes set asesor_id='00000000-0000-0000-0000-00000000000b' where nombre='Cliente Ficticio Dos';
  raise exception 'FALLA: asesor asignó su cliente a otra persona';
exception when insufficient_privilege then raise notice 'OK: Asesor no asigna clientes a otros'; end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
-- No se puede cambiar el número de una cotización
update cotizaciones set numero=50 where numero=1;
select pg_temp.exige((select count(*) from cotizaciones where numero=1)=1, 'El número de cotización no se puede cambiar');
-- Restauración por admin con número propio y ajuste del consecutivo
insert into cotizaciones(numero, datos) values (40, '{}');
select ajustar_consecutivo();
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into cotizaciones(datos) values ('{}');
select pg_temp.exige((select max(numero) from cotizaciones where asesor_id=auth.uid())=41, 'Tras restaurar, el consecutivo sigue en 41');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
delete from clientes where nombre='Cliente Ficticio Dos';
select pg_temp.exige((select count(*) from clientes)=1, 'Admin puede borrar clientes');
-- Sin sesión (anon) no ve nada
reset role; set role anon; select pg_temp.como('');
do $$ begin perform count(*) from clientes; raise exception 'FALLA: anon leyó clientes';
exception when insufficient_privilege then raise notice 'OK: Sin sesión no se puede leer nada'; end $$;
reset role;
\echo TODAS LAS PRUEBAS TERMINARON
