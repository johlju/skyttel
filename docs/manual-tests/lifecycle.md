# Manuella testfall för upphört och borttaget innehåll

Testfallen gäller status, slutdatum och vanlig borttagning i privata utkast.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Använd den konfigurerade administratören i en separat testinstallation.
Logga in genom den konfigurerade identitetsleverantören enligt
[installationsguiden](../operations/installation.md).
Samma kartarbete är tillgängligt för en vanlig hushållsmedlem.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan och öppna dess detaljpanel. För objekt i listan använder
du **Uppgifter**; i kartverktygen väljer du **Visa detaljer**. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. Att bara välja objektet eller sambandet öppnar inte formuläret.

1. Använd ett tomt testhushåll med påhittade uppgifter enligt
   [familjeabonnemanget](../user-guide/family-subscription.md).
2. Skapa abonnemanget **Familjemusik**, personen **Lo Exempel** och tjänsten
   **Molnmusik**. Lägg dem i utkastet och spara hela utkastet.
3. Skapa sambanden **Lo Exempel → Använder → Familjemusik** och
   **Familjemusik → Använder → Molnmusik**. Spara hela utkastet.
4. Använd ett nytt testhushåll för varje fall. Behåll samma databas när
   appen startas om inom ett fall. Läs
   [livscykelguiden](../user-guide/lifecycle.md) för begrepp och datumgräns.

## Status

### LIVSCYKEL-01: upphört innehåll finns kvar och kan rättas separat

**Syfte:** Kontrollera att status inte sprids till anslutna uppgifter.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** De sparade objekten och sambanden ovan, utan slutdatum.

**Integrationstest:**
[lifecycle.spec.ts](../../tests/integration/lifecycle.spec.ts),
testfallet “LIVSCYKEL-01: ended objects and relationships stay visible and
independently correctable”.

**Steg:**

1. Öppna **Familjemusik**, välj **Upphört** under **Objektets status** och
   välj **Lägg i mitt utkast**. Granska utkastet.
2. Välj **Spara hela utkastet**. Starta om appen med samma databas och
   ladda om sidan. Kontrollera objekten och sambanden.
3. Öppna **Lo Exempel → Använder → Familjemusik**, välj **Upphört** under
   **Sambandets status**, lägg sambandet i utkastet och spara.
4. Öppna **Familjemusik**, välj **Gäller fortfarande**, lägg ändringen i
   utkastet och spara. Ladda om sidan.

**Förväntat resultat:**

- Förslaget visar Upphört med text och orange markering, skild från
  utkastets blå markering. Sparat underlag visar den tidigare statusen.
- Efter omstart finns Familjemusik kvar med Upphört. Andra objekt och
  samband har oförändrad status och kan fortfarande öppnas.
- Det markerade sambandet blir upphört utan att det andra sambandet ändras.
- Rättelsen gör Familjemusik gällande. Sambandet från Lo är fortsatt upphört.

### LIVSCYKEL-02: kända slutdatum styr status och kan rättas

**Syfte:** Kontrollera att endast kända passerade datum ger Upphört och att
datum och status kan rättas oberoende.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** De sparade objekten och sambanden ovan. Automationen
styr webbläsarklockan över midnatt UTC med påhittade datum. För manuell
kontroll av övergången behövs en sida som är öppen över midnatt UTC.

**Integrationstest:**
[lifecycle.spec.ts](../../tests/integration/lifecycle.spec.ts),
testfallet “LIVSCYKEL-02: only a known elapsed end date ends content and
dates or status can correct it”.

**Steg:**

1. Ange dagens UTC-datum som känt **Slutdatum** för Familjemusik och samma
   datum som **Osäkert uppgivet** för Lo Exempel. Behåll **Följ slutdatum**
   för båda, lägg ändringarna i utkastet och spara.
2. Kontrollera status före och efter nästa midnatt UTC utan omladdning.
3. Rätta Familjemusiks datum till en framtida dag, lägg i utkastet och spara.
4. Öppna sambandet från Lo och ange ett känt passerat **Sambandets slutdatum**.
   Lägg sambandet i utkastet, spara och kontrollera statusen.
5. Ändra sambandets status till **Gäller fortfarande** utan att ändra datumet.
   Granska hela utkastet, spara, starta om appen och ladda om.

**Förväntat resultat:**

- Bara Familjemusik får Upphört efter datumgränsen. Lo med ett osäkert
  datum och Molnmusik utan datum förblir gällande.
