// ---------- Conexión con Supabase (solo clave pública) ----------
const SUPABASE_URL = 'https://huqyycvdakrlfvqugvvp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_V8aa6DTypFBmJB6mrajhOw_j732ro87';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- Ayudas ----------
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => '$' + num(n);
const bs = (n) => 'Bs ' + num(n);
const cuando = (f) => new Date(f).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });
const dia = (f) => new Date(f + 'T00:00:00').toLocaleDateString('es-VE', { dateStyle: 'medium' });
const hoy = () => new Date().toISOString().slice(0, 10);
const vacio = (t) => `<p class="vacio">${t}</p>`;
const falla = (e) => `<p class="error">No se pudo cargar: ${esc(e.message)}</p>`;
const cifra = (titulo, valor, nota = '', clase = '') =>
  `<div class="cifra ${clase}"><span>${titulo}</span><strong>${valor}</strong>${nota ? `<small>${nota}</small>` : ''}</div>`;

let usuarioId = null;
let vistaActual = 'resumen';

function mostrar(cual) {
  $('login').hidden = cual !== 'login';
  $('panel').hidden = cual !== 'panel';
}

// ---------- Entrada y salida ----------
async function iniciar(registrar) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return mostrar('login');
  const { data: esAdmin } = await sb.rpc('es_admin');
  if (!esAdmin) {
    await sb.auth.signOut();
    $('loginError').textContent = 'Esta cuenta no es de administrador.';
    return mostrar('login');
  }
  usuarioId = session.user.id;
  $('usuario').textContent = session.user.email;
  if (registrar) {
    await sb.from('actividad').insert({ usuario_id: usuarioId, accion: 'inicio_sesion', detalle: 'Panel de administración' });
  }
  mostrar('panel');
  cargar(vistaActual);
}

$('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: $('email').value.trim(), password: $('clave').value });
  if (error) { $('loginError').textContent = 'Correo o contraseña incorrectos.'; return; }
  iniciar(true);
});

$('salir').addEventListener('click', async () => {
  await sb.auth.signOut();
  $('clave').value = '';
  mostrar('login');
});

$('menu').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-vista]');
  if (b) cargar(b.dataset.vista);
});

