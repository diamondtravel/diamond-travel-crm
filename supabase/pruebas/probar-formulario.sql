-- Pruebas de la actualización 3 (formulario "Cotiza tu viaje"). Ejecutar después de probar-permisos-2.sql.
\set ON_ERROR_STOP on
create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.exige(c boolean, msg text) returns void language plpgsql as $$
begin if not c then raise exception 'FALLA: %', msg; end if; raise notice 'OK: %', msg; end $$;
create or replace function pg_temp.falla_con(p jsonb, texto text, msg text) returns void language plpgsql as $$
begin
  perform public.registrar_solicitud(p);
  raise exception 'FALLA: % (no dio error)', msg;
exception when raise_exception then
  if sqlerrm like 'FALLA%' then raise; end if;
  if position(texto in sqlerrm) = 0 then raise exception 'FALLA: % (mensaje: %)', msg, sqlerrm; end if;
  raise notice 'OK: %', msg;
end $$;
grant execute on function pg_temp.falla_con(jsonb, text, text) to anon;

-- Público (sin sesión)
set role anon; select pg_temp.como('');
select pg_temp.falla_con('{"nombre":"A","telefono":"3001234567","destino":"Cartagena","adultos":"2","autorizaDatos":true}', 'nombre', 'Exige nombre');
select pg_temp.falla_con('{"nombre":"Ana Ficticia","telefono":"12","destino":"Cartagena","adultos":"2","autorizaDatos":true}', 'WhatsApp', 'Exige WhatsApp válido');
select pg_temp.falla_con('{"nombre":"Ana Ficticia","telefono":"3001234567","destino":"Cartagena","adultos":"2"}', 'autorizar', 'Exige autorización de datos');
select pg_temp.falla_con('{"nombre":"Ana Ficticia","telefono":"3001234567","destino":"Cartagena","adultos":"0","autorizaDatos":true}', 'adultos', 'Exige al menos un adulto');
select pg_temp.falla_con('{"nombre":"Ana Ficticia","telefono":"3001234567","destino":"Cartagena","adultos":"2","fechaIda":"2001-01-01","autorizaDatos":true}', 'futura', 'Rechaza fechas pasadas');
select pg_temp.falla_con('{"nombre":"Ana Ficticia","telefono":"3001234567","destino":"Cartagena","adultos":"2","fechaIda":"hola","autorizaDatos":true}', 'fechas', 'Rechaza fechas inválidas');
select pg_temp.falla_con('{"nombre":"Ana Ficticia","telefono":"3001234567","email":"no-es-correo","destino":"Cartagena","adultos":"2","autorizaDatos":true}', 'correo', 'Rechaza correo inválido');

select public.registrar_solicitud(jsonb_build_object('nombre','Ana Ficticia (prueba)','telefono','300 123 4567','email','ana@ejemplo.com',
  'destino','Cartagena','fechaIda',(current_date+30)::text,'fechaRegreso',(current_date+34)::text,'adultos','2','ninos','1','edadesNinos','6',
  'presupuesto','$ 5.000.000','comoNosConocio','Instagram','comentarios','Hotel con piscina','autorizaDatos',true,'textoAutorizacion','Autorizo...'));
-- robot: campo oculto lleno → responde ok pero no guarda nada
select public.registrar_solicitud('{"web":"http://spam","nombre":"Robot","telefono":"3009999999","destino":"X","adultos":"1","autorizaDatos":true}');
-- doble toque: el mismo número en menos de 10 minutos no se duplica
select public.registrar_solicitud('{"nombre":"Ana Ficticia (prueba)","telefono":"+57 3001234567","destino":"Cartagena","adultos":"2","autorizaDatos":true}');
do $$ begin perform count(*) from clientes; raise exception 'FALLA: anon leyó clientes';
exception when insufficient_privilege then raise notice 'OK: Sin sesión no se leen clientes'; end $$;
do $$ begin perform count(*) from solicitudes; raise exception 'FALLA: anon leyó solicitudes';
exception when insufficient_privilege then raise notice 'OK: Sin sesión no se leen solicitudes'; end $$;
do $$ begin insert into clientes(nombre) values ('x'); raise exception 'FALLA: anon creó cliente';
exception when insufficient_privilege then raise notice 'OK: Sin sesión no se crean clientes directamente'; end $$;
reset role;

