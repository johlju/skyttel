# Manuella testfall för mikrofontryck

Fallen omfattar kort och långt tryck på **Prata med Skyttel**, samma styrning
med tangentkombinationen, medgivandet och släpp på pekskärm. Anteckna commit,
webbläsare, operativsystem, enhet och godkänt eller underkänt resultat. Redovisa
riktiga enheter separat från Chromium-emulering.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Tryckprov och loggar
  in med Google i den kontrollerade installationen.
- Vid riktiga talprov används en behörig Skyttel-användare i ett separat
  provhushåll med enbart påhittade uppgifter.

## Allmän förberedelse

1. Starta
   [den kontrollerade röstinstallationen](voice-assistant.md#controlled-voice-fixture)
   , logga in som Alex och skapa Tryckprov. Den kontrollerade miljön använder
   tysta mediespår och prövar inte verkligt ljud eller mikrofonens starttid.
2. För verkligt tal, följ i stället
   [förberedelsen i TAL-17](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
   med separat provdatabas, privat leverantörsnyckel och fysisk mikrofon. Använd
   Chrome på Windows, macOS, iPhone och iPad. Anteckna varje plattform separat.
   Riktiga leverantörsanrop kan kosta pengar. Det separata automatiska
   [WAV-provet](real-voice-tests.md) använder inspelat tal och ersätter mikrofon
   och inloggning; det förbereder inte ett prov med fysisk mikrofon eller
   skärmläsare.
3. Börja varje fall med omladdning. I fall 1, 3 och 4: starta med röst, godkänn
   medgivandet, vänta på **Lyssnar** och tryck kort på **Prata med Skyttel**,
   så att mikrofonen är av. Fall 2 börjar utan medgivande.
4. Avsluta den kontrollerade miljön med `quit`. Stäng privata
   vidarebefordringar och kontrollera att provkatalogen försvinner.

## Tryck på knappen

### MIKROFONTRYCK-01: kort och långt tryck styr samma mikrofon

**Syfte:** Tala medan knappen hålls och låta Skyttel svara efter släpp.

**Användare:** Alex eller användaren i det isolerade talprovet.

**Förutsättningar:** Ett samtal pågår och mikrofonen är av.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
MIKROFONTRYCK-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/microphone-press.spec.ts",
    "caseId": "MIKROFONTRYCK-01"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Tala medan knappen hålls och låta Skyttel svara efter släpp."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Håll nere **Prata med Skyttel** längre än 0,45 sekunder. Kontrollera ringen
   direkt vid trycket och att mikrofonens påläge följer.
2. Flytta pekaren från knappen medan du håller och släpp. Låt förberedelsen ge
   inkommande ljudaktivitet; läs Skyttel talar medan mikrofonen är av.
3. Tryck kort för att slå på mikrofonen och kort igen för att stänga av.

**Förväntat resultat:**

- Långt tryck lyssnar medan knappen hålls. Att flytta pekaren från knappen
  stoppar inte lyssnandet. Släpp stänger av mikrofonen och tar bort ringen.
  Skyttels svar fortsätter med mikrofonen av.
- Kort tryck slår på och av samma mikrofon. Kort tryck räcker alltid.
- Det automatiska provet mäter mikrofonspårets läge, samma levande anslutning
  och mottaget ljuds aktivitet efter släpp. Faktiskt hört tal och starttid
  redovisas bara från det riktiga talprovet.

### MIKROFONTRYCK-02: långt tryck utan medgivande startar inget i förväg

**Syfte:** Ge samma medgivande vid långt och kort tryck utan förtida lyssnande.

**Användare:** Alex.

**Förutsättningar:** Inget medgivande är sparat eller godkänt för besöket.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
MIKROFONTRYCK-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/microphone-press.spec.ts",
    "caseId": "MIKROFONTRYCK-02"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Ge samma medgivande vid långt och kort tryck utan förtida lyssnande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Håll knappen i minst en halv sekund och släpp.
2. Läs medgivanderutan och välj **Avbryt**.

**Förväntat resultat:**

- Långt tryck gör samma sak som kort tryck: medgivanderutan visas utan att
  mikrofonen startar i förväg. **Avbryt** lämnar mikrofonen av och återger fokus
  till **Prata med Skyttel**.

## Tangentbord och pekskärm

### MIKROFONTRYCK-03: tangentkombinationen styr korta och långa tryck

**Syfte:** Göra samma arbete med tangentbordet på varje målplattform.

**Användare:** Alex eller användaren i det isolerade talprovet.

**Förutsättningar:** Ett samtal pågår och mikrofonen är av. Använd datorfönster
och Windows/Linux-plattformsnamn; macOS-emulering har MIKROFONTRYCK-09. Verkliga
genvägskollisioner hör till MIKROFONTRYCK-10.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
MIKROFONTRYCK-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/microphone-press.spec.ts",
    "caseId": "MIKROFONTRYCK-03"
  },
  "reference": "Chromium med kontrollerat Windows/Linux-plattformsnamn; Ctrl+Mellanslag.",
  "outcomes": [
    "Göra samma arbete med tangentbordet på varje målplattform."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Läs knappens beskrivning med mus eller skärmläsare. I detta fall ska den ange
   Ctrl+Mellanslag.
2. Tryck tangentkombinationen kort två gånger. Kontrollera på och av.
3. Håll kombinationen längre än 0,45 sekunder, släpp efter påslaget läge. Prova
   även att släppa Ctrl eller Skift före Mellanslag. Kontrollera mikrofonens
   avläge.
4. Kontrollera att upprepad Mellanslag-tangent medan kombinationen hålls inte
   skapar ett nytt kort tryck. Faktisk inmatning och hjälpmedelskollisioner hör
   till MIKROFONTRYCK-10.

**Förväntat resultat:**

- Namnet är **Prata med Skyttel** och beskrivningen säger
  **Håll in för att tala tills du släpper.** med rätt tangentkombination. Under
  starten är beskrivningen **Avbryt starten av rösten**.
- Kort och långt tryck följer samma regel som knappen. Tangentupprepning startar
  inget extra tryck, och släpp stänger av efter långt tryck även om Ctrl eller
  Skift släpps först. Svaret fortsätter.
- Den automatiska plattformsemuleringen bevisar inte frånvaro av verkliga
  tangentkollisioner. Registrera en konstaterad kollision som ett separat ärende
  och anteckna plattformen.

### MIKROFONTRYCK-04: pektryck har ring och systemavbrott släpper mikrofonen

**Syfte:** Tala med ett finger utan menyer, textmarkering eller krav på långt
tryck.

**Användare:** Användaren i det isolerade talprovet.

**Förutsättningar:** Mikrofonen är av. Använd den kontrollerade webbläsaren vid
820 × 1180 med pekskärmemulering och minskad rörelse. Fysisk pekning och
systemavbrott hör till MIKROFONTRYCK-11.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
MIKROFONTRYCK-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/microphone-press.spec.ts",
    "caseId": "MIKROFONTRYCK-04"
  },
  "reference": "Chromium, 820 × 1180, syntetiska pekhändelser, minskad rörelse.",
  "outcomes": [
    "Tala med ett finger utan menyer, textmarkering eller krav på långt tryck."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Håll ett finger på mikrofonknappen, glid från knappen utan att lyfta fingret
   och lyft sedan. Kontrollera mikrofonens läge och svaret.
2. Håll igen och låt förberedelsens syntetiska pekavbrott stoppa
   trycket enligt
   [pekavbrottets förberedelse](voice-controls-preparation.md#pekavbrott-och-kvarvarande-svar).
   Återvänd till Skyttel och kontrollera mikrofonen.
3. Med minskad rörelse kvar, tryck kort för att slå på och
   kort igen för att stänga av. Verklig VoiceOver-aktivering hör till
   MIKROFONTRYCK-11.

**Förväntat resultat:**

- Ringen visas direkt, även med minskad rörelse. Ingen meny eller textmarkering
  öppnas av långt tryck. På pekskärm visas ingen knappbeskrivning som
  verktygstips.
- Lyssnandet fortsätter när fingret glider av. Släpp eller systemavbrott stänger
  av mikrofonen, och Skyttel arbetar med det som sades.
- Kort kontrollerad pekaktivering räcker; faktisk VoiceOver provas i
  MIKROFONTRYCK-11. Det finns alltid ett
  alternativ till att hålla.

## Tal under starten

### MIKROFONTRYCK-05: tal under starten förs över efter släpp utan ny inspelning

**Syfte:** Bevara början av det ljud som fångades under trycket när
röstanslutningen dröjer.

**Användare:** Användaren i det isolerade talprovet.

**Förutsättningar:** Följ
[väntande start och syntetiska toner](voice-controls-preparation.md#väntande-start-och-syntetiska-toner)
för MIKROFONTRYCK-05. Förberedelsen styr exakt rätt fördröjda begäran före
starten, toner
och återställning; verkligt tal provas i MIKROFONTRYCK-12.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
MIKROFONTRYCK-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/microphone-press.spec.ts",
    "caseId": "MIKROFONTRYCK-05"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Bevara början av det ljud som fångades under trycket när röstanslutningen dröjer."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Håll Prata med Skyttel tills påläget visar att lyssnandet har börjat. Låt
   förberedelsen hålla själva röstanslutningen och ge första syntetiska tonen.
2. Släpp före färdig anslutning. Kräv mikrofon av. Förberedelsen ger den andra
   tonen först efter släpp och släpper sedan den väntande starten.
3. Kontrollera fortsatt avläge och fungerande samtal. Slå själv på mikrofonen
   med ett kort tryck och stäng av igen. Tidigare fångat ljud och nytt ljud
   skiljs tekniskt enligt förberedelsen.

**Förväntat resultat:**

- Mikrofonen lyssnar efter tröskeln medan trycket hålls, med godkänt medgivande
  och fungerande ljuduppspelning. Början av det ljud som fångades under starten
  följer med när anslutningen är färdig.
- Släpp stänger av ny inspelning direkt. Det tidigare inspelade talet kan
  fortfarande överföras och besvaras efter släpp. Ljudet som ges efter släpp ska
  inte komma med. Nytt kort tryck börjar lyssna igen.
- Automatiken mäter verklig PCM i det utgående mediespåret: en ton från trycket
  ska komma fram efter anslutning, medan en annan ton från tiden efter släpp
  inte får komma fram. Mikrofonspårets tidsstämplar ska inte visa någon ny
  aktivering efter släpp. Det ersätter inte riktiga talprov.

### MIKROFONTRYCK-06: avbruten start kasserar inspelningen inför nästa start

**Syfte:** Förhindra att tal från en avbruten start återkommer senare.

**Användare:** Användaren i det isolerade talprovet.

**Förutsättningar:** Följ
[väntande start och syntetiska toner](voice-controls-preparation.md#väntande-start-och-syntetiska-toner)
för MIKROFONTRYCK-06. Förberedelsen styr exakt rätt fördröjda begäran före
starten, toner
och återställning; verkligt tal provas i MIKROFONTRYCK-12.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
MIKROFONTRYCK-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/microphone-press.spec.ts",
    "caseId": "MIKROFONTRYCK-06"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Förhindra att tal från en avbruten start återkommer senare."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Håll Prata med Skyttel medan den förberedda samtalsstarten väntar och ger
   första syntetiska tonen.
2. Släpp och tryck kort igen för att avbryta starten. Kräv mikrofon av och
   avslutad Rösten startar.
3. Låt förberedelsen släppa den gamla starten, återställ den och starta
   uttryckligen igen. Den nya syntetiska tonen ska fungera; den gamla ska vara
   kasserad.

**Förväntat resultat:**

- Avbrottet stänger mikrofonen och kasserar väntande tal från starten.
- Den nya starten ska inte spela upp, överföra eller skriva in det tidigare
  yttrandet. Automatiken mäter olika ljudtoner i det utgående mediespåret och
  kontrollerar att gamla mikrofonspår har avslutats.

### MIKROFONTRYCK-07: spärrat ljud ger ingen inspelning

**Syfte:** Kräva fungerande uppspelning före inspelning och respektera släpp.

**Användare:** Alex.

**Förutsättningar:** Starta den
[kontrollerade röstmiljön](voice-assistant.md#controlled-voice-fixture), logga
in, skapa Tryckprov och starta samtalet med text. Följ miljöns
[ljudkontroller](voice-assistant.md#browser-transport-and-audio-controls) för
att sätta `setPlayback('blocked')` före trycket.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
MIKROFONTRYCK-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/microphone-press.spec.ts",
    "caseId": "MIKROFONTRYCK-07"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Kräva fungerande uppspelning före inspelning och respektera släpp."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Håll mikrofonknappen längre än tröskeln. Läs beskedet om spärrat ljud.
2. Släpp. Sätt uppspelningen till `allow` enligt ljudkontrollerna och välj
   **Starta ljudet**.
3. Kontrollera mikrofonen. Avsluta provmiljön enligt startguiden.

**Förväntat resultat:**

- Mikrofonen spelar inte in medan uppspelningen är spärrad.
- Att tillåta ljud efter släpp lämnar mikrofonen av och skickar inget tidigare
  tal. Automatiken mäter mikrofonspår och det utgående ljudet; den kontrollerade
  miljön verifierar inte faktiskt hört tal.

### MIKROFONTRYCK-08: nytt samtal behåller mikrofonens läge efter väntande tal

**Syfte:** Bevara samma godkända mikrofon när den nya anslutningen tar över.

**Användare:** Användaren i det isolerade talprovet.

**Förutsättningar:** Följ
[väntande start och syntetiska toner](voice-controls-preparation.md#väntande-start-och-syntetiska-toner)
för MIKROFONTRYCK-08. Förberedelsen styr exakt rätt fördröjda begäran före
starten, toner
och återställning; verkligt tal provas i MIKROFONTRYCK-12.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
MIKROFONTRYCK-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/microphone-press.spec.ts",
    "caseId": "MIKROFONTRYCK-08"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Bevara samma godkända mikrofon när den nya anslutningen tar över."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Håll mikrofonen medan starten fångar den förberedda första tonen. Släpp och
   låt tidigare fångat ljud överföras enligt förberedelsen.
2. Slå på mikrofonen med kort tryck och stäng textvyn. Välj plusknappen
   **Nytt samtal** vid röstrutan. Den nya anslutningen
   ska behålla mikrofonen på. Startoperatören kontrollerar fortsatt
   ljudöverföring.
3. Slå av mikrofonen, öppna textvyn och välj **Nytt samtal** igen.
   Mikrofonen ska förbli av utan ny
   tillståndsfråga.

**Förväntat resultat:**

- Nytt samtal behåller samma mikrofon och dess på- eller avläge. Ett tidigare
  avstängt läge blir inte på av sig självt.
- Ingen ny tillåtelse för mikrofonen begärs. Automatiken kontrollerar ett enda
  mikrofonanrop, ett levande spår och en ny ensam anslutning för varje nytt
  samtal. Lyssnandet fungerar också efter övertagandet.

## Tillgänglighetsbedömning

Designmålen omfattar tangentbord och inga tangentbordsfällor (WCAG 2.1.1,
2.1.2), alternativ till gester och tidskrav (2.5.1, 2.5.6, 2.2.1), pekaravbrott
(2.5.2), etikett i namn (2.5.3), fokus och pekmål (2.4.7, 2.5.8) samt
kontrollens namn och läge (4.1.2). Automatiken kontrollerar kort och långt
tryck, tangentupprepning, förlorat fokus, pekfångst, systemavbrott, ring och
beskrivningar. Minskad rörelse får ingen animerad ring. Verifiera riktiga
gester, fokus, tangentkollisioner och VoiceOver/ NVDA på målplattformarna. Dessa
prov är nödvändiga för bedömningen; automatiska tester är ingen fullständig
WCAG-verifiering.

## Separata inmatningsfall

### MIKROFONTRYCK-09: macOS-tangentkombinationens korta och långa tryck

**Syfte:** Ge medgivande via första tangentkombinationen utan förtida
inspelning, och styra samma mikrofon med korta och långa tryck.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Inget samtal pågår och inget
medgivande är sparat. Använd Ctrl+Skift+Mellanslag vid alla stegen. Släpp även
Skift före Mellanslag vid det sista långa trycket.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
MIKROFONTRYCK-09.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/microphone-press.spec.ts",
    "caseId": "MIKROFONTRYCK-09"
  },
  "reference": "Chromium, MacIntel-plattformsnamn; Ctrl+Skift+Mellanslag från första medgivandet, med kontrollerad röst. Ingen inspelning eller röstanslutning före medgivandet.",
  "outcomes": [
    "Första tangentkombinationen visar medgivandet efter släpp utan att starta mikrofonen i förväg.",
    "Kort och långt tryck styr samma mikrofon; tangentupprepning skapar inget extra tryck.",
    "Släpp lämnar mikrofonen av även om Ctrl- och Skift-tangenterna släpps först."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Tryck Ctrl+Skift+Mellanslag kort. Kräv medgivanderutan utan startad
   mikrofon. Läs att släpp stänger av ny inspelning direkt. Välj **Avbryt**
   och kräv fokus på mikrofonknappen. Håll sedan Ctrl+Skift+Mellanslag
   längre än 0,45 sekunder. Kräv att inget
   medgivande visas medan kombinationen hålls och att mikrofonen inte startar.
   Släpp Mellanslag, Skift och Ctrl. Kräv medgivanderutan och läs att släpp
   stänger av ny inspelning direkt. Mikrofonen ska fortfarande inte spela in.
2. Markera **Fråga inte igen för det här hushållet** och välj
   **Godkänn och starta**. Kräv påslagen mikrofon och stäng sedan av den.
3. Utför
   [MIKROFONTRYCK-03](#mikrofontryck-03-tangentkombinationen-styr-korta-och-långa-tryck)
   steg 1–4 en gång med ovanstående tangentkombination. Upprepa inte
   basfallets start först. Släpp Ctrl och Skift före Mellanslag i det sista
   långa trycket.

**Förväntat resultat:**

- Kort och långt tryck styr samma mikrofon; tangentupprepning skapar inget extra
  tryck.
- Släpp lämnar mikrofonen av även om Ctrl- och Skift-tangenterna släpps först.
- Första genvägen öppnar medgivandet efter släpp. Inget mikrofonanrop eller
  röstanslutning sker före godkännandet. Efter godkännandet används samma enda
  mikrofonspår vid de korta och långa trycken.

### MIKROFONTRYCK-10: fysiska tangentkombinationer och hjälpmedelskollisioner

**Syfte:** Prova riktiga Ctrl+Mellanslag och Ctrl+Skift+Mellanslag,
tangentupprepning och ordning på släpp med OS och skärmläsare.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Prova riktiga Ctrl+Mellanslag och
Ctrl+Skift+Mellanslag, tangentupprepning och ordning på släpp med OS och
skärmläsare.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Prova riktiga Ctrl+Mellanslag och Ctrl+Skift+Mellanslag, tangentupprepning och ordning på släpp med OS och skärmläsare."
  },
  "reference": "Windows/Linux och macOS med fysiskt tangentbord; NVDA/VoiceOver.",
  "outcomes": [
    "Riktigt tryck/släpp ger valt mikrofonläge utan oavsiktlig återstart.",
    "Faktiska tangentkollisioner och fortsatt hört svar bedöms separat."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta ett riktigt samtal och slå av mikrofonen. Prova kort och långt tryck
   med plattformens angivna kombination.
2. Tala medan du håller, släpp och lyssna på svaret. Prova modifierare först och
   upprepad Mellanslag utan extra växling.
3. Upprepa med Meddelande till Skyttel fokuserat och hjälpmedlet aktivt.
   Anteckna eventuella OS-/hjälpmedelskollisioner.

**Förväntat resultat:**

- Riktigt tryck/släpp ger valt mikrofonläge utan oavsiktlig återstart.
- Faktiska tangentkollisioner och fortsatt hört svar bedöms separat.

### MIKROFONTRYCK-11: fysisk pekning systemavbrott och VoiceOver

**Syfte:** Håll, glid, släpp, lås eller växla app på riktig telefon/surfplatta
och bedöm den faktiska mikrofonens avslag.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Håll, glid, släpp, lås eller växla app på
riktig telefon/surfplatta och bedöm den faktiska mikrofonens avslag.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Håll, glid, släpp, lås eller växla app på riktig telefon/surfplatta och bedöm den faktiska mikrofonens avslag."
  },
  "reference": "iPhone/iPad, fysisk pekning, VoiceOver och faktisk minskad rörelse.",
  "outcomes": [
    "Släpp och riktigt systemavbrott stoppar ny inspelning.",
    "Ingen oönskad meny eller textmarkering hindrar arbetet; kort aktivering fungerar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Håll ett finger på mikrofonknappen, tala och glid av utan att lyfta. Lyft och
   lyssna på det tidigare talets svar.
2. Håll igen och växla app eller lås enheten. Återvänd och kontrollera
   mikrofonen och nästa möjliga handling.
3. Upprepa med minskad rörelse och VoiceOver. Använd kort aktivering som
   alternativ till att hålla.

**Förväntat resultat:**

- Släpp och riktigt systemavbrott stoppar ny inspelning.
- Ingen oönskad meny eller textmarkering hindrar arbetet; kort aktivering
  fungerar.

### MIKROFONTRYCK-12: faktiskt tal vid fördröjd och avbruten start

**Syfte:** Hör och bedöm vilka riktiga ord som fångades före släpp respektive
efter avslag och avbruten start.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Hör och bedöm vilka riktiga ord som fångades
före släpp respektive efter avslag och avbruten start.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-microphone-audio",
    "observation": "Hör och bedöm vilka riktiga ord som fångades före släpp respektive efter avslag och avbruten start."
  },
  "reference": "Riktig mikrofon/ljudutgång, nåbar HTTPS och verklig röstleverantör.",
  "outcomes": [
    "Tidigare fångat tal kan besvaras efter släpp utan ny inspelning.",
    "Tal efter avslag och tal från avbruten start når inte det fortsatta samtalet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta textsamtalet. Använd kontrollerat långsamt nätverk för minst två
   sekunders röststart, håll mikrofonen och säg Beskriv vad du kan göra efter
   påläget.
2. Släpp före färdig anslutning och säg Detta ska inte spelas in. Återställ
   nätverket och lyssna/läs vilka ord som faktiskt når samtalet.
3. I ett nytt prov, säg Notera färgen violett under väntande start, släpp och
   avbryt starten. Återställ, starta igen och säg ett nytt provord. Det avbrutna
   yttrandet får inte återkomma.
4. Prova även Nytt samtal med mikrofonen först på och sedan av. Anteckna prompt,
   faktiskt ljud och mikrofonläge.

**Förväntat resultat:**

- Tidigare fångat tal kan besvaras efter släpp utan ny inspelning.
- Tal efter avslag och tal från avbruten start når inte det fortsatta samtalet.
