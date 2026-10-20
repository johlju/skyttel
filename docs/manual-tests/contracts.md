# Manuella testfall för avtal och fria ekonomiska uppgifter

Avtal, skuld, kreditutrymme och utnyttjad kredit hålls isär genom egna
egenskaper. Etiketterna medför ingen automatisk beräkning eller status.

## Förberedelse och arbetssätt

Använd en separat
[provinstallation](../development/devcontainer.md#disposable-local-database)
med påhittade uppgifter. Börja varje fall i ett nytt hushåll. Logga in som
Alex och bjud vid behov in Robin enligt
[tillgångsguiden](../user-guide/access.md)
i en separat webbläsarprofil. Anteckna commit, webbläsare och observerat utfall.
Starta bara om provinstallationen, och behåll dess databas inom samma fall.

Öppna **Nytt objekt** från kartans verktyg eller **Tabell → Redigera [namn]**.
Objektets **Fria egenskaper** innehåller **Lägg till egenskap**. Varje rad
har **Etikett**, **Datatyp** och **Värde**. **Töm värdet** behåller raden;
**Ta bort egenskapen** tar bort raden. Etiketter får upprepas.

Öppna samband genom **Tabell → Samband för [namn]** och **Nytt samband**
eller **Redigera samband**. Egenskapsraderna finns direkt i sambandsformuläret.
**Lägg i utkastet** skickar hela sambandet. Välj **Stäng samband** innan
annat arbete. Typdefinitioner finns under **Inställningar → Typer**;
**Objekttyper** och **Sambandstyper och riktning** visar respektive lista.
Välj **Tillbaka till kartan** före objekt- och sambandsarbete.

Granska utkastet genom **Skriv till Skyttel → Visa utkastet → Visa förslaget:
[namn]**.
Stäng läsningen med krysset. Spara hela utkastet separat och invänta
**Utkastet är sparat**. Stäng textvyn före fortsatt tabellarbete.
Rapporter visar **Ändringshistorik** med **Visa ändringarna**.

## Avtalsuppgifter

### AVTAL-01: Hitta och rätta fria hyresuppgifter

**Syfte:** Fritt etiketterade hyresuppgifter kan granskas, hittas genom värdet
och rättas efter
omladdning.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Nytt provhushåll utan objekt eller förslag.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/contract-forms.spec.ts",
    "caseId": "AVTAL-01"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Fritt etiketterade hyresuppgifter kan granskas, hittas genom värdet och rättas efter omladdning.",
    "Den rättade hyran och oförändrad uppsägningstid visas tillsammans."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa Lägenhetens hyresavtal av typen Hyresavtal. Lägg till Hyra (Text, 8
   200 kr per
   månad), Betalningsdag (Text, Sista vardagen) och Villkor (Text, Tre månaders
   uppsägningstid). Lägg i utkastet.
2. Granska förslaget och spara hela utkastet. Ladda om och sök efter 8 200 i
   tabellen.
3. Redigera det funna avtalet, rätta Hyra till 8 500 kr per månad och spara hela
   utkastet. Sök efter 8 500 och läs avtalet.

**Förväntat resultat:**

- Fritt etiketterade hyresuppgifter kan granskas, hittas genom värdet och
  rättas efter
  omladdning.
- Den rättade hyran och oförändrad uppsägningstid visas tillsammans.

### AVTAL-02: Skilda belopp och ofullständiga uppgifter består

**Syfte:** Skuld, kreditutrymme och utnyttjad kredit bevarar separata värden
och tomma rader.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Nytt provhushåll utan objekt eller förslag.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/contract-forms.spec.ts",
    "caseId": "AVTAL-02"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Skuld, kreditutrymme och utnyttjad kredit bevarar separata värden och tomma rader.",
    "Efter rättelse består uppgiftsdatum och villkor; Utnyttjad kredit är 12000 och skuldraden är tom."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa Familjens kreditavtal av typen Kreditavtal. Lägg till Skuld (Text,
   Cirka 18
   000), Skuld uppgiven (Datum, 2026-03-01), Beviljat kreditutrymme (Tal,
50000),
   Utnyttjad kredit (Tal, tomt), Slutdatum (Datum, tomt) och Avtalsvillkor
(Text,
   Uppgift saknas).
2. Lägg i utkastet och spara. Starta om och redigera avtalet. Läs skuld,
   kreditutrymme
   och den tomma utnyttjade krediten.
3. Ange 12000 som Utnyttjad kredit och använd Töm värdet för Skuld. Lägg i
   utkastet och
   spara. Läs avtalet i tabellen.

**Förväntat resultat:**

- Skuld, kreditutrymme och utnyttjad kredit bevarar separata värden och tomma
  rader.
- Efter rättelse består uppgiftsdatum och villkor; Utnyttjad kredit är 12000 och
  skuldraden är tom.

### AVTAL-04: Återhämtat avtalsutkast och nollkredit bevaras

**Syfte:** Individuella avtalsuppgifter och deras ordning består genom
återhämtning och rättelse.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Nytt provhushåll utan objekt eller förslag.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/contract-forms.spec.ts",
    "caseId": "AVTAL-04"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Individuella avtalsuppgifter och deras ordning består genom återhämtning och rättelse.",
    "Noll är ett bevarat värde; historiken visar tidigare utnyttjad kredit utan att ändra skuldens datum."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa Exempelkredit av typen Kreditavtal med Senast uppgiven skuld (Tal,
   125000.5),
   Skuld uppgiven (Datum, 2026-09-01), Beviljat kreditutrymme (Tal, 80000),
Utnyttjad
   kredit (Tal, 12500) och Osäkert uppgivet (Ja/nej, Ja). Lägg i utkastet.
2. Starta om, ladda om och granska förslaget. Spara hela utkastet.
3. Redigera avtalet och ange 0 som Utnyttjad kredit. Lägg i utkastet, granska
   tidigare
   och föreslaget värde och spara.
4. Starta om igen. Läs avtalet och den senaste ändringen i historiken.

**Förväntat resultat:**

- Individuella avtalsuppgifter och deras ordning består genom återhämtning och
  rättelse.
- Noll är ett bevarat värde; historiken visar tidigare utnyttjad kredit utan
  att ändra
  skuldens datum.

### AVTAL-05: Avtalens roller och identiteter bevaras vid rättelse

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/contract-relationships.spec.ts",
    "caseId": "AVTAL-05"
  },
  "reference": "1280px, ljust tema; två separata profiler i konfliktprovet.",
  "outcomes": [
    "Roller, riktning och objektens identiteter består efter spärrat sparande och rättelse."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

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
Betalkontot. Välj **Obesvarad identitetsfråga** för Betalkontot.
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
   Blå bilen. Lägg den fria textegenskapen **Uppgiftens säkerhet** med
   värdet **Osäkert uppgivet** på användningssambandet.
4. Lägg Betalas med från Garagehyra till Betalkontot. Lägg samma samband
   från Bostadshyra till Betalkontot med den fria textegenskapen
   **Uppgiftens säkerhet** och värdet **Obesvarad fråga**.
5. Ladda om. Granska hela utkastet och kontrollera osäkerheten, den
   obesvarade frågan och bankkontots identitet som behöver redas ut.
   Kontrollera att Spara hela utkastet är spärrad och inget är gemensamt
   sparat. Det automatiska provet försöker dessutom spara genom HTTP och
   kontrollerar att hela sparandet avvisas utan ändrad karta eller historik.
6. Öppna Betalkontots objektformulär och välj **Ospecificerat objekt**.
   Lägg rättelsen i utkastet och spara hela utkastet. Starta om provappen,
   ladda om och
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
- Bankkontots olösta identitet hindrar hela sparandet. Ett uttryckligen
  valt ospecificerat bankkonto går att spara och identifiera senare.
  De fria egenskapernas texter ändrar inte identitet eller sparbarhet.
- Tomma ekonomiska uppgifter hindrar inte sparandet. Inga belopp eller
  andra roller härleds från de angivna sambanden.
- Rättelsen bevarar tidigare objektvärden och samband i historiken med
  samma sparande användare och angiven tid. Det automatiska provet läser
  historiken genom det publika HTTP-gränssnittet.

### AVTAL-07: Ogiltigt tal bevarar oberoende förslag

**Syfte:** Ogiltigt tal stoppar det nya förslaget och behåller det tidigare
oberoende utkastet.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Nytt provhushåll utan objekt eller förslag.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/contract-forms.spec.ts",
    "caseId": "AVTAL-07"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Ogiltigt tal stoppar det nya förslaget och behåller det tidigare oberoende utkastet.",
    "En tom typad skuldrad är giltig och finns kvar efter rättelsen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa Ofullständigt åtagande av typen Låneavtal utan egenskaper och lägg
   det i
   utkastet.
2. Skapa Felaktigt åtagande av typen Låneavtal och lägg till Senast uppgiven
   skuld (Tal,
   Inte ett tal). Försök lägga i utkastet. Kontrollera fokus på
felsammanfattningen och
   bevarad inmatning.
3. Använd Töm värdet på skuldraden och lägg objektet i utkastet. Granska den
   tomma
   skuldraden i förslaget.

**Förväntat resultat:**

- Ogiltigt tal stoppar det nya förslaget och behåller det tidigare oberoende
  utkastet.
- En tom typad skuldrad är giltig och finns kvar efter rättelsen.

### AVTAL-08: Konfliktval bevarar oberoende avtalsvillkor

**Syfte:** Den motstridiga skulden kräver uttryckligt val utan att förlora
oberoende villkor.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Alex och Robin delar samma hushåll i separata profiler.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/contract-forms.spec.ts",
    "caseId": "AVTAL-08"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Den motstridiga skulden kräver uttryckligt val utan att förlora oberoende villkor.",
    "Efter omstart visar avtalet 140000 och Rättade villkor."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered Familjens kreditavtal med Skuld (Tal, 150000) och Avtalsvillkor
   (Text,
   Preliminära villkor) och spara.
2. Alex redigerar Skuld till 140000 och lägger i utkastet. Robin ändrar
   skulden till
   145000 och villkoren till Rättade villkor och sparar.
3. Alex försöker spara, öppnar Granska konflikter och väljer sin föreslagna
   skuld. Lägg
   valen i utkastet och spara hela utkastet.
4. Starta om, ladda om och läs avtalet.

**Förväntat resultat:**

- Den motstridiga skulden kräver uttryckligt val utan att förlora oberoende
  villkor.
- Efter omstart visar avtalet 140000 och Rättade villkor.

## Avvecklade identiteter och täckning

AVTAL-06 är avvecklat med godkänd täckningsförlust och får inte återanvändas.

AVTAL-01, AVTAL-02, AVTAL-04, AVTAL-07 och AVTAL-08 behåller sina
identiteter med individuella fria egenskaper.
Etiketter och separata datum eller säkerhetsuppgifter får användaren
välja själv. Tomma värden, rättelser, konflikter och historik består.

Automatiseringen gör inga billbara modell- eller röstanrop och bevisar
inte faktisk fysisk användning eller driftutfall.
