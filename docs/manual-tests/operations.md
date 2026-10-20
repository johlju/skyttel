# Manuella testfall för sparförsök och demoförberedelse

Testfallen gäller att återfinna sparförsök och skilja ett okänt utfall från
ett väntande, genomfört eller avvisat sparande. Anteckna commit,
webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Logga in med den administratör som anges av
`SKYTTEL_FIRST_ADMIN_PROVIDER` och `SKYTTEL_FIRST_ADMIN_SUBJECT`.
Använd samma inloggning i två separata webbläsarprofiler. En annan
webbläsare går också bra. Den andra profilen får inte ärva den första
profilens flikar eller lokala webbläsardata.

SPAR-04 och SPAR-05 behöver dessutom en separat testidentitet med aktuell
tillgång till hushållet och rollen medlem. Följ
[inbjudan av en användare](../user-guide/access.md#bjud-in-en-skyttel-användare)
för att ge identiteten tillgång. Kartans påhittade personer och Robin Demo
saknar inloggning;
de kan inte användas som testidentitet.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

Öppna **Tabell** och välj **Redigera [objektets namn]** för att ändra ett
befintligt objekt. **Nytt objekt** finns direkt i verktygsfältet. För
samband väljer du **Samband för [objektets namn]** och dess namngivna
redigeringsknapp. Förslag läggs i ditt privata utkast; sparandet görs
separat genom **Visa utkastet → Spara hela utkastet**.

1. Förbered en separat utvecklingsdatabas enligt
   [demodata och återställning](../development/devcontainer.md#reset-demo-data).
   Återställning tar bort befintliga utvecklingsdata och sessioner.
2. Kör `npm run db:setup` och starta applikationen med `npm run dev:all`.
3. Öppna [utvecklingsklienten](http://localhost:5173) och logga in som
   den konfigurerade administratören. Kontrollera **TestHousehold**.
4. Öppna **Visa utkastet**, välj **Kasta hela utkastet** och bekräfta
   borttagningen för att ta bort demoutkastet.

Återställ demodata före varje fall. Behåll samma databas under omstart
inom ett testfall; kör då inte `npm run db:setup`.

## Gemensamma demodata

### DEMO-01: utvecklingshushållet har verkliga uppgifter och läsbara samband

**Syfte:** Kontrollera den gemensamma utvecklingsförberedelsen genom den
vanliga arbetsytan, med fulla värden, konflikter och bevarade privata förslag.

**Användare:** Den konfigurerade Google-administratören och en ännu
olänkad Microsoft-identitet med samma visningsnamn. Robin Demo är en
historisk person utan inloggning och ger ingen annan person medlemskap.

**Förutsättningar:** Använd endast den separata utvecklingsdatabasen.
Ange `google` som `SKYTTEL_FIRST_ADMIN_PROVIDER` och administratörens
korrekta subject enligt installationsguiden. Kör steg 1–2 i Allmän
förberedelse, öppna klienten utloggad och kasta inte demoutkastet i steg 4.
Databasförberedelsen tar bort tidigare utvecklingsdata och sessioner.

**Integrationstest:**
[database-setup.spec.ts](../../tests/integration/database-setup.spec.ts),
DEMO-01, Google som konfigurerad administratör.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/database-setup.spec.ts",
    "caseId": "DEMO-01"
  },
  "reference": "Google som första administratör; Microsoft förblir utanför",
  "outcomes": [
    "Endast konfigurerad identitet får administratörstillgång",
    "Fria egenskaper och giltiga samband går att läsa utan ändring",
    "Kartdata och privata förslag finns kvar efter omstart"
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/demo.test.ts",
      "title": "the demo preserves free properties and valid links through restart",
      "purpose": "SQLite, validerade ändpunkter och bevarande efter omstart."
    }
  ]
}
```
-->

**Steg:**

1. Välj **Fortsätt med Microsoft**, sedan **Fortsätt till Microsoft**,
   och logga in med den olänkade identiteten. Läs **Du har inte tillgång
   till hushållet**. Välj **Logga ut**. Välj Google och fortsätt till
   leverantören som den konfigurerade administratören. Öppna **Tabell**.
   Kontrollera **TestHousehold**, Alex Exempel, Alex blå cykel och
   Familjens garage. Expandera cykelns rad.
2. Läs Ramfärg **Blå**, Extrahjul **0**, Kontrolldatum **2026-04-03**,
   Elcykel **Nej** och Dold rammärkning **Syntetisk ram: DEMO-CYKEL**.
   Läs egenskaperna Beskrivning, Pris **4995**, Valuta **SEK** och
   Startdatum **2026-04-03** samt ikonen och statusen. Öppna
   **Samband för Lindens musikförening** och kontrollera **Inga samband**.
   Stäng med Escape. Öppna **Samband för Molnmusik** och läs
   egenskapen **Osäkert uppgivet: Ja**. Stäng med Escape.
3. Öppna **Samband för Alex Exempel** och välj **Alex blå cykel**.
   Läs de fulla uppgifterna, öppna cykelns samband och välj
   **Familjens garage**. Stäng med Escape och återgå till tabellen.
4. Öppna **Granska konflikter** via konfliktantalet. Läs Lo Lind i
   ditt förslag och Lo Berg i den gemensamma kartan. Stäng utan att välja
   eller bekräfta något.
5. Öppna **Visa utkastet**. Läs de två bevarade förslagen: Lo Lind
   och den ändrade inloggningsadressen till `musik@example.test`.
   Öppna **Rapporter → Ändringshistorik** och läs de två verkliga
   sparandena med skilda personer. Gör inga ändringar.
6. Starta om applikationen med samma databas och ladda om sidan.
   Öppna **Tabell** och **Visa utkastet**. Kontrollera cykeln, Lo Lind
   och `musik@example.test`. Kör inte databasförberedelsen på nytt.

**Förväntat resultat:**

- Hushållet innehåller sexton sparade objekt och tjugoett samband.
  Alex → cykel → garage nås utan visuell kartnavigation.
- Alla fyra egenskapsslag, noll och Nej är läsbara. Beskrivning och
  ekonomiska uppgifter är fria egenskaper, oberoende av objekttypen.
  Musikföreningen är ett giltigt fristående objekt utan samband.
- Granskning och läsning ändrar inte kartan, de två privata förslagen
  eller historiken. De två sparandena behåller sin verkliga upphovsperson.
- Endast den konfigurerade inloggningen får administratörstillgång.
  Den andra leverantörens inloggning ger inte tillgång genom samma namn.
  Automatiseringen verifierar denna gräns och bevarande efter omstart.

### DEMO-02: Microsoft-administratören får samma färdiga utvecklingshushåll

**Syfte:** Kontrollera Microsofts egen administratörsgräns och den
fullständiga demoförberedelsen, med samma läsning och bevarade privata förslag.

**Användare:** Den konfigurerade Microsoft-administratören och en ännu
olänkad Google-identitet med samma visningsnamn. Robin Demo är en
historisk person utan inloggning och ger ingen annan person medlemskap.

**Förutsättningar:** Använd endast den separata utvecklingsdatabasen.
Ange `microsoft` som `SKYTTEL_FIRST_ADMIN_PROVIDER` och administratörens
korrekta subject enligt installationsguiden. Kör steg 1–2 i Allmän
förberedelse, öppna klienten utloggad och kasta inte demoutkastet i steg 4.
Databasförberedelsen tar bort tidigare utvecklingsdata och sessioner.

**Integrationstest:**
[database-setup.spec.ts](../../tests/integration/database-setup.spec.ts),
DEMO-02, Microsoft som konfigurerad administratör.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/database-setup.spec.ts",
    "caseId": "DEMO-02"
  },
  "reference": "Microsoft som första administratör; Google förblir utanför",
  "outcomes": [
    "Endast konfigurerad identitet får administratörstillgång",
    "Fria egenskaper och giltiga samband går att läsa utan ändring",
    "Kartdata och privata förslag finns kvar efter omstart"
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/demo.test.ts",
      "title": "the demo preserves free properties and valid links through restart",
      "purpose": "SQLite, validerade ändpunkter och bevarande efter omstart."
    }
  ]
}
```
-->

