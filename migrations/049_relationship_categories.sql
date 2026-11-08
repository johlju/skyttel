-- Remove category wording after preserving wording in retained relationship snapshots.

CREATE TEMP TABLE relationship_format_document (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  sourceId INTEGER NOT NULL,
  field TEXT NOT NULL,
  content TEXT NOT NULL
);

INSERT INTO relationship_format_document (source, sourceId, field, content)
SELECT 'map_draft', rowid, 'changes', changes FROM map_draft
UNION ALL
SELECT 'map_draft', rowid, 'relationships', relationships FROM map_draft
UNION ALL
SELECT 'map_draft', rowid, 'objectTypes', objectTypes FROM map_draft
UNION ALL
SELECT 'map_draft', rowid, 'relationshipTypes', relationshipTypes FROM map_draft
UNION ALL
SELECT 'map_save', rowid, 'receipt', receipt FROM map_save
UNION ALL
SELECT 'map_history', rowid, 'changes', changes FROM map_history
UNION ALL
SELECT 'conversation', rowid, 'state', state FROM conversation
UNION ALL
SELECT 'relationship_form_attempt', rowid, 'outcome', outcome FROM relationship_form_attempt;

-- Read only a relationship's own snapshots. Never use today's category definition.
CREATE TEMP TABLE relationship_format_edit AS
WITH snapshots AS (
  SELECT d.id AS documentId, edge.fullkey AS path, edge.value AS edge,
    coalesce(
      CASE WHEN edge.key = 'before'
        AND json_extract(owner.value, '$.beforeType.id') = json_extract(edge.value, '$.typeId')
        THEN json_extract(owner.value, '$.beforeType') END,
      CASE WHEN json_extract(owner.value, '$.type.id') = json_extract(edge.value, '$.typeId')
        THEN json_extract(owner.value, '$.type') END,
      (SELECT value FROM json_each(json_extract(container.value, '$.relationshipTypes'))
       WHERE json_extract(value, '$.id') = json_extract(edge.value, '$.typeId'))
    ) AS definition
  FROM relationship_format_document d, json_tree(d.content) edge
  JOIN json_tree(d.content) owner ON owner.id = edge.parent
  LEFT JOIN json_tree(d.content) container ON container.id = owner.parent
  WHERE edge.type = 'object'
    AND json_type(edge.value, '$.sourceId') = 'text'
    AND json_type(edge.value, '$.targetId') = 'text'
    AND json_type(edge.value, '$.typeId') = 'text'
    AND json_extract(edge.value, '$.verb') IS NULL
), edits AS (
  SELECT documentId, path || '.verb' AS path,
    coalesce(json_extract(definition, '$.forwardLabel'),
             json_extract(definition, '$.name'), 'har samband med') AS value
  FROM snapshots
  UNION ALL
  SELECT documentId, path || '.reverseVerb', json_extract(definition, '$.reverseLabel')
  FROM snapshots
  WHERE json_extract(edge, '$.reverseVerb') IS NULL
    AND json_extract(definition, '$.reverseLabel') IS NOT NULL
)
SELECT *, row_number() OVER (PARTITION BY documentId ORDER BY path) AS ordinal FROM edits;

WITH RECURSIVE converted(documentId, ordinal, content) AS (
  SELECT id, 0, content FROM relationship_format_document
  UNION ALL
  SELECT converted.documentId, edit.ordinal,
    json_set(converted.content, edit.path, edit.value)
  FROM converted JOIN relationship_format_edit edit
    ON edit.documentId = converted.documentId AND edit.ordinal = converted.ordinal + 1
)
UPDATE relationship_format_document SET content = (
  SELECT content FROM converted WHERE documentId = relationship_format_document.id
  ORDER BY ordinal DESC LIMIT 1
);
DROP TABLE relationship_format_edit;

-- Remove obsolete type metadata, including nested drafts and history, while
-- retaining ordinary custom-property text and every other snapshot field.
CREATE TEMP TABLE relationship_format_edit AS
SELECT d.id AS documentId, field.fullkey AS path,
  row_number() OVER (PARTITION BY d.id ORDER BY field.fullkey) AS ordinal
FROM relationship_format_document d, json_tree(d.content) field
JOIN json_tree(d.content) definition ON definition.id = field.parent
WHERE field.key IN ('forwardLabel', 'reverseLabel')
  AND definition.type = 'object'
  AND json_type(definition.value, '$.id') = 'text'
  AND json_type(definition.value, '$.householdId') = 'text'
  AND json_type(definition.value, '$.revision') = 'integer'
  AND json_type(definition.value, '$.name') = 'text'
  AND json_type(definition.value, '$.description') = 'text';

