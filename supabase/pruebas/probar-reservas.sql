-- Pruebas de la actualización 4 (reservas). Ejecutar después de probar-formulario.sql.
\set ON_ERROR_STOP on
create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.exige(c boolean, msg text) returns void language plpgsql as $$
begin if not c then raise exception 'FALLA: %', msg; end if; raise notice 'OK: %', msg; end $$;
set role authenticated;
-- visibilidad cerrada: cada asesor ve lo suyo
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update config set valor='{"asesoresVenTodo":false}' where clave='visibilidad';
-- Asesora 1 crea una reserva e intenta elegir número y autor
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into reservas(numero, destino, creado_por, datos) values (999, 'San Andrés', '00000000-0000-0000-0000-00000000000a', '{"pasajeros":[{"nombre":"Ficticio Uno"}]}');
select pg_temp.exige((select numero=1 and creado_por='00000000-0000-0000-0000-00000000000b' and asesor_id=auth.uid() and estado='por_confirmar' from reservas), 'Número RS consecutivo y autor reales (no se pueden falsificar)');
update reservas set numero=50, estado='confirmada';
select pg_temp.exige((select numero=1 and estado='confirmada' from reservas), 'El número no cambia al editar');
do $$ begin
  insert into reservas(destino, asesor_id) values ('Ajena', '00000000-0000-0000-0000-00000000000c');
  raise exception 'FALLA: creó reserva a nombre de otro asesor';
exception when insufficient_privilege then raise notice 'OK: No crea reservas a nombre de otro asesor'; end $$;
do $$ begin
  insert into reservas(estado) values ('inventado');
  raise exception 'FALLA: estado inválido';
exception when check_violation then raise notice 'OK: Solo estados válidos'; end $$;
-- Asesor 2 no la ve ni la edita
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.exige((select count(*) from reservas)=0, 'Asesor no ve reservas ajenas');
update reservas set destino='Hackeado';
-- Asesora no puede borrar
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
delete from reservas;
select pg_temp.exige((select count(*) from reservas)=1 and (select destino from reservas)='San Andrés', 'Asesora no borra; nadie ajeno edita');
-- Admin ve todo, conserva número al restaurar y ajusta el consecutivo
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into reservas(numero, destino) values (40, 'Restaurada');
select pg_temp.exige((select count(*) from reservas)=2 and exists(select 1 from reservas where numero=40), 'Admin ve todo y conserva el número al restaurar');
select pg_temp.exige(public.ajustar_consecutivo_reservas()=40, 'Ajuste del consecutivo');
insert into reservas(destino) values ('Siguiente');
select pg_temp.exige((select numero from reservas where destino='Siguiente')=41, 'El consecutivo continúa después del más alto');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$ begin perform public.ajustar_consecutivo_reservas(); raise exception 'FALLA: asesora ajustó el consecutivo';
exception when raise_exception then if sqlerrm like 'FALLA%' then raise; end if; raise notice 'OK: Solo el admin ajusta el consecutivo'; end $$;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
delete from reservas;
select pg_temp.exige((select count(*) from reservas)=0, 'Admin borra reservas');
reset role; set role anon; select pg_temp.como('');
do $$ begin perform count(*) from reservas; raise exception 'FALLA: anon leyó reservas';
exception when insufficient_privilege then raise notice 'OK: Sin sesión no se leen reservas'; end $$;
reset role;
\echo PRUEBAS RESERVAS TERMINARON
