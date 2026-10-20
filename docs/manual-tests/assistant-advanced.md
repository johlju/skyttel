# Manuella testfall för typer, historik och rättelser genom MCP

Fallen provar att assistentens verktyg följer samma regler som formulären.
Anteckna commit, klient, modell, webbläsare samt godkänt eller underkänt
resultat. Automatiska prov ersätter identitetsleverantören och anropar
verktygen deterministiskt; de bevisar inte modellens svenska tolkning.
De länkade integrationstesterna verifierar verktygsreglerna. Stegen här
är stöd för frivillig felsökning och behöver inte upprepas manuellt.

## Konfigurerade användare

- Alex är installationens konfigurerade administratör. Använd ditt vanliga
  konfigurerade Google- eller Microsoft-konto, men bara påhittad kartdata.
- Robin är en annan inloggad användare i en separat webbläsarprofil och
  behövs bara i MCP-04. Kontot ska kunna logga in genom samma installation.
  Använd inte två profiler med samma konto för detta fall.
- Assistenten har Alex uttryckliga medgivande för kartarbete i provhushållet.
  Den kontrollerade terminalklienten har ett eget sådant medgivande.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

Ändra objekt genom **Tabell → Redigera [objektets namn]**. Läs hela
förslag genom **Visa utkastet** och förslagets namn. Stäng läsdialogen
innan nästa handling. Läs eller ändra samband genom **Samband för
[objektets namn]**; alla förslag sparas separat som ett helt utkast.

