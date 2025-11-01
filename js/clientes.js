// js/clientes.js (versión mejorada con paginador visual moderno + UX refinada)
(function () {
  const $ = (s) => document.querySelector(s);
  let cache = [];
  let editingKey = null;
  const LS_KEY = "clients";
  const mqlMobile = window.matchMedia("(max-width: 820px)");

  // --- Configuración de paginación ---
  let paginaActual = 1;
  let filasPorPagina = 10;

  // --- Helpers de campos ---
  const fId = () => $("#c-id");
  const fNombre = () => $("#c-nombre");
  const fTelefono = () => $("#c-telefono");
  const fDir = () => $("#c-direccion");
  const fRFC = () => $("#c-rfc");
  const fEstado = () => $("#c-estado");
  const fCtoNom = () => $("#c-contacto");
  const fCtoTel = () => $("#c-contacto-tel");

  function setEditable(on = true) {
    [fId(), fNombre(), fTelefono(), fDir(), fRFC(), fEstado(), fCtoNom(), fCtoTel()].forEach((el) => {
      if (!el) return;
      el.readOnly = !on;
      el.disabled = false;
      el.classList.toggle("is-readonly", !on);
      el.style.pointerEvents = on ? "" : "auto";
    });
  }

  // --- Contador de registros global ---
  function broadcastCount() {
    try {
      const ev = new CustomEvent("clientes:count", {
        detail: { count: sanitizeCache(cache).length }
      });
      document.dispatchEvent(ev);
    } catch {}
  }

  // --- Vista form-only (modo edición móvil) ---
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

  // --- Normalización ---
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
    if (d.length === 20) return `${formatTen(d.slice(0, 10))} / ${formatTen(d.slice(10))}`;
    return d;
  }

  // --- Sanitización de caché ---
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

  // --- Render de paginación ---
  function renderPaginacion(list) {
    const pagDiv = $("#paginacion");
    if (!pagDiv) return;
    pagDiv.innerHTML = "";

    const totalPaginas = Math.ceil(list.length / filasPorPagina);
    if (totalPaginas <= 1) return;

    const createBtn = (label, page, disabled = false) => {
      const btn = document.createElement("button");
      btn.className = "page-btn";
      btn.textContent = label;
      btn.disabled = disabled;
      if (!disabled && page !== undefined) {
        btn.addEventListener("click", () => {
          paginaActual = page;
          render($("#c-buscar").value);
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }
      return btn;
    };

    // Controles
    pagDiv.className = "pagination";
    const pageControls = document.createElement("div");
    pageControls.className = "page-controls";

    pageControls.appendChild(createBtn("⟨", paginaActual - 1, paginaActual === 1));

    for (let i = 1; i <= totalPaginas; i++) {
      if (totalPaginas > 6 && Math.abs(i - paginaActual) > 2 && i !== 1 && i !== totalPaginas) {
        if (i === 2 || i === totalPaginas - 1) {
          const span = document.createElement("span");
          span.textContent = "...";
          span.style.padding = "0 6px";
          pageControls.appendChild(span);
        }
        continue;
      }
      const b = createBtn(i, i);
      if (i === paginaActual) b.classList.add("active");
      pageControls.appendChild(b);
    }

    pageControls.appendChild(createBtn("⟩", paginaActual + 1, paginaActual === totalPaginas));
    pagDiv.appendChild(pageControls);
  }

  // --- Render principal ---
  function render(q = "") {
    const tb = $("#c-tabla");
    if (!tb) return;
    tb.innerHTML = "";

    const needle = norm(q);
    const list = sanitizeCache(cache)
      .filter((c) =>
        !needle ||
        [c.Nombre, c.Direccion, c.RFC, c.Estado, c.NombreCont, c.IDCliente, c.Telefono, c.TelefonoCon]
          .some((v) => norm(v).includes(needle))
      )
      .sort(compareByIdAsc);

    const totalPaginas = Math.ceil(list.length / filasPorPagina);
    if (paginaActual > totalPaginas) paginaActual = totalPaginas || 1;
    const inicio = (paginaActual - 1) * filasPorPagina;
    const fin = inicio + filasPorPagina;
    const pageList = list.slice(inicio, fin);

    if (!pageList.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = COLUMNS.length + 1;
      td.style.textAlign = "center";
      td.style.padding = "24px";
      td.innerHTML = `
        <div style="opacity:0.75">
          <svg width="32" height="32" fill="none" stroke="#999" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <div style="margin-top:6px;">No se encontraron clientes.</div>
        </div>`;
      tr.appendChild(td);
      tb.appendChild(tr);
      renderPaginacion(list);
      broadcastCount();
      return;
    }

    pageList.forEach((c) => {
      const tr = document.createElement("tr");
      COLUMNS.forEach((col) => {
        const td = document.createElement("td");
        td.setAttribute("data-label", col.label);
        const val = col.formatter ? col.formatter(S(c[col.key])) : S(c[col.key]);
        td.textContent = val;
        td.title = val;
        tr.appendChild(td);
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
        cache = sanitizeCache(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
      } else {
        localStorage.setItem(LS_KEY, JSON.stringify(cache));
      }
    } catch {
      cache = sanitizeCache(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
    }
    render("");
    showForm(false);
    broadcastCount();
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
    $("#c-buscar")?.addEventListener("input", debounce((e) => {
      paginaActual = 1;
      render(e.target.value);
    }, 200));
  });
})();
