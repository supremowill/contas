let capturedApp = null;
let capturedPool = null;
let radarLoaded = false;

const n = (v, d = 0) => {
  const x = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) ? x : d;
};
const i = (v, d = 0) => {
  const x = parseInt(v, 10);
  return Number.isFinite(x) ? x : d;
};
const r = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100;
const yn = (v, d = true) => v === undefined || v === null || v === '' ? d : !(v === false || v === 'false' || v === 0 || v === '0');
const now = () => {
  const d = new Date(), p = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const realExpress = require('express');
function wrappedExpress(...args) {
  const app = realExpress(...args);
  capturedApp = app;
  const originalGet = app.get.bind(app);
  const originalPost = app.post.bind(app);

  app.post = function patchedPost(route, ...handlers) {
    if (route === '/api/sessions/:id/entries') {
      return originalPost(route, async (req, res, next) => {
        try {
          const APP_PIN = process.env.APP_PIN || '';
          if (APP_PIN && req.header('x-app-pin') !== APP_PIN) return res.status(401).json({ error: 'PIN invalido' });
          if (!capturedPool) return res.status(500).json({ error: 'Banco nao inicializado' });

          const sessionResult = await capturedPool.query('SELECT * FROM sessions WHERE id=$1', [req.params.id]);
          const s = sessionResult.rows[0];
          if (!s) return res.status(404).json({ error: 'Passe nao encontrado' });

          const amount = r(req.body.amount);
          if (amount <= 0) return res.status(400).json({ error: 'Ganho invalido' });

          const cur = Math.max(r(req.body.current_odometer), 0);
          const lastResult = await capturedPool.query('SELECT current_odometer FROM entries WHERE session_id=$1 AND current_odometer>0 ORDER BY created_at DESC,id DESC LIMIT 1', [s.id]);
          const last = lastResult.rows[0];
          const lastKm = last ? n(last.current_odometer) : n(s.start_odometer);
          if (cur > 0 && lastKm > 0 && cur < lastKm) return res.status(400).json({ error: 'KM atual menor que o ultimo informado' });

          const kmManual = Math.max(r(req.body.km), 0);
          const insert = await capturedPool.query(
            'INSERT INTO entries(session_id,amount,rides_count,km,current_odometer,affects_wallet,note,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            [s.id, amount, Math.max(i(req.body.rides_count), 0), kmManual, cur, yn(req.body.affects_wallet, true), req.body.note || '', req.body.created_at || now()]
          );
          return res.status(201).json(insert.rows[0]);
        } catch (e) {
          next(e);
        }
      });
    }
    return originalPost(route, ...handlers);
  };

  app.get = function patchedGet(route, ...handlers) {
    if (route === '*' && !radarLoaded && capturedApp && capturedPool) {
      require('./radar')(capturedApp, capturedPool);
      radarLoaded = true;
    }
    return originalGet(route, ...handlers);
  };
  return app;
}
Object.assign(wrappedExpress, realExpress);
require.cache[require.resolve('express')].exports = wrappedExpress;

const pg = require('pg');
class WrappedPool extends pg.Pool {
  constructor(options) {
    super(options);
    capturedPool = this;
  }
}
require.cache[require.resolve('pg')].exports = { ...pg, Pool: WrappedPool };

require('./server2');
