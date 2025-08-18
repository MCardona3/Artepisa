// js/ot-graph.js
import { gs_getCollection, gs_putCollection } from "./graph-store.js";

let ETAG = "";
let LIST = [];

const $count = () => document.getElementById("ot-count");
const $tbody = () => document.getElementById("ot-tbody");
const $form  = () => document.getElementById("ot-form");
const $folio = () => document.getElementById("ot-folio");
const $fecha = () => document.getElementById("ot-fecha");
const $estado= () => document.getElementById("ot-estado");

function render() {
  if ($count()) $count().textContent = LIST.length;
  if ($tbody()) {
    $tbody().innerHTML = "";
    LIST.forEach((x, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${x.folio ?? ""}</td>
        <td>${x.fecha ?? ""}</td>
        <td>${(x.estado ?? "").toString().toUpperCase()}</td>
        <td class="right">
          <button data-i="${i}" class="btn small edit">Editar</button>
          <button data-i="${i}" class="btn small danger del">Borrar</button>
        </td>
      `;
      $tbody().appendChild(tr);
    });
  }
}

async function load() {
  const { etag, items } = await gs_getCollection("ot");
  ETAG = etag;
  LIST = Array.isArray(items) ? items : [];
  render();
}

async function save() {
  ETAG = await gs_putCollection("ot", LIST, ETAG);
}

function onTableClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  const i = Number(btn.getAttribute("data-i"));
  if (btn.classList.contains("edit")) {
    const x = LIST[i];
    if ($folio()) $folio().value = x.folio ?? "";
    if ($fecha()) $fecha().value = x.fecha ?? "";
    if ($estado()) $estado().value = x.estado ?? "";
    $form()?.setAttribute("data-index", i);
    $folio()?.focus();
  }
  if (btn.classList.contains("del")) {
    LIST.splice(i, 1);
    save().then(render).catch(err => alert("Error al guardar: " + err.message));
  }
}

function onSubmit(e) {
  e.preventDefault();
  const rec = {
    folio: $folio()?.value?.trim(),
    fecha: $fecha()?.value,
    estado: $estado()?.value
  };
  const idx = Number($form()?.getAttribute("data-index") ?? "-1");
  if (!isNaN(idx) && idx >= 0) {
    LIST[idx] = rec;
    $form()?.removeAttribute("data-index");
  } else {
    LIST.push(rec);
  }
  if ($folio()) $folio().value = "";
  if ($fecha()) $fecha().value = "";
  if ($estado()) $estado().value = "";
  save().then(render).catch(err => alert("Error al guardar: " + err.message));
}

document.addEventListener("DOMContentLoaded", () => {
  const hasGetter = (window.MSALApp && typeof MSALApp?.getToken === "function") || (typeof window.getToken === "function");
  if (!hasGetter) {
    setTimeout(()=> location.href = "login.html", 300);
    return;
  }
  $tbody()?.addEventListener("click", onTableClick);
  $form()?.addEventListener("submit", onSubmit);
  load().catch(err => {
    console.error(err);
    alert("Error cargando OT: " + err.message);
  });
});
