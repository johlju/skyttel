# Lägg till och redigera objekt och samband

[Till användarguidens innehåll](README.md)

Objekt och samband bildar hushållets gemensamma karta. Du föreslår
ändringar i ditt privata utkast och sparar dem tillsammans när du är klar.
Du kan göra hela arbetet i **Lista och detaljer**.

## Lägg till ett objekt

1. Välj **Nytt objekt** och ange ett namn som hushållet känner igen.
2. Välj **Objekttyp**, exempelvis **Person**, **Tjänst** eller **Fordon**.
   Om en passande typ saknas kan du [skapa en egen](object-types.md).
3. Ange en beskrivning och de övriga uppgifter du känner till. Egna fält
   visas för den valda typen. Under **Ekonomiska uppgifter och
   avtalsvillkor** kan du ange exempelvis pris och datum; se
   [avtalsguiden](contracts.md).
4. Kontrollera **Objektets identitet**. Använd **Ospecificerat objekt**
   när du avsiktligt beskriver något som ännu inte är närmare identifierat,
   exempelvis bankkontot som betalar hyran utan att veta vilken bank det är.
5. Välj **Lägg i mitt utkast**. Objektet kan nu användas i andra förslag,
   exempelvis ett nytt samband, före det gemensamma sparandet.

Samma namn betyder inte att två objekt är samma sak. Läs beskrivningen
och identiteten innan du väljer ett befintligt objekt. Bekräftade
dubbletter kan [slås samman](object-merge.md).

## Koppla ihop objekt

1. Välj **Nytt samband**.
2. Välj **Från objekt**, **Sambandstyp** och **Till objekt**. Läs typens
   förklaring så att riktningen blir rätt. Exempelvis kan
   `Alex → Använder → Alex cykel` beskriva vem som använder cykeln.
3. Välj **Uppgiftens säkerhet**. **Känt** och **Osäkert uppgivet** pekar
   ut ett objekt. **Okänt** anger att uppgiften inte är känd och
   **Uttryckligen inget** att något uttryckligen saknas; dessa val behöver
   inget målobjekt.
4. Ange vid behov status och slutdatum. Lägg sambandet i utkastet.
5. Granska riktning, objekt och säkerhet i **Hela mitt utkast**. Välj
   **Spara hela utkastet** för att göra alla förslagen gemensamma.

En **Obesvarad identitetsfråga** kan finnas i utkastet men måste lösas
innan det kan sparas. Den betyder inte samma sak som ett avsiktligt
ospecificerat objekt eller en osäker uppgift.

Ett upprepat tillägg med samma typ, riktning och ändpunkter visar det
befintliga sambandet. Olika betydelser mellan samma objekt går bra.
Läs [sambandstyper och riktning](relationship-types.md) för egna typer
och förklaringar som går att läsa från båda objekten.

## Hitta och rätta uppgifter

Använd **Sök objekt** och **Filtrera objekttyp**. Sökningen gäller hela
kartan, även objekt som finns på andra listsidor. Välj objektet för att
läsa detaljerna och dess samband. Längre listor har sidval samt
**Föregående sida** och **Nästa sida**.

Välj **Redigera valt objekt** eller **Redigera valt samband** i
detaljpanelen. Rätta uppgifterna och lägg förslaget i utkastet. Du kan
rätta både sparade uppgifter och dina egna osparade förslag.
Ett byte av sambandets mål kopplar om sambandet; det skapar inte en ny
identitet för startobjektet.

Läs [profilbilder](profile-images.md) för bildval och
[objekttyper och egna fält](object-types.md#byt-typ-på-ett-objekt) för att
byta typ utan att förlora objektets identitet eller samband.

## Avsluta, ta bort eller ångra

Markera **Upphört** när något slutar gälla men ska synas i kartan.
**Ta bort** lägger i stället en borttagning i utkastet. Ett objekts
borttagning omfattar också dess inkommande och utgående samband;
andra objekt finns kvar. Granska följderna före sparandet.

[Livscykelguiden](lifecycle.md) beskriver status, slutdatum och borttagning.
[Historiken](history.md) låter dig ångra ett sparande genom ett nytt
utkast. För att avstå från osparade förslag använder du
[utkastets kontroller](drafts.md#granska-spara-eller-kasta-förslag).
