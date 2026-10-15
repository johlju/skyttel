# Manuella testfall för inloggning och hushållets start

Testfallen omfattar första hushållet, återhämtning vid anslutningsfel,
utloggning, kartans verktyg och frivilliga hjälp och länkning av Google och Microsoft.
Övergången till vald leverantör visar vad som händer och kan avbrytas.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

- **Alex Exempel** är installationens första administratör med Google.
- **Robin Exempel** loggar in med Microsoft och saknar medlemskap, utom i
  den separata installationen för ACCESS-22 där Robin är första administratör.
- Alex har även en Microsoft-identitet för länkning. Den får inte tillhöra
  en separat Skyttel-användare. Adressen får skilja sig från Google-adressen.
- För ACCESS-11 behövs ytterligare en Google-identitet som inte är Alex.

Använd endast fiktiva hushåll och kontrollerade testidentiteter. Den
automatiserade motsvarigheten använder syntetiska identitetsleverantörer.
Verkliga leverantörer kontrolleras separat enligt
[förberedelsen för verkliga leverantörer](#real-identity-provider-preparation).

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

1. Använd en isolerad installation enligt
   [installationsguiden](../operations/installation.md). För ACCESS-01 till
   ACCESS-04 ska installationen sakna hushåll. För övriga fall får Alex
   redan ha skapat **Hushållet Linden**, om inget annat anges.
2. Återställ till en separat tom testdatabas mellan fall som skapar hushåll.
   Återställ länkade identiteter mellan länkningsfallen; använd separata
   testdatabaser för att undvika att en Microsoft-identitet redan är kopplad.
3. När ett fall anger **Fortsätt med Google** eller **Fortsätt med Microsoft**,
   läs övergången och välj sedan **Fortsätt till Google** respektive
   **Fortsätt till Microsoft**. **Avbryt** återgår till valet av inloggningssätt.
4. Använd en webbläsare med utvecklarverktyg för nätverksfel. Ta bort
   blockeringar och återställ nätverksanslutningen efter varje fall.
   Använd aldrig felinjicering på en installation med riktiga hushåll.

## Skapa och öppna hushållet

### ACCESS-29: Spara avstängd ihågkommen inloggning

**Syfte:** Skilja sparad avstängning från bekräftad fortsatt inloggning.

**Användare:** Alex i den kontrollerade HTTPS-installationen.

**Förutsättningar:** Starta den
[kontrollerade identitetsinstallationen](#kontrollerad-identitetsinstallation)
med `--https`. Logga in med Google och markera **Kom ihåg mig** innan du
fortsätter till leverantören. Hushåll behövs inte.

**Automatiskt motsvarande test:**
[remembered-revocation.spec.ts](../../tests/integration/remembered-revocation.spec.ts),
ACCESS-29. Verklig HTTPS, SQLite och kakor; syntetisk leverantör.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/remembered-revocation.spec.ts",
    "caseId": "ACCESS-29"
  },
  "reference": "Dator, HTTPS och aktiv ihågkommen inloggning.",
  "outcomes": [
    "Uttryckligt sparande bekräftar avstängningen.",
    "Fortsatt inloggning bekräftas separat och fokus stannar på sparknappen.",
    "Ny aktivering hänvisar till en ny inloggning."
  ]
}
```
-->

**Steg:**

1. Öppna `/cookies` direkt i samma webbläsare.
2. Stäng av reglaget **Ihågkommen inloggning**. Kontrollera **Osparad
   ändring.** och välj **Spara inställningar**.
3. Kontrollera beskedet och tangentbordsfokus.

**Förväntat resultat:**

- **Ihågkommen inloggning är avstängd. Du är fortfarande inloggad.**
  ligger kvar vid åtgärderna. Fokus ligger kvar på sparknappen.
- Reglaget är av och sidan visar **Logga in på nytt och välj Kom ihåg mig.**
- Uppgifterna anger högst tidigare slut eller åtta timmar från
  avstängningen och 30 minuters inaktivitet.

### ACCESS-30: Avvisat sparande behåller det osparade valet

**Syfte:** Ett säkert avvisat anrop får inte visas som sparat.

**Användare och förutsättningar:** Samma som ACCESS-29, i en ny installation.

**Separat förberedelse:** Öppna utvecklarverktygens konsol på Skyttels
isolerade testadress och kör följande. Det ersätter endast nästa
avstängningsanrop med ett avvisande före servern. Ladda om sidan efter
fallet för att ta bort ersättningen.

```js
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  if (String(args[0]) === '/api/browser-binding/revoke') {
    window.fetch = originalFetch;
    return Response.json({ error: 'revocation_rejected' }, { status: 409 });
  }
  return originalFetch(...args);
};
```

**Automatiskt motsvarande test:**
[remembered-revocation.spec.ts](../../tests/integration/remembered-revocation.spec.ts),
ACCESS-30. Automationen ersätter samma anrop före servern med HTTP 409.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/remembered-revocation.spec.ts",
    "caseId": "ACCESS-30"
  },
  "reference": "HTTPS och avvisat avstängningsanrop före servern.",
  "outcomes": [
    "Avvisningen visas som fel, inte som sparad avstängning.",
    "Begärt AV ligger kvar som osparat och sparknappen behåller fokus."
  ]
}
```
-->

**Steg:**

1. Öppna `/cookies`, stäng av reglaget och välj
   **Spara inställningar**.
2. Kontrollera besked, reglage, osparad status och fokus.

**Förväntat resultat:** **Ändringen kunde inte sparas. Försök igen.**
visas som larm. Begärt AV ligger kvar med **Osparad ändring.** Sparknappen
kan användas igen och har kvar fokus.

### ACCESS-31: Förlorat svar ger okänd sparstatus

**Syfte:** Ett svar som försvinner efter ändringen får inte ge falskt
avvisande, framgång eller automatiskt nytt sparande.

**Användare och förutsättningar:** Samma som ACCESS-29, i en ny installation.

**Separat förberedelse:** Kör följande i konsolen på den isolerade
testadressen. Det låter servern slutföra anropet men kastar bort svaret
innan formuläret får läsa det. Ladda om sidan efter fallet. Automationen
håller i stället det faktiska HTTP-svaret och avbryter leveransen efter
serverns svar; båda varianterna styr svarsförlust efter ändringen.

```js
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (String(args[0]) === '/api/browser-binding/revoke') {
    window.fetch = originalFetch;
    throw new TypeError('Synthetic response loss');
  }
  return response;
};
```

**Automatiskt motsvarande test:**
[remembered-revocation.spec.ts](../../tests/integration/remembered-revocation.spec.ts),
ACCESS-31. Syntetisk leverantör, verklig serverändring och kontrollerad
svarsförlust; ingen verklig leverantörskontroll.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/remembered-revocation.spec.ts",
    "caseId": "ACCESS-31"
  },
  "reference": "Kontrollerad HTTPS-installation med förlorat svar efter serverändring.",
  "outcomes": [
    "Sparstatus okänd skiljs från framgång och avvisning.",
    "Begärt AV behålls och inget nytt sparande erbjuds medan utfallet är okänt."
  ]
}
```
-->

**Steg:**

1. Öppna `/cookies`, stäng av reglaget och välj
   **Spara inställningar**.
2. Kontrollera beskedet och försök aktivera sparknappen igen.

**Förväntat resultat:** **Sparstatus okänd. Vi kunde inte bekräfta om
ändringen genomfördes.** visas som larm. Reglaget visar begärt AV och
sparknappen behåller fokus, men skickar inget nytt anrop. Sidan påstår
inte att tidigare val fortfarande gäller.

### ACCESS-27: Kom ihåg mig gäller bara den nya inloggningen

**Syfte:** Kontrollera aktivt val, avmarkerad ny start och bevarad giltig
inloggning när ett nytt försök misslyckas.

**Användare:** Alex i en ny webbläsarprofil utan hushåll.

**Separat förberedelse:** Starta den
[kontrollerade identitetsinstallationen](#kontrollerad-identitetsinstallation)
med `--https`. Använd `provider-down` för felet i steg 4 och `provider-up`
innan steg 5. Återställ installationen efter fallet.

**Automatiskt motsvarande test:**
[remembered-login.spec.ts](../../tests/integration/remembered-login.spec.ts),
ACCESS-27. Verklig HTTPS, kakor och SQLite; syntetisk leverantör.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/remembered-login.spec.ts",
    "caseId": "ACCESS-27"
  },
  "reference": "HTTPS, 1280 × 720; aktivt val, avbruten ny start och leverantörsfel",
  "outcomes": [
    "Kom ihåg mig börjar avmarkerat vid varje ny inloggning",
    "Ett aktivt val kan ge bekräftad ihågkommen inloggning",
    "Ett misslyckat nytt försök bevarar tidigare giltig inloggning",
    "Ny inloggning utan valet använder vanlig session"
  ]
}
```
-->

**Steg:**