**Steg:**

1. Välj **Fortsätt med Google**, sedan **Fortsätt till Google**,
   och logga in med den olänkade identiteten. Läs **Du har inte tillgång
   till hushållet**. Välj **Logga ut**. Välj Microsoft och fortsätt till
   leverantören som den konfigurerade administratören. Öppna **Tabell**.
   Kontrollera **TestHousehold**, Alex Exempel, Alex blå cykel och
   Familjens garage. Expandera cykelns rad.
2. Läs Ramfärg **Blå**, Extrahjul **0**, Kontrolldatum **2026-04-03**,
   Elcykel **Nej** och Dold rammärkning **Syntetisk ram: DEMO-CYKEL**.
   Läs egenskaperna Beskrivning, Pris **4995**, Valuta **SEK** och
   Startdatum **2026-04-03** samt ikonen och statusen. Öppna
   **Samband för Lindens musikförening** och kontrollera **Inga samband**.
   Stäng med Escape. Öppna **Samband för Molnmusik** och läs
   egenskapen **Osäkert uppgivet: Ja**. Stäng med Escape.
3. Öppna **Samband för Alex Exempel** och välj **Alex blå cykel**.
   Läs de fulla uppgifterna, öppna cykelns samband och välj
   **Familjens garage**. Stäng med Escape och återgå till tabellen.
