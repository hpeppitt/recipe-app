(function(){
  if (customElements.get('l-icon')) return;
  var ready = !!(window.lucide && window.lucide.icons), waiting = new Set();
  var pascal = function(n){ return n.replace(/(^|-)([a-z0-9])/g, function(_, __, c){ return c.toUpperCase(); }); };
  if (!ready) {
    var existing = document.querySelector('script[data-lucide-umd]');
    var onload = function(){ ready = true; waiting.forEach(function(e){ e.draw(); }); waiting.clear(); };
    if (existing) existing.addEventListener('load', onload);
    else { var s = document.createElement('script'); var u = 'https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js'; s.src = (window.__resources && window.__resources.lucide) || u; s.setAttribute('data-lucide-umd', ''); s.onload = onload; document.head.appendChild(s); }
  }
  var NS = 'http://www.w3.org/2000/svg';
  class LIcon extends HTMLElement {
    static get observedAttributes(){ return ['name']; }
    connectedCallback(){ this.style.display = 'inline-flex'; this.style.flex = 'none'; this.draw(); }
    attributeChangedCallback(){ this.draw(); }
    draw(){
      if (!this.isConnected) return;
      if (!ready) { waiting.add(this); return; }
      var node = window.lucide.icons[pascal(this.getAttribute('name') || '')];
      var root = this.shadowRoot || this.attachShadow({ mode: 'open' });
      if (!node) { root.replaceChildren(); return; }
      var kids = node[0] === 'svg' ? node[2] : node;
      var svg = document.createElementNS(NS, 'svg');
      var at = { width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': this.getAttribute('stroke') || '2.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
      for (var k in at) svg.setAttribute(k, at[k]);
      svg.style.display = 'block';
      kids.forEach(function(c){ var el = document.createElementNS(NS, c[0]); for (var a in c[1]) el.setAttribute(a, c[1][a]); svg.appendChild(el); });
      root.replaceChildren(svg);
    }
  }
  customElements.define('l-icon', LIcon);
})();
