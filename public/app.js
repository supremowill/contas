let sessions=[];
let activeSessionId=Number(localStorage.getItem('activeSessionId')||0);
let currentReport='daily';
let historyFilter='all';
let quickMode='entry';
let dashboardMode=localStorage.getItem('dashboardMode')||'pass';

const $=id=>document.getElementById(id);
const num=v=>Number(String(v??'').replace(',','.'))||0;
const brl=v=>num(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct=v=>num(v).toFixed(1).replace('.',',')+'%';
const km=v=>num(v).toFixed(1).replace('.',',')+' km';
const od=v=>num(v)>0?num(v).toLocaleString('pt-BR',{maximumFractionDigits:1}):'-';
const weekNames=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];

function nowLocal(){const d=new Date(),p=x=>String(x).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}
function dateKey(d){const x=new Date(d),p=v=>String(v).padStart(2,'0');return `${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}`}
function dateTimeKey(d){const x=new Date(d),p=v=>String(v).padStart(2,'0');return `${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`}
function fmtDate(v){if(!v)return'-';const[d,t='']=String(v).split('T');const[y,m,day]=d.split('-');return `${day}/${m}/${y} ${t}`}
function fmtShortDate(v){if(!v)return'-';const [y,m,d]=String(v).slice(0,10).split('-');return `${d}/${m}`}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function addMonths(d,n){const x=new Date(d);x.setMonth(x.getMonth()+n);return x}
function startOfDay(d){const x=new Date(d);x.setHours(0,0,0,0);return x}
function startOfWeek(d){const x=startOfDay(d);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);return x}
function startOfMonth(d){const x=startOfDay(d);x.setDate(1);return x}
function endDate(s){return new Date(s.ended_at)}
function isExpired(s){return Date.now()>endDate(s).getTime()}
function isActive(s){return s&&!isExpired(s)}
function openSession(){return sessions.find(s=>isActive(s))||null}
function leftTime(s){const ms=endDate(s)-new Date();if(ms<=0)return'Expirado';const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),d=Math.floor(h/24),rh=h%24;return d>0?`${d}d ${rh}h ${m}min`:`${h}h ${m}min`}
function showError(msg){const box=$('globalError');if(!box)return;box.style.display='block';box.textContent=msg}
function clearError(){const box=$('globalError');if(!box)return;box.style.display='none';box.textContent=''}
function yesWallet(v){return v!==false&&v!=='false'}
function moneyClass(v){return num(v)>=0?'good':'bad'}
function signedMoney(v){const val=num(v);return `${val>=0?'↑ +':'↓ '}${brl(Math.abs(val))}`}
function changePct(cur,prev){return prev?((cur-prev)/Math.abs(prev))*100:cur?100:0}
// Utiliza setas indicadoras de tendência para as métricas comparativas
function changeText(cur,prev){const p=changePct(cur,prev);return `${p>=0?'↑ +':'↓ '}${pct(Math.abs(p))}`}
function changeClass(cur,prev){return num(cur)>=num(prev)?'good':'bad'}
function hourLabel(h){return `${String(h).padStart(2,'0')}h`}

async function api(path,opt={}){const headers=opt.headers||{};headers['Content-Type']='application/json';const pin=localStorage.getItem('appPin')||'';if(pin)headers['x-app-pin']=pin;const res=await fetch(path,{...opt,headers});if(res.status===401){showLogin();throw new Error('PIN inválido')}const data=(res.headers.get('content-type')||'').includes('json')?await res.json():await res.text();if(!res.ok)throw new Error(data.error||'Erro');return data}
function showLogin(){const b=$('loginBox');if(b)b.style.display='flex'}
function hideLogin(){const b=$('loginBox');if(b)b.style.display='none'}
async function login(){try{const pin=$('pinInput').value.trim();await api('/api/login',{method:'POST',body:JSON.stringify({pin})});localStorage.setItem('appPin',pin);hideLogin();loadData()}catch(e){$('loginError').style.display='block';$('loginError').textContent=e.message}}
function logout(){localStorage.removeItem('appPin');showLogin()}
function showTab(name){document.querySelectorAll('.section').forEach(e=>e.classList.remove('active'));document.querySelectorAll('.tab').forEach(e=>e.classList.remove('active'));$(name)?.classList.add('active');document.querySelector(`[data-tab="${name}"]`)?.classList.add('active');if(name==='historico')renderHistory();if(name==='relatorios')loadReport(currentReport);if(name==='novo')renderNewWarning();if(name==='dashboard')renderDashboard()}
function showDashMode(mode){dashboardMode=mode;localStorage.setItem('dashboardMode',mode);renderDashboard()}

async function loadData(){clearError();try{sessions=await api('/api/sessions');const open=openSession();if(open)activeSessionId=open.id;if(activeSessionId&&!sessions.find(s=>s.id===activeSessionId)){activeSessionId=0;localStorage.removeItem('activeSessionId')}if(activeSessionId)localStorage.setItem('activeSessionId',activeSessionId);renderDashboard();renderHistory();renderNewWarning();loadReport(currentReport,true)}catch(e){showError(e.message)}}
function renderNewWarning(){const open=openSession(),box=$('activeWarning');if(!box)return;if(open){box.style.display='block';box.innerHTML=`Já existe um passe vigente: <b>${open.pass_type}h</b>, iniciado em <b>${fmtDate(open.started_at)}</b>. Tempo restante: <b>${leftTime(open)}</b>. Para iniciar outro, cancele/exclua o atual.`}else box.style.display='none'}
function getMetricIcon(label) {
  const l = String(label || '').toLowerCase();
  if (l.includes('bruto') || l.includes('ganho')) {
    return `<svg class="metric-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`;
  }
  if (l.includes('líquido') || l.includes('margem') || l.includes('lucro')) {
    return `<svg class="metric-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`;
  }
  if (l.includes('despesa') || l.includes('custo') || l.includes('passe')) {
    return `<svg class="metric-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  }
  if (l.includes('km') || l.includes('quilometragem') || l.includes('odômetro') || l.includes('odometer') || l.includes('painel')) {
    return `<svg class="metric-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
  }
  if (l.includes('corrida') || l.includes('rides') || l.includes('viagem')) {
    return `<svg class="metric-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`;
  }
  if (l.includes('hora') || l.includes('tempo') || l.includes('conferência') || l.includes('atualizado')) {
    return `<svg class="metric-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
  }
  if (l.includes('carteira') || l.includes('wallet')) {
    return `<svg class="metric-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>`;
  }
  return `<svg class="metric-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`;
}

