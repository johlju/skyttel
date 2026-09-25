# Inloggning och tillgång till hushållet

[Till användarguidens innehåll](README.md)

Varje Skyttel-användare loggar in med sitt eget Google- eller
Microsoft-konto. En administratör bestämmer vilka Skyttel-användare som
får tillgång till hushållet. Ett namn eller en e-postadress ger ingen
tillgång i sig. Se [Kom igång](getting-started.md) för första inloggningen.

## Roller och gemensamt innehåll

En **Medlem** kan läsa och redigera hela hushållets gemensamma karta.
Alla aktuella medlemmar har samma insyn i det gemensamma innehållet.

En **Administratör** hanterar dessutom inbjudningar, medlemskap, roller,
[fullständig export](household-export.md), [återimport](household-import.md),
[innehållskopplingar](household-recovery.md) och
[permanent radering](household-erasure.md). Flera administratörer kan dela
ansvaret. Rollen skapar inga privata delar av den gemensamma kartan.
Fullständig export innehåller däremot också andra användares privata
utkast och personliga vyer.

Hushållet måste ha minst en administratör. Ge en annan medlem rollen
innan den sista administratörens tillgång återkallas eller roll ändras.

## Koppla Google och Microsoft

1. Öppna **Inloggningssätt** medan du är inloggad. Här visas dina
   anslutna inloggningssätt.
2. Välj **Verifiera Google** eller **Verifiera Microsoft** och logga in
   igen med den identitet som redan hör till din Skyttel-användare.
3. Välj **Koppla Microsoft** eller **Koppla Google** och genomför den
   andra inloggningen inom tio minuter. För Microsoft kan du använda
   både personliga konton och arbetskonton.
4. Invänta resultatet och kontrollera att båda inloggningssätten visas
   som kopplade. Därefter når båda samma Skyttel-användare och hushåll.

E-postadresserna får skilja sig åt. Lika e-postadresser kopplar aldrig
ihop inloggningar automatiskt.

Välj **Avbryt länkning** för att avstå. Om verifieringen redan håller på
att slutföras behöver du invänta resultatet; en slutförd koppling finns
kvar. Ett nekat medgivande, fel hos inloggningstjänsten, fel befintlig
identitet eller utgången verifiering ändrar inte tidigare inloggningar
eller tillgång. Börja om från ditt befintliga inloggningssätt.

En identitet som redan hör till en annan Skyttel-användare kan inte tas
över eller slås ihop automatiskt. Att logga in separat med den andra
tjänsten före kopplingen kan skapa en sådan separat användare.

## Bjud in en Skyttel-användare

Du behöver vara administratör för att bjuda in någon.

1. Be personen öppna er Skyttel-installation och logga in. Utan
   medlemskap visas **Du har inte tillgång till hushållet**. Inloggningen
   fungerar, men hushållet är ännu inte tillgängligt.
2. Be personen kopiera **Ditt Skyttel-användar-ID** och skicka det privat
   till dig. Kontrollera tillsammans att det är rätt persons ID; namn
   och e-postadresser kan vara lika för olika identiteter.
3. Öppna hushållet och **Administrera tillgång**. Fyll i
   **Skyttel-användar-ID att bjuda in** och välj **Skapa inbjudan**.
4. Kopiera **Inbjudningskod att dela** och skicka koden privat till
   personen. Skyttel skickar ingen e-post. Koden visas bara när du skapar
   inbjudan och kan inte hämtas igen efter att du lämnar eller laddar om
   sidan.
5. Personen ska vara inloggad med identiteten som visar det inbjudna
   användar-ID:t. Personen fyller i **Inbjudningskod** och väljer
   **Acceptera inbjudan**. Hushållet öppnas med rollen **Medlem**.

Inbjudan kan användas en gång och gäller i sju dagar. Den hör till den
angivna Skyttel-användaren och hushållet. En annan identitet kan inte
använda den, även om namn eller e-postadress är samma. Ett annat
inloggningssätt fungerar bara om det uttryckligen kopplas till samma
Skyttel-användare genom **Inloggningssätt**.

Håll koder borta från offentliga meddelanden, skärmbilder och
supportärenden. Om en kod försvinner eller delas med fel person,
återkalla inbjudan och skapa en ny för rätt ID. En ny inbjudan till samma
person ersätter personens väntande inbjudan till hushållet och gör den
tidigare koden ogiltig.

## Följ inbjudningar och dela administrationen

Under **Administrera tillgång** finns **Inbjudningar** och **Medlemmar**.
En ny inbjudan visar **Väntar på svar**. När personen ansluter visas
**Accepterad** och personen finns bland medlemmarna. Listan visar också
när en inbjudan går ut eller återkallas.

Som administratör kan du återkalla en inbjudan innan den accepteras.
En utgången eller återkallad inbjudan ger ingen tillgång. Skapa en ny
om personen fortfarande ska bjudas in.

Använd rollvalet vid medlemmen för att välja **Administratör** eller
**Medlem**. Rolländringen gäller också när personen har en sida öppen.
På din egen rad, märkt **(du)**, är kontrollerna för roll och tillgång
synliga men inaktiva. Be en annan administratör ändra din roll eller
återkalla din tillgång.

## Återkalla tillgång

En administratör kan återkalla tillgång under **Medlemmar**. Kontrollera
både namn och Skyttel-användar-ID så att rätt person väljs. Den sista
administratören kan inte tas bort innan det finns en annan administratör.

Återkallelsen stoppar fortsatt hämtning och ändring i hushållet, även
om personen fortfarande är inloggad. Information som redan visas i en
webbläsare kan inte tas tillbaka. För ny tillgång behövs en ny inbjudan
som personen accepterar; en gammal accepterad kod räcker inte.

Om din egen tillgång ändras medan sidan är öppen, uppdatera sidan för
att kontrollera den. Att logga in igen återställer inte medlemskapet.
Be administratören om en ny kod om inbjudan är ogiltig, utgången eller
återkallad. Använd den identitet vars användar-ID administratören bjuder in.

## Personer i kartan och Skyttel-användare

Att lägga till en person i kartan skapar inget medlemskap och ingen
inbjudan. Att återkalla en Skyttel-användares tillgång tar inte bort
personens objekt, samband eller annat gemensamt innehåll.

Medlemskapet gäller bara hushållet som ger tillgång. Det ger ingen
tillgång till andra hushåll eller installationer. Läs om
[objekt och samband](map.md) för att arbeta med personerna i kartan.