1. Välj **Fortsätt med Google**. Kontrollera att **Kom ihåg mig** är
   avmarkerat och läs informationen. Markera valet och fortsätt till Google.
2. Invänta **Skapa ditt hushåll**. Öppna **Din profil** och välj
   **Logga in på nytt**. Välj Google och kontrollera att valet är avmarkerat.
3. Markera valet men välj **Avbryt**. Välj Google igen; valet ska åter
   börja avmarkerat.
4. Slå på leverantörsfelet och fortsätt utan valet. Kontrollera felbeskedet.
   Öppna startsidan och kontrollera att den tidigare inloggningen finns kvar.
5. Återställ leverantören. Öppna **Logga in på nytt** igen, välj Google
   och fortsätt utan **Kom ihåg mig**. Invänta **Skapa ditt hushåll**.

**Förväntat resultat:** Varje ny start har eget avmarkerat val. Avbrytande
och leverantörsfel tar inte bort den tidigare giltiga inloggningen.
Automationen kontrollerar båda kakornas beständighet efter bekräftelsen och
sessionsläge efter den sista inloggningen samt avsaknad av lokal valhistorik.
Det bevisar inte webbläsarens framtida beteende efter omstart.

### ACCESS-28: Saknad autentiseringskaka ger inget bekräftat resultat

**Syfte:** Kontrollera att leverantörens återkomst inte ensam räcker för
att bekräfta inloggning eller göra säkerhetskakan beständig.

**Användare:** Alex i en ny webbläsarprofil utan tidigare Skyttel-kakor.

**Separat förberedelse:** Starta den kontrollerade identitetsinstallationen
med `--https` och skriv `drop-login-cookie`. Kommandot tar bort just
autentiseringskakan från det riktiga callbacksvaret efter serverns commit.
Detta är en kontrollerad utebliven kaka, inget bevis för en fysisk
webbläsares alla blockeringslägen. Skriv `allow-login-cookie` efter fallet
och stäng installationen. Rensa provprofilens kakor innan en ny start.

**Automatiskt motsvarande test:**
[remembered-login.spec.ts](../../tests/integration/remembered-login.spec.ts),
ACCESS-28.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/remembered-login.spec.ts",
    "caseId": "ACCESS-28"
  },
  "reference": "HTTPS, 1280 × 720; callbacksvaret saknar autentiseringskaka",
  "outcomes": [
    "Exakt besked om obekräftad inloggning visas",
    "Ingen skyddad åtkomst bekräftas och säkerhetskakan förblir sessionskaka",
    "Inloggningssätten är fortsatt åtkomliga"
  ]
}
```
-->

**Steg:**

1. Välj Google, markera **Kom ihåg mig** och fortsätt till Google.
2. Invänta återkomsten. Läs felbeskedet och kontrollera att inloggningssätten
   går att välja igen, medan hushållets start inte öppnas.

**Förväntat resultat:** **Inloggningen kunde inte bekräftas. Försök logga
in igen. Kontrollera att webbläsaren tillåter kakor för Skyttel om problemet
kvarstår.** visas som larm. Automationen kontrollerar nekad serveråtkomst
och att säkerhetskakan inte blir beständig.

### ACCESS-24: Samtidiga första flikar kan starta säkert

**Syfte:** Kontrollera samtidiga starter och en separat webbläsarprofil.

**Användare:** Alex i en ny webbläsarprofil.

**Förutsättningar:** Starta den
[kontrollerade identitetsinstallationen](#kontrollerad-identitetsinstallation)
med `--https`. Profilen ska sakna Skyttel-kakor. Skriv `provider-down`
i terminalen före de två första flikarnas start. Skriv `provider-up`
innan den separata profilens inloggning.

**Automatiskt motsvarande test:**
[browser-binding.spec.ts](../../tests/integration/browser-binding.spec.ts),
ACCESS-24. Automationen kör verklig HTTPS, kakor och SQLite med syntetisk
identitetsleverantör. Leverantörsstartens svar för de första flikarna
hålls vid ett kontrollerat fel; deras säkerhetsbindning verifieras tekniskt.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/browser-binding.spec.ts",
    "caseId": "ACCESS-24"
  },
  "reference": "HTTPS, 1280 × 720; två flikar med leverantörsfel, ny profil",
  "outcomes": [
    "Båda flikarna återfår inloggningsvalet efter leverantörsfelet",
    "En separat profil kan logga in oberoende av den första profilens försök"
  ]
}
```
-->

**Steg:**

1. Öppna Skyttels startsida i två flikar i samma nya profil.
2. Välj **Fortsätt med Google** i båda. Läs övergångsbeskeden och välj
   **Fortsätt till Google** i snabb följd i båda flikarna.
3. Kontrollera felbesked och att båda inloggningssätten går att välja igen.
4. Öppna en separat ny webbläsarprofil. Återställ leverantören och logga in
   med Alex Google-identitet där.

**Förväntat resultat:** Båda första flikarna visar ett begripligt
leverantörsfel och användbara val. Den separata profilen når
hushållets namngivning utan att den första profilens försök behöver avslutas.

### ACCESS-25: Saknade skydd stoppar inloggningen

**Syfte:** Kontrollera stopp utan automatisk omstart vid saknade
webbläsarlås, blockerade kakor och utebliven registreringsbekräftelse.

**Användare:** Utloggad besökare i en ny profil för varje variant.

**Separat förberedelse:** Starta den kontrollerade identitetsinstallationen
med `--https`. Prova
först en webbläsare utan stöd för Web Locks. Prova sedan en ny profil
med stöd för Web Locks men med webbplatsens kakor blockerade i
webbläsarens inställningar. Återställ kakinställningen efter provet.
För den tredje varianten skriver du `hold-registration` i terminalen
före inloggningsstarten. Invänta `registration_held`, slå på offline-läge
i webbläsarens nätverksverktyg och skriv `release-initialization`.
Servern registrerar bindningen men webbläsaren får ingen bekräftelse.
Återställ nätverksanslutningen efter felbeskedet.

**Automatiskt motsvarande test:**
[browser-binding.spec.ts](../../tests/integration/browser-binding.spec.ts),
ACCESS-25. Automationen tar bort lås-API:t för första varianten och
använder Chromiums inbyggda avstängning av dokumentkakor för den andra.
Den tredje tappar den verkliga serverns registreringssvar.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/browser-binding.spec.ts",
    "caseId": "ACCESS-25"
  },
  "reference": "HTTPS; saknat lås, blockerade kakor, tappat registreringssvar",
  "outcomes": [
    "Ett tydligt hinder visas innan Google öppnas",
    "Fokus återgår till inloggningssättet utan automatiskt nytt försök"
  ]
}
```
-->

**Steg:**

1. Öppna startsidan och välj **Fortsätt med Google**.
2. Välj **Fortsätt till Google** med tangentbordet.
3. Läs hindret och kontrollera tangentbordsfokus.
4. Upprepa med de andra förberedda varianterna.

**Förväntat resultat:** Beskedet börjar med **Säker inloggning kan inte
bekräftas i webbläsaren**. Google öppnas inte. Fokus återgår till
**Fortsätt med Google**. Ett nytt försök kräver ett uttryckligt val.
Skärmläsarens faktiska uppläsning behöver verifieras separat.

### ACCESS-26: Avbruten initialisering kan inte ersätta en annan fliks start

**Syfte:** Kontrollera ett sent svar efter avbruten inloggning.

**Användare:** Alex i två nya flikar i samma profil.

**Separat förberedelse:** Starta den kontrollerade identitetsinstallationen
med `--https`. Skriv `hold-initialization` i terminalen. Nästa
initialiseringssvar hålls efter serverbehandlingen; invänta terminalens
`initialization_held` innan du avbryter. Övrig trafik fortsätter.
Skriv `release-initialization` för att släppa det gamla svaret efter den
andra flikens inloggning. `quit` släpper också ett kvarvarande svar.

**Automatiskt motsvarande test:**
[browser-binding.spec.ts](../../tests/integration/browser-binding.spec.ts),
ACCESS-26. Svaret från den verkliga servern hålls i nätverksgränsen och
släpps först efter att den andra flikens inloggning är bekräftad.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/browser-binding.spec.ts",
    "caseId": "ACCESS-26"
  },
  "reference": "Chromium, HTTPS, 1280 × 720; verkligt fördröjt initialiseringssvar",
  "outcomes": [
    "Avbryt återgår till val av inloggningssätt",
    "Den andra flikens inloggning består när det gamla svaret släpps"
  ]
}
```
-->

**Steg:**

1. Välj Google och **Fortsätt till Google** i första fliken. Välj
   **Avbryt** medan initialiseringen väntar.
2. Logga in med Google i den andra fliken.
3. Släpp det fördröjda svaret. Ladda om den andra fliken.

**Förväntat resultat:** Första fliken visar att inloggningen avbryts och
erbjuder inloggningssätten. Andra fliken når och behåller namngivningen
av hushållet även när det äldre svaret levereras.