// Renderiza cartões de métricas do dashboard de forma visual e atraente com ícones e subtextos estilizados
function card(label,value,cls='',sub=''){
  const icon = getMetricIcon(label);
  return `<div class="card ${cls}"><div class="card-header"><span class="label">${label}</span>${icon}</div><div class="value ${cls}">${value}</div>${sub?`<div class="card-sub">${sub}</div>`:''}</div>`;
}
function rowItem(title,sub='',cls=''){return `<div class="smart-item"><b class="${cls}">${title}</b><span>${sub}</span></div>`}
function renderList(id,html,empty='Sem dados ainda.'){const box=$(id);if(box)box.innerHTML=html||`<p class="hint">${empty}</p>`}
function statScore(m){if(!m.gross)return'-';const margin=m.gross?m.net/m.gross*100:0;if(margin>=70)return'Excelente';if(margin>=55)return'Bom';if(margin>=35)return'Atenção';return'Pesado'}
function progressLine(label,cur,prev,type='money'){const diff=cur-prev,cls=diff>=0?'good':'bad',format=type==='km'?km:type==='num'?(v=>String(num(v))):brl;return `<div class="progress-row"><div><b>${label}</b><span>${format(cur)} hoje • ${format(prev)} referência</span></div><strong class="${cls}">${diff>=0?'+':''}${format(diff)}</strong></div>`}

function rangeKeys(start,end){return{start:dateTimeKey(start),end:dateTimeKey(end)}}
function inRange(row,r){const c=String(row.created_at||'');return c>=r.start&&c<r.end}
function flatEntries(){return sessions.flatMap(s=>(s.entries||[]).map(e=>({...e,session_id:s.id,cost_per_km:num(s.cost_per_km,.81),date:String(e.created_at||'').slice(0,10),hour:Number(String(e.created_at||'T00').split('T')[1]?.slice(0,2)||0)})))}
function flatExpenses(){return sessions.flatMap(s=>(s.expenses||[]).map(e=>({...e,session_id:s.id,cost_per_km:num(s.cost_per_km,.81),date:String(e.created_at||'').slice(0,10),hour:Number(String(e.created_at||'T00').split('T')[1]?.slice(0,2)||0)})))}
function metrics(start,end){const rge=rangeKeys(start,end),es=flatEntries().filter(e=>inRange(e,rge)),xs=flatExpenses().filter(e=>inRange(e,rge));const gross=es.reduce((a,e)=>a+num(e.amount),0),rides=es.reduce((a,e)=>a+num(e.rides_count),0),kmt=es.reduce((a,e)=>a+num(e.km_delta),0),kmCost=es.reduce((a,e)=>a+num(e.km_delta)*num(e.cost_per_km,.81),0),extra=xs.reduce((a,e)=>a+num(e.amount),0),net=gross-kmCost-extra;const hours=new Set(es.map(e=>e.date+'-'+e.hour));return{entries:es,expenses:xs,gross:num(gross),rides:num(rides),km:num(kmt),kmCost:num(kmCost),extra:num(extra),net:num(net),activeHours:hours.size||0,grossPerKm:kmt?gross/kmt:0,netPerKm:kmt?net/kmt:0,avgRide:rides?gross/rides:0,perActiveHour:hours.size?gross/hours.size:0,range:rge}}
function byHour(m){const arr=Array.from({length:24},(_,h)=>({hour:h,gross:0,rides:0,km:0,count:0,net:0}));m.entries.forEach(e=>{const h=Math.max(0,Math.min(23,e.hour||0)),kmv=num(e.km_delta);arr[h].gross+=num(e.amount);arr[h].rides+=num(e.rides_count);arr[h].km+=kmv;arr[h].net+=num(e.amount)-kmv*num(e.cost_per_km,.81);arr[h].count++});return arr}
function byDay(start,days){return Array.from({length:days},(_,i)=>{const d=addDays(start,i),m=metrics(d,addDays(d,1));return{date:dateKey(d),label:fmtShortDate(dateKey(d)),...m}})}
function topHours(arr,limit=5,minGross=0){return [...arr].filter(x=>x.gross>minGross).sort((a,b)=>b.gross-a.gross).slice(0,limit)}
function projection(current,start,end){const totalMs=end-start,elapsedMs=Math.max(Date.now()-start,1),ratio=Math.min(Math.max(elapsedMs/totalMs,0.05),1);return{gross:current.gross/ratio,net:current.net/ratio,rides:current.rides/ratio,km:current.km/ratio,ratio}}