4. Öppna **Granska konflikter** via konfliktantalet. Läs Lo Lind i
   ditt förslag och Lo Berg i den gemensamma kartan. Stäng utan att välja
   eller bekräfta något.
5. Öppna **Visa utkastet**. Läs de två bevarade förslagen: Lo Lind
   och den ändrade inloggningsadressen till `musik@example.test`.
   Öppna **Rapporter → Ändringshistorik** och läs de två verkliga
   sparandena med skilda personer. Gör inga ändringar.
6. Starta om applikationen med samma databas och ladda om sidan.
   Öppna **Tabell** och **Visa utkastet**. Kontrollera cykeln, Lo Lind
   och `musik@example.test`. Kör inte databasförberedelsen på nytt.

**Förväntat resultat:**

- Hushållet innehåller sexton sparade objekt och tjugoett samband.
  Alex → cykel → garage nås utan visuell kartnavigation.
- Alla fyra egenskapsslag, noll och Nej är läsbara. Beskrivning och
  ekonomiska uppgifter är fria egenskaper, oberoende av objekttypen.
  Musikföreningen är ett giltigt fristående objekt utan samband.
- Granskning och läsning ändrar inte kartan, de två privata förslagen
  eller historiken. De två sparandena behåller sin verkliga upphovsperson.
- Endast den konfigurerade inloggningen får administratörstillgång.
  Den andra leverantörens inloggning ger inte tillgång genom samma namn.
  Automatiseringen verifierar denna gräns och bevarande efter omstart.

## Separat tekniskt installationsunderlag

[database-setup.spec.ts](../../tests/integration/database-setup.spec.ts)
behåller tre kontroller märkta `@technical`: upprepad återställning rensar
hushåll, medlemskap, inbjudningar, sessioner och framtida fixturtabeller;
osäker eller ofullständig konfiguration avvisas före ändring; misslyckad
sådd rullas tillbaka utan läckta privata diagnoser eller förlorad session.
De ersätter inga av demofallens webbläsarhandlingar.

[startup.spec.ts](../../tests/integration/startup.spec.ts) behåller
separat tekniskt underlag för maskerade privata diagnoser vid ogiltig
konfiguration, upptagen lyssnare utan falsk beredskap och ren avstängning
med både SIGTERM och SIGINT följd av återöppnad SQLite-lagring.
Tekniska installationskontroller kräver ingen uppfunnen manuell UI-motsvarighet.

## Återfinna ett sparande

### SPAR-01: återfinna ett genomfört sparande från en annan klient

**Syfte:** Kontrollera att ett beständigt kvitto kan återfinnas efter
omstart och byte av klient utan att användaren behöver ett operations-ID.

**Användare:** Den konfigurerade administratören i båda profilerna.

