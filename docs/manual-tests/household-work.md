# Manuella testfall för bevarat hushållsarbete

Fallen gäller tillfälliga besök i befintliga vyer under samma användning.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex är administratör i ett separat provhushåll. Robin är medlem och
använder en separat webbläsarprofil. Använd konfigurerade testidentiteter
eller den kontrollerade miljön nedan, aldrig verkliga hushållsuppgifter.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

1. Förbered en
   [separat provdatabas](../development/devcontainer.md#disposable-local-database).
   Skapa hushållet och ge Robin tillgång enligt
   [inbjudningsguiden](../user-guide/access.md#bjud-in-en-skyttel-användare).
2. För samtalsfallen används den kontrollerade
   [kostnadsmiljön](costs.md#controlled-cost-fixture): den har både två
   identiteter, automatiska textsvar och tyst taltransport. Följ dess
   start- och stoppanvisningar. Logga in som Alex med Google och skapa
   ett tomt hushåll. Kör `text known` i startterminalen. För ARBETE-03,
   kör `identity robin`, logga in med Microsoft i en separat profil och
   bjud in Robins ID från Alex profil. Acceptera som Robin; behåll rollen
   medlem. Befintliga sessioner påverkas inte av identitetsvalet.
   Välj **Skriv till Skyttel**, därefter **Nytt samtal** och
   **Godkänn och starta** i medgivanderutan,
   sedan **Prata med Skyttel** när ett fall kräver samtal. Miljön ersätter
   taltransporten och provar inte fysiskt ljud.
3. Börja varje fall med en ny provinstallation eller ett tomt utkast utan
   pågående sparande. Behåll fliken och databasen under varje fall.
4. Välj enbart fallets angivna konfiguration. ARBETE-01 använder
   1280 × 900, ARBETE-10 använder 390 × 900 och ARBETE-11 använder
   320 × 900. Faktiskt hört skärmläsartal och fysisk mikrofon observeras
   separat i ARBETE-12/13; automationen utför inte dessa observationer.

## Tillfälliga vybyten

### ARBETE-01: avbruten formulärförlust och lagt utkast bevaras vid navigation

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-work.spec.ts",
    "caseId": "ARBETE-01"
  },
  "reference": "1280 × 900; fullständig navigation",
  "outcomes": [
    "Formulärtext och fokus bevaras efter Escape",
    "Förslag och sökning består vid återgång utan gemensamt sparande"
  ]
}
```
-->

**Syfte:** Behåll text vid avbruten förlust och redan lagda förslag vid vybyte.

**Användare:** Alex.

**Förutsättningar:** Tomt utkast, ingen aktiv redigering.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts).
ARBETE-01 vid 1280 × 900; de två smala fallen har egna identiteter nedan.

**Steg:**

1. Öppna **Tabell** och skriv **cykel** i **Sök objekt i tabellen**. Välj
   **Nytt objekt**,
   skriv **Oskickad cykel** och lägg till **Beskrivning** under
   **Fria egenskaper**, med datatyp **Text** och värdet **Behåll denna text**.
2. Stäng objektdialogen med krysset **Stäng objektdialogen**. Kontrollera att
   **Fortsätt redigera** är förvalt.
   Tryck Escape. Namn och beskrivning ska finnas kvar, fokus ska återgå
   till stängningskrysset och utkastet ska fortfarande vara tomt.
3. Välj **Lägg i utkastet och stäng**. Besök **Inloggningssätt** med
   tangentbord. Kontrollera rubrikfokus och att kartans kontroller är dolda.
4. Välj **Till startsidan** och öppna **Tabell**. Kontrollera sökningen
   **cykel**, namn **Oskickad cykel** och typ **Person**,
   expandera raden **Oskickad cykel** och läs **Behåll denna text (Text)**
   för egenskapen Beskrivning direkt i raden.

**Förväntat resultat:**

- Avbruten förlust ändrar varken formulärtext eller utkast.
- Det kompletta förslaget och tabellens sökning finns kvar efter återgång.
  Objektets uppgifter går att läsa i raden; dolda kontroller stör inte
  navigationen.
- Inget sparas i den gemensamma kartan och ingen historikpost skapas.

### ARBETE-10: formulärförlust och lagt utkast vid 390 pixlar

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-work.spec.ts",
    "caseId": "ARBETE-10"
  },
  "reference": "390 × 900; mobil navigation och synligt återställt fokus",
  "outcomes": [
    "Formulärtext och fokus bevaras efter Escape",
    "Förslag och sökning består vid återgång utan gemensamt sparande"
  ]
}
```
-->

**Syfte:** Skydda mobil navigation och synligt återställt fokus.

**Användare:** Alex.

**Förutsättningar:** Ny installation och tomt utkast, fönster 390 × 900.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
ARBETE-10.

**Steg:** Utför ARBETE-01:s fyra steg en gång vid denna bredd. Kontrollera
förvalt **Fortsätt redigera**, Escape och återställt stängningsfokus vid
steg 2, samt rubrikfokus och nåbara kontroller vid steg 3. Läs hela objektet
och den bevarade sökningen vid återgången i steg 4.

**Förväntat resultat:** Samma bevarade formulärtext, kompletta förslag och
tomma gemensamma karta som ARBETE-01, vid den valda smala bredden.

### ARBETE-11: formulärförlust och lagt utkast vid 320 pixlar

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-work.spec.ts",
    "caseId": "ARBETE-11"
  },
  "reference": "320 × 900; extremt smal navigation och nåbara formulär",
  "outcomes": [
    "Formulärtext och fokus bevaras efter Escape",
    "Förslag och sökning består vid återgång utan gemensamt sparande"
  ]
}
```
-->

**Syfte:** Skydda extremt smal navigation och nåbara formulär.

**Användare:** Alex.

**Förutsättningar:** Ny installation och tomt utkast, fönster 320 × 900.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
ARBETE-11.

**Steg:** Utför ARBETE-01:s fyra steg en gång vid denna bredd. Kontrollera
förvalt **Fortsätt redigera**, Escape och återställt stängningsfokus vid
steg 2, samt rubrikfokus och nåbara kontroller vid steg 3. Läs hela objektet
och den bevarade sökningen vid återgången i steg 4.

**Förväntat resultat:** Samma bevarade formulärtext, kompletta förslag och
tomma gemensamma karta som ARBETE-01, vid den valda smala bredden.

### ARBETE-02: samtal och mikrofon består och avslutas vid utloggning

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-work.spec.ts",
    "caseId": "ARBETE-02"
  },
  "reference": "1280 × 720; samma samtal vid navigation kontra avslut vid utloggning",
  "outcomes": [
    "Samtal och mikrofon bevaras vid navigation",
    "Utloggning avvecklar samtal och mikrofon"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Bevara samtalet och mikrofonens läge i en annan vy.

**Användare:** Alex.

**Förutsättningar:** Startat samtal enligt förberedelsen.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-02: conversation and microphone survive navigation and
end on logout”.

**Steg:**

1. Skicka en textfråga om cykeln. Den kontrollerade miljön svarar automatiskt
   **Det kontrollerade kostnadsprovet är klart.** Anteckna svaret och skriv
   ett nytt svar utan att skicka det.
2. Besök **Inloggningssätt**. Kontrollera att röstrutan visar **Lyssnar**
   och återgå med **Till startsidan**.
3. Kontrollera samtalets tidigare texter, det oskickade svaret och att
   mikrofonen fortfarande är på.
4. Besök **Inloggningssätt** igen och välj **Logga ut**.

**Förväntat resultat:**

- Samtalstext och oskickat svar bevaras. Mikrofonen förblir på.
- Röstrutan visar mikrofonens läge i den andra vyn utan att starta ett
  nytt samtal.
- Utloggning visar inloggningen, tar bort samtalet och stoppar mikrofonen.
  Den automatiserade mediegränsen verifierar stoppade ljudspår; ett
  fysiskt mikrofonprov redovisas separat.

### ARBETE-03: återkallad tillgång avvecklar oskickat arbete

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-work.spec.ts",
    "caseId": "ARBETE-03"
  },
  "reference": "1280 × 720; återkallelse i annan profil, avveckling före omladdning",
  "outcomes": [
    "Återkallelse stoppar mikrofon och formulär före omladdning",
    "Hushållet kan inte längre öppnas"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Bevarande ger inte fortsatt tillgång efter återkallelse.

**Användare:** Alex och Robin i separata profiler.

**Förutsättningar:** Robin har ett startat samtal och mikrofonen är på.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-03: revoked household access retires hidden forms and
microphone”.

**Steg:**

1. Som Robin, öppna **Nytt objekt**, skriv **Privat oskickad cykel** och
   behåll objektdialogen öppen utan att skicka formuläret.
2. Som Alex, öppna **Administrera tillgång**, återkalla Robins tillgång
   och bekräfta återkallelsen.
3. Vänta på Robins åtkomstkontroll, högst tio sekunder. Kontrollera
   mikrofonen och öppna hushållets adress igen.

**Förväntat resultat:**

- Robins mikrofon stoppas och objektdialogen avvecklas före omladdning.
- Återgång visar saknad tillgång. Det gamla formuläret är borta och
  hushållsinnehållet är inte åtkomligt.

### ARBETE-04: ersatt innehåll avvecklar tidigare arbete

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-work.spec.ts",
    "caseId": "ARBETE-04"
  },
  "reference": "1280 × 720; verklig ZIP-ersättning i andra fliken",
  "outcomes": [
    "Ersättning avvecklar formulär och mikrofon före omladdning",
    "Ny användning kräver nytt medgivande"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Gamla formulär och samtal får inte fortsätta mot ersatt innehåll.

**Användare:** Alex.

**Förutsättningar:** En fullständig export av det tomma provhushållet
enligt [exportguiden](../user-guide/household-export.md).

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-04: replaced household content retires hidden work and
microphone”.

**Steg:**

1. Starta samtal och mikrofon. Öppna **Nytt objekt** och skriv
   **Gammal oskickad cykel** utan att skicka texten.
2. Öppna samma hushåll i en andra flik med samma inloggning. Behåll
   det första formuläret öppet. I den andra fliken, öppna **Inställningar**
   och välj **Återimportera hushållet** i sidnavigationen. Välj exportfilen och
   **Kontrollera importfil**.
   Granska ersättningen och bekräfta uttryckligen att innehållet ska ersättas.
3. Invänta bekräftad ersättning i den andra fliken och mikrofonstopp
   samt avvecklat formulär i den första. Ladda om den första fliken,
   öppna textvyn och välj **Nytt samtal**. Avböj medgivandet.

**Förväntat resultat:**

- Nuvarande tillgång består, men den tidigare mikrofonen och samtalet
  avslutas. Ett nytt samtal kräver en ny start.
- Det gamla formuläret är borta. Det återimporterade tomma utkastet visas.
- Om innehållet tillfälligt är spärrat visas ett besked och kartarbetet
  kan inte fortsätta förrän innehållet är tillgängligt igen.

### ARBETE-07: väntande radering stoppar tidigare arbete före omladdning

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-work.spec.ts",
    "caseId": "ARBETE-07"
  },
  "reference": "1280 × 720; öppet oskickat formulär och registrerat sparande vid väntande städning",
  "outcomes": [
    "Radering avvecklar gammalt arbete före omladdning",
    "Stolens privata förslag och personliga vy bevaras"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kontrollera att oskickat formulär, samtal, mikrofon och ett
registrerat sparförsök avvecklas när radering spärrar innehållet, utan att
omladdning
döljer ett fel i avvecklingen.

**Användare:** Alex som aktuell administratör samt provmiljöns operatör.

**Förutsättningar:** Ny kontrollerad kostnadsmiljö enligt allmän förberedelse,
med `text known`. Operatören följer
[den separata förberedelsen](household-work-preparation.md#väntande-radering).
Skapa och spara
**Lampan att radera** och **Stolen att bevara**, båda av typen **Person**.
Ingen bild behövs i detta fall. Flytta lampan åt höger och stolen åt vänster
med **Navigera**. Redigera stolen, skriv **Oberoende privat förslag** i
beskrivningen och lägg i utkastet utan att spara hela utkastet.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-07: pending erasure retires microphone, unsent forms and
an admitted save before reloading”.

**Steg:**

1. I flik A, öppna textvyn och slå på mikrofonen. Skicka en fråga, invänta det
   kontrollerade svaret och skriv **Gammalt oskickat svar** utan att skicka
   det. Öppna **Visa utkastet** i textvyn. Öppna samma installation i en andra
   vanlig flik B
   med samma inloggning. Där öppnar du **Nytt objekt** och skriver
   **Gammal oskickad cykel** utan att lägga det i utkastet. Behåll
   objektdialogen öppen i flik B utan omladdning.
   Ett oskickat objekt spärrar sparandet i sin egen flik; därför används
   separata flikar för formuläret och det väntande sparandet.
2. Be operatören installera [sparförberedelsens krok](household-work-preparation.md#väntande-radering)
   i flik A. Invänta bekräftelse att kroken är installerad före nästa steg.
   Begäran hålls först när du väljer Spara.
3. I **Utkastet**, välj **Spara hela utkastet**. Vänta på operatörens
   bekräftelse att försöket är registrerat och sparbegäran hålls kvar.
   Stäng **Spara utkastet** med krysset; försöket
   fortsätter. Öppna **Inställningar → Permanent radering**.
   Mikrofonen ska fortfarande vara på. Välj endast lampan och granska.
   Stolen och dess privata beskrivning ska inte visas i omfattningen.
4. Be operatören öppna
   [databasläsaren](household-work-preparation.md#väntande-radering)
   före bekräftelsen. Invänta operatörens bekräftelse att läsaren är öppen.
5. Bekräfta med exakt **RADERA PERMANENT**. Invänta besked om
   väntande städning. Behåll raderingssidan öppen för samma ärende.
   **Ladda inte om någon flik.** Inom tio sekunder ska mikrofonen i flik A
   stoppas och det oskickade formuläret i flik B avvecklas. Öppna
   **Tillbaka till kartan** i en ny flik:
   innehållet ska vara spärrat. En export i en separat flik ska också avvisas.
6. Be operatören släppa den gamla sparbegäran enligt förberedelsen.
   Ingen sparbekräftelse får visas och inget nytt sparande ska starta.
   Raderingen ska fortfarande vänta på städning.
7. Be operatören släppa databasläsaren enligt förberedelsen. Invänta
   bekräftelse att läsaren är släppt. Välj uttryckligen **Försök slutföra
   raderingen**. Samma ärende ska slutföras. Bara lampan raderas; stolen
   behålls.
8. Välj **Läs in kartan på nytt**. Öppna **Skriv till Skyttel** utan att
   starta ett samtal: tidigare dialog och oskickat svar ska saknas.
   Välj uttryckligen **Nytt samtal** och kontrollera ett nytt medgivande.
   Avböj, öppna **Visa utkastet** och läs stolens fullständiga privata förslag:
   **Stolen att bevara**, **Person**, **Oberoende privat förslag (Text)**.
   Det gamla objektformuläret
   och sparförsökets återförsök ska saknas. Stolen, dess privata förslag och
   placering är kvar; lampan är borta och Alex är fortfarande administratör.

Om fallet avbryts: be operatören släppa både sparbegäran och databasläsaren
enligt förberedelsens återställning. Slutför ett eventuellt väntande
raderingsärende innan
provmiljön avslutas enligt kostnadsfallets stoppanvisningar.

**Förväntat resultat:**

- Vanlig navigation bevarar arbetet före raderingen. Innehållsspärren
  avvecklar däremot mikrofon, formulär och väntande sparande före omladdning.
- Den automatiserade mediegränsen verifierar att ljudspåret är avslutat
  och att oskickade formulär tas bort. Den kontrollerade transporten provar
  inte fysisk mikrofon eller verkliga externa modellsvar.
- En uttrycklig radering och ett uttryckligt slutförande använder samma
  identifierare. Automationen jämför hela det oberoende privata utkastet,
  kvarvarande objekt, typer och personliga vyer samt exakt en versionsökning.

### ARBETE-05: samma sparförsök kan återhämtas efter vybyte

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-work.spec.ts",
    "caseId": "ARBETE-05"
  },
  "reference": "1280 × 720; genomförd transaktion med förlorat svar under navigation",
  "outcomes": [
    "Okänt genomfört sparande består vid navigation",
    "Samma sparande återhämtas med ett objekt och en historikhändelse"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Ett okänt utfall får inte glömmas vid navigation.

**Användare:** Alex.

**Separat förberedelse:** Operatören använder separat HTTPS-testinstallation och
den styrda
transporten i [SPAR-05](operations.md), med samma vanliga autentisering.
Förbered ett tomt hushåll och styr endast dess leverans; ersätt inga svar.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-05: navigation preserves a save attempt after its
response disappears”.

**Steg:**

1. Välj **Nytt objekt**, skriv **Sparad cykel** och välj **Lägg i utkastet
   och stäng**. Be operatören hålla nästa sparbesked efter transaktionen
   enligt SPAR-05:s förberedelse.
   Öppna **Visa utkastet** och välj **Spara hela utkastet**. Vänta på
   operatörens bekräftelse att sparandet genomförts och beskedet hålls kvar.
2. Stäng **Spara utkastet** med krysset och besök **Inloggningssätt**.
   Kontrollera att återkopplingen fortfarande visar ett väntande sparande.
   Be operatören tappa det kvarhållna svaret enligt förberedelsen. Kontrollera
   okänt sparutfall även
   utanför kartan; starta inget nytt försök.
3. Återgå med **Till startsidan**. Välj **Visa sparandet**, därefter
   **Kontrollera sparandet igen**. Kontrollera **Utkastet är sparat** och
   att sparmodalen stängs. Läs den enda sparhändelsen i **Rapporter →
   Ändringshistorik**. Ladda om och kontrollera att **Sparad cykel** finns
   exakt en gång i **Tabell**.

**Förväntat resultat:**

- Väntande och okänt utfall finns kvar även utanför kartan. Kontrollen
  gäller samma sparförsök; den skickar inte ett nytt sparande.
- Verifierat sparande visas först efter serverns kvitto. Den verkliga
  transaktionen skapar exakt ett objekt och en historikhändelse.
- Automationen använder riktig HTTP och SQLite med styrd svarleverans.
  Fysisk enhet och skärmläsare redovisas separat; vanliga nätverksavbrott
  kan inte bevisa att svaret tappades efter transaktionen.

### ARBETE-06: urval och personlig vy består vid storleksbyte

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-work.spec.ts",
    "caseId": "ARBETE-06"
  },
  "reference": "1280 × 900 till 390 × 844; urval och personlig placering",
  "outcomes": [
    "Urval, höjdhjälp och personlig placering består vid storleksbyte"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Behålla valt objekt och egna kartinställningar vid återgång.

**Användare:** Alex.

**Förutsättningar:** Datorfönster och tomt utkast.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-06: selection and personal map view survive navigation
and resizing”.

**Steg:**

1. Skapa **Min cykel** med **Nytt objekt**, lägg objektet i utkastet och
   spara genom **Visa utkastet → Spara hela utkastet**. Invänta sparbeskedet,
   stäng textvyn och välj cykelns namngivna kartetikett.
2. Öppna **Navigera**. Välj **Flytta Min cykel: höger**, invänta sparad
   personlig vy och markera **Visa höjdhjälp**.
3. Besök **Inloggningssätt**, minska fönstret till mobilstorlek och
   återgå med **Till startsidan**.
4. Fokusera **Min cykel**, tryck Skift+F10 och välj **Visa uppgifter för Min
   cykel**.
   Läs **Min cykel**, typ **Person** och **Ej uppgivet** för beskrivning.
   Välj **Stäng uppgifterna**
   och kontrollera kartans urval, **Visa höjdhjälp** och personlig placering.

**Förväntat resultat:**

- Urvalet av cykeln, Navigation och **Visa höjdhjälp** består.
- Den personliga placeringen är densamma efter återgång.

## Sammanhängande familjearbete

### ARBETE-08: familjeabonnemang från inloggning till delad karta

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/connected-work.spec.ts",
    "caseId": "ARBETE-08"
  },
  "reference": "1280 × 720; hela familjekedjan med kontrollerat tal",
  "outcomes": [
    "Hela familjeärendet sparas och återläses efter omstart",
    "Fullständiga värden och separat privat arbete för båda medlemmarna"
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/assistant-work.spec.ts",
      "caseId": "AI-08",
      "purpose": "Komplett extern familjekedja med SDK och fullständig läsning"
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/assistant-work.spec.ts",
      "caseId": "AI-09",
      "purpose": "Nytt utkast stoppar gammalt medgivande"
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/assistant-work.spec.ts",
      "caseId": "AI-10",
      "purpose": "Beständigt kvitto vid förlorat svar och omstart"
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/assistant-work.spec.ts",
      "caseId": "AI-11",
      "purpose": "Identitetsfrågor blockerar sparande och kastade förslag består"
    },
    {
      "kind": "technical",
      "spec": "tests/integration/household-work-preparation.spec.ts",
      "title": "literal household preparation completes the family tools on seeded public installation",
      "purpose": "Exakta publicerade verktyg och grafikavbrott i befolkad referens; tidigare objekt och kvitto samt meningsfullt separat privat arbete bevaras genom rättelse, sparande och omstart. Kedjan upprepas inte från ett tomt hushåll."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Prova ett oavbrutet arbete genom inloggning, text, kontrollerat
tal, privata förslag, fullständiga läsdialoger, rättelse, Inställningar,
gemensamt sparande, omstart och en annan medlems vy.

**Användare:** Alex och Robin i separata webbläsarprofiler.

**Förutsättningar:** Starta en ny tom installation enligt den
[kontrollerade röstguiden](voice-assistant.md#controlled-voice-fixture).
Använd inte `seed-family`. Miljön ersätter inloggningsleverantörer, modell,
mikrofon och ljudtransport. Den provar inte externa konton eller verkligt tal.
Behåll samma flikar och databas fram till den uttryckliga omstarten.

**Separat förberedelse:** Operatören följer
[hela verktygskedjan](household-work-preparation.md#sammanhängande-familjeärende)
vid de nedan angivna UI-stegen. Kommandon, revisioner och identifierare
kontrolleras där.

**Integrationstest:**
[connected-work.spec.ts](../../tests/integration/connected-work.spec.ts),
testfallet “ARBETE-08: familjeabonnemanget går från inloggning och samtal
till gemensamt kvitto och privat fortsatt arbete”.

**Steg:**

1. Börja utloggad. Använd Tab och Enter för **Fortsätt med Google** och
   **Fortsätt till Google**. Kontrollera rubrikfokus, skriv
   **Hushållet Linden** och välj **Skapa hushåll**. Be operatören välja Robin
   enligt förberedelsen. Logga in
   med Microsoft i Robins separata profil. Låt operatören hämta Robins
   profilidentifierare för inbjudan och återställa Alex som nästa identitet.
   Följ
   [inbjudningsguiden](../user-guide/access.md#bjud-in-en-skyttel-användare)
   för att bjuda in och acceptera som Robin. Som Robin, välj **Nytt objekt**,
   skriv **Robins notering** och **Lägg i utkastet och stäng**.
   Spara inte. Den gemensamma kartan ska fortfarande vara tom.
2. Som Alex, välj **Skriv till Skyttel** och **Nytt samtal**. Kontrollera
   medgivanderutan och välj **Godkänn och starta**. Skicka
   **Föreslå Familjens Molnmusik, ett familjeabonnemang för 179 SEK
   per månad.** Be operatören släppa katalogläsningen och abonnemangsförslaget
   enligt
   förberedelsen. Läs **Familjens Molnmusik**, typ **Abonnemang**, inga
   beskrivningsegenskaper och **179 / SEK / månad**: stäng textvyn, öppna
   **Tabell**
   och välj **Redigera Familjens Molnmusik**. Läs namn, vald **Objekttyp**
   i **Grunduppgifter**. Öppna **Fria egenskaper** och
   läs de tre raderna **Pris**, **Valuta** och **Betalningsintervall**,
   var och en med datatyp **Text** och rätt värde. Stäng
   utan ändring med Escape och återgå till textvyn.
   Inget objekt eller kvitto är gemensamt; Robins notering är oförändrad.
3. Välj **Prata med Skyttel**. Be operatören släppa transkriptionen,
   personförslaget och sambandet
   enligt förberedelsen. Stäng textvyn, öppna **Tabell** och välj
   **Redigera Kim Exempel**. Läs namn **Kim Exempel**, vald **Objekttyp
   Person** och inga fria egenskaper. Stäng med Escape utan ändring. Välj
   **Samband för Kim Exempel** och läs det fullständiga sambandet:
   **Från objekt Kim Exempel**, **Typ Betalar**, **Riktning Betalar**,
   **Till objekt Familjens Molnmusik**.
   Hela utkastet ska visa två objekt och ett samband. Inget är sparat.
4. I **Tabell**, välj **Redigera Familjens Molnmusik**.
   Öppna **Fria egenskaper** och rätta **Pris** till **189**. Lägg till
   en textegenskap **Beskrivning** med värdet **Rättad för hand** och
   välj **Lägg i utkastet och stäng**. Invänta avslutat formulär och
   beskedet **Ändringen finns i ditt utkast. Kartan sparas separat.**
   Fäll ut abonnemangets rad och läs alla uppgifter direkt i raden.
   Kontrollera namn, typ, beskrivning och alla tre märkta ekonomiska
   värden i den expanderade raden; fäll ihop raden. Välj
   **Redigera Familjens Molnmusik**, läs samma grunduppgifter och öppna
   **Fria egenskaper**. Kontrollera varje etikett och dess
   **datatyp Text**. Stäng med Escape utan att ändra något.
   Läs Kims fullständiga uppgifter
   på samma sätt och kontrollera **Kim Exempel**, **Person** och
   att ingen egenskap Beskrivning finns. Fäll ihop raden och välj
   **Redigera Kim Exempel**. Skriv
   **Oskickat om Kim** i en ny textegenskap **Beskrivning** under
   **Fria egenskaper** utan att lägga i utkastet.
   Välj **Avbryt**, kontrollera förvalt **Fortsätt redigera** och tryck
   Escape. Kontrollera kvarvarande text. Välj **Avbryt** igen och
   **Kasta ändringarna och fortsätt**. Läs Kims uppgifter på nytt:
   bara en detaljvy för Kim ska finnas och den kastade texten ska saknas.
   Fäll ihop raden. Öppna textvyn och visa utkastet. Öppna **Visa förslaget**
   för båda objekten och Betalar-sambandet i tur och ordning. Kontrollera
   fullständiga värden, inklusive **189 / SEK / månad** och **Rättad för
   hand**, och stäng varje läsmodal med krysset. Ingen granskning ändrar
   utkastet eller den gemensamma kartan.
5. Skriv **Oskickat i samtalet** utan att skicka. Låt mikrofonen vara på
   och öppna **Inställningar**. Rubriken ska få fokus och kartarbetet döljas.
   Inställningarnas innehåll ska komma före kartans återkoppling om
   utkast och sparande. Läs de tre privata förslagens återkoppling och
   kontrollera att röstrutan visar **Lyssnar**.
   Välj **Tillbaka till kartan** och välj
   abonnemanget och Kim genom att expandera deras rader i **Tabell**.
   Fäll ihop varje rad med namnet innan nästa öppnas. Kontrollera
   båda objektens fullständiga namn och typer, abonnemangets Beskrivning
   och tre märkta ekonomiska värden samt att Kim saknar fria egenskaper.
   Läs **datatyp Text** för varje ekonomisk uppgift i abonnemangets
   fullständiga editor enligt steg 4 och stäng utan ändring. Öppna **Samband för
   Kim Exempel**, läs riktning och ändpunkter. Kontrollera att ingen egenskap
   **Uppgiftens säkerhet** har lagts till, och stäng
   läsmodalen. Återgå till textvyn och kontrollera samma detaljvy och
   samtalets oskickade text. Kims uttryckligen kastade text återkommer inte.
   Robins notering ska fortfarande vara privat.
6. Välj **Visa utkastet** i textvyn. Tabellen ska ha två objekt och ett
   samband. Granska **189 / SEK / månad**, med **Rättad för hand**, i
   abonnemangets uppgifter och återvänd sedan till **Skriv till Skyttel**.
   Ersätt samtalets oskickade text med **Spara hela utkastet nu.** och skicka.
   Be operatören släppa helhetssparandet enligt förberedelsen.
   Öppna **Rapporter → Ändringshistorik → Visa ändringarna**.
   Läs båda objektens namn och typ, abonnemangets egenskap Beskrivning
   och att Kim saknar fria egenskaper. Läs abonnemangets märkta
   **Pris 189**, **Valuta SEK**, **Betalningsintervall månad**, hela
   **Kim Exempel → Betalar → Familjens Molnmusik**, Alex som sparande
   användare och den visade tidpunkten. Öppna **Identifiera sparandet
   och användaren** för samma sparhändelse.
   Läs **Utkastet är sparat** under hushållsnamnet i tre sekunder.
   Kontrollera ett kvitto för båda objekten och sambandet, tomt Alex-utkast
   och välj **Tillbaka till arbetet** i Rapporter. Stäng textvyn och läs
   Kims fullständiga uppgifter genom **Tabell**. Kontrollera att
   **Oskickat om Kim** saknas både i detaljvyn och bland sparade egenskaper.
   Fäll ihop raden och återgå till textvyn. Kvittot
   finns kvar i **Rapporter → Ändringshistorik**, och
   mikrofonknappen finns kvar i verktygsraden. Robins privata notering
   ingår inte i kvittot.
7. Stäng av mikrofonen med **Prata med Skyttel**. Kontrollera att
   mikrofonknappen visar att mikrofonen är av. Be operatören starta om
   samma databas enligt förberedelsen och invänta bekräftad omstart.
   Ladda om Alex flik och öppna
   **Rapporter → Ändringshistorik → Visa ändringarna** för samma
   kvitto. Upprepa hela den märkta historikläsningen från steg 6,
   inklusive båda typerna, **Inga egenskaper.** för Kim, användare och tidpunkt.
   Läs sedan båda fullständiga objektformulären samt sambandets typ,
   riktning och ändpunkter i Tabell innan nästa privata rättelse.
   Oskickad lokal text
   behöver inte överleva den uttryckliga omladdningen.
8. Välj **Tillbaka till arbetet**. Som Alex, öppna **Tabell** och
   **Redigera Familjens Molnmusik**, rätta beskrivningen till
   **Alex privat efteråt**
   och lägg i utkastet utan att spara. Ladda om Robin. Robin ska se det
   gemensamma abonnemanget med **Rättad för hand**, **189 / SEK / månad**,
   Kim och Betalar-sambandet, samt enbart sin egen privata notering.
   Som Robin: välj **Redigera Familjens Molnmusik**, läs grunduppgifterna
   och de fria textegenskaperna Pris, Valuta och Betalningsintervall
   under **Fria egenskaper**.
   Stäng med Escape utan ändring. Läs **Kim Exempel**, **Person** och inga fria
   egenskaper genom **Redigera Kim Exempel** och stäng. Välj **Samband
   för Kim Exempel**, läs hela riktningen och båda ändpunkterna, och stäng
   modalens
   kryss. Kontrollera samma fullständiga historik från steg 6,
   inklusive typer, abonnemangets Beskrivning, Kims avsaknad av fria egenskaper,
   märkta ekonomiska värden, Alex och tidpunkt.
   Alex ska inte se
   Robins notering. Avsluta provmiljön med `quit` enligt röstguiden.

**Förväntat resultat:**

- Ett enda oavbrutet arbete går från tom installation till två gemensamma
  objekt och ett samband, med exakt ett sparande och samma kvitto efter omstart.
- Vanlig navigation bevarar samtalet, dess oskickade text och mikrofonläge.
  Läsmodalerna öppnas och stängs uttryckligen; formulärförlust kräver val.
  Endast det uttryckligen granskade utkastet sparas; lokala oskickade
  uppgifter och en annan medlems privata förslag ingår aldrig.
- Båda medlemmarna ser samma sparade information men skilda privata utkast.
  Automationen jämför hela kvittot, historiken och båda kartornas publika
  svar; enbart modellens text räknas inte som sparbevis.

**Separat tekniskt underlag:**
[De bevarade automatiska mediekontrollerna](household-work-preparation.md#separat-automatiskt-underlag-för-medielivslängd)
verifierar anslutningens och spårens livslängd genom Inställningar,
mikrofon OFF och omstart. De är separata från UI-stegen och det fysiska
ljudprovet ARBETE-13.

### ARBETE-09: samma familjearbete med text och listor utan grafik eller ljud

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/connected-work.spec.ts",
    "caseId": "ARBETE-09"
  },
  "reference": "1280 × 720; hela text- och listkedjan med faktisk grafikförlust utan ljud",
  "outcomes": [
    "Hela familjeärendet slutförs med faktisk grafikförlust utan ljud",
    "Samma fullständiga historik och privata gränser som röstfallet"
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/assistant-work.spec.ts",
      "caseId": "AI-08",
      "purpose": "Komplett extern familjekedja med SDK och fullständig läsning"
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/assistant-work.spec.ts",
      "caseId": "AI-09",
      "purpose": "Nytt utkast stoppar gammalt medgivande"
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/assistant-work.spec.ts",
      "caseId": "AI-10",
      "purpose": "Beständigt kvitto vid förlorat svar och omstart"
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/assistant-work.spec.ts",
      "caseId": "AI-11",
      "purpose": "Identitetsfrågor blockerar sparande och kastade förslag består"
    },
    {
      "kind": "technical",
      "spec": "tests/integration/household-work-preparation.spec.ts",
      "title": "literal household preparation completes the family tools on seeded public installation",
      "purpose": "Exakta publicerade verktyg och grafikavbrott i befolkad referens; tidigare objekt och kvitto samt meningsfullt separat privat arbete bevaras genom rättelse, sparande och omstart. Kedjan upprepas inte från ett tomt hushåll."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Genomföra samma arbete utan tal, ljuduppspelning eller grafisk karta.

**Användare:** Alex och Robin enligt ARBETE-08.

**Förutsättningar:** Ny tom kontrollerad installation enligt ARBETE-08.
Använd dess identiteter, faktiska verktygssvar och samma åtta steg.

**Integrationstest:**
[connected-work.spec.ts](../../tests/integration/connected-work.spec.ts),
testfallet “ARBETE-09: samma familjearbete fungerar med text och listor
utan grafik eller ljud”.

**Separat förberedelse:** Operatören använder
[grafikavbrottet utan ljud](household-work-preparation.md#grafikavbrott-utan-ljud)
vid varje profils första hushållsvisning och efter dess omladdningar.

**Steg:**

1. Följ ARBETE-08:s åtta steg en gång med följande ändringar vid respektive
   steg. Efter vardera profilens första hushållsvisning i steg 1, invänta
   **Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.** innan arbete.
   Använd sedan enbart Tabell, formulär och text. Välj aldrig mikrofonen.
2. I steg 3 skriver och skickar du **Kim Exempel betalar familjens
   Molnmusik.** i textfältet. Operatören släpper samma person och samband
   enligt förberedelsen. Alla fullständiga läsningar är kvar.
3. I steg 5 utelämnas kontrollen **Lyssnar**. I steg 7 utelämnas
   mikrofonavstängning; omstart med samma databas utförs fortfarande.
   Invänta operatörens nya grafikavbrott efter Alex omladdning och efter
   Robins omladdning i steg 8. Fullfölj hela historiken och bådas privata
   utkast; kör inte om tidigare steg efter avslutat sparande.

**Förväntat resultat:**

- Samma fullständiga slutresultat och privata gränser som ARBETE-08.
- Grafikavbrottet hindrar inte tabell, formulär, text, historik eller kvitto.
  Ingen mikrofonbegäran, röstanslutning eller ljuduppspelning behövs.
  Automationen räknar dessa medieanrop och kräver noll.
- Tabellens namngivna åtgärder ersätter grafisk träffning och dragning.
  Ett kontrollerat grafikavbrott är inte ett verkligt skärmläsarprov.

### ARBETE-12: faktiskt hört tal genom navigation och textalternativ

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Hör rubriker, namngivna kontroller, sparbesked och historik med NVDA; dolda kartkontroller får inte förekomma i navigeringen"
  },
  "reference": "Separat HTTPS-provinstallation; Windows, Chrome och NVDA",
  "outcomes": [
    "Hör rubriker, namngivna kontroller, sparbesked och historik med NVDA; dolda kartkontroller får inte förekomma i navigeringen"
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/household-work.spec.ts",
      "caseId": "ARBETE-01",
      "purpose": "Native UI-flöde med syntetisk transport; utför inte den mänskliga observationen"
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Hör rubriker, namngivna kontroller, sparbesked och historik med NVDA;
dolda kartkontroller får inte förekomma i navigeringen.

**Användare:** Alex och Robin i separata profiler.

**Kräver mänsklig observation:** Hör rubriker, namngivna kontroller, sparbesked
och historik med NVDA; dolda kartkontroller får inte förekomma i navigeringen.

**Separat förberedelse:** Följ
[den fysiska HTTPS-förberedelsen](../development/testing.md#physical-device-manual-preparation)
med nytt provhushåll och två egna testinloggningar. Använd verklig utrustning
och anteckna versioner. Lägg Robins meningsfulla notering i utkastet och
behåll den privat. Syntetiska kommandon och loopback används inte här.
För röst krävs redan godkänd leverantör och särskilt medgivande till dess
kostnad; konfigurerade nycklar innebär inte medgivande till betalda anrop.

**Steg:** Utför ARBETE-01 och ARBETE-09 med den riktiga utrustningen och fiktiva
uppgifter.
I familjekedjan används vanligt samtal för samma två objekt och samband;
kontrollera och rätta utkastet innan det uttryckliga sparandet. Vid
navigation ska samma text bestå. Kontrollera det riktiga sparbeskedet och
fullständig historik efter operatörens omstart med samma databas.
Lyssna på rubriken **Inloggningssätt**, återgångens namngivna formulär och
tabell samt **Utkastet är sparat**. Navigera med Tab och skärmläsarens
rubrik-/reglagenavigation: dolda kartkontroller ska varken nås eller läsas
upp på profilsidan. Med grafik avbruten ska text, listor och historik
fortfarande läsas upp. Anteckna faktiskt hörda ord och uteblivet tal;
DOM-semantik är inte denna observation.

**Förväntat resultat:** De faktiskt observerade orden, kontrollerna och
ljudgränserna stämmer med stegen. Anteckna godkänt, underkänt eller ej utfört
för varje observation. Radera provdata och avsluta båda inloggningarna.

### ARBETE-13: fysisk mikrofon och hörbart svar genom familjearbetet

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-microphone-audio",
    "observation": "Tala svenska i fysisk mikrofon och hör svaret, samma pågående röstläge genom Inställningar samt avslutad inspelning efter utloggning"
  },
  "reference": "Separat HTTPS-provinstallation; fysisk dator, mikrofon och högtalare",
  "outcomes": [
    "Tala svenska i fysisk mikrofon och hör svaret, samma pågående röstläge genom Inställningar samt avslutad inspelning efter utloggning"
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/connected-work.spec.ts",
      "caseId": "ARBETE-08",
      "purpose": "Native UI-flöde med syntetisk transport; utför inte den mänskliga observationen"
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Tala svenska i fysisk mikrofon och hör svaret, samma pågående
röstläge genom Inställningar samt avslutad inspelning efter utloggning.

**Användare:** Alex och Robin i separata profiler.

**Kräver mänsklig observation:** Tala svenska i fysisk mikrofon och hör svaret,
samma pågående röstläge genom Inställningar samt avslutad inspelning efter
utloggning.

**Separat förberedelse:** Följ
[den fysiska HTTPS-förberedelsen](../development/testing.md#physical-device-manual-preparation)
med nytt provhushåll och två egna testinloggningar. Använd verklig utrustning
och anteckna versioner. Lägg Robins meningsfulla notering i utkastet och
behåll den privat. Syntetiska kommandon och loopback används inte här.
För röst krävs redan godkänd leverantör och särskilt medgivande till dess
kostnad; konfigurerade nycklar innebär inte medgivande till betalda anrop.

**Steg:** Utför ARBETE-08 och ARBETE-02 med den riktiga utrustningen och fiktiva
uppgifter.
I familjekedjan används vanligt samtal för samma två objekt och samband;
kontrollera och rätta utkastet innan det uttryckliga sparandet. Vid
navigation ska samma text bestå. Kontrollera det riktiga sparbeskedet och
fullständig historik efter operatörens omstart med samma databas.
Tala **Kim Exempel betalar familjens Molnmusik** och hör svaret i
högtalaren. Besök Inställningar med mikrofonen på och kontrollera att
inspelning fortsätter i samma samtal. Stäng av mikrofonen och kontrollera
att nytt tal inte skickas. Starta ett nytt separat prov för ARBETE-02:
efter utloggning ska fysisk inspelning upphöra och gammalt tal inte höras
eller läggas i något utkast. Anteckna verkliga ljudobservationer.

**Förväntat resultat:** De faktiskt observerade orden, kontrollerna och
ljudgränserna stämmer med stegen. Anteckna godkänt, underkänt eller ej utfört
för varje observation. Radera provdata och avsluta båda inloggningarna.

## Bedömning och återstående manuella prov

Referensen 87ddb01, alternativ D i administrationsprovet, kräver att
kartarbete och mikrofon består när kartan döljs bakom andra vyer.
Dessa fall provar den livstiden i befintlig navigation. Panelernas placering och
byte på mobil beskrivs i [fria paneler](workspace-panels.md).

Automationen provar semantiska namn, rubrik- och formulärfokus, dolda
kontroller och funktionella flöden vid dator- och mobilbredder.
Kontrast, verklig zoom, skärmläsare, fysiska målplattformar och faktiskt
svenskt tal kräver separat manuell bedömning. Inga sådana prov eller
fullständig WCAG 2.2 AA-överensstämmelse intygas av integrationstesterna.

## Identiteter och underlag

ARBETE-01 behåller datorfallet. ARBETE-10 och ARBETE-11 identifierar dess
två kvarvarande smala konfigurationer; hela förloppet behålls i alla tre.
ARBETE-12/13 gör tidigare krav på faktisk skärmläsare och mikrofon explicita.
Inget fall pensioneras och ingen skyddad funktion tas bort. Tekniska
kvittovärden, nätverksutfall, spår och geometri ligger kvar i automationen.
