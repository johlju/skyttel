# Manuella testfall för avtal och ekonomiska uppgifter

Testfallen hjälper den som provar Skyttel att registrera och rätta frivilliga
ekonomiska uppgifter utan att blanda ihop avtal, skuld och kreditutrymme.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

- Alex är administratör med tillgång till testhushållet och loggar in med
  Google enligt testinstallationens konfiguration.
- Robin är medlem i samma hushåll och loggar in i en annan
  webbläsarprofil för konfliktprovet. Bjud in Robin före provet.
- Alla namn, belopp och villkor i testfallen är påhittade. Använd inga
  fullständiga konto- eller kortnummer, lösenord eller andra hemligheter.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

Välj **Tabell** och använd radens **Redigera [objektets namn]** för att
öppna hela objektformuläret. För samband väljer du **Samband för [namn]**
och **Redigera samband** vid det aktuella sambandet. Nytt objekt öppnas
från kartans verktyg. Att bara markera en rad öppnar inte ett formulär.

Granska ett beständigt förslag genom **Skriv till Skyttel → Visa utkastet**
och radens **Visa förslaget: [namn]**. Stäng fullständig läsning med krysset.
Spara separat med utkastets sparikon och vänta på **Utkastet är sparat**.
Stäng textvyn före nästa steg i Tabell, Karta eller Inställningar.