### ACCESS-23: En tom installation erbjuder båda inloggningssätten

**Syfte:** Kontrollera startsidan innan någon session eller något hushåll finns.

**Användare:** Utloggad besökare i en ny webbläsarprofil.

**Förutsättningar:** En separat tom installation.

**Integrationstest:**
[bootstrap.spec.ts](../../tests/integration/bootstrap.spec.ts), ACCESS-23.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/bootstrap.spec.ts",
    "caseId": "ACCESS-23"
  },
  "reference": "Chromium 1280 × 720; isolerade testdata och angivna roller",
  "outcomes": [
    "Tom installation erbjuder både Google och Microsoft före inloggning"
  ]
}
```
-->

**Steg:**

1. Öppna installationens startsida i den nya profilen.
2. Läs **Välkommen till Skyttel** och kontrollera knapparna
   **Fortsätt med Google** och **Fortsätt med Microsoft**.

**Förväntat resultat:**

- Båda inloggningssätten erbjuds före första hushållet.
- Automationen kontrollerar dessutom att en direkt hushållsbegäran utan
  session nekas. Det är tekniskt underlag, ingen manuell formulärhandling.

### ACCESS-01: Första administratören återkommer till samma hushåll

**Syfte:** Kontrollera att hushållet behålls efter omstart och ny inloggning.

**Användare:** Alex.

**Förutsättningar:** Installationen saknar hushåll.

**Integrationstest:**
[bootstrap.spec.ts](../../tests/integration/bootstrap.spec.ts),
testfallet “ACCESS-01: the configured administrator creates a private
household and returns after restart”.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/bootstrap.spec.ts",
    "caseId": "ACCESS-01"
  },
  "reference": "Chromium 1280 × 720; isolerade testdata och angivna roller",
  "outcomes": [
    "Samma trimmade hushållsnamn och adress efter omstart och ny login"
  ]
}
```
-->

**Steg:**

1. Öppna installationen och välj **Fortsätt med Google**. Logga in som Alex.
2. Skriv **Hushållet Linden** i **Hushållets namn**, med två mellanslag före
   och efter namnet. Välj **Skapa hushåll** och anteckna sidans adress.
3. Starta om applikationen med samma databas och ladda om sidan.
4. Välj **Logga ut** och logga in med samma Google-identitet igen.

**Förväntat resultat:**

- Alex får skapa hushållet. Rubriken visar **Hushållet Linden**, utan
  inledande eller avslutande mellanslag.
- Samma hushåll och adress visas efter omstart och efter ny inloggning.

### ACCESS-02: Ett ogiltigt hushållsnamn kan rättas

**Syfte:** Kontrollera att valideringen är begriplig och går att åtgärda.

**Användare:** Alex.

**Förutsättningar:** Alex är inloggad och **Skapa ditt hushåll** visas.

**Integrationstest:**
[bootstrap.spec.ts](../../tests/integration/bootstrap.spec.ts),
testfallet “ACCESS-02: an invalid household name receives focus and can
be corrected”.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/bootstrap.spec.ts",
    "caseId": "ACCESS-02"
  },
  "reference": "Chromium 1280 × 720; isolerade testdata och angivna roller",
  "outcomes": [
    "Ogiltigt namn får fokus och kan rättas utan att skapa tomt hushåll"
  ]
}
```
-->

**Steg:**

1. Skriv tre mellanslag i **Hushållets namn** och välj **Skapa hushåll**.
2. Kontrollera felmeddelandet och var tangentbordsfokus hamnar.
3. Ersätt innehållet med **Hushållet Linden**, med två mellanslag före och
   efter namnet. Välj **Skapa hushåll**.

**Förväntat resultat:**

- **Ange ett namn med 1–100 tecken.** visas. Namnfältet får fokus och
  markeras som ogiltigt för hjälpmedel. Inget hushåll skapas av mellanslagen.
- Det rättade namnet skapar **Hushållet Linden**. Felmeddelandet försvinner.

### ACCESS-03: Kontrollera status efter ett förlorat svar

**Syfte:** Kontrollera att ett skapat hushåll kan återfinnas när svaret
inte når gränssnittet.

**Användare:** Alex.

**Förutsättningar:** Alex är inloggad och **Skapa ditt hushåll** visas.

**Separat förberedelse:** Öppna konsolen på den isolerade testsidan och kör
felinjicering. Den låter servern slutföra nästa skapande, men döljer svaret
för gränssnittet. Vanligt offlineläge verifierar inte detta fall.

```javascript
window.accessOriginalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const input = args[0];
  const url = new URL(input instanceof Request ? input.url : input,
    window.location.href);
  const method = args[1]?.method ??
    (input instanceof Request ? input.method : 'GET');
  const response = await window.accessOriginalFetch(...args);
  if (url.pathname === '/api/households' && method === 'POST') {
    await response.clone().arrayBuffer();
    window.fetch = window.accessOriginalFetch;
    throw new TypeError('Synthetic connection interrupted');
  }
  return response;
};
```

Efter avbruten körning återställer du med
`window.fetch = window.accessOriginalFetch` eller laddar om sidan.
Återställ testdatabasen inför nästa skapandefall.

**Integrationstest:**
[bootstrap.spec.ts](../../tests/integration/bootstrap.spec.ts),
testfallet “ACCESS-03: checking an uncertain creation recovers the committed
household”.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/bootstrap.spec.ts",
    "caseId": "ACCESS-03"
  },
  "reference": "Chromium 1280 × 720; isolerade testdata och angivna roller",
  "outcomes": [
    "Statuskontroll återfinner skapat hushåll efter förlorat lyckat svar"
  ]
}
```
-->

**Steg:**

1. Skriv **Hushållet Linden** och välj **Skapa hushåll**.
2. Kontrollera meddelandet och välj **Kontrollera status** direkt, innan
   sidans automatiska uppdatering hinner visa hushållet.
3. Anteckna hushållets adress och ladda om sidan.

**Förväntat resultat:**

- Sidan säger att skapandet inte kan bekräftas och behåller det angivna
  namnet. Den påstår inte att skapandet misslyckas.
- **Kontrollera status** öppnar **Hushållet Linden** utan ett nytt skapande.
  Samma hushåll finns kvar efter omladdning och skapandeformuläret försvinner.
- Integrationstestet kontrollerar även att bara en skapandebegäran skickas.

### ACCESS-04: Hushållet kan skapas med tangentbord

**Syfte:** Kontrollera fokus och tangentbordsstyrning genom hela starten.

**Användare:** Alex.

