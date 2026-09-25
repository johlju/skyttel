# Manuella testfall för typer, historik och rättelser genom MCP

Fallen provar att assistentens verktyg följer samma regler som formulären.
Anteckna commit, klient, modell, webbläsare samt godkänt eller underkänt
resultat. Automatiska prov ersätter identitetsleverantören och anropar
verktygen deterministiskt; de bevisar inte modellens svenska tolkning.
De länkade integrationstesterna verifierar verktygsreglerna. Stegen här
är stöd för frivillig felsökning och behöver inte upprepas i #97.

## Konfigurerade användare

- Alex är installationens konfigurerade administratör. Använd ditt vanliga
  konfigurerade Google- eller Microsoft-konto, men bara påhittad kartdata.
- Robin är en annan inloggad användare i en separat webbläsarprofil och
  behövs bara i MCP-04. Kontot ska kunna logga in genom samma installation.
  Använd inte två profiler med samma konto för detta fall.
- Assistenten har Alex uttryckliga medgivande för kartarbete i provhushållet.
  Den kontrollerade terminalklienten har ett eget sådant medgivande.

## Allmän förberedelse

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan. Detaljpanelen visar uppgifterna. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. I hel kartvy heter knappen **Redigera val**. Att bara välja
objektet eller sambandet öppnar inte formuläret.

