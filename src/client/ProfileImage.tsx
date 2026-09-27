import { useId, useState } from 'react';
import type { ObjectValue } from '../shared/map.js';
import { objectIconLabel } from '../shared/object-icons.js';
import { SpatialObjectGlyph } from './SpatialObjectGlyph.js';

export function ProfileImage({
  householdId,
  value,
  typeName,
  compact = false,
}: {
  compact?: boolean;
  householdId: string;
  value: ObjectValue;
  typeName?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const fallback = (
    <div className="object-appearance">
      <SpatialObjectGlyph
        householdId={householdId}
        name={value.name}
        typeName={typeName ?? ''}
        iconId={value.iconId}
      />
      <span className={compact ? 'object-icon-text' : undefined}>
        Ikon: {objectIconLabel(value.iconId, typeName)}
      </span>
    </div>
  );
  return value.profileImageId ? (
    failed === value.profileImageId ? (
      <>
        <p>Profilbilden kunde inte hämtas. Hämta aktuellt underlag.</p>
        {fallback}
      </>
    ) : (
      <img
        className="profile-image"
        width="96"
        height="96"
        src={`/api/households/${encodeURIComponent(householdId)}/profile-images/${encodeURIComponent(value.profileImageId)}`}
        alt={`Profilbild för ${value.name}`}
        onError={() => setFailed(value.profileImageId ?? null)}
      />
    )
  ) : (
    <>
      {!compact && <p>Ingen profilbild</p>}
      {fallback}
    </>
  );
}

export function ProfileImageEditor({
  householdId,
  value,
  disabled,
  onChange,
  typeName,
}: {
  householdId: string;
  value: ObjectValue;
  disabled: boolean;
  typeName?: string;
  onChange: (file: File | null) => void;
}) {
  const inputId = useId();
  return (
    <div className="profile-image-editor">
      <h3>Profilbild</h3>
      <ProfileImage householdId={householdId} value={value} typeName={typeName} />
      <p>
        JPEG, PNG eller WebP, högst 10 MB och 40 miljoner bildpunkter. Bilden blir högst 300 × 300
        bildpunkter. En animerad bild blir en stillbild.
      </p>
      <p>
        Lägg först objektet och eventuell oskickad text i ditt utkast. Bildvalet blir sedan ett
        privat förslag. Spara hela utkastet för att dela det.
      </p>
      <label htmlFor={inputId}>Välj profilbild</label>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) onChange(file);
        }}
      />
      {value.profileImageId && (
        <button type="button" disabled={disabled} onClick={() => onChange(null)}>
          Ta bort profilbild
        </button>
      )}
    </div>
  );
}
