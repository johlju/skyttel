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
   **Kostnadsprov**, välj **Samtal och text** och **Godkänn och starta**
   i medgivanderutan. KOST-03 och KOST-04 börjar utan hushåll.
4. Terminalkommandon nedan skrivs i startguidens terminal. Avsluta varje
   fall med `quit` och kontrollera borttagen tillfällig katalog enligt guiden.

## Underlag och beständighet

### KOST-01: separata kostnader och månadens antaganden återläses efter omstart

**Syfte:** Förstå uppdelning, totalsumma, prisunderlag och sparade
månadsantaganden utan att förväxla uppskattning med faktura.

**Användare:** Alex.

**Förutsättningar:** Ny installation med standardläget `text known`.

**Integrationstest:**
[costs.spec.ts](../../tests/integration/costs.spec.ts),
“KOST-01: separata kostnader och månadens antaganden återläses efter omstart”.

**Steg:**

1. Välj **Prata med Skyttel**, vänta på **Lyssnar** och kör `delegate` i
   terminalen. Uppdraget går genom röstens verkliga Terra-arbete. Vänta på
   **Det kontrollerade kostnadsprovet är klart.**
2. Kör `usage 90` och stäng av mikrofonen med **Prata med Skyttel**.
   Vänta tills röstrutan har försvunnit och röstanslutningen har stängts,
   några sekunder senare.
3. Öppna **Månadskostnad**. Kontrollera aktuell månad i UTC, Render
   **72,50 SEK (7,25 USD)**, Live **0,75 SEK (0,075 USD)** och Terra
   **2,29 SEK (0,229 USD)**. Öppna **Visa mätvärden för Live** och
   **Visa mätvärden för Terra**. Live visar 90 rapporterade sekunder.
   Terra visar 100 000 indatatoken med cache och resonemang separat.
4. Kräv delsumman **75,54 SEK (7,554 USD)** före de tre raderna.
   Öppna **Visa driftantagandet**. Läs att Render avser hel
   månad, tidigare förbrukning är okänd och cirka 200 kronor är ett
   riktmärke utan automatisk spärr.
5. Öppna modellpriserna under **Prisunderlag**. Kontrollera datum,
   enheter, tabell, källor och uttryckligt antagande om 10 SEK per USD.
   Startkrediten för Live ska inte läggas på en gång till.
6. Öppna **Ändra månadens antaganden**, ändra **SEK per USD** till 11
   och välj **Spara månadens antaganden**. Kräv **83,09 SEK (7,554 USD)**.
7. Välj föregående månad. Dess förval är fortfarande 10 SEK per USD och
   tidigare förbrukning är okänd. Återgå till aktuell månad; den har 11.
8. Kör `restart`, ladda om webbläsaren och öppna mätvärdena igen.
   Kontrollera samma uppdelning, ändrade valutantagande och delsumman
   **83,09 SEK (7,554 USD)**.

**Förväntat resultat:**

- Render, Live och Terra hålls isär. Cache ersätter motsvarande vanlig
  indata och resonemang läggs inte till utdata igen.
- Månadsantagandet och mätningarna består efter omstart. En ändring av
  aktuell månad ändrar inte föregående månads antagande.
- Ofullständig täckning framgår även när alla registrerade försök har
  slutvärden. Uppskattningen är ingen slutlig leverantörsfaktura.

### KOST-02: saknade slutvärden och hämtningsfel bevarar känt underlag utan dubbelräkning

**Syfte:** Visa okänd förbrukning och bevara tidigare kända värden vid fel.

**Användare:** Alex.

**Förutsättningar:** Ny installation. Kör `text missing` före meddelandet.

**Integrationstest:**
[costs.spec.ts](../../tests/integration/costs.spec.ts),
“KOST-02: saknade slutvärden och hämtningsfel bevarar känt underlag utan dubbelräkning”.

**Steg:**

1. Skicka **Prova kostnadsunderlaget.** och vänta på det kontrollerade svaret.
2. Välj **Prata med Skyttel** och vänta på **Lyssnar**. Kör `usage 12`,
   `usage 15`, `usage 15` och `finalize off`, en rad i taget. Stäng av
   mikrofonen och vänta tills röstanslutningen har stängts.
3. Öppna **Månadskostnad** och **Visa mätvärden för Live** samt
   **Visa mätvärden för Terra**. Live ska visa ett försök, 15 rapporterade
   sekunder, osäkert slutunderlag och **0,13 SEK (0,0125 USD)**.
   Terra ska visa **Belopp saknas** och saknade mätvärden.
4. Läs texten om ofullständig delsumma. Anteckna delsumman. Kör
   `restart` och ladda om; kräv samma kända underlag och osäkerhet.
