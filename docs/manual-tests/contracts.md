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

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan. Detaljpanelen visar uppgifterna. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. I hel kartvy heter knappen **Redigera val**. Att bara välja
objektet eller sambandet öppnar inte formuläret.

1. Starta en separat testinstallation enligt
   [provförberedelsen](../development/devcontainer.md#disposable-local-database).
   Logga in som Alex och
   skapa ett hushåll om installationen ännu saknar ett.
2. Börja varje fall utan förslag i **Hela mitt utkast**. Använd en ny
   testinstallation vid omkörning, eller ta bort testfallets egna objekt
   genom utkastet. Bevara övriga testdata.

## Frivilliga avtalsuppgifter

### AVTAL-01: Registrera, hitta och rätta hyresuppgifter

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
   **Hyresavtal**. Öppna **Ekonomiska uppgifter och avtalsvillkor**.
2. Välj **Känt** för pris men lämna beloppet tomt. Försök lägga objektet
   i utkastet. Kontrollera att prisfältet får fokus och att utkastet är
   tomt. Ange sedan priset `9 500`.
3. Välj **Känt** för valuta, betalningsintervall, startdatum och
   avtalsvillkor. Ange `SEK`, `Månadsvis`, `2026-01-01` och
   `Tre månaders uppsägningstid.`. Lämna slutdatum och övriga uppgifter
   som **Ej uppgivet**.
4. Välj **Lägg i mitt utkast** och granska pris, datum och villkor i
   **Hela mitt utkast**. Spara hela utkastet och ladda om sidan.
5. Sök efter `hyra`. Öppna Hyra för lägenheten och den ekonomiska delen.
   Kontrollera pris och tomt slutdatum. Rätta priset till `9 700`.
6. Kontrollera att hela utkastet inte kan sparas medan formuläret har
   oskickad text. Lägg rättelsen i utkastet, granska både `9 500` och
   `9 700` och spara hela utkastet.
7. Starta om testinstallationen och ladda om sidan. Öppna objektet igen
   och kontrollera pris, startdatum och avtalsvillkor.

**Förväntat resultat:**

- Hyresavtalet går att spara med öppna uppgifter. Ingen gissad uppgift
  visas för slutdatum, och betalningsintervallet ändrar inte objekttypen.
- Ett pris som anges vara känt kräver ett belopp. Det tomma kända priset
  blockerar förslaget utan att lägga någon del i utkastet.
- Sökningen hittar avtalet. Det ursprungliga priset och rättelsen visas
  i utkastet innan hela ändringen sparas.
- Efter omstart finns priset `9 700`, startdatumet `2026-01-01` och
  villkoret kvar. Integrationstestet kontrollerar även att historiken
  innehåller priset före och efter rättelsen genom det publika API:et.

## Skuld och kredit

### AVTAL-02: Bevara skilda belopp och ofullständiga uppgifter

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
   **Kreditavtal**. Öppna **Ekonomiska uppgifter och avtalsvillkor**.
2. Välj **Osäkert uppgivet** för **Senast uppgiven skuld**. Ange
   `Cirka 18 000` med datumet `2026-03-01`. Välj **Känt** för
   **Beviljat kreditutrymme** och ange `50 000` med datumet `2026-03-02`.
3. Välj **Okänt** för **Utnyttjad kredit** med datumet `2026-03-03`.
   Välj **Uttryckligen inget** för **Slutdatum**. Lägg objektet i utkastet.
4. Granska belopp, säkerhet och datum i **Hela mitt utkast**. Ladda om
   sidan och kontrollera att det osäkra beloppet är kvar. Spara utkastet.
5. Starta om testinstallationen, ladda om sidan och öppna objektet.
   Kontrollera varje belopp, säkerhetsval och datum i formuläret.
6. Komplettera utnyttjad kredit med **Känt**, `12 000` och `2026-03-04`.
   Ändra skulden till **Okänt**, rensa kreditutrymmets datum och ändra
   slutdatum till **Ej uppgivet**. Lägg rättelsen i utkastet och granska
   den okända skulden och den kända utnyttjade krediten.
7. Spara hela utkastet, ladda om sidan och öppna objektet igen.

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

**Syfte:** Skilja skuld, kreditutrymme och utnyttjad kredit genom utkast,
sparande och rättelse.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** Tom karta och tomt utkast. Möjlighet att starta om
testinstallationen med samma databas.

**Integrationstest:** [contracts.spec.ts](../../tests/integration/contracts.spec.ts),
testfallet “AVTAL-04: dated debt and credit facts survive draft recovery,
correction and history”.

**Steg:**

1. Skapa kreditavtalet **Exempelkredit**. Öppna **Ekonomiska uppgifter och
   avtalsvillkor**. Ange osäkert uppgiven skuld `125 000,50` med datum
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
  objektidentitet, sparande användare och tidpunkt bevaras.

### AVTAL-05: Avtalens roller och identiteter bevaras vid rättelse

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

**Syfte:** Prova att befintliga hushåll får avtalsstöd utan att egna
definitioner eller privata utkast ersätts.

**Användare:** En operatör med en isolerad provinstallation och dess
inloggade hushållsmedlem.

**Förutsättningar:** Följ
[förberedelsen för äldre avtalsdata](../development/testing.md#legacy-contract-upgrade).
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

**Steg:**

1. Starta nuvarande app med `legacy.env` enligt förberedelsen. Starten
   uppgraderar databasen. Logga in på nytt med samma konto och öppna kartan.
2. Kontrollera att bostaden och namnförslaget finns kvar. Kontrollera
   hushållets definitioner genom det publika kartgränssnittet: egna
   Bostad och Hyresvärd ska behålla namn, beskrivning, revision och
   identitet utan dubbletter.
3. Kontrollera att övriga typer för garage, fordon, avtal, hyra, lån,
   kredit, avbetalning och försäkring samt deras samband finns tillgängliga.
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

**Syfte:** Kontrollera att valideringen bevarar övriga förslag och inte
skapar en delvis sparad karta.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** Tom karta och tomt utkast.

**Integrationstest:** [contracts.spec.ts](../../tests/integration/contracts.spec.ts),
testfallet “AVTAL-07: invalid financial facts preserve the entire current
draft and saved map”.

**Steg:**

1. Skapa objektet **Ofullständigt åtagande** utan ekonomiska uppgifter
   och lägg det i utkastet.
2. Öppna ett nytt objekt och ange namnet **Felaktigt åtagande**.
   Välj **Känt** för skuld men lämna beloppet tomt. Försök lägga
   objektet i utkastet.
3. Stäng formuläret utan att skicka texten och kontrollera hela utkastet.
   Spara det ofullständiga åtagandet utan att ange belopp eller villkor.

**Förväntat resultat:**

- Formuläret kräver ett värde när säkerheten uttryckligen är **Känt**.
  Det tidigare förslaget finns kvar och inget nytt objekt sparas.
- Åtagandet går att spara utan ekonomiska uppgifter; inget belopp gissas.
- Integrationstestet skickar även ett ogiltigt uppgiftsdatum via den
  publika HTTP-ingången. Försöket avvisas och hela utkastet, kartan och
  historiken bevaras.

### AVTAL-08: lös en konflikt utan att förlora oberoende ekonomiska fakta

**Syfte:** Bevara separata fakta när två användare rättar samma avtal.

**Användare:** Administratören Alex och medlemmen Robin i olika
webbläsarprofiler med tillgång till samma hushåll.

**Förutsättningar:** Ett sparat låneavtal **Exempellån**, med osäkert
uppgiven skuld `150000` daterad `2026-08-01`, känt kreditutrymme `200000`
och kända avtalsvillkor **Preliminära villkor**. Tomma utkast.

**Integrationstest:** [contracts.spec.ts](../../tests/integration/contracts.spec.ts),
testfallet “AVTAL-08: resolving financial conflicts preserves independent
facts and requires a whole new save”.

**Steg:**

1. Låt Alex rätta skulden till känt `140000` daterat `2026-09-01`, välja
   **Ej uppgivet** för avtalsvillkoren och lägga avtalet i utkastet.
   Lägg också till personen **Lo** utan att spara.
2. Låt Robin öppna sin karta och kontrollera att Alex utkast inte syns.
   Rätta kreditutrymmet till `250000`, ange känd valuta `SEK` och spara.
3. Låt Alex försöka spara och sedan hämta aktuellt underlag. Granska
   konflikten och välj **Behåll mitt förslag**.
4. Granska det uppdaterade utkastet och välj **Spara hela utkastet**.
   Starta om applikationen och kontrollera avtalet och Lo.

**Förväntat resultat:**

- Det första sparförsöket avvisas helt: Lo finns bara i Alex utkast.
- Konfliktvalet bevarar Robins kreditutrymme och valuta tillsammans med
  Alex daterade skuld och borttagning av villkor. Belopp, säkerhet och
  uppgiftsdatum behandlas som en sammanhängande uppgift.
- Konfliktvalet sparar ingenting i sig. Efter det nya sparandet finns
  Lo och samtliga avsedda avtalsuppgifter kvar efter omstart.
- Integrationstestet kontrollerar via HTTP att historiken visar rätt
  användare för varje sparande och bevarar Robins värden som underlag
  för Alex rättelse.
