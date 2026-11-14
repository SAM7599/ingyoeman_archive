CREATE TABLE IF NOT EXISTS ratings (
  vid   TEXT    NOT NULL,
  uid   TEXT    NOT NULL,
  stars INTEGER NOT NULL,
  ts    INTEGER NOT NULL,
  PRIMARY KEY (vid, uid)
);
CREATE INDEX IF NOT EXISTS ratings_uid ON ratings (uid);
