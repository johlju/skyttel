# Manuella testfall för privata utkast

Testfallen gäller återupptagning, granskning, sparande, kastande och
konflikthantering av privata utkast. Förberedelser och testdata anges nedan.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Logga in med den administratör som anges av
`SKYTTEL_FIRST_ADMIN_PROVIDER` och `SKYTTEL_FIRST_ADMIN_SUBJECT`.
Det ursprungliga visningsnamnet är **Development administrator**.
Inloggningen sker genom den konfigurerade identitetsleverantören.

Robin Demo är en påhittad tidigare hushållsmedlem som anges som författare
i ändringshistoriken. Posten saknar kopplad inloggning, session och aktuellt
medlemskap. Den ger ingen extra inloggning för manuell testning.

UTKAST-03–11 använder dessutom en separat testidentitet med rollen medlem.
Bjud in identiteten enligt [tillgång till hushållet](../user-guide/access.md).
Använd skilda webbläsarprofiler för administratören och medlemmen.

## Allmän förberedelse

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan. Detaljpanelen visar uppgifterna. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. I hel kartvy heter knappen **Redigera val**. Att bara välja
objektet eller sambandet öppnar inte formuläret.

För UTKAST-01 används demodata:

1. Förbered en separat utvecklingsdatabas enligt
   [demodata och återställning](../development/devcontainer.md#reset-demo-data).
   Återställning tar bort befintliga utvecklingsdata och sessioner.
2. Kör `npm run db:setup` för att skapa aktuellt utgångsläge.
3. Starta applikationen med `npm run dev:all`.
4. Öppna [utvecklingsklienten](http://localhost:5173) och logga in som den
   konfigurerade administratören.
5. Kontrollera att hushållet **TestHousehold** visas.

Återställ demodata före varje ny körning av testfallet. Under testets
omstart ska samma databas behållas; kör då inte `npm run db:setup`.

För UTKAST-02–11 används en separat, tom testinstallation enligt
[installationsguiden](../operations/installation.md), utan demodata:

1. Logga in som den konfigurerade administratören och skapa ett hushåll.
2. Skapa personen **Lo Exempel** och tjänsten **Molnmusik** med
   **Nytt objekt**, **Objektets namn**, **Objekttyp** och
   **Lägg i mitt utkast**. Välj **Spara hela utkastet**.
3. Ge medlemmen tillgång för fallen som kräver två användare. Kontrollera
   att båda ser objekten och har **Inga förslag** i sina egna utkast.
4. Använd ett nytt tomt testhushåll inför varje fall. Behåll databasen vid
   omladdning och omstart inom fallet.

## Privata utkast

### UTKAST-01: återuppta en konflikt och spara oberoende förslag tillsammans

**Syfte:** Kontrollera att ett privat utkast kan återupptas, att ett aktivt
konfliktval bevarar oberoende ändringar och att hela utkastet kräver ett
nytt sparbesked.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** Aktuell demodata enligt förberedelsen ovan. Inga
förslag får vara sparade eller kastade efter återställningen.

**Integrationstest:** [family.spec.ts](../../tests/integration/family.spec.ts),
testfallet “UTKAST-01: demo seed resumes a conflict and preserves independent
proposals without granting access to map people”.
[database-setup.spec.ts](../../tests/integration/database-setup.spec.ts)
kontrollerar även demodatans underlag, historik och administratörens åtkomst.
Se [testguiden](../development/testing.md#integration-tests) för
kommandon som kör integrationstesterna.

**Steg:**

1. Öppna **Hela mitt utkast**. Granska namnkonflikten och förslaget om byte
   av inloggningsadress. Kontrollera knappen **Spara hela utkastet**.
2. Ladda om sidan. Stoppa och starta sedan applikationen igen med samma
   databas. Öppna sidan och granska utkastet på nytt.
3. Välj **Behåll mitt förslag** för namnkonflikten. Kontrollera statusen,
   namnet, beskrivningen och förslaget om inloggningsadress.
4. Öppna **Familjens musikkonto**, ändra namnet till
   **Familjens rättade konto** och välj **Lägg i mitt utkast**. Granska
   sambandets **Sparat underlag** och **Förslag**.
5. Välj **Spara hela utkastet**. Kontrollera kvittot och utkastet.
6. Ladda om sidan. Kontrollera utkastet och det sparade sambandet.

**Förväntat resultat:**

- Före konfliktvalet visas ursprungsnamnet Lo Exempel, förslaget Lo Lind
  och det aktuella sparade namnet Lo Berg. **Spara hela utkastet** är
  inaktiverad. Konflikten och adressförslaget finns kvar efter omladdning
  och omstart.
- Konfliktvalet ger inget sparkvitto. Statusen uppmanar till granskning
  av hela utkastet. Förslaget innehåller Lo Lind och den oberoende sparade
  beskrivningen “Spelar piano i musikföreningen.” Adressförslaget finns kvar.
- Sambandets tidigare underlag visar Familjens musikkonto och
  `familjen@example.test`. Förslaget visar Familjens rättade konto och
  `musik@example.test`.
- Det uttryckliga sparandet ger ett lyckat sparkvitto. Utkastet visar
  **Inga förslag** även efter omladdning. Det sparade sambandet visar
  **Familjens rättade konto → Inloggningsadress → `musik@example.test`**.

## Aktuellt underlag och borttagning

### UTKAST-02: ett gammalt kastförsök bevarar nyare förslag

**Syfte:** Kontrollera att en äldre flik inte kan kasta nyare förslag.

**Användare:** Administratören i två flikar.

**Förutsättningar:** Tom testinstallation med de två sparade objekten
enligt förberedelsen. Båda flikarna använder samma inloggning.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
testfallet “UTKAST-02: a stale discard preserves newer object and
relationship proposals”.

**Steg:**

1. Öppna **Lo Exempel**, ändra namnet till **Lo Lind** och välj
   **Lägg i mitt utkast** i första fliken.
2. Öppna appen i andra fliken. Välj **Nytt samband** och lägg
   **Lo Lind → Använder → Molnmusik** i utkastet.
3. Välj **Kasta hela utkastet** i första fliken utan att ladda om.
4. Välj **Hämta aktuellt underlag**. Granska namnförslaget och sambandet.
5. Välj **Kasta hela utkastet** igen och ladda om sidan.

**Förväntat resultat:**

- Det första kastförsöket avvisas eftersom förslaget eller kartan ändras.
  Fortsatt kastande blockeras tills aktuellt underlag hämtas.
- Efter hämtningen finns både **Lo Lind** och det nya sambandet kvar.
- Det andra kastandet tömmer hela utkastet. **Lo Exempel** och
  **Molnmusik** finns kvar i kartan, utan det föreslagna sambandet.

### UTKAST-03: ett gammalt konfliktval kräver ny granskning

**Syfte:** Kontrollera att ett konfliktval gäller det underlag som visas.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** De två sparade objekten enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
testfallet “UTKAST-03: a stale conflict choice requires refreshed review
before saving”.

**Steg:**

1. Lägg namnändringen **Lo Lind** i administratörens utkast utan att spara.
2. Ändra samma person till **Lo Berg** som medlemmen och spara hela utkastet.
3. Ladda om administratörens sida. Kontrollera konflikten med **Lo Berg**.
4. Ändra personen till **Lo Ek** som medlemmen och spara igen.
5. Välj **Behåll mitt förslag** som administratören utan omladdning.
6. Välj **Hämta aktuellt underlag** och granska **Lo Ek** och **Lo Lind**.
7. Välj **Behåll mitt förslag** igen. Kontrollera medlemmens karta efter
   omladdning innan administratören väljer **Spara hela utkastet**.
8. Spara administratörens utkast och ladda om medlemmens sida.

**Förväntat resultat:**

- Det gamla konfliktvalet avvisas och sparande blockeras. Namnförslaget
  **Lo Lind** finns kvar när det aktuella underlaget hämtas.
- Det nya konfliktvalet uppmanar till granskning och ändrar bara utkastet.
  Medlemmen ser fortfarande **Lo Ek** före det uttryckliga sparandet.
- Efter sparandet bekräftar kvittot **Lo Lind** och medlemmen ser det namnet.

### UTKAST-04: godta ett borttaget objekt utan att tappa andra förslag

**Syfte:** Kontrollera att ett namnförslag inte återupplivar ett borttaget
objekt och att oberoende förslag kan sparas.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** De två sparade objekten enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
testfallet “UTKAST-04: accepting a deleted object preserves an independent
proposal”.

**Steg:**

1. Lägg namnändringen **Lo Lind** och ett nytt objekt **Kim Exempel** i
   administratörens utkast utan att spara.
2. Öppna **Lo Exempel** som medlemmen, välj **Ta bort** och
   **Spara hela utkastet**.
3. Ladda om administratörens sida. Granska konflikten och möjliga val.
4. Välj **Använd sparat värde**. Granska det återstående utkastet och
   medlemmens karta innan något sparas.
5. Välj **Spara hela utkastet** som administratören och ladda om båda sidorna.

**Förväntat resultat:**

- Konflikten säger att objektet är borttaget. **Behåll mitt förslag**
  erbjuds inte och hela utkastet kan inte sparas före konfliktvalet.
- Valet tar bort namnförslaget men behåller **Kim Exempel** i utkastet.
  Kim finns ännu inte i medlemmens karta.
- Efter sparandet finns **Kim Exempel** och **Molnmusik** hos båda
  användarna. Varken **Lo Exempel** eller **Lo Lind** återkommer.

## Samtidiga ändringar

### UTKAST-05: en namnkonflikt blockerar även oberoende förslag

**Syfte:** Kontrollera att hela utkastet sparas tillsammans efter ett nytt
konfliktval och sparbesked.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** De två sparade objekten enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
testfallet “UTKAST-05: a conflict choice preserves independent proposals
and requires a new save”.

**Steg:**

1. Lägg **Alex Exempel** som nytt objekt och namnändringen **Lo Lind** i
   administratörens utkast. Behåll sidan öppen.
2. Ändra samma person till **Lo Berg** som medlemmen och spara.
3. Välj **Spara hela utkastet** som administratören utan omladdning.
4. Kontrollera medlemmens karta. Välj sedan **Hämta aktuellt underlag**
   som administratören och granska de tre namnvärdena.
5. Välj **Behåll mitt förslag**. Starta om appen med samma databas och
   ladda om administratörens sida.
6. Granska utkastet och välj **Spara hela utkastet**. Ladda om hos medlemmen.

**Förväntat resultat:**

- Det första sparandet avvisas med **Inget sparades**. Medlemmen ser
  **Lo Berg** och inget **Alex Exempel**.
- Granskningen visar underlaget **Lo Exempel**, förslaget **Lo Lind** och
  det sparade namnet **Lo Berg**. Sparande kräver ett uttryckligt val.
- Konfliktvalet behåller **Alex Exempel**, ger inget sparkvitto och
  finns kvar efter omstart. Det nya sparandet gör båda förslagen gemensamma.

### UTKAST-06: granska nya samband före objektborttagning

**Syfte:** Kontrollera att borttagning kräver granskning av samband som
en annan användare lägger till.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** De två sparade objekten utan samband enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
testfallet “UTKAST-06: deleting an object requires reviewing newly saved
relationships”.

**Steg:**

1. Öppna **Lo Exempel** som administratören och välj **Ta bort**.
2. Lägg **Lo Exempel → Använder → Molnmusik** med säkerheten
   **Osäkert uppgivet** i medlemmens utkast och spara det.
3. Försök spara administratörens äldre utkast. Hämta aktuellt underlag.
4. Granska det nytillkomna sambandet och välj **Behåll mitt förslag**.
5. Kontrollera att sambandet fortfarande finns hos medlemmen. Välj sedan
   **Spara hela utkastet** som administratören och ladda om hos medlemmen.

**Förväntat resultat:**

- Det gamla sparandet avvisas. Konflikten visar sambandet med riktning
  och säkerheten **Osäkert uppgivet**.
- Konfliktvalet lägger även **Borttagning av samband** i utkastet.
  Kartan ändras först vid det nya sparandet.
- Både personen och sambandet försvinner efter sparandet. **Molnmusik**
  finns kvar.

### UTKAST-07: välj sparad betydelse vid en konflikt om ett samband

**Syfte:** Kontrollera att granskningen skiljer osäkerhet från att något
uttryckligen saknas.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** Spara **Lo Exempel → Använder → Molnmusik** med
säkerheten **Känt** utöver de två objekten enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
testfallet “UTKAST-07: overlapping relationship proposals show meanings
and can accept the saved value”.

**Steg:**

1. Öppna sambandet som administratören och lägg säkerheten
   **Osäkert uppgivet** i utkastet.
2. Öppna samma samband som medlemmen, välj **Uttryckligen inget**, lägg
   det i utkastet och spara.
3. Ladda om administratörens sida och granska konflikten.
4. Välj **Använd sparat värde** och kontrollera utkastet och sambandet.

**Förväntat resultat:**

- Konflikten visar både **Osäkert uppgivet** och **Uttryckligen inget**.
  Sparande är blockerat före valet.
- Valet tömmer det överlappande förslaget. Kartans samband behåller
  **Uttryckligen inget** och inget nytt sparande krävs.

### UTKAST-10: bevara oberoende status och håll slutdatumets säkerhet samlad

**Syfte:** Bevara oberoende ändringar av ett samband när ett konfliktval
görs och låta ett överlappande datumval omfatta både datum och säkerhet.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** Spara **Lo Exempel → Använder → Molnmusik** med
säkerheten **Känt**, statusen **Följ slutdatum** och utan slutdatum.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
testfallet “UTKAST-10: relationship choices preserve independent status
and keep date certainty with its value”.

**Steg:**

1. Öppna sambandet som administratören. Ange **2031-04-12** som känt
   **Sambandets slutdatum** och lägg sambandet i utkastet utan att spara.
2. Öppna samma samband som medlemmen. Välj **Upphört** under
   **Sambandets status**, lägg sambandet i utkastet och spara.
3. Ladda om administratörens sida. Granska konflikten med slutdatumet och
   den sparade statusen. Välj **Behåll mitt förslag**.
4. Kontrollera hos medlemmen att inget slutdatum är sparat. Starta om
   appen med samma databas, ladda om administratörens sida och granska
   hela utkastet igen. Välj **Spara hela utkastet**.
5. Ändra slutdatumets säkerhet till **Osäkert uppgivet** som administratören.
   Behåll datumet **2031-04-12** och lägg sambandet i utkastet.
6. Ändra slutdatumet till **2031-05-15**, behåll säkerheten **Känt** och
   välj statusen **Gäller fortfarande** som medlemmen. Lägg sambandet i
   utkastet och spara.
7. Ladda om administratörens sida, granska båda datumen, deras säkerhet
   och den sparade statusen. Välj **Behåll mitt förslag**.
8. Kontrollera hos medlemmen att det kända datumet **2031-05-15** fortfarande
   är sparat. Välj **Spara hela utkastet** som administratören och ladda
   om hos medlemmen.

**Förväntat resultat:**

- Sparande är blockerat före varje konfliktval. Valet ändrar bara utkastet
  och kräver ett nytt sparande av hela det granskade utkastet.
- Det första lösta utkastet överlever omstart. Efter sparandet innehåller
  sambandet både **Upphört** och det kända slutdatumet **2031-04-12**.
- Efter det andra sparandet innehåller sambandet **Gäller fortfarande**
  och **2031-04-12 (Osäkert uppgivet)**. Den oberoende statusen bevaras;
  det valda datumet och dess säkerhet hålls ihop.

### UTKAST-11: bevara rätt typdefinition vid borttagning efter ett typbyte

**Syfte:** Granska aktuella typer före borttagning och bevara definitionerna
som hör till de borttagna värdena i historikunderlaget.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** Spara **Lo Exempel → Använder → Molnmusik** med
säkerheten **Känt** utöver de två objekten enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
testfallet “UTKAST-11: deletion after concurrent type changes retains the
matching historical definitions”.

**Steg:**

1. Öppna **Åtgärder för Lo Exempel** som administratören och välj **Ta bort**.
   Låt borttagningen av objektet och sambandet ligga kvar i utkastet.
2. Öppna **Lo Exempel** som medlemmen. Byt **Objekttyp** till
   **Abonnemang** och lägg ändringen i utkastet.
3. Byt sambandets typ från **Använder** till **Används av** i samma utkast.
   Behåll riktningen från Lo till Molnmusik och spara hela utkastet.
4. Ladda om administratörens sida och granska konflikterna för objektet
   och sambandet. Välj **Behåll mitt förslag** för båda.
5. Kontrollera hos medlemmen att objektet och sambandet fortfarande finns.
   Välj sedan **Spara hela utkastet** som administratören och ladda om
   hos medlemmen.

**Förväntat resultat:**

- Konflikterna visar de aktuella typerna **Abonnemang** och **Används av**.
  Hela sparandet är blockerat tills båda valen är gjorda.
- Valen ändrar bara utkastet. Efter det nya sparandet är Lo och sambandet
  borttagna, medan Molnmusik finns kvar.
- Automationen läser historikunderlaget via HTTP. Det tidigare objektet
  och sambandet har sina aktuella typ-ID:n tillsammans med motsvarande
  definitioner för **Abonnemang** och **Används av**, samt tomma eftervärden.
  Läsning och ångring i gränssnittet provas i [historikfallen](history.md).

### UTKAST-08: välj ett befintligt samband och behåll andra förslag

**Syfte:** Kontrollera att samtidiga likadana samband inte skapar dubbletter.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** De två sparade objekten utan samband enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
testfallet “UTKAST-08: a saved duplicate can be selected without losing
another proposal”.

**Steg:**

1. Lägg **Lo Exempel → Använder → Molnmusik** och det nya objektet
   **Kim Exempel** i administratörens utkast.
2. Skapa samma samband som medlemmen och spara det.
3. Ladda om administratörens sida och granska konflikten.
4. Välj **Använd sparat värde** och sedan **Spara hela utkastet**.

**Förväntat resultat:**

- Granskningen visar **Samma samband finns redan** och det befintliga
  sambandet med läsbara objektnamn och riktning.
- Valet tar bort dubblettförslaget men behåller **Kim Exempel**.
- Efter sparandet finns Kim och exakt ett sådant samband i kartan.

### UTKAST-09: ta bort ett förslag som hänvisar till ett borttaget objekt

**Syfte:** Kontrollera att ett ofullständigt samband kan granskas efter
omstart och tas bort uttryckligen.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** De två sparade objekten utan samband enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
testfallet “UTKAST-09: a deleted relationship endpoint has an explicit
recovery choice”.

**Steg:**

1. Lägg **Lo Exempel → Använder → Molnmusik** med säkerheten
   **Osäkert uppgivet** i administratörens utkast.
2. Öppna **Molnmusik** som medlemmen, välj **Ta bort** och spara.
3. Ladda om administratörens sida och granska konflikten.
4. Starta om appen med samma databas och öppna administratörens utkast.
5. Välj **Använd sparat värde**.

**Förväntat resultat:**

- Konflikten säger att sambandet hänvisar till ett borttaget objekt.
  **Behåll mitt förslag** erbjuds inte.
- Efter omstart visas fortfarande **Lo Exempel → Använder → Molnmusik**
  med **Osäkert uppgivet**, även om målobjektet saknas i kartan.
- Valet tar bort förslaget och visar **Inga förslag**. Inget samband
  skapas och det borttagna objektet återkommer inte.
