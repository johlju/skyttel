# Manuella testfall för ditt utkast

Testfallen gäller återupptagning, granskning, sparande, kastande och
konflikthantering av ditt utkast. Förberedelser och testdata anges nedan.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Logga in med den administratör som anges av
`SKYTTEL_FIRST_ADMIN_PROVIDER` och `SKYTTEL_FIRST_ADMIN_SUBJECT`.
Det ursprungliga visningsnamnet är **Development administrator**.
Inloggningen sker genom den konfigurerade identitetsleverantören.

Robin Demo är en påhittad tidigare hushållsmedlem som anges som författare
i ändringshistoriken. Posten saknar kopplad inloggning, session och aktuellt
medlemskap. Den ger ingen extra inloggning för manuell testning.

UTKAST-03–11 använder dessutom en separat testidentitet med rollen medlem.
Bjud in identiteten enligt [tillgång till hushållet](../user-guide/access.md).
Använd skilda webbläsarprofiler för administratören och medlemmen.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

Objekt redigeras från **Tabell** med radens **Redigera [namn]**.
**Nytt objekt** i kartans verktyg öppnar hela objektformuläret. Välj
**Lägg i utkastet och stäng** för att skicka hela formuläret.
Samband öppnas från Tabell med **Samband för [namn]** och **Redigera
samband** eller **Nytt samband**. Välj **Lägg i utkastet** och
**Stäng samband** före fortsatt arbete. Läsande översikter stängs med
krysset. Definitioner öppnas i **Inställningar → Typer**;
välj **Tillbaka till kartan** före granskning.

Granska genom **Skriv till Skyttel → Visa utkastet**. Välj radens
**Visa förslaget: [namn]** för fullständigt tidigare underlag och förslag.
Stäng läsningen med krysset. Utkastets sparikon öppnar **Spara utkastet**
och skickar hela utkastet direkt. Vänta på **Utkastet är sparat** och
stäng textvyn före nästa arbete i Tabell eller Karta. Inga samtal eller
AI-medgivanden behövs för detta arbete.

Alla beskrivningar och uppgifter om säkerhet i fallen är vanliga fria
egenskaper på det enskilda objektet eller sambandet. Lägg till eller rätta
dem med Etikett, Datatyp och Värde; objektets rader finns under Fria
egenskaper och sambandets rader direkt i sambandsformuläret. Typdefinitioner
innehåller namn och beskrivning samt sambandstypers båda benämningar.
Båda ändpunkterna är verkliga objekt. En egenskap med etiketten Slutdatum
styr inte status; välj status uttryckligen i livscykelkontrollen.

För UTKAST-01 används demodata:

1. Förbered en separat utvecklingsdatabas enligt
   [demodata och återställning](../development/devcontainer.md#reset-demo-data).
   Återställning tar bort befintliga utvecklingsdata och sessioner.
2. Kör `npm run db:setup` för att skapa aktuellt utgångsläge.
3. Starta applikationen med `npm run dev:all`.
4. Öppna [utvecklingsklienten](http://localhost:5173) och logga in som den
   konfigurerade administratören.
5. Kontrollera att hushållet **TestHousehold** visas.

Återställ demodata före varje ny körning av testfallet. Under testets
omstart ska samma databas behållas; kör då inte `npm run db:setup`.

För UTKAST-02–11 används en separat, tom testinstallation enligt
[installationsguiden](../operations/installation.md),
utan demodata:

1. Logga in som den konfigurerade administratören och skapa ett hushåll.
2. Skapa personen **Lo Exempel** och tjänsten **Molnmusik** med
   **Nytt objekt**, **Namn**, **Objekttyp** och
   **Lägg i utkastet och stäng**. Välj **Spara hela utkastet**.
3. Ge medlemmen tillgång för fallen som kräver två användare. Kontrollera
   att båda ser objekten och har **Utkastet är tomt** i sina egna utkast.
4. Använd ett nytt tomt testhushåll inför varje fall. Behåll databasen vid
   omladdning och omstart inom fallet.

UTKAST-12–14 använder ett nytt tomt hushåll utan de två förberedda
objekten. UTKAST-14 behöver även en inbjuden medlem i en separat
webbläsarprofil och konfigurerat tal och text enligt
[samtalsfallen](voice-assistant.md).
Externa prov kräver den privata
konfiguration och de medgivanden som anges där.

## Privata utkast

### UTKAST-36: spara hela utkastet direkt utan samtal

**Syfte:** Bekräfta ett enda atomiskt sparande från utkastets sparikon.

**Användare:** Den syntetiska administratören Alex Exempel.

**Förutsättningar:** Starta enligt
[vanligt sparande](save-preparation.md#vanligt-sparande) på en dator med
grafisk webbläsare. Den öppnar en separat installation med riktig SQLite,
inloggad administratör och förslaget Alex blå cykel. Ingen AI-leverantör är
konfigurerad.
Terminalens kommandon styr bara leveransen av riktiga HTTP-svar. Skriv
`new-draft` inför varje nytt fall och `quit` efter provningen.

**Integrationstest:**
[draft-save.spec.ts](../../tests/integration/draft-save.spec.ts),
UTKAST-36.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-save.spec.ts",
    "caseId": "UTKAST-36"
  },
  "reference": "1440 × 1000; hållen leverans skyddar väntan före kvitto.",
  "outcomes": [
    "Modalen öppnas genast med fokus på rubriken **Spara utkastet** och texten **Sparar utkastet…**. Bara krysset och Escape stänger den. Förslaget ligger kvar medan kvittot saknas.",
    "Bekräftat sparande tömmer utkastet, stänger modalen och återger fokus till utkastets rubrik när sparikonen är inaktiv.",
    "**Utkastet är sparat** visas i tre sekunder. En enda artig statusregion behåller beskedet när den visuella toasten försvinner. Faktisk uppläsning kontrolleras separat med mänsklig skärmläsarprovning.",
    "Automationen kontrollerar separat exakt ett genomfört sparförsök och ett motsvarande historikkvitto. Inget samtal startas och inget medgivande efterfrågas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före UI-steg 1: skriv `hold` i terminalen och meddela
**Nästa sparande hålls före servern**. Efter den verkliga inskickningen,
bekräfta att begäran hålls innan användaren provar modalens fokus.
Först i steg 3: skriv `release` och meddela **Sparandet är släppt**.
Det är samma begäran, inget ersättningsförsök.
Följ [styrd sparleverans](save-preparation.md#vanligt-sparande).
Behåll samma databas och försök genom kontrollen. Återställ med ett nytt
provhushåll mellan fallen och avsluta med `quit` efter känt utfall.

**Steg:**

1. Be operatören förbereda väntande sparande och invänta bekräftelse. Öppna
   **Utkast** och välj **Spara hela utkastet**. Invänta operatörens bekräftelse
   av den verkliga hållningen.
2. Läs sparmodalen och prova dess tangentbordsfokus.
3. Be operatören släppa sparandet och invänta bekräftelse. Läs bekräftelsen,
   vänta tre sekunder och läs tomt utkast.

**Separat tekniskt underlag:** Integrationstestet jämför utkastet före och
efter leveransen, kräver ett enda genomfört försök och jämför hela kvittot
med den enda historikposten. Operatören kan samla samma underlag med
`result` före steg 3 och efter bekräftelsen. Råa identifierare och
jämförelser av interna uppgifter ingår inte i de vanliga UI-stegen.

**Förväntat resultat:**

- Modalen öppnas genast med fokus på rubriken **Spara utkastet** och texten
  **Sparar utkastet…**. Bara krysset och Escape stänger den. Förslaget ligger
  kvar medan kvittot saknas.
- Bekräftat sparande tömmer utkastet, stänger modalen och återger fokus till
  utkastets rubrik när sparikonen är inaktiv.
- **Utkastet är sparat** visas i tre sekunder.
  En enda artig statusregion behåller beskedet när den visuella toasten
  försvinner.
  Faktisk uppläsning kontrolleras separat med mänsklig skärmläsarprovning.
- Automationen kontrollerar separat exakt ett genomfört sparförsök och ett
  motsvarande historikkvitto.
  Inget samtal startas och inget medgivande efterfrågas.

### UTKAST-37: stäng ett väntande mobilt sparande och fortsätt annat arbete

**Syfte:** Behålla uppföljning och korrekt fokus mellan karta och tabell.

**Användare:** Alex Exempel i provinstallationen för UTKAST-36.

**Förutsättningar:** Välj `new-draft` och `hold`. Använd mobil visning.

**Integrationstest:**
[draft-save.spec.ts](../../tests/integration/draft-save.spec.ts),
UTKAST-37.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-save.spec.ts",
    "caseId": "UTKAST-37"
  },
  "reference": "390 × 844; smal modal, båda vyerna och senare sökfokus.",
  "outcomes": [
    "Tangentbordet cirkulerar mellan modalens tillgängliga kontroller och lämnar inte den öppna modalen. Text och kontroller ryms i smal mobil visning.",
    "Stängning avbryter inte sparandet. Uppföljningen är nåbar i båda vyerna; efter stängning återgår fokus till **Visa sparandet**.",
    "Senare bekräftelse behåller fokus i tabellens sökfält. Toasten tar inte fokus. Automationen kontrollerar separat tomt utkast, exakt ett sparande och en historikpost."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ grundfallets `new-draft` och `hold` före sparandet.
Bekräfta verkligt hållen begäran efter användarens inskickning. Behåll
hållningen genom båda vyernas uppföljning. Vid UI-steg 4, först efter
användarens senare sökfokus: skriv `release` i terminalen och meddela
**Samma sparande är släppt**.
Följ [styrd sparleverans](save-preparation.md#vanligt-sparande).
Behåll samma databas och försök genom kontrollen. Återställ med ett nytt
provhushåll mellan fallen och avsluta med `quit` efter känt utfall.

**Steg:**

1. Öppna utkastet och spara. Invänta operatörens bekräftelse av den verkliga
   hållningen. Prova Tab och Skift+Tab och stäng med Escape.
2. Stäng textvyn. Öppna **Visa sparandet** i kartan och stäng med krysset.
3. Öppna **Tabell**, välj **Visa sparandet** och stäng med Escape.
4. Flytta fokus till **Sök objekt i tabellen** och be operatören släppa samma
   sparande enligt förberedelsen. Invänta bekräftelse utan att byta fokus.
5. Invänta bekräftelsen och fortsätt skriva i sökfältet utan att klicka på det
   igen.

**Separat tekniskt underlag:** Integrationstestet kräver tomt utkast, ett
enda avslutat sparförsök och en historikpost. Operatören kan samla detta
underlag med `result` efter bekräftelsen. Det är ingen vanlig UI-kontroll.

**Förväntat resultat:**

- Tangentbordet cirkulerar mellan modalens tillgängliga kontroller och
  lämnar inte den öppna modalen. Text och kontroller ryms i smal mobil visning.
- Stängning avbryter inte sparandet. Uppföljningen är nåbar i båda vyerna;
  efter stängning återgår fokus till **Visa sparandet**.
- Senare bekräftelse behåller fokus i tabellens sökfält. Toasten tar inte fokus.
  Automationen kontrollerar separat tomt utkast, exakt ett sparande och en
  historikpost.

### UTKAST-38: kontrollera samma försök efter ett tappat sparbesked

**Syfte:** Skilja okänt utfall från bekräftad framgång utan att spara två
gånger.

**Användare:** Alex Exempel i provinstallationen för UTKAST-36.

**Förutsättningar:** Välj `new-property-draft` och `lost-response` i terminalen.
Operatören använder den separat körbara
[hållningen av kontrollsvaret](save-preparation.md#vanligt-sparande)
med `hold-check` före steg 4 och `release-check` när vänteläget har lästs.

**Integrationstest:**
[draft-save.spec.ts](../../tests/integration/draft-save.spec.ts),
UTKAST-38.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-save.spec.ts",
    "caseId": "UTKAST-38"
  },
  "reference": "Tabell; tappat svar efter genomförd transaktion. Cykel och självsamband har upprepade etiketter, noll, Nej, tomt datum, tomt utan datatyp och tom text.",
  "outcomes": [
    "Okänt utfall behåller förslagen och gör inget påstående om framgång. Kastande verifieras även tillsammans med dess fullständiga flöde.",
    "Kontrollen visar **Kontrollerar sparandet…**. Fokus flyttas till krysset medan kontrollknappen saknas, och till tabellens rubrik när bekräftelsen tar bort uppföljningsknappen.",
    "Automationen kontrollerar separat samma beständiga försöks-ID, ett sparanrop, ett genomfört försök och en historikpost. Ingen AI eller samtalsstart krävs.",
    "Historiken visar cykelns och självsambandets hela egenskapslistor i sparad ordning med identiteter, datatyper och skilda tomma värden."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Spara från Utkast och läs **Sparandet kunde inte bekräftas.** Stäng med
   Escape.
2. Kontrollera att förslaget ligger kvar i klienten och att nytt sparande
   och kastande är spärrade.
3. Stäng textvyn, öppna Tabell och välj **Visa sparandet**.
4. Låt operatören hålla kontrollsvaret enligt förberedelsen. Välj
   **Kontrollera sparandet igen** och läs **Kontrollerar sparandet…**.
   Kontrollknappen ska försvinna och fokus återgå till krysset.
   Låt operatören släppa kontrollsvaret och läs bekräftelsen. Fokus ska
   återgå till tabellens rubrik när uppföljningsknappen försvinner.
5. Öppna **Rapporter → Ändringshistorik → Visa ändringarna**. Läs cykelns
   och självsambandets egenskaper: **Samma: 0 (Tal)**, **Samma: Nej
   (Ja/nej)**, **Väntar: Tomt (Datum)**, **Väntar: Tomt (ingen datatyp)**
   och **Anteckning: Tom text (Text)**. Kontrollera ordningen och att varje
   rad visar sin identitet.

**Separat tekniskt underlag:** Integrationstestet kontrollerar att servern
redan har genomfört sparandet trots klientens okända utfall. Det jämför
sedan samma beständiga försöks-ID och hela kvittot efter kontrollen och
kräver ett enda sparanrop och en historikpost. Operatören kan samla
serverunderlaget med `result` efter steg 2 och efter steg 4. De råa
jämförelserna ingår inte i UI-stegen.

**Förväntat resultat:**

- Okänt utfall behåller förslagen och gör inget påstående om framgång.
  Kastande verifieras även tillsammans med dess fullständiga flöde.
- Kontrollen visar **Kontrollerar sparandet…**. Fokus flyttas till
  krysset medan kontrollknappen saknas, och till tabellens rubrik när
  bekräftelsen tar bort uppföljningsknappen.
- Automationen kontrollerar separat samma beständiga försöks-ID, ett
  sparanrop, ett genomfört försök och en historikpost. Ingen AI eller
  samtalsstart krävs.
- Historiken visar båda egenskapslistorna i samma ordning, med identiteter
  och de fem skilda värdena från steg 5.

### UTKAST-39: återuppta ett registrerat sparförsök efter omladdning

**Syfte:** Nå resultatet utan utkastikon och avsluta en inaktuell oklar
uppföljning.

**Användare:** Alex Exempel i provinstallationen för UTKAST-36.

**Förutsättningar:** Terminalkommandot `pending-attempt` registrerar ett
verkligt väntande försök genom offentlig HTTP och laddar om sidan. Automatisk
nätkontroll blockeras tills du väljer `network-ok`.

**Integrationstest:**
[draft-save.spec.ts](../../tests/integration/draft-save.spec.ts),
UTKAST-39.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-save.spec.ts",
    "caseId": "UTKAST-39"
  },
  "reference": "Tomt utkast; beständigt väntande försök avvisas efter omladdning.",
  "outcomes": [
    "Uppföljningen överlever omladdning utan samtal, medgivande eller AI.",
    "Ett tomt utkast avvisas med **Utkastet kunde inte sparas.** Modalens enda knapp är krysset. Avvisningen förblir läsbar efter stängning och återöppning; inget gemensamt innehåll eller historikkvitto skapas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ [vanligt sparande](save-preparation.md#vanligt-sparande).
Före användarens omladdning i UI-steg 1: välj `new-empty` och sedan
`pending-attempt` i terminalen. Det senare kommandot registrerar
försöket genom verklig offentlig HTTP, blockerar den automatiska
kontrollen och laddar om. Invänta registreringen och omladdningen;
meddela **Samma väntande försök är registrerat och automatisk kontroll
blockerad**. Behåll samma försök, session och databas genom användarens
omladdning, öppning, uttryckliga kontroll och återöppning. Använd inget
nytt sparande, nytt hushåll eller nytt registreringskommando under fallet.
Den uttryckliga kontrollknappen läser och avvisar det verkliga tomma
försöket trots blockerad automatisk kontroll. Efter sista observationen
och separat `result`: återställ med `network-ok` och avsluta med `quit`
enligt startguiden. Återställ provhushållet först mellan fallen.

**Steg:**

1. Be operatören förbereda samma registrerade väntande försök i ett
   tomt utkast. Invänta bekräftelse och ladda om sidan igen.
2. Kontrollera att Utkast-ikonen saknas men **Visa sparandet** finns.
   Öppna den och välj **Kontrollera sparandet igen**.
3. Läs det avvisade utfallet. Stäng med Escape, ladda om sidan och öppna
   uppföljningen igen.

**Separat tekniskt underlag:** Integrationstestet kontrollerar samma
beständiga försök över omladdningen, dess avvisning och att varken gemensamt
innehåll eller historikkvitto skapas. Operatören kan samla underlaget med
`result` efter steg 3; det ingår inte i de vanliga UI-stegen.

**Förväntat resultat:**

- Uppföljningen överlever omladdning utan samtal, medgivande eller AI.
- Ett tomt utkast avvisas med **Utkastet kunde inte sparas.** Modalens enda
  knapp är krysset. Avvisningen förblir läsbar efter stängning och återöppning;
  inget gemensamt innehåll eller historikkvitto skapas.

### UTKAST-40: skilj avvisning från hämtningsfel efter ett bekräftat kvitto

**Syfte:** Bevara både bekräftad framgång och osparade förslag vid rätt sorts
fel.

**Användare:** Alex Exempel i provinstallationen för UTKAST-36.

**Förutsättningar:** Välj `new-draft`. Versionskonflikten har ett separat
fall, UTKAST-102.

**Integrationstest:**
[draft-save.spec.ts](../../tests/integration/draft-save.spec.ts),
UTKAST-40.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-save.spec.ts",
    "caseId": "UTKAST-40"
  },
  "reference": "Verifierat kvitto följt av misslyckad karthämtning.",
  "outcomes": [
    "Ett bekräftat kvitto stänger modalen och tömmer det sparade utkastet även om kartan inte kan hämtas. Felet förblir nåbart. Senare hämtning varken startar ett nytt sparförsök eller spelar upp det gamla beskedet igen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före sparandet i UI-steg 1: välj `refresh-failure` i terminalen
och meddela **Hämtningsfel efter bekräftat sparande är förberett**.
Vid UI-steget som återställer leveransen: välj `network-ok` i
startguidens terminal och meddela **Normal leverans är återställd**
innan användaren väljer aktuell hämtning eller omladdning. Bevara
det redan registrerade eller genomförda försöket; registrera inget nytt.
Följ [styrd sparleverans](save-preparation.md#vanligt-sparande).
Behåll samma databas och försök genom kontrollen. Återställ med ett nytt
provhushåll mellan fallen och avsluta med `quit` efter känt utfall.

**Steg:**

1. Be operatören förbereda hämtningsfelet och invänta bekräftelse. Spara från
   Utkast. Läs tomt utkast och bekräftelsen.
2. Stäng textvyn och läs kartans hämtningsfel. Vänta tills toasten försvinner.
3. Be operatören återställa normal leverans och invänta bekräftelse. Välj
   **Hämta aktuellt underlag**. Läs att felet försvinner utan en ny
   sparbekräftelse.

**Separat tekniskt underlag:** Integrationstestet kontrollerar tomt utkast
och ett enda genomfört sparförsök efter karthämtningen. Operatören kan
samla samma underlag med `result` efter steg 3. Det är ingen UI-kontroll.

**Förväntat resultat:**

- Ett bekräftat kvitto stänger modalen och tömmer det sparade utkastet även
  om kartan inte kan hämtas. Felet förblir nåbart. Senare hämtning varken
  startar ett nytt sparförsök eller spelar upp det gamla beskedet igen.

## Separat förberedelse för borttagningsfallen

Använd en skrivbordsklient med det byggda testets commit. Kör i två steg:

```sh
npm run build
npm run test:env -- node --import tsx scripts/manual-draft-removal.ts --chrome
```

Den öppnade webbläsaren använder syntetisk Alex Exempel och en tillfällig
databas. `new-base` återställer ett nytt hushåll. `new-focus` ger två
förslag. `new-object-meaning` och `new-relationship-meaning` ger respektive
typändring med det beroende värdet **Behåll hela mitt värde**.
Ramnummer och Dold anteckning är vanliga fria egenskaper; läs dem
genom **Visa förslaget**. Försök inte skriva i ett dolt fält.

`hold` håller nästa bekräftade svar efter genomförd borttagning. Invänta
**Removal applied; reply held** innan senare fokusarbete. `release`
släpper svaret. `lost-response` tappar svaret efter genomförd borttagning;
`lost-unsent` stoppar begäran före servern. `network-ok` återställer normal
leverans. Kontrollen **Hämta aktuellt utkast** använder verklig lagring.
Kontrollerna består vid sidans omladdning eftersom routningen sitter i
den öppnade webbläsaren. `newer-type` lägger ett oberoende typförslag för
samma Alex genom en annan klient. `result` läser karta, utkast och historik
via HTTP; det är separat tekniskt underlag, inte ett vanligt UI-steg.
Efter varje fall: `network-ok`, `release`, sedan `new-base`. Avsluta med
`quit` och kontrollera att provinstallationen städas bort.

För UTKAST-150: kör `other-member` efter `new-base`. Provverktyget loggar
in Robin med den separata syntetiska Microsoft-identiteten, bjuder in och
ansluter just detta konto till Alex hushåll och öppnar en separat
webbläsarsession. Det skapar genom det ordinarie formuläret ett osparat
Person-förslag: **Robins privata anteckning**, beskrivning
**Hela Robins oberoende arbete före och efter borttagningen**. Det sparas
inte gemensamt. Använd Robins separat öppnade sida för läsningarna i
fallet; displaynamnet ensamt ger inte åtkomst. `new-base` och `quit`
stänger även Robins session.

Operatören kan kontrollera förberedelsen separat, efter samma build:

```sh
npm run test:env -- node --import tsx scripts/manual-draft-removal.ts \
  --headless --smoke
```

Det kör samma kommandon och webbläsare mot tomt och fyllt utkast, kontrollerar
hela värden före och efter stopp före servern respektive tappat svar efter
genomförande och städar installationen. Det är tekniskt underlag; det
utför ingen fysisk inmatning eller faktisk uppläsning.

Vid varje nedan angiven fullständig läsning: öppna **Visa förslaget** för
varje kvarvarande rad, läs Sparade värden och Föreslagna värden och stäng
med Escape. Läs cykelns båda beskrivningar, **SPARAT-17** och
**FÖRESLAGET-42**, skuld **Uttryckligen inget → Okänt**, osäkert
kreditutrymme **500 SEK**, uppgiftsdatum **2026-01-01** och identiteterna
**Ospecificerat objekt** och **Identiteten behöver redas ut**. Läs varje
sambands riktning, fria säkerhetsuppgift och hela **Hela uppgiften …**. Läs båda
typförslagens namn, förklaringar och
**kontrolleras av**. I ett reducerat utkast läser du bara överlevande rader.

När ett fall anger slutlig gemensam kontroll: stäng textvyn, välj
**Rapporter → Ändringshistorik → Visa ändringarna**. Det enda sparandet
visar Blå cykel, Hela den sparade beskrivningen, SPARAT-17, Utkastfordon,
Ramnummer och Granskar. Välj **Tillbaka till arbetet → Tabell**, fäll ut
cykeln och läs samma sparade beskrivning och ramnummer. Om cykelförslaget
finns kvar visas också hela den föreslagna beskrivningen och FÖRESLAGET-42.
Denna kontroll ska inte göras medan en fel- eller bekräftelsedialog är öppen.

### Separat protokollprov för UTKAST-48

Automationen bevarar prov av obehöriga anrop, gammal version och förfalskad
plan. Operatören kan köra följande före UI-steg 1 i ett nytt `new-base`.
Öppna utvecklarverktygens Console i provwebbläsaren. Indata är hushållets
aktuella adress; spara den utskrivna `anonymous`-raden till nästa steg.

```js
const removalPath = `/api${location.pathname}/map`;
const removalBefore = await (await fetch(removalPath)).json();
const removalBody = { kind: 'all', version: removalBefore.draft.version,
  contentVersion: removalBefore.contentVersion };
const removalPost = data => fetch(`${removalPath}/discard-review`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
const removalPlan = await (await removalPost(removalBody)).json();
console.log('forged', (await removalPost({ ...removalBody,
  confirmation: { ...removalPlan.plan, removed: [] } })).status);
console.log('stale', (await removalPost({ ...removalBody,
  version: removalBody.version - 1, confirmation: removalPlan.plan })).status);
console.log('anonymous', JSON.stringify({ origin: location.origin,
  url: `${location.origin}${removalPath}/discard-review`,
  body: { ...removalBody, confirmation: removalPlan.plan } }));
console.log('unchanged', JSON.stringify(await (await fetch(removalPath)).json())
  === JSON.stringify(removalBefore));
```

Förväntat: `forged 409`, `stale 409`, `unchanged true`. Kör sedan i en annan
terminal utan cookies, med URL, origin och JSON från `anonymous`:

```sh
curl -i -X POST 'URL' -H 'Origin: ORIGIN' \
  -H 'Content-Type: application/json' --data 'JSON'
```

Förväntat: 401 utan ändring. Använd `result` för separat fullständig
jämförelse av utkast och historik. Återställ med `new-base` innan UI-fallet.
Inga HTTP-statuskoder eller internidentifierare behöver läsas i UI-flödet.

### UTKAST-41: ta bort ett oberoende förslag och behåll resten

**Syfte:** Ta bort ett självständigt förslag utan att ändra andra förslag.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Förbered provkommandot ovan och välj `new-base`.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-41.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-41"
  },
  "reference": "1280 × 720; Chromium; syntetiska testidentiteter",
  "outcomes": [
    "Olöst fordon försvinner direkt utan bekräftelsedialog. Fokus går till nästa papperskorg.",
    "Övriga kompletta förslag, sparade cykelvärden och det enda historiska sparandet består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast och läs samtliga förslag fullständigt enligt förberedelsen.
2. Fokusera Ta bort förslaget: Olöst fordon och tryck Enter. Kontrollera nästa
   papperskorgs fokus och beskedet Förslaget är borttaget.
3. Läs alla kvarvarande förslag fullständigt. Gör den slutliga gemensamma
   kontrollen enligt förberedelsen.

**Förväntat resultat:**

- Olöst fordon försvinner direkt utan bekräftelsedialog. Fokus går till nästa
  papperskorg.
- Övriga kompletta förslag, sparade cykelvärden och det enda historiska
  sparandet består.

### UTKAST-42: bekräfta eller avbryt borttagning med beroende samband

**Syfte:** Avbryta och sedan ta bort ett objekt med verkliga beroenden.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Förbered provkommandot ovan och välj `new-base`.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-42.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-42"
  },
  "reference": "1280 × 844; komplett datorflöde",
  "outcomes": [
    "Avbrott bevarar hela utkastet. Bekräftelse tar bort objektet och endast dess tre beroende samband.",
    "Cykelns ändring, Olöst fordon, de två oberoende sambanden med verkliga ändpunkter och båda typförslagen behåller alla värden. Sparade uppgifter och historik består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast och läs samtliga förslag fullständigt enligt förberedelsen.
2. Välj Ta bort förslaget: Ospecificerat fordon. Läs objektet och dess tre
   beroende samband. Olöst fordon ingår inte. Avbryt är fokuserad.
3. Tryck Escape och kontrollera återfokus på samma papperskorg. Läs alla förslag
   fullständigt efter avbrottet.
4. Öppna samma bekräftelse igen och välj Ta bort. Kontrollera fokus på Olöst
   fordons papperskorg och beskedet Förslagen är borttagna.
5. Läs alla kvarvarande förslag fullständigt. Gör den slutliga gemensamma
   kontrollen enligt förberedelsen.

**Förväntat resultat:**

- Avbrott bevarar hela utkastet. Bekräftelse tar bort objektet och endast dess
  tre beroende samband.
- Cykelns ändring, Olöst fordon, de två oberoende sambanden med verkliga
  ändpunkter och båda typförslagen behåller alla värden. De fria
  säkerhetsuppgifterna **Okänt** och **Uttryckligen inget** ändrar inte
  sambandens ändpunkter eller beroenden. Sparade uppgifter och historik består.

### UTKAST-142: beroende borttagning på smal skärm

**Syfte:** Bevara nåbar bekräftelse, avbrott och fokus vid 320 pixlar.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Förbered provkommandot ovan och välj `new-base`.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-142.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-142"
  },
  "reference": "320 × 844; samma fullständiga arbetsflöde; smal bekräftelse och återfokus",
  "outcomes": [
    "Avbrott bevarar hela utkastet. Bekräftelse tar bort objektet och endast dess tre beroende samband.",
    "Cykelns ändring, Olöst fordon, de två oberoende sambanden med verkliga ändpunkter och båda typförslagen behåller alla värden. Sparade uppgifter och historik består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ webbläsaren på 320 × 844 innan du öppnar Utkast. Utför UTKAST-42 steg
   1–5 en gång på denna bredd. Läs hela bekräftelselistan och kvarvarande värden
   under respektive steg.

**Förväntat resultat:**

- Avbrott bevarar hela utkastet. Bekräftelse tar bort objektet och endast dess
  tre beroende samband.
- Cykelns ändring, Olöst fordon, de två oberoende sambanden med verkliga
  ändpunkter och båda typförslagen behåller alla värden. Sparade uppgifter
  och historik består.

### UTKAST-43: ta bort typförslag och behåll berörda förslag med feltext

**Syfte:** Skilja borttagen objekttyp från bevarat objektförslag.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Förbered provkommandot ovan och välj `new-base`. Skapa via
Inställningar → Typer en ny objekttyp Tillfällig typ med
beskrivningen Hela den tillfälliga typens betydelse. Lägg typförslaget i
utkastet. Gå tillbaka till kartan och skapa Tillfälligt föremål med denna typ
och beskrivningen Hela den tillfälliga berättelsen. Lägg i utkastet och stäng.
Spara inte.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-43.

**Tekniskt HTTP-underlag:**
[draft-removal-http.test.ts](../../tests/unit/server/draft-removal-http.test.ts)
provar publika förslagsvägar med verkliga sessioner och SQLite i
server-sviten i Vitest. Formulär och borttagningsbekräftelse provas i UTKAST-43.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-43"
  },
  "reference": "1280 × 720; Chromium; syntetiska testidentiteter",
  "outcomes": [
    "Typförslaget tas bort först efter bekräftelse. Avbrott bevarar alla värden.",
    "Tillfälligt föremål behåller sin hela berättelse och saknad typ anges före och efter borttagningen. Övriga förslag, karta och historik består."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/draft-removal-http.test.ts",
      "title": "direct objectType removal setup preserves the original public proposal routes and values",
      "purpose": "Bevarar ursprungliga lyckade HTTP-förberedelser, exakta värden och statuskontroller separat från de ordinarie formulären."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast och läs samtliga förslag fullständigt enligt förberedelsen.
2. Välj Ta bort förslaget: Tillfällig typ. Läs Förslag som blir kvar men
   påverkas och förklaringen Objekttypen saknas. Avbryt är fokuserad.
3. Välj Avbryt och läs alla förslag fullständigt. Öppna samma bekräftelse igen
   och välj Ta bort.
4. Läs alla kvarvarande förslag fullständigt. Gör den slutliga gemensamma
   kontrollen enligt förberedelsen.

**Förväntat resultat:**

- Typförslaget tas bort först efter bekräftelse. Avbrott bevarar alla värden.
- Tillfälligt föremål behåller sin hela berättelse och saknad typ anges före och
  efter borttagningen. Övriga förslag, karta och historik består.

### UTKAST-143: ta bort sambandstyp men behåll sambandsförslaget

**Syfte:** Prova den separata sambandstypssamlingen och giltig ändpunkt.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Förbered provkommandot ovan och välj `new-base`. Skapa i
Inställningar → Typer en ny sambandstyp Tillfällig typ,
beskrivning Hela den tillfälliga typens betydelse, framåt granskar och bakåt
granskas av. Lägg i utkastet. Gå tillbaka till Tabell och välj Samband för Alex
blå cykel → Nytt samband. Välj Tillfällig typ och lägg till Uppgiftens
säkerhet (Text, Okänt) som fri egenskap.
Välj cykeln som Till objekt.
Lägg i utkastet med Enter och välj Stäng samband. Spara inte.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-143.

**Tekniskt HTTP-underlag:**
[draft-removal-http.test.ts](../../tests/unit/server/draft-removal-http.test.ts)
provar publika förslagsvägar med verkliga sessioner och SQLite i
server-sviten i Vitest. Formulär och borttagningsbekräftelse provas i
UTKAST-143.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-143"
  },
  "reference": "1280 × 720; Chromium; syntetiska testidentiteter",
  "outcomes": [
    "Sambandsförslaget och dess okända mål består; varningen gäller endast den saknade typen.",
    "Avbrott bevarar alla förslag. Bekräftelse tar bara typförslaget. Karta och historik består."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/draft-removal-http.test.ts",
      "title": "direct relationshipType removal setup preserves the original public proposal routes and values",
      "purpose": "Bevarar ursprungliga lyckade HTTP-förberedelser, exakta värden och statuskontroller separat från de ordinarie formulären."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast och läs samtliga förslag fullständigt enligt förberedelsen.
2. Välj papperskorgen för Tillfällig typ och läs Förslag som blir kvar men
   påverkas: cykelns nya samband och Sambandstypen saknas.
3. Avbryt, läs alla förslag fullständigt, öppna samma bekräftelse igen och välj
   Ta bort.
4. Läs alla kvarvarande förslag fullständigt. Gör den slutliga gemensamma
   kontrollen enligt förberedelsen.

**Förväntat resultat:**

- Sambandsförslaget och dess okända mål består; varningen gäller endast den
  saknade typen.
- Avbrott bevarar alla förslag. Bekräftelse tar bara typförslaget. Karta och
  historik består.

### UTKAST-44: bekräfta eller avbryt att hela utkastet kastas

**Syfte:** Kasta alla slags förslag utan att förlora oskickad text.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Förbered provkommandot ovan och välj `new-base`.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-44.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-44"
  },
  "reference": "1280 × 844; fullständigt kastande",
  "outcomes": [
    "Avbrott ändrar inga förslag. Bekräftelse tömmer hela utkastet med fokus på dess rubrik.",
    "Textvyn och hela det oskickade meddelandet består. Gemensamma värden, typdefinitioner och historik består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast och läs samtliga förslag fullständigt enligt förberedelsen.
2. Skriv Min oskickade fråga ska finnas kvar i Meddelande till Skyttel utan att
   skicka. Välj Kasta hela utkastet och läs hela listan. Avbryt är fokuserad.
3. Välj Avbryt och kontrollera återfokus på Kasta hela utkastet. Läs samtliga
   förslag fullständigt igen.
4. Öppna samma bekräftelse och välj Ta bort hela utkastet. Kontrollera tomt
   utkast, Utkast-rubrikens fokus och det oskickade meddelandet. Läs Hela ditt
   utkast har tagits bort.
5. Gör den slutliga gemensamma kontrollen enligt förberedelsen.

**Förväntat resultat:**

- Avbrott ändrar inga förslag. Bekräftelse tömmer hela utkastet med fokus på
  dess rubrik.
- Textvyn och hela det oskickade meddelandet består. Gemensamma värden,
  typdefinitioner och historik består.

### UTKAST-144: kasta hela utkastet på smal skärm

**Syfte:** Prova den fullständiga listan, nåbara kontroller och fokus vid 320
pixlar.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Förbered provkommandot ovan och välj `new-base`.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-144.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-144"
  },
  "reference": "320 × 844; komplett smalt kastande",
  "outcomes": [
    "Avbrott ändrar inga förslag. Bekräftelse tömmer hela utkastet med fokus på dess rubrik.",
    "Textvyn och hela det oskickade meddelandet består. Gemensamma värden, typdefinitioner och historik består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ webbläsaren på 320 × 844 före första UI-handlingen. Utför UTKAST-44
   steg 1–5 en gång och kontrollera listan, avbrottet, rubrikfokus och
   meddelandet under respektive steg.

**Förväntat resultat:**

- Avbrott ändrar inga förslag. Bekräftelse tömmer hela utkastet med fokus på
  dess rubrik.
- Textvyn och hela det oskickade meddelandet består. Gemensamma värden,
  typdefinitioner och historik består.

### UTKAST-45: granska verkliga beroenden igen när utkastet har ändrats

**Syfte:** Skydda ett nyare oberoende förslag från en gammal plan.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Förbered provkommandot ovan och välj `new-base`.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-45.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-45"
  },
  "reference": "1280 × 720; Chromium; syntetiska testidentiteter",
  "outcomes": [
    "Den gamla planen avvisas utan ändring; aktuell hämtning krävs före nytt försök.",
    "Den nya planen tar bara objektet och tre beroenden. Nyare oberoende typ och andra fullständiga värden består. Ingen gemensam historik tillkommer."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steg 2, efter att användaren öppnat borttagningsdialogen:
kör `newer-type` i provterminalen och meddela **Nyare oberoende
typförslag är lagt för samma användare**. Först därefter försöker
användaren bekräfta den gamla planen.
Följ [borttagningsförberedelsen](#separat-förberedelse-för-borttagningsfallen).
Använd samma session och verkliga lagring genom kontrollen. Efter känt
utfall: `network-ok`, `release` och sedan `new-base` mellan fallen.
Avsluta med `quit` och kontrollera borttagen provinstallation.

**Steg:**

1. Öppna Utkast och läs samtliga förslag fullständigt enligt förberedelsen.
2. Öppna Ospecificerat fordons papperskorg. Be operatören lägga det nyare
   oberoende typförslaget medan dialogen är öppen och invänta bekräftelse.
3. Välj Ta bort. Läs Borttagningen kunde inte bekräftas och den spärrade Ta
   bort.
4. Välj Hämta aktuellt utkast. Läs objektet och dess tre samband; Nyare
   oberoende typ ingår inte. Kontrollera Avbryts fokus, Tab till Ta bort och
   Skift+Tab tillbaka.
5. Bekräfta Ta bort. Läs Nyare oberoende typ och samtliga kvarvarande förslag
   fullständigt. Gör den slutliga gemensamma kontrollen.

**Förväntat resultat:**

- Den gamla planen avvisas utan ändring; aktuell hämtning krävs före nytt
  försök.
- Den nya planen tar bara objektet och tre beroenden. Nyare oberoende typ och
  andra fullständiga värden består. Ingen gemensam historik tillkommer.

### UTKAST-46: återfokus när sista raden eller utkastikonen försvinner

**Syfte:** Ge föregående papperskorg och sedan rubriken när sista raderna
försvinner.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Starta provkommandot och välj `new-focus`.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-46.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-46"
  },
  "reference": "1280 × 720; Chromium; syntetiska testidentiteter",
  "outcomes": [
    "Försvunnen sista rad ger föregående papperskorg; tömt utkast ger rubrikfokus.",
    "Sparade cykelvärden och historik består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast och läs samtliga förslag fullständigt enligt förberedelsen.
2. Ta bort sista raden. Kontrollera fokus på cykelns papperskorg. Ta bort den
   också.
3. Kontrollera tomt utkast och fokus på Utkast-rubriken. Gör den slutliga
   gemensamma kontrollen.

**Förväntat resultat:**

- Försvunnen sista rad ger föregående papperskorg; tömt utkast ger rubrikfokus.
- Sparade cykelvärden och historik består.

### UTKAST-145: fördröjt kastande återför fokus från försvunnet utkastverktyg

**Syfte:** Skydda fokus när dess öppningskontroll försvinner.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Förbered provkommandot ovan och välj `new-base`.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-145.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-145"
  },
  "reference": "1280 × 720; Chromium; syntetiska testidentiteter",
  "outcomes": [
    "Det sena svaret lämnar användbart fokus på Skriv till Skyttel när Utkast-kontrollen försvinner.",
    "Det enda historiska sparandet och cykelns gemensamma värden består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före bekräftelsen i UI-steg 2: kör `hold` och bekräfta installationen.
Efter den verkliga bekräftelsen: invänta **Removal applied; reply held**
och meddela **Borttagningen är genomförd och samma svar hålls**.
Behåll svaret genom stängningen och användarens senare fokusval i
steg 3. Först i steg 4: kör `release` och meddela **Samma svar är släppt**.
Följ [borttagningsförberedelsen](#separat-förberedelse-för-borttagningsfallen).
Använd samma session och verkliga lagring genom kontrollen. Efter känt
utfall: `network-ok`, `release` och sedan `new-base` mellan fallen.
Avsluta med `quit` och kontrollera borttagen provinstallation.

**Steg:**

1. Öppna Utkast och läs samtliga förslag fullständigt enligt förberedelsen.
2. Be operatören förbereda hållet borttagningssvar och invänta installationen.
   Bekräfta Ta bort hela utkastet. Invänta operatörens besked att samma
   borttagning är genomförd och svaret hålls.
3. Välj Avbryt och stäng textvyn. Använd tangentbordet för att fokusera Utkast i
   kartverktygen.
4. Be operatören släppa samma svar och invänta bekräftelse. Kontrollera att
   Skriv till Skyttel får fokus. Läs Hela ditt utkast har tagits bort. Gör den
   slutliga gemensamma kontrollen.

**Förväntat resultat:**

- Det sena svaret lämnar användbart fokus på Skriv till Skyttel när
  Utkast-kontrollen försvinner.
- Det enda historiska sparandet och cykelns gemensamma värden består.

### UTKAST-146: fördröjt kastande bevarar senare Tabell-fokus

**Syfte:** Skydda ett senare kontrollval från ett sent svar.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Förbered provkommandot ovan och välj `new-base`.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-146.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-146"
  },
  "reference": "1280 × 720; Chromium; syntetiska testidentiteter",
  "outcomes": [
    "Det sena svaret lämnar användbart fokus på den senare Tabell-kontrollen.",
    "Det enda historiska sparandet och cykelns gemensamma värden består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före bekräftelsen i UI-steg 2: kör `hold` och bekräfta installationen.
Efter den verkliga bekräftelsen: invänta **Removal applied; reply held**
och meddela **Borttagningen är genomförd och samma svar hålls**.
Behåll svaret genom stängningen och användarens senare fokusval i
steg 3. Först i steg 4: kör `release` och meddela **Samma svar är släppt**.
Följ [borttagningsförberedelsen](#separat-förberedelse-för-borttagningsfallen).
Använd samma session och verkliga lagring genom kontrollen. Efter känt
utfall: `network-ok`, `release` och sedan `new-base` mellan fallen.
Avsluta med `quit` och kontrollera borttagen provinstallation.

**Steg:**

1. Öppna Utkast och läs samtliga förslag fullständigt enligt förberedelsen.
2. Be operatören förbereda hållet borttagningssvar och invänta installationen.
   Bekräfta Ta bort hela utkastet. Invänta operatörens besked att samma
   borttagning är genomförd och svaret hålls.
3. Välj Avbryt och stäng textvyn. Använd tangentbordet för att fokusera Utkast i
   kartverktygen. Flytta sedan fokus till Tabell.
4. Be operatören släppa samma svar och invänta bekräftelse. Kontrollera att
   Tabell behåller fokus. Läs Hela ditt utkast har tagits bort. Gör den slutliga
   gemensamma kontrollen.

**Förväntat resultat:**

- Det sena svaret lämnar användbart fokus på den senare Tabell-kontrollen.
- Det enda historiska sparandet och cykelns gemensamma värden består.

### UTKAST-47: Kastat typförslag kräver granskning utan att förlora egenskaper

**Syfte:** Behålla fria egenskaper när kastad typbetydelse kräver ny
granskning av objektförslaget mot den sparade typen.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Starta områdets provkommando och välj
`new-object-meaning`. Behåll samma databas och användare genom fallet.
Förberedelsen ändrar typens beskrivning och lägger den fria egenskapen
**Ny uppgift** i objektets förslag. Förslaget använder den föreslagna
typbetydelsen. När typförslaget kastas finns hela värdet kvar, men
objektförslaget behöver granskas mot den sparade typen.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-47"
  },
  "reference": "Chromium, riktig lokal server och SQLite; konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Kastning av typens ändringsförslag behåller hela egenskaperna och varnar om ändrad typbetydelse. Först uttrycklig granskning i objektformuläret tar bort just det förslagets typkonflikt.",
    "Gemensamma objekt, verkliga samband, typkataloger och historik är oförändrade."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast och läs samtliga hela förslag enligt områdets förberedelse.
2. Välj Ta bort förslaget: Utkastfordon. Läs borttagningsbekräftelsen. Det
   individuella egenskapsförslaget finns med bland berörda förslag med beskedet
   **Typens uppgifter skiljer sig från förslagets underlag. Rätta förslaget
   i det ordinarie flödet.**
3. Välj Ta bort. Öppna det kvarvarande objektets eller sambandets hela förslag
   och läs Ny uppgift och Behåll hela mitt värde. Typvarningen finns kvar.
4. Stäng textvyn och öppna **Tabell → Redigera Alex blå cykel**.
   Kontrollera den sparade typen Utkastfordon och läs **Ny uppgift** under
   **Fria egenskaper**. Behåll samtliga värden och välj
   **Lägg i utkastet och stäng**. Öppna Utkast igen. Just cykelförslagets
   typvarning ska nu vara borta; övriga berörda förslag väntar på egen
   granskning.
5. Läs alla kvarvarande förslag och den tidigare historiken enligt den
   gemensamma förberedelsen. Spara inte hela utkastet.

**Förväntat resultat:**

- Kastning behåller egenskapernas identiteter, ordning, datatyper och hela
  värden. Förslaget behåller sin typvarning tills det uttryckligen läggs i
  utkastet på nytt efter granskning mot den sparade typen.
- Gemensamma objekt, verkliga samband, typkataloger och historik är oförändrade.

### UTKAST-147: Kastat typförslag kräver granskning utan att förlora egenskaper

**Syfte:** Behålla fria egenskaper när kastad typbetydelse kräver ny
granskning av sambandsförslaget mot den sparade typen.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Starta områdets provkommando och välj
`new-relationship-meaning`. Behåll samma databas och användare genom fallet.
Förberedelsen ändrar typens omvända riktning och lägger den fria egenskapen
**Ny uppgift** i sambandets förslag. Förslaget använder den föreslagna
typbetydelsen. När typförslaget kastas finns hela värdet kvar, men
sambandsförslaget behöver granskas mot den sparade typen.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-147"
  },
  "reference": "Chromium, riktig lokal server och SQLite; konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Kastning av typens ändringsförslag behåller hela egenskaperna och varnar om ändrad typbetydelse. Först uttrycklig granskning i sambandsformuläret tar bort just det förslagets typkonflikt.",
    "Gemensamma objekt, verkliga samband, typkataloger och historik är oförändrade."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast och läs samtliga hela förslag enligt områdets förberedelse.
2. Välj Ta bort förslaget: Granskar. Läs borttagningsbekräftelsen. Det
   individuella egenskapsförslaget finns med bland berörda förslag med beskedet
   **Typens uppgifter skiljer sig från förslagets underlag. Rätta förslaget
   i det ordinarie flödet.**
3. Välj Ta bort. Öppna det kvarvarande objektets eller sambandets hela förslag
   och läs Ny uppgift och Behåll hela mitt värde. Typvarningen finns kvar.
4. Stäng textvyn och öppna **Tabell → Samband för Alex blå cykel**.
   Läs sambandet med **Ny uppgift: Behåll hela mitt värde** och välj dess
   **Redigera samband**. Kontrollera den sparade typen Granskar, båda
   ändpunkterna och alla egenskaper. Behåll samtliga värden och välj
   **Lägg i utkastet** och **Stäng samband**. Öppna Utkast igen. Just det
   granskade sambandets typvarning ska nu vara borta; övriga berörda
   förslag väntar på egen granskning.
5. Läs alla kvarvarande förslag och den tidigare historiken enligt den
   gemensamma förberedelsen. Spara inte hela utkastet.

**Förväntat resultat:**

- Kastning behåller egenskapernas identiteter, ordning, datatyper och hela
  värden. Förslaget behåller sin typvarning tills det uttryckligen läggs i
  utkastet på nytt efter granskning mot den sparade typen.
- Gemensamma objekt, verkliga samband, typkataloger och historik är oförändrade.

### UTKAST-48: kontrollera en genomförd borttagning efter tappat svar

**Syfte:** Skilja ett oklart svar från en avvisning och återfinna genomfört
kastande.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Förbered provkommandot ovan och välj `new-base`. Kör
`lost-response` efter fullständig läsning i steg 1. Separata protokollprov finns
ovan.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-48.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-48"
  },
  "reference": "1280 × 720; Chromium; syntetiska testidentiteter",
  "outcomes": [
    "Ett tappat svar anges som obekräftat. Aktuell kontroll visar det verkliga tomma utkastet utan upprepad borttagning.",
    "Gemensamma cykelvärden och ändringshistorik består; ingen gemensam radering sker."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före borttagningshandlingen i UI-steg 2: kör `lost-response` och
meddela **Nästa borttagning får tappat svar efter genomförandet**.
Den befintliga routningen skickar först den verkliga begäran och
tappar sedan dess svar. Kontrollen läser samma verkliga lagring.
Följ [borttagningsförberedelsen](#separat-förberedelse-för-borttagningsfallen).
Använd samma session och verkliga lagring genom kontrollen. Efter känt
utfall: `network-ok`, `release` och sedan `new-base` mellan fallen.
Avsluta med `quit` och kontrollera borttagen provinstallation.

**Steg:**

1. Öppna Utkast och läs samtliga förslag fullständigt enligt förberedelsen.
2. Be operatören förbereda tappat borttagningssvar och invänta bekräftelse.
   Därefter bekräfta Ta bort hela utkastet. Läs Borttagningen kunde inte
   bekräftas. Ta bort hela utkastet är spärrad.
3. Välj Hämta aktuellt utkast. Läs tomt utkast och kontrollera rubrikens fokus.
   Gör den slutliga gemensamma kontrollen.

**Förväntat resultat:**

- Ett tappat svar anges som obekräftat. Aktuell kontroll visar det verkliga
  tomma utkastet utan upprepad borttagning.
- Gemensamma cykelvärden och ändringshistorik består; ingen gemensam radering
  sker.

### UTKAST-148: kontrollera ett borttaget oberoende förslag efter tappat svar

**Syfte:** Återfinna riktad genomförd borttagning utan att kasta resten.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Förbered provkommandot ovan och välj `new-base`.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-148.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-148"
  },
  "reference": "1280 × 720; Chromium; syntetiska testidentiteter",
  "outcomes": [
    "Kontrollen återfinner genomförd riktad borttagning utan att skicka samma borttagning igen.",
    "Övriga fullständiga förslag, gemensamma cykelvärden och historik består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före borttagningshandlingen i UI-steg 2: kör `lost-response` och
meddela **Nästa borttagning får tappat svar efter genomförandet**.
Den befintliga routningen skickar först den verkliga begäran och
tappar sedan dess svar. Kontrollen läser samma verkliga lagring.
Följ [borttagningsförberedelsen](#separat-förberedelse-för-borttagningsfallen).
Använd samma session och verkliga lagring genom kontrollen. Efter känt
utfall: `network-ok`, `release` och sedan `new-base` mellan fallen.
Avsluta med `quit` och kontrollera borttagen provinstallation.

**Steg:**

1. Öppna Utkast och läs samtliga förslag fullständigt enligt förberedelsen.
2. Be operatören förbereda tappat borttagningssvar och invänta bekräftelse.
   Därefter välj Olöst fordons papperskorg. Läs det oklara utfallet och spärrad
   Ta bort.
3. Välj Hämta aktuellt utkast och läs Förslaget finns inte längre. Kontrollera
   att Olöst fordon har försvunnit.
4. Läs alla kvarvarande förslag fullständigt. Gör den slutliga gemensamma
   kontrollen enligt förberedelsen.

**Förväntat resultat:**

- Kontrollen återfinner genomförd riktad borttagning utan att skicka samma
  borttagning igen.
- Övriga fullständiga förslag, gemensamma cykelvärden och historik består.

### UTKAST-149: bevara senare meddelandefokus vid fördröjt borttagningsfel

**Syfte:** Ge beständig återhämtning utan att en sen dialog täcker senare
arbete.

**Användare:** Alex Exempel i provinstallationen.

**Förutsättningar:** Förbered provkommandot ovan och välj `new-base`.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-149.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-149"
  },
  "reference": "1280 × 720; Chromium; syntetiska testidentiteter",
  "outcomes": [
    "Sent fel bevarar senare meddelandefokus och text. Kontroll och felbesked består efter avbrott.",
    "Aktuell kontroll visar genomförd borttagning och bevarar övriga förslag. Gemensamma värden och historik består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före borttagningen i UI-steg 2: kör `hold` och bekräfta installationen.
Efter den verkliga borttagningen: invänta **Removal applied; reply held**
och meddela **Borttagningen är genomförd och samma svar hålls**.
Behåll svaret tills användaren skrivit sin senare meddelandetext med
fokus kvar. Först i steg 3: kör `lost-response` och `release` och
meddela **Samma genomförda svar tappas**.
Följ [borttagningsförberedelsen](#separat-förberedelse-för-borttagningsfallen).
Använd samma session och verkliga lagring genom kontrollen. Efter känt
utfall: `network-ok`, `release` och sedan `new-base` mellan fallen.
Avsluta med `quit` och kontrollera borttagen provinstallation.

**Steg:**

1. Öppna Utkast och läs samtliga förslag fullständigt enligt förberedelsen.
2. Be operatören förbereda hållet borttagningssvar och invänta installationen.
   Ta bort Olöst fordon och invänta operatörens bekräftelse av genomförd
   borttagning med hållet svar. Skriv Min senare text och fokus ska finnas kvar
   i meddelandefältet.
3. Be operatören tappa samma hållna svar och invänta bekräftelse. Kontrollera
   fältets fokus, hela texten och det beständiga felbeskedet. Ingen ny dialog
   öppnas.
4. Välj Kontrollera borttagningen. Kontrollera fokus på Avbryt. Tryck Escape och
   kontrollera återfokus på kontrollknappen.
5. Öppna kontrollen igen och välj Hämta aktuellt utkast. Kontrollera att
   förslaget är borta och hela meddelandet finns kvar.
6. Läs alla kvarvarande förslag fullständigt. Gör den slutliga gemensamma
   kontrollen enligt förberedelsen.

**Förväntat resultat:**

- Sent fel bevarar senare meddelandefokus och text. Kontroll och felbesked
  består efter avbrott.
- Aktuell kontroll visar genomförd borttagning och bevarar övriga förslag.
  Gemensamma värden och historik består.

### UTKAST-150: kontrollera utebliven borttagning före ett nytt försök

**Syfte:** Skilja stopp före servern från tappat svar efter genomförd ändring.

**Användare:** Alex Exempel och den inbjudna Robin i separata sessioner.

**Förutsättningar:** Förbered provkommandot ovan, välj `new-base` och
`other-member`. Läs Robins fullständiga förslag genom Visa förslaget:
Person, Robins privata anteckning, hela beskrivningen, Identifierat objekt
och Gäller fortfarande. Behåll det osparat.

**Integrationstest:**
[draft-removal.spec.ts](../../tests/integration/draft-removal.spec.ts),
UTKAST-150.
<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-removal.spec.ts",
    "caseId": "UTKAST-150"
  },
  "reference": "1280 × 720; Chromium; syntetiska testidentiteter",
  "outcomes": [
    "Stopp före servern ändrar inga förslag. Stängning och återöppning ger inte rätt att upprepa åtgärden.",
    "Faktisk kontroll tillåter ett nytt försök. Riktad borttagning bevarar Alex andra förslag, Robins separata privata arbete, gemensamma värden och historik utan att avslöja Robins utkast."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före borttagningshandlingen i UI-steg 2: kör `lost-unsent` och meddela
**Nästa borttagning stoppas före servern**. Behåll det felet genom
stängning, återöppning, båda medlemmarnas fullständiga läsningar och
den verkliga aktuella kontrollen. Först när kontrollen i UI-steg 4
ger ett nytt tillåtet försök: kör `network-ok` vid steg 5 och meddela
**Normal leverans är återställd inför ett nytt uttryckligt försök**.
Följ [borttagningsförberedelsen](#separat-förberedelse-för-borttagningsfallen).
Använd samma session och verkliga lagring genom kontrollen. Efter känt
utfall: `network-ok`, `release` och sedan `new-base` mellan fallen.
Avsluta med `quit` och kontrollera borttagen provinstallation.

**Steg:**

1. Öppna Utkast och läs samtliga förslag fullständigt enligt förberedelsen.
2. Be operatören förbereda stopp före servern och invänta bekräftelse. Välj
   Olöst fordons papperskorg. Läs det oklara utfallet och spärrad Ta bort.
3. Tryck Escape och läs samtliga förslag fullständigt. Olöst fordon och alla
   övriga värden är kvar.
4. Välj Kontrollera borttagningen. Ta bort är fortfarande spärrad. Ladda om
   Robins separata sida, öppna Utkast och läs hela Person-förslaget igen. Gå
   tillbaka till Alex, välj Hämta aktuellt utkast och granska den kvarvarande
   enda posten. Upprepa därefter Robins läsning. Namn, hela beskrivningen,
   identitet och status är oförändrade och osparade. Alex utkast visar enbart
   Alex förslag och avslöjar inget av Robins arbete.
5. Först när faktisk kontroll ger ett nytt tillåtet försök: be operatören
   återställa normal leverans och invänta bekräftelse. Välj Ta bort och
   kontrollera att Olöst fordon försvinner.
6. Läs alla kvarvarande förslag fullständigt. Gör den slutliga gemensamma
   kontrollen enligt förberedelsen. Ladda om Robins sida och läs hela
   Person-förslaget ännu en gång. Det förblir osparat och oförändrat efter Alex
   lyckade försök; Alex kan fortfarande inte se det i sitt utkast eller den
   gemensamma kartan.

**Förväntat resultat:**

- Stopp före servern ändrar inga förslag. Stängning och återöppning ger inte
  rätt att upprepa åtgärden.
- Faktisk kontroll tillåter ett nytt försök. En genomförd riktad borttagning
  bevarar Alex andra förslag, Robins separata privata förslag, gemensamma
  värden och historik. Robins fullständiga värden består före och efter
  kontroll samt efter lyckad borttagning utan att avslöjas för Alex.

### UTKAST-90: läs hela utkastet utan AI eller medgivande

**Syfte:** Granska alla förslag och fria egenskaper utan att starta samtal.

**Användare:** Alex Exempel i den separata provinstallationen nedan.

**Förutsättningar:** Kör `npm run build` och sedan
`node --import tsx scripts/manual-draft-review.ts` i en terminal.
Öppna den utskrivna adressen och logga in med den syntetiska
Google-identiteten Alex Exempel. Ingen extern leverantör används.
Skriv `quit` i terminalen efter provningen för att ta bort installationen.

**Integrationstest:**
[draft-review.spec.ts](../../tests/integration/draft-review.spec.ts),
UTKAST-90.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-review.spec.ts",
    "caseId": "UTKAST-90"
  },
  "reference": "1440 × 1000; fullständig läsning utan AI eller medgivande.",
  "outcomes": [
    "Utkastet öppnas utan samtal eller medgivandedialog trots att AI saknas.",
    "Alla fyra förslagsslag kan läsas fullständigt. Förslagen och den sparade kartan ändras inte av läsning.",
    "Läsdialogen börjar på rubriken. Tab stannar i dialogen; bakomliggande innehåll är inaktivt. Krysset är dess enda synliga stängkontroll. Escape och krysset återför fokus till radens öppningsknapp.",
    "Verklig olöst identitet eller obesvarad fråga har feltext och symbol. Giltiga okända, osäkra och ospecificerade uppgifter får ingen felvarning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Utkast** i verktygsfältet vid 1440 × 1000 pixlar.
2. Läs tabellens Symbol, Namn, Typ och Vad som ändras.
3. Öppna **Alex blå cykel** med tangentbord. Läs sparade och föreslagna
   värden, hela beskrivningen, Ramnummer och ekonomiska uppgifter.
4. Prova Tab, Skift+Tab, krysset och Escape. Öppna därefter ett samband,
   **Utkastfordon** och **Granskar**. Läs deras individuella fria egenskaper
   och riktning.
5. Kontrollera fel vid **Olöst fordon** och det olösta sambandet. Läs även
   Okänt, Uttryckligen inget, Osäkert uppgivet och Ospecificerat objekt.

**Förväntat resultat:**

- Utkastet öppnas utan samtal eller medgivandedialog trots att AI saknas.
- Alla fyra förslagsslag kan läsas fullständigt.
  Förslagen och den sparade kartan ändras inte av läsning.
- Läsdialogen börjar på rubriken. Tab stannar i dialogen; bakomliggande
  innehåll är inaktivt. Krysset är dess enda synliga stängkontroll.
  Escape och krysset återför fokus till radens öppningsknapp.
- Verklig olöst identitet eller obesvarad fråga har feltext och symbol.
  Giltiga okända, osäkra och ospecificerade uppgifter får ingen felvarning.

### UTKAST-91: nå tomt utkast och bevara meddelandet före första skickandet

**Syfte:** Skilja öppning och utkastgranskning från faktisk samtalsanvändning.

**Användare:** Alex Exempel i provinstallationen för UTKAST-90.

**Förutsättningar:** Starta en ny provinstallation med tillägget
`--with-model --empty`. Den använder en kontrollerad, syntetisk leverantör
och börjar med ett tomt utkast.

**Integrationstest:**
[draft-review.spec.ts](../../tests/integration/draft-review.spec.ts),
UTKAST-91.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-review.spec.ts",
    "caseId": "UTKAST-91"
  },
  "reference": "Tomt och typbegränsat utkast, kontrollerad modell.",
  "outcomes": [
    "Tomt utkast är åtkomligt även när verktygsfältets Utkast-ikon saknas. Öppning startar inget samtal och begär inget medgivande.",
    "Oskickad text finns kvar efter stängning och vybyte. Första Skicka kräver medgivande, skickar exakt meddelandet en gång och tömmer fältet efter bekräftat mottagande.",
    "Ett förslag som endast gäller en typ visar den avskilda Utkast-ikonen. Den öppnar hela utkastet direkt även utan synliga kartförslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Skriv till Skyttel** och **Visa utkastet**. Läs tomt utkast.
2. Skriv **Behåll å, ä och ö i mitt meddelande**, stäng textvyn,
   besök Tabell och öppna textvyn igen.
3. Välj **Skicka**, godkänn medgivandet och invänta **Ett provsvar.**
4. Lägg en ny objekttyp i utkastet via Inställningar → Typer och egna
   fält. Återgå till hushållsarbetet, ladda om och öppna **Utkast**.

**Förväntat resultat:**

- Tomt utkast är åtkomligt även när verktygsfältets Utkast-ikon saknas.
  Öppning startar inget samtal och begär inget medgivande.
- Oskickad text finns kvar efter stängning och vybyte. Första Skicka
  kräver medgivande, skickar exakt meddelandet en gång och tömmer fältet
  efter bekräftat mottagande.
- Ett förslag som endast gäller en typ visar den avskilda Utkast-ikonen.
  Den öppnar hela utkastet direkt även utan synliga kartförslag.

### UTKAST-27: Uttrycklig status, profilbilder och fria etiketter är läsbara

**Syfte:** Sparat Upphört och föreslaget Gäller fortfarande visas oberoende av
samma gamla datumegenskap.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Kör områdets `manual-draft-review.ts --meanings` i
separat provinstallation och logga in med syntetisk identitet. Sparad cykel
och samband är uttryckligen Upphört, med en vanlig datumegenskap 2000-01-01.
Förslagen anger Gäller fortfarande och cykeln har en annan verklig profilbild.
Avsluta med `quit`.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/draft-review.spec.ts",
    "caseId": "UTKAST-27"
  },
  "reference": "Chromium 1440 × 1000; uttrycklig status, två verkliga profilbilder och fria egenskaper.",
  "outcomes": [
    "Sparat Upphört och föreslaget Gäller fortfarande visas oberoende av samma gamla datumegenskap.",
    "Båda profilbilderna och deras ändring går att läsa; fria etiketter och typade tomma värden behåller rätt betydelse.",
    "Läsning ändrar inget underlag och startar inget samtal eller medgivande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast och Blå cykel vid 1440 × 1000 CSS-pixlar. Läs Gäller och
   Status på båda sidorna samt den fria datumegenskapen Sista giltighetsdag.
2. Jämför de båda profilbilderna och deras ändringsmarkering. Läs samma
   egenskaps tidigare etikett Fordonets berättelse och nya etikett Cykelns
   berättelse. Läs den föreslagna tomma textegenskapen och Avtalat pris som
   tom talegenskap på båda sidorna.
3. Stäng och läs Blå cykel → granskar → Röd cykel. Jämför uttrycklig giltighet
   och status med den vanliga datumegenskapen. Spara inget.

**Förväntat resultat:**

- Sparat Upphört och föreslaget Gäller fortfarande visas oberoende av samma
  gamla datumegenskap.
- Båda profilbilderna och deras ändring går att läsa; fria etiketter och
  typade tomma värden behåller rätt betydelse.
- Läsning ändrar inget underlag och startar inget samtal eller medgivande.

### UTKAST-28: kombinera aktiva egenskapsval utan att spara kartan

**Syfte:** Granska konflikten från Tabell och sedan Karta med nytt underlag;
kombinera
värden från båda sidor med tydligt fokus och oförändrad gemensam karta.

**Användare:** Administratören och en inbjuden medlem i skilda
webbläsarprofiler. Använd medlemmens verkliga förnamn i jämförelsen.

**Förutsättningar:** Ett nytt tomt testhushåll med Lo Exempel och
Molnmusik enligt den allmänna förberedelsen. Administratören lägger
namnet Lo Lind, beskrivningen Min anteckning, Ospecificerat objekt och
Gäller fortfarande i sitt utkast. Medlemmen
sparar Lo Berg med beskrivningen Robins anteckning efter detta förslag.
Ladda om administratörens sida. Använd 1440 × 900 pixlar.

**Integrationstest:**
[conflict-properties.spec.ts](../../tests/integration/conflict-properties.spec.ts),
UTKAST-28.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-properties.spec.ts",
    "caseId": "UTKAST-28"
  },
  "reference": "1440 × 900; Tabell och därefter Karta med en ny konflikt och tangentbord; aktiva blandade egenskapsval.",
  "outcomes": [
    "Rubriken får fokus vid öppning. Tangentbordsfokus stannar i dialogen. Bakgrunden är inaktiv. Valbara värden har ramar och valda värden har starkare ramar.",
    "Alla skiljande egenskaper kräver aktiva val. Identiska värden behöver inget val och visas som vanlig text. Resultatet visar Lo Lind och Robins anteckning tillsammans, med uppgift om vilken sida valda värden kommer från.",
    "Bara utkastet ändras. Kartan visar fortfarande Lo Berg och samma beskrivning som medlemmen sparar. Historiken får ingen ny sparad ändring.",
    "Konfliktlistan behåller typ och namn med bock till höger och en enda tillgänglig status. Inga värden klipps på telefon.",
    "När den sista konflikten är löst försvinner ingången. Stängning återför fokus till kartverktygen. En kvarvarande ingång får fokus annars."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj Tabell och öppna **1 konflikt i ditt utkast** under hushållets namn.
2. Kontrollera rubrikens fokus och de två rutorna **Sparat i kartan nu**
   och **Ditt förslag**. Läs förklaringen med medlemmens förnamn.
   Tryck Shift+Tab och Tab; fokus ska stanna i dialogen.
3. Välj ditt namn Lo Lind. Kontrollera att bekräftelsen är spärrad.
4. Välj den sparade beskrivningen Robins anteckning och Identifierat
   objekt. Välj Gäller fortfarande från ditt förslag. Läs **Resultat av valen**.
5. Välj **Lägg valen i utkastet**. Läs status och konfliktlistans bock.
6. Stäng med Escape. Läs den sparade personen i tabellen och ditt utkast.
7. Förbered konflikten igen i ett nytt hushåll med samma värden. Öppna den
   från Karta med Enter. Använd Tab och Shift+Tab; försök nå verktygen bakom
   dialogen. Välj samma fyra värden med Enter och lägg valen i utkastet.
   Läs resultat och status, stäng med Escape och kontrollera kartverktygens
   fokus. Kartan och historiken ska vara oförändrade även efter denna väg.

**Förväntat resultat:**

- Rubriken får fokus vid öppning. Tangentbordsfokus stannar i dialogen.
  Bakgrunden är inaktiv. Valbara värden har ramar och valda värden har
  starkare ramar.
- Alla skiljande egenskaper kräver aktiva val. Identiska värden behöver
  inget val och visas som vanlig text. Resultatet visar Lo Lind och Robins
  anteckning tillsammans, med uppgift om vilken sida valda värden kommer från.
- Bara utkastet ändras. Kartan visar fortfarande Lo Berg och samma
  beskrivning som medlemmen sparar. Historiken får ingen ny sparad ändring.
- Konfliktlistan behåller typ och namn med bock till höger och en enda
  tillgänglig status. Inga värden klipps på telefon.
- När den sista konflikten är löst försvinner ingången. Stängning återför
  fokus till kartverktygen. En kvarvarande ingång får fokus annars.

### UTKAST-29: ogiltiga sambandsval behålls tills kombinationen rättas

**Syfte:** Avvisa en kombination av ändpunkter som blir en dubblett och
bevara valen tills användaren rättar dem.

**Användare:** Administratören och den inbjudna medlemmen.

**Förutsättningar:** Spara Lo Exempel → Använder → Molnmusik samt
Molnmusik → Använder → Lo Exempel. Administratören föreslår att det första
sambandet går från Lo Exempel till Lo Exempel, med textegenskapen
**Uppgiftens säkerhet: Osäkert uppgivet**.
Medlemmen sparar det första sambandet från Molnmusik till Molnmusik.
Ladda om administratörens sida.

**Integrationstest:**
[conflict-properties.spec.ts](../../tests/integration/conflict-properties.spec.ts),
UTKAST-29.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-properties.spec.ts",
    "caseId": "UTKAST-29"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; blandade ändpunktsval bildar ett redan befintligt samband.",
  "outcomes": [
    "Dubbletten förklaras och bekräftelsen är spärrad. Alla val finns kvar.",
    "Efter rättning gäller förslaget Lo Exempel till Lo Exempel med Osäkert uppgivet. Medlemmens sparade samband består före separat sparande.",
    "Servern avvisar samma ogiltiga kombination från en äldre klient."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **1 konflikt i ditt utkast**.
2. Välj Molnmusik för **Från objekt** från **Sparat i kartan nu**.
   Välj Lo Exempel för **Till objekt** från **Ditt förslag**. Läs
   **Uppgiftens säkerhet: Osäkert uppgivet (Text)**, som behålls automatiskt
   eftersom bara ditt förslag har lagt till egenskapen.
3. Läs beskedet att sambandet redan finns. Kontrollera spärrad bekräftelse
   och bevarade valmarkeringar.
4. Byt bara **Från objekt** till Lo Exempel från ditt förslag.
5. Bekräfta och granska utkastet. Öppna den gemensamma kartans samband
   för Molnmusik och läs det sparade sambandet till Molnmusik.

**Förväntat resultat:**

- Dubbletten förklaras och bekräftelsen är spärrad. Alla val finns kvar.
- Ett självsamband från Lo Exempel till Lo Exempel med Osäkert uppgivet
  går att lägga i utkastet efter rättningen.
- Medlemmens sparade samband från Molnmusik till Molnmusik består före
  separat sparande. Servern avvisar samma dubblett från en äldre klient.

UTKAST-30 är pensionerat och får inte återanvändas.
UTKAST-03 behåller markerat val vid avvisning, spärrad bekräftelse efter
aktuell jämförelse och Escape med fokus tillbaka till konfliktknappen,
innan nya val och ett uttryckligt sparande görs.

### UTKAST-31: läs långa egenskapsnamn på smal skärm

**Syfte:** Läsa hela etiketter på fria egenskaper även
när namnet saknar mellanslag.

**Användare:** Alex Exempel i provinstallationen för UTKAST-90.

**Förutsättningar:** Kör `npm run build` och
`node --import tsx scripts/manual-draft-review.ts --wrapping`.
Logga in med den syntetiska Google-identiteten. Namnen på cykelns
Ramnummer och beskrivning består av Ramnummer respektive Berättelse
upprepat tolv gånger utan mellanslag. Prova en smal skärm och förstoring.
Skriv `quit` i terminalen efter provningen.

**Integrationstest:**
[draft-review.spec.ts](../../tests/integration/draft-review.spec.ts),
UTKAST-31.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-review.spec.ts",
    "caseId": "UTKAST-31"
  },
  "reference": "320 × 740; långa obrutna fältnamn får inte dölja värden.",
  "outcomes": [
    "Hela egenskapsnamnen bryts och kan läsas utan sidledsrullning i dialogen.",
    "Escape återför fokus till radens läsknapp. Läsningen ändrar inga förslag."
  ]
}
```
-->

**Steg:**

1. Öppna Utkast och läs hela förslaget Alex blå cykel.
2. Läs de långa egenskapsnamnen på den föreslagna sidan. Rulla genom
   uppgifterna och stäng med Escape.

**Förväntat resultat:**

- Hela egenskapsnamnen bryts och kan läsas utan sidledsrullning i dialogen.
- Escape återför fokus till radens läsknapp. Läsningen ändrar inga förslag.

### UTKAST-32: läs förslag som bara ändrar livscykel

**Syfte:** Skilja faktisk giltighet från ett uttryckligt val av statusläge
i både sammanfattningen och den fullständiga läsningen.

**Användare:** Alex Exempel i provinstallationen för UTKAST-90.

**Förutsättningar:** Kör `npm run build` och
`node --import tsx scripts/manual-draft-review.ts --lifecycle`.
Logga in med den syntetiska Google-identiteten. Utgånget provobjekt och
dess samband har slutdatum 2000-01-01. Framtida provobjekt och dess
samband har slutdatum 9999-12-31. Det utgångna paret har uttrycklig
status Upphört och föreslås gälla; det andra paret föreslås upphöra.
Inga andra uppgifter ändras. Skriv `quit` efter provningen.

**Integrationstest:**
[draft-review.spec.ts](../../tests/integration/draft-review.spec.ts),
UTKAST-32.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-review.spec.ts",
    "caseId": "UTKAST-32"
  },
  "reference": "Utgånget och framtida objekt samt samband; faktisk giltighet mot uttrycklig status.",
  "outcomes": [
    "Alla fyra rader visar en uttrycklig statusändring i båda riktningarna.",
    "Det utgångna objektet och dess samband visar dessutom Gäller: Upphört → Aktuellt. Det andra paret visar Gäller: Aktuellt → Upphört.",
    "Den fullständiga läsningen visar samma betydelser som sammanfattningen. De fyra kolumnerna är kvar. Läsningen ändrar inga förslag eller sparade uppgifter och Escape återför fokus till den använda läsknappen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast och läs Vad som ändras för båda objekten och deras samband.
2. Öppna varje rad och jämför Gäller och Status på den sparade och den
   föreslagna sidan. Stäng med Escape mellan raderna.

**Förväntat resultat:**

- Alla fyra rader visar en uttrycklig statusändring i båda riktningarna.
- Det utgångna objektet och dess samband visar dessutom
  Gäller: Upphört → Aktuellt. Det andra paret visar Gäller: Aktuellt → Upphört.
- Den fullständiga läsningen visar samma betydelser som sammanfattningen.
  De fyra kolumnerna är kvar. Läsningen ändrar inga förslag eller sparade
  uppgifter och Escape återför fokus till den använda läsknappen.

### UTKAST-33: läs långa objektnamn i objekt- och sambandskonflikter

**Syfte:** Läsa hela namnet i konfliktens rubrik och lista på smal skärm.

**Användare:** Alex och Lo i skilda webbläsarprofiler med tillgång till
hushållet.

**Förutsättningar:** Ett nytt hushåll med ett objekt vars namn består av
Föremålsnamn upprepat fjorton gånger utan mellanslag, och objektet Molnmusik.
Spara båda. Gör varje delprov i ett nytt hushåll enligt allmän förberedelse.

**Integrationstest:**
[conflict-properties.spec.ts](../../tests/integration/conflict-properties.spec.ts),
UTKAST-33.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-properties.spec.ts",
    "caseId": "UTKAST-33"
  },
  "reference": "320 × 900, objektkonflikt; långt obrutet namn.",
  "outcomes": [
    "Namnet bryts och hela innehållet kan läsas utan sidledes rullning.",
    "Escape återför fokus. Läsningen ändrar varken kartan eller utkastet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex föreslår en ny beskrivning av objektet med det långa namnet.
   Lo sparar en annan beskrivning av samma objekt.
2. Använd 320 × 900 pixlar och öppna **1 konflikt i ditt utkast**.
   Läs hela namnet i rubriken och konfliktlistan utan sidledes rullning.
3. Stäng med Escape och kontrollera att konfliktknappen får fokus.

**Förväntat resultat:**

- Namnet bryts och hela innehållet kan läsas utan sidledes rullning.
- Escape återför fokus. Läsningen ändrar varken kartan eller utkastet.

### UTKAST-34: Fria etiketter bevaras i konflikt och resultat

**Syfte:** Båda konfliktsidorna och resultatet behåller de individuella
etiketterna Anteckningar och Avtalat pris.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Alex och Lo delar ett hushåll med sparade Lo Exempel.
Använd de individuella textegenskaperna Anteckningar och Avtalat pris med
stabila identiteter.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conflict-properties.spec.ts",
    "caseId": "UTKAST-34"
  },
  "reference": "Chromium, riktig lokal server och SQLite; konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Båda konfliktsidorna och resultatet behåller de individuella etiketterna Anteckningar och Avtalat pris.",
    "Det kombinerade utkastet innehåller Egen anteckning och 240 utan automatisk betydelse från typ eller etikett."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex föreslår Anteckningar: Egen anteckning och Avtalat pris: 120 på Lo
   Exempel.
2. Lo föreslår samma egenskaper med Sparad anteckning och 240 och sparar sitt
   hela utkast.
3. Alex laddar om och öppnar Granska konflikter. Läs båda sidornas fria
   etiketter. Välj Egen anteckning från det egna förslaget och 240 från den
   sparade sidan.
4. Läs Resultat av valen, välj Lägg valen i utkastet och läs samma etiketter
   och värden igen. Spara inte hela utkastet.

**Förväntat resultat:**

- Båda konfliktsidorna och resultatet behåller de individuella etiketterna
  Anteckningar och Avtalat pris.
- Det kombinerade utkastet innehåller Egen anteckning och 240 utan automatisk
  betydelse från typ eller etikett.

### UTKAST-35: ange den verkliga spararen för varje ändrad egenskap

**Syfte:** Bevara korrekt författare när senare sparanden ändrar andra
egenskaper.

**Användare:** Alex, Lo och Robin i tre skilda webbläsarprofiler med egna
konfigurerade inloggningar och tillgång till samma hushåll.

**Förutsättningar:** Ett nytt hushåll med Lo Exempel utan fria egenskaper.
De tre användarna är aktuella medlemmar; demodatans historiska Robin är
inte en inloggning. Använd faktiska förnamn om profilerna har andra namn.

**Integrationstest:**
[conflict-properties.spec.ts](../../tests/integration/conflict-properties.spec.ts),
UTKAST-35.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-properties.spec.ts",
    "caseId": "UTKAST-35"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; ange den verkliga spararen för varje ändrad egenskap.",
  "outcomes": [
    "Namnraden anger Lo som sparare, även efter Alex senare sparande.",
    "Raden Anteckningar anger Alex. Författarnamn hör till den ändrade egenskapen och ersätts inte av hela objektets senaste sparare.",
    "Efter Robins senare ändring anges samma verkliga sparare, utan att hävda att deras tidigare sparanden sker efter det nya förslaget."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Robin lägger namnet Eget namn och textegenskapen Anteckningar med Egen
   text i sitt utkast.
2. Lo ändrar enbart objektets namn till Lo Berg och sparar.
3. Alex ändrar enbart Anteckningar till Alex text och sparar senare.
4. Robin öppnar **Granska konflikter** och läser den sparade sidans
   namnrad och raden Anteckningar.
5. Robin stänger dialogen och ändrar sitt föreslagna namn till
   **Eget senare namn** utan att spara i den gemensamma kartan.
6. Robin laddar om, öppnar **Granska konflikter** igen och läser uppgifterna om
   sparare och ordningen mellan förslag och sparanden.

**Förväntat resultat:**

- Namnraden anger Lo som sparare, även efter Alex senare sparande.
- Raden Anteckningar anger Alex. Författarnamn hör till den ändrade
  egenskapen och ersätts inte av hela objektets senaste sparare.
- Efter Robins senare ändring anges samma verkliga sparare, utan att
  hävda att deras tidigare sparanden sker efter det nya förslaget.

### UTKAST-01: återuppta en konflikt och spara oberoende förslag tillsammans

**Syfte:** Kontrollera att ett privat utkast kan återupptas, att ett aktivt
konfliktval bevarar oberoende ändringar och att hela utkastet kräver ett
nytt sparbesked.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** Aktuell demodata enligt förberedelsen ovan. Inga
förslag får vara sparade eller kastade efter återställningen.

**Integrationstest:**
[family.spec.ts](../../tests/integration/family.spec.ts),
UTKAST-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/family.spec.ts",
    "caseId": "UTKAST-01"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; återuppta en konflikt och spara oberoende förslag tillsammans.",
  "outcomes": [
    "Före konfliktvalet visar fullständig förslagsläsning ursprungsnamnet Lo Exempel och förslaget Lo Lind. Konflikten visar aktuellt sparat Lo Berg. Sparförsöket avvisas utan ändrad karta, utkast eller historik. Konflikten och adressförslaget finns kvar efter omladdning och omstart.",
    "Konfliktvalet ger inget sparkvitto. Dialogens status visar att valen finns i utkastet. Förslaget innehåller Lo Lind och den oberoende sparade beskrivningen “Spelar piano i musikföreningen.” Adressförslaget finns kvar.",
    "Sambandets tidigare underlag visar Familjens musikkonto och `familjen@example.test`. Förslaget visar Familjens rättade konto och `musik@example.test`, med samma ändpunktsidentiteter.",
    "Det uttryckliga sparandet ger ett lyckat sparkvitto. **Utkastet är tomt** även efter omladdning. Det sparade sambandet visar **Familjens rättade konto → Inloggningsadress** → `musik@example.test`."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna utkastet och **Visa förslaget: Lo Lind**. Läs det tidigare
   namnet och förslaget. Stäng läsningen och textvyn, öppna konfliktknappen
   och läs det aktuella sparade namnet. Stäng med Escape.
2. Öppna utkastet och försök spara. Läs **Utkastet kunde inte sparas**,
   stäng sparmodalen och textvyn. Ladda om sidan och starta om
   applikationen med samma databas. Granska konflikten på nytt.
3. Öppna **Granska konflikter**. Välj det egna namnet Lo Lind och den
   sparade beskrivningen. Välj **Lägg valen i utkastet** och stäng med
   Escape. Läs hela Lo-förslaget och förslaget om inloggningsadress.
4. Stäng textvyn och välj **Redigera Familjens musikkonto** i Tabell.
   Ändra namnet till **Familjens rättade konto** och välj **Lägg i
   utkastet och stäng**. Läs sedan sambandets fullständiga förslag.
5. Stäng läsningen och spara hela utkastet med sparikonen.
6. Ladda om. Läs det tomma utkastet, stäng textvyn och öppna **Samband för
   Familjens rättade konto** i Tabell.

**Förväntat resultat:**

- Före konfliktvalet visar fullständig förslagsläsning ursprungsnamnet
  Lo Exempel och förslaget Lo Lind. Konflikten visar aktuellt sparat
  Lo Berg. Sparförsöket avvisas utan ändrad karta, utkast eller historik.
  Konflikten och adressförslaget finns kvar efter omladdning och omstart.
- Konfliktvalet ger inget sparkvitto. Dialogens status visar att valen
  finns i utkastet. Förslaget innehåller Lo Lind och den oberoende
  sparade beskrivningen “Spelar piano i musikföreningen.” Adressförslaget
  finns kvar.
- Sambandets tidigare underlag visar Familjens musikkonto och
  `familjen@example.test`. Förslaget visar Familjens rättade konto och
  `musik@example.test`, med samma ändpunktsidentiteter.
- Det uttryckliga sparandet ger ett lyckat sparkvitto. **Utkastet är tomt**
  även efter omladdning. Det sparade sambandet visar **Familjens rättade
  konto → Inloggningsadress** → `musik@example.test`.

## Aktuellt underlag och borttagning

### UTKAST-02: ett gammalt kastförsök bevarar nyare förslag

**Syfte:** Kontrollera att en äldre flik inte kan kasta nyare förslag.

**Användare:** Administratören i två flikar.

**Förutsättningar:** Tom testinstallation med de två sparade objekten
enligt förberedelsen. Båda flikarna använder samma inloggning.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-02"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; ett gammalt kastförsök bevarar nyare förslag.",
  "outcomes": [
    "Det första kastförsöket avvisas eftersom förslaget eller kartan ändras. Fortsatt kastande blockeras tills aktuellt underlag hämtas.",
    "Efter hämtningen finns både **Lo Lind** och det nya sambandet kvar.",
    "Det andra kastandet tömmer hela utkastet. **Lo Exempel** och **Molnmusik** finns kvar i kartan, utan det föreslagna sambandet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. I första fliken: välj **Tabell → Redigera Lo Exempel**, ändra namnet
   till **Lo Lind** och välj **Lägg i utkastet och stäng**.
2. Öppna **Utkast → Kasta hela utkastet** i första fliken. Låt
   bekräftelsen vara öppen utan att kasta ännu.
3. I andra fliken: öppna **Samband för Lo Lind** i Tabell, skapa
   **Lo Lind → Använder → Molnmusik** och lägg sambandet i utkastet.
4. Återvänd till den äldre bekräftelsen och välj **Ta bort hela utkastet**.
   Läs avvisningen och kontrollera att nytt kastande är spärrat.
5. Välj **Hämta aktuellt utkast**. Läs både namnförslaget och sambandet
   i bekräftelsen och kasta sedan hela det aktuella utkastet.
6. Läs det tomma utkastet och de två oförändrade sparade objekten.

**Förväntat resultat:**

- Det första kastförsöket avvisas eftersom förslaget eller kartan ändras.
  Fortsatt kastande blockeras tills aktuellt underlag hämtas.
- Efter hämtningen finns både **Lo Lind** och det nya sambandet kvar.
- Det andra kastandet tömmer hela utkastet. **Lo Exempel** och
  **Molnmusik** finns kvar i kartan, utan det föreslagna sambandet.

### UTKAST-03: ett gammalt konfliktval kräver ny granskning

**Syfte:** Kontrollera att ett konfliktval gäller det underlag som visas.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** De två sparade objekten enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-03"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; ett gammalt konfliktval kräver ny granskning.",
  "outcomes": [
    "Det gamla konfliktvalet avvisas. Valmarkeringen behålls vid avvisningen; efter aktuell jämförelse krävs ett nytt val och Escape återför fokus. Namnförslaget **Lo Lind** finns kvar när det aktuella underlaget hämtas.",
    "Det nya konfliktvalet uppmanar till granskning och ändrar bara utkastet. Medlemmen ser fortfarande **Lo Ek** före det uttryckliga sparandet.",
    "Efter sparandet bekräftar kvittot **Lo Lind** och medlemmen ser det namnet."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/draft-conflicts-http.test.ts",
      "title": "HTTP clients reject stale conflict choices and enforce private drafts and revoked membership",
      "purpose": "Separata HTTP-prov med oberoende riktiga sessioner och SQLite för inaktuella val, privata utkast och återkallat medlemskap; inga formulärhandlingar."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Lägg namnändringen **Lo Lind** i administratörens utkast utan att spara.
2. Ändra samma person till **Lo Berg** som medlemmen och spara hela utkastet.
3. Ladda om administratörens sida och öppna **Granska konflikter**.
   Välj namnet Lo Lind utan att bekräfta. Låt jämförelsen vara öppen.
4. Ändra personen till **Lo Ek** som medlemmen och spara igen.
5. Välj namnet Lo Lind i den äldre jämförelsen och välj
   **Lägg valen i utkastet**. Läs att underlaget har ändrats.
6. Kontrollera att Lo Lind fortfarande är markerat efter avvisningen.
   Välj **Visa aktuell jämförelse**. Läs aktuellt Lo Ek och eget Lo Lind.
   Kontrollera att **Lägg valen i utkastet** är spärrad. Stäng med Escape,
   kontrollera fokus på konfliktknappen och öppna igen.
7. Välj det egna namnet och **Lägg valen i utkastet** igen. Stäng med
   Escape. Kontrollera medlemmens karta före något nytt sparande.
8. Öppna Utkast och spara hela administratörens utkast. Ladda om
   medlemmens sida.

**Förväntat resultat:**

- Det gamla konfliktvalet avvisas. Valmarkeringen behålls vid avvisningen;
  efter aktuell jämförelse krävs ett nytt val och Escape återför fokus.
Namnförslaget
  **Lo Lind** finns kvar när det aktuella underlaget hämtas.
- Det nya konfliktvalet uppmanar till granskning och ändrar bara utkastet.
  Medlemmen ser fortfarande **Lo Ek** före det uttryckliga sparandet.
- Efter sparandet bekräftar kvittot **Lo Lind** och medlemmen ser det namnet.

Separat tekniskt underlag i Vitests serverprojekt verifierar samma ägares
åtkomst från en annan session, privata utkast, inaktuella val och att ett
återkallat medlemskap stoppar varje läsning och ändring genom riktiga
HTTP-anrop och SQLite. Det utför inte de manuella formulärstegen.

### UTKAST-04: godta ett borttaget objekt utan att tappa andra förslag

**Syfte:** Kontrollera att ett namnförslag inte återupplivar ett borttaget
objekt och att oberoende förslag kan sparas.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** De två sparade objekten enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-04"
  },
  "reference": "1280 × 720; Tabell, avvisat sparande före konfliktvalet, nytt uttryckligt sparande och omstart med samma databas.",
  "outcomes": [
    "Konflikten säger att objektet är borttaget. Förslaget är läsbart men inte valbart och hela utkastet kan inte sparas före konfliktvalet.",
    "Valet tar bort namnförslaget men behåller **Kim Exempel** i utkastet. Kim finns ännu inte i medlemmens karta.",
    "Efter sparandet finns **Kim Exempel** och **Molnmusik** hos båda användarna. Varken **Lo Exempel** eller **Lo Lind** återkommer."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Lägg namnändringen **Lo Lind** och ett nytt objekt **Kim Exempel** i
   administratörens utkast utan att spara.
2. Som medlemmen: expandera Lo Exempels rad i Tabell, välj **Ta bort**
   och spara hela utkastet separat.
3. Ladda om administratörens sida och försök spara hela utkastet. Läs
   **Inget sparades**, stäng sparmodalen och textvyn och välj Karta och
   **Hämta aktuellt underlag**. Välj Tabell och öppna **Granska konflikter**.
   Läs Borttaget och det fullständiga namnförslaget.
4. Välj **Acceptera borttagningen och kasta ditt förslag**. Stäng med
   Escape och läs utkastet och medlemmens karta före något nytt sparande.
5. Spara administratörens återstående utkast. Starta om applikationen
   med samma databas och ladda om båda sidorna.

**Förväntat resultat:**

- Konflikten säger att objektet är borttaget. Förslaget är läsbart
  men inte valbart och hela utkastet kan inte sparas före konfliktvalet.
- Valet tar bort namnförslaget men behåller **Kim Exempel** i utkastet.
  Kim finns ännu inte i medlemmens karta.
- Efter sparandet finns **Kim Exempel** och **Molnmusik** hos båda
  användarna. Varken **Lo Exempel** eller **Lo Lind** återkommer.

## Samtidiga ändringar

### UTKAST-05: en namnkonflikt blockerar även oberoende förslag

**Syfte:** Kontrollera att hela utkastet sparas tillsammans efter ett nytt
konfliktval och sparbesked.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** De två sparade objekten enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-05"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; en namnkonflikt blockerar även oberoende förslag.",
  "outcomes": [
    "Det första sparandet avvisas med **Inget sparades**. Medlemmen ser **Lo Berg** och inget **Alex Exempel**.",
    "Förslagsläsningen visar underlaget **Lo Exempel** och förslaget **Lo Lind**. Konfliktjämförelsen visar det aktuellt sparade namnet **Lo Berg**. Sparande kräver ett uttryckligt val.",
    "Konfliktvalet behåller **Alex Exempel**, ger inget sparkvitto och finns kvar efter omstart. Det nya sparandet gör båda förslagen gemensamma."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Lägg **Alex Exempel** som nytt objekt och namnändringen **Lo Lind** i
   administratörens utkast. Behåll sidan öppen.
2. Ändra samma person till **Lo Berg** som medlemmen och spara.
3. Öppna Utkast och välj **Spara hela utkastet** som administratören.
4. Läs **Inget sparades**, stäng sparmodalen och textvyn och ladda om.
   Läs hela förslaget Lo Lind från Utkast: tidigare Lo Exempel och eget
   Lo Lind. Stäng läsningen och textvyn.
5. Öppna **Granska konflikter** och läs aktuellt Lo Berg och eget Lo Lind.
   Välj det egna namnet och **Lägg valen i utkastet**. Stäng med Escape.
6. Starta om appen med samma databas och ladda om administratörens sida.
   Läs båda förslagen, spara hela utkastet och ladda om hos medlemmen.

**Förväntat resultat:**

- Det första sparandet avvisas med **Inget sparades**. Medlemmen ser
  **Lo Berg** och inget **Alex Exempel**.
- Förslagsläsningen visar underlaget **Lo Exempel** och förslaget **Lo Lind**.
  Konfliktjämförelsen visar det aktuellt sparade namnet **Lo Berg**.
  Sparande kräver ett uttryckligt val.
- Konfliktvalet behåller **Alex Exempel**, ger inget sparkvitto och
  finns kvar efter omstart. Det nya sparandet gör båda förslagen gemensamma.

### UTKAST-06: granska nya samband före objektborttagning

**Syfte:** Kontrollera att borttagning kräver granskning av samband som
en annan användare lägger till.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** De två sparade objekten utan samband enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-06"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; granska nya samband före objektborttagning.",
  "outcomes": [
    "Det gamla sparandet avvisas. Konflikten visar sambandet med riktning och säkerheten **Osäkert uppgivet**.",
    "Konfliktvalet lägger även **Borttagning av samband** i utkastet. Kartan ändras först vid det nya sparandet.",
    "Både personen och sambandet försvinner efter sparandet. **Molnmusik** finns kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Lo Exempel** som administratören och välj **Ta bort**.
2. Lägg **Lo Exempel → Använder → Molnmusik** med den fria säkerhetsuppgiften
   **Osäkert uppgivet** i medlemmens utkast och spara det.
3. Försök spara administratörens äldre utkast från Utkastets sparikon. Läs
   **Utkastet kunde inte sparas**, stäng och ladda om för aktuellt underlag.
4. Öppna **Granska konflikter**, läs det nytillkomna sambandet och välj
   föreslagen borttagning för både objektet och sambandet. Välj
   **Lägg valen i utkastet**.
5. Kontrollera att sambandet fortfarande finns hos medlemmen. Välj sedan
   **Spara hela utkastet** som administratören och ladda om hos medlemmen.

**Förväntat resultat:**

- Det gamla sparandet avvisas. Konflikten visar sambandet med riktning
  och säkerheten **Osäkert uppgivet**.
- Konfliktvalet lägger även **Borttagning av samband** i utkastet.
  Kartan ändras först vid det nya sparandet.
- Både personen och sambandet försvinner efter sparandet. **Molnmusik**
  finns kvar.

### UTKAST-07: välj sparad betydelse vid en konflikt om ett samband

**Syfte:** Kontrollera att granskningen skiljer osäkerhet från att något
uttryckligen saknas.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** Spara **Lo Exempel → Använder → Molnmusik** med
den fria säkerhetsuppgiften **Känt** utöver de två objekten enligt
förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-07"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; välj sparad betydelse vid en konflikt om ett samband.",
  "outcomes": [
    "Konflikten visar både **Osäkert uppgivet** och **Uttryckligen inget**. Sparande är blockerat före valet.",
    "Valet tömmer det överlappande förslaget. Kartans samband behåller **Uttryckligen inget** och inget nytt sparande krävs."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Samband för Lo Exempel** i Tabell som administratören och
   redigera sambandet. Rätta den fria säkerhetsuppgiften till **Osäkert
   uppgivet** och lägg i utkastet.
2. Öppna samma samband som medlemmen, ange **Uttryckligen inget** i den fria
   säkerhetsegenskapen, behåll
   Molnmusik som mål, lägg det i utkastet och spara separat.
3. Ladda om administratörens sida. Försök spara hela utkastet, läs
   **Inget sparades** och stäng sparmodalen och textvyn. Välj
   **Hämta aktuellt underlag** och öppna konflikten.
4. Välj den sparade sidans värden för varje egenskap som skiljer sig.
   Identiska rader är inaktiva. Välj **Lägg valen i utkastet** och
   stäng med Escape och kontrollera utkastet och det sparade sambandet.

**Förväntat resultat:**

- Konflikten visar både **Osäkert uppgivet** och **Uttryckligen inget**.
  Sparande är blockerat före valet.
- Valet tömmer det överlappande förslaget. Kartans samband behåller
  **Uttryckligen inget** och inget nytt sparande krävs.

### UTKAST-10: Vanliga datum och oberoende status bevaras i konfliktval

**Syfte:** Aktuell granskning kombinerar en vanlig Slutdatum-egenskap med
oberoende uttrycklig status utan automatisk datumtolkning.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Administratören och en medlem delar sparade Lo Exempel
och Molnmusik med ett Använder-samband. Sambandet har ingen Slutdatum-egenskap
och gäller fortfarande.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-10"
  },
  "reference": "Chromium, riktig lokal server och SQLite; konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Aktuell granskning kombinerar en vanlig Slutdatum-egenskap med oberoende uttrycklig status utan automatisk datumtolkning.",
    "Första lösta utkastet består genom omstart och sparas som Upphört med 2031-04-12.",
    "Andra sparandet behåller Gäller fortfarande och den valda datumegenskapen 2031-04-20."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Administratören redigerar sambandet och lägger till Slutdatum (Datum,
   2031-04-12) i sitt utkast utan att spara. Medlemmen ändrar samma sambands
   status till Upphört och sparar hela sitt utkast.
2. Ladda om administratörens sida och granska konflikten. Läs datum och
   upphörd status. Lägg föreslagna värden i utkastet så att det egna datumet
   kombineras med den oberoende sparade statusen.
3. Hos medlemmen är inget datum ännu sparat. Starta om appen med samma databas
   och läs administratörens hela kvarvarande sambandsförslag. Spara det
   separat. Läs sambandet hos medlemmen: Upphört och 2031-04-12.
4. Administratören ändrar samma Slutdatum-egenskap till 2031-04-20 i sitt
   utkast. Medlemmen ändrar samma egenskap till 2031-05-15 och väljer Gäller
   fortfarande, och sparar sitt hela utkast.
5. Ladda om administratören och granska tidigare 2031-04-12, aktuellt
   2031-05-15 samt Gäller fortfarande. Välj det egna datumet och behåll den
   oberoende sparade statusen. Lägg valen i utkastet.
6. Kontrollera att medlemmen ännu ser 2031-05-15. Spara administratörens hela
   utkast och läs resultatet hos medlemmen.

**Förväntat resultat:**

- Aktuell granskning kombinerar en vanlig Slutdatum-egenskap med oberoende
  uttrycklig status utan automatisk datumtolkning.
- Första lösta utkastet består genom omstart och sparas som Upphört med
  2031-04-12.
- Andra sparandet behåller Gäller fortfarande och den valda datumegenskapen
  2031-04-20.

### UTKAST-11: bevara rätt typdefinition vid borttagning efter ett typbyte

**Syfte:** Granska aktuella typer före borttagning och bevara definitionerna
som hör till de borttagna värdena i historikunderlaget.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** Spara **Lo Exempel → Använder → Molnmusik** med
den fria säkerhetsuppgiften **Känt** utöver de två objekten enligt
förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-11.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-11"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; bevara rätt typdefinition vid borttagning efter ett typbyte.",
  "outcomes": [
    "Konflikterna visar de aktuella typerna **Abonnemang** och **Används av**. Hela sparandet är blockerat tills båda valen är gjorda.",
    "Valen ändrar bara utkastet. Efter det nya sparandet är Lo och sambandet borttagna, medan Molnmusik aktuell finns kvar.",
    "Automationen läser historikunderlaget via HTTP. Det tidigare objektet och sambandet har sina aktuella typ-ID:n tillsammans med motsvarande definitioner för **Abonnemang** och **Används av**, samt tomma eftervärden. Läsning i gränssnittet provas i [historikfallen](history.md).",
    "Även en senare namnändring hos ändpunkten kräver aktuell jämförelse. Det gamla valet avvisas utan ändrat utkast. Efter uttrycklig granskning visar hela borttagningsförslaget den aktuella typens betydelse och det aktuella ändpunktsnamnet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Expandera Lo Exempels rad i Tabell som administratören och välj
   **Ta bort**. Låt objektets och sambandets borttagningar ligga i utkastet.
2. Som medlemmen: välj **Redigera Lo Exempel**, byt objekttyp till
   **Abonnemang** och lägg ändringen i utkastet.
3. Öppna **Samband för Lo Exempel** och redigera sambandet. Byt typen
   från **Använder** till **Används av**, behåll ändpunkterna och spara
   hela medlemmens utkast separat.
4. Ladda om administratörens sida och öppna **Granska konflikter**.
   Läs de aktuella typerna. Välj föreslagen borttagning på objektraden
   och **Lägg valen i utkastet**.
5. Välj sambandet i konfliktlistan och läs hela aktuella sambandet.
   Låt jämförelsen stå kvar medan medlemmen ändrar Molnmusiks namn till
   **Molnmusik aktuell** och sparar hela sitt utkast.
6. Välj föreslagen borttagning i den äldre jämförelsen och
   **Lägg valen i utkastet**. Läs avvisningen och välj
   **Visa aktuell jämförelse**. Kontrollera det aktuella ändpunktsnamnet.
7. Välj föreslagen borttagning igen och **Lägg valen i utkastet**.
   Stäng med Escape och läs hela borttagningsförslaget från Utkast.
   Kontrollera aktuell typ och Molnmusik aktuell; stäng läsningen.
8. Kontrollera medlemmens fortfarande oförändrade samband. Spara hela
   administratörens utkast och ladda om hos medlemmen.

**Förväntat resultat:**

- Konflikterna visar de aktuella typerna **Abonnemang** och **Används av**.
  Hela sparandet är blockerat tills båda valen är gjorda.
- Valen ändrar bara utkastet. Efter det nya sparandet är Lo och sambandet
  borttagna, medan Molnmusik aktuell finns kvar.
- Automationen läser historikunderlaget via HTTP. Det tidigare objektet
  och sambandet har sina aktuella typ-ID:n tillsammans med motsvarande
  definitioner för **Abonnemang** och **Används av**, samt tomma eftervärden.
  Läsning i gränssnittet provas i [historikfallen](history.md).
- Även en senare namnändring hos ändpunkten kräver aktuell jämförelse.
  Det gamla valet avvisas utan ändrat utkast. Efter uttrycklig granskning
  visar hela borttagningsförslaget den aktuella typens betydelse och
  det aktuella ändpunktsnamnet.

### UTKAST-08: välj ett befintligt samband och behåll andra förslag

**Syfte:** Kontrollera att samtidiga likadana samband inte skapar dubbletter.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** De två sparade objekten utan samband enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-08"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; välj ett befintligt samband och behåll andra förslag.",
  "outcomes": [
    "Granskningen visar **Ett sparat samband har redan samma typ, riktning och objekt.** och det befintliga sambandet med läsbara objektnamn och riktning.",
    "Valet tar bort dubblettförslaget men behåller **Kim Exempel**.",
    "Efter sparandet finns Kim och exakt ett sådant samband i kartan."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Lägg **Lo Exempel → Använder → Molnmusik** och det nya objektet
   **Kim Exempel** i administratörens utkast.
2. Skapa samma samband som medlemmen och spara det.
3. Ladda om administratörens sida och granska konflikten.
4. Välj **Ta bort sambandet ur ditt utkast**. Stäng med Escape. Öppna därefter
   **Skriv till Skyttel → Visa utkastet** och spara separat.

**Förväntat resultat:**

- Granskningen visar **Ett sparat samband har redan samma typ, riktning
  och objekt.** och det befintliga
  sambandet med läsbara objektnamn och riktning.
- Valet tar bort dubblettförslaget men behåller **Kim Exempel**.
- Efter sparandet finns Kim och exakt ett sådant samband i kartan.

### UTKAST-09: ta bort ett förslag som hänvisar till ett borttaget objekt

**Syfte:** Kontrollera att ett ofullständigt samband kan granskas efter
omstart och tas bort uttryckligen.

**Användare:** Administratören och medlemmen.

**Förutsättningar:** De två sparade objekten utan samband enligt förberedelsen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-09.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-09"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; ta bort ett förslag som hänvisar till ett borttaget objekt.",
  "outcomes": [
    "Konflikten säger **Ett objekt som sambandet pekar på saknas.** Förslaget går att läsa.",
    "Efter omstart visas fortfarande **Lo Exempel → Använder → Molnmusik** med **Osäkert uppgivet**, även om målobjektet saknas i kartan.",
    "Valet tar bort förslaget och visar **Sambandet har tagits bort ur ditt utkast**. Inget samband skapas och det borttagna objektet återkommer inte."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Lägg **Lo Exempel → Använder → Molnmusik** med den fria säkerhetsuppgiften
   **Osäkert uppgivet** i administratörens utkast.
2. Öppna **Molnmusik** som medlemmen, välj **Ta bort** och spara.
3. Ladda om administratörens sida och granska konflikten.
4. Starta om appen med samma databas och öppna administratörens utkast.
5. Öppna **Granska konflikter** och välj **Ta bort sambandet ur ditt utkast**.

**Förväntat resultat:**

- Konflikten säger **Ett objekt som sambandet pekar på saknas.**
  Förslaget går att läsa.
- Efter omstart visas fortfarande **Lo Exempel → Använder → Molnmusik**
  med **Osäkert uppgivet**, även om målobjektet saknas i kartan.
- Valet tar bort förslaget och visar **Sambandet har tagits bort ur ditt
  utkast**. Inget samband
  skapas och det borttagna objektet återkommer inte.

## Status, fokus och samlat sparande

### UTKAST-25: filtrerad teckenförklaring följer kartans färger

**Syfte:** Matcha symboler och linjer med kartan och visa kategorier från
den filtrerade kartan, oberoende av kameran.

**Användare:** Administratören.

**Förutsättningar:** Spara Lo Exempel, Molnmusik och Kim Exempel samt ett
riktat samband från Lo till Molnmusik. Föreslå en ändrad beskrivning för Lo
och vänd sambandets riktning utan att spara. Välj ljust tema.

**Integrationstest:**
[draft-status.spec.ts](../../tests/integration/draft-status.spec.ts),
UTKAST-25.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-status.spec.ts",
    "caseId": "UTKAST-25"
  },
  "reference": "Ljust tema; filtrering styr legenden, inte kameran.",
  "outcomes": [
    "Symboler och linjeprov matchar kartans färger i ljust tema. Text och symbol gör innebörden begriplig även utan färg.",
    "Sökningen styr kategorierna, medan kameran och en vald relation inte skapar en objektmarkering. Inga uppgifter sparas eller byter identitet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Stäng textvyn och visa Karta. Läs grönt plus, gul penna och rött kryss under
   hushållets namn. Jämför färgerna med förslagen i kartan. Läs gammalt
   samband med rött kryss och streckad linje och nytt med grönt plus och
   heldragen linje utan att markera dem eller välja Alla etiketter.
2. Öppna Navigera och panorera. Teckenförklaringens rader ska bestå.
3. Stäng Navigation och välj det nya sambandet. Ingen rad för markerat
   objekt ska tillkomma.
4. Klicka i kartans sökfält, sök Kim Exempel och tryck Escape i sökfältet.
   Förslagsraderna ska försvinna. Raden för punktade etikettkopplingar ska
   finnas kvar.
5. Markera Kim. Kontrollera markeringsraden. Sök sedan Inga träffar via
   kartans sökfält och tryck Escape i sökfältet. Hela teckenförklaringen ska
   försvinna.

**Förväntat resultat:**

- Symboler och linjeprov matchar kartans färger i ljust tema. Text och
  symbol gör innebörden begriplig även utan färg.
- Sökningen styr kategorierna, medan kameran och en vald relation inte
  skapar en objektmarkering. Inga uppgifter sparas eller byter identitet.

### UTKAST-26: sparbesked försvinner medan uppdateringsfel kan återhämtas

**Syfte:** Skilja bekräftat sparande från misslyckad hämtning utan samtal.

**Användare:** Administratören.

**Förutsättningar:** Tomt hushåll utan pågående samtal. Använd nätverkets
blockering i webbläsaren för kartans GET-anrop efter sparandet. Blockera
inte sparadressen; om ordningen inte kan styras, anteckna begränsningen.

**Integrationstest:**
[draft-status.spec.ts](../../tests/integration/draft-status.spec.ts),
UTKAST-26.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-status.spec.ts",
    "caseId": "UTKAST-26"
  },
  "reference": "Bekräftat sparande; kvarstående hämtningsfel utan samtal.",
  "outcomes": [
    "Sparbeskedet och felet gäller olika resultat och kan visas samtidigt. Återhämtning finns utan samtal och kvittot förblir tillgängligt.",
    "Integrationen styr den verkliga spartransaktionen och avbryter bara hämtningen efter kvittot; den kräver ingen verklig leverantör."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Efter att Lo lagts i utkastet, före Spara i UI-steg 1: installera
förutsättningarnas Network request blocking för endast detta hushålls
kartläsningsadress. Hämta den exakta adressen från föregående verkliga
GET i Network. Blockera aldrig sparadressen eller övriga begäranden.
Meddela **Endast kartläsningen efter sparandet är blockerad** och stäng
utvecklarverktygen före Spara. Efter den verkliga sparhandlingen:
bekräfta lyckat sparande med dess kvitto och därefter avbruten kartläsning
som separat leveransunderlag. Meddela **Sparandet är bekräftat och bara
den efterföljande hämtningen har misslyckats**. Om denna ordning inte
kan styras, anteckna begränsningen; ett blockerat sparande ersätter inte
fallet. Behåll felet under tresekundersläsningen. Vid UI-steg 3:
ta bort just kartblockeringen och meddela **Kartläsningen är återställd**
FÖRE Hämta aktuellt underlag. Efter sista historikläsningen återställs
all nätblockering; behåll samma hushåll och kvitto under hela fallet.

**Steg:**

1. Lägg Lo Exempel i utkastet. Be operatören blockera bara nästa kartläsning
   efter sparandet. Invänta installationen och välj Spara hela utkastet från
   **Utkast**. Stäng **Spara utkastet** med Escape och stäng textvyn.
2. Invänta operatörens besked om bekräftat sparande och misslyckad
   efterföljande kartläsning. Läs Utkastet är sparat tillsammans med felet
   att kartan inte kunde hämtas. Vänta tre sekunder. Sparbeskedet försvinner;
   felet består.
3. Be operatören återställa kartläsningen och invänta bekräftelse.
   Välj Hämta aktuellt underlag. Felet ska
   försvinna och det tidigare sparbeskedet ska inte spelas upp igen.
4. Öppna **Rapporter** och läs den enda genomförda ändringsgruppen
   för Lo Exempel i **Ändringshistorik**.
**Förväntat resultat:**

- Sparbeskedet och felet gäller olika resultat och kan visas samtidigt.
  Återhämtning finns utan samtal och kvittot förblir tillgängligt.
- Integrationen styr den verkliga spartransaktionen och avbryter bara
  hämtningen efter kvittot; den kräver ingen verklig leverantör.

### UTKAST-12: behåll legend och förslag tills samma sparförsök bekräftas

**Syfte:** Följa ett privat förslag med stängd textvy och skilja väntan,
okänt resultat och verifierat sparande.

**Användare:** Administratören.

**Förutsättningar:** Nytt tomt hushåll, 1440 × 844 pixlar. Följ
[styrd sparleverans](save-preparation.md#vanligt-sparande) och välj
`new-empty`.

**Integrationstest:**
[draft-status.spec.ts](../../tests/integration/draft-status.spec.ts),
UTKAST-12.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-status.spec.ts",
    "caseId": "UTKAST-12"
  },
  "reference": "1440 × 844; väntande och tappat svar efter genomförandet.",
  "outcomes": [
    "Sparmodalen öppnas direkt och kan stängas med krysset eller Escape. Ett obekräftat försök visas aldrig som säkert lyckat eller säkert misslyckat.",
    "Återkopplingens knappar kan användas utan att verktygen täcker dem.",
    "Samma försök kontrolleras och får ett verifierat kvitto. Objektet finns en gång i kartan. Förslagsraden försvinner efter uppdateringen, men markeringsringen och etikettkopplingarnas rad kan finnas kvar. Utkastet är sparat visas i tre sekunder och återkommer inte vid omladdning. Ändringshistoriken innehåller ett enda genomfört sparande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före sparandet i UI-steg 4: skriv `hold-after` i terminalen och
bekräfta att nästa svar ska hållas. Vänta inte på slutförandet före
användarens verkliga Spara. Efter inskickningen: kräv terminalens
bekräftade status 200 och den verkliga hållningen. Meddela
**Sparandet är genomfört och samma svar hålls**. Behåll hållningen
genom användarens stängning och legendkontroll. Först i steg 5: skriv
`drop` och meddela **Samma genomförda sparkvitto tappas**.
Följ [styrd sparleverans](save-preparation.md#vanligt-sparande).
Behåll samma databas och försök genom kontrollen. Återställ med ett nytt
provhushåll mellan fallen och avsluta med `quit` efter känt utfall.

**Steg:**

1. Lägg objektet **Familjeabonnemanget** i utkastet. Stäng textvyn och visa
   Karta.
2. Kontrollera grönt plus i teckenförklaringen under hushållets namn. Varken
   förslagsantal, gul penna eller rött kryss ska visas för detta förslag.
3. Läs kartans status och teckenförklaring under hushållets namn.
4. Be operatören förbereda hållet sparkvitto och invänta
   installationsbekräftelse. Öppna **Utkast** och välj **Spara hela utkastet**.
   Stäng **Spara utkastet** med Escape och stäng textvyn. Läs **Väntar på
   sparkvitto**, det bevarade förslaget och legenden.
5. Läs **Väntar på sparkvitto** och kvarvarande legend. Invänta operatörens
   bekräftelse att samma sparande är genomfört och dess svar hålls. Be
   operatören tappa svaret och invänta bekräftelse. Läs **Sparutfall okänt**.
   Välj **Hämta samma kvitto igen**. Läs resultatet. Öppna **Rapporter →
   Ändringshistorik** och läs det genomförda sparandet.

**Förväntat resultat:**

- Sparmodalen öppnas direkt och kan stängas med krysset eller Escape.
  Ett obekräftat försök
  visas aldrig som säkert lyckat eller säkert misslyckat.
- Återkopplingens knappar kan användas utan att verktygen täcker dem.
- Samma försök kontrolleras och får ett verifierat kvitto. Objektet finns
  en gång i kartan. Förslagsraden försvinner efter uppdateringen, men
  markeringsringen och etikettkopplingarnas rad kan finnas kvar.
  Utkastet är sparat visas i tre sekunder och återkommer inte vid omladdning.
  Ändringshistoriken innehåller ett enda genomfört sparande.

### UTKAST-13: sparresultat behåller ett nyare valt textfält

**Syfte:** Sparresultat ska inte avbryta skrivande. Kartåterkopplingen
ska uppdateras utan att flytta fokus.

**Användare:** Administratören.

**Förutsättningar:** Följ
[styrd sparleverans](save-preparation.md#vanligt-sparande).
Välj `new-empty` och `hold-after`.

**Integrationstest:**
[draft-status.spec.ts](../../tests/integration/draft-status.spec.ts),
UTKAST-13.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-status.spec.ts",
    "caseId": "UTKAST-13"
  },
  "reference": "Hållet sparbesked; senare valt sökfält behåller fokus.",
  "outcomes": [
    "Sökfältet behåller fokus och innehåller **Lo Exempel** efter sparandet.",
    "Sparbeskedet visas i tre sekunder. Kvittot finns kvar i **Rapporter → Ändringshistorik**. Sökfältet behåller fokus även när återkopplingen uppdateras.",
    "Det automatiserade provet håller ett verkligt lyckat serversvar för att säkerställa ordningen och kontrollerar att utkastet är tomt innan fortsatt skrivande. Ett manuellt prov där svaret hinner fram före fältbytet verifierar inte fokus under väntan."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ fallets `new-empty` och `hold-after` före sparandet. Efter
inskickningen: kräv verklig status 200 och bekräfta hållet svar.
Behåll det tills användaren bytt fält i UI-steg 3. Skriv först då
`release` och meddela **Samma svar är släppt**, utan att ändra
användarens valda fält.
Följ [styrd sparleverans](save-preparation.md#vanligt-sparande).
Behåll samma databas och försök genom kontrollen. Återställ med ett nytt
provhushåll mellan fallen och avsluta med `quit` efter känt utfall.

**Steg:**

1. Lägg **Lo Exempel** i utkastet och välj **Spara hela utkastet**. Invänta
   operatörens bekräftelse av genomfört sparande med hållet svar.
2. Medan svaret väntar, stäng **Spara utkastet** med Escape och stäng textvyn. I
   Tabell, skriv **Lo** i **Sök objekt i tabellen**.
3. Be operatören släppa samma svar efter fältbytet och invänta bekräftelse.
   Invänta sparkvittot och fortsätt skriva ett blanksteg och **Exempel** utan
   att klicka igen.
4. Läs Utkastet är sparat under hushållets namn.
5. Fortsätt skriva i sökfältet utan att klicka på det igen.

**Förväntat resultat:**

- Sökfältet behåller fokus och innehåller **Lo Exempel** efter sparandet.
- Sparbeskedet visas i tre sekunder. Kvittot finns kvar i
  **Rapporter → Ändringshistorik**.
  Sökfältet behåller fokus även när återkopplingen uppdateras.
- Det automatiserade provet håller ett verkligt lyckat serversvar för
  att säkerställa ordningen och kontrollerar att utkastet är tomt innan
  fortsatt skrivande. Ett manuellt prov där svaret hinner fram före
  fältbytet verifierar inte fokus under väntan.

### UTKAST-14: formulär, text och tal delar ett beständigt privat utkast

**Syfte:** Spara hela det gemensamma utkastet atomiskt och läsa den sparade
kartan som en annan medlem efter omstart.

**Användare:** Administratören och den inbjudna medlemmen.

**Förutsättningar:** Följ
[kontrollerat text- och
talunderlag](save-preparation.md#kontrollerat-text--och-talunderlag).
Starta ett nytt tomt provhushåll. Modell och media är syntetiska; riktig
server, privata utkast och gemensamt sparande används.

**Integrationstest:**
[draft-status.spec.ts](../../tests/integration/draft-status.spec.ts),
UTKAST-14.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-status.spec.ts",
    "caseId": "UTKAST-14"
  },
  "reference": "Kontrollerad text och syntetiskt tal, två medlemmar, riktig SQLite.",
  "outcomes": [
    "Samma privata utkast innehåller tre objekt och ett samband från alla tre arbetssätten. Oskickad text räknas först när den läggs i utkastet.",
    "Kvittot beskriver alla fyra ändringarna. Förslagsraderna i teckenförklaringen försvinner. Medlemmen ser alla tre objekten och **Lo Exempel → Använder → Molnmusik** efter omstart, men inga privata förslag från administratören.",
    "Det automatiserade provet håller den riktiga sparbegäran före genomförandet och kontrollerar oförändrat utkast, tom sparad karta och därefter ett enda kvitto för alla ändringar. En samtidig uppdatering från samtalet får inte ändra ett pågående sparande till okänt utfall. Databasen och servern är riktiga; tal och modellresultat ersätts vid de externa tjänsternas gränser. Provet verifierar inte fysisk mikrofon eller verkligt svenskt tal."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ [kontrollerat text- och
talunderlag](save-preparation.md#kontrollerat-text--och-talunderlag).
Efter röststarten i UI-steg 3: använd terminalens `user Lo använder
   Molnmusik.` och `delegate`, och meddela **Taluppdraget är levererat**.
Släpp dess verkliga modellanrop enligt det befintliga receptet.
Före Spara i steg 5: arma `save:before` i konsolen och bekräfta
installationen. Efter den verkliga inskickningen: invänta hållningen
före servern och meddela **Samma sparbegäran hålls**. Stäng konsolen
under fokusprovet. Efter medlemsprofilens läsning i steg 6: släpp
sparandet i konsolen, meddela **Samma sparande är släppt** och behåll
databasen genom omstarten. Avsluta enligt den befintliga förberedelsen.

**Steg:**

1. Lägg **Lo Exempel** i utkastet genom formuläret med **Lägg i utkastet och
   stäng**.
2. Välj **Skriv till Skyttel**, skriv **Lägg Molnmusik i utkastet** och välj
   **Skicka**. Godkänn samtalsmedgivandet när det efterfrågas. Släpp det hållna
   textförslaget enligt separat förberedelse. Kontrollera två privata förslag på
   **Visa utkastet**.
3. Välj **Prata med Skyttel** och be operatören leverera det kontrollerade
   taluppdraget. Invänta bekräftelse. Släpp det hållna förslaget enligt separat
   förberedelse. Kontrollera att sambandet ingår och att **Visa utkastet** visar
   tre privata förslag.
4. Skriv ett oskickat samtalsmeddelande. Besök Inställningar och återgå till
   kartan. Stäng textvyn. Kartan ska inte visa påminnelse om oskickad
   formulärtext. Kontrollera som medlem att den sparade kartan är tom och att
   administratörens förslag inte visas i medlemmens utkast.
5. Öppna Tabell och välj **Nytt objekt**. Skriv **Oskickad cykel** och **Texten
   ska finnas kvar** i beskrivningen. Välj **Avbryt** och tryck Escape i
   förlustdialogen. Kontrollera att namn och beskrivning finns kvar utan nytt
   förslag. Välj **Lägg i utkastet och stäng**. Granska fyra förslag i hela
   utkastet. Be operatören förbereda det väntande sparandet och invänta
   bekräftelse. Välj **Spara hela utkastet** från Utkast, stäng sparmodalen med
   Escape och stäng textvyn.
6. Kontrollera vänteläge, oförändrade fyra förslag och tom gemensam karta i
   medlemsprofilen. Invänta operatörens bekräftelse att samma sparande hålls. Be
   operatören släppa det och invänta bekräftelse samt bekräftat kvitto. Stäng
   klienterna, starta om servern med samma databas och öppna kartan som medlem.

**Förväntat resultat:**

- Samma privata utkast innehåller tre objekt och ett samband från alla
  tre arbetssätten. Oskickad text räknas först när den läggs i utkastet.
- Kvittot beskriver alla fyra ändringarna. Förslagsraderna i teckenförklaringen
  försvinner.
  Medlemmen ser alla tre objekten och **Lo Exempel → Använder → Molnmusik**
  efter omstart, men inga privata förslag från administratören.
- Det automatiserade provet håller den riktiga sparbegäran före
  genomförandet och kontrollerar oförändrat utkast, tom sparad karta och
  därefter ett enda kvitto för alla ändringar. En samtidig uppdatering
  från samtalet får inte ändra ett pågående sparande till okänt utfall.
  Databasen och servern är riktiga; tal och modellresultat ersätts vid
  de externa tjänsternas
  gränser. Provet verifierar inte fysisk mikrofon eller verkligt svenskt tal.

### UTKAST-15: besvara nödvändig fråga före ett nytt sparbesked

**Syfte:** En nödvändig fråga ska hindra utkastets sparande. Ett svar ska
inte i sig spara utkastet.

**Användare:** Administratören.

**Förutsättningar:** Följ
[kontrollerat text- och
talunderlag](save-preparation.md#kontrollerat-text--och-talunderlag).
Starta ett nytt tomt provhushåll. Modell och media är syntetiska; riktig
server, privata utkast och gemensamt sparande används.

**Integrationstest:**
[draft-status.spec.ts](../../tests/integration/draft-status.spec.ts),
UTKAST-15.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-status.spec.ts",
    "caseId": "UTKAST-15"
  },
  "reference": "Kontrollerad nödvändig fråga; svar följt av nytt uttryckligt sparande.",
  "outcomes": [
    "Utkastets sparikon kringgår inte den nödvändiga frågan. Det privata förslaget finns kvar medan frågan besvaras.",
    "Att svara sparar inte utkastet. Först det nya uttryckliga sparbeskedet ger ett kvitto och gör uppgifterna till sparat kartinnehåll.",
    "Integrationstestet styr frågan vid modellgränsen men använder riktig server och SQLite. Det jämför tomma sparförsök före beskedet och ett enda lyckat försök med samma verkliga kvitto i historiken efteråt."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Lägg **Lo Exempel** i utkastet via formuläret. Välj **Skriv till Skyttel**
   och be Skyttel förbereda uppgiften och fråga vilket kort som avses.
   Skicka och godkänn samtalsmedgivandet när det efterfrågas.
2. Släpp modellens nödvändiga fråga enligt separat förberedelse. Läs frågan i
   samtalstexten och stäng textvyn.
3. Öppna **Utkast**. Kontrollera att **Spara hela utkastet** är
   inaktiverad. Kartan har ännu inga sparade objekt.
4. Välj **Skriv till Skyttel**, svara **Kortet Lo Exempel avses** och skicka.
   Följ förberedelsen för att markera frågan som besvarad och släppa
   svarstexten. Stäng textvyn med krysset igen.
5. Öppna **Utkast**. Kontrollera att sparande erbjuds men inte har genomförts.
   Välj **Spara hela utkastet** uttryckligen och läs det verifierade resultatet.

**Separat tekniskt underlag:** Integrationstestet jämför tomma privata
sparförsök före det uttryckliga sparbeskedet och ett enda lyckat försök
med exakt samma verkliga kvitto i historiken efteråt. Dessa API-jämförelser
ingår inte i de vanliga UI-stegen.

**Förväntat resultat:**

- Utkastets sparikon kringgår inte den nödvändiga frågan.
  Det privata förslaget finns kvar medan frågan besvaras.
- Att svara sparar inte utkastet. Först det nya uttryckliga sparbeskedet
  ger ett kvitto och gör uppgifterna till sparat kartinnehåll.
- Integrationstestet styr frågan vid modellgränsen men använder riktig
  server och SQLite. Det jämför tomma sparförsök före beskedet och ett
  enda lyckat försök med samma verkliga kvitto i historiken efteråt.

### UTKAST-17: avbruten formulärförlust och oberoende utkast består vid konflikt

**Syfte:** Hitta en samtidig ändring och behålla ett oberoende förslag
efter avbruten formulärförlust och granskning.

**Användare:** Alex och Robin, två medlemmar i samma hushåll, i skilda
webbläsarsessioner enligt förberedelsen.

**Förutsättningar:** objektet Lo Exempel finns i den sparade kartan. Inget
av klienternas utkast innehåller tidigare förslag.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-17.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-17"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; avbruten formulärförlust och oberoende utkast består vid konflikt.",
  "outcomes": [
    "Fokus hamnar på dialogens synliga rubrik Granska konflikter. Sparat i kartan nu visar Lo Berg och Ditt förslag visar Lo Lind.",
    "Avbruten förlust bevarar formulärtexten utan att lägga ett förslag. Efter uttryckligt tillägg finns Oskickad cykel kvar under granskningen.",
    "Statusnavigeringen varken sparar, ändrar utkastet eller skapar ett kvitto. Den gemensamma kartan innehåller Lo Berg och Alex privata utkast innehåller fortfarande Lo Lind och Oskickad cykel."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Lo Exempels redigering i båda sessionerna. Alex föreslår namnet
   Lo Lind och Robin föreslår Lo Berg. Lägg båda ändringarna i respektive
   privat utkast.
2. Låt Robin spara. Försök därefter spara Alex utkast. Kontrollera att
   försöket avvisas. Stäng **Spara utkastet** och ladda om sidan.
3. Hos Alex: öppna **Nytt objekt**, skriv Oskickad cykel och välj Avbryt.
   Kontrollera förvalt Fortsätt redigera och tryck Escape. Kontrollera
   namnet och att bara Lo Lind finns i utkastet. Lägg därefter cykeln i
   utkastet med **Lägg i utkastet och stäng**.
4. I kartans återkoppling, välj **1 konflikt i ditt utkast**. Läs
   **Granska konflikter**, **Sparat i kartan nu** och **Ditt förslag**.
5. Kontrollera att namnvalet är nåbart utan att välja det. Stäng med
   Escape, öppna Tabell och **Uppgifter för Oskickad cykel**.

**Förväntat resultat:**

- Fokus hamnar på dialogens synliga rubrik Granska konflikter.
  Sparat i kartan nu visar Lo Berg och Ditt förslag visar Lo Lind.
- Avbruten förlust bevarar formulärtexten utan att lägga ett förslag.
  Efter uttryckligt tillägg finns Oskickad cykel kvar under granskningen.
- Statusnavigeringen varken sparar, ändrar utkastet eller skapar ett
  kvitto. Den gemensamma kartan innehåller Lo Berg och Alex privata
  utkast innehåller fortfarande Lo Lind och Oskickad cykel.

### UTKAST-18: Alla konfliktslag visar sina fullständiga underlag

**Syfte:** Alla fyra konfliktslag nås med synligt rubrikfokus även när
kartutsnittet är tomt; navigeringen kräver ingen vågrät rullning.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Alex och Robin delar sparade Lo Exempel och Molnmusik med
ett Använder-samband. Los typ har beskrivningen Sparad ekonomi. Lo har de fria
uppgifterna Sparad skuld (Text, 1 200), ett separat uppgiftsdatum 2026-09-01
och Dold anteckning (Text, Tidigare dold uppgift). Dold anteckning är en
vanlig synlig etikett.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-18"
  },
  "reference": "Chromium 1440 × 900; fyra konfliktslag, hela underlag och tangentbord. Smala varianter har egna fallidentiteter.",
  "outcomes": [
    "Alla fyra konfliktslag nås med synligt rubrikfokus även när kartutsnittet är tomt; navigeringen kräver ingen vågrät rullning.",
    "Tidigare, föreslagna och aktuella fria egenskaper behåller sina egna etiketter, belopp, datum och anteckningar. Typens beskrivningar läses separat från individens egenskaper.",
    "Konfliktval ändrar bara utkastet. Båda avvisade hela sparförsöken lämnar kartan och historiken oförändrade."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex föreslår Lo Lind, byter skuldegenskapens etikett till Min skuld med
   värdet 1 700 och rättar det separata uppgiftsdatumet till 2026-09-03. Ange
   Min dolda uppgift i samma anteckningsegenskap.
2. I samma utkast ändrar Alex objekttypens namn till Min objekttyp och
   typbeskrivningen till Mitt ekonomiska avsnitt. Föreslå också Min
   sambandstyp med riktningen använder enligt mig och ange Osäkert uppgivet i
   sambandets fria Uppgiftens säkerhet.
3. Robin föreslår Lo Berg, Sparad skuld 2 000, separat säkerhetsuppgift
   Osäkert uppgivet, uppgiftsdatum 2026-09-02 och Annans dolda uppgift. Ändra
   typbeskrivningarna och sambandets fria säkerhetsuppgift till Okänt och
   spara hela utkastet.
4. Alex laddar om och söker ett obefintligt namn i kartan. Tryck Escape i
   sökfältet och läs 4 konflikter i ditt utkast trots tomt kartutsnitt. Öppna
   kontrollen med tangentbordet.
5. Välj objekttyp, sambandstyp, samband och objekt i Alla konflikter med
   Enter. Kontrollera fokuserad rubrik och läs hela aktuella och föreslagna
   värden. Välj Sparad skuld och läs 2 000 i resultatet, välj sedan Min skuld
   och läs 1 700.
6. Stäng med Escape och läs hela förslaget Lo Lind genom Utkast. Jämför det
   tidigare 1 200 och 2026-09-01 med föreslagna 1 700 och 2026-09-03 samt båda
   anteckningarna. Läs Min objekttyps förslag med den tidigare och nya
   typbeskrivningen.
7. Försök spara hela utkastet. Läs Inget sparades, stäng och ladda om. Öppna
   konflikterna och välj Min objekttyp. Behåll eget namn och egen beskrivning
   samt oberoende sparade ändringar, och lägg valen i utkastet.
8. Kontrollera rubrikfokus och de tre återstående konflikterna. Försök spara
   igen och kontrollera Inget sparades och bevarat utkast.

**Förväntat resultat:**

- Alla fyra konfliktslag nås med synligt rubrikfokus även när kartutsnittet är
  tomt; navigeringen kräver ingen vågrät rullning.
- Tidigare, föreslagna och aktuella fria egenskaper behåller sina egna
  etiketter, belopp, datum och anteckningar. Typens beskrivningar läses
  separat från individens egenskaper.
- Konfliktval ändrar bara utkastet. Båda avvisade hela sparförsöken lämnar
  kartan och historiken oförändrade.

### UTKAST-19: rätta objektkonflikten och bevara ett oberoende förslag

**Syfte:** Skriva en egen rättelse utan att tappa annan redigering eller
oberoende sparade uppgifter, och kräva ett nytt uttryckligt sparande.

**Användare:** Alex och Robin i skilda sessioner i samma hushåll.

**Förutsättningar:** Lo Exempel finns sparad utan beskrivning. Alex har
namnförslaget Lo Lind i sitt privata utkast. Robin ändrar namnet till
Lo Berg, lägger till beskrivningen Spelar piano och sparar hela utkastet.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-19.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-19"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; rätta objektkonflikten och bevara ett oberoende förslag.",
  "outcomes": [
    "Redigera Lo Lind öppnar det befintliga förslaget med fokus i namnfältet. Avbruten förlust bevarar cykelns text. Det oberoende cykelförslaget finns kvar medan Lo rättas och konflikten löses.",
    "Rättelsen och konfliktvalet ändrar bara Alex utkast. Inget kvitto skapas, och Robin ser fortfarande Lo Berg före det nya sparandet.",
    "Efter konfliktvalet innehåller förslaget både Lo Alm och den oberoende beskrivningen Spelar piano. Ett nytt uttryckligt sparande ger ett kvitto och gör just dessa uppgifter gemensamma."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex öppnar Nytt objekt, skriver Oskickad cykel och beskrivningen Behåll den
   här texten. Välj Avbryt och tryck Escape i förlustdialogen. Kontrollera
   båda värdena och oförändrat utkast, lägg därefter hela formuläret i utkastet.
2. Välj konfliktlänken under hushållets namn och stäng dialogen med
   Escape. Öppna Tabell och välj **Redigera Lo Lind**.
3. Kontrollera rätt objektdialog och fokus i Namn. Ändra namnet till
   Lo Alm och välj **Lägg i utkastet och stäng**.
4. Öppna konfliktknappen, välj Visa aktuell jämförelse om kontrollen visas
   och kontrollera att valet av Lo Alm är nåbart utan att välja det.
   Stäng med Escape, öppna Tabell och Uppgifter för Oskickad cykel.
   Kontrollera den bevarade beskrivningen.
5. Öppna Granska konflikter. Välj det egna namnet Lo Alm och den sparade
   beskrivningen Spelar piano, och välj **Lägg valen i utkastet**. Stäng
   med Escape och kontrollera kartan hos Robin före sparandet.
6. Spara Alex utkast och ladda om Robins karta.

**Förväntat resultat:**

- Redigera Lo Lind öppnar det befintliga förslaget med fokus i namnfältet.
  Avbruten förlust bevarar cykelns text. Det oberoende cykelförslaget finns
  kvar medan Lo rättas och konflikten löses.
- Rättelsen och konfliktvalet ändrar bara Alex utkast. Inget kvitto
  skapas, och Robin ser fortfarande Lo Berg före det nya sparandet.
- Efter konfliktvalet innehåller förslaget både Lo Alm och den oberoende
  beskrivningen Spelar piano. Ett nytt uttryckligt sparande ger ett
  kvitto och gör just dessa uppgifter gemensamma.

### UTKAST-20: rätta ett samband med borttaget mål

**Syfte:** Välja ett nytt giltigt mål i ett konfliktförslag utan att
återuppliva det borttagna objektet eller spara andra förslag i förtid.

**Användare:** Alex och Robin i skilda sessioner i samma hushåll.

**Förutsättningar:** Lo Exempel, Molnmusik och Garaget finns sparade.
Alex föreslår Lo Exempel → Använder → Molnmusik med den fria textegenskapen
**Uppgiftens säkerhet: Osäkert uppgivet**,
och lägger det nya objektet Privat stol i samma privata utkast.
Robin tar bort Molnmusik och sparar.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-20.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-20"
  },
  "reference": "1440 × 900; bevarat sambandsförslag genom konfliktens Rätta ändpunkter.",
  "outcomes": [
    "Försöket med borttaget mål sparar varken sambandet eller Privat stol. Konfliktens Rätta ändpunkter öppnar samma privata förslag med rubrikfokus.",
    "Rättelsen behåller samma samband, riktning och osäkra uppgift. Konflikten försvinner när målet är giltigt. Privat stol finns kvar i utkastet.",
    "Rättelsen skapar inget kvitto och ändrar inget i den gemensamma kartan. Först ett nytt uttryckligt sparande delar sambandet och stolen.",
    "Molnmusik förblir borttaget. Det nya sambandet går från Lo till Garaget."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex försöker spara hela utkastet. Läs **Inget sparades**, stäng
   sparmodalen och textvyn och välj **Hämta aktuellt underlag**.
2. Öppna **1 konflikt i ditt utkast**. Läs borttaget mål och förslaget.
   Jämförelsen är läsbar, men förslaget kan inte väljas som egenskapsvärde.
3. Nå **Rätta ändpunkter** med tangentbord och aktivera med Enter.
   Kontrollera synligt fokus på rubriken **Rätta blockerat samband**.
4. Kontrollera Från objekt, Till objekt, Sambandstyp och den fria egenskapen
   **Uppgiftens säkerhet** med datatyp **Text** och värdet **Osäkert uppgivet**.
   Välj Garaget som Till objekt; Molnmusik ska inte kunna väljas.
5. Nå **Lägg i utkastet** med tangentbord och aktivera med Enter.
   Läs bekräftelsen, välj krysset **Stäng dialogen** och stäng den
   återöppnade konfliktjämförelsen med Escape. Läs hela utkastet:
   det rättade sambandet och Privat stol finns kvar.
6. Kontrollera Robins karta före Alex sparande. Spara därefter hela
   Alex utkast och ladda om Robins karta.

**Förväntat resultat:**

- Försöket med borttaget mål sparar varken sambandet eller Privat stol.
  Konfliktens **Rätta ändpunkter** öppnar samma privata förslag med
  rubrikfokus.
- Rättelsen behåller samma samband, riktning och osäkra uppgift. Konflikten
  försvinner när målet är giltigt. Privat stol finns kvar i utkastet.
- Rättelsen skapar inget kvitto och ändrar inget i den gemensamma kartan.
  Först ett nytt uttryckligt sparande delar sambandet och stolen.
- Molnmusik förblir borttaget. Det nya sambandet går från Lo till Garaget.

### UTKAST-21: rätta typdefinitioner genom inställningarna

**Syfte:** Göra en egen rättelse av objekttyper, bevara
oberoende sparade uppgifter och kräva ett nytt sparbesked.

**Användare:** Alex och Robin i skilda sessioner i samma hushåll.

**Förutsättningar:** Ett hushåll med sparade objekt och typer. Alex föreslår
namnet Min typ för en befintlig typ. Robin ändrar samma typs namn till
Annans typ och beskrivningen till Oberoende typförklaring, och sparar.
Använd objekttyp vid 1440 × 844 pixlar.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-21.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-21"
  },
  "reference": "Objekttyp, 1440 × 844; rättelse i ordinarie inställningar.",
  "outcomes": [
    "Rättelsen öppnar rätt befintligt formulär på den vanliga inställningssidan. Sparade objekt och samband förblir oförändrade genom hela flödet.",
    "Rättelsen och konfliktvalet ändrar bara Alex utkast. Annans typ och den oberoende beskrivningen är fortfarande gemensamma före ett nytt sparande.",
    "Konfliktvalet bevarar Oberoende typförklaring tillsammans med Rättad typ. Ett nytt uttryckligt sparande delar dessa uppgifter och skapar ett kvitto."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex försöker spara hela utkastet. Läs **Inget sparades**, stäng
   sparmodalen och textvyn och välj **Hämta aktuellt underlag**.
2. Öppna **1 konflikt i ditt utkast**. Läs Min typ, Annans typ och
   Oberoende typförklaring. Stäng med Escape.
3. Öppna Inställningar → **Typer**. På mobil, öppna
   **Välj inställning** först. Visa **Objekttyper** och välj
   **Ändra typ: Min typ**. Kontrollera det befintliga formulärets namn.
4. Ändra till Rättad typ och lägg typförslaget i utkastet.
5. Välj Tillbaka till kartan och öppna konflikten igen. Välj det egna
   namnet och den sparade oberoende beskrivningen. Bekräfta **Lägg valen
   i utkastet** och kontrollera Robins karta före sparandet.
6. Stäng med Escape, öppna **Utkast** och välj **Spara hela utkastet**.
   Ladda om Robins karta.

**Förväntat resultat:**

- Rättelsen öppnar rätt befintligt formulär på den vanliga inställningssidan.
  Sparade objekt och samband förblir oförändrade genom hela flödet.
- Rättelsen och konfliktvalet ändrar bara Alex utkast. Annans typ och den
  oberoende beskrivningen är fortfarande gemensamma före ett nytt sparande.
- Konfliktvalet bevarar Oberoende typförklaring tillsammans med Rättad typ.
  Ett nytt uttryckligt sparande delar dessa uppgifter och skapar ett kvitto.

### UTKAST-22: konfliktval behåller användbart fokus utan att spara

**Syfte:** Fortsätta granskningen med tangentbord när valknapparna
ersätts av resultatet utan att kartan sparas automatiskt.

**Användare:** Alex och Robin i skilda sessioner i samma hushåll.

**Förutsättningar:** Lo Exempel är sparat. Alex föreslår Lo Lind och
Robin sparar Lo Berg. Använd 390 × 844 pixlar och välj sparade värden.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-22.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-22"
  },
  "reference": "390 × 844, sparade värden; fokus när valknappar försvinner.",
  "outcomes": [
    "Rubriken Lo Lind behåller synligt fokus efter bekräftelsen. Resultatet visar att valen finns i utkastet eller att förslaget tagits bort.",
    "Escape stänger modalgranskningen och återför fokus till en synlig, användbar kontroll i verktygsfältet när öppningsknappen försvinner.",
    "Sparade värden tar bort namnförslaget. Eget namn behåller Lo Lind. Båda alternativen lämnar Lo Berg sparat och skapar inget kvitto."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **1 konflikt i ditt utkast** och läs **Granska konflikter**.
2. Välj sparade värden för de egenskaper som skiljer sig.
   Fokusera **Lägg valen i utkastet** och tryck Enter. Spara inte kartan.
3. Kontrollera resultatet och fokus på konfliktens rubrik. Tryck Escape.
4. Kontrollera fokus på **Karta** när den ursprungliga konfliktknappen
   försvinner. Jämför eget utkast, Robins karta och historiken.

**Förväntat resultat:**

- Rubriken Lo Lind behåller synligt fokus efter bekräftelsen.
  Resultatet visar att valen finns i utkastet eller att förslaget tagits bort.
- Escape stänger modalgranskningen och återför fokus till en synlig,
  användbar kontroll i verktygsfältet när öppningsknappen försvinner.
- Sparade värden tar bort namnförslaget. Eget namn behåller Lo Lind.
  Båda alternativen lämnar Lo Berg sparat och skapar inget kvitto.

### UTKAST-23: väntande konfliktval skyddar fokus före fortsatt sökning

**Syfte:** Skydda ett pågående konfliktval och sedan fortsätta i tabellen
utan att ett fördröjt resultat avbryter den fortsatta sökningen.

**Användare:** Alex och Robin i skilda sessioner i samma hushåll.

**Förutsättningar:** Samma namnkonflikt som i UTKAST-22. Testmiljön kan
hålla det riktiga svaret efter att servern behandlar konfliktvalet.

**Separat förberedelse:** Använd
[styrd konfliktleverans](current-conflict-preparation.md) efter att
konflikten har skapats. Arma den angivna rutten före UI-handlingen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-23.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-23"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; väntande konfliktval skyddar fokus före fortsatt sökning.",
  "outcomes": [
    "Pågående val stannar i modalgranskningen; Escape lämnar inte ett obekräftat kommando. Rubriken behåller synligt fokus när svaret kommer.",
    "Efter uttrycklig stängning behåller sökfältet texten Lo och fokus.",
    "Lo Lind finns i eget utkast. Lo Berg är fortfarande sparat och ingen historikgrupp eller kvitto tillkommer."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ [fallets exakta
tidsordning](current-conflict-preparation.md#tidsordning-för-tekniskt-underlag).
Före bekräftelsen i UI-steg 1: kör `arm resolve:after` i transportens
terminal och bekräfta installationen. Efter det verkliga konfliktvalet:
kräv lyckat genomförande och hållning innan användarens Escape-prov.
Först i UI-steg 3: kör `release` i samma terminal och meddela
**Samma genomförda konfliktvalssvar är släppt**.
Följ [styrd konfliktleverans](current-conflict-preparation.md) och den
befintliga konfliktinstallationen för fallet. Behåll samma sessioner och
databas under kontrollen. Återställ leveransen efter känt utfall; välj
ny installation mellan fallen och avsluta enligt förberedelsens städning.

**Steg:**

1. Be operatören förbereda hållet konfliktvalssvar och invänta installationen.
   Öppna Tabell och **1 konflikt i ditt utkast**. Välj ditt föreslagna namn och
   övriga aktuella värden. Bekräfta **Lägg valen i utkastet**.
2. När operatören meddelar att svaret hålls, läs väntande besked och inaktiva
   bekräftelse- och stängknappar. Tryck Escape; dialogen ska finnas kvar.
3. Be operatören släppa samma konfliktvalssvar och invänta bekräftelse.
   Kontrollera resultatet och rubrikens fokus.
4. Stäng med Escape och skriv Lo i **Sök objekt i tabellen**. Kontrollera
   söktext och fokus samt utkast, Robins karta och historik.

**Separat tekniskt underlag:** Operatörens kontroll av status och
leverans sker enligt [tidsordningen för tekniskt
underlag](current-conflict-preparation.md#tidsordning-för-tekniskt-underlag).
Automationen jämför separat sparade uppgifter, privat utkast och historik.

**Förväntat resultat:**

- Pågående val stannar i modalgranskningen; Escape lämnar inte ett
  obekräftat kommando. Rubriken behåller synligt fokus när svaret kommer.
- Efter uttrycklig stängning behåller sökfältet texten Lo och fokus.
- Lo Lind finns i eget utkast. Lo Berg är fortfarande sparat och ingen
  historikgrupp eller kvitto tillkommer.

### UTKAST-24: återfinn konfliktval och ett enda nytt sparkvitto

**Syfte:** Skilja ett beständigt privat konfliktval från ett gemensamt
sparande när deras svar försvinner på vägen till webbläsaren.

**Användare:** Alex och Robin i skilda sessioner i samma hushåll.

**Förutsättningar:** Lo Exempel är sparat. Alex föreslår Lo Lind och
det nya objektet Privat stol. Robin sparar Lo Berg med beskrivningen
Spelar piano. Testmiljön kan släppa fram en riktig förfrågan och avbryta
enbart svaret efter serverns behandling.

**Separat förberedelse:** Använd
[styrd konfliktleverans](current-conflict-preparation.md) efter att
konflikten har skapats. Arma den angivna rutten före UI-handlingen.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-24.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-24"
  },
  "reference": "1440 × 844; genomfört konfliktval och sparande med tappade svar.",
  "outcomes": [
    "Konfliktvalet gör inte Lo Lind eller Privat stol gemensamma. Robins karta behåller Lo Berg och saknar Privat stol.",
    "Uppdatering och omladdning återfinner Lo Lind, den oberoende beskrivningen och stolen i samma privata utkast. Ett nytt sparbesked krävs fortfarande.",
    "Det uttryckliga sparandet gör båda förslagen gemensamma tillsammans. Ett tappat sparkvitto spärrar ett nytt sparande tills utfallet kontrolleras.",
    "Återhämtningen visar bekräftat sparande, tomt utkast och en enda ny historikgrupp med Lo Lind, Spelar piano och Privat stol. Inget nytt sparbesked behövs."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ [fallets exakta
tidsordning](current-conflict-preparation.md#tidsordning-för-tekniskt-underlag).
Före bekräftelsen i UI-steg 1: kör `arm resolve:drop-after` och
bekräfta installationen. Efter den verkliga handlingen: kräv status
200 och meddela **Konfliktvalet är genomfört och svaret tappat** innan
den vanliga kontrollen. Efter omladdningen i steg 3 men före Spara
i steg 4: kör `arm save:drop-after` och bekräfta installationen.
Kräv verklig status 200 efter Spara och meddela **Samma sparande är
genomfört och dess kvitto tappat** före användarens kontroll i steg 5.
Följ [styrd konfliktleverans](current-conflict-preparation.md) och den
befintliga konfliktinstallationen för fallet. Behåll samma sessioner och
databas under kontrollen. Återställ leveransen efter känt utfall; välj
ny installation mellan fallen och avsluta enligt förberedelsens städning.

**Steg:**

1. Be operatören förbereda tappat konfliktvalssvar och invänta installationen.
   Öppna **1 konflikt i ditt utkast** från Tabell. Välj det egna namnet och
   sparade oberoende egenskaper, och bekräfta **Lägg valen i utkastet**. Läs det
   oklara utfallet och kontrollera att en ny bekräftelse är spärrad.
2. Kontrollera Robins karta och historiken. Välj **Kontrollera om valet lades i
   utkastet**. Läs resultatet och stäng med Escape.
3. Öppna **Utkast** och hela förslaget Lo Lind. Läs Spelar piano, stäng
   läsningen och ladda om. Kontrollera Lo Lind och Privat stol i utkastet.
4. Be operatören förbereda tappat sparkvitto och invänta installationen. Välj
   **Spara hela utkastet** och läs **Sparandet kunde inte bekräftas** i **Spara
   utkastet**.
5. Välj **Kontrollera sparandet igen**. Kontrollera bekräftelsen, tomt utkast,
   Robins karta och den enda nya historikgruppen.

**Separat tekniskt underlag:** Operatören verifierar genomförandet vid
båda tappade svar enligt
[tidsordningen](current-conflict-preparation.md#tidsordning-för-tekniskt-underlag).
Integrationstestet kräver också oförändrade privata sparförsök och
historikkvitton efter konfliktvalet. Det jämför hela ursprungliga kvittot, samma
beständiga sparförsök och exakt ett sparanrop. Det kräver ett nytt
sparförsök och en historikgrupp utan att upprepa transaktionen.

**Förväntat resultat:**

- Konfliktvalet gör inte Lo Lind eller Privat stol gemensamma. Robins
  karta behåller Lo Berg och saknar Privat stol.
- Uppdatering och omladdning återfinner Lo Lind, den oberoende beskrivningen
  och stolen i samma privata utkast. Ett nytt sparbesked krävs fortfarande.
- Det uttryckliga sparandet gör båda förslagen gemensamma tillsammans.
  Ett tappat sparkvitto spärrar ett nytt sparande tills utfallet kontrolleras.
- Återhämtningen visar bekräftat sparande, tomt utkast och en enda ny
  historikgrupp med Lo Lind, Spelar piano och Privat stol. Inget nytt
  sparbesked behövs.

### UTKAST-16: använd Navigation och utkastets återkoppling tillsammans

**Syfte:** Behålla åtkomst till personlig placering och sparande genom växling
mellan kartan
och textvyn, även när förstoring kräver rullning.

**Användare:** Administratören.

**Förutsättningar:** Lo Exempel är sparad i kartan. Blå cykeln finns som
nytt privat förslag. Börja med stängd textvy och Navigation.

**Integrationstest:**
[draft-status.spec.ts](../../tests/integration/draft-status.spec.ts),
UTKAST-16.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-status.spec.ts",
    "caseId": "UTKAST-16"
  },
  "reference": "1440 × 1000; båda öppningsordningarna och sex riktningar.",
  "outcomes": [
    "Alla personliga flyttriktningar och hela utkastets sparknapp är åtkomliga i båda ordningarna, även när ytorna behöver rullas.",
    "Flyttningarna ändrar bara den personliga vyn. Automationen jämför separat oförändrat gemensamt innehåll och privat förslag utan sparförsök.",
    "Fokus följer den uttryckliga handlingen och går tillbaka till verktygen vid stängning. Navigation, återkoppling och verktygen täcker inte den kontroll som används."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Markera Lo Exempel i kartan. Öppna **Navigera** från verktygen.
   Expandera verktygens namn om det behövs. Teckenförklaringen är synlig
   under hushållets namn.
2. Använd tangentbord och pekare för att flytta Lo i alla sex riktningar
   i Navigation.
   Rulla vid behov till de nedre kontrollerna.
3. Välj **Stäng navigering** och kontrollera fokus på **Navigera**.
   Öppna **Utkast** och fokusera **Spara hela utkastet**. Kontrollera att
   knappen går att nå med pekare utan att spara. Stäng textvyn.
4. Upprepa efter att först ha öppnat Utkast och fokuserat sparknappen,
   därefter stängt textvyn och öppnat Navigera.
5. Behåll 1440 × 1000 pixlar. Smal och kort vy har separata fall.

**Separat tekniskt underlag:** Integrationstestet jämför hela privata
utkastet och gemensamma kartinnehållet före och efter flyttningarna och
kräver tomma sparförsök. Dessa API-jämförelser ingår inte i UI-stegen.

**Förväntat resultat:**

- Alla personliga flyttriktningar och hela utkastets sparknapp är
  åtkomliga i båda ordningarna, även när ytorna behöver rullas.
- Flyttningarna ändrar bara den personliga vyn. Automationen jämför separat
  oförändrat gemensamt innehåll och privat förslag utan sparförsök.
- Fokus följer den uttryckliga handlingen och går tillbaka till verktygen
  vid stängning. Navigation, återkoppling och verktygen täcker inte den kontroll
  som används.

## Bevarade konfliktval och kontrollerat utfall

UTKAST-49–78 använder en tillfällig installation med riktig
SQLite och två
syntetiska användare: administratören Alex och medlemmen Robin. Starta från
repo-roten med `npm run build` och
`npm run test:env -- node --import tsx scripts/manual-conflict-continuity.ts
--chrome`. Öppna adressen
som skrivs ut.
För UTKAST-49–63, 73, 77 och 78 är Alex inloggad i det synliga fönstret;
konsolkommandon
för Robin använder hans separata session. Arkivfallen UTKAST-64–72 och 74–76
visar
i stället medlemmen Robin; administratören Alex använder en separat
session för export, typändring och import. Inga externa AI-anrop eller
medgivanden behövs.

Varje `new-*` skapar en ny tom installation och stänger föregående databas.
Använd kommandot före varje fall; behåll installationen inom fallet. Grundfallet
har Alex privata **Lo Lind**, **Min anteckning**, medan Robin har sparat
**Lo Berg**, **Robins anteckning**. Båda utgår från **Lo Exempel**.
`result` visar aktuellt privat utkast, gemensam karta och historik genom
offentlig
HTTP. `quit` stänger installationen och tar bort testdatabasen.

### UTKAST-49: behåll val mellan konflikter och vid återöppning

**Syfte:** Bevara varje posts val och spärren för inaktuell jämförelse.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-two`. Även tjänstens namn och beskrivning skiljer
sig.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-49.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-49"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; behåll val mellan konflikter och vid återöppning.",
  "outcomes": [
    "Valen för respektive post finns kvar över växling och återöppning.",
    "Lo visar inaktuellt underlag och kräver aktuell jämförelse. Växling till en annan post kan inte häva den spärren; tjänstens opåverkade val består.",
    "Ingen gemensam ändring eller nytt sparande görs av det avvisade försöket."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steg 4, med Lo öppnad: kör `newer-name` och meddela **Robins nyare namn
är sparat** före det gamla bekräftelseförsöket. Följ
[styrd konfliktleverans](current-conflict-preparation.md) och den befintliga
konfliktinstallationen för fallet. Behåll samma sessioner och databas under
kontrollen. Återställ leveransen efter känt utfall; välj ny installation mellan
fallen och avsluta enligt förberedelsens städning.

**Steg:**

1. Öppna **2 konflikter i ditt utkast**. Välj Alex namn och beskrivning för Lo.
2. Välj **Min musiktjänst** i konfliktlistan och välj Alex namn och beskrivning.
3. Stäng med Escape och öppna igen. Tjänstens val är kvar. Växla till Lo.
4. Be operatören spara Robins nyare namn medan Lo visas och invänta bekräftelse.
   Försök **Lägg valen i utkastet** och läs felet.
5. Växla till tjänsten, sedan tillbaka till Lo. Kontrollera båda posternas val.

**Förväntat resultat:**

- Valen för respektive post finns kvar över växling och återöppning.
- Lo visar inaktuellt underlag och kräver aktuell jämförelse. Växling till en
  annan
  post kan inte häva den spärren; tjänstens opåverkade val består.
- Ingen gemensam ändring eller nytt sparande görs av det avvisade försöket.

### UTKAST-50: gör bara om val för ändrade egenskaper

**Syfte:** Bevara oberoende val efter en samtidig ändring.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-base`.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-50.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-50"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; gör bara om val för ändrade egenskaper.",
  "outcomes": [
    "Bara det berörda namnvalet återställs. Beskrivningsvalet behålls.",
    "Det privata utkastet innehåller Lo Lind och Min anteckning mot nytt underlag.",
    "Den gemensamma kartan behåller Lo Ås och Robins anteckning. Inget sparande görs."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steg 2: kör `newer-name` och meddela **Robins nyare namn är
sparat**. Före Visa aktuell jämförelse i steg 3: kör `check-error`
och bekräfta hämtningsfelet. Vid steg 4: kör `network-ok` och meddela
**Normal hämtning är återställd** före den nya aktuella jämförelsen.
Följ [styrd konfliktleverans](current-conflict-preparation.md) och den
befintliga konfliktinstallationen för fallet. Behåll samma sessioner och
databas under kontrollen. Återställ leveransen efter känt utfall; välj
ny installation mellan fallen och avsluta enligt förberedelsens städning.

**Steg:**

1. Öppna konflikten och välj Alex namn och beskrivning.
2. Be operatören spara Robins nyare namn och invänta bekräftelse. Försök lägga
   valen i utkastet; läs att underlaget ändrats.
3. Be operatören förbereda hämtningsfel och invänta bekräftelse. Välj **Visa
   aktuell jämförelse**. Läs hämtningsfelet med fokus kvar i dialogen och båda
   valen bevarade.
4. Be operatören återställa hämtningen och invänta bekräftelse. Visa aktuell
   jämförelse igen. Beskrivningen är fortfarande vald, namnet kräver val.
5. Välj Alex namn igen och lägg valen i utkastet.

**Separat tekniskt underlag:** Operatörens `result` läser karta,
privat utkast och historik via HTTP. Automationen behåller dessa jämförelser
och eventuell versions- eller anropsräkning; de är inga vanliga UI-steg.

**Förväntat resultat:**

- Bara det berörda namnvalet återställs. Beskrivningsvalet behålls.
- Det privata utkastet innehåller Lo Lind och Min anteckning mot nytt underlag.
- Den gemensamma kartan behåller Lo Ås och Robins anteckning. Inget sparande
  görs.

### UTKAST-51: pröva kombinationen igen efter ändrad typ eller referens

**Syfte:** Behålla opåverkade val vid ändrad typ och ompröva en ändrad fri
egenskap utan att bekräfta ett inaktuellt underlag.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-type`.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-51.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-51"
  },
  "reference": "Objekttyp; omprövning mot ändrad typförklaring och fri egenskap.",
  "outcomes": [
    "Ändrad typ kräver aktuell jämförelse. Beskrivningsvalet behålls medan valet för Anteckning återställs när den sparade egenskapens datatyp ändras från text till tal.",
    "Alex text kan väljas tillsammans med både Mätobjekt och Anteckningsobjekt utan att textens datatyp ändras. Efter val av Anteckningsobjekt läggs Alex exakta egenskaper i utkastet. Kartans sparade typ och värden består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steg 2: kör `newer-type`. Robin sparar Mätobjekt och en ny förklaring
för Anteckningsobjekt samt ändrar den fria egenskapen Anteckning till talet
42. Meddela **Robins nyare typ och förklaring är sparade**
före den gamla bekräftelsen. Följ
[styrd konfliktleverans](current-conflict-preparation.md) och den befintliga
konfliktinstallationen för fallet. Behåll samma sessioner och databas under
kontrollen. Återställ leveransen efter känt utfall; välj ny installation mellan
fallen och avsluta enligt förberedelsens städning.

**Steg:**

1. I `new-type`, öppna konflikten. Välj Alex namn, beskrivning och **Min
   text**.
2. Be operatören spara Robins nyare typ och förklaring enligt förberedelsen.
   Invänta bekräftelse. Försök lägga valen i utkastet och visa aktuell
   jämförelse.
3. Beskrivningens val är kvar medan valet för Anteckning har återställts.
   Välj **Min text (Text)** igen och den sparade typen **Mätobjekt**.
   Kontrollera att textens datatyp består i resultatet, inget fel visas
   och bekräftelsen är tillgänglig.
4. Välj Alex **Anteckningsobjekt** och lägg kombinationen i utkastet.
   Kontrollera Alex exakta egenskaper i det privata utkastet.

**Förväntat resultat:**

- Ändrad typ kräver aktuell jämförelse. Beskrivningsvalet behålls medan
  valet för Anteckning återställs när den sparade egenskapens datatyp ändras.
- Alex text kan kombineras med båda typerna utan att textens datatyp ändras.
  Alex valda typ och exakta egenskaper läggs i det privata utkastet.
  Kartans sparade typ och värden består.

### UTKAST-52: behåll val vid känd avvisning och återförsök efter kontroll

**Syfte:** Hantera ett nyare privat utkast utan att kasta val eller andra
förslag.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-base`.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-52.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-52"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; behåll val vid känd avvisning och återförsök efter kontroll.",
  "outcomes": [
    "Ett gammalt versionsförsök avvisas utan ändring; orsaken förklaras och valen består.",
    "Beskedet om nytt underlag har en enda aktiv kanal för annonsering.",
    "Efter aktuell jämförelse kan samma val bekräftas utan att göras om.",
    "Privat stol finns kvar. Bekräftelsen gör en enda privat ändring och skapar ingen historikgrupp."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Efter Alex faktiska namn- och beskrivningsval i UI-steg 1, vid steg 2:
kör `newer-private`; en annan klient för Alex lägger Privat stol i utkastet.
Meddela **Alex nyare oberoende förslag är lagt** före den gamla bekräftelsen.
Följ [styrd konfliktleverans](current-conflict-preparation.md) och
den befintliga konfliktinstallationen för fallet. Behåll samma sessioner och
databas under kontrollen. Återställ leveransen efter känt utfall; välj ny
installation mellan fallen och avsluta enligt förberedelsens städning.

**Steg:**

1. Välj Alex namn och beskrivning i konflikten.
2. Be operatören lägga Alex nyare oberoende förslag och invänta bekräftelse.
3. Försök lägga konfliktvalen i utkastet. Läs avvisningen och kontrollera
   spärren.
4. Visa aktuell jämförelse. Båda valen finns kvar. Bekräfta.

**Separat tekniskt underlag:** Operatörens `result` läser karta,
privat utkast och historik via HTTP. Automationen behåller dessa jämförelser
och eventuell versions- eller anropsräkning; de är inga vanliga UI-steg.

**Förväntat resultat:**

- Ett gammalt versionsförsök avvisas utan ändring; orsaken förklaras och valen
  består.
- Beskedet om nytt underlag har en enda aktiv kanal för annonsering.
- Efter aktuell jämförelse kan samma val bekräftas utan att göras om.
- Privat stol finns kvar. Bekräftelsen gör en enda privat ändring och skapar
  ingen historikgrupp.

### UTKAST-53: kontrollera ett tappat svar efter genomförd ändring

**Syfte:** Återfinna faktiskt utfall utan att skicka samma lösning två gånger.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-base`, sedan `lose-applied`.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-53.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-53"
  },
  "reference": "1280 × 900, Karta, båda föreslagna värden; genomförd privat ändring.",
  "outcomes": [
    "Uppföljningen förblir åtkomlig när sista konflikten försvinner. Ingen öppning eller kontroll upprepar bekräftelsen.",
    "Lo Lind och Min anteckning finns i det privata utkastet efter kontrollen. Resultatet visar bock och Vald lösning, utan gemensamt sparkvitto.",
    "Lo Berg och Robins anteckning förblir sparade. Historiken ändras inte."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Använd Karta vid 1280 × 900 pixlar. Öppna **1 konflikt i ditt utkast**.
   Välj Alex namn Lo Lind och beskrivning Min anteckning. Bekräfta och läs
   det oklara utfallet efter `lose-applied`.
2. Stäng med Escape och öppna igen. Invänta att konfliktknappen försvinner
   när aktuellt utkast hämtas. Stäng igen utan att kontrollera.
3. Välj **Visa konfliktvalet**. Kontrollera rubrikens fokus och spärrad
   **Lägg valen i utkastet**. Välj **Kontrollera om valet lades i utkastet**.
4. Läs **Valen finns i ditt utkast** och bocken. Stäng med Escape och läs
   Lo Lind och Min anteckning i Utkast. Spara inte kartan.

**Separat tekniskt underlag:** `result` jämför privat utkast, sparade
uppgifter och historik. Automationen kontrollerar en enda skickad resolution.

**Separat tekniskt underlag:** Operatörens `result` läser karta,
privat utkast och historik via HTTP. Automationen behåller dessa jämförelser
och eventuell versions- eller anropsräkning; de är inga vanliga UI-steg.

**Förväntat resultat:**

- Uppföljningen förblir åtkomlig när sista konflikten försvinner. Ingen
  öppning eller kontroll upprepar bekräftelsen.
- Lo Lind och Min anteckning finns i det privata utkastet efter kontrollen.
  Resultatet visar bock och Vald lösning, utan gemensamt sparkvitto.
- Lo Berg och Robins anteckning förblir sparade. Historiken ändras inte.

### UTKAST-54: kontrollera en utebliven ändring före nytt försök

**Syfte:** Behålla val även när kontrollen först misslyckas.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-base`, sedan `lose-unsent`. Använd 1280 × 900
pixlar.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-54.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-54"
  },
  "reference": "1280 × 900; ändringen når inte servern och kontrollen misslyckas först.",
  "outcomes": [
    "Misslyckad kontroll och återöppning ger aldrig tillstånd att upprepa åtgärden.",
    "En lyckad faktisk kontroll av utebliven ändring tillåter ett nytt försök.",
    "Valen finns kvar på dator och smal skärm. Ett enda genomfört försök ändrar det privata utkastet; den gemensamma kartan består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före kontrollen i UI-steg 2: kör `check-error` och bekräfta felet.
Vid steg 3: kör `network-ok` och meddela **Kontroll kan nå servern**.
Efter den verkliga kontrollens besked om utebliven ändring, vid steg 4:
kör `network-ok` för normal leverans och meddela **Nytt uttryckligt
försök kan skickas normalt**. Ingen återöppning i sig tillåter återförsök.
Följ [styrd konfliktleverans](current-conflict-preparation.md) och den
befintliga konfliktinstallationen för fallet. Behåll samma sessioner och
databas under kontrollen. Återställ leveransen efter känt utfall; välj
ny installation mellan fallen och avsluta enligt förberedelsens städning.

**Steg:**

1. Öppna **1 konflikt i ditt utkast**. Välj Alex namn och beskrivning, bekräfta
   och läs det oklara utfallet.
2. Stäng och öppna igen. Be operatören förbereda kontrollfelet och invänta
   bekräftelse. Välj **Kontrollera om valet lades i utkastet**.
3. Läs att utfallet fortfarande är oklart. Be operatören återställa kontrollen
   och invänta bekräftelse. Kontrollera igen.
4. Läs att ändringen inte genomfördes. Be operatören återställa normal leverans
   och invänta bekräftelse. Bekräfta med de bevarade valen.

**Separat tekniskt underlag:** Operatörens `result` läser karta,
privat utkast och historik via HTTP. Automationen behåller dessa jämförelser
och eventuell versions- eller anropsräkning; de är inga vanliga UI-steg.

**Förväntat resultat:**

- Misslyckad kontroll och återöppning ger aldrig tillstånd att upprepa åtgärden.
- En lyckad faktisk kontroll av utebliven ändring tillåter ett nytt försök.
- Valen finns kvar på dator och smal skärm. Ett enda genomfört försök ändrar
  det privata utkastet; den gemensamma kartan består.

### UTKAST-55: upptäck nytt underlag vid återöppning

**Syfte:** Förhindra bekräftelse mot uppgifter som ändrats medan dialogen var
stängd.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-base`.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-55.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-55"
  },
  "reference": "Karta; nya sparade uppgifter medan dialogen är stängd.",
  "outcomes": [
    "Aktuellt underlag hämtas innan någon gammal lösning kan bekräftas.",
    "Beskedet om nytt underlag har en enda aktiv kanal för annonsering.",
    "Bara namnvalet behöver göras om. Beskrivningen behålls.",
    "Ingen öppning, stängning eller jämförelse ändrar utkastet eller den gemensamma kartan."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Efter stängningen i UI-steg 1 men före återöppningen i steg 2: kör `newer-name`
och meddela **Robins nyare namn är sparat**. Följ
[styrd konfliktleverans](current-conflict-preparation.md) och den befintliga
konfliktinstallationen för fallet. Behåll samma sessioner och databas under
kontrollen. Återställ leveransen efter känt utfall; välj ny installation mellan
fallen och avsluta enligt förberedelsens städning.

**Steg:**

1. Välj Alex namn och beskrivning. Stäng med Escape.
2. Be operatören spara Robins nyare namn och invänta bekräftelse. Öppna
   konflikten igen och läs beskedet om nytt underlag.
3. Visa aktuell jämförelse och granska kvarvarande val.

**Separat tekniskt underlag:** Operatörens `result` läser karta,
privat utkast och historik via HTTP. Automationen behåller dessa jämförelser
och eventuell versions- eller anropsräkning; de är inga vanliga UI-steg.

**Förväntat resultat:**

- Aktuellt underlag hämtas innan någon gammal lösning kan bekräftas.
- Beskedet om nytt underlag har en enda aktiv kanal för annonsering.
- Bara namnvalet behöver göras om. Beskrivningen behålls.
- Ingen öppning, stängning eller jämförelse ändrar utkastet eller den gemensamma
  kartan.

### UTKAST-56: följ väntan och oklart utfall utan fokusstöld

**Syfte:** Ge ett tillgängligt besked och spärra upprepning över dialogens
livstid.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-base`, `hold` och `lose-applied`.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-56.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-56"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; följ väntan och oklart utfall utan fokusstöld.",
  "outcomes": [
    "Under väntan kan begäran inte upprepas och dialogen kan inte lämnas.",
    "Vid oklart utfall går det att stänga. Ett beständigt tillgängligt statusbesked finns utanför dialogen och flyttar inte fokus från senare arbete.",
    "Bara en av konfliktflödets statusregioner är aktiv för uppläsning åt gången. Återöppning återställer inte bekräftelse; faktisk kontroll visar den genomförda lösningen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Behåll fallets `hold` och `lose-applied` före bekräftelsen. Bekräfta
verklig hållning före servern efter inskickningen. Behåll begäran genom
väntanskontrollerna i UI-steg 2. Först i steg 3: kör `release` och
meddela **Samma begäran släpps och dess verkliga svar tappas**.
Följ [styrd konfliktleverans](current-conflict-preparation.md) och den
befintliga konfliktinstallationen för fallet. Behåll samma sessioner och
databas under kontrollen. Återställ leveransen efter känt utfall; välj
ny installation mellan fallen och avsluta enligt förberedelsens städning.

**Steg:**

1. Välj Alex namn och beskrivning och bekräfta. Läs väntestatusen.
2. Försök växla konflikt, stänga med krysset och använda Escape.
3. Be operatören släppa samma begäran och invänta bekräftelse. Läs det oklara
   utfallet och stäng med Escape.
4. Flytta tangentbordsfokus till Tabell i kartverktygen. Kontrollera att det
   stannar där.
5. Öppna konflikten och kontrollera faktiskt utfall.

**Förväntat resultat:**

- Under väntan kan begäran inte upprepas och dialogen kan inte lämnas.
- Vid oklart utfall går det att stänga. Ett beständigt tillgängligt statusbesked
  finns utanför dialogen och flyttar inte fokus från senare arbete.
- Bara en av konfliktflödets statusregioner är aktiv för uppläsning åt gången.
  Återöppning återställer inte bekräftelse; faktisk kontroll visar den
  genomförda lösningen.

### UTKAST-57: acceptera en redan genomförd objektborttagning

**Syfte:** Kasta bara det egna ändringsförslaget när ett sparat objekt redan
är borttaget, utan att återställa objektet eller göra en ny borttagning.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-removed-object`. Alex föreslår **Lo Lind** och
en ny fri textegenskap **Beskrivning: Mitt förslag** samt ett oberoende nytt
objekt. Egenskapen fanns inte tidigare; den var inte ett uttryckligen tomt
värde. Robin tar bort det sparade
objektet. Kör `result` för att läsa utgångsläget.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-57.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-57"
  },
  "reference": "1280 och 320 × 900 i samma körning; läsbara skillnader och omflöde.",
  "outcomes": [
    "Läsning, öppning och stängning ändrar inget. Förklaringen lyder **Objektet togs bort från den gemensamma kartan medan du redigerade det.** Varningen lyder **Objektet är borttaget. Ditt ändringsförslag kan inte återställa det.**",
    "Namnändringen överlappar borttagningen. Den nya fria textegenskapen visar **Mitt förslag (Text)** som en föreslagen ändring; den fanns inte tidigare. Bekräftelsen kastar endast Lo Linds förslag. Det oberoende förslaget består.",
    "Objektet förblir borttaget och historiken får ingen ny gemensam ändring. Beskedet säger att förslaget tas bort ur utkastet. Namnet och typen står kvar i konfliktlistan med en bock och tillgänglig lösningsstatus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **1 konflikt i ditt utkast**. Läs förklaringen om den genomförda
   borttagningen och varningen att förslaget inte kan återställa objektet.
2. Läs **Borttaget** och **✓ Förvalt** på den sparade sidan och hela ditt
   förslag på den andra. Namnändringen markeras som överlappande med
   borttagningen. Den tillagda fria egenskapen visar **Mitt förslag (Text)**
   som en föreslagen ändring.
   Under **Resultat av valen** anges **Objekt: Borttaget**.
3. Stäng med Escape. Öppna konflikten igen.
4. Välj **Acceptera borttagningen och kasta ditt förslag**. Läs statusen och
   postens kvarvarande namn, typ och lösningsmarkering.

**Separat tekniskt underlag:** Operatörens `result` läser karta,
privat utkast och historik via HTTP. Automationen behåller dessa jämförelser
och eventuell versions- eller anropsräkning; de är inga vanliga UI-steg.

**Förväntat resultat:**

- Läsning, öppning och stängning ändrar inget. Förklaringen lyder
  **Objektet togs bort från den gemensamma kartan medan du redigerade det.**
  Varningen lyder **Objektet är borttaget. Ditt ändringsförslag kan inte
  återställa det.**
- Bekräftelsen kastar endast Lo Linds förslag. Det oberoende förslaget består.
- Objektet förblir borttaget och historiken får ingen ny gemensam ändring.
  Beskedet säger att förslaget tas bort ur utkastet. Namnet och typen står
  kvar i konfliktlistan med en bock och tillgänglig lösningsstatus.

### UTKAST-58: acceptera ett redan borttaget samband

**Syfte:** Kasta sambandsförslaget utan att återställa det sparade sambandet.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-removed-relationship`. Alex lägger till den fria
textegenskapen **Uppgiftens säkerhet: Osäkert uppgivet** för ett sparat
samband från Lo till Molnmusik. Robin tar bort sambandet.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-58.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-58"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; acceptera ett redan borttaget samband.",
  "outcomes": [
    "Förklaringen lyder **Sambandet togs bort från den gemensamma kartan medan du redigerade det.** Varningen lyder **Ett ändringsförslag kan inte återställa ett borttaget samband.**",
    "Öppning och stängning ändrar inget. Bara det bekräftade förslaget kastas; oberoende förslag består. Den fria textegenskapen **Uppgiftens säkerhet** visar **Osäkert uppgivet (Text)**.",
    "Sambandet förblir borttaget, kartan och historiken ändras inte och den lösta postens namn och typ finns kvar med lösningsmarkering."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten och läs förklaringen om det borttagna sambandet.
2. Läs **Borttaget**, **✓ Förvalt** och hela det egna förslaget i läsläge.
   Sambandets rubrik anger ändpunkterna och riktningen. Den fria egenskapen
   **Uppgiftens säkerhet** visar **Osäkert uppgivet (Text)** i förslaget.
   Under **Resultat av valen** anges **Samband: Borttaget**.
3. Stäng med Escape och öppna igen.
4. Välj **Acceptera borttagningen och kasta ditt förslag**.

**Separat tekniskt underlag:** Operatörens `result` läser karta,
privat utkast och historik via HTTP. Automationen behåller dessa jämförelser
och eventuell versions- eller anropsräkning; de är inga vanliga UI-steg.

**Förväntat resultat:**

- Förklaringen lyder **Sambandet togs bort från den gemensamma kartan medan
  du redigerade det.** Varningen lyder **Ett ändringsförslag kan inte
  återställa ett borttaget samband.**
- Öppning och stängning ändrar inget. Bara det bekräftade förslaget kastas;
  oberoende förslag består. Den fria textegenskapen **Uppgiftens säkerhet**
  visar **Osäkert uppgivet (Text)**.
- Sambandet förblir borttaget, kartan och historiken ändras inte och den
  lösta postens namn och typ finns kvar med lösningsmarkering.

### UTKAST-59: kasta bara ett föreslaget dubblettsamband

**Syfte:** Behålla det faktiskt sparade sambandet och dess uppgifter.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-duplicate`. Alex föreslår ett samband med
textegenskapen **Uppgiftens säkerhet: Osäkert uppgivet**;
Robin sparar ett annat samband med samma typ, riktning och objekt.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-59.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-59"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; kasta bara ett föreslaget dubblettsamband.",
  "outcomes": [
    "Förklaringen lyder **Ett sparat samband har redan samma typ, riktning och objekt.** Varningen lyder **Sambandet finns redan. Ta bort det föreslagna sambandet ur ditt utkast.**",
    "Jämförelsen visar sambandet i läsläge. Utfallet **Sambandet i ditt utkast: Tas bort ur ditt utkast** är markerat **✓ Förvalt**. Det redan sparade sambandet och dess uppgifter behålls. Efter bekräftelsen visas **Borttaget ur ditt utkast**.",
    "Öppning och stängning ändrar inget. Bekräftelsen kastar bara dubblettens förslag. Sparade uppgifter, historik och oberoende utkast består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten. Läs det sparade sambandet och det egna förslaget.
2. Läs varningen och det förvalda utfallet under **Resultat av valen**.
3. Stäng och öppna igen.
4. Välj **Ta bort sambandet ur ditt utkast**. Läs status.

**Separat tekniskt underlag:** Operatörens `result` läser karta,
privat utkast och historik via HTTP. Automationen behåller dessa jämförelser
och eventuell versions- eller anropsräkning; de är inga vanliga UI-steg.

**Förväntat resultat:**

- Förklaringen lyder **Ett sparat samband har redan samma typ, riktning
  och objekt.** Varningen lyder **Sambandet finns redan. Ta bort det
  föreslagna sambandet ur ditt utkast.**
- Jämförelsen visar sambandet i läsläge. Utfallet
  **Sambandet i ditt utkast: Tas bort ur ditt utkast** är markerat
  **✓ Förvalt**. Det redan sparade sambandet och dess uppgifter behålls.
  Efter bekräftelsen visas **Borttaget ur ditt utkast**.
- Öppning och stängning ändrar inget. Bekräftelsen kastar bara dubblettens
  förslag. Sparade uppgifter, historik och oberoende utkast består.

### UTKAST-60: kasta ett sambandsförslag med saknat målobjekt

**Syfte:** Ta bort ett oanvändbart förslag utan att påverka andra uppgifter.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-missing-endpoint`. Robin tar bort målobjektet
Molnmusik efter att Alex föreslår ett samband till det med den fria
textegenskapen **Uppgiftens säkerhet: Osäkert uppgivet**.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-60.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-60"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; kasta ett sambandsförslag med saknat målobjekt.",
  "outcomes": [
    "Förklaringen lyder **Ett objekt som sambandet pekar på saknas.** Varningen lyder **Sambandet kan inte läggas till eftersom ett objekt som det pekar på saknas.** Utfallet **Sambandet i ditt utkast: Tas bort ur ditt utkast** är förvalt och hela förslaget går att läsa. Rätta ändpunkter erbjuds som alternativ. Efter kastandet visas **Borttaget ur ditt utkast**.",
    "Stängning ändrar inget. Bekräftelsen kastar bara sambandsförslaget. Den sparade borttagningen, historiken och det oberoende utkastet består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten, läs de berörda uppgifterna och förklaringen.
2. Läs det förvalda utfallet. Stäng med Escape.
3. Öppna igen och välj **Ta bort sambandet ur ditt utkast**.
4. Läs status och konfliktlistans kvarvarande post med typ, namn och
   markeringen **Borttaget ur ditt utkast**.

**Separat tekniskt underlag:** Kör `result` före steg 1, efter stängningen
i steg 2 och efter bekräftelsen i steg 4 enligt
[förberedelsens
tidsordning](current-conflict-preparation.md#tidsordning-för-tekniskt-underlag).
Automationen behåller jämförelser av hela kartan, privata förslag och
historiken; de ingår inte i de vanliga UI-stegen.

**Förväntat resultat:**

- Förklaringen lyder **Ett objekt som sambandet pekar på saknas.**
  Varningen lyder **Sambandet kan inte läggas till eftersom ett objekt
  som det pekar på saknas.**
  Utfallet **Sambandet i ditt utkast: Tas bort ur ditt utkast** är förvalt
  och hela förslaget går att läsa. **Rätta ändpunkter** erbjuds som
  alternativ. Efter kastandet visas **Borttaget ur ditt utkast**.
- Stängning ändrar inget. Bekräftelsen kastar bara sambandsförslaget.
  Den sparade borttagningen, historiken och det oberoende utkastet består.

### UTKAST-61: behåll ett eget borttagningsförslag mot ändrade fakta

**Syfte:** Kräva ett aktivt val innan borttagningen får sparas mot nytt
underlag.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-own-removal`. Alex föreslår att Lo tas bort;
Robin sparar **Lo Berg** och den fria textegenskapen
**Beskrivning: Nya sparade fakta** innan Alex hinner spara.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-61.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-61"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; behåll ett eget borttagningsförslag mot ändrade fakta.",
  "outcomes": [
    "Förklaringen lyder **Du föreslår borttagning. Robin sparade ändringar i objektet innan du hann spara ditt förslag.**",
    "Bekräftelsen behåller en föreslagen borttagning mot de faktiskt nya sparade uppgifterna. Kartan ändras först vid separat sparande.",
    "Det oberoende förslaget består. Det senare atomiska sparandet genomför den uttryckligen valda borttagningen och sparar övriga giltiga förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten och läs Robins aktuella uppgifter samt förklaringen.
2. Kontrollera att **Lägg valen i utkastet** är spärrad utan ett aktivt val.
3. Välj **Föreslagen borttagning** för objektet. Läs **Resultat av valen** och
   lägg valet i utkastet.
4. Stäng dialogen. Öppna **Skriv till Skyttel → Visa utkastet** och spara
   hela utkastet från sparikonen.

**Separat tekniskt underlag:** Operatörens `result` läser karta,
privat utkast och historik via HTTP. Automationen behåller dessa jämförelser
och eventuell versions- eller anropsräkning; de är inga vanliga UI-steg.

**Förväntat resultat:**

- Förklaringen lyder **Du föreslår borttagning. Robin sparade ändringar i
  objektet innan du hann spara ditt förslag.**
- Bekräftelsen behåller en föreslagen borttagning mot de faktiskt nya
  sparade uppgifterna. Kartan ändras först vid separat sparande.
- Det oberoende förslaget består. Det senare atomiska sparandet genomför
  den uttryckligen valda borttagningen och sparar övriga giltiga förslag.

### UTKAST-62: välj objekt och tillkommande samband oberoende

**Syfte:** Behålla objektet och ta bort ett samband eller välja en giltig
borttagning, utan automatiskt ändrade val.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-connections`. Robin sparar ett nytt samband
som berör Lo efter Alex borttagningsförslag.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-62.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-62"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; välj objekt och tillkommande samband oberoende.",
  "outcomes": [
    "Förklaringen lyder **Du föreslår borttagning. Ytterligare ett sparat samband berör nu objektet.**",
    "Felet lyder **Objektet kan inte tas bort medan sambandet till det finns kvar. Välj att ta bort sambandet eller behåll objektet.** Inga val ändras automatiskt och inget läggs i utkastet vid den ogiltiga kombinationen.",
    "Den giltiga kombinationen kastar objektets borttagningsförslag och lägger en uttrycklig sambandsborttagning i utkastet. Kartan ändras först vid sparande.",
    "Efter sparandet består Lo med samma sparade uppgifter; bara sambandet tas bort och det oberoende objektförslaget sparas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten. Välj föreslagen objektborttagning och det sparade
   sambandet.
2. Läs kombinationsfelet och kontrollera att bekräftelsen är spärrad.
3. Välj det sparade objektet och föreslagen borttagning av sambandet.
4. Lägg valen i utkastet. Stäng och öppna
   **Skriv till Skyttel → Visa utkastet**. Spara utkastet separat.

**Separat tekniskt underlag:** Operatörens `result` läser karta,
privat utkast och historik via HTTP. Automationen behåller dessa jämförelser
och eventuell versions- eller anropsräkning; de är inga vanliga UI-steg.

**Förväntat resultat:**

- Förklaringen lyder **Du föreslår borttagning. Ytterligare ett sparat
  samband berör nu objektet.**
- Felet lyder **Objektet kan inte tas bort medan sambandet till det finns
  kvar. Välj att ta bort sambandet eller behåll objektet.** Inga val ändras
  automatiskt och inget läggs i utkastet vid den ogiltiga kombinationen.
- Den giltiga kombinationen kastar objektets borttagningsförslag och lägger
  en uttrycklig sambandsborttagning i utkastet. Kartan ändras först vid
  sparande.
- Efter sparandet består Lo med samma sparade uppgifter; bara sambandet
  tas bort och det oberoende objektförslaget sparas.

### UTKAST-63: kontrollera oklara föreslagna borttagningar

**Syfte:** Verifiera båda faktiskt bevarade borttagningsförslagen utan replay.

**Användare:** Alex och Robin enligt förberedelsen ovan.

**Förutsättningar:** Kör `new-connections`, sedan `lose-applied`. Använd Karta
vid 320 × 900 pixlar.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-63.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-63"
  },
  "reference": "320 × 900, Karta; genomförda borttagningsval med tappat svar.",
  "outcomes": [
    "Kontroll och återöppning skickar aldrig en ny resolution. Båda borttagningsförslagens faktiska underlag och privata utfall kontrolleras.",
    "Den genomförda lösningen visas med bock och båda föreslagna borttagningarna. Beskedet säger att valen finns i utkastet och kartan sparas separat.",
    "Uppföljningen förblir nåbar från Karta och Tabell när sista konflikten försvinner. Sparade objekt, samband och historik är oförändrade."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten, välj borttagning av både objektet och sambandet och
   bekräfta.
2. Läs det oklara utfallet, stäng och öppna igen så att den nya jämförelsen
   hämtas.
3. Stäng. När konfliktknappen försvinner, välj **Visa konfliktvalet**.
4. Kontrollera att vanlig bekräftelse är spärrad. Välj **Kontrollera om valet
   lades i utkastet**.

**Separat tekniskt underlag:** Operatörens `result` läser karta,
privat utkast och historik via HTTP. Automationen behåller dessa jämförelser
och eventuell versions- eller anropsräkning; de är inga vanliga UI-steg.

**Förväntat resultat:**

- Kontroll och återöppning skickar aldrig en ny resolution. Båda
  borttagningsförslagens faktiska underlag och privata utfall kontrolleras.
- Den genomförda lösningen visas med bock och båda föreslagna borttagningarna.
  Beskedet säger att valen finns i utkastet och kartan sparas separat.
- Uppföljningen förblir nåbar från Karta och Tabell när sista konflikten
  försvinner. Sparade objekt, samband och historik är oförändrade.

### UTKAST-64: läs saknad objekttyp och kasta bara objektförslaget

**Syfte:** Typen saknas men de äldre uppgifterna och den vanliga rättelsevägen
är läsbara.

**Användare:** Robin; Alex utför separat teknisk förberedelse.

**Förutsättningar:** Följ [historisk
förberedelse](historical-definition-preparation.md) och välj
`new-missing-object-type`. Börja i en ny installation och behåll samma databas
vid omstart inom fallet.

**Integrationstest:**
[conflict-external-corrections.spec.ts](../../tests/integration/conflict-external-corrections.spec.ts),
UTKAST-64.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-external-corrections.spec.ts",
    "caseId": "UTKAST-64"
  },
  "reference": "1280 × 720; Chromium och styrda testidentiteter; verklig HTTP och SQLite.",
  "outcomes": [
    "Typen saknas men de äldre uppgifterna och den vanliga rättelsevägen är läsbara.",
    "Escape ändrar inget. Bekräftelsen kastar bara det valda privata objektförslaget; oberoende arbete, sparade objekt och historik består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **1 konflikt i ditt utkast**. Läs det saknade typunderlaget,
hänvisningen till Inställningar och förslaget **Solcellsanläggningen**,
**Tidigare privat förslag**, **Installationsår: Våren 2021**.
2. Läs resultatet **Objektet i ditt utkast: Tas bort ur ditt utkast**. Stäng
med Escape och öppna igen; förslaget finns kvar.
3. Välj **Ta bort objektet ur ditt utkast**. Läs bekräftelsen och stäng. Öppna
**Skriv till Skyttel → Visa utkastet**, läs hela **Oberoende förslag** och
kontrollera att Solcellsanläggningen saknar förslagsrad.

**Förväntat resultat:**

- Typen saknas men de äldre uppgifterna och den vanliga rättelsevägen är
läsbara.
- Escape ändrar inget. Bekräftelsen kastar bara det valda privata
objektförslaget; oberoende arbete, sparade objekt och historik består.

### UTKAST-66: Rätta saknad sambandstyp och behåll historiska egenskaper

**Syfte:** En ny definition får en egen identitet; samma typnamn löser inte
den saknade typreferensen automatiskt.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Följ [historisk
förberedelse](historical-definition-preparation.md) och välj
`new-missing-relationship-type` i en ny provinstallation. Robin gör UI-stegen,
Alex gör separat teknisk förberedelse. Behåll databasen vid omstart.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conflict-external-corrections.spec.ts",
    "caseId": "UTKAST-66"
  },
  "reference": "Chromium, riktig lokal server och SQLite; konfiguration enligt förutsättningarna.",
  "outcomes": [
    "En ny definition får en egen identitet; samma typnamn löser inte den saknade typreferensen automatiskt.",
    "Vanlig uttrycklig typrättning bevarar varje historisk individuell egenskap och Våren 2021 genom separat sparande och omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten och läs att den föreslagna sambandstypen saknas. Läs Lo
   Exempel, Molnmusik och Installationsår: Våren 2021 i det bevarade
   förslaget. Stäng med Escape.
2. Öppna Inställningar → Typer → Ny sambandstyp. Ange Förvaras i,
   beskrivningen Ny faktisk definition och benämningarna förvaras i och
   förvarar. Lägg typen i utkastet och återgå till kartan. Läs att konflikten
   fortfarande finns trots samma typnamn.
3. Öppna Tabell → Samband för Lo Exempel → Redigera samband och välj den nya
   typen. Läs samma individuella textegenskap Installationsår med Våren 2021.
   Lägg sambandet i utkastet och stäng.
4. Läs det rättade hela sambandsförslaget och det oberoende förslaget. Spara
   hela utkastet separat. Starta om och läs det sparade sambandet och det
   oberoende objektet.

**Förväntat resultat:**

- En ny definition får en egen identitet; samma typnamn löser inte den saknade
  typreferensen automatiskt.
- Vanlig uttrycklig typrättning bevarar varje historisk individuell egenskap
  och Våren 2021 genom separat sparande och omstart.

### UTKAST-67: återställ en borttagen objekttyp genom privat granskning och sparande

**Syfte:** Varje uppgift börjar på egen rad och är läsbar före val, efter val
och efter bekräftelse, även i det smala fönstret.

**Användare:** Robin; Alex utför separat teknisk förberedelse.

**Förutsättningar:** Följ [historisk
förberedelse](historical-definition-preparation.md) och välj
`new-object-restoration`. Börja i en ny installation och behåll samma databas
vid omstart inom fallet.

**Integrationstest:**
[conflict-definition-restoration.spec.ts](../../tests/integration/conflict-definition-restoration.spec.ts),
UTKAST-67.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-definition-restoration.spec.ts",
    "caseId": "UTKAST-67"
  },
  "reference": "Objekttyp; 1280 och 320 × 900. Samma fullständiga definition läses vid varje fas för att skydda smal läsning och separat sparande.",
  "outcomes": [
    "Varje uppgift börjar på egen rad och är läsbar före val, efter val och efter bekräftelse, även i det smala fönstret.",
    "Escape ändrar inget. Bekräftelsen föreslår återställning enbart i Robins utkast och bevarar oberoende arbete.",
    "Först separat sparande gör definitionen gemensam. Båda medlemmarna kan läsa den efter omstart; borttaget innehåll återställs inte automatiskt."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten. Läs **Borttaget** på den sparade sidan och **Min privata
typbenämning**, **Min tidigare definition** i typförslaget. Utan aktivt val är
bekräftelsen
spärrad. Läs uppgifterna vid 1280 och 320 pixlars fönsterbredd innan du går
vidare.
2. Stäng med Escape och öppna igen. Välj hela den föreslagna
**Typdefinition**. Läs samma uppgifter och resultatet vid båda bredderna före
bekräftelsen.
3. Välj **Lägg valen i utkastet**. Läs hela det bekräftade resultatet vid båda
bredderna och stäng. Läs hela definitionen och **Oberoende förslag** genom
utkastets fullständiga läsning.
4. Spara hela utkastet separat och starta om med samma databas. Som Robin och
Alex, ladda om och läs det oberoende objektet i Tabell och definitionens namn
och
beskrivning i Inställningar.

**Förväntat resultat:**

- Varje uppgift börjar på egen rad och är läsbar före val, efter val och efter
bekräftelse, även i det smala fönstret.
- Escape ändrar inget. Bekräftelsen föreslår återställning enbart i Robins
utkast och bevarar oberoende arbete.
- Först separat sparande gör definitionen gemensam. Båda medlemmarna kan läsa
den efter omstart; borttaget innehåll återställs inte automatiskt.

### UTKAST-68: avvisa inaktuell återställning utan delvis sparande

**Syfte:** Ett gammalt återställningsförslag kan inte spara någon del av
utkastet mot en nyare gemensam definition.

**Användare:** Robin; Alex utför separat teknisk förberedelse.

**Förutsättningar:** Följ [historisk
förberedelse](historical-definition-preparation.md) och välj
`new-restoration-two`. Börja i en ny installation och behåll samma databas vid
omstart inom fallet.

**Integrationstest:**
[conflict-definition-restoration.spec.ts](../../tests/integration/conflict-definition-restoration.spec.ts),
UTKAST-68.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-definition-restoration.spec.ts",
    "caseId": "UTKAST-68"
  },
  "reference": "1280 × 720; Chromium och styrda testidentiteter; verklig HTTP och SQLite.",
  "outcomes": [
    "Ett gammalt återställningsförslag kan inte spara någon del av utkastet mot en nyare gemensam definition.",
    "Det egna fullständiga förslaget och det oberoende arbetet består vid avvisning.",
    "Ny aktuell granskning följd av separat sparande bevarar båda ändringarna efter omstart. Borttagning blockeras medan den beständiga privata definitionen används."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Robins konflikt, välj den föreslagna definitionen och lägg valet i
utkastet. Stäng och läs hela definitionen och det oberoende förslaget. Meddela
förberedaren att första granskningen är klar.
2. Invänta förberedarens nyare gemensamma definition enligt den separata
tidsordningen. Ladda om Robin och läs fortfarande det egna fullständiga
förslaget och det oberoende arbetet.
3. Välj **Spara hela utkastet** och läs **Inget sparades**. Stäng sparbeskedet
och textvyn. Välj **Hämta aktuellt underlag**. Öppna aktuell konflikt och
granska Robins föreslagna namn och beskrivning mot den nya sparade
definitionen. Välj Robins namn och beskrivning efter aktuell granskning. Fria
egenskaper hör till de enskilda objekten och ingår inte i typdefinitionen.
4. Lägg valen i utkastet och spara separat. Starta om. Som Robin och Alex, läs
det sparade oberoende objektet och den slutliga definitionen **Min privata
typbenämning** och **Min tidigare definition**.

**Förväntat resultat:**

- Ett gammalt återställningsförslag kan inte spara någon del av utkastet mot
en nyare gemensam definition.
- Det egna fullständiga förslaget och det oberoende arbetet består vid
avvisning.
- Ny aktuell granskning följd av separat sparande bevarar båda ändringarna
efter omstart. Borttagning blockeras medan den beständiga privata definitionen
används.

### UTKAST-69: ompröva ett ägt återställningsförslag efter import

**Syfte:** Importen behåller ägare och fullständiga privata uppgifter men
godkänner inte återställningen tyst.

**Användare:** Robin; Alex utför separat teknisk förberedelse.

**Förutsättningar:** Följ [historisk
förberedelse](historical-definition-preparation.md) och välj
`new-relationship-restoration`. Börja i en ny installation och behåll samma
databas vid omstart inom fallet.

**Integrationstest:**
[conflict-definition-restoration.spec.ts](../../tests/integration/conflict-definition-restoration.spec.ts),
UTKAST-69.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-definition-restoration.spec.ts",
    "caseId": "UTKAST-69"
  },
  "reference": "1280 × 720; Chromium och styrda testidentiteter; verklig HTTP och SQLite.",
  "outcomes": [
    "Importen behåller ägare och fullständiga privata uppgifter men godkänner inte återställningen tyst.",
    "Ny uttrycklig granskning krävs. Separat sparande och omstart gör rätt definition gemensam utan att kasta oberoende arbete."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten och bekräfta den föreslagna definitionen. Stäng och läs
hela förslaget med namn, beskrivning och båda riktningarna samt det oberoende
förslaget.
2. Invänta förberedarens återimport och tekniska försök till sparande före ny
granskning. Ladda om och läs samma fullständiga privata förslag och oberoende
arbete.
3. Öppna konflikten på nytt. Välj och bekräfta hela den föreslagna
definitionen på aktuellt underlag. Läs åter hela definitionen i utkastet.
4. Spara separat och starta om. Läs den sparade sambandstypens namn,
beskrivning och riktningar samt det oberoende objektet.

**Förväntat resultat:**

- Importen behåller ägare och fullständiga privata uppgifter men godkänner
inte återställningen tyst.
- Ny uttrycklig granskning krävs. Separat sparande och omstart gör rätt
definition gemensam utan att kasta oberoende arbete.

### UTKAST-70: kontrollera tappat återställningssvar i Karta

**Syfte:** Återöppning upprepar inte bekräftelsen och uppföljningen består när
den olösta raden försvinner.

**Användare:** Robin; Alex utför separat teknisk förberedelse.

**Förutsättningar:** Följ [historisk
förberedelse](historical-definition-preparation.md) och välj
`new-object-restoration`. Börja i en ny installation och behåll samma databas
vid omstart inom fallet.

**Integrationstest:**
[conflict-definition-restoration.spec.ts](../../tests/integration/conflict-definition-restoration.spec.ts),
UTKAST-70.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-definition-restoration.spec.ts",
    "caseId": "UTKAST-70"
  },
  "reference": "Karta; 320 × 900; faktiskt genomfört konfliktval med tappat svar och native återgångsfokus.",
  "outcomes": [
    "Återöppning upprepar inte bekräftelsen och uppföljningen består när den olösta raden försvinner.",
    "Explicit hämtning verifierar ett genomfört privat resultat. Typen är fortfarande borttagen gemensamt och historiken är oförändrad.",
    "Återgångsfokus är användbart och hela det privata arbetet består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Använd **Karta** vid 320 × 900. Öppna konflikten och välj den föreslagna
definitionen. Meddela förberedaren att tappa det genomförda svaret, och välj
sedan **Lägg valen i utkastet**. Läs det oklara beskedet och stäng med Escape.
2. Öppna igen för aktuell hämtning. Stäng när konfliktlänken försvunnit och
välj **Visa konfliktvalet**. Ny bekräftelse är spärrad.
3. Välj **Kontrollera om valet lades i utkastet**. Läs att valen finns i
utkastet. Stäng med Escape och kontrollera synligt användbart återgångsfokus.
4. Läs hela definitionen **Min privata typbenämning**, **Min tidigare
definition**, **Installationsår: Text** och det oberoende förslaget genom
utkastets fullständiga läsning. Spara inte i detta fall.

**Förväntat resultat:**

- Återöppning upprepar inte bekräftelsen och uppföljningen består när den
olösta raden försvinner.
- Explicit hämtning verifierar ett genomfört privat resultat. Typen är
fortfarande borttagen gemensamt och historiken är oförändrad.
- Återgångsfokus är användbart och hela det privata arbetet består.

### UTKAST-71: skapa en ny vanlig definition utan historisk återställningsbehörighet

**Syfte:** Kastvalet påverkar bara det gamla privata definitionsförslaget och
lämnar oberoende arbete kvar.

**Användare:** Robin; Alex utför separat teknisk förberedelse.

**Förutsättningar:** Följ [historisk
förberedelse](historical-definition-preparation.md) och välj
`new-object-restoration`. Börja i en ny installation och behåll samma databas
vid omstart inom fallet.

**Integrationstest:**
[conflict-definition-restoration.spec.ts](../../tests/integration/conflict-definition-restoration.spec.ts),
UTKAST-71.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-definition-restoration.spec.ts",
    "caseId": "UTKAST-71"
  },
  "reference": "1280 × 720; Chromium och styrda testidentiteter; verklig HTTP och SQLite.",
  "outcomes": [
    "Kastvalet påverkar bara det gamla privata definitionsförslaget och lämnar oberoende arbete kvar.",
    "Samma namn i ett nytt vanligt formulär återställer inte den borttagna historiska identiteten eller ger gammal behörighet.",
    "Den nya vanliga definitionen och det oberoende objektet finns kvar efter sparande och omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten och välj den sparade sidans **Borttaget** för
Typdefinition. Bekräfta och läs **Typdefinitionen förblir borttagen**. Stäng
och läs det oberoende förslaget; definitionsförslaget saknar förslagsrad.
2. Invänta förberedarens separata försök med förfalskad
återställningsbehörighet. Öppna **Inställningar → Typer → Ny
objekttyp**.
3. Ange **Solcellsanläggning**, **Ny vanlig definition**, med namn och
   beskrivning. Lägg
typförslaget i utkastet, återgå till kartan och läs den fullständiga nya
definitionen.
4. Spara separat och starta om. Läs den nya definitionens namn och beskrivning
i Inställningar samt det oberoende objektet i Tabell.

**Förväntat resultat:**

- Kastvalet påverkar bara det gamla privata definitionsförslaget och lämnar
oberoende arbete kvar.
- Samma namn i ett nytt vanligt formulär återställer inte den borttagna
historiska identiteten eller ger gammal behörighet.
- Den nya vanliga definitionen och det oberoende objektet finns kvar efter
sparande och omstart.

### UTKAST-72: Rätta saknad objekttyp utan egenskapsförlust

**Syfte:** En ny typ med samma namn ändrar inte förslaget förrän användaren
väljer den i det vanliga formuläret.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Följ [historisk
förberedelse](historical-definition-preparation.md) och välj
`new-missing-object-type` i en ny provinstallation. Robin gör UI-stegen, Alex
gör separat teknisk förberedelse. Behåll databasen vid omstart.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conflict-external-corrections.spec.ts",
    "caseId": "UTKAST-72"
  },
  "reference": "Chromium, riktig lokal server och SQLite; konfiguration enligt förutsättningarna.",
  "outcomes": [
    "En ny typ med samma namn ändrar inte förslaget förrän användaren väljer den i det vanliga formuläret.",
    "Typrättning bevarar historiska egenskapsidentiteter, ordning, datatyper och värden genom sparande och omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Inställningar → Typer → Ny objekttyp och ange Solcellsanläggning med
   beskrivningen Ny faktisk definition. Lägg typen i utkastet och återgå till
   kartan. Läs att konflikten fortfarande finns trots samma typnamn.
2. Öppna Tabell → Redigera Solcellsanläggningen och välj den nya typen. Under
   Fria egenskaper, läs Installationsår med Våren 2021 och den tidigare
   beskrivningen. Lägg i utkastet och stäng.
3. Läs hela objektförslaget och det oberoende förslaget. Spara hela utkastet
   separat, starta om och läs objektets nya typ och samma individuella
   egenskaper i tabellen.

**Förväntat resultat:**

- En ny typ med samma namn ändrar inte förslaget förrän användaren väljer den
  i det vanliga formuläret.
- Typrättning bevarar historiska egenskapsidentiteter, ordning, datatyper och
  värden genom sparande och omstart.

### UTKAST-73: behåll ändrade fakta när en ny förbindelse försvinner

**Syfte:** Ompröva bara det borttagna sambandet utan att förlora återstående
konflikt om objektets sparade fakta eller ett redan gjort objektval.

**Användare:** Alex i fönstret; Robin sparar i sin separata session.

**Förutsättningar:** Kör `new-combined-removal`. Alex föreslår borttagning
av Lo. Robin har sparat **Nya sparade fakta** och ett nytt samband för Lo.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-73.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-73"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; behåll ändrade fakta när en ny förbindelse försvinner.",
  "outcomes": [
    "Den ogiltiga kombinationen spärrar bekräftelsen utan utkaständring.",
    "Robins borttagning berör bara det nya sambandet. De sparade fakta och deras faktiska sparare finns kvar i jämförelsen. Borttagningen av sambandet löser inte automatiskt objektets återstående konflikt.",
    "Granskningen lägger objektets val mot det faktiska aktuella underlaget i utkastet. Det oberoende förslaget, sparade objekt och historik består.",
    "Först separat sparande tar bort Lo ur den gemensamma kartan."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steg 3: kör `remove-new-connection` och meddela **Robin har sparat
borttagning av enbart det nya sambandet**. Objektets senare sparade fakta
kvarstår; hämta sedan aktuell jämförelse i gränssnittet. Följ
[styrd konfliktleverans](current-conflict-preparation.md) och den befintliga
konfliktinstallationen för fallet. Behåll samma sessioner och databas under
kontrollen. Återställ leveransen efter känt utfall; välj ny installation mellan
fallen och avsluta enligt förberedelsens städning.

**Steg:**

1. Öppna **1 konflikt i ditt utkast**. Läs det sparade objektets nya fakta och
   taggen **Robin** samt det nya sambandet.
2. Välj objektets **Föreslagen borttagning** och den sparade sidans samband. Läs
   varför kombinationen är ogiltig.
3. Be operatören låta Robin ta bort det nya sambandet och invänta bekräftelse.
   Stäng med Escape, öppna igen och välj **Visa aktuell jämförelse**.
4. Läs att Robin sparade ändringar i objektet. Kontrollera att objektets
   borttagningsval finns kvar men att sambandsraden försvunnit.
5. Välj **Lägg valen i utkastet**.
6. Öppna **Skriv till Skyttel → Visa utkastet** och spara separat.

**Separat tekniskt underlag:** Operatörens `result` läser karta,
privat utkast och historik via HTTP. Automationen behåller dessa jämförelser
och eventuell versions- eller anropsräkning; de är inga vanliga UI-steg.

**Förväntat resultat:**

- Den ogiltiga kombinationen spärrar bekräftelsen utan utkaständring.
- Robins borttagning berör bara det nya sambandet. De sparade fakta och
  deras faktiska sparare finns kvar i jämförelsen. Borttagningen av
  sambandet löser inte automatiskt objektets återstående konflikt.
- Granskningen lägger objektets val mot det faktiska aktuella underlaget
  i utkastet. Det oberoende förslaget, sparade objekt och historik består.
- Först separat sparande tar bort Lo ur den gemensamma kartan.

### UTKAST-75: visa saknad ändpunkt och sambandstyp samtidigt

**Syfte:** En primär orsak döljer inte det andra hindret eller de historiska
uppgifterna.

**Användare:** Robin; Alex utför separat teknisk förberedelse.

**Förutsättningar:** Följ [historisk
förberedelse](historical-definition-preparation.md) och välj
`new-multiple-blockers`. Börja i en ny installation och behåll samma databas
vid omstart inom fallet.

**Integrationstest:**
[conflict-external-corrections.spec.ts](../../tests/integration/conflict-external-corrections.spec.ts),
UTKAST-75.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-external-corrections.spec.ts",
    "caseId": "UTKAST-75"
  },
  "reference": "1280 × 720; Chromium och styrda testidentiteter; verklig HTTP och SQLite.",
  "outcomes": [
    "En primär orsak döljer inte det andra hindret eller de historiska uppgifterna.",
    "Stängning ändrar inget. Bekräftelsen kastar bara det berörda sambandsförslaget och bevarar gemensamma fakta, typer och historik."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten och läs både den saknade ändpunkten och den saknade
sambandstypen samt anvisningen för vanlig typrättning.
2. Läs **Lo Exempel**, **Molnmusik** och **Installationsår: Våren 2021** från
det bevarade förslaget. Tryck Escape och öppna igen.
3. Välj **Ta bort sambandet ur ditt utkast** och läs bekräftelsen. Stäng och
läs hela det kvarvarande **Oberoende förslag** i utkastet; sambandsförslaget
saknar förslagsrad.

**Förväntat resultat:**

- En primär orsak döljer inte det andra hindret eller de historiska
uppgifterna.
- Stängning ändrar inget. Bekräftelsen kastar bara det berörda
sambandsförslaget och bevarar gemensamma fakta, typer och historik.

### UTKAST-76: kasta objekttypsförslag utan faktisk borttagningsrevision

**Syfte:** En saknad faktisk borttagningsrevision ger ingen
återställningsbehörighet.

**Användare:** Robin; Alex utför separat teknisk förberedelse.

**Förutsättningar:** Följ [historisk
förberedelse](historical-definition-preparation.md) och välj
`new-no-removed-object-definition`. Börja i en ny installation och behåll
samma databas vid omstart inom fallet.

**Integrationstest:**
[conflict-definition-restoration.spec.ts](../../tests/integration/conflict-definition-restoration.spec.ts),
UTKAST-76.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-definition-restoration.spec.ts",
    "caseId": "UTKAST-76"
  },
  "reference": "1280 × 720; Chromium och styrda testidentiteter; verklig HTTP och SQLite.",
  "outcomes": [
    "En saknad faktisk borttagningsrevision ger ingen återställningsbehörighet.",
    "Ett uttryckligt kastval är ändå tillgängligt och påverkar bara det egna definitionsförslaget; oberoende arbete och gemensamma fakta består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Invänta förberedarens separata avvisade återställningsprov. Öppna
konflikten och läs hela **Min privata typbenämning**, **Min tidigare
definition**. Läs att
definitionen inte kan återställas med aktuellt underlag; förslagets val är
spärrat.
2. Välj den sparade sidans **Borttaget** för Typdefinition och **Lägg valen i
utkastet**. Läs bekräftelsen och stäng.
3. Läs hela **Oberoende förslag** i utkastet och kontrollera att
definitionsförslaget saknar förslagsrad.

**Förväntat resultat:**

- En saknad faktisk borttagningsrevision ger ingen återställningsbehörighet.
- Ett uttryckligt kastval är ändå tillgängligt och påverkar bara det egna
definitionsförslaget; oberoende arbete och gemensamma fakta består.

### UTKAST-77: kontrollera ett oklart kastval utan upprepad bekräftelse

**Syfte:** Bevara åtkomst och faktiskt utfall för ett fast kastval även
när dess sista konfliktrad försvinner efter att svaret tappats.

**Användare:** Alex i fönstret; Robin har sparat det redan befintliga sambandet.

**Förutsättningar:** Kör `new-duplicate` i ett smalt fönster. Använd Karta vid
320 × 900 pixlar. `lose-applied` skickar bekräftelsen till den riktiga servern
men tappar svaret; `lose-unsent` hindrar leveransen före servern.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-77.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-77"
  },
  "reference": "320 × 900, Karta; genomfört kastval med tappat svar.",
  "outcomes": [
    "Återöppning och kontroll upprepar ingen mutation. Ny bekräftelse är spärrad tills faktiskt utfall har kontrollerats genom den synliga kontrollen.",
    "Genomfört kastval ger **Sambandet har tagits bort ur ditt utkast**; Det berörda förslaget är borttaget ur utkastet.",
    "Det oberoende förslaget, sparade samband, objekt och historik består. Både Karta och Tabell behåller åtkomst även när sista konflikten försvinner.",
    "Stängning ger synligt användbart fokus utan att välja en dold kontroll."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före kastvalet i UI-steg 1: kör `lose-applied` och meddela **Nästa verkliga
kastval får tappat svar efter genomförandet**. Behåll samma utfall genom
stängning och återöppning; endast verklig kontroll klargör det utan ny
bekräftelse. Följ [styrd konfliktleverans](current-conflict-preparation.md) och
den befintliga konfliktinstallationen för fallet. Behåll samma sessioner och
databas under kontrollen. Återställ leveransen efter känt utfall; välj ny
installation mellan fallen och avsluta enligt förberedelsens städning.

**Steg:**

1. Öppna konflikten. Be operatören förbereda tappat kastvalssvar och invänta
   bekräftelse. Välj **Ta bort sambandet ur ditt utkast**. Läs det oklara
   beskedet. Stäng med Escape och öppna igen.
2. När konfliktraden försvinner, stäng och välj **Visa konfliktvalet**.
   Kontrollera att ny bekräftelse fortfarande är spärrad.
3. Välj **Kontrollera om valet lades i utkastet**.
4. Stäng med Escape och kontrollera synligt användbart fokus.

**Separat tekniskt underlag:** Operatörens `result` läser karta,
privat utkast och historik via HTTP. Automationen behåller dessa jämförelser
och eventuell versions- eller anropsräkning; de är inga vanliga UI-steg.

**Förväntat resultat:**

- Återöppning och kontroll upprepar ingen mutation. Ny bekräftelse är
  spärrad tills faktiskt utfall har kontrollerats genom den synliga kontrollen.
- Genomfört kastval ger **Sambandet har tagits bort ur ditt utkast**;
  Det berörda förslaget är borttaget ur utkastet.
- Det oberoende förslaget, sparade samband, objekt och historik består.
  Både Karta och Tabell behåller åtkomst även när sista konflikten försvinner.
- Stängning ger synligt användbart fokus utan att välja en dold kontroll.

### UTKAST-78: gå till nästa verkliga konflikt efter bekräftelsen

**Syfte:** Bevara gjorda egenskapsval och använda samma läsordning och
rubrikfokus från lösningsresultatet som från konfliktlistan.

**Användare:** Alex i fönstret; Robin sparar i sin separata session.

**Förutsättningar:** Kör `new-two`. Lo och musiktjänsten har varsin
verklig konflikt enligt den gemensamma förberedelsen.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-78.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-78"
  },
  "reference": "1280 × 720; Chromium och syntetiska testidentiteter; gå till nästa verkliga konflikt efter bekräftelsen.",
  "outcomes": [
    "Bekräftelsen visar att Lo-valen finns i utkastet mot aktuellt underlag. Den sparar inte den gemensamma kartan.",
    "**Nästa konflikt** använder de faktiskt bevarade posterna i listordning och flyttar fokus till nästa posts rubrik utan att ändra något förslag.",
    "Musiktjänstens gjorda egenskapsval och den lösta Lo-postens resultat består. Gemensamma uppgifter och historik ändras inte av navigeringen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **2 konflikter i ditt utkast**. Välj musiktjänsten och dess
   föreslagna namn **Min musiktjänst** och fria textegenskap
   **Beskrivning: Min tjänst**.
2. Välj Lo i listan och välj dess föreslagna namn och fria textegenskap
   **Beskrivning: Min anteckning**.
   Välj **Lägg valen i utkastet**. Läs resultatet.
3. Välj **Nästa konflikt** från resultatet. Kontrollera fokus på rubriken
   **Min musiktjänst** och att båda tidigare valen fortfarande är markerade.
4. Välj den lösta Lo-posten i listan. Resultatet är kvar. Välj
   **Nästa konflikt** en gång till och kontrollera samma rubrikfokus.

**Separat tekniskt underlag:** Automationen kräver att bara bekräftelsen
ökar utkastets version en gång; nästa konflikt ändrar ingen version.
För separat operatörsjämförelse, kör `result` före steg 2, efter
bekräftelsen i steg 2 samt efter steg 3 och 4 enligt
[förberedelsens
tidsordning](current-conflict-preparation.md#tidsordning-för-tekniskt-underlag).

**Förväntat resultat:**

- Bekräftelsen visar att Lo-valen finns i utkastet mot aktuellt underlag.
  Den sparar inte den gemensamma kartan.
- **Nästa konflikt** använder de faktiskt bevarade posterna i listordning
  och flyttar fokus till nästa posts rubrik utan att ändra något förslag.
- Musiktjänstens gjorda egenskapsval och den lösta Lo-postens resultat
  består. Gemensamma uppgifter och historik ändras inte av navigeringen.

## Separata referenser för granskning, status och sparande

Varje variant har ett eget ID. Ingen automatiserad körning tas bort.
UTKAST-92–105 reserveras för dessa separata scenarier; inga äldre luckor
används.

### UTKAST-92: läs hela utkastet utan AI eller medgivande

**Syfte:** Granska alla förslag och fria egenskaper utan att starta samtal.

**Användare:** Alex Exempel i den separata provinstallationen nedan.

**Förutsättningar:** Kör `npm run build` och sedan
`node --import tsx scripts/manual-draft-review.ts` i en terminal.
Öppna den utskrivna adressen och logga in med den syntetiska
Google-identiteten Alex Exempel. Ingen extern leverantör används.
Skriv `quit` i terminalen efter provningen för att ta bort installationen.

**Integrationstest:**
[draft-review.spec.ts](../../tests/integration/draft-review.spec.ts),
UTKAST-92.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-review.spec.ts",
    "caseId": "UTKAST-92"
  },
  "reference": "390 × 844; smal läsdialog och fokusfälla.",
  "outcomes": [
    "Utkastet öppnas utan samtal eller medgivandedialog trots att AI saknas.",
    "Alla fyra förslagsslag kan läsas fullständigt. Förslagen och den sparade kartan ändras inte av läsning.",
    "Läsdialogen börjar på rubriken. Tab stannar i dialogen; bakomliggande innehåll är inaktivt. Krysset är dess enda synliga stängkontroll. Escape och krysset återför fokus till radens öppningsknapp.",
    "Verklig olöst identitet eller obesvarad fråga har feltext och symbol. Giltiga okända, osäkra och ospecificerade uppgifter får ingen felvarning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Utkast** i verktygsfältet vid 390 × 844 pixlar.
2. Läs tabellens Symbol, Namn, Typ och Vad som ändras.
3. Öppna **Alex blå cykel** med tangentbord. Läs sparade och föreslagna
   värden, hela beskrivningen, Ramnummer och ekonomiska uppgifter.
4. Prova Tab, Skift+Tab, krysset och Escape. Öppna därefter ett samband,
   **Utkastfordon** och **Granskar**. Läs deras individuella fria egenskaper
   och riktning.
5. Kontrollera fel vid **Olöst fordon** och det olösta sambandet. Läs även
   Okänt, Uttryckligen inget, Osäkert uppgivet och Ospecificerat objekt.

**Förväntat resultat:**

- Utkastet öppnas utan samtal eller medgivandedialog trots att AI saknas.
- Alla fyra förslagsslag kan läsas fullständigt.
  Förslagen och den sparade kartan ändras inte av läsning.
- Läsdialogen börjar på rubriken. Tab stannar i dialogen; bakomliggande
  innehåll är inaktivt. Krysset är dess enda synliga stängkontroll.
  Escape och krysset återför fokus till radens öppningsknapp.
- Verklig olöst identitet eller obesvarad fråga har feltext och symbol.
  Giltiga okända, osäkra och ospecificerade uppgifter får ingen felvarning.

### UTKAST-93: Uttrycklig status, profilbilder och fria etiketter är läsbara

**Syfte:** Sparat Upphört och föreslaget Gäller fortfarande visas oberoende av
samma gamla datumegenskap.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Kör områdets `manual-draft-review.ts --meanings` i
separat provinstallation och logga in med syntetisk identitet. Sparad cykel
och samband är uttryckligen Upphört, med en vanlig datumegenskap 2000-01-01.
Förslagen anger Gäller fortfarande och cykeln har en annan verklig profilbild.
Avsluta med `quit`.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/draft-review.spec.ts",
    "caseId": "UTKAST-93"
  },
  "reference": "Chromium 390 × 844; uttrycklig status, två verkliga profilbilder och fria egenskaper.",
  "outcomes": [
    "Sparat Upphört och föreslaget Gäller fortfarande visas oberoende av samma gamla datumegenskap.",
    "Båda profilbilderna och deras ändring går att läsa; fria etiketter och typade tomma värden behåller rätt betydelse.",
    "Läsning ändrar inget underlag och startar inget samtal eller medgivande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast och Blå cykel vid 390 × 844 CSS-pixlar. Läs Gäller och Status
   på båda sidorna samt den fria datumegenskapen Sista giltighetsdag.
2. Jämför de båda profilbilderna och deras ändringsmarkering. Läs samma
   egenskaps tidigare etikett Fordonets berättelse och nya etikett Cykelns
   berättelse. Läs den föreslagna tomma textegenskapen och Avtalat pris som
   tom talegenskap på båda sidorna.
3. Stäng och läs Blå cykel → granskar → Röd cykel. Jämför uttrycklig giltighet
   och status med den vanliga datumegenskapen. Spara inget.

**Förväntat resultat:**

- Sparat Upphört och föreslaget Gäller fortfarande visas oberoende av samma
  gamla datumegenskap.
- Båda profilbilderna och deras ändring går att läsa; fria etiketter och
  typade tomma värden behåller rätt betydelse.
- Läsning ändrar inget underlag och startar inget samtal eller medgivande.

### UTKAST-94: filtrerad teckenförklaring följer kartans färger

**Syfte:** Matcha symboler och linjer med kartan och visa kategorier från
den filtrerade kartan, oberoende av kameran.

**Användare:** Administratören.

**Förutsättningar:** Spara Lo Exempel, Molnmusik och Kim Exempel samt ett
riktat samband från Lo till Molnmusik. Föreslå en ändrad beskrivning för Lo
och vänd sambandets riktning utan att spara. Välj mörkt tema.

**Integrationstest:**
[draft-status.spec.ts](../../tests/integration/draft-status.spec.ts),
UTKAST-94.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-status.spec.ts",
    "caseId": "UTKAST-94"
  },
  "reference": "Mörkt tema; samma synliga kategori måste matcha kartans färg.",
  "outcomes": [
    "Symboler och linjeprov matchar kartans färger i mörkt tema. Text och symbol gör innebörden begriplig även utan färg.",
    "Sökningen styr kategorierna, medan kameran och en vald relation inte skapar en objektmarkering. Inga uppgifter sparas eller byter identitet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Stäng textvyn och visa Karta. Läs grönt plus, gul penna och rött kryss under
   hushållets namn. Jämför färgerna med förslagen i kartan. Läs gammalt
   samband med rött kryss och streckad linje och nytt med grönt plus och
   heldragen linje utan att markera dem eller välja Alla etiketter.
2. Öppna Navigera och panorera. Teckenförklaringens rader ska bestå.
3. Stäng Navigation och välj det nya sambandet. Ingen rad för markerat
   objekt ska tillkomma.
4. Klicka i kartans sökfält, sök Kim Exempel och tryck Escape i sökfältet.
   Förslagsraderna ska försvinna. Raden för punktade etikettkopplingar ska
   finnas kvar.
5. Markera Kim. Kontrollera markeringsraden. Sök sedan Inga träffar via
   kartans sökfält och tryck Escape i sökfältet. Hela teckenförklaringen ska
   försvinna.

**Förväntat resultat:**

- Symboler och linjeprov matchar kartans färger i mörkt tema. Text och
  symbol gör innebörden begriplig även utan färg.
- Sökningen styr kategorierna, medan kameran och en vald relation inte
  skapar en objektmarkering. Inga uppgifter sparas eller byter identitet.

### UTKAST-96: behåll legend och förslag tills samma sparförsök bekräftas

**Syfte:** Följa ett privat förslag med stängd textvy och skilja väntan,
okänt resultat och verifierat sparande.

**Användare:** Administratören.

**Förutsättningar:** Nytt tomt hushåll, 390 × 844 pixlar. Följ
[styrd sparleverans](save-preparation.md#vanligt-sparande) och välj
`new-empty`.

**Integrationstest:**
[draft-status.spec.ts](../../tests/integration/draft-status.spec.ts),
UTKAST-96.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-status.spec.ts",
    "caseId": "UTKAST-96"
  },
  "reference": "390 × 844; uppföljning och legend i smal arbetsyta.",
  "outcomes": [
    "Sparmodalen öppnas direkt och kan stängas med krysset eller Escape. Ett obekräftat försök visas aldrig som säkert lyckat eller säkert misslyckat.",
    "Återkopplingens knappar kan användas utan att verktygen täcker dem.",
    "Samma försök kontrolleras och får ett verifierat kvitto. Objektet finns en gång i kartan. Förslagsraden försvinner efter uppdateringen, men markeringsringen och etikettkopplingarnas rad kan finnas kvar. Utkastet är sparat visas i tre sekunder och återkommer inte vid omladdning. Ändringshistoriken innehåller ett enda genomfört sparande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före sparandet i UI-steg 4: skriv `hold-after` i terminalen och
bekräfta att nästa svar ska hållas. Vänta inte på slutförandet före
användarens verkliga Spara. Efter inskickningen: kräv terminalens
bekräftade status 200 och den verkliga hållningen. Meddela
**Sparandet är genomfört och samma svar hålls**. Behåll hållningen
genom användarens stängning och legendkontroll. Först i steg 5: skriv
`drop` och meddela **Samma genomförda sparkvitto tappas**.
Följ [styrd sparleverans](save-preparation.md#vanligt-sparande).
Behåll samma databas och försök genom kontrollen. Återställ med ett nytt
provhushåll mellan fallen och avsluta med `quit` efter känt utfall.

**Steg:**

1. Lägg objektet **Familjeabonnemanget** i utkastet. Stäng textvyn och visa
   Karta.
2. Kontrollera grönt plus i teckenförklaringen under hushållets namn. Varken
   förslagsantal, gul penna eller rött kryss ska visas för detta förslag.
3. Läs kartans status och teckenförklaring under hushållets namn.
4. Be operatören förbereda hållet sparkvitto och invänta
   installationsbekräftelse. Öppna **Utkast** och välj **Spara hela utkastet**.
   Stäng **Spara utkastet** med Escape och stäng textvyn. Läs **Väntar på
   sparkvitto**, det bevarade förslaget och legenden.
5. Läs **Väntar på sparkvitto** och kvarvarande legend. Invänta operatörens
   bekräftelse att samma sparande är genomfört och dess svar hålls. Be
   operatören tappa svaret och invänta bekräftelse. Läs **Sparutfall okänt**.
   Välj **Hämta samma kvitto igen**. Läs resultatet. Öppna **Rapporter →
   Ändringshistorik** och läs det genomförda sparandet.

**Förväntat resultat:**

- Sparmodalen öppnas direkt och kan stängas med krysset eller Escape.
  Ett obekräftat försök
  visas aldrig som säkert lyckat eller säkert misslyckat.
- Återkopplingens knappar kan användas utan att verktygen täcker dem.
- Samma försök kontrolleras och får ett verifierat kvitto. Objektet finns
  en gång i kartan. Förslagsraden försvinner efter uppdateringen, men
  markeringsringen och etikettkopplingarnas rad kan finnas kvar.
  Utkastet är sparat visas i tre sekunder och återkommer inte vid omladdning.
  Ändringshistoriken innehåller ett enda genomfört sparande.

### UTKAST-97: behåll legend och förslag tills samma sparförsök bekräftas

**Syfte:** Följa ett privat förslag med stängd textvy och skilja väntan,
okänt resultat och verifierat sparande.

**Användare:** Administratören.

**Förutsättningar:** Nytt tomt hushåll, 320 × 844 pixlar. Följ
[styrd sparleverans](save-preparation.md#vanligt-sparande) och välj
`new-empty`.

**Integrationstest:**
[draft-status.spec.ts](../../tests/integration/draft-status.spec.ts),
UTKAST-97.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-status.spec.ts",
    "caseId": "UTKAST-97"
  },
  "reference": "320 × 844; uppföljning vid minsta behållna bredd.",
  "outcomes": [
    "Sparmodalen öppnas direkt och kan stängas med krysset eller Escape. Ett obekräftat försök visas aldrig som säkert lyckat eller säkert misslyckat.",
    "Återkopplingens knappar kan användas utan att verktygen täcker dem.",
    "Samma försök kontrolleras och får ett verifierat kvitto. Objektet finns en gång i kartan. Förslagsraden försvinner efter uppdateringen, men markeringsringen och etikettkopplingarnas rad kan finnas kvar. Utkastet är sparat visas i tre sekunder och återkommer inte vid omladdning. Ändringshistoriken innehåller ett enda genomfört sparande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före sparandet i UI-steg 4: skriv `hold-after` i terminalen och
bekräfta att nästa svar ska hållas. Vänta inte på slutförandet före
användarens verkliga Spara. Efter inskickningen: kräv terminalens
bekräftade status 200 och den verkliga hållningen. Meddela
**Sparandet är genomfört och samma svar hålls**. Behåll hållningen
genom användarens stängning och legendkontroll. Först i steg 5: skriv
`drop` och meddela **Samma genomförda sparkvitto tappas**.
Följ [styrd sparleverans](save-preparation.md#vanligt-sparande).
Behåll samma databas och försök genom kontrollen. Återställ med ett nytt
provhushåll mellan fallen och avsluta med `quit` efter känt utfall.

**Steg:**

1. Lägg objektet **Familjeabonnemanget** i utkastet. Stäng textvyn och visa
   Karta.
2. Kontrollera grönt plus i teckenförklaringen under hushållets namn. Varken
   förslagsantal, gul penna eller rött kryss ska visas för detta förslag.
3. Läs kartans status och teckenförklaring under hushållets namn.
4. Be operatören förbereda hållet sparkvitto och invänta
   installationsbekräftelse. Öppna **Utkast** och välj **Spara hela utkastet**.
   Stäng **Spara utkastet** med Escape och stäng textvyn. Läs **Väntar på
   sparkvitto**, det bevarade förslaget och legenden.
5. Läs **Väntar på sparkvitto** och kvarvarande legend. Invänta operatörens
   bekräftelse att samma sparande är genomfört och dess svar hålls. Be
   operatören tappa svaret och invänta bekräftelse. Läs **Sparutfall okänt**.
   Välj **Hämta samma kvitto igen**. Läs resultatet. Öppna **Rapporter →
   Ändringshistorik** och läs det genomförda sparandet.

**Förväntat resultat:**

- Sparmodalen öppnas direkt och kan stängas med krysset eller Escape.
  Ett obekräftat försök
  visas aldrig som säkert lyckat eller säkert misslyckat.
- Återkopplingens knappar kan användas utan att verktygen täcker dem.
- Samma försök kontrolleras och får ett verifierat kvitto. Objektet finns
  en gång i kartan. Förslagsraden försvinner efter uppdateringen, men
  markeringsringen och etikettkopplingarnas rad kan finnas kvar.
  Utkastet är sparat visas i tre sekunder och återkommer inte vid omladdning.
  Ändringshistoriken innehåller ett enda genomfört sparande.

### UTKAST-98: använd Navigation och utkastets återkoppling tillsammans

**Syfte:** Behålla åtkomst till personlig placering och sparande genom växling
mellan kartan
och textvyn, även när förstoring kräver rullning.

**Användare:** Administratören.

**Förutsättningar:** Lo Exempel är sparad i kartan. Blå cykeln finns som
nytt privat förslag. Börja med stängd textvy och Navigation.

**Integrationstest:**
[draft-status.spec.ts](../../tests/integration/draft-status.spec.ts),
UTKAST-98.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-status.spec.ts",
    "caseId": "UTKAST-98"
  },
  "reference": "640 × 500; navigationens nedre riktningar måste nås med rullning.",
  "outcomes": [
    "Alla personliga flyttriktningar och hela utkastets sparknapp är åtkomliga i båda ordningarna, även när ytorna behöver rullas.",
    "Flyttningarna ändrar bara den personliga vyn. Automationen jämför separat oförändrat gemensamt innehåll och privat förslag utan sparförsök.",
    "Fokus följer den uttryckliga handlingen och går tillbaka till verktygen vid stängning. Navigation, återkoppling och verktygen täcker inte den kontroll som används."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Markera Lo Exempel i kartan. Öppna **Navigera** från verktygen.
   Expandera verktygens namn om det behövs. Teckenförklaringen är synlig
   under hushållets namn.
2. Använd tangentbord och pekare för att flytta Lo i alla sex riktningar
   i Navigation.
   Rulla vid behov till de nedre kontrollerna.
3. Välj **Stäng navigering** och kontrollera fokus på **Navigera**.
   Öppna **Utkast** och fokusera **Spara hela utkastet**. Kontrollera att
   knappen går att nå med pekare utan att spara. Stäng textvyn.
4. Upprepa efter att först ha öppnat Utkast och fokuserat sparknappen,
   därefter stängt textvyn och öppnat Navigera.
5. Behåll 640 × 500 pixlar. Smal och kort vy har separata fall.

**Separat tekniskt underlag:** Integrationstestet jämför hela privata
utkastet och gemensamma kartinnehållet före och efter flyttningarna och
kräver tomma sparförsök. Dessa API-jämförelser ingår inte i UI-stegen.

**Förväntat resultat:**

- Alla personliga flyttriktningar och hela utkastets sparknapp är
  åtkomliga i båda ordningarna, även när ytorna behöver rullas.
- Flyttningarna ändrar bara den personliga vyn. Automationen jämför separat
  oförändrat gemensamt innehåll och privat förslag utan sparförsök.
- Fokus följer den uttryckliga handlingen och går tillbaka till verktygen
  vid stängning. Navigation, återkoppling och verktygen täcker inte den kontroll
  som används.

### UTKAST-99: använd Navigation och utkastets återkoppling tillsammans

**Syfte:** Behålla åtkomst till personlig placering och sparande genom växling
mellan kartan
och textvyn, även när förstoring kräver rullning.

**Användare:** Administratören.

**Förutsättningar:** Lo Exempel är sparad i kartan. Blå cykeln finns som
nytt privat förslag. Börja med stängd textvy och Navigation.

**Integrationstest:**
[draft-status.spec.ts](../../tests/integration/draft-status.spec.ts),
UTKAST-99.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-status.spec.ts",
    "caseId": "UTKAST-99"
  },
  "reference": "320 × 250; mycket kort smal arbetsyta måste behålla båda flödena.",
  "outcomes": [
    "Alla personliga flyttriktningar och hela utkastets sparknapp är åtkomliga i båda ordningarna, även när ytorna behöver rullas.",
    "Flyttningarna ändrar bara den personliga vyn. Automationen jämför separat oförändrat gemensamt innehåll och privat förslag utan sparförsök.",
    "Fokus följer den uttryckliga handlingen och går tillbaka till verktygen vid stängning. Navigation, återkoppling och verktygen täcker inte den kontroll som används."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Markera Lo Exempel i kartan. Öppna **Navigera** från verktygen.
   Expandera verktygens namn om det behövs. Teckenförklaringen är synlig
   under hushållets namn.
2. Använd tangentbord och pekare för att flytta Lo i alla sex riktningar
   i Navigation.
   Rulla vid behov till de nedre kontrollerna.
3. Välj **Stäng navigering** och kontrollera fokus på **Navigera**.
   Öppna **Utkast** och fokusera **Spara hela utkastet**. Kontrollera att
   knappen går att nå med pekare utan att spara. Stäng textvyn.
4. Upprepa efter att först ha öppnat Utkast och fokuserat sparknappen,
   därefter stängt textvyn och öppnat Navigera.
5. Behåll 320 × 250 pixlar. Smal och kort vy har separata fall.

**Separat tekniskt underlag:** Integrationstestet jämför hela privata
utkastet och gemensamma kartinnehållet före och efter flyttningarna och
kräver tomma sparförsök. Dessa API-jämförelser ingår inte i UI-stegen.

**Förväntat resultat:**

- Alla personliga flyttriktningar och hela utkastets sparknapp är
  åtkomliga i båda ordningarna, även när ytorna behöver rullas.
- Flyttningarna ändrar bara den personliga vyn. Automationen jämför separat
  oförändrat gemensamt innehåll och privat förslag utan sparförsök.
- Fokus följer den uttryckliga handlingen och går tillbaka till verktygen
  vid stängning. Navigation, återkoppling och verktygen täcker inte den kontroll
  som används.

### UTKAST-100: stäng ett väntande mobilt sparande och fortsätt annat arbete

**Syfte:** Behålla uppföljning och korrekt fokus mellan karta och tabell.

**Användare:** Alex Exempel i provinstallationen för UTKAST-36.

**Förutsättningar:** Välj `new-draft` och `hold`. Använd 320 × 844 pixlar.

**Integrationstest:**
[draft-save.spec.ts](../../tests/integration/draft-save.spec.ts),
UTKAST-100.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-save.spec.ts",
    "caseId": "UTKAST-100"
  },
  "reference": "320 × 844; modalens omflöde och senare sökfokus.",
  "outcomes": [
    "Tangentbordet cirkulerar mellan modalens tillgängliga kontroller och lämnar inte den öppna modalen. Text och kontroller ryms i smal mobil visning.",
    "Stängning avbryter inte sparandet. Uppföljningen är nåbar i båda vyerna; efter stängning återgår fokus till **Visa sparandet**.",
    "Senare bekräftelse behåller fokus i tabellens sökfält. Toasten tar inte fokus. Automationen kontrollerar separat tomt utkast, exakt ett sparande och en historikpost."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ grundfallets `new-draft` och `hold` före sparandet.
Bekräfta verkligt hållen begäran efter användarens inskickning. Behåll
hållningen genom båda vyernas uppföljning. Vid UI-steg 4, först efter
användarens senare sökfokus: skriv `release` i terminalen och meddela
**Samma sparande är släppt**.
Följ [styrd sparleverans](save-preparation.md#vanligt-sparande).
Behåll samma databas och försök genom kontrollen. Återställ med ett nytt
provhushåll mellan fallen och avsluta med `quit` efter känt utfall.

**Steg:**

1. Öppna utkastet och spara. Invänta operatörens bekräftelse av den verkliga
   hållningen. Prova Tab och Skift+Tab och stäng med Escape.
2. Stäng textvyn. Öppna **Visa sparandet** i kartan och stäng med krysset.
3. Öppna **Tabell**, välj **Visa sparandet** och stäng med Escape.
4. Flytta fokus till **Sök objekt i tabellen** och be operatören släppa samma
   sparande enligt förberedelsen. Invänta bekräftelse utan att byta fokus.
5. Invänta bekräftelsen och fortsätt skriva i sökfältet utan att klicka på det
   igen.

**Separat tekniskt underlag:** Integrationstestet kräver tomt utkast, ett
enda avslutat sparförsök och en historikpost. Operatören kan samla detta
underlag med `result` efter bekräftelsen. Det är ingen vanlig UI-kontroll.

**Förväntat resultat:**

- Tangentbordet cirkulerar mellan modalens tillgängliga kontroller och
  lämnar inte den öppna modalen. Text och kontroller ryms i smal mobil visning.
- Stängning avbryter inte sparandet. Uppföljningen är nåbar i båda vyerna;
  efter stängning återgår fokus till **Visa sparandet**.
- Senare bekräftelse behåller fokus i tabellens sökfält. Toasten tar inte fokus.
  Automationen kontrollerar separat tomt utkast, exakt ett sparande och en
  historikpost.

### UTKAST-95: kontrollera okänt sparande före kvarstående hämtningsfel

**Syfte:** Kvittot bekräftas innan karthämtningen; hämtningsfel ändrar inte
utfallet.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:** Följ
[styrd sparleverans](save-preparation.md#vanligt-sparande).
Välj `new-empty`. Aktivera `lost-response` och `refresh-failure` först
efter att Lo ligger i utkastet, före sparandet.

**Integrationstest:**
[draft-status.spec.ts](../../tests/integration/draft-status.spec.ts),
UTKAST-95.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-status.spec.ts",
    "caseId": "UTKAST-95"
  },
  "reference": "Genomförd transaktion med tappat svar följd av blockerad karthämtning.",
  "outcomes": [
    "Kvittot bekräftas innan karthämtningen; hämtningsfel ändrar inte utfallet.",
    "Hämtningsfelet består efter toasten. Ny hämtning tar bort felet och upprepar inte sparbeskedet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steget som återställer leveransen: välj `network-ok` i
startguidens terminal och meddela **Normal leverans är återställd**
innan användaren väljer aktuell hämtning eller omladdning. Bevara
det redan registrerade eller genomförda försöket; registrera inget nytt.
Följ [styrd sparleverans](save-preparation.md#vanligt-sparande).
Behåll samma databas och försök genom kontrollen. Återställ med ett nytt
provhushåll mellan fallen och avsluta med `quit` efter känt utfall.

**Steg:**

1. Lägg Lo Exempel i utkastet och välj Spara hela utkastet. Stäng sparmodalen
   och textvyn.
2. Läs Sparutfall okänt utan sparbekräftelse. Välj Hämta aktuellt underlag.
3. Läs Utkastet är sparat tillsammans med hämtningsfelet. Vänta tills
   sparbeskedet försvinner.
4. Be operatören återställa normal leverans och invänta bekräftelse. Välj Hämta
   aktuellt underlag. Läs det enda sparandet för Lo i Rapporter →
   Ändringshistorik.

**Förväntat resultat:**

- Kvittot bekräftas innan karthämtningen; hämtningsfel ändrar inte utfallet.
- Hämtningsfelet består efter toasten. Ny hämtning tar bort felet och upprepar
  inte sparbeskedet.

### UTKAST-101: slutför ett befintligt försök efter omladdning

**Syfte:** Samma väntande försök slutförs; den gamla okända uppföljningen och
utkastikonen försvinner.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:** Följ
[styrd sparleverans](save-preparation.md#vanligt-sparande).
Välj `new-draft` och `pending-attempt`.

**Integrationstest:**
[draft-save.spec.ts](../../tests/integration/draft-save.spec.ts),
UTKAST-101.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-save.spec.ts",
    "caseId": "UTKAST-101"
  },
  "reference": "Verkligt förslag och registrerat väntande försök, ingen AI.",
  "outcomes": [
    "Samma väntande försök slutförs; den gamla okända uppföljningen och utkastikonen försvinner.",
    "Ingen AI eller nytt medgivande behövs; ett enda kvitto och tomt utkast finns kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steget som återställer leveransen: välj `network-ok` i
startguidens terminal och meddela **Normal leverans är återställd**
innan användaren väljer aktuell hämtning eller omladdning. Bevara
det redan registrerade eller genomförda försöket; registrera inget nytt.
Följ [styrd sparleverans](save-preparation.md#vanligt-sparande).
Behåll samma databas och försök genom kontrollen. Återställ med ett nytt
provhushåll mellan fallen och avsluta med `quit` efter känt utfall.

**Steg:**

1. Ladda om och läs Visa sparandet.
2. Be operatören återställa normal leverans och invänta bekräftelse. Ladda om
   för att tillåta automatisk kontroll.
3. Invänta bekräftelsen. Läs det tomma utkastet genom Skriv till Skyttel → Visa
   utkastet och det enda sparkvittot i Rapporter.

**Förväntat resultat:**

- Samma väntande försök slutförs; den gamla okända uppföljningen och
  utkastikonen försvinner.
- Ingen AI eller nytt medgivande behövs; ett enda kvitto och tomt utkast finns
  kvar.

### UTKAST-102: avvisa äldre utkastversion utan förlust

**Syfte:** Avvisningen behåller hela det nyare privata utkastet och skapar inget
historikkvitto.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:** Följ
[styrd sparleverans](save-preparation.md#vanligt-sparande).
Välj `new-draft` och öppna samma adress i en andra flik.

**Integrationstest:**
[draft-save.spec.ts](../../tests/integration/draft-save.spec.ts),
UTKAST-102.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-save.spec.ts",
    "caseId": "UTKAST-102"
  },
  "reference": "Två klienter för samma användare; gammalt sparunderlag mot nyare förslag.",
  "outcomes": [
    "Avvisningen behåller hela det nyare privata utkastet och skapar inget historikkvitto.",
    "Ny läsning erbjuder sparande av det aktuella underlaget utan att själv spara."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast i första fliken. Ändra cykelns namn till Alex nya cykelnamn i
   andra fliken och lägg i utkastet.
2. Spara från första flikens gamla granskning. Läs avvisningen och Inget
   sparades av detta försök. Stäng med Escape.
3. Kontrollera spärrat sparande. Stäng textvyn och välj Hämta aktuellt underlag.
4. Öppna Utkast och läs det nya namnet och tillgängligt sparande. Kontrollera
   tom historik.

**Förväntat resultat:**

- Avvisningen behåller hela det nyare privata utkastet och skapar inget
  historikkvitto.
- Ny läsning erbjuder sparande av det aktuella underlaget utan att själv spara.

### UTKAST-103: återför fokus när tabellens uppföljning försvinner

**Syfte:** När den fokuserade uppföljningen försvinner går fokus till tabellens
synliga hushållsrubrik.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:** Följ
[styrd sparleverans](save-preparation.md#vanligt-sparande).
Välj `new-draft` och `hold`.

**Integrationstest:**
[draft-save.spec.ts](../../tests/integration/draft-save.spec.ts),
UTKAST-103.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-save.spec.ts",
    "caseId": "UTKAST-103"
  },
  "reference": "Tabell; uppföljningsknappen äger fokus vid sen bekräftelse.",
  "outcomes": [
    "När den fokuserade uppföljningen försvinner går fokus till tabellens synliga hushållsrubrik.",
    "Sparandet avslutas utan att lämna fokus på en borttagen kontroll."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Behåll grundfallets verkliga väntande sparande genom stängning och
återöppning. Först efter fokus på Visa sparandet i UI-steg 2, vid
steg 3: skriv `release` och meddela **Samma sparande är släppt**.
Följ [styrd sparleverans](save-preparation.md#vanligt-sparande).
Behåll samma databas och försök genom kontrollen. Återställ med ett nytt
provhushåll mellan fallen och avsluta med `quit` efter känt utfall.

**Steg:**

1. Öppna Utkast och spara. Invänta operatörens bekräftelse av den verkliga
   hållningen. Stäng med Escape och stäng textvyn.
2. Öppna Tabell och Visa sparandet. Stäng med Escape och behåll fokus på Visa
   sparandet.
3. Be operatören släppa samma sparande och invänta bekräftelse. Kontrollera
   fokus när knappen försvinner.

**Förväntat resultat:**

- När den fokuserade uppföljningen försvinner går fokus till tabellens synliga
  hushållsrubrik.
- Sparandet avslutas utan att lämna fokus på en borttagen kontroll.

### UTKAST-104: återför synlig utkastkontext efter kontroll från Karta

**Syfte:** Kvittokontrollen öppnar tomt Utkast med fokus på dess synliga rubrik
när modalens uppföljning försvinner.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:** Följ
[styrd sparleverans](save-preparation.md#vanligt-sparande).
Välj `new-draft`, `lost-response` och 1280 pixlars bredd.

**Integrationstest:**
[draft-save.spec.ts](../../tests/integration/draft-save.spec.ts),
UTKAST-104.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-save.spec.ts",
    "caseId": "UTKAST-104"
  },
  "reference": "1280 × 850; kartans uppföljning saknas efter verifierat kvitto.",
  "outcomes": [
    "Kvittokontrollen öppnar tomt Utkast med fokus på dess synliga rubrik när modalens uppföljning försvinner.",
    "Bekräftelsen finns utan samtal eller medgivande. Automationen jämför separat samma enda sparförsök."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast och spara. Läs Sparandet kunde inte bekräftas. Stäng med Escape
   och stäng textvyn.
2. Behåll Karta. Välj Visa sparandet och Kontrollera sparandet igen.
3. Invänta bekräftelsen och kontrollera det synliga tomma utkastet och fokus.

**Separat tekniskt underlag:** Integrationstestet jämför samma enda
sparförsök före och efter kontrollen. Råa identifierare och försöksantal
ingår inte i de vanliga UI-stegen.

**Förväntat resultat:**

- Kvittokontrollen öppnar tomt Utkast med fokus på dess synliga rubrik när
  modalens uppföljning försvinner.
- Bekräftelsen finns utan samtal eller medgivande. Automationen jämför
  separat samma enda sparförsök.

### UTKAST-105: återför synlig utkastkontext efter kontroll från Karta

**Syfte:** Kvittokontrollen öppnar tomt Utkast med fokus på dess synliga rubrik
när modalens uppföljning försvinner.

**Användare:** Alex Exempel i den separata provinstallationen.

**Förutsättningar:** Följ
[styrd sparleverans](save-preparation.md#vanligt-sparande).
Välj `new-draft`, `lost-response` och 390 pixlars bredd.

**Integrationstest:**
[draft-save.spec.ts](../../tests/integration/draft-save.spec.ts),
UTKAST-105.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/draft-save.spec.ts",
    "caseId": "UTKAST-105"
  },
  "reference": "390 × 850; kartans uppföljning saknas efter verifierat kvitto.",
  "outcomes": [
    "Kvittokontrollen öppnar tomt Utkast med fokus på dess synliga rubrik när modalens uppföljning försvinner.",
    "Bekräftelsen finns utan samtal eller medgivande. Automationen jämför separat samma enda sparförsök."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Utkast och spara. Läs Sparandet kunde inte bekräftas. Stäng med Escape
   och stäng textvyn.
2. Behåll Karta. Välj Visa sparandet och Kontrollera sparandet igen.
3. Invänta bekräftelsen och kontrollera det synliga tomma utkastet och fokus.

**Separat tekniskt underlag:** Integrationstestet jämför samma enda
sparförsök före och efter kontrollen. Råa identifierare och försöksantal
ingår inte i de vanliga UI-stegen.

**Förväntat resultat:**

- Kvittokontrollen öppnar tomt Utkast med fokus på dess synliga rubrik när
  modalens uppföljning försvinner.
- Bekräftelsen finns utan samtal eller medgivande. Automationen jämför
  separat samma enda sparförsök.

## Separata referenser för aktuella konflikter

UTKAST-106–137 har egna stabila identiteter. Bredd, vy, vald sida och
genomförd eller utebliven leverans skiljs åt. Varje grundprocedur körs
en gång med observationerna under dess angivna steg. UTKAST-136 kräver
faktisk skärmläsarobservation; övriga fall har en vanlig motsvarighet.

UTKAST-57 behåller kontrast, varningssymbol, läsbara skillnader och omflöde.
Dess exakta box-shadow-sträng och bakgrundspixelvärde kontrolleras inte.
Ett fel som bara ändrar dessa dekorativa värden kan därför undgå testet.

### UTKAST-106: egen referens för UTKAST-28

**Syfte:** 390 × 900; Tabell och Karta med nytt underlag; smalt omflöde
och tangentbordsfokus vid blandade val.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-28](#utkast-28-kombinera-aktiva-egenskapsval-utan-att-spara-kartan)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[conflict-properties.spec.ts](../../tests/integration/conflict-properties.spec.ts),
UTKAST-106.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "390 × 900; Tabell och Karta med nytt underlag; smalt omflöde och tangentbordsfokus vid blandade val.",
  "outcomes": [
    "Blandade val ändrar bara utkastet; sparade uppgifter och historik består.",
    "Fokus stannar i dialogen. Escape återför fokus till Karta."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-properties.spec.ts",
    "caseId": "UTKAST-106"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-28 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd 390 × 900 i steg 1–7.
   Under steg 2–5 ska alla egenskaper vara läsbara och nåbara utan
   vågrät sidrullning. I steg 7 används samma bredd i ett nytt hushåll;
   kontrollera motsvarande val med tangentbord från Karta utan att spara kartan.

**Förväntat resultat:**

- Blandade val ändrar bara utkastet; sparade uppgifter och historik består.
- Fokus stannar i dialogen. Escape återför fokus till Karta.

### UTKAST-107: läs långt ändpunktsnamn i en sambandskonflikt

**Syfte:** 320 × 900; sambandets rubrik och lista med långt obrutet namn.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Nytt hushåll med Föremålsnamn upprepat fjorton gånger
utan mellanslag och Molnmusik. Spara ett känt samband mellan objekten.

**Integrationstest:**
[conflict-properties.spec.ts](../../tests/integration/conflict-properties.spec.ts),
UTKAST-107.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "320 × 900; sambandets rubrik och lista med långt obrutet namn.",
  "outcomes": [
    "Hela namnet är läsbart utan vågrät rullning.",
    "Läsningen ändrar varken utkastet, objekten eller sambanden."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-properties.spec.ts",
    "caseId": "UTKAST-107"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex föreslår Osäkert uppgivet för sambandet. Robin sparar
   Manuellt upphört för samma samband.
2. Alex laddar om och öppnar **1 konflikt i ditt utkast**. Läs hela
   ändpunktsnamnet i rubriken och Alla konflikter.
3. Stäng med Escape och kontrollera fokus på konfliktknappen.

**Förväntat resultat:**

- Hela namnet är läsbart utan vågrät rullning.
- Läsningen ändrar varken utkastet, objekten eller sambanden.

### UTKAST-108: egen referens för UTKAST-18

**Syfte:** 390 × 844; alla konfliktslag med nåbar status och synligt fokus.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-18](#utkast-18-alla-konfliktslag-visar-sina-fullständiga-underlag)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-108.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "390 × 844; alla konfliktslag med nåbar status och synligt fokus.",
  "outcomes": [
    "Alla fyra konfliktslag, fullständiga värden och typbetydelser bevaras.",
    "Tre kvarstående konflikter blockerar sparande efter typvalet."
  ],
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-108"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-18 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd 390 × 844 i steg 1–9.
   Under steg 5–6 ska konfliktknappen och varje fokuserad rubrik vara
   synliga. Under steg 7–9 ska underlag och resultat vara läsbara
   utan vågrät sidrullning.

**Förväntat resultat:**

- Alla fyra konfliktslag, fullständiga värden och typbetydelser bevaras.
- Tre kvarstående konflikter blockerar sparande efter typvalet.

### UTKAST-109: egen referens för UTKAST-18

**Syfte:** 320 × 844; alla konfliktslag med nåbar status och synligt fokus.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-18](#utkast-18-alla-konfliktslag-visar-sina-fullständiga-underlag)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-109.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "320 × 844; alla konfliktslag med nåbar status och synligt fokus.",
  "outcomes": [
    "Alla fyra konfliktslag, fullständiga värden och typbetydelser bevaras.",
    "Tre kvarstående konflikter blockerar sparande efter typvalet."
  ],
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-109"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-18 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd 320 × 844 i steg 1–9.
   Under steg 5–6 ska konfliktknappen och varje fokuserad rubrik vara
   synliga. Under steg 7–9 ska underlag och resultat vara läsbara
   utan vågrät sidrullning.

**Förväntat resultat:**

- Alla fyra konfliktslag, fullständiga värden och typbetydelser bevaras.
- Tre kvarstående konflikter blockerar sparande efter typvalet.

### UTKAST-110: egen referens för UTKAST-18

**Syfte:** 640 × 456; alla konfliktslag med nåbar status och synligt fokus.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-18](#utkast-18-alla-konfliktslag-visar-sina-fullständiga-underlag)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-110.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "640 × 456; alla konfliktslag med nåbar status och synligt fokus.",
  "outcomes": [
    "Alla fyra konfliktslag, fullständiga värden och typbetydelser bevaras.",
    "Tre kvarstående konflikter blockerar sparande efter typvalet."
  ],
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-110"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-18 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd 640 × 456 i steg 1–9.
   Under steg 5–6 ska konfliktknappen och varje fokuserad rubrik vara
   synliga. Under steg 7–9 ska underlag och resultat vara läsbara
   utan vågrät sidrullning.

**Förväntat resultat:**

- Alla fyra konfliktslag, fullständiga värden och typbetydelser bevaras.
- Tre kvarstående konflikter blockerar sparande efter typvalet.

### UTKAST-111: egen referens för UTKAST-20

**Syfte:** 390 × 900; rätta borttaget mål genom konfliktens Rätta ändpunkter.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-20](#utkast-20-rätta-ett-samband-med-borttaget-mål)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-111.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "390 × 900; rätta borttaget mål genom konfliktens Rätta ändpunkter.",
  "outcomes": [
    "Sambandets identitet, riktning och osäkerhet samt Privat stol bevaras.",
    "Nytt sparande delar rättelsen; Molnmusik återkommer inte."
  ],
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-111"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-20 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd 390 × 900 i steg 1–6.
   Under steg 3–5 ska samma privata samband öppnas, Molnmusik saknas
   bland mål och Garaget vara nåbart. Slutför sparandet i steg 6.

**Förväntat resultat:**

- Sambandets identitet, riktning och osäkerhet samt Privat stol bevaras.
- Nytt sparande delar rättelsen; Molnmusik återkommer inte.

### UTKAST-112: egen referens för UTKAST-21

**Syfte:** Objekttyp, 390 × 844; rätt befintlig definitionsredigering.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-21](#utkast-21-rätta-typdefinitioner-genom-inställningarna)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-112.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Objekttyp, 390 × 844; rätt befintlig definitionsredigering.",
  "outcomes": [
    "Rättad typ och Oberoende typförklaring finns tillsammans i utkastet.",
    "Kartans fakta består; nytt uttryckligt sparande delar definitionen."
  ],
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-112"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-21 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd objekttyp vid 390 × 844
   i steg 1–6. I steg 3 öppna
   **Välj inställning** och kontrollera nåbara fält och knappar. Slutför
   hela sparandet i steg 6.

**Förväntat resultat:**

- Rättad typ och Oberoende typförklaring finns tillsammans i utkastet.
- Kartans fakta består; nytt uttryckligt sparande delar definitionen.

### UTKAST-113: egen referens för UTKAST-21

**Syfte:** Sambandstyp, 1440 × 844; rätt befintlig definitionsredigering.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-21](#utkast-21-rätta-typdefinitioner-genom-inställningarna)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-113.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Sambandstyp, 1440 × 844; rätt befintlig definitionsredigering.",
  "outcomes": [
    "Rättad typ och Oberoende typförklaring finns tillsammans i utkastet.",
    "Kartans fakta består; nytt uttryckligt sparande delar definitionen."
  ],
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-113"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-21 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd sambandstyp vid 1440 × 844
   i steg 1–6. I steg 3 välj **Sambandstyper och riktning → Ändra
   sambandstyp: Min typ**. I steg 4 använd **Sambandstypens namn** och
   **Lägg sambandstypen i mitt utkast**. Slutför
   hela sparandet i steg 6.

**Förväntat resultat:**

- Rättad typ och Oberoende typförklaring finns tillsammans i utkastet.
- Kartans fakta består; nytt uttryckligt sparande delar definitionen.

### UTKAST-114: egen referens för UTKAST-21

**Syfte:** Sambandstyp, 390 × 844; rätt befintlig definitionsredigering.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-21](#utkast-21-rätta-typdefinitioner-genom-inställningarna)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-114.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Sambandstyp, 390 × 844; rätt befintlig definitionsredigering.",
  "outcomes": [
    "Rättad typ och Oberoende typförklaring finns tillsammans i utkastet.",
    "Kartans fakta består; nytt uttryckligt sparande delar definitionen."
  ],
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-114"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-21 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd sambandstyp vid 390 × 844
   i steg 1–6. I steg 3 välj **Sambandstyper och riktning → Ändra
   sambandstyp: Min typ**. I steg 4 använd **Sambandstypens namn** och
   **Lägg sambandstypen i mitt utkast**. I steg 3 öppna
   **Välj inställning** och kontrollera nåbara fält och knappar. Slutför
   hela sparandet i steg 6.

**Förväntat resultat:**

- Rättad typ och Oberoende typförklaring finns tillsammans i utkastet.
- Kartans fakta består; nytt uttryckligt sparande delar definitionen.

### UTKAST-115: egen referens för UTKAST-22

**Syfte:** 390 × 844, föreslaget värde; fokus efter egenskapsval.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-22](#utkast-22-konfliktval-behåller-användbart-fokus-utan-att-spara)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-115.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "390 × 844, föreslaget värde; fokus efter egenskapsval.",
  "outcomes": [
    "Lo Lind finns i utkastet; Lo Berg förblir sparat utan nytt kvitto.",
    "Escape återför fokus till synlig Karta utan konfliktknappen."
  ],
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-115"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-22 en gång. Anpassa och observera under dess
   angivna steg enligt följande: välj föreslagna värden i steg 2.
   Kontrollera Lo Lind och rubrikfokus i steg 3 och Karta-fokus i
   steg 4. Avsluta utan gemensamt sparande.

**Förväntat resultat:**

- Lo Lind finns i utkastet; Lo Berg förblir sparat utan nytt kvitto.
- Escape återför fokus till synlig Karta utan konfliktknappen.

### UTKAST-116: egen referens för UTKAST-24

**Syfte:** 390 × 844; tappade svar efter konfliktval och sparande.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-24](#utkast-24-återfinn-konfliktval-och-ett-enda-nytt-sparkvitto)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-116.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "390 × 844; tappade svar efter konfliktval och sparande.",
  "outcomes": [
    "Lo Lind, Spelar piano och Privat stol bevaras i utkastet.",
    "Ett uttryckligt sparande ger ett kvitto och tomt utkast.",
    "Kartan och historiken innehåller ett enda nytt sparande."
  ],
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-116"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-24 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd 390 × 844 i steg 1–5.
   Arma resolve och save före deras egna handlingar; operatören följer
   grundfallets separata tidsordning. Läs nåbara kontrollknappar och besked.

**Förväntat resultat:**

- Lo Lind, Spelar piano och Privat stol bevaras i utkastet.
- Ett uttryckligt sparande ger ett kvitto och tomt utkast.
- Kartan och historiken innehåller ett enda nytt sparande.

### UTKAST-117: behåll ett ändrat samband och ompröva objektborttagningen

**Syfte:** Tabell; sparat samband efter samtidiga typbyten.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered UTKAST-11 med objektets och sambandets
borttagningsförslag samt Robins sparade Abonnemang och Används av.
Robin ändrar inte Molnmusiks namn i detta fall.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-117.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Tabell; sparat samband efter samtidiga typbyten.",
  "outcomes": [
    "Bara sambandets borttagningsförslag kastas; objektborttagningen finns kvar.",
    "Objekt och samband är oförändrade. Historiken får ingen ny grupp."
  ],
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-117"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **2 konflikter i ditt utkast**. Välj objektets föreslagna
   borttagning och **Lägg valen i utkastet**.
2. Välj sambandet i Alla konflikter. Läs Används av, välj sparade
   värden och **Lägg valen i utkastet**.
3. Stäng med Escape. Läs kvarvarande objektborttagning i Utkast
   och Robins fortfarande sparade samband. Försök spara hela utkastet,
   läs **Inget sparades** och stäng sparmodalen och textvyn.
   Välj Karta och **Hämta aktuellt underlag**; det kvarvarande förslaget består.

**Förväntat resultat:**

- Bara sambandets borttagningsförslag kastas; objektborttagningen finns kvar.
- Objekt och samband är oförändrade. Historiken får ingen ny grupp.

### UTKAST-118: bevara en beskrivning som bara den andre ändrar

**Syfte:** Karta; eget namn och oberoende sparad beskrivning genom nytt
  sparande.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Lo Exempel är sparad utan beskrivning. Alex föreslår
Lo Lind. Robin behåller Lo Exempel, ändrar till Spelar piano och sparar.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-118.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Karta; eget namn och oberoende sparad beskrivning genom nytt sparande.",
  "outcomes": [
    "Lo Lind och den oberoende beskrivningen Spelar piano sparas tillsammans."
  ],
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-118"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten. Välj föreslagna ändringar och
   **Lägg valen i utkastet**.
2. Stäng med Escape. Öppna Utkast och läs Lo Lind.
3. Spara hela utkastet. Läs Lo Lind och Spelar piano i sparade uppgifter.

**Förväntat resultat:**

- Lo Lind och den oberoende beskrivningen Spelar piano sparas tillsammans.

### UTKAST-119: egen referens för UTKAST-54

**Syfte:** 320 × 900; uteblivet anrop och misslyckad kontroll på smal skärm.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-54](#utkast-54-kontrollera-en-utebliven-ändring-före-nytt-försök)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-119.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "320 × 900; uteblivet anrop och misslyckad kontroll på smal skärm.",
  "outcomes": [
    "Lyckad kontroll av utebliven ändring behåller valen och tillåter nytt försök.",
    "Bekräftelsen ändrar bara utkastet; alla knappar är nåbara."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-119"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-54 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd 320 × 900 i steg 1–4.
   Under steg 2–3 får återöppning och misslyckad kontroll aldrig göra
   bekräftelsen möjlig. Återställ leveransen före återförsöket i steg 4.

**Förväntat resultat:**

- Lyckad kontroll av utebliven ändring behåller valen och tillåter nytt försök.
- Bekräftelsen ändrar bara utkastet; alla knappar är nåbara.

### UTKAST-120: egen referens för UTKAST-53

**Syfte:** Karta, 320 × 900, föreslagna värden; genomfört val med tappat svar.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-53](#utkast-53-kontrollera-ett-tappat-svar-efter-genomförd-ändring)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-120.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Karta, 320 × 900, föreslagna värden; genomfört val med tappat svar.",
  "outcomes": [
    "Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.",
    "Karta och historik är oförändrade; Lo Lind och Min anteckning finns i utkastet."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-120"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-53 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd Karta vid 320 × 900
   i steg 1–4. Välj Alex
   föreslagna namn och beskrivning i steg 1. Under steg 2–3 förblir
   Visa konfliktvalet nåbar utan konfliktknappen. Avsluta efter steg 4
   utan gemensamt sparande.

**Förväntat resultat:**

- Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.
- Karta och historik är oförändrade; Lo Lind och Min anteckning finns i
  utkastet.

### UTKAST-121: egen referens för UTKAST-53

**Syfte:** Karta, 1280 × 900, sparade värden; genomfört val med tappat svar.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-53](#utkast-53-kontrollera-ett-tappat-svar-efter-genomförd-ändring)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-121.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Karta, 1280 × 900, sparade värden; genomfört val med tappat svar.",
  "outcomes": [
    "Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.",
    "Karta och historik är oförändrade; berört förslag är kastat."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-121"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-53 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd Karta vid 1280 × 900
   i steg 1–4. Välj Lo Berg
   och Robins anteckning från sparade sidan i steg 1. I steg 4 visas
   **Förslaget har tagits bort ur ditt utkast** och utkastet är tomt. Under steg
2–3 förblir
   Visa konfliktvalet nåbar utan konfliktknappen. Avsluta efter steg 4
   utan gemensamt sparande.

**Förväntat resultat:**

- Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.
- Karta och historik är oförändrade; berört förslag är kastat.

### UTKAST-122: egen referens för UTKAST-53

**Syfte:** Karta, 320 × 900, sparade värden; genomfört val med tappat svar.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-53](#utkast-53-kontrollera-ett-tappat-svar-efter-genomförd-ändring)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-122.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Karta, 320 × 900, sparade värden; genomfört val med tappat svar.",
  "outcomes": [
    "Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.",
    "Karta och historik är oförändrade; berört förslag är kastat."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-122"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-53 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd Karta vid 320 × 900
   i steg 1–4. Välj Lo Berg
   och Robins anteckning från sparade sidan i steg 1. I steg 4 visas
   **Förslaget har tagits bort ur ditt utkast** och utkastet är tomt. Under steg
2–3 förblir
   Visa konfliktvalet nåbar utan konfliktknappen. Avsluta efter steg 4
   utan gemensamt sparande.

**Förväntat resultat:**

- Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.
- Karta och historik är oförändrade; berört förslag är kastat.

### UTKAST-123: egen referens för UTKAST-53

**Syfte:** Tabell, 1280 × 900, föreslagna värden; genomfört val med tappat svar.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-53](#utkast-53-kontrollera-ett-tappat-svar-efter-genomförd-ändring)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-123.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Tabell, 1280 × 900, föreslagna värden; genomfört val med tappat svar.",
  "outcomes": [
    "Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.",
    "Karta och historik är oförändrade; Lo Lind och Min anteckning finns i utkastet."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-123"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-53 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd Tabell vid 1280 × 900
   i steg 1–4. Välj **Tabell** före konfliktknappen i steg 1. Välj Alex
   föreslagna namn och beskrivning i steg 1. Under steg 2–3 förblir
   Visa konfliktvalet nåbar utan konfliktknappen. Avsluta efter steg 4
   utan gemensamt sparande.

**Förväntat resultat:**

- Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.
- Karta och historik är oförändrade; Lo Lind och Min anteckning finns i
  utkastet.

### UTKAST-124: egen referens för UTKAST-53

**Syfte:** Tabell, 320 × 900, föreslagna värden; genomfört val med tappat svar.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-53](#utkast-53-kontrollera-ett-tappat-svar-efter-genomförd-ändring)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-124.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Tabell, 320 × 900, föreslagna värden; genomfört val med tappat svar.",
  "outcomes": [
    "Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.",
    "Karta och historik är oförändrade; Lo Lind och Min anteckning finns i utkastet."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-124"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-53 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd Tabell vid 320 × 900
   i steg 1–4. Välj **Tabell** före konfliktknappen i steg 1. Välj Alex
   föreslagna namn och beskrivning i steg 1. Under steg 2–3 förblir
   Visa konfliktvalet nåbar utan konfliktknappen. Avsluta efter steg 4
   utan gemensamt sparande.

**Förväntat resultat:**

- Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.
- Karta och historik är oförändrade; Lo Lind och Min anteckning finns i
  utkastet.

### UTKAST-125: egen referens för UTKAST-53

**Syfte:** Tabell, 1280 × 900, sparade värden; genomfört val med tappat svar.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-53](#utkast-53-kontrollera-ett-tappat-svar-efter-genomförd-ändring)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-125.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Tabell, 1280 × 900, sparade värden; genomfört val med tappat svar.",
  "outcomes": [
    "Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.",
    "Karta och historik är oförändrade; berört förslag är kastat."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-125"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-53 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd Tabell vid 1280 × 900
   i steg 1–4. Välj **Tabell** före konfliktknappen i steg 1. Välj Lo Berg
   och Robins anteckning från sparade sidan i steg 1. I steg 4 visas
   **Förslaget har tagits bort ur ditt utkast** och utkastet är tomt. Under steg
2–3 förblir
   Visa konfliktvalet nåbar utan konfliktknappen. Avsluta efter steg 4
   utan gemensamt sparande.

**Förväntat resultat:**

- Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.
- Karta och historik är oförändrade; berört förslag är kastat.

### UTKAST-126: egen referens för UTKAST-53

**Syfte:** Tabell, 320 × 900, sparade värden; genomfört val med tappat svar.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-53](#utkast-53-kontrollera-ett-tappat-svar-efter-genomförd-ändring)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-126.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Tabell, 320 × 900, sparade värden; genomfört val med tappat svar.",
  "outcomes": [
    "Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.",
    "Karta och historik är oförändrade; berört förslag är kastat."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-126"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-53 en gång. Anpassa och observera under dess
   angivna steg enligt följande: använd Tabell vid 320 × 900
   i steg 1–4. Välj **Tabell** före konfliktknappen i steg 1. Välj Lo Berg
   och Robins anteckning från sparade sidan i steg 1. I steg 4 visas
   **Förslaget har tagits bort ur ditt utkast** och utkastet är tomt. Under steg
2–3 förblir
   Visa konfliktvalet nåbar utan konfliktknappen. Avsluta efter steg 4
   utan gemensamt sparande.

**Förväntat resultat:**

- Resultatet återfinns utan upprepad bekräftelse, även utan konfliktknapp.
- Karta och historik är oförändrade; berört förslag är kastat.

### UTKAST-127: ompröva ett samband när ändpunktens namn ändras

**Syfte:** Karta; samma ändpunkt med nytt namn och bevarade val.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Kör `new-reference` i den tillfälliga
konfliktinstallationen.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-127.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Karta; samma ändpunkt med nytt namn och bevarade val.",
  "outcomes": [
    "Aktuellt namn visas trots oförändrad ändpunktsidentitet.",
    "Opåverkade val finns kvar; bara det privata sambandsförslaget ändras."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-127"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten. Välj Molnmusik och Osäkert uppgivet från
   Ditt förslag. Operatören kör `newer-reference`.
2. Försök lägga valen i utkastet, läs avvisningen och välj
   **Visa aktuell jämförelse**.
3. Läs Ny musiktjänst. Mål och Osäkert uppgivet är fortfarande
   markerade. Lägg valen i utkastet.

**Förväntat resultat:**

- Aktuellt namn visas trots oförändrad ändpunktsidentitet.
- Opåverkade val finns kvar; bara det privata sambandsförslaget ändras.

### UTKAST-128: läs en konflikt som en annan klient redan har löst

**Syfte:** Karta; annan klient för samma ägare löser en stängd konflikt.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Kör `new-base`.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-128.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Karta; annan klient för samma ägare löser en stängd konflikt.",
  "outcomes": [
    "Återöppningen visar läsläge utan gammal bekräftelse.",
    "Läsningen ändrar varken aktuellt utkast eller sparad karta."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-128"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten och välj Alex namn och beskrivning. Stäng med Escape.
2. Operatören kör `resolve-elsewhere`. Öppna konfliktknappen igen.
3. Läs **Konflikten finns inte längre**. Kontrollera rubrikfokus och
   att ingen bekräftelse erbjuds. Stäng med Escape.

**Förväntat resultat:**

- Återöppningen visar läsläge utan gammal bekräftelse.
- Läsningen ändrar varken aktuellt utkast eller sparad karta.

### UTKAST-129: kontrollera okänt val efter annan klients hela sparande

**Syfte:** Karta, saved; annat fönster för Alex sparar och tömmer utkastet.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Kör `new-base`, `newer-private` och
`lose-unsent`.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-129.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Karta, saved; annat fönster för Alex sparar och tömmer utkastet.",
  "outcomes": [
    "Ingen privat lösningsbock, ny bekräftelse eller uppmaning att försöka igen visas.",
    "Lo Lind och Privat stol är sparade; utkastet är tomt.",
    "Kontrollen beskriver inte sparandet som osparat och ändrar inget."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-129"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten. Välj Lo Berg och Robins anteckning.
   Bekräfta, läs det oklara utfallet och stäng med Escape.
2. Operatören kör `save-elsewhere`: en annan klient för Alex
   löser med föreslagna värden och sparar hela utkastet.
3. Öppna igen och välj **Kontrollera om valet lades i utkastet**.
   Läs Konflikten finns inte längre och läsläget.

**Förväntat resultat:**

- Ingen privat lösningsbock, ny bekräftelse eller uppmaning att försöka igen
  visas.
- Lo Lind och Privat stol är sparade; utkastet är tomt.
- Kontrollen beskriver inte sparandet som osparat och ändrar inget.

### UTKAST-130: kontrollera okänt val efter annan klients hela sparande

**Syfte:** Karta, proposed; annat fönster för Alex sparar och tömmer utkastet.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Kör `new-base`, `newer-private` och
`lose-applied`.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-130.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Karta, proposed; annat fönster för Alex sparar och tömmer utkastet.",
  "outcomes": [
    "Ingen privat lösningsbock, ny bekräftelse eller uppmaning att försöka igen visas.",
    "Lo Lind och Privat stol är sparade; utkastet är tomt.",
    "Kontrollen beskriver inte sparandet som osparat och ändrar inget."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-130"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten. Välj Lo Lind och Min anteckning.
   Bekräfta, läs det oklara utfallet och stäng med Escape.
2. Operatören kör `save-elsewhere`: en annan klient för Alex
   löser med föreslagna värden och sparar hela utkastet.
3. Öppna igen och välj **Kontrollera om valet lades i utkastet**.
   Läs Konflikten finns inte längre och läsläget.

**Förväntat resultat:**

- Ingen privat lösningsbock, ny bekräftelse eller uppmaning att försöka igen
  visas.
- Lo Lind och Privat stol är sparade; utkastet är tomt.
- Kontrollen beskriver inte sparandet som osparat och ändrar inget.

### UTKAST-131: granska en ny konflikt efter ett tappat genomfört val

**Syfte:** Karta; senare sparat namn efter faktiskt genomfört privat val.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Kör `new-base` och `lose-applied`.

**Integrationstest:**
[conflict-continuity.spec.ts](../../tests/integration/conflict-continuity.spec.ts),
UTKAST-131.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Karta; senare sparat namn efter faktiskt genomfört privat val.",
  "outcomes": [
    "Lo Ås kräver ny granskning trots det tidigare genomförda valet.",
    "Oförändrat beskrivningsval behålls; bara namnvalet görs om.",
    "Kartan behåller Lo Ås och Robins anteckning."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-continuity.spec.ts",
    "caseId": "UTKAST-131"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna konflikten. Välj Alex namn och beskrivning, bekräfta och
   stäng efter det oklara utfallet.
2. Operatören kör `newer-name`. Öppna igen och kontrollera om valet
   lades i utkastet. Bekräftelsen är spärrad och ingen lösningsbock visas.
3. Visa aktuell jämförelse och invänta beskedet att den visas. Min
   anteckning finns kvar i resultatet. Beskrivningen visas som en oberoende
   ändring som kombineras utan nytt val; namnet kräver nytt val. Välj
   Lo Lind igen.
4. Operatören kör `network-ok`. Lägg valen i utkastet utan att spara kartan.

**Förväntat resultat:**

- Lo Ås kräver ny granskning trots det tidigare genomförda valet.
- Oförändrat beskrivningsval behålls; bara namnvalet görs om.
- Kartan behåller Lo Ås och Robins anteckning.

### UTKAST-132: kontrollera ett uteblivet kastval för dubblettsamband

**Syfte:** 320 × 900, Karta; kastval stoppat före servern.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Kör `new-duplicate` och `lose-unsent`.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-132.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "320 × 900, Karta; kastval stoppat före servern.",
  "outcomes": [
    "Lyckad kontroll skiljer uteblivet kastval från genomfört kastande.",
    "Hela utkastet, sparade samband, objekt och historik består."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-132"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj Karta. Öppna konflikten och välj
   **Ta bort sambandet ur ditt utkast**. Läs oklart utfall.
2. Stäng med Escape och öppna igen. Konflikten finns kvar och
   kastknappen är spärrad.
3. Kontrollera om valet lades i utkastet. Läs att det inte lades
   i utkastet och att kastknappen nu går att använda.
4. Stäng med Escape och kontrollera synligt fokus. Kasta inte igen.

**Förväntat resultat:**

- Lyckad kontroll skiljer uteblivet kastval från genomfört kastande.
- Hela utkastet, sparade samband, objekt och historik består.

### UTKAST-133: egen referens för UTKAST-77

**Syfte:** 320 × 900, Tabell; genomfört dubblettkastande med tappat svar.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-77](#utkast-77-kontrollera-ett-oklart-kastval-utan-upprepad-bekräftelse)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-133.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "320 × 900, Tabell; genomfört dubblettkastande med tappat svar.",
  "outcomes": [
    "Dubblettförslaget kastas utan ändrat sparat samband.",
    "Återöppning och kontroll upprepar inte kastvalet; fokus är användbart."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-133"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-77 en gång. Anpassa och observera under dess
   angivna steg enligt följande: välj Tabell före steg 1.
   Utför steg 1–4. Under steg 2–3 förblir Visa konfliktvalet nåbar
   utan konfliktknappen.

**Förväntat resultat:**

- Dubblettförslaget kastas utan ändrat sparat samband.
- Återöppning och kontroll upprepar inte kastvalet; fokus är användbart.

### UTKAST-134: kontrollera ett uteblivet kastval för dubblettsamband

**Syfte:** 320 × 900, Tabell; kastval stoppat före servern.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Kör `new-duplicate` och `lose-unsent`.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-134.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "320 × 900, Tabell; kastval stoppat före servern.",
  "outcomes": [
    "Lyckad kontroll skiljer uteblivet kastval från genomfört kastande.",
    "Hela utkastet, sparade samband, objekt och historik består."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-134"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj Tabell. Öppna konflikten och välj
   **Ta bort sambandet ur ditt utkast**. Läs oklart utfall.
2. Stäng med Escape och öppna igen. Konflikten finns kvar och
   kastknappen är spärrad.
3. Kontrollera om valet lades i utkastet. Läs att det inte lades
   i utkastet och att kastknappen nu går att använda.
4. Stäng med Escape och kontrollera synligt fokus. Kasta inte igen.

**Förväntat resultat:**

- Lyckad kontroll skiljer uteblivet kastval från genomfört kastande.
- Hela utkastet, sparade samband, objekt och historik består.

### UTKAST-135: egen referens för UTKAST-63

**Syfte:** 320 × 900, Tabell; båda genomförda borttagningsvalen med tappat svar.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Förbered
[UTKAST-63](#utkast-63-kontrollera-oklara-föreslagna-borttagningar)
i ett nytt hushåll.
Använd konfigurationen som anges här.

**Integrationstest:**
[conflict-special.spec.ts](../../tests/integration/conflict-special.spec.ts),
UTKAST-135.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "320 × 900, Tabell; båda genomförda borttagningsvalen med tappat svar.",
  "outcomes": [
    "Båda borttagningarna återfinns i utkastet utan upprepat val.",
    "Objekt, samband och historik är oförändrade."
  ],
  "counterpart": {
    "spec": "tests/integration/conflict-special.spec.ts",
    "caseId": "UTKAST-135"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-63 en gång. Anpassa och observera under dess
   angivna steg enligt följande: välj Tabell före steg 1.
   Utför steg 1–4. Kontrollera åtkomsten i steg 2–3 och båda privata
   borttagningarna i steg 4. Avsluta utan gemensamt sparande.

**Förväntat resultat:**

- Båda borttagningarna återfinns i utkastet utan upprepat val.
- Objekt, samband och historik är oförändrade.

### UTKAST-136: hör konfliktbesked med riktig skärmläsare

**Syfte:** Riktig skärmläsare; separat talobservation vid avvisning, återöppning
och väntan.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Tillfällig konfliktinstallation i dokumenterad vy.
Återställ mellan de tre fallen, inte under ett okänt utfall.

**Kräver mänsklig observation:** Faktiskt tal från en riktig skärmläsare.
Anteckna program, version och webbläsare.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Riktig skärmläsare; separat talobservation vid avvisning, återöppning och väntan.",
  "outcomes": [
    "Beskeden hörs begripligt en gång vid sina tillståndsövergångar.",
    "Senare fokus består. Anteckna faktiskt hörda ord och eventuella fel."
  ],
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Lyssna på riktigt skärmläsartal: ett begripligt besked utan dubbla annonseringar och utan att senare fokus flyttas."
  },
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/conflict-continuity.spec.ts",
      "caseId": "UTKAST-52",
      "purpose": "DOM-status och fokus; inget bevis på faktiskt skärmläsartal."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/conflict-continuity.spec.ts",
      "caseId": "UTKAST-55",
      "purpose": "DOM-status och fokus; inget bevis på faktiskt skärmläsartal."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/conflict-continuity.spec.ts",
      "caseId": "UTKAST-56",
      "purpose": "DOM-status och fokus; inget bevis på faktiskt skärmläsartal."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ [styrd konfliktleverans](current-conflict-preparation.md) och
behåll den riktiga skärmläsaren i den dokumenterade webbläsaren.
Inför UI-steg 1: kör `new-base` och bekräfta grundfallets nya konflikt
före UTKAST-52. Efter hela UTKAST-52, endast när utfallet är känt:
återställ med `new-base` och meddela **Grundfallet är återställt inför
UTKAST-55**. Efter hela UTKAST-55 och känt utfall: återställ med
`new-base` och meddela **Grundfallet är återställt inför UTKAST-56**.
Återställ aldrig under ett okänt eller hållet utfall. Följ respektive
grundfalls separata tidpunkter för nyare privat förslag, Robins sparande
och hållen/tappad leverans. Låt användaren höra alla angivna övergångar
själv, inklusive senare fokus i UTKAST-56; DOM-underlaget ersätter inte
det faktiska talet. Efter sista kända utfall återställs leveransen och
installationen avslutas enligt förberedelsen. Anteckna faktiskt hörda
ord, skärmläsarversion, webbläsare och resultat som tidigare.

**Steg:**

1. Be operatören förbereda UTKAST-52 och invänta bekräftelse. Utför
   UTKAST-52 en gång. Lyssna under steg 3 på ett enda
   besked om ändrat underlag.
2. När föregående utfall är känt: be operatören återställa inför
   UTKAST-55. Invänta bekräftelse och utför UTKAST-55 en gång. Lyssna
   under steg 2 när dialogen öppnas efter Robins senare sparande.
3. När föregående utfall är känt: be operatören återställa inför
   UTKAST-56. Invänta bekräftelse och utför UTKAST-56 en gång. Lyssna under
   steg 1 och 3 på väntan och oklart utfall. Under steg 4–5 får status och
   återöppning
   inte ge dubbelt tal eller flytta senare fokus.

**Förväntat resultat:**

- Beskeden hörs begripligt en gång vid sina tillståndsövergångar.
- Senare fokus består. Anteckna faktiskt hörda ord och eventuella fel.

### UTKAST-139: kasta sambandstypsförslag utan faktisk borttagningsrevision

**Syfte:** Sambandstypens hela historiska betydelse är läsbar trots spärrad
återställning.

**Användare:** Robin; Alex utför separat teknisk förberedelse.

**Förutsättningar:** Följ [historisk
förberedelse](historical-definition-preparation.md) och välj
`new-no-removed-relationship-definition`. Börja i en ny installation och
behåll samma databas vid omstart inom fallet.

**Integrationstest:**
[conflict-definition-restoration.spec.ts](../../tests/integration/conflict-definition-restoration.spec.ts),
UTKAST-139.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-definition-restoration.spec.ts",
    "caseId": "UTKAST-139"
  },
  "reference": "1280 × 720; Chromium och styrda testidentiteter; verklig HTTP och SQLite.",
  "outcomes": [
    "Sambandstypens hela historiska betydelse är läsbar trots spärrad återställning.",
    "Kastvalet påverkar enbart det egna sambandstypsförslaget; oberoende arbete, gemensamma typer och historik består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-76:s tre steg en gång med denna förberedelse. I steg 1 läser
du sambandstypens **Min privata typbenämning**, **Min tidigare definition**
samt riktningarna **förvaras i** och **förvarar**. Typen består av namn,
beskrivning och riktningar.

**Förväntat resultat:**

- Sambandstypens hela historiska betydelse är läsbar trots spärrad
återställning.
- Kastvalet påverkar enbart det egna sambandstypsförslaget; oberoende arbete,
gemensamma typer och historik består.

### UTKAST-140: återställ en borttagen sambandstyp med läsbara riktningar

**Syfte:** Hela sambandstypen med båda riktningarna är läsbar vid 1280 och 320
pixlar i varje granskningsfas.

**Användare:** Robin; Alex utför separat teknisk förberedelse.

**Förutsättningar:** Följ [historisk
förberedelse](historical-definition-preparation.md) och välj
`new-relationship-restoration`. Börja i en ny installation och behåll samma
databas vid omstart inom fallet.

**Integrationstest:**
[conflict-definition-restoration.spec.ts](../../tests/integration/conflict-definition-restoration.spec.ts),
UTKAST-140.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-definition-restoration.spec.ts",
    "caseId": "UTKAST-140"
  },
  "reference": "Sambandstyp; 1280 och 320 × 900. Riktningarnas historiska betydelser har en egen counterpart och kompletterar objekttypens namn och beskrivning.",
  "outcomes": [
    "Hela sambandstypen med båda riktningarna är läsbar vid 1280 och 320 pixlar i varje granskningsfas.",
    "Privat bekräftelse ändrar inte den gemensamma kartan. Separat sparande och omstart gör den återställda definitionen läsbar för båda användarna."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-67:s fyra steg en gång med denna förberedelse. I steg 1–3
läser du sambandstypen, inte objekttypen: **Min privata typbenämning**, **Min
tidigare definition**, **Framåtriktning: förvaras i** och
**Omvänd riktning: förvarar**. Typen består av namn, beskrivning och riktningar.
2. I steg 4 läser både Robin och Alex dessa namn, beskrivning och riktningar i
sambandstypens ordinarie formulär samt det sparade oberoende objektet.

**Förväntat resultat:**

- Hela sambandstypen med båda riktningarna är läsbar vid 1280 och 320 pixlar i
varje granskningsfas.
- Privat bekräftelse ändrar inte den gemensamma kartan. Separat sparande och
omstart gör den återställda definitionen läsbar för båda användarna.

### UTKAST-141: kontrollera samma tappade återställningssvar från Tabell

**Syfte:** Tabellens uppföljning är nåbar även när den sista konflikten
försvinner.

**Användare:** Robin; Alex utför separat teknisk förberedelse.

**Förutsättningar:** Följ [historisk
förberedelse](historical-definition-preparation.md) och välj
`new-object-restoration`. Börja i en ny installation och behåll samma databas
vid omstart inom fallet.

**Integrationstest:**
[conflict-definition-restoration.spec.ts](../../tests/integration/conflict-definition-restoration.spec.ts),
UTKAST-141.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conflict-definition-restoration.spec.ts",
    "caseId": "UTKAST-141"
  },
  "reference": "Tabell; 320 × 900; separat native återgångsväg efter tappat genomfört svar.",
  "outcomes": [
    "Tabellens uppföljning är nåbar även när den sista konflikten försvinner.",
    "Ett genomfört privat val verifieras utan upprepning och utan gemensamt sparande. Hela definitionen och det oberoende förslaget består."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför UTKAST-70:s fyra steg en gång i **Tabell** vid 320 × 900 med en ny
installation. Välj Tabell innan konflikten öppnas och kontrollera
återgångsfokus i denna arbetsyta.

**Förväntat resultat:**

- Tabellens uppföljning är nåbar även när den sista konflikten försvinner.
- Ett genomfört privat val verifieras utan upprepning och utan gemensamt
sparande. Hela definitionen och det oberoende förslaget består.

### UTKAST-137: spara oberoende objektändringar från två webbläsare

**Syfte:** Tabell; två medlemmars formulärförslag genom sparande och omstart.

**Användare:** Alex och Robin i skilda sessioner enligt grundfallet.

**Förutsättningar:** Nytt hushåll med Lo Exempel och Molnmusik,
två aktuella medlemmar och tomma egna utkast.

**Integrationstest:**
[draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts),
UTKAST-137.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "reference": "Tabell; två medlemmars formulärförslag genom sparande och omstart.",
  "outcomes": [
    "Båda sparanden bekräftas utan konflikt om det andra objektet.",
    "Lo Lind och Ny musiktjänst finns hos båda efter omstart.",
    "Båda egna utkasten är tomma."
  ],
  "counterpart": {
    "spec": "tests/integration/draft-conflicts.spec.ts",
    "caseId": "UTKAST-137"
  }
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Tabell i båda profilerna. Alex redigerar Lo Exempel till
   Lo Lind och väljer **Lägg i utkastet och stäng**.
2. Robin redigerar Molnmusik till Ny musiktjänst och lägger hela
   formuläret i sitt eget utkast.
3. Robin sparar hela sitt utkast, därefter sparar Alex hela sitt utkast.
   Stäng textvyn i båda profilerna.
4. Starta om med samma databas. Ladda om båda sidorna
   och läs Tabell och egna Utkast.

**Förväntat resultat:**

- Båda sparanden bekräftas utan konflikt om det andra objektet.
- Lo Lind och Ny musiktjänst finns hos båda efter omstart.
- Båda egna utkasten är tomma.
- UTKAST-137 jämför dessutom de två samtidigt privata förslagen,
  sparresultaten och objektens fullständiga identiteter och värden för båda
  medlemmarna genom publika HTTP-svar. Dessa kontroller ingår i samma
  formulärflöde och kräver inga ytterligare manuella UI-steg.

### UTKAST-154: återta objektborttagningar med bevarat sambandsarbete

**Syfte:** Återge egna sambandsförslag utan att tappa deras innehåll eller
återta en separat begärd sambandsborttagning.

**Användare:** Alex enligt områdets förberedelse.

**Förutsättningar:** Använd ett syntetiskt hushåll med sparade objekt
Lo Exempel och Molnmusik. Skapa och spara ett samband från Lo till
Molnmusik och ett självsamband för Molnmusik. Använd samma sambandstyp.
I ditt utkast ändrar du det första sambandet: lägg till två egenskaper
med etiketten Samma, först ja/nej med Nej och sedan tal med 0.
Lägg till ett nytt omvänt samband från Molnmusik till Lo med
textegenskapen Anteckning och värdet Bevarat nytt samband, samt ett nytt
självsamband för Lo. Föreslå separat att ta bort Molnmusiks sparade
självsamband. Spara inte dessa ändringar ännu.

**Automatiskt motsvarande test:**
[object-removal-suppression.spec.ts](../../tests/integration/object-removal-suppression.spec.ts),
UTKAST-154. Fokuserat HTTP/MCP-underlag använder riktig server och SQLite.
Chromium-underlaget kontrollerar läsdialogens tangentbord och text med
styrt utkast; det bevisar inte beständighet.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": { "runner": "playwright", "suite": "integration", "spec": "tests/integration/object-removal-suppression.spec.ts", "caseId": "UTKAST-154" },
  "reference": "320 × 900, ljust tema, Chromium. Nya, ändrade, inkommande, utgående och självkopplade samband; två borttagningsorsaker och separat sambandsborttagning.",
  "outcomes": ["Utkastet visar vilka samband som följer objektborttagningarna och låter användaren läsa det bevarade nya förslaget.", "Återtagning av en orsak lämnar den andra kvar. Efter den sista återtagningen återkommer sambandsförslagen med egenskaperna i samma ordning; separat sambandsborttagning består.", "Läsdialogen ger rubrikfokus och återlämnar fokus med Escape. Efter samlat sparande finns båda objekten kvar."],
  "evidence": [
    { "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/object-removal-suppression-http.test.ts", "title": "object removal suppresses new and edited relationships until every cause is undone, preserving exact proposals after restart", "purpose": "Exakta förslag, identiteter, egenskapsordning och flera orsaker genom omstart och återtagning." },
    { "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/object-removal-suppression-http.test.ts", "title": "explicit relationship deletion survives undo while cascade save records only saved relationships atomically", "purpose": "Separat borttagning, atomiskt slutresultat samt gemensam historik och kvitto." },
    { "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/object-removal-suppression-http.test.ts", "title": "undo restores a proposal that remains blocked by another member removal without resurrecting objects or partially saving", "purpose": "Kvarstående blockering, oförändrat utkast efter avvisat sparande och ingen objektåterställning." },
    { "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/object-removal-suppression-http.test.ts", "title": "MCP object removal and undo retain suppressed contents and independently requested relationship deletions", "purpose": "MCP följer samma regler för borttagning, läsning och återtagning." },
    { "kind": "technical", "runner": "vitest", "suite": "browser", "spec": "tests/browser/object-removal-suppression.test.tsx", "title": "suppressed new relationship reader names both removal causes and retained values with keyboard focus", "purpose": "Tangentbord, fokus, begriplig orsakstext, egenskapsordning och smal läsdialog med styrt innehåll." }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Tabell** och välj **Ta bort Lo Exempel**, sedan
   **Ta bort Molnmusik**. Öppna **Utkast** och läs vilka samband som
   följer de två objektborttagningarna.
2. Nå **Visa förslaget** för det nya sambandet från Molnmusik till Lo med
   tangentbord och aktivera med Enter. Kontrollera rubrikfokus och läs
   **Bevarat sambandsförslag** med anteckningen. Stäng med Escape och
   kontrollera att fokus återgår till samma knapp.
3. Ta bort objektets borttagningsförslag för Lo med radens papperskorg.
   Kontrollera att sambanden mellan Lo och Molnmusik fortfarande följer
   borttagningen av Molnmusik. Lo:s självsamband återkommer som nytt förslag.
4. Återta även Molnmusiks objektborttagning. Kontrollera att inga rader
   längre anger **Följer objektborttagning**. Läs det ändrade sambandet
   från Lo och kontrollera Nej före 0 bland de föreslagna egenskaperna.
   Molnmusiks separat borttagna självsamband ska fortfarande ange
   **Tas bort**.
5. Spara hela utkastet. Öppna tabellen och kontrollera att både
   Lo Exempel och Molnmusik finns kvar.

**Förväntat resultat:** Alla undertryckta förslag går att läsa och återges
efter sista återtagningen. En separat sambandsborttagning behålls.
Inget sparat objekt behöver återskapas och sparandet är gemensamt.

**Kvarstående mänsklig observation:** Faktisk uppläsning, fysiskt mobilt
tangentbord, förstoring och omflöde bedöms i områdets befintliga
hjälpmedelsfall. Automatiken utgör inget mänskligt godkännande.

### UTKAST-151: rätta ett bevarat nytt samband efter borttagen ändpunkt

**Syfte:** Behålla eget arbete och rätta ändpunkten före samlat sparande.

**Användare:** Alex och Robin enligt områdets förberedelse.

**Förutsättningar:** Ett nytt sambandsförslag från Lo Exempel till
Molnmusik med osäkert uppgiven information och ett oberoende objektförslag.
Robin tar bort Molnmusik i den gemensamma kartan.

**Separat förberedelse:** Starta den
[tillfälliga
konfliktinstallationen](#bevarade-konfliktval-och-kontrollerat-utfall)
och välj `new-missing-endpoint`. Behåll samma hushåll genom hela fallet.
Avsluta med `quit` efter kontrollen och välj en ny installation inför omprov.

**Automatiskt motsvarande test:**
[stale-relationships.spec.ts](../../tests/integration/stale-relationships.spec.ts),
UTKAST-151. HTTP/MCP-underlaget använder riktig server och SQLite;
integrationstestet kontrollerar det synliga rättningsflödet.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": { "runner": "playwright", "suite": "integration", "spec": "tests/integration/stale-relationships.spec.ts", "caseId": "UTKAST-151" },
  "reference": "1280 × 900, ljust tema, Chromium, syntetiska användare. Nytt förslag efter annan användares sparade objektborttagning.",
  "outcomes": ["Förslaget finns i konfliktlistan med bevarad osäkerhet. Hela utkastet väntar på rättning eller kastande.", "Rätta ändpunkter öppnar ett tangentbordstillgängligt formulär med rubrikfokus och befintliga objekt. Rättning till Lo Exempel behåller förslagets innehåll.", "Efter separat samlat sparande finns det rättade sambandet och det oberoende objektet. Molnmusik återställs inte."],
  "evidence": [{ "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/stale-relationships-http.test.ts", "title": "previously valid new relationship survives endpoint loss, restart and correction without partial saving", "purpose": "Beständigt privat innehåll, samma sambandsidentitet, ogiltig rättning utan ändring, blockerat helt sparande och oförändrad historik före rättning." }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **1 konflikt i ditt utkast**. Läs orsaken och ditt bevarade
   förslag med **Osäkert uppgivet**. Stäng med Escape.
2. Öppna **Skriv till Skyttel → Visa utkastet**. Läs blockeringen och
   det oberoende förslaget. Välj **Stäng textvyn** och återvänd till konflikten.
3. Nå **Rätta ändpunkter** med tangentbord och aktivera med Enter.
   Kontrollera fokus på rubriken **Rätta blockerat samband** och läs
   förklaringen om befintliga ändpunkter.
4. Välj Lo Exempel i **Till objekt**. Kontrollera att borttagna Molnmusik
   inte erbjuds. Behåll övriga uppgifter och välj **Lägg i utkastet** med
   tangentbord. Läs bekräftelsen, stäng dialogen och granska utkastet.
5. Välj **Spara hela utkastet**. Kontrollera sparbekräftelsen. Stäng textvyn. Öppna
   **Tabell** och **Samband för Lo Exempel** för att läsa det sparade
   sambandet och det oberoende objektet.

**Förväntat resultat:**

- Konfliktlistan förklarar att ett objekt saknas och att hela sparandet
  väntar. Sambandsförslaget finns kvar med sitt innehåll.
- Rättningsformuläret fungerar utan dragning eller tal, med synligt fokus,
  begripliga etiketter och utan vågrät rullning vid den valda bredden.
- Det rättade sambandet behåller osäkerheten och visas efter sparandet.
  Det oberoende objektet sparas samtidigt. Molnmusik återställs inte.

**Kvarstående mänsklig observation:** Faktisk uppläsning, fysiskt
mobilt tangentbord, förstoring och omflöde bedöms i områdets befintliga
hjälpmedelsfall. Automatiken utgör inget mänskligt godkännande.

### UTKAST-152: rätta ett bevarat ändrat samband efter borttagen ändpunkt

**Syfte:** Behålla eget arbete och rätta ändpunkten före samlat sparande.

**Användare:** Alex och Robin enligt områdets förberedelse.

**Förutsättningar:** Ett ändrat sambandsförslag från Lo Exempel till
Molnmusik med osäkert uppgiven information och ett oberoende objektförslag.
Robin tar bort Molnmusik i den gemensamma kartan.

**Separat förberedelse:** Starta den
[tillfälliga
konfliktinstallationen](#bevarade-konfliktval-och-kontrollerat-utfall)
och välj `new-edited-missing-endpoint`. Behåll samma hushåll genom hela fallet.
Avsluta med `quit` efter kontrollen och välj en ny installation inför omprov.

**Automatiskt motsvarande test:**
[stale-relationships.spec.ts](../../tests/integration/stale-relationships.spec.ts),
UTKAST-152. HTTP/MCP-underlaget använder riktig server och SQLite;
integrationstestet kontrollerar det synliga rättningsflödet.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": { "runner": "playwright", "suite": "integration", "spec": "tests/integration/stale-relationships.spec.ts", "caseId": "UTKAST-152" },
  "reference": "320 × 900, ljust tema, Chromium, syntetiska användare. Ändrat tidigare sparat samband efter annan användares sparade objektborttagning.",
  "outcomes": ["Förslaget finns i konfliktlistan med bevarad osäkerhet. Hela utkastet väntar på rättning eller kastande.", "Rätta ändpunkter öppnar ett tangentbordstillgängligt formulär med rubrikfokus och befintliga objekt. Rättning till Lo Exempel behåller förslagets innehåll.", "Efter separat samlat sparande finns det rättade sambandet och det oberoende objektet. Molnmusik återställs inte."],
  "evidence": [{ "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/stale-relationships-http.test.ts", "title": "previously valid edited relationship survives endpoint loss, restart and correction without partial saving", "purpose": "Beständigt privat innehåll, samma sambandsidentitet, ogiltig rättning utan ändring, blockerat helt sparande och oförändrad historik före rättning." }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **1 konflikt i ditt utkast**. Läs orsaken och ditt bevarade
   förslag med **Osäkert uppgivet**. Stäng med Escape.
2. Öppna **Skriv till Skyttel → Visa utkastet**. Läs blockeringen och
   det oberoende förslaget. Välj **Stäng textvyn** och återvänd till konflikten.
3. Nå **Rätta ändpunkter** med tangentbord och aktivera med Enter.
   Kontrollera fokus på rubriken **Rätta blockerat samband** och läs
   förklaringen om befintliga ändpunkter.
4. Välj Lo Exempel i **Till objekt**. Kontrollera att borttagna Molnmusik
   inte erbjuds. Behåll övriga uppgifter och välj **Lägg i utkastet** med
   tangentbord. Läs bekräftelsen, stäng dialogen och granska utkastet.
5. Välj **Spara hela utkastet**. Kontrollera sparbekräftelsen. Stäng textvyn. Öppna
   **Tabell** och **Samband för Lo Exempel** för att läsa det sparade
   sambandet och det oberoende objektet.

**Förväntat resultat:**

- Konfliktlistan förklarar att ett objekt saknas och att hela sparandet
  väntar. Sambandsförslaget finns kvar med sitt innehåll.
- Rättningsformuläret fungerar utan dragning eller tal, med synligt fokus,
  begripliga etiketter och utan vågrät rullning vid den valda bredden.
- Det rättade sambandet behåller osäkerheten och visas efter sparandet.
  Det oberoende objektet sparas samtidigt. Molnmusik återställs inte.

**Kvarstående mänsklig observation:** Faktisk uppläsning, fysiskt
mobilt tangentbord, förstoring och omflöde bedöms i områdets befintliga
hjälpmedelsfall. Automatiken utgör inget mänskligt godkännande.

### UTKAST-153: skilj lika etiketter åt och kombinera egenskaper och ordning

**Syfte:** Välja rätt uppgift utan att förlora oberoende ändringar.

**Användare:** Alex och Robin i samma syntetiska hushåll.

**Förutsättningar:** Skapa Cykeln med tre fria egenskaper, alla med
etiketten Samma: ett tal med värdet 1, en text med värdet Tidigare och
ett ja/nej-värde Ja, i den ordningen. Spara kartan.

**Separat förberedelse:** Alex ändrar talets etikett till Egen etikett,
flyttar ja/nej-egenskapen före texten och lägger till Eget tillägg utan
datatyp. Lägg ändringarna i utkastet utan att spara. Robin ändrar talets
datatyp till ja/nej och värdet till Nej, texten till Sparad ändring och
det ursprungliga ja/nej-värdet till Nej. Robin flyttar texten före den
första egenskapen, lägger till Annans tillägg utan datatyp och sparar.
Återvänd till Alex och försök spara; inget från det försöket får sparas.

**Automatiskt motsvarande test:**
[property-conflicts.test.tsx](../../tests/browser/property-conflicts.test.tsx),
UTKAST-153, använder riktig Chromium och produktionsstilar med styrda
svar för konfliktvalet. Beständigt sparande och omstart verifieras separat
genom HTTP med två autentiserade användare, riktig server och SQLite.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": { "runner": "vitest", "suite": "browser", "spec": "tests/browser/property-conflicts.test.tsx", "caseId": "UTKAST-153" },
  "reference": "320 × 900, Chromium, ljust tema. Tangentbordsval av atomärt egenskapsinnehåll och motstridig ordning. Styrd konfliktgräns; ingen faktisk lagring i webbläsarfallet.",
  "outcomes": ["Lika etiketter skiljs åt med egenskapens nummer och jämförelsen visar tidigare, sparat och föreslaget innehåll.", "Oberoende ändringar kombineras utan extra val. Både egenskapsvalet och ordningsvalet krävs före bekräftelse.", "Förhandsvisningen behåller båda användarnas tillägg och oberoende värden. Enter och mellanslag fungerar, fokus börjar på rubriken och resultatet meddelas utan gemensamt sparande."],
  "evidence": [
    { "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/property-conflicts-http.test.ts", "title": "independent equal-label property edits and additions combine for objects and relationships and persist after restart", "purpose": "Separata identiteter, lika etiketter, beständig ordning efter sparande och SQLite-omstart för objekt och samband." },
    { "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/property-conflicts-http.test.ts", "title": "atomic property and delete-edit choices preserve independent work and require fresh approval for both entity kinds", "purpose": "Etikett, datatyp och värde som en enhet, borttagning mot ändring, korrekt upphovsperson och blockerat helt sparande utan ändring av historiken." },
    { "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/property-conflicts-http.test.ts", "title": "contradictory property orders require a choice and preserve every selected identity and independent value", "purpose": "Uttryckligt ordningsval behåller oberoende innehåll och alla valda identiteter på både objekt och samband." }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Visa hushållet i 320 pixlars bredd. Öppna **1 konflikt i ditt utkast**.
   Kontrollera fokus på rubriken **Granska konflikter**.
2. Jämför **Sparat i kartan nu** med **Ditt förslag**. Läs egenskapens
   nummer, tidigare innehåll och hela värdet med datatyp. Kontrollera
   att den andra egenskapens Sparad ändring kombineras utan extra val.
3. Nå **Egen etikett · egenskap 1** på förslagssidan med Tab och välj med
   Enter. Kontrollera att **Lägg valen i utkastet** fortfarande är spärrad.
4. Nå **Egenskapernas ordning** på förslagssidan och välj med mellanslag.
   Läs resultatet: Egen etikett har talet 1, texten Sparad ändring och
   det ursprungliga ja/nej-värdet Nej finns kvar, liksom båda tilläggen.
5. Bekräfta **Lägg valen i utkastet** med Enter. Läs beskedet att valen
   finns i utkastet och att kartan sparas separat. Stäng med Escape.

**Förväntat resultat:** Numren skiljer lika etiketter åt. Varje verkligt
motstridigt val krävs, och oberoende innehåll behålls. Dialogen fungerar
utan dragning, tal eller vågrät rullning. Bekräftelsen ändrar utkastet;
ett aktuellt uttryckligt sparbesked behövs för att ändra kartan.

**Kvarstående mänsklig observation:** Faktisk skärmläsaruppläsning,
fysiskt mobilt tangentbord, kontrast och förstoring bedöms i områdets
hjälpmedelsfall. Automatiken utgör inget mänskligt godkännande.

### UTKAST-155: återta objektborttagning efter granskning av nya följder

**Syfte:** Behålla ett nytt sparat samband när dess objektborttagning återtas.

**Användare:** Alex och Robin i samma syntetiska hushåll.

**Förutsättningar:** Alex har föreslagit att ta bort Lo Exempel och lagt
till Oberoende förslag i sitt utkast. Robin sparar därefter ett samband
från Lo Exempel till Molnmusik. Använd 320 × 900 och ljust tema.

**Separat förberedelse:** Starta den
[tillfälliga
konfliktinstallationen](#bevarade-konfliktval-och-kontrollerat-utfall)
och välj `new-connections`. Behåll samma hushåll genom fallet. Avsluta
med `quit` och välj en ny installation inför omprov.

**Automatiskt motsvarande test:**
[changed-removal.spec.ts](../../tests/integration/changed-removal.spec.ts),
UTKAST-155. Protokollunderlaget använder riktig server och SQLite med två
autentiserade användare och verifierar separat begärda sambandsborttagningar.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": { "runner": "playwright", "suite": "integration", "spec": "tests/integration/changed-removal.spec.ts", "caseId": "UTKAST-155" },
  "reference": "320 × 900, Chromium, ljust tema. Nytt sparat samband efter förslag om objektborttagning. Återtagning efter uttrycklig granskning av följderna.",
  "outcomes": ["Objektets och det nya sambandets borttagning kräver egna val i konfliktfönstret med rubrikfokus och tangentbord.", "Det granskade sambandet anges som en följd av objektborttagningen. Bekräftelsen listar objektets och sambandets förslag, med fokus på Avbryt. Efter bekräftad återtagning med tangentbord försvinner båda förslagen ur utkastet; oberoende arbete finns kvar.", "Efter separat sparande finns Lo Exempel, det nya sambandet till Molnmusik och det oberoende objektet kvar."],
  "evidence": [{ "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/changed-removal-http.test.ts", "title": "withdrawing an object removal restores newly reviewed connections while preserving independent deletions and work", "purpose": "Inkommande samband, självsamband, tomma egenskaper och separat sambandsborttagning med verkligt beständigt samlat sparande." }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **1 konflikt i ditt utkast**. Kontrollera fokus på rubriken
   **Granska konflikter** och läs det nya sambandet.
2. Nå objektets **Föreslagen borttagning** med Tab och välj med Enter.
   Nå sambandets **Föreslagen borttagning av sambandet** och välj med
   mellanslag. Välj **Lägg valen i utkastet** och läs bekräftelsen.
3. Stäng med Escape och öppna **Skriv till Skyttel → Visa utkastet**.
   Läs **Följer objektborttagning: Lo Exempel.** på sambandsraden.
4. Återta Lo Exempels borttagningsförslag med radens ta bort-knapp och
   Enter. Läs **Ta bort förslaget och dess beroenden?** och kontrollera att
   listan innehåller endast Lo Exempels objektförslag och sambandsförslaget
   **Lo Exempel → Använder → Molnmusik**. Kontrollera fokus på **Avbryt**.
   Nå **Ta bort** med Tab och bekräfta med Enter. Kontrollera att även
   sambandets borttagning försvinner ur utkastet, medan **Oberoende förslag**
   finns kvar.
5. Välj **Spara hela utkastet**. Läs sparbekräftelsen och öppna **Tabell**.
   Kontrollera Lo Exempel och Oberoende förslag. Öppna **Samband för Lo
   Exempel** och läs sambandet till Molnmusik.

**Förväntat resultat:** Återtagningen återger det sparade sambandet efter
granskade följder. Det oberoende arbetet sparas separat. Ingen dragning
eller tal krävs.

### UTKAST-156: granska ytterligare borttagningsföljder före nytt sparande

**Syfte:** Ett godkännande får inte omfatta samband som tillkommer senare.

**Användare och förutsättningar:** Alex och Robin i samma hushåll. Förbered
Lo Exempel, Molnmusik och Alex utkast som i UTKAST-155. Robin har sparat
det utgående sambandet. Behåll Robin inloggad i en separat webbläsare.

**Automatiskt motsvarande test:**
[changed-removal.spec.ts](../../tests/integration/changed-removal.spec.ts),
UTKAST-156, förlägger Robins andra sparande mellan Alex sparbesked och
serverns slutkontroll. HTTP/MCP-underlaget verifierar också en tredje
förändring med självsamband, gamla försök, oförändrat utkast och historik.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": { "runner": "playwright", "suite": "integration", "spec": "tests/integration/changed-removal.spec.ts", "caseId": "UTKAST-156" },
  "reference": "Chromium, ljust tema, syntetiska medlemmar i separata sessioner. Ett utgående samband granskas; ett inkommande samband tillkommer före slutkontrollen.",
  "outcomes": ["Det gamla sparbeskedet avvisas med ett begripligt besked om att inget sparas. Övrigt arbete finns kvar.", "Aktuellt underlag visar den ytterligare följden och kräver nytt uttryckligt val. Båda sambandsborttagningarna och oberoende arbete visas före det nya sparandet.", "Ett separat nytt sparbesked genomför den samlade borttagningen. Lo Exempel och båda sambanden är borta, medan det oberoende objektet finns kvar."],
  "evidence": [
    { "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/changed-removal-http.test.ts", "title": "HTTP rejects each expanded removal approval until current review and a fresh atomic save", "purpose": "Flera samtidiga autentiserade klienter, gamla godkännanden, gammalt konfliktval, inkommande/utgående/självsamband, atomiskt kvitto och oförändrad historik vid avvisning." },
    { "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/changed-removal-http.test.ts", "title": "MCP rejects each expanded removal approval until current review and a fresh atomic save", "purpose": "Samma skydd och helt bevarat utkast via ansluten MCP-klient med verklig åtkomst, versioner och nytt operations-ID." }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex öppnar konflikten, väljer objektets och det utgående sambandets
   föreslagna borttagning och **Lägg valen i utkastet**. Läs bekräftelsen
   och öppna hela utkastet.
2. Robin sparar ett inkommande samband från Molnmusik till Lo Exempel.
   Alex väljer **Spara hela utkastet** från det tidigare granskade utkastet.
   Läs **Utkastet kunde inte sparas.** och **Inget sparades av detta
   försök.** Stäng med Escape.
3. Stäng textvyn och välj **Hämta aktuellt underlag**. Öppna konflikten
   igen och välj **Visa aktuell jämförelse**. Läs och välj det nya
   sambandets borttagning tillsammans med objektets. Välj **Lägg valen i
   utkastet**.
4. Läs hela utkastet: båda sambandsborttagningarna och Oberoende förslag
   ska finnas med. Välj **Spara hela utkastet** igen och läs bekräftelsen.
5. Öppna **Tabell**. Lo Exempel ska vara borta och Oberoende förslag ska
   finnas kvar. Öppna **Samband för Molnmusik** och kontrollera att inga
   samband finns kvar.

**Förväntat resultat:** Ett gammalt sparbesked utökar aldrig borttagningen.
Ny aktuell granskning följs av ett separat sparbesked. Avvisningen behåller
hela arbetet; det nya godkända sparandet genomför alla följder tillsammans.

**Kvarstående mänsklig observation för UTKAST-155/156:** Faktisk uppläsning,
fysiskt tangentbord, förstoring och omflöde bedöms i områdets befintliga
hjälpmedelsfall. Automatiken utgör inget mänskligt godkännande.

## Avvecklat tekniskt underlag

I [draft-conflicts.spec.ts](../../tests/integration/draft-conflicts.spec.ts)
ersätter UTKAST-137 det fristående tekniska testet “independent users save
unrelated objects without a meaningless conflict”. Två samtidiga privata
utkast, två lyckade oberoende sparanden, faktisk omstart och båda medlemmarnas
läsning av exakta objektidentiteter och värden ingår i samma formulärflöde.
Ingen funktionell fallidentitet avvecklas. Den separata direkta HTTP-kedjan
upprepas inte; båda medlemmarnas förslag och sparanden görs genom Tabell.

## Flyttat tekniskt underlag

Det tekniska konfliktprovet i UTKAST-03:s metadata körs i
[draft-conflicts-http.test.ts](../../tests/unit/server/draft-conflicts-http.test.ts)
i Vitests serverprojekt med samma testtitel. Hela kontrollen av samma ägare
i oberoende sessioner, inaktuella och ogiltiga konfliktval, gamla
utkastversioner, privata utkast, uttryckligt nytt sparande och återkallat
medlemskap består. Riktiga externa HTTP-anrop, sessioner och SQLite behålls.
Oanvända webbläsarfixturer tas bort; ingen assertion eller funktionell
fallidentitet avvecklas och ingen konfiguration förloras. Flytten eliminerar
inte protokollflödet och innebär inget löfte om snabbare körning.

## Avvecklade fall för typstyrda fält

UTKAST-65, UTKAST-74 och UTKAST-138 är avvecklade och får inte
återanvändas. Deras typstyrda datatyper, ersättningsfält och bekräftade
fältförlust saknar motsvarighet i den fria egenskapsmodellen.
Typrättning med bevarade egenskaper verifieras i UTKAST-66 och UTKAST-72;
egenskapernas egna datatyper och typbyten verifieras i fallen för
[fria egenskaper](free-properties.md).

Fria egenskaper bevarar sina egna etiketter även vid typbyte eller kastat
typförslag. UTKAST-18, UTKAST-27, UTKAST-34, UTKAST-47, UTKAST-66,
UTKAST-72, UTKAST-93 och UTKAST-147 behåller sina identiteter med den
modellen. Typstyrda dolda svar, datumberoende status och förlustdialoger
har avvecklats. Dessa rena beteenden har godkänd täckningsförlust; de
fortsatta fallen skyddar full läsning, bevarade värden och explicit status.