function updateDashVisibility(){document.querySelectorAll('.smart-tab').forEach(b=>b.classList.toggle('active',b.dataset.dash===dashboardMode));document.querySelectorAll('.dash-view').forEach(v=>v.classList.remove('active'));$(`${dashboardMode}Dash`)?.classList.add('active')}
function renderDashboard(){updateDashVisibility();let s=sessions.find(x=>x.id===activeSessionId);if(s&&isExpired(s)){activeSessionId=0;s=null}const hasPass=!!s;if($('activeWrap'))$('activeWrap').style.display='block';if($('emptyActive'))$('emptyActive').style.display=!hasPass&&dashboardMode==='pass'?'block':'none';if($('executiveBox'))$('executiveBox').textContent=hasPass&&dashboardMode==='pass'?(s.summary.executive_message||'Dia no controle.'):`Dashboard ${dashboardMode}: analisando corridas, horários, KM, despesas e comparativos.`;if(hasPass)renderPassDashboard(s);renderSmartDashboards()}
function updateGaugeMeta(x){const chart=$('gaugeChart');if(!chart)return;let meta=$('gaugeMeta');if(!meta){meta=document.createElement('div');meta.id='gaugeMeta';meta.className='gauge-meta';chart.insertAdjacentElement('afterend',meta)}meta.innerHTML=`<div class="mini-card"><span class="mini-label">Meta saudável</span><span class="mini-value good">abaixo de 15%</span></div><div class="mini-card"><span class="mini-label">Falta p/ 15%</span><span class="mini-value ${x.missing_15>0?'warning':'good'}">${brl(x.missing_15)}</span></div>`}
function renderPassDashboard(s){const x=s.summary;$('percentText').textContent=pct(x.pass_percent);$('statusText').textContent=x.status.label;$('statusText').className='status '+x.status.key;$('barFill').style.width=Math.min(x.pass_percent,100)+'%';$('barFill').style.background=x.status.key==='good'?'var(--green)':x.status.key==='bad'?'var(--red)':'var(--yellow)';updateGaugeMeta(x);$('financeCards').innerHTML=card('Bruto total',brl(x.total_gross),'info')+card('Despesas totais',brl(x.total_expenses),'bad')+card('Líquido real',brl(x.net_real),moneyClass(x.net_real))+card('Margem líquida',pct(x.margin_real_percent),x.margin_real_percent>=60?'good':'warning')+card('Líquido sem km',brl(x.net_simple))+card('Líquido com km',brl(x.net_with_km))+card('Outras despesas',brl(x.extra_expenses),'bad')+card('Líquido por hora',brl(x.net_per_hour),x.net_per_hour>=25?'good':'warning');renderWalletCards(s);$('operationCards').innerHTML=card('Corridas',x.total_rides)+card('KM rodado',km(x.total_km))+card('KM/corrida',km(x.average_km_per_ride))+card('Média/corrida',brl(x.average_per_ride))+card('Bruto por km',brl(x.gross_per_km),'info')+card('Líquido por km',brl(x.net_per_km),x.net_per_km>=1?'good':'warning')+card('Bruto por hora',brl(x.gross_per_hour),'info')+card('Corridas por hora',x.rides_per_hour);$('costCards').innerHTML=card('KM inicial',od(x.start_odometer))+card('KM vindo das corridas',km(x.total_km),'info')+card('Custo km',brl(x.km_cost),'bad')+card('Custo total %',pct(x.total_cost_percent),x.total_cost_percent<35?'good':'warning')+card('Passe',brl(s.pass_price))+card('Passe por corrida',brl(x.total_rides?num(s.pass_price)/x.total_rides:0))+card('Custo por corrida',brl(x.cost_per_ride),'warning')+card('Falta p/ 15%',brl(x.missing_15));$('activeInfo').innerHTML=`<span class="badge good">VIGENTE</span> ${s.platform} • Passe ${s.pass_type}h de <b>${brl(s.pass_price)}</b> • início <b>${fmtDate(s.started_at)}</b> • fim <b>${fmtDate(s.ended_at)}</b> • tempo restante <b>${leftTime(s)}</b> • custo/km <b>${brl(s.cost_per_km)}</b>`;renderEntries(s);renderExpenses(s);drawAllCharts(s)}
function renderWalletCards(s){const box=$('walletCards');if(!box)return;const x=s.summary;if(!x.wallet_has_value){box.innerHTML=card('Carteira não informada','Atualizar','warning')+card('Líquido real',brl(x.net_real),moneyClass(x.net_real))+card('Movimento carteira','-')+card('Diferença','-');return}box.innerHTML=card('Carteira informada',brl(x.wallet_balance),'info')+card('Carteira projetada',brl(x.wallet_projected),moneyClass(x.wallet_projected))+card('Movimento após ajuste',brl(x.wallet_delta),moneyClass(x.wallet_delta))+card('Diferença carteira x líquido',brl(x.wallet_gap_vs_net),Math.abs(num(x.wallet_gap_vs_net))<=5?'good':'warning')+card('Entradas na carteira',brl(x.wallet_entries),'info')+card('Saídas da carteira',brl(x.wallet_expenses),'bad')+card('Atualizado em',fmtDate(x.wallet_updated_at))+card('Líquido real',brl(x.net_real),moneyClass(x.net_real))}
function renderEntries(s){const list=$('entriesList');if(!list)return;if(!s.entries?.length){list.innerHTML='<p class="hint">Nenhum ganho lançado.</p>';return}list.innerHTML=s.entries.map(e=>`<div class="item"><div><b>${brl(e.amount)}</b><div class="hint">${fmtDate(e.created_at)} • ${e.rides_count} corrida(s) • trecho ${km(e.km_delta)} • ${yesWallet(e.affects_wallet)?'somou na carteira':'não somou na carteira'}</div><div class="hint">${e.note||''}</div></div><button class="danger-btn" onclick="deleteEntry(${e.id})">Excluir</button></div>`).join('')}
function renderExpenses(s){const list=$('expensesList');if(!list)return;if(!s.expenses?.length){list.innerHTML='<p class="hint">Nenhuma despesa lançada.</p>';return}list.innerHTML=s.expenses.map(e=>`<div class="item"><div><b>${e.category}: ${brl(e.amount)}</b><div class="hint">${fmtDate(e.created_at)} • ${yesWallet(e.affects_wallet)?'descontou da carteira':'só no lucro, não descontou da carteira'}</div><div class="hint">${e.note||''}</div></div><button class="danger-btn" onclick="deleteExpense(${e.id})">Excluir</button></div>`).join('')}
function renderSmartDashboards(){renderDayDash();renderWeekDash();renderMonthDash()}

