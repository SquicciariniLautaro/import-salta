-- 20261013000000_inicial.sql
-- Esquema completo de Import Salta en Supabase (Postgres).
-- Esta migracion no se edita una vez aplicada: cualquier cambio posterior va
-- en un archivo nuevo dentro de supabase/migrations/.
--
-- COMO SE PROTEGEN LOS DATOS
-- Con Supabase el navegador habla directo con la base, asi que la seguridad
-- vive aca adentro y no en el frontend:
--   * Todas las tablas tienen RLS activado. RLS ("seguridad por fila") es un
--     filtro que Postgres aplica solo: cada tabla tiene reglas ("politicas")
--     que dicen quien puede ver o cambiar cada fila.
--   * Un visitante sin sesion (rol "anon") no tiene permiso sobre NINGUNA
--     tabla. Lo unico que puede hacer es llamar a catalogo_publico(), que
--     devuelve solamente columnas publicas.
--   * Un usuario con sesion (rol "authenticated") solo pasa las politicas si
--     es_admin() dice que si.
--
-- Convenciones:
--   * Plata y cotizaciones: numeric(18,4). Nunca real ni double (redondean mal).
--   * Fechas: timestamptz (se guardan en UTC).
--   * Estados: text con CHECK.
--   * Cada fila de "celulares" y "accesorios" es UNA unidad fisica.

-- ---------------------------------------------------------------------------
-- configuracion: una sola fila (id = 1) con las dos cotizaciones.
-- ---------------------------------------------------------------------------
create table if not exists public.configuracion (
  id               smallint      primary key,
  -- Pesos por dolar para vender. Es la que usa el catalogo.
  cotizacion_dolar numeric(18,4) not null,
  -- Pesos por dolar para el costo de la mercaderia. NULL = la misma que la de venta.
  cotizacion_costo numeric(18,4),
  -- Impide que alguien cree una segunda fila.
  constraint configuracion_una_fila check (id = 1),
  constraint configuracion_dolar_positivo check (cotizacion_dolar > 0),
  constraint configuracion_costo_positivo check (cotizacion_costo is null or cotizacion_costo > 0)
);