**Förutsättningar:** Installationen saknar hushåll. Alex är utloggad.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts),
testfallet “ACCESS-04: setup works by keyboard within a narrow phone
viewport”. Testet kontrollerar även automatisk anpassning till smal skärm.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/usability.spec.ts",
    "caseId": "ACCESS-04"
  },
  "reference": "320 × 568 och 320 × 320; fokus och nåbar utloggning utan overflow",
  "outcomes": [
    "Tangentbordet skapar hushållet; fokus och utloggning ryms på smal skärm"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna installationen. Kontrollera att välkomstrubriken får fokus.
2. Tryck Tab till **Fortsätt med Google** och aktivera med Enter.
   Kontrollera att **Fortsätt till Google** får fokus. Läs beskedet om
   återgången till Skyttel och aktivera med Enter.
3. Efter inloggningen kontrollerar du att **Skapa ditt hushåll** får fokus.
   Tryck Tab till **Hushållets namn** och skriv **Hushallet Linden**.
4. Tryck Tab till **Skapa hushåll** och aktivera med Enter.
5. Öppna **Din profil** vid 320 × 568 och 320 × 320. Kontrollera att
   **Logga ut** går att nå utan sidans horisontella rullning.

**Förväntat resultat:**

- Inloggningen och formuläret kan användas utan mus.
- Hushållet öppnas och rubriken **Hushallet Linden** får fokus.

### ACCESS-05: Starten kan återupptas efter anslutningsfel

**Syfte:** Kontrollera att startsidan erbjuder en fungerande återhämtning.

**Användare:** Alex, utloggad.

**Förutsättningar:** Blockera adressmönstret `*/api/bootstrap` via
utvecklarverktygens blockering av nätverksbegäranden. Övriga resurser ska
kunna hämtas.

**Separat operatörsförberedelse:** Operatören installerar enbart den
angivna blockeringen före steg 1 och bekräftar att övriga resurser kan
hämtas. Efter **Skyttel kunde inte öppnas**, före **Försök igen** i
steg 2, tar operatören bort blockeringen och bekräftar återställningen.
Behåll sidan öppen utan omladdning. Ta även bort blockeringen vid avslut.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts),
testfallet “ACCESS-05: failed startup read offers a working retry”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/usability.spec.ts",
    "caseId": "ACCESS-05"
  },
  "reference": "Blockerad bootstrap; fungerande återförsök efter återställd anslutning",
  "outcomes": [
    "Anslutningsfelet visar fungerande Försök igen utan omladdning"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna installationen och kontrollera meddelandet.
2. Be operatören återställa anslutningen och invänta bekräftelse.
   Välj **Försök igen** utan att ladda om sidan.

**Förväntat resultat:**

- **Skyttel kunde inte öppnas** visas vid anslutningsfelet.
- Försöket öppnar **Välkommen till Skyttel** utan att sidan behöver laddas om.

### ACCESS-06: En inloggad person utan tillgång får en förklaring

**Syfte:** Skilja lyckad inloggning från tillgång till hushållet.

**Användare:** Robin, utan medlemskap.

**Förutsättningar:** Robin är utloggad och är inte första administratör.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts),
testfallet “ACCESS-06: a signed-in outsider sees an access explanation
without setup controls”.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/usability.spec.ts",
    "caseId": "ACCESS-06"
  },
  "reference": "Chromium 1280 × 720; isolerade testdata och angivna roller",
  "outcomes": [
    "Utanförstående får förklaring utan hushållsskapande och kan logga ut"
  ]
}
```
-->

**Steg:**

1. Välj **Fortsätt med Microsoft** och logga in som Robin.
2. Kontrollera förklaringen och att formuläret för nytt hushåll saknas.
3. Välj **Logga ut**.

**Förväntat resultat:**

- **Du har inte tillgång till hushållet** visas. Robin får inte skapa hushåll.
- Utloggning visar **Välkommen till Skyttel**.

## Utloggning

### ACCESS-07: Utloggning kan göras om efter anslutningsfel

**Syfte:** Kontrollera att misslyckad utloggning inte visas som lyckad.

**Användare:** Alex.

**Förutsättningar:** Hushållet är öppet. Anteckna dess adress. Blockera
`*/api/auth/sign-out` i utvecklarverktygens nätverksblockering.

**Separat operatörsförberedelse:** Operatören installerar enbart den
angivna utloggningsblockeringen före steg 1. Efter felmeddelandet och
läsningen av det fortfarande öppna hushållet, före nästa **Logga ut**
i steg 2, tar operatören bort blockeringen och bekräftar återställningen.
Behåll samma session och öppna hushåll tills användaren faktiskt loggar
ut. Ta även bort blockeringen vid avslut.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts),
testfallet “ACCESS-07: failed logout preserves the session and a retry closes
household access”.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/usability.spec.ts",
    "caseId": "ACCESS-07"
  },
  "reference": "Chromium 1280 × 720; isolerade testdata och angivna roller",
  "outcomes": [
    "Misslyckad utloggning behåller sessionen; nytt försök stänger åtkomst"
  ]
}
```
-->

**Steg:**

1. Välj **Logga ut**. Kontrollera felmeddelandet och den öppna hushållssidan.
2. Be operatören återställa anslutningen och invänta bekräftelse.
   Välj **Logga ut** igen.
3. Öppna den antecknade hushållsadressen.

**Förväntat resultat:**

- Felet säger **Du kunde inte loggas ut. Kontrollera anslutningen och försök
  igen.** Hushållet visas fortfarande och knappen kan användas igen.
- Efter nästa försök visas välkomstsidan och felmeddelandet försvinner.
- Den direkta hushållsadressen visar inloggning utan hushållets innehåll.

### ACCESS-08: Utloggning gäller även en redan öppen flik

**Syfte:** Kontrollera att en öppen hushållssida upptäcker avslutad session.

**Användare:** Alex.

**Förutsättningar:** Hushållet är öppet i två flikar i samma webbläsarprofil.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts),
testfallet “ACCESS-08: logout in another tab closes an already open household”.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/usability.spec.ts",
    "caseId": "ACCESS-08"
  },
  "reference": "Chromium 1280 × 720; isolerade testdata och angivna roller",
  "outcomes": [
    "Öppen flik upptäcker utloggning; ny login når samma hushåll"
  ]
}
```
-->

**Steg:**

1. Välj **Logga ut** i den andra fliken och kontrollera välkomstsidan.
2. Återgå till den första fliken utan att ladda om. Vänta på uppdateringen.
3. Logga in med Alex Google-identitet i den första fliken.

**Förväntat resultat:**

- Första fliken visar välkomstsidan inom tio sekunder. Hushållets rubrik och
  **Nytt objekt** försvinner.
- Ny inloggning öppnar samma hushåll.

## Länka inloggningssätt

### ACCESS-09: Två verifierade inloggningssätt når samma användare

**Syfte:** Kontrollera uttrycklig länkning och att tillgången består.

**Användare:** Alex med Google och en ännu inte använd Microsoft-identitet.

**Förutsättningar:** Alex är inloggad med Google och har ett hushåll.
Anteckna **Ditt Skyttel-användar-ID** och hushållets adress.

**Integrationstest:**
[linking.spec.ts](../../tests/integration/linking.spec.ts),
ACCESS-09, den fullständiga länkningen i webbläsaren. Separat tekniskt
underlag provar samma e-postadress och protokollets behörighetsgränser.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/linking.spec.ts",
    "caseId": "ACCESS-09"
  },
  "reference": "Google → Microsoft med olika adresser; omstart och ny inloggning",
  "outcomes": [
    "Båda verifierade inloggningar listas som kopplade",
    "Microsoft når samma profil-ID och hushåll efter omstart"
  ],
  "evidence": [
    {
      "kind": "technical",
      "spec": "tests/integration/linking.spec.ts",
      "title": "both proven providers return to the same user and household",
      "purpose": "Samma e-postadress länkas bara efter bevis för båda identiteterna"
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Inloggningssätt**. Kontrollera statusen för Google och Microsoft,
   vilket av länkningens två steg som är aktuellt och informationen om
   övergången till Google och återgången hit. Välj **Verifiera Google**
   och bevisa samma Google-identitet som Alex redan använder.
2. Kontrollera att det andra steget är aktuellt och att övergången till
   Microsoft förklaras. Välj **Koppla Microsoft** och logga in med Alex
   Microsoft-identitet inom tio minuter. Kontrollera resultatet.
3. Starta om applikationen med samma databas. Logga ut och logga sedan in
   med Microsoft. Kontrollera användar-ID och hushållets adress.

**Förväntat resultat:**

- Före länkningen visas **Google – kopplat** och **Microsoft – inte kopplat**.
  Stegen visar först verifiering av befintlig inloggning och sedan koppling
  av den andra. Inför varje övergång framgår vilken tjänst som öppnas
  och att användaren kommer tillbaka till Skyttel.
- En verifierad bekräftelse visas tillsammans med **Google – kopplat** och
  **Microsoft – kopplat** efter att båda identiteterna bevisas. Den avslutade
  länkningen visar inte längre ett aktuellt verifieringssteg.
- Microsoft-inloggningen når samma Skyttel-användare och hushåll efter
  omstart. Webbläsarprovet använder olika e-postadresser. Samma adress
  täcks separat av det tekniska underlaget.

### ACCESS-10: Avbruten länkning kräver ny verifiering

**Syfte:** Kontrollera att avbrytande tar bort den pågående verifieringen.

**Användare:** Alex med Google.

**Förutsättningar:** Endast Google är kopplat. Hushållet är öppet.

**Integrationstest:**
[linking.spec.ts](../../tests/integration/linking.spec.ts),
testfallet “ACCESS-10: cancelling a verified link requires fresh proof and
preserves household access”.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/linking.spec.ts",
    "caseId": "ACCESS-10"
  },
  "reference": "Chromium 1280 × 720; isolerade testdata och angivna roller",
  "outcomes": [
    "Avbruten länkning behåller tillgång men kräver nytt identitetsbevis"
  ]
}
```
-->

**Steg:**

1. Öppna **Inloggningssätt**, välj **Verifiera Google** och bevisa Alex
   befintliga identitet. Kontrollera att **Koppla Microsoft** visas.
2. Välj **Avbryt länkning**. Kontrollera beskedet att länkningen är avbruten,
   att tidigare inloggningar och tillgång finns kvar och att en ny verifiering
   behövs för att börja igen. Kontrollera knapparna och ladda om sidan.
3. Välj **Till startsidan** och kontrollera hushållet.
4. Öppna **Inloggningssätt** igen och verifiera Alex Google-identitet på nytt.

**Förväntat resultat:**

- Ett bekräftat avbrytande ger ett tydligt statusbesked. Om den nya
  identiteten redan har verifierats färdigt visas det verifierade resultatet,
  inte ett felaktigt besked om avbrytande.
- Efter avbrytandet visas **Verifiera Google**. **Koppla Microsoft** och
  **Avbryt länkning** försvinner. Endast Google är kopplat efter omladdning.
- Samma hushåll är tillgängligt. Ny verifiering visar **Koppla Microsoft**.

### ACCESS-11: Fel befintlig identitet kan rättas vid länkning

**Syfte:** Kontrollera att fel identitet ger en begriplig väg till nytt försök.

