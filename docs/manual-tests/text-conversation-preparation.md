# Förbered kontrollerade text- och utkastprov

Använd bara påhittade uppgifter i en ny tillfällig installation per fall.
Operatören utför kommandona här vid den angivna UI-gränsen. Den vanliga
användaren följer fallen och läser gränssnittet. `REQUEST` är det aktuella
numret från terminalens `held`; `VERSION` och `CONTENT` kommer från dess
`draft.version` och `draft.contentVersion`. Hela `tool`-kommandot, inklusive
JSON, skrivs på **en** terminalrad. Släpp varje följande verktygsresultat
med `reply REQUEST Klart.` innan nästa steg, utom när fler verktyg anges.
Ett `released`-besked bevisar inte ett genomfört verktyg; läs nästa
`lastToolResult` och användarens synliga utfall.

Starta genom
[textguiden](text-assistant.md#controlled-text-fixture) eller
[röstguiden](voice-assistant.md#controlled-voice-fixture) enligt fallet.
Bygg och starta genom repositoryts npm-skript och gemensamma processlås:

<!-- markdownlint-disable MD013 -->
```sh
npm run build
npm run test:env -- node --import tsx scripts/manual-text-assistant.ts
```
<!-- markdownlint-enable MD013 -->

För röstinstallationen, byt endast skriptnamnet till `scripts/manual-voice.ts`.
Behåll låset under den interaktiva körningen. Fysiska telefoner använder
[vanlig HTTPS-förberedelse](../development/testing.md#physical-device-manual-preparation)
i stället för denna installation på loopback. Inga verkliga leverantörsanrop
utförs av den kontrollerade installationen.

## Familjerättelsen

TEXT-01 använder röstinstallationen. Kör `seed-family` **före all
inloggning**, invänta `seeded` och logga in som Alex med Google. Skapa
inget extra hushåll eller Lo-förslag. Det förberedda hushållet har hela
familjens Molnmusik, skilda konton/adresser/roller, ospecificerat bankkonto,
fristående objekt, en fri osäkerhetsuppgift på ett verkligt samband,
Lo-förslaget och en verklig
samtidig rättelse från Robin Demo. Behåll första modellbegäran tills
användaren har skrivit den oskickade beskrivningen i Kim-formuläret.

Släpp sedan `resolve_conflict` med `version`, `contentVersion` och det
första fullständiga konfliktobjektet från `held.draft.conflicts`, samt
`choice:"proposed"`. Kopiera den nya versionen ur nästa `lastToolResult`.
Släpp `read_map` med `{"query":"Familjens Molnmusik"}`. Nästa resultat
innehåller abonnemangets objekt. Kopiera hela dess värde, ta bort
`id`, `householdId`, `revision`, och behåll dem separat som `id` och
`baseRevision`. Släpp `propose_object` med den nya utkastversionen och
`contentVersion:1`. Ange följande ordnade `properties` på abonnemanget.
Etiketterna har ingen automatisk ekonomisk betydelse.

<!-- markdownlint-disable MD013 -->
```json
[
  { "id": "description", "label": "Beskrivning", "kind": "text", "value": "Familjeabonnemang 189 kr per månad." },
  { "id": "price", "label": "Pris", "kind": "text", "value": "189" },
  { "id": "currency", "label": "Valuta", "kind": "text", "value": "SEK" },
  { "id": "paymentInterval", "label": "Betalningsintervall", "kind": "text", "value": "månad" }
]
```
<!-- markdownlint-enable MD013 -->

Släpp därefter `save_draft` med senaste version, `contentVersion:1` och
`operationId:"family-request"`. Detta är kontrollerad verktygsleverans.
Verklig svensk modellförståelse kräver separat uttryckligen godkänd
leverantörskörning och redovisas separat, aldrig som mänsklig observation
enbart därför att API-anropet kan vara debiterbart.

## Sena svar och nekade sparverktyg

För TEXT-02 antecknar operatören den första begärans versioner, Lo-ID och
hela `after` före användarens kastande. Efter kastandet släpps
`propose_object` med dessa **gamla** versioner, `baseRevision:null` och
kopierat värde med `name:"För sent"`. Efter användarens nästa uppdrag och
Escape släpps motsvarande nästa begäran med ett nytt ID `late`. Använd
aldrig nyare versioner för att reparera det avsiktligt gamla anropet.

För TEXT-03 släpps `save_draft` efter vart och ett av de fem nekade
meddelandena. Ange `version:1`, `contentVersion:1`, `operationId:"no-save"`.
Vänta på den uttryckliga felnotisen före nästa meddelande. Efter
**Beskriv mitt utkast.** körs `fail REQUEST`. Modellersättningens
försök att spara är separat från användarens faktiska tillåtelse.

## Ett faktiskt tappat textsvar efter genomfört sparande

TEXT-04 använder textinstallationen och ett enda osparat Lo-förslag.
Det beständiga utvecklingsskriptet installeras före applikationen på varje
sidladdning. Operatören armar det **före** användarens sparmeddelande:

<!-- markdownlint-disable MD013 -->
```js
window.skyttelTextDelivery.arm();
```
<!-- markdownlint-enable MD013 -->

Efter användarens **Spara hela utkastet nu.**, släpp den hållna begäran:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST save_draft {"version":VERSION,"contentVersion":CONTENT,"operationId":"lost-browser-reply"}
```
<!-- markdownlint-enable MD013 -->

Kontrollen vidarebefordrar det verkliga meddelandet, kräver status 202,
antecknar tidigare försök före meddelandet, läser det nya faktiska
sparförsökets ID tills det har `succeeded` och
tappar först då textsvarens leverans. Konsolen visar fasen med:

<!-- markdownlint-disable MD013 -->
```js
window.skyttelTextDelivery.status();
```
<!-- markdownlint-enable MD013 -->

Kräv `phase:"dropped-after-commit"`. `not-accepted`, `rejected` eller
`not-completed` är andra utfall och får inte rapporteras som genomfört
sparande med tappat svar. **Före `restart`**, efter användarens läsning av
det oklara utfallet i TEXT-04 steg 1, kör operatören följande i Console:

<!-- markdownlint-disable MD013 -->
```js
const completedDelivery = window.skyttelTextDelivery.status();
if (completedDelivery.phase !== 'dropped-after-commit') {
  throw Error('Inget genomfört sparande med tappat svar');
}
console.log(completedDelivery.operationId);
```
<!-- markdownlint-enable MD013 -->

Behåll det utskrivna faktiska operation-ID:t i en separat anteckning.
Skriv `restart`, behåll samma databas och adress, och låt användaren
ladda om. Skriptet börjar då utan armning. Gör inget nytt sparförsök.

**Efter TEXT-04 steg 3 och före steg 4**, medan användaren har öppnat
**Identifiera sparandet och användaren**, kör operatören följande i
Console. Ersätt `KOPIERAT-FAKTISKT-ID` med exakt det behållna ID:t från
före omstarten. Detta läser den öppna historikens faktiska innehåll utan
att ändra sidan eller hushållet:

<!-- markdownlint-disable MD013 -->
```js
const expectedOperationId = 'KOPIERAT-FAKTISKT-ID';
const displayedIdentifiers = [...document.querySelectorAll('.map-history article details[open] p')]
  .map((paragraph) => paragraph.textContent);
if (displayedIdentifiers.filter((text) => text === `Sparande: ${expectedOperationId}`).length !== 1) {
  throw Error('Historiken visar inte det ursprungliga sparandets ID');
}
console.log('Historiken visar det ursprungliga sparandets ID.');
```
<!-- markdownlint-enable MD013 -->

Anteckna jämförelsens faktiska resultat som tekniskt underlag.
TEXT-04:s integrationstest behåller dessutom likheten mellan detta ID,
det enda serverförsöket och historikens visade ID efter omstart.

Efter sista historikläsningen körs `window.skyttelTextDelivery.clear()`.
Avsluta med `quit`, invänta `closed`, stäng provprofilen och ta bort
portvidarebefordran. Offlineläge ersätter inte denna felgräns. Vanlig
HTTPS-ingång, om en sådan tillfälligt används av operatören, återställs
till applikationen **före** transportens `quit`.

## Avvisad leverans med befintligt utkast

TEXT-04 har separat tekniskt underlag för samma publika textstart och
installerade `window.skyttelTextDelivery`. Det använder ett befintligt
Lo-förslag med namnet **Lo Exempel** och beskrivningen **Påhittad uppgift**.
Med aktiverad leveranskontroll ger ett meddelande till en saknad session
HTTP 404 och
`phase:"not-accepted"`. Hela kartan och det meningsfulla utkastet är exakt
oförändrade, och inga sparförsök finns. Kontrollen rensas, omladdning ger
`phase:"idle"`, och `quit` ger `closed`, exit 0 och borttagen provkatalog.
Detta är automatiserat tekniskt underlag, inte TEXT-04:s vanliga UI-steg
eller bevis på tappat svar efter genomfört sparande.

Kör bara det publika avvisningsprovet när den gränsen ska kontrolleras:

<!-- markdownlint-disable MD013 -->
```sh
npm run build
npm run test:integration -- tests/integration/text-assistant.spec.ts --grep 'manual text launcher public preparation seeded rejects an unaccepted delivery'
```
<!-- markdownlint-enable MD013 -->

### Konsoliderad teknisk identitet

Den tekniska identiteten
`manual text launcher public preparation empty rejects an unaccepted delivery`
ersätts av
`manual text launcher public preparation seeded rejects an unaccepted delivery`
i [text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts).
Familjen har ett integrationsexekverat prov i stället för två. Alla
avvisnings-, bevarande-, återställnings- och städningskontroller finns i det
behållna provet. En oberoende avvisningssekvens med tom samling av förslag
ingår inte längre; den befolkade referensen gör inget anspråk på den
kombinationen. Inget funktionellt fall-ID ändras eller återanvänds.

## Visningsanrop och obekräftade påståenden

För TEXT-05 släpps `show_map_object` med Lo-förslagets ID under
`objectId` efter första meddelandet. Läs `displayed:true` i nästa
`lastToolResult` och släpp `reply REQUEST Markerat!`. Håll andra
visningsanropet tills användarens formulär har **Osänd uppgift**.
Släpp samma visningsverktyg; kräv `displayed:false` och släpp samma fria
sluttext. Protokollresultatet är tekniskt underlag; användaren läser
faktiskt urval och bevarat formulär.

För TEXT-06 släpps en fri sluttext efter vart och ett av de fyra
meddelandena, i denna ordning:

<!-- markdownlint-disable MD013 -->
```text
reply REQUEST Klart. Ändringarna är nu lagrade i hushållets karta.
reply REQUEST Saved successfully.
reply REQUEST Lo är nu vald och visas i kartan.
reply REQUEST Har du sparat tidigare, och vem betalar?
```
<!-- markdownlint-enable MD013 -->

Vid sista uttryckliga sparbegäran släpps `save_draft` med
`version:1`, `contentVersion:1`, `operationId:"provider-choice"`.
Användaren granskar samma Lo-förslag mellan fria svar och det enda
verifierade kvittot efter riktig sparbegäran.

TEXT-08 och TEXT-10–13 använder `show_map_item`. För första meddelandet
anges `{"kind":"object","id":"LO-ID"}`, för andra
`{"kind":"relationship","id":"SAMBANDS-ID"}`. Kopiera verkliga ID
från det hållna underlaget. Släpp varje nästa begäran med
`reply REQUEST Här är urvalet.`. Håll tredje visningsanropet tills
formulärets **Till objekt** ändrats till Lo; släpp då objektanropet igen.
Kräv först faktiskt synlig karta/detaljer vid `displayed:true`, sedan
bevarat oskickat formulär vid `displayed:false`.

## Begärda detaljer

TEXT-09 börjar med Lo, Tonrum med status **Gäller fortfarande** och
**Lo Exempel → Använder → Tonrum**, samlat sparade genom gränssnittet.
Efter användarens båda native rättelser släpps `report_result` med
`{"source":"draft"}`. Efter sparmeddelandet släpps `save_draft` med
aktuella versioner och `operationId:"details-save"`. Efter sista frågan
släpps `report_result` med `{"source":"latest_save"}`.
Granska de faktiska rättelserna i gränssnittet innan någon separat
HTTP-jämförelse. Ett senare direkt anrop får inte reparera en trasig form.

## Textvy, mikrofon och korta fönster

TEXTVY-02: håll första svaret för den synliga arbetsraden; släpp
`reply REQUEST Kim betalar musiken.`. Släpp andra med `reply REQUEST Klart.`.
TEXTVY-03: håll originalet tills **Nytt samtal**, släpp därefter gammalt
Lo-värde med namnet **För sent** genom `propose_object` med ursprungliga
versioner. Nästa nya uppdrag får `reply REQUEST Lo Exempel.`. Separat
tekniskt underlag är `pending`, `sessions` och
`window.skyttelVoiceFixture.stats()` före/efter nystart: en mikrofonbegäran,
ett öppet peer, samma levande spår, senare avstängt. Kontrollera `/new`
i Network under fördröjt dubbelklick. Återställ normal nätprofil direkt
efter det enda svaret. Detta säger ingenting om faktiskt hört tal.

TEXTVY-04: släpp `reply REQUEST Ett provsvar.`. TEXTMOBIL-01–02 och
deras separata storleksfall får `reply REQUEST Ett synligt provsvar.`.
TEXTMOBIL-03: före användarens stopp aktiverar operatören
`window.skyttelVoiceFixture.setSound('remote', true)`; därefter körs
`fail REQUEST` vid textfelet. Återställ ljudsignalen till `false` efter
stoppkontrollen. TEXTMOBIL-04 får `fail REQUEST` vid första meddelandet.
TEXTMOBIL-05: kör `user Beskriv utkastet.` och `delegate`, håll svaret för
arbetsstatusen, släpp `reply REQUEST Lo-förslaget ligger kvar i utkastet.`.
Håll nästa skrivna uppdrag genom alla tre storleksbyten; släpp det efteråt.

## Otillgängligt samtal och breddåterställning

TEXTBREDD-03 använder röstinstallationen. Efter ändrade bredder och
markerat startval, före UI-steg 1, kör operatören `available off`.
Användaren laddar om och läser den otillgängliga sidan. Före första
**Återställ bredderna** i UI-steg 2 aktiverar operatören Offline i
webbläsarens utvecklarverktyg och bekräftar det för användaren. Detta
provar ett misslyckat försök att spara de personliga bredderna. Efter
feltexten och fokusläsningen, före återförsöket med Enter i steg 3,
återställer operatören anslutningen till Online och bekräftar det.
Efter den lyckade
återställningen i steg 3 kör operatören `available on`, före återgången
till kartan i steg 4. Återställ inte bredder eller startval vid denna gräns.
Avsluta med `quit` och kräv borttagen provkatalog efter sista läsningen.

## Personligt utkastval

SAMTALSUTKAST-02 använder kostnadsinstallationen. Efter Alex inloggning,
före UI-steg 1, skapar operatören det andra hushållet med följande exakta
engångskommando. Ersätt endast katalogen med installationens utskrivna
katalog. Kör aldrig mot en vanlig databas.

<!-- markdownlint-disable MD013 -->
```sh
SAMTALSUTKAST_DB=/tmp/skyttel-test-REPLACE/skyttel.db node --input-type=module <<'JS'
import Database from 'better-sqlite3';
const path = process.env.SAMTALSUTKAST_DB;
if (!/^\/tmp\/skyttel-test-[^/]+\/skyttel\.db$/.test(path ?? '')) throw Error('Fel provdatabas');
const db = new Database(path, { fileMustExist: true });
db.pragma('foreign_keys = ON');
const alex = db.prepare('SELECT id FROM user WHERE name = ?').get('Alex Exempel');
if (!alex) throw Error('Logga in som Alex först');
db.transaction(() => {
  db.prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)').run('draft-other-household', 'Andra hushållet', new Date().toISOString());
  db.prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)').run('draft-other-household', alex.id, 'administrator');
})();
db.close();
JS
```
<!-- markdownlint-enable MD013 -->

Vid UI-steg 4 kör operatören `identity robin` innan Microsoft-inloggningen
börjar. Efter Robins accepterade inbjudan körs `identity alex` innan Alex
markerar sitt val. Vid steg 5 körs `restart`; adress och databas bevaras.
Efter slutkontrollen avslutas med `quit` och provkatalogen ska försvinna.

## Första förslaget

SAMTALSUTKAST-03 och -06 börjar med tom karta/utkast och markerat personligt
utkastval. Efter UI-steg 2 läser operatören `held` och kör
`tool REQUEST read_map {"query":""}`. Nästa `lastToolResult` anger Person-ID.
Vid nästa hållna begäran används dess aktuella versioner:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST propose_object {"version":VERSION,"contentVersion":CONTENT,"id":"lo","baseRevision":null,"value":{"typeId":"PERSON-ID","name":"Lo Exempel"}}
reply REQUEST Lo ligger i utkastet.
```
<!-- markdownlint-enable MD013 -->

Släpp sluttexten först efter det genomförda förslagets nästa begäran.
Återställ inte utkastvalet under scenariot. Avsluta med `quit` och kräv
borttagen provkatalog efter den sista UI-läsningen.

## Separat verklig modellverifiering

Den ursprungliga språkverifieringen av familjeärendet finns kvar som
separat underlag till TEXT-01. Använd den
[verkliga modellens isolerade setup](../development/devcontainer.md#optional-assistant-access)
och Alex i ett enbart påhittat hushåll Textprov, med verklig Terra low.
Skapa först Lo Exempel, Person, med beskrivningen Påhittad uppgift i
utkastet och starta ett nytt samtal genom det vanliga medgivandet.
Verkliga API-anrop får köras först efter uttryckligt godkännande av deras
kostnad. Ingen sådan körning är genomförd eller påstådd här.

Beskriv Molnmusik med tjänstekonto, separat kontakt- och inloggningsadress,
Alex som avtalspart, Kim som betalare, kort som betalningsmedel och Lo som
användare. Ange 149 kr per månad. Besvara frågor om identiteter; ange ett
omnämnt bankkonto som ospecificerat, en uppgift som okänd och en annan som
osäkert uppgiven. Be om en begriplig sammanställning av hela utkastet.
Kontrollera att Lo-förslaget ingår och att kontot inte blivit en
e-postadress. Be sedan om en rättelse av inloggningsadressen.

Skicka **Rätta priset till 189 kr och spara**. Medan uppdraget arbetar,
stäng textvyn och redigera Kim Exempel genom Tabell. Skriv **Osänd text som
ska finnas kvar** i beskrivningen utan att lägga den i utkastet. Anteckna
om modellen slutför uppdraget innan formulärändringen hinns med.
Kontrollera efter sparandet att texten ligger kvar, även efter Escape och
**Fortsätt redigera**. Lämna uttryckligen med **Kasta ändringarna och
fortsätt**. Läs **Sparat.** och det tomma utkastet. Öppna och expandera
**Rapporter → Ändringshistorik** för att återläsa abonnemangets 189 kr per
månad, betalare, betalningsmedel, konto och båda adresserna samt okända och
osäkra uppgifter. Den oskickade texten ska saknas i sparandet. Ett extra ja
ska inte krävas enbart för att rättelsen ändrar version; osäker identitet
eller samtidig konflikt måste däremot redas ut före ett nytt sparbesked.

Anteckna faktisk modell, källa, datum och observerat resultat separat.
Detta underlag ersätter inte TEXT-01:s ordinarie kontrollerade motsvarighet
och gör inte syntetiska svar till bevis på modellens språkförståelse.
Stäng den isolerade installationen enligt dess setup efter avläsningen.

## Körbara tekniska jämförelser

Råa versioner, kvitto-/operationstal, mikrofonspår, begäranden,
geometri och arkivfält kontrolleras separat av dessa bevarade prov:

<!-- markdownlint-disable MD013 -->
```sh
npm run build
npm run test:integration -- tests/integration/text-assistant.spec.ts
npm run test:integration -- tests/integration/conversation-draft.spec.ts
npm run test:integration -- tests/integration/text-view.spec.ts
npm run test:integration -- tests/integration/mobile-conversation.spec.ts
npm run test:integration -- tests/integration/conversation-widths.spec.ts
npm run test:integration -- tests/integration/assistant-map.spec.ts
npm run test:integration -- tests/integration/conversation-audit.spec.ts --grep TEXTMOBIL-05
```
<!-- markdownlint-enable MD013 -->

Kör efter scenariots sista UI-läsning och dess `quit`/`closed`, när den
interaktiva installationen lämnat tillbaka det gemensamma låset, före
rapportering av resultatet. Proven har egna engångsinstallationer; deras
jämförelser är automatiserat underlag, inte manuella kontroller av samma
databas. Ingen
real-model- eller real-voice-svit ingår. Anteckna källa, Chromium-version
och faktiskt resultat; påstå inte mänsklig/device- eller leverantörskörning.
