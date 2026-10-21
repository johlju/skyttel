# Manuella testfall för hela svarstexten

Fallen provar en redan mottagen skriven instruktion, hela svaret vid
inloggningens utgång och rensning vid ny inloggning. De provar även tydlig
avvisning när anslutningen för hela svaret saknas. En skriven instruktion
med aktiv röst är fortfarande textarbete. Anteckna version, webbläsare och
resultat vid körning. Verkligt ljud och skärmläsare återstår i LEV-03.

## Konfigurerade användare

Alex Exempel är administratör i det påhittade hushållet Leveransprov.
Den kontrollerade installationen ersätter inloggning, modell och medier.

## Allmän förberedelse

1. Starta en tom installation enligt
   [den kontrollerade röstförberedelsen](voice-assistant.md#controlled-voice-fixture).
   Logga in med vanlig inloggning och skapa **Leveransprov**. Anteckna
   inloggningstiden. Behåll samma installation och webbläsarflik.
2. Gör verkliga handlingar före provet så att inaktivitet inte avslutar
   inloggningen tidigare. Påbörja stegen strax före åttatimmarsgränsen.
   Ändra inte enhetens klocka. Automatiken styr samma gräns med
   installationens serverklocka.
3. Läs modellförsökets nummer med **pending** i startguidens terminal.
   Lämna försöket väntande tills inloggningssidan visas. Släpp sedan ett
   långt modellsvar med **reply REQUEST TEXT** enligt startguiden. Låt
   texten innehålla **Första delen**, **Sista delen** och frågan
   **Vem använder cykeln?**. Ingen sparbegäran ingår.
4. Avsluta med **quit** och starta en tom installation inför nästa fall.

## Text vid utgång

### LEV-01: hela svaret utan ljudnotis och rensning vid ny inloggning

**Syfte:** Läs en fullständig textleverans efter vanlig utgång utan att
samtalets övriga åtkomst återkommer.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Förbered enligt ovan med 1280 pixlars bredd och
mikrofonen av.

**Automatiskt motsvarande integrationstest:**
[task-delivery.spec.ts](../../tests/integration/task-delivery.spec.ts), LEV-01.
Riktig HTTP, WebSocket, SQLite och produktsida använder syntetiska
leverantörer. Det bevisar inte mänsklig läsning eller verklig uppläsning.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/task-delivery.spec.ts",
    "caseId": "LEV-01"
  },
  "reference": "1280 × 800; vanlig inloggning och kontrollerad servergräns. En hållen skriven instruktion återkommer efter utgång på samma redan öppna anslutning. Lång text rullas med tangentbord vid 1280, 390 och 320 pixlar.",
  "outcomes": [
    "Hela svaret med sista frågan och korrekt sparstatus visas vid inloggningssidan utan ljudnotis. Ett kort tillgängligt statusbesked uppdateras en gång utan att fokus flyttas.",
    "Texten ryms utan rullning i sidled. Ny inloggning som samma användare rensar svaret utan att instruktionen skickas igen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Skriv till Skyttel → Nytt samtal** och godkänn samtalet.
   Skriv **Beskriv hela svaret.** och välj **Skicka** före tidsgränsen.
2. Vänta tills **Välkommen till Skyttel** visas. Flytta fokus till
   **Fortsätt med Google** utan att aktivera knappen. Släpp modellsvaret
   enligt förberedelsen. Läs den korta notisen med gul streckad ram och
   förklaringen att inloggningen går ut. Kontrollera att fokus ligger
   kvar. Välj **Läs mer** och läs **Hela svaret som text**, från första
   till sista del och frågan. Kontrollera beskedet om sparande.
   Flytta sedan fokus till svarsrutan med tangentbordet och
   rulla till slutfrågan. Upprepa läsningen vid 1280, 390 och 320 pixlars
   bredd. Hela svarsrutan ska rymmas och texten rullas inuti den utan
   rullning i sidled.
3. Logga in igen som Alex. Kontrollera att det gamla svaret rensas utan
   att instruktionen skickas igen.

**Förväntat resultat:**

- Notisen är kort och förklarar varför svaret visas utanför textvyn.
  **Läs mer** visar svaret.
- Hela svaret och frågan visas med **Inget nytt sparande är bekräftat.**
  Ingen ljudnotis visas för textarbete utan begärt ljud.
- Ett kort statusbesked om hela texten och korrekt sparstatus finns för
  hjälpmedel. Kvittensen upprepar inte beskedet och fokus ligger kvar.
  Verklig uppläsning bedöms separat i LEV-03.
- Texten ryms utan rullning i sidled. Ny inloggning rensar svaret och
  återupptar inget modellarbete.

### LEV-02: skrivet uppdrag med röst får hela texten och ljudnotis

**Syfte:** Ett skrivet uppdrag får en åtkomlig textreserv när rösten
stannar vid vanlig utgång.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Förbered enligt ovan med 390 pixlars bredd. Tysta
mediespår ersätter fysisk mikrofon och ljud.

**Automatiskt motsvarande integrationstest:**
[task-delivery.spec.ts](../../tests/integration/task-delivery.spec.ts), LEV-02.
Riktig produktsida, HTTP och WebSocket använder syntetiska leverantörer.
Det gäller en skriven instruktion med röst på; tal får inget undantag.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/task-delivery.spec.ts",
    "caseId": "LEV-02"
  },
  "reference": "390 × 800; syntetiska medier och hållen skriven instruktion med aktiv röst. Samma tidsgräns och nya inloggning som LEV-01. Lång text rullas med tangentbord vid 1280, 390 och 320 pixlar.",
  "outcomes": [
    "Hela svaret med slutfråga och korrekt sparstatus visas efter utgång med beskedet att ljudleveransen inte kan bekräftas. Ett kort tillgängligt statusbesked uppdateras en gång utan att fokus flyttas.",
    "Text och notis ryms inom skärmens bredd. Visa mindre fäller ihop svaret och krysset stänger notisen. Notisen förblir stängd för samma svar. Uppdraget utförs en gång även vid ny inloggning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta ett samtal med text och godkänn det. Välj **Prata med Skyttel**
   och invänta **Lyssnar**. Skriv **Beskriv hela svaret.** i textvyn och
   välj **Skicka** före tidsgränsen.
2. Vänta på inloggningssidan. Flytta fokus till **Fortsätt med Google**
   utan att aktivera knappen och släpp modellsvaret enligt förberedelsen.
   Läs förklaringen i den korta gula notisen med streckad ram. Kontrollera
   att fokus ligger kvar. Välj **Läs mer** och läs hela texten, frågan,
   sparstatus och ljudnotisen. Flytta fokus till svarsrutan med tangentbordet
   och rulla till slutfrågan. Upprepa läsningen vid 1280, 390 och 320
   pixlars bredd utan rullning i sidled.
3. Välj **Visa mindre** och kontrollera att texten fälls ihop. Välj krysset
   **Stäng svarsnotisen**. Kontrollera att notisen försvinner och förblir
   stängd för samma svar. Logga in igen som Alex.

**Förväntat resultat:**

- Hela texten visas tillsammans med **Ljudleveransen kan inte bekräftas.**
  Notisen skiljer mottagen text från uppspelning, läsning och förståelse.
- Ett enda kort statusbesked om texten, sparstatus och ljudet finns för
  hjälpmedel. Kvittensen upprepar inte beskedet och fokus ligger kvar.
  Verklig uppläsning bedöms separat i LEV-03.
- Röststoppet ger ingen ny instruktion. Texten ryms i sidled och ny
  inloggning återspelar inget arbete.
- **Visa mindre** fäller ihop svaret. Krysset stänger notisen, som förblir
  stängd för samma svar.

## Saknad leveranskanal

### LEV-04: oskickad instruktion och röststart kräver uttryckligt återförsök

**Syfte:** Saknad anslutning för hela svaret får inte ge ett tyst
leveransfel eller starta ett uppdrag som användaren tror är skickat.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Starta en tom installation enligt den allmänna
förberedelsens första steg. Provet använder inte tidsgränsen. Ha
textvyn öppen utan ett pågående samtal. Använd systemtema med mörkt läge
i operativsystemet.

**Separat förberedelse:** Öppna webbläsarens utvecklarkonsol och kör
följande innan du startar samtalet. Det stänger av nya leveranskanaler
utan att stänga av vanliga sidförfrågningar.

```javascript
const originalWebSocket = window.WebSocket;
window.WebSocket = undefined;
```

Återställ anslutningsstödet när stegen säger det genom att köra
`window.WebSocket = originalWebSocket;` i samma konsol. Ladda om sidan
efter provet för att återställa hela förberedelsen.

**Automatiskt motsvarande integrationstest:**
[task-delivery.spec.ts](../../tests/integration/task-delivery.spec.ts), LEV-04.
Riktig produktsida och HTTP med syntetiska medier och leverantörer provar
avvisning före start samt verklig WebSocket vid uttryckligt återförsök.
Automatiken stänger även en redan öppnad anslutning före serverns
mottagning och kontrollerar samma tydliga avvisning. Fysisk mikrofon och
skärmläsare ingår inte.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/task-delivery.spec.ts",
    "caseId": "LEV-04"
  },
  "reference": "Saknat WebSocket-stöd före start; syntetisk mikrofon och faktisk HTTP/WebSocket efter återställning. Text och röst provar samma saknade leveranskanal. Lång svarstext i textvyn och rullning i mörkt systemtema, kartans verktyg och Inställningar vid 1280, 390 och 320 pixlar; höjden minskar från 800 till 600 pixlar i den smalaste varianten.",
  "outcomes": [
    "Skriven instruktion skickas inte, texten finns kvar och ett tydligt fel visas utan att instruktionen hamnar i samtalstexten.",
    "Röststart misslyckas tydligt och mikrofonen stängs. Återställd anslutning skickar eller startar ingenting automatiskt.",
    "Uttryckligt återförsök skickar instruktionen en gång och ger hela svaret; uttrycklig röststart fungerar igen.",
    "Hela svaret går att läsa i textvyn. Kartans storlek och verktygens placering består. Inställningarnas rubrik får fokus och är synlig."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta ett samtal med text och godkänn det. Skriv **Beskriv cykeln.**
   och välj **Skicka**. Läs felbeskedet och kontrollera att texten finns
   kvar i fältet och inte visas som skickad i samtalstexten.
2. Välj **Prata med Skyttel**. Kontrollera beskedet att rösten inte kan
   starta och att mikrofonen är av.
3. Återställ anslutningsstödet enligt förberedelsen. Kontrollera att
   texten finns kvar och att rösten inte startar automatiskt.
4. Välj **Skicka**. Släpp ett långt modellsvar enligt den allmänna
   förberedelsen och läs hela svaret i **Skriv till Skyttel**. Rulla till
   sista raden. Kartans storlek och verktygens placering ska bestå.
5. Öppna **Inställningar**. Rubriken ska få fokus och vara synlig.
   Välj **Tillbaka till kartan**. Upprepa steg 4:s läsning och steg 5 vid
   1280, 390 och 320 pixlars bredd utan att skicka instruktionen igen.
6. Välj **Prata med Skyttel** och invänta **Lyssnar**.
7. Stäng textvyn. Kartans verktyg ska behålla sin placering.

**Förväntat resultat:**

- Beskedet säger att instruktionen inte skickas och att texten finns kvar
  för ett nytt försök. Samtalstexten påstår inte att den är skickad.
- Saknad anslutning hindrar även röststart med ett tydligt besked.
  Mikrofonen stängs. Inget skickas eller startar automatiskt vid
  återställningen.
- Endast ett uttryckligt nytt försök skickar texten och tömmer fältet.
  Hela svaret kan läsas. Rösten kan startas med ett uttryckligt nytt val.
- Hela svaret läses i textvyn och kartans storlek och verktygens placering
  består. Inställningarnas rubrik får fokus och är synlig.

### LEV-05: leveransfel efter mottagen instruktion bevarar lagrat utkast

**Syfte:** Förlust före den första uppgiftsnotisen ska ge ett tydligt
leveransfel även när instruktionen redan är mottagen och arbetet kan
slutföras. Felet får inte betyda att ett sparat resultat saknas.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Starta en tom installation enligt den allmänna
förberedelsens första steg. Logga in utan **Kom ihåg mig**. Ha textvyn
öppen utan ett pågående samtal och låt mikrofonen vara av.

**Separat förberedelse av felet:** Kör följande i webbläsarens
utvecklarkonsol innan samtalet startar. Den riktiga anslutningen öppnas,
men den första uppgiftsnotisen släpps inte till appen och anslutningen
stängs. Vanliga sidförfrågningar påverkas inte. Ladda om sidan efter
provet för att ta bort felstyrningen.

```javascript
const OriginalWebSocket = window.WebSocket;
window.WebSocket = class extends OriginalWebSocket {
  constructor(...args) {
    super(...args);
    if (!String(args[0]).endsWith('/delivery')) return;
    this.addEventListener('message', (event) => {
      const frame = JSON.parse(event.data);
      if (frame.type !== 'delivery' || frame.state !== 'waiting') return;
      event.stopImmediatePropagation();
      this.close();
    });
  }
};
```

**Separat styrning av modellsvaret:** När instruktionen är mottagen,
använd **pending** i startguidens terminal. Släpp det väntande försöket
med `tool REQUEST read_type_catalog {}`. Läs nästa försöks
**lastToolResult**, anteckna Person-typens id och läs **version** och
**contentVersion** i **draft**. Släpp det försöket med
`tool REQUEST propose_object JSON`, där JSON innehåller de lästa
versionsvärdena, `id: "lo-delivery"`, `baseRevision: null` och
`value: {typeId: TYPENS_ID, name: "Lo Exempel"}`.
Använd giltig JSON med citattecken kring nycklarna och det lästa typ-id:t.
Släpp sedan det sista försöket med
`reply REQUEST Förslaget finns i ditt utkast.`. REQUEST betyder det
aktuella försöksnumret från terminalen, inte ett nytt modellförsök.

**Automatiskt motsvarande integrationstest:**
[task-delivery.spec.ts](../../tests/integration/task-delivery.spec.ts), LEV-05.
Riktig produktsida, HTTP, WebSocket och SQLite använder syntetisk modell.
Automatiken passerar den vanliga tidsgränsen med serverklockan först
efter slutfört arbete. Mänsklig körning väntar på verklig utgång.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/task-delivery.spec.ts",
    "caseId": "LEV-05"
  },
  "reference": "Mottagen skriven instruktion med förlorad första uppgiftsnotis; faktisk stängd anslutning, syntetiskt förslag via MCP och SQLite. Automatiken passerar vanlig utgång efter slutfört arbete.",
  "outcomes": [
    "Textfältet töms för den mottagna instruktionen, men ett tydligt leveransfel visas även utan en första uppgiftsnotis. Felet påstår inte att lagrat arbete saknas.",
    "Det tillåtna arbetet kan skapa Lo Exempel i utkastet. Leveransfelet finns kvar vid vanlig utgång.",
    "Ny inloggning rensar den tillfälliga notisen och visar det beständiga förslaget utan att instruktionen skickas igen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta ett samtal med text och godkänn det. Skriv **Lägg till Lo
   Exempel i mitt utkast.** och välj **Skicka**. Kontrollera att fältet
   töms och att ett tydligt leveransfel visas i textvyn.
2. Släpp modellens verktyg och svar enligt förberedelsen. Öppna
   **Visa utkastet** och kontrollera att **Lo Exempel** finns där.
3. Låt den vanliga inloggningen gå ut utan nya handlingar. Kontrollera
   att en kort svarsnotis visas när **Välkommen till Skyttel** visas. Välj
   **Läs mer** och kontrollera att leveransfelet finns kvar.
4. Logga in som Alex igen. Kontrollera att leveransnotisen rensas.
   Starta ett nytt samtal med text och öppna utkastet. Kontrollera att
   **Lo Exempel** finns kvar utan att skicka instruktionen igen.

**Förväntat resultat:**

- En mottagen instruktion skiljs från misslyckad leverans. Fältet töms,
  leveransfelet är tydligt och inget nytt försök startar automatiskt.
- Det lagrade förslaget finns kvar och kan läsas efter ny inloggning.
  Felet finns kvar vid utgång men rensas vid den nya inloggningen.
- Ingen förnyad instruktion eller bekräftat sparande påstås på grund av
  leveransfelet. Ny inloggning återspelar inget modellarbete.

## Mänsklig ljud- och hjälpmedelsbedömning

### LEV-03: textreserven med verkligt ljud och skärmläsare

**Syfte:** Bedöm att hela svaret går att läsa och höra med hjälpmedel när
ljudleveransen bryts. Observationen återstår tills den faktiskt körs.

**Användare:** Testmedlemmen med enbart påhittade uppgifter.

**Förutsättningar:** Använd
[enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
med fysisk mikrofon, ljudutgång, NVDA/Chrome eller VoiceOver samt 1280,
390 och 320 pixlars bredd. Verkliga leverantörsanrop kräver separat
godkännande. Verifiera vanlig HTTPS-anslutning före provet.

**Kräver mänsklig observation:** Hör faktiskt ljud och skärmläsarens
återgivning av hela svaret och ljudnotisen. Bedöm läsordning, fokus,
förstoring och omflöde. Syntetisk medie- eller DOM-kontroll ersätter inte
denna bedömning.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-microphone-audio",
    "observation": "Hör verkligt ljud och skärmläsarens hela textreserv samt ljudnotis; kontrollera läsordning, fokus och omflöde."
  },
  "reference": "Fysisk ljudutgång och NVDA/Chrome eller VoiceOver på dator och mobil via HTTPS; bredd 1280, 390 och 320.",
  "outcomes": [
    "Hela svaret eller följdfrågan med korrekt sparstatus är läsbart utan ljud, och ljudnotisens betydelse går att uppfatta.",
    "Inget fokus flyttas oväntat. Förstoring och omflöde döljer inga delar eller inloggningskontroller."
  ],
  "evidence": [{
    "kind": "overlap",
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/task-delivery.spec.ts",
    "caseId": "LEV-02",
    "purpose": "Syntetisk produktsida provar hel text, notis och smal bredd; ingen fysisk ljud- eller skärmläsarbedömning."
  }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta röstläge och be om en lång förklaring med flera delar och en
   avslutande fråga. Bryt ljudutgången medan svaret kommer.
2. Behåll fokus på en inloggningskontroll när textreserven kommer.
   Kontrollera att skärmläsaren ger ett kort besked om hela texten och
   korrekt sparstatus samt ljudnotisen. Beskedet ska komma en gång och
   inte läsa upp hela svaret automatiskt. Välj **Läs mer** och läs sedan
   **Hela svaret som text** med tangentbord och skärmläsare. Kontrollera
   sista delen, frågan, sparstatus och ljudnotisen.
3. Förstora till 200 och 400 procent och prova den smala bredden. Följ
   läsordningen till inloggningskontrollerna utan att välja en åtgärd.

**Förväntat resultat:**

- Hela texten finns med korrekt sparstatus och uppfattbar ljudnotis.
  Mottagen text påstås inte bevisa uppspelning, läsning eller förståelse.
- Inga delar eller kontroller döljs och fokus flyttas inte oväntat.
