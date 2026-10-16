# Manuella testfall för kakor och lagring

Fallen omfattar den publika kakpolicyn, båda bannerlägena,
profilvägen tillbaka till kartan och formulärets lagringsval.
Anteckna commit, webbläsare, bredd och
godkänt eller underkänt resultat vid körning. Automatiska prov använder
den befintliga testinstallationen med syntetiska inloggningsleverantörer.
De bevisar inte skärmläsarens uppläsning eller fullständig WCAG-efterlevnad.

## Konfigurerade användare

- Besökare utan inloggning.
- Hushållets administratör med Google-inloggning och tillgång till en karta.
- En medlem med Microsoft-inloggning och tillgång till ett provhushåll.

## Allmän förberedelse

1. Förbered en separat lokal provmiljö enligt
   [utvecklingsguiden](../development/devcontainer.md).
2. Använd en ren webbläsarprofil för besökarfallen. För profilfallen
   loggar du in och skapar eller öppnar provhushållet. Använd inga verkliga
   personuppgifter och begär inget modell- eller röstanrop.
3. Prova varje angiven bredd utan förstoring först. Gör mänskliga
   tillgänglighetsobservationer separat enligt KAK-07.

## Publik information

### KAK-01: Besökare läser information utan att registrera ett val på dator

**Syfte:** Verifiera publik åtkomst utan kakval, direkt återbesök och bannern
vid återgång.

**Användare:** Besökare.

**Förutsättningar:** Ren webbläsarprofil, bredd 1280 pixlar.

**Automatiskt motsvarande test:**
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts) ,
KAK-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage.spec.ts",
    "caseId": "KAK-01"
  },
  "reference": "1280 pixlar, ren webbläsare. Faktiska kakor, Web Storage och skrivande nätverksanrop kontrolleras av integrationstestet.",
  "outcomes": [
    "Policyn kan läsas utan lagringsval och utan täckande banner",
    "Publik länk och direkt återbesök fungerar",
    "Sidans rubrik och inloggningsknapp får fokus vid rätt övergång"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna `/cookies` direkt utan inloggning. Kontrollera sidrubrikens fokus
   och att ingen banner täcker policyn.
2. Öppna **Visa nödvändig lagring** och läs namn, plats, innehåll och tider.
3. Öppna **Visa serverns lagringsposter**. Läs posterna för inloggning,
   resultatkontroll och installationens säkerhetsgeneration samt informationen
   om samtalets arbetsminne och transportkvittens.
4. Ladda om sidan. Välj **Till startsidan**. Kontrollera **Vi använder
   kakor**, tryck Escape och kontrollera fokus på **Endast nödvändiga**.

**Förväntat resultat:**

- Ingen inloggning eller lagringsbeslut behövs för att läsa policyn.
- Nödvändig lagring är alltid aktiv. Preferenskakor är ett separat
  tillstånd till lagring; ihågkommen inloggning kräver eget funktionsval.
- Registret skiljer kakor, lokal lagring och serverposter. Det visar
  faktiska namn, innehåll, ändamål, leverantör och tider.
- Serverinformationen skiljer automatisk gallring vid start och varje
  minut från verifierad drift och säkerhetskopior. Resultatkontrollens
  24 timmar räknas från ändringen. Transportkvittens bevisar inte att
  någon har läst, hört eller förstått svaret.
- Vid återgång visas bannern utan att ett val fabriceras. Innehållet ryms
  utan sidledsrullning. Licensen för förebilden går att läsa.

### KAK-02: Besökaren når samma information vid 390 pixlar

**Syfte:** Upptäcka hinder i mobilens publika flöde.

**Användare:** Besökare.

**Förutsättningar:** Ren profil, bredd 390 pixlar. Följ alla steg och
förväntade resultat i KAK-01.

**Automatiskt motsvarande test:**
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts) ,
KAK-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage.spec.ts",
    "caseId": "KAK-02"
  },
  "reference": "390 pixlar; samma publika handlingar och faktiska lagringskontroller som KAK-01.",
  "outcomes": [
    "Policyn kan läsas utan val och bannern visas vid återgång",
    "Publikt återbesök och fokus fungerar utan sidledsrullning"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

### KAK-03: Besökaren når samma information vid 320 pixlar

**Syfte:** Upptäcka hinder vid den smalaste stödda bredden.

**Användare:** Besökare.

**Förutsättningar:** Ren profil, bredd 320 pixlar. Följ alla steg och
förväntade resultat i KAK-01.

**Automatiskt motsvarande test:**
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts) ,
KAK-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage.spec.ts",
    "caseId": "KAK-03"
  },
  "reference": "320 pixlar; samma publika handlingar och faktiska lagringskontroller som KAK-01.",
  "outcomes": [
    "Policyn kan läsas utan val och bannern visas vid återgång",
    "Publikt återbesök och fokus fungerar utan sidledsrullning"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

## Profilvägen

### KAK-09: Medlemmen når informationen från sin profil

**Syfte:** Verifiera att sidan och återgången fungerar även för medlemmar.

**Användare:** Medlem med Microsoft-inloggning.

**Förutsättningar:** Bredd 390 pixlar, tillgång till ett provhushåll med
medlemsroll. Samma användare behåller rollen efter flödet.

**Automatiskt motsvarande test:**
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts) ,
KAK-09.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage.spec.ts",
    "caseId": "KAK-09"
  },
  "reference": "Medlem, Microsoft-inloggning och 390 pixlar.",
  "outcomes": [
    "Medlemmen öppnar informationssidan genom sin profil",
    "Återgången bevarar medlemsrollen och fokus i kartarbetet"
  ]
}
```
-->

**Steg:**

1. Fokusera **Prata med Skyttel** utan att starta samtalet. Öppna
   profilikonen och kontrollera att rollen visas som **Medlem**.
2. Välj **Kakor och lagring** och kontrollera sidrubrikens fokus.
3. Välj **Tillbaka till kartan** och kontrollera att fokus återgår till
   **Prata med Skyttel**. Öppna profilen igen och kontrollera rollen.

**Förväntat resultat:**

- Informationen är tillgänglig även för medlemmen och återgången
  bevarar fokus. Rollen är fortfarande **Medlem**.

### KAK-08: Profilen fungerar före hushållsstart och efter återkallad tillgång

**Syfte:** Verifiera att informationssidan inte kräver hushållsbehörighet.

**Användare:** Installationsansvarig före hushållsstart och en inloggad
Skyttel-användare vars hushållstillgång återkallas.

**Förutsättningar:** Använd en separat provinstallation utan hushåll för
den första delen. För andra delen behöver en annan administratör kunna
återkalla provanvändarens tillgång, enligt
[åtkomstfallen](access.md). Behåll alltid en annan administratör.

**Automatiskt motsvarande test:**
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts) ,
KAK-08.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage.spec.ts",
    "caseId": "KAK-08"
  },
  "reference": "Före hushållsstart och efter återkallad tillgång.",
  "outcomes": [
    "Profilen når informationssidan utan hushållsbehörighet",
    "Återgången öppnar rätt startsida och återställer ingen tillgång"
  ]
}
```
-->

**Steg:**

1. Logga in som installationens första administratör innan hushållet
   finns. Öppna **Din profil**, välj **Kakor och lagring** och därefter
   **Till startsidan**.
2. Öppna ett provhushåll, låt en annan administratör återkalla din
   tillgång och ladda om sidan. Öppna åter **Din profil**,
   **Kakor och lagring** och **Till startsidan**.

**Förväntat resultat:**

- Sidrubriken fokuseras när informationssidan öppnas i båda lägena.
- Första återgången visar **Skapa ditt hushåll**. Efter återkallelsen
  visas **Du har inte tillgång till hushållet**. Informationssidan
  återställer ingen hushållsbehörighet.

### KAK-04: Profilen öppnar sidan och återgår till kartan på dator

**Syfte:** Verifiera befintlig profilväg och fokusåtergång till arbetet.

**Användare:** Hushållets administratör.

**Förutsättningar:** Inloggad i provhushållets karta, bredd 1280 pixlar.

