/* ===== REDPAY canvas injector — guarantees the sky on EVERY page =====
   serlzo.js loads everywhere; inline !important + an injected `html body`
   rule beat each page's own background no matter which CSS it links.
   Covers the un-rebuilt pages (history/messages/contact/...) too. */
(function () {
  "use strict";
  var SKY =
    "radial-gradient(1200px 620px at 50% -12%, rgba(56,189,248,.30), transparent 60%)," +
    "radial-gradient(900px 520px at 100% 0%, rgba(34,211,238,.20), transparent 55%)," +
    "linear-gradient(180deg,#e0f2fe 0%, #eff8ff 46%, #f5fbfe 100%)";

  function paint() {
    if (!document.body) return;

    /* 1) absolute-top priority (also beats any inline style="" attribute) */
    document.body.style.setProperty("background", SKY, "important");
    document.body.style.setProperty("background-attachment", "fixed", "important");

    /* 2) injected sheet: out-specifics every page's inline <style> body rule,
          keeps the desktop framed card white, matches the splash loader */
    if (!document.getElementById("rp-sky-style")) {
      var s = document.createElement("style");
      s.id = "rp-sky-style";
      s.textContent =
        "html body{background:" + SKY + " !important;background-attachment:fixed !important}" +
        "@media (min-width:820px){.page-wrap,.rp-app{background:#ffffff !important}}" +
        "#cardinalstone-loader{background:" + SKY + " !important}" +
        ".loader{border-color:rgba(29,78,216,.18) !important;border-top-color:#1d4ed8 !important;border-right-color:#38bdf8 !important}" +
        ".loader-brand span,.loader-brand{color:#0a2472 !important}";
      document.head.appendChild(s);
    }

    /* 3) best-effort status bar (theme-color is read at load — see note) */
    try {
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute("content", "#0284c7");
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paint);
  } else {
    paint();
  }
})();
