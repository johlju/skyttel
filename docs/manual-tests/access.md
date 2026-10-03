# Manuella testfall för inloggning och hushållets start

Testfallen omfattar första hushållet, återhämtning vid anslutningsfel,
utloggning, kartans stängbara vägledning och länkning av Google och Microsoft.
Övergången till vald leverantör visar vad som händer och kan avbrytas.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

- **Alex Exempel** är installationens första administratör med Google.
- **Robin Exempel** loggar in med Microsoft och saknar medlemskap, utom i
  den separata installationen för ACCESS-13 där Robin är första administratör.
- Alex har även en Microsoft-identitet för länkning. Den får inte tillhöra
  en separat Skyttel-användare. Adressen får skilja sig från Google-adressen.
- För ACCESS-11 behövs ytterligare en Google-identitet som inte är Alex.

Använd endast fiktiva hushåll och kontrollerade testidentiteter. Den
automatiserade motsvarigheten använder syntetiska identitetsleverantörer.
Verkliga leverantörer kontrolleras separat enligt
[förberedelsen för verkliga leverantörer](#real-identity-provider-preparation).

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

1. Använd en isolerad installation enligt
   [installationsguiden](../operations/installation.md). För ACCESS-01 till
   ACCESS-04 ska installationen sakna hushåll. För övriga fall får Alex
   redan ha skapat **Hushållet Linden**, om inget annat anges.
2. Återställ till en separat tom testdatabas mellan fall som skapar hushåll.
   Återställ länkade identiteter mellan länkningsfallen; använd separata
   testdatabaser för att undvika att en Microsoft-identitet redan är kopplad.
3. När ett fall anger **Fortsätt med Google** eller **Fortsätt med Microsoft**,
   läs övergången och välj sedan **Fortsätt till Google** respektive
   **Fortsätt till Microsoft**. **Avbryt** återgår till valet av inloggningssätt.
4. Använd en webbläsare med utvecklarverktyg för nätverksfel. Ta bort
   blockeringar och återställ nätverksanslutningen efter varje fall.
   Använd aldrig felinjicering på en installation med riktiga hushåll.

## Skapa och öppna hushållet

### ACCESS-01: Första administratören återkommer till samma hushåll

**Syfte:** Kontrollera att hushållet behålls efter omstart och ny inloggning.

**Användare:** Alex.

**Förutsättningar:** Installationen saknar hushåll.

**Integrationstest:**
[bootstrap.spec.ts](../../tests/integration/bootstrap.spec.ts),
testfallet “ACCESS-01: the configured administrator creates a private
household and returns after restart”.

**Steg:**

1. Öppna installationen och välj **Fortsätt med Google**. Logga in som Alex.
2. Skriv **Hushållet Linden** i **Hushållets namn**, med två mellanslag före
   och efter namnet. Välj **Skapa hushåll** och anteckna sidans adress.
3. Starta om applikationen med samma databas och ladda om sidan.
4. Välj **Logga ut** och logga in med samma Google-identitet igen.

**Förväntat resultat:**

- Alex får skapa hushållet. Rubriken visar **Hushållet Linden**, utan
  inledande eller avslutande mellanslag.
- Samma hushåll och adress visas efter omstart och efter ny inloggning.

### ACCESS-02: Ett ogiltigt hushållsnamn kan rättas

**Syfte:** Kontrollera att valideringen är begriplig och går att åtgärda.

**Användare:** Alex.

**Förutsättningar:** Alex är inloggad och **Skapa ditt hushåll** visas.

**Integrationstest:**
[bootstrap.spec.ts](../../tests/integration/bootstrap.spec.ts),
testfallet “ACCESS-02: an invalid household name receives focus and can
be corrected”.

**Steg:**

1. Skriv tre mellanslag i **Hushållets namn** och välj **Skapa hushåll**.
2. Kontrollera felmeddelandet och var tangentbordsfokus hamnar.
3. Ersätt innehållet med **Hushållet Linden**, med två mellanslag före och
   efter namnet. Välj **Skapa hushåll**.

**Förväntat resultat:**

- **Ange ett namn med 1–100 tecken.** visas. Namnfältet får fokus och
  markeras som ogiltigt för hjälpmedel. Inget hushåll skapas av mellanslagen.
- Det rättade namnet skapar **Hushållet Linden**. Felmeddelandet försvinner.

### ACCESS-03: Kontrollera status efter ett förlorat svar

**Syfte:** Kontrollera att ett skapat hushåll kan återfinnas när svaret
inte når gränssnittet.

**Användare:** Alex.

**Förutsättningar:** Alex är inloggad och **Skapa ditt hushåll** visas.
Öppna utvecklarverktygens konsol på den isolerade testsidan och kör följande
felinjicering. Den låter servern slutföra nästa skapande, men döljer svaret
för gränssnittet. Vanligt offlineläge verifierar inte detta fall.

```javascript
const accessOriginalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await accessOriginalFetch(...args);
  if (args[0] === '/api/households' && args[1]?.method === 'POST') {
    window.fetch = accessOriginalFetch;
    throw new TypeError('Synthetic connection interrupted');
  }
  return response;
};
```

**Integrationstest:**
[bootstrap.spec.ts](../../tests/integration/bootstrap.spec.ts),
testfallet “ACCESS-03: checking an uncertain creation recovers the committed
household”.

**Steg:**

1. Skriv **Hushållet Linden** och välj **Skapa hushåll**.
2. Kontrollera meddelandet och välj **Kontrollera status** direkt, innan
   sidans automatiska uppdatering hinner visa hushållet.
3. Anteckna hushållets adress och ladda om sidan.

**Förväntat resultat:**

- Sidan säger att skapandet inte kan bekräftas och behåller det angivna
  namnet. Den påstår inte att skapandet misslyckas.
- **Kontrollera status** öppnar **Hushållet Linden** utan ett nytt skapande.
  Samma hushåll finns kvar efter omladdning och skapandeformuläret försvinner.
- Integrationstestet kontrollerar även att bara en skapandebegäran skickas.

### ACCESS-04: Hushållet kan skapas med tangentbord

**Syfte:** Kontrollera fokus och tangentbordsstyrning genom hela starten.

**Användare:** Alex.

**Förutsättningar:** Installationen saknar hushåll. Alex är utloggad.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts),
testfallet “ACCESS-04: setup works by keyboard within a narrow phone
viewport”. Testet kontrollerar även automatisk anpassning till smal skärm.

