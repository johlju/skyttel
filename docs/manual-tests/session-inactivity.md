# Manuella testfall för inaktivitet och förvarning

Fallen omfattar vanlig inloggning, aktivitet i flera flikar, kvarliggande
förvarning och besked vid utgång. Anteckna commit, webbläsare, bredd och
godkänt eller underkänt resultat vid faktisk manuell körning.

Automationen använder verklig HTTP, SQLite, kakor och produktgränssnitt
med syntetisk identitetsleverantör och kontrollerbar servertid. Den
ersätter inte observation med skärmläsare, fysisk mikrofon eller ljud.
Körbevis för dessa mänskliga observationer saknas; INAK-04 och INAK-05
är kvarstående leveranskrav. Fullständig WCAG-överensstämmelse påstås inte.

## Konfigurerade användare

- Alex Exempel är första administratör och loggar in med Google utan
  **Kom ihåg mig**. För INAK-01 till INAK-04 saknas hushåll, så att
  formuläret **Skapa ditt hushåll** visas.
- För INAK-05 har Alex ett disponibelt hushåll och giltigt
  samtalsmedgivande i en separat godkänd röstinstallation.

## Allmän förberedelse

1. Bygg med `npm run build`. Starta en disponibel identitetsinstallation:

   ```bash
   npm run test:env -- tsx scripts/manual-access.ts --https
   ```

2. Öppna den utskrivna adressen och tillåt testcertifikatet enligt den
   isolerade miljöns rutiner. Använd samma webbläsarkontext i båda flikarna.
3. Terminalkommandot `advance-minutes 25` flyttar bara testinstallationens
   serverklocka. Tillåtna värden är heltal 1–480. Fokus, läsning och
   bakgrundshämtningar ska inte förlänga inloggningen. Kommandot ger inget
   bevis för verklig väntetid eller driftens klocka.
4. Starta om testinstallationen med ny tom databas mellan fallen. Använd
   en ny webbläsarkontext eller rensa testadressens webbplatsdata. Avsluta
   med `quit`. Använd aldrig felverktyget med riktiga hushåll.

## Flikar och omflöde

### INAK-06: Sent kontrollsvar ändrar inte rätt besked vid utgång

**Syfte:** Kontrollera att samtidig uppdatering av sidan och ett fördröjt
kontrollsvar ger rätt orsak en gång.

**Användare:** Alex med ett disponibelt hushåll, vanlig inloggning.

**Förutsättningar:** Ny testinstallation enligt förberedelsen och ett
disponibelt hushåll och **Karta** öppen. Upprepa med bredd 1280, 390 och
320 CSS-pixlar i separata nya installationer.
Terminalen ska vara tillgänglig för testinstallationens felverktyg.

**Automatiskt motsvarande test:**
[session-inactivity.spec.ts](../../tests/integration/session-inactivity.spec.ts),
INAK-06. Kontrollsvaret fördröjs medan sidan får serverns aktuella besked.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/session-inactivity.spec.ts",
    "caseId": "INAK-06"
  },
  "reference": "1280, 390 och 320 pixlar, fördröjt kontrollsvar.",
  "outcomes": [
    "Inaktivitetsbeskedet visas en gång trots att ett kontrollsvar fortfarande väntar.",
    "Förvarningen försvinner före kontrollsvaret när inloggningen är utgången.",
    "Det fördröjda svaret ändrar inte orsaken eller återställer åtkomst.",
    "Kartverktygens fokus är synligt nedanför förvarningen."
  ]
}
```
-->

**Steg:**

1. Logga in, öppna **Karta** och placera tangentbordsfokus på knappen
   **Karta** i verktygen. Lämna fokus där utan att klicka eller skriva.
2. Kör `advance-minutes 25` i terminalen. Återvänd till fliken och
   kontrollera den kvarliggande förvarningen. Fokus ska vara kvar på
   **Karta** och hela knappen ska vara synlig nedanför beskedet.
3. Kör `hold-session-status` och sedan `advance-minutes 5`. Återvänd
   till fliken utan att skriva. Vänta på terminalens `session_status_held`.
4. Kontrollera att inloggningssidan visar **Du har varit inaktiv i 30
   minuter. Logga in igen.** utan ett föregående besked med annan orsak.
   Förvarningen om högst fem minuter ska försvinna samtidigt och inte
   lämna ett tomt utrymme ovanför sidan.
5. Kör `release-session-status`. Kontrollera att beskedet finns kvar en
   gång och att kartan inte återkommer utan ny inloggning.

**Förväntat resultat:** Serverns aktuella besked avgör orsaken även när
kontrollsvaret kommer senare. Förvarningen ersätts av utgångsbeskedet.
Inloggningen återupplivas inte.

### INAK-01: Dator visar förvarning och delar skrivaktivitet mellan flikar

**Syfte:** Skilja verklig skrivaktivitet från fokus och bakgrundsanrop.

**Användare:** Alex utan hushåll, vanlig inloggning.

**Förutsättningar:** Datorvy med bredd 1280 CSS-pixlar, två flikar med
samma inloggning och fältet **Hushållets namn** synligt i båda.

**Automatiskt motsvarande test:**
[session-inactivity.spec.ts](../../tests/integration/session-inactivity.spec.ts),
INAK-01. Syntetisk identitet, verkligt gränssnitt och server.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/session-inactivity.spec.ts",
    "caseId": "INAK-01"
  },
  "reference": "1280 pixlar och två flikar.",
  "outcomes": [
    "Förvarningen är kvarliggande, tillgänglig och flyttar inte fältets fokus.",
    "Skrivning i den andra fliken förnyar den gemensamma inaktivitetsperioden.",
    "Fokus och bakgrundshämtningar håller inte inloggningen aktiv.",
    "Inloggningen avslutas efter den nya perioden med ett enda korrekt besked."
  ]
}
```
-->

