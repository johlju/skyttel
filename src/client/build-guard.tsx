import { useEffect, useState } from 'react';
import { buildIdentity } from '../shared/build-identity.js';

export const buildHeader = `${buildIdentity.commit}:${buildIdentity.version}`;

export function notifyOutdatedClient(code: unknown) {
  if (code === 'client_outdated') window.dispatchEvent(new Event('skyttel-client-outdated'));
}

export function BuildNotice() {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    const notify = () => setOutdated(true);
    window.addEventListener('skyttel-client-outdated', notify);
    return () => window.removeEventListener('skyttel-client-outdated', notify);
  }, []);
  if (!outdated) return null;
  return (
    <section role="alert">
      <p>
        Skyttel har uppdaterats. Kopiera osänd text innan du laddar om sidan. Det senaste anropet
        avvisades. Kontrollera tidigare sparförsök efter omladdning.
      </p>
      <button type="button" onClick={() => window.location.reload()}>
        Ladda om Skyttel
      </button>
    </section>
  );
}
