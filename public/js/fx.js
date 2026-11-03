/* HemoBridge – small UI effects: scroll progress, header shadow, reveal on scroll */
(function () {
  var d = document, h = d.querySelector('header'), pg = d.getElementById('pg');
  function onScroll() {
    var max = d.documentElement.scrollHeight - innerHeight;
    if (pg) pg.style.setProperty('--p', max > 0 ? scrollY / max : 0);
    if (h) h.classList.toggle('sc', scrollY > 8);
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  var io = new IntersectionObserver(function (items) {
    items.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  d.querySelectorAll('.title,.fm,.fx,.bar,#bens .card,#about .card').forEach(function (el) {
    var i = Array.prototype.indexOf.call(el.parentNode.children, el);
    el.classList.add('rv');
    el.style.transitionDelay = Math.min(i, 4) * 80 + 'ms';
    io.observe(el);
  });
})();
