const $ = s => document.querySelector(s);
const app = $('#app');
let token = localStorage.getItem('token');
let pestana = 'resumen';

const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usd = n => '$' + Number(n ?? 0).toFixed(2);
const fecha = s => new Date(s.replace(' ', 'T') + 'Z').toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
const METODOS = { efectivo: 'Efectivo', pago_movil: 'Pago Móvil', tarjeta: 'Tarjeta' };
const ESTADOS = {
  programado: 'Agendado', buscando: 'Buscando', aceptado: 'Aceptado', llego: 'Conductor llegó', en_curso: 'En curso',
  finalizado: 'Completado', cancelado: 'Cancelado', sin_conductor: 'Sin conductor',
};

async function api(ruta, body) {
  const r = await fetch('/api' + ruta, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: body && JSON.stringify(body),
  });
  const datos = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) {
    salir();
    throw new Error(datos.error || 'Sin permiso');
  }
  if (!r.ok) throw new Error(datos.error || 'Error de conexión');
  return datos;
}

let avisoTimer;
function aviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => (el.hidden = true), 4000);
}

function salir() {
  token = null;
  localStorage.removeItem('token');
  vistaLogin();
}

function vistaLogin() {
  app.innerHTML = `
    <div class="caja centro">
      <h2>Panel de administración</h2>
      <form id="login" class="form">
        <label>Celular<input name="telefono" type="tel" required autocomplete="username"></label>
        <label>Contraseña<input name="clave" type="password" required autocomplete="current-password"></label>
        <button class="btn primario" type="submit">Entrar</button>
      </form>
    </div>`;
  $('#login').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('/login', Object.fromEntries(new FormData(e.target)));
      if (r.usuario.rol !== 'admin') {
        token = r.token;
        await api('/salir', {}).catch(() => {});
        token = null;
        return aviso('Esta cuenta no es de administrador');
      }
      token = r.token;
      localStorage.setItem('token', token);
      mostrar('resumen');
    } catch (err) {
      aviso(err.message);
    }
  };
}

function marco(contenido) {
  const tabs = { resumen: 'Resumen', conductores: 'Conductores', viajes: 'Viajes', ajustes: 'Tarifas y ajustes' };
  app.innerHTML = `
    <div class="cabecera"><h2>Administración</h2><button class="btn peq" id="salir">Salir</button></div>
    <nav class="pestanas">${Object.entries(tabs).map(([k, t]) => `<button class="chip ${k === pestana ? 'sel' : ''}" data-tab="${k}">${t}</button>`).join('')}</nav>
    <section>${contenido}</section>`;
  $('#salir').onclick = async () => {
    await api('/salir', {}).catch(() => {});
    salir();
  };
  app.querySelectorAll('[data-tab]').forEach(b => (b.onclick = () => mostrar(b.dataset.tab)));
}

