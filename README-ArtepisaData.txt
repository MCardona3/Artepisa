ArtepisaData – Instrucciones rápidas
====================================

1) En OneDrive, crea una carpeta llamada: ArtepisaData
   Comparte con tu equipo con permiso "Puede editar".

2) Dentro crea 3 archivos JSON (pueden estar vacíos):
   - clientes.json         -> []
   - ordenes_trabajo.json  -> []
   - ordenes_compra.json   -> []

3) Publica la SPA (por ejemplo en GitHub Pages).

4) Inicia sesión desde login.html y abre dashboard.html.

IDs para KPIs y resúmenes (añádelos en dashboard.html)
------------------------------------------------------
- <span id="count-clients"></span>
- <span id="count-ot"></span>
- <span id="count-oc"></span>

- <span id="kpi-oc-total"></span>      (Total de Órdenes de Compra en MXN)
- <ul id="res-oc-ultimos"></ul>        (Últimas 5 OC: folio, fecha, monto)
- <ul id="res-ot-estado"></ul>         (OT por estado)
- <ul id="res-ot-ultimos"></ul>        (Últimas 5 OT)
- <ul id="res-clientes-tipo"></ul>     (Clientes por tipo)

Campos detectados automáticamente
---------------------------------
- Monto OC: 'monto', 'total' o 'importe'.
- Fechas: 'fecha'; Folio: 'folio'; Estado: 'estado'.
