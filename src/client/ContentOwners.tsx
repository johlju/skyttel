import { useState } from 'react';
import type { ContentOwners as OwnerState } from '../shared/content-owners.js';
import { MapRequestError, request } from './map-request.js';

export function ContentOwners({
  householdId,
  onAccessLost,
}: {
  householdId: string;
  onAccessLost: () => void;
}) {
  const path = `/api/households/${encodeURIComponent(householdId)}/content-owners`;
  const [state, setState] = useState<OwnerState | null>(null);
  const [identityId, setIdentityId] = useState('');
  const [userId, setUserId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  function fail(failure: unknown, writing: boolean) {
    if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) {
      setState(null);
      onAccessLost();
    }
    const conflict =
      failure instanceof MapRequestError &&
      [
        'content_conflict',
        'identity_unavailable',
        'verified_member_required',
        'content_maintenance',
      ].includes(failure.code);
    if (writing)
      setUncertain(!conflict && !(failure instanceof MapRequestError && failure.status < 500));
    setError(
      conflict
        ? 'Underlaget eller åtkomsten har ändrats. Hämta aktuella innehållskopplingar och granska igen.'
        : writing
          ? 'Utfallet är okänt. Hämta aktuella innehållskopplingar och kontrollera vem som är kopplad innan du fortsätter.'
          : 'Innehållskopplingarna kunde inte hämtas. Kontrollera anslutningen och försök igen.',
    );
  }
  async function load() {
    if (pending) return;
    setPending(true);
    setError('');
    setStatus('');
    setConfirmed(false);
    try {
      setState(await request<OwnerState>(path));
      setUncertain(false);
      setIdentityId('');
      setUserId('');
      setStatus(
        'Aktuella innehållskopplingar är hämtade. Granska den visade kopplingen efter ett osäkert resultat.',
      );
    } catch (failure) {
      fail(failure, false);
    } finally {
      setPending(false);
    }
  }
  async function assign() {
    if (!state || !identityId || !confirmed || pending || uncertain) return;
    setPending(true);
    setError('');
    setStatus('');
    try {
      const result = await request<OwnerState>(`${path}/assign`, {
        identityId,
        userId: userId || null,
        contentVersion: state.contentVersion,
        confirmed: true,
      });
      setState(result);
      setConfirmed(false);
      setStatus('Innehållskopplingen är sparad.');
    } catch (failure) {
      setConfirmed(false);
      fail(failure, true);
    } finally {
      setPending(false);
    }
  }
  const selected = state?.identities.find((item) => item.id === identityId);
  const displaced = state?.identities.find(
    (item) => item.userId === userId && item.id !== identityId,
  );
  const memberName = (id: string | null) =>
    state?.members.find((item) => item.userId === id)?.name ?? 'Ingen aktuell medlem';
  return (
    <section aria-labelledby="content-owners-heading" aria-busy={pending}>
      <h2 id="content-owners-heading" className="section-heading">
        Koppla historiskt innehåll
      </h2>
      <p>
        En importerad identitet ger ingen åtkomst. Koppla dess privata utkast och personliga vy till
        en identifierad medlem som redan har loggat in och fått tillgång här. Jämför personens
        aktuella användar-ID med den historiska identiteten; samma namn eller e-postadress är inget
        bevis.
      </p>
      <p>
        Medlemskap och inloggningssätt hanteras separat. Den gamla inloggningen behöver inte bevisas
        för denna innehållskoppling. Historiska författare och kvitton ändras inte.
      </p>
      <button type="button" disabled={pending} onClick={() => void load()}>
        Hämta aktuella innehållskopplingar
      </button>
      {state && (
        <fieldset disabled={pending || uncertain}>
          <legend>Granska kopplingen</legend>
          <label>
            Historisk innehållsidentitet
            <select
              value={identityId}
              onChange={(event) => {
                setIdentityId(event.target.value);
                setConfirmed(false);
                setStatus('');
              }}
            >
              <option value="">Välj identitet</option>
              {state.identities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {item.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Aktuell verifierad medlem
            <select
              value={userId}
              onChange={(event) => {
                setUserId(event.target.value);
                setConfirmed(false);
                setStatus('');
              }}
            >
              <option value="">Ingen aktuell ägare</option>
              {state.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name} — {member.userId}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <>
              <p>
                Nuvarande koppling: {memberName(selected.userId)}
                {selected.userId ? ` (${selected.userId})` : ''}. Den historiska identiteten har{' '}
                {selected.draftChanges} privata förslag och {selected.positions} personliga
                placeringar{selected.hasViewSettings ? ' samt egna visningsinställningar' : ''}.
              </p>
              {displaced && (
                <p>
                  Den valda medlemmen lämnar {displaced.name} ({displaced.id}) med{' '}
                  {displaced.draftChanges} privata förslag och {displaced.positions} placeringar
                  {displaced.hasViewSettings ? ' samt egna visningsinställningar' : ''}. Dessa
                  uppgifter bevaras utan aktuell ägare och kan kopplas tillbaka; inget slås ihop
                  eller skrivs över.
                </p>
              )}
              <p>
                En tidigare kopplad medlem behåller sin åtkomst till hushållet men lämnar denna
                privata vy. Alla klienter måste läsa in nytt underlag. {state.pendingOperations}{' '}
                väntande sparförsök blir ogiltiga; deras utkast och tidigare beständiga kvitton
                bevaras.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                Jag har identifierat rätt person och vill ändra denna innehållskoppling med de
                visade följderna.
              </label>
              <button type="button" disabled={!confirmed} onClick={() => void assign()}>
                Bekräfta innehållskopplingen
              </button>
            </>
          )}
        </fieldset>
      )}
      {status && <p role="status">{status}</p>}
      {status === 'Innehållskopplingen är sparad.' && (
        <p>
          Läs in hushållet igen innan du fortsätter med kartan. Kontrollera de bevarade privata
          uppgifterna för den valda medlemmen.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
