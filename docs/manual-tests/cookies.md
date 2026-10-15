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
