function flatEntries(){
  return sessions.flatMap(s => (s.entries || []).map(e => ({
    ...e,
    session_id: s.id,
    cost_per_km: num(s.cost_per_km, .81),
    date: String(e.created_at || '').slice(0, 10),
    hour: Number(String(e.created_at || 'T00').split('T')[1]?.slice(0, 2) || 0),
    affects_wallet: e.affects_wallet !== false && e.affects_wallet !== 'false'
  })));
}

function metrics(start, end){
  const rge = rangeKeys(start, end);
  const es = flatEntries().filter(e => inRange(e, rge));
  const xs = flatExpenses().filter(e => inRange(e, rge));
  const gross = es.reduce((a,e) => a + num(e.amount), 0);
  const rides = es.reduce((a,e) => a + num(e.rides_count), 0);
  const kmt = es.reduce((a,e) => a + num(e.km_delta), 0);
  const kmCost = es.reduce((a,e) => a + num(e.km_delta) * num(e.cost_per_km, .81), 0);
  const extra = xs.reduce((a,e) => a + num(e.amount), 0);
  const net = gross - kmCost - extra;
  const hours = new Set(es.map(e => e.date + '-' + e.hour));
  const walletGross = es.filter(e => e.affects_wallet).reduce((a,e) => a + num(e.amount), 0);
  const outWalletGross = es.filter(e => !e.affects_wallet).reduce((a,e) => a + num(e.amount), 0);
  return {
    entries: es,
    expenses: xs,
    gross: num(gross),
    rides: num(rides),
    km: num(kmt),
    kmCost: num(kmCost),
    extra: num(extra),
    net: num(net),
    activeHours: hours.size || 0,
    grossPerKm: kmt ? gross / kmt : 0,
    netPerKm: kmt ? net / kmt : 0,
    avgRide: rides ? gross / rides : 0,
    perActiveHour: hours.size ? gross / hours.size : 0,
    walletGross: num(walletGross),
    outWalletGross: num(outWalletGross),
    range: rge
  };
}

function metricByTextRange(startText, endText){
  const es = flatEntries().filter(e => String(e.created_at || '') >= startText && String(e.created_at || '') < endText);
  const xs = flatExpenses().filter(e => String(e.created_at || '') >= startText && String(e.created_at || '') < endText);
  const gross = es.reduce((a,e)=>a+num(e.amount),0);
  const rides = es.reduce((a,e)=>a+num(e.rides_count),0);
  const kmt = es.reduce((a,e)=>a+num(e.km_delta),0);
  const kmCost = es.reduce((a,e)=>a+num(e.km_delta)*num(e.cost_per_km,.81),0);
  const extra = xs.reduce((a,e)=>a+num(e.amount),0);
  const net = gross-kmCost-extra;
  const hours = new Set(es.map(e=>e.date+'-'+e.hour));
  const walletGross = es.filter(e=>e.affects_wallet).reduce((a,e)=>a+num(e.amount),0);
  const outWalletGross = es.filter(e=>!e.affects_wallet).reduce((a,e)=>a+num(e.amount),0);
  return {entries:es,expenses:xs,gross:num(gross),rides:num(rides),km:num(kmt),kmCost:num(kmCost),extra:num(extra),net:num(net),activeHours:hours.size||0,grossPerKm:kmt?gross/kmt:0,netPerKm:kmt?net/kmt:0,avgRide:rides?gross/rides:0,perActiveHour:hours.size?gross/hours.size:0,walletGross:num(walletGross),outWalletGross:num(outWalletGross)};
}

function metricDateFull(dateObj){
  const key = dateKey(dateObj);
  return metricByTextRange(key + 'T00:00', key + 'T23:59');
}

function metricDateUntilSameTime(dateObj){
  const key = dateKey(dateObj);
  const hhmm = nowLocal().slice(11, 16);
  return metricByTextRange(key + 'T00:00', key + 'T' + hhmm);
}

