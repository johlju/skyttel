# Manuella testfall för mikrofontryck

Fallen omfattar kort och långt tryck på **Prata med Skyttel**, samma
styrning med tangentkombinationen, medgivandet och släpp på pekskärm.
Anteckna commit, webbläsare, operativsystem, enhet och godkänt eller
underkänt resultat. Redovisa riktiga enheter separat från Chromium-emulering.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Tryckprov och
  loggar in med Google i den kontrollerade installationen.
- Vid riktiga talprov används en behörig Skyttel-användare i ett separat
  provhushåll med enbart påhittade uppgifter.

## Allmän förberedelse

1. Starta [den kontrollerade kostnadsmiljön](costs.md#controlled-cost-fixture),
   logga in som Alex och skapa Tryckprov. Den kontrollerade miljön använder
   tysta mediespår och prövar inte verkligt ljud eller mikrofonens starttid.
2. För verkligt tal, använd i stället den isolerade miljön i
   [talprovsguiden](real-voice-tests.md) med serverns privata konfiguration.
   Använd Chrome på Windows, macOS, iPhone och iPad. Anteckna varje
   plattform separat. Riktiga leverantörsanrop kan kosta pengar.
3. Börja varje fall med omladdning. I fall 1, 3 och 4: starta med röst,
   godkänn medgivandet, vänta på **Lyssnar** och tryck kort på
   **Prata med Skyttel**, så att mikrofonen är av. Fall 2 börjar utan medgivande.
4. Avsluta den kontrollerade miljön med `quit`. Stäng privata
   vidarebefordringar och kontrollera att provkatalogen försvinner.

## Tryck på knappen

### MIKROFONTRYCK-01: kort och långt tryck styr samma mikrofon

**Syfte:** Tala medan knappen hålls och låta Skyttel svara efter släpp.

**Användare:** Alex eller användaren i det isolerade talprovet.

**Förutsättningar:** Ett samtal pågår och mikrofonen är av.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
testfallet “MIKROFONTRYCK-01: kort och långt tryck styr samma mikrofon och
släpp behåller svaret”.

**Steg:**

1. Håll nere **Prata med Skyttel** längre än 0,45 sekunder. Kontrollera
   ringen direkt vid trycket och att mikrofonens påläge följer.
2. I det riktiga talprovet: säg **Beskriv vad du kan göra**, flytta pekaren
   från knappen medan du håller och släpp. Lyssna på svaret.
3. Tryck kort för att slå på mikrofonen och kort igen för att stänga av.

**Förväntat resultat:**

- Långt tryck lyssnar medan knappen hålls. Att flytta pekaren från
  knappen stoppar inte lyssnandet. Släpp stänger av mikrofonen och tar
  bort ringen. Skyttels svar fortsätter med mikrofonen av.
- Kort tryck slår på och av samma mikrofon. Kort tryck räcker alltid.
- Det automatiska provet mäter mikrofonspårets läge, samma levande
  anslutning och mottaget ljuds aktivitet efter släpp. Faktiskt hört tal
  och starttid redovisas bara från det riktiga talprovet.

### MIKROFONTRYCK-02: långt tryck utan medgivande startar inget i förväg

**Syfte:** Ge samma medgivande vid långt och kort tryck utan förtida lyssnande.

**Användare:** Alex.

**Förutsättningar:** Inget medgivande är sparat eller godkänt för besöket.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
testfallet “MIKROFONTRYCK-02: ett långt tryck utan medgivande gör som ett
kort och startar inget i förväg”.

**Steg:**

1. Håll knappen i minst en halv sekund och släpp.
2. Läs medgivanderutan och välj **Avbryt**.

**Förväntat resultat:**

- Långt tryck gör samma sak som kort tryck: medgivanderutan visas utan
  att mikrofonen startar i förväg. **Avbryt** lämnar mikrofonen av och
  återger fokus till **Prata med Skyttel**.

## Tangentbord och pekskärm

### MIKROFONTRYCK-03: tangentkombinationen styr korta och långa tryck

**Syfte:** Göra samma arbete med tangentbordet på varje målplattform.

**Användare:** Alex eller användaren i det isolerade talprovet.

**Förutsättningar:** Ett samtal pågår och mikrofonen är av. Kör på riktigt
tangentbord i Chrome på Windows och macOS; Linux kan också provas.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
testfallet “MIKROFONTRYCK-03: tangentkombinationen har samma korta och
långa tryck”, med separata Windows/Linux- och macOS-fall.

**Steg:**

1. Läs knappens beskrivning med mus eller skärmläsare. På Windows/Linux
   ska den ange Ctrl+Mellanslag; på macOS Ctrl+Skift+Mellanslag.
2. Tryck tangentkombinationen kort två gånger. Kontrollera på och av.
3. Håll kombinationen längre än 0,45 sekunder, tala och släpp. Prova även
   att släppa Ctrl eller Skift före Mellanslag. Lyssna klart på svaret.
4. Prova när meddelandefältet har fokus och med NVDA respektive VoiceOver.
   Anteckna om operativsystem, webbläsare eller hjälpmedel tar kombinationen.

**Förväntat resultat:**

- Namnet är **Prata med Skyttel** och beskrivningen säger **Håll in för
  att tala tills du släpper.** med rätt tangentkombination. Under starten
  är beskrivningen **Avbryt starten av rösten**.
- Kort och långt tryck följer samma regel som knappen. Tangentupprepning
  startar inget extra tryck, och släpp stänger av efter långt tryck även
  om Ctrl eller Skift släpps först. Svaret fortsätter.
- Den automatiska plattformsemuleringen bevisar inte frånvaro av
  verkliga tangentkollisioner. Registrera en konstaterad kollision som
  ett separat ärende och anteckna plattformen.

### MIKROFONTRYCK-04: pektryck har ring och systemavbrott släpper mikrofonen

**Syfte:** Tala med ett finger utan menyer, textmarkering eller krav på långt tryck.

**Användare:** Användaren i det isolerade talprovet.

**Förutsättningar:** Mikrofonen är av. Kör Chrome på riktig iPhone och
iPad, även med minskad rörelse och VoiceOver.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
testfallet “MIKROFONTRYCK-04: pektryck har ring utan meny och
systemavbrott släpper mikrofonen”.

**Steg:**

1. Håll ett finger på mikrofonknappen, tala, glid från knappen utan att
   lyfta fingret och lyft sedan. Kontrollera mikrofonens läge och svaret.
2. Håll igen och avbryt genom att växla till en annan app eller låsa enheten.
   Återvänd till Skyttel och kontrollera mikrofonen.
3. Slå på minskad rörelse och upprepa. Aktivera VoiceOver och använd kort
   aktivering för att slå på och av i stället för att hålla.

**Förväntat resultat:**

- Ringen visas direkt, även med minskad rörelse. Ingen meny eller
  textmarkering öppnas av långt tryck. På pekskärm visas ingen
  knappbeskrivning som verktygstips.
- Lyssnandet fortsätter när fingret glider av. Släpp eller systemavbrott
  stänger av mikrofonen, och Skyttel arbetar med det som sades.
- Med VoiceOver räcker kort aktivering för samma arbete. Det finns
  alltid ett alternativ till att hålla.

## Tal under starten

### MIKROFONTRYCK-05: tal under starten förs över efter släpp utan ny inspelning

**Syfte:** Bevara början av det som sades under trycket när röstanslutningen dröjer.

**Användare:** Användaren i det isolerade talprovet.

**Förutsättningar:** Starta ett samtal med text och godkänn medgivandet.
Rösten är av. Välj långsamt nätverk i webbläsarens utvecklarverktyg så att
röstens start tar minst två sekunder. Använd påhittade uppgifter.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
testfallet “MIKROFONTRYCK-05: tal under starten förs över efter släpp utan
ny inspelning”.

**Steg:**

1. Håll **Prata med Skyttel**. Efter en halv sekund, säg **Beskriv vad
   du kan göra** medan rösten fortfarande startar.
2. Släpp före färdig anslutning. Kontrollera att mikrofonen stängs av.
   Säg sedan **Detta ska inte spelas in** med mikrofonen av.
3. Återställ nätverkshastigheten och lyssna på svaret. Kontrollera
   samtalstexten. Tryck sedan kort för att börja tala igen.

**Förväntat resultat:**

- Mikrofonen lyssnar efter tröskeln medan trycket hålls, med godkänt
  medgivande och fungerande ljuduppspelning. Början av det som sades
  under starten följer med när anslutningen är färdig.
- Släpp stänger av ny inspelning direkt. Det tidigare inspelade talet
  kan fortfarande överföras och besvaras efter släpp. Orden som sägs
  efter släpp ska inte komma med. Nytt kort tryck börjar lyssna igen.
- Automatiken mäter verklig PCM i det utgående mediespåret: en ton från
  trycket ska komma fram efter anslutning, medan en annan ton från tiden
  efter släpp inte får komma fram. Mikrofonspårets tidsstämplar ska inte
  visa någon ny aktivering efter släpp. Det ersätter inte riktiga talprov.

### MIKROFONTRYCK-06: avbruten start kasserar inspelningen inför nästa start

**Syfte:** Förhindra att tal från en avbruten start återkommer senare.

**Användare:** Användaren i det isolerade talprovet.

**Förutsättningar:** Samma långsamma nätverk och textstart som i fall 5.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
testfallet “MIKROFONTRYCK-06: avbruten start kasserar inspelningen inför
nästa start”.

**Steg:**

1. Håll mikrofonknappen och säg **Notera färgen violett** efter tröskeln.
2. Släpp medan rösten startar. Tryck kort igen för att avbryta starten.
3. Återställ nätverket. Starta rösten igen med kort tryck och säg
   **Beskriv vad du kan göra**.

**Förväntat resultat:**

- Avbrottet stänger mikrofonen och kasserar väntande tal från starten.
- Den nya starten ska inte spela upp, överföra eller skriva in det
  tidigare yttrandet. Automatiken mäter olika ljudtoner i det utgående
  mediespåret och kontrollerar att gamla mikrofonspår har avslutats.

### MIKROFONTRYCK-07: spärrat ljud ger ingen inspelning

**Syfte:** Kräva fungerande uppspelning före inspelning och respektera släpp.

**Användare:** Alex.

**Förutsättningar:** Starta den
[kontrollerade röstmiljön](voice-assistant.md#controlled-voice-fixture),
logga in, skapa Tryckprov och starta samtalet med text. Följ miljöns
[ljudkontroller](voice-assistant.md#browser-transport-and-audio-controls)
för att sätta `setPlayback('blocked')` före trycket.

**Integrationstest:**
[microphone-press.spec.ts](../../tests/integration/microphone-press.spec.ts),
testfallet “MIKROFONTRYCK-07: spärrat ljud ger ingen inspelning och
ljudstart efter släpp lämnar mikrofonen av”.

**Steg:**

1. Håll mikrofonknappen längre än tröskeln. Läs beskedet om spärrat ljud.
2. Släpp. Sätt uppspelningen till `allow` enligt ljudkontrollerna och
   välj **Spela upp ljud**.
3. Kontrollera mikrofonen. Avsluta provmiljön enligt startguiden.

**Förväntat resultat:**

- Mikrofonen spelar inte in medan uppspelningen är spärrad.
- Att tillåta ljud efter släpp lämnar mikrofonen av och skickar inget
  tidigare tal. Automatiken mäter mikrofonspår och det utgående ljudet;
  den kontrollerade miljön verifierar inte faktiskt hört tal.

## Tillgänglighetsbedömning

Designmålen omfattar tangentbord och inga tangentbordsfällor (WCAG 2.1.1,
2.1.2), alternativ till gester och tidskrav (2.5.1, 2.5.6, 2.2.1),
pekaravbrott (2.5.2), etikett i namn (2.5.3), fokus och pekmål (2.4.7,
2.5.8) samt kontrollens namn och läge (4.1.2). Automatiken kontrollerar
kort och långt tryck, tangentupprepning, förlorat fokus, pekfångst,
systemavbrott, ring och beskrivningar. Minskad rörelse får ingen animerad
ring. Verifiera riktiga gester, fokus, tangentkollisioner och VoiceOver/
NVDA på målplattformarna. Dessa prov är nödvändiga för bedömningen;
automatiska tester är ingen fullständig WCAG-verifiering.
