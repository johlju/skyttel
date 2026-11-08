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

## Tappat ändringsbesked

TEXT-16 använder en ny kontrollerad textinstallation. Logga in som Alex,
skapa Textprov och lägg Lo Exempel av typen Person med beskrivningen
Påhittad uppgift i utkastet genom det vanliga formuläret. Starta med text
och låt användaren skicka **Lägg till Kim utan att spara.**

Vid första `held` hämtas hushållets aktuella typer:

```text
tool REQUEST read_type_catalog {}
```

Invänta nästa `held`. Kopiera `VERSION` från `draft.version`, `CONTENT`
från `lastToolResult.contentVersion` och `TYPE` från typen Person i
`lastToolResult.types`. Förberedelsen behöver inte få hela Lo-förslaget i
det första underlaget. Blockera först kontrollen av batchens utfall:

```text
block-batch-status on
```

Arma bortfall av det verkliga MCP-svaret från nästa genomförda ändringsbatch:

```text
drop-batch
```

Invänta `batch-delivery` med `phase:"armed"`. Släpp sedan förslaget med
det aktuella anropsnumret och de kopierade värdena:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST submit_changes {"version":VERSION,"contentVersion":CONTENT,"completion":"draft","operations":[{"name":"propose_object","arguments":{"id":"kim","baseRevision":null,"value":{"typeId":"TYPE","name":"Kim"}}}]}
```
<!-- markdownlint-enable MD013 -->

Invänta `batch-delivery` med `phase:"dropped-after-commit"`. Händelsen
betyder att den riktiga servern returnerar ett genomfört utfall innan
förberedelsen tappar MCP-svaret. `not-committed` räknas som en felaktig
förberedelse: läs orsaken, avsluta installationen och börja om med ett
nytt utkast. Kontrollen `batch-delivery` visar senaste felgränsens status.
Låt användaren läsa notisen att ändringarnas resultat är oklart och att
Skyttel kontrollerar det. Användaren kan skriva men inte skicka nytt arbete.
Återställ sedan kontrollens transport:

```text
block-batch-status off
```

Invänta beskedet om det redan genomförda Kim-förslaget. Statuskontrollen
använder samma operation och skapar inget nytt förslag.
Den kontrollerade leverantören intygar inte att hela uppdraget är klart.
Läs därför även beskedet **Uppdraget är inte slutfört. Återstående arbete
är pausat**. Ursprunglig instruktion finns kvar. Den inledande typläsningen
är förberedande arbete. Återhämtningen verifierar endast genomförandet och
skapar ingen ny hållen arbetsbegäran. Släpp inget extra modellsvar här.

För varianten med beställd förklaring startar operatören en ny kontrollerad
röstinstallation enligt inledningen. Förbered samma Lo-förslag, starta med
text och slå på mikrofonen. Användaren skriver **Lägg till Kim utan att
spara, förklara vad ett utkast betyder och beskriv vilket år uppgifterna
gäller.** Kör samma typläsning och leveransbortfall ovan. Byt enbart
förslagskommandot till följande variant med en oberoende väntande fråga:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST submit_changes {"version":VERSION,"contentVersion":CONTENT,"completion":"draft","questions":[{"kind":"information","request":"Beskriv vilket år uppgifterna gäller.","question":"Vilket år gäller beskrivningen?","dependsOnDraft":false}],"operations":[{"name":"propose_object","arguments":{"id":"kim","baseRevision":null,"value":{"typeId":"TYPE","name":"Kim"}}}]}
```
<!-- markdownlint-enable MD013 -->

Återställ statuskontrollen enligt ovan. Läs det genomförda förslaget och
beskedet om pausat återstående arbete i text och kontrollerad röstleverans.
Frågan **Vilket år gäller beskrivningen?** följer det återhämtade beskedet.
Ingen förklaring eller nytt sparande startar genom statuskontrollen.

