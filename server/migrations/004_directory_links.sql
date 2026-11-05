CREATE TABLE directory_links (
  member_id TEXT NOT NULL REFERENCES directories(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES directories(id) ON DELETE CASCADE,
  PRIMARY KEY (member_id, group_id),
  CHECK (member_id <> group_id)
);
