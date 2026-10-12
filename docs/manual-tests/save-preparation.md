# Förbered styrd sparleverans

Denna förberedelse styr leverans av riktiga HTTP-anrop och svar i ett
separat provhushåll. Den ändrar inte behörighet, transaktioner eller kvitton.
Använd påhittade uppgifter och behåll samma databas genom kontroll och omstart.
Ett vanligt offlineprov visar inte ett tappat svar efter genomförd transaktion.

## Vanligt sparande

Kör i repositoryts rot på en dator med grafisk Chrome:

```bash
npm run build
npm run test:env -- node --import tsx scripts/manual-draft-save.ts --chrome
```

Utan `--chrome` används installerad Chromium. Fjärrmiljöer behöver ett
tillgängligt grafiskt skrivbord. Provinstallationen öppnas inloggad som
Alex med **Alex blå cykel** i utkastet och utan AI. `new-empty` ger i stället
ett tomt hushåll. `new-draft` skapar en ny installation med cykelförslaget.
De kommandona raderar föregående provinstallation; använd dem mellan fall,
inte för att återhämta ett okänt sparande.

- `hold` håller sparbegäran före serverns transaktion. `release` skickar den.
- `hold-after` låter servern slutföra begäran och skriver dess verkliga
  status. Efter status 200 hålls ett redan genomfört sparandes svar.
  `release` levererar svaret och `drop` tappar det.
- `lost-response` genomför sparbegäran och tappar sedan dess svar.
  Kräv status 200 innan du behandlar det som genomfört sparande.
- `refresh-failure` blockerar bara GET-hämtningen av kartan.
- `hold-check` håller nästa GET-svar för ett beständigt sparförsök efter
  serverns riktiga uppslagning. Skriv kommandot före **Kontrollera sparandet
  igen**. Vänta på `Save lookup completed` med verklig status och håll
  svaret medan du läser **Kontrollerar sparandet…** och provar fokus.
  `release-check` levererar samma svar och stänger av kontrollens hållning.
  `new-draft`, `new-empty`, `quit` och Ctrl+C släpper också ett hållet
  kontrollsvar före återställning eller avstängning.
- `pending-attempt` registrerar ett riktigt väntande försök och laddar om
  medan den automatiska kontrollen blockeras. `network-ok` tar bort fel;
  ladda om för att starta automatisk kontroll efter tidigare kontrollfel.
- `result` skriver karta, privata försök och historik som separat tekniskt
  underlag. Identifierare och full kvittojämförelse är inga vanliga UI-steg.
- `network-ok` tar bort tappade svar och blockerade hämtningar.
  Släpp eller tappa först en hållen leverans. `quit` avslutar webbläsaren
  och tar bort provdatabasen. Ctrl+C avslutar också provningen.

## Samtals- och kontrollsvar

Starta den befintliga kontrollerade installationen i repositoryts rot:

```bash
npm run build
npm run test:env -- node --import tsx scripts/manual-voice.ts
```

