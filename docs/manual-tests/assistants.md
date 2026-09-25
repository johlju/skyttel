# Manuella testfall för externa assistenter

Testfallen omfattar OAuth-medgivande, separat val om AI-behandling,
avgränsade läsningar, privata utkast, kartarbete och återkallad åtkomst.
Anteckna commit,
webbläsare och godkänt eller underkänt resultat vid körning. AI-07 är ett
separat manuellt prov med verklig Google-inloggning och Codex CLI. Det körs
inte i CI och har egna användare och förberedelser nedan.

## Konfigurerade användare

Följande användare gäller AI-01 till AI-06:

- Alex Exempel är administratör i Hushållet Linden och loggar in med Google.
- Robin Exempel är medlem i Linden och loggar in med Microsoft. Robin
  har också tillgång till Hushållet Eken, som Alex inte kan öppna.
- En extern textklient kan anslutas med OAuth. Klientens namn kan skilja
  sig från CI-provets Påhittad textassistent.

## Allmän förberedelse

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan. Detaljpanelen visar uppgifterna. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. I hel kartvy heter knappen **Redigera val**. Att bara välja
objektet eller sambandet öppnar inte formuläret.

Följande förberedelser gäller AI-01 till AI-06. För AI-07 används i stället
den isolerade installation som anges i testfallet.