1. Följ [den kontrollerade klientens startguide](#controlled-mcp-client)
   för en ny tillfällig databas på `http://localhost:3301`, privat
   webbläsarfönster och hushållet **MCP-prov**. Behåll terminal A och
   databasens sökväg under fallet. Terminal B ska visa `ready`.
2. För svenska samtal i MCP-01–05, använd befintlig Codex-inloggning och
   kör följande i en tredje terminal från repositoryts rot. Starta inte
   AI-07:s separata server eller guide för demodata; terminal A kör redan
   den tomma provdatabasen. Servernamnet nedan ska vara oanvänt i din
   vanliga klientkonfiguration.

   <!-- markdownlint-disable MD013 -->
   ```sh
   codex -c 'mcp_servers.skyttel_advanced_case.url="http://localhost:3301/mcp"' mcp login skyttel_advanced_case --no-browser --oauth-client-registration dcr --scopes skyttel:read,skyttel:write
   codex -c 'mcp_servers.skyttel_advanced_case.url="http://localhost:3301/mcp"'
   ```
   <!-- markdownlint-enable MD013 -->

   Slutför första kommandots inloggning före det andra. Öppna utskriven
   adress i det privata fönstret, välj MCP-prov, tillåt extern AI och
   kartarbete och kopiera slutlig returadress till den väntande
   CLI-inloggningen, aldrig till samtalet. I Codex: be att bara använda
   MCP-servern skyttel_advanced_case, inte lokala filer eller terminalen.
   Granska verkliga verktygsanrop. Om OAuth inte fungerar, registrera
   blockerat; kringgå inte medgivandet. Se
   [klientguidens förutsättningar](setup/assistants.md#manual-local-codex-cli-setup).
   ChatGPT kan användas med separat förberedd åtkomst; det krävs inte här.
3. Be assistenten läsa hela ditt utkast innan varje nytt arbetssteg.
   Låt den sammanfatta hela skillnaden innan du säger **spara hela utkastet**.
   Kontrollera att sparbekräftelsen bygger på ett kvitto. Kontrollerade
   kommandon nedan skrivs i terminal B, inte som modellprompt eller shell.
4. Kommandona `tools`, `read-tool`, `capture-tool`, `capture-save` och `send`
   beskrivs i [kommandoguiden](#commands).
   `capture-tool` hämtar dagens versioner men skickar inget. `send` behåller
   exakt fångat innehåll. Använd nya etiketter; skriv aldrig över en fångst.
   Kopiera endast angivna innehålls-ID:n och JSON-värden, aldrig token.
5. Omstart betyder Ctrl+C i terminal A och guidens omstartskommando i samma
   terminal. Behåll databasen och terminal B; skapa inte en ny databas mitt
   i ett fall. Börja varje nytt fall med ny databas och nya anslutningar.
   Följ guidens återkallelse och städning efter varje fall.

Återkalla också Codex-anslutningen i Skyttel och avsluta Codex efter varje
fall. Ta bort just denna provinloggning innan databasen städas:

<!-- markdownlint-disable MD013 -->
```sh
codex -c 'mcp_servers.skyttel_advanced_case.url="http://localhost:3301/mcp"' mcp logout skyttel_advanced_case
```
<!-- markdownlint-enable MD013 -->

## Typer och avtal

### MCP-01: egna typer och frivilliga fält bevarar obesvarat och nej

**Syfte:** Prova typkatalogen, obesvarade fält och ett nytt värdeslag.

**Användare:** Alex och assistenten.

**Förutsättningar:** Tom karta och tomt utkast i ett nytt provhushåll.

**Integrationstest:**
[assistant-advanced.spec.ts](../../tests/integration/assistant-advanced.spec.ts),
testfallet “MCP-01: egna typer och frivilliga fält bevarar obesvarat och nej”.

**Steg:**

1. Be assistenten läsa aktuella typer i den tomma kartan. Be den skapa
   **Solcellsanläggning**, beskrivning **Hushållets elproduktion**, med
   textfältet **Leverantör**, talfältet **Effekt**, datumfältet
   **Installationsdatum** och ja/nej-fältet **Batteri**.
2. Be den föreslå **Paneler på taket** med Leverantör **Exempelsol**,
   Effekt **12.5**, Installationsdatum **2026-09-01** och obesvarat Batteri.
   Föreslå också **Paneler på garaget** med enbart Batteri **Nej**.
3. Ladda om kartan. I **Hela mitt utkast** ska båda objekten och typen
   finnas. Kontrollera **Batteri: Obesvarat** respektive **Batteri: Nej**.
   Be assistenten spara hela utkastet.
4. Be den ändra det använda fältet Effekt från tal till text. Kontrollera
   att detta avvisas och att beskedet säger att ett nytt fält behövs.
   Be i stället om ett nytt textfält **Effektanteckning**, med det gamla
   fältet och alla dess värden kvar. Lämna det nya fältet obesvarat.
5. Be den ändra den förifyllda typen Person till **Person i hushållet**
   med beskrivningen **Personer ger ingen inloggning**, och ta bort den
   oanvända förifyllda typen Fordon. Spara hela utkastet.
6. Starta om servern. Öppna takets paneler i kartans lista. Kontrollera
   de tre angivna värdena och att Batteri och Effektanteckning är tomma.
   Stäng formuläret och öppna garagets paneler: Batteri ska vara **Nej**.
   Be assistenten läsa katalogen igen och kontrollera typändringarna.

**Förväntat resultat:**

- Samma sparade definitioner och värden används av MCP och formulär.
- Inga utelämnade värden uppfinns; inget fält konverteras eller kopieras.
- Namnändring och oanvänd katalogborttagning bevaras efter omstart.

### MCP-02: daterade avtal kan rättas utan påhittade uppgifter

**Syfte:** Prova hushållets utökade avtal genom samma MCP-ingång.

**Användare:** Alex och assistenten.

**Förutsättningar:** Nytt provhushåll. Beloppen är påhittade.

**Integrationstest:**
[assistant-advanced.spec.ts](../../tests/integration/assistant-advanced.spec.ts),
testfallet “MCP-02: daterade avtal kan rättas utan påhittade uppgifter”.

**Steg:**

1. Be assistenten föreslå följande utan att spara ännu:
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
   samtalet och webbläsaren; kontrollera osäkert, okänt, inget och
   ospecificerat. Spara hela utkastet.
3. Be assistenten rätta enbart Exempelkredits utnyttjade kredit till **0**,
   uppgiven **2026-09-20**, och spara. Begär kvittot och den rättelsens
   historik: det tidigare beloppet och datumet ska finnas där.
4. Starta om och ladda om kartan. Sök och öppna varje avtal i listan.
   Öppna **Ekonomiska uppgifter och avtalsvillkor**. Kontrollera angivna
   belopp, datum och säkerheter. Exempelkredits skuld ska fortfarande
   vara obesvarad, kreditutrymmet **80 000** och utnyttjad kredit **0**.
   Kontrollera finansieringssambandet till bilen och båda hyresavtalens
   riktade samband till rätt bostad respektive garage.

**Förväntat resultat:**

- Hyra blir inte abonnemang. Lån, kredit och avbetalning behåller sina typer.
- Belopp, datum och säkerheter skiljs åt; rättelsen behåller tidigare fakta
  i historiken och fyller inte i obesvarade uppgifter.

## Livscykel och samtidighet

### MCP-03: typbyte och riktade samband återställs med äldre typer

**Syfte:** Prova typbyte, riktning, dubbletter och uttrycklig återställning.

**Användare:** Alex och assistenten.

**Förutsättningar:** Nytt provhushåll och aktuellt kartmedgivande.

**Integrationstest:**
[assistant-advanced.spec.ts](../../tests/integration/assistant-advanced.spec.ts),
testfallet “MCP-03: typbyte och riktade samband återställs med äldre typer”.

**Steg:**

1. Be assistenten skapa Cykel med textfältet Nummer och Motorfordon med
   talfältet Nummer. Skapa **Alex blå cykel**, typ Cykel, Nummer **SYNTH-42**,
   samt objektet **Garaget** med en annan aktuell typ.
2. Skapa sambandstypen **Förvaring**, beskrivning **Sakens plats**, med
   framåtnamnet **förvaras i** och bakåtnamnet **innehåller**. Koppla cykeln
   till garaget. Be om exakt samma samband igen: befintligt samband ska
   återanvändas. Lägg även till en annan befintlig sambandstyp mellan
   samma objekt. Granska riktningarna och spara hela utkastet.
3. Be assistenten byta cykelns typ till Motorfordon. Välj uttryckligen
   Nummer **42**. Granska gammal typ och **SYNTH-42** samt ny typ och **42**
   i hela utkastet. Spara och anteckna kvittots operation och författare.
   Kontrollera att objektets ID och båda sambandens ID är oförändrade.
4. Ta bort den nu oanvända typen Cykel och spara. Be om historiken för
   cykeln, välj typbytets hela sparande och begär ångring. Granska att
   utkastet återför både typen Cykel och Nummer **SYNTH-42** innan sparande.
5. Spara återställningen. Be om vanlig borttagning av cykeln och spara.
   Anteckna detta kvitto. Garaget ska finnas kvar; cykelns båda samband
   ska vara borttagna. Ta bort de oanvända typerna Cykel och Förvaring
   och spara. Den andra sambandstypen behöver inte tas bort.
6. Välj cykelborttagningens hela sparande i historiken och föreslå ångring.
   Kontrollera att båda saknade definitionerna visas för återställning.
   Starta om, läs utkastet igen och spara uttryckligen hela återställningen.
   Öppna cykeln i webbläsaren och kontrollera Nummer **SYNTH-42**, samma
   objekt-ID och återställda samband till garaget i rätt riktning.

**Förväntat resultat:**

- Typbyte överför inte värden på grund av lika fältnamn.
- Borttagning, upphörande och permanent radering är skilda åtgärder.
  Detta fall använder vanlig borttagning och återställer från historiken.
- Ångring blir ett beständigt eget förslag och kräver nytt helt sparande.

### MCP-04: upphört innehåll och privata utkast skyddar typer

**Syfte:** Prova användningsspärrar utan att avslöja privata förslag.

**Användare:** Alex, Robin och Alex assistent.

**Förutsättningar:** Nytt provhushåll. Robin loggar in i en separat profil,
kopierar sitt Skyttel-användar-ID från startsidan och ger det till Alex.
Alex öppnar hushållets administration, bjuder in detta ID och ger koden
till Robin, som accepterar den i sin profil. Håll båda profilerna öppna.

**Integrationstest:**
[assistant-advanced.spec.ts](../../tests/integration/assistant-advanced.spec.ts),
testfallet “MCP-04: upphört innehåll och privata utkast skyddar typer”.

**Steg:**

1. Be assistenten skapa **Upphörd typ**, **Privat använd typ** och
   **Samtidig typ**, alla utan fält. Skapa **Upphört testobjekt** med
   Upphörd typ och status Upphört. Spara allt. Försök ta bort Upphörd typ:
   felet ska förklara att användande innehåll måste hanteras först.
2. Robin väljer **Nytt objekt**, typ Privat använd typ, namn
   **Andras privata namn**, beskrivning **Privat hemlig anteckning**, och
   **Lägg i mitt utkast** utan att spara. Alex ber assistenten ta bort
   Privat använd typ. Kontrollera avvisningen och att varken namn,
   beskrivning eller privat objekt-ID finns i svaret.
3. Alex föreslår borttagning av Samtidig typ men sparar inte. Robin lägger
   därefter **Senare privat användning**, typ Samtidig typ, i sitt utkast
   utan att spara. Först nu ber Alex assistenten spara hela utkastet.
4. Kontrollera att sparandet avvisas, att definitionen finns kvar i
   sparad katalog och att inget innehåll tas bort. Alex webbläsare ska
   visa Upphört testobjekt men inte Robins privata förslag. Robin ska
   fortfarande se båda sina förslag i **Hela mitt utkast**.
5. Starta om och ladda om Robins profil. Båda privata förslagen ska finnas
   kvar. Alex får fortfarande samma användningsspärr utan deras innehåll.

**Förväntat resultat:**

- Upphört innehåll och beständiga utkast skyddar typer även vid sparandet.
- Ingen del sparas när en definition blockeras. Privat arbete röjs inte.

## Sammanslagning och äldre historik

### MCP-05: bildval och sammanslagning ångras med senare arbete kvar

**Syfte:** Prova uttryckliga identitetsval, bilder och samlad ångring.

**Användare:** Alex och assistenten.

**Förutsättningar:** Nytt provhushåll. Skapa två små PNG-bilder, en röd
och en grön, i valfritt bildprogram. Använd inga personbilder.

**Integrationstest:**
[assistant-advanced.spec.ts](../../tests/integration/assistant-advanced.spec.ts),
testfallet “MCP-05: bildval och sammanslagning ångras med senare arbete kvar”.

**Steg:**

1. Be assistenten skapa två olika objekt **Lo Exempel**, med beskrivning
   **Första uppgiften** respektive **Andra uppgiften**, samt **Blått kort**.
   Spara. Anteckna de två Lo-objektens olika ID:n.
2. Öppna varje Lo-objekt i webbläsaren och använd profilbildsfältet för
   röd respektive grön PNG. Lägg bildförslagen i utkastet. Be assistenten
   lägga samma typ av riktat samband från vardera Lo till kortet och
   spara hela utkastet. Behåll de två sambandens ID:n.
3. Be assistenten granska en möjlig sammanslagning med första Lo som
   kvarvarande identitet. Kontrollera båda objektens fakta, bilder och
   samband. Bekräfta ännu inte samma identitet. Välj andra beskrivningen
   och gröna bilden, ta bort första sambandet och behåll det andra.
   Be om ett förslag med obekräftad identitet. Webbläsaren ska visa
   **Identiteten är inte bekräftad** och inaktiverat helt sparande.
4. Kasta endast sammanslagningsförslaget. Be om ny granskning, bekräfta
   uttryckligen att objekten avser samma företeelse och välj samma fakta
   och samband. Spara hela utkastet. Första ID:t ska vara kvar med den
   gröna bilden; det andra ska vara borttaget. Begär kvittot och anteckna
   dess operation och historiska författare.
5. Rätta kvarvarande namn till **Senare namn** och spara. Lägg därefter
   **Eget senare objekt** i utkastet utan att spara. Be assistenten läsa
   sammanslagningens kvitto och föreslå ångring av det hela sparandet.
6. Starta om. Kontrollera att utkastet både återställer Lo-identiteterna
   och behåller Eget senare objekt. Spara hela utkastet och ladda om.
   Kontrollera Senare namn med röd bild och första beskrivningen, andra
   Lo med grön bild och andra beskrivningen, de ursprungliga riktade
   sambanden samt det oberoende nya objektet.

**Förväntat resultat:**

- Lika namn ger ingen automatisk sammanslagning. Identitet, fakta, bild
  och samband väljs uttryckligen; alla ändringar ingår i samma kvitto.
- Ångringen återför ursprungliga identiteter och bilder utan att skriva
  över det senare namnet eller kasta det oberoende privata förslaget.

### MCP-06: importerad historik ångras med färskt underlag

**Syfte:** Prova historisk författare, innehållsversion och färsk ångring.

**Användare:** Alex och den kontrollerade terminalklienten.

**Förutsättningar:** Börja med guidens nya tillfälliga databas. Detta fall
använder två separata tillfälliga databaser i följd på samma lokala adress.
Ingen annan server får använda port 3301. Behåll exporten privat på värden.

**Integrationstest:**
[assistant-advanced.spec.ts](../../tests/integration/assistant-advanced.spec.ts),
testfallet “MCP-06: importerad historik ångras med färskt underlag”.

**Steg:**

1. Kör i terminal B:

   ```text
   capture-object lamp {"id":"manual-lamp","type":"Person","name":"Historisk lampa"}
   send lamp
   capture-save source-save
   send source-save
   read-tool read_history {"objectId":"manual-lamp"}
   ```

   Anteckna lampans sparandes `operationId` och historiska `userId`.
   Namnet är ett syntetiskt provobjekt; Person ger ingen inloggning.
2. Öppna hushållets administration och **Fullständig export**. Bekräfta
   insynen i privata uppgifter, skapa och ladda ned ZIP-filen. Följ
   [exportens användarsteg](household-export.md) om panelen är obekant.
3. Återkalla terminalanslutningen, avsluta den och stoppa servern. Behåll
   exporten. Städa den första provdatabasen enligt startguiden. Skapa en
   ny tom tillfällig databas med samma guide, logga in i ett nytt privat
   fönster och skapa hushållet **MCP-prov**. Anslut en ny terminalklient.
4. Kör `read` och anteckna den nya tomma kartans `contentVersion`. Fånga
   ett gammalt förslag före importen, utan att skicka det:

   <!-- markdownlint-disable MD013 -->
   ```text
   capture-tool old-type propose_object_type {"id":"manual-old-type","baseRevision":null,"value":{"name":"Gammalt underlag","description":"","fields":[]}}
   ```
   <!-- markdownlint-enable MD013 -->

5. I administrationens **Återimport**, välj ZIP-filen från första
   databasen, granska den och bekräfta hela ersättandet. Följ
   [IMPORT-01:s importsteg](household-import.md#import-01-ersätt-hushållet-med-tangentbordet)
   vid behov. Gör ingen
   ägarkoppling för den historiska författaren. Starta om med den andra
   databasens oförändrade sökväg. Lampan ska finnas i kartan.
6. Kör `send old-type`: det ska avvisas med `content_conflict`. Kör
   `read-tool read_history {"objectId":"manual-lamp"}`. Välj den
   importerade sparningen. Skriv `read-tool read_history` följt av ett
   JSON-objekt med exakt dess `operationId` och `userId` som strängvärden.
   Kontrollera författare, tid och den skapade lampan i kvittot.
7. Skriv `capture-tool fresh-undo propose_undo` följt av samma JSON-objekt
   med enbart `operationId` och `userId`. Kopiera inga versioner från
   kvittot; klienten hämtar dagens versioner. Kör sedan:

   ```text
   send fresh-undo
   read
   capture-save undo-save
   send undo-save
   map Historisk lampa
   ```

8. Kontrollera först att `read` visar borttagningen som eget förslag och
   att det senare sparandet ger ett nytt kvitto i dagens innehållsversion.
   Ladda om webbläsaren: lampan ska nu saknas. Återkalla anslutningen,
   städa andra provdatabasen enligt guiden och radera den syntetiska ZIP-filen.

**Förväntat resultat:**

- Gamla underlag kan inte ändra återimporterat innehåll.
- Historisk författare ger ingen inloggning. Färsk ångring fungerar med
  denna innehållsreferens och dagens versioner, utan att återge importens
  gamla version som aktuell eller påstå att ett osparat förslag är sparat.

## Controlled MCP client

Use `scripts/manual-mcp-client.ts` to retain exact requests, deliver them
after a browser edit, and deliberately suppress a completed save response.
It is a deterministic test client, without a language model. It does not
establish how Codex or ChatGPT interprets a human instruction. The matching
integration tests and the helper's executable test cover these controls;
manual repetition is optional troubleshooting, not a requirement in #97.

The helper uses public OAuth registration, PKCE and explicit Skyttel map-work
consent. It receives its own short-lived grant, never reads SQLite or browser
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
current definitions, a merge review, or relevant history. `capture-tool`
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
JSON arguments for `read_history` or `propose_undo`. These are content
references, never authentication overrides. The historical author may be
unmapped after import. Undo captures today's draft/content versions; never
copy versions from the old receipt. For a merge, read `read_merge_review`
with the selected IDs and retain its exact `reviewed` value alongside the
explicit fact and relationship choices in `propose_merge`.

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
