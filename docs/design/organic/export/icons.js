(function(){
  function run(){ if(!window.lucide) return; var els=document.querySelectorAll('i[data-lucide]'); if(!els.length) return; window.lucide.createIcons({attrs:{'stroke-width':2.75,width:'1em',height:'1em'}}); }
  function burst(){ var n=0; var t=setInterval(function(){ run(); if(++n>15) clearInterval(t); },300); }
  var s=document.createElement('script'); s.src='https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js'; s.onload=burst; document.head.appendChild(s);
  document.addEventListener('click',function(){ setTimeout(run,50); setTimeout(run,300); },true);
  window.addEventListener('load',burst);
})();