Låt användaren granska Lo och Kim och stänga förslaget. Kör därefter
`restart`, invänta `restarted` och låt användaren ladda om sidan och
granska utkastet igen. Avsluta med `quit`; den tillfälliga databasen tas
bort. Detta prov använder faktisk verktygsleverans efter genomförande,
utan offlineläge eller verkliga leverantörsanrop.

## Separat överlappningsförsök

Operatören kan upprepa TEXT-17:s enkla osparade ändring, FRAGA-01:s
fråga och TEXT-02:s avbrott med samma underlag i båda körsätten.
Starta en ny tillfällig röstinstallation för varje körsätt:

<!-- markdownlint-disable MD013 -->
```sh
SKYTTEL_CONVERSATION_WORK_MODE=sequential npm run test:env -- node --import tsx scripts/manual-voice.ts
SKYTTEL_CONVERSATION_WORK_MODE=overlap npm run test:env -- node --import tsx scripts/manual-voice.ts
```
<!-- markdownlint-enable MD013 -->

Kör en rad i taget och avsluta installationen med `quit` före nästa.
`ready.executionMode` ska ange valt körsätt. Före det aktuella
användarmeddelandet sätter operatören:

```text
hold-scope on
hold-check on
response-required off
```

`held.kind:scope` är uppdragstolkningen, `work` är arbetsmodellen och
`action-check` är den separata ändringskontrollen. Ersätt SCOPE med
tolkningens ID. Vid överlappning kan arbetsmodellen läsa innan
tolkningen släpps. Sekventiell körning väntar. Använd `pending` för
att läsa vilka anrop som faktiskt hålls.

För den enkla ändringen släpper operatören samma verktyg och värden
som i fallet. Tolkningen släpps separat:

<!-- markdownlint-disable MD013 -->
```text
reply SCOPE {"mode":"work","request":"Lägg till Kim Lind utan att spara.","responseRequired":false}
```
<!-- markdownlint-enable MD013 -->

Ingen utkaständring får finnas före den oberoende kontrollens
godkännande. Vid identitetsfrågan släpps i stället tolkningen med:

<!-- markdownlint-disable MD013 -->
```text
reply SCOPE {"mode":"clarify","request":"Vilken person avses med Lo, och vilket namn ska objektet ha?"}
```
<!-- markdownlint-enable MD013 -->

Detta är en fråga om begäran, utan en ny del i frågeregistret. Frågan
ska visas i samma samtal; ett oförenligt arbetsförslag ska lämnas
oanvänt. I avbrottsfallet hålls tolkningen tills användaren avbryter,
varefter gamla svar kan släppas. Sena svar får inte lägga tillbaka
arbete eller ändra tidigare slutförda förslag.

Återställ med `hold-scope off` och `hold-check off` inför vanliga
förberedelser. Automatikens tekniska variant använder ett tomt utkast,
en enkel Kim-batch, en separat fråga och Escape. Den ersätter inte
hela de ordinarie fallen, fysisk uppläsning eller en mätning med verklig
modell. Ingen väntetidsvinst eller fakturerbar körning ingår.

## Familjerättelsen

TEXT-01 använder röstinstallationen. Kör `seed-family` **före all
inloggning**, invänta `seeded` och logga in som Alex med Google. Skapa
inget extra hushåll eller Lo-förslag. Det förberedda hushållet har hela
familjens Molnmusik, skilda konton/adresser/roller, ospecificerat bankkonto,
fristående objekt, en fri osäkerhetsuppgift på ett verkligt samband,
Lo-förslaget och en verklig
samtidig rättelse från Robin Demo. Behåll första modellbegäran tills
användaren har skrivit den oskickade beskrivningen i Kim-formuläret.

Första `held.draft` är ett urval, inte hela utkastet. Läs hela utkastet med
det hållna anropets ID:

```text
tool REQUEST read_my_draft {}
```

Släpp sedan `resolve_conflict` med det nya anropets ID, `version`,
`contentVersion` och det första fullständiga konfliktobjektet från
`held.lastToolResult.conflicts`, samt `choice:"proposed"`.
Kopiera den nya versionen ur nästa `lastToolResult`.
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

