# Manuella testfall för objektarbete och samtal

Fallen omfattar vanliga objekt- och sambandsformulär, fullständig läsning,
samtal och byte av skärmstorlek. Anteckna commit, webbläsare och
godkänt eller underkänt
resultat vid körning. Fysiska hjälpmedelsprov antecknas separat från Chromium.

## Konfigurerade användare

Alex är administratör i ett separat provhushåll. Använd en konfigurerad
providentitet och påhittade uppgifter.

## Allmän förberedelse

1. Förbered en
   [separat provdatabas](../development/devcontainer.md#disposable-local-database)
   och logga in. Börja med ett tomt hushåll för PANEL-01. Övriga fall använder
   Cykeln, Bilen och Garaget enligt respektive steg.
2. Skapa objekt med **Nytt objekt** och **Lägg i utkastet och stäng**.
   Läs via **Tabell** och objektets namn. Alla uppgifter visas direkt i raden.
   Redigera med radens pennikon **Redigera [objektets namn]**.
   Fäll ihop uppgifterna genom att välja namnet igen.
3. Spara via **Skriv till Skyttel**, **Visa utkastet** och **Spara hela
   utkastet**.
   Vänta på **Utkastet är sparat**. Stäng sedan textvyn när vanliga formulär
   ska användas.
4. Samtalsfallen kräver en [konfigurerad assistent](setup/assistants.md).
   Öppna texten, välj uttryckligen **Nytt samtal** och ge medgivande.
   PANEL-08 kräver även mikrofonmedgivande och ett fungerande röstsamtal.
5. PANEL-03 använder två inloggade webbläsarklienter med samma identitet.
   För PANEL-05, följ [kontrollerad formulärleverans](workspace-preparation.md#väntande-formulärsvar)
   innan det markerade tillägget; vanlig offlineväxling ger inte samma utfall.

## Objekt och läsning

### PANEL-01: flera kompletta förslag och återanvänd läsning

**Syfte:** Hantera flera fullständiga objektförslag och läsa rätt uppgifter
utan att skapa flera objekt eller förlora samtalstext.

**Användare:** Alex.

**Förutsättningar:** Tomt hushåll, datorfönster med 1440 CSS-pixlars bredd.

**Integrationstest:**
[workspace-panels.spec.ts](../../tests/integration/workspace-panels.spec.ts),
PANEL-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-panels.spec.ts",
    "caseId": "PANEL-01"
  },
  "reference": "Chromium, angivna dator- och mobilmått; kontrollerad samtalstjänst vid samtalssteg.",
  "outcomes": [
    "Kompletta förslag, oskickad text, läsning och meningsfullt fokus bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Nytt objekt** för Cykeln, Bilen och Garaget i tur och ordning.
   Skriv namnet, välj krysset och **Fortsätt redigera**. Kontrollera namnet.
   Välj **Lägg i utkastet och stäng** och spara sedan hela utkastet.
2. Läs varje objekt via tabellen. Kontrollera rubriken, fäll ihop raden
   och välj radens **Redigera**. Öppna **Fria egenskaper** och lägg till
   textegenskapen **Beskrivning** med värdet Lagt i utkastet om följt av namnet.
   Lägg hela förslaget i utkastet och stäng.
3. Starta textsamtalet och skriv Bevarat meddelande utan att skicka.
   Stäng textvyn. Läs Cykeln två gånger och fäll ihop raden mellan öppningarna.
   Kontrollera beskrivningen, rubriken och en enda detaljvy för objektet.
4. Öppna texten igen. Kontrollera meddelandet. Spara hela utkastet och
   ladda om sidan. Läs samtliga tre objekt igen.
5. Öppna **Rapporter → Ändringshistorik**. Läs de två sparandena,
   fäll ut **Visa ändringarna** för det senaste och läs alla tre
   sparade beskrivningarna. Välj **Tillbaka till arbetet**.

**Förväntat resultat:**

- Varje objekt har rätt fullständiga beskrivning efter omladdning.
- Återöppning visar samma objekt i en enda detaljvy direkt i raden.
- Samtalstexten bevaras. Tre objekt finns sparade och utkastet är tomt.
- Ändringshistoriken innehåller de två uttryckliga sparandena.

### PANEL-02: läsning och samtal genom skärmbyte

**Syfte:** Bevara lästa och sparade objektuppgifter samt oskickad samtalstext
vid växling mellan dator och mobil.

**Användare:** Alex.

**Förutsättningar:** Cykeln sparad med beskrivningen Bevarad cykeltext.
Prova 390, 320 och 1440 CSS-pixlars bredd med 844 pixlars höjd.

**Integrationstest:**
[workspace-panels.spec.ts](../../tests/integration/workspace-panels.spec.ts),
PANEL-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-panels.spec.ts",
    "caseId": "PANEL-02"
  },
  "reference": "Chromium, angivna dator- och mobilmått; kontrollerad samtalstjänst vid samtalssteg.",
  "outcomes": [
    "Kompletta förslag, oskickad text, läsning och meningsfullt fokus bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta textsamtalet på dator. Skriv Oskickad samtalstext utan att skicka.
2. Byt till varje angiven bredd. Stäng textvyn och läs Cykeln via tabellen.
   Kontrollera rubriken, beskrivningen och en enda detaljvy för objektet.
3. Fäll ihop raden. Kontrollera fokus på **Cykeln**.
   Öppna texten igen och läs det oskickade meddelandet.
4. Kontrollera att sidan ryms utan horisontell rullning och att hela
   hushållets sparade uppgifter och privata utkast är oförändrade.

**Förväntat resultat:**

- Lästa uppgifter och samtalstext finns kvar vid varje skärmbyte.
- Fokus stannar på objektets namn när raden fälls ihop.
- Ingen läsning, navigering eller storleksändring skapar ett förslag.

### PANEL-03: ett nyare förslag får inte skrivas över

**Syfte:** Behålla oskickad text när samma användares andra klient ändrar
underlaget innan det fullständiga formuläret skickas.

**Användare:** Alex i två klienter med samma identitet.

**Förutsättningar:** Cykeln är sparad. Ha två autentiserade klienter.

**Integrationstest:**
[workspace-panels.spec.ts](../../tests/integration/workspace-panels.spec.ts),
PANEL-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-panels.spec.ts",
    "caseId": "PANEL-03"
  },
  "reference": "Chromium, angivna dator- och mobilmått; kontrollerad samtalstjänst vid samtalssteg.",
  "outcomes": [
    "Kompletta förslag, oskickad text, läsning och meningsfullt fokus bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Redigera Cykeln** i första klienten. Öppna **Fria egenskaper**
   och lägg till textegenskapen **Beskrivning** med värdet Min oskickade text.
2. Lägg ett nyare förslag för samma objekt i den andra klientens utkast:
   lägg till textegenskapen **Beskrivning** med värdet Nyare förslag från
   samma användares andra klient under **Fria egenskaper**.
3. Välj **Lägg i utkastet och stäng** i första klienten.
   Kontrollera avvisningen och att både namnet och Min oskickade text finns
   kvar.
4. Välj krysset och **Kasta ändringarna och fortsätt**. Ladda om och öppna
   Cykeln för vanlig redigering igen. Öppna **Fria egenskaper** och läs den
   andra klientens beskrivning.
   Stäng det oförändrade formuläret. Öppna **Rapporter → Ändringshistorik**,
   fäll ut **Visa ändringarna** och läs det ursprungliga sparandet.
   Den nyare privata beskrivningen ska inte finnas i det sparade innehållet.

**Förväntat resultat:**

- Det nyare privata förslaget skrivs inte över och sparade fakta ändras inte.
- Det gamla formuläret behåller texten tills användaren uttryckligen kastar den.
- Ny öppning visar den andra klientens aktuella beskrivning.
- Endast det tidigare uttryckliga sparandet finns i ändringshistoriken.

### PANEL-04: kartval bevarar oskickade samband och typer

**Syfte:** Skydda sambandets oskickade värden och behålla typdefinitioner
vid vanliga kartval mellan inställningsbesök.

**Användare:** Alex.

**Förutsättningar:** Cykeln och Garaget är sparade med ett samband mellan dem.
Välj **Alla etiketter** i kartan.

**Integrationstest:**
[workspace-panels.spec.ts](../../tests/integration/workspace-panels.spec.ts),
PANEL-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-panels.spec.ts",
    "caseId": "PANEL-04"
  },
  "reference": "Chromium, angivna dator- och mobilmått; kontrollerad samtalstjänst vid samtalssteg.",
  "outcomes": [
    "Kompletta förslag, oskickad text, läsning och meningsfullt fokus bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Tabell**, **Samband för Cykeln** och **Nytt samband**.
   Välj Garaget under **Från objekt**. Försök nå den bakomliggande tabellen
   med tangentbord. Den aktiva modalen behåller fokus.
2. Tryck Escape och välj **Fortsätt redigera**. Kontrollera Garaget.
   Välj **Stäng samband** och bekräfta **Kasta ändringarna och fortsätt**.
3. Öppna **Inställningar**, **Typer** och **Ny objekttyp**.
   Skriv Oskickad typ. Välj **Tillbaka till kartan**, **Karta** och nå det
   sparade sambandet med tangentbord. Öppna typinställningarna igen.
4. Kontrollera Oskickad typ och välj **Stäng typformuläret utan att skicka**.
5. Upprepa med **Ny sambandstyp**, namnet Oskickad riktning och
   **Stäng sambandstypen utan att skicka**.

**Förväntat resultat:**

- Escape avbryter förlusten; den oskickade sambandsuppgiften finns kvar.
- Kartval ersätter inte de oskickade typnamnen.
- Inga objekt-, samband- eller typförslag skapas av dessa kontroller.
- Det ursprungliga sparade sambandet finns kvar.

### PANEL-05: väntande tillägg före ny sökning

**Syfte:** Skydda ett väntande fullständigt objekttillägg och återföra fokus
innan användaren söker efter ett annat objekt.

**Användare:** Alex.

**Förutsättningar:** Cykeln och Bilen har lagts i samma privata utkast.
Förbered en kontrollerad leverans som håller svaret efter faktisk hantering
av objektformulärets POST-anrop, enligt integrationstestet.

**Integrationstest:**
[workspace-panels.spec.ts](../../tests/integration/workspace-panels.spec.ts),
PANEL-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-panels.spec.ts",
    "caseId": "PANEL-05"
  },
  "reference": "Chromium, angivna dator- och mobilmått; kontrollerad samtalstjänst vid samtalssteg.",
  "outcomes": [
    "Kompletta förslag, oskickad text, läsning och meningsfullt fokus bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Sök efter Cykeln i tabellen. Välj **Redigera Cykeln** och skriv
   Skickad beskrivning. Välj **Lägg i utkastet och stäng**.
2. Håll det verkliga svaret. Kontrollera att egenskapens värdekontroll och krysset
   är inaktiva. Tryck Escape och försök fokusera den bakomliggande sökningen.
3. Släpp samma svar. Kontrollera att formuläret stängs och
   **Redigera Cykeln** får fokus. Sök efter Bilen och fortsätt skriva i
   sökfältet.
4. Läs utkastet och kontrollera Cykelns Skickad beskrivning.

**Förväntat resultat:**

- Väntande svar tillåter inte ny redigering, stängning eller fokus bakom
  modalen.
- Bekräftat tillägg återför fokus och nästa sökning fungerar utan fokusstöld.
- Beskrivningen finns en gång i det privata förslaget. Inga objekt har sparats.

## Samtal och platsbrist

### PANEL-08: växla hela vyer utan att avsluta rösten

**Syfte:** Bevara oskickad samtalstext, objektläsning och aktiv mikrofon när
utrymmet kräver växling mellan text, tabell och karta.

**Användare:** Alex.

**Förutsättningar:** Cykeln har lagts i utkastet med Bevarad cykeltext.
Prova 1440 och 640 CSS-pixlars bredd med 1000 pixlars höjd. Rösten är
tillgänglig.

**Integrationstest:**
[workspace-panels.spec.ts](../../tests/integration/workspace-panels.spec.ts),
PANEL-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/workspace-panels.spec.ts",
    "caseId": "PANEL-08"
  },
  "reference": "Chromium, angivna dator- och mobilmått; kontrollerad samtalstjänst vid samtalssteg.",
  "outcomes": [
    "Kompletta förslag, oskickad text, läsning och meningsfullt fokus bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta textsamtalet, slå på mikrofonen och skriv Bevarat meddelande
   utan att skicka. Byt till 640 pixlars bredd.
2. Välj **Tabell**. Textvyn döljs. Läs Cykeln, kontrollera rubriken
   och Bevarad cykeltext. Fäll ihop raden och öppna texten igen.
3. Kontrollera meddelandet. Stäng texten, välj **Karta** och **Navigera**.
   Öppna texten igen och kontrollera att Navigation inte täcker textvyn.
4. Byt till 1440 pixlars bredd. Kontrollera att text och Navigation syns
   och att mikrofonen fortfarande är på med synlig röstruta.
5. Stäng Navigation och textvyn. Läs Cykeln igen, stäng och öppna texten.

**Förväntat resultat:**

- Samtalstexten bevaras genom samtliga växlingar och mikrofonen fortsätter.
- De fullständiga läsuppgifterna och alla privata förslag finns kvar.
- Ingen växling ändrar sparade objekt, samband eller det privata utkastet.

## Pensionerade fall

### Pensionerad identitet PANEL-06

Den fria objektläsningens dragning och flyttknappar togs bort. ID:t återanvänds
inte. Vanlig läsning, fokus och fullständiga uppgifter prövas i PANEL-01–05.

### Pensionerad identitet PANEL-07

Fria objektfönsters placering kring text och röst togs bort. ID:t återanvänds
inte. Växling och samtalskontinuitet prövas i PANEL-08; Navigation behåller sina
egna kontroll- och kamerafall i [map-camera.md](map-camera.md).

### PANEL-09: fysiskt hörbar röst genom arbetsytebyte

**Syfte:** Ett faktiskt mikrofon- och ljudprov behåller hörbart samtal och
oskickad text vid byte mellan arbetsyta och text.

**Användare:** Alex enligt områdets förberedelse.

**Förutsättningar:** Konfigurerad faktisk samtalstjänst, mikrofon och
ljudutgång; separat auktoriserad körning.

**Kräver mänsklig observation:** Ett faktiskt mikrofon- och ljudprov behåller
hörbart samtal och oskickad text vid byte mellan arbetsyta och text.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-microphone-audio",
    "observation": "Ett faktiskt mikrofon- och ljudprov behåller hörbart samtal och oskickad text vid byte mellan arbetsyta och text."
  },
  "reference": "Konfigurerad faktisk samtalstjänst, mikrofon och ljudutgång; separat auktoriserad körning.",
  "outcomes": [
    "Ett faktiskt mikrofon- och ljudprov behåller hörbart samtal och oskickad text vid byte mellan arbetsyta och text."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/workspace-panels.spec.ts",
      "caseId": "PANEL-08",
      "purpose": "Kontrollerat webbläsarunderlag för vanliga kontroller; utför inte den faktiska mänskliga observationen."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ PANEL-08 steg 1–5 en gång med faktisk mikrofon och ljudutgång.
2. Tala och lyssna före och efter bytena. Anteckna ljudutrustning,
   hörbart svar och eventuella avbrott separat från syntetiskt underlag.

**Förväntat resultat:**

- Ett faktiskt mikrofon- och ljudprov behåller hörbart samtal och oskickad text
  vid byte mellan arbetsyta och text.