function renderDayDash(){
  const today=startOfDay(new Date()),tomorrow=addDays(today,1),now=new Date(),yDay=addDays(today,-1),ySame=new Date(yDay.getTime()+(now-today)),refDay=addDays(today,-7),refNext=addDays(refDay,1),refSame=new Date(refDay.getTime()+(now-today));
  const m=metrics(today,tomorrow),yNow=metrics(yDay,ySame),yFull=metrics(yDay,today),pSame=metrics(refDay,refSame),pFull=metrics(refDay,refNext),proj=projection(m,today,tomorrow),wd=weekNames[today.getDay()];
  
  // Cálculo dos melhores horários baseado em TODOS os dados da semana anterior (últimos 7 dias)
  const prevWeekStart = addDays(today, -7);
  const prevWeekEnd = today;
  const prevWeekEntries = flatEntries().filter(e => {
    const c = String(e.created_at || '');
    return c >= dateTimeKey(prevWeekStart) && c < dateTimeKey(prevWeekEnd);
  });
  const prevWeekHourMap = Array.from({length: 24}, (_, h) => ({ hour: h, gross: 0, rides: 0, km: 0, count: 0 }));
  prevWeekEntries.forEach(e => {
    const h = Math.max(0, Math.min(23, e.hour || 0));
    prevWeekHourMap[h].gross += num(e.amount);
    prevWeekHourMap[h].rides += num(e.rides_count);
    prevWeekHourMap[h].km += num(e.km_delta);
    prevWeekHourMap[h].count++;
  });
  const prevWeekBest = prevWeekHourMap.filter(x => x.gross > 0).sort((a, b) => b.gross - a.gross).slice(0, 6);

  // Previsão Inteligente para o Final do Dia (Realizado hoje + Média das horas restantes de ontem e mesmo dia da semana anterior)
  const curHour = new Date().getHours();
  
  const yRemainingGross = yFull.entries.filter(e => e.hour >= curHour).reduce((sum, e) => sum + num(e.amount), 0);
  const yRemainingNet = yFull.entries.filter(e => e.hour >= curHour).reduce((sum, e) => sum + num(e.amount) - num(e.km_delta) * num(e.cost_per_km, 0.81), 0);

  const pRemainingGross = pFull.entries.filter(e => e.hour >= curHour).reduce((sum, e) => sum + num(e.amount), 0);
  const pRemainingNet = pFull.entries.filter(e => e.hour >= curHour).reduce((sum, e) => sum + num(e.amount) - num(e.km_delta) * num(e.cost_per_km, 0.81), 0);

  const avgRemainingGross = (yRemainingGross + pRemainingGross) / 2;
  const avgRemainingNet = (yRemainingNet + pRemainingNet) / 2;

  const closeGrossForecast = m.gross + avgRemainingGross;
  const closeNetForecast = m.net + avgRemainingNet;

  $('dayScore').textContent=statScore(m);
  $('daySummaryText').textContent='Hoje comparado com ontem e com a '+wd+' passada. Previsão de fechamento baseada no histórico restante.';
  
  $('dayCards').innerHTML=
    card('Bruto hoje',brl(m.gross),'info','ontem até agora: '+brl(yNow.gross)+' • '+wd+' passada: '+brl(pSame.gross)) +
    card('Líquido hoje',brl(m.net),moneyClass(m.net),'ontem até agora: '+brl(yNow.net)+' • '+wd+' passada: '+brl(pSame.net)) +
    card('Diferença vs ontem',signedMoney(m.gross-yNow.gross),changeClass(m.gross,yNow.gross),changeText(m.gross,yNow.gross)+' no bruto') +
    card('Diferença vs semana passada',signedMoney(m.gross-pSame.gross),changeClass(m.gross,pSame.gross),changeText(m.gross,pSame.gross)+' no bruto') +
    card('Previsão Bruto (Final)',brl(closeGrossForecast),'purple',`com base nas próximas ${24 - curHour}h`) +
    card('Previsão Líquido (Final)',brl(closeNetForecast),moneyClass(closeNetForecast),`com base nas próximas ${24 - curHour}h`) +
    card('Ontem dia cheio',brl(yFull.gross),'purple','bruto total de ontem') +
    card(wd+' passada dia cheio',brl(pFull.gross),'purple','bruto total da referência') +
    card('Corridas hoje',m.rides,changeClass(m.rides,yNow.rides),'ontem: '+yNow.rides+' • '+wd+' passada: '+pSame.rides) +
    card('KM hoje',km(m.km),changeClass(m.km,yNow.km),'ontem: '+km(yNow.km)+' • '+wd+' passada: '+km(pSame.km)) +
    card('R$/km líquido',brl(m.netPerKm),m.netPerKm>=1?'good':'warning','ontem: '+brl(yNow.netPerKm)+' • sem. passada: '+brl(pSame.netPerKm)) +
    card('Horas com corrida',m.activeHours,'info','ontem: '+yNow.activeHours+' • sem. passada: '+pSame.activeHours);

  const yHours=byHour(yFull),refHours=byHour(pFull);
  
  drawBarSeries('dayHourlyChart',refHours.map(x=>hourLabel(x.hour)),refHours.map(x=>x.gross),'Referência por horário: '+wd+' passada');
  drawCompareBars('dayCompareChart',['Bruto','Líquido','Corridas','KM'],[m.gross,m.net,m.rides,m.km],[yNow.gross,yNow.net,yNow.rides,yNow.km]);
  
  // Lista os melhores horários calculados a partir dos dados consolidados da semana anterior
  renderList('dayBestHours',
    prevWeekBest.map(h=>rowItem(
      hourLabel(h.hour)+' • '+brl(h.gross),
      `média na semana anterior: ${h.rides} corrida(s) • ${km(h.km)}`,
      'good'
    )).join(''),
    'Sem dados suficientes da semana anterior.'
  );

  // Lista o detalhamento da previsão para o final do dia
  renderList('dayPeakForecast',
    rowItem(`Previsão Bruto Final do Dia`, brl(closeGrossForecast), 'info') +
    rowItem(`Previsão Líquido Final do Dia`, brl(closeNetForecast), moneyClass(closeNetForecast)) +
    rowItem(`Garantido até agora`, `${brl(m.gross)} bruto • ${brl(m.net)} líquido`, 'good') +
    rowItem(`Horas restantes (${24 - curHour}h)`, `+${brl(avgRemainingGross)} bruto esperado baseado no histórico`, 'purple'),
    'Sem dados para calcular previsão.'
  );

  renderList('dayInsights',
    progressLine('Bruto vs ontem',m.gross,yNow.gross)+
    progressLine('Bruto vs '+wd+' passada',m.gross,pSame.gross)+
    progressLine('Líquido vs ontem',m.net,yNow.net)+
    progressLine('Líquido vs '+wd+' passada',m.net,pSame.net)+
    progressLine('Corridas vs ontem',m.rides,yNow.rides,'num')+
    progressLine('KM vs ontem',m.km,yNow.km,'km')+
    rowItem('Leitura',yFull.gross||pFull.gross?'Use ontem para ajuste curto e a '+wd+' passada para prever padrão real do dia da semana.':'Ainda há pouca base. Conforme você usar o app, a previsão fica melhor.')
  );
}
function renderWeekDash(){const start=startOfWeek(new Date()),end=addDays(start,7),prevStart=addDays(start,-7),now=new Date(),prevSame=new Date(prevStart.getTime()+(now-start)),m=metrics(start,end),pSame=metrics(prevStart,prevSame),proj=projection(m,start,end);$('weekScore').textContent=statScore(m);$('weekSummaryText').textContent='Semana atual x semana passada no mesmo ponto.';$('weekCards').innerHTML=card('Bruto semana',brl(m.gross),'info','semana passada até agora: '+brl(pSame.gross))+card('Líquido semana',brl(m.net),moneyClass(m.net),'semana passada até agora: '+brl(pSame.net))+card('Diferença bruto',signedMoney(m.gross-pSame.gross),changeClass(m.gross,pSame.gross),changeText(m.gross,pSame.gross))+card('Diferença líquido',signedMoney(m.net-pSame.net),changeClass(m.net,pSame.net),changeText(m.net,pSame.net))+card('Corridas',m.rides,changeClass(m.rides,pSame.rides),'passada: '+pSame.rides)+card('KM',km(m.km),changeClass(m.km,pSame.km),'passada: '+km(pSame.km))+card('Projeção bruto semana',brl(proj.gross),'purple','ritmo atual')+card('Projeção líquido semana',brl(proj.net),moneyClass(proj.net),'ritmo atual');const days=byDay(start,7);drawBarSeries('weekDaysChart',days.map(d=>d.label),days.map(d=>d.gross),'Bruto por dia');drawCompareBars('weekCompareChart',['Bruto','Líquido','Corridas','KM'],[m.gross,m.net,m.rides,m.km],[pSame.gross,pSame.net,pSame.rides,pSame.km]);renderList('weekBestDays',[...days].sort((a,b)=>b.gross-a.gross).filter(d=>d.gross>0).slice(0,7).map(d=>rowItem(d.label+' • '+brl(d.gross),'líquido '+brl(d.net)+' • '+d.rides+' corrida(s) • '+km(d.km),'good')).join(''),'Sem corridas nesta semana.');renderList('weekBestHours',topHours(byHour(m),8).map(h=>rowItem(hourLabel(h.hour)+' • '+brl(h.gross),h.rides+' corrida(s) • '+km(h.km),'info')).join(''),'Sem horário forte nesta semana.');renderList('weekInsights',progressLine('Bruto semanal parcial',m.gross,pSame.gross)+progressLine('Líquido semanal parcial',m.net,pSame.net)+progressLine('Corridas semanais',m.rides,pSame.rides,'num')+progressLine('KM semanal',m.km,pSame.km,'km'))}
function renderMonthDash(){const start=startOfMonth(new Date()),end=addMonths(start,1),prevStart=addMonths(start,-1),now=new Date(),prevSame=new Date(prevStart.getTime()+(now-start)),m=metrics(start,end),pSame=metrics(prevStart,prevSame),proj=projection(m,start,end);$('monthScore').textContent=statScore(m);$('monthSummaryText').textContent='Mês atual x mês passado no mesmo ponto.';$('monthCards').innerHTML=card('Bruto mês',brl(m.gross),'info','mês passado até agora: '+brl(pSame.gross))+card('Líquido mês',brl(m.net),moneyClass(m.net),'mês passado até agora: '+brl(pSame.net))+card('Diferença bruto',signedMoney(m.gross-pSame.gross),changeClass(m.gross,pSame.gross),changeText(m.gross,pSame.gross))+card('Diferença líquido',signedMoney(m.net-pSame.net),changeClass(m.net,pSame.net),changeText(m.net,pSame.net))+card('Corridas',m.rides,changeClass(m.rides,pSame.rides),'passado: '+pSame.rides)+card('KM',km(m.km),changeClass(m.km,pSame.km),'passado: '+km(pSame.km))+card('Projeção bruto mês',brl(proj.gross),'purple','ritmo atual')+card('Projeção líquido mês',brl(proj.net),moneyClass(proj.net),'ritmo atual');const days=byDay(start,Math.round((end-start)/86400000));drawBarSeries('monthDaysChart',days.map(d=>d.label),days.map(d=>d.gross),'Bruto por dia');drawCompareBars('monthCompareChart',['Bruto','Líquido','Corridas','KM'],[m.gross,m.net,m.rides,m.km],[pSame.gross,pSame.net,pSame.rides,pSame.km]);renderList('monthBestDays',[...days].sort((a,b)=>b.gross-a.gross).filter(d=>d.gross>0).slice(0,10).map(d=>rowItem(d.label+' • '+brl(d.gross),'líquido '+brl(d.net)+' • '+d.rides+' corrida(s) • '+km(d.km),'good')).join(''),'Sem corridas neste mês.');renderList('monthBestHours',topHours(byHour(m),10).map(h=>rowItem(hourLabel(h.hour)+' • '+brl(h.gross),h.rides+' corrida(s) • '+km(h.km),'info')).join(''),'Sem horário forte neste mês.');renderList('monthInsights',progressLine('Bruto mensal parcial',m.gross,pSame.gross)+progressLine('Líquido mensal parcial',m.net,pSame.net)+progressLine('Corridas mensais',m.rides,pSame.rides,'num')+progressLine('KM mensal',m.km,pSame.km,'km'))}

