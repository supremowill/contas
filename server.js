const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_PIN = process.env.APP_PIN || '';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL não configurada. Configure a URL do Supabase no Render.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function numberValue(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function integerValue(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value) {
  return Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;
}

function nowLocalMinute() {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addHoursLocal(datetimeText, hours) {
  const d = new Date(datetimeText);
  if (Number.isNaN(d.getTime())) return datetimeText;
  d.setHours(d.getHours() + hours);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusFromPercent(percent, gross) {
  if (!gross || gross <= 0) return { key: 'empty', label: 'Sem ganho lançado' };
  if (percent > 25) return { key: 'bad', label: 'Pesado demais' };
  if (percent > 20) return { key: 'warning', label: 'Ainda pesado' };
  if (percent > 15) return { key: 'limit', label: 'No limite' };
  return { key: 'good', label: 'Mais saudável' };
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id BIGSERIAL PRIMARY KEY,
      platform TEXT NOT NULL DEFAULT 'Uber',
      pass_type INTEGER NOT NULL DEFAULT 24,
      pass_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      cost_per_km NUMERIC(12,2) NOT NULL DEFAULT 0.81,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entries (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      rides_count INTEGER NOT NULL DEFAULT 0,
      km NUMERIC(12,2) NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entries_session_id ON entries(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
  `);
}

function requirePin(req, res, next) {
  if (!APP_PIN) return next();
  if (req.header('x-app-pin') === APP_PIN) return next();
  return res.status(401).json({ error: 'PIN inválido ou não informado.' });
}

function sessionSummary(session, entries) {
  const totalGross = entries.reduce((sum, item) => sum + numberValue(item.amount), 0);
  const totalRides = entries.reduce((sum, item) => sum + integerValue(item.rides_count), 0);
  const totalKm = entries.reduce((sum, item) => sum + numberValue(item.km), 0);
  const passPrice = numberValue(session.pass_price);
  const costPerKm = numberValue(session.cost_per_km, 0.81);
  const passType = integerValue(session.pass_type, 24);
  const passPercent = totalGross > 0 ? (passPrice / totalGross) * 100 : 0;
  const kmCost = totalKm * costPerKm;
  const netSimple = totalGross - passPrice;
  const netWithKm = totalGross - passPrice - kmCost;
  const meta20 = passPrice > 0 ? passPrice / 0.20 : 0;
  const meta15 = passPrice > 0 ? passPrice / 0.15 : 0;

  return {
    total_gross: round2(totalGross),
    total_rides: totalRides,
    total_km: round2(totalKm),
    km_cost: round2(kmCost),
    net_simple: round2(netSimple),
    net_with_km: round2(netWithKm),
    pass_percent: round2(passPercent),
    pass_cost_per_hour: round2(passType > 0 ? passPrice / passType : 0),
    pass_cost_per_day: round2(passType > 0 ? passPrice / (passType / 24) : 0),
    average_per_ride: round2(totalRides > 0 ? totalGross / totalRides : 0),
    average_km_per_ride: round2(totalRides > 0 ? totalKm / totalRides : 0),
    meta_20: round2(meta20),
    meta_15: round2(meta15),
    missing_20: round2(Math.max(meta20 - totalGross, 0)),
    missing_15: round2(Math.max(meta15 - totalGross, 0)),
    status: statusFromPercent(passPercent, totalGross)
  };
}

async function readEntries(sessionId) {
  const result = await pool.query('SELECT * FROM entries WHERE session_id = $1 ORDER BY created_at DESC, id DESC', [sessionId]);
  return result.rows;
}

async function sessionWithSummary(session) {
  const entries = await readEntries(session.id);
  return { ...session, entries, summary: sessionSummary(session, entries) };
}

async function allSessionsWithSummary() {
  const result = await pool.query('SELECT * FROM sessions ORDER BY started_at DESC, id DESC');
  const rows = [];
  for (const session of result.rows) rows.push(await sessionWithSummary(session));
  return rows;
}

function isoWeekKey(datetimeText) {
  const d = new Date(datetimeText);
  if (Number.isNaN(d.getTime())) return 'Sem data';
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-S${String(weekNo).padStart(2, '0')}`;
}

function reportKey(session, period) {
  if (!session.started_at) return 'Sem data';
  if (period === 'monthly') return session.started_at.slice(0, 7);
  if (period === 'weekly') return isoWeekKey(session.started_at);
  return session.started_at.slice(0, 10);
}

async function buildReport(period) {
  const sessions = await allSessionsWithSummary();
  const map = new Map();

  for (const session of sessions) {
    const key = reportKey(session, period);
    if (!map.has(key)) {
      map.set(key, {
        period: key,
        sessions_count: 0,
        total_pass_price: 0,
        total_gross: 0,
        total_rides: 0,
        total_km: 0,
        total_km_cost: 0,
        total_net_simple: 0,
        total_net_with_km: 0
      });
    }

    const row = map.get(key);
    row.sessions_count += 1;
    row.total_pass_price += numberValue(session.pass_price);
    row.total_gross += session.summary.total_gross;
    row.total_rides += session.summary.total_rides;
    row.total_km += session.summary.total_km;
    row.total_km_cost += session.summary.km_cost;
    row.total_net_simple += session.summary.net_simple;
    row.total_net_with_km += session.summary.net_with_km;
  }

  return Array.from(map.values()).map((row) => {
    const passPercent = row.total_gross > 0 ? (row.total_pass_price / row.total_gross) * 100 : 0;
    return {
      ...row,
      total_pass_price: round2(row.total_pass_price),
      total_gross: round2(row.total_gross),
      total_km: round2(row.total_km),
      total_km_cost: round2(row.total_km_cost),
      total_net_simple: round2(row.total_net_simple),
      total_net_with_km: round2(row.total_net_with_km),
      average_per_ride: round2(row.total_rides > 0 ? row.total_gross / row.total_rides : 0),
      pass_percent: round2(passPercent),
      status: statusFromPercent(passPercent, row.total_gross)
    };
  }).sort((a, b) => b.period.localeCompare(a.period));
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, pin_required: Boolean(APP_PIN), database: 'postgres' });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Falha ao conectar ao banco.' });
  }
});

app.post('/api/login', (req, res) => {
  if (!APP_PIN) return res.json({ ok: true });
  if (req.body?.pin === APP_PIN) return res.json({ ok: true });
  return res.status(401).json({ error: 'PIN inválido.' });
});

app.get('/api/sessions', requirePin, async (req, res, next) => {
  try { res.json(await allSessionsWithSummary()); } catch (error) { next(error); }
});

app.get('/api/sessions/:id', requirePin, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Passe não encontrado.' });
    res.json(await sessionWithSummary(result.rows[0]));
  } catch (error) { next(error); }
});

