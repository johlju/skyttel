// Layout adapted from Viscalyx CookieSettings; see CookieStorage.LICENSE.
import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router';
import { rememberedLoginInformation } from '../shared/remembered-login.js';
import referenceLicense from './CookieStorage.LICENSE?url&no-inline';
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
    save,
    checkAgain,
  } = useStoragePreference(userId);
  useLayoutEffect(() => heading.current?.focus(), []);
  return (
    <article className="cookie-storage">
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
      <h2>Lagringskategorier</h2>
      <section className="cookie-storage-card" aria-labelledby="necessary-storage-title">
        <h3 id="necessary-storage-title">Nödvändig lagring</h3>
        <p className="cookie-storage-badge">Vid begärd funktion</p>
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
        <h3 id="remember-storage-title">Ihågkommen inloggning</h3>
        <p>
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
        {userId && saved && (
          <label className="cookie-storage-choice">
            <span>Ihågkommen inloggning</span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={requested}
              checked={requested}
              disabled={
                !saved.remembered ||
                state === 'saving' ||
                state === 'checking' ||
                state === 'unknown'
              }
              onChange={(event) => setRequested(event.target.checked)}
            />
          </label>
        )}
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
          fysisk radering av serveruppgifter eller säkerhetskopior. Beslutade gallringsfrister är
          inte verifierade driftfakta: avslutade sessioner och förbrukade eller utgångna
          OAuth-försök ska gallras inom 24 timmar från avslut respektive förbrukning eller utgång.
          Resultatkontroll ska ha 24 timmar från ändringen. Berörda säkerhetskopior ska behållas
          högst 30 dygn från ursprunglig kopiering. Faktisk gallring och hantering av kopior behöver
          verifieras i drift.
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
          <p role="status">
            {state === 'saving'
              ? 'Sparar…'
              : state === 'checking'
                ? 'Kontrollerar samma åtgärd…'
                : state === 'saved'
                  ? `Ihågkommen inloggning är avstängd. ${reauthenticated ? 'Resultatet gäller din tidigare begäran. Du har loggat in på nytt.' : continued ? 'Du är fortfarande inloggad.' : 'Logga in igen för att fortsätta.'}`
                  : ''}
          </p>
          <p role="alert">
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
            <button
              type="button"
              aria-disabled={state !== 'unknown'}
              onClick={() => void checkAgain()}
            >
              Kontrollera igen
            </button>
          )}
          <button
            type="button"
            aria-disabled={
              !dirty || state === 'saving' || state === 'checking' || state === 'unknown'
            }
            onClick={() => void save()}
          >
            Spara inställningar
          </button>
        </div>
      )}
      <p>
        Formulärets utseende bygger på Viscalyx CookieSettings.{' '}
        <a href={referenceLicense}>Licens för formulärets förebild (MIT)</a>
      </p>
    </article>
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
