/* ============================================================
   HÜRMÜZ TOPLAYICI v2 — aisstream.io + IMF PortWatch → Postgres
   v2 yenilikleri:
   - Resmî günlük geçiş serisi (IMF PortWatch, straits.live ücretsiz
     API'si üzerinden; 12 saatte bir tazelenir, veritabanında saklanır)
   - Ölü bölge dayanıklı geçiş tespiti: sayım hattına ek olarak
     "körfez yakasında görüldü → okyanus yakasında görüldü" çıkarımı
   Gerekli ortam değişkenleri: AISSTREAM_KEY, DATABASE_URL
   ============================================================ */
import WebSocket from "ws";
import http from "node:http";
import pg from "pg";

const KEY = process.env.AISSTREAM_KEY;
const DB  = process.env.DATABASE_URL;
if (!KEY || !DB) {
  console.error("HATA: AISSTREAM_KEY ve DATABASE_URL ortam değişkenleri gerekli.");
  process.exit(1);
}

/* ---- yapılandırma ---- */
const BOX = [[[24.4, 54.3], [28.0, 58.6]]];
const GATE_LON = 56.60;
const GATE_LAT_MIN = 26.25, GATE_LAT_MAX = 26.85;
const SIDE_WEST_LON = 56.20;   // bunun batısı: Basra Körfezi yakası
const SIDE_EAST_LON = 57.00;   // bunun doğusu: Umman Körfezi yakası
const SIDE_MAX_GAP  = 48 * 3600;
const SAMPLE_SEC   = 120;
const SAMPLE_DEG   = 0.01;
const PRUNE_HOURS  = 72;
const TRANSIT_GAP  = 2 * 3600 * 1000;
const DAILY_URL    = "https://straits.live/api/v1/transits?history=1&limit=365";
const DAILY_EVERY  = 12 * 3600 * 1000;
const isTanker = t => Number.isInteger(t) && t >= 80 && t <= 89;

const pool = new pg.Pool({
  connectionString: DB,
  ssl: { rejectUnauthorized: false },
  max: 3
});

/* ---- durum ---- */
const meta       = new Map();
const lastPos    = new Map();
const lastStored = new Map();
const lastCross  = new Map();
const sideSeen   = new Map();  // mmsi -> {side:'G'|'O', t}
let lastMsgAt = 0, msgCount = 0, posWritten = 0, transitCount = 0;
let dailyRows = 0, dailyLast = null;

const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ---- toplu konum yazımı ---- */
let buf = [];
function queuePos(mmsi, tSec, lon, lat, sog, cog) {
  buf.push([mmsi, tSec, lon, lat, sog, cog]);
  if (buf.length >= 200) flush();
}
async function flush() {
  if (!buf.length) return;
  const rows = buf; buf = [];
  const vals = [], params = [];
  rows.forEach((r, i) => {
    const b = i * 6;
    vals.push(`($${b+1}, to_timestamp($${b+2}), $${b+3}, $${b+4}, $${b+5}, $${b+6})`);
    params.push(...r);
  });
  try {
    await pool.query(
      `INSERT INTO positions (mmsi, ts, lon, lat, sog, cog) VALUES ${vals.join(",")}`,
      params
    );
    posWritten += rows.length;
  } catch (e) { log("DB konum yazma hatası:", e.message); }
}
setInterval(flush, 5000);

/* ---- gemi künyesi ---- */
async function upsertVessel(mmsi, name, type, len) {
  try {
    await pool.query(
      `INSERT INTO vessels (mmsi, name, ship_type, length_m, updated_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (mmsi) DO UPDATE
         SET name = COALESCE(EXCLUDED.name, vessels.name),
             ship_type = COALESCE(EXCLUDED.ship_type, vessels.ship_type),
             length_m  = COALESCE(EXCLUDED.length_m,  vessels.length_m),
             updated_at = now()`,
      [mmsi, name || null, type ?? null, len ?? null]
    );
  } catch (e) { log("DB vessel hatası:", e.message); }
}

/* ---- geçiş kaydı ---- */
async function recordTransit(mmsi, tSec, dir, lat, method) {
  const m = meta.get(mmsi) || {};
  transitCount++;
  log(`GEÇİŞ [${method}] ${dir === "W" ? "◀ körfeze giriş" : "körfezden çıkış ▶"}  MMSI ${mmsi}  ${m.name || ""}`);
  try {
    await pool.query(
      `INSERT INTO transits (mmsi, ts, direction, ship_type, name, length_m, lat, method)
       VALUES ($1, to_timestamp($2), $3, $4, $5, $6, $7, $8)`,
      [mmsi, tSec, dir, m.type ?? null, m.name || null, m.len ?? null, lat, method]
    );
  } catch (e) { log("DB transit hatası:", e.message); }
}
function tryTransit(mmsi, tSec, dir, lat, method) {
  const nowMs = Date.now();
  if ((nowMs - (lastCross.get(mmsi) || 0)) <= TRANSIT_GAP) return;
  lastCross.set(mmsi, nowMs);
  recordTransit(mmsi, tSec, dir, lat, method);
}