**Användare:** Alex och den extra Google-identiteten.

**Förutsättningar:** Alex är inloggad med Google. Endast Google är kopplat.

**Integrationstest:**
[linking.spec.ts](../../tests/integration/linking.spec.ts),
testfallet “ACCESS-11: the wrong existing identity leaves linking retryable
without changing access”.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/linking.spec.ts",
    "caseId": "ACCESS-11"
  },
  "reference": "Chromium 1280 × 720; isolerade testdata och angivna roller",
  "outcomes": [
    "Fel Google-identitet ger rättningsbart fel och ändrar inte åtkomst"
  ]
}
```
-->

**Steg:**

1. Öppna **Inloggningssätt** och välj **Verifiera Google**. Välj den extra
   Google-identiteten i leverantörens dialog.
2. Kontrollera felet och välj **Verifiera Google** igen. Använd denna gång
   Alex ursprungliga Google-identitet.
3. Välj **Till startsidan**.

**Förväntat resultat:**

- **Länkningen kunde inte slutföras** visas. Ny verifiering är möjlig och
  **Koppla Microsoft** visas inte innan korrekt identitet bevisas.
- Den korrekta verifieringen tar bort felet och visar **Koppla Microsoft**.
  Alex når samma hushåll och behåller sin Skyttel-användare.

### ACCESS-19: Utgången länkning förklarar ny verifiering

**Syfte:** Kontrollera att utgången verifiering har en begriplig fortsättning
utan att ändra användaren, hushållet eller privata förslag.

**Användare:** Alex med Google.

**Förutsättningar:** Endast Google är kopplat. Anteckna Skyttel-användar-ID
och hushållets adress. Lägg ett nytt objekt **Cykeln** med beskrivningen
**Privat förslag före utgången verifiering** i det egna utkastet utan att spara.

**Integrationstest:**
[linking.spec.ts](../../tests/integration/linking.spec.ts),
testfallet “ACCESS-19: expired linking explains fresh proof and preserves
identity and private work”. Det automatiserade fallet flyttar endast den
verkliga testserverns klocka framåt och återställer den före ny verifiering
och vid avslut. Webbläsarens klocka och testets tidsgränser ändras inte.
Identitetsleverantören är en lokal testadapter, inte ett verkligt konto.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/linking.spec.ts",
    "caseId": "ACCESS-19"
  },
  "reference": "Utgången Google-verifiering vid omladdning; eget utkast bevaras",
  "outcomes": [
    "Omladdad utgången länkning kräver nytt bevis och bevarar eget utkast"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Inloggningssätt**, välj **Verifiera Google** och bevisa Alex
   befintliga identitet. Kontrollera att **Koppla Microsoft** visas.
2. Vänta minst elva minuter utan att koppla Microsoft. Ladda om sidan.
   Kontrollera beskedet om utgången verifiering och vägen till ett nytt försök.
3. Välj **Verifiera Google** och bevisa samma identitet på nytt.
4. Välj **Till startsidan**. Kontrollera användar-ID, hushåll och eget utkast.

**Förväntat resultat:**

- Ett tydligt statusbesked förklarar att verifieringen har gått ut och att
  tidigare inloggningar och tillgång finns kvar. **Verifiera Google** går
  att använda; **Koppla Microsoft** visas inte innan ny verifiering.
- Endast Google är kopplat. Ny verifiering tar bort utgångsbeskedet och
  visar **Koppla Microsoft** utan att automatiskt koppla eller spara något.
- Samma Skyttel-användare och hushåll finns kvar. Cykeln och dess beskrivning
  ligger oförändrade i det privata utkastet.

### ACCESS-20: Utgången länkning på öppen sida får en begriplig fortsättning

**Syfte:** Kontrollera att ett försök från en gammal verifierad sida förklarar
utgången verifiering utan att koppla en identitet eller ändra privata förslag.

**Användare:** Alex med Google.

**Förutsättningar:** Endast Google är kopplat. Anteckna Skyttel-användar-ID
och hushållets adress. Lägg **Bilen** med beskrivningen **Privat förslag medan
verifieringen går ut** i det egna utkastet utan att spara.

**Integrationstest:**
[linking.spec.ts](../../tests/integration/linking.spec.ts),
testfallet “ACCESS-20: an expired link on an open page explains fresh proof
after the real rejection”. Samma lokala leverantörsadapter och begränsade
serverklocka som i ACCESS-19 används; klockan återställs före ny verifiering
och vid avslut. Webbläsarens klocka och testets tidsgränser ändras inte.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/linking.spec.ts",
    "caseId": "ACCESS-20"
  },
  "reference": "Utgången verifiering på öppen sida; verkligt avvisat kopplingsförsök",
  "outcomes": [
    "Öppen utgången länkning avvisas utan identitetsbyte eller sparande"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Inloggningssätt**, verifiera Alex Google-identitet och kontrollera
   att **Koppla Microsoft** går att använda.
2. Låt sidan stå öppen i minst elva minuter utan omladdning. Välj sedan
   **Koppla Microsoft** och kontrollera beskedet.
3. Välj **Verifiera Google** och bevisa samma befintliga identitet på nytt.
4. Välj **Till startsidan**. Kontrollera användar-ID, hushåll och eget utkast.

**Förväntat resultat:**

- Försöket avvisas och sidan förklarar att verifieringen har gått ut.
  Tidigare inloggningar och tillgång finns kvar; **Verifiera Google** ersätter
  **Koppla Microsoft**. Inget ogrundat fel om identitet eller leverantör visas.
- Ingen extern övergång eller automatisk koppling sker efter avvisandet.
  Endast Google är kopplat. Ny uttrycklig verifiering tar bort beskedet och
  visar **Koppla Microsoft** igen.
- Återgången visar samma hushåll och Skyttel-användare. Bilen och hela det
  privata utkastet är oförändrade; inget sparas automatiskt.

## Avbruten inloggning

### ACCESS-12: Ett inloggningsfel tillåter ett nytt försök

**Syfte:** Kontrollera att ett fel under inloggning ger begriplig återhämtning.

**Användare:** Alex, utloggad.

**Förutsättningar:** Installationen saknar hushåll. Alex är utloggad.

**Separat förberedelse:** Öppna välkomstsidan och blockera
`*/api/auth/sign-in/social` i utvecklarverktygens nätverksblockering.
Endast starten av inloggningen ska blockeras. Operatören bekräftar
blockeringen före första inloggningsförsöket. Efter användarens synliga
fel, före nästa **Fortsätt med Google** i steg 2, tar operatören bort
blockeringen och bekräftar återställningen. Återställ även vid avslut.
Leverantörsfel provas separat i ACCESS-21.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts),
ACCESS-12, anslutningsavbrott innan inloggningen når leverantören.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/usability.spec.ts",
    "caseId": "ACCESS-12"
  },
  "reference": "Avbrott i inloggningsstarten innan leverantörens verifiering",
  "outcomes": [
    "Inloggningsstartens nätverksfel kan följas av en lyckad ny inloggning"
  ]
}
```
-->

**Steg:**

1. Välj **Fortsätt med Google**, läs övergången och välj
   **Fortsätt till Google**. Kontrollera felmeddelandet.
2. Be operatören återställa anslutningen och invänta bekräftelse.
   Välj **Fortsätt med Google** igen och logga in
   som Alex.

**Förväntat resultat:**

- **Inloggningen kunde inte slutföras** visas. Knappen för Google kan
  användas igen.
- Efter nytt försök öppnas **Skapa ditt hushåll**.

### ACCESS-13: Nekat Google-samtycke stänger tillgången

**Syfte:** Kontrollera att nekat Google-samtycke aldrig ger hushållsåtkomst.

**Användare:** Alex med Google som första administratör.

**Förutsättningar:** Installationen saknar hushåll.

