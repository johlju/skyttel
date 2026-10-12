# Separat förberedelse för kontrollerade röstprov

Använd endast den
[tillfälliga röstinstallationen](voice-assistant.md#controlled-voice-fixture).
Den använder den riktiga applikationen, tyst syntetisk media och tillfällig
SQLite. Den lyssnar inte på din mikrofon. Tekniska observationer nedan ersätter
inte
[fysiska talprov](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
.

## Väntande start och syntetiska toner

Starta en ny installation. Skapa Tryckprov, välj **Skriv till Skyttel** och
**Nytt samtal**, markera **Fråga inte igen för det här hushållet** och välj
**Godkänn och starta**. Ladda om sidan så
att inget samtal ännu pågår. Öppna Console och kör hela blocket:

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

Installera även detta block före trycket. Det väljer 440 Hz när det verkliga
mikrofonspåret aktiveras och 880 Hz när du släpper pekaren. Du behöver inte
öppna Console medan knappen hålls.

<!-- markdownlint-disable MD013 -->
```javascript
(() => {
  if (!window.skyttelVoiceFixture || window.voiceToneCleanup)
    throw new Error('Use a fresh controlled page before installing tones.');
  const button = document.querySelector('.workspace-talk');
  if (!button) throw new Error('Wait for Prata med Skyttel.');
  let timer;
  const down = () => {
    timer = setInterval(() => {
      if (window.skyttelVoiceFixture.stats().microphoneTracks.some(track => track.enabled)) {
        window.skyttelVoiceFixture.setMicrophoneTone(440);
        clearInterval(timer);
      }
    }, 10);
  };
  const up = () => {
    clearInterval(timer);
    window.skyttelVoiceFixture.setMicrophoneTone(880);
  };
  button.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  window.voiceToneCleanup = () => {
    clearInterval(timer);
    button.removeEventListener('pointerdown', down);
    window.removeEventListener('pointerup', up);
    delete window.voiceToneCleanup;
  };
})()
```
<!-- markdownlint-enable MD013 -->

Välj exakt en förberedelse före det första mikrofontrycket:

- MIKROFONTRYCK-05: kör `window.skyttelVoicePreparation.hold('voice')`. Håll
  den vanliga mikrofonknappen minst en sekund och släpp den. Efteråt ska
  `status().held` vara `voice` och `sentAudio()` vara tomt. Läs avstängt läge i
  UI innan `window.skyttelVoicePreparation.release()`. `sentAudio()` ska nu
  innehålla frekvenser mellan 400 och 480; efter 1,1 sekunder ska inga
  frekvenser mellan 820 och 940 finnas. Slå själv på mikrofonen: först då ska
  även den andra tonen överföras.
- MIKROFONTRYCK-06: använd `hold('text-assistant')` på samma förberedelse. Håll
  knappen minst en sekund, släpp och avbryt starten med ett kort tryck.
  `status().held` ska vara `text-assistant` och `stats().microphoneTracks` ska
  ha `state: 'ended'`. Kör `release()`. Vänta i Network på det verkliga
  POST-svaret för `/text-assistant`, status 201, före nästa start; `held: null`
  ensam visar inte serverns färdiga start. Kör `restore()`, starta mikrofonen
  igen och sätt 880 Hz. Utgående media ska innehålla 820–940 Hz men inga 400–480
  Hz från den avbrutna starten.
- MIKROFONTRYCK-08: använd starten från fall 05. När de tidigare tonerna
  dränerats, slå på mikrofonen och välj **Nytt samtal**, först med mikrofonen
  på, därefter med den av. Granska `stats()`: ett mikrofonanrop, samma levande
  mikrofonspår och en ensam öppen anslutning. Inga gamla toner får återkomma
  genom en ny aktivering.

Tonerna är syntetisk PCM, inte tal. Efter varje fall kör
`window.voiceToneCleanup()` och `window.skyttelVoicePreparation.restore()`.

`hold` stoppar bara nästa utpekade POST innan den skickas. Det är inget förlorat
svar efter sparande. Övriga rutter fortsätter normalt. Kör
`window.skyttelVoicePreparation.restore()` när fallet avslutas; det släpper även
en kvarvarande begäran och återställer exakt ursprunglig fetch. Innan omladdning
eller byte till nästa startprov: slå av mikrofonen, läs det aktuella
POST `/voice`-svarets `voice.id` och hela Request URL i Network. Ersätt
`VOICE-ADRESS` med denna URL och `VOICE-ID` med just detta svarsvärde. Kör:

```javascript
await fetch('VOICE-ADRESS/VOICE-ID/stop', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}'
}).then(async response => ({ status: response.status, ...await response.json() }))
```

Kräv status 200 och `voice.phase: 'closed'` innan omladdning. Omladdning ensam
avslutar inte serverns gamla röstsession; en ny samtalsstart kan annars stänga
den som förlorad åtkomst. Installera därefter blocken på nytt. Avsluta launchern
med `quit` och kontrollera borttagen katalog enligt röstguiden.

De två separata tekniska proven för publika kontroller i
[voice-controls-preparation.spec.ts](../../tests/integration/voice-controls-preparation.spec.ts)
startar den faktiska publika launchern på `seed-family`-underlag vid
320 × 250 respektive tomt underlag vid 1280 × 900. Både förberedelsesidan
och observationswebbläsaren använder det angivna måttet. De provar
blockens exakta text, båda startgränserna, toner, oförändrad
karta/utkast/historik, exakt transportstopp,
runnerns media- och HTTP-avbrott, klockans paus/återupptagning och städning.

Ytterligare separata tekniska prov kör de ordagrant hämtade kommandona för
ROSTFEL-04, notisernas tillgänglighet och uppdragsfel samt TAL-11:s inkommande
ljudaktivitet med mikrofonen av. Dessa två prov använder egna publika launchers
med `seed-family`-underlag vid 320 × 250 respektive tomt underlag vid
1280 × 900. Proven hämtar kommandona före start och behåller egna
samtyckesstarter,
återställningar, status 201/200, oförändrad karta/utkast/historik, tomma
diagnostikutdata och borttagen provkatalog. De delar inte tidsbudget med
blockens och runnerns fullständiga prov.

Detta är representativ täckning: tomt underlag vid 320 × 250 och
`seed-family`-underlag vid 1280 × 900 provas inte oberoende i något av
de två scenarierna. Ett fel som kräver just någon av dessa kombinationer
kan därför undgå proven.

### Konsoliderade tekniska referenser

De tekniska titlarna i `voice-controls-preparation.spec.ts` följer två
mönster: `voice preparation controls the public launcher on …` och
`voice preparation executes literal fault recipes on …`. För vartdera
mönstret ersätts `empty content at 320x250` av
`empty content at 1280x900`, och `seeded content at 1280x900` av
`seeded content at 320x250`. De fullständiga kontrollerna behålls
i respektive scenario: inga felgränser eller återställningar flyttas mellan
scenarierna. Samtliga fyra kvarvarande prov använder fortfarande den riktiga
applikationen, publika launchern, syntetisk media och tillfällig SQLite.
De bortvalda titlarna är tekniskt underlag utan egna manuella fall-ID:n.

## Media, textfragment och tekniska observationer

För övriga fall används röstguidens terminal- och
[mediekontroller](voice-assistant.md#browser-transport-and-audio-controls) vid
det angivna UI-steget. Kör aldrig `seed-family` efter inloggning. En ny vanlig
installation innehåller inget utkast: lägg Lo Exempel, typ Person, beskrivning
Påhittad uppgift i utkastet när fallet kräver Lo. Behåll hela förslaget tills
fallet uttryckligen sparar eller kastar det.

`setSound('remote', true, 0.2)` på `window.skyttelVoiceFixture` ger tyst
inkommande ljudaktivitet; `setSound('remote', false, 0)` avslutar den.
Mikrofonaktivitet styrs med `setSound('microphone', true, NIVÅ)` respektive
`false`. Dessa styr mediaersättningen, inte kartans eller samtalets tillstånd.
`stats()`, `sentAudio()`, `captureChanges()` och terminalens `sessions` ger
separat tekniskt underlag om resurser, PCM och kommentarspaket. En paketleverans
etablerar varken hört tal eller skärmläsarens uppläsning.

## Tekniska tidslinjer för röstärenden

Följ den aktuella tidslinjen tillsammans med fallets UI-steg en gång. Kör inte
hela tidslinjen först och upprepa sedan arbetsflödet. Kommandon, råa
identifierare, versionsvärden, paket och resursräkning hör till denna separata
förberedelse. Läs det verkliga held-anropets värden varje gång. Alla uppgifter
är påhittade och gäller endast den tillfälliga launchern.

### Tidslinje TAL-01

1. Starta en ny kontrollerad installation. Kör `seed-family` i terminalen före
   första inloggningen och vänta på `seeded`. Logga in som Alex. Hushållet
   TestHousehold finns redan; skapa inget nytt.
2. Öppna utkastet och läs Lo Lind, Person, **Använder familjens musik.** samt
   adressändringen. Öppna Karta → **1 konflikt i ditt utkast**. Läs det
   faktiskt sparade Lo Berg, Person, **Spelar piano i musikföreningen.** och
   det föreslagna Lo Lind, Person, **Använder familjens musik.** Stäng
   konfliktdialogen utan att välja. Välj **Prata med Skyttel** och
   **Godkänn och starta**. Stäng
   textvyn. Välj **Tabell → Redigera Kim Exempel** och skriv
   **Osänd text som ska finnas kvar** i beskrivningen utan att lägga den i
   utkastet. Mikrofonen fortsätter medan formuläret är öppet.
3. Skriv `user Behåll Lo-förslaget, rätta priset till 189 kr och spara.` och
   sedan `delegate`. Från `held.draft` kopieras `version`, `contentVersion`
   och hela första objektet i `conflicts`. Ersätt markörerna nedan; `CONFLICT`
   ska vara det kopierade JSON-objektet, utan extra citattecken:

   <!-- markdownlint-disable MD013 -->
   ```text
   tool REQUEST resolve_conflict {"version":VERSION,"contentVersion":CONTENT,"conflict":CONFLICT,"choice":"proposed"}
   ```
   <!-- markdownlint-enable MD013 -->

4. Nästa `held.lastToolResult.version` är den nya utkastversionen. Anteckna den
   och skicka följande med det nya anropets ID:

   ```text
   tool REQUEST read_map {"query":"Familjens Molnmusik"}
   ```

5. Från nästa `held.lastToolResult.objects` kopieras abonnemangets `id`,
   `revision` och övriga värden. Bygg argumentet till `propose_object` med
   antecknad utkastversion, samma `contentVersion`, kopierat `id` och
   `baseRevision` lika med objektets `revision`. `value` ska innehålla hela det
   kopierade objektet utom `id`, `householdId` och `revision`. Ändra
   `description` till **Familjeabonnemang 189 kr per månad.** och ersätt
   `financialFacts` med följande JSON:

   ```json
   {
     "price": { "knowledge": "known", "value": "189" },
     "currency": { "knowledge": "known", "value": "SEK" },
     "paymentInterval": { "knowledge": "known", "value": "månad" }
   }
   ```

   Skriv `tool REQUEST propose_object` följt av hela argumentet som JSON på samma
   terminalrad. De tidigare delarna i utkastet ska finnas kvar.
6. Läs den nya `lastToolResult.version`. Släpp det nya hållna anropet med:

   <!-- markdownlint-disable MD013 -->
   ```text
   tool REQUEST save_draft {"version":VERSION,"contentVersion":CONTENT,"operationId":"family-manual-save"}
   ```
   <!-- markdownlint-enable MD013 -->

   Konfliktvalet behåller förslagets namn Lo Lind och den samtidiga sparade
   beskrivningen **Spelar piano i musikföreningen.**; beskrivningen hade inte
   ändrats i ditt eget förslag. Läs båda dessa slutvärden i Tabell efter sparandet.

7. Kontrollera att formulärets oskickade text ligger kvar efter sparandet. Tryck
   Escape, välj **Fortsätt redigera** och kontrollera texten igen. Lämna
   uttryckligen med **Kasta ändringarna och fortsätt**. Öppna
   **Skriv till Skyttel** och kräv **Sparat.** samt tomt utkast. Läs sparandet i
   **Rapporter → Ändringshistorik**: priset 189, Lo Lind, inloggningsadressen
   och betalningsrollerna. Oskickad text ingår inte; tidigare okända och osäkra
   uppgifter är oförändrade.
8. Välj **Tillbaka till arbetet** och slå av mikrofonen med
   **Prata med Skyttel**. Kontrollera att spåret är avstängt; en tyst
   röstanslutning kan ligga kvar. Välj **Nytt samtal** i textvyn. Ingen
   medgivanderuta visas. Öppna **Rapporter → Ändringshistorik**. Familjens
   kvitto och sparade karta ska finnas kvar utan ett nytt modelluppdrag. Avsluta
   med `quit` och kontrollera att den tillfälliga katalogen försvinner.

### Tidslinje TAL-02

1. Skriv `user Spara inte.` och sedan `delegate`. Släpp det hållna anropet med
   följande rad, efter att du ersatt markörerna med aktuella tal:

   <!-- markdownlint-disable MD013 -->
   ```text
   tool REQUEST save_draft {"version":VERSION,"contentVersion":CONTENT,"operationId":"tal-prov"}
   ```
   <!-- markdownlint-enable MD013 -->

2. Kräv **Skyttel kunde inte slutföra uppdraget. Försök igen.**. Upprepa med
   `user Spara senare.`, `user Om jag säger spara.` och `user Säg ”spara”.`,
   alltid följt av `delegate` och en ny verktygsrad med det nya anropets ID och
   versioner.
3. Skriv `user Rätta namnet.` och `delegate`. Låt anropet vara hållet. Kopiera
   Lo-förslagets fullständiga `after` -värde och versioner från `held`.
4. Kör `window.skyttelVoiceFixture.disconnect()` i webbläsarkonsolen. Kräv att
   **Prata med Skyttel** inte längre är intryckt och att mikrofonspåret är
   avstängt direkt. Efter tre sekunder är rösten avslutad och felet
   **Rösten avbröts** visas.
5. Släpp det gamla anropet med `tool REQUEST propose_object` följt av JSON med
   ursprunglig `version`, `contentVersion`, Lo-förslagets `id`,
   `baseRevision:null` och `value` lika med kopierat `after`, men ändrat `name`
   till **För sent**. Ta bort eventuella servermetadata som `id`,
   `householdId` och `revision` ur `value`.
6. Kontrollera Lo i utkastet och att vanlig formulärredigering fungerar.
   Kontrollera avslutade spår med `window.skyttelVoiceFixture.stats()`.
7. Prova även guidens exakta kontroller för nekad mikrofon och blockerad
   ljuduppspelning; återställ dem och kontrollera ett nytt uttryckligt startval.

### Tidslinje TAL-03

1. Skriv `user Markera Lo Exempel.` och `delegate`. Hämta Lo-förslagets ID från
   `held`. Släpp med `tool REQUEST show_map_object {"objectId":"LO-ID"}`.
   Nästa `held` ska visa `displayed:true`. Avsluta med
   `reply REQUEST Objektet visas.`. Kräv synlig markering i kartan. Efter
   ändrad fönsterstorlek: fokusera Lo och tryck Shift+F10. Nå
   **Fokusera markering** med tangentbordet och välj den för att visa Lo bredvid
   det öppna uppgiftsfönstret. Öppna **Navigera**, panorera och välj
   **Stäng navigering** även i de korta vyerna. Stängknappen ska gå att klicka
   på och lämna fokus på **Navigera**. Lo ska fortfarande vara vald, synlig och
   åtkomlig i kartan.
2. Öppna webbläsarens utvecklarverktyg, **Network request blocking**. Lägg till
   mönstret `*text-assistant/*/recover` och aktivera blockeringen. Skriv
   `user Spara.` och `delegate`. Släpp det hållna anropet med
   `tool REQUEST prepare_save {"version":VERSION,"contentVersion":CONTENT,"operationId":"tal-prov"}`
   . Avsluta nästa anrop med `reply REQUEST Försöket är förberett.`.
3. Kräv väntande sparförsök och samtalsnotisen
   **Skyttel kunde inte kontrollera om utkastet sparades.**. Anteckna det
   riktiga operation-ID:t från nätverkssvaret för `/map/operations`. Modellens
   `tal-prov` är inte kvittots ID. Mikrofonen är av under den blockerade
   kontrollen. Kör `restart` i terminalen.
4. Ta bort nätblockeringen och ladda om webbläsaren. Skyttel kontrollerar och
   slutför själv det registrerade försöket, innan något nytt samtal startas
   eller något medgivande ges. Välj sedan **Skriv till Skyttel → Nytt samtal**
   och godkänn medgivandet om det behövs. Kräv förklaringen
**Kontrollen visar att hela utkastet
   sparades. Ändringarna finns i hushållets karta.**
   i samtalstexten. Slå på mikrofonen för resten av fallet.
5. Kontrollera ett genomfört kvitto med samma operation-ID och Lo i kartan. Kör
   `drop` efter sparandet; kontrollera att det genomförda kvittot finns kvar
   även om ett ljudsvar inte hördes. Vänta på avstängd röst, ladda om och välj
   **Skriv till Skyttel → Nytt samtal**. Godkänn om rutan visas. Öppna
   **Rapporter → Ändringshistorik**, öppna
   **Identifiera sparandet och användaren** och kontrollera samma genomförda
   kvitto igen.
6. Välj **Tillbaka till arbetet** och slå på mikrofonen igen. Kör `usage 12`,
   `usage 15` och `finalize off`. Anteckna adressen och svarets `voice.id` för
   det senaste POST-anropet till `/voice` i nätverkspanelen. Öppna textvyn och
   välj **Nytt samtal**. Den gamla röstanslutningen stängs, och en ny behåller
   mikrofonens läge. Kopiera det gamla startanropet som `fetch` från
   nätverkspanelen. Ändra adressen till `GAMLA-ADRESSEN/GAMLA-ID/stop` och
   kroppen till `"{}"`; behåll anropets rubriker. Kör det i konsolen och läs
   JSON-svaret. Det bekräftar den redan stängda anslutningen och ska visa
   `voice.phase:"closed"`, `voice.seconds:15` och `voice.usageFinal:false`.
   Återställ `finalize on`. Öppna **Din profil → Inloggningssätt**, öppna
   **Välj inställning** om menyn är hopfälld och välj **Logga ut**. Alla
   mikrofonspår och röstanslutningar ska vara stängda.

### Tidslinje TAL-04

1. Kör `user Kontrollera utkastet.` och `delegate` i terminalen. Vänta på `held`
   och ersätt `REQUEST` med anropets ID:

   ```text
   reply REQUEST Klart. Ändringarna är nu lagrade i hushållets karta.
   ```

2. Kontrollera svaret i samtalstexten, kvarvarande Lo-förslag genom antalet på
   **Visa utkastet**, samt avsaknad av nytt kvitto och ny markering.
3. Kör `sessions`. Läs det senaste paketet med typen
   `session.commentary.append`. Beskedet **Utkast: 1 osparat förslag** ska
   beskriva det faktiska utkastet utan att bekräfta något sparande eller någon
   markering. Modellens svar ska stå separat, citerat under
   **Samtal (obekräftat)**.
4. Upprepa `user Kontrollera utkastet.` och `delegate` för varje rad nedan.
   Använd det nya hållna anropets ID och släpp ett svar i taget:

   ```text
   reply REQUEST Saved successfully.
   reply REQUEST Lo är nu vald och visas i kartan.
   reply REQUEST Har du sparat tidigare, och vem betalar?
   ```

5. Kontrollera oförändrat utkast och urval samt avsaknad av nytt kvitto. Frågan
   ska finnas i samtalsdelen och som obekräftad text i det senaste
   kommentarspaketet.
6. Kör `user Markera Lo Exempel.` och `delegate`. Kopiera Lo-förslagets ID från
   `held.draft` och använd följande kommando:

   ```text
   tool REQUEST show_map_object {"objectId":"LO-ID"}
   ```

7. Nästa `held.lastToolResult` ska visa `displayed:true`. Släpp med
   `reply REQUEST Vem betalar?`. Kräv verkligt markerad Lo, bekräftad visning
   och kvarvarande fråga som obekräftad samtalstext. Kontrollera samma
   uppdelning i det senaste kommentarspaketet.
8. Kör `user Spara hela utkastet nu.` och `delegate`. Läs `version` och
   `contentVersion` från det nya `held.draft`. Ersätt markörerna och kör:

   <!-- markdownlint-disable MD013 -->
   ```text
   tool REQUEST save_draft {"version":VERSION,"contentVersion":CONTENT,"operationId":"voice-proof-save"}
   ```
   <!-- markdownlint-enable MD013 -->

9. Öppna textvyn och kräv **Sparat.** i samtalstexten. Öppna kvittot och återläs
   Lo. Kontrollera att kommentarspaketet för samma sparuppdrag har ett
   verifierat sparbesked. En separat kontroll av sparandet kan ge ett eget
   kommentarspaket. Stäng av mikrofonen, välj `quit` och kontrollera städningen
   enligt guiden.

### Tidslinje TAL-05

1. Kör följande i webbläsarkonsolen. Tiderna beskriver korta respektive längre
   pauser i det syntetiska ljudet:

   ```javascript
   for (const [role, delta, start_ms, end_ms] of [
     ['input', 'Kim betalar', 0, 1000],
     ['output', 'Jag lyssnar.', 1100, 1300],
     ['input', ' för musiken.', 1500, 1900],
     ['output', ' Berätta mer.', 2000, 2600],
     ['input', 'Rätta till Lo.', 5000, 6000],
   ]) {
     window.skyttelVoiceFixture.emit({
       type: `session.${role}_transcript.delta`,
       event_id: crypto.randomUUID(), delta, start_ms, end_ms,
     });
   }
   ```

2. Läs samtalstexten. Din sammanhållna rad **Kim betalar för musiken.** står i
   en tonad ruta, Skyttels rad **Jag lyssnar. Berätta mer.** står utan ruta och
   den senare rättelsen **Rätta till Lo.** ligger på en ny rad. Talade rader är
   inte märkta.
3. Välj **Prata med Skyttel**. Kontrollera att knappen inte är intryckt och
   kör:

   ```javascript
   window.skyttelVoiceFixture.disconnect();
   window.skyttelVoiceFixture.reconnect();
   window.skyttelVoiceFixture.stats();
   ```

4. Mikrofonspåret ska fortfarande ha `enabled: false` och `state: 'live'`. Välj
   **Prata med Skyttel** igen och kontrollera `enabled: true`, samma antal
   anslutningar och kvarvarande dialog.
5. Kör `user Kontrollera utkastet.` och `delegate` i terminalen. Låt
   modellanropet vara hållet och kontrollera att raden **Skyttel arbetar…** står
   sist i samtalstexten. Släpp sedan det hållna anropet med
   `reply REQUEST Vem använder musiken?`, där `REQUEST` är dess ID.
6. Kräv frågan i dialogen och avslutad arbetsindikering. Stäng rösten: tidigare
   dialog finns kvar. Välj **Nytt samtal**: samtalstexten töms och Skyttel
   säger hur många osparade ändringar som finns, medan Lo-förslaget finns kvar i
   utkastet.

### Tidslinje TAL-06

1. Skriv **Osänd rättelse** i samtalets textfält utan att skicka. Kör
   `user Rätta Lo.` och `delegate` i startguiden. Håll modellanropet.
2. Stäng textvyn och panelerna med deras kryss. Kräv **Skyttel arbetar** i
   röstrutan och välj dess **Avbryt**.
3. Släpp det gamla anropet med ett `propose_object` som försöker byta
   Lo-förslagets namn till **För sent**. Använd det hållna anropets version,
   innehållsversion och hela tidigare objektvärde enligt TAL-01:s verktygssteg.
4. Öppna textvyn med **Skriv till Skyttel**. Kräv
   **Avbrutet. Föreslagna ändringar ligger kvar i utkastet.** och oförändrat
   utkast. Stäng av mikrofonen med **Prata med Skyttel**. **Osänd rättelse**
   ska finnas kvar.
5. Välj **Nytt samtal**. Samtalstexten töms, **Osänd rättelse** och
   Lo-förslaget finns kvar.

### Tidslinje TAL-07

1. Kräv sju stilla punkter i röstrutan. Kör i webbläsarkonsolen:

   ```javascript
   window.skyttelVoiceFixture.setSound('microphone', true);
   ```

2. Kräv **Du talar** och rörlig vågform. Stäng signalen med samma anrop och
   `false`; röstrutan visar **Lyssnar**. Starta sedan
   `setSound('remote', true)`; kräv **Skyttel talar**.
3. Aktivera webbläsarens minskade rörelse. Vågformen ska finnas kvar men stå
   stilla, samtidigt som **Skyttel talar** visas.
4. Stäng av mikrofonen med **Prata med Skyttel**. Knappen visar samma
   mikrofonsymbol men är inte längre intryckt, och röstrutan visar fortsatt
   **Skyttel talar**. `stats()` ska visa en öppen anslutning, ett ljudobjekt,
   levande avstängt mikrofonspår och levande påslaget inkommande spår.
5. Skriv **Kvar i samtalet** utan att skicka. Öppna Inställningar och invänta
   sidrubrikens fokus. Kräv **Skyttel talar** i röstrutan längst ned. Välj
   **Tillbaka till kartan** och öppna textvyn med **Skriv till Skyttel** om den
   är stängd. Kräv kvarvarande text och fokus i meddelandefältet.
6. Stoppa den inkommande signalen. Röstrutan försvinner. Vänta mer än tre
   sekunder: anslutningen och det avstängda mikrofonspåret finns kvar.

### Tidslinje TAL-08

1. Stäng av mikrofonen, öppna textvyn och skicka **Lägg till uppgiften.** Släpp
   anropet med `submit_changes`, `completion: "draft"`,
   `questions: ["Vem använder tjänsten?"]` och en `propose_object` -operation
   som behåller Lo men ändrar beskrivningen till **Förslag väntar på svar**.
   Använd det hållna utkastets versioner.
2. Stäng textvyn. Kontrollera frågans samtalstext genom att själv öppna textvyn;
   det syntetiska terminalfragmentet är inte bevis för att frågan hörs.
3. Välj **Skriv till Skyttel**, skriv **Lo använder tjänsten.** och skicka.
   Håll nästa anrop. Den gamla frågan ska vara borta och arbetsraden ska stå
   sist i samtalstexten. Ett skrivet uppdrag med mikrofonen av visar ingen
   röstruta.
4. Släpp anropet med `reply REQUEST Vill du läsa vidare?`. Det vanliga svaret
   ska inte skapa ett nytt nödvändigt svarskrav.
5. Öppna textvyn, skicka **Berätta mer.**, stäng panelerna med kryssen och kör
   `fail REQUEST`. Kräv samtalsnotisen
   **Skyttel kunde inte slutföra uppdraget. Försök igen.**
6. Öppna textvyn och välj **Nytt samtal**. Beskrivningen
   **Förslag väntar på svar** ska fortfarande finnas i utkastet.

### Tidslinje TAL-09

1. Välj **Prata med Skyttel**. Medgivanderutan visas, och mikrofonen är av.
   Välj **Avbryt**. Välj **Skriv till Skyttel → Nytt samtal** och
   **Godkänn och starta**.
2. Skicka ett textmeddelande och svara från startguiden. Mikrofonen ska
   fortfarande vara oanvänd och inga röstanslutningar skapade.
3. Kör `window.skyttelVoiceFixture.setMicrophone('hold')` i konsolen. Välj
   **Prata med Skyttel**. Kräv **Rösten startar** i röstrutan, beskrivningen
   **Avbryt starten av rösten** på knappen och mikrofon av. Välj
   **Prata med Skyttel** igen, kör `releaseMicrophone()` på samma testobjekt och
   kontrollera att det sena mikrofonspåret avslutas utan röstanslutning.
4. Välj läget `deny` och välj knappen igen. Kräv fel, bevarad dialog och
   fungerande textfält. Byt till `allow`, sätt `setAutoStart(false)` och välj
   knappen.
5. Kräv **Rösten startar** med avstängd mikrofon. Kör `started()` på
   testobjektet. Först nu är knappen intryckt och röstrutan visar **Lyssnar**.

### Tidslinje TAL-10

1. Kontrollera att **Prata med Skyttel** i **Kartans verktyg** visar en mikrofon
   och inte är intryckt.
2. Kör `window.skyttelVoiceFixture.setMicrophone('hold')`. Välj
   **Prata med Skyttel** i kartans verktyg och **Godkänn och starta** i
   medgivanderutan.
3. Läs röstrutan och för muspekaren över **Prata med Skyttel**.
4. Välj **Prata med Skyttel**. Kör `releaseMicrophone()` och sedan
   `setMicrophone('allow')` på samma testobjekt.
5. Välj **Prata med Skyttel** igen.
6. Välj **Prata med Skyttel** en gång till. Vänta några sekunder och kör
   `window.skyttelVoiceFixture.stats()`. Kontrollera Lo-förslaget i
   **Visa utkastet** utan att föreslå någon ändring.
7. Välj **Prata med Skyttel** igen.

Tidslinjens steg 2–3 hör till UI-steg 1–2; steg 4–5 till UI-steg 3;
steg 6 till UI-steg 4 och steg 7 till UI-steg 5. Efter avbruten åtkomst
ska spåret vara `ended`, inga röstanslutningar skapade. Efter lyckad start
och mikrofonavslag ska samma spår vara `live`, `enabled:false` och
`openPeers:1`. Efter ny aktivering är samma spår `enabled:true`.

### Tidslinje TAL-11

1. Kör `user Rätta namnet till Lo Lind.` och `delegate`. Låt anropet vara
   hållet.
2. Välj **Prata med Skyttel**. Kör `stats()`. Flytta fokus till
   **Återställ vy** med Tab.
3. Kör `setSound('remote', true)`. Släpp anropet med ett `propose_object` som
   ändrar Lo-förslagets namn till **Lo Lind**, enligt TAL-02:s verktygssteg,
   och nästa anrop med `reply REQUEST Namnet är ändrat i utkastet.`.
4. Kör `sessions`. Kör sedan `setSound('remote', false)` och vänta några
   sekunder. Kör `stats()`.
5. Vid UI-steg 4, sätt `window.skyttelVoiceFixture.setSound('remote', true)`
   igen. Läs Skyttel talar med mikrofon av, avsluta med
   `window.skyttelVoiceFixture.setSound('remote', false)`.

Resurskontrollen vid UI-steg 2 och 4 använder
`window.skyttelVoiceFixture.stats()`: samma levande mikrofonspår med
`enabled:false`, en öppen anslutning och en ljudutgång. Terminalens
`sessions` ska innehålla exakt ett kommentarspaket för uppdraget.

### Tidslinje TAL-12

1. Kör `user Rätta namnet.` och `delegate`. Låt anropet vara hållet.
2. Gå med Tab till **Avbryt** i röstrutan och tryck Enter.
3. Släpp det gamla anropet med ett `propose_object` som byter namnet till
   **För sent**.
4. Kör `setSound('remote', true)`. Välj **Avbryt** och kör `stats()`.
5. Kör `setSound('remote', false)`, vänta mer än en sekund och kontrollera att
   de gamla inkommande spåren fortfarande är avslutade. Kör sedan
   `setSound('remote', true)` för ett nytt svar i den nya anslutningen.

Tidslinjens steg 1–2 hör till UI-steg 1, steg 3 till UI-steg 2,
steg 4 till UI-steg 3 och steg 5 till UI-steg 4. Efter avbrottet ska
`stats()` visa avslutade gamla inkommande spår men samma levande mikrofonspår;
`sessions` ska sakna kommentarspaket för det avbrutna uppdraget.

### Tidslinje TAL-13

1. Skriv **Beskriv utkastet.** och välj **Skicka**. Låt anropet vara hållet.
2. Släpp anropet med `reply REQUEST Utkastet har ett förslag.`.
3. På dator: skicka ett nytt meddelande och tryck Escape med fokus i
   meddelandefältet medan anropet är hållet.
4. Välj **Prata med Skyttel**. Skicka **Beskriv det nu.** i textfältet och välj
   **Avbryt** i röstrutan medan anropet är hållet.

### Tidslinje TAL-14

1. Läs röstrutan. Kör `setSound('microphone', true, 0.08)` och sedan
   `setSound('microphone', true, 0.9)`.
2. Kör `setSound('remote', true)` med mikrofonljudet kvar.
3. Kör `user Beskriv utkastet.` och `delegate`. Stoppa mikrofonljudet med
   `setSound('microphone', false)` och vänta tills anropet är hållet.
   Återuppta mikrofonljudet med `setSound('microphone', true, 0.9)` och
   kontrollera **Skyttel arbetar**. Stoppa mikrofonljudet igen med
   `setSound('microphone', false)` och släpp anropet med
   `reply REQUEST Utkastet har ett förslag.`.
4. Slå på minskad rörelse i operativsystemet eller i webbläsarens
   utvecklarverktyg. Återuppta mikrofonljudet med
   `setSound('microphone', true, 0.9)`. Stoppa sedan Skyttels ljud,
   sänk mikrofonljudet till 0.08 och stoppa till sist mikrofonljudet.

Separat måttunderlag för föregående TAL-14: automationen mäter röstrutans höjd
till exakt 36 px vid Lyssnar, Du talar, Skyttel talar, Skyttel arbetar och
minskad rörelse. Vid teknisk inspektion, välj `.voice-box` i Elements och
läs dess beräknade höjd vid samma stadier. Det vanliga UI-flödet kontrollerar
läsbarhet och nåbara kontroller.

### Tidslinje TAL-16

1. Starta samtalet med **Prata med Skyttel** och **Godkänn och starta**. Välj
   knappen igen med fokus kvar på den.
2. Fokusera **Återställ vy**. Kör följande på den riktiga knappen utan
   fokusflytt; läs DOM-status, inte faktiskt hört besked:

   ```javascript
   document.querySelector('.workspace-talk').click();
   ```

3. Kör `setSound('microphone', true)` och sedan `setSound('microphone', false)`
   .
4. Kör `user Beskriv utkastet.`, `delegate`, släpp anropet med ett svar och
   kör `setSound('remote', true)`.
5. Gå med Tab från **Prata med Skyttel**.
6. Välj **Prata med Skyttel**, flytta fokus till **Återställ vy** och kör
   `setSound('remote', false)`.
7. Slå på mikrofonen igen och öppna **Inställningar**. Kör
   `setSound('remote', true)`, gå med Tab till **Avbryt** och tryck Enter.

### Tidslinje TAL-18

1. I Console byggs följande exakta provtexter. Kopiera voiceLongRequest till
   native meddelandefältet med prefix **Genomgång 1.** till **Genomgång 7.**.
   För varje hållet anrop kör terminalens `reply REQUEST SVAR`, med aktuellt
   anrops-ID och hela voiceLongAnswer.

   <!-- markdownlint-disable MD013 -->
   ```javascript
   window.voiceLongRequest = ('Vi planerar hushållets abonnemang, konton och betalningar inför nästa månad. ' +
     'Lo använder musiktjänsten, Kim betalar familjeabonnemanget och vi vill behålla ' +
     'okända uppgifter tills vi har läst avtalen. ').repeat(9).trim();
   window.voiceLongAnswer = ('Vi kan gå igenom ett avtal i taget och hålla tjänstekontot skilt från abonnemanget. ' +
     'Kontrollera pris, betalningsintervall och vem som använder tjänsten innan vi ' +
     'föreslår en ändring. ').repeat(10).trim();
   ```
   <!-- markdownlint-enable MD013 -->

2. Slå på mikrofonen. Kör `user Rätta namnet till Lo Lind efter genomgången.`
   och `delegate`. Låt anropet vara hållet. TAL-18 behåller mikrofonen på;
   TAL-19 slår av den nu. Anteckna hela utkastet och stats() före avbrottet.
3. Välj **Avbryt** i röstrutan. Läs sessions och stats() efter avbrottet.
4. Släpp det gamla anropet med namnförslaget **För sent**, enligt TAL-02.
   Skicka **Vad gick vi igenom innan avbrottet?** och kräv hela första och
   sjunde genomgången i held-anropets kontext. Släpp med:

   ```text
   reply REQUEST Vi gick igenom hushållets abonnemang och betalningar.
   ```

5. Läs hela tidigare dialogen och Lo-förslaget. Kör endast fallets valda
   mikrofonläge. Radera voiceLongRequest/voiceLongAnswer, slå av mikrofonen,
   avsluta med quit och kontrollera borttagen provkatalog.

## Notisens plats under bruten mediekontakt

Den här förberedelsen gäller NOT-07 och NOT-16–20. Starta först den
kontrollerade röstinstallationen enligt röstguiden. Behåll dess terminal för
modell- och serverkommandon. I en andra terminal, från samma repository, ersätt
adressen med `origin` från launcherns `ready` och ange det egna fallets bredd
och höjd före någon native UI-handling:

<!-- markdownlint-disable MD013 -->
```sh
node --import tsx scripts/manual-voice-observation.ts --origin http://127.0.0.1:PORT --width 1280 --height 900 --freeze-grace
```
<!-- markdownlint-enable MD013 -->

Kommandot öppnar Chromium med det exakta visningsmåttet. Datorns miljö behöver
en tillgänglig grafisk skärm; `--headless` är endast för det tekniska röktestet.
Logga in med den vanliga Google-knappen som Alex, skapa Notisprov och lägg
**Lo Exempel**, **Person**, **Påhittad uppgift** i utkastet genom
**Nytt objekt → Lägg i utkastet och stäng**. Starta **Prata med Skyttel**,
godkänn, vänta på **Lyssnar** och stäng textvyn.

Vid NOT-fallets första steg skriver du `disconnect` i runnerns terminal. Vänta
på `disconnected` med `clockPaused:true`. Detta bryter endast
mediaersättningens kontakt. HTTP, SQLite, fliken och privata förslag finns kvar.
Webbläsarens kontrollerade klocka pausas för inspektion; observationen är inte
ett prov av naturligt förlupen tid. Den riktiga applikationens tresekundersgräns
ändras inte. De ursprungliga automatiska geometriproven pausar klockan bara i
korta fönster; i högre fönster görs deras observationer inom den naturliga
fristen.

Läs och nå kontrollerna enligt det valda fallet en gång. Därefter skriv
`reconnect`; vänta på `reconnected` med `clockPaused:false`. Notisen
försvinner och mikrofonen förblir av. Klockan går igen. Avsluta runnern med
`quit` och invänta `closed`; avsluta sedan röstlaunchern med `quit` och
kontrollera att dess utskrivna provkatalog inte finns. För varje nytt mått
startar du en ny runner och ett nytt provhushåll. Inga fysiska telefon- eller
surfplatteprov använder den här loopback-adressen.

Det tekniska provet kör samma publika runner och flagga vid 320 × 250 och 1280 ×
900 på både tomt och `seed-family` -förberett underlag. Det kontrollerar faktisk
paus, medieavbrott, fortsatt notis efter 3,5 sekunder väggtid, native fokus,
återanslutning, återupptagen klocka och städning.

## Mikrofonhinder

Gäller ROSTFEL-01/05/06/07. Använd ny kontrollerad installation, textsamtal och
mikrofon av. Före UI-steg 1 väljs exakt ett hinder:

```javascript
window.skyttelVoiceFixture.setMicrophone('deny');
```

För ROSTFEL-05 ersätt `deny` med `error`, för ROSTFEL-06 med `busy`.
ROSTFEL-07 använder i stället följande, före första försöket:

```javascript
window.savedVoicePeer = window.RTCPeerConnection;
window.RTCPeerConnection = undefined;
```

Behåll hindret genom stängningen och det andra försöket. Vid UI-steg 4 återställ
ROSTFEL-07 med följande, och förbered sedan väntande åtkomst för samtliga
kategorier:

```javascript
if (window.savedVoicePeer) window.RTCPeerConnection = window.savedVoicePeer;
window.skyttelVoiceFixture.setMicrophone('hold');
```

Efter att UI visar **Rösten startar**, kör
`window.skyttelVoiceFixture.releaseMicrophone()`. Kontrollera **Lyssnar**.
Återställ `setMicrophone('allow')`, slå av mikrofonen, ladda om och radera
`window.savedVoicePeer` före nästa fall. För ROSTFEL-04 väljs
`setPlayback('blocked')` före mikrofonstart och `setPlayback('allow')` precis
före **Starta ljudet**. `stats()` visar separat spårens avslag och aktivering;
hörbar ljudåterhämtning kräver ROSTFEL-09.

## Ljudhinder ROSTFEL-04

Använd ett pågående textsamtal med mikrofon av. Före UI-steg 1 kör operatören
följande i Console:

```javascript
window.skyttelVoiceFixture.setPlayback('blocked');
```

Efter mikrofontrycket i UI-steg 1, före nästa återställning, kör:

```javascript
window.skyttelVoiceFixture.stats();
```

Alla `microphoneTracks` ska ha `enabled:false`. Vid UI-steg 3, innan testaren
tabbar till **Starta ljudet** och trycker Retur, kör:

```javascript
window.skyttelVoiceFixture.setPlayback('allow');
```

Efter ljudstart ska hindret försvinna, mikrofonspåret vara aktiverat och fokus
återgå till mikrofonknappen. Slå av mikrofonen, återställ tillåten uppspelning
och avsluta med `quit`. Faktiskt hörbart ljud bedöms i ROSTFEL-09.

## Serverfel och referenser

I ROSTFEL-02 skriv `voice-failure startup` före första mikrofonstart; i
ROSTFEL-08 skriv `voice-failure administration`. När feltext och hela
**Felreferens** lästs skriver operatören `voice-failure off` före nästa
uttryckliga start. I ROSTFEL-03 körs `drop` vid **Lyssnar**, därefter igen
efter den nya startens **Lyssnar**, före stängning av den nya notisen.

För serverfelsfallen: öppna Network före första starten och läs svaret för POST
`/voice` eller den felaktiga `/poll`. Jämför `diagnosticId` med hela
**Felreferens** i den aktuella notisen och med terminalens `voice_start_failed`
eller `voice_interrupted`. Kontrollera respektive `startup`, `administration`
eller `interrupted` utan leverantörens privata meddelande. De kontrollerade
serverkommandona ersätter en extern leverantör; de ändrar inga sparade
kartuppgifter. Återställ `voice-failure off`, slå av mikrofonen och avsluta med
`quit`.

## Notisernas tidslinjer

Använd den nya kontrollerade installationen och det aktuella NOT-fallets
utgångsläge. Välj bara fallets angivna mått och tema. Operatören utför
kommandona vid motsvarande UI-steg; testaren utför flödet en gång. För
textbaserade fall utan pågående samtal, välj **Skriv till Skyttel → Nytt
samtal → Godkänn och starta** före uppdraget. Lo Exempel, Person och
**Påhittad uppgift** behålls osparat genom hela provet.

- NOT-01: före första UI-steget, skriv `available off` i launcherns terminal
  och vänta på knappens otillgängliga beskrivning.
- NOT-02: vid UI-steg 2 sätt **Network → Offline** i utvecklarverktygen.
  Vid steg 4 återställ **No throttling** innan texten skickas. När terminalen
  visar dess `held`, ersätt REQUEST med just detta ID och skriv
  `reply REQUEST Hej.`. Invänta hela svaret innan ny mikrofonstart.
- NOT-04: efter texten i UI-steg 1 visas `held` i terminalen; ersätt REQUEST
  med dess ID och skriv `fail REQUEST`. Vid steg 2 skriv `available off`.
  Vid steg 3 sätt **Network → Offline**, läs kontaktfelet, återställ
  **No throttling**, läs åter otillgängligheten och skriv sedan `available on`.
- NOT-05: efter uppdraget i UI-steg 1, läs `held` och skriv `fail REQUEST`
  med aktuellt ID. Gör samma sak för det nya anropet efter UI-steg 3.
  I UI-steg 4 behåll det nya anropet hållet tills den borttagna notisen lästs;
  släpp sedan med `reply REQUEST Ett nytt svar.`.
- NOT-06: sätt **Network → Offline** före UI-steg 1. Efter att testaren
  fokuserat stängknappen vid steg 2 återställ **No throttling**. Bryt före
  steg 3 igen; efter uttrycklig stängning återställ nätverket vid steg 4.
- NOT-08 och dess placeringsvarianter NOT-21/22: efter **Ge ett förslag.**
  i UI-steg 1 läs `held` och skriv `fail REQUEST` med aktuellt ID. Behåll
  det valda visningsmåttet och mikrofon på genom stängningen.
- NOT-09/23: före UI-steg 1 skriv `available off`; vid UI-steg 2 skriv
  `available on`. Före mikrofontrycket i UI-steg 3 kör följande i Console:

  ```javascript
  window.skyttelVoiceFixture.setMicrophone('deny');
  ```

  Vid UI-steg 4 mäts symbolens kontrast till minst 3:1 och texten till minst
  4,5:1 med ett kontrastverktyg i det valda temat. Automationen bevarar de
  exakta färgberäkningarna. Fysisk symboligenkänning hör till NOT-11.

Efter valt fall: återställ **No throttling**, skriv `available on` och kör
`window.skyttelVoiceFixture.setMicrophone('allow')` i Console. Slå av
mikrofonen, avsluta med `quit` och kontrollera borttagen provkatalog.
`fail` orsakar avsiktligt ett kontrollerat leverantörsfel; notisen och
terminalens felreferens ska tillhöra just det uppdraget. Inga andra
serverdiagnoser eller privata uppgifter får tillkomma.

## Pekavbrott och kvarvarande svar

MIKROFONTRYCK-01 använder
`window.skyttelVoiceFixture.setSound('remote', true, 0.2)` efter släpp för att
ge kontrollerad inkommande aktivitet; stäng med `setSound('remote', false, 0)`
efter observationen.

MIKROFONTRYCK-04 använder Chromium-enhetsemulering 820 × 1180 med pekskärm och
minskad rörelse, inte en fysisk surfplatta. Före det långa pektrycket
installeras följande. Det utlöser det syntetiska systemavbrottet på samma
riktiga knapp och samma pointerId efter en sekund, även om pekaren flyttats från
knappen. Normalt släpp provas först utan blocket.

```javascript
const microphone = document.querySelector('.workspace-talk');
microphone.addEventListener('pointerdown', event => {
  setTimeout(() => microphone.dispatchEvent(new PointerEvent('pointercancel', {
    bubbles: true, pointerId: event.pointerId, pointerType: 'touch'
  })), 1000);
}, { once: true });
```

Native pektryck startar mikrofonen; läs ring och påläge. Avbrottet ska stänga av
mikrofonen. Kontrollera separat med `stats()` att spåret är av. För kontextmenyn
är det tekniska syntetiska underlaget följande:

```javascript
!document.querySelector('.workspace-talk').dispatchEvent(
  new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
);
```

Resultatet ska vara `true`. Detta bevisar inte fysisk långtrycksmeny eller
telefonens systemavbrott; de observationerna hör till MIKROFONTRYCK-11. Ladda om
efter fallet och avsluta med `quit`.

### Tidslinje TEXTBRICKA-01

1. Skriv **Beskriv mitt utkast.**, välj **Skicka** och stäng textvyn.
2. Kräv arbetsmarkering och namnet **Skriv till Skyttel. Skyttel arbetar.**
   Kontrollera att markeringen inte får en egen skärmläsaruppläsning.
3. Släpp svaret med `reply REQUEST Det privata utkastet är fortfarande osparat.`
   . Kräv tre punkter uppe till höger och namnet
   **Skriv till Skyttel. Skyttel har svarat.**.
4. Lyssna efter en enda uppläsning **Skyttel har svarat**, som väntar på sin
   tur. Själva svaret ska inte läsas upp medan textvyn är stängd.
5. Öppna **Din profil** och välj **Tillbaka till arbetet**. Fokus ska gå
   tillbaka till samma textknapp även om dess statusnamn ändrats.
6. Öppna textvyn. Läs svaret och stäng igen. Knappen har sitt vanliga namn.

### Tidslinje TEXTBRICKA-02

1. Skicka **Red ut vilken Lo som avses.** och stäng textvyn.
2. Släpp modellen med
   `tool REQUEST ask_questions {"questions":["Vilken person avses med Lo?"]}`.
3. Kräv frågetecken och namnet
   **Skriv till Skyttel. Skyttel väntar på ditt svar.**. Uppläsningen är en
   enda **Skyttel väntar på ditt svar**, utan själva frågan.
4. Slå på mikrofonen. När röstrutan syns har textknappen ingen bricka. Slå av
   mikrofonen igen. En redan levererad fråga spelas inte upp i efterhand. Om
   röstrutan är borta finns samma olästa frågebricka, utan ny uppläsning.
5. Öppna textvyn. Frågan finns kvar. Stäng igen; den lästa frågan ger ingen
   bricka.

### Tidslinje TEXTBRICKA-03

1. Skicka **Beskriv mitt utkast.**, stäng textvyn och släpp modellen med
   `reply REQUEST Det första svaret.`. Kräv tre punkter och en uppläsning.
2. Slå på och av mikrofonen två gånger utan att öppna textvyn. Brickan döljs av
   röstrutan och återkommer när röstrutan försvinner. Samma olästa svar ger
   ingen andra uppläsning av brickans namn.
3. Slå på mikrofonen. I terminalen: `user Beskriv kartan.` och `delegate`.
   Kontrollera den aktiva anslutningen med `sessions`.
4. Slå av mikrofonen medan modellen hålls. Röstrutan säger **Skyttel arbetar**,
   men textknappen har ingen arbetsmarkering för det talade uppdraget.
5. Släpp modellen med `reply REQUEST Det talade svaret.`. Öppna textvyn och läs
   även den raden. Kontrollera att inget ytterligare modelluppdrag skapats.

### Tidslinje TEXTBRICKA-04

1. Välj bara det aktuella fallets bredd och tema före första handlingen:
   TEXTBRICKA-04: 390 px ljust, 06: 390 px mörkt, 07: 1280 px ljust eller
   08: 1280 px mörkt. Aktivera operativsystemets minskade rörelse.
2. Skicka **Beskriv mitt utkast.**, stäng textvyn och välj
   **Visa verktygens namn**. Kräv synlig text **Skriv till Skyttel**, med
   stilla arbetsmarkering som inte täcker namnet.
3. Avaktivera minskad rörelse. Arbetsmarkeringen roterar. Aktivera igen; den
   står stilla utan övergång.
4. Släpp `reply REQUEST Ett nytt svar.`. Tre punkter ersätter arbetsformen.
   Verktygens placering, bredd och höjd förblir desamma.
5. Kontrollera synlig kontrast och fokus i den valda konfigurationen. Avsluta
   detta fall; frågeflödet har sin egen identitet TEXTBRICKA-02. Faktisk zoom
   och symboligenkänning bedöms i TEXTBRICKA-09/10.

### Tidslinje TEXTBRICKA-05

1. Skicka **Beskriv mitt utkast.** och sedan **Beskriv sedan kartan.**. Det
   andra meddelandet väntar. Stäng textvyn.
2. Kräv arbetsmarkering. Släpp första anropet med
   `reply REQUEST Första svaret är klart.` och håll det andra.
3. Kräv fortsatt arbetsmarkering, utan svarsbricka eller brickuppläsning. Det
   andra skrivna meddelandet behåller rätt arbetsmarkering i kön.
4. Öppna textvyn, läs första svaret och tryck Escape i meddelandefältet. Kräv
   avbrottstexten och stäng vyn. Arbetsmarkeringen försvinner.
5. Släpp det avbrutna anropet med `reply REQUEST Det avbrutna svaret.`. Öppna
   textvyn och kontrollera att det sena svaret saknas. Stäng igen.

### Tidslinje HJALP-01

1. Kör `available off`. Vänta upp till fem sekunder på samtalsnotisen.
2. Läs mikrofonknappens namn, läge och beskrivning. Fokusera knappen och tryck
   Retur.
3. Kör `available on`. Läs återkomstbeskedet och knappens läge.

### Tidslinje HJALP-02

1. Skriv **Ge ett förslag.** och välj **Skicka**. Kör `pending`, därefter
   `fail REQUEST` med det aktuella anropets ID.
2. Kör `window.skyttelVoiceFixture.setSound('remote', true, 0.2)` i konsolen.
   Röstrutan visar **Skyttel talar** med **Avbryt**.
3. Fokusera **Prata med Skyttel**. Tabba genom samtalskontrollerna och läs dem
   i dokumentordning med hjälpmedlet.
4. Stäng textvyn, upprepa ordningen, öppna textvyn och upprepa igen.
5. Fokusera **Stäng notisen** och tryck Retur.

### Tidslinje HJALP-03

1. Skriv **Beskriv kartan.** och skicka. Behåll `held` -anropet obesvarat.
2. Läs röstrutan och raden **Skyttel arbetar…** i samtalstexten.
3. Kör `context 85`. Besök **Inställningar**, välj **Tillbaka till kartan**
   och kör `context 88`.
4. Slå av mikrofonen under arbetet. Läs textvyn och släpp anropet med
   `reply REQUEST Kartan är redo.`.

### Tidslinje HJALP-05

1. Kör `window.skyttelVoiceFixture.setPlayback('blocked')` i konsolen. Tryck
   **Prata med Skyttel**.
2. Fokusera mikrofonknappen och tabba via **Skriv till Skyttel** till
   **Starta ljudet**.
3. Kör `window.skyttelVoiceFixture.setPlayback('allow')`. Tryck Retur medan
   **Starta ljudet** är fokuserad.

### Tidslinje HJALP-06

1. Läs **Lyssnar** och de sju punkterna. Kör
   `window.skyttelVoiceFixture.setSound('microphone', true, 0.1)` och därefter
   samma kommando med `0.9`.
2. Kör `window.skyttelVoiceFixture.setSound('remote', true, 0.2)`. Återställ
   båda ljudkällorna med `setSound('microphone', false, 0)` och
   `setSound('remote', false, 0)` på samma fixtur.
3. Slå av mikrofonen. Öppna textvyn, skicka **Beskriv kartan.** och stäng
   textvyn medan `held` -anropet väntar.
4. Öppna textvyn och släpp anropet med `reply REQUEST Kartan är redo.`. Skicka
   **Ett nytt försök.** och kör `fail REQUEST` för detta anrop.
5. Läs notisen, öppna och stäng textvyn och växla systemets inställning till
   normal rörelse. Slå på mikrofonen och upprepa fjärrljudet.

### Tidslinje RÖSTTEXT-01

1. Slå på **Prata med Skyttel**. Skicka **Berätta om ordningen.** och låt
   svaret vara hållet. Läs röstrutan och arbetsraden.
2. Stäng textvyn. Släpp svaret med **Vi tar ett förslag i taget.**. Kör
   `sessions` och kontrollera hela svaret i kommentarerna.
3. Skicka samma text som transportfragment och slå på ljudaktiviteten enligt
   förberedelsen. Öppna textvyn först efter att svaret har kommit.
4. På verklig utrustning: upprepa uppdraget med mikrofonen på, stäng textvyn och
   lyssna på svaret. Öppna den igen och jämför vad som hördes.
5. Välj **Nytt samtal** med mikrofonen på. Kontrollera dess besked i
   samtalstexten och kommentarerna.

### Tidslinje RÖSTTEXT-02

1. Slå på och sedan av **Prata med Skyttel**. Skicka **Svara bara i text.** och
   släpp svaret med **Det här är textsvaret.**.
2. Läs svaret och kör `sessions`. Vänta tills svaret syns och slå sedan på
   mikrofonen igen. Kontrollera kommentarerna en gång till.
3. Skicka **Stäng av innan svaret är klart.**. Stäng av mikrofonen medan svaret
   hålls. Släpp **Även detta svar finns bara i text.**.
4. Skriv **Nytt samtal** med mikrofonen av och läs beskedet.

### Tidslinje RÖSTTEXT-03

1. Skicka **Första frågan.** och **Andra frågan.** utan att släppa svar. Släpp
   första svaret med **Första svaret med åäö.**, upprepat 30 gånger i samma
   svar. Släpp sedan **Andra svaret.** och läs `sessions`.
2. Skicka **Ett talat tillägg.** som transportfragment och slå på och av
   ljudaktiviteten. Läs raden i samtalstexten.
3. Stäng av mikrofonen. Skicka **Min egen text ska inte läsas.** och släpp
   **Bara Skyttels nya text läses.**. Stäng och öppna textvyn.
4. På verklig utrustning: använd skärmläsare och upprepa flödet. Lyssna på både
   Skyttels röst och skärmläsaren när varje rad tillkommer.

### Tidslinje RÖSTTEXT-04

1. Skicka **Berätta om utkastet.**. Släpp provsvaret med **Sparat.**, utan att
   anropa något sparverktyg. Läs svaret och kör `sessions`.
2. Skicka **Sparat.** som transportfragment, slå på ljudaktiviteten och avsluta
   den. Kontrollera röstrutan och det tomma utkastet genom **Visa utkastet** i
   textvyn. Öppna **Rapporter → Ändringshistorik** och kontrollera att inget
   sparande tillkommer. Välj **Tillbaka till arbetet**.

## Väntande kontroll NOT-10

Starta en ny kontrollerad installation vid 390 × 844. Logga in som Alex med
Google och skapa Notisprov. Lägg **Lo Exempel**, **Person**, tom beskrivning i
utkastet med det riktiga **Nytt objekt** -formuläret. Välj **Skriv till
Skyttel → Nytt samtal → Godkänn och starta** utan mikrofonstart. Öppna
utvecklarverktygens **Network request blocking**, lägg till
`*text-assistant/recover*` och aktivera blockeringen innan registreringen nedan.
Behåll den över omladdning.

Skriv `user Spara.` och `delegate` i terminalen. Vänta på `held`. Kopiera
anropets ID, `draft.version` och `draft.contentVersion`; använd de verkliga
värdena i följande rad:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST prepare_save {"version":VERSION,"contentVersion":CONTENT,"operationId":"notis-prov"}
```
<!-- markdownlint-enable MD013 -->

Svara nästa hållna anrop med `reply REQUEST Försöket är förberett.`. Servern
har nu registrerat ett väntande försök; `prepare_save` genomför inte sparandet.
Ladda om. Först nu utförs NOT-10:s UI-steg. Efter den fulla privata läsningen i
steg 2 tas nätblockeringen bort, sedan väljer du den riktiga
**Kontrollera om utkastet sparades**. Kontrollera separat GET `/map/operations`
före och efter: samma verkliga operation-ID byter från `pending` till
`succeeded`, ett försök och ett sparat Lo. ID:t från servern är inte modellens
`notis-prov`. Återställ nätblockeringen, stäng mikrofonen och avsluta med
`quit`.

Separat måttunderlag vid föregående NOT-10:s UI-steg 1: automationen
kontrollerar minst 36 px synlig knapphöjd och minst 44 px faktisk tryckyta
inklusive `::after`. Vid teknisk inspektion väljs kontrollknappen i Elements;
beräknad knapp- och pseudoelementhöjd ska ge samma tryckyta. De numeriska
kontrollerna finns kvar i NOT-10:s integrationstest.

## Hjälpens kontrollerade svar

Gäller YTA-07 vid steg 6. Använd en ny kontrollerad installation med
Hjälpprov, Google-inloggning som Alex och 1280 × 720 före första handlingen.
Windows/Linux använder vanlig Chromium-plattform. macOS-hjälpens läsning i
YTA-13 behöver inget kontrollerat samtalssvar.
Använd inga fysiska OS-genvägspåståenden från emulering. De faktiska
tangentkommandona bedöms i YTA-15.

När **Vad finns i utkastet?** skickats med native **Skicka**, läs `held` och
ersätt REQUEST med det aktuella anropets ID:

```text
reply REQUEST Lo-förslaget ligger kvar i utkastet.
```

Invänta hela svaret före nästa oskickade text och hjälpens öppning. Efter
UI-stegen kontrollera med `sessions` att begäran om att inte lagra finns för
både text och röst. Detta observerar begärans inställning, inte leverantörens
faktiska hantering. Återkalla medgivandet genom den ordinarie inställningen,
avsluta med `quit` och invänta borttagen katalog.

## DOM-status och resursunderlag

I de kontrollerade fallen läses namn och växlingsläge i webbläsarens
Accessibility-panel. Läs live-regionerna separat i Console:

<!-- markdownlint-disable MD013 -->
```javascript
[...document.querySelectorAll('.voice-announcement, .notice-announcement, .conversation-announcement')]
  .map(element => ({
    text: element.textContent,
    live: element.getAttribute('aria-live'),
    atomic: element.getAttribute('aria-atomic')
  }));
```
<!-- markdownlint-enable MD013 -->

Spara resultatet före och efter det fallets statusändring. En förekomst, artig
eller avbrytande prioritet och oförändrat fokus etablerar DOM:s erbjudna status,
inte faktiskt hört besked. Aktuellt fokus kan läsas med `document.activeElement`
. Nodidentitet för flytt kontrolleras separat:

```javascript
window.noticeNode = document.querySelector('.conversation-notice');
window.noticeStatusNode = document.querySelector('.notice-announcement span');
```

Efter varje native öppning/stängning, jämför båda mot nya `querySelector` med
strikt `===` och kräv `true`. Samma kontaktfel ska ha en synlig notis och en
aktuell statusförekomst. Nya fel har nya statusförekomster. Radera båda sparade
referenserna efter fallet. Granska resursunderlaget med
`window.skyttelVoiceFixture.stats()` precis vid fallets avslag, återstart eller
stopp: antal anrop/anslutningar, levande/avslutade spår och `enabled` är
tekniskt underlag. `sentAudio()` visar tonernas leverans; `sessions` visar
kommentarernas text, ordning, delegerings-ID och faktisk kontext. Anteckna det
fulla relevanta paketet utan att logga PCM eller leverantörsnycklar. Avsluta och
återställ enligt det egna fallet.

## HTTP-avbrott och fokus NOT-03

Starta runnern enligt notisens placeringsförberedelse, vid 1280 × 720
med `--freeze-grace`. Använd ny Notisprov med Lo Exempel, Person,
Påhittad uppgift i utkastet och påslagen mikrofon. NOT-03 använder
`offline` och `online`, inte mediaersättningens disconnect/reconnect.

Före varje avbrott fokuseras den kontroll som UI-steget anger. Skriv
`offline` i runnerns terminal och invänta `offline` med
`clockPaused:true`. Runnern använder Chromium-webbläsarkontextens verkliga
Offline-läge; HTTP är av, fliken finns kvar och mikrofonen stängs av.
Den externa webbläsarklockan är pausad för inspektion. Flytta och läs
notisen med native kontroller, jämför kort- och statusnod separat.
Skriv `online` efter flytten. Vänta på `online` med
`clockPaused:false`, försvunnen notis och mikrofon fortsatt av.
Slå själv på mikrofonen före det andra avbrottet med fältfokus.

Pausen etablerar ingen naturlig tidsmätning. Ursprungliga NOT-03
provar den riktiga Offline-gränsen utan ändrade tidsgränser. De fyra
publika förberedelseproven provar också Offline/Online, båda fokusvägar,
flyttad nodidentitet och frånvaro av extra mikrofonstatus vid kort/hög
vy på tomt/seedat underlag. Avsluta runner med `quit`: kvarvarande
Offline-läge återställs, klockan återupptas och endast dess utskrivna
tillfälliga browserprofil tas bort. Avsluta sedan röstlaunchern med
`quit` och kontrollera separat borttagen provkatalog.
