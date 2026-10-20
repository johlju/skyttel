import { useId } from 'react';
import { hasEnded, type Lifecycle, type LifecycleValue } from '../shared/lifecycle.js';

export function LifecycleStatus({ value }: { value: LifecycleValue }) {
  return hasEnded(value) ? <span className="ended-status">Upphört</span> : null;
}

export function LifecycleDetails({ value }: { value: LifecycleValue }) {
  return (
    <>
      <p>Status: {value.lifecycle === 'ended' ? 'Manuellt upphört' : 'Gäller fortfarande'}</p>
      <LifecycleStatus value={value} />
    </>
  );
}

export function LifecycleEditor({
  kind,
  value,
  onChange,
}: {
  kind: 'object' | 'relationship';
  value?: Lifecycle;
  onChange: (value: Lifecycle | undefined) => void;
}) {
  const prefix = useId();
  return (
    <>
      <label htmlFor={`${prefix}-${kind}-status`}>
        {kind === 'object' ? 'Objektets status' : 'Sambandets status'}
      </label>
      <select
        id={`${prefix}-${kind}-status`}
        value={value ?? 'active'}
        onChange={(event) => onChange(event.target.value as Lifecycle)}
      >
        <option value="ended">Upphört</option>
        <option value="active">Gäller fortfarande</option>
      </select>
      <p>Välj status uttryckligen. En egenskap med etiketten Slutdatum ändrar inte status.</p>
    </>
  );
}
