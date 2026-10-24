-- Pruebas de la actualización 5 (pagos). Ejecutar después de probar-reservas.sql.
\set ON_ERROR_STOP on
create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.exige(c boolean, msg text) returns void language plpgsql as $$
begin if not c then raise exception 'FALLA: %', msg; end if; raise notice 'OK: %', msg; end $$;
set role authenticated;
-- Asesora 1 crea su reserva con dos cuotas y un pago a proveedor
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into reservas(destino) values ('San Andrés pagos');
insert into pagos(reserva_id, tipo, concepto, valor, fecha_limite, creado_por)
  select id, 'cobro', 'Cuota 1', 1000000, current_date, '00000000-0000-0000-0000-00000000000a' from reservas where destino='San Andrés pagos';
insert into pagos(reserva_id, tipo, concepto, valor, fecha_limite)
  select id, 'cobro', 'Cuota 2', 1500000, current_date + 30 from reservas where destino='San Andrés pagos';
insert into pagos(reserva_id, tipo, proveedor, categoria, concepto, valor, fecha_limite)
  select id, 'pago', 'Hotel de prueba', 'Hotel', 'Saldo hotel', 2000000, current_date - 2 from reservas where destino='San Andrés pagos';
select pg_temp.exige((select count(*) from pagos)=3 and (select creado_por from pagos where concepto='Cuota 1')='00000000-0000-0000-0000-00000000000b', 'Asesora crea cuotas y pagos; el autor no se falsifica');
do $$ begin
  insert into pagos(reserva_id, tipo, valor, fecha_limite) select id, 'cobro', 0, current_date from reservas limit 1;
  raise exception 'FALLA: valor cero';
exception when check_violation then raise notice 'OK: El valor debe ser mayor que cero'; end $$;
-- Abono parcial, recibo consecutivo
insert into abonos(pago_id, valor, medio, numero) select id, 400000, 'Nequi', 999 from pagos where concepto='Cuota 1';
select pg_temp.exige((select numero=1 and registrado_por=auth.uid() from abonos), 'Abono con recibo RC consecutivo (no se elige el número)');
do $$ begin
  insert into abonos(pago_id, valor) select id, 700000 from pagos where concepto='Cuota 1';
  raise exception 'FALLA: pagó más de lo pendiente';
exception when raise_exception then if sqlerrm like 'FALLA%' then raise; end if; raise notice 'OK: No se puede pagar más de lo pendiente (%)', sqlerrm; end $$;
insert into abonos(pago_id, valor, medio) select id, 600000, 'Efectivo' from pagos where concepto='Cuota 1';
insert into abonos(pago_id, valor, medio) select id, 2000000, 'Transferencia' from pagos where concepto='Saldo hotel';
select pg_temp.exige((select numero from abonos where valor=600000)=2 and (select numero from abonos where valor=2000000) is null, 'Recibo solo para pagos de clientes');
do $$ begin
  update pagos set valor = 500000 where concepto='Cuota 1';
  raise exception 'FALLA: bajó el valor por debajo de lo pagado';
exception when raise_exception then if sqlerrm like 'FALLA%' then raise; end if; raise notice 'OK: El valor no baja de lo ya pagado'; end $$;
update pagos set fecha_limite = current_date + 5, tipo='pago' where concepto='Cuota 2';
select pg_temp.exige((select fecha_limite=current_date+5 and tipo='cobro' from pagos where concepto='Cuota 2'), 'Cambia la fecha; el tipo no cambia');
-- La asesora no puede borrar un pago con abonos ni deshacer abonos; sí un pago sin abonos
delete from pagos where concepto='Cuota 1';
delete from abonos;
select pg_temp.exige((select count(*) from pagos where concepto='Cuota 1')=1 and (select count(*) from abonos)=3, 'Asesora no borra pagos con abonos ni deshace abonos');
-- Asesor 2 no ve ni toca los pagos de la asesora 1
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.exige((select count(*) from pagos)=0 and (select count(*) from abonos)=0, 'Asesor no ve pagos de reservas ajenas');
do $$ begin
  insert into pagos(reserva_id, tipo, valor, fecha_limite) select id, 'cobro', 1, current_date from reservas;
  if (select count(*) from pagos) > 0 then raise exception 'FALLA'; end if;
  raise notice 'OK: No hay reservas ajenas visibles para agregar pagos';
end $$;
-- Con visibilidad abierta ve, pero no edita
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update config set valor='{"asesoresVenTodo":true}' where clave='visibilidad';
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.exige((select count(*) from pagos)=3, 'Con visibilidad abierta el asesor ve los pagos');
update pagos set notas='intento';
select pg_temp.exige((select count(*) from pagos where notas='intento')=0, 'Pero no los edita (solo el dueño de la reserva o el admin)');
do $$ begin
  insert into abonos(pago_id, valor) select id, 1 from pagos where concepto='Cuota 2';
  raise exception 'FALLA: registró abono en reserva ajena';
exception when insufficient_privilege then raise notice 'OK: No registra abonos en reservas ajenas'; end $$;
-- Admin deshace un abono y ajusta el consecutivo de recibos
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update config set valor='{"asesoresVenTodo":false}' where clave='visibilidad';
delete from abonos where valor=600000;
select pg_temp.exige((select count(*) from abonos)=2, 'Admin deshace un abono');
insert into abonos(pago_id, valor, numero) select id, 100000, 30 from pagos where concepto='Cuota 2';
select pg_temp.exige(public.ajustar_consecutivo_recibos()=30, 'Admin conserva número al restaurar y ajusta el consecutivo');
delete from reservas where destino='San Andrés pagos';
select pg_temp.exige((select count(*) from pagos)=0 and (select count(*) from abonos)=0, 'Borrar la reserva borra sus pagos');
reset role; set role anon; select pg_temp.como('');
do $$ begin perform count(*) from pagos; raise exception 'FALLA: anon leyó pagos';
exception when insufficient_privilege then raise notice 'OK: Sin sesión no se leen pagos'; end $$;
reset role;
\echo PRUEBAS PAGOS TERMINARON
