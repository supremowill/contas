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

  if($('weekScore')) $('weekScore').textContent = statScore(atual);
  if($('weekSummaryText')) {
    $('weekSummaryText').textContent = 'Semana atual comparada com a semana passada até agora e também com a semana passada inteira, dia por dia.';
  }

  if($('weekCards')) {
    $('weekCards').innerHTML =
      card('Bruto semana atual', brl(atual.gross), 'info', 'semana passada até agora: ' + brl(passadaAteAgora.gross)) +
      card('Bruto semana passada inteira', brl(passadaCheia.gross), 'purple', 'total real da semana passada') +
      card('Líquido semana atual', brl(atual.net), moneyClass(atual.net), 'semana passada até agora: ' + brl(passadaAteAgora.net)) +
      card('Líquido semana passada inteira', brl(passadaCheia.net), moneyClass(passadaCheia.net), 'total real da semana passada') +
      card('Diferença vs semana passada até agora', signedMoney(atual.gross - passadaAteAgora.gross), changeClass(atual.gross, passadaAteAgora.gross), changeText(atual.gross, passadaAteAgora.gross) + ' no bruto') +
      card('Falta para bater semana passada', signedMoney(atual.gross - passadaCheia.gross), changeClass(atual.gross, passadaCheia.gross), 'comparando com a semana passada inteira') +
      card('Corridas semana atual', atual.rides, changeClass(atual.rides, passadaAteAgora.rides), 'passada até agora: ' + passadaAteAgora.rides + ' • passada inteira: ' + passadaCheia.rides) +
      card('KM semana atual', km(atual.km), changeClass(atual.km, passadaAteAgora.km), 'passada até agora: ' + km(passadaAteAgora.km) + ' • passada inteira: ' + km(passadaCheia.km)) +
      card('Projeção bruto semana', brl(proj.gross), 'purple', 'se mantiver o ritmo atual') +
      card('Projeção líquido semana', brl(proj.net), moneyClass(proj.net), 'se mantiver o ritmo atual') +
      card('Média/corrida atual', brl(atual.avgRide), 'info', 'passada inteira: ' + brl(passadaCheia.avgRide)) +
      card('R$/km líquido atual', brl(atual.netPerKm), atual.netPerKm >= 1 ? 'good' : 'warning', 'passada inteira: ' + brl(passadaCheia.netPerKm));
  }

  drawBarSeries('weekDaysChart', diasAtual.map(d => d.label), diasAtual.map(d => d.gross), 'Semana atual por dia');
  drawCompareBars('weekCompareChart', ['Bruto','Líquido','Corridas','KM'], [atual.gross, atual.net, atual.rides, atual.km], [passadaCheia.gross, passadaCheia.net, passadaCheia.rides, passadaCheia.km]);

  const linhasDias = diasAtual.map((d, i) => {
    const p = diasPassada[i] || {gross:0, net:0, rides:0, km:0};
    const dif = d.gross - p.gross;
    return rowItem(
      nomes[i] + ' • atual ' + brl(d.gross) + ' / passada ' + brl(p.gross),
      'diferença ' + signedMoney(dif) + ' • líquido atual ' + brl(d.net) + ' • corridas ' + d.rides + ' vs ' + p.rides + ' • KM ' + km(d.km) + ' vs ' + km(p.km),
      dif >= 0 ? 'good' : 'bad'
    );
  }).join('');

  renderList('weekBestDays',
    '<h3 class="hint">Dia por dia: semana atual x semana passada</h3>' + linhasDias,
    'Sem dados para comparar por dia.'
  );

  const horasAtual = topHours(byHour(atual), 8);
  const horasPassada = topHours(byHour(passadaCheia), 8);
  renderList('weekBestHours',
    '<h3 class="hint">Horários fortes da semana atual</h3>' +
    (horasAtual.length ? horasAtual.map(h => rowItem(hourLabel(h.hour) + ' • ' + brl(h.gross), h.rides + ' corrida(s) • ' + km(h.km), 'info')).join('') : '<p class="hint">Sem horário forte nesta semana.</p>') +
    '<h3 class="hint">Horários fortes da semana passada</h3>' +
    (horasPassada.length ? horasPassada.map(h => rowItem(hourLabel(h.hour) + ' • ' + brl(h.gross), h.rides + ' corrida(s) • ' + km(h.km), 'purple')).join('') : '<p class="hint">Semana passada sem corridas registradas.</p>'),
    'Sem horários fortes.'
  );

  const avisoSemanaPassada = passadaCheia.gross > 0
    ? 'Semana passada inteira fechou em ' + brl(passadaCheia.gross) + ' bruto e ' + brl(passadaCheia.net) + ' líquido. Use essa referência para saber quanto falta bater.'
    : 'Semana passada inteira está zerada no sistema. Isso significa que não há corridas registradas naquele período ou que o período anterior não teve lançamentos.';

  renderList('weekInsights',
    progressLine('Bruto semana atual x passada até agora', atual.gross, passadaAteAgora.gross) +
    progressLine('Bruto semana atual x passada inteira', atual.gross, passadaCheia.gross) +
    progressLine('Líquido semana atual x passada inteira', atual.net, passadaCheia.net) +
    progressLine('Corridas semana atual x passada inteira', atual.rides, passadaCheia.rides, 'num') +
    progressLine('KM semana atual x passada inteira', atual.km, passadaCheia.km, 'km') +
    rowItem('Resumo da semana passada', avisoSemanaPassada, passadaCheia.gross > 0 ? 'info' : 'warning')
  );
}

setTimeout(function(){ if(typeof renderDashboard === 'function') renderDashboard(); }, 500);
setTimeout(function(){ if(typeof renderDashboard === 'function') renderDashboard(); }, 1500);
