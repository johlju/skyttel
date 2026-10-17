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

### MCP-01: egna typer och frivilliga fält bevarar obesvarat och nej

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-advanced.spec.ts",
    "caseId": "MCP-01"
  },
  "reference": "Kontrollerad OAuth/MCP-klient utan språkmodell, riktiga browserformulär och beständig SQLite; ny isolerad databas per fall.",
  "outcomes": [
    "MCP skapar typen och hela objektförslag med obesvarat skilt från Nej.",
    "Sparande och omstart bevarar alla egna fält och katalogändringar i webbläsaren."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Prova typkatalogen, obesvarade fält och ett nytt värdeslag.

**Användare:** Alex och den kontrollerade terminalklienten.

**Förutsättningar:** Tom karta och tomt utkast i ett nytt provhushåll.
Följ guidens fångster för MCP-01 vid varje klientsteg.

**Integrationstest:**
[assistant-advanced.spec.ts](../../tests/integration/assistant-advanced.spec.ts),
testfallet “MCP-01: egna typer och frivilliga fält bevarar obesvarat och nej”.

**Steg:**

1. Använd klientens fångster för att läsa aktuella typer i den tomma kartan.
   Använd klientens fångster för att skapa
   **Solcellsanläggning**, beskrivning **Hushållets elproduktion**, med
   textfältet **Leverantör**, talfältet **Effekt**, datumfältet
   **Installationsdatum** och ja/nej-fältet **Batteri**.
2. Använd klientens fångster för att föreslå **Paneler på taket** med Leverantör
   **Exempelsol**,
   Effekt **12.5**, Installationsdatum **2026-09-01** och obesvarat Batteri.
   Föreslå också **Paneler på garaget** med enbart Batteri **Nej**.
3. Ladda om kartan. I **Visa utkastet** ska båda objekten och typen
   finnas. Öppna varje objektförslag och läs hela värdena. Batteri ska
   visa **Ej uppgivet** respektive **Nej**. Stäng läsdialogen.
   Använd klientens fångster för att spara hela utkastet.
4. Använd klientens fångster för att ändra det använda fältet Effekt från tal
   till text. Kontrollera
   att detta avvisas och att beskedet säger att ett nytt fält behövs.
   Föreslå i stället ett nytt textfält **Effektanteckning**, med det gamla
   fältet och alla dess värden kvar. Lämna det nya fältet obesvarat.
5. Använd klientens fångster för att ändra den förifyllda typen Person till
   **Person i hushållet**
   med beskrivningen **Personer ger ingen inloggning**, och ta bort den
   oanvända förifyllda typen Fordon. Spara hela utkastet.
6. Starta om servern. Välj **Tabell → Redigera Paneler på taket** och
   öppna avsnittet **Egna fält**. Kontrollera
   de tre angivna värdena och att Batteri och Effektanteckning är tomma.
   Stäng formuläret och redigera **Paneler på garaget**, med **Egna fält**
   öppet: Batteri ska vara **Nej**.
   Använd klientens fångster för att läsa katalogen igen och kontrollera
   typändringarna.

**Förväntat resultat:**

- Samma sparade definitioner och värden används av MCP och formulär.
- Inga utelämnade värden uppfinns; inget fält konverteras eller kopieras.
- Namnändring och oanvänd katalogborttagning bevaras efter omstart.

### MCP-02: daterade avtal kan rättas utan påhittade uppgifter

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-advanced.spec.ts",
    "caseId": "MCP-02"
  },
  "reference": "Kontrollerad OAuth/MCP-klient utan språkmodell, riktiga browserformulär och beständig SQLite; ny isolerad databas per fall.",
  "outcomes": [
    "Daterade avtal behåller belopp, säkerheter och olika ekonomiska betydelser.",
    "Rättelsen till noll bevarar äldre kreditfakta och riktade samband efter omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Prova hushållets utökade avtal genom samma MCP-ingång.

**Användare:** Alex och assistenten.

**Förutsättningar:** Nytt provhushåll. Beloppen är påhittade.
Följ guidens fångster för MCP-02 vid varje klientsteg.

**Integrationstest:**
[assistant-advanced.spec.ts](../../tests/integration/assistant-advanced.spec.ts),
testfallet “MCP-02: daterade avtal kan rättas utan påhittade uppgifter”.

**Steg:**

1. Använd klientens fångster för att föreslå följande utan att spara ännu:
   **Hyra för lägenheten**, hyresavtal med pris **9 500** och okända villkor;
   **Hyra för garaget**, hyresavtal med osäkert pris **650**;
   **Exempellån**, låneavtal med osäker skuld **125 000,50** uppgiven
   **2026-09-01**; **Exempelkredit**, kreditavtal med kreditutrymme
   **80 000** uppgivet **2026-08-01**, utnyttjad kredit **12 500** uppgiven
   **2026-09-02** och uttryckligen inga villkor; **Bilens avbetalning**,
   avbetalningsavtal med okänd skuld uppgiven **2026-09-03**.
2. Föreslå bostaden **Lägenheten** och garaget **Garaget** som egna objekt.
   Koppla respektive hyresavtal till rätt objekt med sambandet **Gäller**.
   Föreslå **Familjens bil** som ett uttryckligen ospecificerat fordon
   och sambandet **Bilens avbetalning → Finansierar → Familjens bil**.
   Lämna alla andra ekonomiska uppgifter obesvarade. Granska utkastet i
   samtalet och webbläsaren. Läs fulla förslag för Exempellån,
   Exempelkredit, Bilens avbetalning och Familjens bil; kontrollera
   osäkert, okänt, inget och
   ospecificerat. Stäng läsdialogen och spara hela utkastet.
3. Använd klientens fångster för att rätta enbart Exempelkredits utnyttjade
   kredit till **0**,
   uppgiven **2026-09-20**, och spara. Begär kvittot och den rättelsens
   historik: det tidigare beloppet och datumet ska finnas där.
4. Starta om och ladda om kartan. Sök varje avtal i **Tabell** och välj
   dess redigeringsknapp. Öppna **Ekonomiska uppgifter**. Kontrollera angivna
   belopp, datum och säkerheter. Exempelkredits skuld ska fortfarande
   vara obesvarad, kreditutrymmet **80 000** och utnyttjad kredit **0**.
   Bilens avbetalning ska visa **Okänt** för skuld och datum **2026-09-03**;
   inget skuldbelopp ska anges. Stäng formuläret. Öppna
   **Rapporter → Ändringshistorik → Visa ändringarna** för krediträttelsen.
   Under **Före sparandet** läser du **12 500** och **2026-09-02**;
   under **Efter sparandet** läser du **0** och **2026-09-20**.
   Välj **Tillbaka till arbetet**. Öppna avtalens namngivna **Samband** och kontrollera
   finansieringssambandet till bilen och båda hyresavtalens
   riktade samband till rätt bostad respektive garage.

**Förväntat resultat:**

- Hyra blir inte abonnemang. Lån, kredit och avbetalning behåller sina typer.
- Belopp, datum och säkerheter skiljs åt; rättelsen behåller tidigare fakta
  i historiken och fyller inte i obesvarade uppgifter.

## Livscykel och samtidighet

### MCP-03: typbyte bevarar riktade samband och äldre typers läsbara historik

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-advanced.spec.ts",
    "caseId": "MCP-03"
  },
  "reference": "Kontrollerad OAuth/MCP-klient utan språkmodell, riktiga browserformulär och beständig SQLite; ny isolerad databas per fall.",
  "outcomes": [
    "Typbyte behåller objektidentitet och riktade samband utan namnbaserad fältkonvertering.",
    "Webbläsarens fulla historik behåller äldre typnamn och värden när den gamla typen tas bort."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Prova typbyte, riktning, dubbletter och historiska typnamn.

**Användare:** Alex och assistenten.

**Förutsättningar:** Nytt provhushåll och aktuellt kartmedgivande.
Följ guidens fångster för MCP-03 vid varje klientsteg.

**Integrationstest:**
[assistant-advanced.spec.ts](../../tests/integration/assistant-advanced.spec.ts),
testfallet “MCP-03: typbyte bevarar riktade samband och äldre typers läsbara
historik”.

**Steg:**

1. Använd klientens fångster för att skapa Cykel med textfältet Nummer och
   Motorfordon med
   talfältet Nummer. Skapa **Alex blå cykel**, typ Cykel, Nummer **SYNTH-42**,
   samt objektet **Garaget** med en annan aktuell typ.
2. Skapa sambandstypen **Förvaring**, beskrivning **Sakens plats**, med
   framåtnamnet **förvaras i** och bakåtnamnet **innehåller**. Koppla cykeln
   till garaget. Be om exakt samma samband igen: befintligt samband ska
   återanvändas. Lägg även till en annan befintlig sambandstyp mellan
   samma objekt. Granska riktningarna och spara hela utkastet.
3. Använd klientens fångster för att byta cykelns typ till Motorfordon. Välj
   uttryckligen
   Nummer **42**. Granska gammal typ och **SYNTH-42** samt ny typ och **42**
   i förslagets fulla läsdialog, under **Sparade värden** och
   **Föreslagna värden**. Stäng och spara. Kontrollera att cykeln och
   båda dess riktade samband finns kvar. Den separata klientförberedelsen
   jämför deras exakta identiteter och kvittot.
4. Ta bort den nu oanvända typen Cykel och spara. Läs klientens historik
   för cykeln och välj typbytets hela sparande. Öppna också
   **Rapporter → Ändringshistorik** i webbläsaren och **Visa ändringarna**
   för typbytet. Läs de tidigare värdena med
   typen Cykel och Nummer SYNTH-42 samt de nya värdena med Motorfordon
   och Nummer 42.

**Förväntat resultat:**

- Typbyte överför inte värden på grund av lika fältnamn. Objektets ID
  och de riktade sambanden bevaras.
- Historiken behåller typbytets äldre typnamn och värden även när den
  aktuella typen tas bort. Läsningen skapar inga nya förslag.

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
   **Samtidig typ**, alla utan fält. Skapa **Upphört testobjekt** med
   Upphörd typ och status Upphört. Spara allt. Försök ta bort Upphörd typ:
   felet ska förklara att användande innehåll måste hanteras först.
2. Robin väljer **Nytt objekt**, typ Privat använd typ, namn
   **Andras privata namn**, beskrivning **Privat hemlig anteckning**, och
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
   **Ej uppgivet** som beskrivning. Alex försöker åter ta bort Privat
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
   [historikförberedelsens fångst](assistant-client-preparation.md#historikläsning-mcp-06)
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
   [historikförberedelsens fångst före import](assistant-client-preparation.md#historikläsning-mcp-06)
   i den nya tomma databasen. Skicka inte det gamla förslaget ännu.
5. I administrationens **Återimport**, välj ZIP-filen från första
   databasen, granska den och bekräfta hela ersättandet. Följ
   [IMPORT-01:s importsteg](household-import.md#import-01-ersätt-hushållet-med-tangentbordet)
   vid behov. Gör ingen
   ägarkoppling för den historiska författaren. Starta om med den andra
   databasens oförändrade sökväg. Lampan ska finnas i kartan.
6. Lägg ett oberoende förslag **Oberoende utkast**, beskrivning
   **Privat lampanteckning**, i utkastet genom klienten enligt den separata
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
   till **Rättad historisk lampa**, behåll typ och tom beskrivning och
   välj **Lägg i utkastet och stäng**. Läs hela förslaget i webbläsaren.
   Använd klientens färska fångst för samma rättelse och spara hela utkastet.
8. Starta om den andra databasen. Redigera lampan i **Tabell** och
   kontrollera nytt namn, samma typ och tom beskrivning. Stäng formuläret.
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
[scope-specific preparation](assistant-client-preparation.md#installation-medgivande-och-städning)
for the access cases. It receives its own short-lived grant, never reads
SQLite or browser
cookies, and never uses saved Codex credentials. Tokens and captured requests
stay in its process memory. Terminal output contains authorization links,
technical status and synthetic tool results, so do not record the terminal
or use real household information.

### Start a disposable installation

Complete the existing [local authentication setup](../development/devcontainer.md#set-up-local-sign-in)
and [port-3301 Google configuration](../development/local-authentication.md)
first. Reuse the configured administrator and private development environment
file. The default is `.devcontainer/.env`; set `SKYTTEL_DEV_ENV_FILE` to your
existing file if different. Do not print its contents. Stop ordinary
development servers and keep port 3301 free.

This is the port-3301 counterpart of the
[disposable browser setup](../development/devcontainer.md#disposable-local-database).
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

For example, prepare a new synthetic object type with a yes/no field:

<!-- markdownlint-disable MD013 -->
```text
read-tool read_type_catalog {}
capture-tool type-example propose_object_type {"id":"manual-device","baseRevision":null,"value":{"name":"Provenhet","description":"Påhittad typ","fields":[{"id":"manual-enabled","name":"Aktiv","description":"","kind":"boolean"}]}}
send type-example
read
```
<!-- markdownlint-enable MD013 -->

Check the entire draft before capturing and sending a save. Leaving the
yes/no field unanswered is distinct from explicitly supplying `false` on
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