**Separat förberedelse:** Starta
[den kontrollerade identitetsinstallationen](#kontrollerad-identitetsinstallation)
utan `--microsoft`. Skriv `deny-consent` i terminalen före steg 1 och
`allow-consent` före steg 3. Avsluta med `quit` efter fallet.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts), ACCESS-13.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/usability.spec.ts",
    "caseId": "ACCESS-13"
  },
  "reference": "Google som första administratör; nekat och återställt samtycke",
  "outcomes": [
    "Nekat Google-samtycke ger ingen åtkomst; nytt försök skapar hushåll"
  ]
}
```
-->

**Steg:**

1. Välj **Fortsätt med Google** och sedan **Fortsätt till Google**.
2. Läs felmeddelandet. Kontrollera att **Hushållets namn** inte visas.
3. Återställ samtycket enligt förberedelsen. Välj samma inloggningssätt
   och fortsätt till Google igen.
4. Ange **Hushållet Linden** och välj **Skapa hushåll**.

**Förväntat resultat:**

- **Inloggningen kunde inte slutföras** visas efter nekat samtycke.
  Google-knappen kan användas igen. Hushåll kan inte skapas än.
- Godkänt samtycke visar **Skapa ditt hushåll** och skapandet öppnar
  **Hushållet Linden**. Automationen kontrollerar även nekad direktåtkomst.

### ACCESS-22: Nekat Microsoft-samtycke stänger tillgången

**Syfte:** Kontrollera Microsofts egen gräns för nekat samtycke och nytt försök.

**Användare:** Robin med Microsoft som första administratör.

**Förutsättningar:** En separat tom installation; återanvänd inte ACCESS-13.

**Separat förberedelse:** Starta
[den kontrollerade identitetsinstallationen](#kontrollerad-identitetsinstallation)
med `--microsoft`. Skriv `deny-consent` före steg 1 och `allow-consent`
före steg 3. Avsluta med `quit` efter fallet.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts), ACCESS-22.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/usability.spec.ts",
    "caseId": "ACCESS-22"
  },
  "reference": "Microsoft som första administratör; nekat och återställt samtycke",
  "outcomes": [
    "Nekat Microsoft-samtycke ger ingen åtkomst; nytt försök skapar hushåll"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Fortsätt med Microsoft** och sedan **Fortsätt till Microsoft**.
2. Läs felmeddelandet. Kontrollera att **Hushållets namn** inte visas.
3. Återställ samtycket enligt förberedelsen. Välj samma inloggningssätt
   och fortsätt till Microsoft igen.
4. Ange **Hushållet Linden** och välj **Skapa hushåll**.

**Förväntat resultat:**

- **Inloggningen kunde inte slutföras** visas efter nekat samtycke.
  Microsoft-knappen kan användas igen. Hushåll kan inte skapas än.
- Godkänt samtycke visar **Skapa ditt hushåll** och skapandet öppnar
  **Hushållet Linden**. Automationen kontrollerar även nekad direktåtkomst.

### ACCESS-21: Leverantörsfel tillåter ett nytt inloggningsförsök

**Syfte:** Kontrollera återhämtning efter fel hos leverantören, efter
att starten av inloggningen lyckas. ACCESS-12 provar avbrott före den gränsen.

**Användare:** Alex med Google som första administratör, utloggad.

**Förutsättningar:** Installationen saknar hushåll.

**Separat förberedelse:** Starta
[den kontrollerade identitetsinstallationen](#kontrollerad-identitetsinstallation)
utan `--microsoft`. Skriv `provider-down` före steg 1 och `provider-up`
före steg 3. Återställ alltid felet eller avsluta med `quit` efter fallet.

**Integrationstest:**
[usability.spec.ts](../../tests/integration/usability.spec.ts), ACCESS-21.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/usability.spec.ts",
    "caseId": "ACCESS-21"
  },
  "reference": "Leverantörsfel efter lyckad inloggningsstart; återställt Google",
  "outcomes": [
    "Leverantörens fel visas läsbart; nästa verifierade försök lyckas"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Fortsätt med Google** och sedan **Fortsätt till Google**.
2. Läs felet på Skyttels välkomstsida och kontrollera Google-knappen.
3. Återställ leverantören enligt förberedelsen. Välj Google igen och
   fortsätt till leverantören.

**Förväntat resultat:**

- **Inloggningen kunde inte slutföras** är läsbart och Google-knappen
  går att använda igen.
- Ny verifierad inloggning öppnar **Skapa ditt hushåll**.

## Extern övergång och första användning

### ACCESS-14: Övergången förklarar återkomsten och kan avbrytas

**Syfte:** Kontrollera ett begripligt val innan extern inloggning öppnas.

**Användare:** Robin, utloggad och utan medlemskap.

**Förutsättningar:** Installationen saknar hushåll. Använd en smal skärm.

**Integrationstest:**
[access-onboarding.spec.ts](../../tests/integration/access-onboarding.spec.ts),
testfallet “ACCESS-14: external sign-in explains the return and can be
cancelled before leaving”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/access-onboarding.spec.ts",
    "caseId": "ACCESS-14"
  },
  "reference": "320 × 568; avbruten Google-övergång och Microsoft utan medlemskap",
  "outcomes": [
    "Avbryt ger fokus tillbaka; Microsoft-utomstående får ingen åtkomst"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Fortsätt med Google**. Läs övergången utan att fortsätta.
2. Välj **Avbryt** och kontrollera fokus och besked.
3. Välj Microsoft och fortsätt till leverantören. Logga in som Robin.

**Förväntat resultat:**

- Övergången förklarar att inloggningen sker hos Google och sedan återgår
  till Skyttel. Fortsättningsknappen får fokus.
- Avbrottet behåller startsidan och återger fokus till Google-valet.
  Beskedet om avbrottet kan läsas av hjälpmedel.
- Robin ser beskedet om saknad tillgång, sitt användar-ID och inbjudningskod.
  Skapande av hushåll erbjuds inte. Innehållet ryms på den smala skärmen.

### ACCESS-15: Kartans verktyg och frivilliga hjälp ersätter startdialogerna

**Syfte:** Börja med tal, text eller tabell och läsa hjälp när den behövs.

**Användare:** Alex.

**Förutsättningar:** Hushållet finns och kartan är tom. Använd
[den kontrollerade röstinstallationen](voice-assistant.md#controlled-voice-fixture)
med tillgängligt samtal, eller en isolerad installation med verklig röst.
Inget sparat medgivande finns. Kryssa inte i att medgivandet ska sparas.
Det kontrollerade provet ersätter bara externa leverantörer och media;
verklig mikrofon och enhetsbeteende kräver separat mänsklig observation
enligt [mikrofonprovet](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare).

**Integrationstest:**
[access-onboarding.spec.ts](../../tests/integration/access-onboarding.spec.ts),
testfallet “ACCESS-15: first visits use toolbar entries and optional help”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/access-onboarding.spec.ts",
    "caseId": "ACCESS-15"
  },
  "reference": "1280 tal, 390 text, 320 tabell; hjälp utan samtalsstart eller media",
  "outcomes": [
    "Hjälp behåller fokus utan samtal; tal, text och tabell har egna ingångar"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna kartan på dator. Läs kartans verktyg. Öppna
   **Information och hjälp** direkt
   från verktygsfältet. Läs om samtalet och formulären. Tryck Escape.
2. Välj **Prata med Skyttel** i verktygen. Kontrollera medgivanderutan
   före **Godkänn och starta**. Godkänn och
   kontrollera röstrutans **Lyssnar**, utan att textvyn öppnas.
3. Ladda om på telefon med hopfällda verktyg. Upprepa hjälpkontrollen.
   Välj **Skriv till Skyttel**. Läs textvyn utan medgivande eller startat
   samtal. Välj sedan **Nytt samtal**, godkänn medgivandet och kontrollera
   textvyn, utan röstruta eller påslagen mikrofon.
4. Ladda om på en smal telefon. Upprepa hjälpkontrollen. Välj **Tabell**
   direkt i verktygen. Kontrollera hushållets tabell.

**Förväntat resultat:**

- Kartan öppnas med kartans verktyg tillgängliga.
- Hjälpen syns som en knapp även i telefonens hopfällda verktygsfält.
  Hjälpens rubrik får fokus; Escape återför fokus till hjälpknappen.
  Att läsa hjälpen startar inget samtal och kräver inget medgivande.
- Röst startar efter medgivandet. Textvyn öppnas utan att starta ett
  samtal; **Nytt samtal** begär medgivande innan samtalet börjar.
  Tabell öppnar kartarbetet utan att kräva medgivande till samtal.

### ACCESS-16: Utgånget inloggningsförsök kan ersättas

**Syfte:** Ge en begriplig återgång när verifieringen inte längre gäller.

**Användare:** Alex, utloggad.

**Förutsättningar:** Installationen saknar hushåll. I det automatiserade
fallet förbereds ett utgånget försök i den tillfälliga testdatabasen.

**Integrationstest:**
[access-onboarding.spec.ts](../../tests/integration/access-onboarding.spec.ts),
testfallet “ACCESS-16: expired provider verification returns to login and
a fresh attempt succeeds”.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/access-onboarding.spec.ts",
    "caseId": "ACCESS-16"
  },
  "reference": "Utgången Google-verifiering; nytt uttryckligt försök",
  "outcomes": [
    "Utgången verifiering ger ingen åtkomst; nytt försök öppnar starten"
  ]
}
```
-->

**Steg:**

1. Fortsätt till Google. Vänta minst elva minuter hos leverantören innan
   du slutför inloggningen och återkommer till Skyttel.
2. Läs beskedet och börja ett nytt Google-försök. Slutför det direkt.

**Förväntat resultat:**

- Skyttel säger att försöket har gått ut eller inte kan verifieras.
  Hushållsformuläret visas inte och skyddad åtkomst är fortsatt stängd.
- Ett nytt, verifierat försök visar **Skapa ditt hushåll**.