1. Följ [den kontrollerade klientens startguide](#controlled-mcp-client)
   för en ny tillfällig databas på `http://localhost:3301`, privat
   webbläsarfönster och hushållet **MCP-prov**. Behåll terminal A och
   databasens sökväg under fallet. Terminal B ska visa `ready`.
2. Använd den kontrollerade terminalklienten utan språkmodell. Följ
   [klientens fulla fångster](assistant-client-preparation.md#typer-och-avtal)
   vid respektive arbetssteg. Guiden anger exakta syntetiska värden,
   nödvändiga kataloguppslag och när varje fångst skickas.
3. Läs hela ditt utkast innan varje nytt arbetssteg. Granska hela
   skillnaden innan du ger sparbeskedet med `capture-save` och `send`.
   Kontrollera att sparbekräftelsen bygger på ett kvitto. Skriv klientens
   kommandon i terminal B, aldrig som modellprompt eller shell.
4. Kommandona `tools`, `read-tool`, `capture-tool`, `capture-save` och `send`
   beskrivs i [kommandoguiden](#commands).
   `capture-tool` hämtar dagens versioner men skickar inget. `send` behåller
   exakt fångat innehåll. Använd nya etiketter; skriv aldrig över en fångst.
   Kopiera endast angivna innehålls-ID:n och JSON-värden, aldrig token.
5. Omstart betyder Ctrl+C i terminal A och guidens omstartskommando i samma
   terminal. Behåll databasen och terminal B; skapa inte en ny databas mitt
   i ett fall. Börja varje nytt fall med ny databas och nya anslutningar.
   Följ guidens återkallelse och städning efter varje fall.

## Typer och avtal

### MCP-01: Egna typer och fria egenskaper skiljer tomt från nej

**Syfte:** MCP och formulär visar samma individuella egenskaper, med tomma
värden skilda från Nej.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Nytt tomt provhushåll och kontrollerad skrivklient utan
språkmodell enligt startguiden. Följ
[fångsterna](assistant-client-preparation.md#typer-och-avtal) vid varje
klientsteg.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/assistant-advanced.spec.ts",
    "caseId": "MCP-01"
  },
  "reference": "Chromium, riktig lokal server och SQLite; konfiguration enligt förutsättningarna.",
  "outcomes": [
    "MCP och formulär visar samma individuella egenskaper, med tomma värden skilda från Nej.",
    "Typändringar och samtliga egenskaper består efter sparande och omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Läs katalogen och föreslå typen Solcellsanläggning med beskrivningen
   Hushållets elproduktion. Typen har namn och beskrivning.
2. Föreslå Paneler på taket med egna egenskaper: Leverantör (Text,
   Exempelsol), Effekt (Tal, 12.5), Batteri (Ja/nej, tomt) och
   Installationsdatum (Datum, 2026-09-01). Föreslå Paneler på garaget med
   tomma Leverantör, Effekt och Installationsdatum samt Batteri (Ja/nej, Nej).
3. Ladda om, öppna Visa utkastet och läs båda fullständiga objektförslagen.
   Kontrollera värdena och skillnaden mellan Tomt och Nej. Stäng läsningen och
   spara hela utkastet genom klienten.
4. Ändra typens beskrivning till Redigerad gemensam betydelse. Ändra den
   förifyllda Person till Person i hushållet med beskrivningen Personer ger
   ingen inloggning. Ta bort den oanvända typen Fordon och spara hela
   utkastet.
5. Starta om med samma databas. Redigera båda panelobjekten i Tabell och öppna
   Fria egenskaper. Läs alla angivna värden, de tomma raderna och Nej. Läs
   katalogen igen genom klienten.

**Förväntat resultat:**

- MCP och formulär visar samma individuella egenskaper, med tomma värden
  skilda från Nej.
- Typändringar och samtliga egenskaper består efter sparande och omstart.

### MCP-02: Fria avtalsuppgifter och separata datum kan rättas

**Syfte:** Avtalens individuella belopp, datum, tomma rader och uttryckliga
uppgifter behåller sina separata betydelser.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Nytt tomt provhushåll och kontrollerad skrivklient utan
språkmodell enligt startguiden. Följ
[fångsterna](assistant-client-preparation.md#typer-och-avtal) vid varje
klientsteg.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/assistant-advanced.spec.ts",
    "caseId": "MCP-02"
  },
  "reference": "Chromium, riktig lokal server och SQLite; konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Avtalens individuella belopp, datum, tomma rader och uttryckliga uppgifter behåller sina separata betydelser.",
    "Nollrättelsen bevarar övriga egenskaper, tidigare historik och verkliga riktade samband efter omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Använd fångsterna för fem avtal. Hyra för lägenheten har Pris (Text, 9 500)
   och en tom textegenskap Avtalsvillkor. Hyra för garaget har Pris (Tal, 650)
   och Osäkert uppgivet (Ja/nej, Ja). Exempellån har Senast uppgiven skuld
   (Text, 125 000,50), Osäkert uppgivet (Ja/nej, Ja) och Datum för uppgiften
   (Datum, 2026-09-01).
2. Exempelkredit har Beviljat kreditutrymme (Tal, 80000), Kreditutrymmets
   datum (Datum, 2026-08-01), Utnyttjad kredit (Tal, 12500), Utnyttjad kredits
   datum (Datum, 2026-09-02) och Avtalsvillkor (Text, Uttryckligen inget).
   Bilens avbetalning har tom Senast uppgiven skuld (Tal) och Datum för
   uppgiften (Datum, 2026-09-03).
3. Föreslå Lägenheten, Garaget och det ospecificerade fordonet Familjens bil
   som verkliga objekt. Koppla hyresavtalen till respektive objekt med Gäller
   och Bilens avbetalning till Familjens bil med Finansierar. Läs varje avtals
   fulla förslag i webbläsaren och spara hela utkastet.
4. Rätta endast Exempelkredits egenskaper Utnyttjad kredit till 0 och
   Utnyttjad kredits datum till 2026-09-20. Behåll samma egenskapsidentiteter
   och alla andra rader. Granska och spara genom klienten.
5. Starta om och redigera Exempelkredit i Tabell → Fria egenskaper. Läs 0,
   2026-09-20 och oförändrat kreditutrymme 80000. Öppna Rapporter och Visa
   ändringarna för rättelsen. Läs tidigare 12500 och 2026-09-02 samt nya
   värden. Läs de tre riktade sambanden från respektive avtal.

**Förväntat resultat:**

- Avtalens individuella belopp, datum, tomma rader och uttryckliga uppgifter
  behåller sina separata betydelser.
- Nollrättelsen bevarar övriga egenskaper, tidigare historik och verkliga
  riktade samband efter omstart.

## Livscykel och samtidighet

### MCP-03: Typbyte och uttrycklig datatypsrättelse bevarar historik

**Syfte:** Typbyte bevarar objektets och sambandens identiteter; datatypen
ändras bara genom det uttryckliga egenskapsförslaget.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Nytt tomt provhushåll och kontrollerad skrivklient utan
språkmodell enligt startguiden. Följ
[fångsterna](assistant-client-preparation.md#typer-och-avtal) vid varje
klientsteg.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/assistant-advanced.spec.ts",
    "caseId": "MCP-03"
  },
  "reference": "Chromium, riktig lokal server och SQLite; konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Typbyte bevarar objektets och sambandens identiteter; datatypen ändras bara genom det uttryckliga egenskapsförslaget.",
    "Historiken behåller Ramnummer som Text med SYNTH-42 och därefter Tal med 42, även när den äldre typen tas bort."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa typerna Cykel och Motorfordon med namn och tom typbeskrivning.
   Föreslå Alex blå cykel av typen Cykel med Ramnummer (Text, SYNTH-42), och
   Garaget som separat verkligt objekt.
2. Skapa Förvaring med benämningarna förvaras i och innehåller. Koppla cykeln
   till Garaget. Föreslå samma samband igen och kontrollera att befintligt
   samband återanvänds. Föreslå en annan befintlig sambandstyp mellan samma
   objekt och spara hela utkastet.
3. Föreslå cykeln med typen Motorfordon och rätta uttryckligen samma
   Ramnummer-egenskap till datatyp Tal och värde 42. Granska gammal typ och
   SYNTH-42 samt ny typ och 42 i förslagets båda sidor. Spara och kontrollera
   att båda riktade sambanden består.
4. Ta bort den nu oanvända Cykel-typen och spara. Läs typbytets hela
   sparkvitto genom klienten. Redigera cykeln och läs Ramnummer 42 under Fria
   egenskaper. Öppna också Rapporter och läs före och efter för typbytet.

**Förväntat resultat:**

- Typbyte bevarar objektets och sambandens identiteter; datatypen ändras bara
  genom det uttryckliga egenskapsförslaget.
- Historiken behåller Ramnummer som Text med SYNTH-42 och därefter Tal med 42,
  även när den äldre typen tas bort.

### MCP-04: upphört innehåll och privata utkast skyddar typer

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-advanced.spec.ts",
    "caseId": "MCP-04"
  },
  "reference": "Kontrollerad OAuth/MCP-klient utan språkmodell, riktiga browserformulär och beständig SQLite; ny isolerad databas per fall.",
  "outcomes": [
    "Upphört innehåll och andra användares privata förslag blockerar typborttagning.",
    "Samtidig privat användning stoppar hela sparandet utan privat röjande; båda förslagen överlever omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Prova användningsspärrar utan att avslöja privata förslag.

**Användare:** Alex, Robin och Alex kontrollerade klient.

**Förutsättningar:** Nytt provhushåll. Robin loggar in i en separat profil,
kopierar sitt Skyttel-användar-ID från startsidan och ger det till Alex.
Alex öppnar hushållets administration, bjuder in detta ID och ger koden
till Robin, som accepterar den i sin profil. Håll båda profilerna öppna.

**Integrationstest:**
[assistant-advanced.spec.ts](../../tests/integration/assistant-advanced.spec.ts),
testfallet “MCP-04: upphört innehåll och privata utkast skyddar typer”.

**Steg:**

1. Använd klientens fångster för att skapa **Upphörd typ**, **Privat använd
   typ** och
   **Samtidig typ**, alla med namn och beskrivning. Skapa **Upphört
   testobjekt** med
   Upphörd typ och status Upphört. Spara allt. Försök ta bort Upphörd typ:
   felet ska förklara att användande innehåll måste hanteras först.
2. Robin väljer **Nytt objekt**, typ Privat använd typ, namn
   **Andras privata namn**, en fri textegenskap **Beskrivning** med **Privat
   hemlig anteckning**, och
   **Lägg i utkastet och stäng** utan att spara. Alex använder klienten för att
   ta bort
   Privat använd typ. Kontrollera avvisningen och att varken namn eller
   beskrivning finns i svaret. Utför den separata kontrollen av privata
   objektidentiteter vid denna avvisning enligt
   [förberedelsen](assistant-client-preparation.md#fångster-för-mcp-04).
3. Alex föreslår borttagning av Samtidig typ men sparar inte. Robin lägger
   därefter **Senare privat användning**, typ Samtidig typ, i sitt utkast
   utan att spara. Först nu ber Alex kontrollerade klienten spara hela utkastet.
4. Kontrollera att sparandet avvisas, att definitionen finns kvar i
   sparad katalog och att inget innehåll tas bort. Alex webbläsare ska
   visa Upphört testobjekt men inte Robins privata förslag. Välj först
   **Tabell → Filter → Ta med upphörda** och stäng filtret. Robin ska
   fortfarande se båda sina förslag i **Visa utkastet**.
5. Starta om och ladda om Robins profil. Öppna båda förslagens fulla
   läsdialoger. **Andras privata namn** ska ha typen **Privat använd typ**
   och beskrivningen **Privat hemlig anteckning**.
   **Senare privat användning** ska ha typen **Samtidig typ** och
   inga fria egenskaper. Alex försöker åter ta bort Privat
   använd typ och spara borttagningen av Samtidig typ enligt förberedelsen.
   Båda försöken ska avvisas utan privata namn eller beskrivningar.
   Utför förberedelsens separata kontroll av privata objektidentiteter
   vid båda avvisningarna efter omstarten. Alex sparade katalog ska innehålla
   Samtidig typ; Robins båda förslag och historiken ska vara oförändrade.

**Förväntat resultat:**

- Upphört innehåll och beständiga utkast skyddar typer även vid sparandet.
- Ingen del sparas när en definition blockeras. Privat arbete röjs inte.

## Äldre historik

MCP-05 för bildval, sammanslagning och historisk ångring utgår.
Fall-ID:t återanvänds inte.

### MCP-06: importerad historik läses och vanliga rättelser använder färskt underlag

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-advanced.spec.ts",
    "caseId": "MCP-06"
  },
  "reference": "Kontrollerad OAuth/MCP-klient utan språkmodell, riktiga browserformulär och beständig SQLite; ny isolerad databas per fall.",
  "outcomes": [
    "Importerad historik behåller hela det valda sparkvittot och historisk författare.",
    "Historikläsning lämnar ett meningsfullt oberoende utkast och historiken oförändrade.",
    "En färsk formulärrättelse sparas med aktuell författare och bevaras efter omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Prova historisk författare, innehållsversion och vanliga rättelser.

**Användare:** Alex och den kontrollerade terminalklienten.

**Förutsättningar:** Börja med guidens nya tillfälliga databas. Detta fall
använder två separata tillfälliga databaser i följd på samma lokala adress.
Ingen annan server får använda port 3301. Behåll exporten privat på värden.

**Integrationstest:**
[assistant-advanced.spec.ts](../../tests/integration/assistant-advanced.spec.ts),
testfallet “MCP-06: importerad historik läses och vanliga rättelser använder
färskt underlag”.

**Steg:**

1. Kör i terminal B:

   ```text
   capture-object lamp {"id":"manual-lamp","type":"Person","name":"Historisk lampa"}
   send lamp
   capture-save source-save
   send source-save
   read-tool read_history {"objectId":"manual-lamp"}
   ```

   Följ den separata
   [historikförberedelsens
   fångst](assistant-client-preparation.md#historikläsning-mcp-06)
   direkt efter sparandet och behåll den under databasbytet.
   Namnet är ett syntetiskt provobjekt; Person ger ingen inloggning.
2. Öppna **Inställningar → Fullständig export**. Läs informationen om
   insynen i privata uppgifter, skapa och ladda ned ZIP-filen. Följ
   [exportens användarsteg](household-export.md) om sidan är obekant.
3. Återkalla terminalanslutningen, avsluta den och stoppa servern. Behåll
   exporten. Städa den första provdatabasen enligt startguiden. Skapa en
   ny tom tillfällig databas med samma guide, logga in i ett nytt privat
   fönster och skapa hushållet **MCP-prov**. Anslut en ny terminalklient.
4. Följ
   [historikförberedelsens fångst före
   import](assistant-client-preparation.md#historikläsning-mcp-06)
   i den nya tomma databasen. Skicka inte det gamla förslaget ännu.
5. I administrationens **Återimport**, välj ZIP-filen från första
   databasen, granska den och bekräfta hela ersättandet. Följ
   [IMPORT-01:s
   importsteg](household-import.md#import-01-ersätt-hushållet-med-tangentbordet)
   vid behov. Gör ingen
   ägarkoppling för den historiska författaren. Starta om med den andra
   databasens oförändrade sökväg. Lampan ska finnas i kartan.
6. Lägg ett oberoende förslag **Oberoende utkast**, med den fria textegenskapen
   Beskrivning: **Privat lampanteckning**, i utkastet genom klienten enligt
   den separata
   förberedelsen. Ladda om kartan efter klientens nya förslag. Läs sedan
   den importerade lampans historik enligt den separata
[historikförberedelsen](assistant-client-preparation.md#historikläsning-mcp-06).
   Öppna **Rapporter → Ändringshistorik → Visa ändringarna** och läs
   lampans namn, typ och historiska författare. Öppna
   **Identifiera sparandet och användaren** och kontrollera att den
   historiska författaren, sparandet och tidpunkten går att läsa.
   Välj **Tillbaka till arbetet**
   och läs det oberoende förslagets fulla värden. De ska finnas kvar.
7. Skicka först den gamla typfångsten enligt förberedelsen: importen
   ska ha gjort dess underlag ogiltigt. Kasta bara det oberoende förslaget
   efter läsningen och ladda om kartan igen. Redigera **Historisk lampa**
   i **Tabell**, ändra namnet
   till **Rättad historisk lampa**, behåll typ och egenskaper och
   välj **Lägg i utkastet och stäng**. Läs hela förslaget i webbläsaren.
   Använd klientens färska fångst för samma rättelse och spara hela utkastet.
8. Starta om den andra databasen. Redigera lampan i **Tabell** och
   kontrollera nytt namn, samma typ och oförändrade egenskaper. Stäng
   formuläret.
   Läs klientens historik: både importerad skapelse och aktuell rättelse
   ska finnas med respektive författare.

**Förväntat resultat:**

- Det gamla förslaget avvisas efter importen. Historisk författare, tid
  och lampans sparade värden är läsbara utan att skapa ett ångringsförslag.
- Den vanliga rättelsen sparas med den nya innehållsversionen och den
  aktuella författaren. Den importerade historiken bevaras. Läsningen
  skapar inget nytt förslag eller sparande och ändrar inte det oberoende
  utkastets fulla värden.

## Avvecklade identiteter

MCP-07 återanvänds inte. Dess hela valda sparkvitto och oförändrade
utkast/historik efter läsning ingår i MCP-06. MCP-01 behåller skapande,
sparande, omstart och full webbläsarläsning. MCP-06 behåller också
SDK-listning, avvisade anrop till avvecklade verktyg och gamla rutters
404-svar som tekniska skydd. De ersätter inte hela kvittot eller faktisk
webbläsarläsning. Separat dubbel körning av den generiska historikläsningen
upphör; ingen ytterligare beteendeförlust är avsedd.

## Controlled MCP client

Use `scripts/manual-mcp-client.ts` to retain exact requests, deliver them
after a browser edit, and deliberately suppress a completed save response.
It is a deterministic test client, without a language model. It does not
establish how Codex or ChatGPT interprets a human instruction. The matching
integration tests and the helper's executable test cover these controls;
manual repetition is optional troubleshooting.

The helper uses public OAuth registration, PKCE and explicit Skyttel consent.
The optional final argument is `read` or `write`; omission requests map work
with `write`. Read-only access requires the separate AI choice and
**Godkänn läsåtkomst**. Map work additionally requires its own choice and
**Godkänn kartarbete**. Use the
[scope-specific
preparation](assistant-client-preparation.md#installation-medgivande-och-städning)
for the access cases. It receives its own short-lived grant, never reads
SQLite or browser
cookies, and never uses saved Codex credentials. Tokens and captured requests
stay in its process memory. Terminal output contains authorization links,
technical status and synthetic tool results, so do not record the terminal
or use real household information.

### Start a disposable installation

Complete the existing [local authentication
setup](../development/devcontainer.md#set-up-local-sign-in)
and [port-3301 Google configuration](../development/local-authentication.md)
first. Reuse the configured administrator and private development environment
file. The default is `.devcontainer/.env`; set `SKYTTEL_DEV_ENV_FILE` to your
existing file if different. Do not print its contents. Stop ordinary
development servers and keep port 3301 free.

This is the port-3301 counterpart of the
[disposable browser
setup](../development/devcontainer.md#disposable-local-database).
It keeps the database through restarts. Stop and restart only the server
process during a persistence check; keep the temporary directory.

From the repository root in terminal A, run:

```sh
umask 077
SKYTTEL_MCP_CASE_DIR=$(mktemp -d /tmp/skyttel-mcp-case.XXXXXX)
printf 'SKYTTEL_DATABASE_PATH=%s/skyttel.sqlite\n' \
  "$SKYTTEL_MCP_CASE_DIR" > "$SKYTTEL_MCP_CASE_DIR/case.env"
env -u SKYTTEL_DATABASE_PATH SKYTTEL_ORIGIN=http://localhost:5173 \
  node --env-file="$SKYTTEL_MCP_CASE_DIR/case.env" scripts/develop-prodlike.mjs
```

The existing launcher builds the application and changes the origin to
`http://localhost:3301`. Open that address in a fresh private host-browser
window, sign in with the configured administrator, and create **MCP-prov**.
This empty database does not need `db:setup`. Keep terminal A open.

For a server restart, press Ctrl+C in terminal A, wait for shutdown, then
run only the following command in that same terminal. Do not recreate the
directory or close terminal B during the restart:

```sh
env -u SKYTTEL_DATABASE_PATH SKYTTEL_ORIGIN=http://localhost:5173 \
  node --env-file="$SKYTTEL_MCP_CASE_DIR/case.env" scripts/develop-prodlike.mjs
```

### Authorize the control client

In VS Code's **Ports** panel, forward container ports **3301** and **47731**
to the same host ports. Keep both local/private; no public tunnel is needed.
If host port 47731 is occupied, choose another unused port and use that same
number in the command below and its forwarding entry. The helper binds only
the container's loopback interface.

In terminal B, from the repository root, run:

```sh
node --import tsx scripts/manual-mcp-client.ts http://localhost:3301 47731
```

Open the `url` from the `authorize` output in the private browser window.
Choose **MCP-prov**, check the external AI and map-work consent boxes, and
approve. The loopback callback page sends no secrets to terminal output;
it tells you to return to terminal B, which must show `ready`. Do not copy
callback addresses, codes, cookies or tokens. Authorization expires after
ten minutes if unfinished; restart the helper if necessary. Revoke abandoned
connections in Skyttel.

The listener checks its origin, host, path and random state, then closes
after authorization. Denied consent or an invalid callback grants no access.
No refresh grant is requested. If the access token expires during a case,
revoke the connection, restart the helper, and start that case again.

### Commands

Enter commands directly in terminal B, one at a time. Each output is one
JSON object with an `event` field. `result.value` is the public MCP tool
result; an `error` inside that value is a domain rejection, not a success.
Never overwrite or reconstruct a captured request to perform an exact retry.

<!-- markdownlint-disable MD013 -->
| Command | Effect |
| --- | --- |
| `read` | Read the whole current private draft. |
| `map Lo` | Read saved objects matching Lo and their direct context. |
| `tools` | List the current authenticated MCP tools, their argument schemas and read-only annotations. |
| `read-tool TOOL JSON` | Call a listed read-only tool with its documented arguments. |
| `capture-tool LABEL TOOL JSON` | Retain a listed proposal with the supplied arguments and freshly read draft/content versions. Does not submit it. |
| `capture-save old` | Read and display the whole draft; retain its exact versions and a new operation ID under `old`. Does not save. |
| `send old` | Send the captured request unchanged. |
| `status old` | Read that save's durable operation status. |
| `drop old` | Prepare the captured save, send it, verify a matching successful response at the fault boundary, then discard that response without printing or retaining its receipt. |
| `discard manual-other` | Discard that object proposal using the current draft version. |
| `quit` | Close the helper and release credentials and captures. |
<!-- markdownlint-enable MD013 -->

`drop` must print `response-dropped` with `outcome: "unknown"`. It deliberately
removes a post-commit response at the client boundary; it does not simulate
an arbitrary network outage. A rejected or failed save is not labelled as
this fault. Check durable `status` before further work, then replay the same
capture with `send`. This verifies recovery without inventing a new operation.

`capture-object LABEL JSON` retains an unsent proposal using current draft
and content versions and the exact current type name. It supports only new
synthetic IDs starting with `manual-`, including corrections of their private
proposals. It refuses to edit saved objects. The following example needs no
hand-copied type IDs:

<!-- markdownlint-disable MD013 -->
```text
capture-object bank {"id":"manual-bank","type":"Bankkonto","name":"Betalkonto","identity":"unresolved"}
send bank
```
<!-- markdownlint-enable MD013 -->

Capturing a proposal does not submit it. Labels are unique for the process;
use the exact labels in the manual case in a fresh helper session. No shell,
database, authentication override or arbitrary JavaScript command is exposed.

#### Advanced proposals and historical receipts

Run `tools` to inspect the exact public argument schema. Use `read-tool` for
current definitions or relevant history. `capture-tool`
accepts only listed non-read-only tools with draft and content versions.
Supply all other documented arguments as one JSON object. The helper rejects
unknown top-level fields and caller-supplied versions; the server validates
the complete values when `send` submits the request. Use `capture-save` for
saving: generic commands reject both `save_draft` and `prepare_save`.

For example, prepare a new synthetic object type and an individual yes/no
property:

<!-- markdownlint-disable MD013 -->
```text
read-tool read_type_catalog {}
capture-tool type-example propose_object_type {"id":"manual-device","baseRevision":null,"value":{"name":"Provenhet","description":"Påhittad typ"}}
send type-example
capture-tool object-example propose_object {"id":"manual-device-object","baseRevision":null,"value":{"typeId":"manual-device","name":"Provenheten","properties":[{"id":"manual-enabled","label":"Aktiv","kind":"boolean","value":false}]}}
send object-example
read
```
<!-- markdownlint-enable MD013 -->

Check the entire draft before capturing and sending a save. Leaving the
yes/no property empty is distinct from explicitly supplying `false` on
an object. The area's manual case provides the complete scenario and
expected results.

For history, run `read-tool read_history {}` and copy the relevant
`operationId` and historical `userId` from that result into the documented
JSON arguments for `read_history`. These are content references, never
authentication overrides. The historical author may be unmapped after import.
Reading history creates no proposal. Historical undo and object merge tools
are no longer offered.

To test stale input, capture first, change the draft or relevant saved
content in the browser, then run `send` with the original label. The helper
does not refresh that request. Read the returned conflict and whole draft;
a fresh capture with a new label is a new proposal, not an exact retry.

### Cleanup

In the private browser, open **Assistentanslutningar** and revoke
**Skyttel manual MCP controls**. In terminal B run `read`: it must return
`MCP HTTP 401`. Then run `quit`. Ctrl+C also closes the helper and listener,
but does not revoke the server-side connection; revoke it in the browser.
Do not save terminal transcripts or callback parameters.

Close the private browser window and stop terminal A. Delete only this
temporary database directory in terminal A:

```sh
rm -r -- "${SKYTTEL_MCP_CASE_DIR:?}"
unset SKYTTEL_MCP_CASE_DIR
```

Start ordinary development again with `npm run dev:all`. Use a fresh database
and helper process for the next isolated case.

## Modellens avvecklade beteenden

MCP-01–04 och MCP-06 behåller sina identiteter. Typstyrda fält och
användningsspärren för deras datatyper har avvecklats. Individuella
egenskapers tomma värden, datatyper och historik provas i de fortsatta
fallen. Typnamn och typbeskrivningar förblir gemensamma definitioner.
