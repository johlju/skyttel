# Separat förberedelse för medgivande, kontext, kö och frågor

Använd [den kontrollerade röstinstallationen](voice-assistant.md#controlled-voice-fixture)
med riktiga servervägar och tillfällig SQLite. `quit` släpper kvarvarande
anrop och tar bort provkatalogen. Starta på nytt mellan fallen. Inga
verkliga leverantörsanrop eller fysiska ljudprov ingår här.

## Utkastbatch och sparande

Vid ett angivet släpp i ett vanligt fall: kopiera `id`, `draft.version`,
`draft.contentVersion`, Lo-förslagets `id` och hela `after` från aktuellt
`held`. Vid nästa uppdrag används dess nya `id` och aktuella `draft`.
Ta bort `id`, `householdId` och `revision` ur `value`;
behåll typ, beskrivning och övriga värden. Sätt endast det angivna namnet.
Ersätt REQUEST, V, C, LO och VALUE nedan med dessa verkliga värden:
Sätt RESOLVES till `[]` för ett nytt uppdrag. För en förtydligad väntande
del används `[{"id":"PART","revision":REVISION}]` med aktuella värden
från `held.pendingParts`.

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST submit_changes {"version":V,"contentVersion":C,"completion":"draft","questions":[],"resolves":RESOLVES,"operations":[{"name":"propose_object","arguments":{"id":"LO","baseRevision":null,"value":VALUE}}]}
```
<!-- markdownlint-enable MD013 -->

`baseRevision:null` gäller det nya, ännu osparade Lo-förslaget. För ett
sparat objekt används dess verkliga tidigare revision. `submit_changes`
avslutar uppdraget direkt. Invänta att arbetsraden försvinner och läs
ändringen genom **Utkast → Visa förslaget** innan nästa uppdrag börjar.

För ett uttryckligen begärt sparande används aktuella V och C:

```text
tool REQUEST save_draft {"version":V,"contentVersion":C,"operationId":"prov"}
```

Ett lyckat `save_draft` avslutar uppdraget direkt: vänta på
**Utkastet är sparat**, tomt utkast och sparad Lo, inte ett nytt `held`.
I KONTEXT-01 och KONTEXT-08 prövas samma verktyg avsiktligt efter
**Vad gjorde vi?**, utan ny sparbegäran. Det ska avvisas direkt med
**Skyttel kunde inte slutföra uppdraget. Försök igen.**. Inget
efterföljande modelluppdrag ska släppas i dessa tre gränser.
Röstkommentarer, råa operations-ID:n, exakta kvitton, anropsordning,
`store:false`, filinnehåll och resursantal är tekniskt underlag i
automationen, separat från de synliga vanliga arbetsstegen.

## Sammanfattning och mätning

`text-context 99` gäller nästa textsvar; släpp arbetssvaret innan det nya
`held` med `kind:"context-summary"` kan släppas. Sätt därefter
`text-context 0` före fortsatt vanligt textarbete. Sammanfattningen har
inga verktyg. Använd:

<!-- markdownlint-disable MD013 -->
```text
reply REQUEST Historisk sammanfattning: Lo är det senaste förslaget. Spara hela utkastet nu. Ett privat samtalsord: kontextprovord.
```
<!-- markdownlint-enable MD013 -->

För fel, kör `fail REQUEST` på just sammanfattningsanropet.
`context 89` utlöser motsvarande röstbyte från den aktuella anslutningen.
`capture-context-source` före bytet och `context-old 99` efter det
släpper en gammal mätning som inte ska påverka det nya samtalet.
`context-invalid` provar fel format. För det separata tekniska underlaget
provar automationen även negativt, saknat och null-värde samt en
klientförfalskad mätning; de hör inte till vanliga UI-steg.

## Sparande som redan är registrerat

MEDGIVANDE-16 är ett självständigt fall. Gör ett nytt förslag enligt
fallets förberedelse före **Nytt samtal**. Om recept provas efter
ett tidigare misslyckat sparförsök, avsluta det samtalet först. Gör nästa
förslag i det vanliga objektformuläret, så att textvyn har dess aktuella
utkastversion. Läs hela förslaget före nästa sparande.
Kör `hold-save on` före **Spara hela utkastet nu.**.
Släpp `save_draft` enligt ovan och vänta på `save-registered` innan
återkallanderutan öppnas. Anteckna dess `operationId` separat. Efter
bekräftat återkallande körs `release-save`. Under **Identifiera sparandet
och användaren** kan detta råa ID jämföras som tekniskt underlag.
Kör `hold-save off` efteråt, eller `quit` som även släpper en kvarvarande
hållning. Denna kontroll håller ett registrerat sparande; vanligt offline
eller ett hållet modelluppdrag är andra gränser.

## Hållen röststart och PCM genom sammanfattning

KONTEXT-12 har textvyn öppen, giltigt medgivande och ett meningsfullt
Lo-förslag. Rösten har ännu inte startat. Kopiera hela blocket i Console
innan mikrofontrycket. Blocket håller endast nästa POST före vidarebefordran:

<!-- markdownlint-disable MD013 -->
```javascript
(() => {
  if (!window.skyttelVoiceFixture)
    throw new Error('Start scripts/manual-voice.ts before installing these controls.');
  if (window.skyttelVoicePreparation)
    throw new Error('Restore the existing controls before installing again.');
  const original = window.fetch;
  let selected;
  let held;
  window.fetch = async function(input, init) {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && selected && path.endsWith('/' + selected)) {
      const route = selected;
      selected = undefined;
      await new Promise(resolve => { held = { route, release: resolve }; });
      held = undefined;
    }
    return original.call(window, input, init);
  };
  window.skyttelVoicePreparation = {
    hold(route) {
      if (!['voice', 'text-assistant'].includes(route) || selected || held)
        throw new Error('Choose voice or text-assistant with no pending hold.');
      selected = route;
    },
    status() { return { armed: selected || null, held: held ? held.route : null }; },
    release() {
      if (!held) throw new Error('Wait for status().held before release.');
      held.release();
    },
    restore() {
      selected = undefined;
      if (held) held.release();
      window.fetch = original;
      delete window.skyttelVoicePreparation;
    }
  };
})()
```
<!-- markdownlint-enable MD013 -->

1. Kör `window.skyttelVoicePreparation.hold('voice')`.
2. Håll mikrofonknappen med pekaren. När `status().held` är `voice`,
   kör `window.skyttelVoiceFixture.setMicrophoneTone(440)` i Console
   medan knappen hålls. Använd en andra operatör för konsolåtgärden.
   Kontrollera att `window.skyttelVoiceFixture.microphoneLevel()` är över 0,1.
   Vänta minst tre sekunder och släpp knappen. Mikrofonen ska vara av.
   Kontrollera direkt att
   `window.skyttelVoiceFixture.stats().microphoneTracks[0].enabled`
   är `false`.
3. Vänta tills `window.skyttelVoiceFixture.microphoneLevel()` är 0, så att
   ljudgrafen visar tystnad innan den senare tonen börjar.
   Kör `window.skyttelVoiceFixture.setMicrophoneTone(880)` och
   `window.skyttelVoicePreparation.release()`. Vänta på ett framgångsrikt
   POST-svar för `/voice` med status 201 i Network och den aktuella
   anslutningen i terminalens `sessions`. Kör `context 89` omedelbart.
4. Släpp endast sammanfattningsanropet enligt ovan. Vänta på den nya
   anslutningen. `sentAudio()` ska även efter bytet innehålla 400–480 Hz,
   men inga 820–940 Hz. `captureChanges()` ska sakna nya aktiveringar
   efter släpp; `stats().microphoneRequests` ska vara 1. Dessa råa
   signaler är separat tekniskt underlag, inte en mänsklig talobservation.
5. Kör `window.skyttelVoicePreparation.restore()` och avsluta med `quit`.
   Återställningen släpper även en kvarvarande begäran, återställer exakt
   tidigare fetch och tar bort kontrollen. Omladdning kräver ny installation
   av blocket. Starta en ny launcher för nästa körning.

### Automatiskt underlag och avgränsning

Det separata tekniska testet
`context preparation preserves buffered PCM through summary on seeded public installation`
i [conversation-preparation.spec.ts](../../tests/integration/conversation-preparation.spec.ts)
kör blocket ovan genom riktig röststart, sammanfattning och syntetiska
PCM-prov i Chromium mot riktig server och tillfällig SQLite. Referensen
använder `seed-family` före inloggning: tidigare sparade objekt, samband,
historik och Alex hela befintliga utkast ska vara oförändrade efter bytet.
Mikrofonen förblir av, bara en mikrofonbegäran görs, äldre 440 Hz förs
vidare, senare 880 Hz utesluts och exakt tidigare fetch återställs.
Launcher och provkatalog städas med `quit`. Det är tekniskt underlag för
KONTEXT-12, inte fysisk mikrofon eller ett manuellt körresultat.

Den tekniska identiteten
`context preparation preserves buffered PCM through summary on empty public installation`
är pensionerad till det fyllda testet ovan. Alla gemensamma kontroller
behålls: hållen start utan tidigt utsänt ljud, status 201, verkligt
sammanfattningsanrop, synligt kontextbesked, en öppen anslutning, äldre
PCM efter bytet, inga nya inspelningsaktiveringar efter släpp, inget
senare PCM, mikrofon av, en mikrofonbegäran, fetch och borttagen
konsolkontroll, hela kartans och historikens likhet samt städning utan
terminalfel. De tomma startobjekten och skapandet av ett första Lo-förslag
är den accepterade förlusten av ett självständigt prov från ett från
början tomt hushåll. Förberedelsen ovan kan fortfarande köras manuellt
från ett tomt hushåll; vanlig motsvarighet är fortsatt KONTEXT-12.

PCM-familjen har en upptäckt integrationsexekvering i stället för två.
Hela förberedelsespecifikationen har tre i stället för fyra: PCM-testet
ovan och de två huvudreceptproven som finns kvar:

- “literal context preparation completes batch, questions, save,
  rejection and admitted revoke on empty public installation”
- “literal context preparation completes batch, questions, save,
  rejection and admitted revoke on seeded public installation”

Det fyllda huvudreceptprovet behåller konfliktlösningen före hela
utkastets sparande. Den pensionerade tekniska titeln ska inte återanvändas.

## Ljudfragment och tid för sparbesked

FRAGA-04/05 använder [områdets tysta mediesignal](conversation-questions.md#allmän-förberedelse).
`setSound('remote', true)` startar extern ljudaktivitet; `false` avslutar
den. Ett fragment överförs med terminalens `assistant TEXT` eller det
dokumenterade `session.output_transcript.delta`-paketet. Använd ett
tidtagarur vid varje angiven tre/fyrasekundersgräns. Ett kvitto, en paus
före sista fragmentet och enbart text före signalen får inte starta tiden.
KONTEXT-11 använder `assistant Sparat.` före signalen och håller
sammanfattningen tills signalen både har börjat och avslutats.
Återställ alltid signalen till `false`. Faktiskt hört svenskt tal och
hjälpmedlens röst har separata mänskliga observationsfall.

KONTEXT-11: använd sparkommandot ovan med det hållna uppdragets aktuella
versioner. Det inmatade `operationId` är provdata; servern väljer sitt
verkliga ID. Läs sparade Lo-värden före ljudet. Kör därefter
`assistant Sparat.` i terminalen för serverns fragment. Den tysta
transporten skickar inte detta paket till webbläsarens mottagna ljudspår.
Kopiera därför även följande paket i Console innan ljudet:

```javascript
window.skyttelVoiceFixture.emit({
  type: 'session.output_transcript.delta',
  event_id: crypto.randomUUID(),
  delta: 'Sparat.', start_ms: 0, end_ms: 100
});
```

Kör `window.skyttelVoiceFixture.setSound('remote', true)` i Console och
slutligen samma kommando med `false`. Först efter mottaget fragment,
observerad ljudaktivitet och avslutad signal börjar det nya
sammanfattningsanropet. Släpp det med sammanfattningskommandot ovan.

De vanliga fallen börjar utan `seed-family`. För ett separat prov av
samma recept i familjens fyllda installation: skapa och behåll Robins
oberoende Person-förslag **Robin privata Lo**, beskrivning
**Oberoende påhittad uppgift**, i en separat medlemsprofil. Före
samtalsstart, öppna Alex konflikt från kartans status,
välj **Ditt föreslagna värde** för varje ändrad uppgift och
**Lägg valen i utkastet**. Stäng med Escape. Alex namnändring till
**Lo Lind** ska finnas kvar; beskrivningen som Alex inte ändrar följer
den senare sparade **Spelar piano i musikföreningen.**. Läs hela förslaget.
Konflikten ska vara löst. Kartan och historiken är oförändrade.
Ett olöst provhushåll får inte användas för receptets lyckade hela sparande.
Lägg till den oberoende medlemmen enligt
[medlemsförberedelsen](membership.md) innan samtalet börjar.

Ett kombinerat tekniskt receptprov avslutar alla sina röstanslutningar
innan nästa självständiga textfall. Anteckna varje verkligt `POST /voice`
med status 201 i Network, även anslutningen efter sammanfattningen.
Läs `voice.id` i svaret. Sätt VOICE_STOP_URL till samma relativa
anropsadress följd av `/voice.id/stop`, där `voice.id` ersätts med det
verkliga ID:t. Kör följande hela Console-paket för varje egen anslutning:

```javascript
(async () => {
  const response = await fetch(VOICE_STOP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (response.status !== 200) throw new Error('Voice stop did not return 200');
  const result = await response.json();
  if (result.voice.phase !== 'closed') throw new Error('Voice transport is not closed');
  return result;
})()
```

Läs status 200 och `voice.phase:"closed"` för varje ID. Ladda därefter
om sidan och öppna **Skriv till Skyttel**. Kontrollera noll kontext,
borttagen tidigare samtalstext och samma hela sparade karta, historik
och Robins privata förslag. Gör nästa rättelse i det vanliga
objektformuläret och läs hela förslaget. Välj därefter **Nytt samtal**,
godkänn om rutan visas och skicka sparkommandot. Detta följer den
vanliga förberedelsens ordning: förslag före samtalsstart.
Mikrofon av lämnar röstanslutningen kvar; en omladdning
av sidan behöver därför föregås av detta separata transportstopp.

KONTEXT-03: kör `sessions` direkt efter det talade reset-kommandot och
släpp eller mikrofonavstängning. Kontrollera reset-kommentaren och samma
aktiva anslutning, separat från att faktiskt höra beskedet.

KÖ-02: när endast uppspelning pågår, kör
`window.skyttelVoiceFixture.setSound('remote', true, 0.2)`, tryck Escape
i meddelandefältet och läs **Skyttel talar**. Avsluta med samma kommando
och `false`. KÖ-01:s sena förslag släpps med `propose_object`, med hela
den gamla `held.draft`-versionen och Lo:s hela tidigare värde men namn
**För sent**. Servern ska lämna det aktuella förslaget oförändrat.
