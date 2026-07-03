(function(){
  function el(id){ return document.getElementById(id); }
  function toNumber(v){ return Number(String(v || '0').replace(',', '.')) || 0; }
  function nowValue(){ return typeof nowLocal === 'function' ? nowLocal() : new Date().toISOString().slice(0,16); }

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
    if(document.querySelector('script[src="/dashboard-compare-fix.js"]')) return;
    const s = document.createElement('script');
    s.src = '/dashboard-compare-fix.js?v=2';
    document.body.appendChild(s);
  }

  async function addEntryWithKm(){
    try{
      const rideType = el('entryRideType') ? el('entryRideType').value : 'Uber';
      const amount = toNumber(el('entryAmount') ? el('entryAmount').value : 0);
      const distanceKm = toNumber(el('entryKm') ? el('entryKm').value : 0);
      const rawNote = el('entryNote') ? el('entryNote').value.trim() : '';
      if(amount <= 0) throw new Error('Informe o valor ganho.');

      const notePrefix = rideType ? '[' + rideType + '] ' : '';
      const body = {
        amount: amount,
        rides_count: Number(el('entryRides') ? (el('entryRides').value || 1) : 1),
        km: distanceKm,
        current_odometer: 0,
        affects_wallet: el('entryAffectsWallet') ? el('entryAffectsWallet').checked !== false : true,
        created_at: (el('entryTime') && el('entryTime').value) || nowValue(),
        note: (notePrefix + rawNote).trim()
      };

      await api('/api/sessions/' + activeSessionId + '/entries', { method:'POST', body: JSON.stringify(body) });

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

  function install(){
    ensureManualRideFields();
    loadCompareFix();
    if(typeof api !== 'function' || typeof loadData !== 'function'){
      setTimeout(install, 300);
      return;
    }
    window.addEntry = addEntryWithKm;
    try { addEntry = addEntryWithKm; } catch(e) {}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  setInterval(ensureManualRideFields, 1000);
})();
