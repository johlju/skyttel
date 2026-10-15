-- Only actually accepted finite work can pause ordinary inactivity. Its
-- original hard deadline bounds crash recovery; no work resumes at startup.
ALTER TABLE session ADD COLUMN idleWorkUntil INTEGER;
