// Layout adapted from Viscalyx CookieSettings; see CookieStorage.LICENSE.
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { rememberedLoginInformation } from '../shared/remembered-login.js';
import referenceLicense from './CookieStorage.LICENSE?url&no-inline';
import { FormLossGuard } from './FormLossGuard.js';
import { trapDialogTab, usableFocusTarget } from './modal-focus.js';
import { useStoragePreference } from './use-storage-preference.js';
import './cookie-storage.css';

const entries = [
  {
    name: '__Host-skyttel_binding',
    place:
      'Säkerhetskaka på Skyttels kanoniska HTTPS-adress. Lokal utveckling på HTTP-loopback använder skyttel_binding.',
    content:
      'En slumpmässig, ogenomskinlig nyckel binder begärda inloggningsförsök i samma webbläsare. Skapas först när du begär inloggning. Första lyckade inloggningen ersätter den tidigare inom bindningen och avslutar andra påbörjade försök. Utloggning avslutar åtkomsten och pågående försök här, utan att påverka andra bindningar. Nyckeln ger ingen egen åtkomst och är inte en separat kopia av lagringsvalet.',
    time: 'Börjar som sessionskaka. Efter bekräftad ihågkommen inloggning gäller beständigheten till just den sessionens absoluta utgång, högst sju dygn från inloggningen. Vanlig inloggning använder sessionskaka och gäller högst åtta timmar. Den har Secure vid HTTPS, SameSite=Lax och Path=/, saknar Domain och kan läsas av JavaScript för samordnad registrering. Serverns behörighet är separat från kakans lagringstid.',
  },
  {
    name: 'better-auth.session_token',
    place: 'Kaka i den här webbläsaren. Vid HTTPS: __Secure-better-auth.session_token.',
    content:
      'Signerad, ogenomskinlig sessionsnyckel. Skyttel använder den för att identifiera din inloggning; den innehåller inte hushållets karta.',
    time: 'Vanlig inloggning använder sessionskaka och gäller högst åtta timmar från inloggningen. Bara ett aktivt Kom ihåg mig-val ger beständig kaka till sessionens absoluta utgång, högst sju dygn från inloggningen. Läsning, återförsök och ny kakutgivning förlänger inte tiden. Utloggning avslutar serveråtkomsten och tar bort kakan. Kakans livstid är inte samma sak som fysisk radering på servern.',
  },
  {
    name: 'better-auth.state',
    place: 'Kaka i den här webbläsaren. Vid HTTPS: __Secure-better-auth.state.',
    content:
      'Signerad kontrollnyckel som binder ett begärt Google- eller Microsoft-inloggningsförsök eller en kontokoppling till webbläsaren. Själva försöket finns på servern.',
    time: 'Kakan gäller i fem minuter från starten och tas bort när svaret kontrolleras. OAuth-försökets serverfrist är separat. En avbruten inloggning ger ingen tillgång till hushållet.',
  },
  {
    name: 'skyttel-storage-operation:<användar-ID>',
    place: 'Webbläsarens sessionStorage i den aktuella fliken.',
    content:
      'Referens till en uttryckligen begärd avstängning och den ursprungliga inloggningens ID. Gör att samma resultat kan kontrolleras efter ett förlorat svar och ny inloggning. Referensen ger ingen behörighet och innehåller inget lagringsval.',
    time: 'Skapas först när du väljer att spara eller bekräftar återställning. Tas bort när utfallet bekräftas eller avvisas. Flikens lagring kan försvinna; rensning kan hindra återhämtning men upprepar inte ändringen. Serverns kontrollfönster är 24 timmar från ändringen.',
  },
  {
    name: 'skyttel-import:<hushålls-ID>',
    place: 'Webbläsarens sessionStorage i den aktuella fliken.',
    content:
      'Importförsökets ID och innehållsversion, så att du kan följa samma begärda återimport efter omladdning. Ingen arkivfil eller hushållskarta lagras här.',
    time: 'Tas bort när återhämtningsflödet avslutas eller flikens lagring försvinner. Webbläsaren kan återställa flikar. Rensning kan hindra lokal återhämtning men upprepar inte importen.',
  },
  {
    name: 'skyttel-erasure:<hushålls-ID>',
    place: 'Webbläsarens sessionStorage i den aktuella fliken.',
    content:
      'Åtgärdens ID för att kontrollera samma begärda permanenta radering efter omladdning. ID:t ger ingen egen behörighet.',
    time: 'Tas bort när återhämtningsflödet avslutas eller flikens lagring försvinner. Rensning raderar inte hushållsinformation och kan hindra lokal återhämtning.',
  },
];