**Automatiskt motsvarande test:**
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts) ,
KAK-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage.spec.ts",
    "caseId": "KAK-04"
  },
  "reference": "1280 pixlar, verklig testinstallation och syntetisk Google-inloggning.",
  "outcomes": [
    "Profilens länk öppnar Kakor och lagring i inställningsramen",
    "Kartverktygen är dolda på informationssidan",
    "Tillbaka till kartan återför fokus till den tidigare använda kartkontrollen"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Fokusera **Prata med Skyttel** med tangentbordet utan att starta
   samtalet. Öppna sedan profilikonen i kartans verktygsfält och
   kontrollera **Din profil**.
2. Välj **Kakor och lagring** under **Ditt konto**.
3. Kontrollera att sidrubriken har fokus och kartverktygen är dolda.
4. Välj **Tillbaka till kartan**.

**Förväntat resultat:**

- Sidan använder appens inställningsram och ryms utan sidledsrullning.
- Du återgår till kartan med fokus på den tidigare använda kartkontrollen.

### KAK-05: Profilvägen och fokusåtergången fungerar vid 390 pixlar

**Syfte:** Upptäcka hinder i mobilens profilväg.

**Användare:** Hushållets administratör.

**Förutsättningar:** Bredd 390 pixlar. Följ alla steg och förväntade
resultat i KAK-04. Fäll ut kartverktygen om det behövs.

**Automatiskt motsvarande test:**
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts) ,
KAK-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage.spec.ts",
    "caseId": "KAK-05"
  },
  "reference": "390 pixlar, samma profilväg som KAK-04.",
  "outcomes": [
    "Profilvägen fungerar utan sidledsrullning",
    "Återgången återför fokus till den tidigare använda kartkontrollen"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

### KAK-06: Profilvägen och fokusåtergången fungerar vid 320 pixlar

**Syfte:** Upptäcka hinder i profilvägen vid den smalaste bredden.

**Användare:** Hushållets administratör.

**Förutsättningar:** Bredd 320 pixlar. Följ alla steg och förväntade
resultat i KAK-04. Fäll ut kartverktygen om det behövs.

**Automatiskt motsvarande test:**
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts) ,
KAK-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage.spec.ts",
    "caseId": "KAK-06"
  },
  "reference": "320 pixlar, samma profilväg som KAK-04.",
  "outcomes": [
    "Profilvägen fungerar utan sidledsrullning",
    "Återgången återför fokus till den tidigare använda kartkontrollen"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

### KAK-07: Skärmläsaren läser information, detaljer och fokus i rätt ordning

**Syfte:** Verifiera faktisk uppläsning i de fullständiga flödena.

**Användare:** Besökare och administratör.

**Förutsättningar:** Skärmläsare med tangentbord på dator samt mobil
skärmläsare. Prova 1280, 390 och 320 pixlar i ljust och mörkt tema.

**Kräver mänsklig observation:** Lyssna på skärmläsarens uppläsning av
rubriker, länkar, stängningsknapp och utvecklingsbara lagringsdetaljer.
Lyssna även på formulärval, navigationsskydd, återställningsdialog och
sparbesked. Den här mänskliga kontrollen är ännu inte utförd.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Lyssna på namn, läsordning, öppnade detaljer och fokus efter stängning, sidbyte och återgång till kartan med verklig skärmläsare."
  },
  "reference": "Fullständiga KAK-01–KAK-06 och KAK-10–KAK-16 med skärmläsare, tangentbord, båda teman och 1280/390/320 pixlar. Mänskligt prov återstår.",
  "outcomes": [
    "Läsordning och namn förklarar handlingarna",
    "Sidfokus och återgång annonseras begripligt",
    "Varje nytt status- eller felbesked läses en gång utan fokusförlust"
  ],
  "evidence": [
    {
      "kind": "overlap",
      "runner": "playwright",
      "suite": "integration",
      "spec": "tests/integration/cookie-storage.spec.ts",
      "caseId": "KAK-01",
      "purpose": "Automatiskt stöd för publika sidbyten och DOM-fokus"
    },
    {
      "kind": "overlap",
      "runner": "playwright",
      "suite": "integration",
      "spec": "tests/integration/cookie-storage.spec.ts",
      "caseId": "KAK-06",
      "purpose": "Automatiskt stöd för profilväg och fokus vid 320 pixlar"
    },
    {
      "kind": "overlap",
      "runner": "playwright",
      "suite": "integration",
      "spec": "tests/integration/cookie-storage-form.spec.ts",
      "caseId": "KAK-13",
      "purpose": "Tangentbord, navigationsskydd, dialog och fokuserad återkomst vid 320 pixlar; ingen fysisk uppläsning"
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ KAK-01–KAK-06 och KAK-10–KAK-16 med skärmläsaren och enbart
   tangentbord där det stöds.
2. Lyssna på rubriker och kontroller. Öppna och stäng lagringsdetaljerna.
3. Kontrollera synligt fokus, läsordning, pekmål, kontrast och omflöde
   även med förstoring. Anteckna hinder separat från automatiska resultat.
4. Lyssna på sparande, avvisning och okänd sparstatus. Kontrollera att
   samma besked läses en gång och att fokus ligger kvar på åtgärden.

**Förväntat resultat:**

- Information och kontroller går att förstå och använda utan visuell
  navigering. Fokus försvinner inte vid stängning eller sidbyte.
- Detaljernas öppna eller stängda läge förmedlas begripligt.

## Formulärets lagringsval

### KAK-10: Snabbval föregår uttryckligt sparande på dator

**Syfte:** Skilja formulärändringar från serverns bekräftade val.

**Användare:** Hushållets administratör.

**Förutsättningar:** Bredd 1280 pixlar. Logga in med ett aktivt
**Kom ihåg mig i Skyttel**-val efter inloggning och öppna **Kakor och lagring**.

**Automatiskt motsvarande test:**
[cookie-storage-form.spec.ts](../../tests/integration/cookie-storage-form.spec.ts),
KAK-10. Testet använder verklig HTTP och syntetisk inloggningsleverantör.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage-form.spec.ts",
    "caseId": "KAK-10"
  },
  "reference": "1280 pixlar. Verkligt sparande via HTTP; syntetisk Google-inloggning. Ingen fysisk webbläsaromstart eller skärmläsaruppläsning ingår.",
  "outcomes": [
    "Snabbval ändrar bara formuläret",
    "Sparknappen bekräftar avstängning och fortsatt inloggning separat",
    "Fokus ligger kvar på sparknappen"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Fokusera **Stäng av ihågkommen inloggning** och tryck Enter.
2. Kontrollera att reglaget är av och att **Osparad ändring.** visas.
3. Välj **Spara Preferenser** längst ned.

**Förväntat resultat:**

- Snabbvalet skickar inget sparande.
- Efter sparande visas **Ihågkommen inloggning är avstängd.** och,
  efter separat kontroll, **Du är fortfarande inloggad.**
- Sparknappen behåller fokus. Ny uttrycklig aktivering är tillgänglig med
  samtycke till Preferenskakor.

### KAK-11: Navigation och bekräftad återställning bevarar annat arbete

**Syfte:** Skydda osparade lagringsval och begränsa återställningen.

**Användare:** Hushållets administratör.

**Förutsättningar:** Bredd 1280 pixlar, aktiv ihågkommen inloggning,
sparat kontotema, personlig vy och samtalsmedgivande. En annan webbläsare
har en egen giltig inloggning för samma användare.

**Separat förberedelse:** Använd en isolerad provmiljö. Förbered
återhämtningsuppgifter enligt fallen för
[återimport](household-import.md) och [permanent radering](household-erasure.md)
om dessa förlopp ska följas efteråt. Automation placerar syntetiska
återhämtningsreferenser i fliken och kontrollerar att de bevaras; den
genomför ingen import eller radering i detta fall.

**Automatiskt motsvarande test:**
[cookie-storage-form.spec.ts](../../tests/integration/cookie-storage-form.spec.ts),
KAK-11. Verklig HTTP används för lagringsval och bevarade serveruppgifter.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage-form.spec.ts",
    "caseId": "KAK-11"
  },
  "reference": "1280 pixlar, mörkt tema. Syntetisk Google-inloggning och återhämtningsreferenser; verklig HTTP för inställningar och avstängning. Separat skärmläsarprov krävs.",
  "outcomes": [
    "Profil, inställningslänk och Tillbaka till kartan skyddar osparade val",
    "Fortsatt redigering återger fokus och behåller valet",
    "Dialogens avbryt ändrar ingenting och återger fokus",
    "Bekräftad återställning använder samma säkra avstängning",
    "Återhämtningsreferenser, tema, personlig vy, karta, medgivande och andra bindningar bevaras"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Kakor och lagring**. Öppna och stäng **Visa nödvändig lagring**
   med Enter. Välj snabbåtgärden för avstängning. Kontrollera att reglaget
   är av och att fokus stannar på snabbåtgärden.
2. Försök lämna sidan via **Din profil**, **Inloggningssätt** och
   **Tillbaka till kartan**. Avbryt varje gång med Escape. Öppna
   **Välj inställning** först om navigationen är hopfälld.
3. Försök återgå till kartan igen och välj
   **Kasta ändringarna och fortsätt**. Öppna lagringssidan igen.
4. Välj **Återställ samtycke**. Läs omfattning och bevarade uppgifter.
   Flytta fokus med Tab och Skift+Tab och avbryt med Escape.
5. Öppna återställningen igen och välj **Återställ**. Kontrollera beskedet
   vid snabbåtgärderna. Fokusera den spärrade **Spara Preferenser** och
   tryck Enter; beskedet ska stanna vid återställningen.
6. Kontrollera kontotema, personlig vy, hushållets information,
   samtalsmedgivande och den andra webbläsarens inloggning.
   Följ vid behov samma återhämtningsförsök från förberedelsen.

**Förväntat resultat:**

- Avbruten navigation behåller formulärvärdet och återger fokus till
  vald länk. Kasta ändringarna ändrar inte servervalet.
- Återställningsdialogen fokuserar **Avbryt**, håller tangentbordsfokus
  inom dialogen och återger det till **Återställ samtycke**.
- Endast bekräftad återställning begär serverändringen. Avstängning och
  fortsatt inloggning får separata besked vid formulärets åtgärder.
- Förberedda inställningar, uppgifter och återhämtningsreferenser finns
  kvar. Den andra webbläsaren påverkas inte.

### KAK-12: Hela formulärflödet fungerar vid 390 pixlar

**Syfte:** Samma skyddade förlopp som KAK-11 på en smal skärm.

**Användare och förutsättningar:** Följ KAK-11 med bredd 390 pixlar.
Öppna **Välj inställning** för profilen och inställningslänkarna.

**Automatiskt motsvarande test:**
[cookie-storage-form.spec.ts](../../tests/integration/cookie-storage-form.spec.ts),
KAK-12. Samma verkliga HTTP och syntetiska förberedelse som KAK-11.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage-form.spec.ts",
    "caseId": "KAK-12"
  },
  "reference": "390 pixlar, mörkt tema; hela KAK-11 med tangentbord och verklig HTTP. Återhämtningsreferenserna är syntetiska.",
  "outcomes": ["Snabbval behåller fokus", "Navigation skyddar osparade värden", "Bekräftad återställning bevarar övrigt arbete och återger fokus", "Ingen horisontell sidrullning"]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:** Följ samtliga steg i KAK-11 med tangentbord.

**Förväntat resultat:** Samma utfall som KAK-11. Alla kontroller och
besked är läsbara utan horisontell sidrullning.

### KAK-14: Avvisad återställning behåller ett osparat val

**Syfte:** Skilja återställningens serverutfall från ett förlorat svar.

**Användare:** Hushållets administratör.

**Förutsättningar:** Bredd 320 pixlar, aktiv ihågkommen inloggning.
Bevara flikens återhämtningsuppgifter för osäker import och permanent
radering enligt förberedelsen i KAK-11.

**Separat förberedelse:** Förbered avvisat avstängningsanrop enligt
[ACCESS-30](access.md#access-30-avvisat-sparande-behåller-det-osparade-valet).
Det ersätter nästa avstängningsanrop före servern. Återställ ersättningen efter
fallet genom omladdning.

**Automatiskt motsvarande test:**
[cookie-storage-form.spec.ts](../../tests/integration/cookie-storage-form.spec.ts),
KAK-14. Felstyrningen ersätter eller stoppar endast det angivna anropet.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage-form.spec.ts",
    "caseId": "KAK-14"
  },
  "reference": "320 pixlar, syntetisk Google-inloggning. Kontrollerat avslag före avstängningens serverändring; import- och raderingsreferenser bevaras.",
  "outcomes": ["Avslag behåller AV som osparat och servervalet på", "Fokus återgår till återställningsknappen", "Återhämtningsreferenser bevaras", "Ingen automatisk upprepning av sparandet"]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Kakor och lagring**, välj **Återställ samtycke** och
   bekräfta med **Återställ**.
2. Vänta på utfallet. Välj **Avbryt** i dialogen.
   Läs beskedet vid snabbåtgärderna och kontrollera fokus.
3. Kontrollera att flikens återhämtningsuppgifter finns kvar.

**Förväntat resultat:**

**Ändringen kunde inte sparas. Försök igen.** visas vid snabbåtgärden. Begärt AV
ligger kvar som osparat och servervalet är på. Inget nytt sparande skickas
automatiskt.

Fokus återgår till **Återställ samtycke** när dialogen stängs.
Återhämtningsuppgifterna bevaras och inget nytt sparande skickas automatiskt.

### KAK-15: Förlorat återställningssvar ger okänd status utan nytt sparande

**Syfte:** Skilja återställningens serverutfall från ett förlorat svar.

**Användare:** Hushållets administratör.

**Förutsättningar:** Bredd 320 pixlar, aktiv ihågkommen inloggning.
Bevara flikens återhämtningsuppgifter för osäker import och permanent
radering enligt förberedelsen i KAK-11.

**Separat förberedelse:** Förbered svarsförlust efter serverändringen enligt
[ACCESS-31](access.md#access-31-förlorat-svar-ger-okänd-sparstatus). Vanligt
offlineläge bevisar inte denna svarsförlust. Ladda om efter fallet för att ta
bort felstyrningen.

**Automatiskt motsvarande test:**
[cookie-storage-form.spec.ts](../../tests/integration/cookie-storage-form.spec.ts),
KAK-15. Felstyrningen ersätter eller stoppar endast det angivna anropet.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage-form.spec.ts",
    "caseId": "KAK-15"
  },
  "reference": "320 pixlar, syntetisk Google-inloggning. Svaret stoppas efter verklig serverändring för att pröva okänd status; import- och raderingsreferenser bevaras.",
  "outcomes": ["Förlorat svar ger okänd status och erbjuder Kontrollera igen", "Spärrade spara och återställ skickar ingen ny ändring", "Fokus återgår till återställningsknappen", "Återhämtningsreferenser bevaras"]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Kakor och lagring**, välj **Återställ samtycke** och
   bekräfta med **Återställ**.
2. Vänta på utfallet. Välj **Lämna med okänt utfall** i dialogen.
   Läs beskedet vid snabbåtgärderna och kontrollera fokus.
3. Kontrollera att flikens återhämtningsuppgifter finns kvar.

**Förväntat resultat:**

**Sparstatus okänd. Vi kunde inte bekräfta om ändringen genomfördes.** visas som
larm vid snabbåtgärden. Sidan påstår inte att servervalet är oförändrat.
**Kontrollera igen** erbjuds. Nytt sparande och återställning är
spärrade; tangentbordsaktivering skickar inget nytt sparande.

Fokus återgår till **Återställ samtycke** när dialogen stängs.
Återhämtningsuppgifterna bevaras och inget nytt sparande skickas automatiskt.

### KAK-16: Bekräftad återställning består när fortsatt inloggning inte kan bekräftas

**Syfte:** Skilja återställningens serverutfall från ett förlorat svar.

**Användare:** Hushållets administratör.

**Förutsättningar:** Bredd 320 pixlar, aktiv ihågkommen inloggning.
Bevara flikens återhämtningsuppgifter för osäker import och permanent
radering enligt förberedelsen i KAK-11.

**Separat förberedelse:** Kör följande i webbläsarens konsol på den isolerade
testadressen efter inloggning och innan återställningen. Det stoppar endast
nästa registreringskontroll efter serverns avstängning. Ladda om efter fallet
för att ta bort ersättningen.

```js
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  if (String(args[0]) === '/api/browser-binding/register') {
    window.fetch = originalFetch;
    throw new TypeError('Synthetic confirmation loss');
  }
  return originalFetch(...args);
};
```

**Automatiskt motsvarande test:**
[cookie-storage-form.spec.ts](../../tests/integration/cookie-storage-form.spec.ts),
KAK-16. Felstyrningen ersätter eller stoppar endast det angivna anropet.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage-form.spec.ts",
    "caseId": "KAK-16"
  },
  "reference": "320 pixlar, syntetisk Google-inloggning. Registreringskontrollen stoppas efter verklig avstängning för att skilja känt resultat från fortsatt inloggning; import- och raderingsreferenser bevaras.",
  "outcomes": ["Bekräftad avstängning består när fortsatt inloggning inte kan bekräftas", "Logga in igen erbjuds utan felaktigt avslag eller okänd status", "Fokus återgår till återställningsknappen", "Återhämtningsreferenser bevaras", "Ingen automatisk upprepning av sparandet"]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Kakor och lagring**, välj **Återställ samtycke** och
   bekräfta med **Återställ**.
