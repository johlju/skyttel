-- Widths are personal presentation choices, independent of household content.
ALTER TABLE conversation_preferences ADD COLUMN textWidth INTEGER NOT NULL DEFAULT 400 CHECK(textWidth >= 300);
ALTER TABLE conversation_preferences ADD COLUMN draftWidth INTEGER NOT NULL DEFAULT 340 CHECK(draftWidth >= 260);
