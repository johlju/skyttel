ALTER TABLE session ADD COLUMN choiceSchemaVersion INTEGER;
ALTER TABLE session ADD COLUMN rememberMe INTEGER;
ALTER TABLE session ADD COLUMN informationVersion INTEGER;
ALTER TABLE session ADD COLUMN choicePurpose TEXT;
ALTER TABLE session ADD COLUMN decidedAt INTEGER;
ALTER TABLE session ADD COLUMN absoluteExpiresAt INTEGER;
ALTER TABLE session ADD COLUMN loginConfirmation TEXT;

ALTER TABLE browser_binding_attempt ADD COLUMN choiceSchemaVersion INTEGER;
ALTER TABLE browser_binding_attempt ADD COLUMN rememberMe INTEGER;
ALTER TABLE browser_binding_attempt ADD COLUMN informationVersion INTEGER;
ALTER TABLE browser_binding_attempt ADD COLUMN choicePurpose TEXT;
ALTER TABLE browser_binding_attempt ADD COLUMN decidedAt INTEGER;
ALTER TABLE browser_binding_attempt ADD COLUMN provider TEXT;