### ACCESS-17: Återkallad tillgång stoppar arbete och bevarar driftåtkomst

**Syfte:** Skilja hushållsmedlemskap från installationens kostnadsbehörighet.

**Användare:** Alex som driftansvarig och en annan administratör.

**Förutsättningar:** Båda har tillgång till hushållet. Alex öppnar kartan.
Den andra administratören använder en separat webbläsarprofil.

**Integrationstest:**
[access-onboarding.spec.ts](../../tests/integration/access-onboarding.spec.ts),
testfallet “ACCESS-17: revoked access retires protected work while the
operator can open costs”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/access-onboarding.spec.ts",
    "caseId": "ACCESS-17"
  },
  "reference": "Öppen oskickad redigering; återkallelse utan förlust av driftåtkomst",
  "outcomes": [
    "Återkallelse stänger kartarbete medan driftansvarig når Månadskostnad"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Nytt objekt** och skriv ett namn utan att skicka.
2. Återkalla Alex tillgång med den andra administratören. Vänta på
   uppdateringen i Alex öppna flik.
3. Öppna **Månadskostnad** som Alex.

**Förväntat resultat:**

- Kartan och den oskickade redigeringen försvinner inom tio sekunder.
  Beskedet om saknad tillgång får fokus. Ny inloggning återställer inte
  medlemskapet.
- Kostnadsöversikten är tillgänglig för Alex utan hushållsmedlemskap.

### ACCESS-18: Utloggning återställer enhetens tema

**Syfte:** Återgå till systemtemat när användaren loggar ut.

**Användare:** Alex.

**Förutsättningar:** Alex är inloggad, hushållets karta är öppen och
enheten använder ljust systemtema.

**Integrationstest:**
[access-onboarding.spec.ts](../../tests/integration/access-onboarding.spec.ts),
ACCESS-18.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/access-onboarding.spec.ts",
    "caseId": "ACCESS-18"
  },
  "reference": "Mörkt karttema, utloggning, /costs och /login-methods",
  "outcomes": [
    "Ljust systemtema återställs efter utloggning även vid skyddade direktadresser"
  ]
}
```
-->

**Steg:**

1. Öppna **Tema** i kartans verktyg och välj **Mörkt**.
2. Öppna **Din profil** och välj **Logga ut**.
3. Öppna installationens adresser `/costs` och `/login-methods` direkt
   medan du är utloggad. Välj Google utan att fortsätta till leverantören.

**Förväntat resultat:**

- Välkomstsidan använder enhetens ljusa systemtema efter utloggningen.
- Båda de skyddade adresserna visar samma ljusa inloggningssida och
  övergång. Fortsättningsknappen får fokus när Google väljs.
- Inloggningssätt och felbesked förblir läsbara i systemtemat.

## Real identity provider preparation

If you are new to provider registration, start with the
[local authentication walkthrough](../development/devcontainer.md#set-up-local-sign-in).

For a manual Codex CLI connection inside the devcontainer, use the
[local assistant setup](setup/assistants.md#manual-local-codex-cli-setup).
It reuses development Google credentials with the port-3301 callback and a
disposable database. Normal development login uses the port-5173 callback
on the same Google client. This live-client check is excluded from CI and
pull request workflows; do not add provider secrets or a Codex login to run
it there. Automated tests retain their synthetic identity providers.

Use a private verification installation with its own persistent disk, secret,
and provider registrations. Register the correct callback URLs and authorize
Google test accounts if its consent screen requires them. Do not post tokens,
subjects, personal email addresses, screenshots with identity details, or
household data in public evidence.

1. Configure a controlled Google identity as first administrator. Complete the
   actual Google redirect and consent flow, create a synthetic household,
   sign out, and sign in again.
2. Restart the production container and confirm that the same household and
   provider identity are retained.
3. Repeat in a separate installation with a personal Microsoft account as
   first administrator. An organizational Microsoft account alone does not
   verify personal-account support.
4. Confirm that another authenticated identity cannot create or access the
   household, including direct API requests. If using matching email
   addresses across providers, confirm they do not merge automatically.
5. Verify logout, denied consent, and a provider error. Confirm that the page
   gives a usable retry path and technical logs contain no secret or identity
   detail.
6. Open **Inloggningssätt**, prove the existing login, then link a controlled
   identity from the other provider. Include a personal Microsoft account.
   Check the verified result, sign out, and sign in with each provider.
   Confirm the same Skyttel user ID and household access. Repeat with denied
   consent and an identity already owned by another Skyttel user; earlier
   access must remain intact.

Record the date, image digest, provider, Microsoft account category, scenarios,
and pass/fail result in private release evidence. State explicitly which
checks are deterministic and which use a real provider. Passing the automated
suite alone is not a claim of live Google or Microsoft sign-in success.

Verify the deployed HTTPS origin and callback URLs before release. Local
HTTP checks do not verify hosted ingress or provider policies for that
deployment. Test physical mobile devices separately when they are part of
the release's target platforms; browser viewport emulation is insufficient.

## Kontrollerad identitetsinstallation

Den här förberedelsen använder samma lokala leverantörsadapter som
integrationstesterna. Den gör inga anrop till verkliga Google- eller
Microsoft-konton och ersätter inte den separata leverantörsverifieringen.
Inloggning, sessioner, hushåll och SQLite använder den verkliga applikationen.

I devcontainern följer du
[anvisningarna för interaktiva fixturer](../development/testing.md#interactive-fixture-processes)
för privat portvidarebefordran och det exakta loopback-ursprunget.

1. Kör `npm run build` från repositoryts rot.
2. Kör följande kommando och håll terminalen öppen:

   ```sh
   npm run test:env -- tsx scripts/manual-access.ts
   ```

3. Öppna adressen i terminalens `origin` i en ny webbläsarprofil. Google
   är första administratör, syntetiska Alex. För ACCESS-22 lägger du till
   `--microsoft` i kommandot; då är Microsoft första administratör, Robin.
   För ACCESS-24 till ACCESS-31 lägger du i stället till `--https`.
   Installationen skapar ett självsignerat certifikat enbart för provet.
   Godkänn det endast för den isolerade lokala testadressen. Det verifierar
   inte produktionsmiljöns certifikat eller proxy.
4. Skriv `provider-down` eller `deny-consent` för det fel fallet anger.
   `provider-up` respektive `allow-consent` återställer felet.
5. Skriv `restart` endast när samma databas ska behållas. Skriv `quit`
   för att stänga installationen och ta bort dess tillfälliga databas.
   Starta kommandot igen inför nästa fall för att få en tom installation.
6. För KAK-24 flyttar `advance-day` den isolerade installationens
   serverklocka framåt ett dygn. Den ändrar inte datorns eller webbläsarens
   klocka. Använd bara kommandot när fallet anger det och avsluta med
   `quit` efteråt. Det simulerar en tidsgräns och bevisar inte faktisk
   gallring eller naturligt förfluten tid.

## Separat tekniskt underlag och observationer

[legacy-login-upgrade.test.ts](../../tests/unit/server/legacy-login-upgrade.test.ts)
provar en verklig SQLite-installation från före den nya valmodellen med
två inloggade enheter, ett påbörjat återanrop, lagrat utkast och sparkvitto.
Efter stopp och kontrollerad uppgradering nekas gamla nycklar och försök.
Ny inloggning och omstart ska behålla samma användare och beständiga arbete
utan att upprepa sparandet. Separata syntetiska processprov kontrollerar
att stopp avslutar pågående text, röst och leveranskanal. Det är tekniskt
underlag; verkliga leverantörer, operatörens värd och skärmläsaruppläsning
behöver separata bevis. Följ operatörens
[uppgraderingsförfarande](../operations/login-upgrade.md) på en disponibel
installation. Använd inte proceduren på återställd kopia som genväg förbi
återställningskontroller.

[remembered-revocation.spec.ts](../../tests/integration/remembered-revocation.spec.ts)
släpper faktiskt fördröjda beständiga HTTPS-kakor efter tidig, sen och
upprepad avstängning. Den gamla kakan kan ligga kvar beständigt, men får
ingen serveråtkomst eller längre tidsgräns. Separata aktuella kakpar
behåller sessionsidentiteten. Andra bindningar och redan kopplade konton
påverkas inte. Pågående callbacks och verifierade kontokopplingsbevis
annulleras. Ägarens resultat kan läsas efter omstart och ny inloggning,
men inte av en annan användare eller från exakt 24 timmar efter ändringen.
Det är syntetiskt tekniskt underlag, inte manuellt utförd driftverifiering.

[cookie-storage-http.test.tsx](../../tests/unit/client/cookie-storage-http.test.tsx)
visar formulärets sparutfall mot verklig HTTP och SQLite, inklusive
förlorad fortsatt-inloggningskontroll och sena svar för en tidigare
användare. Ett äldre osparat val får inte rotera en nyare inloggning.
Det ersätter inte faktisk skärmläsaruppläsning eller Chromium-kakpolicyn.

[remembered-login.spec.ts](../../tests/integration/remembered-login.spec.ts)
kontrollerar vanlig och ihågkommen inloggning före, exakt vid och efter
absolut utgång genom installationens gemensamma klocka. Omstart, fördröjd
kakutgivning, läsningar, förfalskade val och direkta auth-vägar får inte
förlänga tiden. Bekräftelse kräver rätt aktuella sessionsnyckel och bindning;
en korrelationsreferens ensam ger ingen behörighet. Dessa requestdrivna
prov är tekniskt underlag, ingen fysisk omstarts- eller leverantörskontroll.
Ett separat tekniskt Chromium-prov håller ett riktigt bekräftelsesvar över
en ny vanlig inloggning. Det gamla svaret får varken ge framgångsbesked
eller lämna säkerhetskakan beständig efter den nekade efterkontrollen.

[remembered-login.test.ts](../../tests/unit/server/remembered-login.test.ts)
arrangerar inkompatibla lagrade versioner, ändamål, beslutstider och
absoluta gränser. Den offentliga HTTP-gränsen får då bara bekräfta vanlig
inloggning och ska neka åtkomst exakt vid åtta timmar. Det är separat
serverunderlag med styrd installationstid, inga manuellt utförda prov.
Separata prov med olika frister för session och bindning visar att en ny
start följer sessionens serverfrist och inte kan avsluta en levande
session med enbart bindningskakan.

[access.spec.ts](../../tests/integration/access.spec.ts) behåller sex
requestdrivna kontroller: båda installationernas administratörsidentiteter,
samma e-postadress före och efter första administratören, atomärt skapande
med ogiltiga och främmande anrop, verkligt annat hushåll och återkallad
session samt förfalskade återanrop och stängda inloggningsvägar.
De är märkta `@technical` och utför inga manuella formulärflöden.

[linking.spec.ts](../../tests/integration/linking.spec.ts) behåller separat
tekniskt bevis för länkning med samma e-postadress efter omstart. Befintlig
identitet provas med fel identitet, nekat samtycke, leverantörsfel och
avbrytande. Ny identitet provas med upptagen identitet, nekat samtycke,
leverantörsfel och avbrytande. Ursprunglig session, uttryckligt bevis,
anrop från rätt ursprung och förfalskad verifiering provas separat.
Ingen av dessa kontroller ersätter ACCESS-09:s klick, profil och nya
Microsoft-inloggning i webbläsaren.

[browser-binding.spec.ts](../../tests/integration/browser-binding.spec.ts)
provar separat överlappande leverantörssvar för samma och olika användare,
ersatt sessionsnyckel efter omstart och isolering mellan bindningar.
Vid exakt åtta timmar nekas gammal åtkomst, men uttrycklig ny inloggning
kan ersätta en känd utgången bindning och få en egen sessionsfrist.
Gamla kakpar och återanrop förblir nekade; okända kakor och upptagna
levande bindningar utan auth-kaka får ingen ny bindning.
Utloggning under pågående kontokoppling får inte lägga till en identitet.
Ett faktiskt fördröjt HTTPS-svar skriver över webbläsarens auth-kaka efter
ett senare lyckat byte, men ger ingen gammal serveråtkomst. Provet använder
installationsfixturens kontrollerade svar och identiteter; det verifierar
inte verkliga leverantörer eller manuellt skärmläsarbeteende.

[assistants.spec.ts](../../tests/integration/assistants.spec.ts) kontrollerar
tekniskt att saknad bindning nekar sessionskontroll, utloggning och nytt
assistentmedgivande. Ersatt inloggning och utloggning påverkar inte en
separat godkänd MCP-anslutning med fortsatt hushållstillgång.

Tangentbordsfokus, omflöde och läsbara statusbesked är syntetiskt
webbläsarunderlag. Faktiskt upplästa skärmläsarbesked, fysisk mikrofon,
ljud och enhetsbehörigheter måste observeras separat; fallen här gör
ingen sådan verifiering. Verkliga leverantörer dokumenteras i den
separata förberedelsen ovan och ingår inte i den kontrollerade installationen.

## Uttrycklig ny start efter okänd webbläsarkoppling

Förbered ACCESS-32 och ACCESS-33 i en ren profil mot den isolerade
HTTPS-installationen:

```sh
npm run build
npm run test:env -- node --import tsx scripts/manual-access.ts --https
```

Öppna den utskrivna adressen. Lägg endast i denna tomma provprofil in
en syntetisk okänd bindning genom webbläsarens konsol:

```js
document.cookie = `__Host-skyttel_binding=${'f'.repeat(64)}; Path=/; Secure; SameSite=Lax`;
```

Ingen riktig inloggning eller hushållsinformation får finnas i profilen.
Återställ mellan fallen genom att stänga provprofilen och börja med en ny.
Fördröjningen i ACCESS-33 styrs med `hold-reset-check` och
`release-initialization` i testinstallationens terminal. Dessa verktyg
finns endast i provinstallationen och ändrar inte produktionsinställningar.

### ACCESS-32: Okänd koppling kräver en separat uttrycklig omstart

**Syfte:** Ett avvisat inloggningsförsök ger ingen automatisk ny bindning,
inloggning eller återanvänt ihågkommet val.

**Användare:** Alex utan inloggning, bredd 1280 pixlar.

**Förutsättningar:** Den syntetiska okända bindningen enligt förberedelsen.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/login-binding-reset.spec.ts",
    "caseId": "ACCESS-32"
  },
  "reference": "Ren HTTPS-provprofil med en syntetisk okänd bindningskaka, 1280 pixlar och syntetisk Google-provider. Automatiken kontrollerar att ingen providerstart sker före det nya uttryckliga valet.",
  "outcomes": [
    "Första försöket stoppas utan bekräftad inloggning eller falskt återställningsbesked.",
    "Separat uttrycklig rensning återför fokus till Google-knappen utan automatisk providerstart.",
    "Nästa inloggningsval börjar avmarkerat och en ny vanlig inloggning kan slutföras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna `/login`, välj **Fortsätt med Google**, markera **Kom ihåg mig**
   och välj **Fortsätt till Google**.
2. Läs att säker inloggning inte kan bekräftas. Kontrollera att sidan
   inte påstår en databasåterställning eller en lyckad inloggning.
3. Läs omfattningen och välj **Börja om i den här webbläsaren**.
4. Kontrollera att fokus återgår till **Fortsätt med Google** och att
   inget providerfönster öppnas automatiskt.
5. Välj Google på nytt. Kontrollera att **Kom ihåg mig** är avmarkerat.
   Lämna det avmarkerat och välj **Fortsätt till Google**.

**Förväntat resultat:** Första försöket stoppas. Rensningen sker först
efter den separata handlingen. **Klart för en ny inloggning. Välj Google
eller Microsoft igen.** visas. Nästa providerhandling skapar en vanlig
inloggning och visar **Skapa ditt hushåll**. Ingen annan webbläsare eller
hushållsinformation påverkas.

### ACCESS-33: Avbruten rensning bevarar en annan fliks nya inloggning

**Syfte:** Ett sent kontrollsvar får inte rensa en nyare bindning eller
dess session.

**Användare:** Alex i två flikar i samma provprofil.

**Förutsättningar:** Samma okända syntetiska bindning som ACCESS-32. Kör
`hold-reset-check` före den första rensningen. Använd 1280 pixlar.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/login-binding-reset.spec.ts",
    "caseId": "ACCESS-33"
  },
  "reference": "Två verkliga Chromium-flikar delar HTTPS-kakor och Web Locks. Provinstallationen håller det första reset-check-svaret efter serverkontrollen och släpper det först efter en ny bekräftad inloggning i den andra fliken.",
  "outcomes": [
    "Navigering avbryter den väntande rensningen och frigör webbläsarlåset.",
    "Den andra fliken kan uttryckligen rensa den gamla kopplingen och skapa en ny vanlig inloggning.",
    "Det sena gamla svaret varken rensar den nya bindningen eller avslutar den nya sessionen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ ACCESS-32 till det avvisade första försöket. Välj **Börja om i
   den här webbläsaren** och vänta tills terminalen visar `reset_held`.
2. Skriv `/cookies` i adressfältet i samma flik för att lämna inloggningen.
3. Öppna `/login` i den andra fliken. Gör det avvisade försöket och välj
   uttryckligen **Börja om i den här webbläsaren** där.
4. Välj Google på nytt, lämna **Kom ihåg mig** avmarkerat och logga in.
   Vänta på **Skapa ditt hushåll**.
5. Kör `release-initialization`. Ladda startsidan i den första fliken.

**Förväntat resultat:** Den andra fliken behåller sin nya inloggning
efter det sena svaret. Den första fliken visar samma inloggade tillstånd
vid återbesök. Ingen automatisk ny providerhandling startas av det gamla
kontrollsvaret. Faktisk skärmläsaruppläsning ingår inte i detta prov.