- Ett rättat framtida datum gör Familjemusik gällande. Sambandets kända
  passerade datum ger Upphört, men **Gäller fortfarande** åsidosätter det.
- Utkastet visar både det gamla datumet och det nya statusvalet. Valet och
  datumet finns kvar efter omstart. Historikunderlaget bevarar båda värdena.
- Automationen kontrollerar dessutom via HTTP att ett ogiltigt kalenderdatum
  och ett datumvärde märkt som okänt avvisas utan nya förslag.

### LIVSCYKEL-04: kartans sambandsstatus är åtkomlig med tangentbord

**Syfte:** Kontrollera att kartans samband förmedlar samma status genom
synlig text och kontrollens tillgängliga beskrivning.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** De sparade objekten och sambanden ovan. Ange ett känt
slutdatum **2000-01-01** för båda sambanden. Behåll **Följ slutdatum** för
sambandet från Lo till Familjemusik, men välj **Gäller fortfarande** för
sambandet från Familjemusik till Molnmusik. Spara hela utkastet.

**Integrationstest:**
[lifecycle.spec.ts](../../tests/integration/lifecycle.spec.ts),
testfallet “LIVSCYKEL-04: keyboard relationship targets expose ended status
without changing saved facts”.

**Steg:**

1. Öppna kartan och välj **Alla etiketter**. Kontrollera de två sambanden.
2. Använd Tab och Skift+Tab för att nå sambandet från Lo till Familjemusik.
   Kontrollera synligt fokus och sambandets tillgängliga beskrivning med
   webbläsarens tillgänglighetsinspektör eller skärmläsare.
3. Tryck Enter på sambandet och öppna **Lista**. Läs dess uppgifter under
   **Val och redigering** utan att redigera eller spara något.
4. Starta om appen med samma databas, ladda om sidan och öppna kartan igen.
   Kontrollera båda sambandens status och tillgängliga beskrivningar.

**Förväntat resultat:**

- Sambandet från Lo visar **Upphört** med text och samma uppgift finns i
  kontrollens tillgängliga beskrivning. Dess namn behåller båda objekten
  och riktningen **Lo Exempel → Använder → Familjemusik**.
- Sambandet till Molnmusik saknar markeringen Upphört eftersom det
  uttryckliga statusvalet åsidosätter det passerade slutdatumet.
- Tangentbordets fokus är synligt och kontrollen går att aktivera.
  Detaljerna visar **Följ slutdatum**, **2000-01-01** och **Upphört**.
- Samma status består efter omstart. Inget nytt förslag eller sparande
  uppstår av visningen. Automationen jämför hela kartunderlaget via HTTP.
- Automationen kontrollerar webbläsarens tillgängliga beskrivning och
  fokus. Faktiska skärmläsarprov dokumenteras separat när de utförs.

### LIVSCYKEL-05: objekt och samband behåller sina egna beskrivningar

**Syfte:** Kontrollera att namn, typ och status för ett objekt inte ersätts
av ett annat sambands uppgifter i hjälpmedel.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** De sparade objekten och sambanden ovan. Lägg till
personen **Kim Exempel** med känt slutdatum **2000-01-01** och status
**Gäller fortfarande**. Ange **Upphört** för sambandet från Lo till
Familjemusik och spara hela utkastet. Automationen väljer de giltiga
identifierarna `relationship-incoming` för Kim och `incoming` för sambandet
genom det publika API:et för att prova att beskrivningarna hålls åtskilda.

**Integrationstest:**
[lifecycle.spec.ts](../../tests/integration/lifecycle.spec.ts),
testfallet “LIVSCYKEL-05: object and relationship descriptions remain
distinct for valid overlapping identities”.

**Steg:**

1. Öppna kartan och välj **Alla etiketter**. Kontrollera Kim och sambandet
   från Lo till Familjemusik.
2. Läs den tillgängliga beskrivningen för Kims namnetikett och objektsymbol
   med webbläsarens tillgänglighetsinspektör eller skärmläsare.
3. Läs motsvarande beskrivning för sambandet från Lo till Familjemusik.
4. Starta om appen med samma databas, ladda om kartan och kontrollera igen.

**Förväntat resultat:**

- Båda kontrollerna för Kim beskriver **Kim Exempel** och typen **Person**.
  De anger inte Upphört och visar inte det andra sambandets uppgifter.
- Sambandet visar **Upphört** både med text och i sin tillgängliga beskrivning.
- Samma namn, typ och status består efter omstart. Visningen ändrar inga
  sparade uppgifter eller privata förslag; automationen jämför hela underlaget.
