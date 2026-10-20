# Beskriv hyra, lån, kredit och avbetalning

[Till användarguidens innehåll](README.md)

Skapa avtal, berörda objekt och parter med **Nytt objekt** i hushållets
karta. Koppla ihop dem med **Nytt samband**. Alla förslag ingår i ditt
privata utkast tills du granskar och väljer **Spara hela utkastet**.
Du kan börja med det du vet och komplettera senare.

## Hyr en bostad och ett garage

I det här påhittade exemplet hyr Alex och Kim en bostad och ett garage av
samma företag, Exempel AB. Skapa separata objekt för:

- Bostaden och garaget, med objekttyperna **Bostad** och **Garage**.
- Bostadens hyresavtal och Garagets hyresavtal, båda **Hyresavtal**.
- Alex och Kim som **Person**, samt Exempel AB som **Företag**.
- Bankkontot som används för hyran, med objekttypen **Bankkonto**.

Ett hyresavtal är ett eget avtal. Återkommande hyra gör det inte till ett
abonnemang. Använd samma företagsobjekt för hyresvärden i båda avtalen.
En person eller förening kan också vara hyresvärd.

Välj **Från objekt**, **Sambandstyp** och **Till objekt**. Exempel:

- Bostadens hyresavtal → Gäller → Bostaden.
- Garagets hyresavtal → Gäller → Garaget.
- Bostadens hyresavtal → Står på avtalet → Alex.
- Bostadens hyresavtal → Står på avtalet → Kim.
- Bostadens hyresavtal → Står på avtalet → Exempel AB.
- Bostadens hyresavtal → Hyresvärd → Exempel AB.
- Garagets hyresavtal → Står på avtalet → Alex.
- Garagets hyresavtal → Står på avtalet → Exempel AB.
- Garagets hyresavtal → Hyresvärd → Exempel AB.
- Kim → Betalar → Bostadens hyresavtal.
- Bostadens hyresavtal → Betalas med → Bankkontot för hyran.

**Står på avtalet** går från avtalet till en person, ett företag eller en
förening. **Hyresvärd** beskriver partens särskilda roll genom ett separat
samband från avtalet till parten. Registrera betalare och betalningsmedel
för varje avtal där du känner till dem.

Flera avtal kan gälla samma bostad. Lägg exempelvis till ett separat
elavtal med **Gäller** till Bostaden och en hemförsäkring med
**Försäkrar** till samma bostad. Bostaden behåller sin egen identitet.

## Beskriv lån, kredit och bilavbetalning

Skapa **Låneavtal**, **Kreditavtal** och **Avbetalningsavtal** som egna
objekt. Skapa berörda personer, företag eller föreningar separat och
återanvänd dem när de är parter i flera avtal. Lägg till **Står på avtalet**
från varje avtal till respektive part. Om en part är långivare, lägg även
till **Långivare** från avtalet till parten.

En bil är ett eget objekt av typen **Fordon**. Avtal, finansiering,
försäkring, ägande och användning beskriver olika saker. Exempel:

- Billånet → Gäller → Familjens bil.
- Billånet → Finansierar → Familjens bil.
- Billånet → Står på avtalet → Alex.
- Billånet → Står på avtalet → Långivaren.
- Billånet → Långivare → Långivaren.
- Bilförsäkringen → Försäkrar → Familjens bil.
- Kim → Betalar → Billånet.
- Familjens bil → Äger → Alex.
- Lo → Använder → Familjens bil.

För ett köp på avbetalning kan ett avbetalningsavtal finansiera bilen.
Ett kreditavtal kan på motsvarande sätt kopplas till det objekt det gäller.
Beskriv de samband som gäller i hushållet; skapa inte ett extra lån när
det bara finns ett avbetalningsavtal.

**Gäller**, **Finansierar** och **Försäkrar** går från avtalet till det
berörda objektet. Ingen avtalspart blir automatiskt betalare, ägare eller
användare. Lägg till varje roll uttryckligen, med flera personer om det
behövs. Behåll samma fordonsobjekt när finansiering eller användning ändras.

## Lägg till belopp och villkor som fria egenskaper