function renderDayDash(){
  const today = startOfDay(new Date());
  const yesterday = addDays(today, -1);
  const sameWeekday = addDays(today, -7);
  const wd = weekNames[today.getDay()];
  const curHour = new Date().getHours();

  const m = metricDateFull(today);
  const yNow = metricDateUntilSameTime(yesterday);
  const yFull = metricDateFull(yesterday);
  const pSame = metricDateUntilSameTime(sameWeekday);
  const pFull = metricDateFull(sameWeekday);
  const proj = projection(m, today, addDays(today, 1));

  const yRemainingGross = yFull.entries.filter(e => e.hour >= curHour).reduce((sum, e) => sum + num(e.amount), 0);
  const yRemainingNet = yFull.entries.filter(e => e.hour >= curHour).reduce((sum, e) => sum + num(e.amount) - num(e.km_delta) * num(e.cost_per_km, .81), 0);
  const pRemainingGross = pFull.entries.filter(e => e.hour >= curHour).reduce((sum, e) => sum + num(e.amount), 0);
  const pRemainingNet = pFull.entries.filter(e => e.hour >= curHour).reduce((sum, e) => sum + num(e.amount) - num(e.km_delta) * num(e.cost_per_km, .81), 0);
  const baseCount = (yFull.gross > 0 ? 1 : 0) + (pFull.gross > 0 ? 1 : 0);
  const avgRemainingGross = baseCount ? (yRemainingGross + pRemainingGross) / baseCount : 0;
  const avgRemainingNet = baseCount ? (yRemainingNet + pRemainingNet) / baseCount : 0;
  const closeGrossForecast = m.gross + avgRemainingGross;
  const closeNetForecast = m.net + avgRemainingNet;

  if($('dayScore')) $('dayScore').textContent = statScore(m);
  if($('daySummaryText')) $('daySummaryText').textContent = 'Hoje comparado com ontem no mesmo horário e com a ' + wd + ' passada. Ontem também aparece como dia cheio para conferência.';

  if($('dayCards')) $('dayCards').innerHTML =
    card('Bruto hoje', brl(m.gross), 'info', 'ontem até agora: ' + brl(yNow.gross) + ' • ' + wd + ' passada: ' + brl(pSame.gross)) +
    card('Líquido hoje', brl(m.net), moneyClass(m.net), 'ontem até agora: ' + brl(yNow.net) + ' • ' + wd + ' passada: ' + brl(pSame.net)) +
    card('Ontem até agora', brl(yNow.gross), yNow.gross > 0 ? 'purple' : 'warning', yNow.rides + ' corrida(s) • ' + km(yNow.km) + ' • ' + yNow.activeHours + 'h ativa(s)') +
    card('Ontem dia cheio', brl(yFull.gross), yFull.gross > 0 ? 'purple' : 'warning', yFull.rides + ' corrida(s) • ' + km(yFull.km) + ' • líquido ' + brl(yFull.net)) +
    card('Diferença vs ontem até agora', signedMoney(m.gross - yNow.gross), changeClass(m.gross, yNow.gross), changeText(m.gross, yNow.gross) + ' no bruto') +
    card('Diferença vs ' + wd + ' passada', signedMoney(m.gross - pSame.gross), changeClass(m.gross, pSame.gross), changeText(m.gross, pSame.gross) + ' no bruto') +
    card('Corridas hoje', m.rides, changeClass(m.rides, yNow.rides), 'ontem até agora: ' + yNow.rides + ' • ' + wd + ' passada: ' + pSame.rides) +
    card('KM hoje', km(m.km), changeClass(m.km, yNow.km), 'ontem até agora: ' + km(yNow.km) + ' • ontem cheio: ' + km(yFull.km)) +
    card('R$/km líquido', brl(m.netPerKm), m.netPerKm >= 1 ? 'good' : 'warning', 'ontem: ' + brl(yNow.netPerKm) + ' • sem. passada: ' + brl(pSame.netPerKm)) +
    card('Horas com corrida', m.activeHours, 'info', 'ontem até agora: ' + yNow.activeHours + ' • ontem cheio: ' + yFull.activeHours) +
    card('Previsão bruto final', brl(closeGrossForecast), 'purple', 'histórico restante de ontem e ' + wd + ' passada') +
    card('Previsão líquido final', brl(closeNetForecast), moneyClass(closeNetForecast), 'ritmo atual + histórico restante');

  const yHours = byHour(yFull);
  const refHours = byHour(pFull);
  const yBest = topHours(yHours, 6);
  const refBest = topHours(refHours, 6);
  const merged = [...yBest.map(h => ({...h, src:'ontem'})), ...refBest.map(h => ({...h, src:wd+' passada'}))]
    .sort((a,b)=>b.gross-a.gross).slice(0,8);

  drawBarSeries('dayHourlyChart', yHours.map(x=>hourLabel(x.hour)), yHours.map(x=>x.gross), 'Ontem por horário');
  drawCompareBars('dayCompareChart', ['Bruto','Líquido','Corridas','KM'], [m.gross,m.net,m.rides,m.km], [yNow.gross,yNow.net,yNow.rides,yNow.km]);

  renderList('dayBestHours',
    '<h3 class="hint">Horários de ontem</h3>' +
    (yBest.length ? yBest.map(h=>rowItem(hourLabel(h.hour)+' • '+brl(h.gross), 'ontem • '+h.rides+' corrida(s) • '+km(h.km), 'good')).join('') : '<p class="hint">Ontem não tem corridas registradas no sistema.</p>') +
    '<h3 class="hint">Horários da '+wd+' passada</h3>' +
    (refBest.length ? refBest.map(h=>rowItem(hourLabel(h.hour)+' • '+brl(h.gross), wd+' passada • '+h.rides+' corrida(s) • '+km(h.km), 'good')).join('') : '<p class="hint">A '+wd+' passada não tem corridas registradas.</p>'),
    'Sem histórico de horários.'
  );

  renderList('dayPeakForecast',
    (merged.length ? merged.map(h=>rowItem(hourLabel(h.hour)+' provável pico', brl(h.gross)+' em '+h.src+' • '+h.rides+' corrida(s) • '+km(h.km), 'info')).join('') : '') +
    rowItem('Previsão Bruto Final do Dia', brl(closeGrossForecast), 'purple') +
    rowItem('Previsão Líquido Final do Dia', brl(closeNetForecast), moneyClass(closeNetForecast)),
    'Sem dados para calcular previsão.'
  );

  renderList('dayInsights',
    progressLine('Bruto vs ontem até agora', m.gross, yNow.gross) +
    progressLine('Bruto vs ontem dia cheio', m.gross, yFull.gross) +
    progressLine('Líquido vs ontem até agora', m.net, yNow.net) +
    progressLine('Corridas vs ontem até agora', m.rides, yNow.rides, 'num') +
    progressLine('KM vs ontem até agora', m.km, yNow.km, 'km') +
    progressLine('Bruto vs '+wd+' passada', m.gross, pSame.gross) +
    rowItem('Conferência de ontem', yFull.gross > 0 ? 'Ontem foi encontrado: '+brl(yFull.gross)+' bruto, '+yFull.rides+' corrida(s), '+km(yFull.km)+'.' : 'Ontem está zerado no sistema. Se você trabalhou ontem, confira se as corridas foram lançadas com a data correta.', yFull.gross > 0 ? 'info' : 'warning')
  );
}