5. Följ guidens [kontrollerade hämtningsfel](#a-failed-refresh-without-losing-the-last-values).
   Välj **Uppdatera underlaget**. Kräv synligt fel och inaktuella tidigare
   värden med samma delsumma. Ta bort blockeringen och uppdatera igen.

**Förväntat resultat:**

- Kumulativa 12, 15 och 15 sekunder är 15, inte 42 eller tre försök.
- Saknad slutmätning och helt saknade värden förblir osäkra efter omstart.
  Okänt belopp presenteras inte som säker nollkostnad.
- Ett hämtningsfel bevarar kända värden med synlig felstatus. Återhämtning
  tar bort felstatus utan extra registrerad förbrukning.

### KOST-04: okänt sparresultat återläses med fokus och fullständiga detaljer

**Syfte:** Återhämta ett sparat antagande efter tappat svar utan en extra
skrivning och nå hela flödet med tangentbord på mobil och dator.

**Användare:** Alex, utan hushåll.

**Förutsättningar:** Ny installation. Prova dator, 390 och 320 pixlars bredd,
ljust och mörkt tema samt verklig webbläsarzoom på 200 och 400 procent.
För tappat svar behövs en lokal felproxy som låter servern slutföra
`POST /api/operator/costs/assumptions` men släpper svaret. Att blockera
anropet före servern provar inte samma fall. Det länkade testet ordnar detta
automatiskt mot den riktiga servern och dess tillfälliga databas.

**Integrationstest:**
[costs.spec.ts](../../tests/integration/costs.spec.ts),
“KOST-04: okänt sparresultat återläses med fokus och fullständiga detaljer”
med tilläggen “(1280px)”, “(390px)” och “(320px)”.

**Steg:**

1. Logga in som Alex och öppna `/costs` utan att skapa hushåll. Kräv
   delsumman 72,50 SEK och texten om separat driftbehörighet.
2. Öppna **Ändra månadens antaganden**. Fokus ska stå i **SEK per USD**.
   Ange 12, välj **Uppdatera underlaget** och kontrollera att 12 står kvar.
3. Aktivera det tappade svaret och välj **Spara månadens antaganden**.
   Kräv **Sparresultatet är okänt**, spärrat sparande och äldre känd summa.
4. Välj **Uppdatera underlaget**. Kräv 87,00 SEK och besked att aktuella
   antaganden är hämtade. Inget nytt sparande ska behövas.
5. Återställ svaret, kör `restart` och ladda om. Öppna **Tidigare
   antaganden för månaden**. Version 1 har kurs 10 och version 2 kurs 12.
6. Öppna redigeringen, ange 13 och spara. Fokus återgår till **Ändra
   månadens antaganden**. Öppna och stäng redigeringen; fokus återgår igen.
7. Spara 14 med ett fördröjt svar. Välj tema medan sparandet pågår;
   temaknappens fokus ska bestå när kvittot kommer.
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
  provade bredder och zoomnivåer. Fysiska enheter och skärmläsare dokumenteras
  separat; automatiska prov innebär inte fullständig WCAG-överensstämmelse.

## Åtkomst

### KOST-03: endast driftansvarig har åtkomst oberoende av hushållets roller

**Syfte:** Skilja installationens kostnadsbehörighet från hushållstillgång.

**Användare:** Alex och Robin i skilda webbläsarprofiler.

**Förutsättningar:** Ny installation utan hushåll. Följ guidens
[två identiteter](#two-identities).

**Integrationstest:**
[costs.spec.ts](../../tests/integration/costs.spec.ts),
“KOST-03: endast driftansvarig har åtkomst oberoende av hushållets roller”.

**Steg:**

1. Logga in som Alex. Öppna **Månadskostnad** redan före hushållets start.
   Kontrollera att Render-underlaget visas.
2. Återgå och skapa Kostnadsprov. Kör `identity robin`. Logga in som
   Robin med Microsoft i den andra profilen. Kopiera Robins användar-ID.
3. Bjud in Robin från Alex medlemskapssida. Acceptera som Robin och ge
   sedan Robin administratörsrollen som Alex.
4. Robin ska sakna länken **Månadskostnad**. Skriv `/costs` efter
   installationens adress i Robins profil; inga kostnadsuppgifter visas.
5. Öppna kostnadsöversikten som Alex. Återkalla Alex hushållstillgång
   som Robin på medlemskapssidan. Ladda om Alex kostnadssida;
   kostnadsunderlaget är fortfarande åtkomligt.
6. Öppna en extra flik i Alex profil och logga ut där. Återgå till
   kostnadsfliken och välj **Uppdatera underlaget**, om den fortfarande
   visas. Skyddade belopp och kostnadslänken ska försvinna.

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
| `text known` | Future Terra replies report the worked example below; this is the default. |
| `text missing` | Future Terra replies succeed without a usage object. |
| `text held` | Future Terra requests wait until released or interrupted by the app. |
| `release` | Release held requests with the known measurements. |
| `delegate` | Send the synthetic request through the active voice session to the actual Terra backend. |
| `usage 90` | Send cumulative reported seconds to the single active Live session. Repeating a value does not mean extra usage. |
| `finalize off` | Suppress the final Live measurement when the app closes the session. |
| `finalize on` | Restore final measurements, using the latest `usage` value; this is the default. |
| `identity robin` | Future external sign-ins identify Robin Exempel; existing sessions remain unchanged. Use Microsoft for Robin. |
| `identity alex` | Restore Alex for future sign-ins. Use Google for Alex. |
| `restart` | Cancel held requests and restart the same installation. |
| `quit` | Stop the application and remove its temporary directory. |
<!-- markdownlint-enable MD013 -->

To generate Terra usage, choose **Samtal och text**, select
**Godkänn och starta** in the consent box, and send
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
server invokes Terra through the shared assistant, so both categories
come from one voice task. Wait for the fixed response before stopping.

The known Terra example is 100,000 input tokens: 20,000 cache reads,
10,000 cache writes and 70,000 ordinary input. Its 5,000 output tokens
already include 2,000 reasoning tokens. At the recorded Standard rates,
this is `0.14 + 0.004 + 0.025 + 0.06 = 0.229 USD`.
A final 90-second Live session costs an estimated `0.075 USD`.
Together with the default full-month Render assumption of `7.25 USD`,
the estimated subtotal is `7.554 USD`, or `75.54 SEK` at the explicit
assumption of 10 SEK/USD. Changing that assumption to 11 gives `83.09 SEK`
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
