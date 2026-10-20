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

Öppna **Tabell** och välj **Redigera** på objektets rad för att ändra
objektet. För ett samband väljer du radens **Samband**, hittar sambandet
och väljer **Redigera samband**. Formulärets **Lägg i utkastet och stäng**
lägger hela förslaget i utkastet. Öppna **Visa utkastet** för att granska
förslagen eller spara hela utkastet.

Följande förberedelser gäller AI-01 till AI-05. AI-06 använder sin egen
tomma utgångspunkt nedan. För AI-07 används i stället
den isolerade installation som anges i testfallet.

1. Använd en testinstallation med enbart påhittade data. Förbered den
   [kontrollerade läsklienten](assistant-client-preparation.md#installation-medgivande-och-städning).
2. Skapa ett sparat objekt **Läsningens lampa**, beskrivning
   **Sparad läsuppgift**, i Linden. Lägg olika privata förslag i Alex och
   Robins utkast. Lämna dem osparade. Börja varje fall med ny databas;
   återkalla anslutningarna och följ guidens städning efter körningen.
3. Håll Alex och Robin inloggade i skilda webbläsarprofiler. Den
   kontrollerade klienten gör inga modellanrop. AI-07, AI-12 och AI-14
   anger separat faktisk klientobservation och leverantörsverifiering.

## Medgivande

### AI-01: OAuth krävs innan assistenten kan läsa kartan

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistants.spec.ts",
    "caseId": "AI-01"
  },
  "reference": "Kontrollerad OAuth/MCP-klient, påhittade identiteter, riktig webbläsare och beständig SQLite. Ingen språkmodell används.",
  "outcomes": [
    "Klienten får ingen kartinformation utan OAuth-medgivande; vanlig webbinloggning räcker inte.",
    "Ett nej skapar ingen assistentanslutning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kontrollera att en okänd klient saknar kartåtkomst.

**Användare:** Alex och textklienten.

**Förutsättningar:** Klienten saknar en godkänd Skyttel-anslutning.

**Integrationstest:**
[assistants.spec.ts](../../tests/integration/assistants.spec.ts),
testfallet “AI-01: OAuth krävs innan assistenten kan läsa kartan”.

**Separat förberedelse:** Kör
[cookiekontrollen](assistant-client-preparation.md#webbcookie-utan-assistentmedgivande-ai-01)
efter vanlig webbinloggning, före assistentmedgivandet. Den är separat
protokollunderlag och ska inte leverera någon kartinformation.

**Steg:**

1. Logga in i Skyttel och öppna **Tabell**. Manuellt kartarbete ska vara
   tillgängligt utan någon assistentanslutning.
2. Starta den kontrollerade läsklienten och öppna dess medgivandesida.
   Utan hushållsval och AI-val ska **Godkänn läsåtkomst** vara inaktiverad.
3. Välj **Nej, anslut inte**. Öppna **Assistentanslutningar** i Skyttel.
   Inga aktiva anslutningar ska finnas och klienten ska sakna kartdata.

**Förväntat resultat:**

- Klienten behöver autentisering och medgivande. Inget kartinnehåll visas.
- Skyttels vanliga webbinloggning räcker inte som assistentmedgivande.
  Även anropet med enbart inloggningscookie får HTTP 401 utan kartinnehåll.

### AI-02: uttryckligt AI-val ger läsning och återkallelse stoppar gamla token

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistants.spec.ts",
    "caseId": "AI-02"
  },
  "evidence": [
    {
      "kind": "technical",
      "runner": "playwright",
      "suite": "integration",
      "spec": "tests/integration/manual-mcp-preparation.spec.ts",
      "title": "manual MCP read-only preparation preserves empty then populated household work",
      "purpose": "Den publicerade läsklienten läser tom och fylld karta och utkast med samma medgivande, utan ändringar; återkallelse stoppar läsning och quit avslutar processen."
    }
  ],
  "reference": "Kontrollerad OAuth/MCP-klient, påhittade identiteter, riktig webbläsare och beständig SQLite. Ingen språkmodell används.",
  "outcomes": [
    "Ett aktivt läsmedgivande ger det sparade objektets namn och beskrivning.",
    "Återkallelsen stoppar nästa läsning med samma anslutning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kontrollera läsåtkomst och omedelbar återkallelse.

**Användare:** Alex och textklienten.

**Förutsättningar:** Alex har tillgång till Linden.

**Integrationstest:**
[assistants.spec.ts](../../tests/integration/assistants.spec.ts),
testfallet “AI-02: uttryckligt AI-val ger läsning och återkallelse stoppar gamla
token”.

**Steg:**

1. Anslut klienten, välj Linden och godkänn extern AI-behandling och
   läsåtkomst. Kör `map Läsningens lampa` och läs namn och beskrivning.
2. Öppna Assistentanslutningar i Skyttel och återkalla klienten.
3. Kör `map Läsningens lampa` igen i samma öppna klient.

**Förväntat resultat:**

- Första läsningen visar tillåtet kartinnehåll. Verktygen är läsande.
- Efter återkallelsen behövs ett nytt medgivande. Ingen ny läsning lyckas
  med den gamla anslutningen. Redan hämtad information kan finnas kvar
  hos klienten; Skyttel lovar inte att den raderas där.

**Separat tekniskt underlag:**
[manual-mcp-preparation.spec.ts](../../tests/integration/manual-mcp-preparation.spec.ts)
provar den publicerade terminalklienten, tomma och fyllda resultat i samma
medgivande, exakt läsande verktygslista, oförändrad karta och utkast samt
återkallelse och processavslut. Det ersätter inte AI-02:s manuella steg.
Följ
[klientprovet](assistant-client-preparation.md#läsande-terminalklient-tom-och-fylld-karta)
för motsvarande separat förberedelse utan språkmodell.

### AI-03: medgivandet kräver val av hushåll och AI-behandling

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistants.spec.ts",
    "caseId": "AI-03"
  },
  "reference": "Kontrollerad OAuth/MCP-klient, påhittade identiteter, riktig webbläsare och beständig SQLite. Ingen språkmodell används.",
  "outcomes": [
    "Både hushållsval och separat AI-val krävs.",
    "Återkallelse lämnar manuellt kartarbete tillgängligt."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistants.spec.ts",
    "caseId": "AI-04"
  },
  "reference": "Kontrollerad OAuth/MCP-klient, påhittade identiteter, riktig webbläsare och beständig SQLite. Ingen språkmodell används.",
  "outcomes": [
    "Google-inloggningen återkommer till medgivandet.",
    "Ett nej skapar ingen anslutning och kartarbete finns kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistants.spec.ts",
    "caseId": "AI-05"
  },
  "reference": "Kontrollerad OAuth/MCP-klient, påhittade identiteter, riktig webbläsare och beständig SQLite. Ingen språkmodell används.",
  "outcomes": [
    "Endast ansluten användares privata utkast i valt hushåll kan läsas.",
    "Återkallat medlemskap stoppar den redan öppna SDK-sessionen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kontrollera privata utkast, hushåll och aktuellt medlemskap.

**Användare:** Alex, Robin och Robins anslutna textklient.

**Förutsättningar:** Båda har olika osparade utkast i Linden. Robins
medgivande gäller Linden, även om Robin också har tillgång till Eken.

**Integrationstest:**
[assistants.spec.ts](../../tests/integration/assistants.spec.ts),
testfallet “AI-05: eget utkast förblir privat och återkallad åtkomst stoppar
klienten”.

**Steg:**

1. Öppna **Hushållet Linden** i Robins webbläsarprofil. Kör `read` i Robins
   klient och jämför hela svaret med Robins fulla läsdialog i
   **Visa utkastet → Visa förslaget: Robins privata förslag**. Kontrollera
   namn **Robins privata förslag**, typ **Person** och beskrivning
   **Ej uppgivet**; klientens motsvarande beskrivning är tom.
   Alex privata förslag ska inte följa med.
2. Kör `tools`: inget verktyg ska erbjuda byte till annan användare eller
   annat hushåll. Kör `map Hushållet Eken` i samma anslutning; namnet
   ska inte byta hushåll eller ge Eken-data. Automationen behåller också
   det separata SDK-anropet med otillåten `householdId` som protokollskydd.
3. Låt Alex återkalla Robins medlemskap genom Administrera tillgång.
4. Kör `read` igen i Robins fortfarande öppna klient.

**Förväntat resultat:**

- Endast Robins privata förslag i Linden kan läsas. Namn och alternativa
  identifierare ger inte tillgång till Alex utkast eller Eken.
- Återkallat medlemskap stoppar nästa anrop även i den öppna klienten.
  Administrativa åtgärder saknas bland assistentens verktyg.

### AI-06: avgränsad läsning visar direkta samband utan orelaterade uppgifter

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistants.spec.ts",
    "caseId": "AI-06"
  },
  "reference": "Kontrollerad OAuth/MCP-klient, påhittade identiteter, riktig webbläsare och beständig SQLite. Ingen språkmodell används.",
  "outcomes": [
    "Bilens direkta samband och nödvändiga ändpunkter läses utan orelaterade detaljer.",
    "Den fulla formulärrättelsen syns i eget utkast med sparade värden kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kontrollera att en objektfråga får nödvändigt sammanhang utan
att hela kartan eller orelaterade typdefinitioner följer med.

**Användare:** Alex och den anslutna textklienten.

**Förutsättningar:** Börja med ny databas och Linden enligt
[AI-06:s egen förberedelse](assistant-client-preparation.md#avgränsad-läsning-ai-06).
Skapa inte Läsningens lampa eller Alex och Robins privata personförslag.
Klienten har läsåtkomst till Linden. Skapa och spara
fordonen Blå bilen och Cykeln två steg bort samt personerna Kim och Lo.
Ge personerna egna beskrivningar. Skapa också objekttypen Privat samling
med en egen typförklaring och ett objekt med en fri textegenskap, samt ett
objekt
Samlingen av den typen. Spara följande samband: Blå bilen → Äger → Kim,
Lo → Använder → Blå bilen med osäker uppgift, Blå bilen → Används av →
Okänt, och Kim → Använder → Cykeln två steg bort.

**Integrationstest:**
[assistants.spec.ts](../../tests/integration/assistants.spec.ts),
testfallet “AI-06: avgränsad läsning visar direkta samband utan orelaterade
uppgifter”.

**Steg:**

1. Kör de sju exakta läsningarna i
   [den separata förberedelsen](assistant-client-preparation.md#avgränsad-läsning-ai-06)
   och jämför resultaten nedan. Den innehåller också tekniska ID-jämförelser.
2. Öppna Blå bilen genom **Tabell → Redigera Blå bilen**. Ändra namnet
   till **Rättad blå bil** och beskrivningen till **Bilens rättade uppgifter**.
   Välj **Lägg i utkastet och stäng** och öppna förslagets fulla läsdialog
   i **Visa utkastet**. Läs både sparad och föreslagen beskrivning. Spara inte.
3. Kör `read` i klienten och granska hela svaret.
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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "external-client",
    "observation": "Människan slutför verklig Google- och Codex CLI-inloggning, granskar faktiska nya verktygsanrop efter återkallelse och ett nytt medgivande."
  },
  "reference": "Namngiven faktisk klient, konto, modell, datum och observerade nya verktygsanrop; separat resultat från syntetisk integration.",
  "outcomes": [
    "Verklig klientinloggning, sparad karta och eget utkast går att skilja åt.",
    "Samma Codex-session stoppas efter återkallelse och nytt medgivande återger läsning."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/assistants.spec.ts",
      "caseId": "AI-02",
      "purpose": "Kontrollerat läsmedgivande och återkallelse."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/assistants.spec.ts",
      "caseId": "AI-05",
      "purpose": "SDK-sessionens privata och aktuella åtkomstgränser."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

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

**Kräver mänsklig observation:** Verklig extern klient och konto. Verklig
Google- och Codex-inloggning
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

Fallet är stöd för felsökning av en verklig klient. Personlig inloggning,
medgivanden och mänsklig bedömning följer
[den gemensamma förberedelsen](README.md#personliga-konton-ljud-och-aviseringar).
Automatiskt verifierade verktygsregler behöver inte upprepas manuellt.

## Hela kartärenden

AI-08–11 använder den
[kontrollerade lokala MCP-klienten](assistant-advanced.md#controlled-mcp-client):
AI-09–11 börjar med ny tom databas; AI-08 använder en ny demokarta enligt
sina förutsättningar. Starta en ny hjälpprocess inför varje fall. Guiden ger
exakta kommandon för OAuth, omstart med samma databas och städning.
Använd den konfigurerade administratörens egen inloggning och hushållet
**MCP-prov** för tomma fall, **TestHousehold** för AI-08. Inga riktiga
hushållsuppgifter, modellkostnader eller publika
adresser behövs för dessa fyra kontroller. Klienten skickar verktygsanrop;
den provar inte en språkmodells tolkning. Integrationstesterna verifierar
de kontrollerade fallen; manuell upprepning är frivilligt felsökningsstöd.

### AI-08: kartmedgivande fortsätter webbutkast och sparar hela familjeärendet

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-work.spec.ts",
    "caseId": "AI-08"
  },
  "reference": "Kontrollerad OAuth/MCP-klient, påhittade identiteter, riktig webbläsare och beständig SQLite. Ingen språkmodell används.",
  "outcomes": [
    "Kartmedgivandet fortsätter hela webbutkastet; konflikten rättas före sparandet.",
    "Ett sparkvitto omfattar båda objekträttelserna och adressambandet.",
    "Omstart bevarar hela familjeärendet och tömmer utkastet."
  ],
  "evidence": [
    {
      "kind": "real-provider",
      "spec": "tests/real-model/assistant-language.spec.ts",
      "caseId": "AI-08",
      "purpose": "Separat uttryckligen auktoriserad modellkörning för samlad svensk instruktion; inga påståenden om annan klientinloggning."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Fortsätta webbläsarens förslag och spara ett samlat familjeärende.

**Användare:** Den konfigurerade administratören i webbläsare och textklient.

**Förutsättningar:** Använd den nya demokartan från
[demoförberedelsen](setup/assistants.md#manual-local-codex-cli-setup),
med Lo-konflikten och förslaget om inloggningsadress. Anslut den
kontrollerade klienten på samma adress enligt dess startguide; starta
inte samtidigt guidens andra server. Ingen modell behövs för detta fall.
En äldre läsanslutning kan finnas men ger inte kartarbete.

**Integrationstest:**
[assistant-work.spec.ts](../../tests/integration/assistant-work.spec.ts),
testfallet “AI-08: kartmedgivande fortsätter webbutkast och sparar
hela familjeärendet”.
Modelltolkningen provas dessutom i
[assistant-language.spec.ts](../../tests/real-model/assistant-language.spec.ts),
testfallet “AI-08: verklig modell rättar och sparar hela familjeärendet genom
MCP”, med [separat verklig modellkörning](real-model-tests.md).

**Steg:**

1. Öppna **Visa utkastet** och kontrollera att utkastet innehåller Lo Lind.
   Starta en ny klientanslutning som begär kartarbete.
2. Välj hushåll och tillåt extern AI-behandling. Kontrollera att
   **Godkänn kartarbete** ännu inte kan väljas. Läs informationen om
   hela utkastet. Markera även valet om förslag och sparande med
   tangentbordet och godkänn.
3. Läs hela utkastet i den kontrollerade klienten. Använd
   [familjeärendets fångster](assistant-client-preparation.md#familjeärendet-ai-08)
   för att välja ditt förslag Lo Lind i konflikten. Kontrollera att
   pianobeskrivningen finns kvar.
4. Läs Familjens Molnmusik genom klientens kartläsning. Skilj den som
   står på avtalet från den som betalar och det kort som används.
5. Följ samma förberedelses fulla prisrättelse och granska hela utkastet.
   Ge ditt uttryckliga sparbesked med klientens fångade sparbegäran.
   Kontrollera beskedet att hela utkastet sparas, inklusive adressbytet.
6. Följ förberedelsens omstart och tekniska återförsök. Öppna kartan igen.
   Kontrollera det tomma utkastet och stäng textvyn.
   Öppna **Tabell** och kontrollera Lo Lind. Välj **Samband** för
   **Familjens musikkonto** och kontrollera den nya inloggningsadressen.
   Stäng läsningen, välj **Redigera Familjens Molnmusik** och öppna
   **Fria egenskaper** för att kontrollera pris **189**, valuta
   **SEK** och betalningsintervall **månad**, alla som textegenskaper.
   Kontrollera beskrivningen **Familjeabonnemang, 189 kr per månad.**
   Stäng formuläret och redigera Lo Lind: pianobeskrivningen ska finnas kvar.

**Förväntat resultat:**

- Medgivandet kräver både AI-valet och valet om kartarbete. Det sparar
  inga uppgifter på egen hand.
- Hela utkastet följer med. Rättelsen och sparandet kräver inte ännu ett
  ja enbart för att rättelsen skapar en ny version.
- Ett kvitto omfattar de två objekträttelserna och adressambandet.
  Efter omstart finns de fulla sparade uppgifterna och **Utkastet är tomt.**

Vanlig CI använder bestämda MCP-anrop och provar dessutom omstart och
exakt återförsök av kvittot. Den separata modellkörningen provar den
kombinerade instruktionen med verklig modell. Kvaliteten på formuleringen
av besked och andra klienters inloggning bedöms separat.

### AI-09: ett nytt webbförslag stoppar gammalt MCP-sparbesked utan delsparande

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-work.spec.ts",
    "caseId": "AI-09"
  },
  "reference": "Kontrollerad OAuth/MCP-klient, påhittade identiteter, riktig webbläsare och beständig SQLite. Ingen språkmodell används.",
  "outcomes": [
    "Nytt webbförslag avvisar gammalt sparbesked utan delsparande.",
    "Färskt godkännande sparar båda förslagen; gammalt försök förblir avvisat."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-work.spec.ts",
    "caseId": "AI-10"
  },
  "reference": "Kontrollerad OAuth/MCP-klient, påhittade identiteter, riktig webbläsare och beständig SQLite. Ingen språkmodell används.",
  "outcomes": [
    "Ett verkligt genomfört sparande med tappat svar behandlas som okänt.",
    "Samma beständiga kvitto återfinns efter omstart; exakt återförsök ger ett enda sparande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Återfinna ett förlorat sparresultat efter serveromstart och prova
exakt återförsök utan dubbla ändringar.

**Användare:** Samma användare i webbläsare och textklient.

**Förutsättningar:** Ny tom provdatabas och den kontrollerade MCP-klientens
godkända anslutning för kartarbete enligt förberedelsen.

**Integrationstest:**
[assistant-work.spec.ts](../../tests/integration/assistant-work.spec.ts),
testfallet “AI-10: förlorat MCP-kvittosvar återfinns efter omstart
utan dubbelt sparande”.

**Separat förberedelse:** Följ
[det tappade kvittots tekniska steg](assistant-client-preparation.md#tappat-kvitto-ai-10)
vid steg 1–5. Behåll båda klientterminalerna under omstarten. Guiden
fångar begäran, tappar det genomförda svaret och jämför hela återfunna
kvittot utan att kräva interna identifierare i webbläsarkontrollerna.

**Steg:**

1. Lägg Lo Exempel, typ Person och tom beskrivning, i utkastet genom
   webbläsaren. Granska hela förslaget och fånga sparunderlaget enligt
   den separata förberedelsen.
2. Ge ditt sparbesked vid förberedelsens felpunkt. Klienten visar ett
   okänt utfall utan kvitto. Kontrollera inte ett lyckat sparande förrän
   en ny läsning ger besked.
3. Ladda om kartan. Välj **Tabell → Redigera Lo Exempel** och kontrollera
   namnet **Lo Exempel**, typen **Person** och tom beskrivning. Stäng
   formuläret utan ändringar. Stoppa servern i terminal A med Ctrl+C och
   starta om med guidens exakta omstartskommando och samma databas. Behåll
   terminal B öppen så att den ursprungliga begäran finns kvar.
4. Återfinn resultatet enligt förberedelsen. Öppna
   **Rapporter → Ändringshistorik** och kontrollera det enda sparandet
   av Lo Exempel. Välj **Identifiera sparandet och användaren** och
   kontrollera att sparande, användare och tidpunkt går att läsa.
5. Följ förberedelsens återförsök och jämförelse. Ladda om kartan och
   historiken: inget andra sparande ska tillkomma. Öppna
   **Identifiera sparandet och användaren** igen och kontrollera samma
   sparande, användare och tidpunkt som före återförsöket.
   Välj **Tillbaka till arbetet**, öppna **Visa utkastet** och kontrollera
   **Utkastet är tomt.**
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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-work.spec.ts",
    "caseId": "AI-11"
  },
  "reference": "Kontrollerad OAuth/MCP-klient, påhittade identiteter, riktig webbläsare och beständig SQLite. Ingen språkmodell används.",
  "outcomes": [
    "Olöst identitet blockerar hela sparandet.",
    "Ett försenat förslag återinför inte det kastade objektet; ospecificerat konto bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

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
   capture-object bank
   {"id":"manual-bank","type":"Bankkonto","name":"Betalkonto","identity":"unresolved"}
   send bank
   capture-object other
   {"id":"manual-other","type":"Bankkonto","name":"Hushållskonto"}
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
   capture-object specified
   {"id":"manual-bank","type":"Bankkonto","name":"Betalkonto","identity":"unspecified"}
   send specified
   capture-object delayed
   {"id":"manual-other","type":"Bankkonto","name":"Hushållskonto"}
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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "external-client",
    "observation": "Människan ansluter den namngivna verkliga textklienten och granskar dess faktiska verktygsanrop och tolkning av nekade, hypotetiska och uttryckliga sparbesked."
  },
  "reference": "Namngiven faktisk klient, konto, modell, datum och observerade nya verktygsanrop; separat resultat från syntetisk integration.",
  "outcomes": [
    "Nekade och hypotetiska besked lämnar kartan och utkastet oförändrade.",
    "Den uttryckliga rättelsen och sparbegäran ger ett beständigt kvitto med bibehållen beskrivning."
  ],
  "evidence": [
    {
      "kind": "real-provider",
      "spec": "tests/real-model/assistant-language.spec.ts",
      "caseId": "AI-12",
      "purpose": "Separat verklig modellverifiering av språktolkningen, utan att utföra mänsklig klientobservation."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kontrollera den verkliga textklientens tolkning av sparregeln.

**Användare:** Den konfigurerade administratören och den verkliga textklienten.

**Förutsättningar:** Ett påhittat privat förslag om personen **Lo Exempel**,
beskrivning **Spelar piano.**, känd utkastversion och godkänd anslutning för
kartarbete. Anteckna den sparade kartans utgångsläge.

**Kräver mänsklig observation:** Anslut den namngivna verkliga klienten
enligt [klientguiden](setup/assistants.md#real-text-client-verification).
Kontrollera dess faktiska inloggning, verktygsanrop och svenska besked vid
varje steg. Anteckna klientens eget resultat; den separata modellrapporten
utför inte denna konto- och klientobservation.

**Separat verklig leverantörsverifiering:**
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

## Profilens anslutningar

### AI-13: Öppna assistentanslutningar och återgå till pågående arbete

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistants.spec.ts",
    "caseId": "AI-13"
  },
  "reference": "390×900, ljust tema och verkligt tangentbordsfokus.",
  "outcomes": [
    "Profilens anslutningar får synligt tangentbordsfokus vid 390 pixlar.",
    "Oskickad formulärtext skyddas före avresa; oberoende privata värden bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Ge tangentbordsfokus till profilens destination, skydda oskickad
text före avresa och behålla oberoende privata förslag vid återgången.

**Användare:** Alex Exempel, inloggad medlem i ett provhushåll.

**Förutsättningar:** Använd ljust tema och ett 390 pixlar brett fönster.
Skapa och spara två fordon, **Cykeln** och **Bilen**, med beskrivningarna
**Sparat om Cykeln** och **Sparat om Bilen**. Ändra sedan Bilens beskrivning
till **Bilens oberoende privata förslag** och lägg ändringen i ditt privata
utkast utan att spara. Inga assistentanslutningar ska finnas. Anteckna ditt
Skyttel-ID från profilen.

**Integrationstest:**
[assistants.spec.ts](../../tests/integration/assistants.spec.ts), testfallet
“AI-13: profile navigation focuses assistant connections and preserves
unsent and private work”.

**Steg:**

1. Öppna **Tabell** och **Redigera Cykeln**. Skriv
   **Cykelns oskickade profiltext** som beskrivning utan att skicka den.
2. Tryck Escape och välj **Fortsätt redigera**. Kontrollera beskrivningen
   och att fokus återkommer. Tryck Escape igen och välj
   **Kasta ändringarna och fortsätt**. Öppna **Din profil**.
   Använd tangentbordet för att välja länken
   **Assistentanslutningar**.
3. Kontrollera att sidans rubrik har synligt tangentbordsfokus och att
   texten visar Alex Exempel med samma Skyttel-ID. Kontrollera beskedet
   **Inga aktiva assistentanslutningar.**
4. Välj **Tillbaka till kartan** med tangentbordet och **Redigera Cykeln**
   i **Tabell**. Kontrollera den sparade beskrivningen **Sparat om Cykeln**.
   Den uttryckligen kastade texten ska inte återkomma. Kontrollera också Bilens
   privata förslag finns kvar och att de sparade beskrivningarna är samma.

**Förväntat resultat:**

- Destinationens rubrik får synligt fokus och går att läsa utan att sidan
  behöver rullas i sidled. Kontrollen av rubrikens placering och träffyta
  ingår i automationen.
- **Fortsätt redigera** behåller Cykelns exakta text. Ett uttryckligt val
  kastar bara den oskickade formulärtexten. Återgången behåller Bilens
  privata förslag, den sparade kartan, kartvyn och användarens Skyttel-ID.
- Profilnavigeringen skapar ingen assistentanslutning, inget medgivande
  och inget nytt förslag eller sparande. Automationen jämför kartans och
  anslutningarnas faktiska serverunderlag före och efter flödet.

## Verklig klient för familjeärendet

### AI-14: faktisk klient tolkar och genomför familjeärendet

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "external-client",
    "observation": "Människan ansluter sin verkliga klient, granskar dess svenska tolkning och faktiska MCP-anrop för hela familjeärendet samt kontrollerar att sparbekräftelsen bygger på kvittot."
  },
  "reference": "Namngiven verklig klient och modell med påhittad demokarta; faktiskt observerad OAuth-inloggning och verktygsanrop.",
  "outcomes": [
    "Klientens samlade instruktion behåller hela utkastet och de avsedda familjerättelserna.",
    "Ett faktiskt kvitto bekräftar hela sparandet; klientens egen försäkran räcker inte."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/assistant-work.spec.ts",
      "caseId": "AI-08",
      "purpose": "Kontrollerat helt familjeärende genom browser, MCP och beständig lagring."
    },
    {
      "kind": "real-provider",
      "spec": "tests/real-model/assistant-language.spec.ts",
      "caseId": "AI-08",
      "purpose": "Separat verklig modelltolkning med MCP SDK-klient; utför inte annan klients kontoobservation."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skilja en faktisk klients inloggning och språktolkning från
kontrollerade verktygsanrop.

**Användare:** Administratören och den namngivna verkliga textklienten.

**Förutsättningar:** Ny påhittad demokarta med Lo-konflikten och det
osparade adressbytet. Förbered anslutningen enligt
[den verkliga klientguiden](setup/assistants.md#real-text-client-verification).
Använd redan godkänd klient- och leverantörskörning; detta dokument ger
ingen auktorisation för avgiftsbelagda anrop.

**Kräver mänsklig observation:** Slutför den faktiska klientens
OAuth-flöde och granska nya verktygsanrop och svenska besked. En separat
modellrapport utför inte denna klientobservation.

**Steg:**

1. Välj hushållet och ge både AI-medgivande och kartmedgivande i Skyttel.
2. Be klienten läsa hela utkastet, behålla Lo Lind i namnkonflikten och
   behålla pianobeskrivningen. Be den läsa Familjens Molnmusik och skilja
   avtalspart, betalare och kort. Granska de faktiska verktygssvaren.
3. Säg **Ändra priset till 189 SEK per månad och spara hela utkastet**.
   Kontrollera verktygsanrop och sparkvitto för båda objekten och adressbytet.
4. Följ AI-08:s slutliga webbläsarläsning av hela värdena efter omstart.
5. Anteckna klient, konto-/leverantörssätt, modell, datum, faktiskt utfall
   och städning. Återkalla anslutningen och ta bort de tillfälliga uppgifterna.

**Förväntat resultat:** Den verkliga klienten kan anslutas och gör hela
familjerättelsen utan att dölja misslyckade verktygsanrop bakom ett eget
besked. Sparbekräftelsen går att verifiera med kvittot och webbläsarläsning.

**Resultatstatus:** Inte genomfört. Rapportera klientobservation och
separat verklig modellkörning var för sig.