app.post('/api/sessions', requirePin, async (req, res, next) => {
  try {
    const passType = integerValue(req.body.pass_type, 24);
    const safePassType = passType === 72 ? 72 : 24;
    const startedAt = req.body.started_at || nowLocalMinute();
    const endedAt = addHoursLocal(startedAt, safePassType);
    const now = nowLocalMinute();

    const result = await pool.query(`
      INSERT INTO sessions (platform, pass_type, pass_price, cost_per_km, started_at, ended_at, notes, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      String(req.body.platform || 'Uber'),
      safePassType,
      round2(req.body.pass_price),
      round2(numberValue(req.body.cost_per_km, 0.81)),
      startedAt,
      endedAt,
      String(req.body.notes || ''),
      now,
      now
    ]);

    res.status(201).json(await sessionWithSummary(result.rows[0]));
  } catch (error) { next(error); }
});

app.patch('/api/sessions/:id', requirePin, async (req, res, next) => {
  try {
    const currentResult = await pool.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    const current = currentResult.rows[0];
    if (!current) return res.status(404).json({ error: 'Passe não encontrado.' });

    const passType = req.body.pass_type !== undefined ? integerValue(req.body.pass_type, current.pass_type) : integerValue(current.pass_type, 24);
    const safePassType = passType === 72 ? 72 : 24;
    const startedAt = req.body.started_at || current.started_at;
    const endedAt = addHoursLocal(startedAt, safePassType);
    const now = nowLocalMinute();

    const result = await pool.query(`
      UPDATE sessions
      SET platform = $1, pass_type = $2, pass_price = $3, cost_per_km = $4, started_at = $5, ended_at = $6, notes = $7, updated_at = $8
      WHERE id = $9
      RETURNING *
    `, [
      String(req.body.platform ?? current.platform),
      safePassType,
      req.body.pass_price !== undefined ? round2(req.body.pass_price) : current.pass_price,
      req.body.cost_per_km !== undefined ? round2(numberValue(req.body.cost_per_km, 0.81)) : current.cost_per_km,
      startedAt,
      endedAt,
      String(req.body.notes ?? current.notes ?? ''),
      now,
      req.params.id
    ]);

    res.json(await sessionWithSummary(result.rows[0]));
  } catch (error) { next(error); }
});

app.delete('/api/sessions/:id', requirePin, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM sessions WHERE id = $1', [req.params.id]);
    res.json({ ok: true, deleted: result.rowCount });
  } catch (error) { next(error); }
});

app.post('/api/sessions/:id/entries', requirePin, async (req, res, next) => {
  try {
    const sessionResult = await pool.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    const session = sessionResult.rows[0];
    if (!session) return res.status(404).json({ error: 'Passe não encontrado.' });

    const amount = round2(req.body.amount);
    if (amount <= 0) return res.status(400).json({ error: 'Informe um valor de ganho maior que zero.' });

    const result = await pool.query(`
      INSERT INTO entries (session_id, amount, rides_count, km, note, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      session.id,
      amount,
      Math.max(integerValue(req.body.rides_count, 0), 0),
      Math.max(round2(req.body.km), 0),
      String(req.body.note || ''),
      req.body.created_at || nowLocalMinute()
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.delete('/api/entries/:id', requirePin, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM entries WHERE id = $1', [req.params.id]);
    res.json({ ok: true, deleted: result.rowCount });
  } catch (error) { next(error); }
});

app.get('/api/reports', requirePin, async (req, res, next) => {
  try {
    const period = ['daily', 'weekly', 'monthly'].includes(req.query.period) ? req.query.period : 'daily';
    res.json(await buildReport(period));
  } catch (error) { next(error); }
});

app.get('/api/export.csv', requirePin, async (req, res, next) => {
  try {
    const sessions = await allSessionsWithSummary();
    const header = ['id','plataforma','tipo_passe_horas','valor_passe','inicio','fim','bruto','corridas','km','custo_km','liquido_sem_km','liquido_com_km','percentual_passe','status','observacao'];
    const rows = sessions.map((s) => [
      s.id, s.platform, s.pass_type, s.pass_price, s.started_at, s.ended_at,
      s.summary.total_gross, s.summary.total_rides, s.summary.total_km, s.summary.km_cost,
      s.summary.net_simple, s.summary.net_with_km, s.summary.pass_percent, s.summary.status.label,
      (s.notes || '').replace(/\n/g, ' ')
    ]);

    const csv = [header, ...rows].map((row) => row.map((value) => {
      const text = String(value ?? '');
      return '"' + text.replace(/"/g, '""') + '"';
    }).join(';')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="controle-passe-uber.csv"');
    res.send('\ufeff' + csv);
  } catch (error) { next(error); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Controle Passe Uber rodando na porta ${PORT}`);
    console.log('Banco: Supabase/Postgres');
    console.log(APP_PIN ? 'PIN ativo.' : 'PIN desativado. Configure APP_PIN no Render para proteger o app.');
  });
}).catch((error) => {
  console.error('Erro ao iniciar banco:', error);
  process.exit(1);
});
