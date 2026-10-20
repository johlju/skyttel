# Förbered kontrollerade assistentfall

Den här guiden ger terminalklientens fulla syntetiska indata och tekniska
jämförelser för assistentfallen. Klienten skickar MCP-anrop utan modell.
Webbläsarsteg och synliga resultat står i respektive manuellt fall.
Använd inga verkliga hushållsuppgifter och spara inte terminalutskrifter.

## Installation, medgivande och städning

Följ [den kontrollerade klientguiden](assistant-advanced.md#controlled-mcp-client)
för ny databas, konfigurerad Google-/Microsoft-inloggning, lokal adress,
portvidarebefordran och omstart med samma databas. Använd ny databas och
nya anslutningar per fall. Vid slutet: återkalla anslutningen i Skyttel,
kontrollera nekad ny läsning, kör `quit`, stäng det privata fönstret och
ta bort bara den tillfälliga databasens katalog enligt klientguiden.

För AI-01–06 begär klienten endast läsåtkomst. Starta terminal B så här:

```sh
node --import tsx scripts/manual-mcp-client.ts http://localhost:3301 47731 read
```

Skapa **Hushållet Linden** i stället för **MCP-prov** i dessa fall.
Följande person- och medlemsförberedelse gäller endast AI-01–05;
AI-06 använder den egna tomma utgångspunkten längre ned.
Robin kopierar sitt användar-ID från startsidan i sin separata profil;
Alex bjuder in detta ID genom hushållets administration och Robin
accepterar koden. Robin skapar dessutom **Hushållet Eken** i sin profil.
Skapa Alex privata förslag **Alex privata förslag** och Robins
**Robins privata förslag**, båda typ Person utan fria egenskaper, genom
**Nytt objekt → Lägg i utkastet och stäng** i respektive profil.
Spara dem inte. När ett fall återkallar Robins medlemskap, bjud in Robin
igen med en ny kod före nästa fall. Anslut läsklienten i rätt persons
profil och välj alltid Linden i medgivandet.

Öppna klientens utskrivna auktoriseringsadress. För AI-01 lämnar du
medgivandet ogodkänt och väljer sedan **Nej, anslut inte**; klienten
avslutas utan åtkomst. Starta en ny process för nästa fall. För andra
läsfall väljer du provhushållet, markerar AI-valet och väljer
**Godkänn läsåtkomst**. `tools` ska erbjuda enbart `read_map` och
`read_my_draft`. Varken webbinloggning eller en skrivklients gamla
medgivande ersätter detta läsmedgivande.

För AI-08–11 och MCP-fallen används kartarbete. Utelämnad sista parameter
betyder `write`, precis som följande uttryckliga kommando:

```sh
node --import tsx scripts/manual-mcp-client.ts http://localhost:3301 47731 write
```

Godkänn då både AI-val och kartarbete. Kontrollera `ready` före kommandon.
Den sista parametern får bara vara `read` eller `write`; klienten
beviljar aldrig större åtkomst än Skyttels aktuella medgivande.

### Läsande terminalklient: tom och fylld karta

Det separata tekniska provet i
[manual-mcp-preparation.spec.ts](../../tests/integration/manual-mcp-preparation.spec.ts)
använder en ny databas och ett läsmedgivande för båda utgångslägena.
Det provar verklig webbläsare, den publicerade klienten, OAuth/MCP och SQLite
utan språkmodell. Det är underlag för AI-02, inte ytterligare ett manuellt fall.

1. Skapa Linden i en ny databas. Starta terminal B med `read`-kommandot
   ovan, välj Linden och kontrollera att **Godkänn läsåtkomst** är inaktiv
   före AI-valet. Markera AI-valet och godkänn en gång.
2. Kör `tools`: enbart `read_map` och `read_my_draft` ska finnas. Kör
   `map` och `read`: kartans objekt och samband samt utkastets förslag ska
   vara tomma listor, inte saknade fält. Läsningen ändrar inget.
3. Behåll samma terminalprocess och anslutning. Skapa personen **Alex**
   med beskrivningen **Sparade uppgifter om Alex** genom **Nytt objekt**,
   lägg i utkastet och spara hela utkastet i Skyttel. Ändra beskrivningen
   genom **Tabell → Redigera Alex** till **Alex privata rättelse** och
   lägg i utkastet utan att spara igen.
4. Kör `map` och `read` i samma klient. Kartan visar det sparade värdet;
   utkastet visar det sparade och det föreslagna värdet. Kartan och utkastet
   ska behålla samma innehåll efter läsningen.
5. Återkalla **Skyttel manual MCP controls** i Assistentanslutningar.
   Kör `read`: förvänta `MCP HTTP 401`. Kör `quit`: klienten skriver
   `closed` och avslutas. Följ installationens städning ovan.

De separata tekniska definitionerna med titlarna
`manual MCP read-only preparation preserves empty household work` och
`manual MCP read-only preparation preserves seeded household work` ersätts
av provfilens sammanhållna definition för tomt och sedan fyllt hushåll.
Familjen omfattar en upptäckt integrationsexekvering i stället för två.
Tom serialisering och fylld läsning behålls i samma medgivande; en separat
medgivandesekvens från en redan fylld demoinstallation upprepas inte.
Inga manuella fall-ID:n utgår eller återanvänds.

### Webbcookie utan assistentmedgivande, AI-01

Efter vanlig webbinloggning, före ett godkänt assistentmedgivande, kör
följande i konsolen på installationens egen sida. Inga token används.

```javascript
const svar = await fetch('/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    accept: 'application/json, text/event-stream',
  },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'read_map', arguments: {} },
  }),
});
console.log(svar.status, await svar.json());
```

Förvänta 401 och `unauthenticated`, utan kartinnehåll. Kontrollera också
att klientens eget ogodkända flöde inte ger kartdata. Ingen patch installeras
i webbläsaren; stäng konsolen efter kontrollen.

### Avgränsad läsning, AI-06

Starta med en ny databas enligt installationsguiden, logga in som Alex
och skapa Linden. Starta läsklienten med kommandot ovan och godkänn
läsåtkomst till Linden. Skapa inte Läsningens lampa, privata personförslag
eller ett andra hushåll. Låt utkastet vara tomt inför följande sparande.

Skapa de fem objekten och fyra sambanden enligt AI-06 i webbläsaren och
spara hela utkastet. Ge Blå bilen beskrivningen **Bilens sparade uppgifter**,
Kim **Kims övriga detaljer**, Lo **Los övriga detaljer**, Cykeln två steg
bort **Cykelns uppgifter** och Samlingen **Orelaterat objekt**. Privat samling
har typbeskrivningen **Orelaterad typbeskrivning**. På objektet Samlingen
kan en fri textegenskap Anteckning ha värdet **Hemligt fält**. Kör
`map Blå bilen` och kopiera bara
bilens faktiska `id` ur svaret till `objectId` i följande läsningar:

```text
read-tool read_map {"objectId":"bilens faktiska id"}
read-tool read_map {"query":"BILEN"}
read-tool read_map {"objectId":"bilens faktiska id","query":"bilen"}
read-tool read_map {"query":"ingen träff"}
read-tool read_map {"objectId":"missing"}
read-tool read_map {"objectId":"bilens faktiska id","query":"Samlingen"}
read-tool read_map {}
```

Strängen `bilens faktiska id` ska ersättas med just det nyss lästa värdet,
inte användar-ID eller ett exempel-ID. `missing` är avsiktligt obefintligt.
Jämför hela svarens direkta samband, ändpunkter och typdefinitioner enligt
AI-06; ändra ingen data mellan dessa läsningar. Efter formulärrättelsen
kör du `read` för full jämförelse av sparat och privat innehåll.
Det enda privata arbetet är då bilens rättelse. Spara inte den rättelsen.
Vid slutet återkallar du anslutningen, kör `quit` och följer installationens
städning; serveromstart återställer inte denna utgångspunkt.

## Terminal för fulla tekniska jämförelser

För AI-08, AI-10 och MCP-06 öppnar du terminal C före första sparandet.
Kör hela kommandot nedan. Det behöver ingen token, fil eller databasåtkomst;
det jämför endast fullständiga syntetiska JSON-svar som du klistrar in
från terminal B. Behåll terminal C öppen under omstart och mellan MCP-06:s
två installationer. Ett `MATCH` kräver samma fulla värde, även
före-/eftervärden,
datum, typer och listordning; objektens egenskapsordning saknar betydelse.

```sh
node --input-type=module -e '
import { createInterface } from "node:readline/promises";
import { isDeepStrictEqual } from "node:util";
const input = createInterface({ input: process.stdin, output: process.stdout });
const retained = new Map();
try {
  while (true) {
    const [command, label, path] = (await input.question("check> ")).trim().split(/\s+/);
    if (command === "quit") break;
    try {
      if (!["remember", "compare"].includes(command) || !label || !path)
        throw new Error("Use remember LABEL PATH, compare LABEL PATH or quit.");
      if (command === "remember" && retained.has(label))
        throw new Error("Use a new label; retained evidence is never overwritten.");
      const raw = JSON.parse(await input.question("JSON> "));
      const value = path.split(".").reduce((part, key) => part?.[key], raw);
      if (value === undefined) throw new Error("Missing complete value at PATH.");
      if (command === "remember") {
        retained.set(label, value);
        console.log("RETAINED", label);
      } else {
        if (!retained.has(label) || !isDeepStrictEqual(retained.get(label), value))
          throw new Error("Missing baseline or unequal complete value.");
        console.log("MATCH", label);
      }
    } catch (error) { console.log("FAIL", error.message); }
  }
} finally { retained.clear(); input.close(); }
'
```

Vid `JSON>` klistrar du in hela enradiga JSON-händelsen från klienten,
inte bara ett namn, ID eller sammandrag. Kommandots sista ord väljer det
fulla värdet i den händelsen, till exempel `value.receipt` eller `value`.
Ett saknat värde, okänd etikett eller ändrat värde ger `FAIL`; det är inte
godkänt underlag. Klistra aldrig in `authorize`-adressen eller token.
Efter sista jämförelsen: kör `quit` i terminal C och B, stäng terminalerna,
töm urklipp och ta bort tillfälliga JSON-/ZIP-filer enligt installationens
städning. Skapa inga filer för svaren om terminalerna räcker.

## Typer och avtal

Skriv raderna direkt i klienten i terminal B, inte i ett shell eller en
modellkonversation. Varje `capture-tool` läser dagens versioner och behåller
en oskickad begäran. `send` skickar just den fångsten. Läs `read` efter
förslagen och före `capture-save`; skicka sparfångsten först efter din
fulla granskning. Ett domänfel är inte en lyckad ändring.

Kör `read-tool read_type_catalog {}` för förifyllda typer. När en rad
nedan anger ett katalog-ID, ersätt just det strängvärdet med `id` för
det angivna exakta typnamnet i svaret. Kopiera aldrig ett användar-ID,
en token eller en typ från en annan databas. Fasta ID:n som `solar` är
syntetiska innehållsreferenser i detta nya provhushåll. Klienten hämtar
versioner automatiskt; skriv inte in dem i JSON.

### Fångster för MCP-01

Skapa en typ med namn och beskrivning och lägg de individuella
uppgifterna i varje objekts ordnade `properties`. Tomma egenskaper
utelämnar `value`, medan Nej uttryckligen är `false`.

<!-- markdownlint-disable MD013 -->
```text
capture-tool solar-type propose_object_type {"id":"solar","baseRevision":null,"value":{"name":"Solcellsanläggning","description":"Hushållets elproduktion"}}
send solar-type
capture-tool roof propose_object {"id":"roof","baseRevision":null,"value":{"typeId":"solar","name":"Paneler på taket","properties":[{"id":"supplier","label":"Leverantör","kind":"text","value":"Exempelsol"},{"id":"power","label":"Effekt","kind":"number","value":12.5},{"id":"battery","label":"Batteri","kind":"boolean"},{"id":"installed","label":"Installationsdatum","kind":"date","value":"2026-09-01"}]}}
send roof
capture-tool garage propose_object {"id":"garage","baseRevision":null,"value":{"typeId":"solar","name":"Paneler på garaget","properties":[{"id":"supplier","label":"Leverantör","kind":"text"},{"id":"power","label":"Effekt","kind":"number"},{"id":"installed","label":"Installationsdatum","kind":"date"},{"id":"battery","label":"Batteri","kind":"boolean","value":false}]}}
send garage
read
```
<!-- markdownlint-enable MD013 -->

Efter webbläsarens fulla läsning: kör `capture-save solar-save` och
`send solar-save`. Läs `read_type_catalog` och använd typens aktuella
revision som `baseRevision` i en ny `propose_object_type`-fångst för
`solar`, med samma namn och beskrivningen Redigerad gemensam betydelse.
Skicka den. Typens beskrivning är skild från individernas egenskaper.

Slå upp Person och Fordon i samma katalog. Använd `propose_object_type`
med respektive `id` och aktuell `revision`. Persons nya värde är:

```json
{"name":"Person i hushållet","description":"Personer ger ingen inloggning"}
```

Fordons nya värde är `null`. Skicka båda fångsterna, granska `read`, kör
`capture-save catalog-save` och `send catalog-save`. Behåll databasen vid
omstart och läs sedan objekten och katalogen enligt MCP-01.

### Fångster för MCP-02

Slå upp varje förifylld typ med `read_type_catalog`. Använd
`propose_object`, angivet `id`, `baseRevision: null` och fullständigt
`value` med namnet, katalogens `typeId` och följande `properties`.
Etiketterna är vanliga uppgifter utan automatisk ekonomisk betydelse.

<!-- markdownlint-disable MD013 -->
| ID | Objekttyp | Namn | properties |
| --- | --- | --- | --- |
| rent | Hyresavtal | Hyra för lägenheten | `[{"id":"price","label":"Pris","kind":"text","value":"9 500"},{"id":"terms","label":"Avtalsvillkor","kind":"text"}]` |
| garage-rent | Hyresavtal | Hyra för garaget | `[{"id":"price","label":"Pris","kind":"number","value":650},{"id":"certainty","label":"Osäkert uppgivet","kind":"boolean","value":true}]` |
| loan | Låneavtal | Exempellån | `[{"id":"debt","label":"Senast uppgiven skuld","kind":"text","value":"125 000,50"},{"id":"certainty","label":"Osäkert uppgivet","kind":"boolean","value":true},{"id":"date","label":"Datum för uppgiften","kind":"date","value":"2026-09-01"}]` |
| credit | Kreditavtal | Exempelkredit | `[{"id":"limit","label":"Beviljat kreditutrymme","kind":"number","value":80000},{"id":"limit-date","label":"Kreditutrymmets datum","kind":"date","value":"2026-08-01"},{"id":"used","label":"Utnyttjad kredit","kind":"number","value":12500},{"id":"used-date","label":"Utnyttjad kredits datum","kind":"date","value":"2026-09-02"},{"id":"terms","label":"Avtalsvillkor","kind":"text","value":"Uttryckligen inget"}]` |
| installment | Avbetalningsavtal | Bilens avbetalning | `[{"id":"debt","label":"Senast uppgiven skuld","kind":"number"},{"id":"date","label":"Datum för uppgiften","kind":"date","value":"2026-09-03"}]` |
<!-- markdownlint-enable MD013 -->

Skicka varje fångst. Föreslå också `home`, Lägenheten av typen Bostad;
`garage`, Garaget av typen Garage; och `car`, Familjens bil av typen
Fordon med `identity: "unspecified"`. De behöver inga egenskaper.
Slå upp Gäller och Finansierar. Använd `propose_relationship`, nytt ID,
`baseRevision: null` och `value` med aktuellt `typeId`, `sourceId` och
`targetId` för följande verkliga ändpunkter:

- `home-rent-link`: rent → Gäller → home.
- `garage-rent-link`: garage-rent → Gäller → garage.
- `finance-car`: installment → Finansierar → car.

Granska och spara genom `capture-save agreements-save` och
`send agreements-save`. Läs sedan `read_map {"objectId":"credit"}`.
Använd aktuell objektversion som `baseRevision` och behåll hela dess
värde med samma egenskapsidentiteter och ordning. Ändra enbart `used`
till värdet `0` och `used-date` till `2026-09-20`. Fånga, skicka, granska
och spara med nya etiketter. Läs rättelsens hela kvitto med dess faktiska
`operationId` och `userId`; tidigare 12500 och 2026-09-02 ska finnas kvar.

### Fångster för MCP-03

Skapa typerna `cycle` och `vehicle` med `propose_object_type`,
`baseRevision: null` och värdena:

```json
{"name":"Cykel","description":""}
```

```json
{"name":"Motorfordon","description":""}
```

Föreslå `bike`, Alex blå cykel av typen `cycle`, med egenskapen:

```json
[{"id":"serial","label":"Ramnummer","kind":"text","value":"SYNTH-42"}]
```

Föreslå `garage`, Garaget, med en annan aktuell typ från katalogen och
utan egenskaper. Skapa sambandstypen `stored` med följande värde:

```json
{"name":"Förvaring","description":"Sakens plats","forwardLabel":"förvaras i","reverseLabel":"innehåller"}
```

Föreslå `parking` med typ `stored`, `sourceId: "bike"` och
`targetId: "garage"`. Föreslå samma fulla värde med nytt ID `duplicate`;
befintligt samband ska återanvändas. Föreslå också `second-kind` mellan
samma objekt med en annan aktuell sambandstyp. Granska och spara.

Behåll objektets och båda sambandens identiteter. Läs cykelns aktuella
revision och föreslå samma objekt med `typeId: "vehicle"` och egenskapen:

```json
[{"id":"serial","label":"Ramnummer","kind":"number","value":42}]
```

Detta är ett uttryckligt byte av både objektets typ och egenskapens
datatyp; ett typbyte i sig omvandlar aldrig värdet. Granska båda sidorna
i webbläsaren, spara och jämför oförändrade objekt- och sambandsidentiteter.
Föreslå därefter borttagning av den oanvända `cycle`-typen med aktuell
revision och `value: null`, och spara. Läs typbytets hela sparkvitto och
webbläsarens historik med Text/SYNTH-42 respektive Tal/42.

### Fångster för MCP-04

Skapa `ended-type`, **Upphörd typ**, `private-type`, **Privat använd typ**,
och `race-type`, **Samtidig typ**, med tom typbeskrivning.
Skapa `ended`, **Upphört testobjekt**, typ `ended-type`, utan fria egenskaper
och `lifecycle: "ended"`. Granska och spara hela utkastet.

Slå upp aktuell typrevision inför varje borttagningsförslag. Föreslå
`propose_object_type` med typens ID, revision och `value: null`.
Upphörd typ ska direkt ge `definition_in_use`. Följ Robins fulla
objektsteg i MCP-04 innan Alex försöker Privat använd typ: avvisningen
får inte innehålla Robins namn, beskrivning eller objektidentitet.

Alex skickar borttagningsförslaget för Samtidig typ före Robins andra
objektförslag. Ladda om Robins sida före detta nya formulärförslag om
klienten ändrar Robins utkast mellan webbläsarstegen. Först därefter ger
Alex sparbeskedet. Det ska avvisas med
`definition_in_use`. Starta om med samma databas; inga privata förslag
får sparas eller försvinna.

Efter omstarten läser Robin sitt fulla utkast med `read` i sin egen
anslutning. Alex upprepar borttagningsfångsten för Privat använd typ med
dagens revision och en ny etikett: förvänta `definition_in_use` utan
Robins privata namn, beskrivningar eller objektidentiteter. Alex fångar
sedan sparandet av det kvarvarande förslaget för Samtidig typ med
`capture-save blocked-after-restart` och skickar det. Även detta ska ge
`definition_in_use` utan privata uppgifter. Läs Robins utkast och den
sparade historiken igen: båda ska vara oförändrade.

## Familjeärendet, AI-08

Använd demoguidens server och nya databas, inte samtidigt den tomma
MCP-guidens server. Provhushållet är **TestHousehold**. Starta en
kontrollerad `write`-klient på samma adress, välj detta hushåll och ge
båda medgivandena. Återkalla även denna anslutning vid demoguidens städning.

I steg 3, kör `read`. Kopiera det fulla Lo-konfliktobjektet och dess `basis`
från
`resolutions` till `conflict` respektive `basis` i en `capture-tool` för
`resolve_conflict`;
ange också `choice: "proposed"`. Skicka fångsten, läs `read` och kontrollera
Lo Lind med **Spelar piano i musikföreningen.**. Hela övriga utkastet
ska finnas kvar. Läs sedan `map Familjens Molnmusik`.

Kopiera det aktuella Molnmusik-objektets `id` och `revision` till `id`
respektive `baseRevision` i `propose_object`. Kopiera hela objektvärdet
till `value`, utom dess `id`, `revision` och `householdId`. Behåll alla
egenskapsidentiteter och andra värden. Rätta den fria
Beskrivning till **Familjeabonnemang, 189 kr per månad.**. Lägg till eller
rätta följande vanliga egenskaper, med stabila ID:n och bibehållen ordning
för befintliga rader:

```json
[
  {"id":"price","label":"Pris","kind":"text","value":"189"},
  {"id":"currency","label":"Valuta","kind":"text","value":"SEK"},
  {"id":"paymentInterval","label":"Betalningsintervall","kind":"text","value":"månad"}
]
```

Skicka rättelsen, kör `read` och granska de två objekten och adressambandet.
Kör `capture-save family` och ge sparbeskedet med `send family`.
I terminal C kör du `remember family value.receipt` och klistrar vid
`JSON>` in hela `result`-händelsen från detta sparande. Förvänta
`RETAINED family`. Starta om med demoguidens samma databas. Kör
`send family` igen utan ny fångst. I C kör du
`compare family value.receipt` och klistrar in hela återförsökets
`result`-händelse: förvänta `MATCH family`. Fortsätt webbläsarläsningen
i AI-08. Den separata verkliga klientobservationen är AI-14.

## Tappat kvitto, AI-10

Använd ny tom databas, godkänd skrivklient i terminal B och
jämförelseterminal C. Följ dessa tekniska steg vid motsvarande
webbläsarsteg i AI-10:

1. Efter Lo-förslaget: kör `capture-save lost`, granska hela `review` och
   behåll fångsten. I C kör du `remember lost-id arguments.operationId`;
   klistra in hela `captured`-händelsen vid `JSON>`.
2. Vid sparbeskedet: kör `drop lost`. Förvänta `response-dropped` med
   `outcome: "unknown"`, utan kvitto. Felpunkten kastar det lyckade svaret
   efter genomförd transaktion; avvisning eller `error` verifierar inte
   detta bortfall. Kör ingen ny fångst.
3. Efter omstart med samma databas, med B och C kvar: kör `status lost`.
   Förvänta `result.value.operation.status: "succeeded"`. I C kör du
   `compare lost-id value.operation.receipt.operationId` och klistrar in hela
   statusresultatet: förvänta `MATCH lost-id`. Kör sedan
   `remember lost value.operation.receipt` med samma hela resultat.
4. Efter den vanliga historikläsningen: kör `send lost` i B. I C kör du
   `compare lost value.receipt` med hela återförsökets resultat:
   förvänta `MATCH lost`. Ingen ny version, fångst eller begäran skapas.
5. Fortsätt webbläsarens kontroll av ett enda sparande och tomt utkast.
   Återkalla anslutningen och avsluta båda terminalerna enligt städningen.

## Historikläsning, MCP-06

Använd MCP-06:s två isolerade databaser och det faktiskt nedladdade
arkivet. Följ dess vanliga export- och importsteg; detta avsnitt ger
separata tekniska jämförelser för historikläsningen. Behåll kvittots JSON tills
jämförelsen är klar och städa det tillsammans med ZIP-filen efter fallet.
Gör ingen koppling av historisk författare till aktuell användare.
Starta terminal C innan första databasens skapelse sparas. Efter detta
`send` kör du `remember imported value.receipt` i C och klistrar in hela
sparresultatet. Förvänta `RETAINED imported`; behåll C vid databasbytet.
Behåll också de syntetiska värdena `result.value.receipt.operationId`
och `result.value.receipt.userId` från just detta originalkvitto.

Efter databasbytet i MCP-06 steg 3, före importen i steg 5, kör `read`
i den nya tomma databasen och behåll dess `result.value.contentVersion`.
Fånga sedan följande gamla förslag i terminal B utan att skicka det:

<!-- markdownlint-disable MD013 -->
```text
capture-tool old-type propose_object_type {"id":"manual-old-type","baseRevision":null,"value":{"name":"Gammalt underlag","description":""}}
```
<!-- markdownlint-enable MD013 -->

Klientens `captured`-händelse ska använda samma tomma kartas
`arguments.contentVersion`. Behåll fångsten under import och omstart;
skicka den först efter historikläsningen enligt slutet av detta avsnitt.
Ingen ny fångst ska ersätta det gamla underlaget. Vid fel utgångsläge,
återställ båda tillfälliga databaserna enligt installationsguiden innan
fallet upprepas. Fångsten städas med klientens `quit` efter fallet.

Före läsningen i steg 6 lägger du ett nytt objektförslag
**Oberoende utkast**, med den fria textegenskapen Beskrivning: **Privat
lampanteckning**,
med samma typ som lampan. Använd `propose_object`, ID `private-lamp`,
`baseRevision: null` och hela värdet. Ladda om kartan innan du läser
förslaget i webbläsaren. Kör `read` och behåll det fulla
svaret privat för teknisk jämförelse. Kör `remember private value` i C
med hela `read`-resultatet. Läs hela historiken med
`read-tool read_history {}`; kör `remember history value` med hela
den händelsen. Kontrollera att utkastets `changes` är icke-tomt.

I terminal B på den andra installationen kör du följande vid steg 6:

<!-- markdownlint-disable MD013 -->
```text
read-tool read_history {"objectId":"manual-lamp"}
read-tool read_history {"operationId":"originalkvittots faktiska operationId","userId":"originalkvittots faktiska userId"}
```
<!-- markdownlint-enable MD013 -->

Ersätt bara de två sista strängvärdena med originalkvittots egna värden,
inte den nya installationens aktuella användare. Första läsningen ska
avgränsa sammanfattningen till lampans enda sparande; tidigare sakuppgifter
ingår först i den andra läsningens hela kvitto. Det här utgångsläget har
ett enda sparande i historiken. Om fler finns, återställ till fallets nya
databaser innan jämförelsen.
Jämför hela `receipt` med originalkvittot,
inklusive tidpunkt, författare, objekt, före-/eftervärden och definitioner.
Kör `compare imported value.receipt` i C med hela den valda
historikhändelsen: förvänta `MATCH imported`.
Efter både klientens och webbläsarens historikläsning kör du `read` och
läser hela historiken igen. Båda fulla resultaten ska vara oförändrade;
det oberoende utkastet måste fortfarande vara icke-tomt. Kör
`compare private value` respektive `compare history value` i C med
de nya fulla utkast- och historikresultaten: förvänta båda `MATCH`.
Sammanfattningarna ensamma jämför inte historiska sakuppgifter. Upprepa
därför också den exakta kvittoläsningen med samma ursprungliga identiteter
och kör `compare imported value.receipt` igen: förvänta `MATCH imported`.
Detta jämför hela det enda historiska kvittot efter båda läsvägarna.

Skicka nu `old-type` utan ny fångst: förvänta `content_conflict`. Kasta
bara `private-lamp` med `discard private-lamp` efter jämförelsen och
ladda om kartan igen. Fortsätt först därefter MCP-06:s formulärrättelse. Läs
förslaget i webbläsaren före den extra klientfångsten för samma rättelse.
Klientfångsten använder dagens versioner och lampans aktuella revision.

De avvecklade verktygen och gamla HTTP-rutterna kontrolleras dessutom
automatiskt i MCP-06. Listning, avvisade direkta anrop och 404-svar är
tekniska skydd; de ersätter inte den fulla historik- och utkastläsningen.