select pg_temp.exige((select count(*) from clientes where nombre like 'Robot%')=0, 'Campo trampa: el robot no queda guardado');
select pg_temp.exige((select count(*) from solicitudes)=1, 'Doble envío no se duplica');
select pg_temp.exige((select etapa='nuevo' and origen='Formulario web · Instagram' and destinos='Cartagena' and adultos=2 and ninos=1
  and presupuesto=5000000 and fecha_viaje=current_date+30 and asesor_id='00000000-0000-0000-0000-00000000000a' and creado_por is null
  and preferencias like '%Hotel con piscina%' from clientes where nombre='Ana Ficticia (prueba)'), 'Cliente nuevo con los datos del formulario, asignado al admin');
select pg_temp.exige((select count(*) from historial h join clientes c on c.id=h.cliente_id where c.nombre='Ana Ficticia (prueba)' and h.tipo='Formulario' and h.texto like '%Cartagena%')=1, 'Queda en el historial');
select pg_temp.exige((select (datos->>'autorizaDatos')::boolean and datos->>'textoAutorizacion'='Autorizo...' and datos ? 'autorizadoEn' from solicitudes), 'Guarda constancia de la autorización');

-- El admin elige a quién se asignan las solicitudes
set role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into config(clave, valor) values ('formulario', '{"asesorId":"00000000-0000-0000-0000-00000000000b"}')
  on conflict (clave) do update set valor = excluded.valor;
select pg_temp.exige((select count(*) from solicitudes)=1, 'Admin ve la solicitud');
insert into seguimientos(cliente_id, regla, clave, mensaje)
  select cliente_id, 'solicitud', 'solicitud:'||id, 'Hola Ana' from solicitudes;
select pg_temp.exige((select count(*) from seguimientos where regla='solicitud')=1, 'Se registra el seguimiento "solicitud"');
reset role; set role anon; select pg_temp.como('');
select public.registrar_solicitud('{"nombre":"Beto Ficticio (prueba)","telefono":"3112223344","destino":"Eje Cafetero","adultos":"4","autorizaDatos":"true"}');
reset role;
select pg_temp.exige((select asesor_id='00000000-0000-0000-0000-00000000000b' from clientes where nombre='Beto Ficticio (prueba)'), 'Se asigna al asesor elegido');
set role authenticated; select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.exige((select count(*) from solicitudes)=1, 'La asesora ve solo las solicitudes de sus clientes');
do $$ begin delete from solicitudes; if (select count(*) from solicitudes)<>1 then raise exception 'FALLA: asesora borró'; end if; raise notice 'OK: Asesora no borra solicitudes'; end $$;
reset role;

-- Cliente que ya existía (perdido) vuelve a escribir: no se duplica, vuelve a "nuevo"
update clientes set etapa='perdido', email='beto@ya.com' where nombre='Beto Ficticio (prueba)';
update solicitudes set creado_en = now() - interval '1 day';
set role anon; select pg_temp.como('');
select public.registrar_solicitud('{"nombre":"Roberto F.","telefono":"+57 311 222 3344","email":"otro@correo.com","destino":"Santa Marta","adultos":"2","autorizaDatos":true}');
reset role;
select pg_temp.exige((select count(*) from clientes where telefono like '%222%3344%')=1, 'Cliente existente no se duplica');
select pg_temp.exige((select etapa='nuevo' and email='beto@ya.com' and destinos='Eje Cafetero' and nombre='Beto Ficticio (prueba)' from clientes where telefono like '%222%3344%'), 'No sobrescribe sus datos y vuelve a "Nuevo contacto"');
select pg_temp.exige((select count(*) from solicitudes s join clientes c on c.id=s.cliente_id where c.nombre='Beto Ficticio (prueba)' and not s.nuevo_cliente and s.datos->>'destino'='Santa Marta')=1, 'Nueva solicitud ligada al cliente existente');

-- Límite por hora
insert into solicitudes(cliente_id, telefono_norm) select (select id from clientes limit 1), 'x'||g from generate_series(1,40) g;
set role anon; select pg_temp.como('');
select pg_temp.falla_con('{"nombre":"Carla Ficticia","telefono":"3205556677","destino":"Cancún","adultos":"2","autorizaDatos":true}', 'muchas solicitudes', 'Límite de 40 solicitudes por hora');
reset role;
delete from solicitudes where telefono_norm like 'x%';
\echo PRUEBAS FORMULARIO TERMINARON
