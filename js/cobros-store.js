// js/cobros-store.js
"use strict";
import { gs_getCollection, gs_putCollection } from "./graph-store.js";

const S = v => (v==null ? "" : String(v));
const N = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export function unifyCobro(rec = {}) {
  return {
    id:           S(rec.id) || `C-${Date.now()}`,
    ot:           S(rec.ot).trim(),
    cliente:      S(rec.cliente).trim(),
    concepto:     S(rec.concepto).trim(),
    monto:        N(rec.monto),
    moneda:       S(rec.moneda || "MXN"),
    factura:      S(rec.factura).trim(),
    tipo:         S(rec.tipo || "PARCIAL").toUpperCase(),     // PARCIAL | COMPLETA
    porcentaje:   rec.porcentaje != null ? N(rec.porcentaje) : null,
    estado:       S(rec.estado || "PENDIENTE").toUpperCase(), // PENDIENTE | FACTURADO | COBRADO | CANCELADO
    fechaEmision: S(rec.fechaEmision || rec.emision || ""),
    fechaCobro:   S(rec.fechaCobro   || rec.cobro   || ""),
    periodo:      (rec.periodo && typeof rec.periodo === "object")
                  ? { ini: S(rec.periodo.ini||""), fin: S(rec.periodo.fin||"") }
                  : { ini: S(rec.perIni||""), fin: S(rec.perFin||"") },
    metodo:       S(rec.metodo),
    referencia:   S(rec.referencia),
    notas:        S(rec.notas)
  };
}

/* === CRUD básico sobre cobros.json === */
export async function listCobros(ot = null) {
  const { items } = await gs_getCollection("cobros");
  const arr = Array.isArray(items) ? items.map(unifyCobro) : [];
  return ot ? arr.filter(c => S(c.ot) === S(ot)) : arr;
}

export async function upsertCobro(cobro) {
  const rec = unifyCobro(cobro);
  const { etag, items } = await gs_getCollection("cobros");
  const list = Array.isArray(items) ? items.map(unifyCobro) : [];
  const i = list.findIndex(x => x.id === rec.id);
  if (i >= 0) list[i] = rec; else list.push(rec);
  await gs_putCollection("cobros", list, etag);
  return rec;
}

export async function deleteCobro(id) {
  const { etag, items } = await gs_getCollection("cobros");
  const list = (Array.isArray(items) ? items : []).filter(x => x.id !== id);
  await gs_putCollection("cobros", list, etag);
}

/* === Resumen x OT: totales de cobrado/pendiente === */
export async function resumenCobrosPorOT() {
  const map = new Map(); // ot -> { total, cobrados, pendientes, registros[] }
  const { items } = await gs_getCollection("cobros");
  const arr = Array.isArray(items) ? items.map(unifyCobro) : [];
  for (const c of arr) {
    const k = S(c.ot);
    if (!k) continue;
    if (!map.has(k)) map.set(k, { total:0, cobrados:0, pendientes:0, registros:[] });
    const b = map.get(k);
    b.total += N(c.monto);
    if (c.estado === "COBRADO") b.cobrados += N(c.monto);
    else if (c.estado !== "CANCELADO") b.pendientes += N(c.monto);
    b.registros.push(c);
  }
  return map;
}

export function calcularSaldo(presupuesto, cobrado) {
  return N(presupuesto) - N(cobrado);
}
