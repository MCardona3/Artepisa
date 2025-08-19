# Artepisa (final)

Este paquete incluye:

- `clientes.html` + `js/clientes.js` — CRUD completo con Import/Export/Limpiar.
- `ordenes.html` + `css/ordenes.css` + `js/ot-graph.js` — Órdenes de Trabajo con botones, impresión profesional (en iframe, sin pop‑up), validación de cliente obligatorio y autocompletar desde `clientes.json` si existe.
- `oc.html` + `js/oc.js` — Órdenes de Compra.
- `js/graph-store.js` — Lectura/guardado en OneDrive/SharePoint (AppRoot/ArtepisaData). Si no hay token de Microsoft, usa **localStorage** como *fallback* con manejo de ETag simulado.
- `js/auth.js` + `js/msal-config.js` — Soporte para MSAL. Rellena el `clientId` si usarás Microsoft Login real.
- `css/style.css` — Tema base (verde) compartido.
- `img/arte.png` — Logo placeholder.

> Rutas relativas: funcionan en GitHub Pages bajo `usuario.github.io/Artepisa/`.

## CSV de OT — encabezados aceptados
Se mapean automáticamente, por ejemplo:
```
# OT / OT / Num / Folio / Numero
Cliente / CLIENTE
Departamento / Depto
Encargado / Responsable / Jefe
Fecha Emisión / FECHA_EMISION / Emision / Fecha
Fecha Entrega / FECHA_ENTREGA / Entrega
Orden Compra / Orden de compra / OC
Estatus / Estado
Prioridad
Descripción / Descripcion
```
Separador `,` o `;`, comillas opcionales.

---

Si tienes un `clientes.json` en la carpeta `ArtepisaData`, el campo **Cliente** de OT tendrá autocompletar.

