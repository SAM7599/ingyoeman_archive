-- 별점 + 후기 (영상 하나당 한 사람이 하나)
CREATE TABLE IF NOT EXISTS ratings (
  vid   TEXT    NOT NULL,
  uid   TEXT    NOT NULL,
  stars INTEGER NOT NULL,
  text  TEXT    NOT NULL DEFAULT '',
  name  TEXT    NOT NULL DEFAULT '',
  ts    INTEGER NOT NULL,
  PRIMARY KEY (vid, uid)
);
CREATE INDEX IF NOT EXISTS ratings_uid ON ratings (uid);

-- 후기를 고치기 전 모습 (신고할 때 현재와 과거를 비교하려고 남겨요)
CREATE TABLE IF NOT EXISTS rating_history (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  vid   TEXT    NOT NULL,
  uid   TEXT    NOT NULL,
  stars INTEGER NOT NULL,
  text  TEXT    NOT NULL,
  ts    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS history_key ON rating_history (vid, uid);

-- 신고 (한 사람이 같은 후기를 두 번 신고할 수 없어요)
CREATE TABLE IF NOT EXISTS reports (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  vid      TEXT    NOT NULL,
  uid      TEXT    NOT NULL,
  reporter TEXT    NOT NULL,
  reason   TEXT    NOT NULL,
  note     TEXT    NOT NULL DEFAULT '',
  ts       INTEGER NOT NULL,
  UNIQUE (vid, uid, reporter)
);
CREATE INDEX IF NOT EXISTS reports_reporter ON reports (reporter, ts);
