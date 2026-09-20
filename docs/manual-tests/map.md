# Manuella testfall för objekt och samband

Testfallen gäller att skapa, söka, rätta och ta bort objekt och samband,
att välja mellan objekt med lika namn och att bevara ofullständiga uppgifter.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Använd den administratör som anges av `SKYTTEL_FIRST_ADMIN_PROVIDER` och
`SKYTTEL_FIRST_ADMIN_SUBJECT`. Logga in genom den konfigurerade
identitetsleverantören. KARTA-06 använder samma inloggning i en andra
webbläsarprofil. Alla namn, adresser och beskrivningar nedan är påhittade.

## Allmän förberedelse

1. Förbered en separat testinstallation med en ny, tom databas enligt
   [installationsguiden](../operations/installation.md). Använd inga verkliga
   hushållsuppgifter. Börja varje testfall med en ny testdatabas.
2. Starta applikationen, öppna dess adress och logga in som administratören.
   Skapa hushållet **Hushållet Linden**. Kontrollera att objektlistan är tom
   och att **Hela mitt utkast** visar **Inga förslag**.
3. Skapa objekt genom **Nytt objekt**, fyll i **Objektets namn** och
   **Objekttyp**, ange eventuell **Beskrivning** och välj
   **Lägg i mitt utkast**. Låt **Objektets identitet** vara
   **Identifierat objekt** om testfallet inte anger något annat.
4. Skapa samband genom **Nytt samband**, välj **Från objekt**,
   **Sambandstyp** och **Till objekt** och välj
   **Lägg sambandet i mitt utkast**. Låt **Uppgiftens säkerhet** vara
   **Känt** om testfallet inte anger något annat.
5. Behåll databasen vid omladdning och omstart inom ett testfall. Ett
   sparande görs med **Spara hela utkastet**; invänta ett lyckat kvitto.

## Söka och stänga formulär

### KARTA-01: sök med svenska bokstäver och stäng text som inte skickas

**Syfte:** Kontrollera att sökning fungerar utan hänsyn till stora och små
bokstäver och att avbruten formulärtext inte ändrar kartan eller utkastet.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** Skapa och spara tjänsten **Åsas tjänst** med beskrivningen
**Gemensam musik**, tjänstekontot **Övrigt konto** och personen **Kim**.

**Integrationstest:**
[map-workflows.spec.ts](../../tests/integration/map-workflows.spec.ts),
testfallet “KARTA-01: Swedish object search and closing unsent forms preserve
the saved map”.

**Steg:**

1. Skriv **åSAS** i **Sök objekt**. Kontrollera vilka objekt som visas och
   öppna **Åsas tjänst**. Kontrollera tangentbordets fokus.
2. Ändra namnet till **Text som inte skickas** och beskrivningen till
   **Inte heller denna text skickas**. Kontrollera **Spara hela utkastet**.
3. Flytta tangentbordets fokus till **Stäng utan att skicka texten** och
   tryck Retur. Kontrollera fokus och öppna **Åsas tjänst** igen.
4. Stäng formuläret, sök efter **finns inte** och töm därefter sökfältet.
5. Välj **Nytt objekt**, skriv **Avbrutet objekt** och välj
   **Stäng utan att skicka texten**. Ladda om sidan.

**Förväntat resultat:**

- Sökningen visar bara Åsas tjänst. När objektet öppnas får namnfältet
  fokus. Sparknappen är inaktiverad medan formuläret innehåller ändrad text.
- Stängning med Retur flyttar fokus till **Nytt objekt**. När objektet
  öppnas igen visas Åsas tjänst och Gemensam musik.
- En sökning utan träffar ger en tom objektlista. Ett tomt sökfält visar
  alla tre objekt igen.
- Efter omladdning finns bara de tre ursprungliga objekten. Namn och
  beskrivningar är oförändrade och utkastet innehåller inga förslag.

## Ofullständiga uppgifter

### KARTA-02: identifiera ett ospecificerat objekt utan att byta dess samband

**Syfte:** Kontrollera skillnaden mellan en obesvarad identitetsfråga och
ett ospecificerat objekt som senare kan identifieras.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** Tom karta och tomt utkast.

**Integrationstest:**
[map-workflows.spec.ts](../../tests/integration/map-workflows.spec.ts),
testfallet “KARTA-02: an unresolved object can become unspecified and later
identified without changing its links”.

**Steg:**

1. Lägg bankkontot **Betalkonto** i utkastet med **Objektets identitet**
   satt till **Obesvarad identitetsfråga**. Ladda om sidan och granska
   utkastet och **Spara hela utkastet**.
2. Öppna Betalkonto och kontrollera identiteten. Ändra den till
   **Ospecificerat objekt** och lägg ändringen i utkastet.
3. Lägg till abonnemanget **Familjemusik** och sambandet
   **Familjemusik → Betalas med → Betalkonto**. Spara hela utkastet.
4. Ladda om sidan och öppna Betalkonto. Kontrollera att det fortfarande
   är ospecificerat. Välj **Identifierat objekt**, ändra namnet till
   **Hushållskontot** och beskrivningen till **Gemensamt bankkonto**.
   Lägg ändringen i utkastet och spara.
