import { useId } from 'react';
import { type FinancialFact, financialFields } from '../shared/financial-facts.js';
import type { BuiltinProperty, ObjectType, ObjectValue } from '../shared/map.js';
import { objectTypePresentation } from '../shared/map.js';
import {
  builtinProperties,
  type ObjectProperty,
  objectProperties,
} from '../shared/object-properties.js';
import {
  FinancialFactDetails,
  FinancialFactEditor,
  FinancialFactsDetails,
  FinancialFactsEditor,
} from './FinancialFacts.js';
import {
  CustomFieldsDetails,
  CustomFieldsEditor,
  CustomFieldValueDetails,
  CustomFieldValueEditor,
} from './ObjectTypes.js';

function DescriptionEditor({
  value,
  label = 'Beskrivning',
  onChange,
}: {
  value: string;
  label?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        maxLength={2000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </>
  );
}
const outsideLabel = 'Uppgifter utanför typens avsnitt';
const retainedExplanation =
  'Gemensamma uppgifter finns kvar även när de döljs i typens avsnitt eller objektet byter typ.';

export function ObjectPropertiesEditor({
  type = {},
  value,
  onChange,
}: {
  type?: Pick<ObjectType, 'fields' | 'sections' | 'builtins' | 'propertyOrder'>;
  value: ObjectValue;
  onChange: (value: ObjectValue) => void;
}) {
  function changeFact(key: Exclude<BuiltinProperty['key'], 'description'>, fact?: FinancialFact) {
    const financialFacts = { ...value.financialFacts };
    if (fact) financialFacts[key] = fact;
    else delete financialFacts[key];
    changeFacts(financialFacts);
  }
  function changeFacts(financialFacts: ObjectValue['financialFacts']) {
    const next = { ...value };
    if (Object.keys(financialFacts ?? {}).length) next.financialFacts = financialFacts;
    else delete next.financialFacts;
    onChange(next);
  }
  const description = (label?: string) => (
    <DescriptionEditor
      label={label}
      value={value.description}
      onChange={(description) => onChange({ ...value, description })}
    />
  );
  if (type.builtins === undefined && type.propertyOrder === undefined)
    return (
      <>
        {description()}
        <CustomFieldsEditor
          type={type}
          values={value.customValues}
          onChange={(customValues) => onChange({ ...value, customValues })}
        />
        <FinancialFactsEditor facts={value.financialFacts} onChange={changeFacts} />
      </>
    );
  const properties = objectProperties(type);
  const visibleBuiltins = properties
    .filter((property) => property.kind === 'builtin' && property.sectionId)
    .map(({ ref }) => ref);
  function editor(property: ObjectProperty) {
    if (property.kind === 'custom')
      return (
        <CustomFieldValueEditor
          field={property.field}
          value={value.customValues?.[property.field.id]}
          onChange={(answer) => {
            const customValues = { ...value.customValues };
            if (answer === undefined) delete customValues[property.field.id];
            else customValues[property.field.id] = answer;
            onChange({ ...value, customValues });
          }}
        />
      );
    const key = property.field.key;
    const field = financialFields.find((field) => field.key === key);
    return (
      <>
        <p>Gemensam egenskap: {builtinProperties.find((field) => field.key === key)?.label}.</p>
        {field ? (
          <FinancialFactEditor
            field={field}
            label={property.name}
            fact={value.financialFacts?.[field.key]}
            onChange={(fact) => changeFact(field.key, fact)}
          />
        ) : (
          description(property.name)
        )}
      </>
    );
  }
  return (
    <>
      {objectTypePresentation(type).sections.map((section) => {
        const entries = properties.filter(({ sectionId }) => sectionId === section.id);
        return (
          entries.length > 0 && (
            <fieldset className="custom-field-section" key={section.id}>
              <legend>{section.name}</legend>
              {entries.map((property) => (
                <div key={property.ref}>{editor(property)}</div>
              ))}
            </fieldset>
          )
        );
      })}
      <details className="custom-field-section" open>
        <summary>{outsideLabel}</summary>
        <p>{retainedExplanation}</p>
        {!visibleBuiltins.includes('builtin:description') && description()}
        <FinancialFactsEditor
          facts={value.financialFacts}
          fields={financialFields.filter(({ key }) => !visibleBuiltins.includes(`builtin:${key}`))}
          onChange={changeFacts}
        />
      </details>
    </>
  );
}

export function ObjectPropertiesDetails({
  type = {},
  value,
  showHidden = false,
}: {
  type?: Pick<ObjectType, 'fields' | 'sections' | 'builtins' | 'propertyOrder'>;
  value: ObjectValue;
  showHidden?: boolean;
}) {
  if (type.builtins === undefined && type.propertyOrder === undefined)
    return (
      <>
        <p>Beskrivning: {value.description || 'Ingen beskrivning'}</p>
        <FinancialFactsDetails facts={value.financialFacts} />
        <CustomFieldsDetails type={type} values={value.customValues} showHidden={showHidden} />
      </>
    );
  const properties = objectProperties(type);
  const visibleBuiltins = properties
    .filter((property) => property.kind === 'builtin' && property.sectionId)
    .map(({ ref }) => ref);
  const outside = builtinProperties.filter(
    ({ key }) =>
      !visibleBuiltins.includes(`builtin:${key}`) &&
      (key === 'description' ? value.description.trim() : value.financialFacts?.[key]),
  );
  function builtin(key: BuiltinProperty['key'], label: string) {
    return key === 'description' ? (
      <p>
        {label}: {value.description || 'Ingen beskrivning'}
      </p>
    ) : value.financialFacts?.[key] ? (
      <FinancialFactDetails label={label} fact={value.financialFacts[key]} />
    ) : (
      <p>{label}: Ej uppgivet</p>
    );
  }
  return (
    <>
      {objectTypePresentation(type).sections.map((section) => {
        const entries = properties.filter(({ sectionId }) => sectionId === section.id);
        return (
          entries.length > 0 && (
            <section className="custom-field-section" key={section.id} aria-label={section.name}>
              <h4>{section.name}</h4>
              {entries.map((property) => (
                <div key={property.ref}>
                  {property.kind === 'builtin' ? (
                    builtin(property.field.key, property.name)
                  ) : (
                    <CustomFieldValueDetails
                      name={property.name}
                      value={value.customValues?.[property.field.id]}
                    />
                  )}
                </div>
              ))}
            </section>
          )
        );
      })}
      {outside.length > 0 && (
        <section className="custom-field-section" aria-label={outsideLabel}>
          <h4>{outsideLabel}</h4>
          <p>{retainedExplanation}</p>
          {outside.map(({ key, label }) => (
            <div key={key}>{builtin(key, label)}</div>
          ))}
        </section>
      )}
      {showHidden && (
        <CustomFieldsDetails
          type={{ fields: objectTypePresentation(type).fields, sections: [] }}
          values={value.customValues}
          showHidden
        />
      )}
    </>
  );
}