**Förutsättningar:** Allmän förberedelse ovan. Ingen profil har ett
pågående sparförsök. Operatören förbereder
[vanlig installation och annan klient](save-preparation.md#vanlig-installation-och-annan-klient)
och armar `save:drop-after` före steg 2.

**Integrationstest:**
[operations.spec.ts](../../tests/integration/operations.spec.ts),
SPAR-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/operations.spec.ts",
    "caseId": "SPAR-01"
  },
  "reference": "Genomförd transaktion, tappat svar, annan klient och omstart.",
  "outcomes": [
    "Sparandet visas i historiken i den andra profilen och beskriver **Återfunnet sparande**. Automationen jämför separat samma beständiga kvitto.",
    "Utkastet visar **Utkastet är tomt.** Objektet finns en gång i kartan.",
    "Ett genomfört sparande går att hitta även när den ursprungliga profilen är stängd och servern startar om."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ
[vanlig installation och annan klient](save-preparation.md#vanlig-installation-och-annan-klient)
. Arma sparfelet före UI-steg 2 enligt den befintliga förberedelsen. Efter
användarens verkliga Spara: kräv transportens status 200 och meddela **Samma
sparande är genomfört och dess svar tappat**. Behåll samma databas genom
serveromstart och klientbyte. Återställ HTTPS-ingången före `quit`, efter att
utfallet klargjorts.

**Steg:**

1. Välj **Nytt objekt**, skriv **Återfunnet sparande** som namn och välj **Lägg
   i utkastet och stäng**.
2. Öppna **Visa utkastet**, välj **Spara hela utkastet** och läs **Utfallet är
   okänt** efter operatörens bekräftelse att samma genomförda sparandes svar
   tappas. Kontrollera spärrade **Nytt objekt** och **Kasta hela utkastet**.
   Spara inte igen.
3. Stäng den första profilen. Stoppa och starta applikationen igen med samma
   databas.
4. Öppna appen i den andra profilen och logga in som samma användare. Hitta
   sparandet i **Rapporter → Ändringshistorik** utan att skriva in kvittots
   identitet eller kopiera webbläsardata.
5. Läs händelsens uppgifter. Välj **Tillbaka till arbetet**, läs det tomma
   utkastet och objektet i **Tabell**.

**Förväntat resultat:**

- Sparandet visas i historiken i den andra profilen och beskriver
  **Återfunnet sparande**. Automationen jämför separat samma beständiga kvitto.
- Utkastet visar **Utkastet är tomt.** Objektet finns en gång i kartan.
- Ett genomfört sparande går att hitta även när den ursprungliga
  profilen är stängd och servern startar om.

**Separat tekniskt underlag:** Testet återförsöker samma sparbegäran
genom API:et och kräver exakt samma kvitto, objekt och enda historikhändelse.
De kontrollerna kompletterar den synliga återhämtningen.

### SPAR-02: automatiskt kontrollera ett väntande sparande från en annan klient

**Syfte:** Kontrollera att ett avbrott före kartändringen lämnar ett
väntande försök som slutförs med samma ID vid nästa besök, utan en ny
begäran om sparande.

**Användare:** Den konfigurerade administratören i båda profilerna.

**Förutsättningar:** Allmän förberedelse ovan och
[vanlig installation och annan klient](save-preparation.md#vanlig-installation-och-annan-klient).
Operatören armar `save:drop-before` före sparandet, och `recover:before`
inför den andra klientens besök efter omstarten. Registreringens ID
antecknas som separat tekniskt underlag i Network-svaret från
`/map/operations`; det jämförs inte i de vanliga UI-stegen.

**Integrationstest:**
[operations.spec.ts](../../tests/integration/operations.spec.ts),
SPAR-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/operations.spec.ts",
    "caseId": "SPAR-02"
  },
  "reference": "Avbrott före genomförandet, samma registrerade försök på annan klient.",
  "outcomes": [
    "Avbrottet visar **Utfallet är okänt**. Ändringar och kastande blockeras.",
    "Före omstart visas okänt utfall, med förslaget kvar i det privata utkastet. Registreringen har inte ändrat den gemensamma kartan.",
    "Efter omstart kontrollerar Skyttel det registrerade försöket utan nytt medgivande. Ändringar blockeras under kontrollen. Resultatet blir **Utkastet är sparat**, ett enda synligt sparande i historiken och tomt utkast. Automationen jämför separat samma beständiga försöks-ID. Objektet och sparhändelsen finns en gång, även efter omladdning.",
    "**Nästa privata förslag** ligger kvar i utkastet och omfattas inte av det tidigare kvittot."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa Väntande sparande och lägg hela formuläret i utkastet. Öppna
   Visa utkastet och välj Spara hela utkastet.
2. Läs Utfallet är okänt och spärrade Nytt objekt, Spara hela utkastet
   och Kasta hela utkastet. Stäng med Escape. Öppna Visa sparandet,
   läs uppföljningen och stäng igen. Läs förslaget i ditt privata utkast.
3. Stäng första profilen och starta om applikationen med samma databas.
   Låt operatören arma kontrollen före den andra profilens besök.
4. Logga in som samma användare i andra profilen. Öppna Visa sparandet
   medan kontrollen hålls. Stäng med Escape och läs förslaget i utkastet.
   Nytt sparande och kastande förblir spärrade under kontrollen.
5. Låt operatören släppa kontrollen. Läs Utkastet är sparat och att
   uppföljningen försvinner. Läs tomt utkast och det enda sparandet i
   Rapporter → Ändringshistorik.
6. Skapa Nästa privata förslag och lägg det i utkastet. Läs det kvarvarande
   nya förslaget; det tidigare kvittot beskriver bara Väntande sparande.
7. Låt operatören återställa transporten efter känt utfall.

**Förväntat resultat:**

- Avbrottet visar **Utfallet är okänt**. Ändringar och kastande blockeras.
- Före omstart visas okänt utfall, med förslaget kvar i det privata
  utkastet. Registreringen har inte ändrat den gemensamma kartan.
- Efter omstart kontrollerar Skyttel det registrerade försöket utan nytt
  medgivande. Ändringar blockeras under kontrollen. Resultatet blir
  **Utkastet är sparat**, ett enda synligt sparande i historiken och tomt
  utkast. Automationen jämför separat samma beständiga försöks-ID.
  Objektet och sparhändelsen finns en gång, även efter omladdning.
- **Nästa privata förslag** ligger kvar i utkastet och omfattas inte
  av det tidigare kvittot.

**Separat tekniskt underlag:** Det automatiserade testet jämför samma
registrerade försöks-ID efter omstart och kontroll och upprepar den
genomförda begäran
genom API:et medan nästa förslag ligger i utkastet. Samma kvitto ska
returneras, nästa förslag ska bevaras och historiken får ingen dubblett.
Den sista kontrollen utförs inte av de manuella stegen.

Automationen återspelar kvittot genom API:et medan nästa privata förslag
finns kvar. Ett kontrollfel och tangentbordsåterförsök har ett separat
fall, [SPARKONTROLL-07](save-check.md#sparkontroll-07-kontrollera-samma-försök-efter-omstart-och-kontrollfel).

### SPAR-03: återfinna ett avvisat försök utan att förbruka nyare förslag

**Syfte:** Kontrollera att ett gammalt sparbesked avvisas beständigt och
att nyare förslag kan granskas och sparas med ett nytt försök.

**Användare:** Den konfigurerade administratören i båda profilerna.

**Förutsättningar:** Allmän förberedelse ovan. Nätverksblockering är av.

**Integrationstest:**
[operations.spec.ts](../../tests/integration/operations.spec.ts),
SPAR-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/operations.spec.ts",
    "caseId": "SPAR-03"
  },
  "reference": "Äldre sparunderlag avvisas, nyare privat förslag består över omstart.",
  "outcomes": [
    "Det gamla försöket visar **Avvisat** och **Inget sparades**. Statuskortet visar avvisningen även med stängd stöddialog och legenden finns kvar för förslagen.",
    "Efter omstart visar kartans status **Utkastet kunde inte sparas.** **Visa sparandet** förklarar avvisningen. Inget kvitto bekräftar det försöket. Utkastet innehåller **Lo Lind**.",
    "Ett nytt sparande ger ett eget kvitto för **Lo Lind**. Historiken visar genomförda sparanden. Automationen kontrollerar separat att det gamla avvisade försöket finns kvar med samma identitet i det privata API:et."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa **Lo Exempel** med **Nytt objekt** i första profilen och
   välj **Lägg i utkastet och stäng**. Öppna **Visa utkastet**.
2. Öppna appen i andra profilen som samma användare. Öppna **Lo Exempel**,
   välj **Tabell → Redigera Lo Exempel**, ändra namnet till **Lo Lind**
   och välj **Lägg i utkastet och stäng**.
3. Välj **Spara hela utkastet** i första profilen utan omladdning. Kontrollera
   avvisningen. Stäng sparandets dialog med Escape och läs kartans besked om
   avvisade sparande och kvarvarande legend. Stäng den första profilen.
4. Stoppa och starta appen med samma databas. Ladda om i andra profilen.
   Läs kartans sparstatus och öppna **Visa utkastet** för **Lo Lind**.
5. Granska det nyare förslaget och välj **Spara hela utkastet** i den
   andra profilen. Kontrollera **Utkastet är sparat** och läs det enda
   genomförda sparandet i **Rapporter → Ändringshistorik**.

**Förväntat resultat:**

- Det gamla försöket visar **Avvisat** och **Inget sparades**.
  Statuskortet visar avvisningen även med stängd stöddialog och legenden
  finns kvar för förslagen.
- Efter omstart visar kartans status **Utkastet kunde inte sparas.**
  **Visa sparandet** förklarar avvisningen. Inget kvitto
  bekräftar det försöket. Utkastet innehåller **Lo Lind**.
- Ett nytt sparande ger ett eget kvitto för **Lo Lind**. Historiken visar
  genomförda sparanden. Automationen kontrollerar separat att det gamla
  avvisade försöket finns kvar med samma identitet i det privata API:et.

**Separat tekniskt underlag:** Det automatiserade testet återförsöker dessutom
den avvisade begäran
via API:et och kontrollerar samma fel, oförändrat utkast och tom historik
innan det nya sparandet. Den kontrollen utförs inte av de manuella stegen.

## Tillgång till sparförsök

### SPAR-04: privata försök och återkallad tillgång

**Syfte:** Kontrollera att administratören inte kan läsa en annan
användares privata sparförsök och att återkallad tillgång gäller även
väntande försök.

**Användare:** Administratören och den separata testidentiteten med
rollen medlem.

**Förutsättningar:** Allmän förberedelse och aktuell tillgång för
testidentiteten. Använd skilda profiler för de två användarna och
[transportförberedelsen](save-preparation.md#vanlig-installation-och-annan-klient).

**Integrationstest:**
[operations.spec.ts](../../tests/integration/operations.spec.ts),
SPAR-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/operations.spec.ts",
    "caseId": "SPAR-04"
  },
  "reference": "Administratör och medlem med separata privata utkast; återkallad tillgång.",
  "outcomes": [
    "Medlemmen har ett registrerat väntande försök. Administratören ser varken det försöket eller medlemmens privata förslag.",
    "Efter återkallelsen ser medlemmen **Du har inte tillgång till hushållet** och kan inte öppna sparförsöket.",
    "Det privata objektet ingår inte i den gemensamma kartan."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Logga in som medlemmen. Skapa **Privat förslag** och lägg det i
   utkastet. Låt operatören arma `save:drop-before` enligt SPAR-02.
2. Välj **Spara hela utkastet** och kontrollera **Utfallet är okänt**.
3. Öppna appen som administratören. Läs kartans sparstatus och ditt eget
   utkast. Medlemmens uppföljning och privata förslag ska inte visas.
4. Välj **Administrera tillgång** som administratören. Välj
   **Återkalla tillgång** för medlemmen och **Bekräfta återkallelse**.
5. Ladda om medlemmens app efter återkallelsen.
   Kontrollera tillgångsbeskedet och att sparförsöket inte visas.

**Förväntat resultat:**

- Medlemmen har ett registrerat väntande försök. Administratören ser
  varken det försöket eller medlemmens privata förslag.
- Efter återkallelsen ser medlemmen **Du har inte tillgång till
  hushållet** och kan inte öppna sparförsöket.
- Det privata objektet ingår inte i den gemensamma kartan.

**Separat tekniskt underlag:** Testet kontrollerar direkta API-anrop:
administratören får inget resultat för medlemmens operations-ID.
Medlemmen nekas både listning, uppslagning och återförsök efter
återkallelsen. Dessa API-kontroller utförs inte av de manuella stegen.

## Kontrollerad leverans på den vanliga testinstallationen

### SPAR-05: fördröjd utkaständring, tappat sparkvitto och avvisat sparande

**Syfte:** Skilja leveransens vänteläge och okända utfall från verkligt
sparande och känd avvisning, med bevarade uppgifter och samma beständiga kvitto.

**Användare:** Administratören Alex och medlemmen Robin med vanliga
inloggningar. Alex använder också en andra, separat webbläsarprofil.

**Förutsättningar:** Använd ett nytt, tomt provhushåll med påhittade
uppgifter på en separat HTTPS-testinstallation. En operatör placerar
`scripts/manual-transport.ts` mellan dess befintliga HTTPS-ingång och
applikationen, med samma publika adress och hushållets ID. Behåll vanliga
inloggningar, medgivanden och medlemskap. Transporten styr bara leveransen.
Kontrollera att vanlig inloggning och läsning fungerar innan något hålls.
Använd inte utvecklarverktygens nätverksblockering samtidigt.

**Integrationstest:**
[transport-controls.spec.ts](../../tests/integration/transport-controls.spec.ts),
SPAR-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/transport-controls.spec.ts",
    "caseId": "SPAR-05"
  },
  "reference": "Vanlig autentisering med hushållsavgränsad transport före och efter riktiga transaktioner.",
  "outcomes": [
    "Väntande leverans visar verkligt vänteläge utan förtida bekräftelse. Tappat svar behåller uppgifterna och kräver kontroll av samma ändring.",
    "Kontroll av utkaständringen ger två privata förslag utan dubbletter. Ett tappat svar efter sparande ändrar inte det beständiga kvittot. Samma enda händelse och tomma utkast återfinns efter klientbyte och omstart.",
    "Robins sparande behålls. Alex gamla underlag avvisas atomärt; hans privata förslag och alla dess värden finns kvar för granskning.",
    "Transporten tillför ingen identitet eller tillgång. Automationen kontrollerar dessutom nekad oinloggad läsning, felaktig värdadress, idempotent återförsök med samma kvitto, fördröjd autentiserad kontroll utan aktivt samtal samt oförändrade fulla privata och gemensamma uppgifter vid avvisningen genom det publika API:et."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ
[vanlig installation och annan klient](save-preparation.md#vanlig-installation-och-annan-klient)
. Använd operatörens transportterminal och samma verifierade provhushåll.

1. Före tillägget i UI-steg 1: skriv `arm stage:before` och bekräfta
   installationen. Efter det verkliga tillägget: vänta på `held-before`
   och meddela **Samma tillägg hålls före servern**. Efter användarens
   vänteläsning: skriv `release` och bekräfta att samma begäran släpps.
2. Före tillägget i steg 2: skriv `arm stage:after` och bekräfta
   installationen. Efter tillägget: kräv `application-completed` med
   status 200 och `held-after`. Meddela **Tillägget är genomfört och
   samma svar hålls**. Efter vänteläsningen: skriv `drop` och bekräfta
   att samma genomförda svar tappas.
3. Före Spara i steg 3: skriv `arm save:drop-after` och bekräfta
   installationen. Efter Spara: kräv verklig status 200 innan svaret
   tappas och meddela **Samma sparande är genomfört och kvittot tappat**.
4. Före Alex Spara i steg 5: skriv `arm save:before` och bekräfta
   installationen. Efter Spara: invänta `held-before` och meddela
   **Alex samma sparbegäran hålls före servern**. Behåll hållningen
   tills Robin sparat sina verkliga oberoende uppgifter i steg 6.
   Skriv först då `release` och meddela **Alex samma begäran är släppt**.

Behåll databas och publik adress genom omstart och klientbyte. Återställ
HTTPS-ingången före `quit` enligt förberedelsen, efter känt utfall.

**Steg:**

1. Be operatören förbereda väntande tillägg och invänta installationen. Som
   Alex, välj **Nytt objekt**, skriv **Lo Exempel** och välj **Lägg i utkastet
   och stäng**. Invänta operatörens bekräftelse att samma begäran hålls före
   servern. Formuläret väntar; ändringen finns ännu inte i utkastet. Be
   operatören släppa samma begäran och invänta bekräftelse. Formuläret stängs
   och exakt ett privat förslag visas. Ingen gemensam ändring eller
   historikhändelse har skapats.
2. Be operatören förbereda hållet tilläggssvar och invänta installationen. Skapa
   **Kim Exempel** på samma sätt. Invänta operatörens bekräftelse att tillägget
   är genomfört och samma svar hålls. Formuläret väntar trots att servern har
   lagt ändringen i utkastet. Be operatören tappa samma svar och invänta
   bekräftelse. Läs beskedet om oklart utfall och kontrollera att namnet ligger
   kvar. Välj **Kontrollera om ändringen lades i utkastet**. Formuläret stängs;
   utkastet har exakt Lo och Kim, utan dubbletter eller sparhändelser.
3. Be operatören förbereda tappat sparkvitto och invänta installationen. Öppna
   **Visa utkastet** och välj **Spara hela utkastet**. Invänta operatörens
   bekräftelse att samma sparande är genomfört och dess svar tappas. Läs
   **Sparandet kunde inte bekräftas.** i sparmodalen. Spara inte igen. Nytt
   objekt, sparande och kastande är blockerade.
4. Stäng Alex första profil. Starta om applikationen med samma databas, utan
   återställning. Logga in som Alex i den andra profilen. Läs det enda sparandet
   i **Rapporter → Ändringshistorik** och öppna **Identifiera sparandet och
   användaren**. Anteckna dess identitet. Kontrollera att Lo och Kim finns en
   gång i Tabell och att utkastet är tomt. Ladda om och kontrollera samma enda
   sparande med samma identitet.
5. Som Alex, ändra Lo till beskrivningen **Alex privata beskrivning** och lägg
   hela formuläret i utkastet. Be operatören förbereda väntande sparande och
   invänta installationen. Välj **Spara hela utkastet** som Alex och invänta
   operatörens bekräftelse av hållningen.
6. Som Robin, öppna Lo i Tabell, ändra beskrivningen till **Robins sparade
   beskrivning**, lägg den i Robins utkast och spara hela hans utkast.
   Kontrollera hans bekräftade sparande. Be sedan operatören släppa Alex samma
   sparbegäran och invänta bekräftelse.
7. Läs Alex kända avvisning **Utkastet kunde inte sparas**. Stäng sparmodalen
   med Escape. Öppna **Visa utkastet → Visa förslaget: Lo Exempel** och läs Alex
   hela förslag med **Alex privata beskrivning**. Stäng läsningen med Escape och
   textvyn med krysset. Välj **Hämta aktuellt underlag** och öppna **1 konflikt
   i ditt utkast** i kartans status. Läs **Robins sparade beskrivning** under
   **Sparat i kartan nu** och Alex värde under **Ditt förslag**. Stäng med
   Escape och öppna **Rapporter → Ändringshistorik**. Historiken har bara det
   ursprungliga sparandet och Robins sparande; Alex avvisade försök skapar ingen
   historikhändelse.
8. Låt operatören återställa HTTPS-ingången till applikationen och be operatören
   avsluta transporten enligt förberedelsen. Invänta bekräftelse. Behåll
   provdatabasen tills alla okända utfall har kontrollerats.

**Förväntat resultat:**

- Väntande leverans visar verkligt vänteläge utan förtida bekräftelse.
  Tappat svar behåller uppgifterna och kräver kontroll av samma ändring.
- Kontroll av utkaständringen ger två privata förslag utan dubbletter.
  Ett tappat svar efter sparande ändrar inte det beständiga kvittot.
  Samma enda händelse och tomma utkast återfinns efter klientbyte och omstart.
- Robins sparande behålls. Alex gamla underlag avvisas atomärt; hans
  privata förslag och alla dess värden finns kvar för granskning.
- Transporten tillför ingen identitet eller tillgång. Automationen
  kontrollerar dessutom nekad oinloggad läsning, felaktig värdadress,
  idempotent återförsök med samma kvitto, fördröjd autentiserad kontroll
  utan aktivt samtal samt oförändrade fulla privata
  och gemensamma uppgifter vid avvisningen genom det publika API:et.
