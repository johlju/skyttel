# Manuella testfall för markering och detaljer

Testfallen omfattar flerval, tomrumsgester, textkontroller, läsning och
vanliga formulär. Anteckna commit, webbläsare, enhet, fysisk eller emulerad
inmatning samt godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex Exempel är inloggad medlem i ett separat provhushåll. Använd bara
påhittade uppgifter. Administratörsrollen behövs inte för kartarbetet.

## Allmän förberedelse

1. Starta en isolerad installation enligt
[provförberedelsen](../development/devcontainer.md#disposable-local-database).
   Använd ett nytt provhushåll mellan fallen.
2. Välj **Nytt objekt** i verktygen. Skapa personerna Lo Exempel, Kim Exempel
   och Alex Exempel, ett helt formulär åt gången. Välj varje gång
   **Lägg i utkastet och stäng**.
3. Välj **Tabell**, **Samband för Lo Exempel**, **Nytt samband** och ange
   Använder till Kim Exempel. Lägg hela sambandet i utkastet och stäng
   samband. Skapa likadant Kim Exempel → Använder → Alex Exempel.
4. Välj **Karta**. Alla tre objekt och båda privata samband visas.
   Spara inte utkastet under dessa markeringstester.

## Markering och kartgester

### MARKERING-01: flerval och uttrycklig detaljöppning

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-selection.spec.ts",
    "caseId": "MARKERING-01"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Skilja markering från detaljöppning utan ändrade fakta eller kamera."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skilja markering från detaljöppning utan ändrade fakta eller kamera.

**Användare:** Alex Exempel.

**Förutsättningar:** Alla tre objekt visas på en dator med kartgrafik.

**Integrationstest:**
[map-selection.spec.ts](../../tests/integration/map-selection.spec.ts),
testfallet “MARKERING-01: ordinary and modified clicks select objects and open
details separately”.

**Steg:**

1. Klicka Lo. Kontrollera markeringen, solid ram och det direkta sambandet,
   utan öppnade uppgifter. Ctrl-klicka Alex och kontrollera två markerade
   objekt och båda direkta sambanden.
2. Klicka Lo igen: Alex finns kvar. Cmd-klicka Alex för att ta bort Alex.
   Klicka det omarkerade Kim och kontrollera att Kim ersätter Lo.
3. Ctrl-klicka Lo, dubbelklicka Kim och läs Kims flyttbara uppgiftsfönster.
   Stäng med krysset i titelraden. Kontrollera att de två markeringarna finns
   kvar.
4. Ctrl+Alt-klicka Lo, läs Lo och stäng uppgifterna. Cmd+Alt-klicka Alex,
   läs Alex och stäng igen. Kontrollera tre markeringar och samma kamera.
5. Klicka fri bakgrund. Dubbelklicka Alex och kontrollera en markering.
   Stäng uppgifterna och pröva höger Control+Option-klick på Lo där
   enhetens motsvarande modifierare används.

**Förväntat resultat:**

- Vanligt klick, Ctrl/Cmd-flerval och detaljöppning följer stegen.
- Alla markerade objekts direkta samband framhävs. Grannar blir inte markerade.
- Ett uppgiftsfönster återger det valda objektet. När den stängs återkommer
  samma
  kartläge; ingen handling ändrar hushållets uppgifter.

### MARKERING-02: tomrumsklick och avbrutna gester

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-selection.spec.ts",
    "caseId": "MARKERING-02"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Avmarkera utan att ändra sökning eller oavsiktligt flytta kameran."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Avmarkera utan att ändra sökning eller oavsiktligt flytta kameran.

**Användare:** Alex Exempel.

**Förutsättningar:** Kartan visas på datorn med fri bakgrund att klicka.

**Integrationstest:**
[map-selection.spec.ts](../../tests/integration/map-selection.spec.ts),
testfallet “MARKERING-02: empty clicks clear highlighting while navigation and
cancellation retain selection”.

**Steg:**

1. Markera Lo. Klicka i kartans sökfält, skriv Exempel i **Sök objekt i kartan**
   och tryck Escape i sökfältet. Avmarkera och markera Lo med Control-klick.
   Kontrollera bevarad söktext, kamera och att inga detaljer öppnas.
2. Klicka fri bakgrund med en mycket liten rörelse. Kontrollera att
   markeringarna släcks medan söktext och kamera finns kvar.
3. Markera Lo, dra bakgrunden och kontrollera att Lo förblir markerad.
   Klicka sedan direkt i tomrummet: Lo avmarkeras utan ett nytt kamerahopp.
4. Markera Lo igen. Börja en pekgest på bakgrunden och avbryt den genom
   webbläsarens eller enhetens avbrottshandling. Kontrollera urvalet.
5. Välj sambandet från Lo till Kim och klicka tom bakgrund.

**Förväntat resultat:**

- Ett enda tomrumsklick släcker all framhävning, även efter en dragning.
- Små rörelser flyttar inte kameran. Verklig eller avbruten navigering
  behåller markeringarna. Söktext och kamera består.

## Textalternativ och vanliga formulär

### MARKERING-03: tangentbord, läsning och uttrycklig formulärförlust

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-selection.spec.ts",
    "caseId": "MARKERING-03"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Läsa markerade uppgifter, skydda oskickad text och nå samma formulär från tabellen på stora och små skärmar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Läsa markerade uppgifter, skydda oskickad text och nå samma
formulär från tabellen på stora och små skärmar.

**Användare:** Alex Exempel.

**Förutsättningar:** Kör varje gång i ett nytt förberett provhushåll.
Prova 1440 CSS-pixlars bredd med 1000 pixlars höjd.

**Integrationstest:**
[map-selection.spec.ts](../../tests/integration/map-selection.spec.ts),
MARKERING-03.

**Steg:**

1. Nå **Välj objekt: Lo Exempel** med Tab och tryck mellanslag.
2. Ctrl-klicka Kim, tryck Skift+F10 och välj **Visa uppgifter för Kim Exempel**.
   Kontrollera två markerade objekt och fokus på Kims rubrik.
3. Välj **Redigera Kim Exempel** och skriv Oskickat samt aktuell bredd i
   **Beskrivning**. Välj **Stäng objektdialogen**. Kontrollera fokus på
   **Fortsätt redigera** och tryck Escape. Texten finns kvar, utan nytt förslag.
4. Stäng igen och välj uttryckligen **Kasta ändringarna och fortsätt**.
   Kontrollera fokus på den tidigare redigeringsknappen och båda markeringarna.
5. Stäng uppgifterna. Välj **Tabell** och **Redigera Kim Exempel**.
   Kontrollera att den kastade beskrivningen är tom. Stäng utan ändring.
6. Nå namnet **Lo Exempel** i tabellen och tryck mellanslag.
   Kontrollera expanderade uppgifter och markerad rad.
7. Öppna verktygens namn vid behov, välj **Tema** och **Mörkt**.
   Kontrollera fokus tillbaka till temaknappen och läs beskedet att temavalet
   är sparat på kontot. Välj **Stäng temabeskedet** och **Dölj verktygens namn**
   så att verktygen inte ligger över tabellen. Kontrollera läsbar knapptext
   när pekaren hålls över **Redigera Kim Exempel**.
8. Öppna utkastets läsning via **Skriv till Skyttel** och **Visa utkastet**.
   Välj **Tabell** igen. Kontrollera att samma redigeringsknapp kan nås
   utan att textvyn täcker den. På dator ryms tabellen bredvid textvyn;
   på smal skärm visas den valda tabellen.
9. Välj **Rapporter**. Kontrollera att utkastets läsning inte visas och att
   **Skriv till Skyttel** är stängd. Öppna **Skriv till Skyttel** och
   **Visa utkastet** igen. Kontrollera att Kims tidigare förslag kan läsas
   utan fråga om samtycke. Välj **Tabell** och nå samma redigeringsknapp igen.

**Förväntat resultat:**

- Markering, uppgiftsläsning och det fullständiga formuläret är skilda
  handlingar.
- Escape avbryter förlusten och bevarar text; endast uttryckligt kastande
  tar bort formulärtexten. Återöppning använder aktuellt underlag.
- Fokus och kontroller är åtkomliga på varje bredd. Text i mörkt tema har
  tillräcklig kontrast. Sparade fakta och hela tidigare utkastet är oförändrade.
- Rapporter bevarar utkastet. När texten öppnas igen återgår den till den
  tidigare kartan eller tabellen med åtkomliga kontroller.

### Pensionerat MARKERING-04 — pensionerat fall för fria fönster

ID:t är pensionerat och återanvänds inte. Läsning, återgång och åtkomliga
kontroller prövas i MARKERING-01, MARKERING-03 och MARKERING-05. Flera
flyttbara uppgiftsfönster prövas i MARKERING-06.

### MARKERING-05: läs markerade uppgifter och återgå från vanligt formulär

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-selection-details.spec.ts",
    "caseId": "MARKERING-05"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Läsa ett valt objekt och nå samma fullständiga objektformulär utan ändring av hushållets sparade och privata uppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Läsa ett valt objekt och nå samma fullständiga objektformulär
utan ändring av hushållets sparade och privata uppgifter.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Starta läskedjans installation enligt
[Förbered läskedjan](object-lists.md#förbered-läskedjan). Öppna dess adress
och logga in med Google som Alex Exempel. Cykel har sparade uppgifter och
ett privat prisförslag. Starta om förberedelsen mellan körningarna. Prova
1280 × 900 CSS-pixlar.
Fysisk pekning provas separat i MARKERING-12 och faktisk
uppläsning i LISTA-09.

**Integrationstest:**
[map-selection-details.spec.ts](../../tests/integration/map-selection-details.spec.ts),
MARKERING-05.

**Steg:**

1. Välj **Karta**. Nå **Välj objekt: Cykel** med tangentbord och tryck Enter.
2. Tryck Skift+F10 och välj **Visa uppgifter för Cykel**.
   Läs Cykels namn och fullständiga uppgifter.
   Skilj sparade värden från det privata prisförslaget.
3. Nå **Redigera Cykel** med Tab och tryck Enter. Kontrollera att det vanliga
   fullständiga objektformuläret öppnas med Cykels aktuella uppgifter.
   Öppna **Fria egenskaper**. Pris är texten **2500 SEK** utan en extra
   säkerhetsegenskap. Senast uppgiven skuld och Slutdatum saknar värde;
   deras separata textegenskaper för uppgiftens säkerhet innehåller
   **Uttryckligen inget** respektive **Okänt**.
4. Välj **Stäng objektdialogen** utan att ändra något. Kontrollera att fokus
   återgår till **Redigera Cykel** och att samma uppgifter finns kvar.
5. Rulla uppgiftsfönstrets innehåll och stäng det med krysset.
   Välj **Tabell** och **Redigera Cykel**. Ange
   **Mitt privata läsförslag** i textegenskapen Beskrivning under
   **Fria egenskaper** och välj **Lägg i utkastet och
   stäng**.
   Kontrollera fokus på samma redigeringsknapp och läs **Ändringen finns i ditt
   utkast. Kartan sparas separat.** ovanför tabellen.
6. Välj **Karta** och läs samma återkoppling en gång på den aktiva ytan.
   Kontrollera att knapparna kan nås med tangentbord utan sidrullning.

**Förväntat resultat:**

- Ett flyttbart uppgiftsfönster visar det markerade objektets uppgifter.
  Titelraden och stängkrysset består när innehållet rullas.
  Pennan öppnar det fullständiga formuläret.
- Redigering öppnar samma vanliga objektformulär; oförändrad stängning
  återför fokus utan förslag eller ändrade värden.
- Läsning och oförändrad stängning bevarar sparade uppgifter och hela tidigare
  privata utkastet. Det uttryckliga tillägget ändrar endast Cykels privata
  beskrivning. Kartans sparade objekt och samband är oförändrade.
- Bekräftat tillägg återför fokus och visar samma återkoppling en gång på den
  aktiva ytan, utan ett extra sparkvitto.

### MARKERING-06: flera flyttbara uppgiftsfönster med gemensamma ikoner

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-selection-details.spec.ts",
    "caseId": "MARKERING-06"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Läsa flera objekts uppgifter och flytta fönstren oberoende av varandra utan ändrad kamera, personlig vy eller hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Läsa flera objekts uppgifter och flytta fönstren oberoende av
varandra utan ändrad kamera, personlig vy eller hushållsuppgifter.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Förbered läskedjan enligt
[Förbered läskedjan](object-lists.md#förbered-läskedjan). Cykel har sparade
uppgifter, ett privat prisförslag och samband till Garage. Prova på dator
samt vid 390 och 320 CSS-pixlars bredd. Fysisk pekdragning
provas separat i MARKERING-12.

**Integrationstest:**
[map-selection-details.spec.ts](../../tests/integration/map-selection-details.spec.ts),
testfallet “MARKERING-06: independent property windows share context actions
and move without moving the map”.

**Steg:**

1. Öppna kartan och högerklicka Cykel. Läs de sju ikonernas verktygstips:
   redigering, uppgifter, samband, visa objektet i kartan, visa dess direkta
   samband i kartan, fokusera markeringen och borttagning. Välj **Samband för
   Cykel**, läs Garage
   i befintliga samband och stäng sambandsdialogen.
2. Högerklicka Cykel igen och välj **Visa uppgifter för Cykel**. Läs egna
   fält och prisets sparade och föreslagna värden. Kontrollera att fönstret
   har fem åtgärdsikoner: redigering, samband, visa objektet i kartan,
   visa dess direkta samband i kartan och borttagning. Kontrollera även
   ett stängkryss uppe till höger.
3. Dra Cykels titelrad. Kontrollera att kartan står kvar. Dubbelklicka
   Garage. Kontrollera att båda uppgiftsfönstren finns kvar. Dra Garages
   titelrad utan att flytta Cykels fönster eller kameran.
4. Fokusera Garages titelrad och använd piltangenter samt Skift med
   piltangent. Stäng Garage med dess kryss. Cykels fönster ska finnas kvar
   på samma plats. Fokusera Cykel i kartan och tryck Skift+F10. Välj
   **Visa uppgifter för Cykel**: Cykels enda fönster får fokus och står
   kvar på samma plats.
5. Välj pennan i Cykels fönster. Stäng det vanliga redigeringsformuläret
   utan ändring och kontrollera fokus tillbaka på pennan. Rulla uppgifterna
   och kontrollera att kartan inte panoreras eller zoomas.
6. Börja dra Cykels titelrad, tryck Escape före pekarsläppet och släpp.
   Kontrollera att fönstret återgår till sin placering och förblir öppet.
7. Ändra fönstrets bredd till 390 och 320 CSS-pixlar. Kontrollera att
   uppgifter och ikoner går att rulla till, att titelraden kan flyttas med
   tangentbord och att krysset går att nå.
8. Välj den röda papperskorgen i Cykels fönster. Kontrollera fokus på
   fönstrets rubrik och borttagningen i utkastet. Stäng det sista fönstret
   med krysset; spara inte utkastet.

**Förväntat resultat:**

- Sambandsikonen öppnar den befintliga sambandsdialogen. Uppgiftsikonen
  och dubbelklick öppnar samma fullständiga, flyttbara uppgiftsfönster.
- Varje objekt har ett eget fönster med egen placering. Ny markering eller
  öppning av ett annat objekt stänger inte tidigare uppgiftsfönster.
- Fönstren har fem åtgärdsikoner med samma tillgängliga namn som vid
  högerklick: redigering, samband, visa objektet i kartan, visa dess
  direkta samband i kartan och borttagning. Titelraden kan dras eller
  flyttas med piltangenter; Escape avbryter dragning.
- Varje kryss stänger bara sitt fönster. Kartans kamera och personliga vy,
  sparade uppgifter och hela utkastet är oförändrade under läsningen.
- Den uttryckliga borttagningen återför fokus till fönstret och lägger
  bara objektet och dess samband som borttagningar i utkastet. Den sparade
  hushållskartan är oförändrad.

### MARKERING-07: MARKERING-03 vid 390 × 1000

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-selection.spec.ts",
    "caseId": "MARKERING-07"
  },
  "reference": "390 × 1000",
  "outcomes": [
    "Samma handlingar ger de skyddade resultaten under angivna steg.",
    "Kontroller och fokus förblir åtkomliga i den valda konfigurationen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** MARKERING-03 vid 390 × 1000.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Nytt förberett hushåll vid 390 CSS-pixlars bredd.
Skyddet gäller skyddad oskickad text, återfokus och mörk kontrast.

**Integrationstest:**
[map-selection.spec.ts](../../tests/integration/map-selection.spec.ts),
MARKERING-07.

**Steg:**

1. Utför MARKERING-03 en gång med denna konfiguration. Utför alla steg i samma
   ordning.
2. Under formulär- och vybytena kontrollerar du läsbart innehåll, synligt
   fokus och att nästa angivna kontroll går att nå.

**Förväntat resultat:**

- Samma handlingar ger de skyddade resultaten under angivna steg.
- Kontroller och fokus förblir åtkomliga i den valda konfigurationen.

### MARKERING-08: MARKERING-03 vid 320 × 1000

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-selection.spec.ts",
    "caseId": "MARKERING-08"
  },
  "reference": "320 × 1000",
  "outcomes": [
    "Samma handlingar ger de skyddade resultaten under angivna steg.",
    "Kontroller och fokus förblir åtkomliga i den valda konfigurationen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** MARKERING-03 vid 320 × 1000.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Nytt förberett hushåll vid 320 CSS-pixlars bredd.
Skyddet gäller åtkomliga detaljer, formulär och kontrast.

**Integrationstest:**
[map-selection.spec.ts](../../tests/integration/map-selection.spec.ts),
MARKERING-08.

**Steg:**

1. Utför MARKERING-03 en gång med denna konfiguration. Utför alla steg i samma
   ordning.
2. Under formulär- och vybytena kontrollerar du läsbart innehåll, synligt
   fokus och att nästa angivna kontroll går att nå.

**Förväntat resultat:**

- Samma handlingar ger de skyddade resultaten under angivna steg.
- Kontroller och fokus förblir åtkomliga i den valda konfigurationen.

### MARKERING-09: MARKERING-05 vid 320 × 640

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-selection-details.spec.ts",
    "caseId": "MARKERING-09"
  },
  "reference": "320 × 640",
  "outcomes": [
    "Samma handlingar ger de skyddade resultaten under angivna steg.",
    "Kontroller och fokus förblir åtkomliga i den valda konfigurationen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** MARKERING-05 vid 320 × 640.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Starta läskedjans installation i 320 × 640 CSS-pixlar.
Skyddet gäller läsbara prisförslag, redigeringsväg och återfokus.

**Integrationstest:**
[map-selection-details.spec.ts](../../tests/integration/map-selection-details.spec.ts),
MARKERING-09.

**Steg:**

1. Utför MARKERING-05 en gång med denna konfiguration. Utför alla steg i samma
   ordning.
2. Under formulär- och vybytena kontrollerar du läsbart innehåll, synligt
   fokus och att nästa angivna kontroll går att nå.

**Förväntat resultat:**

- Samma handlingar ger de skyddade resultaten under angivna steg.
- Kontroller och fokus förblir åtkomliga i den valda konfigurationen.

### MARKERING-10: MARKERING-05 vid 320 × 250

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-selection-details.spec.ts",
    "caseId": "MARKERING-10"
  },
  "reference": "320 × 250",
  "outcomes": [
    "Samma handlingar ger de skyddade resultaten under angivna steg.",
    "Kontroller och fokus förblir åtkomliga i den valda konfigurationen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** MARKERING-05 vid 320 × 250.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Starta läskedjans installation i 320 × 250 CSS-pixlar.
Skyddet gäller åtkomlig redigering och återkoppling i ett kort fönster.

**Integrationstest:**
[map-selection-details.spec.ts](../../tests/integration/map-selection-details.spec.ts),
MARKERING-10.

**Steg:**

1. Utför MARKERING-05 en gång med denna konfiguration. Utför alla steg i samma
   ordning.
2. Under formulär- och vybytena kontrollerar du läsbart innehåll, synligt
   fokus och att nästa angivna kontroll går att nå.

**Förväntat resultat:**

- Samma handlingar ger de skyddade resultaten under angivna steg.
- Kontroller och fokus förblir åtkomliga i den valda konfigurationen.

### MARKERING-11: fysiska modifierare skiljer flerval från detaljöppning

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Prova faktisk Control, Command och Option på den angivna\nenheten och kontrollera vilka objekt som markeras och öppnas."
  },
  "reference": "Fysisk mus och tangentbord; faktisk Control, Command och Option enligt operativsystem.",
  "outcomes": [
    "Control-/Command-klick utan Alt ändrar flerval utan detaljöppning eller kameraflytt.",
    "Detaljöppning visar rätt objekt och bevarar övrigt urval."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/map-selection.spec.ts",
      "caseId": "MARKERING-01",
      "purpose": "Avgränsad automatiserad DOM-, CSS- och syntetisk inmatning; inte faktisk enhetsobservation."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** fysiska modifierare skiljer flerval från detaljöppning.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Ny förberedelse enligt MARKERING-01.

**Kräver mänsklig observation:** Prova faktisk Control, Command och Option på
den angivna
enheten och kontrollera vilka objekt som markeras och öppnas.

**Steg:**

1. Utför MARKERING-01 en gång med fysisk mus och tangentbord.
   Anteckna operativsystem och vilka modifierare enheten faktiskt har.
2. Kontrollera markeringarna efter varje modifierat klick och att
   detaljöppningen visar rätt objekt utan ändrad kamera.

**Förväntat resultat:**

- Control-/Command-klick utan Alt ändrar flerval utan detaljöppning eller kameraflytt.
- Detaljöppning visar rätt objekt och bevarar övrigt urval.

### MARKERING-12: fysisk pekdragning och avbrott bevarar fönster

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Dra på verklig pekskärm och avbryt en gest med enhetens\navbrott. Kontrollera fönster, markering och kamera."
  },
  "reference": "Verklig pekskärm; oberoende uppgiftsfönster, fysisk dragning och avbruten gest.",
  "outcomes": [
    "Cykels och Garages fönster kan dras oberoende utan ändrad kamera.",
    "Avbruten dragning återställer samma placering och lämnar fönstret öppet."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/map-selection-details.spec.ts",
      "caseId": "MARKERING-06",
      "purpose": "Avgränsad automatiserad DOM-, CSS- och syntetisk inmatning; inte faktisk enhetsobservation."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** fysisk pekdragning och avbrott bevarar fönster.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Ny förberedelse enligt MARKERING-06.

**Kräver mänsklig observation:** Dra på verklig pekskärm och avbryt en gest med
enhetens
avbrott. Kontrollera fönster, markering och kamera.

**Steg:**

1. Utför MARKERING-06 en gång på den angivna pekskärmen.
2. Under steg 3 och 6 provar du fysisk dragning och verkligt
   avbrott. Kontrollera oberoende fönster och bevarad kamera.

**Förväntat resultat:**

- Cykels och Garages fönster kan dras oberoende utan ändrad kamera.
- Avbruten dragning återställer samma placering och lämnar fönstret öppet.

## Bevarade referenser

MARKERING-03 använder 1440 CSS-pixlar; MARKERING-07–08 behåller de två
smala provens hela native detalj-, formulärförlust-, fokus- och
kontrastskydd. Desktopprovet behåller kontrollen av att sidofältet inte
täcker tabellarbetet. MARKERING-05 använder 1280 × 900; MARKERING-09–10
behåller hela läsningen, redigeringen, återfokus och förslagsbeskedet
i de två smala/korta vyerna. Ingen ursprunglig spar-/omstartskedja finns
i dessa scenarier att korta. MARKERING-04 är fortsatt pensionerat.
