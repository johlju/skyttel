# Manuella testfall för borttagning av typer

Prova granskad katalogborttagning, användningsspärrar utan privat
informationsläckage och läsning av historiska definitioner.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

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

### KATALOG-01: Granska, kasta och spara typbetydelse och oanvända typer

**Syfte:** Typbetydelse och båda typborttagningarna granskas som fullständiga
privata förslag; kastning behåller katalogen oförändrad.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Spara Person med typbeskrivningen Gemensam betydelse och
den egna oanvända typen Solcellsanläggning med beskrivningen En egen oanvänd
typ. Använder är oanvänd.

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
    "Separat samlat sparande ändrar bara det valda underlaget och bevarar läsbar historik efter omstart."
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
   borttagningsförslagens tidigare definitioner. Välj Kasta hela utkastet och
   bekräfta Ta bort hela utkastet. Kontrollera att katalogens tidigare
   definitioner består.
4. Upprepa samma ändring och typborttagningar. Öppna Objekttyper och
   Sambandstyper och riktning om respektive lista är stängd.
   Spara hela utkastet. Starta om,
   ladda om och läs Rättad gemensam betydelse i Person-definitionen. De två
   valda typerna ska saknas, övriga finnas kvar.
5. Öppna Rapporter och Visa ändringarna för det senaste sparandet. Läs de båda
   borttagna definitionerna och Person-beskrivningens före och efter.

**Förväntat resultat:**

- Typbetydelse och båda typborttagningarna granskas som fullständiga privata
  förslag; kastning behåller katalogen oförändrad.
- Separat samlat sparande ändrar bara det valda underlaget och bevarar läsbar
  historik efter omstart.

### KATALOG-02: Privat och upphörd användning spärrar typborttagning

**Syfte:** Privata utkast och sparat upphört innehåll spärrar borttagning av
använda objekt- och sambandstyper.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Alex sparar Garaget med en annan objekttyp än Person.
Robin lägger Privat provnamn av typen Person med den fria textegenskapen
Serienummer: PRIVAT-PROVVÄRDE i sitt utkast. Robin föreslår också ett
Använder-samband till Garaget. Objekt och samband har uttrycklig status
Upphört.

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
  "reference": "Chromium, riktig lokal server och SQLite; konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Privata utkast och sparat upphört innehåll spärrar borttagning av använda objekt- och sambandstyper.",
    "Felbesked ger handlingsväg utan att röja privata namn, egenskaper eller identiteter; avvisningen ändrar inget innehåll."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta om med samma databas. Robin läser sitt hela objekt- och
   sambandsförslag. Alex öppnar Typer och försöker ta bort Person. Läs
   felbeskedet.
2. Alex försöker ta bort sambandstypen Använder. Läs att sambanden och deras
   ändpunkter behöver hanteras. Kontrollera att Alex inte ser Robins privata
   namn eller egenskapsvärde i kartan eller beskeden.
3. Robin läser åter sina hela förslag och sparar hela utkastet separat.
   Markera Ta med upphörda i tabellens filter och läs objektet och sambandet.
4. Alex laddar om och upprepar de två typborttagningsförsöken mot det nu
   sparade upphörda innehållet.

**Förväntat resultat:**

- Privata utkast och sparat upphört innehåll spärrar borttagning av använda
  objekt- och sambandstyper.
- Felbesked ger handlingsväg utan att röja privata namn, egenskaper eller
  identiteter; avvisningen ändrar inget innehåll.

### KATALOG-03: läs borttagna definitioner utan att ändra eget arbete

**Syfte:** Läsa historiska definitioner när de saknas i dagens katalog.

**Användare:** Alex.

**Förutsättningar:** Spara Lo Exempel som Person, Garaget som en annan typ
och sambandet Lo Exempel Använder Garaget. Ta bort Lo och sambandet och
spara. Ta sedan bort de oanvända typerna Person och Använder och spara.
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

## Avvecklat beteende

KATALOG-01–03 behåller sina identiteter. Borttagning av typstyrda fält
är avvecklad med fältmodellen; dess separata användningsspärr har godkänd
täckningsförlust. Typborttagning, betydelserättelse, privat användning och
historikläsning fortsätter i samma fall. Fria egenskaper hör till objekten
och sambanden och tas inte bort genom typkatalogen.