**Steg:**

1. Öppna installationen. Kontrollera att välkomstrubriken får fokus.
2. Tryck Tab till **Fortsätt med Google** och aktivera med Enter.
   Kontrollera att **Fortsätt till Google** får fokus. Läs beskedet om
   återgången till Skyttel och aktivera med Enter.
3. Efter inloggningen kontrollerar du att **Skapa ditt hushåll** får fokus.
   Tryck Tab till **Hushållets namn** och skriv **Hushallet Linden**.
4. Tryck Tab till **Skapa hushåll** och aktivera med Enter.

**Förväntat resultat:**

- Inloggningen och formuläret kan användas utan mus.
- Hushållet öppnas och rubriken **Hushallet Linden** får fokus.

### ACCESS-05: Starten kan återupptas efter anslutningsfel

**Syfte:** Kontrollera att startsidan erbjuder en fungerande återhämtning.

**Användare:** Alex, utloggad.

**Förutsättningar:** Blockera adressmönstret `*/api/bootstrap` via
utvecklarverktygens blockering av nätverksbegäranden. Övriga resurser ska
kunna hämtas.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts),
testfallet “ACCESS-05: failed startup read offers a working retry”.

**Steg:**

1. Öppna installationen och kontrollera meddelandet.
2. Ta bort blockeringen och välj **Försök igen**.

**Förväntat resultat:**

- **Skyttel kunde inte öppnas** visas vid anslutningsfelet.
- Försöket öppnar **Välkommen till Skyttel** utan att sidan behöver laddas om.

### ACCESS-06: En inloggad person utan tillgång får en förklaring

**Syfte:** Skilja lyckad inloggning från tillgång till hushållet.

**Användare:** Robin, utan medlemskap.

**Förutsättningar:** Robin är utloggad och är inte första administratör.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts),
testfallet “ACCESS-06: a signed-in outsider sees an access explanation
without setup controls”.

**Steg:**

1. Välj **Fortsätt med Microsoft** och logga in som Robin.
2. Kontrollera förklaringen och att formuläret för nytt hushåll saknas.
3. Välj **Logga ut**.

**Förväntat resultat:**

- **Du har inte tillgång till hushållet** visas. Robin får inte skapa hushåll.
- Utloggning visar **Välkommen till Skyttel**.

## Utloggning

### ACCESS-07: Utloggning kan göras om efter anslutningsfel