const VISTAS = {
  async resumen() {
    const r = await api('/admin/resumen');
    const cifra = (t, v) => `<div class="cifra"><small>${t}</small><strong>${v}</strong></div>`;
    marco(`
      <div class="cifras">
        ${cifra('Viajes completados hoy', r.viajes_hoy)}
        ${cifra('Facturado hoy', usd(r.bruto_hoy))}
        ${cifra('Comisión hoy', usd(r.comision_hoy))}
        ${cifra('Viajes activos ahora', r.viajes_activos)}
        ${cifra('Viajes agendados', r.agendados)}
        ${cifra('Conductores en línea', r.conductores_en_linea)}
        ${cifra('Conductores por aprobar', r.conductores_pendientes)}
        ${cifra('Sin conductor hoy', r.sin_conductor_hoy)}
        ${cifra('Cancelados hoy', r.cancelados_hoy)}
        ${cifra('Usuarios registrados', r.pasajeros)}
      </div>`);
  },

  async conductores() {
    const { conductores } = await api('/admin/conductores');
    marco(conductores.length ? `
      <div class="tabla"><table>
        <thead><tr><th>Conductor</th><th>Cédula</th><th>Vehículo</th><th>Pago Móvil</th><th>Viajes</th><th>★</th><th>Estado</th><th></th></tr></thead>
        <tbody>${conductores.map(c => `
          <tr>
            <td><strong>${esc(c.nombre)}</strong><br><small>${esc(c.telefono)}</small></td>
            <td>${esc(c.cedula)}</td>
            <td>${c.tipo === 'moto' ? '🏍️' : '🚗'} ${esc(c.vehiculo)}<br><small>${esc(c.color)} · ${esc(c.placa)}</small></td>
            <td><small>${esc(c.pm_banco || '—')}<br>${esc(c.pm_telefono || '')} ${esc(c.pm_cedula || '')}</small></td>
            <td class="num">${c.viajes}</td>
            <td class="num">${c.calificacion ?? '—'}</td>
            <td>${c.aprobado ? (c.en_linea ? '🟢 En línea' : 'Aprobado') : '⏳ Por aprobar'}</td>
            <td><button class="btn peq ${c.aprobado ? 'peligro' : 'primario'}" data-conductor="${c.id}" data-aprobar="${c.aprobado ? 0 : 1}">${c.aprobado ? 'Suspender' : 'Aprobar'}</button></td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<p class="ayuda">Todavía no hay conductores registrados.</p>');
    app.querySelectorAll('[data-conductor]').forEach(b => (b.onclick = async () => {
      if (b.dataset.aprobar === '0' && !confirm('¿Suspender a este conductor? No podrá recibir viajes.')) return;
      try {
        await api(`/admin/conductores/${b.dataset.conductor}`, { aprobado: b.dataset.aprobar === '1' });
        mostrar('conductores');
      } catch (err) {
        aviso(err.message);
      }
    }));
  },

  async viajes() {
    const { viajes } = await api('/admin/viajes');
    marco(viajes.length ? `
      <div class="tabla"><table>
        <thead><tr><th>#</th><th>Fecha</th><th>Pasajero</th><th>Conductor</th><th>Ruta</th><th>Estado</th><th>Tarifa</th><th>Pago</th></tr></thead>
        <tbody>${viajes.map(v => `
          <tr>
            <td>${v.id}</td>
            <td><small>${fecha(v.creado)}</small></td>
            <td>${esc(v.pasajero)}${v.para_nombre ? `<br><small>para ${esc(v.para_nombre)}</small>` : ''}</td>
            <td>${esc(v.conductor || '—')}</td>
            <td><small>${esc(v.origen_dir)}<br>→ ${esc(v.destino_dir)}</small></td>
            <td>${ESTADOS[v.estado]}${v.programado_para ? `<br><small>📅 ${fecha(v.programado_para)}</small>` : ''}</td>
            <td class="num">${usd(v.tarifa_usd)}${v.cuadralo ? ' 🤝' : ''}<br><small>${v.distancia_km} km</small></td>
            <td><small>${METODOS[v.metodo_pago]}<br>${v.estado === 'finalizado' ? esc(v.pago_estado) : ''} ${esc(v.pago_ref || '')}</small></td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<p class="ayuda">Todavía no hay viajes.</p>');
  },

  async ajustes() {
    const a = await api('/admin/ajustes');
    const campo = (clave, etiqueta, paso = '0.01') => `<label>${etiqueta}<input name="${clave}" type="number" step="${paso}" value="${a[clave]}"></label>`;
    const casilla = (clave, etiqueta) => `<label class="chip"><input type="checkbox" name="${clave}" ${a[clave] ? 'checked' : ''}> ${etiqueta}</label>`;
    marco(`
      <form id="ajustes" class="form caja">
        <h4>Moneda</h4>
        ${campo('tasa_bs', 'Tasa del día (Bs por $1). Usa 0 para mostrar solo dólares.')}
        <h4>Tarifas (en dólares)</h4>
        <div class="grupo">
          ${campo('tarifa_base', 'Banderazo')}
          ${campo('tarifa_minima', 'Tarifa mínima')}
          ${campo('precio_km', 'Precio por km')}
          ${campo('precio_min', 'Precio por minuto')}
          ${campo('factor_moto', 'Factor moto (0.6 = 60% del carro)')}
          ${campo('comision_pct', 'Comisión de la plataforma (%)', '0.5')}
          ${campo('cuadralo_min_pct', '"Pon tu precio": oferta mínima (% de la tarifa)', '1')}
        </div>
        <h4>Métodos de pago</h4>
        <div class="chips">
          ${casilla('efectivo_habilitado', 'Efectivo')}
          ${casilla('pago_movil_habilitado', 'Pago Móvil')}
          ${casilla('tarjeta_habilitada', 'Tarjeta (requiere pasarela)')}
        </div>
        <h4>Operación</h4>
        <div class="grupo">
          ${campo('radio_km', 'Radio de búsqueda de conductores (km)', '0.5')}
          ${campo('espera_min', 'Minutos buscando antes de rendirse', '1')}
        </div>
        <label>WhatsApp de soporte (aparece en el perfil)<input name="soporte_whatsapp" type="tel" value="${esc(a.soporte_whatsapp)}" placeholder="04141234567"></label>
        <h4>Ciudad</h4>
        <label>Nombre<input name="ciudad_nombre" value="${esc(a.ciudad_nombre)}"></label>
        <div class="grupo">
          ${campo('ciudad_lat', 'Latitud del centro', 'any')}
          ${campo('ciudad_lng', 'Longitud del centro', 'any')}
        </div>
        <button class="btn primario" type="submit">Guardar cambios</button>
      </form>`);
    $('#ajustes').onsubmit = async e => {
      e.preventDefault();
      const datos = Object.fromEntries(new FormData(e.target));
      for (const clave of ['efectivo_habilitado', 'pago_movil_habilitado', 'tarjeta_habilitada']) datos[clave] = datos[clave] ? 1 : 0;
      try {
        await api('/admin/ajustes', datos);
        aviso('Ajustes guardados');
      } catch (err) {
        aviso(err.message);
      }
    };
  },
};

async function mostrar(nombre) {
  pestana = nombre;
  try {
    await VISTAS[nombre]();
  } catch (err) {
    if (token) aviso(err.message);
  }
}

if (token) mostrar('resumen');
else vistaLogin();
