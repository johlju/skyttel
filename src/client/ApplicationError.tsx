import { useEffect, useRef } from 'react';

export function ApplicationError() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className="app-shell">
      <main>
        <section className="panel" aria-labelledby="application-error-heading">
          <h1 id="application-error-heading" ref={heading} tabIndex={-1}>
            Något gick fel i Skyttel
          </h1>
          <p>Ladda om sidan för att försöka igen.</p>
          <p>Kontakta administratören om problemet kvarstår.</p>
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Ladda om Skyttel
          </button>
        </section>
      </main>
    </div>
  );
}
