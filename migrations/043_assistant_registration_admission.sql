-- At most 30 recent admission timestamps; no client identity or address.
CREATE TABLE assistant_registration_admission (
  id INTEGER PRIMARY KEY,
  admittedAt INTEGER NOT NULL
);
CREATE INDEX assistant_connection_client ON assistant_connection(clientId);