function openQuickModal(mode='entry'){const s=sessions.find(x=>x.id===activeSessionId)||openSession();if(!s){showError('Crie ou abra um passe vigente antes de lançar entrada/despesa.');showTab('dashboard');return}activeSessionId=s.id;localStorage.setItem('activeSessionId',activeSessionId);setQuickMode(mode);const m=$('quickModal');if(m){m.classList.add('show');m.setAttribute('aria-hidden','false')}setQuickDefaults()}
function closeQuickModal(){const m=$('quickModal');if(m){m.classList.remove('show');m.setAttribute('aria-hidden','true')}}
function modalBackdropClick(e){if(e.target?.id==='quickModal')closeQuickModal()}
function setQuickMode(mode){quickMode=mode==='expense'?'expense':mode==='wallet'?'wallet':'entry';document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===quickMode));const entry=$('quickEntryForm'),expense=$('quickExpenseForm'),wallet=$('quickWalletForm');if(entry)entry.style.display=quickMode==='entry'?'block':'none';if(expense)expense.style.display=quickMode==='expense'?'block':'none';if(wallet)wallet.style.display=quickMode==='wallet'?'block':'none';const title=$('quickModalTitle'),hint=$('quickModalHint');if(title)title.textContent=quickMode==='entry'?'Adicionar entrada':quickMode==='expense'?'Adicionar despesa':'Atualizar carteira';if(hint)hint.textContent=quickMode==='entry'?'Entrada manual com KM opcional. O MacroDroid já envia o KM automático.':quickMode==='expense'?'Escolha se a despesa saiu da carteira ou se é só ajuste de lucro.':'Informe quanto você tem na carteira agora para recalibrar o controle.'}
function setQuickDefaults(){if($('entryTime')&&!$('entryTime').value)$('entryTime').value=nowLocal();if($('expenseTime')&&!$('expenseTime').value)$('expenseTime').value=nowLocal();if($('walletTime'))$('walletTime').value=nowLocal();if(quickMode==='wallet'){const s=sessions.find(x=>x.id===activeSessionId);if(s&&$('walletAmount'))$('walletAmount').value=s.summary?.wallet_has_value?num(s.summary.wallet_projected).toFixed(2):''}setTimeout(()=>{const target=quickMode==='entry'?'entryAmount':quickMode==='expense'?'expenseAmount':'walletAmount';$(target)?.focus()},80)}
async function addEntry(){try{const body={amount:Number($('entryAmount').value),rides_count:Number($('entryRides').value||1),km:Number($('entryKm')?.value||0),current_odometer:0,affects_wallet:$('entryAffectsWallet')?.checked!==false,created_at:$('entryTime').value||nowLocal(),note:(($('entryRideType')?`[${$('entryRideType').value}] `:'')+($('entryNote').value||'')).trim()};await api(`/api/sessions/${activeSessionId}/entries`,{method:'POST',body:JSON.stringify(body)});$('entryAmount').value='';$('entryRides').value='1';if($('entryKm'))$('entryKm').value='';$('entryTime').value=nowLocal();$('entryNote').value='';closeQuickModal();loadData()}catch(e){showError(e.message)}}
async function addExpense(){try{const body={category:$('expenseCategory').value,amount:Number($('expenseAmount').value),affects_wallet:$('expenseAffectsWallet')?.checked!==false,created_at:$('expenseTime').value||nowLocal(),note:$('expenseNote').value};await api(`/api/sessions/${activeSessionId}/expenses`,{method:'POST',body:JSON.stringify(body)});$('expenseAmount').value='';$('expenseTime').value=nowLocal();$('expenseNote').value='';if($('expenseAffectsWallet'))$('expenseAffectsWallet').checked=true;closeQuickModal();loadData()}catch(e){showError(e.message)}}
async function saveWallet(){try{const amount=Number($('walletAmount').value);if(!Number.isFinite(amount)||amount<0)throw new Error('Informe um valor válido para a carteira');await api(`/api/sessions/${activeSessionId}/wallet`,{method:'POST',body:JSON.stringify({wallet_balance:amount,wallet_updated_at:$('walletTime').value||nowLocal()})});closeQuickModal();loadData()}catch(e){showError(e.message)}}
async function deleteEntry(id){if(confirm('Excluir lançamento?')){await api(`/api/entries/${id}`,{method:'DELETE'});loadData()}}
async function deleteExpense(id){if(confirm('Excluir despesa?')){await api(`/api/expenses/${id}`,{method:'DELETE'});loadData()}}
async function deleteSession(id){if(confirm('Excluir passe inteiro?')){await api(`/api/sessions/${id}`,{method:'DELETE'});if(activeSessionId===id)activeSessionId=0;loadData()}}
function openHistorySession(id){activeSessionId=id;localStorage.setItem('activeSessionId',id);dashboardMode='pass';localStorage.setItem('dashboardMode','pass');renderDashboard();showTab('dashboard')}
function filteredSessions(){const today=new Date().toISOString().slice(0,10),month=today.slice(0,7),cut=Date.now()-7*86400000;return sessions.filter(s=>historyFilter==='today'?s.started_at.slice(0,10)===today:historyFilter==='month'?s.started_at.slice(0,7)===month:historyFilter==='7'?new Date(s.started_at).getTime()>=cut:true)}
function renderHistory(){const body=$('historyBody');if(!body)return;const list=filteredSessions();body.innerHTML=list.map(s=>{const x=s.summary,expired=isExpired(s);return `<tr><td>${fmtDate(s.started_at)}</td><td class="${expired?'bad':'good'}">${expired?'Expirado':'Vigente'}</td><td>${s.pass_type}h</td><td>${brl(x.total_gross)}</td><td>${km(x.total_km)}</td><td>${x.total_rides}</td><td>${brl(x.total_expenses)}</td><td>${brl(x.net_real)}</td><td>${x.wallet_has_value?brl(x.wallet_projected):'-'}</td><td>${brl(x.net_per_km)}</td><td>${brl(x.net_per_hour)}</td><td>${pct(x.margin_real_percent)}</td><td class="${x.status.key}">${x.status.label}</td><td><button class="ghost" onclick="openHistorySession(${s.id})">Abrir</button> <button class="danger-btn" onclick="deleteSession(${s.id})">Excluir</button></td></tr>`}).join('')||'<tr><td colspan="14">Sem dados.</td></tr>'}
async function loadReport(period='daily',silent=false){currentReport=period;try{const rows=await api(`/api/reports?period=${period}`);$('reportTitle').textContent={daily:'Resumo diário',weekly:'Resumo semanal',monthly:'Resumo mensal'}[period];$('reportBody').innerHTML=rows.map(r=>`<tr><td>${r.period}</td><td>${r.sessions_count}</td><td>${brl(r.total_gross)}</td><td>${km(r.total_km)}</td><td>${r.total_rides}</td><td>${brl(r.total_expenses)}</td><td>${brl(r.total_net_real)}</td><td>${brl(r.net_per_km)}</td><td>${brl(r.net_per_hour)}</td><td>${pct(r.margin_real_percent)}</td><td class="${r.status.key}">${r.status.label}</td></tr>`).join('')||'<tr><td colspan="11">Sem dados.</td></tr>'}catch(e){if(!silent)showError(e.message)}}

