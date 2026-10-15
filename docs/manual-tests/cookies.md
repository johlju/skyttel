# Manuella testfall för kakor och lagring

Fallen omfattar den publika informationssidan, första informationen och
profilvägen tillbaka till kartan. Anteckna commit, webbläsare, bredd och
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
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts), KAK-01.

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
- Tillbaka på startsidan fokuseras välkomstrubriken. Efter omladdningen
  visas första informationen igen. Innehållet ryms utan sidledsrullning.

### KAK-02: Besökaren når samma information vid 390 pixlar

**Syfte:** Upptäcka hinder i mobilens publika flöde.

**Användare:** Besökare.

**Förutsättningar:** Ren profil, bredd 390 pixlar. Följ alla steg och
förväntade resultat i KAK-01.

**Automatiskt motsvarande test:**
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts), KAK-02.

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
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts), KAK-03.

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
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts), KAK-09.

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
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts), KAK-08.

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
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts), KAK-04.

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
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts), KAK-05.

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
[cookie-storage.spec.ts](../../tests/integration/cookie-storage.spec.ts), KAK-06.

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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Lyssna på namn, läsordning, öppnade detaljer och fokus efter stängning, sidbyte och återgång till kartan med verklig skärmläsare."
  },
  "reference": "Fullständiga KAK-01–KAK-06 med skärmläsare, tangentbord, båda teman och 1280/390/320 pixlar.",
  "outcomes": [
    "Läsordning och namn förklarar handlingarna",
    "Sidfokus och återgång annonseras begripligt"
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
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ KAK-01–KAK-06 med skärmläsaren och enbart tangentbord där det stöds.
2. Lyssna på rubriker och kontroller. Öppna och stäng lagringsdetaljerna.
3. Kontrollera synligt fokus, läsordning, pekmål, kontrast och omflöde
   även med förstoring. Anteckna hinder separat från automatiska resultat.

**Förväntat resultat:**

- Information och kontroller går att förstå och använda utan visuell
  navigering. Fokus försvinner inte vid stängning eller sidbyte.
- Detaljernas öppna eller stängda läge förmedlas begripligt.
