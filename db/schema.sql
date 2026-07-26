-- Hürmüz Boğazı tanker trafiği — veritabanı şeması (Neon / Postgres)
-- Neon SQL Editor'de bu dosyanın tamamını çalıştırın.

CREATE TABLE IF NOT EXISTS vessels (
  mmsi       BIGINT PRIMARY KEY,
  name       TEXT,
  ship_type  INT,            -- AIS tip kodu (80-89 = tanker)
  length_m   INT,            -- Dimension A+B
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Örneklenmiş konumlar (gemi başına ~2 dakikada bir; 72 saat tutulur)
CREATE TABLE IF NOT EXISTS positions (
  id   BIGSERIAL PRIMARY KEY,
  mmsi BIGINT NOT NULL,
  ts   TIMESTAMPTZ NOT NULL,
  lon  DOUBLE PRECISION NOT NULL,
  lat  DOUBLE PRECISION NOT NULL,
  sog  REAL,
  cog  REAL
);
CREATE INDEX IF NOT EXISTS idx_positions_ts      ON positions (ts);
CREATE INDEX IF NOT EXISTS idx_positions_mmsi_ts ON positions (mmsi, ts DESC);

-- Sayım hattı (56°36'D) geçişleri — kalıcı istatistik kaynağı
CREATE TABLE IF NOT EXISTS transits (
  id        BIGSERIAL PRIMARY KEY,
  mmsi      BIGINT NOT NULL,
  ts        TIMESTAMPTZ NOT NULL,
  direction CHAR(1) NOT NULL CHECK (direction IN ('E','W')), -- E: körfezden çıkış, W: körfeze giriş
  ship_type INT,
  name      TEXT,
  length_m  INT,
  lat       DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_transits_ts ON transits (ts);
