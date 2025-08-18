// js/ot-graph.js (para tus IDs o-*)
import { gs_getCollection, gs_putCollection } from "./js/graph-store.js";

let ETAG = "";
let LIST = []; // arreglo de OTs

// Helpers para seleccionar elementos por id
const $ = (id) => document.getElementById(id);

// Referencias rápidas
const elCount   = () => $("ot-count");
const elTable   = () => $("o-tabla");
const elBuscar  = () => $("o-buscar");
const elLayout  = () => $("layout");
const elCardForm= () => $("card-form");

// Campos del formulario
const fNum     = () => $("o-num");
const fCliente = () => $("o-cliente");
const fDepto   = () => $("o-depto");
const fEnc     = () => $("o-enc");
const fEmision = () => $("o-emision");
const fEntrega = () => $("o-entrega");
const fOC      = () => $("o-oc");
const fEst     = () => $("o-est");
const fPrio    = () => $("o-prio");
const fDesc    = () => $("o-desc");

const itemsBox = () => $("items-container");
const btnAddItem = () => $("btn-add-item");
const btnShowForm = () => $("btn-show-form");
const btnGuardar  = () => $("o-guardar");
const btnNuevo    = () => $("o-nuevo");
const btnCerrar   = () => $("o-cerrar");
const btnImprimir = () => $("o-imprimir");

// Estado de edición
let editingIndex = -1;

// ====== Utilidades ======
function fmtDate(s) {
  try { if (!s) return ""; const d = new Date(s); return isNaN(d)? "": d.toISOString().slice(0,10); }
  catch { return ""; }
}

function renderCount() {
  if (elCount()) elCount().textContent = LIST.length;
}

function renderList() {
  if (!elTable()) return;
  const query = (elBuscar()?.value || "").toLowerCase().trim();
  elTable().innerHTML = "";

  LIST.forEach((x, i) => {
    const rowStr = [
      (x.num??"").toString(),
      (x.cliente??""),
      (x.depto??""),
      fmtDate(x.emision),
      fmtDate(x.entrega),
      (x.est??""),
      (x.prio??""),
      (x.oc??"")
    ].join(" ");

    if (query && !rowStr.toLowerCase().includes(query)) return;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="clip">${x.num ?? ""}</td>
      <td>${x.cliente ?? ""}</td>
      <td>${x.depto ?? ""}</td>
      <td>${fmtDate(x.emision)}</td>
      <td>${fmtDate(x.entrega)}</td>
      <td>${x.est ?? ""}</td>
      <td>${x.prio ?? ""}</td>
      <td>${x.oc ?? ""}</td>
      <td class="right">
        <button class="btn small" data-i="${i}" data-act="edit">Editar</button>
        <button class="btn small danger" data-i="${i}" data-act="del">Borrar</button>
      </td>
    `;
    elTable().appendChild(tr);
  });
}

function clearItemsUI() {
  if (itemsBox()) itemsBox().innerHTML = "";
}

function addItemRow(item = {cantidad:"", descripcion:"", plano:"", adjunto:""}) {
  if (!itemsBox()) return;
  const wrap = document.createElement("div");
  wrap.className = "items-row";
  wrap.innerHTML = `
    <input type="number" min="0" step="1" placeholder="0" value="${item.cantidad ?? ""}">
    <input placeholder="Descripción" value="${item.descripcion ?? ""}">
    <input placeholder="Plano" value="${item.plano ?? ""}">
    <input placeholder="Adjunto (base64)" value="${item.adjunto ?? ""}">
    <button class="btn small danger" type="button">Quitar</button>
  `;
  wrap.querySelector("button").addEventListener("click", () => wrap.remove());
  itemsBox().appendChild(wrap);
}

function readItemsFromUI(){
  if (!itemsBox()) return [];
  const rows = Array.from(itemsBox().querySelectorAll(".items-row"));
  return rows.map(r=>{
    const [q, d, p, a] = r.querySelectorAll("input");
    return {
      cantidad: q.value,
      descripcion: d.value,
      plano: p.value,
      adjunto: a.value
    };
  });
}

function fillForm(data = null){
  editingIndex = data ? LIST.indexOf(data) : -1;

  (fNum()     || {}).value = data?.num ?? "";
  (fCliente() || {}).value = data?.cliente ?? "";
  (fDepto()   || {}).value = data?.depto ?? "";
  (fEnc()     || {}).value = data?.enc ?? "";
  (fEmision() || {}).value = fmtDate(data?.emision);
  (fEntrega() || {}).value = fmtDate(data?.entrega);
  (fOC()      || {}).value = data?.oc ?? "";
  (fEst()     || {}).value = data?.est ?? "ABIERTA";
  (fPrio()    || {}).value = data?.prio ?? "NORMAL";
  (fDesc()    || {}).value = data?.desc ?? "";

  clearItemsUI();
  (data?.items || []).forEach(addItemRow);
}

function readForm(){
  return {
    num: (fNum()||{}).value || undefined,
    cliente: (fCliente()||{}).value || "",
    depto: (fDepto()||{}).value || "",
    enc: (fEnc()||{}).value || "",
    emision: (fEmision()||{}).value || "",
    entrega: (fEntrega()||{}).value || "",
    oc: (fOC()||{}).value || "",
    est: (fEst()||{}).value || "ABIERTA",
    prio: (fPrio()||{}).value || "NORMAL",
    desc: (fDesc()||{}).value || "",
    items: readItemsFromUI()
  };
}

// ====== IO con OneDrive (Graph) ======
async function load() {
  const { etag, items } = await gs_getCollection("ot");
  ETAG = etag;
  LIST = Array.isArray(items) ? items : [];
  renderCount();
  renderList();
}

async function save() {
  ETAG = await gs_putCollection("ot", LIST, ETAG);
  renderCount();
  renderList();
}

// ====== Eventos ======
function mountEvents(){
  // Mostrar/Ocultar formulario (layout en split)
  btnShowForm()?.addEventListener("click", () => {
    elLayout()?.classList.add("split");
    elCardForm()?.scrollIntoView({behavior:"smooth"});
    fillForm(null);
  });

  btnCerrar()?.addEventListener("click", () => {
    elLayout()?.classList.remove("split");
  });

  btnNuevo()?.addEventListener("click", () => fillForm(null));

  btnAddItem()?.addEventListener("click", () => addItemRow());

  btnGuardar()?.addEventListener("click", async () => {
    const rec = readForm();
    if (editingIndex >= 0) LIST[editingIndex] = rec;
    else LIST.push(rec);
    try { await save(); alert("Guardado"); }
    catch(e){ alert("Error al guardar: " + e.message); }
  });

  elBuscar()?.addEventListener("input", () => renderList());

  // Acciones en la tabla
  elTable()?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    const i = Number(btn.getAttribute("data-i"));
    if (act === "edit") {
      fillForm(LIST[i]);
      elLayout()?.classList.add("split");
      elCardForm()?.scrollIntoView({behavior:"smooth"});
    }
    if (act === "del") {
      if (confirm("¿Eliminar la OT seleccionada?")) {
        LIST.splice(i,1);
        save().catch(err => alert("Error al guardar: " + err.message));
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const hasGetter = (window.MSALApp && typeof MSALApp?.getToken === "function") || (typeof window.getToken === "function");
  if (!hasGetter) { setTimeout(()=> location.href="login.html", 200); return; }

  mountEvents();
  load().catch(err => {
    console.error(err);
    alert("Error cargando OT: " + err.message);
  });
});
