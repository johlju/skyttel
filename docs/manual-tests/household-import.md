# Manuella testfall för fullständig återimport

Testfallen omfattar uttrycklig ersättning, bevarad åtkomst, bildhistorik,
privata utkast, personliga placeringar, bakgrundsval och rättelser med
aktuellt underlag.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.
Bekräfta förberedelserna nedan före en manuell körning.

## Konfigurerade användare

Använd [en separat lokal
provdatabas](../development/devcontainer.md#disposable-local-database)
i devcontainern och värddatorns webbläsare. **Alex** är testrollen för den
konfigurerade första administratörens befintliga Google- eller
Microsoft-konto; kontot behöver inte heta Alex. Skapa hushållet **Linden**
med påhittade uppgifter. Om fallet inte säger annat loggar två profiler in
med samma konto. IMPORT-09–11 och IMPORT-13 använder även **Robin**,
en annan verifierad användare som bjuds in till provhushållet. Fallens
steg anger respektive roll. Ingen publik webbadress eller tunnel behövs.

## Allmän förberedelse

1. Starta en ny provdatabas enligt länken ovan inför varje fall. Skapa
   Linden och ett sparat objekt **Lampa från exporten**.
2. Hämta en fullständig export enligt
   [exportguiden](../user-guide/household-export.md). Spara ZIP-filen privat.
3. Ändra objektets namn till **Senare namn** och spara hela utkastet.
4. Återställ provmiljön mellan fallen. Radera hämtade testfiler efteråt.
   Vid omstart ska samma databas användas: följ bara guidens
   omstartskommando och behåll dess terminal öppen.

## Läs sparat och privat innehåll

När ett fall anger kartläsning: välj **Tillbaka till kartan**, sedan
**Tabell**. Vid **Läs in det återställda hushållet** läses importsidan om;
invänta omladdningen och välj därefter **Tillbaka till kartan → Tabell**.
Fäll ut det namngivna
objektet och läs hela namnet, beskrivningen och de värden som fallet anger.
Ett namn i en meny räcker inte för att verifiera objektets övriga värden.
När ett fall anger privat arbete: öppna **Skriv till Skyttel → Utkast**,
välj **Visa förslaget** för det aktuella objektet och läs dess fullständiga
uppgifter. Stäng dialogen och textvyn utan att spara eller kasta något.
Jämför med antecknade värden från förberedelsen. Använd en extra flik när
importsidan måste behålla sitt exakta försöks-ID eller sin felstatus.

## Bekräftad ersättning

### IMPORT-01: Ersätt hushållet med tangentbordet

**Syfte:** Kontrollera att förberedelse inte ändrar innehåll och att
ersättning kräver ett uttryckligt beslut från aktuell administratör.

**Användare:** Alex som administratör.

**Förutsättningar:** ZIP-filen och den senare namnändringen finns enligt
förberedelsen. Ingen annan ändrar hushållet under detta fall.

**Integrationstest:**
[household-import-ui.spec.ts](../../tests/integration/household-import-ui.spec.ts),
testfallet “IMPORT-01: an administrator reviews and explicitly replaces
household content with the keyboard”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-ui.spec.ts",
    "caseId": "IMPORT-01"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Kontrollera att förberedelse inte ändrar innehåll och att ersättning kräver ett uttryckligt beslut från aktuell administratör."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Inställningar → Återimportera hushållet** och läs omfattningen.
2. Välj ZIP-filen. Använd Tab till **Kontrollera importfil** och Enter.
3. Läs sammanställningen. Kontrollera i den andra profilen att **Senare
   namn** fortfarande finns. Ersättningsknappen ska ännu vara avstängd.
4. Använd tangentbordet för att markera bekräftelsen. Tryck Enter på
   **Ersätt hushållets innehåll** och invänta resultatet.
5. Läs in hushållet igen och kontrollera objektets namn. Starta om servern
   med samma databas och kontrollera innehåll och administration igen.

**Förväntat resultat:**

- Förberedelsen ändrar inget. Efter uttrycklig bekräftelse visas **Lampa
  från exporten**, och den senare namnändringen saknas.
- Alex är fortfarande administratör efter ersättning och omstart.
- Ett tydligt resultat visas. Ett uteblivet svar ska följas upp med
  **Hämta importens status**, inte tolkas som ett säkert misslyckande.

## Historik och gamla klienter

### IMPORT-06: återställ bildhistorik och fortsätt med aktuell rättelse

**Syfte:** Kontrollera att en återimport bevarar sparade
bildversioner, privata förslag och personliga placeringar, samtidigt som
gamla klientunderlag och sparförsök inte kan skriva tillbaka senare innehåll.

**Användare:** Alex i två separata webbläsarprofiler, A och B, med samma
administratörskonto. Profil B behöver två flikar under importen.

**Förutsättningar:** En ny lokal provdatabas enligt förberedelsen och inga
andra pågående sparförsök. Använd två tydligt olika små provbilder från
[bildförberedelsen](profile-images.md#allmän-förberedelse). Använd Chromium
med utvecklarverktyg i båda profilerna. Kör konsolkoden endast på provsidan.

**Integrationstest:**
[household-import-history.spec.ts](../../tests/integration/household-import-history.spec.ts),
testfallet “IMPORT-06: replacement preserves image history and private work,
rejects old save
attempts and permits ordinary corrections after restart”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-history.spec.ts",
    "caseId": "IMPORT-06"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Kontrollera att en återimport bevarar sparade bildversioner, privata förslag och personliga placeringar, samtidigt som gamla klientunderlag och sparförsök inte kan skriva tillbaka senare innehåll."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Använd de befintliga separata recepten **Fånga nästa sparbegäran**, **Prova båda
gamla sparbegärandena** och rensningen nedan, i profil A på samma ursprung och i
samma flik. Behåll deras exakta kod och `sessionStorage` genom omladdningen;
kopiera inga inloggningsuppgifter.

1. Före det verkliga bildsparandet i UI-steg 2: kör fångstkoden med
   `image` och meddela **Nästa bildsparande fångas**. Efter användarens
   Spara: invänta kvittot och **IMPORT-06: image sparat**. Meddela
   **Bildsparandet är fångat och bekräftat**.
2. Före det senare verkliga sparandet i steg 4: kör samma fångstkod
   med `later` och meddela **Nästa senare sparande fångas med tappat
   svar**. Efter Spara: kräv **IMPORT-06: later sparat**, som receptet
   ger först efter lyckat riktigt sparkvitto. Meddela **Samma senare
   sparande är genomfört och dess svar tappat**. Vanligt offline är
   inte denna gräns. Stäng konsolen inför den vanliga UI-läsningen.
3. Efter återimport och samma-databas-omstart i steg 6, före den nya
   rättelsen: kör **Prova båda gamla sparbegärandena** i samma flik.
   Jämför båda avvisningarna och oförändrad karta, privata utkast och
   historik enligt receptet. Meddela **Båda gamla begärandena avvisas
   utan ändring** innan användaren fortsätter den vanliga läsningen.
4. Efter den nya rättelsens sista omstart och läsning, vid steg 8:
   kör den befintliga rensningskoden och meddela **Fångade
   testbegäranden är rensade**. Stäng profilerna och städa bara
   provinstallationen enligt den befintliga guiden.

**Steg:**

1. I profil A: skapa två objekt med namnet **Lo Exempel** som föreställer samma
   påhittade person. Spara ett samband från det andra objektet med okänd
   målpunkt. Placera objekten på två igenkännliga platser i rymdkartan.
2. Lägg den första provbilden på det andra objektet och spara den. Lägg sedan
   samma provbild på det första objektet som ett vanligt bildförslag. Be
   driftansvarig förbereda fångst av nästa bildsparande och invänta
   installationsbekräftelse. Spara utkastet och invänta kvittot samt
   driftansvarigs bekräftelse av fångsten.
3. Lägg den andra provbilden som privat bildförslag på det första objektet. Låt
   förslaget vara osparat. Hämta en fullständig export i **Inställningar →
   Fullständig export** och behåll ZIP-filen privat.
4. I profil A: skapa **Senare objekt** och lägg det i utkastet. Be driftansvarig
   förbereda fångst av nästa senare sparande och invänta installationen. Välj
   **Spara hela utkastet**. Invänta driftansvarigs bekräftelse av verkligt
   genomfört sparande med tappat svar och kontrollera gränssnittets **Sparandet
   kunde inte bekräftas**. Välj inte att hämta kvittot igen. I profil B: öppna
   aktuell karta och kontrollera att **Senare objekt** finns; det visar att
   servern sparade innan svaret försvann. Börja skriva ett nytt objektförslag,
   men låt formuläret vara öppet utan att skicka det.
5. Öppna en andra flik i profil B och gå till **Inställningar → Återimportera
   hushållet**. Välj exporten från steg 3, granska rätt hushåll och bekräfta
   ersättningen. Försök sedan lägga den första flikens gamla öppna objektförslag
   i utkastet, innan servern startas om. Kontrollera att förslaget avvisas och
   inte syns i aktuell karta eller historik. Läs in aktuell karta när klienten
   begär det.
6. Starta om servern med samma databas enligt utvecklingsguiden. Ladda om profil
   A och B. Kontrollera kartan med båda objekten, den privata andra bilden och
   det ursprungliga bildkvittot. **Senare objekt** ska saknas. Be driftansvarig
   utföra den separata kontrollen av båda gamla sparbegärandena i samma profil
   och flik. Invänta bekräftelse att båda är avvisade med bevarade uppgifter,
   före den nya rättelsen. Läs sedan karta och historik igen; inga äldre försök
   får ha återinfört senare innehåll.
7. I profil B: kasta det återställda privata bildförslaget. Öppna det andra
   objektet, lägg till **Beskrivning** under **Fria egenskaper** med datatyp
   **Text** och värdet **Ny vanlig rättelse**, lägg förslaget i utkastet
   och spara. Starta om och kontrollera båda objektens bilder, samband,
   beskrivningar och personliga placeringar.
8. Be driftansvarig rensa de två lokalt fångade begärandena enligt förberedelsen
   och invänta bekräftelse. Stäng testprofilerna och följ provmiljöns städning
   efter fallet.

**Fånga nästa sparbegäran:**

Öppna F12 → **Console** i profil A. Kör blocket en gång före
bildändringens sparande med svaret `image`, och en gång före det senare
sparandet med svaret `later`. Ingen annan sparbegäran får skickas mellan
förberedelsen och respektive knapptryckning. Koden sparar bara sökvägen och
begärans ursprungliga `version`, `contentVersion` och `operationId` i flikens
`sessionStorage`. Den kopierar inga cookies, token eller inloggningshuvuden.

För `later` kontrollerar koden först ett lyckat serversvar med rätt kvitto,
återställer `fetch` och kastar sedan bort svaret för applikationen. Om inget
lyckat svar kommer avbryts inte svaret, och fallet ska markeras som ej
verifierat. Vanligt offlineläge bevisar inte ett avbrott efter transaktionen.
Ladda om fliken om du avbryter innan nästa sparande.

Kör [den separata förberedelsen
1](household-recovery-console.md#import-06-förberedelse-1)
för IMPORT-06 i det angivna läget.

**Prova båda gamla sparbegärandena:**

Kör efter import och omstart, före den nya vanliga rättelsen. Koden använder
profil A:s egen session och aktuellt bygg-ID, men återanvänder de tre gamla
begäransfälten exakt. Den tar en aktuell karta och historik före försöken och
jämför dem efter varje försök. Endast status och felkod skrivs ut; kopiera
inte privata webbläsardata till en rapport.

Kör [den separata förberedelsen
2](household-recovery-console.md#import-06-förberedelse-2)
för IMPORT-06 i det angivna läget.

Efter fallet, ta bort de två lokalt sparade begärandena:

Kör [den separata förberedelsen
3](household-recovery-console.md#import-06-förberedelse-3)
för IMPORT-06 i det angivna läget.

**Förväntat resultat:**

- För det senare sparandet visas okänt utfall trots att aktuell karta i
  den andra profilen bekräftar transaktionen. Efter importen finns
  kartan med båda objekten och dess sparade bilder samt det osparade förslaget
med
  den andra bilden. Senare sparat innehåll blandas inte in.
- Både det senare sparandets gamla begäran och den importerade
  bildändringens gamla begäran avvisas med HTTP 409. Karta, privata
  utkast och historik är oförändrade efter varje försök. Inget nytt
  sparande eller falskt gammalt lyckat kvitto uppstår.
- Det gamla öppna objektförslaget avvisas utan ny kartändring. Det
  ursprungliga kvittots identitet, författare och tidpunkt bevaras.
  Ett nytt aktuellt underlag kan spara en vanlig rättelse. Den skapar
  ett nytt kvitto och en ny historikpost utan att ändra tidigare sparanden.
- Efter rättelsen finns båda ursprungliga identiteterna. Det andra
  objektets första bild, okända målpunkt och båda personliga placeringarna
  är bevarade även efter omstart. Beskrivningen visar Ny vanlig rättelse.

### IMPORT-07: Historiska egenskaper och typbetydelser består efter import

**Syfte:** Importen bevarar den fria talegenskapen och varje sparandes
dåvarande typbetydelse, författare och tidpunkt.

**Användare:** Alex, och Robin när två profiler anges.

**Förutsättningar:** Separat provhushåll utan andra ändringar. Person finns
som objekttyp. Följ områdets vanliga export- och importförberedelser.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/household-import-definitions.spec.ts",
    "caseId": "IMPORT-07"
  },
  "reference": "Chromium, riktig lokal server och SQLite; konfiguration enligt förutsättningarna.",
  "outcomes": [
    "Importen bevarar den fria talegenskapen och varje sparandes dåvarande typbetydelse, författare och tidpunkt.",
    "Efter vanlig rättelse och nytt sparande består 43; tidigare historik och sparkvitton är oförändrade."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/household-import-property-history-http.test.ts",
      "title": "historical property kinds and exact receipts survive replacement and ordinary corrections",
      "purpose": "Exakta historiska egenskapsdatatyper, sparkvitton och vanliga rättelser genom riktig HTTP, SQLite och omstart."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Inställningar → Typer → Objekttyper → Ändra typ: Person. Ange
   typbeskrivningen Första betydelsen, lägg i utkastet och spara hela
   utkastet.
2. Ändra samma typbeskrivning till Senare betydelsen. Skapa Mätare av typen
   Person med den fria egenskapen Serienummer (Tal, 42). Lägg i utkastet och
   spara typen och objektet tillsammans.
3. Föreslå borttagning av Mätare från Tabell. Ändra typbeskrivningen tillbaka
   till Första betydelsen, lägg i utkastet och spara hela utkastet.
4. Ladda ned fullständig export. Öppna Återimport, välj ZIP-filen, Kontrollera
   importfil och granska. Markera bekräftelsen och välj Ersätt hushållets
   innehåll. Starta om med samma databas.
5. Öppna Rapporter och Visa ändringarna för de tre sparandena. Läs Mätare,
   Serienummer, 42 och datatypen Tal samt båda tidigare typbeskrivningarna,
   författare och tidpunkter.
6. Ändra Person-beskrivningen till Senare betydelsen. Skapa Ny mätare av typen
   Person med Serienummer (Tal, 43). Lägg i utkastet och spara. Starta om och
   redigera Ny mätare → Fria egenskaper.

**Förväntat resultat:**

- Importen bevarar den fria talegenskapen och varje sparandes dåvarande
  typbetydelse, författare och tidpunkt.
- Efter vanlig rättelse och nytt sparande består 43; tidigare historik och
  sparkvitton är oförändrade.

### IMPORT-08: förbered filen på nytt när en tidigare förberedelse saknas

**Syfte:** Kontrollera att en bortstädad förberedelse inte låser importen
och att en ny ersättning kräver ny granskning och bekräftelse.

**Användare:** Alex som administratör.

**Förutsättningar:** En fullständig provexport och en separat testinstallation
som får startas om. Ingen ersättning har bekräftats.

**Integrationstest:**
[household-import-recovery.spec.ts](../../tests/integration/household-import-recovery.spec.ts),
testfallet “IMPORT-08: an unavailable prepared archive allows fresh review
after restart without changing content”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-recovery.spec.ts",
    "caseId": "IMPORT-08"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Kontrollera att en bortstädad förberedelse inte låser importen och att en ny ersättning kräver ny granskning och bekräftelse."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj exportfilen i **Inställningar → Återimportera hushållet** och tryck
   **Kontrollera importfil**.
   Granska sammanställningen men bekräfta inte ersättning.
2. Starta om servern med samma databas. Ladda om importsidan.
   Tryck **Hämta importens status** innan du väljer någon ny fil.
3. Läs beskedet om den saknade förberedelsen och kontrollera att kartan
   fortfarande har sitt tidigare innehåll.
4. Välj filen på nytt, kontrollera den och granska den nya sammanställningen.
   Bekräfta uttryckligen ersättningen och invänta resultatet.

**Förväntat resultat:**

- Omstarten städar tillfälligt material utan att ersätta hushållets innehåll.
- Statusbeskedet gör det möjligt att välja en ny fil. Ett saknat förberett
  arkiv påstås inte vara en genomförd import.
- Den nya filen kräver ny granskning och ett nytt uttryckligt beslut.
  Därefter kan samma giltiga export återimporteras.

### IMPORT-09: hitta samma ersättning i en annan administratörs webbläsare

**Syfte:** Följ ett bekräftat importförsök trots tappat svar, ny webbläsare
och omstart utan att ersätta innehållet en gång till.

**Användare:** Alex och Robin som aktuella administratörer i separata
webbläsarprofiler. Bjud först in Robin och ge rollen administratör.

**Förutsättningar:** En separat provinstallation och export enligt den
allmänna förberedelsen. Robin har inte öppnat importen tidigare. Använd
Chromium med utvecklarverktyg i Alex profil.

**Separat dataförberedelse:** Före exporten: skapa ett osparat objekt **Privat
arbete från exporten**
med beskrivningen **Privat uppgift för Privat arbete från exporten**.
Alex ska läsa detta förslag, medan Robins eget utkast ska vara tomt.
Följ [kart- och utkastläsningen](#läs-sparat-och-privat-innehåll)
vid fallens kontroller; redovisa egna och andra användares vyer separat.

**Integrationstest:**
[household-import-discovery.spec.ts](../../tests/integration/household-import-discovery.spec.ts),
testfallet “IMPORT-09: another administrator discovers the same committed
import after a lost response and restart”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-discovery.spec.ts",
    "caseId": "IMPORT-09"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Följ ett bekräftat importförsök trots tappat svar, ny webbläsare och omstart utan att ersätta innehållet en gång till."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex väljer exportfilen och **Kontrollera importfil**. Läs granskningen.
2. Be driftansvarig förbereda det tappade bekräftelsesvaret enligt
   [IMPORT-09:s separata
förberedelse](household-recovery-console.md#import-09-förberedelse-1).
   Invänta besked att förberedelsen är installerad före bekräftelsen.
3. Alex markerar bekräftelsen och väljer **Ersätt hushållets innehåll**.
   Kontrollera beskedet **Utfallet är okänt** och att nytt filval är spärrat.
   Invänta driftansvarigs bekräftelse att ersättningen är slutförd på
   servern och att just dess svar har tappats innan Robin fortsätter.
4. Robin öppnar importen i sin egen webbläsare. Kontrollera att slutfört
   resultat visas för samma försökets ID, utan uppladdning eller bekräftelse.
5. Kontrollera återställt innehåll, privata utkast och aktuell tillgång.
   Starta om servern med samma databas och ladda om Robins importvy.
   Samma försök och resultat ska fortfarande visas.

**Förväntat resultat:**

- Alex får inget falskt framgångs- eller misslyckandebesked när svaret
  försvinner. Robin hittar samma beständiga försök med aktuell behörighet.
- Omstart bevarar försökets identitet och resultat. Ingen ny ersättning
  begärs och inget privat arbete blandas ihop.

### IMPORT-10: återfå en ny granskning efter tappat förberedelsesvar

**Syfte:** Kontrollera att en äldre slutförd import inte döljer en ny
förberedelse som samma administratör ännu inte har bekräftat.

**Användare:** Alex i två separata webbläsarprofiler och Robin som aktuell
administratör i en tredje profil.

**Förutsättningar:** En separat provinstallation och en fullständig export.
Genomför först IMPORT-01. Behåll servern igång under detta fall; en
obekräftad förberedelse upphör efter tio minuter eller vid omstart.
Bjud in Robin och ge rollen administratör före den första importen.

**Integrationstest:**
[household-import-discovery.spec.ts](../../tests/integration/household-import-discovery.spec.ts),
testfallet “IMPORT-10: the current administrator recovers a lost
preparation before an older completed import”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-discovery.spec.ts",
    "caseId": "IMPORT-10"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Kontrollera att en äldre slutförd import inte döljer en ny förberedelse som samma administratör ännu inte har bekräftat."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna importen i profil A och välj exportfilen på nytt. Be driftansvarig
   installera [IMPORT-10:s separata
svarsförberedelse](household-recovery-console.md#import-10-förberedelse-1).
   Invänta installationsbesked före **Kontrollera importfil**.
2. Välj **Kontrollera importfil**. Invänta driftansvarigs bekräftelse att
   servern har förberett filen och tappat svaret för just den granskningen.
   Läs felbeskedet i gränssnittet.
   Robin öppnar importen utan att välja en fil. Den äldre slutförda
   importen visas; Alex nya obekräftade granskning och dess bekräftelse
   får inte visas för Robin.
3. Logga in med samma konto i en ny profil B och öppna importen.
   Kontrollera att den nya granskningen och samma ID visas, istället
   för att den äldre importen visas som resultatet av det nya försöket.
4. Kontrollera att innehållet fortfarande är oförändrat och att
   ersättning kräver en ny markering av bekräftelsen.
5. Bekräfta ersättningen i profil B. Kontrollera det slutförda resultatet.

**Förväntat resultat:**

- Samma administratör återfår den nya granskningen utan ny uppladdning.
  En annan administratör får inte bekräfta den obekräftade förberedelsen.
- Den äldre slutförda importen används inte som besked för det nya
  försöket. Ingen ny ersättning sker innan ett uttryckligt beslut.

### IMPORT-11: slutför samma rensning med en annan administratör

**Syfte:** Kontrollera att en verklig rensningsspärr består efter
ersättningen och kan lösas av en annan aktuell administratör.

**Användare:** Alex och Robin som aktuella administratörer i separata
webbläsarprofiler samt driftansvarig för den lokala provinstallationen.

**Förutsättningar:** En separat provinstallation och en fullständig export.
Bjud in Robin och ge rollen administratör. Kör servern utan rootbehörighet.
Driftansvarig behöver kunna ändra rättigheter för provets tillfälliga filer.
Gör aldrig detta i en installation som används för riktigt hushållsarbete.

**Separat förberedelse:** Driftansvarig följer
[filförberedelsens
IMPORT-11-tidpunkter](household-recovery-filesystem.md#tidpunkter-för-import-11).
Den anger exakta indata, rättigheter, kontroll av borttagna filer och
återställning. UI-stegen fortsätter först efter respektive förberedelsebesked.

**Separat dataförberedelse:** Före exporten: skapa ett osparat objekt **Privat
arbete genom rensningen**
med beskrivningen **Privat uppgift för Privat arbete genom rensningen**.
Anteckna det sparade objektets beskrivning. Efter rensningen läser Alex
sitt privata förslag och Robin sin egen tomma utkastvy.
Följ [kart- och utkastläsningen](#läs-sparat-och-privat-innehåll)
vid fallens kontroller; redovisa egna och andra användares vyer separat.

**Integrationstest:**
[household-import-discovery.spec.ts](../../tests/integration/household-import-discovery.spec.ts),
testfallet “IMPORT-11: another administrator finishes the same gated
cleanup after the original administrator loses authority”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-discovery.spec.ts",
    "caseId": "IMPORT-11"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Kontrollera att en verklig rensningsspärr består efter ersättningen och kan lösas av en annan aktuell administratör."
  ],
  "evidence": [
    {
      "kind": "technical",
      "spec": "tests/integration/household-recovery-preparation.spec.ts",
      "title": "documented filesystem preparation blocks and restores only the selected empty import cleanup",
      "purpose": "Den exakta filförberedelsen och dess städning körs mot ett verkligt importförsök i ett tomt hushåll utan innehållsändring."
    },
    {
      "kind": "technical",
      "spec": "tests/integration/household-recovery-preparation.spec.ts",
      "title": "documented filesystem preparation blocks and restores only the selected seeded import cleanup",
      "purpose": "Den exakta filförberedelsen och dess städning körs mot ett verkligt importförsök med sparat provinnehåll utan innehållsändring."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex väljer exportfilen och **Kontrollera importfil**. Anteckna
   försökets visade ID före bekräftelsen.
2. Invänta **Rensningsfel förberett** enligt den separata förberedelsen,
   innan Alex bekräftar.
3. Alex bekräftar ersättningen. Kontrollera beskedet att innehållet är
   ersatt men att tillfälliga filer behöver rensas. Försök öppna kartan
   och göra en export i Robins profil; båda ska vara spärrade.
4. Robin ändrar Alex roll till medlem genom administrationen. Öppna
   sedan importen i Robins profil. Samma ID och väntande rensning ska
   visas automatiskt. Ny uppladdning ska vara spärrad.
5. Invänta **Rensning tillåten** enligt den separata förberedelsen.
   Robin väljer **Slutför importens rensning**. Kontrollera att samma
   försök blir slutfört. Filkontrollen redovisas separat.
6. Läs in kartan igen. Kontrollera återställt innehåll och privat arbete.
   Starta om med samma databas och kontrollera försökets resultat igen.
   Vid avbrutet test följs den separata förberedelsens återställning.

**Förväntat resultat:**

- Ersättningen är beständig trots att rensningen misslyckas. Kartan och
  ny export är spärrade tills rensningen faktiskt lyckas.
- Alex kan inte läsa eller slutföra importförsöket efter rolländringen.
  Robin kan följa och slutföra exakt samma försök utan en ny ersättning.
- Samma resultat och oförändrat återställt innehåll består efter omstart.

### IMPORT-12: egna inställningssidor och skyddat kartarbete

**Syfte:** Skydda oskickade formulärändringar och bevara privata förslag
vid administrativ läsning och uttrycklig innehållsersättning.

**Användare:** Alex som administratör.

**Förutsättningar:** En separat provinstallation och en fullständig export.
Använd tangentbord på dator i Chromiums vanliga fönster.
Mobilnavigation och smala återhämtningskontroller följs i IMPORT-22–24.

**Separat dataförberedelse:** Före exporten: skapa ett osparat objekt **Redan
privat arbete** med
beskrivningen **Privat uppgift för Redan privat arbete**. Läs detta
förslag före och efter ersättningen, utan att spara det.
Följ [kart- och utkastläsningen](#läs-sparat-och-privat-innehåll)
vid fallens kontroller; redovisa egna och andra användares vyer separat.

**Integrationstest:**
[household-import-settings.spec.ts](../../tests/integration/household-import-settings.spec.ts),
testfallet “IMPORT-12: protected Settings recovery pages preserve ordinary
work and retire it after replacement”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-settings.spec.ts",
    "caseId": "IMPORT-12"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Skydda oskickade formulärändringar och bevara privata förslag vid administrativ läsning och uttrycklig innehållsersättning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna formuläret för ett nytt objekt. Skriv ett namn men lägg inte
   förslaget i utkastet. Låt fokus vara i namnfältet.
2. Tryck Escape och välj **Fortsätt redigera**. Kontrollera att namnet
   och fokus finns kvar. Tryck Escape igen och välj **Kasta ändringarna
   och fortsätt**. Öppna **Inställningar → Återimportera hushållet**.
   På mobil fäller
   du först ut **Välj inställning**. Kontrollera att sidrubriken får
   synligt fokus och att kartan inte kan användas bakom sidan.
3. Välj exportfilen. Aktivera **Kontrollera importfil** med tangentbordet.
   Läs **Ersätts** och **Behålls**; ersättning kräver fortfarande bekräftelse.
4. Besök **Koppla historiskt innehåll** genom inställningarnas navigation.
   Hämta aktuell metadata och läs identitetsvarningen, utan att ändra något.
5. Välj **Tillbaka till kartan**. Öppna **Nytt objekt** och kontrollera
   ett tomt namnfält. Stäng utan ändringar. Det tidigare privata utkastet
   ska vara oförändrat.
6. Gå tillbaka till importen och välj **Hämta importens status**. Granska
   samma förberedelse, markera bekräftelsen och genomför ersättningen.
7. Kontrollera slutfört resultat och fokus på återinläsningen. Återgå till
   kartan. Inget kastat formulär ska komma tillbaka; endast det privata
   innehåll som finns i den bekräftade exporten får följa med.

**Förväntat resultat:**

- Import och historisk identitetsgranskning har egna sidor i Inställningar.
  Avbruten formulärstängning behåller oskickad text och fokus utan att
  spara den. Bekräftad stängning kastar endast dessa oskickade ändringar.
- Ersättning kräver uttryckligt beslut. Därefter kan det gamla kartarbetet
  inte fortsätta mot det återställda innehållet.

### IMPORT-13: åtkomst till import och historisk identitetsgranskning

**Syfte:** Kontrollera att direkta adresser och förlorad administratörsroll
inte ger tillgång till administrativa innehållsåtgärder.

**Användare:** Alex som administratör och Robin i en separat profil.

**Förutsättningar:** En separat provinstallation. Robin har ännu inte
fått tillgång till hushållet. Spara adresserna till de två sidorna i
Inställningar för att kunna öppna dem direkt.

**Integrationstest:**
[household-import-settings.spec.ts](../../tests/integration/household-import-settings.spec.ts),
testfallet “IMPORT-13: import and identity Settings destinations enforce
current household administrator access”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-settings.spec.ts",
    "caseId": "IMPORT-13"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Kontrollera att direkta adresser och förlorad administratörsroll inte ger tillgång till administrativa innehållsåtgärder."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna importens adress i en utloggad profil. Kontrollera att
   inloggning krävs och att filval saknas.
2. Robin loggar in utan inbjudan och öppnar adressen för historiskt
   innehåll. Ingen metadata eller kontroll för innehållskoppling ska visas.
3. Bjud in Robin och acceptera som medlem. Öppna båda adresserna igen.
   Sidorna ska neka administration utan filval eller identitetsgranskning.
4. Alex ger Robin rollen administratör och öppnar importen i sin egen
   profil. Robin ändrar sedan Alex roll till medlem.
5. Återvänd till Alex öppna flik och kontrollera att importsidan förlorar
   sina administrativa kontroller när åtkomsten uppdateras. Båda sidorna
   kräver fortsatt aktuell administratörsroll.

**Förväntat resultat:**

- Inloggning, aktuellt medlemskap och administratörsroll krävs. En direkt
  adress kringgår inte skyddet och visar inga privata innehållsvärden.
- När rollen försvinner tas kontrollerna bort även på en öppen sida.

### IMPORT-14: håll ett oklart försök skilt från en senare ersättning

**Syfte:** Kontrollera att ett känt men oklart försök följs med sitt eget
ID, även när en annan klient genomför en ny ersättning.

**Användare:** Alex i två separata webbläsarprofiler.

**Förutsättningar:** En separat provinstallation och samma giltiga export
i båda profilerna. Använd utvecklarverktygen i den första profilen.

**Separat dataförberedelse:** Före exporten: skapa ett osparat objekt **Privat
arbete i båda ersättningarna**
med beskrivningen **Privat uppgift för Privat arbete i båda ersättningarna**.
Anteckna även det sparade objektets beskrivning.
Följ [kart- och utkastläsningen](#läs-sparat-och-privat-innehåll)
vid fallens kontroller; redovisa egna och andra användares vyer separat.

**Integrationstest:**
[household-import-discovery.spec.ts](../../tests/integration/household-import-discovery.spec.ts),
testfallet “IMPORT-14: a locally known uncertain import keeps its exact
identity after a newer replacement and a lost status response”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-discovery.spec.ts",
    "caseId": "IMPORT-14"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Kontrollera att ett känt men oklart försök följs med sitt eget ID, även när en annan klient genomför en ny ersättning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered filen i den första profilen. Be driftansvarig installera
   [det tappade
bekräftelsesvaret](household-recovery-console.md#import-09-förberedelse-1)
   och invänta installationsbesked före bekräftelsen. Bekräfta ersättningen
   och anteckna försökets ID. Utfallet ska visas som okänt. Invänta därefter
   besked att servern har slutfört just försöket och att dess svar tappats.
2. Öppna importen i den andra profilen. Den visar första försökets resultat.
   Välj sedan exporten igen, granska och bekräfta en ny ersättning.
   Anteckna det nya försökets ID; det ska skilja sig från det första.
3. Starta om servern med samma databas. Ladda om den första profilens
   importsida. Det första ID:t ska finnas kvar och nytt filval vara spärrat.
4. Be driftansvarig installera [IMPORT-14:s separata
   läsfel](household-recovery-faults.md#tidpunkter-för-import-14).
   Invänta installationsbesked, välj sedan **Hämta importens status**.
   Invänta besked att serverns verkliga lyckade lässvar har tappats.
   Ett fel ska visas utan slutfört resultat.
   Filvalet förblir spärrat och samma första ID ska fortfarande visas.
5. Hämta status igen utan någon ny felregel. Det första försökets
   slutförda resultat ska visas. Ingen ny ersättning ska skickas.
6. Kontrollera att hushållets innehåll och privata arbete motsvarar
   exporten efter den andra ersättningen.

**Förväntat resultat:**

- En senare ersättning används inte som kvitto för ett äldre oklart försök.
- Ett misslyckat statusförsök bevarar osäkerheten. Lyckad läsning följer
  samma kända ID utan ny uppladdning eller bekräftelse.

### IMPORT-15: tangentbord genom fel, granskning och innehållskoppling

**Syfte:** Kontrollera att nästa användbara kontroll får synligt fokus
genom återimport och uttrycklig ändring av en innehållskoppling.

**Användare:** Alex som administratör.

**Förutsättningar:** En separat provinstallation med ett privat utkast
och en fullständig export av samma hushåll. Skapa också en vanlig textfil
med namnet `invalid.zip`; den ska inte vara ett ZIP-arkiv. Kör i 1280×900, ljust
och mörkt tema. Välj minskad rörelse.
De smala och korta fönstren har egna fall IMPORT-22–24.

**Separat dataförberedelse:** Det privata objektet ska heta **Bevarat privat
arbete** och ha
beskrivningen **Privat uppgift för Bevarat privat arbete**. Anteckna också
det sparade objektets beskrivning. Läs båda fullständigt efter filfel,
avbrott och ersättning i en extra flik. Efter valet utan aktuell ägare
ska ditt aktuella utkast vara tomt; efter återkopplingen ska samma
namn och privata beskrivning återkomma.
Följ [kart- och utkastläsningen](#läs-sparat-och-privat-innehåll)
vid fallens kontroller; redovisa egna och andra användares vyer separat.

**Integrationstest:**
[household-recovery-accessibility.spec.ts](../../tests/integration/household-recovery-accessibility.spec.ts),
testfallet “IMPORT-15: keyboard recovery controls remain visible through
review, errors and assignment at 1280px”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-recovery-accessibility.spec.ts",
    "caseId": "IMPORT-15"
  },
  "reference": "1280×900, ljust och mörkt tema, minskad rörelse; synligt tangentbordsfokus och läsbar granskning.",
  "outcomes": [
    "Kontrollera att nästa användbara kontroll får synligt fokus genom återimport och uttrycklig ändring av en innehållskoppling."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Inställningar och välj importsidan med tangentbordet. På mobil
   öppnar du först **Välj inställning**. Sidans fokuserade rubrik ska synas.
2. Välj `invalid.zip` och aktivera **Kontrollera importfil** med Enter.
   Kontrollera det tydliga felet och att fokus återgår till filvalet.
   Inget hushållsinnehåll ska ändras.
3. Välj den riktiga exporten. Be driftansvarig installera
   [IMPORT-15:s separata
fördröjning](household-recovery-faults.md#tidpunkter-för-import-15-och-import-2224)
   och invänta installationsbesked före filkontrollen. Kontrollera filen
   och invänta besked att serverns verkliga svar hålls kvar. Flytta fokus
   till **Tillbaka till kartan** medan svaret väntar. Be först därefter
   driftansvarig släppa svaret enligt förberedelsen. Ditt nya fokus ska
   finnas kvar när granskningen visas.
4. Aktivera **Hämta importens status**. Fokus ska gå till
   **Granska ersättningen**. Läs vad som ersätts och behålls.
5. Aktivera **Avbryt förberedelsen** med Enter. Efter lyckat avbrott ska
   fokus återgå till filvalet och kartan vara oförändrad. Välj filen och
   kontrollera den igen. Fokus ska återgå till den nya granskningen.
6. Markera bekräftelsen med mellanslag och aktivera ersättningsknappen
   med Enter. Efter slutförd ersättning ska fokus ligga på
   **Läs in det återställda hushållet**.
7. Öppna **Koppla historiskt innehåll** genom Inställningar. Hämta
   underlaget, välj din innehållsidentitet och **Ingen aktuell ägare**.
   Läs hela den historiska identitetens namn och ID samt valet utan ägare
   i den separata granskningen utanför vallistorna.
   Läs följderna och bekräfta med tangentbordet. Fokus ska återgå till
   **Hämta aktuella innehållskopplingar** efter det sparade resultatet.
8. Välj samma identitet och din aktuella verifierade användare. En ny
   bekräftelse krävs. Läs båda fullständiga ID:na i granskningen, även på
   den valda bredden. Bekräfta och kontrollera att ditt privata
   utkast finns kvar när du läser in kartan igen.
9. Upprepa med det andra temat. Alla kontroller, statusbesked och texter
   ska vara läsbara och möjliga att nå utan rullning i sidled.
   Kontrollera särskilt texten för den valda sidan i inställningsmenyn.
   Läs också knapparna för ersättning och innehållskoppling när de har
   tangentbordsfokus.
   På mobil öppnar du menyn för att läsa den valda sidan.

**Förväntat resultat:**

- Fel, granskning, ersättning och innehållskoppling lämnar fokus på en
  användbar plats. Ett nyare eget fokusval skrivs inte över av ett svar.
- Bekräftelser är uttryckliga och kan utföras med tangentbordet.
  Identitetsbytet slår inte ihop eller raderar det privata arbetet.
- Hela flödet går att använda i båda teman på smal och bred skärm.

### IMPORT-16: avbryt en obekräftad förberedelse

**Syfte:** Ta bort en kontrollerad men ännu obekräftad import utan att
ersätta hushållets innehåll.

**Användare:** Alex som aktuell administratör.

**Förutsättningar:** En separat provinstallation och giltig export enligt
den allmänna förberedelsen. Ingen ersättning har bekräftats.

**Separat dataförberedelse:** Efter exporten, före provet: skapa det osparade
objektet
**Privat arbete efter exporten** med beskrivningen
**Privat uppgift för Privat arbete efter exporten**. Behåll förslaget
under avbrottet och läs hela beskrivningen efteråt.
Följ [kart- och utkastläsningen](#läs-sparat-och-privat-innehåll)
vid fallens kontroller; redovisa egna och andra användares vyer separat.

**Integrationstest:**
[household-import-cancel.spec.ts](../../tests/integration/household-import-cancel.spec.ts),
testfallet “IMPORT-16: an administrator explicitly cancels only an
unconfirmed preparation and removes its staged archive”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-cancel.spec.ts",
    "caseId": "IMPORT-16"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Ta bort en kontrollerad men ännu obekräftad import utan att ersätta hushållets innehåll."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Börja ett nytt objekt med namnet **Oskickat arbete under avbrottet**
   utan att skicka förslaget. Tryck Escape och **Fortsätt redigera**;
   kontrollera namnet. Tryck Escape igen och bekräfta **Kasta ändringarna
   och fortsätt**. Öppna importsidan, välj exporten och
   **Kontrollera importfil**. Läs granskningen utan att markera bekräftelsen.
2. Använd Tab till **Avbryt förberedelsen** och tryck Enter.
3. Kontrollera beskedet att förberedelsen är avbruten. Granskningen ska
   försvinna och fokus återgå till filvalet.
4. Återgå till kartan. Det uttryckligen kastade formuläret ska vara stängt.
   Kontrollera
   att den senare ändringen **Senare namn**, privata utkast och aktuell
   tillgång är oförändrade.
5. Öppna importen och ladda om sidan. Ingen granskning av den avbrutna filen
   ska komma tillbaka. Hushållets sparade och privata uppgifter är oförändrade.

**Förväntat resultat:**

- Ett uttryckligt avbrott tar bort den obekräftade tillfälliga filen.
  Hushållet ersätts inte och ingen innehållskoppling ändras.
- Att lämna sidan är inte samma sak som att avbryta. Ett redan bekräftat
  eller oklart importförsök följs med **Hämta importens status**.

### IMPORT-17: följ avbrottets rensning och tappade svar

**Syfte:** Behåll samma obekräftade förberedelse vid rensningsfel och
skilj ett saknat svar från ett bekräftat avbrott.

**Användare:** Alex som aktuell administratör i två webbläsarprofiler.

**Förutsättningar:** En separat provinstallation där driftansvarig kan
ändra filrättigheter och starta om servern. En giltig export och ett
privat utkast ska finnas. Använd aldrig en produktionsinstallation.

**Separat förberedelse:** Driftansvarig följer
[filförberedelsens
IMPORT-17-tidpunkter](household-recovery-filesystem.md#tidpunkter-för-import-17)
före avbrott och rensning. Den innehåller exakta indata, filkontroller och
återställning även vid avbrutet prov.

**Separat dataförberedelse:** Skapa det osparade objektet **Privat under
avbrottet** med beskrivningen
**Privat uppgift för Privat under avbrottet**. Läs dess fullständiga
uppgifter i en extra flik medan rensning återstår och efter omstart.
Följ [kart- och utkastläsningen](#läs-sparat-och-privat-innehåll)
vid fallens kontroller; redovisa egna och andra användares vyer separat.

**Integrationstest:**
[household-import-cancel.spec.ts](../../tests/integration/household-import-cancel.spec.ts),
testfallet “IMPORT-17: failed cancellation cleanup and a lost success
remain bound to the same unconfirmed preparation”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-cancel.spec.ts",
    "caseId": "IMPORT-17"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Behåll samma obekräftade förberedelse vid rensningsfel och skilj ett saknat svar från ett bekräftat avbrott."
  ],
  "evidence": [
    {
      "kind": "technical",
      "spec": "tests/integration/household-recovery-preparation.spec.ts",
      "title": "documented filesystem preparation blocks and restores only the selected empty import cleanup",
      "purpose": "Den exakta filförberedelsen och dess städning körs mot ett verkligt importförsök i ett tomt hushåll utan innehållsändring."
    },
    {
      "kind": "technical",
      "spec": "tests/integration/household-recovery-preparation.spec.ts",
      "title": "documented filesystem preparation blocks and restores only the selected seeded import cleanup",
      "purpose": "Den exakta filförberedelsen och dess städning körs mot ett verkligt importförsök med sparat provinnehåll utan innehållsändring."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Kontrollera exportfilen utan att bekräfta ersättningen. Anteckna
   förberedelsens ID. Invänta **Rensningsfel förberett** enligt den
   separata förberedelsen innan nästa steg.
2. Välj **Avbryt förberedelsen**. Kontrollera att förberedelsen inte
   längre kan användas och att rensning återstår. Kartan och utkastet
   ska gå att läsa. Inget lyckat avbrott ska påstås.
3. Logga in med samma konto i den andra profilen och öppna importen.
   Samma ID och **Slutför förberedelsens rensning** ska visas. Filval och
   ersättning ska vara spärrade.
4. Invänta **Rensning tillåten** enligt den separata förberedelsen.
   Be driftansvarig installera [IMPORT-17:s
svarsförberedelse](household-recovery-console.md#import-17-förberedelse-1)
   i den andra profilen. Invänta installationsbesked, aktivera sedan
   **Slutför förberedelsens rensning**. Invänta driftansvarigs bekräftelse
   att avbrottet är utfört och dess svar dolt innan nästa steg.
5. Välj **Hämta importens status**. Det första lässvaret försvinner också;
   samma ID och spärrat filval ska finnas kvar. Välj status en gång till.
6. Förberedelsen ska nu vara otillgänglig och filvalet tillgängligt.
   Detta ska inte presenteras som ett kvitto på avbrottet. Starta om
   servern och ladda om sidan. Kartan och det privata utkastet är kvar.

**Förväntat resultat:**

- Rensningsfel kan följas av samma aktuella administratör i en ny profil.
  Förberedelsen kan inte ersätta innehåll efter att avbrottet börjar.
- Ett saknat svar låser filvalet tills just det försöket kan läsas.
  Ingen ny rensning eller ersättning skickas automatiskt.
- Tillfälliga filer försvinner efter lyckad rensning. Hushållets innehåll,
  privata arbete och innehållsversion är oförändrade, även efter omstart.

### IMPORT-18: hitta väntande avbrott trots en annan granskning

**Syfte:** Hitta och rensa en avbruten förberedelses kvarvarande filer i
en ny klient utan att förlora en annan obekräftad granskning.

**Användare:** Samma aktuella administratör i två webbläsarprofiler.

**Förutsättningar:** Provinstallation och filrättigheter enligt IMPORT-17.
Ingen ersättning bekräftas under provet.

**Separat förberedelse:** Driftansvarig följer
[filförberedelsens
IMPORT-18-tidpunkter](household-recovery-filesystem.md#tidpunkter-för-import-18)
med första granskningens ID. Den andra granskningens katalog ändras inte.

**Integrationstest:**
[household-import-cancel.spec.ts](../../tests/integration/household-import-cancel.spec.ts),
testfallet “IMPORT-18: a fresh administrator client can find cancelled
files even when another review is ready”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-cancel.spec.ts",
    "caseId": "IMPORT-18"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Hitta och rensa en avbruten förberedelses kvarvarande filer i en ny klient utan att förlora en annan obekräftad granskning."
  ],
  "evidence": [
    {
      "kind": "technical",
      "spec": "tests/integration/household-recovery-preparation.spec.ts",
      "title": "documented filesystem preparation blocks and restores only the selected empty import cleanup",
      "purpose": "Den exakta filförberedelsen och dess städning körs mot ett verkligt importförsök i ett tomt hushåll utan innehållsändring."
    },
    {
      "kind": "technical",
      "spec": "tests/integration/household-recovery-preparation.spec.ts",
      "title": "documented filesystem preparation blocks and restores only the selected seeded import cleanup",
      "purpose": "Den exakta filförberedelsen och dess städning körs mot ett verkligt importförsök med sparat provinnehåll utan innehållsändring."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Kontrollera exportfilen i första profilen och anteckna ID.
2. Öppna importen i andra profilen. Kontrollera samma fil på nytt och
   anteckna det nya ID:t. Den första profilens granskning ska vara kvar.
3. Invänta **Rensningsfel förberett** enligt den separata förberedelsen.
   Avbryt första granskningen i första profilen och läs att
   rensning återstår.
4. Öppna importen i en helt ny flik utan kopierad fliklagring. Det första
   ID:t och dess väntande rensning ska gå att hitta. Filval är spärrat.
5. Invänta **Rensning tillåten** enligt den separata förberedelsen och välj
   **Slutför förberedelsens rensning** i den nya fliken.
6. Ladda om den nya fliken. Den andra granskningen ska finnas kvar med
   sitt eget ID och omarkerad bekräftelse. Avbryt även den uttryckligen.

**Förväntat resultat:**

- En annan obekräftad granskning döljer inte kvarvarande filer som
  administratören behöver hitta och rensa efter ett uttryckligt avbrott.
- Rensning tar endast bort rätt förberedelse. Den andra granskningen
  finns kvar, och inget hushållsinnehåll ersätts eller sparas automatiskt.

### IMPORT-19: ett äldre svar får inte glömma en ny förberedelse

**Syfte:** Behålla den aktuella förberedelsens ID när ett äldre avbrottssvar
kommer tillbaka efter navigering i Inställningar.

**Användare:** Alex som aktuell administratör.

**Förutsättningar:** Giltig export och separat provinstallation. Använd
utvecklarverktygens Console för det kontrollerade fördröjda svaret.

**Integrationstest:**
[household-import-cancel.spec.ts](../../tests/integration/household-import-cancel.spec.ts),
testfallet “IMPORT-19: a retired cancellation response cannot forget a
newer preparation after Settings navigation”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-cancel.spec.ts",
    "caseId": "IMPORT-19"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Behålla den aktuella förberedelsens ID när ett äldre avbrottssvar kommer tillbaka efter navigering i Inställningar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Kontrollera exportfilen och anteckna ID. Be driftansvarig installera
   [IMPORT-19:s
svarsförberedelse](household-recovery-console.md#import-19-förberedelse-1)
   och invänta installationsbesked. Välj **Avbryt förberedelsen**.
   Invänta därefter besked att servern har utfört avbrottet och att det
   gamla svaret hålls kvar, innan du navigerar.
2. Öppna **Koppla historiskt innehåll** och återgå till importen. Hämta
   första försökets status och läs att förberedelsen inte finns längre.
3. Kontrollera filen igen och anteckna det nya ID:t. Läs den nya
   granskningen innan du ber driftansvarig släppa det äldre svaret enligt
   förberedelsen. Invänta besked att det gamla svaret har släppts.
4. Ladda om sidan. Det nya ID:t ska finnas kvar med spärrat filval tills
   **Hämta importens status** läser just den nya förberedelsen.
5. Läs den nya granskningen och avbryt den uttryckligen. Kartan ska vara
   oförändrad genom hela provet. Följ förberedelsens återställning.

**Förväntat resultat:**

- Ett svar för en lämnad vy tar inte bort en ny förberedelses identitet.
  Omladdning följer det lokalt kända nya ID:t genom uttrycklig läsning.
- Navigering ångrar inte det avbrott som redan utförs på servern och
  skickar varken ny ersättning eller automatisk upprepning.

### IMPORT-20: en äldre statusläsning får inte glömma en ny förberedelse

**Syfte:** Behålla den aktuella förberedelsens ID när ett fördröjt svar
om ett äldre, borttaget försök kommer efter navigering i Inställningar.

**Användare:** Alex som aktuell administratör i två flikar.

**Förutsättningar:** Giltig export och separat provinstallation. Använd
utvecklarverktygens Console för den kontrollerade fördröjningen.

**Integrationstest:**
[household-import-cancel.spec.ts](../../tests/integration/household-import-cancel.spec.ts),
testfallet “IMPORT-20: a retired unavailable status response cannot forget
a newer preparation after Settings navigation”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-cancel.spec.ts",
    "caseId": "IMPORT-20"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Behålla den aktuella förberedelsens ID när ett fördröjt svar om ett äldre, borttaget försök kommer efter navigering i Inställningar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Kontrollera exportfilen i första fliken och anteckna ID. Öppna
   importen i en andra flik med samma inloggning och avbryt just den
   förberedelsen där. Läs att tillfälliga filer är borttagna.
2. Be driftansvarig installera [IMPORT-20:s
   svarsförberedelse](household-recovery-console.md#import-20-förberedelse-1)
   i första fliken och invänta installationsbesked. Välj
   **Hämta importens status**. Invänta därefter besked att servern har
   svarat att det gamla försöket saknas och att svaret hålls kvar.
3. Öppna **Koppla historiskt innehåll** och återgå till importen i
   första fliken. Hämta status igen och läs att förberedelsen inte finns.
4. Kontrollera filen på nytt och anteckna det nya ID:t. Läs den nya
   granskningen innan du ber driftansvarig släppa det äldre svaret enligt
   förberedelsen. Invänta besked att det gamla svaret har släppts.
5. Ladda om sidan. Det nya ID:t ska finnas kvar med spärrat filval tills
   **Hämta importens status** läser just den nya förberedelsen.
6. Läs granskningen och avbryt den uttryckligen. Kartan ska vara
   oförändrad. Följ förberedelsens återställning.

**Förväntat resultat:**

- Ett äldre felsvar efter sidbyte kan inte glömma den nya förberedelsen.
  Omladdning följs av uttrycklig läsning av rätt, lokalt känt ID.
- Statusläsningen varken ändrar hushållsinnehåll eller upprepar avbrottet.
  Den nya granskningen kräver fortfarande ett uttryckligt eget val.

### IMPORT-21: Lagringsfel bevarar filen, granskningen och serverresultatet

**Syfte:** Stoppa filkontroll eller ersättning när återhämtningsuppgifterna
inte kan hanteras, utan att kalla ett verkligt svar för okänt.

**Användare:** Alex som aktuell administratör.

**Förutsättningar:** Ett eget provhushåll med objektet **Lampan i exporten**.
Spara och exportera hela hushållet till en privat ZIP-fil. Ändra sedan
objektets namn till **Senare namn** och spara. Öppna
**Inställningar → Återimportera hushållet** och välj den tidigare ZIP-filen.
Installera följande utdrag en gång genom Chromiums **Sources → Snippets**
efter filvalet. Det blockerar bara importens lagring i denna flik.
Stäng utvecklarverktygen. Alt+Skift+S blockerar skrivning,
Alt+Skift+R blockerar borttagning och Alt+Skift+A tillåter båda igen.
Ladda om efter fallet för att återställa webbläsarens vanliga funktioner.

Kör [den separata förberedelsen
1](household-recovery-console.md#import-21-förberedelse-1)
för IMPORT-21 i det angivna läget.

**Integrationstest:**
[household-import-ui.spec.ts](../../tests/integration/household-import-ui.spec.ts),
testfallet “IMPORT-21: unavailable recovery storage preserves the file,
exact review and confirmed server result”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-import-ui.spec.ts",
    "caseId": "IMPORT-21"
  },
  "reference": "Chromium på dator; separata verifierade profiler enligt förberedelsen.",
  "outcomes": [
    "Stoppa filkontroll eller ersättning när återhämtningsuppgifterna inte kan hanteras, utan att kalla ett verkligt svar för okänt."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ [IMPORT-21: förberedelse
1](household-recovery-console.md#import-21-förberedelse-1)
med samma flik, valda ZIP-fil och hushåll genom hela felkedjan.
Efter filvalet, före första Kontrollera importfil i UI-steg 1:
installera det oförändrade utdraget och meddela **Borttagning ur
importens återhämtningsminne blockeras**. Utdragets initiala läge är
blockerad borttagning. Stäng utvecklarverktygen före filkontrollen.

Före den andra filkontrollen i steg 2: tryck Alt+Skift+A och sedan
Alt+Skift+S. Meddela **Lagringen återställd, sedan skrivning blockerad**.
Behåll skrivfelet genom den verkliga färdiga granskningen och första
Ersätt hushållets innehåll i steg 3; den ersättningen får inte starta.
Återställ inte under läsningen av samma granskning och identifierare.

Före ersättningen i steg 4: tryck Alt+Skift+A och sedan Alt+Skift+R.
Meddela **Lagringen återställd, sedan borttagning blockerad**. Nu går
den verkliga ersättningen igenom, med bekräftat resultat och separat
lagringsfel. Ett saknat serversvar ersätter inte den här gränsen.

Före Hämta importens status i steg 5: tryck Alt+Skift+A och meddela
**Importens lagring är återställd**. Kontrollera samma kända slutförda
import, inte en ny filkontroll eller ersättning. Ladda om efter sista
innehållsläsningen för att återställa de vanliga lagringsfunktionerna;
städa sedan provinstallationen och den privata ZIP-filen enligt guiden.

**Steg:**

1. Invänta operatörens bekräftelse av den installerade blockeringen.
   Välj **Kontrollera importfil**. Läs meddelandet om
   **Webbläsarens återhämtningsminne**. Den valda filen och den användbara
   knappen ska finnas kvar; sidan får inte fastna i **Behandlar importen**.
   Kontrollera i den andra profilen att **Senare namn** finns kvar.
2. Be operatören återställa lagringen och sedan blockera skrivning.
   Invänta bekräftelse. Välj
   **Kontrollera importfil** igen. En verklig granskning med identifierare
   ska visas. Lagringsfelet visas separat; filkontrollens svar saknas inte.
3. Markera **Jag vill ersätta allt hushållsinnehåll** och välj
   **Ersätt hushållets innehåll**. Läs att ingen ersättning har startats.
   **Senare namn** finns kvar i kartan. Välj **Hämta importens status**;
   samma identifierare och
   granskning ska återkomma.
4. Be operatören återställa lagringen och sedan blockera borttagning.
   Invänta bekräftelse. Välj
   **Ersätt hushållets innehåll**. Nu ska den verkliga ersättningen
   slutföras. Bekräftelsen **Hushållets innehåll är ersatt** ska visas
   tillsammans med det separata lagringsfelet. Det är inte ett okänt utfall.
5. Be operatören återställa lagringen och invänta bekräftelse. Välj
   **Hämta importens status**.
   Lagringsfelet ska försvinna och samma slutförda resultat finnas kvar.
   Välj **Läs in det återställda hushållet** och kontrollera
   **Lampan i exporten**. Ingen andra filkontroll eller ersättning ska ske.

**Förväntat resultat:**

- Fil och hushåll bevaras medan lagring blockerar filkontroll eller
  ersättning. Återställd lagring låter användaren fortsätta uttryckligen.
- En verklig granskning och ett bekräftat serverresultat behåller rätt
  identifierare även när lokal lagring misslyckas. Status hämtas för samma
  försök och en ny destruktiv begäran skickas inte automatiskt.
- Automationen jämför hela kartan före ersättningen och verifierar exakt
  en filkontroll, en ersättning och den återställda objektinformationen.

## Smala och korta återhämtningsvyer

### IMPORT-22: återhämtningskontroller i 390×900

**Syfte:** Mobilnavigation får inte dölja granskning, status eller nästa
fokuserade kontroll.

**Användare:** Alex som administratör.

**Förutsättningar:** Eget nytt provhushåll, privat utkast och export enligt
IMPORT-15. Ställ fönstret till 390×900 CSS-pixlar före första steget.

**Integrationstest:**
[household-recovery-accessibility.spec.ts](../../tests/integration/household-recovery-accessibility.spec.ts),
IMPORT-22.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-recovery-accessibility.spec.ts",
    "caseId": "IMPORT-22"
  },
  "reference": "390×900, ljust och mörkt tema, minskad rörelse. Mobilnavigation får inte dölja granskning, status eller nästa fokuserade kontroll.",
  "outcomes": [
    "Fel och granskning behåller användbart fokus.",
    "Utkastet bevaras vid avbrott, ersättning och uttrycklig innehållskoppling."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Kör
[IMPORT-15](#import-15-tangentbord-genom-fel-granskning-och-innehållskoppling)
   en gång i den angivna bredden. I steg 1 öppnar du **Välj inställning**
   före sidvalet. Under steg 2–6 följer du fel, granskning, avbrott och
   ersättning; den fokuserade kontrollen ska vara synlig och nåbar.
2. Under basfallets steg 7–8 öppnar du inställningsmenyn före sidbytet.
   Läs hela identitetsgranskningen utanför vallistorna, nå bekräftelsen
   och kontrollera utkastet efter varje uttryckligt byte.
3. Basfallets steg 9 kör samma följd i det andra temat. Kontrollera under
   respektive steg att inget behöver rullas i sidled och att vald sida,
   knappar och status går att läsa. Börja inte om redan utförda steg
   efter att basfallet avslutats.

**Förväntat resultat:**

- Mobilnavigation får inte dölja granskning, status eller nästa fokuserade
  kontroll.
- Samma privata arbete bevaras utan sammanslagning. Detta är ett prov av
  CSS-vy och webbläsarfokus; det verifierar inte fysisk mobilutrustning,
  verklig zoom eller skärmläsarens uppläsning.

### IMPORT-23: återhämtningskontroller i 320×900

**Syfte:** Den smalaste vyn får inte klippa granskning eller kräva rullning i
sidled.

**Användare:** Alex som administratör.

**Förutsättningar:** Eget nytt provhushåll, privat utkast och export enligt
IMPORT-15. Ställ fönstret till 320×900 CSS-pixlar före första steget.

**Integrationstest:**
[household-recovery-accessibility.spec.ts](../../tests/integration/household-recovery-accessibility.spec.ts),
IMPORT-23.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-recovery-accessibility.spec.ts",
    "caseId": "IMPORT-23"
  },
  "reference": "320×900, ljust och mörkt tema, minskad rörelse. Den smalaste vyn får inte klippa granskning eller kräva rullning i sidled.",
  "outcomes": [
    "Fel och granskning behåller användbart fokus.",
    "Utkastet bevaras vid avbrott, ersättning och uttrycklig innehållskoppling."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Kör
[IMPORT-15](#import-15-tangentbord-genom-fel-granskning-och-innehållskoppling)
   en gång i den angivna bredden. I steg 1 öppnar du **Välj inställning**
   före sidvalet. Under steg 2–6 följer du fel, granskning, avbrott och
   ersättning; den fokuserade kontrollen ska vara synlig och nåbar.
2. Under basfallets steg 7–8 öppnar du inställningsmenyn före sidbytet.
   Läs hela identitetsgranskningen utanför vallistorna, nå bekräftelsen
   och kontrollera utkastet efter varje uttryckligt byte.
3. Basfallets steg 9 kör samma följd i det andra temat. Kontrollera under
   respektive steg att inget behöver rullas i sidled och att vald sida,
   knappar och status går att läsa. Börja inte om redan utförda steg
   efter att basfallet avslutats.

**Förväntat resultat:**

- Den smalaste vyn får inte klippa granskning eller kräva rullning i sidled.
- Samma privata arbete bevaras utan sammanslagning. Detta är ett prov av
  CSS-vy och webbläsarfokus; det verifierar inte fysisk mobilutrustning,
  verklig zoom eller skärmläsarens uppläsning.

### IMPORT-24: återhämtningskontroller i 640×500

**Syfte:** Det korta fönstret får inte dölja bekräftelse, rensning eller
återhämtningsfokus.

**Användare:** Alex som administratör.

**Förutsättningar:** Eget nytt provhushåll, privat utkast och export enligt
IMPORT-15. Ställ fönstret till 640×500 CSS-pixlar före första steget.

**Integrationstest:**
[household-recovery-accessibility.spec.ts](../../tests/integration/household-recovery-accessibility.spec.ts),
IMPORT-24.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-recovery-accessibility.spec.ts",
    "caseId": "IMPORT-24"
  },
  "reference": "640×500, ljust och mörkt tema, minskad rörelse. Det korta fönstret får inte dölja bekräftelse, rensning eller återhämtningsfokus.",
  "outcomes": [
    "Fel och granskning behåller användbart fokus.",
    "Utkastet bevaras vid avbrott, ersättning och uttrycklig innehållskoppling."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Kör
[IMPORT-15](#import-15-tangentbord-genom-fel-granskning-och-innehållskoppling)
   en gång i den angivna bredden. I steg 1 öppnar du **Välj inställning**
   före sidvalet. Under steg 2–6 följer du fel, granskning, avbrott och
   ersättning; den fokuserade kontrollen ska vara synlig och nåbar.
2. Under basfallets steg 7–8 öppnar du inställningsmenyn före sidbytet.
   Läs hela identitetsgranskningen utanför vallistorna, nå bekräftelsen
   och kontrollera utkastet efter varje uttryckligt byte.
3. Basfallets steg 9 kör samma följd i det andra temat. Kontrollera under
   respektive steg att inget behöver rullas i sidled och att vald sida,
   knappar och status går att läsa. Börja inte om redan utförda steg
   efter att basfallet avslutats.

**Förväntat resultat:**

- Det korta fönstret får inte dölja bekräftelse, rensning eller
  återhämtningsfokus.
- Samma privata arbete bevaras utan sammanslagning. Detta är ett prov av
  CSS-vy och webbläsarfokus; det verifierar inte fysisk mobilutrustning,
  verklig zoom eller skärmläsarens uppläsning.

### IMPORT-25: läs hela innehållskopplingen med verklig webbläsarzoom

**Syfte:** Bevara den mänskliga kontrollen av fullständiga identiteter vid
förstoring, skild från automationens smala CSS-vyer.

**Användare:** Alex som administratör på en dator med tangentbord.

**Förutsättningar:** Eget provhushåll med privat utkast och fullständig
export enligt IMPORT-15. Ställ först webbläsarfönstret till 1280×900 och
normal zoom. Använd webbläsarens verkliga zoomkontroll, utan CSS-skalning.

**Kräver mänsklig observation:** Med faktisk webbläsarzoom och tangentbord
ska människan läsa hela den valda historiska identitetens namn och ID och
den avsedda aktuella medlemmens namn och ID utanför vallistorna. Valet och
bekräftelsen ska kunna nås och utföras utan klippt text.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Använd verklig webbläsarzoom med tangentbord och läs båda fullständiga identiteterna utanför vallistorna före ett uttryckligt ägarbyte."
  },
  "reference": "Dator, 1280×900 före verklig 200 procent webbläsarzoom; ljust och mörkt tema.",
  "outcomes": ["Hela valda identiteter går att läsa och bekräfta med verklig zoom och tangentbord."],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/household-recovery-accessibility.spec.ts",
      "caseId": "IMPORT-24",
      "purpose": "Syntetisk 640px-vy kontrollerar native fokus och läsbar granskning, utan att utföra verklig webbläsarzoom."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Kör IMPORT-15 en gång i det angivna fönstret. Följ dess vanliga
   fel-, import- och avbrottssteg utan att upprepa dem efter slutläget.
2. Under basfallets steg 7–8: välj 200 procent i webbläsarens zoommeny.
   Läs båda hela identiteterna utanför vallistorna före varje bekräftelse.
   Flytta fokus med Tab och genomför det uttryckliga valet med
   mellanslag och Enter. Kontrollera att hela granskningen går att läsa
   och att knappen går att nå. Återställ normal zoom efter steg 8.
3. Under basfallets steg 9 gör du samma zoomkontroll vid innehållskopplingen
   i det andra temat. Återställ normal zoom när fallet avslutas.

**Förväntat resultat:**

- Förstoring klipper inte identiteter, granskning eller nästa kontroll.
  Båda uttryckliga bytena bevarar det privata arbetet.
- Anteckna verklig webbläsare, zoom, tangentbord och mänskligt resultat.
  Den överlappande automationen utför inte denna observation och bevisar
  ingen skärmläsaruppläsning.

## Personliga bakgrunder

### IMPORT-26: återställ bakgrundsval och rörelsevärden

**Syfte:** Bevara varje användares bakgrund, rörelsevärden och placeringar
genom fullständig export, ersättning och omstart.

**Användare:** Alex som administratör och Robin som medlem i en egen profil.

**Förutsättningar:** Börja före den allmänna förberedelsens export. Bjud in
Robin till Linden. Alex flyttar **Lampa från exporten** i sin personliga vy.
Robin väljer bakgrunden av, mörkt **Under världshavet**, panoreringsstyrka
25 procent, zoomstyrka 95 procent och lageravstånd 1,4. Anteckna placeringen.

**Automatiskt motsvarande test:**
[household-import-backgrounds.spec.ts](../../tests/integration/household-import-backgrounds.spec.ts),
IMPORT-26. Riktig applikation och isolerad SQLite-installation används.
Automationen bildjämför kartans bakgrund före export och efter återställning
i båda temana. Minskad rörelse gör bilderna stilla utan att ändra sparvärden.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/household-import-backgrounds.spec.ts",
    "caseId": "IMPORT-26"
  },
  "reference": "Chromium på dator, två verifierade användare, fem export/import-varianter för alla sju bakgrunder, avläge och rörelsevärdenas ytterlägen. Minskad rörelse används i automationen för stilla bildjämförelser.",
  "outcomes": [
    "Bekräftad återimport återställer de båda användarnas egna bakgrundsval och rörelsevärden utan sammanblandning.",
    "Bakgrundens utseende, avläge och personliga placeringar bevaras, även efter omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex öppnar **Navigera → Ordna min vy**, markerar **Vänd panorering i
   sidled** och **Visa axlar hela tiden** och väljer **Uppe till vänster**
   för **Axelvisarens hörn**. Stäng navigeringen, aktivera **Alla etiketter**
   och öppna **Inställningar → Rymdkartan**. Välj följande fem rader i tur
   och ordning. Använd varje rad som ett
   eget export- och återimportförsök i steg 2–5.

   <!-- markdownlint-disable MD013 -->
   | Bakgrund | Ljust tema | Mörkt tema | Panorering | Zoom | Avstånd |
   | --- | --- | --- | --- | --- | --- |
   | På | Pärlemor | Atmosfär | 0 procent | 100 % | 0,5 |
   | På | Gryningsdis | Dis och ljuspunkter | 100 % | 0 % | 2,0 |
   | På | Under världshavet | Universum | 0 procent | 100 % | 0,5 |
   | På | Pärlemor | Under världshavet | 100 % | 0 % | 2,0 |
   | Av | Gryningsdis | Atmosfär | 0 procent | 100 % | 0,5 |
   <!-- markdownlint-enable MD013 -->

2. Läs kartan i ljust och mörkt tema. Anteckna utseendet och hämta en
   fullständig export genom **Inställningar → Fullständig export**.
3. Ändra Alex bakgrund till andra val. Robin slår på sin bakgrund och
   ändrar sina rörelsevärden. Alex öppnar **Återimportera hushållet**,
   väljer just denna ZIP-fil och **Kontrollera importfil**.
4. Kontrollera att ersättningsknappen är avstängd före bekräftelsen.
   Markera **Jag vill ersätta allt hushållsinnehåll** och välj
   **Ersätt hushållets innehåll**. Läs in det återställda hushållet.
5. Alex läser **Rymdkartan** i inställningarna och jämför alla värden med
   raden. Läs kartan i båda temana och jämför med antecknat utseende och
   placering. Robin läser in sidan igen och kontrollerar sina egna värden.
6. Efter sista raden startar du om servern med samma databas. Läs in båda
   profilerna igen och kontrollera att respektive värden finns kvar.

**Förväntat resultat:**

- Alla sju bakgrundsval, avläget och ytterlägena för rörelse återställs.
  Avläget behåller sina val och visar den enfärgade kartbakgrunden.
- Båda användarna får tillbaka sina egna värden. Alex placering, övriga
  kartinställningar och medlemmarnas aktuella åtkomst bevaras.
- Omstart ändrar inte det återställda resultatet.

## Fria egenskaper och bevarade sambandsförslag

### IMPORT-27: återimportera och återställ ett undertryckt sambandsförslag

**Syfte:** Fortsätt samma arbete efter återimport utan att tappa tomma
egenskaper, upprepade etiketter eller ändrad ordning.

**Användare:** Alex som administratör i ett eget provhushåll.

**Förutsättningar:** Skapa och spara objekten **Lo Exempel** och
**Molnmusik** och ett samband mellan dem. På sambandet lägger du fyra
egenskaper med etiketten **Samma**, i denna ordning: utan datatyp och
värde, tomt datum, talet 0 och Ja/nej-värdet Nej. Spara hela utkastet.
Ändra sambandsförslaget till omvänd egenskapsordning utan att spara.
Ta bort Lo Exempel i tabellen så att förslaget följer objektborttagningen.
Använd 320×900 CSS-pixlar. Ordna tillgång till en omstart av provservern
med samma databas efter återimporten.

**Automatiskt motsvarande test:**
[household-import-properties.spec.ts](../../tests/integration/household-import-properties.spec.ts),
IMPORT-27. Riktig applikation och isolerad SQLite-installation används.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": { "runner": "playwright", "suite": "integration", "spec": "tests/integration/household-import-properties.spec.ts", "caseId": "IMPORT-27" },
  "reference": "320×900 CSS-pixlar, verifierad administratör, riktig SQLite och serveromstart. Inga verkliga leverantörsanrop.",
  "outcomes": ["Återimport bevarar undertryckt sambandsarbete och dess orsak.", "Ångrad objektborttagning återställer förslaget som går att spara med alla egenskaper."],
  "evidence": [{ "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/household-import-properties-http.test.ts", "title": "full property archive preserves suppressed retained proposals and permits correction after process restart", "purpose": "Offentliga HTTP-gränser och riktig SQLite verifierar exakta identiteter, egenskapsordning, återställningsorsaker, avvisade felaktiga arkiv och aktuell åtkomst." }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Inställningar → Fullständig export**, förbered exporten och
   hämta ZIP-filen.
2. Öppna **Återimportera hushållet**, välj filen och **Kontrollera
   importfil**. Kontrollera att ersättning kräver bekräftelse. Markera
   **Jag vill ersätta allt hushållsinnehåll med den kontrollerade filen.**
   och välj **Ersätt hushållets
   innehåll**. Invänta beskedet att innehållet är ersatt.
3. Efter den förberedda serveromstarten läser du in hushållet igen.
   Öppna **Skriv till Skyttel** och visa **Utkastet**. Läs orsaken
   **Följer objektborttagning:
   Lo Exempel.** och öppna sambandsförslagets uppgifter.
4. Kontrollera att **Bevarat sambandsförslag** visar Nej, 0 och det tomma
   datumet. Stäng uppgifterna med Escape. Fokusera knappen för att ångra
   Lo Exempels objektborttagning och tryck Enter.
5. Kontrollera att orsaken försvinner. Spara hela utkastet. Öppna tabellen
   och **Samband för Lo Exempel**. Läs alla fyra egenskaperna.

**Förväntat resultat:**

- Samma förslag och dess borttagningsorsak finns kvar efter omstart.
- Ångrad objektborttagning återställer sambandsförslaget. Sparandet
  lyckas och egenskaperna behåller sina upprepade etiketter, värden,
  tomma datatyper och den omvända ordningen.
- Sambandsuppgifterna går att läsa utan rullning i sidled. Automationens
  CSS-vy ersätter inte mänsklig zoom- eller skärmläsarverifiering.

### IMPORT-28: rätta ett blockerat samband efter återimport

**Syfte:** Ett arkiv bevarar ett inaktuellt sambandsförslag utan att
återuppliva det borttagna objektet eller spara ett ofullständigt samband.

**Användare:** Alex som administratör och Robin i en egen profil.

**Förutsättningar:** Använd samma sparade objekt och egenskaper som i
IMPORT-27. Alex föreslår den omvända egenskapsordningen. Robin tar bort
Molnmusik och sparar hela sitt utkast. Alex förslag ska nu vara blockerat.
Använd 1280×900 CSS-pixlar. Ordna omstart som i IMPORT-27.

**Automatiskt motsvarande test:**
[household-import-properties.spec.ts](../../tests/integration/household-import-properties.spec.ts),
IMPORT-28.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": { "runner": "playwright", "suite": "integration", "spec": "tests/integration/household-import-properties.spec.ts", "caseId": "IMPORT-28" },
  "reference": "1280×900 CSS-pixlar, två verifierade användare, riktig SQLite och serveromstart. Inga verkliga leverantörsanrop.",
  "outcomes": ["Blockerat förslag finns kvar efter export, återimport och omstart.", "Rättade ändpunkter går att spara med samma egenskaper utan att återuppliva det borttagna objektet."],
  "evidence": [{ "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/household-import-properties-http.test.ts", "title": "full property archive preserves corrected retained proposals and permits correction after process restart", "purpose": "Riktig SQLite verifierar att redan rättade förslag behåller serverns styrkta återställningsorsak och kan sparas efter återimport och omstart." }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex utför export, filkontroll och bekräftad ersättning enligt
   IMPORT-27 steg 1–2. Efter den förberedda serveromstarten läser Alex in
   hushållet igen, öppnar **Skriv till Skyttel** och visar **Utkastet**.
2. Läs **Blockerat samband: ett objekt saknas.** Stäng med Escape och
   öppna **1 konflikt i ditt utkast**. Välj **Rätta ändpunkter**.
3. Välj Lo Exempel i **Till objekt** och lägg sambandet i utkastet.
   Läs statusbeskedet, stäng dialogen och konfliktgranskningen.
4. Spara hela utkastet. Öppna tabellen och **Samband för Lo Exempel**.
   Läs de fyra egenskaperna.

**Förväntat resultat:**

- Det blockerade förslaget finns kvar efter återimport och omstart.
- Rättelsen använder ett befintligt objekt och sparandet lyckas.
  Egenskapernas ordning, upprepade etiketter, Nej, 0 och tomma värden
  bevaras. Molnmusik återupplivas inte.

## Identiteter och automatiskt underlag

IMPORT-15 behåller 1280×900. De övriga upptäckta breddvarianterna har
egna identiteter IMPORT-22–24. IMPORT-02–05 används inte av dessa fall
och återanvänds inte. Inga fall eller ursprungliga skydd tas bort här.
IMPORT-25 bevarar den särskilda mänskliga zoomkontrollen från granskningen.
IMPORT-07:s request-kontroll är separat tekniskt underlag; det vanliga
fallet använder typ- och objektformulär, återimport och Rapporter.
Automationen kontrollerar även exakta kvitton, innehållsversioner,
bildbyte och sparbegäranden. Dessa jämförelser är tekniskt underlag,
inte krav på att en människa läser interna svar under UI-stegen.
