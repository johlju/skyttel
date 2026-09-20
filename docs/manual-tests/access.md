# Manuella testfall för inloggning och hushållets start

Testfallen omfattar första hushållet, återhämtning vid anslutningsfel,
utloggning och länkning av Google och Microsoft.
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
[testguiden](../development/testing.md#verify-real-identity-providers-separately).

## Allmän förberedelse

1. Använd en isolerad installation enligt
   [installationsguiden](../operations/installation.md). För ACCESS-01 till
   ACCESS-04 ska installationen sakna hushåll. För övriga fall får Alex
   redan ha skapat **Hushållet Linden**, om inget annat anges.
2. Återställ till en separat tom testdatabas mellan fall som skapar hushåll.
   Återställ länkade identiteter mellan länkningsfallen; använd separata
   testdatabaser för att undvika att en Microsoft-identitet redan är kopplad.
3. Använd en webbläsare med utvecklarverktyg för nätverksfel. Ta bort
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

1. Öppna **Inloggningssätt** och välj **Verifiera Google**. Bevisa samma
   Google-identitet som Alex redan använder.
2. Välj **Koppla Microsoft** och logga in med Alex Microsoft-identitet
   inom tio minuter. Kontrollera resultatet.
3. Starta om applikationen med samma databas. Logga ut och logga sedan in
   med Microsoft. Kontrollera användar-ID och hushållets adress.

**Förväntat resultat:**

- En verifierad bekräftelse visas tillsammans med **Google – kopplat** och
  **Microsoft – kopplat** efter att båda identiteterna bevisas.
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
2. Välj **Avbryt länkning**. Kontrollera knapparna och ladda om sidan.
3. Välj **Till startsidan** och kontrollera hushållet.
4. Öppna **Inloggningssätt** igen och verifiera Alex Google-identitet på nytt.

**Förväntat resultat:**

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
