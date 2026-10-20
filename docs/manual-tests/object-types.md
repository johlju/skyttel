# Manuella testfall för objekttyper och fria egenskaper

Fallen provar gemensamma typdefinitioner och individuella uppgifter, ordning,
typbyten, konflikter och beständighet. Verklig hjälpmedelsanvändning
antecknas separat.

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

## Definitioner och redigering

### TYP-01: Typ och individuella egenskaper sparas tillsammans

**Syfte:** Typens beskrivning och objektets fyra individuella egenskaper
består genom omstart och
samlat sparande.

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
    "spec": "tests/integration/object-types.spec.ts",
    "caseId": "TYP-01"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Typens beskrivning och objektets fyra individuella egenskaper består genom omstart och samlat sparande.",
    "Tabell och historik visar Exempelsol och Leverantör; Batteri förblir en tom egenskap."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa Solcellsanläggning under Typer. Försök först skicka utan namn och
   kontrollera
   fokus. Ange namnet och beskrivningen Hushållets elproduktion och lägg
typförslaget i
   utkastet.
2. Skapa Paneler på taket med den nya typen. Lägg till Leverantör (Text,
   Exempelsol),
   Effekt (Tal, 12.5), Installationsdatum (Datum, 2026-09-01) och Batteri
(Ja/nej,
   Tomt). Lägg objektet i utkastet.
3. Starta om provinstallationen och ladda om sidan. Läs objektförslaget och
   kontrollera
   uppgifterna. Spara hela utkastet.
4. Starta om igen. Läs Paneler på taket i tabellen. Öppna Rapporter och Visa
   ändringarna
   för sparandet.

**Förväntat resultat:**

- Typens beskrivning och objektets fyra individuella egenskaper består genom
  omstart och
  samlat sparande.
- Tabell och historik visar Exempelsol och Leverantör; Batteri förblir en tom
  egenskap.

### TYP-02: Tomt, noll och nej kan rättas var för sig

**Syfte:** Tomt värde, noll och Nej förblir skilda under sparande och rättelse.

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
    "spec": "tests/integration/object-types.spec.ts",
    "caseId": "TYP-02"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Tomt värde, noll och Nej förblir skilda under sparande och rättelse.",
    "Rättelsen behåller Effekt som tom talrad och visar Ny leverantör och Ja."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa Paneler med Leverantör (Text, tomt), Effekt (Tal, 0),
   Installationsdatum
   (Datum, 2026-09-01) och Batteri (Ja/nej, Nej). Lägg i utkastet och spara.
2. Ladda om och redigera Paneler. Kontrollera att Effekt är 0, Batteri Nej och
   Leverantör tomt.
3. Ange Ny leverantör, töm Effekt med Töm värdet, rätta datumet till
   2026-09-02 och välj
   Ja för Batteri. Lägg i utkastet och spara.
4. Läs objektet i tabellen.

**Förväntat resultat:**

- Tomt värde, noll och Nej förblir skilda under sparande och rättelse.
- Rättelsen behåller Effekt som tom talrad och visar Ny leverantör och Ja.

### TYP-03: Medlem kan rätta delad typ utan insyn i annans förslag

**Syfte:** Vanlig medlem kan ändra en delad typ medan Alex individuella
objektförslag och värde
förblir privata.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Alex och Robin har tillgång till samma tomma hushåll i
varsin profil.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/object-types.spec.ts",
    "caseId": "TYP-03"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Vanlig medlem kan ändra en delad typ medan Alex individuella objektförslag och värde förblir privata.",
    "Alex objekt behåller sin typ och Privat värde efter typens namnändring."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex skapar Privat objekt med hushållets första objekttyp och Anteckning
   (Text,
   Privat värde). Lägg i utkastet utan att spara.
2. Robin öppnar Typer, fäller ut Objekttyper och ändrar samma sparade typ till
   Människa med
   beskrivningen En
   person i kartan. Lägg typförslaget i utkastet. Kontrollera att Privat
objekt inte
   syns i Robins utkast. Spara Robins utkast.
3. Alex öppnar sitt Privat objekt för redigering och läser Anteckning under Fria
   egenskaper.

**Förväntat resultat:**

- Vanlig medlem kan ändra en delad typ medan Alex individuella objektförslag
  och värde
  förblir privata.
