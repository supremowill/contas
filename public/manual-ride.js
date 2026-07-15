(function(){
  function load(src, marker){
    if(document.querySelector('script[data-loader="' + marker + '"]')) return;
    const script = document.createElement('script');
    script.src = src;
    script.dataset.loader = marker;
    document.body.appendChild(script);
  }

  function install(){
    load('/manual-ride-core.js?v=1', 'manual-core');
    load('/realtime.js?v=1', 'supabase-realtime');
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
