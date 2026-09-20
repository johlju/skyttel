# Manuella testfall för sparförsök

Testfallen gäller att återfinna sparförsök och skilja ett okänt utfall från
ett väntande, genomfört eller avvisat sparande. Anteckna commit,
webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Logga in med den administratör som anges av
`SKYTTEL_FIRST_ADMIN_PROVIDER` och `SKYTTEL_FIRST_ADMIN_SUBJECT`.
Använd samma inloggning i två separata webbläsarprofiler. En annan
webbläsare går också bra. Den andra profilen får inte ärva den första
profilens flikar eller lokala webbläsardata.

SPAR-04 behöver dessutom en separat testidentitet med aktuell tillgång
till hushållet och rollen medlem. Följ
[inbjudan av en användare](../users/access.md#invite-a-skyttel-user)
för att ge identiteten tillgång. Kartans påhittade personer och Robin Demo
saknar inloggning;
de kan inte användas som testidentitet.

## Allmän förberedelse

1. Förbered en separat utvecklingsdatabas enligt
   [demodata och återställning](../development/devcontainer.md#reset-demo-data).
   Återställning tar bort befintliga utvecklingsdata och sessioner.
2. Kör `npm run db:setup` och starta applikationen med `npm run dev:all`.
3. Öppna [utvecklingsklienten](http://localhost:5173) och logga in som
   den konfigurerade administratören. Kontrollera **TestHousehold**.
4. Välj **Kasta hela utkastet** för att ta bort demoutkastet.

Återställ demodata före varje fall. Behåll samma databas under omstart
inom ett testfall; kör då inte `npm run db:setup`.

## Återfinna ett sparande

### SPAR-01: återfinna ett genomfört sparande från en annan klient

**Syfte:** Kontrollera att ett beständigt kvitto kan återfinnas efter
omstart och byte av klient utan att användaren behöver ett operations-ID.

**Användare:** Den konfigurerade administratören i båda profilerna.

**Förutsättningar:** Allmän förberedelse ovan. Ingen profil har ett
pågående sparförsök.

**Integrationstest:**
[operations.spec.ts](../../tests/integration/operations.spec.ts),
testfallet “SPAR-01: find a committed save after losing its response and
reopening on another client”.

**Steg:**

1. Välj **Nytt objekt**, skriv **Återfunnet sparande** som namn och välj
   **Lägg i mitt utkast**.
2. Välj **Spara hela utkastet** och kontrollera kvittot under
   **Mina sparförsök**. Anteckna kvittots identitet för jämförelse.
3. Stäng den första profilen. Stoppa och starta applikationen igen med
   samma databas.
4. Öppna appen i den andra profilen och logga in som samma användare.
   Sök efter försöket under **Mina sparförsök** utan att skriva in
   kvittots identitet eller kopiera webbläsardata.
5. Kontrollera kvittot, **Hela mitt utkast** och objektlistan.

**Förväntat resultat:**

- Försöket visas som **Genomfört** i den andra profilen. Kvittot har
  samma identitet och beskriver **Återfunnet sparande**.
- Utkastet visar **Inga förslag**. Objektet finns en gång i kartan.
- Ett genomfört sparande går att hitta även när den ursprungliga
  profilen är stängd och servern startar om.

Det kontrollerade tappade svaret efter genomförd transaktion provas
endast automatiserat: testet låter den riktiga servern spara och bryter
sedan svaret till webbläsaren. Då ska klienten visa **Utfallet är okänt**
och blockera ändringar tills utfallet kontrolleras. Testet återfinner
sedan kvittot efter omstart och verifierar genom det publika API:et att
ett återförsök ger samma kvitto, objekt och enda historikhändelse.
De manuella stegen ovan verifierar återfinnandet efter ett bekräftat
sparande; de verifierar inte själva avbrottet efter transaktionen.

### SPAR-02: återförsöka ett väntande sparande från en annan klient

**Syfte:** Kontrollera att ett avbrott före kartändringen lämnar ett
väntande försök och ett bevarat utkast som kan sparas från en annan klient.

**Användare:** Den konfigurerade administratören i båda profilerna.

**Förutsättningar:** Allmän förberedelse ovan. Använd Chromium eller
Chrome med utvecklarverktyg i första profilen.

**Integrationstest:**
[operations.spec.ts](../../tests/integration/operations.spec.ts),
testfallet “SPAR-02: retry a pending save on another client after
interruption before commit”.

**Steg:**

1. Välj **Nytt objekt**, skriv **Väntande sparande** som namn och välj
   **Lägg i mitt utkast**.
2. Öppna utvecklarverktygen. Öppna kommandomenyn med `Ctrl+Shift+P`
   eller `Cmd+Shift+P`, sök efter **Show Network request blocking**
   och öppna panelen. Aktivera **Enable network request blocking**.
   Lägg till mönstret `*/map/save` och aktivera dess kryssruta.
3. Välj **Spara hela utkastet**. Kontrollera meddelandet och knapparna
   **Nytt objekt**, **Spara hela utkastet** och **Kasta hela utkastet**.
   Under **Network** ska `/map/save` vara blockerad medan
   registreringen till `/map/operations` lyckas.
4. Stäng den första profilen. Stoppa och starta applikationen igen med
   samma databas. Öppna appen i den andra profilen utan nätverksblockering
   och logga in som samma användare.
5. Granska **Mina sparförsök**, utkastet och objektlistan. Kontrollera
   åter att ändringsknapparna är inaktiverade.
6. Välj **Återförsök sparandet** för det väntande försöket. Kontrollera
   kvittot, utkastet och objektlistan. Ladda om och kontrollera igen.
7. Skapa objektet **Nästa privata förslag** och lägg det i utkastet.
   Kontrollera att kvittot bara beskriver det tidigare sparandet.
8. Stäng av nätverksblockeringen i den första profilen före nästa fall.

**Förväntat resultat:**

- Avbrottet visar **Utfallet är okänt**. Ändringar och kastande blockeras.
- Efter omstart visas **Väntande**. Utkastet innehåller
  **Väntande sparande**. Objektlistan visar **förslag i ditt utkast**
  vid objektet; det ingår ännu inte i den gemensamma kartan.
- Återförsöket ger **Genomfört** med kvitto och tömmer utkastet.
  Objektet finns en gång i kartan, även efter omladdning.
- **Nästa privata förslag** ligger kvar i utkastet och omfattas inte
  av det tidigare kvittot.

Det automatiserade testet upprepar dessutom den genomförda begäran
genom API:et medan nästa förslag ligger i utkastet. Samma kvitto ska
returneras, nästa förslag ska bevaras och historiken får ingen dubblett.
Den sista kontrollen utförs inte av de manuella stegen.

### SPAR-03: återfinna ett avvisat försök utan att förbruka nyare förslag

**Syfte:** Kontrollera att ett gammalt sparbesked avvisas beständigt och
att nyare förslag kan granskas och sparas med ett nytt försök.

**Användare:** Den konfigurerade administratören i båda profilerna.

**Förutsättningar:** Allmän förberedelse ovan. Nätverksblockering är av.

**Integrationstest:**
[operations.spec.ts](../../tests/integration/operations.spec.ts),
testfallet “SPAR-03: a rejected stale save survives restart without
consuming newer proposals”.

**Steg:**

1. Skapa **Lo Exempel** med **Nytt objekt** i första profilen och
   välj **Lägg i mitt utkast**.
2. Öppna appen i andra profilen som samma användare. Öppna **Lo Exempel**,
   ändra namnet till **Lo Lind** och välj **Lägg i mitt utkast**.
3. Välj **Spara hela utkastet** i första profilen utan omladdning.
   Kontrollera avvisningen. Stäng den första profilen.
4. Stoppa och starta appen med samma databas. Ladda om i andra profilen.
   Granska **Mina sparförsök**, **Hela mitt utkast** och objektlistan.
5. Granska det nyare förslaget och välj **Spara hela utkastet** i den
   andra profilen. Kontrollera sparförsöken och objektlistan.

**Förväntat resultat:**

- Det gamla försöket visar **Avvisat** och **Inget sparades**.
- Efter omstart visas fortfarande **Avvisat** med orsaken att förslaget
  eller kartan ändras. Inget kvitto bekräftar det försöket. Utkastet
  innehåller **Lo Lind**. Objektlistan visar **förslag i ditt utkast**
  vid objektet.
- Ett nytt sparande ger ett eget **Genomfört** försök och kvitto för
  **Lo Lind**. Det tidigare avvisade försöket visas fortfarande.

Det automatiserade testet återförsöker dessutom den avvisade begäran
via API:et och kontrollerar samma fel, oförändrat utkast och tom historik
innan det nya sparandet. Den kontrollen utförs inte av de manuella stegen.

## Tillgång till sparförsök

### SPAR-04: privata försök och återkallad tillgång

**Syfte:** Kontrollera att administratören inte kan läsa en annan
användares privata sparförsök och att återkallad tillgång gäller även
väntande försök.

**Användare:** Administratören och den separata testidentiteten med
rollen medlem.

**Förutsättningar:** Allmän förberedelse och aktuell tillgång för
testidentiteten. Använd skilda profiler för de två användarna.

**Integrationstest:**
[operations.spec.ts](../../tests/integration/operations.spec.ts),
testfallet “SPAR-04: private pending saves stay hidden from
administrators and revoked members”.

**Steg:**

1. Logga in som medlemmen. Skapa **Privat förslag** och lägg det i
   utkastet. Aktivera nätverksblockering av `*/map/save` enligt SPAR-02.
2. Välj **Spara hela utkastet** och kontrollera **Utfallet är okänt**.
3. Öppna appen som administratören. Granska **Mina sparförsök** och
   **Hela mitt utkast**.
4. Välj **Administrera tillgång** som administratören. Välj
   **Återkalla tillgång** för medlemmen och **Bekräfta återkallelse**.
5. Stäng av medlemmens nätverksblockering och ladda om medlemmens app.
   Kontrollera tillgångsbeskedet och att sparförsöket inte visas.

**Förväntat resultat:**

- Medlemmen har ett registrerat väntande försök. Administratören ser
  varken det försöket eller medlemmens privata förslag.
- Efter återkallelsen ser medlemmen **Du har inte tillgång till
  hushållet** och kan inte öppna sparförsöket.
- Det privata objektet ingår inte i den gemensamma kartan.

Det automatiserade testet kontrollerar dessutom direkta API-anrop:
administratören får inget resultat för medlemmens operations-ID.
Medlemmen nekas både listning, uppslagning och återförsök efter
återkallelsen. Dessa API-kontroller utförs inte av de manuella stegen.
