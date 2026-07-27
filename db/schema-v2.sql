-- v2 eki: resmî günlük istatistikler (IMF PortWatch, straits.live üzerinden)
-- Neon SQL Editor'de bu dosyanın tamamını çalıştırın (v1 şemasının üzerine güvenle uygulanır).

CREATE TABLE IF NOT EXISTS daily_stats (
  day          DATE PRIMARY KEY,
  n_total      INT,
  n_tanker     INT,
  n_cargo      INT,
  n_container  INT,
  capacity_dwt BIGINT,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kv (
  k          TEXT PRIMARY KEY,
  v          TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Geçişin nasıl tespit edildiği: 'gate' (sayım hattı) | 'inferred' (yaka değişimi)
ALTER TABLE transits ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'gate';
