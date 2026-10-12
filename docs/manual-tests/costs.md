# Manuella testfall för månadskostnad

Fallen provar installationens kostnadsöversikt, mätningarnas osäkerhet,
månadens antaganden och åtkomst. Anteckna commit, webbläsare och godkänt
eller underkänt resultat. De länkade integrationstesterna verifierar fallen.

## Konfigurerade användare

- Alex Exempel är installationens konfigurerade driftansvarige och använder
  kontrollerad Google-inloggning.
- Robin Exempel använder kontrollerad Microsoft-inloggning i en separat
  webbläsarprofil. Alex ger Robin hushållets administratörsroll i KOST-03.
- Hushållets administratörsroll ger inte tillgång till kostnadsöversikten.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

1. Starta den [kontrollerade installationen](#controlled-cost-fixture).
   Följ portkopplingen och använd exakt den utskrivna adressen. Inga verkliga
   leverantörskonton, modellnycklar eller mikrofoner behövs.
2. Starta en ny installation för varje fall. Behåll samma databas och
   webbläsarfönster inom ett falls omstartsprov.
3. KOST-01 och KOST-02 börjar med Google-inloggning som Alex. Skapa
   **Kostnadsprov**, välj **Skriv till Skyttel**, **Nytt samtal** och
   **Godkänn och starta** i medgivanderutan. KOST-03 och KOST-04 börjar
   utan hushåll.
4. Terminalkommandon nedan skrivs i startguidens terminal. Avsluta varje
   fall med `quit` och kontrollera borttagen tillfällig katalog enligt guiden.

## Underlag och beständighet

### KOST-01: separata kostnader och månadens antaganden återläses efter omstart

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/costs.spec.ts",
    "caseId": "KOST-01"
  },
  "reference": "1280×900; ljust tema. KOST-04 växlar till ljust efter fördröjt sparande. Kontrollerade leverantörer, inga betalda anrop.",
  "outcomes": [
    "Uppdelade kostnader och månadsantaganden består efter omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Förstå uppdelning, totalsumma, prisunderlag och sparade
månadsantaganden utan att förväxla uppskattning med faktura.

**Användare:** Alex.

**Förutsättningar:** Ny installation med standardläget `text known`.

**Integrationstest:**
[costs.spec.ts](../../tests/integration/costs.spec.ts),
“KOST-01: separata kostnader och månadens antaganden återläses efter omstart”.

**Separat operatörsförberedelse:**

Använd den befintliga [kostnadsinstallationen](#controlled-cost-fixture).
Vid UI-steg 1, efter **Lyssnar**: kör `delegate` i terminalen. Det går
genom serverns kontrollerade modellarbete. Bekräfta levererat uppdrag.
Vid steg 2: kör `usage 90` och meddela **90 sekunders förbrukning förberedd**
innan användaren stänger av mikrofonen. Vid steg 8: kör `restart`, behåll
samma databas och invänta omstartens bekräftelse innan användaren laddar om.
Följ startguidens återställning mellan fall och `quit` efter provningen.

**Steg:**

1. Välj **Prata med Skyttel**, vänta på **Lyssnar**. Be operatören leverera det
   kontrollerade kostnadsuppdraget och invänta bekräftelse. Vänta på **Det
   kontrollerade kostnadsprovet är klart.**
2. Be operatören förbereda förbrukningen och invänta bekräftelse. Stäng av
   mikrofonen med **Prata med Skyttel**. Vänta tills röstrutan har försvunnit
   och röstanslutningen har stängts, några sekunder senare.
3. Öppna **Månadskostnad**. Kontrollera aktuell månad i UTC, Render **72,50 SEK
   (7,25 USD)**, Live **0,75 SEK (0,075 USD)** och Sol **2,17 SEK (0,217
   USD)**. Öppna **Visa mätvärden för Live** och **Visa mätvärden för textmodell**.
   Live visar 90 rapporterade sekunder. Sol visar 100 000 indatatoken med
   cache och resonemang separat.
4. Kräv delsumman **75,42 SEK (7,542 USD)** före de tre raderna. Öppna **Visa
   driftantagandet**. Läs att Render avser hel månad, tidigare förbrukning är
   okänd och cirka 200 kronor är ett riktmärke utan automatisk spärr.
5. Öppna modellpriserna under **Prisunderlag**. Kontrollera datum, enheter,
   tabell, källor och uttryckligt antagande om 10 SEK per USD. Startkrediten för
   Live ska inte läggas på en gång till.
6. Öppna **Ändra månadens antaganden**, ändra **SEK per USD** till 11 och välj
   **Spara månadens antaganden**. Kräv **82,96 SEK (7,542 USD)**.
7. Välj föregående månad. Dess förval är fortfarande 10 SEK per USD och tidigare
   förbrukning är okänd. Återgå till aktuell månad; den har 11.
8. Be operatören starta om samma installation och invänta bekräftelse. Ladda om
   webbläsaren och öppna mätvärdena igen. Kontrollera samma uppdelning, ändrade
   valutantagande och delsumman **82,96 SEK (7,542 USD)**.

**Förväntat resultat:**

- Render, Live och Sol hålls isär. Cache ersätter motsvarande vanlig
  indata och resonemang läggs inte till utdata igen.
- Månadsantagandet och mätningarna består efter omstart. En ändring av
  aktuell månad ändrar inte föregående månads antagande.
- Ofullständig täckning framgår även när alla registrerade försök har
  slutvärden. Uppskattningen är ingen slutlig leverantörsfaktura.

### KOST-02: saknade slutvärden och hämtningsfel bevarar känt underlag utan dubbelräkning

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/costs.spec.ts",
    "caseId": "KOST-02"
  },
  "reference": "1280×900; ljust tema. KOST-04 växlar till ljust efter fördröjt sparande. Kontrollerade leverantörer, inga betalda anrop.",
  "outcomes": [
    "Saknade slutvärden förblir osäkra; hämtningsfel behåller känt underlag utan dubbelräkning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Visa okänd förbrukning och bevara tidigare kända värden vid fel.

**Användare:** Alex.

**Förutsättningar:** Ny installation. Kör `text missing` före meddelandet.

**Integrationstest:**
[costs.spec.ts](../../tests/integration/costs.spec.ts),
“KOST-02: saknade slutvärden och hämtningsfel bevarar känt underlag utan
dubbelräkning”.

**Separat operatörsförberedelse:**

Använd den befintliga [kostnadsinstallationen](#controlled-cost-fixture).
Efter **Lyssnar** i UI-steg 2: kör `usage 12`, `usage 15`, `usage 15` och
`finalize off`, en rad i taget. Meddela **Kumulativ förbrukning utan
slutvärde förberedd** innan mikrofonen stängs av. Vid steg 4: kör
`restart`, behåll samma databas och invänta omstartens bekräftelse före
omladdningen. Behåll det separat förberedda `text missing` och guidens
hämtningsfel.

När användaren har läst det återhämtade underlaget och delsumman efter
omstarten i steg 4, före **Uppdatera underlaget** i steg 5: följ guidens
[kontrollerade hämtningsfel](#a-failed-refresh-without-losing-the-last-values)
och installera Chromium Network request blocking för
`*/api/operator/costs?*`. Meddela **Hämtningsfelet är förberett**. Behåll
sidan öppen; ladda inte om hela sidan medan blockeringen gäller. Först
efter användarens synliga fel, inaktuella tidigare värden och oförändrade
delsumma i steg 5: ta bort blockeringen och meddela **Hämtningen är
återställd** före nästa **Uppdatera underlaget**. Avsluta enligt startguiden
efter den lyckade återhämtningen.

**Steg:**

1. Skicka **Prova kostnadsunderlaget.** och vänta på det kontrollerade svaret.
2. Välj **Prata med Skyttel** och vänta på **Lyssnar**. Be operatören förbereda
   den kumulativa förbrukningen utan slutvärde och invänta bekräftelse. Stäng av
   mikrofonen och vänta tills röstanslutningen har stängts.
3. Öppna **Månadskostnad** och **Visa mätvärden för Live** samt **Visa mätvärden
   för textmodell**. Live ska visa ett försök, 15 rapporterade sekunder, osäkert
   slutunderlag och **0,13 SEK (0,0125 USD)**. Sol ska visa **Belopp saknas**
   och saknade mätvärden.
4. Läs texten om ofullständig delsumma. Anteckna delsumman. Be operatören starta
   om samma installation och invänta bekräftelse. Ladda om; kräv samma kända
   underlag och osäkerhet.
5. Be operatören förbereda hämtningsfelet och invänta bekräftelse. Välj
   **Uppdatera underlaget**. Kräv synligt fel och inaktuella tidigare värden
   med samma delsumma. Be operatören återställa hämtningen och invänta
   bekräftelse. Välj **Uppdatera underlaget** igen; kräv samma delsumma och
   att felstatus försvinner.

**Förväntat resultat:**

- Kumulativa 12, 15 och 15 sekunder är 15, inte 42 eller tre försök.
- Saknad slutmätning och helt saknade värden förblir osäkra efter omstart.
  Okänt belopp presenteras inte som säker nollkostnad.
- Ett hämtningsfel bevarar kända värden med synlig felstatus. Återhämtning
  tar bort felstatus utan extra registrerad förbrukning.

### KOST-04: okänt sparresultat återläses med fokus och fullständiga detaljer

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/costs.spec.ts",
    "caseId": "KOST-04"
  },
  "reference": "1280×900; ljust tema. KOST-04 växlar till ljust efter fördröjt sparande. Kontrollerade leverantörer, inga betalda anrop.",
  "outcomes": [
    "Tappat svar efter sparande återhämtas, historik består efter omstart och fokus skyddas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Återhämta ett sparat antagande efter tappat svar utan en extra
skrivning och nå hela flödet med tangentbord på mobil och dator.

**Användare:** Alex, utan hushåll.

**Förutsättningar:** Ny kontrollerad installation och 1280×900.

**Separat förberedelse:** Operatören installerar
[styrt kostnadssvar](#styrt-kostnadssvar) och armerar det tappade svaret
före steg 3. Det tappas först sedan servern har svarat med framgång.
Operatören återställer `fetch` och kör `restart` i installationens terminal
med samma databas före omladdningen i steg 5. Operatören installerar
fördröjningen före sparandet av 14 i steg 7 och släpper det svaret
först när testaren har valt **Ljust** och bekräftat temaknappens fokus.
Återställ `fetch` efter varje prov eller ladda om sidan. Avsluta
installationen med `quit`.

**Integrationstest:**
[costs.spec.ts](../../tests/integration/costs.spec.ts), KOST-04.
390px och 320px har egna fall KOST-05 och KOST-06 nedan.

**Steg:**

1. Logga in som Alex och öppna `/costs` utan att skapa hushåll. Kräv
   delsumman 72,50 SEK och texten om separat driftbehörighet.
2. Öppna **Ändra månadens antaganden**. Fokus ska stå i **SEK per USD**.
   Ange 12, välj **Uppdatera underlaget** och kontrollera att 12 står kvar.
3. Invänta operatörens bekräftelse på förberedelsen av det tappade svaret
   och välj **Spara månadens antaganden**.
   Kräv **Sparresultatet är okänt**, spärrat sparande och äldre känd summa.
4. Välj **Uppdatera underlaget**. Kräv 87,00 SEK och besked att aktuella
   antaganden är hämtade. Fokus ska stanna på **Uppdatera underlaget**.
   Inget nytt sparande ska behövas.
5. Invänta operatörens bekräftelse på återställningen och omstarten med
   samma databas. Ladda om sidan.
   Öppna **Tidigare antaganden för månaden**. Version 1 har kurs 10 och
   version 2 kurs 12.
6. Öppna redigeringen, ange 13 och spara. Fokus återgår till **Ändra
   månadens antaganden**. Öppna och stäng redigeringen; fokus återgår igen.
7. Invänta operatörens bekräftelse på fördröjningen. Spara 14.
   Öppna **Tema** och välj **Ljust** medan sparandet pågår.
   Kontrollera temaknappens fokus och be operatören släppa svaret.
   Invänta bekräftelsen och sparbeskedet; temaknappens fokus ska bestå.
8. Öppna mätvärden och hela prisunderlaget. Använd Tab och piltangenter
   för pristabellen. Kontrollera läsbarhet, synligt fokus och att övrigt
   innehåll inte kräver rullning i sidled.

**Förväntat resultat:**

- Ett okänt svar presenteras varken som säker framgång eller säkert fel.
  Den verkliga sparade versionen och dess historik återläses efter omstart.
- Driftbehörighet fungerar utan hushåll. Månadens antaganden är fristående
  från hushållets karta och byter inga leverantörstjänster.
- Öppning, sparande och stängning behåller ett begripligt tangentbordsfokus.
  Belopp, osäkerhet, mätvärden och fullständiga priser går att läsa på alla
  provade bredder. Fysiska enheter, verklig zoom och skärmläsare dokumenteras
  separat; automatiska prov innebär inte fullständig WCAG-överensstämmelse.

### KOST-05: 390px bevarar återhämtning, priser och senare fokus

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/costs.spec.ts",
    "caseId": "KOST-05"
  },
  "reference": "390×900; mörkt efter fördröjt sparande. Felgräns, fokus och prisrullning skyddas.",
  "outcomes": [
    "390px behåller återhämtning, synligt besked, tabellrullning och senare fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skydda läsbara priser och tangentbordsarbete vid smal bredd.

**Användare:** Alex, utan hushåll.

**Förutsättningar:** Starta ny [kontrollerad installation](#controlled-cost-fixture).
Ställ innehållsytan på 390×900; detta är syntetiskt omflödesprov.

**Separat förberedelse:** Operatören använder
[styrt kostnadssvar](#styrt-kostnadssvar) för tappat svar före steg 1
och fördröjt svar före sparandet av 14 i steg 3. Operatören släpper
fördröjningen först efter bekräftat framgångsrikt svar som hålls för
just detta sparande enligt guiden, testarens val av **Mörkt** och läsning av
temaknappens fokus. Återställ `fetch` och avsluta med `quit`.

**Integrationstest:** [costs.spec.ts](../../tests/integration/costs.spec.ts),
KOST-05.

**Steg:**

1. Följ KOST-04 steg 1–4 på 390px: ange 12, tappa svaret efter
   verkligt sparande, läs okänt utfall och hämta aktuellt underlag.
2. Öppna redigeringen, ange 13 och spara. Kräv sparbesked och fokus på
   **Ändra månadens antaganden**. Öppna och stäng redigeringen; samma
   knapp får fokus igen.
3. Invänta operatörens bekräftelse på fördröjningen, ange 14 och spara.
   Invänta operatörens bekräftelse att just detta framgångsrika svar hålls.
   Öppna **Tema**, välj **Mörkt** och kontrollera temaknappens fokus.
   Be operatören släppa svaret. Invänta bekräftelsen och sparbeskedet;
   temaknappen ska behålla fokus när beskedet kommer.
4. Öppna **Prisunderlag** och modellpriserna. Fokusera modelltabellens
   rullbara region och tryck högerpil. Nå alla kolumner och priser utan
   att hela sidan måste rullas i sidled.

**Förväntat resultat:**

- Det tappade svaret ger okänt utfall med spärrat sparande. Uppdatering
  återläser 87,00 SEK och tillåter fortsatt arbete utan upprepat sparande.
- Priser och sparbesked är läsbara. Öppning och stängning återger fokus;
  fördröjd framgång tar inte fokus från senare temaåtgärd.

### KOST-06: 320px bevarar återhämtning, priser och senare fokus

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/costs.spec.ts",
    "caseId": "KOST-06"
  },
  "reference": "320×900; ljust efter fördröjt sparande. Felgräns, fokus och prisrullning skyddas.",
  "outcomes": [
    "320px behåller återhämtning, synligt besked, tabellrullning och senare fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skydda läsbara priser och tangentbordsarbete vid smal bredd.

**Användare:** Alex, utan hushåll.

**Förutsättningar:** Starta ny [kontrollerad installation](#controlled-cost-fixture).
Ställ innehållsytan på 320×900; detta är syntetiskt omflödesprov.

**Separat förberedelse:** Operatören använder
[styrt kostnadssvar](#styrt-kostnadssvar) för tappat svar före steg 1
och fördröjt svar före sparandet av 14 i steg 3. Operatören släpper
fördröjningen först efter bekräftat framgångsrikt svar som hålls för
just detta sparande enligt guiden, testarens val av **Ljust** och läsning av
temaknappens fokus. Återställ `fetch` och avsluta med `quit`.

**Integrationstest:** [costs.spec.ts](../../tests/integration/costs.spec.ts),
KOST-06.

**Steg:**

1. Följ KOST-04 steg 1–4 på 320px: ange 12, tappa svaret efter
   verkligt sparande, läs okänt utfall och hämta aktuellt underlag.
2. Öppna redigeringen, ange 13 och spara. Kräv sparbesked och fokus på
   **Ändra månadens antaganden**. Öppna och stäng redigeringen; samma
   knapp får fokus igen.
3. Invänta operatörens bekräftelse på fördröjningen, ange 14 och spara.
   Invänta operatörens bekräftelse att just detta framgångsrika svar hålls.
   Öppna **Tema**, välj **Ljust** och kontrollera temaknappens fokus.
   Be operatören släppa svaret. Invänta bekräftelsen och sparbeskedet;
   temaknappen ska behålla fokus när beskedet kommer.
4. Öppna **Prisunderlag** och modellpriserna. Fokusera modelltabellens
   rullbara region och tryck högerpil. Nå alla kolumner och priser utan
   att hela sidan måste rullas i sidled.

**Förväntat resultat:**

- Det tappade svaret ger okänt utfall med spärrat sparande. Uppdatering
  återläser 87,00 SEK och tillåter fortsatt arbete utan upprepat sparande.
- Priser och sparbesked är läsbara. Öppning och stängning återger fokus;
  fördröjd framgång tar inte fokus från senare temaåtgärd.

## Åtkomst

### KOST-03: endast driftansvarig har åtkomst oberoende av hushållets roller

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/costs.spec.ts",
    "caseId": "KOST-03"
  },
  "reference": "1280×900; ljust tema. KOST-04 växlar till ljust efter fördröjt sparande. Kontrollerade leverantörer, inga betalda anrop.",
  "outcomes": [
    "Endast driftansvarig får kostnadsåtkomst; återkallat hushållsmedlemskap påverkar inte denna behörighet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skilja installationens kostnadsbehörighet från hushållstillgång.

**Användare:** Alex och Robin i skilda webbläsarprofiler.

**Förutsättningar:** Ny installation utan hushåll. Följ guidens
[två identiteter](#two-identities).

**Integrationstest:**
[costs.spec.ts](../../tests/integration/costs.spec.ts),
“KOST-03: endast driftansvarig har åtkomst oberoende av hushållets roller”.

**Separat operatörsförberedelse:**

Följ [två identiteter](#two-identities). Efter att Alex skapat hushållet
i UI-steg 2: kör `identity robin` före Microsoft-inloggningen i den andra
profilen. Meddela **Robins testidentitet är vald**. Byt inte hushåll eller
databas under rollprovet; behåll skilda verifierade sessioner. Avsluta
startguiden med `quit` och kontrollera städningen efter fallet.

**Steg:**

1. Logga in som Alex. Öppna **Månadskostnad** redan före hushållets start.
   Kontrollera att Render-underlaget visas.
2. Återgå och skapa Kostnadsprov. Be operatören förbereda Robins inloggning och
   invänta bekräftelse. Logga in som Robin med Microsoft i den andra profilen.
   Kopiera Robins användar-ID.
3. Bjud in Robin från Alex medlemskapssida. Acceptera som Robin och ge sedan
   Robin administratörsrollen som Alex.
4. Robin ska sakna länken **Månadskostnad**. Skriv `/costs` efter
   installationens adress i Robins profil; inga kostnadsuppgifter visas.
5. Öppna kostnadsöversikten som Alex. Återkalla Alex hushållstillgång som Robin
   på medlemskapssidan. Ladda om Alex kostnadssida; kostnadsunderlaget är
   fortfarande åtkomligt.
6. Öppna en extra flik i Alex profil och logga ut där. Återgå till
   kostnadsfliken och välj **Uppdatera underlaget**, om den fortfarande visas.
   Skyddade belopp och kostnadslänken ska försvinna.

**Förväntat resultat:**

- Driftansvarig når kostnader utan hushåll, även efter återkallat medlemskap.
- Hushållets administratör får inte läsa eller ändra installationens
  kostnader. Automationen provar även nekade direkta HTTP-begäranden.
- Utloggning tömmer skyddat underlag; inaktuella belopp behålls bara vid
  vanliga anslutningsfel, aldrig efter förlorad åtkomst.

## Controlled cost fixture

Use this launcher for reproducible browser checks of installation costs.
The app, authentication, OAuth/MCP, usage recording and SQLite are real.
Only external identity/model responses and browser media are controlled.
No real provider requests, credentials, microphone or paid usage are needed.
Integration tests cover these controlled scenarios. Manual repetition is
optional troubleshooting and is not required by #97.

### Start and stop

Run from the repository root in the devcontainer:

```sh
npm ci
npm run build
node --import tsx scripts/manual-costs.ts
```

Wait for the JSON `ready` event containing `origin` and `directory`. Keep the
terminal open. Forward that random port privately in VS Code's **Ports**
panel, using the same host port. Open the exact printed
`http://127.0.0.1:PORT` address in a new private browser window.

The launcher accepts no arguments or database path, ignores the private
application environment file, and creates a fresh private temporary database.
Google signs in as **Alex Exempel**, the configured installation operator.
Create **Kostnadsprov** through the ordinary form when a case needs a map.
Use only invented information. No demo household is installed automatically.

Commands below go into the launcher's terminal, not a shell. Use `restart`
to restart the server with the same database, origin and browser cookies.
Reload the browser afterward. Use `quit` when finished; require the `closed`
event and check that its `removedDirectory` no longer exists. Start a new
launcher for each case. Never reuse a real installation for these controls.

### Controlled measurements

<!-- markdownlint-disable MD013 -->
| Command | Effect |
| --- | --- |
| `text known` | Future Sol replies report the worked example below; this is the default. |
| `text missing` | Future Sol replies succeed without a usage object. |
| `text held` | Future Sol requests wait until released or interrupted by the app. |
| `release` | Release held requests with the known measurements. |
| `delegate` | Send the synthetic request through the active voice session to the actual Sol backend. |
| `usage 90` | Send cumulative reported seconds to the single active Live session. Repeating a value does not mean extra usage. |
| `finalize off` | Suppress the final Live measurement when the app closes the session. |
| `finalize on` | Restore final measurements, using the latest `usage` value; this is the default. |
| `identity robin` | Future external sign-ins identify Robin Exempel; existing sessions remain unchanged. Use Microsoft for Robin. |
| `identity alex` | Restore Alex for future sign-ins. Use Google for Alex. |
| `restart` | Cancel held requests and restart the same installation. |
| `quit` | Stop the application and remove its temporary directory. |
<!-- markdownlint-enable MD013 -->

To generate Sol usage, choose **Skriv till Skyttel**, then **Nytt samtal**,
select **Godkänn och starta** in the consent box, and send
**Prova kostnadsunderlaget.** The fixed response is
**Det kontrollerade kostnadsprovet är klart.** No map change is proposed.

To generate Live usage, choose **Prata med Skyttel**, wait for **Lyssnar**
in the voice box, then enter `usage` commands in the terminal. Choose
**Prata med Skyttel** again to turn the microphone off, and keep the tab
active until the voice connection closes a few seconds after Skyttel is
quiet. The fixture supplies silent media
tracks; it neither listens nor speaks. A new session requires a new start
action. Set `finalize off` before stopping to preserve provisional usage.

KOST-01 uses `delegate` after voice startup. It sends the same synthetic
request as a voice transcript fragment and delegation event. The actual
server invokes Sol through the shared assistant, so both categories
come from one voice task. Wait for the fixed response before stopping.

The known Sol example is 100,000 input tokens: 20,000 cache reads,
10,000 cache writes and 70,000 ordinary input. Its 5,000 output tokens
already include 2,000 reasoning tokens. At the recorded Standard rates,
this is `0.14 + 0.002 + 0.025 + 0.05 = 0.217 USD`.
A final 90-second Live session costs an estimated `0.075 USD`.
Together with the default full-month Render assumption of `7.25 USD`,
the estimated subtotal is `7.542 USD`, or `75.42 SEK` at the explicit
assumption of 10 SEK/USD. Changing that assumption to 11 gives `82.96 SEK`
after presentation rounding. A fresh installation still shows incomplete
month coverage; the known example does not establish earlier usage.

### A failed refresh without losing the last values

After opening **Månadskostnad**, use Chromium's developer tools network
request blocking to block `*/api/operator/costs?*`. Keep the page open
and select **Uppdatera underlaget**. The page must show an error and retain
the previously fetched values as stale. Remove the block and refresh again.
Do not reload the whole page while blocking: that tests initial loading
instead of retaining already fetched values.

The Playwright equivalent returns a controlled HTTP 503 for that same
browser request. It asserts visible stale status and unchanged values,
then removes the failure and verifies recovery.

### Two identities

Keep Alex's private window open. Enter `identity robin` and use a separate
browser profile or a different browser with its own cookies. Sign in with
Microsoft there. Copy Robin's Skyttel user ID and use Alex's ordinary
membership page to invite that ID. Accept the invitation as Robin, then
promote Robin to administrator as Alex. This gives Robin household
administration, not installation cost access.

`identity` changes only future sign-ins. It does not impersonate another
user in an existing session. To sign in again as Alex, enter
`identity alex` first. Follow the linked manual cases for role changes
and sign-out; all changes affect only this disposable installation.

The exact browser workflows are in
[KOST-01–KOST-04](costs.md). Current operator configuration,
rate maintenance and limits are described in the
[operator runbook](../operations/costs.md).

## Styrt kostnadssvar

Operatören kör följande i webbläsarens konsol på den disponibla
installationens kostnadssida före det angivna sparandet i KOST-04–06.
Testaren utför därefter fallets UI-steg. `drop` tappar nästa framgångsrika
svar efter verkligt sparande; `hold` håller nästa framgångsrika svar tills
det släpps.
Felaktiga svar passerar normalt. Välj läge före sparande, ett i taget.
Inga riktiga kostnadskonton eller modellnycklar behövs.

```javascript
(() => {
  const original = window.fetch.bind(window);
  let mode;
  window.armCostReply = next => { mode = next; };
  window.restoreCostReplies = () => { window.fetch = original; };
  window.fetch = async (...args) => {
    const input = args[0];
    const url = input instanceof Request ? input.url : input;
    const method = args[1]?.method ?? input?.method ?? 'GET';
    if (new URL(url, location.href).pathname === '/api/operator/costs/assumptions'
        && method === 'POST' && mode) {
      const selected = mode;
      mode = undefined;
      const response = await original(...args);
      if (!response.ok) return response;
      if (selected === 'hold') {
        await new Promise(resolve => { window.releaseCostReply = resolve; });
        return response;
      }
      throw new TypeError('Synthetic lost reply after completed cost save');
    }
    return original(...args);
  };
})();
window.armCostReply('drop');
```

Efter återhämtning och eventuellt omstartsprov installerar operatören
koden igen vid behov. Först när alla tidigare utfall är kända och inget
äldre svar hålls, kör operatören `delete window.releaseCostReply` i
Console och därefter `window.armCostReply('hold')` före det fördröjda
sparandet av 14. Ta aldrig bort referensen till ett fortfarande väntande
äldre svar. Bekräfta installation och armning före UI-sparandet; invänta
inte det genomförda svaret före knappen.

Följ den nya POST-begäran till kostnadsantaganden i nätverkspanelen och
kontrollera att dess indata avser den aktuella månaden och kursen 14.
Efter testarens **Spara månadens antaganden**, invänta dess verkliga
framgångsrika HTTP-svar. Läs
`typeof window.releaseCostReply === 'function'` i Console tills värdet
är sant. Referensen tilldelas först efter det framgångsrika svaret i
koden ovan; den borttagna äldre referensen kan inte bekräfta detta svar.
Bekräfta för testaren att just detta genomförda sparandes svar
hålls; om det inte kan bekräftas, släpp inget äldre svar och rapportera
att förberedelsen inte är klar.

Testaren väljer därefter fallets tema och kontrollerar temaknappens
senare fokus medan samma svar fortfarande hålls. Först på testarens begäran
kör operatören `window.releaseCostReply()` och bekräftar att svaret är släppt.
Testaren läser sparbeskedet och kontrollerar samma senare fokus.
Operatören avslutar alltid med `window.restoreCostReplies()` eller
omladdning. Starta en ny fixture per fall; behåll samma databas bara inom
dess omstartsprov. Vanligt offlineläge
provar inte ett tappat svar efter slutförd transaktion.

## Referenser och accepterad förlust

KOST-04 behåller 1280px och hela kedjan med tappat verkligt sparresultat,
återhämtning, omstart och versionshistorik. De befintliga 390px- och
320px-scenarierna får KOST-05 och KOST-06. De behåller verkligt tillämpat
sparande med tappat svar, återhämtning, synlig återkoppling, redigeringens
fokus, fördröjd framgång utan stulen fokus och pristabellens rullning.
Deras upprepade omstart och versionshistorik tas bort. Fel som bara uppstår
vid dessa bredder i den kombinerade omstarts- och historikkedjan kan därför
undgå referensen. Inget ID pensioneras eller återanvänds.

KOST-01–03 behåller ofullständiga mätningar, hämtningsfel och separat
driftåtkomst. Det separata
[tekniska mätunderlaget](../../tests/browser/accessibility-measurements.test.tsx)
provar färgtolkning och opaka ytor för kontrastmätaren i Chromium. Det utför inget
kostnadsflöde och ingen kostnadsspecifik kontrastmätning. Belopp och
återkoppling granskas i de verkliga kostnadsflödena; manuell läsbarhet ska
redovisas separat. Syntetiska ljudspår utför ingen fysisk mikrofon-,
ljud- eller skärmläsarobservation.
