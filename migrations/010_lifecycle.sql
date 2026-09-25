ALTER TABLE map_object ADD COLUMN lifecycle TEXT CHECK (lifecycle IN ('active', 'ended'));
ALTER TABLE map_relationship ADD COLUMN lifecycle TEXT CHECK (lifecycle IN ('active', 'ended'));
ALTER TABLE map_relationship ADD COLUMN endDate TEXT;
