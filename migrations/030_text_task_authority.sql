-- Private conversation grants retain their original login identity when the
-- authentication library removes a naturally expired session. Explicit stops
-- delete these grants in the same transaction as the stop.
ALTER TABLE assistant_connection ADD COLUMN browserSessionId TEXT;
ALTER TABLE assistant_connection ADD COLUMN browserBindingId TEXT;
ALTER TABLE assistant_connection ADD COLUMN taskExpiresAt INTEGER;
CREATE INDEX assistant_connection_browser_session ON assistant_connection(browserSessionId);
CREATE INDEX assistant_connection_browser_binding ON assistant_connection(browserBindingId);