5. Ladda om sidan, granska sambandet och öppna Hushållskontot.

**Förväntat resultat:**

- Den obesvarade frågan finns kvar efter omladdning och blockerar sparandet.
- Det uttryckligen ospecificerade bankkontot kan sparas tillsammans med
  abonnemanget och sambandet.
- Efter identifieringen finns fortfarande två objekt och ett samband:
  Familjemusik → Betalas med → Hushållskontot. Bankkontot visar
  Identifierat objekt och Gemensamt bankkonto. Ingen dubblett skapas.

### KARTA-05: skilj på obesvarat, osäkert, okänt och uttryckligen inget

**Syfte:** Kontrollera att sambandsuppgifter bevarar sin betydelse och att
en obesvarad fråga blockerar sparande av hela utkastet.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** Lägg abonnemanget **Familjemusik** och bankkontot
**Betalkonto** i utkastet. Sätt bankkontots identitet till
**Ospecificerat objekt**.

**Integrationstest:** [family.spec.ts](../../tests/integration/family.spec.ts),
testfallet “KARTA-05: manual forms preserve incomplete meanings and block an
unanswered identity question”.

**Steg:**

1. Skapa ett samband från Familjemusik med typen **Betalas med**.
   Välj **Obesvarad identitetsfråga** under **Uppgiftens säkerhet** och
   lägg sambandet i utkastet. Ladda om sidan.
2. Kontrollera utkastet och **Spara hela utkastet**. Öppna sambandet,
   välj **Osäkert uppgivet** och välj Betalkonto som **Till objekt**.
   Lägg sambandet i utkastet, spara och ladda om sidan.
3. Kontrollera sambandets säkerhet. Öppna Betalkonto, kontrollera
   **Objektets identitet** och stäng utan att skicka texten.
4. Öppna sambandet och välj **Okänt**. Lägg i utkastet, spara och
   ladda om sidan. Kontrollera sambandets betydelse.
5. Upprepa föregående steg med **Uttryckligen inget**.

**Förväntat resultat:**

- Den obesvarade frågan återkommer efter omladdning. Sparknappen är
  inaktiverad tills frågan löses.
- Det sparade sambandet visar Betalkonto och Osäkert uppgivet.
  Bankkontot behåller identiteten Ospecificerat objekt.
- Efter respektive ändring visar sambandet Okänt och sedan Uttryckligen
  inget i stället för ett målobjekt. Betydelserna blandas inte ihop.

## Välja och ta bort samband

### KARTA-03: välj mellan lika namn och rätta ett enskilt samband

**Syfte:** Kontrollera att lika namn inte slår samman objekt och att ett
sambands mål kan ändras och sambandet tas bort utan att påverka andra data.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** Tom karta och tomt utkast.

**Integrationstest:**
[map-workflows.spec.ts](../../tests/integration/map-workflows.spec.ts),
testfallet “KARTA-03: equal object names stay distinct when correcting and
deleting a relationship”.

**Steg:**

1. Lägg till tjänstekontot **Musikkonto** och två separata objekt av typen
   **E-postadress**, båda med namnet `familj@example.test`. Ge dem
   beskrivningarna **Första adressobjektet** och **Andra adressobjektet**.
2. Skapa **Musikkonto → Inloggningsadress** med det första adressobjektet
   som mål. Använd beskrivningen och identiteten i väljaren för att skilja
   adresserna åt. Skapa **Musikkonto → Kontaktadress** till det andra
   adressobjektet. Spara hela utkastet.
3. Försök skapa samma inloggningssamband till det första adressobjektet
   igen. Kontrollera statusen och antalet samband.
4. Öppna inloggningssambandet och kontrollera dess mål. Byt till det
   andra adressobjektet och välj **Stäng sambandet utan att skicka**.
   Öppna sambandet igen och kontrollera målet.
5. Byt åter till det andra adressobjektet, lägg sambandet i utkastet,
   spara och ladda om sidan. Öppna sambandet och kontrollera målet.
6. Välj **Föreslå borttagning av sambandet**, granska borttagningen,
   spara och ladda om sidan.

**Förväntat resultat:**

- Väljarna skiljer adresserna åt med beskrivning och identitet. Båda
  adressobjekten finns kvar som separata objekt.
- Dubblettförsöket visar **Sambandet finns redan**. Det finns fortfarande
  två samband och inget nytt sambandsförslag i utkastet.
- Stängning utan att skicka behåller första adressobjektet som mål.
  Efter uttryckligt sparande är målet det andra adressobjektet.
- Borttagningen gäller endast inloggningssambandet. Kontaktadressens
  samband och alla tre objekt finns kvar efter omladdning.

### KARTA-04: granska och kasta borttagning av ett objekt med flera samband

**Syfte:** Kontrollera att objektborttagning omfattar inkommande och
utgående samband och lämnar oberoende information oförändrad.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** Skapa och spara personen **Kim**, tjänsten
**Molnmusik**, tjänstekontot **Musikkonto** och abonnemanget
**Familjemusik**. Spara även följande samband:

- Kim → Använder → Molnmusik.
- Musikkonto → Tillhör tjänsten → Molnmusik.
- Familjemusik → Gäller tjänstekontot → Musikkonto.

**Integrationstest:**
[map-workflows.spec.ts](../../tests/integration/map-workflows.spec.ts),
testfallet “KARTA-04: object deletion reviews incoming and outgoing links
and can be discarded”.

**Steg:**

1. Öppna Musikkonto och välj **Föreslå borttagning**. Granska hela utkastet.
2. Välj **Nytt samband** och kontrollera alternativen i **Från objekt**
   och **Till objekt**. Välj **Stäng sambandet utan att skicka**.
3. Välj **Kasta hela utkastet**. Kontrollera objekt och samband.
4. Föreslå åter borttagning av Musikkonto. Spara hela utkastet och
   ladda om sidan.

**Förväntat resultat:**

- Utkastet visar borttagning av Musikkonto och båda sambanden till eller
  från tjänstekontot, med deras namn och riktningar.
- Musikkonto kan inte väljas som källa eller mål för ett nytt samband
  medan borttagningen ligger i utkastet.
- När utkastet kastas finns alla fyra objekt och alla tre samband kvar.
- Efter sparad borttagning finns Kim, Molnmusik och Familjemusik kvar.
  Det enda kvarvarande sambandet är Kim → Använder → Molnmusik.

## Skapa och spara kartans innehåll

### KARTA-06: återuppta, rätta och kasta ett beständigt objektförslag

**Syfte:** Kontrollera att ett objektförslag bevaras före sparandet och
kan återupptas i en annan klient med samma inloggning.

**Användare:** Den konfigurerade administratören i två webbläsarprofiler.

**Förutsättningar:** Tom karta och tomt utkast. Tillgång till att starta om
testinstallationen med samma databas.

**Integrationstest:** [map.spec.ts](../../tests/integration/map.spec.ts),
testfallet “KARTA-06: objects move from a persistent private proposal to the
shared map after review”.

**Steg:**

1. Välj **Nytt objekt**, skriv **Lo Exempel**, välj typen **Person** och
   skriv beskrivningen **En påhittad person**. Flytta fokus till
   **Lägg i mitt utkast** och tryck Retur.
2. Granska utkastet, ladda om sidan och kontrollera namn och beskrivning.
3. Starta om applikationen med samma databas. Logga in som samma användare
   i den andra webbläsarprofilen och kontrollera utkastet.
4. Spara hela utkastet och kontrollera kvittot. Sök efter **Lo**,
   öppna Lo Exempel, ändra namnet till **Lo Lind** och lägg i utkastet.
   Granska sparat underlag och förslag.
5. Välj **Kasta hela utkastet**. Öppna Lo Exempel, välj
   **Föreslå borttagning**, granska utkastet och spara det.

**Förväntat resultat:**

- Förslaget bevarar namn och beskrivning efter omladdning och omstart.
  Samma användare kan fortsätta i den andra webbläsarprofilen.
- Sparandet ger ett lyckat kvitto och tömmer utkastet. Det sparade
  objektet hittas genom sökning.
- Namnändringen visar Lo Exempel som underlag och Lo Lind som förslag.
  Kastande behåller det sparade namnet Lo Exempel.
- Borttagningen framgår av utkastet. Efter sparandet finns Lo Exempel
  inte längre i objektlistan.

### KARTA-07: spara separata familjeobjekt och ett riktat samband tillsammans

**Syfte:** Kontrollera att tjänst, konto, abonnemang och övriga objekt
behåller separata identiteter när hela utkastet sparas.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** Tom karta och tomt utkast. Tillgång till att starta om
testinstallationen med samma databas.

**Integrationstest:** [family.spec.ts](../../tests/integration/family.spec.ts),
testfallet “KARTA-07: family objects and directed relationships save
together and keep their identities”.

**Steg:**

1. Lägg följande åtta separata objekt i utkastet: tjänsten **Molnmusik**,
   tjänstekontot **Familjens konto**, abonnemanget **Familjemusik**,
   personen **Lo**, e-postadressen `familj@example.test`, kortet
   **Familjekort**, bankkontot **Hushållskonto** och företaget **Moln AB**.
2. Skapa sambandet
   **Familjemusik → Gäller tjänstekontot → Familjens konto**.
3. Försök lägga till exakt samma samband igen. Granska hela utkastet och
   kontrollera att det fortfarande bara innehåller ett samband.
4. Spara hela utkastet. Starta om applikationen med samma databas,
   öppna kartan och granska objekten och sambandet.

**Förväntat resultat:**

- Utkastet innehåller åtta separata objekt och ett samband. Det upprepade
  tillägget skapar ingen dubblett.
- Efter sparande och omstart finns samma åtta objekt och ett samband.
  Sambandet går från abonnemanget till tjänstekontot och behåller sin typ.
- Integrationstestet kontrollerar dessutom att sparandet och historiken
  bevarar samma ändringsgrupp och objektens identiteter.