2. Kontrollera besked och fokus. Följ den erbjudna åtgärden enligt
   förväntat resultat.
3. Kontrollera att flikens återhämtningsuppgifter finns kvar.

**Förväntat resultat:**

**Ihågkommen inloggning är avstängd. Logga in igen för att fortsätta.** visas
som status vid snabbåtgärden. Länken **Logga in igen** visas. Avstängningen
förvandlas inte till okänd status eller avvisat sparande.

Fokus återgår till **Återställ samtycke** när dialogen stängs.
Återhämtningsuppgifterna bevaras och inget nytt sparande skickas automatiskt.

### KAK-13: Hela formulärflödet fungerar vid 320 pixlar

**Syfte:** Samma skyddade förlopp som KAK-11 på en smal skärm.

**Användare och förutsättningar:** Följ KAK-11 med bredd 320 pixlar.
Öppna **Välj inställning** för profilen och inställningslänkarna.

**Automatiskt motsvarande test:**
[cookie-storage-form.spec.ts](../../tests/integration/cookie-storage-form.spec.ts),
KAK-13. Samma verkliga HTTP och syntetiska förberedelse som KAK-11.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/cookie-storage-form.spec.ts",
    "caseId": "KAK-13"
  },
  "reference": "320 pixlar, mörkt tema; hela KAK-11 med tangentbord och verklig HTTP. Återhämtningsreferenserna är syntetiska.",
  "outcomes": ["Snabbval behåller fokus", "Navigation skyddar osparade värden", "Bekräftad återställning bevarar övrigt arbete och återger fokus", "Ingen horisontell sidrullning"]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:** Följ samtliga steg i KAK-11 med tangentbord.

