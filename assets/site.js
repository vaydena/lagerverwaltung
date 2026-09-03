/* Vaydena Lager — gemeinsames Frontend-JS (ohne Abhängigkeiten) */
(function () {
  // Mobile-Navigation
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
      var mm = document.querySelector('.mobile-menu');
      if (mm) mm.style.display = nav.classList.contains('open') ? 'block' : 'none';
    });
  }
  // Jahr im Footer
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
