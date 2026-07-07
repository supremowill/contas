(function(){
  function el(id){ return document.getElementById(id); }
  function toNumber(v){ return Number(String(v || '0').replace(',', '.')) || 0; }
  function nowValue(){ return typeof nowLocal === 'function' ? nowLocal() : new Date().toISOString().slice(0,16); }
  function isManualNote(note){ return !/Radar MacroDroid|MACRODROID/i.test(String(note || '')); }
  function coversSession(s, at){ return s && String(at) >= String(s.started_at) && String(at) < String(s.ended_at); }
  function dayStart(at){ return String(at || nowValue()).slice(0,10) + 'T00:00'; }

  function ensureManualRideFields(){
    const form = el('quickEntryForm');
    if(!form || el('entryKm')) return;
    const grid = form.querySelector('.grid.two');
    if(!grid) return;

    const typeBox = document.createElement('div');
    typeBox.innerHTML = '<label>Tipo da corrida</label><select id="entryRideType"><option>Uber</option><option>99</option><option>Particular</option><option>Outro</option></select>';

    const kmBox = document.createElement('div');
    kmBox.innerHTML = '<label>Distância percorrida nesta corrida</label><input id="entryKm" type="number" step="0.1" placeholder="Ex: 8.5" />';

    grid.appendChild(typeBox);
    grid.appendChild(kmBox);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.id = 'manualRideHint';
    hint.textContent = 'O MacroDroid já envia o KM automático. Use este campo quando lançar corrida manual ou particular.';
    const checkRow = form.querySelector('.check-row');
    form.insertBefore(hint, checkRow || form.querySelector('button'));
  }

  function loadCompareFix(){
    if(document.querySelector('script[data-dashboard-compare-fix="true"]')) return;
    const s = document.createElement('script');
    s.src = '/dashboard-compare-fix.js?v=6';
    s.dataset.dashboardCompareFix = 'true';
    document.body.appendChild(s);
  }

  async function getSessionForEntry(at, baseSession, note){
    if(Array.isArray(sessions)){
      const existing = sessions.find(s => coversSession(s, at));
      if(existing) return existing;
    }

    const started = dayStart(at);
    const platformMatch = String(note || '').match(/^\[([^\]]+)\]/);
    const platform = platformMatch ? platformMatch[1] : (baseSession?.platform || 'Uber');
    const created = await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        platform,
        pass_type: 24,
        pass_price: 0,
        cost_per_km: toNumber(baseSession?.cost_per_km || 0.81),
        start_odometer: 0,
        started_at: started,
        notes: 'Passe histórico criado automaticamente para lançamento manual fora do período do passe ativo.'
      })
    });
    sessions.push(created);
    return created;
  }

  async function addEntryWithKm(){
    try{
      const rideType = el('entryRideType') ? el('entryRideType').value : 'Uber';
      const amount = toNumber(el('entryAmount') ? el('entryAmount').value : 0);
      const distanceKm = toNumber(el('entryKm') ? el('entryKm').value : 0);
      const rawNote = el('entryNote') ? el('entryNote').value.trim() : '';
      if(amount <= 0) throw new Error('Informe o valor ganho.');

      const notePrefix = rideType ? '[' + rideType + '] ' : '';
      const createdAt = (el('entryTime') && el('entryTime').value) || nowValue();
      const note = (notePrefix + rawNote).trim();
      const selectedSession = Array.isArray(sessions) ? sessions.find(s => Number(s.id) === Number(activeSessionId)) : null;
      const targetSession = coversSession(selectedSession, createdAt) ? selectedSession : await getSessionForEntry(createdAt, selectedSession, note);

      const body = {
        amount: amount,
        rides_count: Number(el('entryRides') ? (el('entryRides').value || 1) : 1),
        km: distanceKm,
        current_odometer: 0,
        affects_wallet: el('entryAffectsWallet') ? el('entryAffectsWallet').checked !== false : true,
        created_at: createdAt,
        note
      };

      await api('/api/sessions/' + targetSession.id + '/entries', { method:'POST', body: JSON.stringify(body) });

      el('entryAmount').value = '';
      if(el('entryRides')) el('entryRides').value = '1';
      if(el('entryKm')) el('entryKm').value = '';
      if(el('entryRideType')) el('entryRideType').value = 'Uber';
      if(el('entryTime')) el('entryTime').value = nowValue();
      if(el('entryNote')) el('entryNote').value = '';
      closeQuickModal();
      loadData();
    }catch(e){
      showError(e.message);
    }
  }

  async function repairManualEntriesOutsidePass(){
    try{
      if(!Array.isArray(sessions) || !sessions.length) return;
      const moves = [];
      for(const s of sessions){
        for(const e of (s.entries || [])){
          if(isManualNote(e.note) && !coversSession(s, e.created_at)) moves.push({session:s, entry:e});
        }
      }
      for(const item of moves.slice(0, 5)){
        const e = item.entry;
        const target = await getSessionForEntry(e.created_at, item.session, e.note);
        if(Number(target.id) === Number(item.session.id)) continue;
        await api('/api/sessions/' + target.id + '/entries', {
          method:'POST',
          body: JSON.stringify({
            amount: toNumber(e.amount),
            rides_count: Number(e.rides_count || 1),
            km: toNumber(e.km_delta || e.km || 0),
            current_odometer: 0,
            affects_wallet: e.affects_wallet !== false && e.affects_wallet !== 'false',
            created_at: e.created_at,
            note: e.note || ''
          })
        });
        await api('/api/entries/' + e.id, { method:'DELETE' });
      }
      if(moves.length) loadData();
    }catch(e){
      console.warn('Não foi possível reorganizar lançamentos históricos:', e);
    }
  }

  function install(){
    ensureManualRideFields();
    loadCompareFix();
    if(typeof api !== 'function' || typeof loadData !== 'function'){
      setTimeout(install, 300);
      return;
    }
    window.addEntry = addEntryWithKm;
    try { addEntry = addEntryWithKm; } catch(e) {}
    setTimeout(repairManualEntriesOutsidePass, 1500);
    setTimeout(repairManualEntriesOutsidePass, 4500);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  setInterval(ensureManualRideFields, 1000);
})();