**Förväntat resultat:** Samma utfall som KAK-11. Alla kontroller och
besked är läsbara utan horisontell sidrullning.

## Kontrollera en okänd ändring

### KAK-20: Kontrollera samma avstängning efter omstart och ny inloggning

**Syfte:** Återläsa ett verkligt genomfört sparande utan att upprepa det
eller ändra ett nytt aktivt val.

**Användare:** Alex med Google i den isolerade HTTPS-installationen.

**Förutsättningar:** Följ förberedelsen för
[ACCESS-31](access.md#access-31-förlorat-svar-ger-okänd-sparstatus).
Använd dess kontrollerade svarsförlust efter serverns ändring. Du behöver
kunna starta om samma isolerade server med databasen bevarad. Inga
verkliga leverantörer eller hushåll behövs.

**Automatiskt motsvarande test:**
[storage-result-recovery.spec.ts](../../tests/integration/storage-result-recovery.spec.ts),
KAK-20. Verklig HTTPS, SQLite, serveromstart och kakor med syntetisk
inloggningsleverantör. Svaret förloras efter faktisk commit.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-result-recovery.spec.ts",
    "caseId": "KAK-20"
  },
  "reference": "HTTPS och förlorat svar efter verklig avstängning; samma flik, serveromstart och ny uttryckligen ihågkommen Google-inloggning.",
  "outcomes": [
    "Sparstatus okänd återläses som samma genomförda avstängning utan nytt sparande.",
    "Resultatet kräver ny autentisering och överlever serveromstart.",
    "Det nya aktiva valet behålls och fokus stannar på Kontrollera igen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Genomför ACCESS-31 till **Sparstatus okänd**. Välj **Kontrollera igen**.
   Kontrollera uppmaningen att logga in igen.
2. Starta om den isolerade servern med samma databas. Behåll fliken och
   dess lagring. Öppna `/login`; bekräfta att lämna sidan om webbläsaren
   frågar. Öppna en andra flik i samma webbläsare, logga in som Alex
   och välj uttryckligen **Kom ihåg mig i Skyttel** där. Behåll den
   ursprungliga fliken med åtgärdsreferensen.
3. Återgå till `/cookies`. Kontrollera att det tidigare utfallet
   fortfarande visas som okänt och välj **Kontrollera igen**.
4. Läs beskedet, det aktuella reglaget och tangentbordsfokus.

**Förväntat resultat:**

- **Ihågkommen inloggning är avstängd. Resultatet gäller din tidigare
  begäran. Du har loggat in på nytt.** skiljer den gamla åtgärden från
  den aktuella inloggningen.
- Den nya inloggningens uttryckliga val visas som på. Kontrollen ändrar
  inte det nya valet och upprepar inte avstängningen.
- Fokus ligger kvar på **Kontrollera igen**. Åtgärdens lokala referens
  tas bort när det gamla utfallet är känt.

Fysisk webbläsaromstart och faktisk skärmläsaruppläsning är separata,
ännu inte utförda observationer; serveromstart bevisar inte dessa.

### KAK-21: Nekat återhämtningsminne stoppar ändringen före sparande

**Syfte:** Inte skicka en ändring som fliken redan vet att den inte kan
identifiera efter ett förlorat svar.

**Användare och förutsättningar:** Alex med aktiv ihågkommen inloggning
i samma isolerade HTTPS-installation som KAK-20.

**Separat förberedelse:** Öppna `/cookies` och kör följande i konsolen.
Det nekar bara nästa lagringsoperations referens och lämnar övriga
återhämtningsuppgifter orörda. Det är en kontrollerad felgräns, inte
verifiering av webbläsarens faktiska lagringspolicy. Ladda om efter fallet.

```js
const originalSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function (key, value) {
  if (key.startsWith('skyttel-storage-operation:')) {
    throw new DOMException('Synthetic storage denial', 'SecurityError');
  }
  originalSetItem.call(this, key, value);
};
```

**Automatiskt motsvarande test:**
[storage-result-recovery.spec.ts](../../tests/integration/storage-result-recovery.spec.ts),
KAK-21. Den verkliga servern behåller valet på; inget avstängningsanrop
skickas och redan befintliga import- och raderingsreferenser bevaras.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-result-recovery.spec.ts",
    "caseId": "KAK-21"
  },
  "reference": "HTTPS med kontrollerat nekat skrivande av just lagringsoperationens referens. Befintliga import- och raderingsreferenser ska bevaras.",
  "outcomes": [
    "Ingen ändring skickas när referensen inte kan sparas.",
    "Begärt AV ligger kvar, serverns aktuella val är på och fokus stannar på sparknappen.",
    "Andra återhämtningsreferenser bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Stäng av reglaget och välj **Spara Preferenser**.
2. Läs hindret, kontrollera begärt val och tangentbordsfokus.

**Förväntat resultat:** **Flikens återhämtningsuppgifter kunde inte sparas.
Ingen ändring har skickats.** visas med råd att kontrollera
lagringsinställningarna. Sparknappen behåller fokus, begärt AV ligger
kvar och sidan ger ingen falsk bekräftelse eller okänd serverändring.

### KAK-22: Skadad referens ger fortsatt okänt utfall

**Syfte:** Ett skadat lokalt underlag ska varken skapa ett resultat
eller upprepa en tidigare ändring.

**Användare och förutsättningar:** Genomför ACCESS-31 som Alex tills
**Sparstatus okänd** visas i den isolerade HTTPS-installationen.

**Separat förberedelse:** Kör följande i konsolen i samma flik.
Använd en ny isolerad installation efter fallet.

```js
const key = Object.keys(sessionStorage).find((name) =>
  name.startsWith('skyttel-storage-operation:')
);
if (!key) throw new Error('Expected operation recovery reference');
sessionStorage.setItem(key, 'damaged reference');
```

**Automatiskt motsvarande test:**
[storage-result-recovery.spec.ts](../../tests/integration/storage-result-recovery.spec.ts),
KAK-22. Verklig serverändring och avbruten svarsleverans, följt av
kontrollerat skadad flikreferens och en ny vanlig inloggning.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-result-recovery.spec.ts",
    "caseId": "KAK-22"
  },
  "reference": "Skadad referens efter förlorat svar från genomförd avstängning; samma flik och ny vanlig Google-inloggning.",
  "outcomes": [
    "Skadad referens ger fortsatt okänt utfall.",
    "Kontrollera igen gissar inget resultat och skickar inget sparande.",
    "Nytt sparande är spärrat medan det tidigare utfallet är okänt."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna `/login` i samma flik och bekräfta att lämna sidan om du får
   frågan. Logga in som Alex utan **Kom ihåg mig**.
2. Öppna `/cookies` och välj **Kontrollera igen**.

**Förväntat resultat:** **Åtgärdens referens saknas eller är skadad.
Utfallet är fortfarande okänt.** ligger kvar. Sidan påstår inget om
det gamla utfallet, och **Spara Preferenser** skickar inget nytt anrop.

### KAK-23: Förlorad referens ger ingen påhittad tidigare bekräftelse

**Syfte:** Skilja ett nytt aktuellt val från ett tidigare resultat som
fliken inte längre kan identifiera.

**Användare och förutsättningar:** Samma som KAK-22.

**Separat förberedelse:** Använd KAK-22:s konsolkommando men ersätt sista
raden med `sessionStorage.removeItem(key);`. Det tar bort just den
begärda åtgärdens referens, inte annan återhämtningsinformation.

**Automatiskt motsvarande test:**
[storage-result-recovery.spec.ts](../../tests/integration/storage-result-recovery.spec.ts),
KAK-23. Samma verkliga serverändring och svarsavbrott som KAK-22, med
fullständigt borttagen referens.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-result-recovery.spec.ts",
    "caseId": "KAK-23"
  },
  "reference": "Förlorad lokal åtgärdsreferens efter svarsförlust; ny vanlig inloggning i samma flik.",
  "outcomes": [
    "Den nya inloggningens aktuella val visas utan falsk bekräftelse av det gamla utfallet.",
    "Ingen gissad resultatkontroll eller upprepning av avstängningen sker."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Logga in på nytt som Alex i samma flik utan **Kom ihåg mig**.
2. Öppna `/cookies` och läs det aktuella valet och sidans besked.

**Förväntat resultat:** Den aktuella vanliga inloggningens val visas som
av. Sidan visar ingen bekräftelse av den gamla ändringen, hittar inte på
en referens och upprepar inte avstängningen. Det gamla utfallet kan inte
identifieras med det förlorade underlaget.

### KAK-24: Utgånget resultat lämnar sparstatus okänd

**Syfte:** Saknat resultat efter kontrollfönstret är inget bevis för
framgång, avvisning eller återställning.

**Användare och förutsättningar:** Genomför ACCESS-31 som Alex i den
isolerade HTTPS-installationen. Behåll fliken och dess referens.

**Separat förberedelse:** Logga in på nytt som Alex utan **Kom ihåg mig**.
Skriv sedan `advance-day` i den kontrollerade installationens terminal
enligt [klockförberedelsen](access.md#kontrollerad-identitetsinstallation).
Det flyttar bara testserverns klocka ett dygn. Avsluta med `quit` efter
fallet. Automationen provar exakt 24 timmar; den manuella klockan går
också framåt under dina handlingar och visar ett utgånget resultat.

**Automatiskt motsvarande test:**
[storage-result-recovery.spec.ts](../../tests/integration/storage-result-recovery.spec.ts),
KAK-24. Filens tekniska ägarprov visar dessutom strax före, exakt vid
och efter kontrollfönstrets slut efter omstart.
Det stödjande serverprovet nedan kontrollerar faktisk borttagning utan
användartrafik samt bevarade ursprungliga frister vid upprepad gallring
och omstart av applikationens livscykel. Det bevisar inte radering av
säkerhetskopior eller produktionens faktiska drift.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-result-recovery.spec.ts",
    "caseId": "KAK-24"
  },
  "reference": "Utgånget resultat efter verklig avstängning med svarsförlust. Delad serverklocka styr exakt 24 timmar i automationen.",
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/authentication-cleanup.test.ts",
      "title": "session expiry and the action result window keep their original anchors across restart and repeated cleanup",
      "purpose": "Faktisk SQLite-gallring vid ursprungliga frister utan användaranrop och utan förnyelse vid omstart eller upprepning."
    }
  ],
  "outcomes": [
    "Utgånget resultat lämnar sparstatus okänd.",
    "Resultatkontrollen och försök att aktivera spärrat sparande skickar inget nytt sparande.",
    "Saknat resultat påstås inte bevisa återställning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Logga in som Alex igen utan **Kom ihåg mig** och öppna `/cookies`.
2. Välj **Kontrollera igen**. Läs beskedet och kontrollera fokus.
3. Fokusera **Spara Preferenser** med tangentbordet och tryck Retur.

**Förväntat resultat:** **Resultatet kan inte hämtas. Det kan saknas eller
ha passerat kontrollfönstret på 24 timmar. Utfallet är fortfarande
okänt.** visas utan framgångs- eller återställningsbesked. Fokus stannar
på **Kontrollera igen** efter kontrollen. Spärrat sparande skickar ingen
ändring.

### KAK-25: Skärmläsaren skiljer okänt utfall från bekräftad äldre ändring

**Syfte:** Kontrollera faktisk uppläsning och fokus genom återhämtningen.

**Användare:** Alex med tangentbord och stödd skärmläsare.

**Förutsättningar:** Samma isolerade förberedelser som KAK-20 till KAK-24.
Prova vid 1280, 390 och 320 pixlar i ljust och mörkt tema. Anteckna
webbläsare, skärmläsare, versioner och faktiskt hörda besked.

**Kräver mänsklig observation:** Lyssna på verklig uppläsning av
**Sparar…**, **Sparstatus okänd**, **Kontrollerar samma åtgärd…**, sparat
resultat och hinder. Kontrollera att varje besked läses en gång och att
fokus ligger kvar på den kontroll som används. Automatiska tester visar
synlig text och DOM-fokus men fastställer inte faktisk uppläsning.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Lyssna på status, okänt utfall, kontroll och äldre sparat resultat en gång per besked utan fokusflytt från använd kontroll."
  },
  "reference": "KAK-20 till KAK-24 med faktisk skärmläsare och tangentbord, båda teman samt 1280/390/320 pixlar.",
  "outcomes": [
    "Okänt utfall, pågående kontroll och bekräftat resultat läses begripligt en gång.",
    "Beskeden om en äldre ändring och en ny inloggning kan skiljas åt.",
    "Fokus stannar på använd kontroll och kvarliggande besked kan läsas igen."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "runner": "playwright",
      "suite": "integration",
      "spec": "tests/integration/storage-result-recovery.spec.ts",
      "caseId": "KAK-20",
      "purpose": "Visar korrekt synlig text och fokus efter bekräftat tidigare resultat, utan faktisk skärmläsaruppläsning."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ KAK-20 och lyssna på varje besked under sparande, svarsförlust,
   kontroll, ny inloggning och bekräftelse.
2. Följ KAK-21, KAK-22 och KAK-24 och lyssna på hindren. Navigera vidare
   med tangentbordet och återvänd till beskedet utan att starta en ändring.

**Förväntat resultat:** Beskeden förmedlas en gång med rätt betydelse.
Fokus flyttas inte av statusuppdateringen. Begärt val, aktuell inloggning
och äldre åtgärdsresultat kan förstås separat. Anteckna återstående hinder;
fallet är inte utfört enbart för att automatiken är grön.

## Kontrollerad databasåterställning

Förbered enbart påhittade uppgifter i den isolerade HTTPS-installationen:

```sh
npm run build
npm run test:env -- node --import tsx scripts/manual-access.ts --https
```

Använd den utskrivna adressen i samma flik. Logga in som Alex med
**Kom ihåg mig**. Kommandot `save-copy` tar en faktisk SQLite-testkopia.
`lose-storage-reply` ger ett avbrutet resultat efter verkligt genomförd
avstängning; `allow-storage-reply` återställer svaren. `restore-copy`
stoppar installationen, återställer filen och tillför en separat ny
testgeneration och fast återställningsdeklaration. Den isolerade kopian
innehåller inga verkliga raderingar. Verktyget verifierar inte driftens
kopior, leverantörsåtkomst eller fysisk radering.

### KAK-30: Nytt uttryckligt val efter belagd återställning

**Syfte:** Ett saknat resultat efter bekräftad återställning tillåter ett
nytt val utan att ett tidigare sparande påstås vara genomfört.

**Användare:** Alex i samma flik, bredd 390 pixlar.

**Förutsättningar:** Ta `save-copy` före avstängningen. Aktivera
`lose-storage-reply`. Stäng av ihågkommen inloggning på `/cookies` och
välj **Spara Preferenser**. Vänta på **Sparstatus okänd**. Kör sedan
`restore-copy` och `allow-storage-reply`. Behåll flikens återhämtningsreferens.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/database-restore.spec.ts",
    "caseId": "KAK-30"
  },
  "reference": "390 pixlar och isolerad HTTPS-installation med faktisk äldre SQLite-kopia, syntetisk provider och tappat svar efter verkligt genomförd avstängning. Extern kopiehantering och skärmläsaruppläsning återstår.",
  "outcomes": [
    "Det exakta återställningsbeskedet visas utan historisk sparbekräftelse.",
    "Ny inloggning kräver ett separat uttryckligt val av ihågkommen inloggning.",
    "Kontrollera igen använder återställningsundantaget utan automatiskt nytt sparande.",
    "Ett nytt uttryckligt sparande fungerar och fokus bevaras efter kontroll."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna `/login` och läs återställningsbeskedet.
2. Välj **Fortsätt med Google** och fortsätt till Google. Om den gamla
   webbläsarkopplingen hindrar
   starten väljer du uttryckligen **Börja om i den här webbläsaren**.
   Välj därefter Google på nytt.
3. Slutför en ny inloggning i en andra flik i samma webbläsare. Välj
   **Kom ihåg mig i Skyttel** uttryckligen i erbjudandet efter inloggningen.
4. Öppna `/cookies` och välj **Kontrollera igen**. Läs beskedet och
   kontrollera att fokus ligger kvar på knappen.
5. Stäng av det nya valet och välj **Spara Preferenser** uttryckligen.

**Förväntat resultat:** **Skyttel har återställts från en säkerhetskopia.
Gamla inloggningar kan inte längre användas. Logga in igen för att
fortsätta.** visas. Den gamla åtgärden får ingen sparbekräftelse och
upprepas inte. Det nya inloggningsvalet visas separat och det sista
uttryckliga sparandet får en egen bekräftelse. Ingen sidledsrullning
uppstår. Faktisk skärmläsaruppläsning måste verifieras separat.

### KAK-31: Kvarvarande resultat används efter återställning

**Syfte:** En riktig återställning får inte ersätta ett tillförlitligt
befintligt resultat med ett undantag eller en ny kontrollfrist.

**Användare:** Alex med tangentbord, bredd 1280 pixlar.

**Förutsättningar:** Starta samma isolerade HTTPS-installation. Tillåt
Preferenskakor och logga in. Välj sedan
**Kom ihåg mig i Skyttel**, kör `lose-storage-reply` och stäng av valet genom
**Spara Preferenser**. Efter **Sparstatus okänd** kör du `save-copy`.
Kopian innehåller därmed det verkliga resultatet. Kör `restore-copy` och
`allow-storage-reply`. Behåll samma flik.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/database-restore.spec.ts",
    "caseId": "KAK-31"
  },
  "reference": "1280 pixlar, faktisk SQLite-kopia efter avstängning med förlorat svar, syntetisk provider och omstart. Automatiken kontrollerar också ursprunglig beslutstid och 24-timmarsfrist genom den ägarbehöriga resultatläsningen.",
  "outcomes": [
    "Tillförlitligt kvarvarande resultat visas som resultatet av den tidigare begäran.",
    "Ett nytt aktivt ihågkommet val bevaras separat och inget sparande upprepas.",
    "Fokus stannar på Kontrollera igen och den ursprungliga kontrollfristen förlängs inte vid återställning eller omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna `/login`. Försök logga in och välj vid behov uttryckligen
   **Börja om i den här webbläsaren** när den gamla kopplingen avvisas.
2. Öppna en andra flik i samma webbläsare. Logga in på nytt med Google
   och välj **Kom ihåg mig i Skyttel** efter den bekräftade inloggningen.
3. Öppna `/cookies` och välj **Kontrollera igen**. Läs beskedet utan att
   starta något nytt sparande.
4. Kontrollera att det nya ihågkomna valet fortfarande är på och att
   fokus ligger kvar på **Kontrollera igen**. Kör `restart` och ladda om.

**Förväntat resultat:** **Ihågkommen inloggning är avstängd. Resultatet
gäller din tidigare begäran. Du har loggat in på nytt.** visas vid
kontrollen. Det gäller den gamla begäran och ändrar inte det nya aktiva
valet. Återställningen används inte som ersättning för ett tillförlitligt
resultat. Omstart upprepar inte sparandet. Resultatets ursprungliga
24-timmarsfrist består.

## Banner, separat samtycke och aktivering

Automationen använder riktiga HTTP-anrop och SQLite med syntetiska
leverantörer. Skärmläsaruppläsning och fysisk webbläsaromstart ingår inte;
redovisa dem separat enligt KAK-07 och KAK-25.

### KAK-32: Två bannerlägen på dator i ljust tema

**Syfte:** Bannern visas även på den inloggade kartan. Nödvändig lagring är
alltid aktiv och kan inte väljas bort.

**Användare:** Alex i den isolerade provinstallationen.

**Förutsättningar och separat förberedelse:** Logga in i en isolerad
installation med syntetisk leverantör. Skapa hushållet. Ta bort endast
lagringssamtycket i provwebbläsaren före besöket.

**Automatiskt motsvarande test:**
[storage-consent.spec.ts](../../tests/integration/storage-consent.spec.ts),
KAK-32.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-consent.spec.ts",
    "caseId": "KAK-32"
  },
  "reference": "1280 pixlar, ljust tema",
  "outcomes": [
    "Bannern visas även på den inloggade kartan. Nödvändig lagring är alltid aktiv och kan inte väljas bort.",
    "Escape sparar inte och påbörjade val bevaras mellan bannerlägen.",
    "Ett sparat lagringssamtycke stänger bannern utan separat sparbekräftelse, men aktiverar inte ihågkommen inloggning eller ett förslag under pågående inloggning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna startsidan med kartan. Kontrollera Vi använder kakor. Tryck Escape och
   kontrollera fokus på Endast nödvändiga.
2. Välj Läs mer. Tryck Tab, Enter och Tab. Kontrollera att nödvändiga
   lagringsuppgifter öppnas som separata poster med namn, ändamål,
   varaktighet och leverantör och att fokus sedan når Preferenskakor.
   Slå på Preferenskakor och tryck Escape. Öppna Anpassa Inställningar igen.
3. Kontrollera att påbörjat val finns kvar. Välj Spara Preferenser. Kontrollera
   att bannern stängs utan separat sparbekräftelse och ladda sedan om.

**Förväntat resultat:**

- Bannern visas även på den inloggade kartan. Nödvändig lagring är alltid aktiv
  och kan inte väljas bort.
- Escape sparar inte och påbörjade val bevaras mellan bannerlägen.
- Ett sparat lagringssamtycke stänger bannern utan separat sparbekräftelse, men
  aktiverar inte ihågkommen inloggning eller ett förslag under pågående inloggning.

### KAK-36: Två bannerlägen på mobil i ljust tema

**Syfte:** Samma val, fokus och sparande som på dator fungerar på mobil.

**Användare:** Alex i den isolerade provinstallationen.

**Förutsättningar och separat förberedelse:** Samma förberedelse, steg och
resultat som KAK-32.

**Automatiskt motsvarande test:**
[storage-consent.spec.ts](../../tests/integration/storage-consent.spec.ts),
KAK-36.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-consent.spec.ts",
    "caseId": "KAK-36"
  },
  "reference": "390 och 320 pixlar, ljust tema",
  "outcomes": [
    "Samma val, fokus och sparande som på dator fungerar på mobil."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ KAK-32 vid 390 pixlar. Kontrollera att kategorier och knappar går att nå
   utan sidledsrullning.
2. Prova även det utökade bannerläget vid 320 pixlar. Kontrollera att
   sparknapparna syns och kategorierna går att läsa utan sidledsrullning.

**Förväntat resultat:**

- Samma val, fokus och sparande som på dator fungerar på mobil.

### KAK-37: Två bannerlägen på dator i mörkt tema

**Syfte:** Samma val, fokus och sparande fungerar i mörkt tema.

**Användare:** Alex i den isolerade provinstallationen.

**Förutsättningar och separat förberedelse:** Samma förberedelse, steg och
resultat som KAK-32. Välj mörkt systemtema.

**Automatiskt motsvarande test:**
[storage-consent.spec.ts](../../tests/integration/storage-consent.spec.ts),
KAK-37.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-consent.spec.ts",
    "caseId": "KAK-37"
  },
  "reference": "1280 pixlar, mörkt systemtema",
  "outcomes": [
    "Samma val, fokus och sparande fungerar i mörkt tema."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ KAK-32 i mörkt tema vid 1280 pixlar.

**Förväntat resultat:**

- Samma val, fokus och sparande fungerar i mörkt tema.

### KAK-38: Två bannerlägen på mobil i mörkt tema

**Syfte:** Samma val, fokus och sparande fungerar på mobil i mörkt tema.

**Användare:** Alex i den isolerade provinstallationen.

**Förutsättningar och separat förberedelse:** Samma förberedelse, steg och
resultat som KAK-32. Välj mörkt systemtema.

**Automatiskt motsvarande test:**
[storage-consent.spec.ts](../../tests/integration/storage-consent.spec.ts),
KAK-38.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-consent.spec.ts",
    "caseId": "KAK-38"
  },
  "reference": "390 och 320 pixlar, mörkt systemtema",
  "outcomes": [
    "Samma val, fokus och sparande fungerar på mobil i mörkt tema."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ KAK-32 i mörkt tema vid 390 pixlar.
2. Prova även det utökade bannerläget vid 320 pixlar. Kontrollera att
   sparknapparna syns och kategorierna går att läsa utan sidledsrullning.

**Förväntat resultat:**

- Samma val, fokus och sparande fungerar på mobil i mörkt tema.

### KAK-33: Separat erbjudande och varaktigt avstå-val

**Syfte:** Inte nu upprepas inte vid omladdning eller återbesök i samma
inloggnings återkomstlänk.

**Användare:** Alex i den isolerade provinstallationen.

**Förutsättningar och separat förberedelse:** Använd en isolerad installation
utan tidigare lagrings- eller förslagsval.

Inför återbesöket i steg 2: öppna provwebbläsarens nätverksverktyg före
inloggningen. Bevara begäran till `/api/browser-binding/confirmation` och
dess `proof`-värde. Förbered en länk till installationens startsida med
`?loginConfirmation=` följt av samma URL-kodade värde. Använd bara den
isolerade provinstallationen. Länken skapar ingen ny inloggning.

**Automatiskt motsvarande test:**
[storage-login-offer.spec.ts](../../tests/integration/storage-login-offer.spec.ts),
KAK-33.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-login-offer.spec.ts",
    "caseId": "KAK-33"
  },
  "reference": "Ren webbläsare, Google och syntetisk leverantör",
  "outcomes": [
    "Inte nu upprepas inte vid omladdning eller återbesökt återkomstlänk för samma inloggning.",
    "Fråga inte igen består över senare inloggningar för samma användare och webbläsare.",
    "Manuell aktivering finns kvar och kräver separat serverbekräftelse."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna startsidan, välj Acceptera Alla och logga in med Google.
2. Välj Inte nu i Kom ihåg mig i Skyttel. Ladda om. Öppna sedan den
   förberedda återkomstlänken och kontrollera att erbjudandet inte upprepas.
3. Öppna /login och logga in igen. Välj Fråga inte igen i erbjudandet.
4. Logga in en tredje gång. Öppna /cookies och aktivera Kom ihåg mig i Skyttel
   manuellt.

**Förväntat resultat:**

- Inte nu upprepas inte vid omladdning eller återbesökt återkomstlänk för
  samma inloggning.
- Fråga inte igen består över senare inloggningar för samma användare och
  webbläsare.
- Manuell aktivering finns kvar och kräver separat serverbekräftelse.

### KAK-34: Snabbval kräver sparande och återställning bevarar avstå-val

**Syfte:** Snabbval ändrar formuläret och behöver separat Spara Preferenser.

**Användare:** Alex i den isolerade provinstallationen.

**Förutsättningar och separat förberedelse:** Logga in i den isolerade
provinstallationen utan befintligt lagringssamtycke.

**Automatiskt motsvarande test:**
[storage-consent.spec.ts](../../tests/integration/storage-consent.spec.ts),
KAK-34.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-consent.spec.ts",
    "caseId": "KAK-34"
  },
  "reference": "Inloggad användare, direkt publik policyingång",
  "outcomes": [
    "Snabbval ändrar formuläret och behöver separat Spara Preferenser. Policysidans sparande bekräftas med Dina lagringspreferenser är sparade.",
    "Återställning kräver bekräftelse, rensar samtycket och bevarar avstå-valet.",
    "Bannern visas igen när policysidan lämnas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna /cookies direkt. Läs Kakpolicy utan täckande banner.
2. Välj Acceptera Alla. Kontrollera Preferenskakor och välj Spara Preferenser.
   Kontrollera att **Dina lagringspreferenser är sparade.** visas på policysidan.
3. Avmarkera Fråga om ihågkommen inloggning efter framtida inloggningar.
4. Välj Återställ samtycke och bekräfta Återställ. Kontrollera
   förslagsvalet och välj Till startsidan.

**Förväntat resultat:**

- Snabbval ändrar formuläret och behöver separat Spara Preferenser.
- Policysidans sparande bekräftas med **Dina lagringspreferenser är sparade.**
- Återställning kräver bekräftelse, rensar samtycket och bevarar avstå-valet.
- Bannern visas igen när policysidan lämnas.

### KAK-35: Installationsansvarig publicerar policykontakt

**Syfte:** Installationsansvarig kan spara adressen under Drift.

**Användare:** Installationsansvarig.

**Förutsättningar och separat förberedelse:** Starta en isolerad installation
utan policykontakt. Logga in som installationsansvarig.

**Automatiskt motsvarande test:**
[policy-contact.spec.ts](../../tests/integration/policy-contact.spec.ts),
KAK-35.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/policy-contact.spec.ts",
    "caseId": "KAK-35"
  },
  "reference": "Installationsansvarig, tom kontaktadress",
  "outcomes": [
    "Installationsansvarig kan spara adressen under Drift.",
    "Den publika policyn visar den sparade adressen som e-postlänk. Hushållsadministration ger ingen automatisk ändringsbehörighet; detta kontrolleras separat via HTTP."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Månadskostnad och välj Policykontakt under Drift. Läs varningen om
   saknad kontakt.
2. Skriv `privacy@example.test` och välj Spara policykontakt.
3. Öppna /cookies och läs e-postlänken i Kakpolicy.

**Förväntat resultat:**

- Installationsansvarig kan spara adressen under Drift.
- Den publika policyn visar den sparade adressen som e-postlänk.
  Hushållsadministration ger ingen automatisk ändringsbehörighet; detta
  kontrolleras separat via HTTP.

### KAK-39: Nekad lagring ger vanlig åtkomst utan påhittat samtycke

**Syfte:** Lagringsfel förklaras och ett sparförsök ger ingen falsk bekräftelse.

**Användare:** Alex i den isolerade provinstallationen.

**Förutsättningar och separat förberedelse:** Öppna den isolerade startsidan.
Använd förberedelsen nedan för att neka just samtyckesposten innan du sparar.
Ladda om efter fallet.

**Automatiskt motsvarande test:**
[storage-consent.spec.ts](../../tests/integration/storage-consent.spec.ts),
KAK-39.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-consent.spec.ts",
    "caseId": "KAK-39"
  },
  "reference": "Ren webbläsare, kontrollerat nekat skrivande av samtyckesposten",
  "outcomes": [
    "Lagringsfel förklaras och ett sparförsök ger ingen falsk bekräftelse.",
    "Vanlig inloggning fungerar och kan följas av ett nytt kakval."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj Acceptera Alla i bannern och läs felet.
2. Välj Fortsätt med endast nödvändig lagring. Logga in med Google.
3. Kontrollera att bannern återkommer och att ihågkommen inloggning inte påstås
   vara aktiverad.

**Förväntat resultat:**

- Lagringsfel förklaras och ett sparförsök ger ingen falsk bekräftelse.
- Vanlig inloggning fungerar och kan följas av ett nytt kakval.

### KAK-40: Saknat eller äldre samtycke stänger av ihågkommen inloggning

**Syfte:** Saknat samtycke fabriceras inte från en äldre ihågkommen inloggning.

**Användare:** Alex i den isolerade provinstallationen.

**Förutsättningar och separat förberedelse:** Tillåt Preferenskakor, logga in
och aktivera ihågkommen inloggning. Ta bort bara skyttel-storage-consent i
provwebbläsarens lagringsverktyg.

**Automatiskt motsvarande test:**
[storage-consent.spec.ts](../../tests/integration/storage-consent.spec.ts),
KAK-40.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-consent.spec.ts",
    "caseId": "KAK-40"
  },
  "reference": "Befintlig ihågkommen inloggning, saknat samtycke och äldre informationsversion",
  "outcomes": [
    "Saknat samtycke fabriceras inte från en äldre ihågkommen inloggning.",
    "Vanlig åtkomst kan fortsätta efter bekräftad avstängning. Senare aktivering kräver eget val.",
    "En oförenlig informationsversion ger inget tillstånd till nya ändamål. Ett nytt kakval krävs."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ladda om startsidan. Läs bannern och invänta säker avstängning.
2. Välj Acceptera Alla. Öppna /cookies och aktivera funktionen uttryckligen
   igen.
3. Ladda om /cookies efter den andra förberedelsen för KAK-40 nedan.
4. Kontrollera att Preferenskakor är av och återgå till startsidan.

**Förväntat resultat:**

- Saknat samtycke fabriceras inte från en äldre ihågkommen inloggning.
- Vanlig åtkomst kan fortsätta efter bekräftad avstängning. Senare aktivering
  kräver eget val.
- En oförenlig informationsversion ger inget tillstånd till nya ändamål. Ett
  nytt kakval krävs.

### KAK-41: Flikar läser om samtycke och aktuellt serverläge

**Syfte:** Flikar delar aktuellt webbläsarsamtycke.

**Användare:** Alex i den isolerade provinstallationen.

**Förutsättningar och separat förberedelse:** Logga in, öppna /cookies, tillåt
Preferenskakor med Spara Preferenser och aktivera Kom ihåg mig i Skyttel.

**Automatiskt motsvarande test:**
[storage-consent.spec.ts](../../tests/integration/storage-consent.spec.ts),
KAK-41.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-consent.spec.ts",
    "caseId": "KAK-41"
  },
  "reference": "Två flikar i samma webbläsare med samma användare",
  "outcomes": [
    "Flikar delar aktuellt webbläsarsamtycke.",
    "Ändringsnotiser leder till omläsning. Båda reglagen visar av efter den säkra serverändringen, utan förlängd inloggning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna /cookies i en andra flik. Kontrollera att ihågkommen inloggning är på.
2. Välj Endast nödvändiga och Spara Preferenser i den första fliken.
3. Läs Preferenskakor och Ihågkommen inloggning i den andra fliken efter
   bekräftelsen.

**Förväntat resultat:**

- Flikar delar aktuellt webbläsarsamtycke.
- Ändringsnotiser leder till omläsning. Båda reglagen visar av efter den säkra
  serverändringen, utan förlängd inloggning.

### KAK-42: Pågående och okänd aktivering följer samma åtgärd

**Syfte:** Dialogen kan inte stängas medan aktiveringen pågår.

**Användare:** Alex i den isolerade provinstallationen.

**Förutsättningar och separat förberedelse:** Starta den kontrollerade
identitetsinstallationen. Tillåt Preferenskakor och logga in. Före
funktionsvalet kör du hold-next-storage-reply och lose-storage-reply i dess
terminal.

**Automatiskt motsvarande test:**
[storage-login-offer.spec.ts](../../tests/integration/storage-login-offer.spec.ts),
KAK-42.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-login-offer.spec.ts",
    "caseId": "KAK-42"
  },
  "reference": "Syntetisk leverantör, verklig aktivering med kontrollerat förlorat svar",
  "outcomes": [
    "Dialogen kan inte stängas medan aktiveringen pågår.",
    "Okänt utfall får lämnas efter varning, med åtgärdsreferensen bevarad. Ingen ändring upprepas automatiskt.",
    "Resultatkontroll bekräftar den tidigare aktiveringen separat från den nya vanliga inloggningen. Det aktuella reglaget är av."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj Kom ihåg mig i Skyttel. Tryck Escape medan Sparar visas.
2. Läs Sparstatus okänd efter förberedelsen nedan och välj Lämna med okänt
   utfall.
3. Öppna /login i samma flik och gör en ny vanlig Google-inloggning. Öppna
   /cookies.
4. Välj Kontrollera igen och läs resultatet av den tidigare aktiveringen samt
   den nya inloggningens reglage.

**Förväntat resultat:**

- Dialogen kan inte stängas medan aktiveringen pågår.
- Okänt utfall får lämnas efter varning, med åtgärdsreferensen bevarad. Ingen
  ändring upprepas automatiskt.
- Resultatkontroll bekräftar den tidigare aktiveringen separat från den nya
  vanliga inloggningen. Det aktuella reglaget är av.

### KAK-43: Export av sparat lagringssamtycke och register

**Syfte:** Hämta det sparade samtycket utan att spara påbörjade formulärval
eller ta med andra lagrade uppgifter.

**Användare:** Besökare utan inloggning.

**Förutsättningar:** En ny provwebbläsare utan lagringssamtycke. Bredd
320 pixlar. Öppna `/cookies` direkt.

**Automatiskt motsvarande test:**
[storage-consent-export.spec.ts](../../tests/integration/storage-consent-export.spec.ts),
KAK-43. Automationen kontrollerar även JSON-format, beslutstid,
registerposter och att andra lagrade värden inte följer med.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-consent-export.spec.ts",
    "caseId": "KAK-43"
  },
  "reference": "Publik policy utan inloggning vid 320 pixlar.",
  "outcomes": [
    "Exporten visar inget sparat samtycke före första sparandet.",
    "Sparat samtycke exporteras även när formuläret har ett annat osparat val.",
    "Exporten innehåller registret men ändrar inte samtycke eller övrig lagring.",
    "Fokus stannar på exportknappen och knapparna ryms på smal skärm."
  ]
}
```
-->

**Steg:**

1. Välj **Exportera data**. Öppna den hämtade JSON-filen och kontrollera
   att den innehåller registret men inget sparat samtycke.
2. Välj **Acceptera Alla** och **Spara Preferenser**. Läs sparbekräftelsen.
3. Välj **Endast nödvändiga** utan att spara. Kontrollera att Preferenskakor
   är av i formuläret.
4. Fokusera **Exportera data** och tryck Enter. Öppna filen och kontrollera
   att den visar det sparade samtycket till Preferenskakor.
5. Kontrollera fokus, formulärval, nedladdningsikon och återställningens
   papperskorgsikon. Kontrollera att sidan inte rullar i sidled.

**Förväntat resultat:**

- En fil med namnet `skyttel-lagringssamtycke.json` kan hämtas även utan
  ett sparat samtycke.
- Exporten följer det sparade samtycket. Påbörjade formulärval sparas inte.
- Lagringsregistret ingår; övriga lagrade uppgifter ändras inte.
- Fokus stannar på exportknappen. Knapparna har läsbara namn och ikoner,
  och sidan fungerar vid 320 pixlar utan sidledsrullning.

### KAK-44: Misslyckad samtyckesexport kan göras om

**Syfte:** Ett fel vid filskapandet ger ett begripligt besked och ändrar
inte det sparade samtycket.

**Användare:** Besökare utan inloggning.

**Förutsättningar:** Öppna `/cookies` i en isolerad provinstallation.
Välj **Endast nödvändiga** och **Spara Preferenser**.

**Separat förberedelse:** Kör följande i provsidans utvecklarkonsol.
Det stoppar nästa filskapande före nedladdningen. Nästa försök fungerar
normalt. Omladdning tar bort ersättningen helt.

```js
(() => {
  const create = URL.createObjectURL;
  let fail = true;
  URL.createObjectURL = function (blob) {
    if (fail) {
      fail = false;
      throw new DOMException('Synthetic blocked export', 'SecurityError');
    }
    return create.call(this, blob);
  };
})();
```

**Automatiskt motsvarande test:**
[storage-consent-export.spec.ts](../../tests/integration/storage-consent-export.spec.ts),
KAK-44. Samma felgräns används i Chromium.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/storage-consent-export.spec.ts",
    "caseId": "KAK-44"
  },
  "reference": "Publik policy med ett kontrollerat fel vid filskapande.",
  "outcomes": [
    "Exportfel visas utan att ändra det sparade samtycket.",
    "Ett nytt exportförsök kan hämta filen och tar bort felbeskedet.",
    "Fokus stannar på exportknappen."
  ]
}
```
-->

