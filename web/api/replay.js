import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  try {
    const hours = Math.min(48, Math.max(6, parseInt(req.query.hours || "24", 10) || 24));
    const sql = neon(process.env.DATABASE_URL);

    const [rows, vs, trs] = await Promise.all([
      // 5 dakikalık kovalara indirgenmiş izler
      sql`SELECT mmsi,
                 (floor(extract(epoch FROM ts) / 300) * 300)::bigint AS t,
                 round(avg(lon)::numeric, 4)::float AS lon,
                 round(avg(lat)::numeric, 4)::float AS lat
          FROM positions
          WHERE ts > now() - make_interval(hours => ${hours})
          GROUP BY mmsi, t
          ORDER BY mmsi, t
          LIMIT 80000`,
      sql`SELECT mmsi, name, ship_type AS ty, length_m AS len
          FROM vessels
          WHERE mmsi IN (SELECT DISTINCT mmsi FROM positions
                         WHERE ts > now() - make_interval(hours => ${hours}))`,
      sql`SELECT extract(epoch FROM ts)::bigint AS t, direction AS d, lat
          FROM transits
          WHERE ts > now() - make_interval(hours => ${hours})
          ORDER BY ts`
    ]);

    const tracks = {};
    for (const r of rows) {
      (tracks[r.mmsi] ||= []).push([Number(r.t), r.lon, r.lat]);
    }
    const vessels = {};
    for (const v of vs) vessels[v.mmsi] = { n: v.name, ty: v.ty, len: v.len };

    const now = Math.floor(Date.now() / 1000);
    res.setHeader("Cache-Control", "s-maxage=180, stale-while-revalidate=300");
    res.status(200).json({
      t0: now - hours * 3600,
      t1: now,
      tracks,
      vessels,
      transits: trs.map(x => [Number(x.t), x.d, x.lat])
    });
  } catch (e) {
    res.status(500).json({ error: "replay_failed" });
  }
}
