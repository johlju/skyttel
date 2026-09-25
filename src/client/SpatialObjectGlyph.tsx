import { type ReactNode, useState } from 'react';

const typeShapes: Record<string, ReactNode> = {
  Person: (
    <>
      <circle cx="12" cy="7" r="3.5" />
      <path d="M5 21v-3a7 7 0 0 1 14 0v3" />
    </>
  ),
  Företag: (
    <>
      <rect x="5" y="2" width="14" height="20" rx="1" />
      <path d="M9 6h1m4 0h1M9 10h1m4 0h1M9 14h1m4 0h1M10 22v-4h4v4" />
    </>
  ),
  Förening: (
    <>
      <circle cx="12" cy="6" r="3" />
      <path d="M7 20v-3a5 5 0 0 1 10 0v3M5 6a3 3 0 0 0 0 6m14-6a3 3 0 0 1 0 6M2 20v-3a4 4 0 0 1 3-4m14 0a4 4 0 0 1 3 4v3" />
    </>
  ),
  Tjänst: <path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />,
  Tjänstekonto: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <circle cx="8" cy="10" r="2" />
      <path d="M4 17a4 4 0 0 1 8 0m3-8h4m-4 4h4" />
    </>
  ),
  'E-postadress': (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 5 10 8L22 5" />
    </>
  ),
  Bostad: <path d="m2 11 10-9 10 9M5 9v13h14V9M9 22v-8h6v8" />,
  Garage: (
    <>
      <path d="m2 8 10-6 10 6v14H2z" />
      <path d="M6 22V10h12v12M6 14h12M6 18h12" />
    </>
  ),
  Fordon: <path d="m4 10 2-6h12l2 6M3 18v3m18-3v3M3 10h18v8H3zM6 14h2m8 0h2" />,
  Abonnemang: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 2v6m8-6v6M4 11h16m-11 4h6m-6 3h4" />
    </>
  ),
  Avtal: <path d="M5 2h9l5 5v15H5zM14 2v5h5M8 11h8m-8 4h8m-8 4h5" />,
  Hyresavtal: <path d="M5 2h9l5 5v15H5zM14 2v5h5m-11 7 4-4 4 4m-7-1v5h6v-5" />,
  Låneavtal: <path d="M5 2h9l5 5v15H5zM14 2v5h5M8 14h8m-3-3 3 3-3 3" />,
  Kreditavtal: <path d="M5 2h9l5 5v15H5zM14 2v5h5m-7 3v5m-3-2.5h6M9 19h6" />,
  Avbetalningsavtal: <path d="M5 2h9l5 5v15H5zM14 2v5h5M8 18h3v-3h3v-3h2" />,
  Skuld: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3m8-9v4M4 12v6c0 1.7 3.6 3 8 3m3-4h7" />
    </>
  ),
  Kreditutrymme: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18m-9 3v5m-2.5-2.5h5" />
    </>
  ),
  'Utnyttjad kredit': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18m-12 5.5h6" />
    </>
  ),
  Betalningsmedel: <path d="M20 7V4H5a3 3 0 0 0 0 6h17v10H5a3 3 0 0 1-3-3V7m20 7h-5v3h5" />,
  Bankkonto: <path d="m2 8 10-6 10 6H2zm3 3v7m7-7v7m7-7v7M2 22h20M3 18h18" />,
  Kort: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
};

export function SpatialObjectGlyph({
  typeName,
  name,
  householdId,
  profileImageId,
}: {
  typeName: string;
  name: string;
  householdId: string;
  profileImageId?: string | null;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl = profileImageId
    ? `/api/households/${encodeURIComponent(householdId)}/profile-images/${encodeURIComponent(profileImageId)}`
    : null;

  if (imageUrl && failedImageUrl !== imageUrl) {
    return (
      <img
        className="spatial-portrait"
        src={imageUrl}
        alt={`Profilbild för ${name}`}
        onError={() => setFailedImageUrl(imageUrl)}
      />
    );
  }

  return (
    <svg
      className="spatial-type-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {Object.hasOwn(typeShapes, typeName) ? (
        typeShapes[typeName]
      ) : (
        <circle cx="12" cy="12" r="8" />
      )}
    </svg>
  );
}
