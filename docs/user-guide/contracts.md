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

## Lägg till frivilliga belopp och villkor

Välj objektet, **Redigera valt objekt** i detaljpanelen och sedan
**Ekonomiska uppgifter och avtalsvillkor** i formuläret.
Avsnittet finns för alla objekttyper, även hushållets egna typer. Du kan
ange **Pris**, **Valuta**, **Betalningsintervall**, **Startdatum**,
**Slutdatum** och **Avtalsvillkor** när du känner till dem. Beskriv
exempelvis priset som `7 500`, valutan som `SEK`, intervallet som
`Varje månad` och villkoren som `Tre månaders uppsägningstid`.

För lån och krediter finns dessutom separata uppgifter:

- **Senast uppgiven skuld**: beloppet som uppges återstå att betala.
- **Beviljat kreditutrymme**: beloppet som krediten medger.
- **Utnyttjad kredit**: den del av krediten som uppges vara använd.

Var och en av dessa tre uppgifter kan ha ett eget frivilligt
**Datum för uppgiften**. Exempelvis kan ett kreditavtal ha beviljat
kreditutrymme `30 000` och utnyttjad kredit `4 000`, med datum för
respektive uppgift. Skulden är en uppgift om belopp, skild från själva
låneavtalet. Kreditutrymme och utnyttjad kredit är olika belopp.

Belopp och villkor är beskrivande text. Skyttel beräknar inte ränta,
amorteringsplaner, återstående kreditutrymme eller betalningar. Uppgifterna
är inte en förteckning över betalningstransaktioner. Skriv aldrig
fullständiga konto- eller kortnummer, lösenord eller andra hemliga uppgifter.

## Bevara det som är ofullständigt

Varje ekonomisk uppgift har en egen säkerhet:

- **Ej uppgivet**: lämna uppgiften öppen utan att ange ett värde.
- **Känt**: skriv det värde du känner till.
- **Okänt**: markera uttryckligen att uppgiften inte är känd.
- **Uttryckligen inget**: markera uttryckligen att uppgiften saknas.
- **Osäkert uppgivet**: skriv värdet och behåll osäkerheten.

Ett tomt fält betyder inte noll eller uttryckligen inget. Saknade belopp,
datum och villkor hindrar inte att resten av utkastet sparas. Säkerheten
följer med i formuläret, granskningen och den sparade uppgiften.

För samband anger **Uppgiftens säkerhet** om kopplingen är känd, okänd,
uttryckligen saknas eller är osäkert uppgiven. Om du vet att hyran betalas
från ett bankkonto men inte vilket, skapa ett **Bankkonto** med
**Objektets identitet** satt till **Ospecificerat objekt**. Välj det
uttryckligen som mål för **Betalas med**. Senare kan du komplettera samma
objekt utan att hitta på en bank eller ägare.

En obesvarad identitetsfråga är något annat: den kan bevaras i utkastet
men måste lösas före sparandet. Varken lika namn eller lika belopp avgör
att två objekt är samma sak.

## Hitta, rätta och spara tillsammans

Sök efter avtalet, bostaden, garaget eller bilen i **Sök objekt**. Välj
objektet och **Redigera valt objekt** i detaljpanelen för att rätta belopp,
villkor och säkerhet. Välj ett samband och **Redigera valt samband** för
att rätta exempelvis avtalspart eller betalningsmedel. Lägg ändringarna
i samma privata utkast som övriga förslag.

Granska tidigare och föreslagna värden i **Hela mitt utkast**. Förslag som
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
