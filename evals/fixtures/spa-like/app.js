// app.js — inyecta el contenido en #root (fixture spa-like, sin dependencias)
(function () {
  var root = document.getElementById('root');
  if (!root) return;
  var h1 = document.createElement('h1');
  h1.textContent = 'Taller Demo (SPA)';
  root.appendChild(h1);
  var texts = [
    'Llevamos más de veinte años reparando vehículos en Miami con honestidad y precios claros.',
    'Nuestro equipo certificado trabaja con herramientas de diagnóstico de última generación.',
    'Atendemos tanto a particulares como a flotas comerciales de toda la ciudad.'
  ];
  for (var i = 0; i < texts.length; i++) {
    var p = document.createElement('p');
    p.textContent = texts[i];
    root.appendChild(p);
  }
})();
