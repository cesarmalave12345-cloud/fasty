# Fasty — app de transporte de personas

App de transporte para una ciudad: los pasajeros piden carro o moto, los conductores reciben la solicitud en tiempo real, y el administrador aprueba conductores y fija las tarifas. Diseño minimalista en blanco y negro, con mapa en grises.

Es una **PWA**: se instala desde el navegador en Android y iPhone ("Agregar a pantalla de inicio"), así que no hace falta cuenta de Google Play ni de App Store para lanzar.

## Qué incluye

Una misma cuenta puede ser pasajero y conductor: se cambia de modo desde el perfil.

**Pasajero**
- Registro con nombre, teléfono, correo y contraseña (mínimo 8 caracteres); se entra con celular y contraseña, en "modo pasajero" o "modo conductor"
- **Número verificado por SMS** al crear la cuenta, y "¿Olvidaste tu contraseña?" con código por SMS
- Mapa a pantalla completa con los carros libres cercanos, botón de menú (cajón lateral) y avatar para ir a la cuenta
- "Elige tu viaje" con tarjetas ilustradas de carro y moto, tiempo estimado sobre el mapa y método de pago desplegable
- Pantalla "¡Viaje completado!" con recibo descargable y calificación
- "Tu viaje": recogida por GPS o en el mapa, destino buscando la dirección, escogiéndolo en el mapa, o con un toque en Casa, Trabajo o un destino reciente
- Viaje para mí o **para otra persona** (nombre y teléfono de quien viaja; el conductor la llama a ella)
- Carro y moto con capacidad y precio en $ y Bs; **precio fijo** o **pon tu precio** (oferta desde un mínimo que define el administrador)
- **Viajes agendados** (de 20 minutos a 7 días); unos minutos antes se busca conductor solo
- Pago en efectivo, Pago Móvil (ve los datos del conductor y reporta la referencia) o tarjeta
- Ve al conductor acercarse en el mapa con el tiempo de llegada, su vehículo (dibujado con su color), placa y calificación; puede escribirle o llamarlo; "Cambiar vehículo" o "Cancelar viaje"
- Mis viajes con filtros (todo, mis viajes, para terceros) y detalle de cada viaje
- Cuenta con calificación, viajes totales, lugares guardados, soporte por WhatsApp y "Postúlate como conductor"

**Conductor**
- Registro con datos del vehículo, cédula y datos de Pago Móvil (al crear la cuenta o luego desde el perfil); queda "en revisión" hasta que lo apruebes
- Botón para conectarse; recibe solicitudes cercanas al instante con lo que va a ganar y si el pasajero ofreció su precio
- Navegación con Google Maps o Waze, y pasos: llegué → iniciar → finalizar → confirmar pago
- Ganancias del día, calificación y actividad

**Administrador** (`/admin.html`)
- Resumen del día: viajes, facturación, comisión, conductores en línea, viajes sin conductor
- Aprobar o suspender conductores
- Lista de viajes con estado de pago
- Tarifas (banderazo, por km, por minuto, mínima, factor moto), comisión, oferta mínima de "pon tu precio", tasa del día en Bs, métodos de pago, WhatsApp de soporte, radio de búsqueda y ciudad

## Cómo correrla

Requiere Node.js 22 o más nuevo. En local la base de datos es el archivo `data/fasty.db`; publicada usa Turso (ver "Publicarla").

```bash
npm install
npm run crear-admin -- 04141234567 123456 "Tu Nombre"
npm start
```

Abre http://localhost:3000 para la app y http://localhost:3000/admin.html para el panel. Lo primero en el panel: pon la **tasa del día** y la **ciudad** (latitud y longitud del centro).

Para probar en local con cuentas ya hechas (pasajero, conductor aprobado y admin): `npm run semilla`. Los teléfonos y PIN están en `scripts/semilla-prueba.js`. No la ejecutes en producción.

## App Android (APK)

La carpeta `android/` empaqueta Fasty como app Android con Capacitor. La APK abre el servidor indicado en `server.url` de `capacitor.config.json`, así que **esa dirección debe estar encendida** para que la app funcione. Hoy apunta al enlace temporal de Cloudflare. Cuando publiques el servidor con una dirección fija, cámbiala ahí y vuelve a generar la APK.

Requisitos (ya instalados en esta PC): JDK 21 (`JAVA_HOME`) y el SDK de Android en `%LOCALAPPDATA%\Android\Sdk`.

```bash
npm run apk        # genera Fasty.apk en la raíz del proyecto
npm run emulador   # abre el teléfono virtual "Fasty" (Pixel 6, Android 15)
```

Para instalarla en el emulador o en un teléfono conectado por USB con depuración activada:

```bash
%LOCALAPPDATA%\Android\Sdk\platform-tools\adb install -r Fasty.apk
```

Para probar el GPS en el emulador: `adb emu geo fix <longitud> <latitud>`.

Es una APK de depuración, sirve para probar. Para la Play Store hay que generar una versión firmada (`gradlew bundleRelease` con tu llave) y una cuenta de desarrollador de Google.

## Publicarla

Está preparada para publicarse gratis en **Render** (el servidor) con la base de datos en **Turso** (SQLite en la nube). El archivo `render.yaml` le dice a Render cómo construirla y arrancarla.

1. **Turso**: crea una base de datos (región `aws-us-east-1`, cerca de Render Virginia), copia su URL (`libsql://…`) y crea un token.
2. **GitHub**: sube este proyecto a un repositorio.
3. **Render**: *New → Blueprint*, elige el repositorio y llena las variables que pide: `TURSO_URL`, `TURSO_TOKEN`, `ADMIN_TELEFONO` y `ADMIN_PIN`.
4. Render te da una dirección `https://fasty-….onrender.com`. Ponla en `server.url` de `capacitor.config.json` y genera la APK de nuevo.

