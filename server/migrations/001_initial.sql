CREATE TABLE boards (id TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), settings TEXT NOT NULL CHECK(json_valid(settings)));
CREATE TABLE board_columns (id TEXT PRIMARY KEY NOT NULL, board_id TEXT NOT NULL REFERENCES boards(id), position INTEGER NOT NULL, stage TEXT NOT NULL, title TEXT NOT NULL, UNIQUE(board_id,stage));
CREATE TABLE directories (id TEXT PRIMARY KEY NOT NULL, board_id TEXT NOT NULL REFERENCES boards(id), kind TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE tasks (id TEXT PRIMARY KEY NOT NULL, board_id TEXT NOT NULL REFERENCES boards(id), column_id TEXT NOT NULL REFERENCES board_columns(id), position INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
CREATE INDEX tasks_board_position ON tasks(board_id,position);
CREATE TABLE dependencies (task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, depends_on TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, PRIMARY KEY(task_id,depends_on), CHECK(task_id <> depends_on));
CREATE TABLE checklist (id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, position INTEGER NOT NULL, text TEXT NOT NULL, done INTEGER NOT NULL CHECK(done IN (0,1)));
