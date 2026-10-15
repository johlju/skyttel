# Manuella testfall för kakor och lagring

Fallen omfattar den publika informationssidan, första informationen,
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

**Syfte:** Verifiera publik åtkomst, stängning och direkt återbesök.

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
    "Informationen kan stängas utan lagringsval",
    "Publik länk och direkt återbesök fungerar",
    "Sidans rubrik och inloggningsknapp får fokus vid rätt övergång"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna startsidan. Kontrollera att informationen **Om kakor och lagring**
   och inloggningsknapparna går att nå.
2. Välj **Stäng informationen**. Kontrollera att fokus går till
   **Fortsätt med Google**.
3. Välj sidfotens **Kakor och lagring**. Kontrollera sidrubrikens fokus.
4. Öppna **Visa nödvändig lagring** och läs namn, plats, innehåll och tider.
5. Ladda om sidan. Välj **Till startsidan**.

**Förväntat resultat:**

- Ingen inloggning behövs. Sidan kan öppnas direkt på `/cookies`.
- Informationen anger att stängning och fortsatt användning inte ger ett val.
- Nödvändig lagring saknar avstängningsreglage. Ihågkommen inloggning
  förklaras som valfri och knuten till webbläsarbindningen.
- Serverinformationen skiljer automatisk gallring vid start och varje
  minut från verifierad drift och säkerhetskopior. Frister räknas från
  avslut, ändring, återkallelse eller kopiering enligt respektive ändamål;
  sju dygn för minimala spärrar är ett tak, inte standardlagring.
- Tillbaka på startsidan fokuseras välkomstrubriken. Efter omladdningen
  visas första informationen igen. Innehållet ryms utan sidledsrullning.

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
    "Första informationen kan stängas utan val",
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
    "Första informationen kan stängas utan val",
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

### KAK-10: Snabbval och ångra föregår uttryckligt sparande på dator

**Syfte:** Skilja formulärändringar från serverns bekräftade val.

**Användare:** Hushållets administratör.

**Förutsättningar:** Bredd 1280 pixlar. Logga in med ett aktivt
**Kom ihåg mig**-val och öppna **Kakor och lagring**.

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
    "Ångra återgår till senast bekräftat värde",
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
3. Välj **Ångra ändring** och kontrollera att reglaget återgår till på.
4. Stäng av igen och välj **Spara inställningar** längst ned.

**Förväntat resultat:**

- Snabbvalet och ångra skickar inget sparande.
- Efter sparande visas **Ihågkommen inloggning är avstängd.** och,
  efter separat kontroll, **Du är fortfarande inloggad.**
- Sparknappen behåller fokus. Ny aktivering hänvisar till ny inloggning.

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
   med Enter. Välj snabbåtgärden för avstängning, välj **Ångra ändring**
   och kontrollera att reglaget återgår till på och att fokus stannar.
   Stäng av med snabbåtgärden igen.
2. Försök lämna sidan via **Din profil**, **Inloggningssätt** och
   **Tillbaka till kartan**. Avbryt varje gång med Escape. Öppna
   **Välj inställning** först om navigationen är hopfälld.
3. Försök återgå till kartan igen och välj
   **Kasta ändringarna och fortsätt**. Öppna lagringssidan igen.
4. Välj **Återställ valfri lagring**. Läs omfattning och bevarade uppgifter.
   Flytta fokus med Tab och Skift+Tab och avbryt med Escape.
5. Öppna återställningen igen och välj **Återställ**. Kontrollera beskedet
   vid snabbåtgärderna. Fokusera den spärrade **Spara inställningar** och
   tryck Enter; beskedet ska stanna vid återställningen.
6. Kontrollera kontotema, personlig vy, hushållets information,
   samtalsmedgivande och den andra webbläsarens inloggning.
   Följ vid behov samma återhämtningsförsök från förberedelsen.

**Förväntat resultat:**

- Avbruten navigation behåller formulärvärdet och återger fokus till
  vald länk. Kasta ändringarna ändrar inte servervalet.
- Återställningsdialogen fokuserar **Avbryt**, håller tangentbordsfokus
  inom dialogen och återger det till **Återställ valfri lagring**.
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
  "outcomes": ["Snabbval och ångra behåller fokus", "Navigation skyddar osparade värden", "Bekräftad återställning bevarar övrigt arbete och återger fokus", "Ingen horisontell sidrullning"]
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
  "outcomes": ["Avslag behåller AV som osparat och servervalet på", "Ångra tar bort felet, återgår till på och behåller fokus", "Fokus återgår till återställningsknappen", "Återhämtningsreferenser bevaras", "Ingen automatisk upprepning av sparandet"]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Kakor och lagring**, välj **Återställ valfri lagring** och
   bekräfta med **Återställ**.
2. Kontrollera besked och fokus. Följ den erbjudna åtgärden enligt
   förväntat resultat.
3. Kontrollera att flikens återhämtningsuppgifter finns kvar.

**Förväntat resultat:**

**Ändringen kunde inte sparas. Försök igen.** visas vid snabbåtgärden. Begärt AV
ligger kvar som osparat och servervalet är på. **Ångra ändring** återgår till
på, tar bort felet och behåller fokus.

Fokus återgår till **Återställ valfri lagring** när dialogen stängs.
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
  "outcomes": ["Förlorat svar ger okänd status och erbjuder Kontrollera igen", "Spärrade spara, ångra och återställ skickar ingen ny ändring", "Fokus återgår till återställningsknappen", "Återhämtningsreferenser bevaras"]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Kakor och lagring**, välj **Återställ valfri lagring** och
   bekräfta med **Återställ**.
2. Kontrollera besked och fokus. Följ den erbjudna åtgärden enligt
   förväntat resultat.
3. Kontrollera att flikens återhämtningsuppgifter finns kvar.

**Förväntat resultat:**

**Sparstatus okänd. Vi kunde inte bekräfta om ändringen genomfördes.** visas som
larm vid snabbåtgärden. Sidan påstår inte att servervalet är oförändrat.
**Kontrollera igen** erbjuds. Nytt sparande, ångra och återställning är
spärrade; tangentbordsaktivering skickar inget nytt sparande.

Fokus återgår till **Återställ valfri lagring** när dialogen stängs.
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

1. Öppna **Kakor och lagring**, välj **Återställ valfri lagring** och
   bekräfta med **Återställ**.
2. Kontrollera besked och fokus. Följ den erbjudna åtgärden enligt
   förväntat resultat.
3. Kontrollera att flikens återhämtningsuppgifter finns kvar.

**Förväntat resultat:**

**Ihågkommen inloggning är avstängd. Logga in igen för att fortsätta.** visas
som status vid snabbåtgärden. Länken **Logga in igen** visas. Avstängningen
förvandlas inte till okänd status eller avvisat sparande.

Fokus återgår till **Återställ valfri lagring** när dialogen stängs.
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
  "outcomes": ["Snabbval och ångra behåller fokus", "Navigation skyddar osparade värden", "Bekräftad återställning bevarar övrigt arbete och återger fokus", "Ingen horisontell sidrullning"]
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
   frågar. Logga in som Alex och välj uttryckligen **Kom ihåg mig** igen.
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

1. Stäng av reglaget och välj **Spara inställningar**.
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
det gamla utfallet, och **Spara inställningar** skickar inget nytt anrop.

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
3. Fokusera **Spara inställningar** med tangentbordet och tryck Retur.

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