/* ---- mesaj işleme ---- */
function onPosition(mmsi, tSec, lon, lat, sog, cog) {
  const known = meta.get(mmsi);
  const prev = lastPos.get(mmsi);
  lastPos.set(mmsi, { lon, lat, t: tSec });

  if (!known || !isTanker(known.type)) return;

  // 1) sayım hattı
  if (prev &&
      (tSec - prev.t) < 1800 &&
      Math.abs(lon - prev.lon) < 0.5 &&
      lat > GATE_LAT_MIN && lat < GATE_LAT_MAX &&
      prev.lat > GATE_LAT_MIN && prev.lat < GATE_LAT_MAX &&
      (prev.lon - GATE_LON) * (lon - GATE_LON) < 0) {
    tryTransit(mmsi, tSec, lon > prev.lon ? "E" : "W", lat, "gate");
  }

  // 2) yaka çıkarımı (boğazdaki AIS ölü bölgesine dayanıklı)
  const side = lon < SIDE_WEST_LON ? "G" : (lon > SIDE_EAST_LON ? "O" : null);
  if (side) {
    const ps = sideSeen.get(mmsi);
    if (ps && ps.side !== side && (tSec - ps.t) < SIDE_MAX_GAP) {
      tryTransit(mmsi, tSec, side === "O" ? "E" : "W", lat, "inferred");
    }
    sideSeen.set(mmsi, { side, t: tSec });
  }

  // 3) örnekleme
  const st = lastStored.get(mmsi);
  if (!st || (tSec - st.t) >= SAMPLE_SEC ||
      Math.abs(lon - st.lon) >= SAMPLE_DEG || Math.abs(lat - st.lat) >= SAMPLE_DEG) {
    lastStored.set(mmsi, { lon, lat, t: tSec });
    queuePos(mmsi, tSec, lon, lat, sog, cog);
  }
}

function handleMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  lastMsgAt = Date.now(); msgCount++;

  const md = msg.MetaData || {};
  const mmsi = Number(md.MMSI);
  if (!mmsi) return;

  if (msg.MessageType === "PositionReport") {
    const p = msg.Message?.PositionReport || {};
    const lat = p.Latitude ?? md.latitude;
    const lon = p.Longitude ?? md.longitude;
    if (typeof lat !== "number" || typeof lon !== "number") return;
    const t = md.time_utc ? Math.floor(Date.parse(md.time_utc) / 1000) : Math.floor(Date.now() / 1000);
    onPosition(mmsi, Number.isFinite(t) ? t : Math.floor(Date.now() / 1000),
               lon, lat, p.Sog ?? null, p.Cog ?? null);

  } else if (msg.MessageType === "ShipStaticData") {
    const s = msg.Message?.ShipStaticData || {};
    const type = s.Type ?? null;
    const name = (s.Name || md.ShipName || "").trim() || null;
    const dim = s.Dimension || {};
    const len = (dim.A && dim.B) ? (dim.A + dim.B) : null;
    const before = meta.get(mmsi);
    meta.set(mmsi, { type, name, len });
    if (isTanker(type) && (!before || before.type !== type || before.name !== name || before.len !== len)) {
      upsertVessel(mmsi, name, type, len);
    }
  }
}