## Verifierat slutbesked

TEXT-17 använder en ny röstinstallation utan `seed-family`. Logga in
som Alex, skapa Textprov och lägg Lo Exempel av typen Person med
beskrivningen Påhittad uppgift i utkastet. Starta samtalet med text och
lämna mikrofonen av. Aktivera följande kontroller före första meddelandet:

```text
scope-work
response-required off
hold-check on
```

Vid första `held` kopieras V och C från `draft` och TYPE från
Lo-förslagets `after.typeId`. Den uttryckliga hänvisningen till Los
objekttyp gör Lo relevant i det avgränsade underlaget. Släpp det enkla
tillägget och godkänn sedan
den hållna oberoende kontrollen med dess eget anrops-ID:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST propose_object {"version":V,"contentVersion":C,"id":"kim","baseRevision":null,"value":{"typeId":"TYPE","name":"Kim"}}
reply CHECK {"decision":"allow","complete":true,"fulfillsRequest":true}
```
<!-- markdownlint-enable MD013 -->

Ingen ytterligare arbetsbegäran ska behövas för det korta beskedet.
Kör `response-required on` före nästa användarmeddelande. Vid dess
`held` kopieras nya V och C samt hela Kim-värdet från utkastet. Ändra
bara dess namn och använd en kombinerad begäran:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST submit_changes {"version":V,"contentVersion":C,"completion":"draft","operations":[{"name":"propose_object","arguments":{"id":"kim","baseRevision":null,"value":{"typeId":"TYPE","name":"Kim Lind"}}}]}
reply CHECK {"decision":"allow","complete":true,"fulfillsRequest":true}
```
<!-- markdownlint-enable MD013 -->

Trots kontrollens påstående om slutförande kräver uppdragstolkningen
fortsatt svar. Släpp nästa arbetsbegäran:

```text
reply REQUEST Person är en objekttyp. Kim Lind är ett objekt av den typen.
```

När användaren slår på mikrofonen lämnar operatören talet:

<!-- markdownlint-disable MD013 -->
```text
user Beskriv efter sparandet vilka objekt som är sparade. Spara hela utkastet.
delegate
```
<!-- markdownlint-enable MD013 -->

Släpp `save_draft` med dess aktuella V och C. Den hållna kontrollen ska
ha `comparison.untrusted.data.wholeDraft:true` och innehålla både Lo
Exempel och Kim Lind. Godkänn kontrollen. Släpp därefter nästa
arbetsbegäran med hela förklaringen. När röstleveransen visar samma text
släpps också dess kontrollerade transkript:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST save_draft {"version":V,"contentVersion":C,"operationId":"controlled-save"}
reply CHECK {"decision":"allow","complete":true,"fulfillsRequest":true}
reply REQUEST Lo Exempel och Kim Lind finns nu i hushållets karta.
assistant Sparat. Lo Exempel och Kim Lind finns nu i hushållets karta.
```
<!-- markdownlint-enable MD013 -->

Röstleveransens faktiska innehåll kontrolleras separat i automatiken;
ett manuellt injicerat transkript bevisar ingen fysisk uppläsning.
Efter den lyckade varianten avslutas installationen med `quit`.

För felvarianten startas en ny röstinstallation enligt inledningen,
utan `seed-family`. Logga in som Alex, skapa Textprov och lägg enbart
Lo Exempel av typen Person med beskrivningen Påhittad uppgift i
utkastet. Starta text och slå på mikrofonen. Ställ kontrollerna innan
användaren skriver sin sparbegäran:

```text
scope-work
response-required on
hold-check on
```

Vid det skrivna uppdragets `held` kopieras aktuella V och C från
`draft` och TYPE från Lo-förslagets `after.typeId`. Släpp tillägget med
sin oberoende informationsfråga. Godkänn den självständiga batchen och
kontrollera därefter hela utkastet inför sparandet. Frågan gäller en
separat informationsdel; uppdraget är ännu inte helt uppfyllt. Vänta
sedan på nästa arbetsbegäran för förklaringen och avbryt just den:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST submit_changes {"version":V,"contentVersion":C,"completion":"save","questions":[{"kind":"information","request":"Beskriv vilket år uppgifterna gäller.","question":"Vilket år gäller beskrivningen?","dependsOnDraft":false}],"operations":[{"name":"propose_object","arguments":{"id":"kim","baseRevision":null,"value":{"typeId":"TYPE","name":"Kim"}}}]}
reply CHECK {"decision":"allow","complete":true,"fulfillsRequest":false}
reply CHECK {"decision":"allow","complete":true,"fulfillsRequest":false}
fail REQUEST
```
<!-- markdownlint-enable MD013 -->