function renderWeekDash(){
  const start = startOfWeek(new Date());
  const end = addDays(start, 7);
  const prevStart = addDays(start, -7);
  const now = new Date();
  const prevSame = new Date(prevStart.getTime() + (now - start));

  const atual = metrics(start, end);
  const passadaAteAgora = metrics(prevStart, prevSame);
  const passadaCheia = metrics(prevStart, start);
  const proj = projection(atual, start, end);

  const diasAtual = byDay(start, 7);
  const diasPassada = byDay(prevStart, 7);
  const nomes = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
  const horasTxt = v => num(v).toFixed(0).replace('.', ',') + 'h';
  const porHora = d => d.activeHours ? d.gross / d.activeHours : 0;

  if($('weekScore')) $('weekScore').textContent = statScore(atual);
  if($('weekSummaryText')) {
    $('weekSummaryText').textContent = 'Semana atual comparada com a semana passada. Entradas fora da carteira entram no bruto, KM, lucro e relatórios; só não alteram a carteira.';
  }

  if($('weekCards')) {
    $('weekCards').innerHTML =
      card('Bruto semana atual', brl(atual.gross), 'info', 'inclui carteira e fora da carteira') +
      card('Fora da carteira na semana', brl(atual.outWalletGross), atual.outWalletGross > 0 ? 'warning' : 'info', 'entra no dashboard, mas não soma na carteira') +
      card('Na carteira na semana', brl(atual.walletGross), 'good', 'entradas que somam na carteira') +
      card('Bruto semana passada inteira', brl(passadaCheia.gross), 'purple', 'total real da semana passada') +
      card('Líquido semana atual', brl(atual.net), moneyClass(atual.net), 'semana passada até agora: ' + brl(passadaAteAgora.net)) +
      card('Líquido semana passada inteira', brl(passadaCheia.net), moneyClass(passadaCheia.net), 'total real da semana passada') +
      card('KM semana atual', km(atual.km), changeClass(atual.km, passadaAteAgora.km), 'passada até agora: ' + km(passadaAteAgora.km) + ' • passada inteira: ' + km(passadaCheia.km)) +
      card('Horas ativas semana atual', horasTxt(atual.activeHours), changeClass(atual.activeHours, passadaAteAgora.activeHours), 'passada até agora: ' + horasTxt(passadaAteAgora.activeHours) + ' • passada inteira: ' + horasTxt(passadaCheia.activeHours)) +
      card('R$/hora ativa atual', brl(atual.perActiveHour), atual.perActiveHour >= 25 ? 'good' : 'warning', 'passada inteira: ' + brl(passadaCheia.perActiveHour)) +
      card('R$/km líquido atual', brl(atual.netPerKm), atual.netPerKm >= 1 ? 'good' : 'warning', 'passada inteira: ' + brl(passadaCheia.netPerKm)) +
      card('Diferença vs semana passada até agora', signedMoney(atual.gross - passadaAteAgora.gross), changeClass(atual.gross, passadaAteAgora.gross), changeText(atual.gross, passadaAteAgora.gross) + ' no bruto') +
      card('Falta para bater semana passada', signedMoney(atual.gross - passadaCheia.gross), changeClass(atual.gross, passadaCheia.gross), 'comparando com a semana passada inteira') +
      card('Corridas semana atual', atual.rides, changeClass(atual.rides, passadaAteAgora.rides), 'passada até agora: ' + passadaAteAgora.rides + ' • passada inteira: ' + passadaCheia.rides) +
      card('Projeção bruto semana', brl(proj.gross), 'purple', 'se mantiver o ritmo atual');
  }

  drawBarSeries('weekDaysChart', diasAtual.map(d => d.label), diasAtual.map(d => d.gross), 'Semana atual por dia');
  drawCompareBars('weekCompareChart', ['Bruto','Líquido','Corridas','KM'], [atual.gross, atual.net, atual.rides, atual.km], [passadaCheia.gross, passadaCheia.net, passadaCheia.rides, passadaCheia.km]);

  const linhasDias = diasAtual.map((d, i) => {
    const p = diasPassada[i] || {gross:0, net:0, rides:0, km:0, activeHours:0, perActiveHour:0, netPerKm:0, outWalletGross:0};
    const dif = d.gross - p.gross;
    const titulo = nomes[i] + ' • atual ' + brl(d.gross) + ' / passada ' + brl(p.gross);
    const detalhes =
      'diferença ' + signedMoney(dif) +
      '<br>líquido: ' + brl(d.net) + ' vs ' + brl(p.net) +
      '<br>corridas: ' + d.rides + ' vs ' + p.rides +
      '<br>KM: ' + km(d.km) + ' vs ' + km(p.km) +
      '<br>horas ativas: ' + horasTxt(d.activeHours) + ' vs ' + horasTxt(p.activeHours) +
      '<br>R$/h ativa: ' + brl(porHora(d)) + ' vs ' + brl(porHora(p)) +
      '<br>R$/km líquido: ' + brl(d.netPerKm) + ' vs ' + brl(p.netPerKm) +
      '<br>fora da carteira: ' + brl(d.outWalletGross || 0);
    return rowItem(titulo, detalhes, dif >= 0 ? 'good' : 'bad');
  }).join('');

  renderList('weekBestDays',
    '<h3 class="hint">Dia por dia: semana atual x semana passada</h3>' + linhasDias,
    'Sem dados para comparar por dia.'
  );

  const horasAtual = topHours(byHour(atual), 8);
  const horasPassada = topHours(byHour(passadaCheia), 8);
  renderList('weekBestHours',
    '<h3 class="hint">Horários fortes da semana atual</h3>' +
    (horasAtual.length ? horasAtual.map(h => rowItem(hourLabel(h.hour) + ' • ' + brl(h.gross), h.rides + ' corrida(s) • ' + km(h.km) + ' • líquido ' + brl(h.net), 'info')).join('') : '<p class="hint">Sem horário forte nesta semana.</p>') +
    '<h3 class="hint">Horários fortes da semana passada</h3>' +
    (horasPassada.length ? horasPassada.map(h => rowItem(hourLabel(h.hour) + ' • ' + brl(h.gross), h.rides + ' corrida(s) • ' + km(h.km) + ' • líquido ' + brl(h.net), 'purple')).join('') : '<p class="hint">Semana passada sem corridas registradas.</p>'),
    'Sem horários fortes.'
  );

  const avisoSemanaPassada = passadaCheia.gross > 0
    ? 'Semana passada inteira fechou em ' + brl(passadaCheia.gross) + ' bruto, ' + brl(passadaCheia.net) + ' líquido, ' + km(passadaCheia.km) + ', ' + horasTxt(passadaCheia.activeHours) + ' ativas e ' + passadaCheia.rides + ' corrida(s).'
    : 'Semana passada inteira está zerada no sistema. Isso significa que não há corridas registradas naquele período ou que o período anterior não teve lançamentos.';

  renderList('weekInsights',
    progressLine('Bruto semana atual x passada até agora', atual.gross, passadaAteAgora.gross) +
    progressLine('Bruto semana atual x passada inteira', atual.gross, passadaCheia.gross) +
    progressLine('Líquido semana atual x passada inteira', atual.net, passadaCheia.net) +
    progressLine('Corridas semana atual x passada inteira', atual.rides, passadaCheia.rides, 'num') +
    progressLine('KM semana atual x passada inteira', atual.km, passadaCheia.km, 'km') +
    rowItem('Entradas fora da carteira', brl(atual.outWalletGross) + ' aparecem nos dashboards e relatórios, mas não alteram a carteira.', atual.outWalletGross > 0 ? 'warning' : 'info') +
    rowItem('Horas ativas da semana', horasTxt(atual.activeHours) + ' atual vs ' + horasTxt(passadaCheia.activeHours) + ' semana passada inteira • R$/h atual ' + brl(atual.perActiveHour) + ' vs ' + brl(passadaCheia.perActiveHour), changeClass(atual.perActiveHour, passadaCheia.perActiveHour)) +
    rowItem('Resumo da semana passada', avisoSemanaPassada, passadaCheia.gross > 0 ? 'info' : 'warning')
  );
}

setTimeout(function(){ if(typeof renderDashboard === 'function') renderDashboard(); }, 500);
setTimeout(function(){ if(typeof renderDashboard === 'function') renderDashboard(); }, 1500);
