// Root page only: send the visitor to /en/ or /es/ by the browser's languages. Falls back to Spanish.
(function () {
  var langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""]);
  var pick = "es";
  for (var i = 0; i < langs.length; i++) {
    var l = String(langs[i]).toLowerCase();
    if (l.indexOf("es") === 0) { pick = "es"; break; }
    if (l.indexOf("en") === 0) { pick = "en"; break; }
  }
  location.replace("/" + pick + "/");
})();