Cada vez que subas cambios a GitHub, Render vuelve a publicar solo.

Límites del plan gratis de Render: el servidor se duerme tras 15 minutos sin visitas y tarda cerca de un minuto en despertar con la siguiente. Mientras duerme no corre el mantenimiento (viajes agendados, búsquedas que vencen). Para uso real conviene el plan pagado más pequeño, que no se duerme.

Mientras `SMS_PROVEEDOR=consola`, los códigos de verificación aparecen en la pestaña **Logs** del servicio en Render. Con `CUENTAS_PRUEBA=1` se crean las cuentas de `scripts/semilla-prueba.js`; quita esa variable antes de lanzar con usuarios reales.

Variables de entorno:

| Variable | Para qué |
|---|---|
| `PORT` | Puerto (3000 por defecto) |
| `DB_PATH` | Ruta del archivo de base de datos local (`data/fasty.db` por defecto) |
| `TURSO_URL`, `TURSO_TOKEN` | Base de datos en Turso; si están, se usa en vez del archivo local |
| `ADMIN_TELEFONO`, `ADMIN_PIN`, `ADMIN_NOMBRE` | Crea o actualiza ese administrador al arrancar |
| `CUENTAS_PRUEBA` | `1` crea las cuentas de prueba al arrancar |
| `APP_NOMBRE` | Nombre que se muestra (cámbialo también en `public/manifest.webmanifest`) |
| `DESFASE_HORARIO` | Desfase para los totales "de hoy" (`-4 hours`, hora de Venezuela) |
| `SMS_PROVEEDOR` | `consola` (por defecto: el código sale en la consola del servidor, solo para desarrollo) o `twilio` |
| `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_DESDE` | Credenciales de Twilio y el número que envía (`+1555…`), o `whatsapp:+1555…` para enviar por WhatsApp |
| `TRUST_PROXY` | Ponlo en `1` si la app está detrás de Caddy, Railway, etc., para que los límites por IP vean la IP real |
| `PASARELA_MODO` | `prueba` aprueba cobros con tarjeta sin mover dinero. Solo para pruebas |
| `OSRM_URL`, `NOMINATIM_URL` | Servidores de rutas y direcciones (por defecto los públicos de OpenStreetMap) |

## Verificación por SMS

Al crear una cuenta o recuperar la contraseña, la app envía un código de 6 dígitos. El código vence en 10 minutos y se bloquea tras 5 intentos fallidos. Hay que esperar 60 segundos para pedir otro, y se envían como máximo 5 por número y 20 por IP cada hora, para que nadie te gaste el saldo de SMS. Al recuperar la contraseña, la app responde igual exista o no la cuenta, y cierra las sesiones abiertas en otros teléfonos.

Para enviar SMS de verdad:
1. Crea una cuenta en Twilio, compra un número con SMS y activa Venezuela en *Messaging → Geo permissions*.
2. Arranca con `SMS_PROVEEDOR=twilio`, `TWILIO_SID`, `TWILIO_TOKEN` y `TWILIO_DESDE`.
3. Prueba primero con números de Movistar, Digitel y Movilnet: la entrega a Venezuela varía según la operadora.

Si los SMS llegan mal, WhatsApp suele llegar mejor en Venezuela: usa `TWILIO_DESDE=whatsapp:+…`. Para eso Meta exige un remitente de WhatsApp Business aprobado y una plantilla de autenticación aprobada. Hoy `server/sms.js` envía texto libre, así que con WhatsApp habría que ajustarlo para que use esa plantilla (`ContentSid` en Twilio).

## Cómo está hecha

- `server/index.js` — API, reglas de los viajes y WebSocket para tiempo real
- `server/db.js` — conexión (archivo local o Turso), tablas y ajustes iniciales
- `server/geo.js` — rutas (OSRM), búsqueda de direcciones (Nominatim) y cálculo de tarifa
- `server/pagos.js` — punto de conexión de la pasarela de tarjetas
- `server/sms.js` — envío de códigos (consola o Twilio); los límites y la validación están en `server/auth.js`
- `public/` — la app (`index.html`, `app.js`) y el panel (`admin.html`, `admin.js`)

## Pendiente antes de lanzar en serio

1. **Pasarela de tarjetas.** El cobro con tarjeta está desactivado por defecto: `server/pagos.js` es solo el punto de conexión. Hay que integrar un proveedor (botón de pago de un banco venezolano o un procesador internacional). Si el cobro falla, el viaje pasa a efectivo.
2. **Conectar el proveedor de SMS** (ver "Verificación por SMS"): sin eso, en producción nadie recibe el código.
3. **Documentos del conductor**: fotos de licencia, carnet de circulación, seguro y del vehículo para aprobarlo con respaldo.
4. **Notificaciones push**: hoy el conductor necesita la app abierta para recibir solicitudes.
5. **Mapas a escala**: los servidores públicos de OpenStreetMap sirven para arrancar; con mucho tráfico conviene un proveedor pagado o servidores propios.
6. **Más categorías y pagos**: Ejecutivo, XL o mascotas necesitan que el conductor registre la categoría de su vehículo; Débito inmediato, Binance o Cashea necesitan integrarse con cada proveedor. Entrar con Google o Apple necesita registrar la app en esas plataformas.
7. **Lo legal**: permisos de la alcaldía y del INTT, seguro para pasajeros, y términos y condiciones con política de privacidad.