- Automationen kontrollerar tillgängliga beskrivningar i webbläsaren.
  Faktiska skärmläsarprov dokumenteras separat när de utförs.

### LIVSCYKEL-06: aktuella och tidigare samband behåller sin egen status

**Syfte:** Kontrollera att ett tidigare sambands beskrivning behåller dess
namn och status när utkastet ändrar sambandet och andra samband visas samtidigt.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** De sparade objekten och sambanden ovan. Ange känt
slutdatum **2000-01-01** och status **Upphört** för sambandet från Lo till
Familjemusik. Lägg till **Molnmusik → Betalar → Lo Exempel** med samma
slutdatum och status **Gäller fortfarande**. Spara hela utkastet.
Automationen använder de giltiga identifierarna `incoming` och
`previous-incoming` via det publika API:et för att prova åtskilda beskrivningar.

**Integrationstest:**
[lifecycle.spec.ts](../../tests/integration/lifecycle.spec.ts),
testfallet “LIVSCYKEL-06: current and previous relationships retain their
own accessible status”.

**Steg:**

1. Redigera sambandet från Lo till Familjemusik. Välj typen **Betalar** och
   status **Gäller fortfarande**. Lägg sambandet i ditt utkast utan att spara.
2. Öppna kartan och välj **Alla etiketter**. Granska det tidigare sambandet
   från Lo, det föreslagna sambandet och det sparade sambandet från Molnmusik.
3. Läs kontrollernas tillgängliga beskrivningar med webbläsarens
   tillgänglighetsinspektör eller skärmläsare.
4. Starta om appen med samma databas, ladda om kartan och kontrollera igen.

**Förväntat resultat:**

- Det tidigare sambandet från Lo visar **Använder** och **Upphört** både
  med text och i sin tillgängliga beskrivning.
- Det föreslagna sambandet och sambandet från Molnmusik visar **Betalar**
  utan Upphört. Deras beskrivningar anger inte att de har upphört.
- Samma skillnad består efter omstart. Förslaget är fortfarande privat och
  de sparade sambanden är oförändrade; automationen jämför hela underlaget.
- Automationen kontrollerar tillgängliga beskrivningar i webbläsaren.
  Faktiska skärmläsarprov dokumenteras separat när de utförs.

## Borttagning

### LIVSCYKEL-03: direkt borttagning bevarar anslutna objekt och historik

**Syfte:** Kontrollera hela borttagningsförslaget, kastande och bevarande.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** De sparade objekten och sambanden ovan.

**Integrationstest:**
[lifecycle.spec.ts](../../tests/integration/lifecycle.spec.ts),
testfallet “LIVSCYKEL-03: removing from the list immediately proposes every
connected edge and preserves history”.

**Steg:**

1. Öppna **Lo Exempel → Använder → Familjemusik**, välj **Betalar** som
   sambandstyp och lägg sambandet i utkastet utan att spara.
2. Öppna **Åtgärder för Familjemusik** i objektlistan och välj **Ta bort**.
   Granska **Hela mitt utkast** utan något ytterligare förslagssteg.
3. Ladda om sidan, granska förslaget igen och välj **Kasta hela utkastet**.
4. Upprepa typbytet och **Ta bort** i listan. Välj **Spara hela utkastet**.
5. Starta om appen med samma databas och ladda om sidan.

**Förväntat resultat:**

- Utkastet innehåller borttagning av Familjemusik och båda sambanden med
  läsbara objektnamn och riktningar. Den gemensamma kartan är oförändrad.
- Borttagningen visar sambandets sparade typ **Använder**, utan **Betalar**
  eller någon typkonflikt. Hela utkastet går att spara direkt.
- Förslaget överlever omladdning. Kastande återger båda sambanden och
  tömmer utkastet utan att ändra den gemensamma kartan eller sambandets typ.
- Efter sparande och omstart är Familjemusik och båda sambanden borta.
  Lo och Molnmusik finns kvar. Inga typdefinitioner städas bort.
- Automationen läser historikunderlaget via HTTP och kontrollerar tidigare
  objekt, samband, namn och definitioner samt tidpunkt och användare.
  Läsning och ångring i gränssnittet provas i [historikfallen](history.md).

Konflikter som blockerar hela borttagningen provas även i
[UTKAST-06](drafts.md#utkast-06-granska-nya-samband-före-objektborttagning).
