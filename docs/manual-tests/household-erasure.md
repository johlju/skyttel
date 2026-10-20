# Manuella testfall för permanent radering

Testfallen omfattar administratörens granskning, uttrycklig bekräftelse,
avbruten granskning i Inställningar, osäkert resultat, ändrat underlag
och väntande städning efter omstart.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Använd den lokala devcontainern och värddatorns webbläsare enligt
[utvecklingsguiden](../development/devcontainer.md#run-the-application).
Inloggningen ska fungera med den konfigurerade första administratörens
Google- eller Microsoft-konto innan du börjar.

- **Alex** är namnet på testrollen för detta konto, inte ett krav på
  kontots visningsnamn. Alex är administratör i Linden och använder profil A.
- Profil B använder samma administratör för samtidig ändring av utkastet.
  Logga in med samma konto i båda profilerna; ingen inbjudan behövs.

Använd bara påhittade uppgifter och testbilder. Permanent radering kan
inte ångras i Skyttel. Kör inte testfallen mot ett verkligt hushåll.

## Allmän förberedelse

När ett befintligt objekt ska ändras, öppna **Tabell** och välj
**Redigera [objektets namn]**. Objektets namn öppnar i stället dess uppgifter
och samband. Alla uppgifter visas direkt i raden. Använd **Samband för
[objektets namn]** för att läsa eller redigera ett samband.
Lägg hela formulärets ändring i utkastet innan du öppnar nästa arbetsyta.

1. Starta en ny provdatabas enligt nästa avsnitt inför varje fall. Öppna
   <http://localhost:5173>, logga in som Alex och skriv **Linden** i
   **Hushållets namn**. Välj **Skapa hushåll**.
2. Välj **Nytt objekt**, fyll i **Lampan att radera** i **Namn**,
   välj **Fordon** som **Objekttyp** och välj **Lägg i utkastet och stäng**.
   Lägg till **Stolen att bevara** på samma sätt. Typen används bara för
   detta tekniska prov. Öppna **Skriv till Skyttel → Visa utkastet**, välj
   **Spara hela utkastet** och invänta kvittot.
3. Stäng textvyn, öppna **Tabell** och välj **Redigera Lampan att radera**.
   Öppna **Livscykel och utseende** och välj en liten påhittad PNG-bild genom
   **Välj profilbild**. Välj **Lägg i utkastet och stäng** och spara sedan
   hela utkastet. Expandera lampans rad i tabellen. Högerklicka på bilden,
   välj att kopiera bildens adress och spara adressen för senare kontroll.
4. Stäng textvyn. Välj **Visa Lampan att radera i kartan**
   i tabellen och öppna **Navigera**.
   Välj **Flytta [objektets namn]: höger** en gång. Välj stolen och flytta den
   åt vänster med **Flytta [objektets namn]: vänster**. Ladda om och kontrollera
   placeringarna.
5. Öppna **Tabell**, välj **Redigera Stolen att bevara** och skriv
   **Oberoende privat förslag** i **Beskrivning**. Välj **Lägg i utkastet och
stäng**.
   Kontrollera förslaget
   under **Visa utkastet**. Spara inte hela utkastet.
6. Behåll samma databas vid omstart inom ett fall. Felfallen använder
   Chromium med separat förberedelse; städningsfallen behöver en andra terminal.
   Förbered en privat mapp för hämtade exporter och radera filerna efteråt.

### Ny lokal provdatabas och omstart

Stoppa eventuell befintlig `npm run dev:all` med Ctrl+C. Kör följande från
projektets rot i en terminal i devcontainern inför varje nytt fall.
Kommandot skapar en separat tom databas och använder befintlig
inloggningskonfiguration. Kör bara ett av fallen åt gången.

```sh
erasure_case_dir=$(mktemp -d /tmp/skyttel-radering.XXXXXX)
printf 'SKYTTEL_DATABASE_PATH=%s/skyttel.sqlite\n' "$erasure_case_dir" \
  > /tmp/skyttel-radering.env
env -u SKYTTEL_DATABASE_PATH node --env-file=/tmp/skyttel-radering.env \
  scripts/develop.mjs
```

Vid **omstart inom samma fall**: tryck Ctrl+C i serverns terminal, vänta
tills kommandot avslutas och kör bara följande. Låt en eventuell separat
SQLite-läsare fortsätta i sin egen terminal.

```sh
env -u SKYTTEL_DATABASE_PATH node --env-file=/tmp/skyttel-radering.env \
  scripts/develop.mjs
```

Ladda sedan om webbläsarsidan. Kör inte databasförberedelsen på nytt vid
omstart; den skulle välja en annan, tom databas. Efter sista fallet kan du
stoppa provservern och starta den vanliga miljön med `npm run dev:all`.

## Motsvarigheter och tekniskt underlag

Varje vanligt fall har en enda upptäckt browsermotsvarighet. RADERING-06
använder 1280 × 900, ljust tema. RADERING-12–20 behåller hela samma
arbetsflöde i sina namngivna konfigurationer. Ingen variant eller tidigare
identitet utgår. Ingen assertions- eller konfigurationstäckning tas bort.
RADERING-21 kräver faktisk webbläsarzoom och fysisk tangentbordsanvändning.
Automatikens fokus, kontrast, geometri och syntetiska tangenttryckningar
är separat underlag, inte utförd mänsklig observation.

[Separat förberedelse](household-erasure-preparation.md) anger exakt tidpunkt,
profil, förberedelsebesked, återställning och tekniska efterkontroller.
Arkiv, HTTP-status, begäransräkning och exakta lagringsvärden kontrolleras
där och i integrationen; de ersätter inte följande UI-arbete.

## Granska och genomför

### RADERING-01: Radera valt innehåll med tangentbordet

**Syfte:** Tangentbordsgranskning och oåterkallelig radering bevarar oberoende
arbete efter omstart.

**Användare:** Alex som administratör.

**Förutsättningar:** Allmän förberedelse med bild, historik, placeringar och
stolens privata förslag.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-01"
  },
  "reference": "Chromium, lokal provdatabas med verklig HTTP och SQLite; fallets angivna roller och felgräns.",
  "outcomes": [
    "Bara uttryckligen granskat innehåll raderas.",
    "Stolen och dess privata förslag och historik bevaras efter omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Inställningar → Permanent radering**. Läs skillnaden mot
   borttagning och upphört innehåll samt begränsningarna för nedladdade
   exporter och leverantörens interna kopior.
2. Använd Tab till **Lampan att radera**, välj med mellanslag och aktivera
   **Granska raderingen** med Enter. Läs **Omfattning att bekräfta**:
   lampan, en bildversion och en personlig placering ingår; stolen och
   dess privata förslag ingår inte. Läs bildversionen i listan.
3. Kontrollera inaktiverad **Radera permanent**. Skriv **RADERA PERMANENT**
   och aktivera knappen med Enter. Invänta slutfört besked.
4. Operatören startar om samma installation enligt kommandot ovan. Ladda
   om raderingssidan; slutfört besked ska finnas kvar.
5. Välj **Läs in kartan på nytt → Tabell**. Lampan saknas, stolen finns.
   Öppna stolens rad och **Visa utkastet**; dess privata förslag finns kvar.
   Stäng textvyn. Öppna **Rapporter → Ändringshistorik → Visa ändringarna**
   för de bevarade sparandena: stolen finns, lampans gamla innehåll saknas.
6. Välj **Tillbaka till arbetet**, öppna **Inställningar → Fullständig
   export**, välj **Förbered fullständig export → Hämta ZIP-fil**.
   Webbläsaren hämtar en verklig ZIP-fil. Operatören utför sedan de separata
   bild- och arkivkontrollerna för RADERING-01.

**Förväntat resultat:**

- Bara uttryckligen granskat innehåll raderas.
- Stolen och dess privata förslag och historik bevaras efter omstart.

### RADERING-02: Återfinn resultatet efter förlorat svar

**Syfte:** Ett verkligt slutfört men förlorat svar förblir oklart tills samma
resultat återfinns.

**Användare:** Alex som administratör.

**Förutsättningar:** Allmän förberedelse. Öppna raderingssidan i Chromium.

**Separat förberedelse:** Tappa ett slutfört svar, execute, före steg 2; efteråt
separat begäranskontroll.
Se [körbar förberedelse](household-erasure-preparation.md).

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-02"
  },
  "reference": "Chromium, lokal provdatabas med verklig HTTP och SQLite; fallets angivna roller och felgräns.",
  "outcomes": [
    "Förlorat slutförandesvar presenteras som oklart utfall.",
    "Statusläsning återfinner samma slutförande utan ny radering."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Markera lampan, välj **Granska raderingen** och skriv **RADERA PERMANENT**.
2. Operatören förbereder **execute** enligt länken nedan. Välj **Radera
   permanent**. Läs **Utfallet är oklart** utan slutförandebesked; nytt
   innehåll får inte väljas. Operatören bekräftar det tappade slutförda svaret.
3. Välj **Kontrollera raderingsstatus och läs in aktuellt innehåll**.
   Det verkliga slutförda resultatet återfinns. Ladda om sidan: samma
   slutförda resultat ska finnas kvar.
4. Välj **Läs in kartan på nytt → Tabell**. Lampan saknas, stolen finns
   och **Visa utkastet** behåller stolens privata förslag.

**Förväntat resultat:**

- Förlorat slutförandesvar presenteras som oklart utfall.
- Statusläsning återfinner samma slutförande utan ny radering.

### RADERING-03: Granska på nytt efter en samtidig ändring

**Syfte:** En tidigare bekräftelse får inte användas mot ändrat privat underlag.

**Användare:** Alex i profilerna A och B med samma konto.

**Förutsättningar:** Allmän förberedelse; profil B visar samma hushålls Tabell.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-03"
  },
  "reference": "Chromium, lokal provdatabas med verklig HTTP och SQLite; fallets angivna roller och felgräns.",
  "outcomes": [
    "Föråldrad granskning avvisas utan radering.",
    "Ny granskning kräver ny bekräftelse och bevarar det senare privata förslaget."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Profil A väljer lampan och **Granska raderingen** utan att bekräfta.
2. Profil B väljer **Redigera Stolen att bevara**, skriver **Senare privat
   förslag** i **Beskrivning** och väljer **Lägg i utkastet och stäng**.
   Öppna **Visa utkastet** och läs beskrivningen. Spara inte.
3. Profil A skriver **RADERA PERMANENT** och väljer **Radera permanent**.
   Läs **Innehållet har ändrats. Granska raderingen igen**. Båda objekten
   ska fortfarande synas i profil B:s tabell.
4. Profil A väljer **Granska raderingen** igen utan omladdning.
   Bekräftelsefältet är tomt och **Radera permanent** inaktiverad.
   Granska den aktuella omfattningen, skriv bekräftelsen på nytt och radera.
5. Invänta slutfört besked och välj **Läs in kartan på nytt → Tabell**.
   Lampan saknas. Stolen och **Senare privat förslag** i **Visa utkastet**
   ska finnas kvar.

**Förväntat resultat:**

- Föråldrad granskning avvisas utan radering.
- Ny granskning kräver ny bekräftelse och bevarar det senare privata förslaget.

### RADERING-04: Slutför väntande städning efter omstart

**Syfte:** Fastlåsta journalsidor ger väntande städning, inte ett falskt
slutförande.

**Användare:** Alex som administratör och installationens operatör.

**Förutsättningar:** Allmän förberedelse; operatörens oberoende SQLite-läsare är
öppen.

**Separat förberedelse:** Håll en verklig SQLite-läsare före steg 1, genom
omstarten, till steg 4; efteråt separat bildkontroll.
Se [körbar förberedelse](household-erasure-preparation.md).

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-04"
  },
  "reference": "Chromium, lokal provdatabas med verklig HTTP och SQLite; fallets angivna roller och felgräns.",
  "outcomes": [
    "Hushållsinnehåll och export är spärrade under verklig väntande städning.",
    "Samma ärende slutförs först efter att läsaren släppts."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Markera lampan, granska och bekräfta med **RADERA PERMANENT**.
   Läs **Raderingen är inte slutförd** och att innehållet är otillgängligt.
2. Öppna **Tillbaka till kartan** i en ny flik: kartarbetet är stoppat.
   Öppna **Fullständig export** i en annan flik och välj **Förbered
   fullständig export**: ett fel visas och ingen **Hämta ZIP-fil** erbjuds.
3. Operatören startar om samma server och behåller SQLite-läsaren.
   Ladda om raderingssidan. Slutförandebesked saknas och **Försök slutföra
   raderingen** erbjuds för det väntande ärendet.
4. Operatören avslutar läsaren enligt förberedelsen. Välj **Försök
   slutföra raderingen** och invänta slutfört besked.
5. Välj **Läs in kartan på nytt → Tabell**. Lampan saknas, stolen finns
   och **Visa utkastet** visar **Oberoende privat förslag**.

**Förväntat resultat:**

- Hushållsinnehåll och export är spärrade under verklig väntande städning.
- Samma ärende slutförs först efter att läsaren släppts.

### RADERING-05: Radera en tidigare typ och dess sista historiska bild

**Syfte:** Historisk bildförstörelse efter typbyte bevarar nuvarande objekt,
bild och oberoende arbete.

**Användare:** Alex som administratör.

**Förutsättningar:** Använd ny provdatabas. Förbered två olika påhittade
PNG-bilder, en blå och en orange. Ersätt allmän förberedelse steg 2–5 med:

1. Öppna **Inställningar → Typer → Ny objekttyp**. Skriv
   **Tidigare bildtyp** i **Typens namn**, ange ingen ytterligare uppgift och välj
   **Lägg typförslaget i mitt utkast → Tillbaka till kartan**.
2. Skapa lampan av **Tidigare bildtyp** och stolen av **Fordon** med **Nytt
   objekt**, **Namn**, **Objekttyp** och **Lägg i utkastet och stäng**.
   Öppna **Visa utkastet → Spara hela utkastet** och invänta kvittot.
3. Stäng textvyn, välj **Tabell → Redigera Lampan att radera → Livscykel
   och utseende → Välj profilbild** och välj den blå bilden. Välj **Lägg
   i utkastet och stäng** och spara hela utkastet. Expandera lampans rad
   och kopiera bildens adress för den separata tekniska kontrollen.
4. Välj **Redigera Lampan att radera**, byt **Objekttyp** till **Fordon**
   med alla egenskaper kvar. Öppna **Livscykel och utseende**,
   välj orange bild, välj **Lägg i utkastet och stäng** och spara hela
   utkastet. Kopiera den nya bildadressen från lampans expanderade rad.
5. Flytta båda objekten och lägg stolens **Oberoende privat förslag** i
   utkastet enligt allmän förberedelse steg 4–5. Spara inte förslaget.

**Separat förberedelse:** Separata bild- och arkivkontroller för RADERING-05
före steg 2 och efter steg 5.
Se [körbar förberedelse](household-erasure-preparation.md).

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-05"
  },
  "reference": "Chromium, lokal provdatabas med verklig HTTP och SQLite; fallets angivna roller och felgräns.",
  "outcomes": [
    "Historiska gamla bildversionen och typen förstörs efter omstart.",
    "Nuvarande objekt och bild samt oberoende privat arbete bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Inställningar → Permanent radering**, välj bara **Tidigare
   bildtyp** och **Granska raderingen**. Inga objekt eller placeringar
   ingår. **Bildversioner: 1** visas och listan visar den gamla bildversionen,
   inte den nya. Operatören kontrollerar att gamla bilden ännu kan läsas.
2. Skriv **RADERA PERMANENT**, välj **Radera permanent**, invänta slutfört
   besked. Operatören startar om samma installation. Ladda om sidan och
   kontrollera slutfört besked igen.
3. Välj **Läs in kartan på nytt → Tabell → Redigera Lampan att radera**.
   Lampan finns med ny typ. Öppna **Livscykel och utseende** och läs den
   orange profilbilden. Stäng med Escape utan ändring.
4. Öppna **Visa utkastet** och läs stolens privata förslag. Stäng textvyn.
   Öppna **Rapporter → Ändringshistorik → Visa ändringarna** för bevarade
   sparanden: stolen finns, **Tidigare bildtyp** saknas.
5. Välj **Tillbaka till arbetet → Inställningar → Fullständig export**.
   Välj **Förbered fullständig export → Hämta ZIP-fil** och invänta faktisk
   hämtning. Operatören utför de separata bild- och arkivkontrollerna.

**Förväntat resultat:**

- Historiska gamla bildversionen och typen förstörs efter omstart.
- Nuvarande objekt och bild samt oberoende privat arbete bevaras.

### RADERING-06: Avbryt granskningen och återgå till bevarat arbete

**Syfte:** Fullständig tangentbordsgranskning, avbrytande och ny uttrycklig
radering vid 1280 × 900 i ljust tema.

**Användare:** Alex som administratör.

**Förutsättningar:** Allmän förberedelse. Välj ljust tema och 1280 × 900;
verklig zoom hör till RADERING-21.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-06"
  },
  "reference": "1280 × 900, ljust tema; fullständigt tangentbordsflöde med fokus, läsbarhet och uttrycklig radering.",
  "outcomes": [
    "Avbruten granskning bevarar arbetet och nästa granskning kräver ny bekräftelse.",
    "Hela UI-flödet, läsbart fokus och verifierad återgång fungerar i vald konfiguration."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Nytt objekt**, skriv **Oskickat arbete före radering** i **Namn**.
   Tryck Escape, välj **Fortsätt redigera** och kontrollera namn och fokus.
   Tryck Escape igen och bekräfta **Kasta ändringarna och fortsätt**.
2. Öppna **Inställningar → Permanent radering** med tangentbordet.
   Huvudrubriken får synligt fokus, kartan är dold och det kastade formuläret
   stängt. Läs den valda sidans länk. Vid smal bredd öppnas och stängs
   **Välj inställning** med Enter kring läsningen.
3. Markera lampan med mellanslag och välj **Granska raderingen** med Enter.
   Rubriken **Omfattning att bekräfta** får fokus. Läs hela bildversionen,
   lampans namn och en personlig placering. Stolen och privata förslaget
   ska inte ingå. Fokusringar och text ska kunna läsas utan vågrät rullning.
4. Kontrollera inaktiverad **Radera permanent**. Skriv **RADERA permanent**:
   knappen förblir inaktiverad. Skriv **RADERA PERMANENT**, men aktivera
   **Avbryt** med tangentbordet. Granskningen stängs, valrubriken får fokus
   och lampans val finns kvar. Ingen radering görs.
5. Välj **Tillbaka till kartan**, öppna **Nytt objekt** och kontrollera
   tomt namnfält. Stäng utan ändring. Sparat innehåll och privata förslaget
   bevaras; exakta placeringar verifieras som separat tekniskt underlag.
6. Öppna samma inställningssida igen, välj lampan och granska på nytt.
   Bekräftelsefältet är tomt och raderingsknappen inaktiverad. Skriv
   **RADERA PERMANENT** och aktivera raderingen med Enter.
7. Invänta slutfört besked och **Resultat**. Läs hela identifieraren och
   resultatets ett objekt, en bildversion och noll samband och typer.
   **Läs in kartan på nytt** får fokus; läs hela fokusringen och aktivera
   med Enter. I **Tabell** saknas lampan och stolen finns. **Visa utkastet**
   behåller **Oberoende privat förslag**.

**Förväntat resultat:**

- Avbruten granskning bevarar arbetet och nästa granskning kräver ny
  bekräftelse.
- Hela UI-flödet, läsbart fokus och verifierad återgång fungerar i vald
  konfiguration.

### RADERING-07: Följ ett känt försök när ett senare resultat finns

**Syfte:** Ett ursprungligt känt försök ersätts inte av en senare administratörs
resultat.

**Användare:** Alex och Robin, båda aktuella administratörer i skilda profiler.

**Förutsättningar:** Allmän förberedelse. Robin skapar och sparar den oanvända
sambandstypen **Senare tom sambandstyp** med etiketterna **använder** och
**används av**; Alex privata förslag förblir osparat.

**Separat förberedelse:** Tappa ett slutfört svar, execute, i Alex profil före
steg 1; separat identitets- och begäranskontroll efteråt.
Se [körbar förberedelse](household-erasure-preparation.md).

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-07"
  },
  "reference": "Chromium, lokal provdatabas med verklig HTTP och SQLite; fallets angivna roller och felgräns.",
  "outcomes": [
    "Navigation och omladdning följer första exakta ärendet.",
    "Senare separat radering ändrar inte första resultatet eller oberoende arbete."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex granskar lampan och skriver **RADERA PERMANENT**. Operatören
   förbereder tappat execute-svar. Välj **Radera permanent** och läs
   **Utfallet är oklart** utan slutförandebesked. Operatören behåller det
   första försökets identifierare för separat jämförelse.
2. Robin öppnar **Permanent radering**, markerar bara **Senare tom
   sambandstyp**, granskar noll objekt, bilder och privata ändringar.
   Bekräfta uttryckligen och invänta eget slutfört resultat.
3. Alex väljer **Översikt**, återvänder till **Permanent radering** och
   laddar om. Välj **Kontrollera raderingsstatus och läs in aktuellt
   innehåll**. Det första försöket återfinns med ett objekt, en bildversion
   och noll samband och typer; Robins senare resultat får inte ersätta det.
4. Besök **Översikt**, återvänd och kontrollera status igen: samma första
   resultat visas. Välj **Läs in kartan på nytt → Tabell**. Lampan saknas,
   stolen och Alex privata förslag i **Visa utkastet** finns kvar.
   Operatören kontrollerar de två exakta resultaten och bevarade typerna.

**Förväntat resultat:**

- Navigation och omladdning följer första exakta ärendet.
- Senare separat radering ändrar inte första resultatet eller oberoende arbete.

### RADERING-08: En aktuell administratör fortsätter samma väntande ärende

**Syfte:** Aktuell auktoritet styr samma fastlåsta ärende genom omstart och
förlorat slutförandesvar.

**Användare:** Alex, Robin och installationens operatör.

**Förutsättningar:** Allmän förberedelse. Robin är administratör och har
**Robins eget privata förslag** på stolen i sitt osparade utkast. Alex behåller
sitt eget förslag. SQLite-läsaren är öppen.

**Separat förberedelse:** SQLite-läsare före steg 1 till steg 5; tappa slutfört
resume-svar före andra fortsättningen; tekniska efterkontroller.
Se [körbar förberedelse](household-erasure-preparation.md).

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-08"
  },
  "reference": "Chromium, lokal provdatabas med verklig HTTP och SQLite; fallets angivna roller och felgräns.",
  "outcomes": [
    "Förlorad administratörstillgång kan inte fortsätta ärendet.",
    "Aktuell administratör följer samma väntande och slutförda ärende.",
    "Båda oberoende privata utkast bevaras utan att röjas på raderingssidan."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex granskar och bekräftar lampans radering. Robins privata
   beskrivning ska inte synas. Invänta väntande städning och läs ärendet.
2. Robin öppnar **Administrera tillgång → Medlemmar** och väljer **Gör
   till medlem** på Alex rad. Alex laddar om raderingssidan; **Du kan inte
   administrera hushållet** visas utan slutförandeknapp.
3. Robin öppnar **Permanent radering**. Samma väntande ärende visas utan
   automatisk fortsättning och utan Alex privata beskrivning. I separata
   flikar är kartarbetet stoppat och **Förbered fullständig export** ger fel.
4. Operatören startar om samma installation med läsaren kvar. Robin laddar
   om och väljer **Försök slutföra raderingen**. Inget slutförandebesked
   visas; karta och ny export förblir spärrade.
5. Operatören avslutar läsaren och förbereder tappat resume-svar i Robins
   profil. Robin väljer **Försök slutföra raderingen** igen. Läs **Utfallet
   är oklart** utan slutförandebesked eller resultatantal.
6. Robin besöker **Översikt**, återvänder, laddar om och väljer **Kontrollera
   raderingsstatus och läs in aktuellt innehåll**. Samma ärende är slutfört:
   ett objekt, en bildversion och noll samband och typer.
7. Robin väljer **Läs in kartan på nytt → Tabell**. Alex öppnar sin karta.
   Lampan saknas. Var och en öppnar stolen och **Visa utkastet** och läser
   sitt eget bevarade privata förslag. Operatören gör efterkontrollerna.

**Förväntat resultat:**

- Förlorad administratörstillgång kan inte fortsätta ärendet.
- Aktuell administratör följer samma väntande och slutförda ärende.
- Båda oberoende privata utkast bevaras utan att röjas på raderingssidan.

### RADERING-09: Ett saknat känt försök har fortfarande okänt utfall

**Syfte:** Ett saknat exakt resultat får inte ersättas av ett annat slutfört
försök.

**Användare:** Alex i profilerna A och B.

**Förutsättningar:** Allmän förberedelse. Samma konto i båda profilerna;
**Person** är oanvänd.

**Separat förberedelse:** Blockera begäran innan den tas emot enligt separata
tidpunkter i steg 1 och 4; tekniska efterkontroller.
Se [körbar förberedelse](household-erasure-preparation.md).

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-09.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-09"
  },
  "reference": "Chromium, lokal provdatabas med verklig HTTP och SQLite; fallets angivna roller och felgräns.",
  "outcomes": [
    "Saknat eller otillgängligt resultat förblir uttryckligen okänt.",
    "Andra ärendets slutförande ersätter aldrig det första."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Operatören blockerar nästa execute i profil A före servermottagning.
   Profil A granskar lampan, skriver **RADERA PERMANENT** och raderar.
   **Utfallet är oklart** och ett känt försök visas. Operatören avblockerar.
2. Profil B markerar bara **Person** på raderingssidan och granskar noll
   objekt, samband, privata ändringar och bilder. Bekräfta uttryckligen.
   Ett eget slutfört resultat med en objekttyp visas.
3. Profil A besöker **Översikt**, återvänder och laddar om. Samma första
   försök visas med okänt utfall, utan profil B:s slutförandebesked eller antal.
4. Operatören blockerar bara första försökets statusläsning. Välj
   **Kontrollera raderingsstatus och läs in aktuellt innehåll**: fortsatt
   oklart. Operatören avblockerar. Kontrollera igen: **Inget bekräftat
   resultat hittades för ditt försök** och fortsatt okänt utfall visas.
5. Profil B öppnar kartans **Tabell**. Lampan och stolen är
   kvar. **Visa utkastet** visar stolens privata förslag. Operatören
   kontrollerar exakt saknat resultat, oförändrade placeringar och typer.

**Förväntat resultat:**

- Saknat eller otillgängligt resultat förblir uttryckligen okänt.
- Andra ärendets slutförande ersätter aldrig det första.

### RADERING-10: Ett gammalt statussvar ändrar inte ett nyare försök

**Syfte:** En fördröjd status från lämnad sida får inte ersätta nyare resultat
eller fokus.

**Användare:** Alex som administratör.

**Förutsättningar:** Allmän förberedelse; **Person** är oanvänd.

**Separat förberedelse:** Håll ett gammalt statussvar före steg 2, släpp i steg
4; tekniska efterkontroller.
Se [körbar förberedelse](household-erasure-preparation.md).

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-10.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-10"
  },
  "reference": "Chromium, lokal provdatabas med verklig HTTP och SQLite; fallets angivna roller och felgräns.",
  "outcomes": [
    "Sen response ersätter inte nyare resultat eller fokus.",
    "Navigation och omladdning behåller nyare känt ärende utan ny radering."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ
[håll ett gammalt statussvar](household-erasure-preparation.md#håll-ett-gammalt-statussvar)
. Efter första verkliga slutförandet, före statuskontrollen i UI-steg 2:
installera utdraget och meddela **Nästa gamla statussvar är förberett**. Efter
statuskontrollen: invänta `RADERING-10: svaret väntar` för katalogsvaret efter
den exakta statusläsningen, och meddela **Gamla svaret hålls** före
navigationen. Behåll det under det nya försöket. Först efter nytt slutfört
resultat och Översikts tangentbordsfokus i steg 4: tryck Alt+Skift+R och meddela
**Gamla svaret är släppt**. Avbryt inte det nyare försöket. Utför de separata
efterkontrollerna; vid avbrott släpp och ladda om enligt utdragets
återställning.

**Steg:**

1. Granska lampan, bekräfta uttryckligen och invänta slutfört resultat med ett
   objekt och en bildversion.
2. Operatören håller nästa gamla statussvar enligt länken nedan. Välj
   **Kontrollera raderingsstatus och läs in aktuellt innehåll** och invänta
   förberedelsebeskedet innan navigationen.
3. Välj **Översikt**, återvänd och välj bara **Person**. Granska noll
   bildversioner, tomt bekräftelsefält och inaktiverad raderingsknapp. Skriv
   **RADERA PERMANENT** och radera uttryckligen.
4. Invänta nytt slutfört resultat med en objekttyp och noll objekt, samband,
   sambandstyper och bilder. Ge **Översikt** tangentbordsfokus utan att aktivera
   länken. Be operatören släppa det gamla svaret och invänta bekräftelse. Nyare
   resultat och fokus ska finnas kvar.
5. Tryck Enter, återvänd till raderingssidan, ladda om och kontrollera status
   igen: bara det nyare försöket visas. Välj **Läs in kartan på nytt → Tabell**.
   Lampan saknas, stolen och dess privata förslag finns kvar. Operatören
   kontrollerar exakta läsningar och bevarad lagring.

**Förväntat resultat:**

- Sen response ersätter inte nyare resultat eller fokus.
- Navigation och omladdning behåller nyare känt ärende utan ny radering.

### RADERING-11: Lagringsfel bevarar granskningen och samma väntande radering

**Syfte:** Återhämtningsminnets fel skiljs från faktiskt serverresultat och
stoppar osäkra nya åtgärder.

**Användare:** Alex och installationens operatör.

**Förutsättningar:** Allmän förberedelse; Chromium. Lagringsutdraget blockeras
initialt för borttagning.

**Separat förberedelse:** Blockera återhämtningsminnet före steg 1;
SQLite-läsare först i steg 3 till steg 6; tekniska efterkontroller.
Se [körbar förberedelse](household-erasure-preparation.md).

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-11.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-11"
  },
  "reference": "Chromium, lokal provdatabas med verklig HTTP och SQLite; fallets angivna roller och felgräns.",
  "outcomes": [
    "Lagringsfel skapar varken falskt nytt försök eller falsk fortsättning.",
    "Samma verkliga väntande ärende slutförs efter återställd lagring."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ
[blockera återhämtningsminnet](household-erasure-preparation.md#blockera-återhämtningsminnet)
och
[håll en verklig SQLite-läsare](household-erasure-preparation.md#håll-en-verklig-sqlite-läsare)
. Före UI-steg 1 installeras det oförändrade utdraget som blockerar borttagning;
meddela **Borttagning ur återhämtningsminnet blockeras**.

Vid första begäran i steg 2: tryck Alt+Skift+A och meddela **Lagring
återställd** före markering. Efter granskning och bekräftelsetext men FÖRE
Radera permanent: tryck Alt+Skift+S och meddela **Skrivning till
återhämtningsminnet blockeras**. Läsaren ska inte vara öppnad här.

Vid steg 3: öppna den befintliga SQLite-läsaren i samma databas och invänta
**Läsningen är öppen**. Tryck Alt+Skift+A och meddela **Läsaren är öppen och
lagringen återställd** före den första verkliga raderingen. Behåll läsaren under
väntande städning. Vid steg 4: tryck Alt+Skift+S och bekräfta blockeringen FÖRE
navigation. Behåll den genom navigation och den fortsättning som i steg 5 inte
får skickas.

Vid steg 6: tryck Alt+Skift+A, avsluta läsaren och invänta **Läsningen är
avslutad**. Meddela **Lagringen återställd och läsaren avslutad** FÖRE samma
fortsättningsknapp. Behåll samma ärende, session och databas; ladda inte om
under felkedjan. Efter sista observationen i gränssnittet: utför de separata
efterkontrollerna, tillåt lagring och ladda om enligt den befintliga
återställningen. Vid avbrott avslutas läsaren och samma väntande ärende slutförs
genom UI före ny provdatabas.

**Steg:**

1. Försök markera lampan. Läs **Webbläsarens återhämtningsminne**; lampan
   förblir omarkerad och sidan användbar.
2. Be operatören återställa lagringen och invänta bekräftelse. Markera lampan
   och granska. Skriv **RADERA PERMANENT**. Be operatören blockera nästa lagring
   och invänta bekräftelse. Välj **Radera permanent**. Läs att ingen ny radering
   startats. Granskningen och bekräftelsetexten finns kvar utan identifierare
   för ett nytt påstått försök.
3. Be operatören öppna läsaren och återställa lagringen. Invänta båda
   bekräftelserna och bekräfta samma granskning. Invänta verklig städning med
   känt försök och spärrat innehåll.
4. Be operatören blockera lagringen och invänta bekräftelse. Besök **Översikt**
   och återvänd. Samma försök och städning visas med separat lagringsfel. Sidan
   får inte säga att den framgångsrika statusläsningen misslyckades.
5. Välj **Försök slutföra raderingen**. Läs **Ingen fortsättning har skickats**;
   ärendet förblir väntande.
6. Be operatören återställa lagringen och avsluta läsaren. Invänta båda
   bekräftelserna. Välj samma fortsättningsknapp och invänta slutfört resultat
   för samma ärende. Välj **Läs in kartan på nytt → Tabell**. Lampan saknas,
   stolen och dess privata förslag finns kvar. Operatören utför tekniska
   efterkontroller.

**Förväntat resultat:**

- Lagringsfel skapar varken falskt nytt försök eller falsk fortsättning.
- Samma verkliga väntande ärende slutförs efter återställd lagring.

## Hela granskningen vid andra konfigurationer

### RADERING-12: Avbryt och radera vid 1280 × 900, mörkt tema

**Syfte:** Skydda temakontrast och hela fokusringen.

**Användare:** Alex som administratör.

**Förutsättningar:** Ny allmän förberedelse, 1280 × 900 och mörkt tema.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-12.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-12"
  },
  "reference": "1280 × 900, mörkt tema; hela flödet, skyddar temakontrast och hela fokusringen.",
  "outcomes": [
    "Avbrytande bevarar arbete och ny granskning kräver ny uttrycklig bekräftelse.",
    "Full radering och återgång behåller oberoende privat arbete och synligt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför RADERING-06 steg 1–7 en gång i denna konfiguration. Under steg
   2 öppnas smal sidmeny när **Välj inställning** visas. Under steg 3–4
   och 6–7 kontrolleras hela fokusringen, läsbara bild- och
   raderingsidentifierare samt nåbara kontroller i valt tema.

**Förväntat resultat:**

- Samma fullständiga avbrytande, nya granskning och uttryckliga radering
  fungerar utan dolt fokus eller oläsbara identiteter.
- Stolen och dess privata förslag finns kvar efter verifierad återgång.

### RADERING-13: Avbryt och radera vid 390 × 900, ljust tema

**Syfte:** Skydda smal sidnavigation och läsbara identiteter.

**Användare:** Alex som administratör.

**Förutsättningar:** Ny allmän förberedelse, 390 × 900 och ljust tema.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-13.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-13"
  },
  "reference": "390 × 900, ljust tema; hela flödet, skyddar smal sidnavigation och läsbara identiteter.",
  "outcomes": [
    "Avbrytande bevarar arbete och ny granskning kräver ny uttrycklig bekräftelse.",
    "Full radering och återgång behåller oberoende privat arbete och synligt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför RADERING-06 steg 1–7 en gång i denna konfiguration. Under steg
   2 öppnas smal sidmeny när **Välj inställning** visas. Under steg 3–4
   och 6–7 kontrolleras hela fokusringen, läsbara bild- och
   raderingsidentifierare samt nåbara kontroller i valt tema.

**Förväntat resultat:**

- Samma fullständiga avbrytande, nya granskning och uttryckliga radering
  fungerar utan dolt fokus eller oläsbara identiteter.
- Stolen och dess privata förslag finns kvar efter verifierad återgång.

### RADERING-14: Avbryt och radera vid 390 × 900, mörkt tema

**Syfte:** Skydda smal sidnavigation och mörk temakontrast.

**Användare:** Alex som administratör.

**Förutsättningar:** Ny allmän förberedelse, 390 × 900 och mörkt tema.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-14.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-14"
  },
  "reference": "390 × 900, mörkt tema; hela flödet, skyddar smal sidnavigation och mörk temakontrast.",
  "outcomes": [
    "Avbrytande bevarar arbete och ny granskning kräver ny uttrycklig bekräftelse.",
    "Full radering och återgång behåller oberoende privat arbete och synligt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför RADERING-06 steg 1–7 en gång i denna konfiguration. Under steg
   2 öppnas smal sidmeny när **Välj inställning** visas. Under steg 3–4
   och 6–7 kontrolleras hela fokusringen, läsbara bild- och
   raderingsidentifierare samt nåbara kontroller i valt tema.

**Förväntat resultat:**

- Samma fullständiga avbrytande, nya granskning och uttryckliga radering
  fungerar utan dolt fokus eller oläsbara identiteter.
- Stolen och dess privata förslag finns kvar efter verifierad återgång.

### RADERING-15: Avbryt och radera vid 320 × 900, ljust tema

**Syfte:** Skydda mycket smalt omflöde och nåbar bekräftelse.

**Användare:** Alex som administratör.

**Förutsättningar:** Ny allmän förberedelse, 320 × 900 och ljust tema.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-15.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-15"
  },
  "reference": "320 × 900, ljust tema; hela flödet, skyddar mycket smalt omflöde och nåbar bekräftelse.",
  "outcomes": [
    "Avbrytande bevarar arbete och ny granskning kräver ny uttrycklig bekräftelse.",
    "Full radering och återgång behåller oberoende privat arbete och synligt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför RADERING-06 steg 1–7 en gång i denna konfiguration. Under steg
   2 öppnas smal sidmeny när **Välj inställning** visas. Under steg 3–4
   och 6–7 kontrolleras hela fokusringen, läsbara bild- och
   raderingsidentifierare samt nåbara kontroller i valt tema.

**Förväntat resultat:**

- Samma fullständiga avbrytande, nya granskning och uttryckliga radering
  fungerar utan dolt fokus eller oläsbara identiteter.
- Stolen och dess privata förslag finns kvar efter verifierad återgång.

### RADERING-16: Avbryt och radera vid 320 × 900, mörkt tema

**Syfte:** Skydda mycket smalt omflöde och mörk temakontrast.

**Användare:** Alex som administratör.

**Förutsättningar:** Ny allmän förberedelse, 320 × 900 och mörkt tema.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-16.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-16"
  },
  "reference": "320 × 900, mörkt tema; hela flödet, skyddar mycket smalt omflöde och mörk temakontrast.",
  "outcomes": [
    "Avbrytande bevarar arbete och ny granskning kräver ny uttrycklig bekräftelse.",
    "Full radering och återgång behåller oberoende privat arbete och synligt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför RADERING-06 steg 1–7 en gång i denna konfiguration. Under steg
   2 öppnas smal sidmeny när **Välj inställning** visas. Under steg 3–4
   och 6–7 kontrolleras hela fokusringen, läsbara bild- och
   raderingsidentifierare samt nåbara kontroller i valt tema.

**Förväntat resultat:**

- Samma fullständiga avbrytande, nya granskning och uttryckliga radering
  fungerar utan dolt fokus eller oläsbara identiteter.
- Stolen och dess privata förslag finns kvar efter verifierad återgång.

### RADERING-17: Avbryt och radera vid 640 × 500, ljust tema

**Syfte:** Skydda kort arbetsyta och nåbara fokuserade kontroller.

**Användare:** Alex som administratör.

**Förutsättningar:** Ny allmän förberedelse, 640 × 500 och ljust tema.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-17.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-17"
  },
  "reference": "640 × 500, ljust tema; hela flödet, skyddar kort arbetsyta och nåbara fokuserade kontroller.",
  "outcomes": [
    "Avbrytande bevarar arbete och ny granskning kräver ny uttrycklig bekräftelse.",
    "Full radering och återgång behåller oberoende privat arbete och synligt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför RADERING-06 steg 1–7 en gång i denna konfiguration. Under steg
   2 öppnas smal sidmeny när **Välj inställning** visas. Under steg 3–4
   och 6–7 kontrolleras hela fokusringen, läsbara bild- och
   raderingsidentifierare samt nåbara kontroller i valt tema.

**Förväntat resultat:**

- Samma fullständiga avbrytande, nya granskning och uttryckliga radering
  fungerar utan dolt fokus eller oläsbara identiteter.
- Stolen och dess privata förslag finns kvar efter verifierad återgång.

### RADERING-18: Avbryt och radera vid 640 × 500, mörkt tema

**Syfte:** Skydda kort arbetsyta och mörk temakontrast.

**Användare:** Alex som administratör.

**Förutsättningar:** Ny allmän förberedelse, 640 × 500 och mörkt tema.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-18.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-18"
  },
  "reference": "640 × 500, mörkt tema; hela flödet, skyddar kort arbetsyta och mörk temakontrast.",
  "outcomes": [
    "Avbrytande bevarar arbete och ny granskning kräver ny uttrycklig bekräftelse.",
    "Full radering och återgång behåller oberoende privat arbete och synligt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför RADERING-06 steg 1–7 en gång i denna konfiguration. Under steg
   2 öppnas smal sidmeny när **Välj inställning** visas. Under steg 3–4
   och 6–7 kontrolleras hela fokusringen, läsbara bild- och
   raderingsidentifierare samt nåbara kontroller i valt tema.

**Förväntat resultat:**

- Samma fullständiga avbrytande, nya granskning och uttryckliga radering
  fungerar utan dolt fokus eller oläsbara identiteter.
- Stolen och dess privata förslag finns kvar efter verifierad återgång.

### RADERING-19: Avbryt och radera vid 320 × 250, ljust tema

**Syfte:** Skydda extremt kort och smal intern rullning utan dolt fokus.

**Användare:** Alex som administratör.

**Förutsättningar:** Ny allmän förberedelse, 320 × 250 och ljust tema.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-19.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-19"
  },
  "reference": "320 × 250, ljust tema; hela flödet, skyddar extremt kort och smal intern rullning utan dolt fokus.",
  "outcomes": [
    "Avbrytande bevarar arbete och ny granskning kräver ny uttrycklig bekräftelse.",
    "Full radering och återgång behåller oberoende privat arbete och synligt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför RADERING-06 steg 1–7 en gång i denna konfiguration. Under steg
   2 öppnas smal sidmeny när **Välj inställning** visas. Under steg 3–4
   och 6–7 kontrolleras hela fokusringen, läsbara bild- och
   raderingsidentifierare samt nåbara kontroller i valt tema.

**Förväntat resultat:**

- Samma fullständiga avbrytande, nya granskning och uttryckliga radering
  fungerar utan dolt fokus eller oläsbara identiteter.
- Stolen och dess privata förslag finns kvar efter verifierad återgång.

### RADERING-20: Avbryt och radera vid 320 × 250, mörkt tema

**Syfte:** Skydda extremt kort och smal intern rullning i mörkt tema.

**Användare:** Alex som administratör.

**Förutsättningar:** Ny allmän förberedelse, 320 × 250 och mörkt tema.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
RADERING-20.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-20"
  },
  "reference": "320 × 250, mörkt tema; hela flödet, skyddar extremt kort och smal intern rullning i mörkt tema.",
  "outcomes": [
    "Avbrytande bevarar arbete och ny granskning kräver ny uttrycklig bekräftelse.",
    "Full radering och återgång behåller oberoende privat arbete och synligt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför RADERING-06 steg 1–7 en gång i denna konfiguration. Under steg
   2 öppnas smal sidmeny när **Välj inställning** visas. Under steg 3–4
   och 6–7 kontrolleras hela fokusringen, läsbara bild- och
   raderingsidentifierare samt nåbara kontroller i valt tema.

**Förväntat resultat:**

- Samma fullständiga avbrytande, nya granskning och uttryckliga radering
  fungerar utan dolt fokus eller oläsbara identiteter.
- Stolen och dess privata förslag finns kvar efter verifierad återgång.

## Faktisk zoom och fysisk tangentbordsanvändning

### RADERING-21: Läs och genomför vid verklig webbläsarzoom

**Syfte:** Kontrollera verklig förstoring och fysisk tangentbordsåtkomst
utan att likställa dessa med Chromium-viewport eller syntetiska tangenter.

**Användare:** Alex som administratör.

**Förutsättningar:** Ny påhittad provdatabas per full körning. Använd ett
fysiskt tangentbord och webbläsarens faktiska zoom vid 200 och 400 procent.

**Kräver mänsklig observation:** Läs hela omfattningen, bildversionerna och
slutförandets identitet vid faktisk zoom; nå bekräftelse, avbrytande och
återgång med det fysiska tangentbordet utan avklippt eller dolt fokus.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Fysisk tangentbordsåtkomst och läsbarhet vid faktisk webbläsarzoom 200 och 400 procent."
  },
  "reference": "Fysiskt tangentbord, faktisk zoom 200 och 400 procent; ny provdatabas per körning.",
  "outcomes": ["Omfattning, kontroller, identiteter och hela fokusringar förblir läsbara och nåbara."],
  "evidence": [{
    "kind": "overlap",
    "spec": "tests/integration/household-erasure.spec.ts",
    "caseId": "RADERING-06",
    "purpose": "Syntetiskt tangentbordsflöde; utför inte faktisk zoom eller fysisk input."
  }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ webbläsarens zoom till 200 procent. Utför RADERING-06 steg 1–7
   en gång med fysiska tangenter. Läs omfattning och resultat vid rätt steg.
2. Återställ provdatabasen, ställ zoom till 400 procent och utför samma
   hela procedur en gång. Återställ zoom och provmiljö efteråt.

**Förväntat resultat:**

- Ingen förstoring döljer fokus, information eller nödvändiga kontroller.
- Fysisk tangentbordsanvändning kan genomföra båda fullständiga körningarna.
