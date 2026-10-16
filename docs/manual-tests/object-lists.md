# Manuella testfall för objektlistor

Testfallen gäller att hitta och återfinna objekt genom listor och tabell,
filtrering, sortering och sidval samt att läsa fullständiga uppgifter och
visa en vald träff i kartan.
Läsdialogerna låter användaren följa samband och gå tillbaka utan kartgrafik.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Använd **Alex Exempel** med tillgång till testhushållet. Provkartan och
inloggningen innehåller enbart påhittade uppgifter.

## Allmän förberedelse

1. Starta provkartan enligt [stora kartor](large-map.md#allmän-förberedelse).
   Den innehåller 500 objekt fördelade på fem typer och 1 500 samband.
2. Öppna **Tabell → Filter**, välj **Ta med upphörda** och stäng filtret.
   Prova CSS-bredder, tangentbord, pekning och teman enligt respektive fall.
   Faktisk förstoring och uppläsning provas i LISTA-09; fysisk mobilinmatning
   och förstoring i SÖK-16.
3. Starta om provkartan mellan fallen. För kartfokus använder du ett litet
   testhushåll enligt förutsättningarna i LISTA-03.

### Förbered hushållets tabell

1. Bygg applikationen med `npm run build`. Starta sedan
   `node --import tsx scripts/manual-household-table.ts` från projektroten.
2. Öppna den utskrivna adressen och logga in med Google. Välj **Tabell**.
   Installationen har fler än 50 objekt, svenska namn med siffror,
   långa värden, dolda egna fält, ekonomiska uppgifter och alla statusar.
3. Använd respektive falls CSS-bredd och vanliga kontroller. Faktisk
   förstoring och uppläsning provas i LISTA-09 och mobilinmatning i SÖK-16.
   Skriv `quit` i terminalen och starta om kommandot mellan fallen.
   Provdatabasen raderas när processen avslutas.

### Förbered läskedjan

1. Bygg med `npm run build` och starta
   `node --import tsx scripts/manual-household-reading.ts` från projektroten.
2. Öppna den utskrivna adressen och logga in med Google som Alex Exempel.
   Provhushållet har över 50 objekt, Alex, Cykel och Garage, fullständiga
   uppgifter samt sparade och föreslagna samband.
3. Skriv `quit` i terminalen och starta om kommandot mellan fallen.
   Provdatabasen raderas när processen avslutas. Vanliga gemensamma
   demodata innehåller även Alex Exempel → Alex blå cykel → Familjens garage.

### Förbered utforskning i kartan

1. Bygg med `npm run build` och starta
   `node --import tsx scripts/manual-map-exploration.ts` från projektroten.
2. Öppna den utskrivna adressen och logga in med Google som Alex Exempel.
   Provkartan har kedjan Alex Exempel → Blå cykel → Garaget → Bostaden
   och ett oberoende objekt. Alla uppgifter är syntetiska.
3. Lägg till `--ended` för SÖK-07 eller `--removed` för SÖK-08.
   Skriv `quit` och starta om mellan fallen; databasen raderas vid avslut.

## Läs objekt och följ samband

### LÄS-01: följ Alex till cykel och garage med tabelläget kvar

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-reading.spec.ts",
    "caseId": "LÄS-01"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Läsa hela sambandskedjan utan kartgrafik och bevara tabelläget."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Läsa hela sambandskedjan utan kartgrafik och bevara tabelläget.

**Användare:** Alex Exempel.

**Förutsättningar:** Hushållet från Förbered läskedjan. Prova med
tangentbord och utan kartgrafik. Faktisk förstoring och uppläsning
provas separat i LISTA-09.

**Integrationstest:**
[household-reading.spec.ts](../../tests/integration/household-reading.spec.ts),
testfallet “LÄS-01: keyboard follows Alex to bicycle to garage and back
without graphics or lost table state”.

**Steg:**

1. Välj Tabell, expandera A 1 och A 2, välj Nästa och expandera Alex och
   Cykel. Rulla tabellen och öppna Samband för Alex med tangentbord.
2. Kontrollera dialogens rubrik och antal samband. Från rubriken ska
   Skift+Tab nå **Stäng samband** och Tab sedan nå krysset. Välj Cykel, läs hela
   beskrivningen, egna fält, ekonomi samt Sparat och Ditt förslag.
3. Öppna Samband för Cykel och välj Garage. Läs Ospecificerat objekt.
4. Använd Tab och Skift+Tab vid dialogens första och sista kontroller.
   Välj Tillbaka tre gånger och stäng med Escape.
5. Kontrollera sida, rullning och öppna rader. Gå till föregående sida och
   kontrollera att A 1 och A 2 fortfarande är expanderade.

**Förväntat resultat:**

- Fokus börjar på varje dialogs rubrik. Bakgrunden är inaktiv och
  tangentbordsfokus stannar i den aktiva dialogen.
- Fullständiga uppgifter och sparade/föreslagna värden kan läsas utan
  kartnavigering. Tillbaka går ett steg utan att ändra hushållets data.
- Stängning återför fokus till Samband för Alex. Sida, flera öppna rader
  och rullningsläge bevaras.

### LÄS-02: läs samband och olika betydelser på smal skärm

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-reading.spec.ts",
    "caseId": "LÄS-02"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Skilja okända mål, uttryckligen inga mål, osäkerhet och status."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skilja okända mål, uttryckligen inga mål, osäkerhet och status.

**Användare:** Alex Exempel.

**Förutsättningar:** Hushållet från Förbered läskedjan. Prova på telefon
vid 390 × 844 CSS-pixlar. Förstoring och uppläsning provas i LISTA-09. Föreslå
borttagning av Alex samband
till Cykel genom sambandsredigeringen, utan att spara det gemensamt.

**Integrationstest:**
[household-reading.spec.ts](../../tests/integration/household-reading.spec.ts),
testfallet “LÄS-02: mobile full relationship reading separates absent
targets, uncertainty and proposed removal”.

**Steg:**

1. Öppna Tabell och Samband för Cykel.
2. Läs samtliga fyra samband, inklusive föreslagen borttagning.
3. Kontrollera Okänd koppling och Har ingen samt sambandet till Garage.
   Läs säkerhet, riktning, egna fält, livscykel och slutdatum.
4. Välj **Stäng samband** och kontrollera fokus.

**Förväntat resultat:**

- Okänt och Uttryckligen inget har inga falska objektlänkar. Osäkert
  uppgivet är skilt från dessa betydelser. **Redigera samband** finns
  för de två giltiga sambanden utan målobjekt.
- Upphört, Föreslagen borttagning och sparat/föreslaget värde är läsbara
  även utan färg. Dolda egna fält finns med.
- Text bryts inom skärmbredden och innehållet rullar i dialogen.
  Fokus återgår till Samband för Cykel.
- Sambandsdialogen har **Stäng samband** och kryss. Escape fungerar också.

### LÄS-03: stäng läsning när öppningsraden försvinner

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-reading.spec.ts",
    "caseId": "LÄS-03"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Återgå till en användbar radkontroll efter ett bakgrundsbesked."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Återgå till en användbar radkontroll efter ett bakgrundsbesked.

**Användare:** Alex Exempel.

**Förutsättningar:** Hushållet från Förbered läskedjan, ett aktivt
textsamtal och en andra inloggad flik i samma hushåll.

**Integrationstest:**
[household-reading.spec.ts](../../tests/integration/household-reading.spec.ts),
testfallet “LÄS-03: a vanished table opener returns to the next equivalent
control after a real background update”.

**Steg:**

1. Lägg B Tillfälligt objekt i utkastet utan samband. Öppna dess
   sambandsdialog från tabellen i första fliken.
2. Välj **Tabell** i andra fliken, sök B Tillfälligt objekt och välj
   **Ta bort B Tillfälligt objekt**. Vänta tills den första fliken visar
   att objektet inte längre finns.
3. Stäng med Escape och kontrollera fokus.

**Förväntat resultat:**

- Bakgrundsuppdateringen skapar ingen falsk läskedja och ändrar inga
  andra förslag. Dialogen kan stängas.
- Fokus återgår till Samband för Cykel som nästa motsvarande kontroll.
  Tabellens sida och filter ändras inte för att återställa raden.

### LÄS-04: återgå till föregående rad eller rubriken

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-reading.spec.ts",
    "caseId": "LÄS-04"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Behålla användbart fokus när det saknas en följande rad."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Behålla användbart fokus när det saknas en följande rad.

**Användare:** Alex Exempel.

**Förutsättningar:** Ett tomt provhushåll med två nya objekt A och B i
utkastet, ett aktivt textsamtal och en andra inloggad flik.

**Integrationstest:**
[household-reading.spec.ts](../../tests/integration/household-reading.spec.ts),
LÄS-04.

**Steg:**

1. Öppna **Samband för B** från tabellen. Välj **Tabell** i andra fliken,
   sök B och välj **Ta bort B**. Vänta på **Objektet finns inte längre**.
2. Stäng med Escape och kontrollera fokus på **Samband för A**.

**Förväntat resultat:**

- Utan nästa rad går fokus till samma kontroll på föregående rad.
- A finns kvar; inga extra ändringar läggs i utkastet.
  Fallet utan kvarvarande rader är LÄS-08.

### LÄS-05: läs identitet före och efter ett förslag

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-reading.spec.ts",
    "caseId": "LÄS-05"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Skilja ett identifierat objekt från ospecificerad eller oklar identitet och läsa en föreslagen precisering."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skilja ett identifierat objekt från ospecificerad eller oklar
identitet och läsa en föreslagen precisering.

**Användare:** Alex Exempel.

**Förutsättningar:** Hushållet från Förbered läskedjan. Garage är sparat
som Ospecificerat objekt. Lägg ett förslag där Garage är identifierat i
utkastet. Lägg även Oklart objekt med identitet som behöver redas ut i
utkastet genom objektformuläret. Spara inte utkastet.

**Integrationstest:**
[household-reading.spec.ts](../../tests/integration/household-reading.spec.ts),
testfallet “LÄS-05: identity reading distinguishes identified, unresolved
and a proposal replacing unspecified identity”.

**Steg:**

1. Öppna Tabell och expandera Alex genom att välja namnet.
2. Läs Identitet direkt i raden och fäll ihop med namnet igen.
   Läs Oklart objekt på samma sätt.
3. Läs Garage och jämför Sparat med Ditt förslag för Identitet.
4. Fäll ihop raden och kontrollera att förslagen ligger kvar i utkastet.

**Förväntat resultat:**

- Alex visar Identifierat objekt. Oklart objekt visar Identiteten behöver
  redas ut. Identitet presenteras alltid som en uttrycklig uppgift.
- Garage visar Sparat: Ospecificerat objekt och Ditt förslag: Identifierat
  objekt. Ingen del av identitetsjämförelsen visar Ej uppgivet.
- Läsningen sparar ingenting. Fokus stannar på objektets namn när raden
  fälls ihop.

### LÄS-06: återgå när den sista tabellsidan försvinner

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-reading.spec.ts",
    "caseId": "LÄS-06"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Återgå till föregående motsvarande radkontroll efter att sidantalet minskar under läsning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Återgå till föregående motsvarande radkontroll efter att
sidantalet minskar under läsning.

**Användare:** Alex Exempel.

**Förutsättningar:** Ett tomt provhushåll med 51 nya objekt i utkastet,
namngivna Objekt 1 till Objekt 51. Ett aktivt textsamtal och en andra
inloggad flik i samma hushåll. Använd sorteringen Namn A–Ö.

**Integrationstest:**
[household-reading.spec.ts](../../tests/integration/household-reading.spec.ts),
testfallet “LÄS-06: a vanished sole second-page row restores the preceding
control after page collapse”.

**Steg:**

1. Öppna Tabell och välj Nästa. Kontrollera att endast Objekt 51 finns på
   sida två. Öppna Samband för Objekt 51.
2. Välj **Tabell** i andra fliken, sök Objekt 51 och välj
   **Ta bort Objekt 51**. Vänta tills första flikens dialog visar att
   objektet inte längre finns.
3. Stäng med Escape och kontrollera tabellens sida och fokus.

**Förväntat resultat:**

- Tabellen visar sida ett av ett med de 50 kvarvarande objekten.
- Fokus återgår till Samband för Objekt 50. De övriga förslagen är kvar.

### LÄS-07: läs ett långt namn på smal skärm

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-reading.spec.ts",
    "caseId": "LÄS-07"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Läsa hela objektnamnet även när det saknar mellanslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Läsa hela objektnamnet även när det saknar mellanslag.

**Användare:** Alex Exempel.

**Förutsättningar:** Hushållet från Förbered läskedjan. Lägg ett objekt i
utkastet vars namn består av Långtobjektnamn upprepat tolv gånger utan
mellanslag. Prova 320 × 740 CSS-pixlar. Verklig förstoring och
uppläsning provas separat i LISTA-09.

**Integrationstest:**
[household-reading.spec.ts](../../tests/integration/household-reading.spec.ts),
testfallet “LÄS-07: a long unbroken object name wraps in full reading at
320 CSS pixels”.

**Steg:**

1. Öppna Tabell och expandera objektet genom att välja namnet.
2. Läs rubriken för alla uppgifter direkt i raden. Rulla genom
   uppgifterna och fäll ihop genom att välja namnet igen.

**Förväntat resultat:**

- Hela namnet bryts och går att läsa i radens detaljvy utan sidledsrullning.
- Uppgifterna och radens namn går att nå. Fokus stannar på namnet
  när raden fälls ihop.

## Sökning och filtrering

### LISTA-01: flera typval kombineras med sökning och aktuell rad

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-list.spec.ts",
    "caseId": "LISTA-01"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Begränsa en stor tabell utan att ändra hushållets uppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Begränsa en stor tabell utan att ändra hushållets uppgifter.

**Användare:** Alex Exempel.

**Förutsättningar:** Provkartan med 500 objekt är öppen i Tabell.
Välj Ta med upphörda i tabellens eget filter.

**Integrationstest:**
[object-list.spec.ts](../../tests/integration/object-list.spec.ts), testfallet
“LISTA-01: multiple type filters combine with search and the current row
across 500 objects”.

**Steg:**

1. Expandera Provobjekt 000 och Provobjekt 001. Båda raderna är öppna;
   Provobjekt 001 är den aktuella markeringen.
2. Öppna Filter, välj Person och Tjänst och stäng med Stäng filter.
   Kontrollera fyra sidor med femtio objekt per sida. Sök sammanhang 0.
   och kontrollera tjugo objekt på en sida.
3. Öppna Filter, välj Bara markerade och stäng. Kontrollera Provobjekt 001
   som enda träff. Avmarkera Person och Tjänst i Filter och kontrollera
   samma träff.
4. Stäng av Bara markerade och stäng filtret: femtio träffar. Välj Person
   och stäng filtret: tio träffar och fokus tillbaka på Filter.
5. Sök finns inte. Kontrollera tom tabell. Öppna
   Filter och välj Återställ sökning och filter. Stäng dialogen.
   Välj Ta med upphörda igen och kontrollera tio sidor med objekt.

**Förväntat resultat:**

- Typval kombineras med eller; sökning och markeringsfilter begränsar vidare.
- Filter förblir öppet under val. Stängning återför fokus till Filter.
- Provobjekt 001 behåller markeringen när sökning och filter återställs.
- Inga objekt, samband, utkast eller personliga placeringar ändras.

## Återfinna tabellen

### LISTA-02: sortering, sida och rulläge består vid tillfälliga besök

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-list.spec.ts",
    "caseId": "LISTA-02"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Behålla tabelläget och skydda oskickad formulärtext."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Behålla tabelläget och skydda oskickad formulärtext.

**Användare:** Alex Exempel.

**Förutsättningar:** Provkartan med 500 objekt i Tabell; Ta med upphörda
är valt i tabellens Filter.

**Integrationstest:**
[object-list.spec.ts](../../tests/integration/object-list.spec.ts), testfallet
“LISTA-02: sorting, pages and scroll survive native details, settings and
map-result navigation”.

**Steg:**

1. Sök Provobjekt och välj Person och Tjänst i Filter. Stäng filtret.
2. Bläddra genom fyra sidor med Namn A–Ö och sedan Typ A–Ö. Kontrollera
   samma 200 objekt. Lämna Typ A–Ö och sida fyra valda.
3. Expandera Provobjekt 496, rulla till radens redigeringsknapp med pennikon och
   öppna redigeringsformuläret. Stäng med krysset utan ändring.
   Kontrollera samma rulläge och fokus på pennikonen.
4. Redigera Provobjekt 496 och skriv Oskickat under listbesöket i
   Beskrivning. Välj Avbryt och tryck Escape i förlustvarningen.
   Kontrollera texten. Välj Avbryt igen och kasta endast formulärändringen.
5. Besök Inställningar och välj Tillbaka till kartan. Kontrollera Tabell,
   sökning, sortering, sida fyra och den fortfarande expanderade raden.
6. Välj Visa Provobjekt 496 i kartan och återvänd med Tabell.
   Kontrollera samma sökning, sida och typval.
7. Sök Provobjekt 496. Kontrollera en träff och Sida 1 av 1.

**Förväntat resultat:**

- Sortering ändrar ordningen, men inte resultatmängden eller antalet objekt.
- Redigeringsformuläret återför fokus och rulläge. Kart- och inställningsbesök
  bevarar sökning, filter, sortering, sida och expansion.
- Avbruten förlustvarning behåller oskickad text. Uttrycklig förlust
  påverkar bara formuläret; hushållets data och utkast är oförändrade.
- Sökning med färre träffar visar en giltig sida.

## Visa en träff i kartan

### LISTA-03: kartträffen fokuserar direkta grannar och behåller samtalet

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-list.spec.ts",
    "caseId": "LISTA-03"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Skilja tabellens aktuella rad från kartans fokuserade utsnitt."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skilja tabellens aktuella rad från kartans fokuserade utsnitt.

**Användare:** Alex Exempel.

**Förutsättningar:** Ett hushåll har Lo Exempel, Kim Exempel och
Långt borta. Lo har ett samband till Kim och Kim har ett till Långt borta.
Placera det sista objektet tydligt längre bort i den personliga vyn.
Samtal kan startas med testmiljöns ersättare för modelltjänsten.

**Integrationstest:**
[object-list.spec.ts](../../tests/integration/object-list.spec.ts), testfallet
“LISTA-03: a table map result focuses direct neighbors and preserves unsent
conversation”.

**Steg:**

1. Starta ett samtal i textläge. Skriv Oskickat medan jag söker utan att
   skicka och stäng textvyn.
2. Öppna Tabell, expandera Lo och Kim och sök Lo Exempel.
3. Välj Visa Lo Exempel i kartan. Kontrollera Lo:s markering och att
   Lo och direkta grannen Kim ryms i utsnittet.
4. Öppna Skriv till Skyttel. Kontrollera samma oskickade meddelande.
   Stäng textvyn och återvänd med Tabell.

**Förväntat resultat:**

- Lo är ensam markerad. Indirekta grannen Långt borta utökar inte utsnittet.
- Kartvisningen markerar objektet utan att öppna en detaljyta.
- Samtalet och dess oskickade text består. Tabellens sökning ger en träff.
- Hushållets uppgifter, utkast och personliga placeringar är oförändrade.

### LISTA-04: smal tabell och uppgifter fungerar när grafiken avbryts

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-list.spec.ts",
    "caseId": "LISTA-04"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Behålla tabellens arbete vid förlorad kartgrafik."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Behålla tabellens arbete vid förlorad kartgrafik.

**Användare:** Alex Exempel.

**Förutsättningar:** Hushållet från LISTA-03. Prova vid 320 CSS-pixlars bredd.
Automatprovet framkallar verklig WebGL-förlust. För manuellt prov
behövs en testmiljö där grafikavbrott kan framkallas.

**Separat förberedelse:** Förbered och framkalla avbrottet vid steg 3 enligt
[grafikförberedelsen](map-graphics-preparation.md#lista-04-och-lista-08).
Återställ grafiken och avsluta provinstallationen efter fallet.

**Integrationstest:**
[object-list.spec.ts](../../tests/integration/object-list.spec.ts),
LISTA-04.

**Steg:**

1. Öppna Tabell, sök Lo Exempel och välj Person i Filter. Kontrollera
   synligt tangentbordsfokus och åtkomligt typval. Stäng filtret.
2. Välj Visa Lo Exempel i kartan. Kontrollera markeringen.
3. Återvänd med Tabell och framkalla grafikavbrottet. Kontrollera samma
   sökning och att knappen för kartvisning blir inaktiv.
4. Expandera Lo och läs alla uppgifter direkt i raden. Fäll ihop raden
   med namnet igen och kontrollera återfokus på Lo Exempel. Öppna
   **Redigera Lo Exempel**, kontrollera namnfokus och ändra
   Beskrivning till Utan grafik.
5. Välj Avbryt och Escape i förlustvarningen. Kontrollera samma text och
   oförändrat utkast. Avbryt igen och kasta endast formulärändringen.
6. Öppna Filter och kontrollera Person. Fokusera typvalet och
   kontrollera synligt fokus och att dess träffyta kan nås även efter
   grafikförlusten. Stäng filtret och läs sökningen.

**Förväntat resultat:**

- Sökning, typval och läsning fungerar utan kartgrafik. Tabellens kolumner
  kan rullas i sidled; detaljer och formulär ryms inom skärmbredden.
- Grafikavbrottet förlorar varken markering, sökning eller filter.
- Oskickad text skyddas av förlustvarningen. Varken hushållets data,
  utkast eller personliga placeringar ändras av provet.

### LISTA-05: återgång på kort skärm bevarar synlig träff och fokus

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-list-flow.spec.ts",
    "caseId": "LISTA-05"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Återgå till samma tabellarbete i ett kort fönster."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Återgå till samma tabellarbete i ett kort fönster.

**Användare:** Alex Exempel.

**Förutsättningar:** Provkartan med 500 objekt. Prova 320 × 250 CSS-pixlar
i Chromium. Verklig förstoring och uppläsning provas i LISTA-09.

**Integrationstest:**
[object-list-flow.spec.ts](../../tests/integration/object-list-flow.spec.ts),
testfallet “LISTA-05: short-screen table returns preserve the visible result
and keyboard focus”.

**Steg:**

1. Öppna Tabell och välj Ta med upphörda i Filter. Expandera Provobjekt 045
   och rulla till radens redigeringsknapp med pennikon. Fokusera den och
   anteckna rulläget.
2. Öppna redigeringsformuläret. Kontrollera namnfokus och stäng med krysset
   utan att ändra något.
3. Besök Karta och återvänd med Tabell. Kontrollera samma rulläge och fokus.
4. Besök Inställningar och välj Tillbaka till kartan. Kontrollera samma
   tabelläge och synligt, åtkomligt fokus.
5. Rulla till Visa Provobjekt 045 i kartan, fokusera kontrollen och
   anteckna rulläget. Välj den och återvänd med Tabell.
6. Visa Karta och klicka i kartans sökfält. Kontrollera fokus i sökfältet.

**Förväntat resultat:**

- Återbesök bevarar tabellens inre och yttre rulläge när kontrollen är
  synlig. Ett ändrat utrymme efter Inställningar rullar bara så mycket
  som behövs för att visa samma fokuserade kontroll.
- Fokus återgår till använd kontroll; den är synlig och går att peka på.
- Sökfältet får fokus vid uttryckligt sökval. Hushållets data är oförändrade.

### Pensionerat LISTA-06 — utgånget fall för inaktiv listpanel

Fallet gäller första klicket i en fri listpanel bredvid en aktiv
objektpanel. De panelerna är avvecklade. ID:t återanvänds inte.
Vanlig tabelläsning och återgång provas i LISTA-02 och LISTA-05.

## Läsa och återfinna objekt

### LISTA-07: textåtgärder tar bort valt objekt utan kartgrafik

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-actions.spec.ts",
    "caseId": "LISTA-07"
  },
  "reference": "320×640, kontrollerat WebGL-avbrott; tangentbordsaktivering skyddar textalternativet.",
  "outcomes": [
    "Avbruten redigering behåller oskickat arbete; borttagningen omfattar valt objekt och fyra samband, med oberoende förslag kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Nå vanliga objektåtgärder utan kartgrafik och föreslå en
borttagning med verkliga beroenden utan att ändra sparade uppgifter.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Starta läskedjans installation enligt förberedelsen.
Öppna den i Chrome med WebGL avstängt, exempelvis med startflaggan
`--disable-webgl` och en separat tillfällig webbläsarprofil. Detta är ett
kontrollerat datorprov; vanliga nätverksavbrott ersätter inte förberedelsen.
Cykel har fyra samband, inklusive upphörda och samband utan identifierat
mål. Skapa separat **Behåll mig** med **Nytt objekt** och välj **Lägg i
utkastet och stäng**. Spara inte hela utkastet.

**Integrationstest:**
[object-actions.spec.ts](../../tests/integration/object-actions.spec.ts),
testfallet “LISTA-07: text object actions preserve cancellation and stage
only the chosen removal without map graphics”.

**Steg:**

1. Öppna **Tabell** och hitta **Cykel** utan att expandera raden.
   Kontrollera att den röda papperskorgsikonen **Ta bort Cykel** ligger
   längst till höger bland radens åtgärder. Läs dess hjälptext: objektet
   och dess fyra samband läggs som borttagningar i ditt utkast, medan
   den sparade kartan ändras först vid separat sparande.
2. Kontrollera att båda kartikonerna är inaktiva utan kartgrafik.
3. Öppna **Redigera Cykel** med tangentbord. Ändra beskrivningen till
   **Behåll mina oskickade uppgifter** och välj krysset.
4. Kontrollera fokus på **Fortsätt redigera** i förlustvarningen. Tryck
   Escape och kontrollera att beskrivningen består i samma stora formulär.
5. Välj krysset igen och **Kasta ändringarna och fortsätt**. Fokus återgår
   till redigeringsikonen; redan lagda förslag är kvar.
6. Fokusera **Ta bort Cykel** och tryck Enter. Läs **Föreslagen borttagning**
   i raden och kontrollera att papperskorgen nu är inaktiv. Fokus går till
   nästa tillgängliga borttagningsknapp, **Ta bort Garage**.
7. Öppna **Utkast** och granska objektets och de fyra sambandens
   borttagningsförslag samt **Behåll mig**. Spara inte hela utkastet.
   Oförändrad historik kontrolleras av automationen via HTTP.

**Förväntat resultat:**

- Radens åtgärder går att nå med tangentbord utan kartgrafik och utan
  att först öppna detaljvyn. Borttagning ligger längst till höger och
  förklaras både i tooltip och för skärmläsare.
- Redigeringen använder samma stora formulär. Escape avbryter förlusten;
  uttryckligt kastande tar bara bort den oskickade beskrivningen.
- Borttagningen läggs bara i ditt utkast. Den gäller Cykel och dess fyra
  verkliga samband; det oberoende förslaget **Behåll mig** består.
- En redan föreslagen borttagning kan inte skickas igen från raden.
  Fokus återgår till nästa tillgängliga motsvarande radkontroll.
- Sparade objekt, samband och ändringshistorik är oförändrade tills hela
  utkastet sparas separat.

## Separat sökning i karta och tabell

För dessa fall startar du provinstallationen med
`node --import tsx scripts/manual-household-table.ts --search` efter
`npm run build`. Den använder samma offentliga förberedelse som
integrationstesterna och innehåller också **Övrigt Élan** med beskrivningen
**Åker äpple** och det egna fältet **Hemlig anteckning**. A 2 har ett
samband till objektet med typen **Endast i sambandet**.

### SÖK-01: alla ord, egna detaljfält och svensk teckensammansättning

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-search.spec.ts",
    "caseId": "SÖK-01"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Hitta objekt genom deras fullständiga egna uppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Hitta objekt genom deras fullständiga egna uppgifter.

**Användare:** Alex Exempel.

**Förutsättningar:** En ny provinstallation för sökning är öppen i Tabell.

**Integrationstest:**
[object-search.spec.ts](../../tests/integration/object-search.spec.ts),
“SÖK-01: own detail fields, every word and Swedish normalization find objects”.

**Steg:**

1. Sök efter **399 EGEN**. Kontrollera en träff på A 2 och besked om
   Egen anteckning och Pris. Sök efter **299 egen** och kontrollera samma
   träff genom priset som visas som tidigare sparat värde.
   <!-- cSpell:disable-next-line -->
2. Sök efter **anteck elan öv**. Kontrollera noll träffar. Sök i stället
   <!-- cSpell:disable-next-line -->
   efter **anteck élan öv**, även med sammansatta accenttecken.
3. Sök efter **Endast i sambandet** och kontrollera noll träffar.
   Sök efter **Övrigt Élan** och kontrollera en träff, utan A 2.
   Sök efter **ake**. Kontrollera noll träffar och att fokus stannar i
   sökfältet.
   Öppna **Filter**, välj **Återställ sökning och filter** och stäng dialogen.
4. Sök efter **åke beskrivning**. Kontrollera en träff på Åke.

**Förväntat resultat:**

- Alla delord måste finnas; ordning och skiftläge spelar ingen roll.
- Orden kan finnas i olika egna fält, även dolda fält och ekonomi.
  Både visade sparade värden och förslag kan ge träff.
- Sammansatta tecken matchar sina färdiga motsvarigheter. Å, ä och ö
  behåller sina betydelser. Träffens detaljfält anges med namn.
- Sökning ändrar inte hushållets uppgifter eller utkastet.

### SÖK-02: flerval skiljer utkastförslag från upphörda och borttagna

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-search.spec.ts",
    "caseId": "SÖK-02"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Kombinera filter utan att blanda samman olika statusar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kombinera filter utan att blanda samman olika statusar.

**Användare:** Alex Exempel.

**Förutsättningar:** En ny provinstallation för sökning är öppen i Tabell.

**Integrationstest:**
[object-search.spec.ts](../../tests/integration/object-search.spec.ts),
“SÖK-02: multiple filters combine independently and keep proposals distinct
from lifecycle”.

**Steg:**

1. Öppna Filter och välj Typ 2, Typ 10, Nytt och Ändrat. Stäng med Escape.
   Kontrollera A 2, Nytt prov och Övrigt Élan.
2. Expandera A 2 och välj Bara markerade i Filter. Kontrollera en träff.
3. Återställ sökning och filter i dialogen. Välj Föreslagen borttagning.
   Kontrollera noll träffar; utkastfiltret finns kvar.
4. Välj Ta med upphörda. Stäng dialogen och kontrollera Tas bort prov.
5. Avmarkera Föreslagen borttagning och välj Ta med borttagna.
   Stäng och sök efter borttaget. Läs Borttaget prov.

**Förväntat resultat:**

- Val inom samma filter förenas, olika filter begränsar varandra.
- Escape stänger dialogen med valen kvar och återfokus på Filter.
- Upphört, borttaget och föreslagen borttagning är olika uppgifter.
- Aktuella objekt är startläget. Markeringen finns kvar vid återställning.

### SÖK-03: kartans eget fokus startar sökning med färdigt tecken

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-search.spec.ts",
    "caseId": "SÖK-03"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Söka från kartan utan att fånga annan inmatning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Söka från kartan utan att fånga annan inmatning.

**Användare:** Alex Exempel.

**Förutsättningar:** En ny provinstallation för sökning är öppen i Karta.

**Integrationstest:**
[object-search.spec.ts](../../tests/integration/object-search.spec.ts),
“SÖK-03: map-only character and composition entry preserve separate searches
and Escape restrictions”.

**Steg:**

1. Kontrollera att sökfältet och Filter syns direkt.
   Klicka i kartans sökfält och kontrollera sökfältets fokus. Sök efter 299
   EGEN.
   Kontrollera A 2 i kartan.
2. Öppna Filter och kontrollera en träff. Välj Typ 10 och kontrollera noll
   träffar i dialogen. Tryck Escape. Kontrollera fokus på Filter,
   en badge för Typ 10 efter knappen och bevarad söktext. Knappen visar
   Filter. Tryck på **Typ 10** för att ta bort filtret.
   Kontrollera A 2, samma söktext och
   återfokus på **Filter**. Välj Typ 10 i dialogen igen och stäng med Escape.
   Fokusera kartbakgrunden
   och skriv b följt av mellanslag och 12. Kontrollera b 12 i sökfältet,
   sökfältets fokus och stängd filterdialog.
3. Sök efter A 10. Tryck Escape i sökfältet och kontrollera fokus på
   kartan med text och filter kvar. Öppna Filter och kontrollera Typ 10.
   Klicka i sökfältet och kontrollera stängd dialog med valen kvar.
4. Besök Tabell, expandera A 2 så att det markeras och skriv åke följt av x
   i tabellens sökfält. Återgå till Karta. Fokusera kartbakgrunden och
   skriv ö. Kontrollera ersatt söktext, kvarvarande Typ 10 och sökfokus.
5. Fokusera kartan och bygg ett sammansatt å. Bara det färdiga tecknet
   flyttar fokus och ändrar sökningen. Prova ett kortkommando: söktexten
   ska finnas kvar och sökfältet ska inte få fokus.
6. Öppna Nytt objekt och skriv ett namn med bokstäver och siffror.
   Avbryt och kasta formulärtexten via förlustvarningen. Öppna Skriv till
   Skyttel och skriv ett oskickat meddelande. Kontrollera vanlig inmatning
   utan ändrad söktext. Stäng textvyn och kontrollera samma söktext.
7. Välj krysset i sökfältet. Kontrollera tom text med kvarvarande Typ 10
   och markering. Skriv A 2 och välj Återställ filter i dialogen:
   söktexten ska finnas kvar och alla filter ska vara återställda.
8. Välj Typ 2 och Bara markerade. Stäng dialogen, fokusera kartbakgrunden
   och tryck Escape en gång. Kontrollera tom söktext, återställda filter
   och bevarad markering. Upprepa med bara Typ 10 och redan tom söktext.
9. Sök efter finns inte. Kontrollera tom karta.
   Återgå till Tabell och kontrollera dess separata söktext.
   Sök efter A 2 och kontrollera markeringen. Öppna textvyn och kontrollera
   det oskickade meddelandet.

**Förväntat resultat:**

- Sökfältet och Filter syns utan att en sökning behöver startas.
  Ett klick i fältet och färdigt tecken från kartbakgrunden ger sökfältet fokus.
- Krysset rensar bara texten. Återställ filter rensar bara filtervalen.
  Escape på kartbakgrunden rensar båda i en tryckning och behåller urvalet.
- Escape i sökfältet återför fokus till kartan med sökningen kvar.
  Escape i dialogen stänger den med valen kvar och återfokus på Filter.
- Aktiva val visas som badges efter Filter utan en gemensam ram och
  kan tas bort utan att söktexten ändras.
  När sista valet tas bort återgår fokus till Filter.
- Kortkommandon, formulär och samtal behåller sin vanliga inmatning.
  Vyernas sökningar, markeringen och oskickat meddelande finns kvar.
- Reglagens tillgängliga namn och fokus provas i den vanliga webbytan.
  Faktisk NVDA- och VoiceOver-uppläsning provas i
  [LISTA-09](#lista-09-verklig-zoom-och-uppläsning-ger-hela-läsalternativet).

### SÖK-04: sista förslaget återställer bara båda vyernas utkastfilter

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-search.spec.ts",
    "caseId": "SÖK-04"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Behålla sökning när det villkorliga filtret inte längre behövs."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Behålla sökning när det villkorliga filtret inte längre behövs.

**Användare:** Alex Exempel.

**Förutsättningar:** En ny provinstallation för sökning har sitt förberedda
utkast.

**Integrationstest:**
[object-search.spec.ts](../../tests/integration/object-search.spec.ts),
“SÖK-04: the last proposal resets only draft filters in both views and
type-only proposals expose them”.

**Steg:**

1. Sök efter A 2 i kartan, öppna Filter och välj Typ 2 och Ändrat.
   Stäng filterdialogen.
2. Sök efter prov i Tabell och välj Typ 2 och Nytt. Stäng filterdialogen.
3. Öppna **Utkast**, välj **Kasta hela utkastet**, läs bekräftelsen och
   välj **Ta bort hela utkastet**. Kontrollera att utkastet är tomt.
4. Stäng textvyn. Återvänd till Tabell och sedan kartans sökyta. Kontrollera
   bevarad
   söktext och Typ 2, återställt utkastfilter och besked om återställningen.
5. Välj **Inställningar → Typer och egna fält → Ny objekttyp**. Ange
   **Enbart typförslag**, lämna beskrivning och fält tomma och välj
   **Lägg typförslaget i mitt utkast**. Läs beskedet och välj
   **Tillbaka till kartan**. Sök efter finns inte. Öppna Filter och
   kontrollera att utkastfiltret finns trots tom karta.

**Förväntat resultat:**

- Bara utkastvalen rensas när det sista förslaget försvinner.
- Utkastfiltret döljs och återställningen meddelas när det har ett aktivt val.
- Typförslag och bortfiltrerade förslag räcker för att visa filtret.

### SÖK-05: mobil sökingång och filterdialog bevarar begränsningar

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-search.spec.ts",
    "caseId": "SÖK-05"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Sökning och filter behåller text, val och fokus i smala CSS-vyer."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Sökning och filter behåller text, val och fokus i smala CSS-vyer.

**Användare:** Alex Exempel.

**Förutsättningar:** En ny provinstallation för sökning i Chromium med
390 CSS-pixlars bredd. Verklig pekning, skärmtangentbord och förstoring på
iPhone och iPad provas i [SÖK-16](#sök-16-fysisk-mobilsökning-bevarar-text-filter-och-fokus).
VoiceOver provas i [LISTA-09](#lista-09-verklig-zoom-och-uppläsning-ger-hela-läsalternativet).

**Integrationstest:**
[object-search.spec.ts](../../tests/integration/object-search.spec.ts),
“SÖK-05: shared compact search and filter dialogs preserve restrictions on
mobile and desktop”.

**Steg:**

1. Klicka i kartans sökfält, skriv prov och välj **Ta med upphörda** i
   **Filter**. Stäng med Escape och kontrollera samma söktext.
2. Välj **Tabell**, sök efter 399 egen och öppna **Filter** till höger om
   sökfältet. Kontrollera fokus på **Tabellens filter**. Välj **Typ 2**.
   Kontrollera en träff i dialogen och att tabellen uppdateras direkt.
3. Stäng med krysset. Kontrollera samma söktext, en rad och ett aktivt
   filter för Typ 2. Välj krysset i sökfältet och kontrollera tom söktext,
   sökfokus och kvarvarande typfilter. Skriv 399 egen igen.
4. Öppna Filter igen. Kontrollera kvarvarande Typ 2. Nå varje snabbval och
   **Återställ sökning och filter** med tangentbord, även när innehållet
   behöver rullas. Stäng med Escape och kontrollera återfokus på Filter.
   Upprepa med dialogens kryss och genom att klicka utanför dialogen.
5. Prova på dator, vid 320 pixlars bredd och i ett kort fönster. Kontrollera
   att dialogens val går att nå utan att söktext eller filter ändras av
   stängningen. Dessa vyer använder CSS-storlek; de fysiska
   enhetsobservationerna har separata fall enligt förutsättningarna.
6. Ta bort Typ 2 via dess kryss och kontrollera oförändrad söktext samt
   återfokus på Filter. Välj **Ta med borttagna** i dialogen, stäng och
   ta bort det aktiva filtret via dess kryss. Öppna dialogen och kontrollera
   att valet är återställt.
7. Välj Typ 10 och **Återställ sökning och filter**. Kontrollera tom text
   och inga valda filter. Återgå till kartan och kontrollera prov samt
   kvarvarande **Ta med upphörda**.

**Förväntat resultat:**

- Båda vyerna har sökfält med kryss och Filter till höger. Söktext ensam
  markerar inga filter som aktiva. Krysset rensar bara texten och ger sökfokus.
- Tabellens kompakta dialog visar snabbval och ett direkt uppdaterat
  träffantal. Filtervalen kan nås med tangentbord och har läsbara namn.
- Krysset och Escape stänger dialogen och återför fokus till Filter.
  Klick i sökfältet stänger dialogen och ger sökfokus. Valen finns kvar.
- Aktiva filter kan tas bort var för sig med söktexten kvar. Sista
  borttagna filtret ger återfokus på Filter.
- Återställ sökning och filter tömmer båda i tabellen. Kartans sökning
  och filter samt hushållets uppgifter och utkast är oförändrade.
- CSS-vyerna behåller söktext, filter och återfokus med vanlig inmatning.

### SÖK-10: synlig kapselsökning och liten filterdialog på olika skärmar

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-search.spec.ts",
    "caseId": "SÖK-10"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Nå kartans sökning och filter på dator och liten skärm."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Nå kartans sökning och filter på dator och liten skärm.

**Användare:** Alex Exempel.

**Förutsättningar:** En ny provinstallation för sökning är öppen i Karta.
Använd CSS-vyerna 1280 × 900, 800 × 900, 390 × 844, 320 × 640 och
320 × 250 med tangentbord. Verklig förstoring och pekning provas i
[SÖK-16](#sök-16-fysisk-mobilsökning-bevarar-text-filter-och-fokus) och
uppläsning i [LISTA-09](#lista-09-verklig-zoom-och-uppläsning-ger-hela-läsalternativet).

**Integrationstest:**
[object-search.spec.ts](../../tests/integration/object-search.spec.ts),
“SÖK-10: capsule search and attached filters fit desktop and narrow short
screens”.

**Steg:**

1. Kontrollera att ett kapselformat sökfält syns direkt, centrerat högst
   upp på dator och under verktygen på telefon. Krysset finns i fältet
   och Filter till höger. Ingen del ska täcka verktygens knappar.
2. Öppna Filter. Kontrollera liten dialog under knappen och avsnitten
   Objekttyp, Status och Förslag i ditt utkast. Fokus går till rubriken.
   Nå Person med Tab och använd mellanslag för att slå på valet.
   Kontrollera bocken och att fokus stannar på valet.
   En badge för Person visas efter Filter på dator och på nästa rad
   på smal skärm. Knappen visar Filter utan antal.
   Använd mellanslag igen för att slå av Person och kontrollera att
   dess badge försvinner.
3. Använd Tab för att nå de sista filtervalen och Återställ filter.
   Kontrollera att innehållet går att rulla utan rullning i sidled.
4. Tryck Escape och kontrollera stängd dialog och fokus tillbaka på Filter.
   Upprepa vid de återstående CSS-storlekarna, inklusive det korta fönstret.
5. Öppna Utkast på dator och skriv ett oskickat meddelande. Öppna Filter,
   välj Återställ filter och tryck Escape. Kontrollera att dialogen går
   att använda över textvyn och att meddelandet finns kvar.
6. I ett mycket kort telefonfönster, öppna A 2 i Tabell och välj
   **Visa A 2 i kartan**. Fokusera A 2, tryck Skift+F10 och välj
   **Visa uppgifter för A 2**.
   Sökfältet ska synas bredvid de rullbara verktygen och uppgifterna
   ska gå att läsa. Stäng uppgifterna och kontrollera sökfältet under verktygen.

**Förväntat resultat:**

- Sökfält, kryss och Filter är synliga och går att använda på alla skärmar.
- Dialogen ryms på skärmen och långa filterlistor går att rulla.
- Snabbvalen visar en bock när de är på och går att slå av igen med
  mellanslag utan fokusflytt. Dialogen visar antalet träffar.
- Krysset och filtervalen har tillgängliga namn; Tab och Escape
  behåller en användbar fokusordning.

### SÖK-11: filterdialogen ligger ovanpå kartan utan att flytta etiketter

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/object-search.test.tsx",
    "caseId": "SÖK-11"
  },
  "reference": "Chromium vid 1280 × 900 med fullständigt kontrollerat kartsvar från tabellförberedelsen, inklusive sparad borttagning och tre förslag; ingen serverbeständighet provas här.",
  "outcomes": [
    "Öppna och stänga filter utan att kartans layout ändras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Öppna och stänga filter utan att kartans layout ändras.

**Användare:** Alex Exempel.

**Förutsättningar:** Följ Förbered hushållets tabell ovan och välj Karta.
Prova 1280 × 900 CSS-pixlar med flera objekt och synliga etiketter.

**Automatiskt motsvarande webbläsartest:**
[object-search.test.tsx](../../tests/browser/object-search.test.tsx),
SÖK-11.

Chromium-provet använder hela tabellförberedelsens kartsvar och profilbilder
som kontrollerade svar. Det provar kartans verkliga kontroller och stilar
och att filterarbetet inte skickar någon ändringsbegäran. SÖK-01, SÖK-03,
SÖK-05 och SÖK-08 behåller sina egna verkliga HTTP-flöden och jämför
hushållets fullständiga tillstånd; detta webbläsarprov bevisar inte
beständigt sparande.

**Steg:**

1. Vänta tills kartan är stilla. Notera objektens och etiketternas lägen.
2. Öppna Filter utan att göra något val. Vänta flera sekunder och
   kontrollera även etiketter utanför dialogen.
3. Stäng med Escape och vänta igen. Kontrollera lägena och fokus på Filter.
4. Öppna Filter, välj Ta med upphörda och stäng med Escape.
   Vänta tills kartan är stilla och notera dess nya innehåll och lägen.
5. Upprepa steg 2 och 3 utan att ändra något val. Kontrollera att raden
   med aktiva filter finns kvar och att hushållets utkast är oförändrat.

**Förväntat resultat:**

- Dialogen täcker kartan utan att flytta objekt, samband eller etiketter,
  vare sig direkt eller efter en fördröjning. Stängning ger inget hopp.
- Samma beteende gäller med och utan aktiva filter. Endast ändrade
  filterval påverkar vilka objekt som visas.
- Fokus går till dialogrubriken vid öppning och till Filter vid Escape.
  Hushållets sparade uppgifter och utkast ändras inte.

### SÖK-12: streckade linjer till etiketter syns i båda teman

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/object-search.test.tsx",
    "caseId": "SÖK-12"
  },
  "reference": "Chromium vid 1280 × 720, ljust och mörkt systemtema samt manuellt temaval; kontrollerade svar för kontots temaval, fullständigt kartsvar och profilbilder, produktens stilar och verklig canvasmätning.",
  "outcomes": [
    "Kunna följa linjerna från kartobjekt till deras etiketter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kunna följa linjerna från kartobjekt till deras etiketter.

**Användare:** Alex Exempel.

**Förutsättningar:** Följ Förbered hushållets tabell ovan och välj Karta
med synliga etiketter vid 1280 × 720 CSS-pixlar. Telefon och läsbarhet på
verklig skärm är kompletterande manuella observationer.

**Automatiskt motsvarande webbläsartest:**
[object-search.test.tsx](../../tests/browser/object-search.test.tsx),
testfallet “SÖK-12: dashed label leaders are readable against the map in
both themes”.

Provet använder samma fullständiga kontrollerade kartsvar och profilbilder
som SÖK-11. Produktkontrasten mäts genom kartans faktiska linje, opacitet,
bakgrund och teckenförklaring. Kontots temaval använder produktens
temahantering med kontrollerade HTTP-svar. De sex tekniska
kontrastberäkningarna i hjälpsviten ersätter inte detta produktprov. Det
provar inga serversparanden.

**Steg:**

1. Välj Tema → System. Ändra enhetens tema mellan ljust och mörkt och
   kontrollera att kartan följer det.
2. Välj Tema → Mörkt. Följ de streckade linjerna mellan flera objekt
   och deras etiketter. Kontrollera att linjerna syns mot bakgrunden
   och har samma färg som punkterna i teckenförklaringen.
3. Välj Tema → Ljust och upprepa kontrollen.

**Förväntat resultat:**

- Linjerna är synliga i båda teman och det går att följa vilken etikett
  som hör till vilket objekt. Streckningen skiljer dem från samband.
- Automatprovet mäter färgkontrast med linjens genomskinlighet mot
  kartans bakgrund. Läsbarhet på verkliga skärmar behöver manuellt prov.

### SÖK-06: direkta grannar och fortsatt utforskning bevarar sökträffarna

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-exploration.spec.ts",
    "caseId": "SÖK-06"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Följa en kedja i kartan utan automatisk indirekt expansion."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Följa en kedja i kartan utan automatisk indirekt expansion.

**Användare:** Alex Exempel.

**Förutsättningar:** Förbered utforskning i kartan utan extra flagga.

**Integrationstest:**
[map-exploration.spec.ts](../../tests/integration/map-exploration.spec.ts),
testfallet “SÖK-06: map search shows direct context and exploration preserves
hits through return and table visits”.

**Steg:**

1. Klicka i kartans sökfält, skriv **Alex** och tryck Escape i sökfältet.
2. Läs Alex som sökträff och Blå cykel som sammanhang. Markera cykeln
   med tangentbord. Kontrollera att Garaget inte visas ännu.
3. Tryck Shift+F10 på cykeln och välj sambandsikonen
   **Visa samband i kartan**. Kontrollera Garaget, tidigare innehåll
   och kamerans förflyttning. Markera Garaget och upprepa för Bostaden.
4. Öppna Filter och välj Alex objekttyp. Kontrollera återgång till
   Alex och cykeln. Skriv **Blå** och kontrollera dess direkta grannar;
   Bostaden visas inte. Skriv **Alex** igen och tryck Escape i sökfältet.
5. Markera cykeln och följ dess samband igen. Besök **Tabell** och
   återgå via **Karta**. Välj **Tillbaka till sökträffarna**.
6. Kontrollera att sökningen **Alex** finns kvar. Tryck Shift+F10 på cykeln
   och välj kartikonen **Visa i kartan**. Kontrollera cykelns markering,
   Bostaden i kartan, fokus på kartan samt tom sökning och återställda filter.

**Förväntat resultat:**

- En träff visas; sammanhang har egen text och symbol och räknas inte.
- Enbart markering utökar inte kartan. Varje följd åtgärd visar en nivå
  till, behåller tidigare innehåll och flyttar kameran.
- Sökning och filter börjar om med direkt sammanhang. Tabellbesök
  bevarar däremot utforskningen. Återgången behåller söktext och filter,
  visar Alex och cykeln och ger användbart fokus i kartan.
- Karta, utkast och gemensam historik ändras inte.
- Kartikonen **Visa i kartan** återställer sökning och filter; sambandsikonen
  behåller
  dem. Ingen av åtgärderna ändrar hushållets information.

### SÖK-07: sammanhang går utanför träfffilter men följer upphört

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-exploration.spec.ts",
    "caseId": "SÖK-07"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Skilja träfffilter från livscykelregler för sammanhang."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skilja träfffilter från livscykelregler för sammanhang.

**Användare:** Alex Exempel.

**Förutsättningar:** Förbered utforskning med `--ended`. Alex har ett
ändringsförslag. Cykeln har annan typ; en upphörd granne och ett upphört
samband till Oberoende objekt är direkt kopplade till Alex.

**Integrationstest:**
[map-exploration.spec.ts](../../tests/integration/map-exploration.spec.ts),
testfallet “SÖK-07: direct context ignores hit filters while ended objects and
edges require inclusion”.

**Steg:**

1. Markera Alex. Skriv **Alex** i sökfältet. Öppna Filter och välj Alex
   objekttyp, **Ändrat** och **Bara markerade**. Stäng filterdialogen.
2. Kontrollera Alex som sökträff och cykeln som sammanhang. Läs
   upplysningen om dolt upphört innehåll.
3. Välj upplysningens **Ta med upphörda**. Kontrollera båda ytterligare
   grannarna och att Alex fortfarande är sökträff.
4. Öppna Filter och avmarkera **Bara markerade** och **Ta med upphörda**.
   Stäng filterdialogen, markera cykeln och tryck Shift+F10.
   Välj sambandsikonen **Visa samband i kartan**.
5. Öppna **Tabell**, välj **Redigera Blå cykel** och öppna
   **Livscykel och utseende**. Ändra objektets status till **Upphört**
   och välj **Lägg i utkastet och stäng**.
6. Återgå till **Karta**. Kontrollera att den utforskade cykeln döljs.
   Välj **Ta med upphörda** från upplysningen och kontrollera cykeln.
   Markera cykeln, tryck Shift+F10 och välj **Visa samband i kartan** igen för
   att
   kontrollera Garaget.

**Förväntat resultat:**

- Alex är enda träffen. Cykeln visas trots annan typ, avsaknad av
  ändringsförslag, annan söktext och att den inte är markerad.
- Upphörd granne och upphört samband döljs tills de uttryckligen tas med.
- Inkludering visar båda grannarna utan att räkna dem som sökträffar.
- Utforskningen ändrar inte utkastet eller den gemensamma informationen.
  Redigeringen i steg 5 lägger enbart statusändringen i utkastet.
- Ett tidigare utforskat objekt som föreslås upphöra döljs också när
  upphörda inte tas med. Ändrat filter återgår till träffarnas direkta
  grannar; fortsatt utforskning visar Garaget. Den gemensamma kartan
  är fortsatt oförändrad.

### SÖK-08: tabellens kartknapp återställer kartfilter och bevarar tabelläget

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-exploration.spec.ts",
    "caseId": "SÖK-08"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Visa ett valt tabellobjekt med direkt sammanhang i kartan."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Visa ett valt tabellobjekt med direkt sammanhang i kartan.

**Användare:** Alex Exempel.

**Förutsättningar:** Förbered utforskning med `--removed`. Cykeln har
föreslagen borttagning och Oberoende objekt är redan borttaget. Prova 1280
CSS-pixlars bredd och 950 pixlars höjd.

**Integrationstest:**
[map-exploration.spec.ts](../../tests/integration/map-exploration.spec.ts),
SÖK-08.

**Steg:**

1. Sök efter **Alex** i kartan och välj **Bara markerade** utan markering.
2. Välj **Tabell**, sök **Blå**, sortera namn Ö–A och expandera cykeln.
3. Läs kartikonernas tooltips. Välj **Visa samband för Blå cykel i kartan**.
   Kontrollera cykelns markering och Garaget. Bostaden visas inte som
   direkt sammanhang. Tryck Shift+F10 på cykeln och kontrollera sju ikoner,
   med samma kartikoner som listans motsvarande åtgärder. Välj
   **Visa samband i kartan**.
   Kartans sökning **Alex** och **Bara markerade** består.
   Återvänd med **Tabell** och kontrollera fokus på samma kartikon samt
   sökningen **Blå**. Välj sedan **Visa Blå cykel i kartan**. Kontrollera
   markering och direkt sammanhang. Bostaden finns nu kvar i kartan.
4. Kontrollera tom text i kartans synliga sökfält. Öppna Filter och
   kontrollera återställda filter. De fyra objekten ska finnas i kartan.
   Stäng filterdialogen och återgå via **Tabell**.
5. Kontrollera fokus, söktext, sortering och öppen rad. Sök sedan
   **Oberoende**, öppna **Filter** och välj **Ta med borttagna**.

**Förväntat resultat:**

- Endast cykeln markeras. Kameran visar dess direkta grannar; övrig
  karta filtreras inte bort och fokus går till kartan.
- Sambandsikonen behåller kartans begränsningar. **Visa i kartan**
  återställer dem. Tooltips förklarar skillnaden även för skärmläsare.
- Tabellens sökning, sortering och
  expanderade rad finns kvar; fokus återgår till kartknappen.
- Föreslagen borttagning har kartknapp. Redan borttaget objekt saknar den.
- Besöket ändrar ingen sparad information och inget förslag.

### SÖK-09: ändrade samband visar tidigare och föreslagna direkta ändpunkter

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-exploration.spec.ts",
    "caseId": "SÖK-09"
  },
  "reference": "Isolerad Chromium-installation med syntetiska hushållsdata; vald konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Läsa en föreslagen kopplingsändring inom sökträffens sammanhang."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Läsa en föreslagen kopplingsändring inom sökträffens sammanhang.

**Användare:** Alex Exempel.

**Förutsättningar:** Förbered utforskning utan extra flagga.

**Integrationstest:**
[map-exploration.spec.ts](../../tests/integration/map-exploration.spec.ts),
testfallet “SÖK-09: a changed connection shows direct saved and proposed
endpoints without expanding their chains”.

**Steg:**

1. Öppna Alex samband från tabellen. Ändra sambandet till Blå cykel
   så att målobjektet är Garaget. Lägg det i utkastet utan att spara.
2. Öppna kartan, sök **Alex** och tryck Escape i sökfältet. Läs tidigare och
   föreslagen koppling. Kontrollera att Bostaden inte visas.
3. Kasta förslaget. Markera det ursprungliga sambandet som upphört
   och spara. Föreslå sedan målobjekt Garaget och status Aktuellt.
4. Sök **Alex** i kartan igen. Kontrollera att tidigare upphört samband
   och cykeln döljs. Välj upplysningens **Ta med upphörda**.

**Förväntat resultat:**

- Alex är enda träffen. Båda direkta ändpunkterna är sammanhang när
  deras samband är aktuella eller upphörda uttryckligen tas med.
- Tidigare koppling skiljs från förslaget med geometri, symbol och text.
- Ingen indirekt kedja öppnas automatiskt. Upphört gäller även tidigare
  samband, som åter syns efter uttrycklig inkludering.

### LISTA-08: LISTA-04 vid 390 × 844

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/object-list.spec.ts",
    "caseId": "LISTA-08"
  },
  "reference": "390 × 844",
  "outcomes": [
    "Samma handlingar ger de skyddade resultaten under angivna steg.",
    "Kontroller och fokus förblir åtkomliga i den valda konfigurationen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** LISTA-04 vid 390 × 844.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Nytt hushåll enligt LISTA-03 och 390 CSS-pixlars bredd.
Skyddet gäller filter, träffytor och samma vanliga läsning/redigering
efter verklig grafikförlust.

**Integrationstest:**
[object-list.spec.ts](../../tests/integration/object-list.spec.ts),
LISTA-08.

**Steg:**

1. Utför LISTA-04 en gång med denna konfiguration. Utför alla steg i samma
   ordning.
2. Under formulär- och vybytena kontrollerar du läsbart innehåll, synligt
   fokus och att nästa angivna kontroll går att nå.

**Förväntat resultat:**

- Samma handlingar ger de skyddade resultaten under angivna steg.
- Kontroller och fokus förblir åtkomliga i den valda konfigurationen.

### SÖK-13: SÖK-08 vid 390 × 950

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-exploration.spec.ts",
    "caseId": "SÖK-13"
  },
  "reference": "390 × 950",
  "outcomes": [
    "Samma handlingar ger de skyddade resultaten under angivna steg.",
    "Kontroller och fokus förblir åtkomliga i den valda konfigurationen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** SÖK-08 vid 390 × 950.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Förbered utforskning med --removed vid 390 CSS-pixlars
bredd.
Skyddet gäller skilda kart- och tabellfilter samt återfokus.

**Integrationstest:**
[map-exploration.spec.ts](../../tests/integration/map-exploration.spec.ts),
SÖK-13.

**Steg:**

1. Utför SÖK-08 en gång med denna konfiguration. Utför alla steg i samma
   ordning.
2. Under formulär- och vybytena kontrollerar du läsbart innehåll, synligt
   fokus och att nästa angivna kontroll går att nå.

**Förväntat resultat:**

- Samma handlingar ger de skyddade resultaten under angivna steg.
- Kontroller och fokus förblir åtkomliga i den valda konfigurationen.

### SÖK-14: SÖK-08 vid 320 × 950

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-exploration.spec.ts",
    "caseId": "SÖK-14"
  },
  "reference": "320 × 950",
  "outcomes": [
    "Samma handlingar ger de skyddade resultaten under angivna steg.",
    "Kontroller och fokus förblir åtkomliga i den valda konfigurationen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** SÖK-08 vid 320 × 950.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Förbered utforskning med --removed vid 320 CSS-pixlars
bredd.
Skyddet gäller omflöde och åtkomliga kart-/tabellkontroller.

**Integrationstest:**
[map-exploration.spec.ts](../../tests/integration/map-exploration.spec.ts),
SÖK-14.

**Steg:**

1. Utför SÖK-08 en gång med denna konfiguration. Utför alla steg i samma
   ordning.
2. Under formulär- och vybytena kontrollerar du läsbart innehåll, synligt
   fokus och att nästa angivna kontroll går att nå.

**Förväntat resultat:**

- Samma handlingar ger de skyddade resultaten under angivna steg.
- Kontroller och fokus förblir åtkomliga i den valda konfigurationen.

### SÖK-15: SÖK-11 vid 390 CSS-pixlar

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/object-search.test.tsx",
    "caseId": "SÖK-15"
  },
  "reference": "Chromium vid 390 × 900 med samma fullständiga kontrollerade kartsvar och profilbilder som SÖK-11; ingen serverbeständighet provas här.",
  "outcomes": [
    "Samma handlingar ger de skyddade resultaten under angivna steg.",
    "Kontroller och fokus förblir åtkomliga i den valda konfigurationen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** SÖK-11 vid 390 CSS-pixlar.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Följ Förbered hushållets tabell ovan och välj Karta
vid 390 × 900 CSS-pixlar.
Skyddet gäller att filterdialogen inte flyttar kartans etiketter.

**Automatiskt motsvarande webbläsartest:**
[object-search.test.tsx](../../tests/browser/object-search.test.tsx),
SÖK-15.

Kontrollerade svar och skyddets gräns är samma som i SÖK-11.

**Steg:**

1. Utför SÖK-11 en gång med denna konfiguration. Utför alla steg i samma
   ordning.
2. När du öppnar och stänger Filter kontrollerar du läsbart innehåll,
   synligt fokus och att nästa angivna kontroll går att nå.

**Förväntat resultat:**

- Samma handlingar ger de skyddade resultaten under angivna steg.
- Kontroller och fokus förblir åtkomliga i den valda konfigurationen.

### SÖK-16: fysisk mobilsökning bevarar text, filter och fokus

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Prova verklig pekning, skärmtangentbord och förstoring på både iPhone och iPad. Kontrollera söktext, filter, kontrollers nåbarhet och återfokus."
  },
  "reference": "Fysiska iPhone och iPad med skärmtangentbord och verklig zoom 200 och 400 procent.",
  "outcomes": [
    "Skärmtangentbordet skriver i rätt sökfält utan att ändra den andra vyns sökning.",
    "Pekning och verklig förstoring lämnar sökfält, kryss och samtliga filterval nåbara.",
    "Filterstängning bevarar text och val och återför fokus till rätt kontroll."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/object-search.spec.ts",
      "caseId": "SÖK-05",
      "purpose": "CSS-vy, DOM-fokus och syntetisk inmatning; inga verkliga enhetsgester, skärmtangentbord eller zoom."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/object-search.spec.ts",
      "caseId": "SÖK-10",
      "purpose": "CSS-vy, DOM-fokus och syntetisk inmatning; inga verkliga enhetsgester, skärmtangentbord eller zoom."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Prova faktisk mobilinmatning och förstoring i sökning och filter.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Fysiska iPhone och iPad med vanlig HTTPS,
leverantörsinloggning och medlemskap enligt
[förberedelsen för verkliga enheter](object-list-device-preparation.md).
Återställ sökarkivet från **--search** och koppla dess kompletta privata
innehåll till det verifierade kontot inför varje fall och enhet. Anteckna
enhet, operativsystem, webbläsare och verklig zoomnivå.

**Kräver mänsklig observation:** Använd faktisk pekning, enhetens
skärmtangentbord och webbläsarens förstoring på både iPhone och iPad.

**Steg:**

1. Utför SÖK-05 en gång på iPhone och en gång på iPad, med ny förberedelse
   mellan enheterna. Öppna sökfälten med pekning och skriv med
   skärmtangentbordet. Kontrollera text och filter vid varje vybyte.
2. Under SÖK-05 steg 4–5 öppnar du filterdialogen direkt efter inmatning
   med skärmtangentbordet. Rulla och nå samtliga val och dess kryss med
   pekning. När tangentbordet visas eller stängs kontrollerar du söktext,
   filter och återfokus.
3. Utför SÖK-10 en gång på vardera enheten från ny förberedelse.
   Under steg 2–4 provar du verklig förstoring 200 och 400 procent och
   pekar på filterval och kryss. Rulla vid behov och kontrollera att alla
   val kan nås utan att text, filter eller markering ändras oavsiktligt.
4. Kontrollera SÖK-10 steg 5–6 med fysisk pekning och skärmtangentbord.
   Det oskickade meddelandet, sökfältet och objektets uppgifter ska vara kvar.
   Faktisk uppläsning utförs i LISTA-09 från dess separata förberedelser.

**Förväntat resultat:**

- Skärmtangentbordet skriver i rätt sökfält utan att ändra den andra
  vyns sökning.
- Pekning och verklig förstoring lämnar sökfält, kryss och samtliga
  filterval nåbara.
- Filterstängning bevarar text och val och återför fokus till rätt kontroll.

### LÄS-08: försvunnen sista läsrad återför fokus till rubriken

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-reading.spec.ts",
    "caseId": "LÄS-08"
  },
  "reference": "Tom tabell efter verklig uppdatering",
  "outcomes": [
    "Utan nästa eller föregående rad återgår fokus till hushållets rubrik.",
    "Dialogen kan stängas utan nya privata förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** försvunnen sista läsrad återför fokus till rubriken.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Tomt provhushåll med nya A och B i samma användares utkast.
Starta ett textsamtal och öppna andra fliken med samma inloggning.

**Integrationstest:**
[household-reading.spec.ts](../../tests/integration/household-reading.spec.ts),
LÄS-08.

**Steg:**

1. Öppna **Tabell → Samband för B** i första fliken.
2. Välj **Tabell** i andra fliken. Sök B och välj **Ta bort B**.
   Sök sedan A och välj **Ta bort A**. Vänta på
   **Objektet finns inte längre** i första fliken.
3. Stäng med Escape. Kontrollera fokus på rubriken **Hushållet Linden**.

**Förväntat resultat:**

- Utan nästa eller föregående rad återgår fokus till hushållets rubrik.
- Dialogen kan stängas utan nya privata förslag.

### LISTA-09: verklig zoom och uppläsning ger hela läsalternativet

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Lyssna med NVDA och VoiceOver på hela värden, riktning och status samt sökfältets, kryssens och filtervalens namn, fokus och återfokus. Prova verklig zoom 200 och 400 procent."
  },
  "reference": "NVDA på dator och VoiceOver på dator, iPhone och iPad; verklig zoom 200 och 400 procent.",
  "outcomes": [
    "Skärmläsaren läser hela namn, värden, riktning och skilda statusar.",
    "Rubrik och återfokus är begripliga och kontroller kan nås vid båda zoomnivåerna.",
    "NVDA och VoiceOver läser sökning, kryss och filterval begripligt och anger rätt fokus vid öppning och återgång."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/household-reading.spec.ts",
      "caseId": "LÄS-01",
      "purpose": "Avgränsad automatiserad DOM-, CSS- och syntetisk inmatning; inte faktisk enhetsobservation."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/object-search.spec.ts",
      "caseId": "SÖK-03",
      "purpose": "Tillgängliga namn, DOM-fokus och syntetisk inmatning; ingen faktisk NVDA- eller VoiceOver-uppläsning."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/object-search.spec.ts",
      "caseId": "SÖK-05",
      "purpose": "Tillgängliga namn, DOM-fokus och syntetisk inmatning; ingen faktisk NVDA- eller VoiceOver-uppläsning."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/object-search.spec.ts",
      "caseId": "SÖK-10",
      "purpose": "Tillgängliga namn, DOM-fokus och syntetisk inmatning; ingen faktisk NVDA- eller VoiceOver-uppläsning."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** verklig zoom och uppläsning ger hela läsalternativet.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Ha tillgång till NVDA på dator och VoiceOver på dator,
iPhone och iPad. Använd vanlig HTTPS, leverantörsinloggning och medlemskap
enligt [förberedelsen för verkliga enheter](object-list-device-preparation.md).
Återställ rätt arkiv och koppla dess kompletta privata innehåll inför
varje delegerat fall, enhet och hjälpmedelskörning: läskedjan för
LÄS-01/02/07, hela storkartan för LISTA-05 och **--search** för SÖK-03/05/10.
Anteckna operativsystem, webbläsare, hjälpmedelsversion och faktisk zoomnivå.

**Kräver mänsklig observation:** Lyssna med NVDA och VoiceOver vid
200 och 400 procent verklig zoom. Skilj rubrik, fullständiga värden,
riktning och status samt sökfältets, kryssens och filtervalens namn
och upplevt fokus från enbart DOM-namn.

**Steg:**

1. Utför LÄS-01 på dator med NVDA respektive VoiceOver och webbläsarens
   verkliga förstoring. Framkalla grafikförlusten på just HTTPS-sidan
   enligt enhetsförberedelsen. Anteckna utrustning.
2. Utför LÄS-02, LÄS-07 och LISTA-05 från respektive ny
   förberedelse. Lyssna på hela namn och betydelser samt återfokus.
3. Utför SÖK-03 en gång med NVDA och en gång med VoiceOver, från ny
   förberedelse för varje hjälpmedel. Lyssna på reglagens namn och följ
   fokus genom inmatning i sökfältet, filterdialog, Escape och vybyten.
4. Utför SÖK-05 och SÖK-10 en gång vardera med VoiceOver på både iPhone
   och iPad, från ny förberedelse varje gång. Lyssna på sökfält,
   Rensa sökning, Filter och varje filterval. Kontrollera rubrikfokus,
   valens namn, kvarvarande söktext och återfokus när dialogen stängs.
5. Vid SÖK-10 provar du även NVDA från ny förberedelse. Upprepa dess
   relevanta sök- och filtersteg vid verklig zoom 200 och 400 procent
   och kontrollera begriplig uppläsning och nåbara kontroller.

**Förväntat resultat:**

- Skärmläsaren läser hela namn, värden, riktning och skilda statusar.
- Rubrik och återfokus är begripliga och kontroller kan nås vid båda zoomnivåerna.

- NVDA och VoiceOver läser sökning, kryss och filterval begripligt och
  anger rätt fokus vid öppning och återgång.

### TABELL-01: svensk sortering och öppna rader består vid kartbesök

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-table.spec.ts",
    "caseId": "TABELL-01"
  },
  "reference": "1440 × 1000, hushållets tabell",
  "outcomes": [
    "Naturlig svensk sortering skiljer A 2 från A 10 och å, ä, ö.",
    "Vybytet bevarar sortering, sida, rulläge och flera öppna rader.",
    "Läsningen ändrar inga hushållsuppgifter eller privata förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** svensk sortering och öppna rader består vid kartbesök.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Starta [Förbered hushållets tabell](#förbered-hushållets-tabell).

**Integrationstest:**
[household-table.spec.ts](../../tests/integration/household-table.spec.ts),
TABELL-01.

**Steg:**

1. Välj **Tabell** och kontrollera fokus på **Hushållet Linden**,
   femtio rader och A 2 före A 10. Expandera båda namnen.
2. Fokusera **Namn** och tryck Enter. Läs fallande ordning
   Örn, Älg, Åke och kontrollera fokus kvar på Namn.
3. Välj **Typ**: Typ 2 visas först. Välj Typ igen: Typ 10 visas först.
   Välj Namn för stigande ordning och sedan **Nästa**.
4. Expandera första namnet på sida två, rulla tabellen och fokusera
   samma namn. Besök **Karta**, återgå med **Tabell** och kontrollera
   fokus, rulläge, öppen rad, sortering och sida.
5. Välj **Föregående**. Kontrollera att A 2 fortfarande är öppen.

**Förväntat resultat:**

- Naturlig svensk sortering skiljer A 2 från A 10 och å, ä, ö.
- Vybytet bevarar sortering, sida, rulläge och flera öppna rader.
- Läsningen ändrar inga hushållsuppgifter eller privata förslag.

### TABELL-02: sparade och föreslagna värden har tydliga skilda statusar

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-table.spec.ts",
    "caseId": "TABELL-02"
  },
  "reference": "Fullständiga uppgifter utan WebGL",
  "outcomes": [
    "Sparat och privat förslag har skilda betydelser, bilder och fältnamn.",
    "Noll, Nej, Ej uppgivet, osäker skuld och uttryckligen inget blandas inte.",
    "Nytt, ändrat, föreslagen borttagning, upphört och borttaget är läsbara.",
    "Läsning och oförändrad formulärstängning skapar inget förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** sparade och föreslagna värden har tydliga skilda statusar.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Bygg med `npm run build` och starta
`node --import tsx scripts/manual-household-table.ts --details`.
Öppna adressen i en separat Chromium-profil med WebGL avstängt
(`--disable-webgl`). Logga in med Google. Avsluta med `quit`;
provdatabasen raderas. Förberedelsen skapar syntetiska bilder och förslag.

**Integrationstest:**
[household-table.spec.ts](../../tests/integration/household-table.spec.ts),
TABELL-02.

**Steg:**

1. Välj **Tabell** och expandera **A 2**. Läs sparat pris 299 SEK,
   föreslaget pris 399 SEK, **Uttryckligen inget** för skuld och
   **100 000 SEK (Osäkert uppgivet)** med datum 2026-01-01.
2. Läs namn, typ, beskrivning och båda profilbilderna. Skilj den
   tidigare bilden och Cykel från det privata bild- och ikonförslaget.
3. Välj **Redigera A 2**. Kontrollera namnfokus och A 2.
   Välj **Avbryt** utan ändring och kontrollera återfokus på samma
   knapp och fortfarande öppna uppgifter.
4. Läs **Ramnummer**, **Antal** och **Reserv**: sparat **Ej uppgivet**,
   föreslaget **RAM-2026-42**, **0** och **Nej**. Läs hela
   **Föreslagen anteckning**, inklusive sparad benämning Egen anteckning.
5. Öppna **Filter**. Kontrollera rubrikfokus, välj **Ta med upphörda**
   och **Ta med borttagna**. Stäng med Escape och kontrollera fokus
   tillbaka till **Filter · aktiva**. Välj **Nästa**.
6. Läs **Nytt prov**, **Tas bort prov**, **Upphört prov** och
   **Borttaget prov**. Expandera Borttaget prov och läs alla uppgifter.
   Detta borttagna objekt kan läsas men saknar redigeringsåtgärd.

**Förväntat resultat:**

- Sparat och privat förslag har skilda betydelser, bilder och fältnamn.
- Noll, Nej, Ej uppgivet, osäker skuld och uttryckligen inget blandas inte.
- Nytt, ändrat, föreslagen borttagning, upphört och borttaget är läsbara.
- Läsning och oförändrad formulärstängning skapar inget förslag.

### TABELL-03: sidledsläsning bevarar markering och oskickat samtal

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-table.spec.ts",
    "caseId": "TABELL-03"
  },
  "reference": "390 × 844, tangentbord i verklig rullbar tabell",
  "outcomes": [
    "Tangentbordet rullar tabellen och faktisk position återställs.",
    "Markering, privat utkast och oskickad samtalstext består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** sidledsläsning bevarar markering och oskickat samtal.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Förbered hushållets tabell. Starta ett textsamtal med
testmiljöns ersättare för modelltjänsten.

**Integrationstest:**
[household-table.spec.ts](../../tests/integration/household-table.spec.ts),
TABELL-03.

**Steg:**

1. Skriv **Oskickat meddelande vid tabellbesök** utan att skicka.
   Stäng textvyn, välj **Tabell** och expandera A 2.
2. Kontrollera att uppgifterna ryms inom skärmbredden. Fokusera
   tabellens rullbara yta och tryck högerpil så att den rullar i sidled.
   Vänta tills rullningen stannar och anteckna den uppnådda positionen
   utan att kräva ett exakt steg.
3. Besök **Karta**: A 2 är markerat. Återvänd med **Tabell** och
   kontrollera samma faktiska sidledsposition, markerad rad och
   **✓ Markerad**.
4. Öppna **Skriv till Skyttel**. Kontrollera samma oskickade
   meddelande och att tidigare utkast finns kvar.

**Förväntat resultat:**

- Tangentbordet rullar tabellen och faktisk position återställs.
- Markering, privat utkast och oskickad samtalstext består.

### TABELL-04: försvunnen rad återför fokus efter redigering

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-table.spec.ts",
    "caseId": "TABELL-04"
  },
  "reference": "Ordinarie redigering, nästa rad, föregående rad, rubrik",
  "outcomes": [
    "Samma öppnare får fokus när raden finns kvar.",
    "När raden försvinner går fokus till nästa, föregående och sist\n  hushållets rubrik utan att ändra filter.",
    "Statusändringarna finns endast i eget utkast."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** försvunnen rad återför fokus efter redigering.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Tomt provhushåll. Upphörda objekt ingår inte i tabellens
startfilter. Återställ med nytt hushåll mellan fallen.

**Integrationstest:**
[household-table.spec.ts](../../tests/integration/household-table.spec.ts),
TABELL-04.

**Steg:**

1. Skapa och spara tre objekt: Fokus Alpha, Fokus Beta och Fokus Gamma.
   Välj **Tabell** och sök **Fokus**.
2. Öppna **Redigera Fokus Beta** och stäng med **Avbryt**.
   Kontrollera fokus på samma ursprungliga kontroll.
3. Öppna samma väg för Beta.
   I formuläret öppnar du **Livscykel och utseende**, väljer
   **Upphört** och **Lägg i utkastet och stäng**.
   Kontrollera fokus på motsvarande kontroll för Gamma.
4. Upprepa samma väg för Gamma: fokus återgår till Alpha.
   Upprepa sedan för Alpha: fokus återgår till **Hushållet Linden**.
5. Öppna **Filter**, välj **Ta med upphörda** och stäng.
   Alla tre objekten finns kvar som upphörda privata förslag.
   Öppna utkastet och läs deras ändringar; spara inte.

**Förväntat resultat:**

- Samma öppnare får fokus när raden finns kvar.
- När raden försvinner går fokus till nästa, föregående och sist
  hushållets rubrik utan att ändra filter.
- Statusändringarna finns endast i eget utkast.

### TABELL-05: försvunnen rad återför fokus efter kartbesök

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-table.spec.ts",
    "caseId": "TABELL-05"
  },
  "reference": "Ordinarie kartbesök, nästa rad, föregående rad, rubrik",
  "outcomes": [
    "Samma öppnare får fokus när raden finns kvar.",
    "När raden försvinner går fokus till nästa, föregående och sist\n  hushållets rubrik utan att ändra filter.",
    "Statusändringarna finns endast i eget utkast."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** försvunnen rad återför fokus efter kartbesök.

**Användare:** Alex Exempel med tillgång till provhushållet.

**Förutsättningar:** Tomt provhushåll. Upphörda objekt ingår inte i tabellens
startfilter. Återställ med nytt hushåll mellan fallen.

**Integrationstest:**
[household-table.spec.ts](../../tests/integration/household-table.spec.ts),
TABELL-05.

**Steg:**

1. Skapa och spara tre objekt: Fokus Alpha, Fokus Beta och Fokus Gamma.
   Välj **Tabell** och sök **Fokus**.
2. Välj **Visa Fokus Beta i kartan** och återvänd med **Tabell**.
   Kontrollera fokus på samma ursprungliga kontroll.
3. Öppna samma väg för Beta. Dubbelklicka Beta i kartan och välj redigering.
   I formuläret öppnar du **Livscykel och utseende**, väljer
   **Upphört** och **Lägg i utkastet och stäng**.
   Återvänd med Tabell. Kontrollera fokus på motsvarande kontroll för Gamma.
4. Upprepa samma väg för Gamma: fokus återgår till Alpha.
   Upprepa sedan för Alpha: fokus återgår till **Hushållet Linden**.
5. Öppna **Filter**, välj **Ta med upphörda** och stäng.
   Alla tre objekten finns kvar som upphörda privata förslag.
   Öppna utkastet och läs deras ändringar; spara inte.

**Förväntat resultat:**

- Samma öppnare får fokus när raden finns kvar.
- När raden försvinner går fokus till nästa, föregående och sist
  hushållets rubrik utan att ändra filter.
- Statusändringarna finns endast i eget utkast.

## Bevarad avgränsning

LISTA-04 använder 320 CSS-pixlar med verklig grafikförlust. LISTA-08
behåller hela dess ursprungliga 390-prov, inklusive filter, läsning,
redigering, fokus och träffytor efter avbrottet. SÖK-08 är 1280-referensen;
SÖK-13–14 behåller båda smala övergångarna, skilda filter och återfokus.
Dessa ursprungliga prov har ingen separat slutlig spar-/omstartskedja
att korta. Deras native arbete är kvar i sin helhet.

TABELL-03 kräver tangentbordsrullning och exakt återställning av den
faktiskt uppnådda positionen, men inget bestämt rullsteg på 40 pixlar.
Detta avstår endast från skydd mot ändrad steglängd. Markering, utkast
och oskickad samtalstext är kvar. LISTA-06 är fortsatt pensionerat och
återanvänds inte. LÄS-08 skiljer tom tabell från LÄS-04:s föregående rad.