1. Starta en separat testinstallation enligt
   [provförberedelsen](../development/devcontainer.md#disposable-local-database).
   Logga in som Alex och
   skapa ett hushåll om installationen ännu saknar ett.
2. Börja varje fall utan förslag i **Utkastet**. Använd en ny
   testinstallation vid omkörning, eller ta bort testfallets egna objekt
   genom utkastet. Bevara övriga testdata.

## Frivilliga avtalsuppgifter

### AVTAL-01: Registrera, hitta och rätta hyresuppgifter

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/contract-forms.spec.ts",
    "caseId": "AVTAL-01"
  },
  "reference": "1280px, ljust tema; två separata profiler i konfliktprovet.",
  "outcomes": [
    "Tomt känt pris avvisas med fellänk; hyresrättelsen består efter omstart."
  ]
}
```
-->

**Syfte:** Kontrollera att frivilliga uppgifter kan lämnas öppna och att
ett hyresavtal behåller sin typ när hyran betalas månadsvis.

**Användare:** Alex.

**Förutsättningar:** Hushållet saknar objektet Hyra för lägenheten.

**Integrationstest:**
[contract-forms.spec.ts](../../tests/integration/contract-forms.spec.ts),
testfallet “AVTAL-01: optional rent facts can be reviewed, found and
corrected after reload”.

**Steg:**

1. Välj **Nytt objekt**. Ange namnet Hyra för lägenheten och typen
   **Hyresavtal**. Öppna **Ekonomiska uppgifter**.
2. Välj **Känt** för pris men lämna beloppet tomt. Öppna
   **Grunduppgifter** så att prisfältet döljs. Välj
   **Lägg i utkastet och stäng**. Kontrollera att felsammanfattningen får
   fokus och att utkastet är tomt. Välj fellänken för pris. Kontrollera
   att **Ekonomiska uppgifter** öppnas och prisfältet får fokus. Ange
   sedan priset `9 500`.
3. Välj **Känt** för valuta, betalningsintervall, startdatum och
   avtalsvillkor. Ange `SEK`, `Månadsvis`, `2026-01-01` och
   `Tre månaders uppsägningstid.`. Lämna slutdatum och övriga uppgifter
   som **Ej uppgivet**.
4. Välj **Lägg i utkastet och stäng** och granska pris, datum och villkor i
   **Utkastet**, med **Visa förslaget: Hyra för lägenheten**. Stäng
   läsningen, spara med sparikonen och ladda om sidan.
5. Välj Tabell och sök efter `hyra` i **Sök objekt i tabellen**. Välj
   **Redigera Hyra för lägenheten**, sedan **Ekonomiska uppgifter**. Kontrollera
   pris och tomt slutdatum. Rätta priset till `9 700`.
6. Kontrollera att hela utkastet inte kan sparas medan formuläret har
   oskickad text. Välj **Lägg i utkastet och stäng**, granska både `9 500`
   och `9 700` och spara hela utkastet.
7. Starta om testinstallationen och ladda om sidan. Öppna objektet igen
   med radens **Redigera [objektets namn]** och **Ekonomiska uppgifter**.
   Kontrollera
   pris, startdatum och avtalsvillkor.

**Förväntat resultat:**

- Hyresavtalet går att spara med öppna uppgifter. Ingen gissad uppgift
  visas för slutdatum, och betalningsintervallet ändrar inte objekttypen.
- Ett pris som anges vara känt kräver ett belopp. Det tomma kända priset
  blockerar hela förslaget även när avsnittet är stängt. Fellänken öppnar
  avsnittet och fokuserar prisfältet utan att lägga någon del i utkastet.
- Sökningen hittar avtalet. Det ursprungliga priset och rättelsen visas
  i utkastet innan hela ändringen sparas.
- Efter omstart finns priset `9 700`, startdatumet `2026-01-01` och
  villkoret kvar. Integrationstestet kontrollerar även att historiken
  innehåller priset före och efter rättelsen genom det publika API:et.

## Skuld och kredit

### AVTAL-02: Bevara skilda belopp och ofullständiga uppgifter

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/contract-forms.spec.ts",
    "caseId": "AVTAL-02"
  },
  "reference": "1280px, ljust tema; två separata profiler i konfliktprovet.",
  "outcomes": [
    "Skuld, kreditutrymme och utnyttjad kredit behåller säkerhet och separata datum."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kontrollera att skuld, beviljat kreditutrymme och utnyttjad
kredit har egna värden och datum, och att uppgiftens säkerhet bevaras.

**Användare:** Alex.

**Förutsättningar:** Hushållet saknar objektet Familjens kreditavtal.

**Integrationstest:**
[contract-forms.spec.ts](../../tests/integration/contract-forms.spec.ts),
testfallet “AVTAL-02: dated debt and credit keep distinct values and
incomplete meanings in forms and drafts”.

**Steg:**

1. Skapa ett objekt med namnet Familjens kreditavtal och typen
   **Kreditavtal**. Öppna **Ekonomiska uppgifter**.
2. Välj **Osäkert uppgivet** för **Senast uppgiven skuld**. Ange
   `Cirka 18 000` med datumet `2026-03-01`. Välj **Känt** för
   **Beviljat kreditutrymme** och ange `50 000` med datumet `2026-03-02`.
3. Välj **Okänt** för **Utnyttjad kredit** med datumet `2026-03-03`.
   Välj **Uttryckligen inget** för **Slutdatum**. Välj
   **Lägg i utkastet och stäng**.
4. Granska belopp, säkerhet och datum i **Utkastet**, genom
   **Visa förslaget: Familjens kreditavtal**. Stäng läsningen. Ladda om
   sidan och kontrollera att det osäkra beloppet är kvar. Spara utkastet.
5. Starta om testinstallationen och ladda om sidan. Öppna objektets
   uppgifter, välj radens **Redigera [objektets namn]** och **Ekonomiska
   uppgifter**.
   Kontrollera varje belopp, säkerhetsval och datum i formuläret.
6. Komplettera utnyttjad kredit med **Känt**, `12 000` och `2026-03-04`.
   Ändra skulden till **Okänt**, rensa kreditutrymmets datum och ändra
   slutdatum till **Ej uppgivet**. Välj **Lägg i utkastet och stäng** och
   granska den okända skulden och den kända utnyttjade krediten.
7. Spara hela utkastet och ladda om sidan. Öppna objektets uppgifter,
   välj radens **Redigera [objektets namn]** och **Ekonomiska uppgifter** igen.

**Förväntat resultat:**

- Skulden `Cirka 18 000` är osäker, kreditutrymmet `50 000` är känt och
  utnyttjad kredit är okänd. Varje uppgift har sitt eget datum.
- Okänt och uttryckligen inget visas med olika betydelser i utkast och
  formulär. Inga beräknade belopp eller betalningar tillkommer.
- Efter rättelsen är skulden okänd med datumet `2026-03-01` och saknar
  det tidigare beloppet. Kreditutrymmet är fortfarande `50 000` utan
  datum. Utnyttjad kredit är `12 000` med datumet `2026-03-04`.
- Slutdatumet är ej uppgivet. Det tidigare uttryckliga valet finns inte
  kvar som aktuell uppgift.

## Samlat sparande och uppgradering

### AVTAL-04: bevara daterade skuld- och kredituppgifter i historiken

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/contract-forms.spec.ts",
    "caseId": "AVTAL-04"
  },
  "reference": "1280px, ljust tema; två separata profiler i konfliktprovet.",
  "outcomes": [
    "Daterat utkast återhämtas; känd nollkredit och ursprungligt underlag består."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/contracts-http.test.ts",
      "title": "HTTP: dated debt and credit facts survive draft recovery, correction and history",
      "purpose": "HTTP-kvitto, sparande användare, tidpunkt, stabil identitet och båda historiska värden."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skilja skuld, kreditutrymme och utnyttjad kredit genom utkast,
sparande och rättelse.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** Tom karta och tomt utkast. Möjlighet att starta om
testinstallationen med samma databas.

**Integrationstest:** [contract-forms.spec.ts](../../tests/integration/contract-forms.spec.ts),
AVTAL-04. Separat HTTP-underlag körs i Vitests serverprojekt:
[contracts-http.test.ts](../../tests/unit/server/contracts-http.test.ts).
Det använder autentiserade anrop till en verklig lokal server, SQLite och
faktisk omstart. Underlaget anges i metadata ovan.

**Steg:**

1. Välj **Nytt objekt**, namnet **Exempelkredit** och typen **Kreditavtal**.
   Öppna **Ekonomiska uppgifter**. Ange osäkert uppgiven skuld
   `125 000,50` med datum
   `2026-09-01`, känt kreditutrymme `80 000` med datum `2026-08-01` och
   känd utnyttjad kredit `12 500` med datum `2026-09-02`.
2. Ange känd valuta `SEK`, okänt pris och uttryckligen inga avtalsvillkor.
   Lägg i utkastet. Starta om applikationen och öppna utkastet igen.
3. Granska och spara hela utkastet. Öppna avtalet, rätta utnyttjad kredit
   till `0` med datum `2026-09-20` och lägg i utkastet.
4. Granska tidigare och föreslagna värden. Spara och starta om igen.
   Öppna samma avtal och kontrollera uppgifterna.

**Förväntat resultat:**

- Utkast och sparat avtal bevarar varje belopps betydelse, säkerhet och
  eget datum. Skuld och kreditutrymme ändras inte av rättelsen.
- Noll är ett känt värde, skilt från okänt och uttryckligen inget.
- Integrationstestet kontrollerar även historikens båda sparanden via
  den publika HTTP-ingången: ursprungliga värden, rättelsen, stabil
  objektidentitet, sparande användare och tidpunkt bevaras. Historiken
  visar rättelsen först och det ursprungliga sparandet därefter.

### AVTAL-05: Avtalens roller och identiteter bevaras vid rättelse

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/contract-relationships.spec.ts",
    "caseId": "AVTAL-05"
  },
  "reference": "1280px, ljust tema; två separata profiler i konfliktprovet.",
  "outcomes": [
    "Roller, riktning och objektens identiteter består efter spärrat sparande och rättelse."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Prova flera hyresavtal, lån, kredit och bilavbetalning med
oberoende roller och ofullständiga uppgifter i samma privata utkast.

**Användare:** En inloggad Skyttel-användare med tillgång till hushållet.

**Förutsättningar:** Ett tomt provhushåll och enbart påhittade uppgifter.
Skapa bostaden Björkbacken, Garaget och fordonet Blå bilen. Skapa separata
objekt för Bostadshyra och Garagehyra med typen Hyresavtal, Elavtalet med
typen Avtal, Bostadslånet med typen Låneavtal, Reservkrediten med typen
Kreditavtal, Bilavbetalningen med typen Avbetalningsavtal och
Bilförsäkringen med typen Försäkringsavtal. Skapa personerna Alex, Kim och
Lo, företaget Björkhem AB, föreningen Låneföreningen och bankkontot
Betalkontot. Välj uttryckligen Ospecificerat objekt för Betalkontot.
Lämna ekonomiska uppgifter tomma och lägg alla objekten i samma utkast.

**Integrationstest:**
[contract-relationships.spec.ts](../../tests/integration/contract-relationships.spec.ts),
testfallet “AVTAL-05: contract relationships preserve separate roles and
identities through a blocked save and correction”.

**Steg:**

1. Lägg samband från Bostadshyra till Björkbacken och från Garagehyra
   till Garaget med typen Gäller. Koppla också Elavtalet till Björkbacken
   med Gäller. Välj Björkhem AB som Hyresvärd för båda hyresavtalen.
2. Lägg Står på avtalet från Bostadshyra till Alex och Björkhem AB samt
   från Garagehyra till Kim och Björkhem AB. Lägg samma samband från
   Bostadslånet, Reservkrediten och Bilavbetalningen till Alex och
   Låneföreningen. Välj Låneföreningen som Långivare för Bostadslånet och
   Reservkrediten. Koppla Bostadslånet till Björkbacken med Gäller.
3. Lägg Finansierar från Bilavbetalningen till Blå bilen och Försäkrar
   från Bilförsäkringen till Blå bilen. Lägg Äger från Blå bilen till
   Kim, Betalar från Kim till Bilavbetalningen och Använder från Lo till
   Blå bilen med säkerheten Osäkert uppgivet.
4. Lägg Används av från Björkbacken med Okänt och från Garaget med
   Uttryckligen inget. Lägg Betalas med från Garagehyra till Betalkontot.
   Lägg samma samband från Bostadshyra med Obesvarad identitetsfråga.
5. Ladda om. Granska hela utkastet och kontrollera att osäkerhet,
   uttryckligen inget, okänt och det ospecificerade bankkontot skiljs åt.
   Kontrollera att Spara hela utkastet är spärrad och inget är gemensamt
   sparat. Det automatiska provet försöker dessutom spara genom HTTP och
   kontrollerar att hela sparandet avvisas utan ändrad karta eller historik.
6. Rätta Bostadshyras betalningssamband till Känt och välj Betalkontot
   uttryckligen. Spara hela utkastet. Starta om provappen, ladda om och
   kontrollera att alla objekt och samband finns kvar utan ifyllda
   ekonomiska uppgifter.
7. Sök efter Bostadshyra och rätta namnet till Hyran på Björkbacken.
   Rätta Betalkontot till Identifierat objekt med namnet Hushållets
   bankkonto. Rätta bilens ägare från Kim till Alex. Granska tidigare
   och föreslagna uppgifter och spara hela utkastet igen.
8. Ladda om. Kontrollera att hyresbetalningarna fortfarande pekar på
   samma, nu identifierade bankkonto. Kontrollera att bilen fortfarande
   är samma objekt, med oförändrad finansiering, försäkring, betalare och
   osäkert uppgiven användare.

**Förväntat resultat:**

- Samma hyresvärd kan vara part i flera hyresavtal och flera avtal kan
  gälla samma bostad. Hyresavtalen behåller typen Hyresavtal.
- Avtalsparter, betalare, ägare och användare är separata samband mellan
  självständiga objekt. Bilens identitet ändras inte vid rättelse av ägare.
- En obesvarad identitetsfråga hindrar hela sparandet. Ett uttryckligen
  valt ospecificerat bankkonto går att spara och identifiera senare.
- Tomma ekonomiska uppgifter hindrar inte sparandet. Inga belopp eller
  andra roller härleds från de angivna sambanden.
- Rättelsen bevarar tidigare objektvärden och samband i historiken med
  samma sparande användare och angiven tid. Det automatiska provet läser
  historiken genom det publika HTTP-gränssnittet.

### AVTAL-06: Uppgradering bevarar egna definitioner och äldre utkast

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/contract-relationships.spec.ts",
    "caseId": "AVTAL-06"
  },
  "reference": "1280px, ljust tema; två separata profiler i konfliktprovet.",
  "outcomes": [
    "Äldre privat utkast kan granskas och sparas efter uppgradering utan förlorade definitioner."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Prova att befintliga hushåll får avtalsstöd utan att egna
definitioner eller privata utkast ersätts.

**Användare:** En operatör med en isolerad provinstallation och dess
inloggade hushållsmedlem.

**Förutsättningar:** Följ
[förberedelsen för äldre avtalsdata](#äldre-avtalsdata).
Den ger en separat databas med migrationerna 001–006, egen Bostad och
Hyresvärd, sparade Björkbacken och samma verifierade användares privata
namnförslag Björkbacken hemma. Bostad har ID `household-home-type`, revision
7 och beskrivningen **Hushållets egen beskrivning av bostad**. Hyresvärd
har ID `household-landlord-role`, revision 4 och beskrivningen
**Hushållets egen beskrivning av hyresvärd**. Objektet har ID
`home-before-upgrade`. Behåll den tillfälliga katalogen och använd
`legacy.env` vid varje start; kör inte provdatakommandot igen under fallet.

**Integrationstest:**
[contract-relationships.spec.ts](../../tests/integration/contract-relationships.spec.ts),
testfallet “AVTAL-06: upgrading preserves household definitions and an older
private draft”.

**Separat förberedelse:** Operatören genomför den kontrollerade
uppgraderingen med appen stoppad enligt förberedelsen ovan. Starta sedan
nuvarande app med `legacy.env` och logga in på nytt med samma konto.
Integrationstestet arrangerar uppgraderingen och den nya inloggningen
genom verklig HTTP före webbläsarens läsning och sparande.

**Steg:**

1. Öppna kartan efter den nya inloggningen.
2. Kontrollera att bostaden och namnförslaget finns kvar. Kontrollera
   **Inställningar → Typer och egna fält**. Öppna **Objekttyper och egna
   fält → Ändra typ: Bostad** och läs namn och beskrivning. Stäng med
   **Stäng typformuläret utan att skicka**. Öppna **Sambandstyper och
   riktning → Ändra sambandstyp: Hyresvärd**, läs dess namn och beskrivning
   och välj **Stäng sambandstypen utan att skicka**. Ingen
   dubblett med samma namn ska tillkomma. Revision och intern identitet
   kontrolleras som tekniskt underlag av integrationstestet.
3. Läs typknapparna för **Garage**, **Fordon**, **Avtal**, **Hyresavtal**,
   **Låneavtal**, **Kreditavtal**, **Avbetalningsavtal** och
   **Försäkringsavtal**. Återgå med **Tillbaka till kartan**. Granska
   namnförslaget med **Visa utkastet → Visa förslaget: Björkbacken hemma**.
   Stäng läsningen med krysset.
4. Spara det äldre utkastet. Starta om provappen och öppna kartan igen.
   Kontrollera namnet Björkbacken hemma och de bevarade typdefinitionerna.

**Förväntat resultat:**

- Uppgraderingen lägger till saknade hushållsdefinitioner utan att
  ersätta hushållets egna definitioner med samma namn.
- Sparat innehåll och det privata utkastet är oförändrade tills användaren
  sparar. Utkastet går att spara utan att nya ekonomiska uppgifter krävs.
- Samma bostadsobjekt får det rättade namnet och tidigare namn bevaras i
  historiken med rätt sparande användare. Innehållet finns kvar efter omstart.

### AVTAL-07: avvisa ogiltiga uppgifter utan att ändra utkastet

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/contract-forms.spec.ts",
    "caseId": "AVTAL-07"
  },
  "reference": "1280px, ljust tema; två separata profiler i konfliktprovet.",
  "outcomes": [
    "Saknat känt skuldbelopp avvisas; tidigare utkast kan sparas utan gissade fakta."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/contracts-http.test.ts",
      "title": "HTTP: invalid financial facts preserve the entire current draft and saved map",
      "purpose": "Ogiltigt datum avvisas utan ändrat utkast, karta eller historik."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kontrollera att valideringen bevarar övriga förslag och inte
skapar en delvis sparad karta.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** Tom karta och tomt utkast.

**Integrationstest:** [contract-forms.spec.ts](../../tests/integration/contract-forms.spec.ts),
AVTAL-07. Separat datumvalidering via HTTP körs i Vitests serverprojekt:
[contracts-http.test.ts](../../tests/unit/server/contracts-http.test.ts),
med autentiserade anrop till en verklig lokal server och SQLite.
Underlaget anges i metadata ovan.

**Steg:**

1. Skapa objektet **Ofullständigt åtagande** utan ekonomiska uppgifter
   och lägg det i utkastet.
2. Öppna **Nytt objekt**, ange **Felaktigt åtagande** och välj typen
   **Låneavtal**. Öppna **Ekonomiska uppgifter** och välj **Känt** för
   **Senast uppgiven skuld**, men lämna beloppet tomt. Öppna
   **Grunduppgifter** och välj **Lägg i utkastet och stäng**. Följ
   skuldlänken i felsammanfattningen; det tomma beloppsfältet får fokus.
3. Välj **Avbryt → Kasta ändringarna och fortsätt** och öppna hela utkastet.
   Spara det ofullständiga åtagandet utan att ange belopp eller villkor.

**Förväntat resultat:**

- Formuläret kräver ett värde när säkerheten uttryckligen är **Känt**.
  Det tidigare förslaget finns kvar och inget nytt objekt sparas.
- Åtagandet går att spara utan ekonomiska uppgifter; inget belopp gissas.
- Det separata tekniska testet skickar ett ogiltigt uppgiftsdatum via den
  publika HTTP-ingången. Försöket avvisas och hela utkastet, kartan och
  historiken bevaras.

### AVTAL-08: lös en konflikt utan att förlora oberoende ekonomiska fakta

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/contract-forms.spec.ts",
    "caseId": "AVTAL-08"
  },
  "reference": "1280px, ljust tema; två separata profiler i konfliktprovet.",
  "outcomes": [
    "Användarens konfliktval förenar separata fakta utan omedelbart sparande."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/contracts-http.test.ts",
      "title": "HTTP: resolving financial conflicts preserves independent facts and requires a whole new save",
      "purpose": "HTTP-konfliktval sparar inget; nytt helsparande bevarar oberoende fakta och rätt användare i historiken."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Bevara separata fakta när två användare rättar samma avtal.

**Användare:** Administratören Alex och medlemmen Robin i olika
webbläsarprofiler med tillgång till samma hushåll.

**Förutsättningar:** Ett sparat låneavtal **Exempellån**, med osäkert
uppgiven skuld `150000` daterad `2026-08-01`, känt kreditutrymme `200000`
och kända avtalsvillkor **Preliminära villkor**. Tomma utkast.

**Integrationstest:** [contract-forms.spec.ts](../../tests/integration/contract-forms.spec.ts),
AVTAL-08. Separat HTTP-konfliktbevis körs i Vitests serverprojekt:
[contracts-http.test.ts](../../tests/unit/server/contracts-http.test.ts),
med oberoende autentiserade klienter, verklig lokal server, SQLite och
faktisk omstart. Underlaget anges i metadata ovan.

**Steg:**

1. Låt Alex rätta skulden till känt `140000` daterat `2026-09-01`, välja
   **Ej uppgivet** för avtalsvillkoren och lägga avtalet i utkastet.
   Lägg också till personen **Lo** utan att spara.
2. Låt Robin öppna sin karta och kontrollera att Alex utkast inte syns.
   Rätta kreditutrymmet till `250000`, ange känd valuta `SEK` och spara.
3. Låt Alex välja **Spara hela utkastet**. Läs avvisningen och stäng
   sparrutan med Escape. Stäng textvyn, välj **Karta → Hämta aktuellt
   underlag** och återgå till **Tabell**. Öppna **1 konflikt i ditt
   utkast**. Välj **Ditt förslag** för skuld och avtalsvillkor, samt
   **Sparat i kartan nu** för kreditutrymme och valuta. Granska **Efter
   dina val** och välj **Lägg valen i utkastet**.
4. Granska det uppdaterade utkastet och välj **Spara hela utkastet**.
   Starta om applikationen och kontrollera avtalet och Lo.

**Förväntat resultat:**

- Det första sparförsöket avvisas helt: Lo finns bara i Alex utkast.
- Konfliktvalet bevarar Robins kreditutrymme och valuta tillsammans med
  Alex daterade skuld och borttagning av villkor. Belopp, säkerhet och
  uppgiftsdatum behandlas som en sammanhängande uppgift.
- Konfliktvalet sparar ingenting i sig. Efter det nya sparandet finns
  Lo och samtliga avsedda avtalsuppgifter kvar efter omstart.
- Det separata tekniska testet kontrollerar att historiken visar rätt
  användare för varje sparande och bevarar Robins värden som underlag
  för Alex rättelse.

## Äldre avtalsdata

En operatör förbereder en separat lokal installation med den vanliga
konfigurerade inloggningen enligt
[utvecklingsguiden](../development/devcontainer.md#set-up-local-sign-in).
Stoppa vanlig utveckling och håll portarna 3300 och 5173 fria. Kör i
repositoryts rot:

```sh
umask 077
SKYTTEL_MANUAL_MAP_DIR=$(mktemp -d /tmp/skyttel-manual-map-XXXXXX)
printf 'SKYTTEL_DATABASE_PATH=%s/verified.sqlite\n' \
  "$SKYTTEL_MANUAL_MAP_DIR" > "$SKYTTEL_MANUAL_MAP_DIR/case.env"
