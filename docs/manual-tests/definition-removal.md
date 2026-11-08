# Manuella testfall för borttagning av typer

Prova granskning av typborttagning med följder, bevarade utkast och
vanlig rättning samt läsning av historiska definitioner.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

När förberedelsen anger ett samband som **A → verb → B**, skriv den
angivna mittdelen i **Verb** på det enskilda sambandet. Välj den angivna
sambandstypen separat. När ett steg ändrar både typen och formuleringen,
ändra också **Verb** uttryckligen.

## Konfigurerade användare

- Alex Exempel är administratör i provhushållet Linden.
- Robin Exempel är vanlig medlem i samma hushåll och använder en separat
  webbläsarprofil. Båda loggar in med provmiljöns konfigurerade inloggning.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

Öppna **Inställningar → Typer** för typformulären.
Välj **Tillbaka till kartan** före granskning. Öppna **Skriv till Skyttel →
Visa utkastet** och välj radens **Visa förslaget: [namn]** för fullständiga
tidigare och föreslagna definitioner. Stäng läsningen med krysset.
Utkastets sparikon öppnar **Spara utkastet**. Vänta på **Utkastet är sparat**
och stäng textvyn före fortsatt arbete i Inställningar eller Tabell.

1. Använd en isolerad provinstallation med påhittade uppgifter. Skapa
   hushållet som Alex och bjud in Robin.
2. Börja varje fall med ett tomt hushåll och utan privata utkast.
   Återställ endast provmiljön mellan fallen. Bevara databasen vid omstart
   inom ett fall.

## Borttagning och återställning

### KATALOG-01: Granska, kasta och spara typborttagning med följder

**Syfte:** Typbetydelse och båda typborttagningarna granskas som fullständiga
privata förslag; kastning behåller katalogen oförändrad.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Spara Person med typbeskrivningen Gemensam betydelse och
den egna typen Solcellsanläggning med beskrivningen Egen typ för soltak.
Spara Soltaket av den typen, Huset av en annan typ och ett Använder-samband
från Soltaket till Huset. Soltaket och sambandet har status Upphört.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/definition-removal.spec.ts",
    "caseId": "KATALOG-01"
  },
  "reference": "Chromium, riktig lokal server och SQLite; konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Typbetydelse och båda typborttagningarna granskas som fullständiga privata förslag; kastning behåller katalogen oförändrad.",
    "Separat samlat sparande tar bort Soltaket och dess samband med typerna, behåller Huset och bevarar läsbar historik efter omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Inställningar → Typer → Objekttyper och ändra Person. Ange Rättad
   gemensam betydelse och lägg typförslaget i utkastet.
2. Ändra Solcellsanläggning och välj Ta bort objekttypen. Öppna Sambandstyper
   och riktning, ändra Använder och välj Ta bort sambandstypen. Återgå till
   kartan.
3. Granska Person-förslagets tidigare och nya beskrivning samt båda
   borttagningsförslagens tidigare definitioner. Läs också Soltaket och dess
   samband som borttagningsförslag. Välj Kasta hela utkastet och
   bekräfta Ta bort hela utkastet. Kontrollera att katalogens tidigare
   definitioner, Soltaket och sambandet består.
4. Upprepa samma ändring och typborttagningar. Öppna Objekttyper och
   Sambandstyper och riktning om respektive lista är stängd.
   Spara hela utkastet. Starta om,
   ladda om och läs Rättad gemensam betydelse i Person-definitionen. De två
   valda typerna, Soltaket och sambandet ska saknas. Huset och övriga typer
   ska finnas kvar.
5. Öppna Rapporter och Visa ändringarna för det senaste sparandet. Läs de båda
   borttagna definitionerna och Person-beskrivningens före och efter.

**Förväntat resultat:**

- Typbetydelse och båda typborttagningarna granskas som fullständiga privata
  förslag; kastning behåller katalogen oförändrad.
- Separat samlat sparande tar bort Soltaket och dess samband med typerna,
  behåller Huset och bevarar läsbar historik efter omstart.

### KATALOG-02: Bevara andras utkast och rätta med vanliga formulär

**Syfte:** Typborttagning hindras inte av andras utkast. Saknade typer kan
rättas för ännu osparat innehåll utan att privata värden försvinner.

**Användare:** Alex och Robin i separata webbläsarprofiler.