1. Använd en testinstallation med enbart påhittade data. Förbered verklig
   klientåtkomst enligt [klientens startguide](setup/assistants.md#real-text-client-verification).
2. Skapa ett sparat objekt i Linden. Lägg olika privata förslag i Alex och
   Robins utkast. Lämna dem osparade. Behåll data mellan fallen men
   återkalla anslutningar och återställ medlemskap mellan körningarna.
3. Håll Alex och Robin inloggade i skilda webbläsarprofiler. Anteckna om
   klientprovet gäller ChatGPT web eller Codex-appen. CI använder riktiga
   protokoll och ersatta identitetsleverantörer; det är ett separat resultat.

## Medgivande

### AI-01: OAuth krävs innan assistenten kan läsa kartan

**Syfte:** Kontrollera att en okänd klient saknar kartåtkomst.

**Användare:** Alex och textklienten.

**Förutsättningar:** Klienten saknar en godkänd Skyttel-anslutning.

**Integrationstest:**
[assistants.spec.ts](../../tests/integration/assistants.spec.ts),
testfallet “AI-01: OAuth krävs innan assistenten kan läsa kartan”.

**Steg:**

1. Lägg till Skyttels MCP-adress i klienten med OAuth.
2. Begär en läsning utan att slutföra Skyttels medgivande.
3. Logga in i Skyttel i webbläsaren. Begär därefter `read_map` på `/mcp`
   från samma webbläsarsession med dess vanliga inloggningscookie men utan
   OAuth-token. Kör följande i utvecklarverktygens konsol på Skyttels sida:

   ```javascript
   const svar = await fetch('/mcp', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       jsonrpc: '2.0',
       id: 1,
       method: 'tools/call',
       params: { name: 'read_map', arguments: {} },
     }),
   });
   console.log(svar.status, await svar.json());
   ```

**Förväntat resultat:**

- Klienten behöver autentisering och medgivande. Inget kartinnehåll visas.
- Skyttels vanliga webbinloggning räcker inte som assistentmedgivande.
  Även anropet med enbart inloggningscookie får HTTP 401 utan kartinnehåll.

### AI-02: uttryckligt AI-val ger läsning och återkallelse stoppar gamla token

**Syfte:** Kontrollera läsåtkomst och omedelbar återkallelse.

**Användare:** Alex och textklienten.

**Förutsättningar:** Alex har tillgång till Linden.

**Integrationstest:**
[assistants.spec.ts](../../tests/integration/assistants.spec.ts),
testfallet “AI-02: uttryckligt AI-val ger läsning och återkallelse stoppar gamla
token”.

**Steg:**

1. Anslut klienten, välj Linden och godkänn extern AI-behandling och
   läsåtkomst. Be klienten läsa det sparade objektet.
2. Öppna Assistentanslutningar i Skyttel och återkalla klienten.
3. Begär en ny läsning i samma öppna klient.

**Förväntat resultat:**

- Första läsningen visar tillåtet kartinnehåll. Verktygen är läsande.
- Efter återkallelsen behövs ett nytt medgivande. Ingen ny läsning lyckas
  med den gamla anslutningen. Redan hämtad information kan finnas kvar
  hos klienten; Skyttel lovar inte att den raderas där.

### AI-03: medgivandet kräver val av hushåll och AI-behandling

**Syfte:** Kontrollera ett begripligt och aktivt behandlingsval.

**Användare:** Alex och textklienten.

**Förutsättningar:** Alex är inloggad i Skyttel.

**Integrationstest:**
[assistants.spec.ts](../../tests/integration/assistants.spec.ts),
testfallet “AI-03: medgivandet kräver val av hushåll och AI-behandling”.

**Steg:**

1. Starta anslutningen från klienten. Läs användarnamn, användar-ID,
   klientnamn, omfattning och information om extern behandling.
2. Välj Linden. Kontrollera att godkännande fortfarande är inaktiverat.
3. Markera AI-valet och godkänn läsåtkomsten. Läs kartan från klienten.
4. Återkalla anslutningen i Skyttel och återgå till kartan.

**Förväntat resultat:**

- Valet är skilt från cookies och lämnas inte förmarkerat. Texten lovar
  inte att extern AI-behandling enbart sker i EU.
- Rätt identifierad användare och valt hushåll framgår. Godkännandet
  kräver både hushållsval och AI-val. Efter återkallelse är listan tom
  och manuellt kartarbete finns kvar.

### AI-04: inloggning följs av medgivande och ett nej bevarar kartarbete

**Syfte:** Kontrollera inloggning och nekad anslutning.

**Användare:** Alex och textklienten.

**Förutsättningar:** Alex är utloggad i webbläsaren och klienten saknar
en godkänd anslutning.

**Integrationstest:**
[assistants.spec.ts](../../tests/integration/assistants.spec.ts),
testfallet “AI-04: inloggning följs av medgivande och ett nej bevarar
kartarbete”.

**Steg:**

1. Starta OAuth-anslutningen och logga in med Google när Skyttel ber om det.
2. Välj Nej, anslut inte på medgivandesidan.
3. Öppna Assistentanslutningar och återgå till kartan.

**Förväntat resultat:**

- Inloggningen återkommer till rätt medgivande. Klienten får nekad
  åtkomst och ingen aktiv anslutning skapas.
- Kartans manuella funktioner förblir tillgängliga.

## Åtkomstgränser

### AI-05: eget utkast förblir privat och återkallad åtkomst stoppar klienten

**Syfte:** Kontrollera privata utkast, hushåll och aktuellt medlemskap.

**Användare:** Alex, Robin och Robins anslutna textklient.

**Förutsättningar:** Båda har olika osparade utkast i Linden. Robins
medgivande gäller Linden, även om Robin också har tillgång till Eken.

**Integrationstest:**
[assistants.spec.ts](../../tests/integration/assistants.spec.ts),
testfallet “AI-05: eget utkast förblir privat och återkallad åtkomst stoppar
klienten”.

**Steg:**

1. Be Robins klient läsa det egna utkastet och därefter Alex utkast.
2. Begär att samma anslutning ska läsa Eken genom att ange dess namn.
3. Låt Alex återkalla Robins medlemskap genom Administrera tillgång.
4. Be Robins fortfarande öppna klient läsa utkastet igen.

**Förväntat resultat:**

- Endast Robins privata förslag i Linden kan läsas. Namn och alternativa
  identifierare ger inte tillgång till Alex utkast eller Eken.
- Återkallat medlemskap stoppar nästa anrop även i den öppna klienten.
  Administrativa åtgärder saknas bland assistentens verktyg.

### AI-06: avgränsad läsning visar direkta samband utan orelaterade uppgifter

**Syfte:** Kontrollera att en objektfråga får nödvändigt sammanhang utan
att hela kartan eller orelaterade typdefinitioner följer med.

**Användare:** Alex och den anslutna textklienten.

**Förutsättningar:** Klienten har läsåtkomst till Linden. Skapa och spara
fordonen Blå bilen och Cykeln två steg bort samt personerna Kim och Lo.
Ge personerna egna beskrivningar. Skapa också objekttypen Privat samling
med en egen beskrivning och ett textfält med beskrivning, och ett objekt
Samlingen av den typen. Spara följande samband: Blå bilen → Äger → Kim,
Lo → Använder → Blå bilen med osäker uppgift, Blå bilen → Används av →
Okänt, och Kim → Använder → Cykeln två steg bort.

**Integrationstest:**
[assistants.spec.ts](../../tests/integration/assistants.spec.ts),
testfallet “AI-06: avgränsad läsning visar direkta samband utan orelaterade
uppgifter”.

**Steg:**

1. Anropa `read_map` med Blå bilens `objectId`. Granska verktygssvaret.
2. Anropa samma verktyg med `query` satt till `BILEN`, och sedan med både
   Blå bilens ID och söktexten `bilen`.
3. Sök efter `ingen träff` och begär därefter ett obefintligt objekt-ID.
4. Ange både Blå bilens ID och söktexten `Samlingen`.
5. Begär slutligen hela den sparade kartan utan avgränsning.
6. Föreslå i webbläsaren en rättelse av Blå bilens namn och beskrivning.
   Spara inte. Anropa `read_my_draft` i klienten och granska hela svaret.
   Bilens sparade och föreslagna uppgifter ska finnas kvar; Kim och Lo
   får bara ID, namn och typ i `current.objects`. Deras egna beskrivningar,
   Cykeln två steg bort och Samlingen ska inte följa med automatiskt.

**Förväntat resultat:**

- De tre läsningarna om bilen visar dess sparade uppgifter och tre direkta
  samband. Osäker och okänd uppgift har kvar sin betydelse.
- Kim och Lo visas som ändpunkter med endast ID, namn och typ i
  `contextObjects`. Deras beskrivningar, cykeln och Kims andra samband
  följer inte med. Samlingen och dess typ- och fältbeskrivningar saknas.
- Endast objekttyperna Fordon och Person samt sambandstyperna Äger,
  Använder och Används av följer med i de avgränsade svaren.
- Utebliven träff, obefintligt ID och motsägande ID och söktext ger tomma
  listor även för ändpunkter och typdefinitioner.
- Den oavgränsade läsningen visar de fem skapade objekten och fyra samband.
  `contextObjects` är då tom eftersom ändpunkterna redan är fullständiga
  objekt i svaret.

## Verklig lokal klient

### AI-07: manuellt Codex CLI-prov med Google i devcontainern

**Syfte:** Kontrollera verklig Google-inloggning, OAuth-medgivande, läsning
av sparad karta och eget utkast samt återkallelse och ny anslutning från
Codex CLI i devcontainern.

**Användare:** Den Google-identitet som redan är konfigurerad som första
administratör i den privata utvecklingsfilen. Samma person använder sin
befintliga Codex-inloggning. Personerna i demokartan är påhittade objekt,
inte ytterligare inloggade Skyttel-användare.

**Förutsättningar:** Följ
[den lokala Codex-förberedelsen](setup/assistants.md#manual-local-codex-cli-setup).
Terminal A kör den kompilerade appen på `http://localhost:3301` med en ny,
tillfällig databas. Google-klienten heter **Skyttel local development** och
har `http://localhost:3301/api/auth/callback/google` som tillåten returadress.
Port 3301 är vidarebefordrad till värddatorn. Terminal B används för Codex.
Öppna ett nytt privat webbläsarfönster. Återanvänd inte den vanliga
utvecklingsdatabasen eller en tidigare körnings databas.

Databasen innehåller `TestHousehold`, abonnemanget Familjens Molnmusik,
tjänstekontot Familjens musikkonto och administratörens osparade demoutkast.
Spara eller kasta inte utkastet under provet. Det innehåller även andra
påhittade förslag; detta fall kontrollerar förslaget om inloggningsadress.

**Integrationstest:** Endast manuellt. Verklig Google- och Codex-inloggning
ingår inte i CI eller pull request-körningar och kräver inga hemligheter
där. Närliggande protokollbeteenden täcks med ersatta identitetsleverantörer i
[assistants.spec.ts](../../tests/integration/assistants.spec.ts), bland annat
“AI-02: uttryckligt AI-val ger läsning och återkallelse stoppar gamla token”
och “AI-05: eget utkast förblir privat och återkallad åtkomst stoppar klienten”.
Dessa tester är inte bevis för genomfört AI-07.

**Steg:**

1. Starta `bash scripts/manual-codex-case.sh` i terminal B för guidad körning,
   eller kör förberedelsens CLI-kommandon själv vid respektive steg.
   Kör först `mcp login` enligt guiden.
   Öppna den utskrivna adressen i värddatorns privata webbläsarfönster.
2. Välj **Fortsätt med Google** och logga in med den konfigurerade
   administratörens Google-konto. Kontrollera att du kommer tillbaka till
   Skyttels medgivandesida på port 3301.
3. Kontrollera användaren och klientnamnet, välj `TestHousehold`, läs
   informationen om extern AI-behandling och markera det separata AI-valet.
   Välj **Godkänn läsåtkomst**. Kopiera den fullständiga slutliga
   returadressen från webbläsaren till den väntande CLI-inloggningen.
   Klistra inte in adressen i Codex-konversationen. Webbläsaren kan visa
   anslutningsfel vid returadressen; CLI måste ändå bekräfta inloggningen.
4. Starta den interaktiva Codex-klienten med förberedelsens kommando.
   Be den: ”Använd endast MCP-servern skyttel_development_case. Anropa
   read_map med query Familjens Molnmusik. Visa abonnemangets sparade pris
   och direkta samband. Läs inga lokala filer och använd inte terminalen
   för att hitta svaret.” Kontrollera det faktiska verktygsanropet och
   svaret, inte enbart modellens sammanfattning.
5. Begär ett nytt `read_map` med `query` satt till `Familjens musikkonto`.
   Kontrollera kontots sparade samband **Inloggningsadress**. Begär sedan
   `read_my_draft` utan argument. Be Codex skilja den sparade adressen från
   förslaget i ditt privata utkast. Kontrollera båda verktygssvaren.
6. Öppna `http://localhost:3301` i samma privata webbläsarfönster. Öppna
   **Assistentanslutningar** i `TestHousehold` och välj
   **Återkalla anslutning** för testklienten. Låt Codex-sessionen vara öppen.
7. Begär ett nytt `read_map` för Familjens Molnmusik i samma Codex-session.
   Kräv ett nytt verktygsanrop och granska resultatet. Godkänn inte en ny
   inloggning eller ett nytt medgivande ännu. Ett svar från tidigare
   konversation bevisar varken ny läsning eller nekad åtkomst.
8. Avsluta Codex-sessionen. Kör guidens `mcp logout` för testservern och
   därefter samma `mcp login` igen. Slutför ett nytt Skyttel-medgivande i
   webbläsaren och överför returadressen till CLI. Google kan minnas sin
   inloggning; ett nytt Skyttel-medgivande krävs ändå.
9. Starta Codex med samma serverinställning och begär ett nytt `read_map`
   för Familjens Molnmusik. Kontrollera att verktyget åter kan läsa data.
10. Återkalla även den nya anslutningen i Skyttel. Följ guidens städning:
    avsluta Codex, ta bort testserverns CLI-inloggning, stäng det privata
    webbläsarfönstret och stoppa terminal A. Kontrollera att den tillfälliga
    databasen tas bort. Behåll ordinarie utvecklingsdata och inloggningar.
11. Anteckna datum, commit, Codex-version, webbläsare, lokal adress, Google
    som leverantör, resultat per kontroll och städningens resultat. Utelämna
    hemligheter, personliga identiteter och returadressens frågeparametrar.

**Förväntat resultat:**

- Rätt Skyttel-användare ger uttryckligt medgivande för `TestHousehold`.
  Codex-inloggningen ensam ger ingen tillgång till hushållet.
- Abonnemangets beskrivning anger det påhittade priset 149 kr per månad.
  Alex Exempel står på avtalet, Kim Exempel betalar och betalningsmedlet
  är Familjens musikkort. Uppgifterna kommer från ett lyckat `read_map`.
- Kontots sparade inloggningsadress är `familjen@example.test`.
  `read_my_draft` visar förslaget `musik@example.test` i administratörens
  eget utkast. Förslaget är inte en sparad ändring i den gemensamma kartan.
- Återkallelsen stoppar en ny verktygsläsning med den gamla anslutningen.
  Ett autentiseringsfel eller krav på nytt medgivande ger inga nya kartdata.
  Uppgifter som redan finns i konversationen behöver inte försvinna.
- En ny anslutning med nytt medgivande kan läsa kartan igen. Efter städning
  återstår ingen aktiv testanslutning, testserver eller tillfällig databas.

**Resultatstatus:** Inte genomfört. Om klientregistrering eller inloggning
inte fungerar, anteckna blockerat och ett felbesked utan känsliga värden.
Om ett observerat resultat strider mot kraven, anteckna underkänt. Om inget
nytt verktygsanrop kan visas, är den kontrollen inte verifierad. Anteckna
godkänt först när alla kontroller är genomförda. Ett godkänt AI-07 verifierar
inte ChatGPT på webben, Codex-appen, Microsoft-inloggning eller den
driftsatta HTTPS-ingången.

Fallet är stöd för felsökning av en verklig klient. Den separata,
icke blockerande [restlistan #97](https://github.com/viscalyx/skyttel/issues/97)
behåller personlig inloggning, medgivanden och mänsklig bedömning.
Automatiskt verifierade verktygsregler behöver inte upprepas där.

## Hela kartärenden

AI-08 och AI-12 använder en verklig textklient med kartmedgivande enligt
[klientens startguide](setup/assistants.md#real-text-client-verification).
AI-09 till AI-11 använder den
[kontrollerade lokala MCP-klienten](assistant-advanced.md#controlled-mcp-client):
starta en ny tom provdatabas och hjälpprocess inför varje fall. Guiden ger
exakta kommandon för OAuth, omstart med samma databas och städning.
Använd den konfigurerade administratörens egen inloggning och hushållet
**MCP-prov**. Inga riktiga hushållsuppgifter, modellkostnader eller publika
adresser behövs för dessa tre kontroller. Klienten skickar verktygsanrop;
den provar inte en språkmodells tolkning. Integrationstesterna verifierar
de kontrollerade fallen; #97 kräver ingen manuell upprepning.

### AI-08: kartmedgivande fortsätter webbutkast och sparar hela familjeärendet

**Syfte:** Fortsätta webbläsarens förslag och spara ett samlat familjeärende.

**Användare:** Den konfigurerade administratören i webbläsare och textklient.

**Förutsättningar:** Ny demokarta med Lo-konflikten och förslaget om
inloggningsadress. En äldre läsanslutning kan finnas men ger inte kartarbete.

**Integrationstest:**
[assistant-work.spec.ts](../../tests/integration/assistant-work.spec.ts),
testfallet “AI-08: kartmedgivande fortsätter webbutkast och sparar
hela familjeärendet”.
Modelltolkningen provas dessutom i
[assistant-language.spec.ts](../../tests/real-model/assistant-language.spec.ts),
testfallet “AI-08: verklig modell rättar och sparar hela familjeärendet genom
MCP”, med [separat verklig modellkörning](real-model-tests.md).

**Steg:**

1. Kontrollera att **Hela mitt utkast** i webbläsaren innehåller Lo Lind.
   Starta en ny klientanslutning som begär kartarbete.
2. Välj hushåll och tillåt extern AI-behandling. Kontrollera att
   **Godkänn kartarbete** ännu inte kan väljas. Läs informationen om
   hela utkastet. Markera även valet om förslag och sparande med
   tangentbordet och godkänn.
3. Be assistenten läsa hela utkastet, inklusive tidigare förslag och
   konflikten mellan Lo Lind och Lo Berg. Be den behålla Lo Lind som
   ditt förslag. Kontrollera att pianobeskrivningen finns kvar.
4. Be den läsa Familjens Molnmusik och skilja den som står på avtalet
   från den som betalar och det kort som används.
5. Säg ”Ändra priset till 189 SEK per månad och spara hela utkastet”.
   Granska de faktiska verktygsanropen och kvittot, inklusive det redan
   föreslagna bytet till `musik@example.test`.
6. Öppna kartan igen. Kontrollera Lo Lind, den nya inloggningsadressen,
   priset och det tomma utkastet.

**Förväntat resultat:**

- Medgivandet kräver både AI-valet och valet om kartarbete. Det sparar
  inga uppgifter på egen hand.
- Hela utkastet följer med. Rättelsen och sparandet kräver inte ännu ett
  ja enbart för att rättelsen skapar en ny version.
- Ett kvitto omfattar de två objekträttelserna och adressambandet.
  Efter omladdning finns de sparade uppgifterna och **Inga förslag**.

Vanlig CI använder bestämda MCP-anrop och provar dessutom omstart och
exakt återförsök av kvittot. Den separata modellkörningen provar den
kombinerade instruktionen med verklig modell. Kvaliteten på formuleringen
av besked och andra klienters inloggning bedöms separat.

### AI-09: ett nytt webbförslag stoppar gammalt MCP-sparbesked utan delsparande

**Syfte:** Stoppa ett gammalt sparunderlag från en annan klient.

**Användare:** Samma användare i webbläsare och textklient.

**Förutsättningar:** Ny tom provdatabas och den kontrollerade MCP-klientens
godkända anslutning för kartarbete enligt förberedelsen.

**Integrationstest:**
[assistant-work.spec.ts](../../tests/integration/assistant-work.spec.ts),
testfallet “AI-09: ett nytt webbförslag stoppar gammalt MCP-sparbesked
utan delsparande”.

**Steg:**

1. Föreslå Lo Exempel med **Nytt objekt** i webbläsaren. Spara inte.
2. Kör `capture-save old` i terminal B. Läs hela `review`, kontrollera
   Lo Exempel och att händelsen är `captured`. Klienten behåller exakt
   version, innehållsversion och operations-ID utan att spara.
3. Lägg Kim Exempel i samma utkast genom webbläsaren.
4. Kör `send old`. Kontrollera `result.value.error: draft_conflict`,
   den aktuella versionen och båda objekten i `result.value.review`.
   Ladda om kartan: båda ska vara förslag, inget gemensamt sparat.
5. Kör `capture-save fresh` och granska båda förslagen. Ge ditt nya
   sparbesked genom att köra `send fresh`. Kontrollera ett kvitto med
   båda objekten och ladda om kartan.
6. Kör `send old` igen. Kontrollera avvisning, aldrig ett lyckat kvitto
   för det gamla försöket. Följ guidens återkallelse och städning.

**Förväntat resultat:**

- Det gamla försöket avvisas. Ingen av de två personerna delsparas.
- Svaret visar aktuell version, båda förslagen och behovet av nytt besked.
- Ett nytt godkänt sparande omfattar båda. Det gamla operations-ID:t
  kan inte återanvändas för den nya versionen.

Den kontrollerade klienten skickar den fångade versionen oförändrad;
ingen särskild funktion i en språkmodell behövs för att köra fallet.

### AI-10: förlorat MCP-kvittosvar återfinns efter omstart utan dubbelt sparande

**Syfte:** Återfinna ett förlorat sparresultat efter serveromstart och prova
exakt återförsök utan dubbla ändringar.

**Användare:** Samma användare i webbläsare och textklient.

**Förutsättningar:** Ny tom provdatabas och den kontrollerade MCP-klientens
godkända anslutning för kartarbete enligt förberedelsen.

**Integrationstest:**
[assistant-work.spec.ts](../../tests/integration/assistant-work.spec.ts),
testfallet “AI-10: förlorat MCP-kvittosvar återfinns efter omstart
utan dubbelt sparande”.

**Steg:**

1. Lägg Lo Exempel i utkastet genom webbläsaren. Kör `capture-save lost`
   i terminal B och granska hela utkastet. Anteckna bara det syntetiska
   operations-ID:t från `arguments` för senare jämförelse.
2. Ge ditt sparbesked genom `drop lost`. Kontrollera händelsen
   `response-dropped` och `outcome: "unknown"`. Inget kvitto får skrivas
   ut. Hjälpklientens felpunkt inväntar en lyckad transaktion innan den
   kastar bort svaret; ett fel eller en avvisning verifierar inte steget.
3. Ladda om kartan och kontrollera att Lo Exempel är sparad. Gör inga
   nya ändringar. Stoppa servern i terminal A med Ctrl+C och starta om
   med guidens exakta omstartskommando och samma databas. Behåll terminal
   B öppen så att den ursprungliga begäran finns kvar.
4. Kör `status lost`. Kontrollera `succeeded` och ett beständigt kvitto
   med samma operations-ID. Kontrollera även **Mina sparförsök** i kartan.
5. Kör `send lost`. Jämför kvittots ID, tidpunkt och ändringar med det
   återfunna kvittot; allt ska vara samma. Ladda om kartan och historiken.
6. Följ guidens återkallelse och städning.

**Förväntat resultat:**

- Efter det kontrollerade bortfallet behandlas utfallet som okänt tills
  ett nytt statusanrop verifierar det beständiga resultatet.
- Samma databas efter serveromstart ger samma kvitto. Återförsöket skickar
  de ursprungliga fälten och operations-ID:t, utan ny fångst eller sparbegäran.
- Lo Exempel finns en gång, utkastet är tomt och historiken innehåller
  ett enda sparande. Ingen bekräftad återställning påstås vid uteblivet svar.

Felkontrollen slänger det kompletta lyckade HTTP-svaret vid klientgränsen.
Den bevisar återhämtning efter ett kontrollerat avbrott efter transaktionen,
inte hur en verklig språkmodell reagerar på ett godtyckligt nätfel.

### AI-11: identitetsfrågor blockerar och kastade MCP-förslag förblir kastade

**Syfte:** Behålla identitetsfrågor och respektera kastade förslag.

**Användare:** Samma användare i webbläsare och textklient.

**Förutsättningar:** Ny tom provdatabas och den kontrollerade MCP-klientens
godkända anslutning för kartarbete enligt förberedelsen.

**Integrationstest:**
[assistant-work.spec.ts](../../tests/integration/assistant-work.spec.ts),
testfallet “AI-11: identitetsfrågor blockerar och kastade MCP-förslag
förblir kastade”.

**Steg:**

1. Kör följande rader en i taget i terminal B. Typen slås upp i hushållets
   aktuella katalog; inga typ-ID:n behöver skrivas in.

   <!-- markdownlint-disable MD013 -->
   ```text
   capture-object bank {"id":"manual-bank","type":"Bankkonto","name":"Betalkonto","identity":"unresolved"}
   send bank
   capture-object other {"id":"manual-other","type":"Bankkonto","name":"Hushållskonto"}
   send other
   capture-save blocked
   send blocked
   ```
   <!-- markdownlint-enable MD013 -->

2. Kontrollera `unresolved_identity` och att båda förslagen finns kvar.
   Ladda om kartan: inget av objekten är gemensamt sparat och
   **Spara hela utkastet** är inaktiverad.
3. Välj uttryckligen att Betalkonto får vara ospecificerat. Kör dessa
   rader. Fångsten `delayed` behåller ett oskickat rättelseanrop före
   kastandet; `send delayed` skickar sedan exakt det gamla underlaget.

   <!-- markdownlint-disable MD013 -->
   ```text
   capture-object specified {"id":"manual-bank","type":"Bankkonto","name":"Betalkonto","identity":"unspecified"}
   send specified
   capture-object delayed {"id":"manual-other","type":"Bankkonto","name":"Hushållskonto"}
   discard manual-other
   send delayed
   ```
   <!-- markdownlint-enable MD013 -->

4. Kontrollera `draft_conflict` för det försenade anropet och att
   `review.changes` endast innehåller Betalkonto. Kör `read`, granska hela
   kvarvarande utkastet och spara genom `capture-save final` följt av
   `send final`.
5. Ladda om kartan och öppna Betalkonto. Kontrollera ospecificerad
   identitet och att Hushållskonto saknas. Följ guidens städning.

**Förväntat resultat:**

- Olöst identitet blockerar hela sparandet, även det oberoende förslaget.
- Betalkonto behåller ospecificerad identitet. Hushållskonto sparas inte.
- Det försenade rättelseanropet kan inte återinföra det kastade förslaget.
- Kasta förslag är skilt från att ångra sparade uppgifter.

### AI-12: nekade och hypotetiska sparbesked sparar inget

**Syfte:** Kontrollera den verkliga textklientens tolkning av sparregeln.

**Användare:** Den konfigurerade administratören och den verkliga textklienten.

**Förutsättningar:** Ett påhittat privat förslag om personen **Lo Exempel**,
beskrivning **Spelar piano.**, känd utkastversion och godkänd anslutning för
kartarbete. Anteckna den sparade kartans utgångsläge.

**Integrationstest:**
[assistant-language.spec.ts](../../tests/real-model/assistant-language.spec.ts),
testfallet “AI-12: verklig modell skiljer nekade och hypotetiska besked från
rättelse och sparande”. Följ den
[separata modellguiden](real-model-tests.md) för en uttrycklig
körning med verklig modell och privat nyckel. Vanlig CI använder ingen
verklig modell. Provet använder en MCP SDK-klient; det ger inget resultat
för en annan klients inloggning eller modell.

**Steg:**

1. Säg ”Spara inte ändringarna”. Granska faktiska verktygsanrop och karta.
2. Fråga ”Vad händer om vi sparar hela utkastet?”. Granska åter anrop och karta.
3. Säg ”Spara senare, inte nu”. Be sedan om en förklaring av meningen
   ”Spara hela utkastet” utan att den utförs. Granska åter anrop och karta.
4. Be assistenten sammanfatta hela utkastet. Säg sedan ”Ändra namnet på Lo
   Exempel i mitt utkast till Lo Lind och spara hela utkastet nu. Det är
   samma person. Behåll beskrivningen.” Jämför kartan och beskedet med det
   beständiga kvittot.

**Förväntat resultat:**

- Beskeden i steg 1–3 anropar varken `prepare_save` eller `save_draft`.
  Kartan, utkastet, historiken och sparförsöken förblir oförändrade.
- Steg 4 sparar Lo Lind med beskrivningen kvar, tömmer utkastet och ger
  exakt ett kvitto för hela utkastet. Resultatet består efter omstart.
- Versionskontroller eller modellens egen försäkran anges inte som
  oberoende bevis på vad människan faktiskt sade eller hörde.

Anteckna klient, modell, datum och faktiskt utfall vid verklig körning.
Avvikande klientbeteende får inte döljas av godkända deterministiska
serverprov. Automatisk körning ger en rapport med modell- och
verktygsresultat; den påstår inte att ett mänskligt prov är genomfört.
