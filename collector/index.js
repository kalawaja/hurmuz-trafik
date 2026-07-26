/* ============================================================
   HÜRMÜZ TOPLAYICI — aisstream.io → Postgres (Neon)
   7/24 çalışır: tanker konumlarını örnekleyerek kaydeder,
   sayım hattı (56°36'D) geçişlerini transits tablosuna işler.
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
const BOX = [[[24.4, 54.3], [28.0, 58.6]]];      // [ [ [güney,batı], [kuzey,doğu] ] ]
const GATE_LON = 56.60;                            // sayım hattı boylamı
const GATE_LAT_MIN = 26.25, GATE_LAT_MAX = 26.85;  // hattın enlem aralığı
const SAMPLE_SEC   = 120;    // gemi başına en az bu kadar sn'de bir konum yaz
const SAMPLE_DEG   = 0.01;   // ...veya bu kadar derece yer değiştirmişse
const PRUNE_HOURS  = 72;     // konum geçmişi saklama süresi
const TRANSIT_GAP  = 2 * 3600 * 1000; // aynı gemi için iki geçiş arası en az (ms)
const isTanker = t => Number.isInteger(t) && t >= 80 && t <= 89;

const pool = new pg.Pool({
  connectionString: DB,
  ssl: { rejectUnauthorized: false },
  max: 3
});

/* ---- durum ---- */
const meta       = new Map();  // mmsi -> {type,name,len}
const lastPos    = new Map();  // mmsi -> {lon,lat,t}   (kapı kontrolü için)
const lastStored = new Map();  // mmsi -> {lon,lat,t}   (örnekleme için)
const lastCross  = new Map();  // mmsi -> ms            (çift sayım koruması)
let lastMsgAt = 0, msgCount = 0, posWritten = 0, transitCount = 0;

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
async function recordTransit(mmsi, tSec, dir, lat) {
  const m = meta.get(mmsi) || {};
  transitCount++;
  log(`GEÇİŞ ${dir === "W" ? "◀ körfeze giriş" : "körfezden çıkış ▶"}  MMSI ${mmsi}  ${m.name || ""}`);
  try {
    await pool.query(
      `INSERT INTO transits (mmsi, ts, direction, ship_type, name, length_m, lat)
       VALUES ($1, to_timestamp($2), $3, $4, $5, $6, $7)`,
      [mmsi, tSec, dir, m.type ?? null, m.name || null, m.len ?? null, lat]
    );
  } catch (e) { log("DB transit hatası:", e.message); }
}

/* ---- mesaj işleme ---- */
function onPosition(mmsi, tSec, lon, lat, sog, cog) {
  const known = meta.get(mmsi);
  const prev = lastPos.get(mmsi);
  lastPos.set(mmsi, { lon, lat, t: tSec });

  if (!known || !isTanker(known.type)) return;   // yalnız tankerler

  // sayım hattı kontrolü
  if (prev &&
      (tSec - prev.t) < 1800 &&                  // 30 dk'dan eski değil
      Math.abs(lon - prev.lon) < 0.5 &&          // ışınlanma koruması
      lat > GATE_LAT_MIN && lat < GATE_LAT_MAX &&
      prev.lat > GATE_LAT_MIN && prev.lat < GATE_LAT_MAX &&
      (prev.lon - GATE_LON) * (lon - GATE_LON) < 0) {
    const nowMs = Date.now();
    if ((nowMs - (lastCross.get(mmsi) || 0)) > TRANSIT_GAP) {
      lastCross.set(mmsi, nowMs);
      recordTransit(mmsi, tSec, lon > prev.lon ? "E" : "W", lat);
    }
  }

  // örnekleme
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
    // yalnız tankerleri (ve tanker olduğu yeni öğrenilenleri) veritabanına yaz
    if (isTanker(type) && (!before || before.type !== type || before.name !== name || before.len !== len)) {
      upsertVessel(mmsi, name, type, len);
    }
  }
}

/* ---- websocket bağlantısı + bekçi ---- */
let ws = null;
function connect() {
  log("aisstream.io bağlantısı açılıyor…");
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
setInterval(() => {  // 2 dk mesaj gelmezse bağlantıyı tazele
  if (lastMsgAt && Date.now() - lastMsgAt > 120000) {
    log("Bekçi: 120 sn'dir mesaj yok, bağlantı yenileniyor.");
    try { ws?.terminate(); } catch {}
  }
}, 30000);

/* ---- açılışta bilinen tankerleri yükle ---- */
async function boot() {
  try {
    const r = await pool.query("SELECT mmsi, name, ship_type, length_m FROM vessels");
    for (const v of r.rows) meta.set(Number(v.mmsi), { type: v.ship_type, name: v.name, len: v.length_m });
    log(`Künye yüklendi: ${r.rows.length} gemi.`);
  } catch (e) { log("Künye yükleme hatası:", e.message); }
  connect();
}
boot();

/* ---- bakım: eski konumları buda ---- */
async function prune() {
  try {
    const r = await pool.query(`DELETE FROM positions WHERE ts < now() - interval '${PRUNE_HOURS} hours'`);
    log(`Budama: ${r.rowCount} eski konum silindi.`);
  } catch (e) { log("Budama hatası:", e.message); }
}
setInterval(prune, 6 * 3600 * 1000);
setTimeout(prune, 60000);

/* ---- sağlık ucu (Render/izleme için) ---- */
http.createServer((req, res) => {
  const body = JSON.stringify({
    ok: lastMsgAt > 0 && (Date.now() - lastMsgAt) < 180000,
    sonMesajSn: lastMsgAt ? Math.round((Date.now() - lastMsgAt) / 1000) : null,
    mesaj: msgCount, yazilanKonum: posWritten, gecis: transitCount,
    izlenenGemi: lastPos.size, bilinenTanker: [...meta.values()].filter(m => isTanker(m.type)).length
  });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(body);
}).listen(process.env.PORT || 8080, () => log("Sağlık ucu hazır: /  (port", process.env.PORT || 8080, ")"));

/* ---- düzgün kapanış ---- */
process.on("SIGTERM", async () => { await flush(); process.exit(0); });
process.on("SIGINT",  async () => { await flush(); process.exit(0); });