Sparandet måste vara klart innan förklaringen avbryts. Läs ett tomt
utkast, Lo och Kim i Tabell och båda i samma verkliga sparande i
ändringshistoriken.
Samtalstextens felbesked ska finnas tillsammans med **Sparat.** och
**Vilket år gäller beskrivningen?** också i den kontrollerade
röstleveransen. Operatören jämför leveransens faktiska innehåll i terminalen
före ett eventuellt `assistant`-transkript med samma besked. Ett sådant
transkript bevisar inte fysisk uppläsning.
Avsluta även felvariantens installation med `quit`.

För den osparade felvarianten startas ytterligare en ny röstinstallation
enligt inledningen, utan `seed-family`. Lägg enbart Lo Exempel av typen
Person i utkastet. Starta text och slå på mikrofonen. Ställ samma
kontroller som för felvarianten ovan innan användaren skriver sitt
uppdrag. Kopiera V, C och TYPE från dess hållna underlag. Släpp en
kontrollerad batch och godkänn den oberoende kontrollen. Avbryt sedan
just nästa arbetsbegäran för förklaringen:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST submit_changes {"version":V,"contentVersion":C,"completion":"draft","questions":[{"kind":"change","request":"Lägg till kollegan som person.","question":"Vad heter kollegan?","dependsOnDraft":false}],"operations":[{"name":"propose_object","arguments":{"id":"kim","baseRevision":null,"value":{"typeId":"TYPE","name":"Kim"}}}]}
reply CHECK {"decision":"allow","complete":true,"fulfillsRequest":true}
fail REQUEST
```
<!-- markdownlint-enable MD013 -->

Kontrollera att både Kim och Lo ligger kvar i utkastet och att inget
sparande finns i ändringshistoriken. Jämför **Kim lades till.**,
**Vad heter kollegan?** och felbeskedet i samtalstexten med den faktiska
kontrollerade röstleveransen. Frågan gäller den separata väntande delen
om kollegan; den delen är inte genomförd. Ändringen är ett verifierat
resultat; felet är ett obligatoriskt besked. Leveransen får inte säga
**Sparat.** eller påstå att Lo lades till av detta uppdrag. Avsluta
installationen med `quit`.

## Avvisad kontroll av hela utkastet

TEXT-15 använder en ny röstinstallation utan `seed-family`. Logga in som
Alex, skapa Textprov och lägg Lo Exempel av typen Person med beskrivningen
Påhittad uppgift i utkastet genom det vanliga formuläret. Lämna mikrofonen
av. Aktivera `hold-check on` före användarens första textmeddelande.

Vid dess första `held` begär operatören hela aktuella utkastet:

```text
tool REQUEST read_my_draft {}
```

Invänta nästa `held` och kopiera V och C från `lastToolResult`, och TYPE
från Lo-förslagets `after.typeId` där. Det första underlaget är avgränsat
till användarens begäran och behöver inte innehålla Lo. Släpp en ny person
i en kombinerad begäran med det nya anrops-ID:t:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST submit_changes {"version":V,"contentVersion":C,"completion":"save","operations":[{"name":"propose_object","arguments":{"id":"kim","baseRevision":null,"value":{"typeId":"TYPE","name":"Kim"}}}]}
```
<!-- markdownlint-enable MD013 -->