env -u SKYTTEL_DATABASE_PATH \
  node --env-file="$SKYTTEL_MANUAL_MAP_DIR/case.env" scripts/develop.mjs
```

Logga in som den konfigurerade administratören i en ny profil och skapa
Linden. Hämta bara användar-ID, inga kakor eller leverantörstoken, med
följande separat konsolkommando:

```javascript
(await (await fetch('/api/bootstrap')).json()).user.id
```

Stoppa servern. Kör i samma terminal, med det kopierade ID:t:

```sh
SKYTTEL_MANUAL_USER_ID='paste-Alex-user-id'
node --import tsx scripts/prepare-manual-map.ts \
  legacy-contracts "$SKYTTEL_MANUAL_MAP_DIR" "$SKYTTEL_MANUAL_USER_ID"
printf 'SKYTTEL_DATABASE_PATH=%s/legacy.sqlite\n' \
  "$SKYTTEL_MANUAL_MAP_DIR" > "$SKYTTEL_MANUAL_MAP_DIR/legacy.env"
printf 'SKYTTEL_AUTHORITY_GENERATION=%s\n' "$(node -p 'crypto.randomUUID()')" \
  >> "$SKYTTEL_MANUAL_MAP_DIR/legacy.env"
npm run build
env -u SKYTTEL_DATABASE_PATH -u SKYTTEL_AUTHORITY_GENERATION \
  node --env-file="${SKYTTEL_DEV_ENV_FILE:-.devcontainer/.env}" \
  --env-file="$SKYTTEL_MANUAL_MAP_DIR/legacy.env" \
  dist/server/upgrade-legacy-login.js \
  --confirm-legacy-upgrade --confirm-service-stopped