/* ---- resmî günlük seri (IMF PortWatch, straits.live aracılığıyla) ---- */
async function fetchDaily() {
  try {
    const r = await fetch(DAILY_URL, { headers: { "User-Agent": "hurmuz-trafik/1.0 (kisisel proje)" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const rows = j.chokepointTransitsHistory || j.history || [];
    const latest = j.latest || null;
    const all = [...rows];
    if (latest && !all.some(x => x.date === latest.date)) all.push(latest);
    let n = 0;
    for (const row of all) {
      if (!row || !row.date) continue;
      await pool.query(
        `INSERT INTO daily_stats (day, n_total, n_tanker, n_cargo, n_container, capacity_dwt, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,now())
         ON CONFLICT (day) DO UPDATE SET
           n_total=EXCLUDED.n_total, n_tanker=EXCLUDED.n_tanker,
           n_cargo=EXCLUDED.n_cargo, n_container=EXCLUDED.n_container,
           capacity_dwt=EXCLUDED.capacity_dwt, fetched_at=now()`,
        [row.date, row.nTotal ?? null, row.nTanker ?? null,
         row.nCargo ?? null, row.nContainer ?? null, row.capacity ?? null]
      );
      n++;
    }
    const baseline = {
      baselineMedian: latest?.baselineMedian ?? null,
      preCrisisBaselineMedian: latest?.preCrisisBaselineMedian ?? null,
      asOf: j.asOf || null
    };
    await pool.query(
      `INSERT INTO kv (k, v, updated_at) VALUES ('baseline', $1, now())
       ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()`,
      [JSON.stringify(baseline)]
    );
    dailyRows = n; dailyLast = latest?.date || (all.at(-1)?.date ?? null);
    log(`Günlük seri güncellendi: ${n} gün (son gün ${dailyLast}, toplam ${latest?.nTotal ?? "?"} geçiş).`);
  } catch (e) { log("Günlük seri hatası:", e.message); }
}

/* ---- websocket bağlantısı + bekçi ---- */
let ws = null;
let connectedAt = 0;                 // bu bağlantının kurulduğu an (ms)
let regionSilentSince = null;        // bölgeden hiç mesaj alınamayan sürenin başlangıcı (ms)
const SILENCE_LIMIT = 6 * 3600 * 1000;   // bölge sessizse bu süre sonunda bağlantıyı zorla tazele
const STALE_LIMIT   = 120000;            // önceden mesaj almışken bu süre sessizlik = kopuk bağlantı

function connect() {
  log("aisstream.io bağlantısı açılıyor…");
  connectedAt = Date.now();
  ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
  ws.on("open", () => {
    log("Bağlandı; abonelik gönderiliyor.");
    ws.send(JSON.stringify({
      APIKey: KEY,
      BoundingBoxes: BOX,
      FilterMessageTypes: ["PositionReport", "ShipStaticData"]
    }));
  });
  ws.on("message", handleMessage);
  ws.on("error", e => log("WS hata:", e.message));
  ws.on("close", (code) => {
    log("WS kapandı (", code, ") — 5 sn sonra yeniden bağlanılacak.");
    setTimeout(connect, 5000);
  });
}
// Bekçi: ESKİDEN yalnızca "daha önce mesaj almışken sessizleşti" durumunu yakalıyordu.
// Bölgeden hiç mesaj gelmeyen (lastMsgAt hep 0 kalan) bağlantılar bu yüzden sonsuza dek
// açık ama sessiz kalabiliyordu. Şimdi iki durumu da ayrı ayrı izliyor ve raporluyor:
setInterval(() => {
  const now = Date.now();
  if (lastMsgAt && now - lastMsgAt > STALE_LIMIT) {
    log("Bekçi: önceki akış", Math.round((now - lastMsgAt) / 1000), "sn'dir sessiz, bağlantı yenileniyor.");
    regionSilentSince = null;
    try { ws?.terminate(); } catch {}
    return;
  }
  if (!lastMsgAt && connectedAt) {
    if (!regionSilentSince) regionSilentSince = connectedAt;
    const silentFor = now - regionSilentSince;
    if (silentFor > SILENCE_LIMIT) {
      log("Bekçi: bölgeden", Math.round(silentFor / 3600000), "saattir hiç mesaj yok, sigorta amaçlı bağlantı tazeleniyor.");
      try { ws?.terminate(); } catch {}
    }
  }
}, 30000);

/* ---- açılış ---- */
async function boot() {
  try {
    const r = await pool.query("SELECT mmsi, name, ship_type, length_m FROM vessels");
    for (const v of r.rows) meta.set(Number(v.mmsi), { type: v.ship_type, name: v.name, len: v.length_m });
    log(`Künye yüklendi: ${r.rows.length} gemi.`);
  } catch (e) { log("Künye yükleme hatası:", e.message); }
  connect();
  fetchDaily();
  setInterval(fetchDaily, DAILY_EVERY);
}
boot();

/* ---- bakım ---- */
async function prune() {
  try {
    const r = await pool.query(`DELETE FROM positions WHERE ts < now() - interval '${PRUNE_HOURS} hours'`);
    log(`Budama: ${r.rowCount} eski konum silindi.`);
  } catch (e) { log("Budama hatası:", e.message); }
}
setInterval(prune, 6 * 3600 * 1000);
setTimeout(prune, 60000);

/* ---- sağlık ucu ---- */
http.createServer((req, res) => {
  const body = JSON.stringify({
    ok: lastMsgAt > 0 && (Date.now() - lastMsgAt) < 180000,
    sonMesajSn: lastMsgAt ? Math.round((Date.now() - lastMsgAt) / 1000) : null,
    mesaj: msgCount, yazilanKonum: posWritten, gecis: transitCount,
    izlenenGemi: lastPos.size,
    bilinenTanker: [...meta.values()].filter(m => isTanker(m.type)).length,
    gunlukSeriGun: dailyRows, gunlukSonTarih: dailyLast,
    bolgeSessizSaat: (!lastMsgAt && regionSilentSince)
      ? +((Date.now() - regionSilentSince) / 3600000).toFixed(1) : 0
  });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(body);
}).listen(process.env.PORT || 8080, () => log("Sağlık ucu hazır: /  (port", process.env.PORT || 8080, ")"));

process.on("SIGTERM", async () => { await flush(); process.exit(0); });
process.on("SIGINT",  async () => { await flush(); process.exit(0); });