// ---------- Vistas ----------
async function vResumen() {
  const [c, q, p, cl, t] = await Promise.all([
    sb.from('compras').select('total_usd').neq('estado', 'cancelada'),
async function vPagos() {
  const { data, error } = await sb.from('pagos_reportados')
    .select('id, cuota_id, monto_usd, monto_bs, tasa_bs, metodo, referencia, reportado_en, cuotas(numero, compras(clientes(nombre), productos(nombre)))')
    .eq('estado', 'reportado').order('reportado_en');
  if (error) return falla(error);
  if (!data.length) return vacio('No hay pagos por verificar. Cuando un cliente reporte un pago, aparecerá aquí.');
  return data.map((p) => {
    const co = p.cuotas?.compras;
    return `<article class="tarjeta">
      <div class="fila-top"><strong>${esc(co?.clientes?.nombre ?? 'Cliente')}</strong><span class="monto">${bs(p.monto_bs)}</span></div>
      <p class="detalle">${esc(co?.productos?.nombre ?? '')}, cuota ${p.cuotas?.numero ?? ''} (${usd(p.monto_usd)} a tasa ${Number(p.tasa_bs).toFixed(4)})</p>
      <p class="detalle">${esc(p.metodo ?? 'Método sin indicar')}, referencia ${esc(p.referencia ?? 'sin indicar')}</p>
      <p class="nota">Reportado el ${cuando(p.reportado_en)}</p>
      <div class="acciones">
        <button class="boton" data-pago="${p.id}" data-cuota="${p.cuota_id}" data-ok="1">Verificar pago</button>
        <button class="boton claro" data-pago="${p.id}" data-cuota="${p.cuota_id}" data-ok="0">Rechazar</button>
      </div></article>`;
  }).join('');
}

async function vCuotas() {
  const { data, error } = await sb.from('cuotas')
    .select('numero, monto_usd, estado, fecha_vencimiento, compras(numero_cuotas, clientes(nombre), productos(nombre))')
    .neq('estado', 'pagada').order('fecha_vencimiento').limit(60);
  if (error) return falla(error);
  if (!data.length) return vacio('No hay cuotas pendientes.');
  return data.map((c) => {
    const atrasada = c.fecha_vencimiento < hoy();
    const etiqueta = atrasada ? ['mal', 'Atrasada'] : c.estado === 'reportada' ? ['info', 'Pago reportado'] : ['alerta', 'Pendiente'];
    return `<article class="tarjeta">
      <div class="fila-top"><strong>${esc(c.compras?.clientes?.nombre ?? 'Cliente')}</strong><span class="monto">${usd(c.monto_usd)}</span></div>
      <p class="detalle">${esc(c.compras?.productos?.nombre ?? '')}, cuota ${c.numero} de ${c.compras?.numero_cuotas ?? ''}</p>
      <p class="nota">Vence el ${dia(c.fecha_vencimiento)} <span class="insignia ${etiqueta[0]}">${etiqueta[1]}</span></p></article>`;
  }).join('');
}

async function vProductos() {
  const { data, error } = await sb.from('productos')
    .select('nombre, categoria, costo_usd, precio_usd, stock, activo').order('nombre');
  if (error) return falla(error);
  if (!data.length) return vacio('Todavía no hay productos.');
  return data.map((p) => `<article class="tarjeta">
      <div class="fila-top"><strong>${esc(p.nombre)}</strong><span class="monto">${usd(p.precio_usd)}</span></div>
      <p class="detalle">${esc(p.categoria ?? 'Sin categoría')}, costo ${usd(p.costo_usd)}, ganancia ${usd(p.precio_usd - p.costo_usd)}</p>
      <p class="nota">Stock: ${p.stock} <span class="insignia ${p.stock <= 5 ? 'alerta' : 'ok'}">${p.stock <= 5 ? 'Stock bajo' : 'Disponible'}</span>
      ${p.activo ? '' : '<span class="insignia mal">Oculto</span>'}</p></article>`).join('');
}

async function vActividad() {
  const [a, cl] = await Promise.all([
    sb.from('actividad').select('usuario_id, accion, detalle, creado_en').order('creado_en', { ascending: false }).limit(50),
    sb.from('clientes').select('id, nombre'),
  ]);
  if (a.error) return falla(a.error);
  if (!a.data.length) return vacio('Todavía no hay actividad registrada.');
  const nombres = Object.fromEntries((cl.data || []).map((x) => [x.id, x.nombre]));
  const textos = { inicio_sesion: 'Inició sesión', reporto_pago: 'Reportó un pago', pago_verificado: 'Pago verificado', pago_rechazado: 'Pago rechazado' };
  return a.data.map((x) => `<article class="tarjeta">
      <div class="fila-top"><strong>${esc(nombres[x.usuario_id] ?? 'Administrador')}</strong><span class="nota">${cuando(x.creado_en)}</span></div>
      <p class="detalle">${esc(textos[x.accion] ?? x.accion)}</p></article>`).join('');
}

const vistas = { resumen: vResumen, pagos: vPagos, cuotas: vCuotas, productos: vProductos, actividad: vActividad };

async function cargar(v) {
  vistaActual = v;
  document.querySelectorAll('#menu button').forEach((b) => b.classList.toggle('activo', b.dataset.vista === v));
  $('vista').innerHTML = vacio('Cargando…');
  try { $('vista').innerHTML = await vistas[v](); } catch (e) { $('vista').innerHTML = falla(e); }
}

// ---------- Verificar o rechazar un pago ----------
$('vista').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-pago]');
  if (!b) return;
  const ok = b.dataset.ok === '1';
  b.disabled = true;
  const a = await sb.from('pagos_reportados')
    .update({ estado: ok ? 'verificado' : 'rechazado', verificado_en: new Date().toISOString() })
    .eq('id', b.dataset.pago);
  if (a.error) { b.disabled = false; return alert('No se pudo guardar: ' + a.error.message); }
  const c = await sb.from('cuotas').update({ estado: ok ? 'pagada' : 'pendiente' }).eq('id', b.dataset.cuota);
  if (c.error) return alert('El pago se guardó, pero la cuota no se actualizó: ' + c.error.message);
  await sb.from('actividad').insert({ usuario_id: usuarioId, accion: ok ? 'pago_verificado' : 'pago_rechazado', detalle: b.dataset.pago });
  cargar('pagos');
});

iniciar(false);