**Syfte:** Kontrollera att misslyckad utloggning inte visas som lyckad.

**Användare:** Alex.

**Förutsättningar:** Hushållet är öppet. Anteckna dess adress. Blockera
`*/api/auth/sign-out` i utvecklarverktygens nätverksblockering.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts),
testfallet “ACCESS-07: failed logout preserves the session and a retry closes
household access”.

**Steg:**

1. Välj **Logga ut**. Kontrollera felmeddelandet och den öppna hushållssidan.
2. Ta bort blockeringen och välj **Logga ut** igen.
3. Öppna den antecknade hushållsadressen.

**Förväntat resultat:**

- Felet säger **Du kunde inte loggas ut. Kontrollera anslutningen och försök
  igen.** Hushållet visas fortfarande och knappen kan användas igen.
- Efter nästa försök visas välkomstsidan och felmeddelandet försvinner.
- Den direkta hushållsadressen visar inloggning utan hushållets innehåll.

### ACCESS-08: Utloggning gäller även en redan öppen flik

**Syfte:** Kontrollera att en öppen hushållssida upptäcker avslutad session.

**Användare:** Alex.

**Förutsättningar:** Hushållet är öppet i två flikar i samma webbläsarprofil.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts),
testfallet “ACCESS-08: logout in another tab closes an already open household”.

**Steg:**

1. Välj **Logga ut** i den andra fliken och kontrollera välkomstsidan.
2. Återgå till den första fliken utan att ladda om. Vänta på uppdateringen.
3. Logga in med Alex Google-identitet i den första fliken.

**Förväntat resultat:**

- Första fliken visar välkomstsidan inom tio sekunder. Hushållets rubrik och
  **Nytt objekt** försvinner.
- Ny inloggning öppnar samma hushåll.

## Länka inloggningssätt

### ACCESS-09: Två verifierade inloggningssätt når samma användare

**Syfte:** Kontrollera uttrycklig länkning och att tillgången består.

**Användare:** Alex med Google och en ännu inte använd Microsoft-identitet.

**Förutsättningar:** Alex är inloggad med Google och har ett hushåll.
Anteckna **Ditt Skyttel-användar-ID** och hushållets adress.

**Integrationstest:**
[linking.spec.ts](../../tests/integration/linking.spec.ts),
testfallen “ACCESS-09: the interface verifies the result and lists both login
methods” och “ACCESS-09: both proven providers return to the same user and
household”.

**Steg:**

1. Öppna **Inloggningssätt**. Kontrollera statusen för Google och Microsoft,
   vilket av länkningens två steg som är aktuellt och informationen om
   övergången till Google och återgången hit. Välj **Verifiera Google**
   och bevisa samma Google-identitet som Alex redan använder.
2. Kontrollera att det andra steget är aktuellt och att övergången till
   Microsoft förklaras. Välj **Koppla Microsoft** och logga in med Alex
   Microsoft-identitet inom tio minuter. Kontrollera resultatet.
3. Starta om applikationen med samma databas. Logga ut och logga sedan in
   med Microsoft. Kontrollera användar-ID och hushållets adress.

**Förväntat resultat:**

- Före länkningen visas **Google – kopplat** och **Microsoft – inte kopplat**.
  Stegen visar först verifiering av befintlig inloggning och sedan koppling
  av den andra. Inför varje övergång framgår vilken tjänst som öppnas
  och att användaren kommer tillbaka till Skyttel.
- En verifierad bekräftelse visas tillsammans med **Google – kopplat** och
  **Microsoft – kopplat** efter att båda identiteterna bevisas. Den avslutade
  länkningen visar inte längre ett aktuellt verifieringssteg.
- Microsoft-inloggningen når samma Skyttel-användare och hushåll efter
  omstart. Både lika och olika e-postadresser täcks av integrationstesterna.

### ACCESS-10: Avbruten länkning kräver ny verifiering

**Syfte:** Kontrollera att avbrytande tar bort den pågående verifieringen.

**Användare:** Alex med Google.

**Förutsättningar:** Endast Google är kopplat. Hushållet är öppet.

**Integrationstest:**
[linking.spec.ts](../../tests/integration/linking.spec.ts),
testfallet “ACCESS-10: cancelling a verified link requires fresh proof and
preserves household access”.

**Steg:**

1. Öppna **Inloggningssätt**, välj **Verifiera Google** och bevisa Alex
   befintliga identitet. Kontrollera att **Koppla Microsoft** visas.