function drawRoundedRect(g, x, y, w, h, r, fill, stroke) {
  if (w <= 0 || h <= 0) return;
  if (r > w / 2) r = w / 2;
  if (r > h / 2) r = h / 2;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.stroke(); }
}

function ctx(id){
  const c=$(id);
  if(!c)return null;
  const dpr=window.devicePixelRatio||1,w=c.clientWidth||360,h=c.height||220;
  c.width=w*dpr;
  c.height=h*dpr;
  const g=c.getContext('2d');
  g.scale(dpr,dpr);
  g.clearRect(0,0,w,h);
  g.font='bold 11px Outfit, sans-serif';
  return{g,w,h};
}

function colors(){
  return['#38bdf8','#22c55e','#f59e0b','#a78bfa','#ef4444','#fb7185','#14b8a6','#eab308'];
}

function drawAllCharts(s){
  drawGauge('gaugeChart',s.summary.pass_percent);
  drawDonut('donutChart',s);
  drawLine('lineChart',s);
  drawBars('barChart',s);
  drawExpenses('expenseChart',s);
}

function drawGauge(id,value){
  const c=ctx(id);
  if(!c)return;
  const {g,w,h}=c,cx=w/2,cy=h-8,r=Math.min(w/2-22,h-16,116),thickness=Math.max(10,Math.min(15,r*.17));
  g.lineCap='round';
  g.lineWidth=thickness;
  [['#22c55e',0,.15],['#f59e0b',.15,.25],['#ef4444',.25,1]].forEach(([color,a,b])=>{
    g.strokeStyle=color;
    g.beginPath();
    g.arc(cx,cy,r,Math.PI+a*Math.PI,Math.PI+b*Math.PI);
    g.stroke();
  });
  const v=Math.max(0,Math.min(value/100,1)),angle=Math.PI+v*Math.PI;
  g.strokeStyle='rgba(255,255,255,.95)';
  g.lineWidth=3;
  g.beginPath();
  g.moveTo(cx,cy);
  g.lineTo(cx+Math.cos(angle)*(r-9),cy+Math.sin(angle)*(r-9));
  g.stroke();
  
  g.fillStyle='#111827';
  g.beginPath();
  g.arc(cx,cy,8,0,Math.PI*2);
  g.fill();
  g.strokeStyle='#f8fafc';
  g.lineWidth=2;
  g.stroke();
}

