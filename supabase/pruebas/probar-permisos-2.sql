-- Pruebas de la actualización 2 (seguimientos y plantillas). Ejecutar después de probar-permisos.sql.
\set ON_ERROR_STOP on
create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.exige(c boolean, msg text) returns void language plpgsql as $$
begin if not c then raise exception 'FALLA: %', msg; end if; raise notice 'OK: %', msg; end $$;
set role authenticated;
-- asesora1 (b) tiene "Cliente Ficticio Uno"? fue reasignado a asesor2 (c) en la prueba anterior.
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
insert into seguimientos(cliente_id, regla, clave, mensaje) select id,'contacto','contacto:'||id||':x','Hola' from clientes where nombre='Cliente Ficticio Uno';
select pg_temp.exige((select count(*) from seguimientos)=1, 'Asesor registra seguimiento de su cliente');
do $$ begin
  insert into seguimientos(cliente_id, regla, clave) select id,'contacto','contacto:'||id||':x' from clientes where nombre='Cliente Ficticio Uno';
  raise exception 'FALLA: se repitió el mismo seguimiento';
exception when unique_violation then raise notice 'OK: El mismo seguimiento no se puede registrar dos veces'; end $$;
-- quitar visibilidad abierta: asesora1 no ve los seguimientos del asesor 2
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update config set valor='{"asesoresVenTodo":false}' where clave='visibilidad';
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.exige((select count(*) from seguimientos)=0, 'Asesora no ve seguimientos de clientes ajenos');
do $$ begin
  insert into seguimientos(cliente_id, regla, clave) select id,'contacto','z' from clientes limit 1;
  if (select count(*) from seguimientos)>0 then raise exception 'FALLA: registró seguimiento en cliente ajeno'; end if;
  raise notice 'OK: No hay clientes ajenos visibles para registrar';
end $$;
delete from seguimientos;
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.exige((select count(*) from seguimientos)=1, 'Asesor no puede borrar seguimientos');
-- Plantillas
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into plantillas(nombre, datos) values ('San Andrés 4 noches','{"viaje":{"destinos":"San Andrés"}}');
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.exige((select count(*) from plantillas)=1, 'Todo el equipo ve las plantillas');
update plantillas set datos='{"viaje":{"destinos":"San Andrés, Colombia"}}', creado_por=auth.uid();
select pg_temp.exige((select creado_por from plantillas)='00000000-0000-0000-0000-00000000000b' and (select datos->'viaje'->>'destinos' from plantillas)='San Andrés, Colombia', 'Otro asesor mejora la plantilla sin cambiar su autora');
delete from plantillas;
select pg_temp.exige((select count(*) from plantillas)=1, 'Solo la autora o el admin borran la plantilla');
do $$ begin
  insert into plantillas(nombre) values ('san andrés 4 noches');
  raise exception 'FALLA: nombre repetido';
exception when unique_violation then raise notice 'OK: No se repiten nombres de plantilla'; end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
delete from plantillas;
select pg_temp.exige((select count(*) from plantillas)=0, 'Admin borra plantillas');
reset role; set role anon; select pg_temp.como('');
do $$ begin perform count(*) from plantillas; raise exception 'FALLA: anon leyó plantillas';
exception when insufficient_privilege then raise notice 'OK: Sin sesión no se leen plantillas'; end $$;
reset role;
\echo PRUEBAS 2 TERMINARON
