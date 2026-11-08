# Manuella testfall för sambandstyper och fria egenskaper

Fallen provar delade definitioner, riktning, dubbletter, typbyte och sambandens
individuella uppgifter.

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

Verb hör till det enskilda sambandet. När ett fall anger ett ordval,
fyll även fältet **Verb**; ett typval väljer bara gruppering. Om ingen
omvänd benämning finns visas den ursprungliga riktningen från båda objekten.

Granska utkastet genom **Skriv till Skyttel → Visa utkastet → Visa förslaget:
[namn]**.
Stäng läsningen med krysset. Spara hela utkastet separat och invänta
**Utkastet är sparat**. Stäng textvyn före fortsatt tabellarbete.
Rapporter visar **Ändringshistorik** med **Visa ändringarna**.

## Definitioner och riktning

### STY-01: Typ och individuella sambandsegenskaper sparas tillsammans

**Syfte:** Definition, två verkliga objekt och individuell sambandsegenskap
bevaras i samma privata
utkast och samlade sparande.

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
    "spec": "tests/integration/relationship-types.spec.ts",
    "caseId": "STY-01"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Definition, två verkliga objekt och individuell sambandsegenskap bevaras i samma privata utkast och samlade sparande.",
    "Efter omstart visar sambandet Låst skåp med rätt riktning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa sambandstypen Förvaring i Typer. Försök skicka före det
   obligatoriska namnet och kontrollera fokus. Ange namnet och beskrivningen
   Var hushållets saker finns. Lägg typförslaget i utkastet.
2. Skapa Alex blå cykel som Fordon och Garaget som Bostad. Lägg båda i
   utkastet. Öppna
   Samband för Alex blå cykel, Nytt samband och välj Förvaring till Garaget.
   Ange förvaras i som Verb. Lägg till Anteckning (Text, Låst skåp).
   Lägg i utkastet och stäng sambandet.
3. Starta om installationen, ladda om och granska sambandsförslaget. Spara hela
   utkastet. Starta om igen och läs sambandet.

**Förväntat resultat:**

- Definition, två verkliga objekt och individuell sambandsegenskap bevaras i
  samma privata
  utkast och samlade sparande.
- Efter omstart visar sambandet Låst skåp med rätt riktning.

### STY-02: Båda riktningarna visar samma samband

**Syfte:** Båda benämningarna avser samma riktade samband med oförändrade
objekt och identitet.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Tomt provhushåll. Objektens namn ska vara Alex blå cykel
och Garaget.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-types.spec.ts",
    "caseId": "STY-02"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Båda benämningarna avser samma riktade samband med oförändrade objekt och identitet.",
    "Dubblett ger begripligt besked och typens namnändring visas efter samlat sparande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa Alex blå cykel och Garaget i utkastet. Skapa Förvaring med
   beskrivningen Var hushållets saker finns.
2. Öppna Nytt samband från cykeln och välj Garaget. Ange verbet förvaras i
   och den valfria omvända benämningen innehåller på sambandet. Välj
   Förvaring som gruppering och lägg i utkastet. Läs förslaget.
3. Försök lägga till samma typ, verb och ändpunkter igen. Läs Sambandet finns
   redan och avbryt formuläret med bekräftad förlust. Spara hela utkastet.
4. Läs sambandet från cykeln och från Garaget. Öppna redigering från Garaget och
   kontrollera att cykeln fortfarande är frånobjektet. Stäng utan ändring.
5. Ändra typens namn till Plats, beskrivningen till Hushållets
   förvaringsplatser. Granska definitionens gamla och nya beskrivning, spara
   och läs sambandet igen.

**Förväntat resultat:**

- Båda benämningarna avser samma riktade samband med oförändrade objekt och
  identitet.
- Dubblett ger begripligt besked och typens namnändring visas efter samlat
  sparande. Sambandets ordval förvaras i och innehåller behålls.

### STY-03: Vanlig medlem redigerar delad typ med privat förslag

**Syfte:** Vanlig medlem kan föreslå och spara ändring av delad sambandstyp
medan det osparade
typförslaget förblir privat.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Alex och Robin delar samma hushåll i separata profiler.
Spara först Gemensamt objekt.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-types.spec.ts",
    "caseId": "STY-03"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Vanlig medlem kan föreslå och spara ändring av delad sambandstyp medan det osparade typförslaget förblir privat.",
    "Efter sparandet läser Alex Medlemmens förklaring."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Robin öppnar Typer, Sambandstyper och riktning och ändrar hushållets första
   sambandstyp, Använder. Ange Medlemmens förklaring som beskrivning.
   Behåll namnet. Lägg typförslaget i
   utkastet och kontrollera att förslaget finns i Robins utkast.
2. Alex kontrollerar att Robins förslag inte finns i Alex utkast och att den
   sparade
   typen fortfarande har sin gamla beskrivning.