function drawDonut(id,s){
  const c=ctx(id);
  if(!c)return;
  const {g,w,h}=c,x=s.summary,vals=[x.net_real,x.km_cost,x.extra_expenses,num(s.pass_price)].map(v=>Math.max(v,0)),labels=['Líquido','Custo km','Despesas','Passe'],sum=vals.reduce((a,b)=>a+b,0)||1,cs=colors();
  let a=-Math.PI/2;
  const r=Math.min(w,h)/4.5,cx=w/2+40,cy=h/2;
  vals.forEach((v,i)=>{
    const ang=v/sum*2*Math.PI;
    g.fillStyle=cs[i];
    g.beginPath();
    g.moveTo(cx,cy);
    g.arc(cx,cy,r,a,a+ang);
    g.closePath();
    g.fill();
    a+=ang;
  });
  g.fillStyle='#111827';
  g.beginPath();
  g.arc(cx,cy,r*.55,0,7);
  g.fill();
  labels.forEach((l,i)=>{
    g.fillStyle=cs[i];
    drawRoundedRect(g,12,18+i*24,12,12,3,cs[i]);
    g.fillStyle='#f8fafc';
    g.font='bold 11px Outfit, sans-serif';
    g.fillText(`${l}: ${brl(vals[i])}`,30,29+i*24);
  });
}

