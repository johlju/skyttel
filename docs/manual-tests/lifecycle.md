# Manuella testfall för upphört och borttaget innehåll

Testfallen gäller status, slutdatum och vanlig borttagning i privata utkast.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Använd den konfigurerade administratören i en separat testinstallation.
Logga in genom den konfigurerade identitetsleverantören enligt
[installationsguiden](../operations/installation.md).
Samma kartarbete är tillgängligt för en vanlig hushållsmedlem.

## Allmän förberedelse

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan. Detaljpanelen visar uppgifterna. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. I hel kartvy heter knappen **Redigera val**. Att bara välja
objektet eller sambandet öppnar inte formuläret.

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
