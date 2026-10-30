# Manuella testfall för installationens diagnostik

Fallen hjälper testaren att prova sändningsval, leveransstatus och
installationsansvarigs åtkomst. Anteckna commit, webbläsare och resultat.

## Konfigurerade användare

Alex loggar in med kontrollerad Google-inloggning och är
installationsansvarig. Robin loggar in med kontrollerad Microsoft-inloggning
och är hushållsadministratör utan installationsansvar.

## Allmän förberedelse

1. Bygg med `npm run build`. För SPARNING-01, starta utan leveransadapter:
   `npm run test:env -- tsx scripts/manual-tracing.ts --disconnected`.
   För övriga fall, starta med kontrollerad adapter:
   `npm run test:env -- tsx scripts/manual-tracing.ts`.
   Ingen modellnyckel, inget verkligt LangSmith-konto och inga uppladdningar
   används. Vid fjärrkörning, vidarebefordra den utskrivna porten privat.
2. Öppna utskriven adress. Välj nödvändig lagring och logga in som Alex.
   Öppna `/costs` på samma adress. Öppna **Välj inställning** vid behov
   och välj **Diagnostik med LangSmith** under **Drift**.
3. Båda lägena använder kontrollerade identiteter och en egen tillfällig
   databas. `restart` startar om samma installation med samma databas och
   samma valda adapterläge. I anslutet läge styr övriga terminalkommandon
   den kontrollerade adaptern. Det frånkopplade läget saknar dessa kommandon.
4. Starta en ny tillfällig installation mellan fallen. Avsluta med `quit`
   och kontrollera att den utskrivna tillfälliga katalogen tas bort.
   Det raderar bara testinstallationens data och inloggningar.

## Sändning och tillgång

### SPARNING-01: bevara avstängning efter omstart

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/trace-sending.spec.ts",
    "caseId": "SPARNING-01"
  },
  "reference": "390×844, ljust tema, verklig HTTP och SQLite utan ansluten leverans. Omstart behåller testdatabasen.",
  "outcomes": ["Avstängning består efter omstart.", "Aktivering återgår till ärligt ej anslutet läge och behåller tangentbordsfokus."]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Styra installationens val utan att förväxla det med leverans.

**Användare:** Alex. **Förutsättning:** Starta den tillfälliga
installationen med `--disconnected` enligt förberedelsen.

**Steg:**

1. Öppna sidan i 390 × 844. Läs **Inte ansluten** och att ingen leverans
   registreras sedan start.
2. Fokusera **Stäng av sändning** med tangentbordet och tryck Enter.
3. Kontrollera sparbesked och **Sändning avstängd**. Kontrollera att
   fokus är kvar på knappen, som nu heter **Aktivera sändning**.
4. Skriv `restart` i startterminalen. Kontrollera att adress och
   tillfällig katalog är oförändrade. Ladda om sidan och kontrollera
   **Sändning avstängd**.
5. Välj **Aktivera sändning**. Läs **Inte ansluten**, skillnaden mot
   samtalsmedgivande och att skickade förfrågningar inte kan återkallas.

**Förväntat resultat:** Valet består efter omstart. Sidan bekräftar ingen
leverans utan anslutning. Alla kontroller är åtkomliga i den smala vyn.

### SPARNING-02: läs status och häv en beständig spärr

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/trace-sending.spec.ts",
    "caseId": "SPARNING-02"
  },
  "reference": "1280×900, kontrollerad leveransadapter, verklig HTTP och SQLite. Kvot och ogiltiga uppgifter provas som två spärrorsaker.",
  "outcomes": ["Säkra leveransvärden kan läsas.", "Spärrar består efter omstart och kräver uttrycklig återhämtning.", "Diagnostiska värden nollställs vid omstart."]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skilja leveranshälsa från samtalets utfall och återhämta spärrar.

**Användare:** Alex. **Förutsättning:** Den kontrollerade installationen.

**Separat förberedelse:** Skriv `delivered` och `drop` i startterminalen.

**Steg:**

1. Öppna sidan i 1280 × 900. Välj **Uppdatera leveransstatus**. Kontrollera
   leveranstid, två förlorade händelser och **För stor händelse**.
2. Skriv `quota` och därefter `restart` i terminalen. Ladda om sidan.
3. Läs **Sändning spärrad**, kvotorsaken och att ingen leverans registreras
   sedan start. Läs att återhämtning inte tillåter en betalningsmetod.
4. Kontrollera orsaken i testets kontrollerade adapter. Välj
   **Starta om sändning efter kontroll** och läs **Sändning aktiverad**.
5. Upprepa steg 2–4 med `credentials` i stället för `quota`.

**Förväntat resultat:** Båda spärrarna består efter omstart. En uttrycklig
återhämtning krävs. Diagnostikens nollställning är tydlig och säkra
kategorier innehåller inga hushållsuppgifter eller leverantörsfel.

### SPARNING-03: hushållsadministration ger inte installationskontroll

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/trace-sending.spec.ts",
    "caseId": "SPARNING-03"
  },
  "reference": "Separat inloggning som hushållsadministratör utan installationsansvar, verklig HTTP och SQLite.",
  "outcomes": ["Hushållsadministratören saknar sändningslänk och direkt tillgång till kontrollen."]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Hålla hushållets och installationens behörigheter åtskilda.

**Användare:** Robin. **Separat förberedelse:** Som Alex, skapa ett hushåll
och bjud in Robin enligt [tillgångsfallen](access.md). Skriv `robin`
i terminalen. Logga in med Microsoft i en separat profil och acceptera
inbjudan. Som Alex, ge Robin administratörsroll genom **Administrera tillgång**.

**Steg:**

1. Som Robin, öppna hushållets **Inställningar**. Kontrollera att sidan
   saknar länken **Diagnostik med LangSmith**.
2. Öppna `/tracing` på samma installation genom adressfältet.
3. Läs beskedet om saknad tillgång. Kontrollera att sändningskontroller
   inte visas.

**Förväntat resultat:** Hushållets administratör får ingen driftbehörighet.

### SPARNING-04: skärmläsaren förklarar sändningsval och status

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Använd faktisk NVDA eller VoiceOver och lyssna på rubrik, knappar, leveransvärden, sparbesked och spärrorsak."
  },
  "reference": "Faktisk skärmläsare på dator och mobil med ljust och mörkt tema.",
  "outcomes": ["Sändningsval, leveransstatus och återhämtning går att förstå utan syn."],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "browser",
      "spec": "tests/browser/trace-sending-accessibility.test.tsx",
      "title": "tracing controls retain contrast, focus and reflow in dark settings",
      "purpose": "Chromium mäter kontrast, fokus och omflöde. Det ersätter inte faktisk uppläsning."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Användare:** Alex. **Förutsättning:** Kontrollerad installation.

**Steg:**

1. Läs rubriken och leveransvärdena med faktisk NVDA eller VoiceOver.
2. Stäng av och aktivera sändning med tangentbord. Lyssna på sparbeskedet.
3. Skriv `quota` i terminalen, uppdatera status och läs spärrorsaken.
4. Häv spärren efter kontroll och lyssna på beskedet. Prova samma flöde
   med mobil skärmläsare och förstoring i båda teman.

**Förväntat resultat:** Namn, ordning, fokus och status ger begriplig
återkoppling. Ingen funktion kräver syn eller tal. Redovisa faktisk
observation separat från automatiska DOM- och tangentbordsprov.