2. Välj **Avbryt länkning**. Kontrollera beskedet att länkningen är avbruten,
   att tidigare inloggningar och tillgång finns kvar och att en ny verifiering
   behövs för att börja igen. Kontrollera knapparna och ladda om sidan.
3. Välj **Till startsidan** och kontrollera hushållet.
4. Öppna **Inloggningssätt** igen och verifiera Alex Google-identitet på nytt.

**Förväntat resultat:**

- Ett bekräftat avbrytande ger ett tydligt statusbesked. Om den nya
  identiteten redan har verifierats färdigt visas det verifierade resultatet,
  inte ett felaktigt besked om avbrytande.
- Efter avbrytandet visas **Verifiera Google**. **Koppla Microsoft** och
  **Avbryt länkning** försvinner. Endast Google är kopplat efter omladdning.
- Samma hushåll är tillgängligt. Ny verifiering visar **Koppla Microsoft**.

### ACCESS-11: Fel befintlig identitet kan rättas vid länkning

**Syfte:** Kontrollera att fel identitet ger en begriplig väg till nytt försök.

**Användare:** Alex och den extra Google-identiteten.

**Förutsättningar:** Alex är inloggad med Google. Endast Google är kopplat.

**Integrationstest:**
[linking.spec.ts](../../tests/integration/linking.spec.ts),
testfallet “ACCESS-11: the wrong existing identity leaves linking retryable
without changing access”.

**Steg:**

1. Öppna **Inloggningssätt** och välj **Verifiera Google**. Välj den extra
   Google-identiteten i leverantörens dialog.
2. Kontrollera felet och välj **Verifiera Google** igen. Använd denna gång
   Alex ursprungliga Google-identitet.
3. Välj **Till startsidan**.

**Förväntat resultat:**

- **Länkningen kunde inte slutföras** visas. Ny verifiering är möjlig och
  **Koppla Microsoft** visas inte innan korrekt identitet bevisas.
- Den korrekta verifieringen tar bort felet och visar **Koppla Microsoft**.
  Alex når samma hushåll och behåller sin Skyttel-användare.

### ACCESS-19: Utgången länkning förklarar ny verifiering

**Syfte:** Kontrollera att utgången verifiering har en begriplig fortsättning
utan att ändra användaren, hushållet eller privata förslag.

**Användare:** Alex med Google.

**Förutsättningar:** Endast Google är kopplat. Anteckna Skyttel-användar-ID
och hushållets adress. Lägg ett nytt objekt **Cykeln** med beskrivningen
**Privat förslag före utgången verifiering** i det egna utkastet utan att spara.

**Integrationstest:**
[linking.spec.ts](../../tests/integration/linking.spec.ts),
testfallet “ACCESS-19: expired linking explains fresh proof and preserves
identity and private work”. Det automatiserade fallet flyttar endast den
verkliga testserverns klocka framåt och återställer den före ny verifiering
och vid avslut. Webbläsarens klocka och testets tidsgränser ändras inte.
Identitetsleverantören är en lokal testadapter, inte ett verkligt konto.

**Steg:**

1. Öppna **Inloggningssätt**, välj **Verifiera Google** och bevisa Alex
   befintliga identitet. Kontrollera att **Koppla Microsoft** visas.
2. Vänta minst elva minuter utan att koppla Microsoft. Ladda om sidan.
   Kontrollera beskedet om utgången verifiering och vägen till ett nytt försök.
3. Välj **Verifiera Google** och bevisa samma identitet på nytt.
4. Välj **Till startsidan**. Kontrollera användar-ID, hushåll och eget utkast.

**Förväntat resultat:**

- Ett tydligt statusbesked förklarar att verifieringen har gått ut och att
  tidigare inloggningar och tillgång finns kvar. **Verifiera Google** går
  att använda; **Koppla Microsoft** visas inte innan ny verifiering.
- Endast Google är kopplat. Ny verifiering tar bort utgångsbeskedet och
  visar **Koppla Microsoft** utan att automatiskt koppla eller spara något.
- Samma Skyttel-användare och hushåll finns kvar. Cykeln och dess beskrivning
  ligger oförändrade i det privata utkastet.

### ACCESS-20: Utgången länkning på öppen sida får en begriplig fortsättning

**Syfte:** Kontrollera att ett försök från en gammal verifierad sida förklarar
utgången verifiering utan att koppla en identitet eller ändra privata förslag.

