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
objektet i utkastet. Beskrivning är frivillig. Ett abonnemang är redan
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
**Redigera valt samband** i detaljpanelen för att rätta det. Olika
sambandstyper mellan samma objekt går bra.

## Bevara det som är ofullständigt

**Uppgiftens säkerhet** skiljer mellan:

- **Känt**: välj det objekt som avses.
- **Okänt**: uppgiften är ännu inte känd; inget målobjekt väljs.
- **Uttryckligen inget**: det saknas uttryckligen någon eller något.
- **Osäkert uppgivet**: välj objektet men behåll osäkerheten.
- **Obesvarad identitetsfråga**: utkastet kan bevaras men inte sparas.

Ett uteblivet samband betyder inte uttryckligen inget. Du behöver inte fylla
alla roller. Använd exempelvis **Används av** från tjänsten när du vill ange
att dess användare är okända eller att ingen använder den.

Lika namn eller adresser avgör inte identitet. Välj objektet uttryckligen;
vid lika namn visar väljaren beskrivning och identitet som hjälp. Om du inte
vet vilket objekt som avses, lämna en obesvarad identitetsfråga. Hela
sparandet blockeras tills den är löst.

Du kan i stället uttryckligen skapa ett objekt med **Objektets identitet**
satt till **Ospecificerat objekt**, exempelvis ett bankkonto utan känd bank
eller ägare, och välja det som mål. Senare kan du rätta samma objekt.
Det är skilt från en obesvarad fråga och från osäkerhet om själva sambandet.

## Granska, hitta och rätta

**Hela mitt utkast** visar sparat underlag och föreslagna värden för objekt
och samband. Välj objektets eller sambandets knapp och sedan
**Redigera valt objekt** eller **Redigera valt samband** i detaljpanelen
för att rätta förslaget. Sök efter objekt i **Sök objekt**.
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