WITH RECURSIVE converted(documentId, ordinal, content) AS (
  SELECT id, 0, content FROM relationship_format_document
  UNION ALL
  SELECT converted.documentId, edit.ordinal, json_remove(converted.content, edit.path)
  FROM converted JOIN relationship_format_edit edit
    ON edit.documentId = converted.documentId AND edit.ordinal = converted.ordinal + 1
)
UPDATE relationship_format_document SET content = (
  SELECT content FROM converted WHERE documentId = relationship_format_document.id
  ORDER BY ordinal DESC LIMIT 1
);
DROP TABLE relationship_format_edit;

UPDATE map_draft SET changes = (
  SELECT content FROM relationship_format_document
  WHERE source = 'map_draft' AND sourceId = map_draft.rowid AND field = 'changes'
);

UPDATE map_draft SET relationships = (
  SELECT content FROM relationship_format_document
  WHERE source = 'map_draft' AND sourceId = map_draft.rowid AND field = 'relationships'
);

UPDATE map_draft SET objectTypes = (
  SELECT content FROM relationship_format_document
  WHERE source = 'map_draft' AND sourceId = map_draft.rowid AND field = 'objectTypes'
);

UPDATE map_draft SET relationshipTypes = (
  SELECT content FROM relationship_format_document
  WHERE source = 'map_draft' AND sourceId = map_draft.rowid AND field = 'relationshipTypes'
);

UPDATE map_save SET receipt = (
  SELECT content FROM relationship_format_document
  WHERE source = 'map_save' AND sourceId = map_save.rowid AND field = 'receipt'
);

UPDATE map_history SET changes = (
  SELECT content FROM relationship_format_document
  WHERE source = 'map_history' AND sourceId = map_history.rowid AND field = 'changes'
);

UPDATE conversation SET state = (
  SELECT content FROM relationship_format_document
  WHERE source = 'conversation' AND sourceId = conversation.rowid AND field = 'state'
);

UPDATE relationship_form_attempt SET outcome = (
  SELECT content FROM relationship_format_document
  WHERE source = 'relationship_form_attempt' AND sourceId = relationship_form_attempt.rowid AND field = 'outcome'
);

DROP TABLE relationship_format_document;
DROP TABLE relationship_type_labels;

UPDATE map_relationship SET verb = 'har samband med' WHERE verb IS NULL;

DROP TRIGGER household_family_types;
CREATE TRIGGER household_family_types AFTER INSERT ON household BEGIN
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Tjänst', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Tjänstekonto', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Abonnemang', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'E-postadress', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Bankkonto', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Kort', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Företag', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Förening', '');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Tillhör tjänsten', 'Gruppering för samband kring tjänster.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Gäller tjänstekontot', 'Gruppering för samband kring tjänstekonton.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Erbjuder', 'Gruppering för erbjudanden.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Inloggningsadress', 'Gruppering för inloggningsadresser.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Kontaktadress', 'Gruppering för kontaktadresser.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Använder', 'Gruppering för användning.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Står på avtalet', 'Gruppering för avtalsparter.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Äger', 'Gruppering för ägande.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Betalar', 'Gruppering för betalning.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Betalas med', 'Gruppering för betalningsmedel.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Kontokoppling', 'Gruppering för kontokopplingar.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Kortfakturan betalas från', 'Gruppering för kortbetalning.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Används av', 'Gruppering för användning.');
END;

DROP TRIGGER household_contract_types;
CREATE TRIGGER household_contract_types AFTER INSERT ON household BEGIN
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Bostad', 'En bostad som kan omfattas av flera avtal.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Bostad');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Garage', 'Ett garage, skilt från avtalet som gäller det.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Garage');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Fordon', 'Ett fordon, oberoende av finansiering, ägande och användning.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Fordon');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Avtal', 'En överenskommelse mellan parter.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Avtal');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Hyresavtal', 'Ett avtal om hyra. Återkommande betalning gör det inte till ett abonnemang.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Hyresavtal');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Låneavtal', 'Ett avtal om lån, skilt från senast uppgiven skuld.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Låneavtal');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Kreditavtal', 'Ett avtal om kredit. Beviljat kreditutrymme och utnyttjad kredit är olika uppgifter.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Kreditavtal');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Avbetalningsavtal', 'Ett avtal om att betala ett köp i delar.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Avbetalningsavtal');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Försäkringsavtal', 'Ett avtal om försäkring, skilt från det som försäkras.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Försäkringsavtal');
INSERT INTO relationship_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Gäller', 'Gruppering för vad avtal gäller.'
WHERE NOT EXISTS (SELECT 1 FROM relationship_type WHERE householdId = NEW.id AND name = 'Gäller');
INSERT INTO relationship_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Finansierar', 'Gruppering för finansiering.'
WHERE NOT EXISTS (SELECT 1 FROM relationship_type WHERE householdId = NEW.id AND name = 'Finansierar');
INSERT INTO relationship_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Försäkrar', 'Gruppering för försäkring.'
WHERE NOT EXISTS (SELECT 1 FROM relationship_type WHERE householdId = NEW.id AND name = 'Försäkrar');
INSERT INTO relationship_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Hyresvärd', 'Gruppering för hyresvärdar.'
WHERE NOT EXISTS (SELECT 1 FROM relationship_type WHERE householdId = NEW.id AND name = 'Hyresvärd');
INSERT INTO relationship_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Långivare', 'Gruppering för långivare.'
WHERE NOT EXISTS (SELECT 1 FROM relationship_type WHERE householdId = NEW.id AND name = 'Långivare');
END;