**Användare:** Alex med Google.

**Förutsättningar:** Endast Google är kopplat. Anteckna Skyttel-användar-ID
och hushållets adress. Lägg **Bilen** med beskrivningen **Privat förslag medan
verifieringen går ut** i det egna utkastet utan att spara.

**Integrationstest:**
[linking.spec.ts](../../tests/integration/linking.spec.ts),
testfallet “ACCESS-20: an expired link on an open page explains fresh proof
after the real rejection”. Samma lokala leverantörsadapter och begränsade
serverklocka som i ACCESS-19 används; klockan återställs före ny verifiering
och vid avslut. Webbläsarens klocka och testets tidsgränser ändras inte.

**Steg:**

1. Öppna **Inloggningssätt**, verifiera Alex Google-identitet och kontrollera
   att **Koppla Microsoft** går att använda.
2. Låt sidan stå öppen i minst elva minuter utan omladdning. Välj sedan
   **Koppla Microsoft** och kontrollera beskedet.
3. Välj **Verifiera Google** och bevisa samma befintliga identitet på nytt.
4. Välj **Till startsidan**. Kontrollera användar-ID, hushåll och eget utkast.

**Förväntat resultat:**

- Försöket avvisas och sidan förklarar att verifieringen har gått ut.
  Tidigare inloggningar och tillgång finns kvar; **Verifiera Google** ersätter
  **Koppla Microsoft**. Inget ogrundat fel om identitet eller leverantör visas.
- Ingen extern övergång eller automatisk koppling sker efter avvisandet.
  Endast Google är kopplat. Ny uttrycklig verifiering tar bort beskedet och
  visar **Koppla Microsoft** igen.
- Återgången visar samma hushåll och Skyttel-användare. Bilen och hela det
  privata utkastet är oförändrade; inget sparas automatiskt.

## Avbruten inloggning

### ACCESS-12: Ett inloggningsfel tillåter ett nytt försök

**Syfte:** Kontrollera att ett fel under inloggning ger begriplig återhämtning.

**Användare:** Alex, utloggad.

**Förutsättningar:** Installationen saknar hushåll. Öppna välkomstsidan och
blockera `*/api/auth/sign-in/social` i utvecklarverktygens nätverksblockering.
Det manuella fallet avbryter anslutningen när inloggningen startar; den
automatiserade motsvarigheten orsakar ett fel hos identitetsleverantören.
Båda verifierar att inloggningens felmeddelande tillåter ett nytt försök.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts),
testfallet “ACCESS-12: provider outage gives a readable error and allows
another login attempt”.

**Steg:**

1. Välj **Fortsätt med Google** och kontrollera felmeddelandet.
2. Ta bort blockeringen. Välj **Fortsätt med Google** igen och logga in
   som Alex.

**Förväntat resultat:**

- **Inloggningen kunde inte slutföras** visas. Knappen för Google kan
  användas igen.
- Efter nytt försök öppnas **Skapa ditt hushåll**.

### ACCESS-13: Nekat samtycke stänger tillgången och tillåter nytt försök

**Syfte:** Kontrollera att nekat samtycke aldrig ger hushållsåtkomst.

**Användare:** Alex med Google respektive Robin med Microsoft.

**Förutsättningar:** Kör fallet i två separata tomma installationer. Alex
ska vara första administratör med Google i den ena; Robin ska vara första
administratör med Microsoft i den andra. Använd en ny webbläsarprofil eller
återkalla tidigare samtycke hos leverantören så att det kan nekas.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts),
testfallen “ACCESS-13: denied Google consent leaves access closed and allows
a successful retry” och “ACCESS-13: denied Microsoft consent leaves access
closed and allows a successful retry”.

**Steg:**

1. Öppna respektive installation och välj dess administratörs inloggningssätt.
   Neka samtycke i leverantörens dialog.
2. Kontrollera felmeddelandet och att formuläret för nytt hushåll saknas.
3. Välj samma inloggningssätt igen och godkänn denna gång.
4. Ange **Hushållet Linden** och välj **Skapa hushåll**.

**Förväntat resultat:**

- **Inloggningen kunde inte slutföras** visas efter nekat samtycke.
  Inloggningsknappen kan användas igen och hushållet kan inte skapas än.
- Godkänt samtycke visar **Skapa ditt hushåll**, och skapandet öppnar
  **Hushållet Linden**.
