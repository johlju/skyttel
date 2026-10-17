import { useEffect, useRef, useState } from 'react';
import { FormLossGuard } from './FormLossGuard.js';
import { request } from './map-request.js';

export function PolicyContact() {
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState<string>();
  const [state, setState] = useState('loading');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const controller = new AbortController();
    void request<{ email: string | null }>('/api/policy-contact', undefined, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setEmail(value.email ?? '');
        setSaved(value.email ?? '');
        setState('idle');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="cookie-storage">
      <h1 ref={heading} tabIndex={-1}>
        Policykontakt
      </h1>
      <p>
        Installationens publika kontaktadress för frågor om kakor och lagring. Endast
        installationsansvarig får ändra den.
      </p>
      <FormLossGuard
        dirty={saved !== undefined && email !== saved}
        busy={state === 'saving'}
        onDiscard={() => setEmail(saved ?? '')}
        onBlocked={() => {}}
      />
      {!saved && state !== 'loading' && (
        <p role="alert">
          Policykontakt saknas. Den publika policyn hänvisar till den som ansvarar för
          installationen.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (state === 'saving') return;
          setState('saving');
          void request<{ email: string | null }>('/api/operator/policy-contact', {
            email: email.trim(),
          })
            .then((value) => {
              setSaved(value.email ?? '');
              setEmail(value.email ?? '');
              setState('saved');
            })
            .catch(() => setState('error'));
        }}
      >
        <label>
          Kontaktadress för kakpolicyn{' '}
          <input
            type="email"
            maxLength={254}
            value={email}
            disabled={saved === undefined || state === 'saving'}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button type="submit" disabled={saved === undefined || state === 'saving'}>
          Spara policykontakt
        </button>
        <p role="status">
          {state === 'saving' ? 'Sparar…' : state === 'saved' ? 'Policykontakten är sparad.' : ''}
        </p>
        {state === 'error' && (
          <p role="alert">
            Policykontakten kunde inte sparas eller läsas. Kontrollera adressen och försök igen.
          </p>
        )}
      </form>
    </section>
  );
}