-- Change only untouched stock descriptions. Preserve household-authored metadata.

UPDATE relationship_type SET description = 'Gruppering för samband kring tjänster.'
WHERE revision = 1 AND name = 'Tillhör tjänsten' AND description = 'Från tjänstekonto eller abonnemang till tjänst.';

UPDATE relationship_type SET description = 'Gruppering för samband kring tjänstekonton.'
WHERE revision = 1 AND name = 'Gäller tjänstekontot' AND description = 'Från abonnemang till tjänstekonto.';

UPDATE relationship_type SET description = 'Gruppering för erbjudanden.'
WHERE revision = 1 AND name = 'Erbjuder' AND description = 'Från tjänsteleverantör till tjänst.';

UPDATE relationship_type SET description = 'Gruppering för inloggningsadresser.'
WHERE revision = 1 AND name = 'Inloggningsadress' AND description = 'Från tjänstekonto till e-postadress.';

UPDATE relationship_type SET description = 'Gruppering för kontaktadresser.'
WHERE revision = 1 AND name = 'Kontaktadress' AND description = 'Från tjänstekonto till e-postadress.';

UPDATE relationship_type SET description = 'Gruppering för användning.'
WHERE revision = 1 AND name = 'Använder' AND description = 'Från person till det som personen använder.';

UPDATE relationship_type SET description = 'Gruppering för avtalsparter.'
WHERE revision = 1 AND name = 'Står på avtalet' AND description = 'Från avtal till avtalspart.';

UPDATE relationship_type SET description = 'Gruppering för ägande.'
WHERE revision = 1 AND name = 'Äger' AND description = 'Från objekt till ägare.';

UPDATE relationship_type SET description = 'Gruppering för betalning.'
WHERE revision = 1 AND name = 'Betalar' AND description = 'Från person till avtal.';

UPDATE relationship_type SET description = 'Gruppering för betalningsmedel.'
WHERE revision = 1 AND name = 'Betalas med' AND description = 'Från avtal till betalningsmedel.';

UPDATE relationship_type SET description = 'Gruppering för kontokopplingar.'
WHERE revision = 1 AND name = 'Kontokoppling' AND description = 'Från kort till bankkonto.';

UPDATE relationship_type SET description = 'Gruppering för kortbetalning.'
WHERE revision = 1 AND name = 'Kortfakturan betalas från' AND description = 'Från kort till bankkontot som betalar kortfakturan.';

UPDATE relationship_type SET description = 'Gruppering för användning.'
WHERE revision = 1 AND name = 'Används av' AND description = 'Från objekt till person som använder det.';

UPDATE relationship_type SET description = 'Gruppering för vad avtal gäller.'
WHERE revision = 1 AND name = 'Gäller' AND description = 'Från avtal till det objekt som avtalet gäller.';

UPDATE relationship_type SET description = 'Gruppering för finansiering.'
WHERE revision = 1 AND name = 'Finansierar' AND description = 'Från finansieringsavtal till det objekt som finansieras.';

UPDATE relationship_type SET description = 'Gruppering för försäkring.'
WHERE revision = 1 AND name = 'Försäkrar' AND description = 'Från försäkringsavtal till det objekt som försäkras.';

UPDATE relationship_type SET description = 'Gruppering för hyresvärdar.'
WHERE revision = 1 AND name = 'Hyresvärd' AND description = 'Från hyresavtal till den person, det företag eller den förening som hyr ut.';

UPDATE relationship_type SET description = 'Gruppering för långivare.'
WHERE revision = 1 AND name = 'Långivare' AND description = 'Från låneavtal eller kreditavtal till den person, det företag eller den förening som lämnar lånet eller krediten.';