export function CookieStorage({ userId }: { userId?: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [resetOrigin, setResetOrigin] = useState<HTMLButtonElement | null>(null);
  const [resultPlace, setResultPlace] = useState<'save' | 'reset'>('save');
  const resetUser = useRef(userId);
  const {
    saved,
    requested,
    state,
    continued,
    reauthenticated,
    requiresLogin,
    resultChecked,
    recoveryMessage,
    dirty,
    setRequested,
    undo,
    reset,
    save,
    checkAgain,
  } = useStoragePreference(userId);
  const blocked = state === 'saving' || state === 'checking' || state === 'unknown';
  useLayoutEffect(() => heading.current?.focus(), []);
  useLayoutEffect(() => {
    if (resetUser.current !== userId) {
      resetUser.current = userId;
      setResetOrigin(null);
      setResultPlace('save');
    }
  }, [userId]);
  const feedback = (
    <div className="cookie-storage-feedback">
      <p role="status">
        {state === 'saved' && (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="m5 12 4 4L19 6" strokeWidth="2" />
          </svg>
        )}
        {state === 'saving'
          ? 'Sparar…'
          : state === 'checking'
            ? 'Kontrollerar samma åtgärd…'
            : state === 'saved'
              ? `Ihågkommen inloggning är avstängd. ${reauthenticated ? 'Resultatet gäller din tidigare begäran. Du har loggat in på nytt.' : continued ? 'Du är fortfarande inloggad.' : 'Logga in igen för att fortsätta.'}`
              : ''}
        {state === 'saved' && recoveryMessage ? ` ${recoveryMessage}` : ''}
      </p>
      <p role="alert">
        {['rejected', 'unknown', 'unavailable'].includes(state) && (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="m12 3 10 18H2Z M12 9v5m0 3v1" strokeWidth="2" />
          </svg>
        )}
        {state === 'rejected'
          ? 'Ändringen kunde inte sparas. Försök igen.'
          : state === 'unknown'
            ? 'Sparstatus okänd. Vi kunde inte bekräfta om ändringen genomfördes.'
            : state === 'unavailable'
              ? recoveryMessage ||
                'Aktuellt val kunde inte hämtas. Logga in igen för att fortsätta.'
              : ''}
        {state === 'unknown' && recoveryMessage ? ` ${recoveryMessage}` : ''}
      </p>
      {requiresLogin && (
        <p>
          <Link to="/login">Logga in igen</Link>
        </p>
      )}
      {(state === 'unknown' || state === 'checking' || resultChecked) && (
        <button type="button" aria-disabled={state !== 'unknown'} onClick={() => void checkAgain()}>
          Kontrollera igen
        </button>
      )}
    </div>
  );
  return (
    <article className="cookie-storage">
      {userId && (
        <FormLossGuard
          dirty={dirty || state === 'unknown'}
          busy={state === 'saving' || state === 'checking'}
          onDiscard={undo}
          onBlocked={() => {}}
          description={
            state === 'unknown'
              ? 'Utfallet är fortfarande okänt. Åtgärdens referens bevaras i fliken. Du kan behöva logga in igen för att kontrollera samma resultat. Att lämna sidan skickar inget nytt sparande.'
              : 'Dina osparade lagringsval försvinner. Serverns senast bekräftade val ändras inte när du lämnar formuläret.'
          }
        />
      )}
      <header className="cookie-storage-header">
        <div className="cookie-storage-title">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m9 3 1-1h4l1 1 .5 2 2 1 2-.5 2 3-.5 2-1.5 1v2l1.5 1 .5 2-2 3-2-.5-2 1-.5 2-1 1h-4l-1-1-.5-2-2-1-2 .5-2-3 .5-2 1.5-1v-2l-1.5-1-.5-2 2-3 2 .5 2-1Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <h1 ref={heading} tabIndex={-1}>
            Kakor och lagring
          </h1>
        </div>
        <p>
          Läs om den lagring Skyttel behöver för funktioner du begär. Inloggningens lagring gäller
          den här webbläsaren.
        </p>
      </header>
      <section className="cookie-storage-quick" aria-labelledby="storage-quick-title">
        <h2 id="storage-quick-title">Snabbåtgärder</h2>
        <div className="cookie-storage-quick-buttons">
          <button
            type="button"
            className="cookie-storage-primary"
            aria-disabled={!saved?.remembered || !requested || blocked}
            onClick={() => {
              if (saved?.remembered && requested && !blocked) setRequested(false);
            }}
          >
            Stäng av ihågkommen inloggning
          </button>
          <button
            type="button"
            aria-disabled={!dirty || blocked}
            onClick={() => {
              if (dirty && !blocked) undo();
            }}
          >
            Ångra ändring
          </button>
          <button
            type="button"
            className="cookie-storage-reset"
            aria-disabled={!saved?.remembered || blocked}
            onClick={(event) => {
              if (saved?.remembered && !blocked) setResetOrigin(event.currentTarget);
            }}
          >
            Återställ valfri lagring
          </button>
        </div>
        <p>Snabbvalet ändrar formuläret. Spara längst ned för att ändra din inloggning.</p>
        {userId && resultPlace === 'reset' && feedback}
      </section>
      <h2>Lagringskategorier</h2>
      <section className="cookie-storage-card" aria-labelledby="necessary-storage-title">
        <div className="cookie-storage-card-header">
          <h3 id="necessary-storage-title">Nödvändig lagring</h3>
          <span className="cookie-storage-badge">Vid begärd funktion</span>
        </div>
        <p>
          Kakor behövs för säker inloggning och kontokoppling. Fliklagring hjälper dig att följa
          samma import eller permanenta radering som du begär. Den här lagringen har inget
          avstängningsreglage.
        </p>
        <details>
          <summary>Visa nödvändig lagring</summary>
          {entries.map((entry) => (
            <section className="cookie-storage-entry" key={entry.name}>
              <h4>{entry.name}</h4>
              <dl>
                <dt>Plats och namn</dt>
                <dd>{entry.place}</dd>
                <dt>Innehåll och ändamål</dt>
                <dd>{entry.content}</dd>
                <dt>Giltighet, radering och konsekvenser</dt>
                <dd>{entry.time}</dd>
                <dt>Leverantör</dt>
                <dd>Skyttel</dd>
              </dl>
            </section>
          ))}
          <p>
            Better Auth-kakorna har Path=/ och SameSite=Lax, är HttpOnly och får Secure vid HTTPS.
            HttpOnly hindrar sidans JavaScript från att läsa dem. Ingen session eller
            kontoinformation kopieras till en separat cachekaka.
          </p>
        </details>
      </section>
      <section className="cookie-storage-card" aria-labelledby="remember-storage-title">
        <div className="cookie-storage-card-header">
          <h3 id="remember-storage-title">Ihågkommen inloggning</h3>
          {userId && saved && (
            <label className="cookie-storage-choice">
              <input
                type="checkbox"
                role="switch"
                aria-label="Ihågkommen inloggning"
                aria-describedby="storage-remember-description"
                aria-checked={requested}
                checked={requested}
                disabled={!saved.remembered || blocked}
                onChange={(event) => setRequested(event.target.checked)}
              />
              <span aria-hidden="true" />
            </label>
          )}
        </div>
        <p id="storage-remember-description">
          Valfri lagring för att behålla inloggningen mellan webbläsarsessioner. Valet gäller den
          aktuella webbläsarbindningen, inte andra enheter eller webbläsare. Ett aktivt val kräver
          en uttrycklig handling; att stänga informationen eller fortsätta använda Skyttel
          registrerar inget val.
        </p>
        <details>
          <summary>Information och valflöde, version {rememberedLoginInformation.version}</summary>
          <p>{rememberedLoginInformation.text}</p>
          <p>{rememberedLoginInformation.flow}</p>
          <p>
            Skyttel kontrollerar aktuell inloggning och serverns val efter återkomsten. Bekräftelsen
            lovar inte att webbläsaren behåller kakorna efter en omstart.
          </p>
        </details>
        <p>
          En sessionskaka garanterar inte utloggning när du stänger ett fönster. Webbläsare kan
          återställa sessioner. Logga ut på en delad dator.
        </p>
        {saved && !saved.remembered && (
          <p>
            <Link to="/login">Logga in på nytt och välj Kom ihåg mig.</Link>
          </p>
        )}
        {userId && !saved && state !== 'unavailable' && <p>Läser aktuellt val…</p>}
      </section>
      <section className="cookie-storage-card" aria-labelledby="server-storage-title">
        <h3 id="server-storage-title">Uppgifter på Skyttels server</h3>
        <p>
          Skyttel lagrar kontot, kopplade Google- och Microsoft-identiteter, krypterade
          leverantörstoken, sessioner och tidsbegränsade verifierings- och kontokopplingsförsök. Det
          behövs för säker inloggning och rätt åtkomst. Hushållets information, ditt utkast,
          sparförsök och sparkvitton lagras separat från webbläsarens kakor.
        </p>
        <p>
          Valets strukturversion, aktiva val, informationsversion och serverns beslutstid binds till
          rätt försök. Den skapade sessionen får samma valunderlag och en absolut utgång. Det är
          ingen kontopreferens eller separat valhistorik.
        </p>
        <p>
          Resultat av begärd import och permanent radering finns på servern för återhämtning. Ett
          lokalt åtgärds-ID ersätter aldrig serverns behörighetskontroll.
        </p>
        <p>
          Efter avstängning av ihågkommen inloggning sparar servern ett minimalt åtgärdsresultat för
          din användare. Resultatet kan kontrolleras under 24 timmar från ändringen, vid behov efter
          ny inloggning. Referensen ger ingen egen åtkomst och finns inte i en separat historik över
          tidigare val.
        </p>
        <p>
          Serverns behörighet kan upphöra före kakans livstid. Utgången behörighet bevisar inte
          fysisk radering av serveruppgifter eller säkerhetskopior. Automatisk gallring startar vid
          serverstart och varje minut medan tjänsten är igång. Avslutade sessioner och förbrukade
          eller utgångna OAuth-försök ska gallras inom 24 timmar från avslut respektive förbrukning
          eller utgång. Resultatkontroll har 24 timmar från ändringen. Minimala spärruppgifter får
          bara finnas tills berörda nycklar och försök är ogiltiga, högst sju dygn från återkallelse
          eller utloggning och ytterligare högst 24 timmar för gallring. Det är tak, inte
          standardtider. Berörda säkerhetskopior ska behållas högst 30 dygn från ursprunglig
          kopiering. Beslutade frister är inte verifierade driftfakta. Faktisk gallring och
          hantering av kopior behöver verifieras i drift.
        </p>
      </section>
      <section className="cookie-storage-card" aria-labelledby="external-storage-title">
        <h3 id="external-storage-title">Andra webbplatser och samtalsmedgivande</h3>
        <p>
          När du går till Google eller Microsoft för inloggning hanterar de lagring på sina egna
          webbplatser enligt sina villkor. Skyttels sida styr inte den lagringen eller utloggningen
          där.
        </p>
        <p>
          Samtalsmedgivande för OpenAI är ett separat val under Samtal med Skyttel. Information om
          kakor ger inget medgivande till behandling av samtalets uppgifter.
        </p>
      </section>
      {userId && (
        <div className="cookie-storage-actions">
          {dirty && state !== 'unknown' && state !== 'checking' && <p>Osparad ändring.</p>}
          {saved && (
            <p>
              Efter avstängning gäller inloggningen längst till det tidigare slutet eller åtta
              timmar från avstängningen, med 30 minuters inaktivitet. Upprepning förlänger inte
              tiden.
            </p>
          )}
          {resultPlace === 'save' && feedback}
          <button
            type="button"
            aria-disabled={
              !dirty || state === 'saving' || state === 'checking' || state === 'unknown'
            }
            className="cookie-storage-primary"
            onClick={() => {
              if (!dirty || blocked) return;
              setResultPlace('save');
              void save();
            }}
          >
            Spara inställningar
          </button>
        </div>
      )}
      <p>
        Formulärets utseende bygger på Viscalyx CookieSettings.{' '}
        <a href={referenceLicense}>Licens för formulärets förebild (MIT)</a>
      </p>
      {resetOrigin && (
        <StorageResetDialog
          origin={resetOrigin}
          onCancel={() => setResetOrigin(null)}
          onConfirm={() => {
            setResetOrigin(null);
            setResultPlace('reset');
            void reset();
          }}
        />
      )}
    </article>
  );
}

function StorageResetDialog({
  origin,
  onCancel,
  onConfirm,
}: {
  origin: HTMLButtonElement;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const shown = dialog.current;
    shown?.showModal();
    cancel.current?.focus();
    return () => {
      shown?.close();
      if (usableFocusTarget(origin)) origin.focus({ preventScroll: true });
    };
  }, [origin]);
  return (
    <dialog
      ref={dialog}
      className="cookie-storage-reset-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onKeyDown={trapDialogTab}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={`${id}-title`}>Återställ valfri lagring?</h2>
      <div id={`${id}-description`}>
        <p>
          Återställningen stänger av ihågkommen inloggning i den aktuella webbläsarbindningen. Den
          gamla inloggningsnyckeln slutar gälla och äldre påbörjade inloggnings- och
          kontokopplingsförsök här avslutas. Andra webbläsarbindningar påverkas inte.
        </p>
        <p>
          Du får en vanlig inloggning längst till det tidigare slutet eller åtta timmar från
          avstängningen, med 30 minuters inaktivitet. Fortsatt inloggning kontrolleras separat; du
          kan behöva logga in igen. Ny aktivering kräver ny inloggning och Kom ihåg mig.
        </p>
        <p>
          Flikens återhämtningsuppgifter för import och permanent radering med osäkert utfall,
          kontots tema, personliga vyer, hushållets information och samtalsmedgivande bevaras.
          Nödvändig lagring rensas inte. Google och Microsoft styr sin egen lagring.
        </p>
      </div>
      <footer>
        <button ref={cancel} type="button" onClick={onCancel}>
          Avbryt
        </button>
        <button type="button" className="cookie-storage-reset" onClick={onConfirm}>
          Återställ
        </button>
      </footer>
    </dialog>
  );
}

export function StorageIntroduction({ onClose }: { onClose: () => void }) {
  return (
    <section className="storage-introduction" aria-labelledby="storage-introduction-title">
      <h2 id="storage-introduction-title">Om kakor och lagring</h2>
      <p>
        Skyttel använder lagring för funktioner du begär, till exempel säker inloggning. Att stänga
        den här informationen eller fortsätta använda Skyttel registrerar inget lagringsval.
      </p>
      <Link to="/cookies">Kakor och lagring</Link>
      <button type="button" onClick={onClose}>
        Stäng informationen
      </button>
    </section>
  );
}
