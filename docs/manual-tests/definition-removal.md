# Manuella testfall för borttagning av typer och fält

Prova granskad katalogborttagning, användningsspärrar utan privat
informationsläckage och återställning av innehåll med saknade definitioner.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

- Alex Exempel är administratör i provhushållet Linden.
- Robin Exempel är vanlig medlem i samma hushåll och använder en separat
  webbläsarprofil. Båda loggar in med provmiljöns konfigurerade inloggning.

## Allmän förberedelse

1. Använd en isolerad provinstallation med påhittade uppgifter. Skapa
   hushållet som Alex och bjud in Robin.
2. Börja varje fall med ett tomt hushåll och utan privata utkast.
   Återställ endast provmiljön mellan fallen. Bevara databasen vid omstart
   inom ett fall.

## Borttagning och återställning

### KATALOG-01: granska, kasta och spara oanvända definitioner

**Syfte:** Egna och förifyllda definitioner kan tas bort uttryckligen;
oanvända definitioner städas inte bort automatiskt.

**Användare:** Alex.

**Förutsättningar:** Lägg till textfältet Serienummer på Person. Skapa
objekttypen Solcellsanläggning utan fält. Spara definitionerna utan objekt.
Behåll den förifyllda sambandstypen Använder oanvänd.

**Integrationstest:**
[definition-removal.spec.ts](../../tests/integration/definition-removal.spec.ts),
testfallet “KATALOG-01: unused fields and custom and prefilled types are
reviewed, discarded or saved without automatic cleanup”.

**Steg:**

1. Öppna **Objekttyper och egna fält**, ändra Person och välj **Ta bort
   fält: Serienummer**. Lägg typförslaget i utkastet.
2. Ändra Solcellsanläggning och välj **Ta bort objekttypen**.
3. Öppna **Sambandstyper och riktning**, ändra Använder och välj **Ta bort
   sambandstypen**. Granska alla tidigare definitioner och förslag.
4. Välj **Kasta hela utkastet**. Kontrollera att definitionerna finns kvar.
5. Upprepa borttagningarna och välj **Spara hela utkastet**. Starta om
   appservern med samma databas, ladda om och läs katalogerna och historiken.

**Förväntat resultat:**

- Granskningen visar fältets tidigare betydelse och båda typborttagningarna.
  Inget ändras gemensamt innan sparandet. Kastning behåller definitionerna.
- Sparandet tar bort just det valda fältet och de två valda typerna.
  Andra oanvända typer finns kvar och historiken visar borttagningarna.
- Resultatet finns kvar efter omstart.

### KATALOG-02: hindra borttagning vid privat och upphörd användning

**Syfte:** Användning spärrar borttagning utan att andras privata uppgifter
avslöjas eller något användande innehåll tas bort automatiskt.

**Användare:** Alex och Robin.

**Förutsättningar:** Alex lägger textfältet Serienummer på Person och sparar
objektet Garaget med en annan typ. Robin lägger personen Privat provnamn,
med Serienummer PRIVAT-PROVVÄRDE, i sitt privata utkast. Robin föreslår
också sambandet Använder från personen till garaget. Båda är Upphört.

**Integrationstest:**
[definition-removal.spec.ts](../../tests/integration/definition-removal.spec.ts),
testfallet “KATALOG-02: private drafts and ended content block removal
with a useful explanation and no private disclosure”.

**Steg:**

1. Starta om appservern med samma databas. Som Alex, försök ta bort Person.
   Läs felbeskedet.
2. Försök ta bort fältet Serienummer och lägga typförslaget i utkastet.
   Läs felbeskedet och stäng formuläret utan att skicka.
3. Försök ta bort sambandstypen Använder. Kontrollera beskedet om samband
   och deras ändpunkter. Kontrollera att Robins privata uppgifter saknas
   i Alex karta och i felbeskeden.
4. Som Robin, spara hela utkastet. Som Alex, ladda om och upprepa alla
   tre borttagningsförsöken för det nu sparade upphörda innehållet.

**Förväntat resultat:**

- Borttagningarna stoppas både före och efter Robins sparande.
- Beskeden anger att objekt eller samband behöver tas bort eller byta typ,
  att ändpunkterna kan finnas kvar och att fältvärden behöver hanteras.
- Felbeskeden avslöjar varken Privat provnamn eller PRIVAT-PROVVÄRDE.
  Kartan och bådas utkast förblir oförändrade av de nekade försöken.

### KATALOG-03: återställ saknade definitioner med innehållet

**Syfte:** Historiska definitioner förblir begripliga och återkommer endast
genom ett granskat återställningsförslag och nytt sparande.

**Användare:** Alex.

**Förutsättningar:** Spara Lo Exempel som Person, Garaget som en annan typ
och sambandet Lo Exempel Använder Garaget. Ta bort Lo Exempel och spara
den borttagningen med sambandet. Ta sedan bort de oanvända typerna Person
och Använder och spara. Lägg ett oberoende objekt med en annan typ i utkastet.

**Integrationstest:**
[definition-removal.spec.ts](../../tests/integration/definition-removal.spec.ts),
testfallet “KATALOG-03: history restores missing definitions and content
together only after review and a new save”.

**Steg:**

1. Visa historik och hitta sparandet där Lo Exempel och sambandet tas bort.
   Kontrollera tidigare namn och typbetydelser.
2. Välj **Ångra sparandet**. Granska Lo Exempel, sambandet, **Återställ
   objekttyp: Person**, **Återställ sambandstyp: Använder** och det redan
   befintliga oberoende förslaget i hela utkastet.
3. Kontrollera från Robins profil att sparad karta och katalog fortfarande
   saknar innehållet. Starta om appservern med samma databas och ladda om.
4. Granska utkastet igen och välj **Spara hela utkastet**. Läs kvitto,
   karta och historik.

**Förväntat resultat:**

- Historiken beskriver tidigare innehåll även när typerna saknas i katalogen.
- Båda typerna återställs i samma privata förslag som innehållet. Förslaget
  överlever omstart och sparar inget automatiskt.
- Sparandet återför objektet och sambandet med samma identiteter samt båda
  typerna. Garaget förblir oförändrat och det oberoende förslaget sparas också.
  Den ursprungliga historikgruppen finns kvar oförändrad.