- Integrationstesterna kontrollerar även att direkta försök att läsa eller
  skapa hushåll nekas före den lyckade inloggningen.

## Extern övergång och första användning

### ACCESS-14: Övergången förklarar återkomsten och kan avbrytas

**Syfte:** Kontrollera ett begripligt val innan extern inloggning öppnas.

**Användare:** Robin, utloggad och utan medlemskap.

**Förutsättningar:** Installationen saknar hushåll. Använd en smal skärm.

**Integrationstest:**
[access-onboarding.spec.ts](../../tests/integration/access-onboarding.spec.ts),
testfallet “ACCESS-14: external sign-in explains the return and can be
cancelled before leaving”.

**Steg:**

1. Välj **Fortsätt med Google**. Läs övergången utan att fortsätta.
2. Välj **Avbryt** och kontrollera fokus och besked.
3. Välj Microsoft och fortsätt till leverantören. Logga in som Robin.

**Förväntat resultat:**

- Övergången förklarar att inloggningen sker hos Google och sedan återgår
  till Skyttel. Fortsättningsknappen får fokus.
- Avbrottet behåller startsidan och återger fokus till Google-valet.
  Beskedet om avbrottet kan läsas av hjälpmedel.
- Robin ser beskedet om saknad tillgång, sitt användar-ID och inbjudningskod.
  Skapande av hushåll erbjuds inte. Innehållet ryms på den smala skärmen.

### ACCESS-15: Kartans vägledning ger tre frivilliga ingångar

**Syfte:** Börja med tal, text eller lista utan obligatorisk rundtur.

**Användare:** Alex.