-- Valor de arranque. El dueno lo corrige desde el panel antes de cargar stock.
insert into public.configuracion (id, cotizacion_dolar, cotizacion_costo)
values (1, 1000, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- celulares: producto principal. Una fila por equipo.
-- ---------------------------------------------------------------------------
create table if not exists public.celulares (
  id                bigint generated always as identity primary key,

  -- Identidad del lote: los equipos que coinciden en estos cinco datos se muestran juntos.
  modelo            text          not null,              -- siempre en mayusculas
  capacidad         text          not null default '',
  color             text          not null default '',
  bateria           text          not null default '',
  detalles          text          not null default '',

  -- IMEI: numero unico de cada equipo. NO forma parte del lote (cada equipo
  -- tiene el suyo). NULL si no se cargo. Nunca sale por el catalogo.
  imei              text          unique,

  costo_usd         numeric(18,4) not null default 0,    -- nunca sale por el catalogo
  precio_usd        numeric(18,4) not null default 0,    -- de lista; al vender se pisa con el cobrado

  estado            text          not null default 'disponible',

  fecha_ingreso     timestamptz   not null default now(),
  fecha_venta       timestamptz,

  -- Cotizaciones del dia de la venta: el historial no cambia cuando se mueve el dolar.
  cotizacion_venta  numeric(18,4),
  cotizacion_costo  numeric(18,4),

  -- Parte del precio cobrada con un equipo recibido en permuta (NULL si no hubo).
  permuta_usd       numeric(18,4),

  -- Quien tiene la unidad (revendedor o cliente que seno), a que precio y desde cuando.
  revendedor        text,
  precio_revendedor numeric(18,4),
  fecha_revendedor  timestamptz,

  -- true si el lote junto ingresos con distinto costo o precio.
  promediado        boolean       not null default false,

  constraint celulares_estado_valido
    check (estado in ('disponible', 'vendido', 'revendedor', 'senado')),
  constraint celulares_largos
    check (char_length(modelo) between 1 and 80 and char_length(capacidad) <= 20
       and char_length(color) <= 40 and char_length(bateria) <= 10
       and char_length(detalles) <= 200 and char_length(imei) <= 20)
);

-- Un indice acelera las busquedas por esa columna, como el indice de un libro.
create index if not exists celulares_estado on public.celulares (estado);
create index if not exists celulares_estado_fecha on public.celulares (estado, fecha_venta);
create index if not exists celulares_revendedor on public.celulares (revendedor);

-- ---------------------------------------------------------------------------
-- accesorios: producto secundario. Una fila por unidad (diez fundas = diez filas).
-- Igual que celulares, con "tipo" y sin capacidad, bateria, imei ni permuta.
-- ---------------------------------------------------------------------------
create table if not exists public.accesorios (
  id                bigint generated always as identity primary key,

  -- Identidad del lote.
  tipo              text          not null,              -- FUNDA, CARGADOR, VIDRIO...
  modelo            text          not null default '',
  color             text          not null default '',
  detalles          text          not null default '',

  costo_usd         numeric(18,4) not null default 0,
  precio_usd        numeric(18,4) not null default 0,

  estado            text          not null default 'disponible',

  fecha_ingreso     timestamptz   not null default now(),
  fecha_venta       timestamptz,

  cotizacion_venta  numeric(18,4),
  cotizacion_costo  numeric(18,4),

  revendedor        text,
  precio_revendedor numeric(18,4),
  fecha_revendedor  timestamptz,

  promediado        boolean       not null default false,

  constraint accesorios_estado_valido
    check (estado in ('disponible', 'vendido', 'revendedor', 'senado')),
  constraint accesorios_largos
    check (char_length(tipo) between 1 and 60 and char_length(modelo) <= 80
       and char_length(color) <= 40 and char_length(detalles) <= 200)
);

create index if not exists accesorios_estado on public.accesorios (estado);
create index if not exists accesorios_estado_fecha on public.accesorios (estado, fecha_venta);
create index if not exists accesorios_revendedor on public.accesorios (revendedor);

-- ---------------------------------------------------------------------------
-- pagos_revendedor y pagos_sena: misma forma.
-- Fila positiva = plata entregada. Fila negativa = parte de lo entregado que se
-- desconto al marcar equipos como pagados (para no contar la plata dos veces).
-- ---------------------------------------------------------------------------
create table if not exists public.pagos_revendedor (
  id         bigint generated always as identity primary key,
  revendedor text          not null,
  monto_ars  numeric(18,4) not null,
  cotizacion numeric(18,4) not null,                     -- la del dia del pago
  monto_usd  numeric(18,4) not null,
  aplicado   boolean       not null default false,       -- true = la cuenta ya se cerro
  fecha      timestamptz   not null default now()
);
create index if not exists pagos_revendedor_nombre on public.pagos_revendedor (revendedor);

create table if not exists public.pagos_sena (
  id         bigint generated always as identity primary key,
  revendedor text          not null,                     -- aca es el cliente que seno
  monto_ars  numeric(18,4) not null,
  cotizacion numeric(18,4) not null,
  monto_usd  numeric(18,4) not null,
  aplicado   boolean       not null default false,
  fecha      timestamptz   not null default now()
);
create index if not exists pagos_sena_nombre on public.pagos_sena (revendedor);

-- ---------------------------------------------------------------------------
-- escalas_precio: precios por cantidad de un accesorio.
-- "clave" es la clave normalizada del lote (tipo + modelo + color + detalles).
-- ---------------------------------------------------------------------------
create table if not exists public.escalas_precio (
  id      bigint generated always as identity primary key,
  clave   text          not null,
  desde   integer       not null,                        -- cantidad minima del tramo
  moneda  text          not null,                        -- usd (sigue la cotizacion) o ars (fijo)
  precio  numeric(18,4) not null,
  constraint escalas_moneda_valida check (moneda in ('usd', 'ars')),
  constraint escalas_desde_valido check (desde >= 1),
  constraint escalas_precio_valido check (precio >= 0),
  constraint escalas_clave_desde unique (clave, desde)
);

-- ---------------------------------------------------------------------------
-- revendedores_lista: revendedores guardados (existen aunque no deban nada).
-- ---------------------------------------------------------------------------
create table if not exists public.revendedores_lista (
  id      bigint generated always as identity primary key,
  nombre  text not null,
  clave   text not null unique,                          -- nombre normalizado
  celular text not null default ''
);

-- ---------------------------------------------------------------------------
-- administradores: correos que pueden usar el panel.
-- Las contrasenas NO estan aca: las guarda Supabase en su sistema de usuarios
-- (Authentication). Esta tabla solo dice cuales de esos usuarios son
-- administradores. Un usuario que no figura aca puede iniciar sesion pero no
-- ve ni toca nada.
-- ---------------------------------------------------------------------------
create table if not exists public.administradores (
  correo text        primary key,                        -- siempre en minusculas
  creado timestamptz not null default now(),
  constraint administradores_minusculas check (correo = lower(correo))
);

insert into public.administradores (correo) values
  ('lautarorodriguezsquicciarini@gmail.com')
on conflict (correo) do nothing;

-- ---------------------------------------------------------------------------
-- es_admin(): true si quien llama tiene sesion, su correo esta confirmado y
-- figura en "administradores".
--
-- "security definer" hace que la funcion corra con los permisos de su dueno y
-- no con los de quien la llama: asi puede leer la tabla de usuarios de
-- Supabase, que un usuario comun no ve. "set search_path = ''" obliga a
-- escribir cada tabla con su esquema adelante y evita que alguien la engane
-- con una tabla del mismo nombre.
-- ---------------------------------------------------------------------------
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.users usuario
      join public.administradores administrador
        on administrador.correo = lower(usuario.email)
     where usuario.id = (select auth.uid())
       -- Sin esto, alguien podria registrarse con un correo ajeno sin demostrar que es suyo.
       and usuario.email_confirmed_at is not null
  );