**Steg:**

1. Logga in utan **Kom ihåg mig**. Öppna samma startsida i en andra flik.
   Fokusera **Hushållets namn** i första fliken utan att skriva.
2. Kör `advance-minutes 25` i terminalen. Återgå till flikarna och invänta
   förvarningen. Kontrollera att första fältet behåller fokus.
3. Skriv **Hushållet Eken** i den andra fliken. Kontrollera att
   förvarningen försvinner i båda flikarna.
4. Kör `advance-minutes 5`. Kontrollera att första fliken fortfarande
   visar **Skapa ditt hushåll**. Flytta musen och läs utan att skriva.
5. Kör `advance-minutes 25` och invänta inloggningssidan.

**Förväntat resultat:**

- Förvarningen säger **Din inloggning går ut om högst fem minuter. Du
  behöver sedan logga in igen.** Ingen dialog eller fokusförflyttning
  inträffar. Text och kontroller ryms i vyn.
- Skrivning i den andra fliken gäller samma session. Den gamla
  inaktivitetsgränsen avslutar inte längre åtkomsten.
- Vid den nya gränsen visas **Du har varit inaktiv i 30 minuter. Logga in
  igen.** Beskedet meddelas en gång och ny inloggning krävs.

### INAK-02: Mobilvy behåller förvarning, fokus och gemensam aktivitet

**Syfte:** Kontrollera samma fullständiga flöde på smal mobilvy.

**Användare:** Alex enligt INAK-01.

**Förutsättningar:** Bredd 390 CSS-pixlar i båda flikarna.

**Automatiskt motsvarande test:**
[session-inactivity.spec.ts](../../tests/integration/session-inactivity.spec.ts),
INAK-02.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/session-inactivity.spec.ts",
    "caseId": "INAK-02"
  },
  "reference": "390 pixlar, samma flöde som INAK-01.",
  "outcomes": [
    "Förvarning och inloggningsbesked ryms utan horisontell sidskroll.",
    "Förvarningen flyttar inte fokus och aktivitet i den andra fliken gäller gemensamt.",
    "Den nya inaktivitetsgränsen visar korrekt besked en gång."
  ]
}
```
-->

**Steg:** Utför samtliga steg i INAK-01 med bredd 390 CSS-pixlar.

**Förväntat resultat:** Samma resultat som INAK-01. Hela förvarningen och
inloggningskontrollerna går att läsa utan horisontell sidskroll.

### INAK-03: Omflöde vid 320 CSS-pixlar bevarar hela inloggningsflödet

**Syfte:** Kontrollera omflöde när förvarningen kräver flera textrader.

**Användare:** Alex enligt INAK-01.

**Förutsättningar:** Bredd 320 CSS-pixlar i båda flikarna. Automationen
verifierar CSS-bredd, inte faktisk webbläsarzoom eller hjälpmedelsbeteende.

**Automatiskt motsvarande test:**
[session-inactivity.spec.ts](../../tests/integration/session-inactivity.spec.ts),
INAK-03.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/session-inactivity.spec.ts",
    "caseId": "INAK-03"
  },
  "reference": "320 pixlar, samma flöde som INAK-01.",
  "outcomes": [
    "Hela förvarningen och inloggningsbeskedet flödar om utan horisontell sidskroll.",
    "Fältets fokus bevaras och skrivning i den andra fliken förnyar rätt period.",
    "Utgången meddelas en gång med korrekt inaktivitetsorsak."
  ]
}
```
-->

