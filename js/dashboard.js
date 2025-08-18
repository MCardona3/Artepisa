// js/dashboard.js – KPIs extendidos
import { gs_getCollection } from "./graph-store.js";

const fmtMXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });

function setText(id, val){ const el = document.getElementById(id); if(el) el.textContent = val; }
function clear(el){ while(el?.firstChild) el.removeChild(el.firstChild); }
function byId(id){ return document.getElementById(id); }

function sum(arr, sel = (x)=>x) { return (arr||[]).reduce((a,b)=>a+(Number(sel(b))||0),0); }
function groupBy(arr, keyFn){
  return (arr||[]).reduce((acc, x)=>{ const k = keyFn(x); (acc[k] ||= []).push(x); return acc; }, {});
}
function addListItems(id, items, mapFn){
  const el = byId(id); if(!el) return;
  clear(el);
  items.forEach(x=>{ const li = document.createElement('li'); li.textContent = mapFn(x); el.appendChild(li); });
}
function addPairs(id, obj, mapFn){
  const el = byId(id); if(!el) return;
  clear(el);
  Object.entries(obj).forEach(([k,v])=>{ const li = document.createElement('li'); li.textContent = mapFn(k,v); el.appendChild(li); });
}
function normalizeDate(s){ const d = new Date(s); return isNaN(d) ? new Date(0) : d; }

async function cargarResumen(){
  const [{items: clientes},{items: ot},{items: oc}] = await Promise.all([
    gs_getCollection("clientes"),
    gs_getCollection("ot"),
    gs_getCollection("oc")
  ]);

  // KPIs básicos
  setText("count-clients", clientes.length);
  setText("count-ot", ot.length);
  setText("count-oc", oc.length);

  // Órdenes de Compra
  const totalOC = sum(oc, x => x.monto ?? x.total ?? x.importe ?? 0);
  setText("kpi-oc-total", isFinite(totalOC) ? fmtMXN.format(totalOC) : "—");
  const ocOrd = [...oc].sort((a,b)=> normalizeDate(b.fecha) - normalizeDate(a.fecha)).slice(0,5);
  addListItems("res-oc-ultimos", ocOrd, x => `${x.folio ?? "(sin folio)"} · ${x.fecha ?? ""} · ${fmtMXN.format(Number(x.monto ?? x.total ?? x.importe ?? 0))}`);

  // Órdenes de Trabajo
  const gEstadoOT = groupBy(ot, x => (x.estado ?? "SIN_ESTADO").toString().toUpperCase());
  addPairs("res-ot-estado", gEstadoOT, (k,v)=> `${k}: ${v.length}`);
  const otOrd = [...ot].sort((a,b)=> normalizeDate(b.fecha) - normalizeDate(a.fecha)).slice(0,5);
  addListItems("res-ot-ultimos", otOrd, x => `${x.folio ?? "(sin folio)"} · ${x.fecha ?? ""} · ${(x.estado ?? "").toString().toUpperCase()}`);

  // Clientes
  const gTipo = groupBy(clientes, x => (x.tipo ?? "SIN_TIPO").toString().toUpperCase());
  addPairs("res-clientes-tipo", gTipo, (k,v)=> `${k}: ${v.length}`);
}

document.addEventListener("DOMContentLoaded", () => {
  cargarResumen().catch(err=>{
    console.error(err);
    alert("Error cargando resumen: " + err.message);
  });
});