Öppna dess utskrivna adress i Chromium eller Chrome. Vid fjärrkörning
vidarebefordrar du porten privat enligt
[talprovsguiden](voice-assistant.md#controlled-voice-fixture).
Logga in med Google som Alex och skapa ett nytt tomt hushåll. Leverantör och
media är syntetiska; riktig server, session, HTTP och SQLite används.
Ingen fysisk mikrofon, verklig talförståelse eller leverantörsnyckel behövs.

Öppna utvecklarverktygens Console på den inloggade hushållssidan och klistra
in hela följande block. Det påverkar endast detta fönsters fetch-anrop.
Det ursprungliga fetch-anropet slutförs före ett kontrollerat tappat svar.
Status skrivs ut innan leveransen hålls eller tappas.

<!-- markdownlint-disable MD013 -->
```javascript
(() => {
  window.skyttelSaveDelivery?.clear();
  const original = window.fetch.bind(window);
  const armed = new Map();
  const held = new Map();
  const blocked = new Set();
  const classify = (url, method) => {
    const path = new URL(url, location.href).pathname;
    if (/\/text-assistant\/[^/]+\/recover$/.test(path)) return 'session-recover';
    if (/\/text-assistant\/recover$/.test(path)) return 'recover';
    if (/\/conversation-consent\/revoke$/.test(path)) return 'revoke';
    if (/\/map\/save$/.test(path)) return 'save';
    if (/\/map$/.test(path) && method === 'GET') return 'read';
    if (/\/text-assistant\/[^/]+\/messages$/.test(path)) return 'message';
    if (/\/text-assistant\/[^/]+$/.test(path)) return 'reply';
  };
  const wait = (route) => new Promise((resolve, reject) => {
    held.set(route, { resolve, reject });
  });
  window.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const route = classify(url, method);
    if (blocked.has(route)) throw new TypeError('Controlled unavailable delivery');
    let boundary = armed.get(route);
    if (boundary === 'before' || boundary === 'drop-before') {
      armed.delete(route);
      if (boundary === 'drop-before') throw new TypeError('Controlled unsent request');
      console.log('held-before', route);
      await wait(route);
    }
    const response = await original(input, init);
    if (route === 'reply' && boundary) {
      const body = await response.clone().json();
      if (!body.receipt) return response;
    }
    if (boundary === 'after' || boundary === 'drop-after') {
      armed.delete(route);
      console.log('application-completed', route, response.status);
      if (boundary === 'drop-after') throw new TypeError('Controlled lost reply');
      console.log('held-after', route);
      await wait(route);
    }
    return response;
  };
  window.skyttelSaveDelivery = {
    arm(route, boundary) {
      if (armed.has(route) || held.has(route)) throw new Error('Route already controlled');
      if (!['recover', 'session-recover', 'revoke', 'save', 'read', 'message', 'reply'].includes(route) ||
          !['before', 'after', 'drop-before', 'drop-after'].includes(boundary)) {
        throw new Error('Unknown route or boundary');
      }
      armed.set(route, boundary);
    },
    block(route, enabled) { enabled ? blocked.add(route) : blocked.delete(route); },
    release(route) {
      const item = held.get(route);
      if (!item) throw new Error('No held delivery');
      held.delete(route);
      item.resolve();
    },
    drop(route) {
      const item = held.get(route);
      if (!item) throw new Error('No held delivery');
      held.delete(route);
      item.reject(new TypeError('Controlled lost reply'));
    },
    clear() {
      armed.clear();
      blocked.clear();
      for (const item of held.values()) item.reject(new TypeError('Control ended'));
      held.clear();
      window.fetch = original;
    },
  };
})();
```
<!-- markdownlint-enable MD013 -->

Använd till exempel `skyttelSaveDelivery.arm('reply', 'drop-after')` för
att tappa nästa samtalssvar som innehåller ett verifierat sparkvitto.
Kontroll utan aktivt samtal heter `recover`; ett aktivt samtals kontroll
heter `session-recover`. Välj det namn som förberedelsen för fallet anger.
Invänta Console-beskedet `held-before` eller `held-after` för vald rutt
innan du släpper eller tappar leveransen. Ett synligt kontrollbesked kan
komma strax innan fetch-anropet faktiskt hålls.
`arm('recover', 'before')` håller nästa kontroll före genomförandet;
`release('recover')` släpper den. `arm('recover', 'after')` håller ett
redan genomfört kontrollsvar. `block('recover', true)` ger kontrollfel tills
du kör `block('recover', false)`. `arm('revoke', 'drop-after')` tappar
återkallandets riktiga svar; kräv status 200 och läs återkallat medgivande
efteråt. `arm('message', 'drop-before')` tappar uppdraget före mottagandet;
inget modellanrop eller sparförsök registreras.
`arm('message', 'drop-after')` tappar ett mottaget uppdrags svar
utan att påstå att något sparades.

Armning måste ske före den handling som skickar anropet. Vid omladdning
försvinner konsolkontrollen; installera blocket igen före nästa handling.
För kontroll direkt vid omladdning kan utvecklarverktygens Network request
blocking användas för `*/text-assistant/recover`. Ta bort blockeringen och
använd den synliga återförsöksknappen när kontrollfelet har bekräftats.
`skyttelSaveDelivery.clear()` återställer fetch och avslutar hållen leverans.
Avsluta startguiden med `quit` eller Ctrl+C när alla utfall är kända.

## Registrerat väntande försök

Skapa **Lo Exempel** i ett nytt hushåll och lägg hela objektformuläret i
utkastet. Kopiera hushållets ID från sidans adress. Installera först
konsolkontrollen och kör `skyttelSaveDelivery.block('recover', true)`.
För kontroll utan väntan tillåter du rätt kontrollrutt innan registreringen.
För SPARKONTROLL-04 och verkligt röstprov, använd
`skyttelSaveDelivery.arm('session-recover', 'after')` och lämna rutten
oblockerad. Aktiveringen behöver ingen blockering av `recover`.
Kör därefter med ditt kopierade ID:

```javascript
const mapPath = '/api/households/ID/map';
const state = await (await fetch(mapPath)).json();
const attempt = {
  operationId: crypto.randomUUID(),
  version: state.draft.version,
  contentVersion: state.contentVersion,
};
const registered = await fetch(`${mapPath}/operations`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(attempt),
});
console.log(registered.status, attempt, await registered.json());
```

Kräv status 200 och anteckna försöks-ID och versionerna. Försöket avser
det tidigare uttryckliga sparbesked som fallet återhämtar. Förberedelsen
skapar inget kvitto eller gemensamt kartinnehåll. Använd `restart` i
startguiden för omstart med samma databas. Skapa ingen ny installation
under kontrollen. Fullt kvittoreplay för samma ID och oförändrat nyare
utkast är separat tekniskt underlag i integrationstesten.

## Vanlig installation och annan klient

För SPAR-01 och SPAR-05 används samma publika adress, vanliga inloggningar
och [den styrda transporten](operations.md#spar-05-fördröjd-utkaständring-tappat-sparkvitto-och-avvisat-sparande).
Operatören kopierar provhushållets ID från adressen och startar:

```bash
npm run test:env -- node --import tsx scripts/manual-transport.ts \
  --origin https://PROVADRESS --upstream http://127.0.0.1:4317 \
  --household HOUSEHOLD_ID --port 4318
```

Ersätt adress, hushålls-ID och applikationens loopbackport med installationens
värden. Rikta den befintliga HTTPS-ingången till transportens loopbackport
4318. Transporten ska inte själv ersätta inloggning eller exponeras publikt.
Kontrollera normal inloggning innan du armar `save:drop-after` eller
`save:after`. Vid `after` visar `application-completed` status 200 före
`held-after`; välj sedan `drop` eller `release`. Behåll publika adressen
och databasen genom serveromstart och byte av webbläsarprofil. Avsluta
med `quit` och återställ HTTPS-ingången till applikationen efter kontrollen.

## Kontrollerat text- och talunderlag

UTKAST-14 och UTKAST-15 använder samtalsinstallationen ovan med tomt hushåll.
Terminalens `held` ger REQUEST och hela aktuella utkastet med VERSION och
CONTENT. Släpp varje verktygs fortsatta modellanrop med `reply REQUEST Klart.`
innan nästa UI-steg. Kopiera aktuella versioner från det nya anropet.

För UTKAST-14 loggar Robin in i en andra profil med Microsoft efter
terminalkommandot `identity robin`. Bjud in honom från Alex vanliga
**Administrera tillgång** och acceptera från Robins **Din profil**.
Byt tillbaka med `identity alex` inför Alex senare inloggningar.
Efter att Lo ligger i Alex utkast hämtar operatören provets typ- och
objektidentiteter separat i Alex Console, med hushållets ID:

<!-- markdownlint-disable MD013 -->
```javascript
const path = '/api/households/ID/map';
const map = await (await fetch(path)).json();
console.log({
  person: map.draft.changes.find((change) => change.after?.name === 'Lo Exempel').id,
  service: map.types.find((type) => type.name === 'Tjänst').id,
  uses: map.relationshipTypes.find((type) => type.name === 'Använder').id,
});
```
<!-- markdownlint-enable MD013 -->

Ersätt PERSON, SERVICE och USES nedan med de utskrivna identiteterna.
Vid textstegets hållna modellanrop skriver operatören i terminalen:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST submit_changes {"version":VERSION,"contentVersion":CONTENT,"completion":"draft","operations":[{"name":"propose_object","arguments":{"id":"music","baseRevision":null,"value":{"typeId":"SERVICE","name":"Molnmusik","description":"Från text"}}}]}
```
<!-- markdownlint-enable MD013 -->

Vid talsteget används `user Lo använder Molnmusik.` och `delegate`.
Släpp det hållna anropet med följande och avsluta nästa anrop med `reply`:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST submit_changes {"version":VERSION,"contentVersion":CONTENT,"completion":"draft","operations":[{"name":"propose_relationship","arguments":{"id":"uses","baseRevision":null,"value":{"typeId":"USES","sourceId":"PERSON","targetId":"music","knowledge":"known"}}}]}
```
<!-- markdownlint-enable MD013 -->

För UTKAST-15 börjar det hållna anropet efter att Lo läggs i utkastet.
Kopiera Lo-förslagets ID och hela `after`-värde från `held.draft.changes`.
Ersätt ID och VALUE nedan, och ändra enbart värdets description till
**Förslag väntar på svar**. Släpp sedan frågeresultatet:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST submit_changes {"version":VERSION,"contentVersion":CONTENT,"completion":"draft","questions":["Vilket kort avses?"],"operations":[{"name":"propose_object","arguments":{"id":"ID","baseRevision":null,"value":VALUE}}]}
```
<!-- markdownlint-enable MD013 -->

Avsluta nästa hållna anrop med `reply REQUEST Vilket kort avses?`.
Efter användarens svar används
`reply REQUEST Frågan är besvarad. Förslaget väntar på sparbesked.`.
Det resultatet innehåller inget sparverktyg. UI-steget behöver sedan
ett nytt uttryckligt sparande. Syntetiskt tal är inget prov av faktisk
mikrofon eller svensk talförståelse.

## Syntetiskt kontrollsvar

Operatören använder följande i Console efter att kontrollförklaringen finns
i samtalstexten. För SPARKONTROLL-08 är DELTA den osparade förklaringen;
för SPARKONTROLL-04 är det den sparade förklaringen följd av **Sparat.**.
Detta är separat medieförberedelse, inte faktisk hörbar röst.

```javascript
const delta = 'DELTA';
window.skyttelVoiceFixture.emit({
  type: 'session.output_transcript.delta',
  event_id: crypto.randomUUID(),
  delta,
  start_ms: 0,
  end_ms: 100,
});
window.skyttelVoiceFixture.setSound('remote', true, 0.7);
```

Stoppa signalen med `window.skyttelVoiceFixture.setSound('remote', false)`
när UI-steget anger det. Terminalens `sessions` och
`window.skyttelVoiceFixture.stats().microphoneTracks` är separat teknisk
kontroll av kommentarspaket och fångstspår. De är inte vanliga UI-resultat.