**Förutsättningar:** Hushållet finns och kartan är tom. Använd
[den kontrollerade röstinstallationen](voice-assistant.md#controlled-voice-fixture)
med tillgängligt samtal, eller en isolerad installation med verklig röst.
Inget sparat medgivande finns. Kryssa inte i att medgivandet ska sparas.
Det kontrollerade provet ersätter bara externa leverantörer och media;
verklig mikrofon och enhetsbeteende hör till #220.

**Integrationstest:**
[access-onboarding.spec.ts](../../tests/integration/access-onboarding.spec.ts),
testfallet “ACCESS-15: first-use guidance opens voice, text and list without
a mandatory tour”.

**Steg:**

1. Öppna kartan och välj **Tala** i vägledningen. Kontrollera medgivanderutan
   och att ingen mikrofon lyssnar före **Godkänn och starta**. Godkänn och
   kontrollera röstrutans **Lyssnar**, utan att textvyn öppnas.
2. Ladda om kartan och välj **Skriv** i vägledningen. Godkänn och kontrollera
   textvyn, utan röstruta eller påslagen mikrofon.
3. Ladda om och välj **Öppna listan**. Kontrollera **Nytt objekt**.
4. Ladda om och välj **Stäng vägledningen**.

**Förväntat resultat:**

- Tala startar rösten och Skriv öppnar textvyn. Samma medgivande täcker
  båda. Lista öppnar kartarbetet utan att kräva medgivande till samtal.
- Vägledningen står kvar medan medgivandet väntar och försvinner när
  användaren har godkänt eller valt listan.
- Stängning ger fokus till kartans verktyg. Alla verktyg kan användas direkt.

### ACCESS-16: Utgånget inloggningsförsök kan ersättas

**Syfte:** Ge en begriplig återgång när verifieringen inte längre gäller.

**Användare:** Alex, utloggad.

**Förutsättningar:** Installationen saknar hushåll. I det automatiserade
fallet förbereds ett utgånget försök i den tillfälliga testdatabasen.

**Integrationstest:**
[access-onboarding.spec.ts](../../tests/integration/access-onboarding.spec.ts),
testfallet “ACCESS-16: expired provider verification returns to login and
a fresh attempt succeeds”.

**Steg:**

1. Fortsätt till Google. Vänta minst elva minuter hos leverantören innan
   du slutför inloggningen och återkommer till Skyttel.
2. Läs beskedet och börja ett nytt Google-försök. Slutför det direkt.

**Förväntat resultat:**

- Skyttel säger att försöket har gått ut eller inte kan verifieras.
  Hushållsformuläret visas inte och skyddad åtkomst är fortsatt stängd.
- Ett nytt, verifierat försök visar **Skapa ditt hushåll**.

### ACCESS-17: Återkallad tillgång stoppar arbete och bevarar driftåtkomst

**Syfte:** Skilja hushållsmedlemskap från installationens kostnadsbehörighet.

**Användare:** Alex som driftansvarig och en annan administratör.

**Förutsättningar:** Båda har tillgång till hushållet. Alex öppnar kartan.
Den andra administratören använder en separat webbläsarprofil.

**Integrationstest:**
[access-onboarding.spec.ts](../../tests/integration/access-onboarding.spec.ts),
testfallet “ACCESS-17: revoked access retires protected work while the
operator can open costs”.

**Steg:**

1. Öppna **Lista**, välj **Nytt objekt** och skriv ett namn utan att skicka.
2. Återkalla Alex tillgång med den andra administratören. Vänta på
   uppdateringen i Alex öppna flik.
3. Öppna **Månadskostnad** som Alex.

**Förväntat resultat:**

- Kartan och den oskickade redigeringen försvinner inom tio sekunder.
  Beskedet om saknad tillgång får fokus. Ny inloggning återställer inte
  medlemskapet.
- Kostnadsöversikten är tillgänglig för Alex utan hushållsmedlemskap.

### ACCESS-18: Kartans temaval följer med till inloggningen

**Syfte:** Behålla det valda temat när användaren lämnar kartan.

**Användare:** Alex.

**Förutsättningar:** Alex är inloggad och hushållets karta är öppen.

**Integrationstest:**
[access-onboarding.spec.ts](../../tests/integration/access-onboarding.spec.ts),
testfallet “ACCESS-18: the chosen map theme also applies when returning
to login”.

**Steg:**

1. Öppna **Tema** i kartans verktyg och välj **Mörkt**.
2. Öppna **Din profil** och välj **Logga ut**.
3. Öppna installationens adresser `/costs` och `/login-methods` direkt
   medan du är utloggad. Välj Google utan att fortsätta till leverantören.

**Förväntat resultat:**

- Välkomstsidan använder det mörka temat direkt efter utloggningen.
- Båda de skyddade adresserna visar samma mörka inloggningssida och
  övergång. Fortsättningsknappen får fokus när Google väljs.
- Inloggningssätt och felbesked förblir läsbara i det valda temat.

## Real identity provider preparation

If you are new to provider registration, start with the
[local authentication walkthrough](../development/devcontainer.md#set-up-local-sign-in).

For a manual Codex CLI connection inside the devcontainer, use the
[local assistant setup](setup/assistants.md#manual-local-codex-cli-setup).
It reuses development Google credentials with the port-3301 callback and a
disposable database. Normal development login uses the port-5173 callback
on the same Google client. This live-client check is excluded from CI and
pull request workflows; do not add provider secrets or a Codex login to run
it there. Automated tests retain their synthetic identity providers.

Use a private verification installation with its own persistent disk, secret,
and provider registrations. Register the correct callback URLs and authorize
Google test accounts if its consent screen requires them. Do not post tokens,
subjects, personal email addresses, screenshots with identity details, or
household data in public evidence.

1. Configure a controlled Google identity as first administrator. Complete the
   actual Google redirect and consent flow, create a synthetic household,
   sign out, and sign in again.
2. Restart the production container and confirm that the same household and
   provider identity are retained.
3. Repeat in a separate installation with a personal Microsoft account as
   first administrator. An organizational Microsoft account alone does not
   verify personal-account support.
4. Confirm that another authenticated identity cannot create or access the
   household, including direct API requests. If using matching email
   addresses across providers, confirm they do not merge automatically.
5. Verify logout, denied consent, and a provider error. Confirm that the page
   gives a usable retry path and technical logs contain no secret or identity
   detail.
6. Open **Inloggningssätt**, prove the existing login, then link a controlled
   identity from the other provider. Include a personal Microsoft account.
   Check the verified result, sign out, and sign in with each provider.
   Confirm the same Skyttel user ID and household access. Repeat with denied
   consent and an identity already owned by another Skyttel user; earlier
   access must remain intact.

Record the date, image digest, provider, Microsoft account category, scenarios,
and pass/fail result in private release evidence. State explicitly which
checks are deterministic and which use a real provider. Passing the automated
suite alone is not a claim of live Google or Microsoft sign-in success.

Verify the deployed HTTPS origin and callback URLs before release. Local
HTTP checks do not verify hosted ingress or provider policies for that
deployment. Test physical mobile devices separately when they are part of
the release's target platforms; browser viewport emulation is insufficient.