- Alex objekt behåller sin typ och Privat värde efter typens namnändring.

### TYP-04: Samtidiga typändringar kräver konfliktval

**Syfte:** Samtidiga motstridiga typändringar stoppar hela sparandet fram till
ett uttryckligt
aktuellt konfliktval.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Alex och Robin har tillgång till samma tomma hushåll i
varsin profil.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/object-types.spec.ts",
    "caseId": "TYP-04"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Samtidiga motstridiga typändringar stoppar hela sparandet fram till ett uttryckligt aktuellt konfliktval.",
    "Efter sparandet visas Människor och Al; objektförslaget följer med samma sparande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex föreslår namnet Människor och beskrivningen Mitt förslag för
   hushållets första
   objekttyp. Skapa också Alex med typen och Smeknamn (Text, Al). Lägg båda i
utkastet.
2. Robin föreslår Personer och Annans rättelse för samma typ och sparar sitt
   utkast.
3. Alex försöker spara hela utkastet. Öppna Granska konflikter och jämför
   typernas namn
   och beskrivningar. Välj Alex föreslagna värden och Lägg valen i utkastet.
Spara
   därefter hela utkastet.
4. Starta om provinstallationen och läs Alex i tabellen.

**Förväntat resultat:**

- Samtidiga motstridiga typändringar stoppar hela sparandet fram till ett
  uttryckligt
  aktuellt konfliktval.
- Efter sparandet visas Människor och Al; objektförslaget följer med samma
  sparande.

### TYP-05: Ogiltigt datum bevarar tidigare utkast

**Syfte:** Felaktigt datum stoppar det nya objektförslaget och bevarar det
tidigare utkastet.

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
    "spec": "tests/integration/object-types.spec.ts",
    "caseId": "TYP-05"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Felaktigt datum stoppar det nya objektförslaget och bevarar det tidigare utkastet.",
    "Efter rättelse visar det nya förslaget 2026-02-28."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa Bevara mig och lägg objektet i utkastet.
2. Skapa Ogiltigt datum med Kontrolldatum (Datum, 2026-02-30). Försök lägga
   objektet i
   utkastet.
3. Kontrollera felsammanfattningens fokus och att datumtexten finns kvar.
   Rätta datumet
   till 2026-02-28 och lägg objektet i utkastet. Läs det nya förslaget.

**Förväntat resultat:**

- Felaktigt datum stoppar det nya objektförslaget och bevarar det tidigare
  utkastet.
- Efter rättelse visar det nya förslaget 2026-02-28.

## Typbyte och ordning

### TYP-06: Typbyte bevarar egenskaper, identitet och samband

**Syfte:** Typbyte bevarar alla individuella egenskaper och samma objekt och
samband genom omstart
och sparande.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Spara typerna Cykel och Motorfordon, objekten Alex blå
cykel och Garaget samt ett
samband mellan dem. Cykeln har Nummer (Text, SYNTH-42) och Försäkrad (Ja/nej,
Nej).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/type-change.spec.ts",
    "caseId": "TYP-06"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Typbyte bevarar alla individuella egenskaper och samma objekt och samband genom omstart och sparande.",
    "SYNTH-42 och Nej är läsbara i förslag, tabell och historik."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Redigera Alex blå cykel och byt från Cykel till Motorfordon. Öppna Fria
   egenskaper
   och kontrollera Nummer och Försäkrad.
2. Lägg i utkastet och granska förslaget med båda typernas namn och samma
   egenskaper.
   Starta om provinstallationen, ladda om och spara hela utkastet.
3. Starta om igen. Läs cykeln, sambandet och sparandets historik.

**Förväntat resultat:**

- Typbyte bevarar alla individuella egenskaper och samma objekt och samband
  genom omstart
  och sparande.
- SYNTH-42 och Nej är läsbara i förslag, tabell och historik.

### TYP-07: Typkonflikt bevarar senare privata egenskaper

**Syfte:** Typkonflikten stoppar hela sparandet utan att förlora senare
privata egenskaper.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Alex och Robin delar en sparad Alex blå cykel och har
minst tre objekttyper.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/type-change.spec.ts",
    "caseId": "TYP-07"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Typkonflikten stoppar hela sparandet utan att förlora senare privata egenskaper.",
    "Det uttryckliga valet sparar Alex typ tillsammans med 43 och Nej."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex ändrar Alex blå cykel till hushållets andra objekttyp och lägger
   ändringen i
   utkastet. Redigera därefter samma privata förslag och lägg till Nummer
