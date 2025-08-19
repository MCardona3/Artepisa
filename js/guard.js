/*! guard.js — bloquea acceso si no hay sesión (artepisa_account)
 *  Añade esta línea en TODAS las páginas privadas, justo después de <body>:
 *    <script src="./js/guard.js"></script>
 */
(function () {
  try {
    // No activar el guard en páginas de login
    var path = (location.pathname || "").toLowerCase();
    var isLogin = /(?:^|\/)(index|login)\.html$/.test(path);
    if (isLogin) return;

    // ¿Hay sesión?
    var raw = sessionStorage.getItem("artepisa_account");
    if (!raw) {
      var next = encodeURIComponent(location.pathname + location.search + location.hash);
      // Redirige SI NO estás ya en index.html, evita loops
      location.replace("index.html?next=" + next);
      return;
    }

    // Sesión malformada → fuerza login
    try { JSON.parse(raw); } catch (e) {
      sessionStorage.removeItem("artepisa_account");
      var next2 = encodeURIComponent(location.pathname + location.search + location.hash);
      location.replace("index.html?next=" + next2);
      return;
    }
  } catch (e) {
    // En caso extremo, vuelve a login
    try {
      location.replace("index.html");
    } catch (_) {}
  }
})();