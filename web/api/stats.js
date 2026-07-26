import { neon } from "@neondatabase/serverless";

const CLS  = l => (l >= 270 ? "VLCC" : l >= 230 ? "SUEZ" : l >= 180 ? "AFRA" : "PROD");
const KBBL = { VLCC: 2000, SUEZ: 1000, AFRA: 700, PROD: 350 }; // bin varil, ortalama yük varsayımı

export default async function handler(req, res) {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const [tr, act] = await Promise.all([
      sql`SELECT direction AS d, length_m AS l, extract(epoch FROM ts)::bigint AS te, lat
          FROM transits WHERE ts > now() - interval '24 hours' ORDER BY ts`,
      sql`SELECT count(DISTINCT mmsi)::int AS n, extract(epoch FROM max(ts))::bigint AS last
          FROM positions WHERE ts > now() - interval '30 minutes'`
    ]);

    const now = Math.floor(Date.now() / 1000);
    const byClass = { VLCC: 0, SUEZ: 0, AFRA: 0, PROD: 0 };
    const hourly = new Array(24).fill(0);
    let inb = 0, kbbl = 0;

    for (const r of tr) {
      const c = CLS(Number(r.l) || 0);
      byClass[c]++; kbbl += KBBL[c];
      if (r.d === "W") inb++;
      const h = Math.floor((now - Number(r.te)) / 3600);
      if (h >= 0 && h < 24) hourly[23 - h]++;
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    res.status(200).json({
      total: tr.length,
      inb,
      outb: tr.length - inb,
      byClass,
      kbbl,
      hourly,
      active: act[0] ? Number(act[0].n) : 0,
      lastMsg: act[0] && act[0].last ? Number(act[0].last) : null,
      now
    });
  } catch (e) {
    res.status(500).json({ error: "stats_failed" });
  }
}