3. Robin sparar hela utkastet. Alex laddar om, öppnar samma typ och läser
   beskrivningen.

**Förväntat resultat:**

- Vanlig medlem kan föreslå och spara ändring av delad sambandstyp medan det
  osparade
  typförslaget förblir privat.
- Efter sparandet läser Alex Medlemmens förklaring.

### STY-04: Typkonflikt bevarar oberoende definitionsändring

**Syfte:** Konflikten stoppar hela sparandet fram till uttryckligt val.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Alex och Robin delar ett tomt hushåll i separata profiler.
Förberedaren kör den separata
[förberedelsen för typkonflikt](historical-definition-preparation.md#typkonflikt-i-sty-04)
i båda profilerna före stegen. Den skapar samtidiga typförslag genom publika
anrop. Typformuläret ändrar namn och beskrivning; sambandets verb och
valfria omvända benämning hör till det enskilda sambandet.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-types.spec.ts",
    "caseId": "STY-04"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Konflikten stoppar hela sparandet fram till uttryckligt val.",
    "Plats sparas med Robins oberoende beskrivning Los nya förklaring och sambandet. Sambandets egna ordval förvaras i och innehåller är oförändrade."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex laddar om och öppnar **Granska konflikter**. Läs typförslagets namn
   **Plats** mot det sparade namnet **Los plats**. Den gemensamma kartan
   innehåller ännu inte Cykeln, Garaget eller deras samband.
2. Välj Alex föreslagna motstridiga värden och **Lägg valen i utkastet**.
   Läs resultatet, stäng och granska hela typförslaget **Plats** i utkastet.
   Robins oberoende beskrivning **Los nya förklaring** finns kvar. Läs också
   Cykeln, Garaget och sambandsförslaget **Cykeln → förvaras i → Garaget**.
3. Spara hela utkastet separat. Starta om och läs sparandet i historiken:
   typen **Plats**, beskrivningen **Los nya förklaring** och sambandet finns
   med. Förberedaren kontrollerar namn, beskrivning och sambandets ordval
   i det sparade underlaget och kvittot enligt den separata förberedelsen.

**Förväntat resultat:**

- Konflikten stoppar hela sparandet fram till uttryckligt val.
- Plats sparas med Robins oberoende beskrivning Los nya förklaring och
  sambandet. Sambandets egna ordval förvaras i och innehåller är oförändrade.

### STY-05: Dubblett och samtidig sparning ger inget delsparande

**Syfte:** Dubbletter behåller identitet och skriver inte över befintligt
samband eller delar av
utkastet.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Alex och Robin delar ett tomt hushåll. De fasta
provnamnen används bara i denna separata
installation.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-types.spec.ts",
    "caseId": "STY-05"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Dubbletter behåller identitet och skriver inte över befintligt samband eller delar av utkastet.",
    "Borttagning av det egna dubblettförslaget behåller oberoende objekt och typändring; det omvända sambandet förblir upphört."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered tre objekt bike, garage och shed samt två sambandstyper Förvaring
   och Annan
   betydelse med förvaras i och innehåller. Spara ett samband av varje typ
mellan bike
   och garage.
2. Försök lägga till Förvaring mellan samma objekt igen och sedan ändra det
   andra
   sambandet till samma riktning och typ. Kontrollera dubblettbeskeden. Vänd i
stället
   det andra sambandet, välj Upphört och spara.
3. Alex föreslår Förvaring mellan bike och shed, en namnändring av typen och ett
   oberoende objekt. Robin lägger samma samband i sitt utkast och sparar först.
4. Alex försöker spara och öppnar Granska konflikter. Läs
   dubblettförklaringen, stäng
   utan åtgärd och öppna igen. Välj Ta bort sambandet ur ditt utkast. Spara
därefter
   hela utkastet och läs historiken.

**Förväntat resultat:**

- Dubbletter behåller identitet och skriver inte över befintligt samband eller
  delar av
  utkastet.
- Borttagning av det egna dubblettförslaget behåller oberoende objekt och
  typändring; det
  omvända sambandet förblir upphört.

## Individuella egenskaper

### STY-06: Sambandets fria egenskaper bevarar ordning och tomma svar

**Syfte:** Fria sambandsegenskaper behåller talet 0, Nej och en separat tom
Ja/nej-rad genom
omstart och rättelse.

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
    "spec": "tests/integration/relationship-fields.spec.ts",
    "caseId": "STY-06"
  },
  "reference": "Chromium 1440 CSS-pixlar; riktig lokal server och SQLite. Mobilvarianten skyddar nåbara åtgärder och omflöde.",
  "outcomes": [
    "Fria sambandsegenskaper behåller talet 0, Nej och en separat tom Ja/nej-rad genom omstart och rättelse.",
    "Tangentbordets omordning och inskickning fungerar utan vågrät rullning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa Alex som Person och Blå cykeln som Fordon i utkastet. Öppna Samband
   för Alex
   och Nytt samband. Välj typen Använder, skriv **Använder** i **Verb**
   och välj Blå cykeln som Till objekt.
2. Lägg till Anteckning (Text, Låst skåp), Belopp (Tal, 0), Startdatum (Datum,
   2026-09-27), Bekräftat (Ja/nej, Nej) och Obesvarat (Ja/nej, Tomt).
3. Fokusera Flytta upp på Obesvarat och tryck Enter. Kontrollera fokus på dess
   Etikett.
   Nå Lägg i utkastet med tangentbordet och skicka. Stäng sambandet och spara
hela
   utkastet.
4. Starta om, ladda om och redigera sambandet. Kontrollera alla värden och
   ordningen.
   Ändra Anteckning till Övre hyllan, lägg i utkastet och spara.

**Förväntat resultat:**

- Fria sambandsegenskaper behåller talet 0, Nej och en separat tom Ja/nej-rad
  genom
  omstart och rättelse.
- Tangentbordets omordning och inskickning fungerar utan vågrät rullning.

### STY-09: Sambandets fria egenskaper bevarar ordning och tomma svar

**Syfte:** Fria sambandsegenskaper behåller talet 0, Nej och en separat tom
Ja/nej-rad genom
omstart och rättelse.

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
    "spec": "tests/integration/relationship-fields.spec.ts",
    "caseId": "STY-09"
  },
  "reference": "Chromium 390 CSS-pixlar; riktig lokal server och SQLite. Mobilvarianten skyddar nåbara åtgärder och omflöde.",
  "outcomes": [
    "Fria sambandsegenskaper behåller talet 0, Nej och en separat tom Ja/nej-rad genom omstart och rättelse.",
    "Tangentbordets omordning och inskickning fungerar utan vågrät rullning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa Alex som Person och Blå cykeln som Fordon i utkastet. Öppna Samband
   för Alex
   och Nytt samband. Välj typen Använder, skriv **Använder** i **Verb**
   och välj Blå cykeln som Till objekt.
2. Lägg till Anteckning (Text, Låst skåp), Belopp (Tal, 0), Startdatum (Datum,
   2026-09-27), Bekräftat (Ja/nej, Nej) och Obesvarat (Ja/nej, Tomt).
3. Fokusera Flytta upp på Obesvarat och tryck Enter. Kontrollera fokus på dess
   Etikett.
   Nå Lägg i utkastet med tangentbordet och skicka. Stäng sambandet och spara
hela
   utkastet.
4. Starta om, ladda om och redigera sambandet. Kontrollera alla värden och
   ordningen.
   Ändra Anteckning till Övre hyllan, lägg i utkastet och spara.

**Förväntat resultat:**

- Fria sambandsegenskaper behåller talet 0, Nej och en separat tom Ja/nej-rad
  genom
  omstart och rättelse.
- Tangentbordets omordning och inskickning fungerar utan vågrät rullning.

### STY-07: Sambandets egenskaper bevaras direkt vid typbyte

**Syfte:** Typbyte bevarar alla individuella egenskaper omedelbart och efter
sparande och omstart.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Alex och Blå cykeln finns i ett separat provhushåll.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-fields.spec.ts",
    "caseId": "STY-07"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Typbyte bevarar alla individuella egenskaper omedelbart och efter sparande och omstart.",
    "Behåll uppgiften och Nej visas på samma samband med den valda typen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Spara ett samband med typen Använder och **Verb: Använder** från Alex
   till Blå cykeln med Anteckning (Text,
   Behåll
   uppgiften) och Kontrollerat (Ja/nej, Nej).
2. Redigera sambandet och välj typen Äger. Behåll **Verb: Använder**.
   Läs samma egenskapsvärden direkt.
   Lägg i
   utkastet och spara.
3. Starta om, ladda om och läs sambandet från Alex.

**Förväntat resultat:**

- Typbyte bevarar alla individuella egenskaper omedelbart och efter sparande
  och omstart.
- Behåll uppgiften och Nej visas på samma samband med den valda typen.

## Avvecklade identiteter och täckning

STY-08, STY-10 och STY-11 är avvecklade och får inte återanvändas.
Typstyrda avsnitt, dolda fält och privata presentationsdefinitioner finns
inte kvar. Den rena avsnittsfunktionen har godkänd täckningsförlust.
Individuell egenskapsordning, tomma värden och mobil redigering fortsätter
i STY-06 och STY-09; värdebevarande typbyte fortsätter i STY-07.
Skydd för ändring av använda typfälts datatyp försvinner med typfälten.
Åtkomstgränsernas tekniska bevis ligger i serverns åtkomsttester; dessa
formulärfall gör inget nytt påstående om åtkomst mellan hushåll.

Vanliga browsersteg utför ingen faktisk skärmläsaruppläsning, fysisk
pekinmatning eller mobil tangentbordsobservation. Anteckna sådana utfall
under de befintliga ansvariga människoproven.
