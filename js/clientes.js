// js/clientes.js (versión con paginación + modo form-only + móvil + contador + resiliencia)
(function () {
  const $ = (s) => document.querySelector(s);
  let cache = [];
  let editingKey = null;
  const LS_KEY = "clients";
  const mqlMobile = window.matchMedia("(max-width: 820px)");

  // --- Config de paginación ---
  let paginaActual = 1;
  let filasPorPagina = 10;

  // --- Helpers de campos ---
  const fId = () => document.getElementById("c-id");
  const fNombre = () => document.getElementById("c-nombre");
  const fTelefono = () => document.getElementById("c-telefono");
  const fDir = () => document.getElementById("c-direccion");
  const fRFC = () => document.getElementById("c-rfc");
  const fEstado = () => document.getElementById("c-estado");
  const fCtoNom = () => document.getElementById("c-contacto");
  const fCtoTel = () => document.getElementById("c-contacto-tel");

  function setEditable(on = true) {
    [fId(), fNombre(), fTelefono(), fDir(), fRFC(), fEstado(), fCtoNom(), fCtoTel()].forEach((el) => {
      if (!el) return;
      el.readOnly = !on;
      el.disabled = false;
      el.classList.toggle("is-readonly", !on);
      el.style.pointerEvents = on ? "" : "auto";
    });
  }

  function broadcastCount() {
    try {
      const ev = new CustomEvent("clientes:count", { detail: { count: sanitizeCache(cache).length } });
      document.dispatchEvent(ev);
    } catch {}
  }

  function showForm(show) {
    const layout = $("#layout");
    if (!layout) return;
    if (show) {
      layout.classList.add("form-only");
      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
    } else {
      layout.classList.remove("form-only");
      updateMobileListVisibility();
      $("#c-buscar")?.focus();
    }
  }

  function updateMobileListVisibility() {
    const layout = $("#layout");
    if (!layout) return;
    const q = ($("#c-buscar")?.value || "").trim();
    if (mqlMobile.matches) {
      if (!q) layout.classList.add("mobile-hide-list");
      else layout.classList.remove("mobile-hide-list");
    } else {
      layout.classList.remove("mobile-hide-list");
    }
  }

  function debounce(fn, wait = 200) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  const norm = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
  const S = (v) => (v == null ? "" : String(v));
  const onlyDigits = (s) => String(s ?? "").replace(/\D+/g, "");

  // --- Teléfonos ---
  function formatTen(d) {
    d = onlyDigits(d);
    if (d.length !== 10) return d;
    return d.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }
  function formatPhonePair(v) {
    const d = onlyDigits(v);
    if (d.length === 10) return formatTen(d);
    if (d.length === 20) return formatTen(d.slice(0, 10)) + " / " + formatTen(d.slice(10));
    return d;
  }
  function normalizePhones(val) {
    const d = onlyDigits(val);
    if (d.length === 0) return "";
    if (d.length === 10) return d;
    if (d.length === 20) return d.slice(0, 10) + "/" + d.slice(10);
    return null;
  }

  // --- Normalización de datos ---
  function sanitizeCache(arr) {
    return (Array.isArray(arr) ? arr : [])
      .filter((x) => x && typeof x === "object")
      .map((c) => ({
        IDCliente: S(c.IDCliente || c.idCliente || c.id || ""),
        Nombre: S(c.Nombre || c.nombre || ""),
        Telefono: S(c.Telefono || c.telefono || ""),
        Direccion: S(c.Direccion || c.direccion || ""),
        RFC: S(c.RFC || c.rfc || "").toUpperCase(),
        Estado: S(c.Estado || c.estado || ""),
        NombreCont: S(c.NombreCont || c.NombreContacto || c.contacto || ""),
        TelefonoCon: S(c.TelefonoCon || c.TelefonoContacto || c.contactoTel || "")
      }));
  }

  // --- Ordenamiento ---
  function idNumericValue(id) {
    const s = (id ?? "").toString().trim();
    if (!s) return Number.POSITIVE_INFINITY;
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    const m = s.match(/^C(\d+)$/i);
    if (m) return parseInt(m[1], 10);
    const digits = s.replace(/\D+/g, "");
    return digits ? parseInt(digits, 10) : Number.POSITIVE_INFINITY;
  }
  function compareByIdAsc(a, b) {
    const av = idNumericValue(a.IDCliente);
    const bv = idNumericValue(b.IDCliente);
    if (av !== bv) return av - bv;
    return (a.Nombre ?? "").localeCompare(b.Nombre ?? "", "es", { sensitivity: "base" });
  }

  // --- Columnas ---
  const COLUMNS = [
    { key: "IDCliente", label: "ID" },
    { key: "Nombre", label: "Nombre" },
    { key: "Telefono", label: "Teléfono", formatter: (v) => formatPhonePair(v) },
    { key: "Direccion", label: "Dirección" },
    { key: "RFC", label: "RFC" },
    { key: "Estado", label: "Estado" },
    { key: "NombreCont", label: "Nombre de Contacto" },
    { key: "TelefonoCon", label: "Teléfono de Contacto", formatter: (v) => formatPhonePair(v) }
  ];

  // --- Paginación ---
  function renderPaginacion(list) {
    const pagDiv = document.getElementById("paginacion");
    if (!pagDiv) return;
    pagDiv.innerHTML = "";

    const totalPaginas = Math.ceil(list.length / filasPorPagina);
    if (totalPaginas <= 1) return;

    const makeBtn = (txt, disabled, page) => {
      const b = document.createElement("button");
      b.textContent = txt;
      b.disabled = !!disabled;
      if (page !== undefined) b.onclick = () => {
        paginaActual = page;
        render($("#c-buscar").value);
      };
      return b;
    };

    pagDiv.appendChild(makeBtn("⟨", paginaActual === 1, paginaActual - 1));
    for (let i = 1; i <= totalPaginas; i++) {
      const b = makeBtn(i, false, i);
      if (i === paginaActual) b.classList.add("active");
      pagDiv.appendChild(b);
    }
    pagDiv.appendChild(makeBtn("⟩", paginaActual === totalPaginas, paginaActual + 1));
  }

  // --- Render principal ---
  function render(q = "") {
    const tb = $("#c-tabla");
    tb.innerHTML = "";

    const needle = norm(q);
    const list = sanitizeCache(cache)
      .filter((c) => {
        if (!needle) return true;
        return (
          norm(c.Nombre).includes(needle) ||
          norm(c.Direccion).includes(needle) ||
          norm(c.RFC).includes(needle) ||
          norm(c.Estado).includes(needle) ||
          norm(c.NombreCont).includes(needle) ||
          norm(c.IDCliente).includes(needle) ||
          norm(c.Telefono).includes(needle) ||
          norm(c.TelefonoCon).includes(needle)
        );
      })
      .sort(compareByIdAsc);

    // --- Paginación aplicada ---
    const totalPaginas = Math.ceil(list.length / filasPorPagina);
    if (paginaActual > totalPaginas) paginaActual = totalPaginas || 1;
    const inicio = (paginaActual - 1) * filasPorPagina;
    const fin = inicio + filasPorPagina;
    const pageList = list.slice(inicio, fin);

    if (!pageList.length) {
      const tr = document.createElement("tr");
      const tdEmpty = document.createElement("td");
      tdEmpty.colSpan = COLUMNS.length + 1;
      tdEmpty.style.textAlign = "center";
      tdEmpty.style.padding = "18px";
      tdEmpty.style.color = "#5b6577";
      tdEmpty.textContent = "No se encontraron clientes.";
      tr.appendChild(tdEmpty);
      tb.appendChild(tr);
      broadcastCount();
      renderPaginacion(list);
      return;
    }

    pageList.forEach((c) => {
      const tr = document.createElement("tr");
      COLUMNS.forEach((col) => {
        const cell = document.createElement("td");
        cell.setAttribute("data-label", col.label);
        const raw = c[col.key];
        const value = col.formatter ? col.formatter(S(raw)) : S(raw);
        cell.textContent = value;
        cell.title = value;
        tr.appendChild(cell);
      });
      const acc = document.createElement("td");
      acc.className = "table-actions";
      const btn = document.createElement("button");
      btn.className = "btn ghost btn-edit";
      btn.type = "button";
      btn.textContent = "Editar";
      btn.addEventListener("click", () => fillForm(c));
      acc.appendChild(btn);
      tr.appendChild(acc);
      tr.addEventListener("dblclick", () => fillForm(c));
      tb.appendChild(tr);
    });

    renderPaginacion(list);
    broadcastCount();
  }

  // --- Persistencia ---
  async function load() {
    try {
      const data = (window.ArtepisaData?.loadCollection)
        ? await ArtepisaData.loadCollection("clients")
        : null;
      cache = sanitizeCache(data);
      if (!cache.length) {
        const local = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
        cache = sanitizeCache(local);
      } else {
        localStorage.setItem(LS_KEY, JSON.stringify(cache));
      }
      render("");
      showForm(false);
      broadcastCount();
    } catch {
      cache = sanitizeCache(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
      render("");
      showForm(false);
      broadcastCount();
    }
  }

  async function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(sanitizeCache(cache)));
    try {
      if (window.ArtepisaData?.saveCollection) {
        await ArtepisaData.saveCollection("clients", sanitizeCache(cache));
      }
    } catch (e) {
      console.warn("saveCollection falló (guardado local OK):", e);
    }
  }

  // --- Inicio ---
  document.addEventListener("DOMContentLoaded", async () => {
    await load();
    $("#c-buscar").addEventListener("input", debounce((e) => {
      paginaActual = 1;
      render(e.target.value);
    }, 200));
  });
})();
