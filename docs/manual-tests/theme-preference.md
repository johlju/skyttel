# Manuella testfall för kontots temaval

Fallen omfattar kontosparande utan hushåll, andra enheter och flikar,
fokus, systemtema, fel och sena svar över utloggning och kontobyte.
Anteckna commit, webbläsare och resultat. Automatiska prov använder den
befintliga testinstallationen med syntetiska identitetsleverantörer.
Skärmläsning och fysisk förstoring kräver separat mänsklig observation.

## Konfigurerade användare

- **Alex** har ett eget Google-konto i provinstallationen.
- **Robin** har ett separat Microsoft-konto och inget aktivt hushåll.

## Allmän förberedelse

Använd en separat provinstallation enligt
[testguiden](../development/testing.md#physical-device-manual-preparation).
Använd bara påhittade uppgifter. Inga modell- eller röstanrop behövs.
Förbered två webbläsarprofiler och två flikar i samma profil. För TEMA-01
ska Alex sakna hushåll; temaknappen finns på **Din profil**. För TEMA-02
har Alex skapat ett hushåll. Kartans temaknapp nås via verktygen.
För två flikar i samma Chromium-profil: öppna utvecklarverktygens
**Rendering**-panel i varje flik. Välj `light` respektive `dark` under
**Emulate CSS media feature prefers-color-scheme**. Låt panelen vara öppen
under fallet och välj sedan **No emulation** i båda flikarna. På separata
enheter använder du respektive enhets vanliga systeminställning.
Återställ till **System** och logga ut mellan fallen.

## Kontosparande och synkronisering

### TEMA-01: kontoval utan lokal kopia består på andra enheter och efter omstart

**Syfte:** Kontot sparar mörkt tema utan att besökarens systemtema blir kontoval.

**Användare:** Alex.

**Automatiskt motsvarande test:**
[theme-preference.spec.ts](../../tests/integration/theme-preference.spec.ts),
TEMA-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/theme-preference.spec.ts",
    "caseId": "TEMA-01"
  },
  "reference": "Alex utan hushåll, två webbläsarprofiler och ljust systemtema",
  "outcomes": [
    "Kontot sparar mörkt tema utan att besökarens systemtema blir kontoval."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Som utloggad, öppna Skyttel med ljust systemtema. Kontrollera bakgrunden.
2. Logga in som Alex och öppna **Din profil**. Välj **Tema → Mörkt**.
3. Invänta beskedet att temavalet har sparats på kontot.
4. Logga in som Alex i den andra webbläsarprofilen med ljust systemtema.
5. Starta om provinstallationens server och ladda om den första profilen.
6. Logga ut, kontrollera ljust systemtema och logga in igen som Alex.

**Förväntat resultat:**

- Besökaren ser ljust tema. Det mörka kontovalet gäller i båda profilerna
  och efter serverns omstart och ny inloggning.
- Den automatiska motsvarigheten förbereder äldre temakopior i båda
  Web Storage-platserna och observerar att de tas bort utan att importeras.
  Den visar verkligt kontosparande och omstart mot samma databas.

### TEMA-02: öppna flikar hämtar kontoval vid fokus och System följer enheten

**Syfte:** Fokus hämtar det andra fönstrets val; System följer varje enhet.

**Användare:** Alex.

**Automatiskt motsvarande test:**
[theme-preference.spec.ts](../../tests/integration/theme-preference.spec.ts),
TEMA-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/theme-preference.spec.ts",
    "caseId": "TEMA-02"
  },
  "reference": "Alex med hushåll, två flikar med olika systemteman",
  "outcomes": [
    "Fokus hämtar det andra fönstrets val; System följer varje enhet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Alex karta i två flikar. Låt första fliken använda ljust
   systemtema och andra fliken mörkt. Kontrollera deras olika bakgrunder.
2. Välj **Ljust** i den andra fliken och invänta sparbeskedet.
3. Återvänd till den första fliken och kontrollera att temavalet är **Ljust**.
4. Välj **Mörkt** i första fliken. Återvänd till andra fliken.
5. Välj **System** i första fliken och återvänd till den andra.
6. Ändra första enhetens systemtema från ljust till mörkt.

**Förväntat resultat:**

- Uttryckliga kontoval hämtas när respektive flik återfår fokus.
- Med **System** visar första fliken ljust och andra mörkt; ändrat
  systemtema får genomslag utan omladdning.

### TEMA-03: avvisade och förlorade svar ger fel utan falsk sparbekräftelse

**Syfte:** Fel lämnar fokus på temaknappen och påstår inte att kontovalet sparats.

**Användare:** Alex.

**Automatiskt motsvarande test:**
[theme-preference.spec.ts](../../tests/integration/theme-preference.spec.ts),
TEMA-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/theme-preference.spec.ts",
    "caseId": "TEMA-03"
  },
  "reference": "Alex utan hushåll, ljust systemtema, avvisning och förlust efter serversvar",
  "outcomes": [
    "Fel lämnar fokus på temaknappen och påstår inte att kontovalet sparats."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Din profil** med **System** och ljust systemtema.
2. Låt provledaren installera
   [svarkontrollen](setup/theme-responses.md) och aktivera POST `reject`.
3. Välj **Mörkt**. Läs felet och kontrollera tangentbordsfokus.
4. Aktivera POST `lose` och välj **Mörkt** igen. Läs felet.
5. Ladda om sidan när kontrollen är borttagen.

**Förväntat resultat:**

- Båda felen visar att temavalet inte kunde bekräftas som sparat.
  Inget lyckat sparbesked visas. Temaknappen behåller fokus.
- Det bekräftade ljusa temat ligger kvar medan utfallet är okänt.
  Efter omladdning hämtas det faktiskt sparade mörka kontovalet.

### TEMA-04: ett sent hämtat tema återinför inte föregående användare

**Syfte:** Ett sent GET-svar får inte återställa Alex tema efter
utloggning eller kontobyte.

**Användare:** Alex och Robin.

**Automatiskt motsvarande test:**
[theme-preference.spec.ts](../../tests/integration/theme-preference.spec.ts),
TEMA-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/theme-preference.spec.ts",
    "caseId": "TEMA-04"
  },
  "reference": "Alex och Robin i samma webbläsarprofil, hållet verkligt GET-svar",
  "outcomes": [
    "Ett sent GET-svar får inte återställa Alex tema efter utloggning eller kontobyte."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Logga in som Alex, öppna **Din profil** och välj **Mörkt**.
2. Installera [svarkontrollen](setup/theme-responses.md), aktivera GET
   `hold` och lämna sedan fliken och återvänd så att den återfår fokus.
3. Vänta på konsolens status 200. Logga ut och kontrollera systemtemat.
4. Logga in som Robin i en annan flik i samma webbläsarprofil.
5. Återvänd till första fliken och invänta Robins namn. Släpp temasvaret.
6. Öppna **Din profil** och kontrollera temaknappen.

**Förväntat resultat:**

- Utloggning ger enhetens systemtema. Ett sent svar från Alex återinför
  inte Alex kontoval eller något sparbesked hos Robin.
- Robins temaval är **System**; Alex val blir inte Robins kontoinställning.

### TEMA-05: ett sent sparbesked gäller inte nästa konto

**Syfte:** Ett sent POST-svar ger ingen falsk kontobekräftelse efter kontobyte.

**Användare:** Alex och Robin.

**Automatiskt motsvarande test:**
[theme-preference.spec.ts](../../tests/integration/theme-preference.spec.ts),
TEMA-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/theme-preference.spec.ts",
    "caseId": "TEMA-05"
  },
  "reference": "Alex och Robin i samma webbläsarprofil, hållet verkligt POST-svar",
  "outcomes": [
    "Ett sent POST-svar ger ingen falsk kontobekräftelse efter kontobyte."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Logga in som Alex, öppna **Din profil** och välj **Mörkt**.
2. Installera [svarkontrollen](setup/theme-responses.md), aktivera POST
   `hold` och välj **Ljust**. Vänta på konsolens status 200.
3. Logga ut och kontrollera att enhetens systemtema gäller.
4. Logga in som Robin i en annan flik i samma webbläsarprofil.
5. Återvänd till första fliken och invänta Robins namn. Släpp sparsvaret.
6. Öppna **Din profil** och kontrollera temaknappen.

**Förväntat resultat:**

- Alex sena sparbesked ändrar inte Robins tema och visar ingen
  sparbekräftelse på Robins konto.
- Robins temaval är **System**. Den gjorda ändringen hör endast till Alex.

### TEMA-06: skärmläsaren läser temavalets återkoppling en gång

**Syfte:** Kontrollera faktisk uppläsning och nåbara kontroller.

**Användare:** Alex.

**Förutsättningar:** NVDA med Chromium på dator samt VoiceOver på mobil.
Prova ljust och mörkt tema, 1280, 390 och 320 pixlars bredd och förstoring.

**Kräver mänsklig observation:** Lyssna på faktiskt uppläst sparstatus och
fel. Kontrollera att beskedet läses en gång, att fokus ligger kvar på
temaknappen och att kontroller och besked är nåbara vid förstoring.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Skärmläsaren läser sparstatus och fel en gång utan att flytta fokus från temaknappen."
  },
  "reference": "NVDA och Chromium på dator samt VoiceOver på mobil i ljust och mörkt tema",
  "outcomes": ["Temaval och kvarliggande återkoppling är begripliga med faktisk skärmläsning."],
  "evidence": [{
    "kind": "overlap",
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/theme-preference.spec.ts",
    "caseId": "TEMA-03",
    "purpose": "Synligt fel och återställt fokus; automatiseringen hör inte skärmläsaren."
  }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna temaknappen med tangentbordet. Byt mellan **Ljust**, **Mörkt**
   och **System** och lyssna på kontroller och sparbesked.
2. Öppna igen och stäng med Escape. Kontrollera fokus och läsordning.
3. Följ TEMA-03 med svarkontrollen och lyssna på felbeskedet.
4. Prova samma kontroller vid förstoring i båda teman.

**Förväntat resultat:**

- Valet och det aktuella temat framgår. Status och fel läses en gång.
- Fokus förblir synligt och återgår till temaknappen efter val och Escape.
- All text och alla kontroller kan nås utan att besked skymmer dem.

### TEMA-07: tangentbord och återkoppling vid 1280 pixlar

**Syfte:** Nå temaval och besked med tangentbord i båda teman.

**Användare:** Alex utan hushåll.

**Förutsättningar:** 1280 pixlars bredd, 720 pixlars höjd och ljust systemtema.

**Automatiskt motsvarande test:**
[theme-preference.spec.ts](../../tests/integration/theme-preference.spec.ts),
TEMA-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/theme-preference.spec.ts",
    "caseId": "TEMA-07"
  },
  "reference": "Chromium, 1280 pixlar, tangentbord, mörkt och ljust tema samt System",
  "outcomes": [
    "Temaval, kvarliggande återkoppling och stängning fungerar med synligt fokus utan sidrullning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Din profil**, fokusera **Tema** och öppna med Enter.
2. Tryck pil upp för att välja **Mörkt**. Invänta sparbeskedet.
3. Stäng beskedet med **Stäng temabeskedet**. Kontrollera fokus.
4. Upprepa för **Ljust** och sedan **System**, med pil upp vid varje val.
5. Öppna temavalet en gång till och stäng med Escape.

**Förväntat resultat:**

- Det valda alternativet får fokus när temavalet öppnas. Val och Escape
  återför fokus till temaknappen.
- Beskedet ryms inom skärmen utan sidrullning i båda teman och kan stängas
  med en knapp som är minst 44 × 44 pixlar. Fokus återgår till temaknappen.
- Sparbeskedet ligger kvar tills användaren gör något som ersätter det
  eller stänger det.

### TEMA-08: tangentbord och återkoppling vid 390 pixlar

**Syfte:** Nå temaval och besked med tangentbord i båda teman.

**Användare:** Alex utan hushåll.

**Förutsättningar:** 390 pixlars bredd, 720 pixlars höjd och ljust systemtema.

**Automatiskt motsvarande test:**
[theme-preference.spec.ts](../../tests/integration/theme-preference.spec.ts),
TEMA-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/theme-preference.spec.ts",
    "caseId": "TEMA-08"
  },
  "reference": "Chromium, 390 pixlar, tangentbord, mörkt och ljust tema samt System",
  "outcomes": [
    "Temaval, kvarliggande återkoppling och stängning fungerar med synligt fokus utan sidrullning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Din profil**, fokusera **Tema** och öppna med Enter.
2. Tryck pil upp för att välja **Mörkt**. Invänta sparbeskedet.
3. Stäng beskedet med **Stäng temabeskedet**. Kontrollera fokus.
4. Upprepa för **Ljust** och sedan **System**, med pil upp vid varje val.
5. Öppna temavalet en gång till och stäng med Escape.

**Förväntat resultat:**

- Det valda alternativet får fokus när temavalet öppnas. Val och Escape
  återför fokus till temaknappen.
- Beskedet ryms inom skärmen utan sidrullning i båda teman och kan stängas
  med en knapp som är minst 44 × 44 pixlar. Fokus återgår till temaknappen.
- Sparbeskedet ligger kvar tills användaren gör något som ersätter det
  eller stänger det.

### TEMA-09: tangentbord och återkoppling vid 320 pixlar

**Syfte:** Nå temaval och besked med tangentbord i båda teman.

**Användare:** Alex utan hushåll.

**Förutsättningar:** 320 pixlars bredd, 720 pixlars höjd och ljust systemtema.

**Automatiskt motsvarande test:**
[theme-preference.spec.ts](../../tests/integration/theme-preference.spec.ts),
TEMA-09.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/theme-preference.spec.ts",
    "caseId": "TEMA-09"
  },
  "reference": "Chromium, 320 pixlar, tangentbord, mörkt och ljust tema samt System",
  "outcomes": [
    "Temaval, kvarliggande återkoppling och stängning fungerar med synligt fokus utan sidrullning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Din profil**, fokusera **Tema** och öppna med Enter.
2. Tryck pil upp för att välja **Mörkt**. Invänta sparbeskedet.
3. Stäng beskedet med **Stäng temabeskedet**. Kontrollera fokus.
4. Upprepa för **Ljust** och sedan **System**, med pil upp vid varje val.
5. Öppna temavalet en gång till och stäng med Escape.

**Förväntat resultat:**

- Det valda alternativet får fokus när temavalet öppnas. Val och Escape
  återför fokus till temaknappen.
- Beskedet ryms inom skärmen utan sidrullning i båda teman och kan stängas
  med en knapp som är minst 44 × 44 pixlar. Fokus återgår till temaknappen.
- Sparbeskedet ligger kvar tills användaren gör något som ersätter det
  eller stänger det.
