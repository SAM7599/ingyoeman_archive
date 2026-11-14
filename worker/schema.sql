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

-- 보관함: 후기를 고치기 전·지우기 전 모습 (edit=고침, del=본인이 지움, mod=운영진이 지움, ban=차단)
CREATE TABLE IF NOT EXISTS rating_history (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  vid   TEXT    NOT NULL,
  uid   TEXT    NOT NULL,
  stars INTEGER NOT NULL,
  text  TEXT    NOT NULL,
  ts    INTEGER NOT NULL,
  name  TEXT    NOT NULL DEFAULT '',
  why   TEXT    NOT NULL DEFAULT 'edit'
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

CREATE TABLE IF NOT EXISTS banned (uid TEXT PRIMARY KEY, ts INTEGER NOT NULL);