$$;

-- ---------------------------------------------------------------------------
-- catalogo_publico(): lo UNICO que puede ver alguien sin sesion.
--
-- REGLA DE SEGURIDAD: esta funcion nombra las columnas una por una. Nunca
-- "select *": si manana se agrega una columna privada, no se filtra sola.
-- Nunca salen por aca: costo_usd, imei, revendedor, precio_revendedor,
-- fecha_venta, permuta_usd, ni nada de pagos o administradores.
--
-- Devuelve las unidades disponibles ya contadas por lote. El frontend termina
-- de juntarlas (sin distinguir mayusculas ni tildes) y las ordena.
-- ---------------------------------------------------------------------------
create or replace function public.catalogo_publico()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'cotizacion',
      (select cotizacion_dolar from public.configuracion where id = 1),

    'celulares',
      coalesce((
        select jsonb_agg(fila)
          from (
            select modelo, capacidad, color, bateria, detalles,
                   count(*)::int   as cantidad,
                   sum(precio_usd) as suma_precio
              from public.celulares
             where estado = 'disponible'
             group by modelo, capacidad, color, bateria, detalles
          ) fila
      ), '[]'::jsonb),

    'accesorios',
      coalesce((
        select jsonb_agg(fila)
          from (
            select tipo, modelo, color, detalles,
                   count(*)::int   as cantidad,
                   sum(precio_usd) as suma_precio
              from public.accesorios
             where estado = 'disponible'
             group by tipo, modelo, color, detalles
          ) fila
      ), '[]'::jsonb),

    'escalas',
      coalesce((
        select jsonb_agg(fila)
          from (
            select clave, desde, moneda, precio
              from public.escalas_precio
             order by clave, desde
          ) fila
      ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Permisos.
-- ---------------------------------------------------------------------------

-- Quien puede ejecutar cada funcion. Primero se le saca a todos y despues se
-- le da solo a quien corresponde.
revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

revoke all on function public.catalogo_publico() from public;
grant execute on function public.catalogo_publico() to anon, authenticated;

-- Las tablas: nada para los visitantes; lectura y escritura para usuarios con
-- sesion (que ademas tienen que pasar las politicas de abajo).
revoke all on table
  public.configuracion, public.celulares, public.accesorios,
  public.pagos_revendedor, public.pagos_sena, public.escalas_precio,
  public.revendedores_lista, public.administradores
from public, anon;

grant select, insert, update, delete on table
  public.celulares, public.accesorios,
  public.pagos_revendedor, public.pagos_sena, public.escalas_precio,
  public.revendedores_lista
to authenticated;

-- La configuracion es una sola fila: se lee y se modifica, no se crea ni se borra.
grant select, update on table public.configuracion to authenticated;

-- La lista de administradores solo se lee desde el panel. Se modifica desde
-- el editor SQL de Supabase, no desde el navegador.
grant select on table public.administradores to authenticated;

-- RLS activado en todas las tablas. Con RLS activado y sin politicas, nadie
-- ve nada: lo que no se permite expresamente queda prohibido.
alter table public.configuracion      enable row level security;
alter table public.celulares          enable row level security;
alter table public.accesorios         enable row level security;
alter table public.pagos_revendedor   enable row level security;
alter table public.pagos_sena         enable row level security;
alter table public.escalas_precio     enable row level security;
alter table public.revendedores_lista enable row level security;
alter table public.administradores    enable row level security;

-- Una politica por tabla: solo los administradores, para todo.
-- "using" filtra las filas que se pueden ver o cambiar; "with check" revisa
-- las filas nuevas o modificadas. El (select ...) hace que es_admin() se
-- calcule una vez por consulta y no una vez por fila.
drop policy if exists solo_administradores on public.configuracion;
create policy solo_administradores on public.configuracion
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.celulares;
create policy solo_administradores on public.celulares
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.accesorios;
create policy solo_administradores on public.accesorios
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.pagos_revendedor;
create policy solo_administradores on public.pagos_revendedor
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.pagos_sena;
create policy solo_administradores on public.pagos_sena
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.escalas_precio;
create policy solo_administradores on public.escalas_precio
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.revendedores_lista;
create policy solo_administradores on public.revendedores_lista
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.administradores;
create policy solo_administradores on public.administradores
  for select to authenticated
  using ((select public.es_admin()));
