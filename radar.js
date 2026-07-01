module.exports = function registerRadar(app, pool) {
  const APP_PIN = process.env.APP_PIN || '';
  const n = (v, d = 0) => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : d; };
  const r = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100;
  const now = () => { const d = new Date(), p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const auth = (req, res, next) => (!APP_PIN || req.header('x-app-pin') === APP_PIN) ? next() : res.status(401).json({ error: 'PIN invalido' });
  async function query(sql, params = []) { return (await pool.query(sql, params)).rows; }
  async function one(sql, params = []) { return (await pool.query(sql, params)).rows[0]; }
  async function ensure() {
    await pool.query(`CREATE TABLE IF NOT EXISTS radar_events(
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT REFERENCES sessions(id) ON DELETE SET NULL,
      platform TEXT DEFAULT 'Uber',
      fare NUMERIC(12,2) DEFAULT 0,
      pickup_km NUMERIC(12,2) DEFAULT 0,
      trip_km NUMERIC(12,2) DEFAULT 0,
      total_km NUMERIC(12,2) DEFAULT 0,
      pickup_min NUMERIC(12,2) DEFAULT 0,
      trip_min NUMERIC(12,2) DEFAULT 0,
      total_min NUMERIC(12,2) DEFAULT 0,
      gross_per_km NUMERIC(12,2) DEFAULT 0,
      net_per_km NUMERIC(12,2) DEFAULT 0,
      gross_per_hour NUMERIC(12,2) DEFAULT 0,
      net_per_hour NUMERIC(12,2) DEFAULT 0,
      estimated_cost NUMERIC(12,2) DEFAULT 0,
      estimated_profit NUMERIC(12,2) DEFAULT 0,
      classification TEXT DEFAULT 'NO_LIMITE',
      decision TEXT DEFAULT 'PENDENTE',
      entry_id BIGINT,
      raw_text TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      decided_at TEXT
    );CREATE INDEX IF NOT EXISTS idx_radar_events_created_at ON radar_events(created_at);CREATE INDEX IF NOT EXISTS idx_radar_events_session_id ON radar_events(session_id);`);
  }
  async function activeSession() {
    const rows = await query('SELECT * FROM sessions ORDER BY started_at DESC, id DESC LIMIT 5');
    return rows.find(s => new Date(s.ended_at).getTime() > Date.now()) || rows[0] || null;
  }
  function classify(netKm, netHour, profit) {
    if (profit <= 0 || netKm < 1.1 || netHour < 20) return 'RUIM';
    if ((netKm >= 1.8 && netHour >= 30) || netKm >= 2.2 || netHour >= 40) return 'BOA';
    return 'NO_LIMITE';
  }
  function label(c) { return c === 'BOA' ? 'Boa' : c === 'RUIM' ? 'Ruim' : 'No limite'; }
  function message(c, fare, km, min, netKm, netHour, profit) {
    return `${label(c)}: R$ ${r(fare).toFixed(2).replace('.', ',')} • ${r(km)} km • ${r(min)} min • lucro est. R$ ${r(profit).toFixed(2).replace('.', ',')} • R$ ${r(netKm).toFixed(2).replace('.', ',')}/km liq. • R$ ${r(netHour).toFixed(2).replace('.', ',')}/h liq.`;
  }
  function normalizeText(text) {
    return String(text || '')
      .replace(/\r/g, '\n')
      .replace(/,/g, '.')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function firstNumber(s) {
    const m = String(s || '').match(/\d+(?:[.,.]\d+)?/);
    return m ? n(m[0]) : 0;
  }
  function parseOfferText(rawText) {
    const text = normalizeText(rawText);
    const fareMatch = text.match(/R\$\s*(\d+(?:[.,.]\d+)?)/i) || text.match(/(?:valor|ganho|preco|preço)\D{0,12}(\d+(?:[.,.]\d+)?)/i);
    const pickupMatch = text.match(/(\d+(?:[.,.]\d+)?)\s*min(?:uto|utos)?\s*\((\d+(?:[.,.]\d+)?)\s*km\)\s*(?:de\s*)?(?:dist[aâ]ncia|ate|até|para|pickup|coleta)/i);
    const tripMatch = text.match(/(?:viagem|trip|trajeto|corrida)\D{0,20}(\d+(?:[.,.]\d+)?)\s*min(?:uto|utos)?\s*\((\d+(?:[.,.]\d+)?)\s*km\)/i);
    let fare = fareMatch ? n(fareMatch[1]) : 0;
    let pickupMin = pickupMatch ? n(pickupMatch[1]) : 0;
    let pickupKm = pickupMatch ? n(pickupMatch[2]) : 0;
    let tripMin = tripMatch ? n(tripMatch[1]) : 0;
    let tripKm = tripMatch ? n(tripMatch[2]) : 0;
    const allMinKm = [...text.matchAll(/(\d+(?:[.,.]\d+)?)\s*min(?:uto|utos)?\s*\((\d+(?:[.,.]\d+)?)\s*km\)/gi)].map(m => ({ min: n(m[1]), km: n(m[2]) }));
    if ((!pickupMin || !pickupKm) && allMinKm[0]) { pickupMin = allMinKm[0].min; pickupKm = allMinKm[0].km; }
    if ((!tripMin || !tripKm) && allMinKm[1]) { tripMin = allMinKm[1].min; tripKm = allMinKm[1].km; }
    const totalKmMatch = text.match(/(?:total|km total|distancia total|distância total)\D{0,12}(\d+(?:[.,.]\d+)?)\s*km/i);
    const totalMinMatch = text.match(/(?:total|tempo total)\D{0,12}(\d+(?:[.,.]\d+)?)\s*min/i);
    return {
      fare,
      pickup_km: r(pickupKm),
      trip_km: r(tripKm),
      total_km: r(totalKmMatch ? n(totalKmMatch[1]) : pickupKm + tripKm),
      pickup_min: r(pickupMin),
      trip_min: r(tripMin),
      total_min: r(totalMinMatch ? n(totalMinMatch[1]) : pickupMin + tripMin),
      raw_text: rawText,
      parsed_from_text: true
    };
  }
  function analyze(body, session) {
    const fare = r(body.fare || body.valor || body.amount);
    const pickupKm = r(body.pickup_km || body.km_ate_passageiro);
    const tripKm = r(body.trip_km || body.km_viagem);
    const totalKm = r(body.total_km || body.km_total || pickupKm + tripKm);
    const pickupMin = r(body.pickup_min || body.min_ate_passageiro);
    const tripMin = r(body.trip_min || body.min_viagem);
    const totalMin = r(body.total_min || body.min_total || pickupMin + tripMin);
    const costPerKm = r(body.cost_per_km || body.custo_km || session?.cost_per_km || 0.81);
    const estimatedCost = r(totalKm * costPerKm);
    const estimatedProfit = r(fare - estimatedCost);
    const grossPerKm = r(totalKm > 0 ? fare / totalKm : 0);
    const netPerKm = r(totalKm > 0 ? estimatedProfit / totalKm : 0);
    const grossPerHour = r(totalMin > 0 ? fare / (totalMin / 60) : 0);
    const netPerHour = r(totalMin > 0 ? estimatedProfit / (totalMin / 60) : 0);
    const classification = classify(netPerKm, netPerHour, estimatedProfit);
    return { fare, pickupKm, tripKm, totalKm, pickupMin, tripMin, totalMin, costPerKm, estimatedCost, estimatedProfit, grossPerKm, netPerKm, grossPerHour, netPerHour, classification, message: message(classification, fare, totalKm, totalMin, netPerKm, netPerHour, estimatedProfit) };
  }
  async function saveAnalysis(req, res, body, session) {
    const a = analyze(body || {}, session);
    if (a.fare <= 0) return res.status(400).json({ error: 'Informe o valor da corrida.', parsed: body });
    if (a.totalKm <= 0 && a.totalMin <= 0) return res.status(400).json({ error: 'Informe km ou minutos da corrida.', parsed: body });
    const row = await one(`INSERT INTO radar_events(session_id,platform,fare,pickup_km,trip_km,total_km,pickup_min,trip_min,total_min,gross_per_km,net_per_km,gross_per_hour,net_per_hour,estimated_cost,estimated_profit,classification,decision,raw_text,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'PENDENTE',$17,$18) RETURNING *`, [session?.id || null, body.platform || body.plataforma || session?.platform || 'Uber', a.fare, a.pickupKm, a.tripKm, a.totalKm, a.pickupMin, a.tripMin, a.totalMin, a.grossPerKm, a.netPerKm, a.grossPerHour, a.netPerHour, a.estimatedCost, a.estimatedProfit, a.classification, body.raw_text || '', now()]);
    return res.status(201).json({ ok: true, id: row.id, event: row, analysis: a, parsed: body.parsed_from_text ? body : undefined, actions: { aceitar: `/api/radar/${row.id}/aceitar`, recusar: `/api/radar/${row.id}/recusar` } });
  }
  app.post('/api/radar/analisar', auth, async (req, res, next) => {
    try {
      await ensure();
      const session = await activeSession();
      return saveAnalysis(req, res, req.body || {}, session);
    } catch (e) { next(e); }
  });
  app.post('/api/radar/analisar-texto', auth, async (req, res, next) => {
    try {
      await ensure();
      const session = await activeSession();
      const raw = req.body?.raw_text || req.body?.text || req.body?.texto || '';
      const parsed = parseOfferText(raw);
      parsed.platform = req.body?.platform || req.body?.plataforma || 'Uber';
      return saveAnalysis(req, res, parsed, session);
    } catch (e) { next(e); }
  });
  app.post('/api/radar/:id/aceitar', auth, async (req, res, next) => {
    try {
      await ensure();
      const ev = await one('SELECT * FROM radar_events WHERE id=$1', [req.params.id]);
      if (!ev) return res.status(404).json({ error: 'Evento do radar nao encontrado.' });
      const session = ev.session_id ? await one('SELECT * FROM sessions WHERE id=$1', [ev.session_id]) : await activeSession();
      if (!session) return res.status(400).json({ error: 'Nenhum passe/sessao encontrada para lancar a corrida.' });
      const fare = r(req.body.fare || req.body.valor || ev.fare);
      const currentOdometer = r(req.body.current_odometer || req.body.km_atual || 0);
      const note = `Radar MacroDroid: ${label(ev.classification)} • ${r(ev.total_km)} km • ${r(ev.total_min)} min`;
      const entry = await one('INSERT INTO entries(session_id,amount,rides_count,km,current_odometer,note,created_at) VALUES($1,$2,1,$3,$4,$5,$6) RETURNING *', [session.id, fare, r(ev.total_km), currentOdometer, note, now()]);
      await pool.query("UPDATE radar_events SET decision='ACEITA', entry_id=$1, decided_at=$2 WHERE id=$3", [entry.id, now(), ev.id]);
      res.json({ ok: true, decision: 'ACEITA', entry, message: 'Corrida aceita e lancada como ganho no sistema.' });
    } catch (e) { next(e); }
  });
  app.post('/api/radar/:id/recusar', auth, async (req, res, next) => {
    try {
      await ensure();
      const row = await one("UPDATE radar_events SET decision='RECUSADA', decided_at=$1 WHERE id=$2 RETURNING *", [now(), req.params.id]);
      if (!row) return res.status(404).json({ error: 'Evento do radar nao encontrado.' });
      res.json({ ok: true, decision: 'RECUSADA', event: row, message: 'Corrida recusada salva no radar.' });
    } catch (e) { next(e); }
  });
  app.get('/api/radar/hoje', auth, async (req, res, next) => {
    try {
      await ensure();
      const date = req.query.date || now().slice(0, 10);
      const rows = await query("SELECT * FROM radar_events WHERE created_at LIKE $1 ORDER BY created_at DESC,id DESC", [`${date}%`]);
      res.json(rows);
    } catch (e) { next(e); }
  });
};