Öppna **Tabell**, välj objektets **Redigera** och sedan **Fria egenskaper**.
Välj **Lägg till egenskap** för varje uppgift. Du bestämmer etikett,
datatyp och ordning på just det objektet. Exempel:

- **Pris**, talet `7500`.
- **Valuta**, texten `SEK`.
- **Betalningsintervall**, texten `Varje månad`.
- **Startdatum** och **Slutdatum**, datum när de är kända.
- **Avtalsvillkor**, texten `Tre månaders uppsägningstid`.

Skuld, beviljat kreditutrymme och utnyttjad kredit är olika uppgifter.
Lägg till en egen egenskap för varje belopp som du vill registrera.
En separat datumegenskap kan beskriva när ett belopp uppges. Välj
begripliga etiketter som visar vilket belopp datumet gäller.

Egenskaperna är beskrivande uppgifter. Etiketterna styr inga beräkningar,
betalningar eller statusändringar. Välj själv **Upphört** när avtalet
slutar gälla; ett passerat Slutdatum ändrar inte status. Skriv aldrig
fullständiga konto- eller kortnummer, lösenord eller andra hemliga uppgifter.

## Bevara det som är ofullständigt

Lämna en egenskap tom med eller utan datatyp för att fylla i den senare.
Tomt är skilt från noll, Nej och en avsiktligt tom text. Du kan själv
lägga till en egenskap som beskriver osäkerhet eller att något saknas.
Sådana etiketter får ingen särskild betydelse i Skyttel.

Hela formuläret kontrolleras före tillägget till utkastet. Vid fel får
felsammanfattningen fokus. Följ fellänken och rätta värdet; inmatningen
finns kvar. Ingen del läggs i utkastet innan alla fel är rättade.

Ett samband kräver två befintliga objekt. Om du vet att hyran betalas
från ett verkligt bankkonto men inte vilken bank det gäller, skapa ett
**Bankkonto** med **Identitet** satt till **Ospecificerat objekt**.
Välj det uttryckligen som mål för **Betalas med**. Senare kan du
komplettera samma objekt utan att hitta på en bank eller ägare.

Om du inte vet om en motpart finns, lämna frågan öppen i samtalet och
komplettera innan sambandet skapas. Skyttel skapar ingen motpart eller
egen ersättningsegenskap automatiskt. Lika namn eller belopp avgör
inte att två objekt är samma sak.

## Hitta, rätta och spara tillsammans

Sök efter avtalet, bostaden, garaget eller bilen i **Sök objekt i tabellen**.
Välj objektets **Redigera** för att rätta belopp,
villkor och andra egenskaper. Öppna objektets samband och välj
**Redigera samband** för
att rätta exempelvis avtalspart eller betalningsmedel. För objekt väljer
du **Lägg i utkastet och stäng** när hela formuläret är klart.
**Lägg i utkastet och öppna samband** lägger samma fullständiga ändring
i utkastet och öppnar sedan objektets samband. Alla ändringar ingår
i samma utkast som övriga förslag.

Granska tidigare och föreslagna värden i **Visa utkastet**. Förslag som
läggs i utkastet finns kvar efter omladdning; text som bara finns i ett
öppet formulär är ännu inte bevarad. **Spara hela utkastet** gör alla
förslag gemensamma tillsammans. Vid valideringsfel, olöst identitet eller
konflikt sparas ingen del av försöket. Rätta förslagen och granska igen.
**Kasta hela utkastet** lämnar den gemensamma kartan oförändrad.

Kvittot bekräftar sparandet. Ändringshistoriken bevarar tidigare värden
och samband med tidpunkt och den Skyttel-användare som sparar ändringen.
Följ [utkast och sparande](drafts.md) för att lösa
konflikter, fortsätta på en annan enhet eller följa upp ett oklart sparande.

Avtal, belopp, villkor, datum, samband och ofullständiga uppgifter hör
till samma hushållsinnehåll som övriga kartan. Samma informationsregler
för export, återimport och radering gäller, inklusive privata utkast i
fullständig administrativ export. Administratörer följer guiderna för
[export](household-export.md), [återimport](household-import.md) och
[permanent radering](household-erasure.md). Granska raderingens omfattning;
den tar även bort berörda historiska uppgifter och kan inte ångras.