(Tal, 43) och
   Försäkrad (Ja/nej, Nej).
2. Robin ändrar den sparade cykeln till hushållets tredje objekttyp och
   sparar. Alex
   försöker spara sitt utkast.
3. Alex öppnar Granska konflikter, väljer sin föreslagna typ, lägger valen i
   utkastet
   och sparar hela utkastet. Starta om och läs cykeln.

**Förväntat resultat:**

- Typkonflikten stoppar hela sparandet utan att förlora senare privata
  egenskaper.
- Det uttryckliga valet sparar Alex typ tillsammans med 43 och Nej.

### TYP-10: Fria egenskaper och fel förblir nåbara

**Syfte:** Fel öppnar rätt avsnitt och fokus, egenskaper och sparåtgärd är
nåbara utan vågrät
rullning.

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
    "spec": "tests/integration/object-builtins.spec.ts",
    "caseId": "TYP-10"
  },
  "reference": "Chromium 1280 × 900 CSS-pixlar; riktig lokal server och SQLite. Smal eller låg vy skyddar omflöde och nåbarhet.",
  "outcomes": [
    "Fel öppnar rätt avsnitt och fokus, egenskaper och sparåtgärd är nåbara utan vågrät rullning.",
    "Text, tal, datum och Ja består genom sparande och omstart; typbyte bevarar Skuld."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Nytt objekt och försök lägga det i utkastet utan namn. Följ
   felsammanfattningens länk till Namn och ange Husets lån, av typen Låneavtal.
2. Under Fria egenskaper, lägg till Beskrivning (Text, Gemensam avtalstext),
   Skuld (Tal,
   12300), Uppgiftsdatum (Datum, 2026-09-01) och Osäkert uppgivet (Ja/nej, Ja).
3. Ändra datumet till 2026-02-30, öppna Grunduppgifter och försök skicka. Följ
   felets
   länk tillbaka till Värde. Kontrollera fokus och rätta till 2026-09-01.
4. Nå Lägg i utkastet och stäng med tangentbordet, tryck Enter och spara hela
   utkastet.
   Starta om och läs objektet i tabellen. Redigera det, byt typ till Avtal och
   kontrollera att Skuld fortfarande är 12300.

**Förväntat resultat:**

- Fel öppnar rätt avsnitt och fokus, egenskaper och sparåtgärd är nåbara utan
  vågrät
  rullning.
- Text, tal, datum och Ja består genom sparande och omstart; typbyte bevarar
  Skuld.

### TYP-15: Fria egenskaper och fel förblir nåbara

**Syfte:** Fel öppnar rätt avsnitt och fokus, egenskaper och sparåtgärd är
nåbara utan vågrät
rullning.

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
    "spec": "tests/integration/object-builtins.spec.ts",
    "caseId": "TYP-15"
  },
  "reference": "Chromium 390 × 900 CSS-pixlar; riktig lokal server och SQLite. Smal eller låg vy skyddar omflöde och nåbarhet.",
  "outcomes": [
    "Fel öppnar rätt avsnitt och fokus, egenskaper och sparåtgärd är nåbara utan vågrät rullning.",
    "Text, tal, datum och Ja består genom sparande och omstart; typbyte bevarar Skuld."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Nytt objekt och försök lägga det i utkastet utan namn. Följ
   felsammanfattningens länk till Namn och ange Husets lån, av typen Låneavtal.
2. Under Fria egenskaper, lägg till Beskrivning (Text, Gemensam avtalstext),
   Skuld (Tal,
   12300), Uppgiftsdatum (Datum, 2026-09-01) och Osäkert uppgivet (Ja/nej, Ja).
3. Ändra datumet till 2026-02-30, öppna Grunduppgifter och försök skicka. Följ
   felets
   länk tillbaka till Värde. Kontrollera fokus och rätta till 2026-09-01.
4. Nå Lägg i utkastet och stäng med tangentbordet, tryck Enter och spara hela
   utkastet.
   Starta om och läs objektet i tabellen. Redigera det, byt typ till Avtal och
   kontrollera att Skuld fortfarande är 12300.

**Förväntat resultat:**

- Fel öppnar rätt avsnitt och fokus, egenskaper och sparåtgärd är nåbara utan
  vågrät
  rullning.
- Text, tal, datum och Ja består genom sparande och omstart; typbyte bevarar
  Skuld.

### TYP-16: Fria egenskaper och fel förblir nåbara

**Syfte:** Fel öppnar rätt avsnitt och fokus, egenskaper och sparåtgärd är
nåbara utan vågrät
rullning.

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
    "spec": "tests/integration/object-builtins.spec.ts",
    "caseId": "TYP-16"
  },
  "reference": "Chromium 320 × 900 CSS-pixlar; riktig lokal server och SQLite. Smal eller låg vy skyddar omflöde och nåbarhet.",
  "outcomes": [
    "Fel öppnar rätt avsnitt och fokus, egenskaper och sparåtgärd är nåbara utan vågrät rullning.",
    "Text, tal, datum och Ja består genom sparande och omstart; typbyte bevarar Skuld."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Nytt objekt och försök lägga det i utkastet utan namn. Följ
   felsammanfattningens länk till Namn och ange Husets lån, av typen Låneavtal.
2. Under Fria egenskaper, lägg till Beskrivning (Text, Gemensam avtalstext),
   Skuld (Tal,
   12300), Uppgiftsdatum (Datum, 2026-09-01) och Osäkert uppgivet (Ja/nej, Ja).
3. Ändra datumet till 2026-02-30, öppna Grunduppgifter och försök skicka. Följ
   felets
   länk tillbaka till Värde. Kontrollera fokus och rätta till 2026-09-01.
4. Nå Lägg i utkastet och stäng med tangentbordet, tryck Enter och spara hela
   utkastet.
   Starta om och läs objektet i tabellen. Redigera det, byt typ till Avtal och
   kontrollera att Skuld fortfarande är 12300.

**Förväntat resultat:**

- Fel öppnar rätt avsnitt och fokus, egenskaper och sparåtgärd är nåbara utan
  vågrät
  rullning.
- Text, tal, datum och Ja består genom sparande och omstart; typbyte bevarar
  Skuld.

### TYP-17: Fria egenskaper och fel förblir nåbara

**Syfte:** Fel öppnar rätt avsnitt och fokus, egenskaper och sparåtgärd är
nåbara utan vågrät
rullning.

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
    "spec": "tests/integration/object-builtins.spec.ts",
    "caseId": "TYP-17"
  },
  "reference": "Chromium 640 × 456 CSS-pixlar; riktig lokal server och SQLite. Smal eller låg vy skyddar omflöde och nåbarhet.",
  "outcomes": [
    "Fel öppnar rätt avsnitt och fokus, egenskaper och sparåtgärd är nåbara utan vågrät rullning.",
    "Text, tal, datum och Ja består genom sparande och omstart; typbyte bevarar Skuld."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Nytt objekt och försök lägga det i utkastet utan namn. Följ
   felsammanfattningens länk till Namn och ange Husets lån, av typen Låneavtal.
2. Under Fria egenskaper, lägg till Beskrivning (Text, Gemensam avtalstext),
   Skuld (Tal,
   12300), Uppgiftsdatum (Datum, 2026-09-01) och Osäkert uppgivet (Ja/nej, Ja).
3. Ändra datumet till 2026-02-30, öppna Grunduppgifter och försök skicka. Följ
   felets
   länk tillbaka till Värde. Kontrollera fokus och rätta till 2026-09-01.
4. Nå Lägg i utkastet och stäng med tangentbordet, tryck Enter och spara hela
   utkastet.
   Starta om och läs objektet i tabellen. Redigera det, byt typ till Avtal och
   kontrollera att Skuld fortfarande är 12300.

**Förväntat resultat:**

- Fel öppnar rätt avsnitt och fokus, egenskaper och sparåtgärd är nåbara utan
  vågrät
  rullning.
- Text, tal, datum och Ja består genom sparande och omstart; typbyte bevarar
  Skuld.

### TYP-12: Tangentbord ordnar egenskaper utan att tappa noll eller nej

**Syfte:** Omordning med tangentbord bevarar noll och Nej och ger begripligt
positionsbesked.

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
    "spec": "tests/integration/object-builtins.spec.ts",
    "caseId": "TYP-12"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Omordning med tangentbord bevarar noll och Nej och ger begripligt positionsbesked.",
    "Andra uppgiften ligger först även efter sparande och återöppning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa Ordningsprov. Lägg till Första uppgiften (Tal, 0) och Andra uppgiften
   (Ja/nej,
   Nej).
2. Fokusera Flytta upp på den andra raden och tryck Enter. Kontrollera fokus
   på dess
   Etikett och beskedet position 1 av 2.
3. Lägg i utkastet och spara. Läs objektet i tabellen, öppna redigering igen och
   kontrollera radordningen.

**Förväntat resultat:**

- Omordning med tangentbord bevarar noll och Nej och ger begripligt
  positionsbesked.
- Andra uppgiften ligger först även efter sparande och återöppning.

### TYP-11: Upprepade typbyten bevarar samtliga egenskaper

**Syfte:** Alla individuella egenskaper består omedelbart vid varje typbyte
och i det privata
förslaget.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Spara typerna Cykel och Motorfordon, objekten Alex blå
cykel och Garaget samt ett
samband mellan dem. Cykeln har Nummer (Text, SYNTH-42) och Försäkrad (Ja/nej,
Nej).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/type-change.spec.ts",
    "caseId": "TYP-11"
  },
  "reference": "Chromium 1280 CSS-pixlar, ljust tema. Varianten skyddar temats fokus och omflöde vid upprepade byten.",
  "outcomes": [
    "Alla individuella egenskaper består omedelbart vid varje typbyte och i det privata förslaget.",
    "Formuläret fungerar utan vågrät rullning; den gemensamma kartan behåller ännu den sparade typen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Redigera Alex blå cykel. Byt till Motorfordon, tillbaka till Cykel och åter
   till
   Motorfordon. Efter varje byte, öppna Fria egenskaper och kontrollera
SYNTH-42 och
   Nej. Öppna Grunduppgifter före nästa byte.
2. Lägg i utkastet och stäng. Läs förslaget och kontrollera samma värden.
   Spara inte
   hela utkastet.

**Förväntat resultat:**

- Alla individuella egenskaper består omedelbart vid varje typbyte och i det
  privata
  förslaget.
- Formuläret fungerar utan vågrät rullning; den gemensamma kartan behåller
  ännu den
  sparade typen.

### TYP-18: Upprepade typbyten bevarar samtliga egenskaper

**Syfte:** Alla individuella egenskaper består omedelbart vid varje typbyte
och i det privata
förslaget.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Spara typerna Cykel och Motorfordon, objekten Alex blå
cykel och Garaget samt ett
samband mellan dem. Cykeln har Nummer (Text, SYNTH-42) och Försäkrad (Ja/nej,
Nej).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/type-change.spec.ts",
    "caseId": "TYP-18"
  },
  "reference": "Chromium 1280 CSS-pixlar, mörkt tema. Varianten skyddar temats fokus och omflöde vid upprepade byten.",
  "outcomes": [
    "Alla individuella egenskaper består omedelbart vid varje typbyte och i det privata förslaget.",
    "Formuläret fungerar utan vågrät rullning; den gemensamma kartan behåller ännu den sparade typen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Redigera Alex blå cykel. Byt till Motorfordon, tillbaka till Cykel och åter
   till
   Motorfordon. Efter varje byte, öppna Fria egenskaper och kontrollera
SYNTH-42 och
   Nej. Öppna Grunduppgifter före nästa byte.
2. Lägg i utkastet och stäng. Läs förslaget och kontrollera samma värden.
   Spara inte
   hela utkastet.

**Förväntat resultat:**

- Alla individuella egenskaper består omedelbart vid varje typbyte och i det
  privata
  förslaget.
- Formuläret fungerar utan vågrät rullning; den gemensamma kartan behåller
  ännu den
  sparade typen.

### TYP-19: Upprepade typbyten bevarar samtliga egenskaper

**Syfte:** Alla individuella egenskaper består omedelbart vid varje typbyte
och i det privata
förslaget.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Spara typerna Cykel och Motorfordon, objekten Alex blå
cykel och Garaget samt ett
samband mellan dem. Cykeln har Nummer (Text, SYNTH-42) och Försäkrad (Ja/nej,
Nej).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/type-change.spec.ts",
    "caseId": "TYP-19"
  },
  "reference": "Chromium 390 CSS-pixlar, ljust tema. Varianten skyddar temats fokus och omflöde vid upprepade byten.",
  "outcomes": [
    "Alla individuella egenskaper består omedelbart vid varje typbyte och i det privata förslaget.",
    "Formuläret fungerar utan vågrät rullning; den gemensamma kartan behåller ännu den sparade typen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Redigera Alex blå cykel. Byt till Motorfordon, tillbaka till Cykel och åter
   till
   Motorfordon. Efter varje byte, öppna Fria egenskaper och kontrollera
SYNTH-42 och
   Nej. Öppna Grunduppgifter före nästa byte.
2. Lägg i utkastet och stäng. Läs förslaget och kontrollera samma värden.
   Spara inte
   hela utkastet.

**Förväntat resultat:**

- Alla individuella egenskaper består omedelbart vid varje typbyte och i det
  privata
  förslaget.
- Formuläret fungerar utan vågrät rullning; den gemensamma kartan behåller
  ännu den
  sparade typen.

### TYP-20: Upprepade typbyten bevarar samtliga egenskaper

**Syfte:** Alla individuella egenskaper består omedelbart vid varje typbyte
och i det privata
förslaget.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Spara typerna Cykel och Motorfordon, objekten Alex blå
cykel och Garaget samt ett
samband mellan dem. Cykeln har Nummer (Text, SYNTH-42) och Försäkrad (Ja/nej,
Nej).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/type-change.spec.ts",
    "caseId": "TYP-20"
  },
  "reference": "Chromium 390 CSS-pixlar, mörkt tema. Varianten skyddar temats fokus och omflöde vid upprepade byten.",
  "outcomes": [
    "Alla individuella egenskaper består omedelbart vid varje typbyte och i det privata förslaget.",
    "Formuläret fungerar utan vågrät rullning; den gemensamma kartan behåller ännu den sparade typen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Redigera Alex blå cykel. Byt till Motorfordon, tillbaka till Cykel och åter
   till
   Motorfordon. Efter varje byte, öppna Fria egenskaper och kontrollera
SYNTH-42 och
   Nej. Öppna Grunduppgifter före nästa byte.
2. Lägg i utkastet och stäng. Läs förslaget och kontrollera samma värden.
   Spara inte
   hela utkastet.

**Förväntat resultat:**

- Alla individuella egenskaper består omedelbart vid varje typbyte och i det
  privata
  förslaget.
- Formuläret fungerar utan vågrät rullning; den gemensamma kartan behåller
  ännu den
  sparade typen.

### TYP-21: Upprepade typbyten bevarar samtliga egenskaper

**Syfte:** Alla individuella egenskaper består omedelbart vid varje typbyte
och i det privata
förslaget.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Spara typerna Cykel och Motorfordon, objekten Alex blå
cykel och Garaget samt ett
samband mellan dem. Cykeln har Nummer (Text, SYNTH-42) och Försäkrad (Ja/nej,
Nej).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/type-change.spec.ts",
    "caseId": "TYP-21"
  },
  "reference": "Chromium 320 CSS-pixlar, ljust tema. Varianten skyddar temats fokus och omflöde vid upprepade byten.",
  "outcomes": [
    "Alla individuella egenskaper består omedelbart vid varje typbyte och i det privata förslaget.",
    "Formuläret fungerar utan vågrät rullning; den gemensamma kartan behåller ännu den sparade typen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Redigera Alex blå cykel. Byt till Motorfordon, tillbaka till Cykel och åter
   till
   Motorfordon. Efter varje byte, öppna Fria egenskaper och kontrollera
SYNTH-42 och
   Nej. Öppna Grunduppgifter före nästa byte.
2. Lägg i utkastet och stäng. Läs förslaget och kontrollera samma värden.
   Spara inte
   hela utkastet.

**Förväntat resultat:**

- Alla individuella egenskaper består omedelbart vid varje typbyte och i det
  privata
  förslaget.
- Formuläret fungerar utan vågrät rullning; den gemensamma kartan behåller
  ännu den
  sparade typen.

### TYP-22: Upprepade typbyten bevarar samtliga egenskaper

**Syfte:** Alla individuella egenskaper består omedelbart vid varje typbyte
och i det privata
förslaget.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Spara typerna Cykel och Motorfordon, objekten Alex blå
cykel och Garaget samt ett
samband mellan dem. Cykeln har Nummer (Text, SYNTH-42) och Försäkrad (Ja/nej,
Nej).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/type-change.spec.ts",
    "caseId": "TYP-22"
  },
  "reference": "Chromium 320 CSS-pixlar, mörkt tema. Varianten skyddar temats fokus och omflöde vid upprepade byten.",
  "outcomes": [
    "Alla individuella egenskaper består omedelbart vid varje typbyte och i det privata förslaget.",
    "Formuläret fungerar utan vågrät rullning; den gemensamma kartan behåller ännu den sparade typen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Redigera Alex blå cykel. Byt till Motorfordon, tillbaka till Cykel och åter
   till
   Motorfordon. Efter varje byte, öppna Fria egenskaper och kontrollera
SYNTH-42 och
   Nej. Öppna Grunduppgifter före nästa byte.
2. Lägg i utkastet och stäng. Läs förslaget och kontrollera samma värden.
   Spara inte
   hela utkastet.

**Förväntat resultat:**

- Alla individuella egenskaper består omedelbart vid varje typbyte och i det
  privata
  förslaget.
- Formuläret fungerar utan vågrät rullning; den gemensamma kartan behåller
  ännu den
  sparade typen.

## Mänsklig observation

### TYP-23: Fysiskt tangentbord vid verklig webbläsarförstoring

**Syfte:** Kontrollera faktiskt synligt fokus och nåbara åtgärder vid
förstoring.

**Användare:** Alex på fysisk dator med tangentbord och Chromium.

**Förutsättningar:** Nytt provhushåll. Anteckna webbläsare och förstoring.

**Kräver mänsklig observation:** Använd det fysiska tangentbordet för
webbläsarens förstoring och Tab-navigering. Lyssnande skärmläsarprov och
övrig fysisk användning behåller sina ordinarie ansvariga observationer.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{"humanObservation":{"kind":"physical-input","observation":"Förstora den verkliga webbläsaren med fysiskt tangentbord, följ Tab-fokus och nå formulärets fält, felsammanfattning och sparknapp."},"reference":"Fysiskt tangentbord, Chromium på dator, 100 och 200 procent webbläsarförstoring.","outcomes":["Förstorat formulär behåller synligt fokus och nåbara fält samt sparknapp."],"evidence":[{"kind":"overlap","runner":"playwright","suite":"integration","spec":"tests/integration/object-builtins.spec.ts","caseId":"TYP-17","purpose":"Syntetisk låg vy skyddar formulärfel och rullning utan att utföra fysisk förstoring."}]}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Vid 100 procent: öppna Nytt objekt och försök skicka utan namn med Tab
   och Enter. Följ felets länk till Namn och skriv Förstoringsprov.
2. Förstora webbläsaren till 200 procent med Ctrl/Command och plus.
   Öppna Fria egenskaper och lägg till Kontrolldatum av datatyp Datum.
   Ange 2026-02-30. Försök skicka och följ felets länk tillbaka till Värde.
3. Rätta till 2026-02-28. Nå Lägg i utkastet och stäng med tangentbordet
   och lägg i utkastet. Läs återkopplingen. Återställ 100 procent med
   Ctrl/Command och noll och kasta provförslaget separat.

**Förväntat resultat:** Fokus är synligt och fel, sista fält och sparknapp
är nåbara även med webbläsarens verkliga förstoring.

## Avvecklade identiteter och täckning

TYP-08, TYP-09, TYP-13 och TYP-14 är avvecklade och får inte återanvändas.
Deras typstyrda avsnitt, dolda svar och fältplacering har tagits bort ur
produkten. Fortsatt individuell ordning och formulärnåbarhet täcks av
TYP-12 respektive TYP-10, TYP-15, TYP-16 och TYP-17. Den rena förmågan att
ordna typavsnitt har godkänd täckningsförlust eftersom den inte finns kvar.
Tidigare skydd för att ändra datatypen på ett använt typfält är avvecklat
med typfälten; individuell validering finns i TYP-05. TYP-06, TYP-07 och
TYP-11 samt TYP-18–22 behåller sina identiteter med värdebevarande typbyten.

Automatiserade steg använder verklig server och SQLite men utför inga
mänskliga hjälpmedelsobservationer. Fysisk inmatning och verklig uppläsning
kräver separat observation; inga sådana resultat är påhittade här.