Den första hållna kontrollen har `kind:"action-check"`. Godkänn batchen
med dess eget anrops-ID i stället för CHECK:

```text
reply CHECK {"decision":"allow","complete":true}
```

Nästa hållna kontroll gäller sparandet efter den genomförda batchen.
Kontrollera `comparison.untrusted.data.wholeDraft:true`, aktuell version
och att `draft.changes` innehåller både Lo Exempel med beskrivningen och
Kim. Underlaget kommer från hela aktuella utkastet. Avvisa just
detta sparande med kontrollens eget ID:

```text
reply CHECK {"decision":"clarify"}
hold-check off
```

Invänta avvisningen och det osparade utkastet. Välj läsande omfattning
utan ytterligare svarskrav före nästa informationsfråga:

```text
scope-read
response-required off
```

Släpp dess hållna arbetsbegäran med:

```text
tool REQUEST report_result {"source":"draft"}
```

Det avslutar informationsfrågan utan en ny arbetsbegäran och utan sparande.

När användaren slår på mikrofonen i samma samtal kör operatören:

```text
scope-work
hold-check on
user Ändra namnet på Kim till Kim Lind och spara.
delegate
```

Kopiera aktuella V, C och hela Kims `after` från det nya `held`. Behåll
typ och övriga egenskaper, och sätt bara namnet till Kim Lind i VALUE:

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST submit_changes {"version":V,"contentVersion":C,"completion":"save","operations":[{"name":"propose_object","arguments":{"id":"kim","baseRevision":null,"value":VALUE}}]}
```
<!-- markdownlint-enable MD013 -->

Godkänn den hållna ändringskontrollen med det första `allow`-svaret ovan.
Nästa kontroll gäller hela utkastet. Kontrollera åter att Lo Exempel
finns kvar och att Kim nu heter Kim Lind. Bekräfta först därefter att
hela den nya begäran blir klar genom sparandet:

```text
reply CHECK {"decision":"allow","complete":true,"fulfillsRequest":true}
```

Invänta det verifierade sparandet innan `assistant Sparat.` används för
den simulerade samtalstexten. Läs resultatet enligt TEXT-15. Avsluta med
`quit` och stäng provprofilen. Detta bevisar varken verklig talförståelse
eller hörbart ljud.

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
npm run test:technical-browser -- tests/technical-browser/text-assistant.spec.ts --grep 'manual text launcher public preparation seeded rejects an unaccepted delivery'
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

TEXT-09 använder textinstallationen. Börja med Lo, Tonrum med status
**Gäller fortfarande** och **Lo Exempel → Använder → Tonrum**, samlat
sparade genom gränssnittet. Kör `scope-read` före den första
informationsfrågan. Efter användarens båda native rättelser släpps
`report_result` med `{"source":"draft"}`. Textinstallationen lämnar
inget uttryckligt besked om att rapporten räcker som hela svaret; släpp
därför nästa hållna arbetsbegäran med `reply REQUEST Klart.`.

Återställ `scope-work` före användarens sparmeddelande. Släpp
`save_draft` med aktuella versioner och `operationId:"details-save"`.
Invänta det verifierade sparandet och släpp nästa hållna arbetsbegäran
med `reply REQUEST Klart.`. Kör åter `scope-read` före sista frågan.
Släpp `report_result` med `{"source":"latest_save"}` och därefter
den sista hållna arbetsbegäran med `reply REQUEST Klart.`.
Granska de faktiska rättelserna i gränssnittet innan någon separat
HTTP-jämförelse. Ett senare direkt anrop får inte reparera en trasig form.

## Textvy, mikrofon och korta fönster

TEXTVY-02: håll första svaret för den synliga arbetsraden; släpp
`tool REQUEST read_map {"query":"musik"}`. Vänta på nästa hållna svar
och släpp `reply REQUEST Kim betalar musiken.` när användaren har läst
arbetssteget. Efter nästa användarmeddelande, vänta på det tredje hållna
svaret och släpp `reply REQUEST Klart.`.
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
