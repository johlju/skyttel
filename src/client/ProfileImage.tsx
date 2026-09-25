import { useState } from 'react';
import type { ObjectValue } from '../shared/map.js';

export function ProfileImage({ householdId, value }: { householdId: string; value: ObjectValue }) {
  const [failed, setFailed] = useState<string | null>(null);
  return value.profileImageId ? (
    failed === value.profileImageId ? (
      <p>Profilbilden kunde inte hämtas. Hämta aktuellt underlag.</p>
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
    <p>Ingen profilbild</p>
  );
}

export function ProfileImageEditor({
  householdId,
  value,
  disabled,
  onChange,
}: {
  householdId: string;
  value: ObjectValue;
  disabled: boolean;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="profile-image-editor">
      <h3>Profilbild</h3>
      <ProfileImage householdId={householdId} value={value} />
      <p>
        JPEG, PNG eller WebP, högst 10 MB och 40 miljoner bildpunkter. Bilden blir högst 300 × 300
        bildpunkter. En animerad bild blir en stillbild.
      </p>
      <p>
        Lägg först objektet och eventuell oskickad text i ditt utkast. Bildvalet blir sedan ett
        privat förslag. Spara hela utkastet för att dela det.
      </p>
      <label htmlFor="profile-image">Välj profilbild</label>
      <input
        id="profile-image"
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