**Förutsättningar:** Alex sparar Garaget med en annan objekttyp än Person.
Robin lägger Privat provnamn av typen Person med textegenskapen Serienummer:
PRIVAT-PROVVÄRDE i sitt utkast, samt ett Använder-samband till Garaget.
Objekt och samband har status Upphört. Spara inte Robins utkast.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/definition-removal.spec.ts",
    "caseId": "KATALOG-02"
  },
  "reference": "Chromium, två profiler, riktig lokal server och SQLite; upphörda privata tillägg med saknade objekt- och sambandstyper.",
  "outcomes": [
    "Alex kan granska och spara båda typborttagningarna utan att se Robins privata namn eller värden.",
    "Robins förslag bevaras med konflikter och kan rättas genom ny objekttyp och val av befintlig sambandstyp före samlat sparande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta om med samma databas. Robin läser sina fullständiga förslag.
2. Alex öppnar Typer och tar bort Person och Använder. Återgå till kartan
   och granska utkastet. Robins namn och serienummer ska inte visas.
   Spara hela Alex utkast.
3. Robin laddar om och läser sina förslag igen. Namn, status och serienummer
   finns kvar, men utkastet visar att förslagen behöver rättas.
4. Robin öppnar Inställningar → Typer → Ny objekttyp. Ange Person med
   beskrivningen Ny egen betydelse och lägg typförslaget i utkastet.
5. Återgå till kartan. Markera Ta med upphörda i Tabellens filter.
   Redigera Privat provnamn, välj den nya typen och lägg ändringen i
   utkastet. Öppna Samband för Privat provnamn, redigera sambandet och välj
   en annan befintlig sambandstyp. Lägg ändringen i utkastet, invänta att
   redigeringen stängs och stäng sedan dialogen Samband för Privat provnamn.
6. Spara hela utkastet. Starta om och ladda om. Markera Ta med upphörda igen.
   Läs Privat provnamn i Tabell:
   serienumret och typnamnet Person ska finnas kvar.

**Förväntat resultat:**

- Båda typborttagningarna går att spara utan privat röjande.
- Robins fullständiga förslag ligger kvar och kräver rättning före sparande.
- Den nya typen och rättade förslag sparas tillsammans. Den gamla typens
  identitet återkommer inte; samma namn innebär inte samma typ.

### KATALOG-03: läs borttagna definitioner utan att ändra eget arbete

**Syfte:** Läsa historiska definitioner när de saknas i dagens katalog.

**Användare:** Alex.

**Förutsättningar:** Spara Lo Exempel som Person, Garaget som en annan typ
och sambandet Lo Exempel Använder Garaget. Ta bort typen Person, granska
Lo och sambandet som följder och spara. Ta sedan bort den oanvända
sambandstypen Använder och spara.
Lägg ett oberoende objekt med en annan typ i utkastet utan att spara.

**Integrationstest:**
[definition-removal.spec.ts](../../tests/integration/definition-removal.spec.ts),
testfallet “KATALOG-03: history reads removed definitions and content without
changing independent work”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/definition-removal.spec.ts",
    "caseId": "KATALOG-03"
  },
  "reference": "1280 × 720; Chromium och separata testinloggningar; verklig HTTP och SQLite.",
  "outcomes": [
    "Historiken läser borttagna objekt, samband och deras tidigare typer utan att återställa dem.",
    "Garaget och det oberoende fullständiga förslaget består före och efter omstart; samma historiska betydelser går fortfarande att läsa."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Rapporter** och hitta borttagningen av Lo och sambandet.
2. Välj **Visa ändringarna** och läs tidigare namn och typbetydelser.
3. Återgå till arbetet. Läs Garaget och dess typ genom Tabell; Lo och
   sambandet saknas fortfarande. Öppna **Inställningar → Typer** och
   kontrollera att Person och Använder saknas i respektive katalog
   medan de övriga typerna finns kvar. Återgå till kartan och läs hela det
   oberoende förslaget i utkastet; inga återställningsförslag tillkommer.
4. Starta om med samma databas och ladda om. Upprepa läsningen av aktuell
   karta, katalog och hela det oberoende förslaget från steg 3. Läs samma
   historiska namn och typbetydelser i Rapporter.

**Förväntat resultat:**

- Historiken beskriver tidigare innehåll även när typerna saknas i katalogen.
- Karta och katalog saknar fortfarande det borttagna innehållet. Garaget
  är oförändrat och det oberoende förslaget finns kvar i utkastet.
- Omstart bevarar dessa värden och den ursprungliga historikgruppen.
  Historikläsningen skapar inga återställningsförslag.

### KATALOG-04: Återta typborttagning och återfå bevarat arbete

**Syfte:** Egna osparade objekt- och sambandsförslag kan läsas under
typborttagningen och återkommer när borttagningsförslaget kastas.

**Användare:** Alex.

**Förutsättningar:** Spara Lo Exempel som Person och Molnmusik som en annan
typ. Föreslå namnbytet Mitt ändrade namn för Lo och textegenskapen
Anteckning: Bevarat arbete. Föreslå ett nytt Person-objekt Nytt arbete och
ett Använder-samband till Molnmusik med Anteckning: Bevarat samband.
Spara inte utkastet. Använd en 320 bildpunkter bred webbläsarvy.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/definition-removal.spec.ts",
    "caseId": "KATALOG-04"
  },
  "reference": "Chromium, 320 × 900, riktig lokal server och SQLite; tangentbord öppnar och stänger förslagsläsningen.",
  "outcomes": [
    "Fullständiga osparade värden går att läsa medan typborttagningen undertrycker dem.",
    "Återtagning av typborttagningen återger objektens och sambandets tidigare förslag utan att ändra sparat innehåll."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Typer, ändra Person och välj Ta bort objekttypen. Återgå till
   kartan och öppna Visa utkastet.
2. Fokusera Visa förslaget: Lo Exempel och tryck Retur. Läs Bevarat
   objektförslag med Mitt ändrade namn och Bevarat arbete. Stäng med Escape
   och kontrollera att fokus återgår till samma knapp.
3. Läs även Nytt arbete som bevarat objektförslag. Stäng läsdialogen.
4. Kasta typborttagningsförslaget för Person. Granska beroendena och välj
   Ta bort. Läs Mitt ändrade namn, dess anteckning och Nytt arbete som
   vanliga förslag igen. Läs sambandet till Molnmusik och Bevarat samband.
5. Stäng textvyn och läs Mitt ändrade namn i Tabell. Inget är sparat;
   förslagen finns kvar för fortsatt arbete och senare samlat sparande.

**Förväntat resultat:** Bevarade värden är läsbara, tangentbordsfokus
återkommer efter läsning och återtagning av typborttagningen återger
arbetet utan ändringar i den gemensamma kartan.

## Avvecklat beteende

KATALOG-01–03 behåller sina identiteter. Borttagning av typstyrda fält
är avvecklad med fältmodellen; dess separata användningsspärr har godkänd
täckningsförlust. Typborttagning, betydelserättelse, privat användning och
historikläsning fortsätter i samma fall. Fria egenskaper hör till objekten
och sambanden och tas inte bort genom typkatalogen.
