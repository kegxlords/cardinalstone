/* CardinalStone shared interaction layer. */
(function () {
  "use strict";

  var ready = false;

  function announce(message) {
    var region = document.getElementById("cardinalstone-status");
    if (!region) {
      region = document.createElement("div");
      region.id = "cardinalstone-status";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      region.style.cssText = "position:fixed;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";
      document.body.appendChild(region);
    }
    region.textContent = message || "";
  }

  function hideLoader() {
    var loader = document.getElementById("cardinalstone-loader");
    if (loader) loader.classList.add("is-ready");
    document.body.classList.remove("page-loading");
    ready = true;
  }

  function showLoader() {
    if (document.getElementById("cardinalstone-loader")) return;
    var loader = document.createElement("div");
    loader.id = "cardinalstone-loader";
    loader.innerHTML = '<div class="loader-brand" aria-label="Loading CardinalStone"><span class="loader-orbit" aria-hidden="true"></span><span>CardinalStone</span></div>';
    document.body.appendChild(loader);
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = label || "Working…";
      announce(label || "Working");
    } else {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
      announce("");
    }
  }

  window.SerlzoUI = {
    hideLoader: hideLoader,
    showLoader: showLoader,
    setBusy: setBusy,
    announce: announce,
    isReady: function () { return ready; }
  };

  document.addEventListener("DOMContentLoaded", function () {
    showLoader();
    document.body.classList.add("page-loading");

    document.querySelectorAll("a[href]").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#" || href.indexOf("javascript:") === 0 || link.target === "_blank") return;
      link.addEventListener("click", function () {
        if (link.dataset.noLoader === "true") return;
        var loader = document.getElementById("cardinalstone-loader");
        if (loader) loader.classList.remove("is-ready");
        document.body.classList.add("page-loading");
      });
    });

    document.querySelectorAll("form").forEach(function (form) {
      form.addEventListener("submit", function () {
        var submit = form.querySelector("button[type=submit], button:not([type])");
        if (submit) setBusy(submit, true, "Saving…");
      });
    });

    window.setTimeout(hideLoader, 420);
  });

  window.addEventListener("load", hideLoader);
})();