**Steg:**

1. Välj **Exportera data** och läs felet.
2. Kontrollera att Preferenskakor fortfarande är av och att fokus stannar
   på exportknappen.
3. Välj **Exportera data** igen. Öppna filen och läs det sparade valet.

**Förväntat resultat:**

- **Uppgifterna kunde inte exporteras. Försök igen.** visas som fel.
- Det nya försöket hämtar filen och tar bort exportfelet.
- Det sparade samtycket ändras inte av något av försöken.

### Förberedelse för KAK-39

Kör enbart i provwebbläsarens konsol i den isolerade installationen:

```js
const write = Storage.prototype.setItem;
Storage.prototype.setItem = function (key, value) {
  if (key === 'skyttel-storage-consent') {
    throw new DOMException('Synthetic denied storage', 'SecurityError');
  }
  write.call(this, key, value);
};
```

Ladda om efter fallet för att återställa funktionen. Förberedelsen
kontrollerar appens felhantering och bevisar inte en faktisk
webbläsarinställnings beteende.

### Andra förberedelsen för KAK-40

Mellan steg 2 och 3, ändra provwebbläsarens samtyckespost i konsolen:

```js
const key = 'skyttel-storage-consent';
const consent = JSON.parse(localStorage.getItem(key));
localStorage.setItem(key, JSON.stringify({ ...consent, informationVersion: 999 }));
```

### Andra förberedelsen för KAK-42

Mellan steg 1 och 2, kör `release-storage-reply` i den isolerade
installationens terminal. Förberedelsen släpper det fördröjda svaret som
den befintliga felinställningen sedan tappar bort.
