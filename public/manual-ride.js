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
    hint.textContent = 'Para corrida particular/manual, informe o KM percorrido. Esse KM entra no custo por km, R$/km, lucro real e dashboards de dia/semana/mês.';
    const checkRow = form.querySelector('.check-row');
    form.insertBefore(hint, checkRow || form.querySelector('button'));
  }

  async function addEntryWithKm(){
    try{
      const rideType = el('entryRideType') ? el('entryRideType').value : 'Uber';
      const distanceKm = toNumber(el('entryKm') ? el('entryKm').value : 0);
      const rawNote = el('entryNote') ? el('entryNote').value.trim() : '';
      const notePrefix = rideType && rideType !== 'Uber' ? `[${rideType}] ` : '';
      const note = `${notePrefix}${rawNote}`.trim();

      const body = {
        amount: Number(el('entryAmount').value),
        rides_count: Number(el('entryRides').value || 1),
        km: distanceKm,
        current_odometer: 0,
        affects_wallet: el('entryAffectsWallet') ? el('entryAffectsWallet').checked !== false : true,
        created_at: (el('entryTime') && el('entryTime').value) || nowValue(),
        note
      };

      await api(`/api/sessions/${activeSessionId}/entries`, { method:'POST', body: JSON.stringify(body) });

      el('entryAmount').value = '';
      el('entryRides').value = '1';
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
