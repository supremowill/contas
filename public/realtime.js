(function(){
  const SUPABASE_URL = 'https://yirekxeqgwibfjkbxmmq.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gQYFkKS7EEUEcHd2x61m1Q_K-TImoT4';
  const TABLES = ['entries', 'expenses', 'sessions', 'radar_events'];

  let client = null;
  let channel = null;
  let refreshTimer = null;
  let pendingWhileHidden = false;
  let fallbackTimer = null;
  let connected = false;

  function badge(){
    let box = document.getElementById('realtimeStatus');
    if(box) return box;
    box = document.createElement('div');
    box.id = 'realtimeStatus';
    box.setAttribute('aria-live', 'polite');
    box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;padding:7px 10px;border-radius:999px;font:600 12px system-ui,-apple-system,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.25);background:#334155;color:#fff;opacity:.92;transition:.2s;pointer-events:none';
    box.textContent = 'Tempo real: conectando';
    document.body.appendChild(box);
    return box;
  }

  function setStatus(text, state){
    const box = badge();
    box.textContent = text;
    if(state === 'ok') box.style.background = '#166534';
    else if(state === 'warn') box.style.background = '#92400e';
    else if(state === 'pulse') box.style.background = '#1d4ed8';
    else box.style.background = '#334155';
  }

  function scheduleRefresh(){
    if(document.hidden){
      pendingWhileHidden = true;
      return;
    }
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async function(){
      try{
        setStatus('Tempo real: atualizando', 'pulse');
        if(typeof window.loadData === 'function') await window.loadData();
        else if(typeof loadData === 'function') await loadData();
        setStatus('Tempo real: conectado', 'ok');
      }catch(e){
        console.warn('Falha ao atualizar dados em tempo real:', e);
        setStatus('Tempo real: reconectando', 'warn');
      }
    }, 500);
  }

  function startFallback(){
    if(fallbackTimer) return;
    fallbackTimer = setInterval(function(){
      if(!connected && !document.hidden) scheduleRefresh();
    }, 30000);
  }

  function stopFallback(){
    if(!fallbackTimer) return;
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }

  async function connect(){
    try{
      setStatus('Tempo real: conectando');
      const mod = await import('https://esm.sh/@supabase/supabase-js@2');
      client = mod.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        realtime: { params: { eventsPerSecond: 10 } }
      });

      channel = client.channel('controle-passe-live');
      TABLES.forEach(function(table){
        channel.on('postgres_changes', { event: '*', schema: 'public', table: table }, function(){
          scheduleRefresh();
        });
      });

      channel.subscribe(function(status){
        if(status === 'SUBSCRIBED'){
          connected = true;
          stopFallback();
          setStatus('Tempo real: conectado', 'ok');
        }else if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'){
          connected = false;
          setStatus('Tempo real: reconectando', 'warn');
          startFallback();
        }
      });
    }catch(e){
      connected = false;
      console.warn('Supabase Realtime indisponível:', e);
      setStatus('Tempo real: modo automático', 'warn');
      startFallback();
    }
  }

  document.addEventListener('visibilitychange', function(){
    if(!document.hidden && pendingWhileHidden){
      pendingWhileHidden = false;
      scheduleRefresh();
    }
  });

  window.addEventListener('online', function(){
    if(!connected){
      setStatus('Tempo real: reconectando', 'warn');
      if(channel && client) client.removeChannel(channel);
      connect();
    }
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect);
  else connect();
})();
