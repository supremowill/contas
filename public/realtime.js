(function(){
  const SUPABASE_URL = 'https://yirekxeqgwibfjkbxmmq.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gQYFkKS7EEUEcHd2x61m1Q_K-TImoT4';
  const TABLES = ['entries', 'expenses', 'sessions', 'radar_events'];
  const POLL_MS = 2000;

  let client = null;
  let channel = null;
  let refreshTimer = null;
  let pollTimer = null;
  let checking = false;
  let lastSignature = null;
  let supabaseConnected = false;
  let pendingWhileHidden = false;

  function badge(){
    let box = document.getElementById('realtimeStatus');
    if(box) return box;
    box = document.createElement('div');
    box.id = 'realtimeStatus';
    box.setAttribute('aria-live', 'polite');
    box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;padding:7px 10px;border-radius:999px;font:600 12px system-ui,-apple-system,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.25);background:#334155;color:#fff;opacity:.92;transition:.2s;pointer-events:none';
    box.textContent = 'Tempo real: iniciando';
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

  function maxId(rows){
    return (rows || []).reduce(function(max, row){
      const id = Number(row && row.id) || 0;
      return id > max ? id : max;
    }, 0);
  }

  function sumField(rows, field){
    return Math.round((rows || []).reduce(function(total, row){
      return total + (Number(row && row[field]) || 0);
    }, 0) * 100) / 100;
  }

  function snapshotSignature(data){
    return JSON.stringify((data || []).map(function(s){
      const entries = s.entries || [];
      const expenses = s.expenses || [];
      return [
        Number(s.id) || 0,
        String(s.updated_at || ''),
        String(s.wallet_updated_at || ''),
        Number(s.wallet_balance) || 0,
        entries.length,
        maxId(entries),
        sumField(entries, 'amount'),
        sumField(entries, 'km_delta'),
        expenses.length,
        maxId(expenses),
        sumField(expenses, 'amount')
      ];
    }));
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
        if(typeof loadData === 'function') await loadData();
        setStatus(supabaseConnected ? 'Tempo real: conectado' : 'Tempo real: automático', 'ok');
      }catch(e){
        console.warn('Falha ao atualizar dados automaticamente:', e);
        setStatus('Tempo real: tentando novamente', 'warn');
      }
    }, 350);
  }

  async function checkDatabase(){
    if(checking || document.hidden || typeof api !== 'function') return;
    checking = true;
    try{
      const data = await api('/api/sessions');
      const signature = snapshotSignature(data);
      if(lastSignature === null){
        lastSignature = signature;
        setStatus(supabaseConnected ? 'Tempo real: conectado' : 'Tempo real: automático', 'ok');
      }else if(signature !== lastSignature){
        lastSignature = signature;
        scheduleRefresh();
      }
    }catch(e){
      console.warn('Verificação automática indisponível:', e);
      setStatus('Tempo real: reconectando', 'warn');
    }finally{
      checking = false;
    }
  }

  function startPolling(){
    if(pollTimer) clearInterval(pollTimer);
    checkDatabase();
    pollTimer = setInterval(checkDatabase, POLL_MS);
  }

  async function connectSupabase(){
    try{
      const mod = await import('https://esm.sh/@supabase/supabase-js@2');
      client = mod.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        realtime: { params: { eventsPerSecond: 10 } }
      });

      channel = client.channel('controle-passe-live-v2');
      TABLES.forEach(function(table){
        channel.on('postgres_changes', { event: '*', schema: 'public', table: table }, function(){
          checkDatabase();
        });
      });

      channel.subscribe(function(status){
        if(status === 'SUBSCRIBED'){
          supabaseConnected = true;
          setStatus('Tempo real: conectado', 'ok');
        }else if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'){
          supabaseConnected = false;
          setStatus('Tempo real: automático', 'ok');
        }
      });
    }catch(e){
      supabaseConnected = false;
      console.warn('Canal direto do Supabase indisponível; usando verificação automática:', e);
      setStatus('Tempo real: automático', 'ok');
    }
  }

  function install(){
    badge();
    startPolling();
    connectSupabase();
  }

  document.addEventListener('visibilitychange', function(){
    if(!document.hidden){
      if(pendingWhileHidden){
        pendingWhileHidden = false;
        scheduleRefresh();
      }
      checkDatabase();
    }
  });

  window.addEventListener('online', function(){
    setStatus('Tempo real: reconectando', 'warn');
    checkDatabase();
    if(!supabaseConnected){
      try{
        if(channel && client) client.removeChannel(channel);
      }catch(e){}
      connectSupabase();
    }
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
