# Registrera ett familjeabonnemang

[Till användarguidens innehåll](README.md)

Skapa förslag med **Nytt objekt** och **Nytt samband** i hushållets karta.
De ligger i ditt privata utkast tills du väljer **Spara hela utkastet**.
Du kan börja med det du vet och fortsätta efter omladdning. Personer som
läggs till i kartan får ingen inloggning eller tillgång till hushållet.

För bostad, garage och finansiering, följ
[guiden för hyra, lån, kredit och avbetalning](contracts.md).
För avslut och borttagning, följ
[guiden för upphört, borttaget och permanent raderat](lifecycle.md).

## Skapa separata objekt

För det påhittade familjeabonnemanget Molnmusik kan du lägga till:

- Tjänsten Molnmusik och företaget Molnmusik AB som erbjuder den.
- Familjens tjänstekonto och abonnemanget Familjens Molnmusik.
- Personerna Alex, Kim och Lo.
- E-postadressen `familjen@example.test`.
- Familjens kort och bankkontot som betalar kortfakturan.

Välj hushållets aktuella objekttyp, skriv ett begripligt namn och lägg
objektet i utkastet. Beskrivning kan vara en fri egenskap. Ett abonnemang är
ett avtal: skapa inget extra avtalsobjekt för samma överenskommelse.
En förening är också ett separat objekt, skilt från tjänsten.
Skriv aldrig lösenord, fullständiga kortnummer eller säkerhetskoder.

## Beskriv sambanden

Välj **Nytt samband**, **Från objekt**, **Sambandstyp** och **Till objekt**.
Typens förklaring visar riktningen. Pilarna i listan och utkastet visar
samma riktning. Exempel:

- Familjens tjänstekonto → Tillhör tjänsten → Molnmusik.
- Familjens Molnmusik → Gäller tjänstekontot → Familjens tjänstekonto.
- Familjens Molnmusik → Står på avtalet → Alex.
- Kim → Betalar → Familjens Molnmusik.
- Lo → Använder → Molnmusik.
- Familjens tjänstekonto → Äger → Alex.
- Familjens Molnmusik → Betalas med → Familjens kort.

Ingen roll innebär någon annan roll. Lägg till fler personer i varje roll
när det behövs. **Inloggningsadress** och **Kontaktadress** går från
ett tjänstekonto till en e-postadress. Samma adress kan användas av flera
personer och tjänstekonton. **Kontokoppling** går från kort till bankkonto;
**Kortfakturan betalas från** är ett separat samband till betalande bankkonto.

Ett upprepat tillägg med samma typ, riktning och objekt visar det befintliga
sambandet utan dubblett. Välj det befintliga sambandet och sedan
**Redigera valt samband** vid de valda uppgifterna för att rätta det. Olika
sambandstyper mellan samma objekt går bra.

## Bevara det som är ofullständigt

Ett uteblivet samband betyder inte uttryckligen inget. Du behöver inte
fylla alla roller, och ett objekt får stå utan samband. Beskriv själv
osäkerhet eller en saknad uppgift med en fri egenskap om du vill registrera
den. Ett samband kräver ändå både ett frånobjekt och ett tillobjekt.

Lika namn eller adresser avgör inte identitet. Sök bland kandidaternas
namn, typer och egenskaper. Öppna **Granska** för att läsa hela underlaget
och välj sedan rätt objekt uttryckligen. En olöst fråga kan finnas kvar
i samtalet utan ett ogiltigt kartförslag.

Du kan uttryckligen skapa ett verkligt objekt med **Objektets identitet**
satt till **Ospecificerat objekt**, exempelvis ett bankkonto utan känd bank
eller ägare, och välja det som ändpunkt. Senare kan du rätta samma objekt.
Skapa inget objekt enbart för att fylla en okänd ändpunkt.

## Granska, hitta och rätta

**Visa utkastet** visar sparat underlag och föreslagna värden för objekt
och samband. Välj förslagets rad för att läsa alla uppgifter. Rättningar
görs i objektets eller sambandets vanliga formulär från **Tabell**.
Sök efter objekt i **Sök objekt i tabellen**.
Ett adressbyte görs genom att ändra sambandets mål; tjänstekontots
identitet behålls.

**Spara hela utkastet** gör alla förslag gemensamma tillsammans. Kvittot
bekräftar sparandet och historiken bevarar ändringsgruppen. **Kasta hela
utkastet** lämnar den gemensamma kartan oförändrad. Borttagning av ett objekt
visar också dess samband som borttagningar; andra objekt finns kvar.

Läs [utkast och sparande](drafts.md) för att fortsätta på en annan enhet,
lösa konflikter och följa upp ett oklart sparande.

Privata utkast ingår i administratörens
[fullständiga export](household-export.md). Samband och ofullständiga
uppgifter hör till samma hushållsinnehåll och bevaras vid
[återimport](household-import.md). Administratörer kan också granska och
bekräfta [permanent radering](household-erasure.md), som tar bort berört
innehåll även ur historik och privata utkast.