env -u SKYTTEL_DATABASE_PATH -u SKYTTEL_AUTHORITY_GENERATION \
  node --env-file="$SKYTTEL_MANUAL_MAP_DIR/legacy.env" scripts/develop.mjs
```

Hjälpen skapar en separat äldre databas och vägrar skriva över en befintlig
fil. Den kontrollerade uppgraderingen avslutar de äldre inloggningarna
innan appen startar. Läs
[operatörens förfarande](../operations/login-upgrade.md) och kräv ett
lyckat resultat från kommandot. Logga in igen med samma konto. Vid omstart
upprepar du bara sista serverkommandot, utan att köra uppgraderingen,
hjälpen eller `db:setup` igen. När utfallet är kontrollerat, stoppa servern
och stäng provprofilen före rensning:

```sh
rm -r -- "${SKYTTEL_MANUAL_MAP_DIR:?}"
unset SKYTTEL_MANUAL_MAP_DIR SKYTTEL_MANUAL_USER_ID
```

## Referenser och identiteter

AVTAL-04, AVTAL-07 och AVTAL-08 behåller sina ID:n med verkliga
objektformulär, granskning, sparande och konfliktval i **contract-forms**.
De ursprungliga HTTP-testerna behåller samtliga protokollkontroller som
separat tekniskt underlag: ogiltigt datum, oförändrat utkast och karta,
hela konfliktsparandet, sparande användare, tidpunkt och historik.
AVTAL-06 tillför läsning och sparande i webbläsaren efter verklig uppgradering.
Inget ID pensioneras och ingen ekonomisk täckningsförlust accepteras.

## Flyttat tekniskt underlag

De tre requestdrivna protokollproven från `contracts.spec.ts` körs som
separat HTTP-underlag i
[contracts-http.test.ts](../../tests/unit/server/contracts-http.test.ts).
De behåller sina fullständiga påståenden och exakta testnamn i metadata för
AVTAL-04, AVTAL-07 och AVTAL-08. Autentisering, oberoende medlemsutkast,
verklig SQLite och faktisk serveromstart ingår fortfarande. Daterade fakta,
känd nollkredit, rättelser, historik, atomisk avvisning och nytt samlat
sparande efter konfliktval behåller sina kontroller.

Tre integrationsexekveringar flyttas till tre serverexekveringar; inga
protokollarbetsflöden eller påståenden tas bort. De oanvända
webbläsarfixturerna ersätts med separata requestklienter. Flytten etablerar
inte nya manuella observationer. De funktionella AVTAL-fallen behåller
sina identiteter och integrationstester.