function drawLine(id,s){
  const c=ctx(id);
  if(!c)return;
  const {g,w,h}=c,entries=[...(s.entries||[])].reverse();
  if(!entries.length){
    g.fillStyle='#9ca3af';
    g.fillText('Sem lançamentos',20,30);
    return;
  }
  let acc=0;
  const pts=entries.map((e,i)=>{
    acc+=num(e.amount);
    return{x:35+i*Math.max((w-65)/(entries.length-1||1),1),y:h-30-(acc/(s.summary.total_gross||1))*(h-60)};
  });
  
  const grad = g.createLinearGradient(0,10,0,h-30);
  grad.addColorStop(0,'rgba(56,189,248,0.25)');
  grad.addColorStop(1,'rgba(56,189,248,0.00)');
  g.fillStyle=grad;
  g.beginPath();
  g.moveTo(pts[0].x,h-30);
  pts.forEach(p=>g.lineTo(p.x,p.y));
  g.lineTo(pts[pts.length-1].x,h-30);
  g.closePath();
  g.fill();
  
  g.strokeStyle='rgba(255,255,255,0.08)';
  g.lineWidth=1;
  g.beginPath();
  g.moveTo(35,10);g.lineTo(35,h-30);g.lineTo(w-10,h-30);
  g.stroke();
  
  g.strokeStyle='#38bdf8';
  g.lineWidth=3;
  g.beginPath();
  pts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));
  g.stroke();
  
  pts.forEach(p=>{
    g.fillStyle='#f8fafc';
    g.beginPath();
    g.arc(p.x,p.y,3.5,0,Math.PI*2);
    g.fill();
    g.strokeStyle='#0b1120';
    g.lineWidth=1.5;
    g.stroke();
  });
  
  g.fillStyle='#f8fafc';
  g.font='bold 11px Outfit, sans-serif';
  g.fillText('Bruto acumulado',38,22);
}

function drawBars(id,s){
  const c=ctx(id);
  if(!c)return;
  const {g,w,h}=c,entries=[...(s.entries||[])].reverse(),cs=colors();
  if(!entries.length){
    g.fillStyle='#9ca3af';
    g.fillText('Sem lançamentos',20,30);
    return;
  }
  const max=Math.max(...entries.map(e=>num(e.amount)),1),bw=(w-50)/entries.length;
  entries.forEach((e,i)=>{
    const bh=num(e.amount)/max*(h-50);
    const barWidth = Math.max(bw-6,4);
    const x = 30+i*bw;
    const y = h-25-bh;
    drawRoundedRect(g,x,y,barWidth,bh,4,cs[i%cs.length]);
  });
  g.fillStyle='#f8fafc';
  g.font='bold 11px Outfit, sans-serif';
  g.fillText('Ganho por lançamento',30,18);
}

function drawExpenses(id,s){
  const c=ctx(id);
  if(!c)return;
  const {g,w,h}=c,cats=s.summary.expenses_by_category||{},items=Object.entries(cats),cs=colors();
  if(!items.length){
    g.fillStyle='#9ca3af';
    g.fillText('Sem despesas extras',20,30);
    return;
  }
  const max=Math.max(...items.map(x=>x[1]),1);
  items.forEach(([name,val],i)=>{
    const y=24+i*28,bar=Math.max(0,(w-170)*(val/max));
    drawRoundedRect(g,120,y-12,bar,16,4,cs[i%cs.length]);
    g.fillStyle='#f8fafc';
    g.font='bold 11px Outfit, sans-serif';
    g.fillText(name,10,y);
    g.fillText(brl(val),125+bar,y);
  });
}

function drawBarSeries(id,labels,values,title=''){
  const c=ctx(id);
  if(!c)return;
  const {g,w,h}=c,cs=colors(),max=Math.max(...values.map(num),1),bw=(w-50)/(values.length||1);
  g.fillStyle='#f8fafc';
  g.font='bold 11px Outfit, sans-serif';
  g.fillText(title,30,18);
  values.forEach((v,i)=>{
    const bh=num(v)/max*(h-58);
    const barWidth = Math.max(bw-5,3);
    const x = 30+i*bw;
    const y = h-28-bh;
    drawRoundedRect(g,x,y,barWidth,bh,3,cs[i%cs.length]);
    if(values.length<=12){
      g.fillStyle='#94a3b8';
      g.font='bold 9px Outfit, sans-serif';
      g.fillText(labels[i],30+i*bw,h-8);
    }
  });
}

function drawCompareBars(id,labels,cur,prev){
  const c=ctx(id);
  if(!c)return;
  const {g,w,h}=c,max=Math.max(...cur.map(num),...prev.map(num),1),groupW=(w-50)/(labels.length||1);
  g.fillStyle='#f8fafc';
  g.font='bold 11px Outfit, sans-serif';
  g.fillText('Atual x referência',30,18);
  labels.forEach((l,i)=>{
    const x=30+i*groupW,cv=num(cur[i]),pv=num(prev[i]),ch=cv/max*(h-60),ph=pv/max*(h-60);
    const barW = Math.max(groupW*.32,8);
    drawRoundedRect(g,x,h-28-ch,barW,ch,3,'#38bdf8');
    drawRoundedRect(g,x+Math.max(groupW*.36,12),h-28-ph,barW,ph,3,'#f59e0b');
    g.fillStyle='#94a3b8';
    g.font='bold 10px Outfit, sans-serif';
    g.fillText(l,x,h-8);
  });
  g.fillStyle='#38bdf8';
  g.fillText('Atual',w-105,18);
  g.fillStyle='#f59e0b';
  g.fillText('Referência',w-60,18);
}
async function boot(){if($('newStart'))$('newStart').value=nowLocal();if($('entryTime'))$('entryTime').value=nowLocal();if($('expenseTime'))$('expenseTime').value=nowLocal();if($('walletTime'))$('walletTime').value=nowLocal();try{const h=await fetch('/api/health').then(r=>r.json());if(h.pin_required&&!localStorage.getItem('appPin'))showLogin();await loadData();setInterval(()=>{renderDashboard();renderNewWarning()},60000)}catch(e){showError('Erro ao carregar servidor.')}}
boot();
