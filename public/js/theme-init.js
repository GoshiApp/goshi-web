// Runs before first paint: marks JS as available and applies the saved or system theme.
(function () {
  var d = document.documentElement;
  d.classList.add("js");
  try {
    var t = localStorage.getItem("goshi-theme");
    if (t !== "light" && t !== "dark") t = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    d.setAttribute("data-theme", t);
  } catch (e) {}
})();
