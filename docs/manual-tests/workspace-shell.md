# Manuella testfall för kartans arbetsyta

Fallen omfattar kartans verktyg, teman, frivillig hjälp, samtalshjälp och
återhämtning.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex är administratör i ett separat provhushåll. Använd en konfigurerad
testidentitet och påhittade hushållsuppgifter.

## Allmän förberedelse

YTA-11/12 följer
[faktisk HTTPS-ingång, provdata och återställning](workspace-preparation.md#fysiska-enheter-och-egen-provdata)
när uppläsning eller fysisk pekning utförs på telefon eller surfplatta.

1. Förbered en
   [separat provdatabas](../development/devcontainer.md#disposable-local-database),
   logga in och skapa ett tomt hushåll.
2. Börja varje fall med ett tomt hushåll utan öppna dialoger eller textvy.
   Behåll
   fliken mellan steg när inget annat anges.
3. Kör med tangentbord på dator och pekskärm på telefon. Kontrollera
   skärmläsarens namn, läsordning och statusmeddelanden separat. Anteckna
   fysiska enheter och hjälpmedel; Chromium-emulering verifierar inte dem.
4. För YTA-03, YTA-07, YTA-08 och YTA-09: använd i stället
   [den kontrollerade röstinstallationen](voice-assistant.md#controlled-voice-fixture).
   Starta med `node --import tsx scripts/manual-voice.ts` efter bygget,
   följ den privata portvidarebefordran och logga in med Google som Alex.
   Skapa ett tomt hushåll Hjälpprov; kör inte `seed-family`.
   Börja med stängda arbetsytor och utan sparat medgivande. Installationens
   ljudspår är tysta och bevisar inte hört tal. Avsluta med `quit`.
   För YTA-03: efter samtalsstart och skickat meddelande i steg 4, läs
   terminalens `held`-händelse, eller kör `pending`. Ersätt `REQUEST` med
   den aktuella begärans ID och kör `reply REQUEST Du kan skriva här.`.
   Gör detta vid varje bredd innan svaret läses och det oskickade
   meddelandet skrivs. Detta släpper bara det kontrollerade textsvar som
   webbläsaren väntar på; kör inget verktyg som ändrar utkastet.

## Verktyg och teman

### YTA-01: öppna och bevara hushållsarbete

**Syfte:** Nå kompletta formulär från kartan och skydda oskickad text vid
stängning.

**Användare:** Alex.

**Förutsättningar:** Tom karta.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
YTA-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-shell.spec.ts",
    "caseId": "YTA-01"
  },
  "reference": "Chromium, angivna mått och teman; syntetiskt samtal enligt separat förberedelse.",
  "outcomes": [
    "Verktyg, läsbart innehåll och fokus förblir tillgängliga i det angivna arbetsflödet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna hushållet. Kontrollera att den tomma kartan och verktygen visas.
2. Välj **Visa verktygens namn**, **Tabell** och **Nytt objekt**.
   Ange namnet **Cykeln**.
3. Välj krysset i objektdialogen. Kontrollera förvalt **Fortsätt redigera**
   och tryck Escape. Namnet ska finnas kvar.
4. Välj **Lägg i utkastet och stäng**. Välj **Karta**, sedan **Tabell**.
   Kontrollera Cykeln. Öppna **Skriv till Skyttel**, **Visa utkastet** och
   välj **Spara hela utkastet**.
5. Läs **Utkastet är sparat** och ladda om sidan.

**Förväntat resultat:**

- Verktygen har begripliga namn. Den vanliga nya objektingången är åtkomlig.
- Avbruten förlust behåller texten. Bekräftat tillägg bevarar hela förslaget
  genom kart- och tabellbyte utan automatiskt gemensamt sparande.
- Cykeln finns i kartan efter uttryckligt sparande och omladdning.

### YTA-02: temaval och enhetens inställning

**Syfte:** Byta tema med bibehållet fokus.

**Användare:** Alex.

**Förutsättningar:** Enheten använder ljust tema.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
YTA-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-shell.spec.ts",
    "caseId": "YTA-02"
  },
  "reference": "Chromium, angivna mått och teman; syntetiskt samtal enligt separat förberedelse.",
  "outcomes": [
    "Verktyg, läsbart innehåll och fokus förblir tillgängliga i det angivna arbetsflödet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Tema** och välj **Mörkt**. Kontrollera kartan och verktygen.
2. Ladda om och kontrollera att valet består. Välj sedan **Ljust**.
3. Välj **System** och ändra enhetens tema till mörkt och sedan ljust.
4. I varje temaläge, flytta tangentbordsfokus till **Hoppa till innehållet**,
   **Till verktygen**, **Till tabellen** och **Till samtalet med
   Skyttel**.
   Kontrollera att länkarna och knapparna går att läsa och har synligt fokus.
5. Öppna temavalet med tangentbordet och tryck Escape.

**Förväntat resultat:**

- Kartans bakgrund, text och verktyg följer det valda temat. Hopplänkarna
  är läsbara med synligt, oskymt tangentbordsfokus i ljust, mörkt och
  systemstyrt tema.
- Fokus återgår till temaknappen efter val och Escape.
- System följer enheten utan omladdning; ett uttryckligt val består efter
  omladdning genom att sparas på kontot.

### YTA-03: hjälp och formulär på telefon

**Syfte:** Utföra arbetet utan att behöva navigera i kartgrafiken.

**Användare:** Alex.

**Förutsättningar:** Tom karta på en smal telefon.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
YTA-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-shell.spec.ts",
    "caseId": "YTA-03"
  },
  "reference": "Chromium, angivna mått och teman; syntetiskt samtal enligt separat förberedelse.",
  "outcomes": [
    "Verktyg, läsbart innehåll och fokus förblir tillgängliga i det angivna arbetsflödet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna direkt från de hopfällda verktygen
   **Information och hjälp**. Läs instruktionerna och tryck Escape.
2. Välj **Tabell**, **Nytt objekt** och skriv **Min cykel**. Kontrollera att
   fält och knappen för att lägga i utkastet går att nå.
3. Välj krysset och **Kasta ändringarna och fortsätt**. Välj **Karta**,
   klicka i kartans sökfält, kontrollera sökfältets fokus och tryck Escape.
4. Öppna **Skriv till Skyttel** och **Visa utkastet**. Läs det tomma utkastet
   utan samtyckesfråga. Stäng texten, välj **Karta**, öppna texten igen och
   välj uttryckligen **Nytt samtal** före medgivande och samtalsstart.
   Skriv **Jag vill skriva här.** i **Meddelande till Skyttel** och välj
   **Skicka**. Läs ditt meddelande och svaret **Du kan skriva här.** från
   den kontrollerade förberedelsen.
   Skriv **Oskickat meddelande medan hjälpen läses** i **Meddelande till
   Skyttel** utan att skicka det.
5. Upprepa vid 390 och 320 CSS-pixlars bredd med tangentbord.
   Använd hopplänkarna till tabell och samtal före kartgrafiken.
   Faktisk förstoring och fysisk inmatning provas i YTA-12.
6. Öppna hjälpen igen och fäll ihop verktygen. Flytta fokus till hjälpen
   och tryck Escape. Kontrollera att fokus är kvar på en synlig hjälpknapp.
   Återgå till **Skriv till Skyttel** och läs ditt skickade meddelande,
   det tidigare svaret och hela det oskickade meddelandet. Välj
   **Visa utkastet** och läs att utkastet
   fortfarande är tomt; meddelandet ska fortfarande vara oskickat och kvar.

**Förväntat resultat:**

- Hjälpens rubrik får fokus; Escape återför fokus till hjälpknappen,
  även efter att verktygen har fällts ihop.
- Formulär, utkastets läsning och samtal går att nå utan grafiskt objektval.
- Texten och utkastet kan öppnas utan att starta ett samtal eller fråga om AI.
- Innehållet är läsbart och kontrollerna nåbara även med förstoring.
- Fokus återgår till en synlig verktygsknapp. Den aktiva modalen skyddar
  sina fält från fokus på bakomliggande kontroller.

### YTA-07: hjälpen förklarar samtalet och leder till rätt kontroller

**Syfte:** Läsa hjälpen innan medgivande och följa dess samtalskontroller.

**Användare:** Alex, administratör i Hjälpprov.

**Förutsättningar:** Den kontrollerade installationen enligt steg 4. Börja med
tomt utkast på dator. Använd Windows/Linux-emulering vid 1280 × 720. macOS-texten
har det avgränsade webbläsarfallet YTA-13; den första macOS-genvägen och
medgivandet provas i MIKROFONTRYCK-09. Fysisk genväg bedöms i YTA-15.

**Integrationstest:**
[conversation-help.spec.ts](../../tests/integration/conversation-help.spec.ts),
YTA-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-help.spec.ts",
    "caseId": "YTA-07"
  },
  "reference": "Chromium, Windows/Linux-plattformsnamn; kontrollerad röst och text, Ctrl+Mellanslag.",
  "outcomes": [
    "Läsa hjälpen innan medgivande och följa dess samtalskontroller."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Nå **Information och hjälp** med Tab och öppna med Enter. Läs rubriken och
   delarna om samma samtal, långt tryck, medgivande, OpenAI och formulär. Läs
   också Kartans teckenförklaring: förslagens färger, heldragna nya samband,
   streckade gamla samband, markeringsringen och punktade etikettkopplingar.
   Skilj höjdhjälpens streck från gamla samband. Kontrollera förklaringen av tre
   sekunders sparbesked och kvitton. Läs vägarna **Tabell**,
   **Skriv till Skyttel → Visa utkastet** och **Rapporter → Ändringshistorik**.
   Skilj oskickat samtalsmeddelande från formulärändringar som inte lagts i
   utkastet. Kontrollera att läsning inte startar mikrofonen eller frågar om
   medgivande.
2. Läs att släpp stoppar ny inspelning direkt och att redan inspelat tal från
   starten kan skickas efter släpp. Läs tangentkombinationen för din enhet:
   Ctrl+Mellanslag eller Ctrl+Skift+Mellanslag. Läs förbehållet om fel i
   samtalstexten och att kartan och kvittot bekräftar resultatet.
3. Läs vilka uppgifter OpenAI behandlar. Läs att begäran om att inte lagra inte
   garanterar behandling enbart i EU eller omedelbar radering av alla kopior. Nå
   **Läs OpenAI:s datavillkor** med Tab och kontrollera länkens namn.
4. Stäng med Escape. Välj **Tabell → Nytt objekt**, ange **Oskickat formulär**
   och välj krysset. Kräv fokus på **Fortsätt redigera**; Escape ska behålla
   namnet. Välj krysset igen och **Kasta ändringarna och fortsätt**. Öppna
   **Nytt objekt** på nytt och kräv tomt Namn. Ange **Lo Exempel** och välj
   **Lägg i utkastet och stäng**. Öppna **Skriv till Skyttel → Visa utkastet**
   utan att starta ett samtal. Läs Lo-förslaget utan medgivande: namn
   **Lo Exempel**, typ **Person** och ingen egenskap Beskrivning. Stäng textvyn
   och öppna **Rapporter → Ändringshistorik**; kräv
   **Inga genomförda sparanden.** Välj **Tillbaka till arbetet** och **Karta**.
5. Tryck tangentkombinationen kort. I medgivanderutan, markera
   **Fråga inte igen för det här hushållet** och välj **Godkänn och starta**.
   Tryck kombinationen kort igen för att stänga av mikrofonen. Håll sedan
   kombinationen tills mikrofonen är på och släpp.
6. Välj **Skriv till Skyttel**, skicka **Vad finns i utkastet?** och släpp det
   kontrollerade svaret **Lo-förslaget ligger kvar i utkastet.** enligt
   [hjälpens svarsförberedelse](voice-controls-preparation.md#hjälpens-kontrollerade-svar)
   . Skriv **Oskickat medan hjälpen läses** utan att skicka. Öppna och stäng
   hjälpen igen. Stäng textvyn, välj **Tabell → Nytt objekt** och skriv
   **Kastas utan att röra samtalet**. Välj krysset och
   **Kasta ändringarna och fortsätt**. Välj **Karta → Skriv till Skyttel**.
   Kräv samma samtalstext och oskickade meddelande utan nytt medgivande. Öppna
   **Visa utkastet** och kontrollera att bara Lo-förslaget finns kvar.
7. Följ hjälpens väg: **Inställningar**, **Samtal med Skyttel**,
   **Återkalla medgivandet** och **Återkalla och avsluta samtalet**. Återgå
   till kartan och välj **Skriv till Skyttel** igen. Kontrollera att textvyn
   öppnas utan ny medgivanderuta. Välj sedan **Nytt samtal** för en uttrycklig
   ny start och kontrollera medgivanderutan.

**Förväntat resultat:**

- Hjälpens rubrik får fokus. Texten använder **Prata med Skyttel** och
  **Skriv till Skyttel**, förklarar att röst och text är samma samtal och att
  formulären kan användas utan mikrofon eller samtalsmedgivande.
- Hjälpens vägar når Tabell, utkastet i textvyn och Rapporter med
  Ändringshistorik. Avbruten förlust behåller formulärvärden; bekräftad förlust
  kastar bara oskickade formulärändringar. Lo-förslaget och samtalets oskickade
  meddelande behålls. Inget sparande tillkommer.
- Texten förklarar långt och kort tryck, medgivande före inspelning, fortsatt
  svar efter släpp och att väntande tal kasseras vid avbruten start.
  Tangentkombinationen följer plattformen. Kort tryck räcker alltid.
- Mikrofonen växlar med kort tryck och är av efter släpp av långt tryck. Samma
  samtal fortsätter i text utan ny medgivanderuta. Lo-förslaget finns kvar;
  oskickad text bevaras medan hjälpen läses.
- Återkallandet avslutar samtalet, bevarar Lo-förslaget och frågar om medgivande
  vid nästa start. Hjälpens kontrollnamn leder till dessa steg.
- OpenAI:s behandling, möjliga kvarvarande uppgifter och begränsningar beskrivs
  utan löfte om omedelbar radering eller behandling enbart i EU. Automationen
  granskar också att verkliga text- och röstanrop begär att inte lagra svar
  eller session; den provar inte leverantörens drift.

### YTA-08: hjälpens långa text går att läsa och stänga på smal skärm

**Syfte:** Läsa hela hjälpen och nå verktygen utan rullning i sidled.

**Användare:** Alex.

**Förutsättningar:** Samma installation på smal skärm, gärna 320×568 px. Inget
samtal pågår. Använd tangentbord; fysisk pekning bedöms i YTA-15.

**Integrationstest:**
[conversation-help.spec.ts](../../tests/integration/conversation-help.spec.ts),
YTA-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-help.spec.ts",
    "caseId": "YTA-08"
  },
  "reference": "Chromium 320 × 568, tangentbord; lång hjälpyta, verktygsnamn och stängning.",
  "outcomes": [
    "Läsa hela hjälpen och nå verktygen utan rullning i sidled."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Information och hjälp** direkt från de hopfällda verktygen med
   tangentbord. Kontrollera fokus på rubriken. Rulla till slutet, med End på
   dator eller genom hjälpens text på pekskärm. Läs formuläralternativet.
2. Nå länken till datavillkoren och stängknappen med Tab. Kontrollera att det
   fokuserade innehållet syns och att hjälpen ryms i sidled.
3. Välj **Visa verktygens namn** och sedan **Dölj verktygens namn** medan
   hjälpen är öppen. Kräv att knapparna går att aktivera och att hjälpen
   fortfarande går att läsa.
4. Stäng med Escape. Öppna igen, rulla och använd **Stäng verktyget**.

**Förväntat resultat:**

- Hjälpen och verktygen har egna nåbara ytor. Lång text rullar inom hjälpen och
  täcker inte knappen som fäller ihop verktygen.
- Rubriker, stycken, datavillkorslänk och stängknapp går att nå med tangentbord.
  Ingen rullning i sidled behövs. Mikrofonen startar inte.
- Hjälpknappen syns även när verktygen är hopfällda. Stängning återför fokus
  till hjälpknappen.

**Tillgänglighetsbedömning för samtalshjälpen:**

Designmålen är WCAG 2.2 AA: semantisk region och rubrikordning (1.3.1),
beskrivande rubriker och länk (2.4.6), tangentbord och logiskt återställt fokus
(2.1.1, 2.4.3), samt omflöde och oskymt fokus (1.4.10, 2.4.11). Länken använder
arbetsytans minst 44 px höga träffyta (2.5.8). Automationen kontrollerar region,
rubrikfokus, genvägarnas kontrollerade beteende, smal läsyta, rullning, nåbara
verktyg och återställt fokus. Verklig NVDA/VoiceOver-uppläsning, genvägar på
fysisk Windows/macOS, pekning på iPhone/iPad, kontrast i båda teman och 200/400
procents zoom återstår. Inget intyg om fullständig WCAG-överensstämmelse ges.

### YTA-13: samtalshjälpens macOS-text före medgivande

**Syfte:** Läsa rätt tangentkombination och hjälpens innehåll utan att starta
samtal eller mikrofon, samt återfå fokus vid stängning.

**Användare:** Alex.

**Förutsättningar:** Börja med tomt utkast utan pågående samtal eller sparat
medgivande vid 1280 × 720. Använd macOS-plattformsnamnet i den kontrollerade
webbläsaren. Fysisk kollision bedöms i YTA-15.

**Automatiskt motsvarande webbläsartest:**
[conversation-help.test.tsx](../../tests/browser/conversation-help.test.tsx),
YTA-13.
Chromium visar produktens hjälpyta genom kartans publika hjälpknapp
med produktens stilmall och kontrollerade lässvar. Det provar inte beständigt
sparande eller återkallande mot servern.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/conversation-help.test.tsx",
    "caseId": "YTA-13"
  },
  "reference": "Chromium 1280 × 720; MacIntel-plattformsnamn, produktens hjälpyta och stilmall, kontrollerade lässvar utan samtalsstart. Full serverkedja finns i YTA-07; första macOS-genvägen i MIKROFONTRYCK-09.",
  "outcomes": [
    "Hjälpen visar Ctrl+Skift+Mellanslag och hela förklaringen av samma samtal, kartans tecken, medgivande, datavillkor och formuläralternativ.",
    "Läsning startar inget samtal eller mikrofon. Rubriken får fokus och båda stängningssätten återför det till hjälpknappen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Nå **Information och hjälp** med tangentbord och öppna med Enter. Kräv
   fokus på rubriken. Läs samma innehåll som i YTA-07:s steg 1–3, inklusive
   **Ctrl+Skift+Mellanslag**, kort och långt tryck, formuläralternativ,
   förlustvarning, sparbesked och OpenAI:s begränsningar. Läs datavillkorslänken.
2. Stäng med Escape och kräv fokus på hjälpknappen.
3. Öppna med hjälpknappen igen och välj **Stäng verktyget**. Kräv att hjälpen
   stängs och fokus återgår till hjälpknappen.

**Förväntat resultat:**

- Hjälpen visar **Ctrl+Skift+Mellanslag** och samma förklaringar och
  datavillkorslänk som YTA-07, utan gamla kontrollnamn eller teknisk jargong.
- Läsning startar inget samtal eller mikrofon. Rubriken får fokus och
  stängning med Escape eller knappen återför det till hjälpknappen.

**Avgränsning:** YTA-13 behåller sitt ID för macOS-hjälpen. Den upprepade
fullständiga formulär-, utkast-, samtals- och återkallandekedjan samlas i
YTA-07. Första macOS-genvägens medgivande och spärr mot inspelning före
medgivande finns i
[MIKROFONTRYCK-09](microphone-press.md#mikrofontryck-09-macos-tangentkombinationens-korta-och-långa-tryck).
Hela hjälpkedjan körs därmed inte längre oberoende på båda emulerade
plattformarna; dess gemensamma beteenden representeras av Windows/Linux.

### YTA-14: samtalshjälpens faktiska uppläsning

**Syfte:** Hör rubrikordning, kontrollnamn, innehåll och återgångsfokus med
riktiga NVDA/VoiceOver-kommandon.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Hör rubrikordning, kontrollnamn, innehåll och
återgångsfokus med riktiga NVDA/VoiceOver-kommandon.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Hör rubrikordning, kontrollnamn, innehåll och återgångsfokus med riktiga NVDA/VoiceOver-kommandon."
  },
  "reference": "NVDA/Chrome Windows och VoiceOver/Chrome macOS, iPhone och iPad.",
  "outcomes": [
    "Hjälpens rubriker, innehåll, kontroller och nästa handling hörs begripligt.",
    "Det faktiskt provade hjälpmedlet återför fokus logiskt."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Information och hjälp med hjälpmedlet innan samtalsmedgivande. Läs hela
   hjälpen och datavillkorslänken.
2. Stäng hjälpen, gör en formulärrättelse, granska utkastet, starta samtalet och
   återkalla medgivandet genom hjälptextens kontrollnamn.
3. Bedöm läsordning och fokus i smal vy, med textvyn öppen och efter stängning.

**Förväntat resultat:**

- Hjälpens rubriker, innehåll, kontroller och nästa handling hörs begripligt.
- Det faktiskt provade hjälpmedlet återför fokus logiskt.

### YTA-15: fysisk hjälpinmatning genvägar och zoom

**Syfte:** Bedöm verkliga Windows/macOS-genvägar, pekning på iPhone/iPad och
läsbarhet vid 200/400 procents zoom.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Bedöm verkliga Windows/macOS-genvägar, pekning
på iPhone/iPad och läsbarhet vid 200/400 procents zoom.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Bedöm verkliga Windows/macOS-genvägar, pekning på iPhone/iPad och läsbarhet vid 200/400 procents zoom."
  },
  "reference": "Fysiska stödplattformar; båda teman och verklig skärmförstoring.",
  "outcomes": [
    "Läsning, kort aktivering och nästa steg fungerar på faktiskt provad utrustning.",
    "Eventuella OS-/hjälpmedelskollisioner och hinder redovisas per plattform."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna hjälpen och följ formuläralternativet med fysisk inmatning. Bedöm långa
   stycken, fokus, kontrast och pekmål i båda teman.
2. På Windows/Linux använd Ctrl+Mellanslag; på macOS Ctrl+Skift+Mellanslag.
   Prova kort/långt tryck, även med meddelandefältet fokuserat och skärmläsaren
   aktiv.
3. Prova 200/400 procents zoom och fysisk telefon-/surfplattepekning. Läs till
   slutet, fäll verktygen och stäng/öppna hjälpen utan skymt fokus.

**Förväntat resultat:**

- Läsning, kort aktivering och nästa steg fungerar på faktiskt provad
  utrustning.
- Eventuella OS-/hjälpmedelskollisioner och hinder redovisas per plattform.

## Återhämtning

### YTA-04: laddning och misslyckad hämtning

**Syfte:** Förstå vad som händer och kunna försöka igen efter nätfel.

**Användare:** Alex.

**Förutsättningar:** Tomt provhushåll. Följ
[kontrollerad kartläsning](workspace-preparation.md#väntande-och-avvisad-kartläsning)
med håll före applikationen och avbruten leverans. Inloggningen fungerar.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
YTA-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-shell.spec.ts",
    "caseId": "YTA-04"
  },
  "reference": "Chromium, angivna mått och teman; syntetiskt samtal enligt separat förberedelse.",
  "outcomes": [
    "Verktyg, läsbart innehåll och fokus förblir tillgängliga i det angivna arbetsflödet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna hushållet med kartbegäran pausad. Läs laddningsbeskedet.
2. Avbryt begäran och kontrollera felmeddelandet.
3. Låt nästa läsning passera utan armering och välj **Hämta aktuellt underlag**.

**Förväntat resultat:**

- Verktygen och laddningsbeskedet finns medan kartan hämtas.
- Felet erbjuder en nästa handling. Efter nytt försök visas den tomma
  kartan.

Förlorad tillgång och avslutad mikrofon verifieras i
[bevarat hushållsarbete](household-work.md#arbete-03-återkallad-tillgång-avvecklar-oskickat-arbete).

### YTA-05: läsbart sparbesked på surfplatta

**Syfte:** Läsa sparresultatet och fortsätta arbeta med öppen arbetsyta.

**Användare:** Alex.

**Förutsättningar:** Tom karta på surfplatta i stående läge.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
YTA-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-shell.spec.ts",
    "caseId": "YTA-05"
  },
  "reference": "Chromium, angivna mått och teman; syntetiskt samtal enligt separat förberedelse.",
  "outcomes": [
    "Verktyg, läsbart innehåll och fokus förblir tillgängliga i det angivna arbetsflödet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Tabell** och **Nytt objekt**. Skriv
   **Familjens gemensamma cykel** och välj **Lägg i utkastet och stäng**.
2. Öppna **Skriv till Skyttel**, **Visa utkastet** och **Spara hela utkastet**.
   Läs **Utkastet är sparat** under hushållsnamnet.
3. Vänta tre sekunder tills sparbeskedet försvinner och välj **Karta**.

**Förväntat resultat:**

- Sparbeskedet är läsbart medan textvyn är öppen.
- Att beskedet försvinner ändrar inte det sparade innehållet. Cykeln finns
  kvar i kartan när kartvyn väljs igen.

### YTA-06: synliga visningsval på en tom mobilkarta

**Syfte:** Kontrollera att tangentbordsfokus, fullständiga etiketter och
verktygen är nåbara även på en tom karta.

**Användare:** Alex.

**Förutsättningar:**

- Börja i ett nytt tomt hushåll enligt den allmänna förberedelsen.
- Använd ett 320 pixlar brett webbläsarfönster i ljust tema med höjderna
  900, 568 och 451 pixlar. YTA-10 provar mörkt tema. Detta är fönstermått,
  inte ett prov på en fysisk telefon.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
YTA-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-shell.spec.ts",
    "caseId": "YTA-06"
  },
  "reference": "320 CSS-pixlars bredd, ljust tema och höjder 900, 568 och 451: nåbara kontroller på tom karta.",
  "outcomes": [
    "Verktyg, läsbart innehåll och fokus förblir tillgängliga i det angivna arbetsflödet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Använd tangentbordet på den tomma kartan för att fokusera **Återställ vy**
   och etikettikonen **Alla etiketter** i verktygsfältet. Kontrollera
   synligt fokus och läsbara namn för varje kontroll.
   Faktisk skärmläsaruppläsning prövas i YTA-11.
2. Öppna **Navigera** med tangentbordet. Rulla vid behov till
   **Visa höjdhjälp** under kameraknapparna. Hela etiketten ska synas.
   Reglaget ska vara av och inaktivt med texten
   **Välj ett objekt för att visa höjdhjälp**. Stäng navigeringen.
   Nå **Tabell** i verktygsfältet
   med tangentbordet och kontrollera att knappen syns.
3. När steg 1–2 utförts en gång vid varje angiven höjd, behåll 451 pixlars
   höjd. Öppna Tabell, välj **Nytt objekt**, skriv **Cykeln** och lägg i
   utkastet.
   Välj **Karta** och öppna **Navigera**. Höjdhjälpen ska
   fortfarande vara avstängd.
   Spara inte utkastet.

**Förväntat resultat:**

- Fokuserade visningskontroller förblir synliga och har begripliga namn.
- Verktygsfältets listknapp förblir användbar.
- Ett objektförslag ändrar inte höjdhjälpsvalet.
- Höjdhjälpens reglage finns i navigeringen och kräver ett objektval.
- Etikettikonen finns i verktygsfältet även i korta vyer.
  Växling och sparat val provas i KAMERA-06.

### YTA-09: den tomma kartan förblir användbar med röst och samtalsnotis

**Syfte:** Nå verktygsfältets listknapp när röstrutan eller en samtalsnotis
visas ovanför kartans visningsval, med hushållets status synlig.

**Användare:** Alex.

**Förutsättningar:** Den kontrollerade röstinstallationen enligt den allmänna
förberedelsen, med ett tomt hushåll och stängda arbetsytor. Använd ett
320 pixlar brett fönster med höjderna 900 och 568 pixlar.

**Separat operatörsförberedelse:** Följ den
[kontrollerade röstinstallationen](#allmän-förberedelse). Behåll
anslutningen medan användaren läser **Lyssnar**, den tomma kartans
status och tabellknappen vid både 900 och 568 pixlars höjd i steg 1–2.
Först därefter, före notisläsningen i steg 3, slår operatören på
**Offline** i webbläsarens nätverkspanel och bekräftar frånkopplingen.
Behåll frånkopplingen under båda höjdläsningarna med notisen. Före
**Tabell → Nytt objekt** i steg 4 slår operatören av **Offline** och
bekräftar återställd anslutning. Återställ även vid avbrutet prov och
avsluta installationen enligt den allmänna förberedelsen.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
YTA-09.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-shell.spec.ts",
    "caseId": "YTA-09"
  },
  "reference": "Chromium, angivna mått och teman; syntetiskt samtal enligt separat förberedelse.",
  "outcomes": [
    "Verktyg, läsbart innehåll och fokus förblir tillgängliga i det angivna arbetsflödet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Prata med Skyttel** och godkänn samtalsmedgivandet. Läs **Lyssnar**
   i röstrutan. Panorera med **Navigera**, stäng navigeringen och välj
   **Återställ vy**. Ingen beständig rutinbekräftelse ska visas i kartan.
2. Nå verktygsfältets **Tabell** med tangentbordet. Fokus och knappen ska synas
   och vara fria från röstrutan. Läs också den tomma kartans statusyta under
   hushållsnamnet. Kontrollera båda fönsterhöjderna före frånkopplingen.
3. Be operatören bryta anslutningen efter båda höjdläsningarna och invänta
   bekräftelse. Läs samtalsnotisen
   **Ingen kontakt med Skyttel. Mikrofonen är av.** och kontrollera samma
   tabellknapp vid båda höjderna.
4. Be operatören återställa anslutningen efter båda höjdläsningarna med
   notisen och invänta bekräftelse. Välj **Tabell** och sedan **Nytt objekt**.
   Formuläret med **Namn** ska gå att använda. Skapa inget objekt.

**Förväntat resultat:**

- Röstrutan och samtalsnotisen täcker inte verktygsfältets listknapp.
- Röstrutan eller notisen ligger ovanför visningsvalen och täcker inte
  hushållets statusyta under hushållsnamnet.
- Samtalet öppnar ingen arbetsyta automatiskt; listknappen öppnar formuläret
  när Alex väljer den. Installationen provar placering, inte hört tal.

### YTA-10: visningsval på tom karta i mörkt tema

**Syfte:** Kontroller och höjdhjälpsetikett förblir läsbara och nåbara i mörkt
tema.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som YTA-06.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts), YTA-10.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-shell.spec.ts",
    "caseId": "YTA-10"
  },
  "reference": "320 CSS-pixlars bredd, mörkt tema; höjder 900, 568 och 451 skyddar fokus, kontrast och fullständiga kontrollnamn.",
  "outcomes": [
    "Kontroller och höjdhjälpsetikett förblir läsbara och nåbara i mörkt tema.",
    "Förslaget ändrar inte höjdhjälpsvalet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj mörkt tema. Följ YTA-06 steg 1–2 en gång vid varje angiven höjd
   medan kartan fortfarande är tom.
2. Följ sedan YTA-06 steg 3 en gång vid 451 pixlars höjd.

**Förväntat resultat:**

- Kontroller och höjdhjälpsetikett förblir läsbara och nåbara i mörkt tema.
- Förslaget ändrar inte höjdhjälpsvalet.

### YTA-11: arbetsytans verkliga läsordning och status

**Syfte:** NVDA eller VoiceOver läser verktygens namn, hopplänkar, inaktiva
höjdhjälpen och det faktiska sparbeskedet med logisk fokusordning.

**Användare:** Alex enligt områdets förberedelse.

**Förutsättningar:** Faktisk NVDA eller VoiceOver, tomt provhushåll och
kontrollerad samtalstjänst.

**Kräver mänsklig observation:** NVDA eller VoiceOver läser verktygens namn,
hopplänkar, inaktiva höjdhjälpen och det faktiska sparbeskedet med logisk
fokusordning.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "NVDA eller VoiceOver läser verktygens namn, hopplänkar, inaktiva höjdhjälpen och det faktiska sparbeskedet med logisk fokusordning."
  },
  "reference": "Faktisk NVDA eller VoiceOver, tomt provhushåll och kontrollerad samtalstjänst.",
  "outcomes": [
    "NVDA eller VoiceOver läser verktygens namn, hopplänkar, inaktiva höjdhjälpen och det faktiska sparbeskedet med logisk fokusordning."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/workspace-shell.spec.ts",
      "caseId": "YTA-02",
      "purpose": "Kontrollerad webbläsarobservation; utför inte den faktiska mänskliga observationen."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/workspace-shell.spec.ts",
      "caseId": "YTA-06",
      "purpose": "Kontrollerad webbläsarobservation; utför inte den faktiska mänskliga observationen."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/workspace-shell.spec.ts",
      "caseId": "YTA-05",
      "purpose": "Kontrollerad webbläsarobservation; utför inte den faktiska mänskliga observationen."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ YTA-02 steg 1–5 och lyssna på hopplänkarnas namn.
2. Återställ. Följ YTA-06 steg 1–3 och lyssna på höjdhjälpens namn
   och inaktiva läge. Återställ igen och följ YTA-05 steg 1–3; lyssna
   på det sparade resultatet. Anteckna hjälpmedlets version.

**Förväntat resultat:**

- NVDA eller VoiceOver läser verktygens namn, hopplänkar, inaktiva höjdhjälpen
  och det faktiska sparbeskedet med logisk fokusordning.

### YTA-12: riktig zoom och fysisk arbetsyteinmatning

**Syfte:** Verklig 200 och 400 procents webbläsarzoom samt fysisk pekinmatning
på surfplatta lämnar formulär, hjälp, sparbesked och fortsatt arbete nåbara.

**Användare:** Alex enligt områdets förberedelse.

**Förutsättningar:** Dator med riktig webbläsarzoom och fysisk surfplatta;
använd påhittade uppgifter.

**Kräver mänsklig observation:** Verklig 200 och 400 procents webbläsarzoom samt
fysisk pekinmatning på surfplatta lämnar formulär, hjälp, sparbesked och
fortsatt arbete nåbara.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Verklig 200 och 400 procents webbläsarzoom samt fysisk pekinmatning på surfplatta lämnar formulär, hjälp, sparbesked och fortsatt arbete nåbara."
  },
  "reference": "Dator med riktig webbläsarzoom och fysisk surfplatta; använd påhittade uppgifter.",
  "outcomes": [
    "Verklig 200 och 400 procents webbläsarzoom samt fysisk pekinmatning på surfplatta lämnar formulär, hjälp, sparbesked och fortsatt arbete nåbara."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/workspace-shell.spec.ts",
      "caseId": "YTA-03",
      "purpose": "Kontrollerad webbläsarobservation; utför inte den faktiska mänskliga observationen."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/workspace-shell.spec.ts",
      "caseId": "YTA-05",
      "purpose": "Kontrollerad webbläsarobservation; utför inte den faktiska mänskliga observationen."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ YTA-03 steg 1–6 en gång vid varje riktig zoomnivå.
   Använd den vanliga HTTPS-provinstallationen från den fysiska förberedelsen
   i stället för grundfallets syntetiska röst-launcher. Under steg 4 öppnar
   du texten och det tomma utkastet; stanna före **Nytt samtal** och fortsätt
   med steg 5–6 fram till återfört fokus på hjälpknappen. Utelämna svaret,
   det oskickade samtalsmeddelandet och återläsningen efter samtalsstart.
   Faktisk samtalsstart hör till ett separat tjänsteprov.
2. Återställ. Följ YTA-05 steg 1–3 på en faktisk surfplatta med fysisk
   pekning. Anteckna zoom, CSS-mått, enhet och fokus separat från
   automatiserad geometri.

**Förväntat resultat:**

- Verklig 200 och 400 procents webbläsarzoom samt fysisk pekinmatning på
  surfplatta lämnar formulär, hjälp, sparbesked och fortsatt arbete nåbara.
