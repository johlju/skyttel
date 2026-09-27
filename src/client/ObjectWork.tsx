import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CustomValues, MapObject, MapState, ObjectType, ObjectValue } from '../shared/map.js';
import { FinancialFactsEditor } from './FinancialFacts.js';
import { LifecycleEditor } from './Lifecycle.js';
import { ObjectIconPicker } from './ObjectIconPicker.js';
import { ObjectRemovalNotice } from './ObjectRemovalNotice.js';
import { CustomFieldsDetails, CustomFieldsEditor } from './ObjectTypes.js';
import { ProfileImageEditor } from './ProfileImage.js';

export type ObjectEditor = {
  id: string;
  version: number;
  contentVersion: number;
  baseRevision: number | null;
  typeRevision: number;
  value: ObjectValue;
  displacedFields?: { id: string; type: ObjectType; values: CustomValues }[];
  fieldsHandled?: boolean;
};

export function ObjectWork({
  initial,
  object,
  state,
  effectiveTypes,
  householdId,
  pending,
  blocked,
  editing,
  onDirty,
  onName,
  onDone,
  action,
  changeImage,
  stageObject,
  details,
  relationships,
}: {
  initial: ObjectEditor;
  object?: MapObject;
  state: MapState;
  effectiveTypes: ObjectType[];
  householdId: string;
  pending: boolean;
  blocked: boolean;
  editing: number;
  onDirty: (dirty: boolean) => void;
  onName: (name: string) => void;
  onDone: () => void;
  action: (body: unknown) => Promise<boolean>;
  changeImage: (editor: ObjectEditor, file: File | null) => Promise<ObjectEditor | undefined>;
  stageObject: (editor: ObjectEditor) => Promise<ObjectEditor | undefined>;
  details: ReactNode;
  relationships: ReactNode;
}) {
  const prefix = useId();
  const form = useRef<HTMLFormElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const focusNameOnOpen = useRef(false);
  const [editor, setEditor] = useState<ObjectEditor | null>(editing ? initial : null);
  const [dirty, markDirty] = useState(false);
  const editRequest = useRef(editing);
  const basis = useRef(initial);
  useLayoutEffect(() => {
    if (!focusNameOnOpen.current || !editor) return;
    focusNameOnOpen.current = false;
    nameInput.current?.focus();
  }, [editor]);
  // A sibling proposal advances the single draft version. Carry that version
  // forward only when this object's source and type are still the same.
  useEffect(() => {
    const previous = basis.current;
    if (!editor || editor.version === initial.version) {
      basis.current = initial;
      return;
    }
    if (
      previous.contentVersion === initial.contentVersion &&
      previous.baseRevision === initial.baseRevision &&
      previous.typeRevision === initial.typeRevision &&
      JSON.stringify(previous.value) === JSON.stringify(initial.value)
    ) {
      basis.current = initial;
      setEditor({ ...editor, version: initial.version });
    }
  }, [initial, editor]);
  function setDirty(value: boolean) {
    markDirty(value);
    onDirty(value);
  }
  function begin() {
    basis.current = initial;
    focusNameOnOpen.current = true;
    setEditor(initial);
  }
  useEffect(() => {
    if (editing !== editRequest.current) {
      editRequest.current = editing;
      if (!editor) setEditor(initial);
    }
  }, [editing, editor, initial]);
  async function submit(body: unknown) {
    if (await action(body)) {
      setEditor(null);
      setDirty(false);
      onDone();
    }
  }
  return (
    <section
      className="map-inspector"
      aria-label="Val och redigering"
      data-selection-kind="object"
      data-selection-id={
        !editor ||
        (editor.version === state.draft.version && editor.contentVersion === state.contentVersion)
          ? initial.id
          : undefined
      }
    >
      {!editor && (
        <>
          {details}
          <button type="button" disabled={pending || blocked} onClick={begin}>
            Redigera valt objekt
          </button>
        </>
      )}
      {editor && (
        <>
          <p className="muted">
            Skriv inte fullständiga konto- eller kortnummer, lösenord, pinkoder, säkerhetskoder
            eller återställningskoder.
          </p>
          <form
            ref={form}
            onSubmit={(event) => {
              event.preventDefault();
              if (editor.displacedFields?.length && !editor.fieldsHandled) return;
              void submit(editor);
            }}
          >
            <fieldset disabled={pending || blocked}>
              <legend>Objektets detaljer</legend>
              <ProfileImageEditor
                householdId={householdId}
                value={editor.value}
                typeName={effectiveTypes.find((type) => type.id === editor.value.typeId)?.name}
                disabled={
                  pending || blocked || dirty || editor.version !== state.draft.version || !object
                }
                onChange={(file) =>
                  void changeImage(editor, file).then((next) => {
                    if (next) setEditor(next);
                  })
                }
              />
              <ObjectIconPicker
                value={editor.value.iconId}
                name={editor.value.name}
                hasImage={Boolean(editor.value.profileImageId)}
                disabled={
                  pending ||
                  blocked ||
                  editor.version !== state.draft.version ||
                  editor.contentVersion !== state.contentVersion
                }
                needsText={dirty || !object}
                onStageText={async () => {
                  if (
                    !form.current?.reportValidity() ||
                    (editor.displacedFields?.length && !editor.fieldsHandled)
                  )
                    return false;
                  const next = await stageObject(editor);
                  if (!next) return false;
                  setEditor(next);
                  setDirty(false);
                  return true;
                }}
                onChange={async (iconId) => {
                  const value = { ...editor.value };
                  if (iconId) value.iconId = iconId;
                  else delete value.iconId;
                  const next = await stageObject({ ...editor, value });
                  if (!next) return false;
                  setEditor(next);
                  return true;
                }}
              />
              <label htmlFor={`${prefix}-object-name`}>Objektets namn</label>
              <input
                ref={nameInput}
                id={`${prefix}-object-name`}
                required
                maxLength={200}
                value={editor.value.name}
                onChange={(event) => {
                  setDirty(true);
                  onName(event.target.value);
                  setEditor({
                    ...editor,
                    value: { ...editor.value, name: event.target.value },
                  });
                }}
              />
              <label htmlFor={`${prefix}-object-type`}>Objekttyp</label>
              <select
                id={`${prefix}-object-type`}
                required
                value={editor.value.typeId}
                onChange={(event) => {
                  setDirty(true);
                  const previousType = effectiveTypes.find(
                    (type) => type.id === editor.value.typeId,
                  );
                  const values = editor.value.customValues ?? {};
                  const displacedFields = [...(editor.displacedFields ?? [])];
                  if (previousType && Object.keys(values).length)
                    displacedFields.push({
                      id: crypto.randomUUID(),
                      type: previousType,
                      values,
                    });
                  setEditor({
                    ...editor,
                    displacedFields,
                    fieldsHandled: false,
                    typeRevision:
                      effectiveTypes.find((type) => type.id === event.target.value)?.revision ?? 0,
                    value: {
                      ...editor.value,
                      typeId: event.target.value,
                      customValues: {},
                    },
                  });
                }}
              >
                {effectiveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
              <p>
                Ett typbyte behåller objektet och alla dess samband. Den nya typens fält börjar
                obesvarade. Fyll själv i uppgifterna som ska gälla efter bytet.
              </p>
              {!!editor.displacedFields?.length && (
                <section aria-label="Tidigare fältvärden">
                  <h3>Tidigare fältvärden</h3>
                  {editor.displacedFields.map(({ id, type, values }) => (
                    <div key={id}>
                      <p>Objekttyp: {type.name}</p>
                      <CustomFieldsDetails type={type} values={values} />
                    </div>
                  ))}
                  <p>
                    Dessa värden följer inte med till den nya typen. För över de uppgifter du vill
                    behålla genom att fylla i de nya fälten. Tidigare sparade uppgifter finns kvar i
                    historiken.
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={editor.fieldsHandled ?? false}
                      onChange={(event) =>
                        setEditor({ ...editor, fieldsHandled: event.target.checked })
                      }
                    />
                    Jag har hanterat tidigare fältvärden för typbytet
                  </label>
                </section>
              )}
              <label htmlFor={`${prefix}-object-identity`}>Objektets identitet</label>
              <select
                id={`${prefix}-object-identity`}
                value={editor.value.identity ?? 'identified'}
                onChange={(event) => {
                  setDirty(true);
                  const value = { ...editor.value };
                  if (event.target.value === 'identified') delete value.identity;
                  else value.identity = event.target.value as 'unspecified' | 'unresolved';
                  setEditor({ ...editor, value });
                }}
              >
                <option value="identified">Identifierat objekt</option>
                <option value="unspecified">Ospecificerat objekt</option>
                <option value="unresolved">Obesvarad identitetsfråga</option>
              </select>
              <label htmlFor={`${prefix}-object-description`}>Beskrivning</label>
              <textarea
                id={`${prefix}-object-description`}
                maxLength={2000}
                value={editor.value.description}
                onChange={(event) => {
                  setDirty(true);
                  setEditor({
                    ...editor,
                    value: { ...editor.value, description: event.target.value },
                  });
                }}
              />
              <CustomFieldsEditor
                type={effectiveTypes.find((type) => type.id === editor.value.typeId)}
                values={editor.value.customValues}
                onChange={(customValues) => {
                  setDirty(true);
                  setEditor({ ...editor, value: { ...editor.value, customValues } });
                }}
              />
              <p>Texten i formuläret skickas först när du lägger den i utkastet.</p>
              <LifecycleEditor
                kind="object"
                value={editor.value.lifecycle}
                onChange={(lifecycle) => {
                  setDirty(true);
                  setEditor({ ...editor, value: { ...editor.value, lifecycle } });
                }}
              />
              <FinancialFactsEditor
                key={editor.id}
                facts={editor.value.financialFacts}
                onChange={(financialFacts) => {
                  setDirty(true);
                  const value = { ...editor.value };
                  if (Object.keys(financialFacts).length) value.financialFacts = financialFacts;
                  else delete value.financialFacts;
                  setEditor({ ...editor, value });
                }}
              />
              {editor.version !== state.draft.version && (
                <p role="alert">
                  Formuläret bygger på ett äldre utkast. Kopiera eventuell text du vill behålla,
                  stäng formuläret och öppna objektets aktuella förslag innan du fortsätter.
                </p>
              )}
              <div className="access-actions">
                <button
                  type="submit"
                  disabled={
                    editor.version !== state.draft.version ||
                    (!!editor.displacedFields?.length && !editor.fieldsHandled)
                  }
                >
                  Lägg i mitt utkast
                </button>
                {(editor.baseRevision !== null ||
                  state.draft.changes.some((change) => change.id === editor.id)) && (
                  <button
                    type="button"
                    aria-describedby={`${prefix}-editor-removal`}
                    disabled={dirty || editor.version !== state.draft.version}
                    onClick={() =>
                      void submit({
                        version: editor.version,
                        contentVersion: editor.contentVersion,
                        id: editor.id,
                        baseRevision: editor.baseRevision,
                        value: null,
                      })
                    }
                  >
                    Ta bort
                  </button>
                )}
              </div>
              {(editor.baseRevision !== null ||
                state.draft.changes.some((change) => change.id === editor.id)) && (
                <ObjectRemovalNotice
                  state={state}
                  objectId={editor.id}
                  id={`${prefix}-editor-removal`}
                />
              )}
            </fieldset>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setEditor(null);
                setDirty(false);
                onDone();
              }}
            >
              Stäng utan att skicka texten
            </button>
          </form>
        </>
      )}
      {relationships}
    </section>
  );
}