**Steg:** Utför samtliga steg i INAK-01 med bredd 320 CSS-pixlar.

**Förväntat resultat:** Samma resultat som INAK-01. Förvarningen går att
läsa i sin helhet och täcker inte det fokuserade fältet.

## Mänsklig observation

### INAK-04: Skärmläsare meddelar förvarning och hinder en gång

**Syfte:** Kontrollera faktisk uppläsning och tangentbordsfokus genom
hela mobil- och datorflödet.

**Användare:** Alex i den disponibla identitetsinstallationen.

**Förutsättningar:** Skärmläsare och tangentbord på dator samt en stödd
mobil skärmläsare. Anteckna operativsystem, webbläsare och hjälpmedel.

**Kräver mänsklig observation:** Faktisk uppläsning av status och hinder,
bevarat fokus, läsordning och tillgång vid förstoring. Körbevis saknas.

<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Hör varningen och följ verkligt fokus på mobil och dator."
  },
  "reference": "Hjälpmedel på dator och mobil; körbevis saknas.",
  "outcomes": [
    "Förvarningen flyttar inte fokus och repeteras inte av bakgrundshämtningar.",
    "Utgången ger ett enda begripligt hinder och inloggningen går att nå med tangentbord."
  ]
}
```
-->

**Steg:**

1. Utför INAK-01 och INAK-02 med hjälpmedlet aktivt. Lyssna under minst tre
   bakgrundshämtningar när förvarningen visas.
2. Följ fokus när du skriver i den andra fliken och när åtkomsten tar slut.
3. Läs hela förvarningen och inloggningssidan vid förstoring. Gå igenom
   inloggningskontrollerna med tangentbord eller mobilens läsgester.

**Förväntat resultat:** Förvarningen meddelas artigt utan att avbryta
pågående uppläsning. Hinder vid utgång meddelas en gång med rätt orsak.
Inget fokus döljs, innehåll försvinner inte och inloggningen går att nå.

### INAK-05: Röstförvarning väntar på paus utan att hålla inloggningen aktiv

**Syfte:** Kontrollera fysisk mikrofon, faktiskt ljud och säkert avbrott.

**Användare:** Alex med hushåll och samtalsmedgivande i en disponibel
HTTPS-installation med verklig röstleverantör. Debiterande API-anrop
kräver separat uttryckligt godkännande före körning.

**Förutsättningar:** Fysisk mikrofon och hörlurar på stödd dator och
mobil. Använd bara påhittade hushållsuppgifter. Den syntetiska
röstinstallationen verifierar inte denna observation. Körbevis saknas.

**Kräver mänsklig observation:** Hör faktisk förvarning vid lämplig paus,
utan avbrutet tal, dubbla besked eller ett falskt löfte om slutförande.

<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-microphone-audio",
    "observation": "Hör varningen vid paus med fysisk mikrofon på dator och mobil."
  },
  "reference": "HTTPS och godkända verkliga röstanrop; körbevis saknas.",
  "outcomes": [
    "Förvarningen avbryter inte tal eller pågående svar.",
    "Förvarningen och en tyst mikrofon förlänger inte inloggningen.",
    "Röstläget avslutas och redan lagrat arbete beskrivs korrekt."
  ]
}
```
-->

**Steg:**

1. Logga in vanligt, öppna hushållet och starta röstläge. Låt mikrofonen
   vara på men tyst. Läsning och fokusbyte får inte hålla sessionen aktiv.
2. Efter 25 minuter från senaste handling eller avslutade mottagna
   AI-arbete: hör förvarningen vid en paus och kontrollera den synliga
   texten. Lyssna vidare utan ny instruktion och kontrollera att den inte
   upprepas.
3. I en separat körning: tala strax före den tidigare förvarningstiden.
   Kontrollera att ditt verkliga tal och slutförda arbete flyttar
   inaktivitetsperioden och att den gamla förvarningen inte avbryter dig.
4. Låt den nya perioden löpa ut utan handling. Kontrollera att mikrofon
   och röstläge stoppas och att beskedet kräver ny inloggning och hela
   instruktionen på nytt. Logga in igen och kontrollera lagrat utkast.

**Förväntat resultat:** Förvarningen begär inget nytt uppdrag och räknas
inte som aktivitet. Röstläge har inget nytt slutförandeundantag.
Utkast och genomförda sparanden finns kvar; ett ofärdigt arbete beskrivs
inte som lagrat.
