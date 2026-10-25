(function () {
  const script = document.currentScript;
  if (!script) throw new Error("Modern entry requires its script URL.");
  const webRoot = new URL("../", script.src);
  const target = new URL("trips/index.html", webRoot);
  target.search = window.location.search;
  target.hash = window.location.hash || "#dashboard";
  window.location.replace(target.href);
})();
