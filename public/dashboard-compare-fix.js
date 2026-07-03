function dateTimeKeyLocalDashboard(d){
  const x = new Date(d);
  const p = v => String(v).padStart(2, '0');
  return x.getFullYear() + '-' + p(x.getMonth()+1) + '-' + p(x.getDate()) + 'T' + p(x.getHours()) + ':' + p(x.getMinutes());
}

function rangeKeys(start, end){
  return {
    start: dateTimeKeyLocalDashboard(start),
    end: dateTimeKeyLocalDashboard(end)
  };
}

setTimeout(function(){
  if(typeof renderDashboard === 'function') renderDashboard();
}, 500);

setTimeout(function(){
  if(typeof renderDashboard === 'function') renderDashboard();
}, 1500);
