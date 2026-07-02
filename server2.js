const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;
const APP_PIN = process.env.APP_PIN || '';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const n = (v, d = 0) => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : d; };
const i = (v, d = 0) => { const x = parseInt(v, 10); return Number.isFinite(x) ? x : d; };
const r = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100;
const yn = (v, d = true) => v === undefined || v === null || v === '' ? d : !(v === false || v === 'false' || v === 0 || v === '0');
const now = () => { const d = new Date(), p = x => String(x).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const addh = (t,h) => { const d = new Date(t); d.setHours(d.getHours()+h); const p=x=>String(x).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const guard = (req,res,next) => (!APP_PIN || req.header('x-app-pin') === APP_PIN) ? next() : res.status(401).json({error:'PIN invalido'});

async function q(sql, params=[]) { return (await pool.query(sql, params)).rows; }
async function one(sql, params=[]) { return (await pool.query(sql, params)).rows[0]; }

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions(
      id BIGSERIAL PRIMARY KEY,
      platform TEXT DEFAULT 'Uber',
      pass_type INTEGER DEFAULT 24,
      pass_price NUMERIC(12,2) DEFAULT 0,
      cost_per_km NUMERIC(12,2) DEFAULT 0.81,
      start_odometer NUMERIC(12,2) DEFAULT 0,
      wallet_balance NUMERIC(12,2) DEFAULT 0,
      wallet_updated_at TEXT DEFAULT '',
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entries(
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT REFERENCES sessions(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) DEFAULT 0,
      rides_count INTEGER DEFAULT 0,
      km NUMERIC(12,2) DEFAULT 0,
      current_odometer NUMERIC(12,2) DEFAULT 0,
      affects_wallet BOOLEAN DEFAULT true,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expenses(
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT REFERENCES sessions(id) ON DELETE CASCADE,
      category TEXT DEFAULT 'Outros',
      amount NUMERIC(12,2) DEFAULT 0,
      affects_wallet BOOLEAN DEFAULT true,
      affects_profit BOOLEAN DEFAULT true,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS start_odometer NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS wallet_updated_at TEXT DEFAULT '';
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS current_odometer NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS affects_wallet BOOLEAN DEFAULT true;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS affects_wallet BOOLEAN DEFAULT true;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS affects_profit BOOLEAN DEFAULT true;
  `);
}

function stat(p,g){ if(!g) return {key:'empty',label:'Sem ganho'}; if(p>25) return {key:'bad',label:'Pesado demais'}; if(p>20) return {key:'warning',label:'Ainda pesado'}; if(p>15) return {key:'limit',label:'No limite'}; return {key:'good',label:'Saudavel'}; }
function elapsed(s){ const a = new Date(s.started_at), b = new Date(s.ended_at), c = new Date(); return Math.max(((c>b?b:c)-a)/3600000,0); }
function affectsWallet(row){ return row.affects_wallet !== false && row.affects_wallet !== 'false'; }
function isFuelCategory(category=''){ return /combust|gasolina|etanol|gnv|abastec/i.test(String(category)); }
function affectsProfit(row){ return !isFuelCategory(row.category) && row.affects_profit !== false && row.affects_profit !== 'false'; }
function afterWalletStamp(row, stamp){ return !!stamp && !!row.created_at && String(row.created_at) > String(stamp); }

async function build(s){
  const raw = await q('SELECT * FROM entries WHERE session_id=$1 ORDER BY created_at ASC,id ASC',[s.id]);
  const expenses = await q('SELECT * FROM expenses WHERE session_id=$1 ORDER BY created_at DESC,id DESC',[s.id]);
  let prev=n(s.start_odometer), latest=0;
  const entries=raw.map(e=>{
    const cur=n(e.current_odometer);
    let delta=n(e.km);
    if(prev>0 && cur>=prev) delta=cur-prev;
    if(cur>0){prev=cur;latest=cur;}
    return {...e,km_delta:r(delta)};
  });
  const gross=entries.reduce((a,e)=>a+n(e.amount),0);
  const rides=entries.reduce((a,e)=>a+i(e.rides_count),0);
  const kmTotal=n(s.start_odometer)>0 && latest>=n(s.start_odometer) ? latest-n(s.start_odometer) : entries.reduce((a,e)=>a+n(e.km_delta),0);
  const profitExpenses = expenses.filter(affectsProfit);
  const walletOnlyExpenses = expenses.filter(e=>!affectsProfit(e) && affectsWallet(e)).reduce((a,e)=>a+n(e.amount),0);
  const pass=n(s.pass_price), kmCost=kmTotal*n(s.cost_per_km,.81), extra=profitExpenses.reduce((a,e)=>a+n(e.amount),0), total=pass+kmCost+extra, net=gross-total, h=elapsed(s), passPct=gross?pass/gross*100:0, meta15=pass?pass/.15:0;
  const cats={};
  profitExpenses.forEach(e=>{ const c=e.category||'Outros'; cats[c]=r((cats[c]||0)+n(e.amount)); });

  const walletUpdatedAt = s.wallet_updated_at || '';
  const walletBase = n(s.wallet_balance);
  const walletEntries = walletUpdatedAt ? entries.reduce((a,e)=> afterWalletStamp(e,walletUpdatedAt) && affectsWallet(e) ? a+n(e.amount) : a, 0) : 0;
  const walletExpenses = walletUpdatedAt ? expenses.reduce((a,e)=> afterWalletStamp(e,walletUpdatedAt) && affectsWallet(e) ? a+n(e.amount) : a, 0) : 0;
  const walletDelta = walletEntries - walletExpenses;
  const walletProjected = walletUpdatedAt ? walletBase + walletDelta : 0;

  const summary={
    total_gross:r(gross),
    total_rides:rides,
    total_km:r(kmTotal),
    start_odometer:r(s.start_odometer),
    latest_odometer:r(latest),
    km_cost:r(kmCost),
    extra_expenses:r(extra),
    wallet_only_expenses:r(walletOnlyExpenses),
    expenses_by_category:cats,
    total_expenses:r(total),
    net_simple:r(gross-pass),
    net_with_km:r(gross-pass-kmCost),
    net_real:r(net),
    pass_percent:r(passPct),
    total_cost_percent:r(gross?total/gross*100:0),
    margin_real_percent:r(gross?net/gross*100:0),
    average_per_ride:r(rides?gross/rides:0),
    average_km_per_ride:r(rides?kmTotal/rides:0),
    gross_per_km:r(kmTotal?gross/kmTotal:0),
    net_per_km:r(kmTotal?net/kmTotal:0),
    cost_per_ride:r(rides?total/rides:0),
    profit_per_ride:r(rides?net/rides:0),
    gross_per_hour:r(h?gross/h:0),
    net_per_hour:r(h?net/h:0),
    rides_per_hour:r(h?rides/h:0),
    elapsed_hours:r(h),
    meta_15:r(meta15),
    missing_15:r(Math.max(meta15-gross,0)),
    wallet_balance:r(walletBase),
    wallet_updated_at:walletUpdatedAt,
    wallet_entries:r(walletEntries),
    wallet_expenses:r(walletExpenses),
    wallet_delta:r(walletDelta),
    wallet_projected:r(walletProjected),
    wallet_gap_vs_net:r(walletUpdatedAt ? walletProjected - net : 0),
    wallet_has_value:!!walletUpdatedAt,
    status:stat(passPct,gross)
  };
  summary.executive_message = gross<=0?'Comece lancando ganhos. O KM das corridas vem do MacroDroid.':passPct>25?'Passe pesado. Aumente o bruto para reduzir o peso.':summary.margin_real_percent<50?'Atencao: despesas pesando no resultado.':'Dia no controle.';
  return {...s,entries:entries.reverse(),expenses,summary};
}

async function all(){ const rows=await q('SELECT * FROM sessions ORDER BY started_at DESC,id DESC'); const out=[]; for(const s of rows) out.push(await build(s)); return out; }

app.get('/api/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,pin_required:!!APP_PIN})}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.post('/api/login',(req,res)=>(!APP_PIN||req.body?.pin===APP_PIN)?res.json({ok:true}):res.status(401).json({error:'PIN invalido'}));
app.get('/api/sessions',guard,async(req,res,next)=>{try{res.json(await all())}catch(e){next(e)}});
app.post('/api/sessions',guard,async(req,res,next)=>{try{const type=i(req.body.pass_type,24)===72?72:24,start=req.body.started_at||now(),end=addh(start,type),stamp=now();const s=await one('INSERT INTO sessions(platform,pass_type,pass_price,cost_per_km,start_odometer,started_at,ended_at,notes,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[req.body.platform||'Uber',type,r(req.body.pass_price),r(n(req.body.cost_per_km,.81)),r(req.body.start_odometer),start,end,req.body.notes||'',stamp,stamp]);res.status(201).json(await build(s))}catch(e){next(e)}});
app.patch('/api/sessions/:id/wallet',guard,async(req,res,next)=>{try{const amount=r(req.body.wallet_balance);if(amount<0)return res.status(400).json({error:'Valor da carteira invalido'});const stamp=req.body.wallet_updated_at||now();const s=await one('UPDATE sessions SET wallet_balance=$1,wallet_updated_at=$2,updated_at=$3 WHERE id=$4 RETURNING *',[amount,stamp,now(),req.params.id]);if(!s)return res.status(404).json({error:'Passe nao encontrado'});res.json(await build(s))}catch(e){next(e)}});
app.post('/api/sessions/:id/wallet',guard,async(req,res,next)=>{try{const amount=r(req.body.wallet_balance);if(amount<0)return res.status(400).json({error:'Valor da carteira invalido'});const stamp=req.body.wallet_updated_at||now();const s=await one('UPDATE sessions SET wallet_balance=$1,wallet_updated_at=$2,updated_at=$3 WHERE id=$4 RETURNING *',[amount,stamp,now(),req.params.id]);if(!s)return res.status(404).json({error:'Passe nao encontrado'});res.json(await build(s))}catch(e){next(e)}});
app.delete('/api/sessions/:id',guard,async(req,res,next)=>{try{await pool.query('DELETE FROM sessions WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});
app.post('/api/sessions/:id/entries',guard,async(req,res,next)=>{try{const s=await one('SELECT * FROM sessions WHERE id=$1',[req.params.id]);if(!s)return res.status(404).json({error:'Passe nao encontrado'});const amount=r(req.body.amount);if(amount<=0)return res.status(400).json({error:'Ganho invalido'});const cur=Math.max(r(req.body.current_odometer),0),last=(await q('SELECT current_odometer FROM entries WHERE session_id=$1 AND current_odometer>0 ORDER BY created_at DESC,id DESC LIMIT 1',[s.id]))[0],lastKm=last?n(last.current_odometer):n(s.start_odometer);if(cur>0&&lastKm>0&&cur<lastKm)return res.status(400).json({error:'KM atual menor que o ultimo informado'});const e=await one('INSERT INTO entries(session_id,amount,rides_count,km,current_odometer,affects_wallet,note,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[s.id,amount,Math.max(i(req.body.rides_count),0),0,cur,yn(req.body.affects_wallet,true),req.body.note||'',req.body.created_at||now()]);res.status(201).json(e)}catch(e){next(e)}});
app.delete('/api/entries/:id',guard,async(req,res,next)=>{try{await pool.query('DELETE FROM entries WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});
app.post('/api/sessions/:id/expenses',guard,async(req,res,next)=>{try{const amount=r(req.body.amount);if(amount<=0)return res.status(400).json({error:'Despesa invalida'});const category=req.body.category||'Outros';const profit=!isFuelCategory(category)&&yn(req.body.affects_profit,true);const e=await one('INSERT INTO expenses(session_id,category,amount,affects_wallet,affects_profit,note,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[req.params.id,category,amount,yn(req.body.affects_wallet,true),profit,req.body.note||'',req.body.created_at||now()]);res.status(201).json(e)}catch(e){next(e)}});
app.delete('/api/expenses/:id',guard,async(req,res,next)=>{try{await pool.query('DELETE FROM expenses WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});
app.get('/api/reports',guard,async(req,res,next)=>{try{res.json((await all()).map(s=>({period:s.started_at.slice(0,10),sessions_count:1,total_gross:s.summary.total_gross,total_km:s.summary.total_km,total_rides:s.summary.total_rides,total_expenses:s.summary.total_expenses,total_net_real:s.summary.net_real,gross_per_km:s.summary.gross_per_km,net_per_km:s.summary.net_per_km,gross_per_hour:s.summary.gross_per_hour,net_per_hour:s.summary.net_per_hour,margin_real_percent:s.summary.margin_real_percent,status:s.summary.status})))}catch(e){next(e)}});
app.get('/api/export.csv',guard,async(req,res,next)=>{try{res.setHeader('Content-Type','text/csv; charset=utf-8');res.send('id;bruto;liquido\n'+(await all()).map(s=>`${s.id};${s.summary.total_gross};${s.summary.net_real}`).join('\n'))}catch(e){next(e)}});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Erro interno do servidor'})});
init().then(()=>app.listen(PORT,()=>console.log('Controle Passe Uber rodando'))).catch(e=>{console.error(e);process.exit(1)});
