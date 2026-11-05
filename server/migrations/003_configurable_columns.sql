-- Rebuild the parent table to remove the one-column-per-stage constraint.
-- Keep all child rows and their original insertion order within the transaction.
CREATE TEMP TABLE saved_tasks AS SELECT * FROM tasks ORDER BY rowid;
CREATE TEMP TABLE saved_dependencies AS SELECT * FROM dependencies ORDER BY rowid;
CREATE TEMP TABLE saved_checklist AS SELECT * FROM checklist ORDER BY rowid;
DELETE FROM tasks;
CREATE TABLE new_columns (
  id TEXT PRIMARY KEY NOT NULL,
  board_id TEXT NOT NULL REFERENCES boards(id),
  position INTEGER NOT NULL,
  stage TEXT NOT NULL,
  title TEXT NOT NULL,
  width INTEGER NOT NULL CHECK(width BETWEEN 40 AND 240)
);
INSERT INTO new_columns SELECT id, board_id, position, stage, title,
  CASE WHEN stage = 'done' THEN 55 ELSE 100 END FROM board_columns;
DROP TABLE board_columns;
ALTER TABLE new_columns RENAME TO board_columns;
INSERT INTO tasks SELECT * FROM saved_tasks ORDER BY rowid;
INSERT INTO dependencies SELECT * FROM saved_dependencies ORDER BY rowid;
INSERT INTO checklist SELECT * FROM saved_checklist ORDER BY rowid;
DROP TABLE saved_checklist;
DROP TABLE saved_dependencies;
DROP TABLE saved_tasks;
