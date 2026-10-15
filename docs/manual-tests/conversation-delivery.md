# Manuella testfall för hela svarstexten

Fallen provar en redan mottagen skriven instruktion, hela svaret vid
inloggningens utgång och rensning vid ny inloggning. En skriven instruktion
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
  "reference": "1280 × 800; vanlig inloggning och kontrollerad servergräns. En hållen skriven instruktion återkommer efter utgång på samma redan öppna anslutning.",
  "outcomes": [
    "Hela svaret med sista frågan och korrekt sparstatus visas vid inloggningssidan utan ljudnotis.",
    "Texten ryms utan rullning i sidled. Ny inloggning som samma användare rensar svaret utan att instruktionen skickas igen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Skriv till Skyttel → Nytt samtal** och godkänn samtalet.
   Skriv **Beskriv hela svaret.** och välj **Skicka** före tidsgränsen.
2. Vänta tills **Välkommen till Skyttel** visas. Släpp modellsvaret enligt
   förberedelsen. Läs **Hela svaret som text**, från första till sista del
   och frågan. Kontrollera beskedet om sparande.
3. Logga in igen som Alex. Kontrollera att det gamla svaret rensas utan
   att instruktionen skickas igen.

**Förväntat resultat:**

- Hela svaret och frågan visas med **Inget nytt sparande är bekräftat.**
  Ingen ljudnotis visas för textarbete utan begärt ljud.
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
  "reference": "390 × 800; syntetiska medier och hållen skriven instruktion med aktiv röst. Samma tidsgräns och nya inloggning som LEV-01.",
  "outcomes": [
    "Hela svaret med slutfråga och korrekt sparstatus visas efter utgång med beskedet att ljudleveransen inte kan bekräftas.",
    "Text och notis ryms utan rullning i sidled. Ny inloggning rensar svaret utan modellåterspelning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta ett samtal med text och godkänn det. Välj **Prata med Skyttel**
   och invänta **Lyssnar**. Skriv **Beskriv hela svaret.** i textvyn och
   välj **Skicka** före tidsgränsen.
2. Vänta på inloggningssidan och släpp modellsvaret enligt förberedelsen.
   Läs hela texten, frågan, sparstatus och ljudnotisen.
3. Logga in igen som Alex och kontrollera att texten rensas.

**Förväntat resultat:**

- Hela texten visas tillsammans med **Ljudleveransen kan inte bekräftas.**
  Notisen skiljer mottagen text från uppspelning, läsning och förståelse.
- Röststoppet ger ingen ny instruktion. Texten ryms i sidled och ny
  inloggning återspelar inget arbete.

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
2. Läs hela **Hela svaret som text** med tangentbord och skärmläsare.
   Kontrollera sista delen, frågan, sparstatus och ljudnotisen.
3. Förstora till 200 och 400 procent och prova den smala bredden. Följ
   läsordningen till inloggningskontrollerna utan att välja en åtgärd.

**Förväntat resultat:**

- Hela texten finns med korrekt sparstatus och uppfattbar ljudnotis.
  Mottagen text påstås inte bevisa uppspelning, läsning eller förståelse.
- Inga delar eller kontroller döljs och fokus flyttas inte oväntat.
