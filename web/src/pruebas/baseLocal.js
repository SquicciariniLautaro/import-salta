// pruebas/baseLocal.js
// Una base de datos de prueba que se comporta como la de Supabase pero corre
// en esta misma PC, en memoria (PGlite: un Postgres completo compilado para
// correr dentro de Node o del navegador). Se le aplican las migraciones
// reales de supabase/migrations/, asi que las reglas y los permisos que se
// prueban son exactamente los mismos que van a produccion.
//
// La usan dos cosas:
//   * scripts/probar-base.js, para probar la base desde la terminal;
//   * el "modo prueba" del sitio en desarrollo (VITE_MODO_PRUEBA=1), para
//     usar el panel entero sin tocar los datos reales.
// Nunca forma parte del sitio publicado.

// Lo minimo de Supabase que las migraciones dan por hecho: los roles "anon"
// (visitante) y "authenticated" (usuario con sesion), la tabla de usuarios y
// auth.uid(), que dice quien esta llamando.
const SIMULAR_SUPABASE = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`

// Usuario administrador de mentira con el que trabaja el modo prueba.
export const ADMIN_DE_PRUEBA = '11111111-1111-1111-1111-111111111111'

// PGlite: la clase importada de '@electric-sql/pglite'.
// migraciones: el texto de cada archivo .sql, ya en orden.
// semilla: SQL extra para cargar despues (datos de prueba, usuarios).
export async function crearBaseLocal({ PGlite, migraciones, semilla = '' }) {
  const base = new PGlite()
  await base.exec(SIMULAR_SUPABASE)
  for (const sql of migraciones) await base.exec(sql)
  if (semilla) await base.exec(semilla)

  // Las consultas se hacen de a una: cambiar de rol, consultar y volver no
  // puede mezclarse con otra consulta que llegue al mismo tiempo.
  let cola = Promise.resolve()
  function enOrden(trabajo) {
    const turno = cola.then(trabajo, trabajo)
    cola = turno.catch(() => {})
    return turno
  }

  // Corre SQL haciendose pasar por un rol ('anon' o 'authenticated') y un usuario.
  function como(rol, usuario, sql, parametros = []) {
    return enOrden(async () => {
      await base.exec(`set role ${rol}; set request.jwt.claim.sub = '${usuario || ''}';`)
      try {
        return (await base.query(sql, parametros)).rows
      } finally {
        await base.exec('reset role; reset request.jwt.claim.sub;')
      }
    })
  }

  // Llama a una funcion de la base igual que lo haria Supabase:
  // rpc('vender', { p_celulares: [...], p_accesorios: [] }).
  // Sin "usuario" llama como visitante.
  async function rpc(nombre, argumentos = {}, { usuario = null } = {}) {
    if (!/^[a-z_]+$/.test(nombre)) throw new Error('Nombre de función inválido')
    const nombres = Object.keys(argumentos)
    for (const argumento of nombres) {
      if (!/^[a-z_]+$/.test(argumento)) throw new Error('Nombre de argumento inválido')
    }
    const lista = nombres.map((argumento, posicion) => `${argumento} => $${posicion + 1}`).join(', ')
    const filas = await como(
      usuario ? 'authenticated' : 'anon',
      usuario,
      `select public.${nombre}(${lista}) as resultado`,
      nombres.map((argumento) => argumentos[argumento]),
    )
    return filas[0].resultado
  }

  return { base, como, rpc }
}
