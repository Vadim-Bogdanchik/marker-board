CREATE TABLE sketches (board_id TEXT PRIMARY KEY NOT NULL REFERENCES boards(id), revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0), items TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(items)));
INSERT INTO sketches(board_id) SELECT id FROM boards;
