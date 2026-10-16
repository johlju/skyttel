// Layout adapted from Viscalyx CookieSettings; see CookieStorage.LICENSE.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { rememberedLoginInformation } from '../shared/remembered-login.js';
import { cookiePolicyPublishedAt } from '../shared/storage-consent.js';
import referenceLicense from './CookieStorage.LICENSE?url&no-inline';
import { FormLossGuard } from './FormLossGuard.js';
import { trapDialogTab, usableFocusTarget } from './modal-focus.js';
import {
  ConsentCategories,
  ConsentFeedback,
  necessaryStorageEntries,
  preferenceStorageEntries,
  StorageConsentProvider,
  useConsentManagerContext,
} from './StorageConsent.js';
import './cookie-storage.css';
import { readLoginOffer, setLoginOffers } from './login-offer.js';
import { readStorageConsent, storageConsentKey } from './storage-consent.js';
import { WorkspaceIcon } from './WorkspaceTools.js';

const entries = [
  {
    name: '__Host-skyttel_binding',
    place:
      'Säkerhetskaka på Skyttels kanoniska HTTPS-adress. Lokal utveckling på HTTP-loopback använder skyttel_binding.',
    content:
      'En slumpmässig, ogenomskinlig nyckel binder begärda inloggningsförsök i samma webbläsare. Skapas först när du begär inloggning. Första lyckade inloggningen ersätter den tidigare inom bindningen och avslutar andra påbörjade försök. Utloggning avslutar åtkomsten och pågående försök här, utan att påverka andra bindningar. Nyckeln ger ingen egen åtkomst och är inte en separat kopia av lagringsvalet.',
    time: 'Börjar som sessionskaka. Efter bekräftad ihågkommen inloggning gäller beständigheten till just den sessionens absoluta utgång, högst sju dygn från inloggningen. Vanlig inloggning använder sessionskaka och gäller högst åtta timmar, med 30 minuters inaktivitet. Den har Secure vid HTTPS, SameSite=Lax och Path=/, saknar Domain och kan läsas av JavaScript för samordnad registrering. Serverns behörighet är separat från kakans lagringstid.',
  },
  {
    name: 'better-auth.session_token',
    place: 'Kaka i den här webbläsaren. Vid HTTPS: __Secure-better-auth.session_token.',
    content:
      'Signerad, ogenomskinlig sessionsnyckel. Skyttel använder den för att identifiera din inloggning; den innehåller inte hushållets karta.',
    time: 'Vanlig inloggning använder sessionskaka och gäller högst åtta timmar från inloggningen, med 30 minuters inaktivitet. Bara ett aktivt Kom ihåg mig-val ger beständig kaka till sessionens absoluta utgång, högst sju dygn från inloggningen utan separat inaktivitetsgräns. Läsning, återförsök och ny kakutgivning förlänger inte tiden. Utloggning avslutar serveråtkomsten och tar bort kakan. Kakans livstid är inte samma sak som fysisk radering på servern.',
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
      'Referens till en uttryckligen begärd aktivering eller avstängning, den ursprungliga inloggningens ID och installationens säkerhetsgeneration. Begärans riktning, eventuell återställning och det berörda samtyckets beslutstid gör att samma åtgärd kan kontrolleras efter ett förlorat svar och ny inloggning. Detta är en avsikt för återhämtning, inte ett bekräftat aktuellt lagringsval eller en behörighet.',
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

const serverEntries = [
  {
    name: 'user och account',
    content:
      'Ditt Skyttel-konto med visningsnamn och teknisk identitetsadress, kopplade leverantörsidentiteter och krypterade leverantörstoken behövs för att känna igen rätt person. Kontolänkarna är inte ett Kom ihåg mig-val.',
    time: 'Kontot och kopplingarna finns kvar efter utloggning. De har ingen sessionsfrist. En kontrollerad återställning ogiltigförklarar gamla token men bevarar identitetskopplingarna. Permanent radering av hushållet hanteras separat.',
  },
  {
    name: 'session',
    content:
      'Sessionsnyckeln, ägaren, valets struktur- och informationsversion, beslutstid och absoluta slut samt senaste användarhandling styr just denna inloggning. Better Auth registrerar också IP-adress och webbläsarens identifikation när de finns i inloggningsanropet. Ett tidsbegränsat arbetsankare kan pausa inaktiviteten under mottaget AI-arbete och leverans. Ingen handlingshistorik skapas.',
    time: 'Vanlig åtkomst upphör efter 30 minuters inaktivitet eller högst åtta timmar från inloggningen. Ihågkommen åtkomst upphör högst sju dygn från inloggningen. Avstängning och uttrycklig utloggning kan avsluta åtkomsten tidigare. Utgångna sessioner gallras automatiskt; omstart förlänger inte gränserna eller återupptar arbete.',
  },
  {
    name: 'browser_binding och browser_binding_attempt',
    content:
      'En hash av säkerhetskakans nyckel, bekräftelse, revision och koppling till aktuell session samordnar samma webbläsare. Försöket binder OAuth-svaret till rätt bindning, inloggningsleverantör och versionsbundna val. Bindningen ger ingen egen hushållsåtkomst.',
    time: 'Ett inloggningsförsök har högst tio minuter från serverns registrering. Ny inloggning, avstängning och utloggning avslutar berörda äldre försök. Bindningen gallras efter sin frist när ingen session eller tillåten ändlig uppgift behöver den för säkert stopp.',
  },
  {
    name: 'verification och login_link',
    content:
      'Kortlivade OAuth-kontroller och kontokopplingsbevis behövs för att verifiera ett uttryckligen begärt försök. De är skilda från leverantörens egen inloggning.',
    time: 'Kontokopplingsförsök har tio minuter från starten. OAuth-kontroller följer sin registrerade utgång och förbrukas vid kontroll. Förbrukade eller utgångna uppgifter gallras automatiskt; de blir inte giltiga igen vid omstart.',
  },
  {
    name: 'storage_action_result',
    content:
      'Åtgärds-ID, rätt användare, bekräftad aktivering eller avstängning, ändringstid, kontrollfrist och den berörda sessionens slut låter dig kontrollera samma resultat efter ett förlorat svar. Ingen separat valhistorik förs.',
    time: 'Kan läsas av rätt inloggade användare under 24 timmar från ändringen. Därefter gallras resultatet. Ett saknat resultat bevisar inte att ändringen avvisades eller genomfördes.',
  },
  {
    name: 'installation_authority',
    content:
      'Installationens aktuella säkerhetsgeneration och, vid en bekräftad återställning, dess ursprung och fasta bekräftelsetid hindrar gamla åtkomstnycklar från att återaktiveras. Den styrande deklarationen hålls separat av driftansvarig.',
    time: 'Den aktuella posten behövs så länge installationen används och ersätts vid nästa kontrollerade övergång. Den är ingen historik över lagringsval. En återställning måste spärras innan tjänsten öppnas igen; en äldre databas får inte ensam bestämma giltig åtkomst.',
  },
  {
    name: 'theme_preferences och conversation_preferences',
    content:
      'Ditt kontos temaval och samtalsvyer används på dina enheter. Temavalet kopieras inte till localStorage, sessionStorage eller en temakaka. Äldre lokala skyttel-theme-nycklar tas bort när appen öppnas.',
    time: 'Kontoval består efter utloggning och ändras genom respektive inställning. Utan inloggning följer temat enhetens systemval. Återställ samtycke tar inte bort kontoval.',
  },
  {
    name: 'assistant_connection, oauthClient, oauthConsent, oauthAccessToken, oauthRefreshToken, oauthClientAssertion och jwks',
    content:
      'Samtals- och assistentbehörighet, medgivanden, klientregistreringar och signeringsnycklar behövs för begärd åtkomst. Privat arbete i Skyttels samtal är bundet till ursprunglig användare, inloggning och uppgift. Självständigt anslutna assistenter har egen behörighet och medgivande.',
    time: 'Mottaget textarbete har högst 30 minuter från mottagningen, inklusive kö och leverans; fritt röstläge stannar vid inloggningens gräns. Gamla privata arbetsbehörigheter tas bort vid serverstart. Självständiga externa anslutningars åtkomsttoken har normalt en timme och deras förnyelsenycklar högst 30 dygn från respektive utgivning; tidigare återkallelse gäller. Utgångna token och klientbevis gallras efter sina egna frister. Minimala spärrar mot återanvändning kan behövas tills berörda nycklar är ogiltiga. Giltiga externa anslutningar och nödvändiga signeringsnycklar är inte vanliga webbläsarsessioner och tas inte bort bara för att du loggar ut här.',
  },
];

export function CookieStorage({ userId }: { userId?: string }) {
  const manager = useConsentManagerContext();
  return manager ? (
    <CookieStorageContents userId={userId} />
  ) : (
    <StorageConsentProvider userId={userId} suppressBanner>
      <CookieStorageContents userId={userId} />
    </StorageConsentProvider>
  );
}

function CookieStorageContents({ userId }: { userId?: string }) {
  const manager = useConsentManagerContext();
  if (!manager) throw new Error('consent_context_required');
  const [preferences, setPreferences] = useState(manager.consent?.preferences ?? false);
  const [contact, setContact] = useState<string | null>(null);
  const [returnToFeature, setReturnToFeature] = useState(false);
  const [ask, setAsk] = useState(() => (userId ? readLoginOffer(userId).ask : true));
  const [offerError, setOfferError] = useState('');
  const [exportError, setExportError] = useState('');
  function exportData() {
    setExportError('');
    let url: string | undefined;
    let link: HTMLAnchorElement | undefined;
    try {
      // Fail explicitly if the browser denies reading the saved choice.
      localStorage.getItem(storageConsentKey);
      const consent = readStorageConsent();
      const data = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        policyPublishedAt: cookiePolicyPublishedAt,
        consent: consent
          ? {
              schemaVersion: consent.schemaVersion,
              informationVersion: consent.informationVersion,
              preferences: consent.preferences,
              decidedAt: consent.decidedAt,
            }
          : null,
        storageRegister: {
          necessary: necessaryStorageEntries,
          preferences: preferenceStorageEntries,
          browserDetails: entries,
          server: serverEntries,
          provider: 'Skyttel',
        },
      };
      url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      link = document.createElement('a');
      link.href = url;
      link.download = 'skyttel-lagringssamtycke.json';
      document.body.append(link);
      link.click();
    } catch {
      setExportError('Uppgifterna kunde inte exporteras. Försök igen.');
    } finally {
      link?.remove();
      if (url) URL.revokeObjectURL(url);
    }
  }
  useEffect(() => {
    setAsk(userId ? readLoginOffer(userId).ask : true);
    setOfferError('');
  }, [userId]);
  const activateButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setPreferences(manager.consent?.preferences ?? false);
  }, [manager.consent?.preferences]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/policy-contact', { signal: controller.signal, cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (!controller.signal.aborted) setContact(value?.email ?? null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  const [resetOrigin, setResetOrigin] = useState<HTMLButtonElement | null>(null);
  const [resultPlace, setResultPlace] = useState<'save' | 'reset'>('save');
  const resetUser = useRef(userId);
  const { saved, requested, state, dirty, setRequested, undo, save } = manager.preference;
  const blocked = manager.blocked;
  const consentDirty = preferences !== (manager.consent?.preferences ?? false);
  async function saveAll() {
    if (!manager) return;
    if (blocked) return;
    if (!consentDirty && manager.consent && dirty) {
      await save();
      return;
    }
    const hadConsent = manager.consent?.preferences;
    if (!(await manager.save(preferences))) return;
    if (preferences && hadConsent && dirty) await save();
    if (returnToFeature) {
      setReturnToFeature(false);
      activateButton.current?.focus();
    }
  }
  useLayoutEffect(() => heading.current?.focus(), []);
  useLayoutEffect(() => {
    if (resetUser.current !== userId) {
      resetUser.current = userId;
      setResetOrigin(null);
      setResultPlace('save');
    }
  }, [userId]);
  const feedback = <ConsentFeedback alwaysRender />;
  return (
    <article className="cookie-storage">
      {(userId || consentDirty) && (
        <FormLossGuard
          dirty={dirty || consentDirty || state === 'unknown'}
          busy={manager.saving || state === 'saving' || state === 'checking'}
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
      <section className="cookie-policy" aria-labelledby="cookie-policy-title">
        <h2 id="cookie-policy-title">Kakpolicy</h2>
        <p>
          Senast uppdaterad: <time dateTime={cookiePolicyPublishedAt}>16 oktober 2026</time>.
        </p>
        <h3>Vad är kakor och annan webbläsarlagring?</h3>
        <p>
          Kakor är små uppgifter som webbläsaren skickar till Skyttel. localStorage sparar uppgifter
          i den aktuella webbläsaren över besök; sessionStorage hör till en flik och kan återställas
          av webbläsaren. Skyttel använder nödvändig lagring för säker inloggning och funktioner du
          begär. Preferenskakor möjliggör ihågkommen inloggning. Skyttel använder inga analys- eller
          marknadsföringskakor.
        </p>
        <h3>Dina val</h3>
        <p>
          Lagringssamtycket gäller den här webbläsaren, även efter utloggning och kontobyte. Det har
          ingen fast tidsgräns: ändra eller återkalla det här, eller rensa webbläsarlagringen. Nya
          ändamål kräver ett nytt aktivt val. Ett rättat stavfel eller ändrad kontaktadress förnyar
          inte samtycket. Kakornas livslängd och serverns åtkomstgränser gäller separat.
        </p>
        <p>
          Acceptera Alla ger tillstånd till preferenskakor men aktiverar inte Kom ihåg mig. Välj
          funktionen separat efter inloggning. Återkallelse stänger av ihågkommen inloggning; vanlig
          åtkomst fortsätter när den kan bekräftas inom befintliga gränser.
        </p>
        <h3>Kontakt om policyn</h3>
        <p>
          {contact ? (
            <a href={`mailto:${contact}`}>{contact}</a>
          ) : (
            'Kontakta den som ansvarar för din Skyttel-installation'
          )}
        </p>
      </section>
      <section className="cookie-storage-quick" aria-labelledby="storage-quick-title">
        <h2 id="storage-quick-title">Snabbåtgärder</h2>
        <div className="cookie-storage-quick-buttons">
          <button
            type="button"
            className="cookie-storage-primary"
            disabled={blocked}
            onClick={() => setPreferences(true)}
          >
            Acceptera Alla
          </button>
          <button type="button" disabled={blocked} onClick={() => setPreferences(false)}>
            Endast nödvändiga
          </button>
          <button type="button" className="cookie-storage-export" onClick={exportData}>
            <WorkspaceIcon name="download" />
            Exportera data
          </button>
          <button
            type="button"
            className="cookie-storage-reset"
            aria-disabled={blocked}
            onClick={(event) => {
              if (!blocked) setResetOrigin(event.currentTarget);
            }}
          >
            <WorkspaceIcon name="trash" />
            Återställ samtycke
          </button>
        </div>
        <p>Snabbval ändrar bara formuläret. Spara Preferenser bekräftar ditt val.</p>
        <p>
          Exportera data laddar ned ditt sparade lagringssamtycke och lagringsregistret som JSON.
        </p>
        {exportError && (
          <div className="cookie-storage-feedback">
            <p role="alert">{exportError}</p>
          </div>
        )}
        {resultPlace === 'reset' && feedback}
      </section>
      <h2>Kakinställningar</h2>
      {manager.consent && (
        <p className="cookie-storage-decision">
          Ditt senaste lagringsval: {new Date(manager.consent.decidedAt).toLocaleString('sv-SE')}.
          Detta är skilt från policyns uppdateringsdatum.
        </p>
      )}
      <ConsentCategories preferences={preferences} onChange={setPreferences} disabled={blocked} />
      <h2>Detaljerat lagringsregister</h2>
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
                disabled={!manager.consent?.preferences || blocked}
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
        {userId && (
          <button
            type="button"
            aria-disabled={!saved?.remembered || !requested || blocked}
            onClick={() => {
              if (saved?.remembered && requested && !blocked) setRequested(false);
            }}
          >
            Stäng av ihågkommen inloggning
          </button>
        )}
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
            {manager.consent?.preferences ? (
              <button
                ref={activateButton}
                type="button"
                disabled={blocked}
                onClick={() => void manager.preference.change(true)}
              >
                Kom ihåg mig i Skyttel
              </button>
            ) : (
              <>
                <span>
                  Kom ihåg mig behöver samtycke till Preferenskakor för beständiga inloggningskakor.
                </span>{' '}
                <button
                  ref={activateButton}
                  type="button"
                  onClick={() => {
                    setReturnToFeature(true);
                    document
                      .querySelector<HTMLInputElement>('[aria-label="Preferenskakor"]')
                      ?.focus();
                  }}
                >
                  Öppna Preferenskakor
                </button>
              </>
            )}
          </p>
        )}
        {userId && !saved && state !== 'unavailable' && <p>Läser aktuellt val…</p>}
        {userId && (
          <>
            <label>
              <input
                type="checkbox"
                checked={ask}
                onChange={(event) => {
                  try {
                    setLoginOffers(userId, event.target.checked);
                    setAsk(event.target.checked);
                    setOfferError('');
                  } catch {
                    setOfferError('Förslagsvalet kunde inte sparas. Försök igen.');
                  }
                }}
              />{' '}
              Fråga om ihågkommen inloggning efter framtida inloggningar
            </label>
            {offerError && <p role="alert">{offerError}</p>}
          </>
        )}
      </section>
      <section className="cookie-storage-card" aria-labelledby="server-storage-title">
        <h3 id="server-storage-title">Uppgifter på Skyttels server</h3>
        <details>
          <summary>Visa serverns lagringsposter</summary>
          <p>
            Följande poster finns i Skyttels serverdatabas, med Skyttel som leverantör. Namnen
            hjälper dig att skilja uppgifterna åt; de är inga ytterligare webbläsarkakor.
          </p>
          {serverEntries.map((entry) => (
            <section className="cookie-storage-entry" key={entry.name}>
              <h4>{entry.name}</h4>
              <dl>
                <dt>Innehåll och ändamål</dt>
                <dd>{entry.content}</dd>
                <dt>Giltighet, gallring och konsekvenser</dt>
                <dd>{entry.time}</dd>
              </dl>
            </section>
          ))}
        </details>
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
          Sessionen har en tidpunkt för senaste användarhandling. Under faktiskt mottaget AI-arbete
          och ändlig leverans sparas också arbetets ursprungliga tidsgräns. Uppgifterna används för
          att upprätthålla inaktivitetsgränsen, delas av flikar med samma inloggning och gallras med
          sessionen. De är ingen historik över dina handlingar. Om tjänsten startar om återupptas
          inte arbetet och tidsgränsen startas inte om.
        </p>
        <p>
          Resultat av begärd import och permanent radering finns på servern för återhämtning. Ett
          lokalt åtgärds-ID ersätter aldrig serverns behörighetskontroll.
        </p>
        <p>
          Efter aktivering eller avstängning av ihågkommen inloggning sparar servern ett minimalt
          åtgärdsresultat för din användare. Resultatet kan kontrolleras under 24 timmar från
          ändringen, vid behov efter ny inloggning. Referensen ger ingen egen åtkomst och finns inte
          i en separat historik över tidigare val.
        </p>
        <p>
          Pågående samtal och leveransanslutningar har också tillfälliga uppgifter i serverns och
          den öppna appens arbetsminne: samtalstext, uppgiftens ursprungliga tidsgräns, fryst helt
          svar och transportstatus. De är inga Web Storage-nycklar och återupptas inte efter
          serveromstart. Kvittens av hela texten krävs inom högst fem sekunder från att svaret
          fryses, alltid inom uppgiftens tidsgräns. Kvittensen bevisar inte att någon har läst, hört
          eller förstått svaret. Redan mottagen text kan visas medan appen är öppen; ny inloggning,
          uttryckligt avslut och stängning av appen kan ta bort den lokala visningen. Hushållets
          karta, ditt utkast, sparförsök och sparkvitton har separat beständig lagring.
        </p>
        <p>
          Serverns behörighet kan upphöra före kakans livstid. Utgången behörighet bevisar inte
          fysisk radering av serveruppgifter eller säkerhetskopior. Automatisk gallring startar vid
          serverstart och varje minut medan tjänsten är igång. Avslutade sessioner och förbrukade
          eller utgångna OAuth-försök ska gallras inom 24 timmar från avslut respektive förbrukning
          eller utgång. Resultatkontroll har 24 timmar från ändringen. För webbläsarens återkallelse
          och utloggning får minimala spärruppgifter bara finnas tills berörda nycklar och försök är
          ogiltiga, högst sju dygn från återkallelse eller utloggning och ytterligare högst 24
          timmar för gallring. Det är tak, inte standardtider. Berörda säkerhetskopior ska behållas
          högst 30 dygn från ursprunglig kopiering. Beslutade frister är inte verifierade
          driftfakta. Faktisk gallring och hantering av kopior behöver verifieras i drift.
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
      <div className="cookie-storage-actions">
        {(dirty || consentDirty) && state !== 'unknown' && state !== 'checking' && (
          <p>Osparad ändring.</p>
        )}
        {saved && (
          <p>
            Efter avstängning gäller inloggningen längst till det tidigare slutet eller åtta timmar
            från avstängningen, med 30 minuters inaktivitet. Upprepning förlänger inte tiden.
          </p>
        )}
        {resultPlace === 'save' && feedback}
        <button
          type="button"
          aria-disabled={blocked}
          className="cookie-storage-primary"
          onClick={() => {
            if (blocked) return;
            setResultPlace('save');
            void saveAll();
          }}
        >
          Spara Preferenser
        </button>
      </div>
      <p>
        Formulärets utseende bygger på Viscalyx CookieSettings.{' '}
        <a href={referenceLicense}>Licens för formulärets förebild (MIT)</a>
      </p>
      {resetOrigin && (
        <StorageResetDialog
          origin={resetOrigin}
          pending={manager.saving || state === 'saving' || state === 'checking'}
          unknown={state === 'unknown'}
          onCancel={() => setResetOrigin(null)}
          onConfirm={() => {
            setResultPlace('reset');
            void manager.save(false, { reset: true }).then((saved) => {
              if (saved) setResetOrigin(null);
            });
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
  pending,
  unknown,
}: {
  origin: HTMLButtonElement;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  unknown: boolean;
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
        if (!pending) onCancel();
      }}
    >
      <h2 id={`${id}-title`}>Återställ samtycke?</h2>
      <div id={`${id}-description`}>
        <p>
          Återställningen stänger av ihågkommen inloggning i den aktuella webbläsarbindningen. Den
          gamla inloggningsnyckeln slutar gälla och äldre påbörjade inloggnings- och
          kontokopplingsförsök här avslutas. Andra webbläsarbindningar påverkas inte.
        </p>
        <p>
          Du får en vanlig inloggning längst till det tidigare slutet eller åtta timmar från
          avstängningen, med 30 minuters inaktivitet. Fortsatt inloggning kontrolleras separat; du
          kan behöva logga in igen. Ny aktivering kräver ett nytt uttryckligt funktionsval och
          samtycke till Preferenskakor, inom sju dygn från ursprunglig inloggning.
        </p>
        <p>
          Flikens återhämtningsuppgifter för import och permanent radering med osäkert utfall,
          kontots tema, personliga vyer, hushållets information och samtalsmedgivande bevaras. Fråga
          inte igen bevaras. Lagringssamtycket rensas och kakbannern visas igen. Nödvändig lagring
          rensas inte. Google och Microsoft styr sin egen lagring.
        </p>
      </div>
      <ConsentFeedback />
      <footer>
        <button ref={cancel} type="button" disabled={pending} onClick={onCancel}>
          {unknown ? 'Lämna med okänt utfall' : 'Avbryt'}
        </button>
        <button
          type="button"
          disabled={pending || unknown}
          className="cookie-storage-reset"
          onClick={onConfirm}
        >
          Återställ
        </button>
      </footer>
    </dialog>
  );
}
