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
   Välj **Skriv till Skyttel** och **Godkänn och starta** i medgivanderutan,
   sedan **Prata med Skyttel** när ett fall kräver samtal. Miljön ersätter
   taltransporten och provar inte fysiskt ljud.
3. Börja varje fall med en ny provinstallation eller ett tomt utkast utan
   pågående sparande. Behåll fliken och databasen under varje fall.
4. Prova ARBETE-01 på dator och mobil. Använd även tangentbord och
   skärmläsare: kontrollera logisk ordning, synligt fokus och att dolda
   kartkontroller inte går att nå. Dokumentera fysiska enheter och
   hjälpmedel separat från automatiserad Chromium-emulering.

## Tillfälliga vybyten

### ARBETE-01: oskickad formulärtext och sökning finns kvar

**Syfte:** Återgå till oskickat arbete utan att göra det till ett utkast.

**Användare:** Alex.

**Förutsättningar:** Tomt utkast, ingen aktiv redigering.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallen “ARBETE-01: unsent household work survives ordinary navigation
at 1280px”, “ARBETE-01: unsent household work survives ordinary navigation
at 390px” och “ARBETE-01: unsent household work survives ordinary navigation
at 320px”.

**Steg:**

1. Välj **Nytt objekt**. Skriv **Oskickad cykel** och beskrivningen
   **Behåll denna text**. Öppna Lista igen och skriv **cykel** i
   **Sök objekt**. Välj **Nytt objekt** i panelväljaren och fokusera namnfältet.
2. Använd Tab och Enter för att besöka **Inloggningssätt**. Kontrollera
   rubrikfokus och att kartan och dess formulär inte går att nå.
3. Välj **Till startsidan** med tangentbordet. Kontrollera namn,
   beskrivning, sökning och fokus. Kontrollera att utkastet ännu är tomt.
4. Välj **Lägg i mitt utkast** och kontrollera förslaget.

**Förväntat resultat:**

- Alla tre texter finns kvar efter återgång. Namnfältet får synligt fokus
  och täcks inte av de utfällda verktygen.
- Inget förslag skapas förrän formuläret uttryckligen skickas.
- Dolda kontroller stör inte navigationen på den andra sidan.

### ARBETE-02: samtal och mikrofon består och avslutas vid utloggning

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

### ARBETE-03: återkallad tillgång avvecklar dolt arbete

**Syfte:** Bevarande ger inte fortsatt tillgång efter återkallelse.

**Användare:** Alex och Robin i separata profiler.

**Förutsättningar:** Robin har ett startat samtal och mikrofonen är på.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-03: revoked household access retires hidden forms and
microphone”.

**Steg:**

1. Som Robin, öppna **Nytt objekt**, skriv **Privat oskickad cykel** och
   besök **Inloggningssätt** utan att skicka formuläret.
2. Som Alex, öppna **Administrera tillgång**, återkalla Robins tillgång
   och bekräfta återkallelsen.
3. Vänta på Robins åtkomstkontroll, högst tio sekunder. Kontrollera
   mikrofonen och välj **Till startsidan**.

**Förväntat resultat:**

- Robins mikrofon stoppas även när kartan inte visas.
- Återgång visar saknad tillgång. Det gamla formuläret är borta och
  hushållsinnehållet är inte åtkomligt.

### ARBETE-04: ersatt innehåll avvecklar tidigare arbete

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
2. Öppna **Inställningar** och välj **Återimportera hushållet** i
   sidnavigationen. Välj exportfilen och **Kontrollera importfil**.
   Granska ersättningen och bekräfta uttryckligen att innehållet ska ersättas.
3. Invänta bekräftad ersättning och mikrofonstopp. Välj
   **Läs in det återställda hushållet** och sedan **Tillbaka till kartan**.

**Förväntat resultat:**

- Nuvarande tillgång består, men den tidigare mikrofonen och samtalet
  avslutas. Ett nytt samtal kräver en ny start.
- Det gamla formuläret är borta. Det återimporterade tomma utkastet visas.
- Om innehållet tillfälligt är spärrat visas ett besked och kartarbetet
  kan inte fortsätta förrän innehållet är tillgängligt igen.

### ARBETE-07: väntande radering stoppar tidigare arbete före omladdning

**Syfte:** Kontrollera att dolt formulär, samtal, mikrofon och ett registrerat
sparförsök avvecklas när radering spärrar innehållet, utan att omladdning
döljer ett fel i avvecklingen.

**Användare:** Alex som aktuell administratör samt provmiljöns operatör.

**Förutsättningar:** Ny kontrollerad kostnadsmiljö enligt allmän förberedelse,
med `text known`. Anteckna dess utskrivna `directory`. Skapa och spara
**Lampan att radera** och **Stolen att bevara**, båda av typen **Fordon**.
Ingen bild behövs i detta fall. Flytta lampan åt höger och stolen åt vänster
med **Navigera**. Redigera stolen, skriv **Oberoende privat förslag** i
beskrivningen och lägg i utkastet utan att spara hela utkastet.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-07: pending erasure retires microphone, unsent forms and
an admitted save before reloading”.

**Steg:**

1. I flik A, starta textassistent och röst. Skicka en fråga, invänta det
   kontrollerade svaret och skriv **Gammalt oskickat svar** utan att skicka
   det. Öppna **Lista**. Öppna samma installation i en andra vanlig flik B
   med samma inloggning. Där öppnar du **Nytt objekt** och skriver
   **Gammal oskickad cykel** utan att lägga det i utkastet. Besök
   **Inställningar** i flik B utan omladdning och behåll fliken öppen.
   Ett oskickat objekt spärrar sparandet i sin egen flik; därför används
   separata flikar för formuläret och det väntande sparandet.
2. I flik A, installera följande utdrag genom **Sources → Snippets** i
   utvecklarverktygen. Det håller enbart den första sparbegäran efter
   registreringen; inga svar eller uppgifter ersätts.

   ```js
   (() => {
     const originalFetch = window.fetch;
     let releaseSave = () => {};
     const held = new Promise((resolve) => { releaseSave = resolve; });
     function release(event) {
       if (!event.altKey || !event.shiftKey || event.code !== 'KeyR') return;
       event.preventDefault();
       releaseSave();
       window.removeEventListener('keydown', release);
     }
     window.addEventListener('keydown', release);
     window.fetch = async function (...args) {
       const input = args[0] instanceof Request ? args[0].url : args[0];
       const url = new URL(input, location.href);
       if (url.origin === location.origin &&
           url.pathname.endsWith('/map/save')) {
         window.fetch = originalFetch;
         console.info('ARBETE-07: sparandet väntar');
         await held;
       }
       return originalFetch.apply(this, args);
     };
   })();
   ```

3. Välj **Spara hela utkastet**. Invänta konsolens **ARBETE-07: sparandet
   väntar**. I **Network** ska registreringen under `map/operations`
   ha HTTP 200 och status `pending`. Anteckna dess `operationId`.
   Stäng utvecklarverktygen. Öppna **Inställningar → Permanent radering**.
   Mikrofonen ska fortfarande vara på. Välj endast lampan och granska.
   Stolen och dess privata beskrivning ska inte visas i omfattningen.
4. Håll en separat verklig databasläsare öppen: kör följande i en andra
   terminal från projektets rot. När kommandot frågar efter sökvägen,
   skriv `directory` från provmiljön följt av `/skyttel.db` och tryck Enter.
   Invänta **Läsningen är öppen**.

   ```sh
   printf 'Databasens fullständiga sökväg: '
   read -r work_case_database
   node --input-type=module -e '
   import Database from "better-sqlite3";
   const database = new Database(process.argv[1], {
     readonly: true,
     fileMustExist: true,
   });
   database.exec("BEGIN");
   database.prepare("SELECT id FROM map_object LIMIT 1").get();
   function release() {
     database.exec("ROLLBACK");
     database.close();
     console.log("Läsningen är avslutad.");
     process.exit(0);
   }
   process.stdin.resume();
   process.stdin.once("data", release);
   process.once("SIGINT", release);
   console.log("Läsningen är öppen. Tryck Enter först vid steg 7.");
   ' "$work_case_database"
   ```

5. Bekräfta med exakt **RADERA PERMANENT**. Invänta HTTP 202 och besked om
   väntande städning. Anteckna raderingens fullständiga identifierare.
   **Ladda inte om någon flik.** Inom tio sekunder ska mikrofonen i flik A
   stoppas och det dolda formuläret i flik B avvecklas. Öppna
   **Tillbaka till kartan** i en ny flik:
   innehållet ska vara spärrat. En export i en separat flik ska också avvisas.
6. I ursprungsfliken, tryck Alt+Skift+R för att släppa den gamla sparbegäran.
   **Network** ska visa HTTP 409 med `content_maintenance` för denna
   `map/save`. Den får inte skickas om automatiskt eller återge ett sparat
   kvitto. Raderingens identifierare och väntande läge ska bestå.
7. Tryck Enter i läsarens terminal. Välj uttryckligen **Försök slutföra
   raderingen**. Samma identifierare ska slutföras med ett objekt och noll
   samband, typer och bildversioner.
8. Välj **Läs in kartan på nytt**. **Skriv till Skyttel** ska kräva en ny start
   och sakna tidigare dialog och oskickat svar. Det gamla objektformuläret
   och sparförsökets återförsök ska saknas. Stolen, dess privata förslag och
   placering är kvar; lampan är borta och Alex är fortfarande administratör.

Om fallet avbryts: släpp sparbegäran med Alt+Skift+R och databasläsaren med
Enter eller Ctrl+C. Slutför ett eventuellt väntande raderingsärende innan
provmiljön avslutas enligt kostnadsfallets stoppanvisningar.

**Förväntat resultat:**

- Vanlig navigation bevarar arbetet före raderingen. Innehållsspärren
  avvecklar däremot mikrofon, formulär och väntande sparande före omladdning.
- Den automatiserade mediegränsen verifierar att ljudspåret är avslutat
  och att dolda formulär tas bort. Den kontrollerade transporten provar
  inte fysisk mikrofon eller verkliga externa modellsvar.
- En uttrycklig radering och ett uttryckligt slutförande använder samma
  identifierare. Automationen jämför hela det oberoende privata utkastet,
  kvarvarande objekt, typer och personliga vyer samt exakt en versionsökning.

### ARBETE-05: samma sparförsök kan återhämtas efter vybyte

**Syfte:** Ett okänt utfall får inte glömmas vid navigation.

**Användare:** Alex.

**Förutsättningar:** Chrome med utvecklarverktyg. Läs
[SPAR-02](operations.md#spar-02-återförsöka-ett-väntande-sparande-från-en-annan-klient)
för hur endast begäran till `*/map/save` blockeras.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-05: navigation preserves a save attempt after its
response disappears”.

**Steg:**

1. Skapa **Sparad cykel** och lägg objektet i utkastet. Blockera
   `*/map/save` och välj **Spara hela utkastet**.
2. Kontrollera beskedet om okänt utfall. Besök **Inloggningssätt** och
   återgå. Kontrollera att beskedet och **Hämta samma kvitto igen** finns kvar.
3. Ta bort nätblockeringen. Välj **Hämta samma kvitto igen** och kontrollera
   kvittot. Ladda om och kontrollera att cykeln finns en gång i kartan.

**Förväntat resultat:**

- Okänt utfall visas även utanför kartan. Återförsöket gäller samma sparande.
- Verifierat sparande visas först efter serverns kvitto.

Det automatiserade provet fördröjer och tappar svaret efter att den riktiga
servern sparar, medan de manuella stegen stoppar själva begäran. Endast
automationen verifierar avbrottet efter transaktionen, pågående status
under vybytet och exakt en historikhändelse via det publika API:et.

### ARBETE-06: urval och personlig vy består vid storleksbyte

**Syfte:** Behålla valt objekt och egna kartinställningar vid återgång.

**Användare:** Alex.

**Förutsättningar:** Datorfönster och tomt utkast.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-06: selection and personal map view survive navigation
and resizing”.

**Steg:**

1. Skapa och spara **Min cykel**. Välj cykeln i listan och öppna Lista igen.
2. Öppna **Navigera**. Välj **Flytta [objektets namn]: höger**, invänta sparad
   personlig vy och markera **Visa höjdhjälp**.
3. Besök **Inloggningssätt**, minska fönstret till mobilstorlek och
   återgå med **Till startsidan**.
4. Välj **Min cykel** i panelväljaren och kontrollera uppgifterna. Välj
   **Stäng arbetsytan** för att kontrollera kartans urval, höjdhjälp och
   personliga placering.

**Förväntat resultat:**

- De öppna panelerna, cykelns urval och **Visa höjdhjälp** består.
- Den personliga placeringen är densamma efter återgång.

## Sammanhängande familjearbete

### ARBETE-08: familjeabonnemang från inloggning till delad karta

**Syfte:** Prova ett oavbrutet arbete genom inloggning, text, kontrollerat
tal, privata förslag, oberoende paneler, rättelse, Inställningar, gemensamt
sparande, omstart och en annan medlems vy.

**Användare:** Alex och Robin i separata webbläsarprofiler.

**Förutsättningar:** Starta en ny tom installation enligt den
[kontrollerade röstguiden](voice-assistant.md#controlled-voice-fixture).
Använd inte `seed-family`. Miljön ersätter inloggningsleverantörer, modell,
mikrofon och ljudtransport. Den provar inte externa konton eller verkligt tal.
Behåll samma flikar och databas fram till den uttryckliga omstarten.

Modellsvaren släpps i startterminalen med guidens `tool` och `reply`.
Använd alltid det aktuella `held`-anropets ID. Kopiera `version` och
`contentVersion` från dess `draft`; efter ett ändrande verktyg används
nästa `held.lastToolResult`. Läs typers ID och revisioner från katalogen.
Använd nya identifierare `family-subscription`, `family-person` och
`family-payment` för detta tomma prov. I automationen används nya slump-ID
och sedan de faktiskt returnerade identifierarna.

**Integrationstest:**
[connected-work.spec.ts](../../tests/integration/connected-work.spec.ts),
testfallet “ARBETE-08: familjeabonnemanget går från inloggning och samtal
till gemensamt kvitto och privat fortsatt arbete”.

**Steg:**

1. Börja utloggad. Använd Tab och Enter för **Fortsätt med Google** och
   **Fortsätt till Google**. Kontrollera rubrikfokus, skriv
   **Hushållet Linden** och välj **Skapa hushåll**. I terminalen, kör
   `identity robin`. Logga in med Microsoft i Robins separata profil.
   Kopiera Robins användar-ID från **Din profil**. Kör `identity alex`
   efter inloggningen. Följ
   [inbjudningsguiden](../user-guide/access.md#bjud-in-en-skyttel-användare)
   för att bjuda in och acceptera som Robin. Som Robin, välj **Lista →
   Nytt objekt**, skriv **Robins notering** och **Lägg i mitt utkast**.
   Spara inte. Den gemensamma kartan ska fortfarande vara tom.
2. Som Alex, välj **Skriv till Skyttel**. Kontrollera att medgivanderutan
   visas och välj **Godkänn och starta**. Skicka
   **Föreslå Familjens Molnmusik, ett familjeabonnemang för 179 SEK
   per månad.** Släpp `read_type_catalog` med `{}`. Nästa resultat ska ge
   typerna **Abonnemang**, **Person** och **Betalar**. Släpp därefter
   `propose_object` med katalogens Abonnemang-ID, dess `typeRevision`,
   aktuell utkastversion och `contentVersion`, objektets nya `id`,
   `baseRevision: null` samt följande `value` (ersätt typ-ID):

   ```json
   {
     "typeId": "Abonnemang-ID från katalogen",
     "name": "Familjens Molnmusik",
     "description": "",
     "financialFacts": {
       "price": { "knowledge": "known", "value": "179" },
       "currency": { "knowledge": "known", "value": "SEK" },
       "paymentInterval": { "knowledge": "known", "value": "månad" }
     }
   }
   ```

   Släpp sedan ett vanligt `reply`. Kontrollera ett privat objekt,
   inget sparat objekt eller kvitto och Robins oförändrade privata notering.
3. Välj **Prata med Skyttel**. Kör `user Kim Exempel betalar familjens Molnmusik.`
   och `delegate` i terminalen. Släpp `propose_object` för **Kim Exempel**,
   typen **Person**, tom beskrivning och `baseRevision: null`.
   Använd aktuell version och typrevision. Nästa verktygsresultat ger
   personens ID och den nya versionen. Släpp `propose_relationship` med
   den nya versionen, katalogens Betalar-ID och typrevision,
   `baseRevision: null`, `sourceId` för Kim, `targetId` för abonnemanget
   och `knowledge: "known"`. Släpp sedan ett vanligt `reply`.
   Hela utkastet ska visa två objekt och exakt **Kim Exempel → Betalar →
   Familjens Molnmusik**. Inget ska vara gemensamt sparat.
4. Öppna abonnemangets **Uppgifter** från Lista och **Redigera valt objekt**.
   Öppna **Ekonomiska uppgifter och avtalsvillkor**, rätta **Pris** till
   **189** och beskrivningen till **Rättad för hand**. Lägg i utkastet och
   invänta avslutat formulär och beskedet att förslaget finns i ditt
   privata utkast när kartans inläsning är klar. Öppna abonnemangets
   uppgifter igen och behåll panelen. Öppna Kims uppgifter och redigera
   beskrivningen till
   **Oskickat om Kim**, utan att lägga i utkastet. Välj **Stäng Kim Exempel**,
   öppna samma uppgifter från Lista och kontrollera texten samt en enda
   panel för Kim. Använd inte åtgärden som kastar oskickad text.
5. Skriv **Oskickat i samtalet** utan att skicka. Låt mikrofonen vara på
   och öppna **Inställningar**. Rubriken ska få fokus och kartarbetet döljas.
   Inställningarnas innehåll ska komma före den kompakta statusytan.
   Läs de tre privata förslagens status och välj
   **Visa samtals- och utkastdetaljer**. Kontrollera rubrikfokus och beskedet
   om oskickat samtalsmeddelande. Välj **Stäng aktuell status** och kontrollera
   att fokus återgår till detaljknappen. Röstrutan visar **Lyssnar**.
   Välj **Tillbaka till kartan** och välj
   abonnemanget, Kim och samtalet genom **Öppna paneler**. Kontrollera
   rubrikfokus, samma beskrivningar, samma dialog och båda oskickade texter.
   Robins notering ska fortfarande vara privat. Automationen kontrollerar
   att samma levande mediespår och anslutning används efter Inställningar.
6. Öppna **Visa hela utkastets detaljer** i samtalet. Granska två objekt,
   ett samband och **189 / SEK / månad**, med **Rättad för hand**.
   Ersätt samtalets oskickade text med **Spara hela utkastet nu.** och skicka.
   Släpp exakt ett `save_draft` med den aktuella granskningens version,
   innehållsversion och `operationId: "family-save"`. Servern tilldelar
   sparandets beständiga identifierare; anteckna den från **Visa kvittot**.
   Kontrollera ett kvitto för båda objekten och sambandet, tomt Alex-utkast
   och öppna **Öppna paneler → Kim Exempel**. Kontrollera att
   **Oskickat om Kim** fortfarande finns i formuläret men inte i sparad
   beskrivning. Återvänd till **Skriv till Skyttel** för kvittot och röstens
   kontroller. Robins privata notering ingår inte i kvittot.
7. Stäng av mikrofonen med **Prata med Skyttel** och vänta tills
   röstrutan har försvunnit. Kör `restart` i terminalen och ladda sedan om
   Alex flik. Öppna **Lista → Visa historik → Visa ändringarna** för samma
   kvitto. Kontrollera namn, rättad beskrivning, hela prisuppgiften,
   riktningen Kim till abonnemanget och **Betalar**. Oskickad lokal text
   behöver inte överleva den uttryckliga omladdningen.
8. Som Alex, redigera abonnemangets beskrivning till **Alex privat efteråt**
   och lägg i utkastet utan att spara. Ladda om Robin. Robin ska se det
   gemensamma abonnemanget med **Rättad för hand**, **189 / SEK / månad**,
   Kim och Betalar-sambandet, samt enbart sin egen privata notering.
   Kontrollera samma historikkvitto även som Robin. Alex ska inte se
   Robins notering. Avsluta provmiljön med `quit` enligt röstguiden.

**Förväntat resultat:**

- Ett enda oavbrutet arbete går från tom installation till två gemensamma
  objekt och ett samband, med exakt ett sparande och samma kvitto efter omstart.
- Vanlig navigation bevarar paneler, dialog, oskickad text och mikrofonläge.
  Endast det uttryckligen granskade utkastet sparas; lokala oskickade
  uppgifter och en annan medlems privata förslag ingår aldrig.
- Båda medlemmarna ser samma sparade information men skilda privata utkast.
  Automationen jämför hela kvittot, historiken och båda kartornas publika
  svar; enbart modellens text räknas inte som sparbevis.

### ARBETE-09: samma familjearbete med text och listor utan grafik eller ljud

**Syfte:** Genomföra samma arbete utan tal, ljuduppspelning eller grafisk karta.

**Användare:** Alex och Robin enligt ARBETE-08.

**Förutsättningar:** Ny tom kontrollerad installation enligt ARBETE-08.
Använd dess identiteter, faktiska verktygssvar och samma åtta steg.

**Integrationstest:**
[connected-work.spec.ts](../../tests/integration/connected-work.spec.ts),
testfallet “ARBETE-09: samma familjearbete fungerar med text och listor
utan grafik eller ljud”.

**Steg:**

1. Följ ARBETE-08. Välj aldrig **Prata med Skyttel**. I steg 3 skriver och skickar
   du **Kim Exempel betalar familjens Molnmusik.** i textfältet i stället
   för terminalens `user` och `delegate`. Släpp samma två verktyg i ordning.
   Hoppa över mikrofonens påslag och avstängning.
2. När hushållet är öppet, skapa ett verkligt grafikavbrott i båda profilerna
   genom webbläsarkonsolen. Upprepa efter omladdning vid omstarten:

   ```js
   document.querySelector('canvas').getContext('webgl2')
     .getExtension('WEBGL_lose_context').loseContext();
   ```

   Kontrollera **Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.**
   Gör allt fortsatt arbete genom **Lista**, formulär och samtalets text.
3. Fullfölj rättelse, panelbyten, Inställningar, uttryckligt sparande,
   historik, omstart och båda privata utkasten enligt ARBETE-08.
   Kör även med tangentbord och tillgänglig skärmläsare. Anteckna den
   faktiska miljön separat från automatiserade kontroller.

**Förväntat resultat:**

- Samma fullständiga slutresultat och privata gränser som ARBETE-08.
- Grafikavbrottet hindrar inte listor, formulär, text, historik eller kvitto.
  Ingen mikrofonbegäran, röstanslutning eller ljuduppspelning behövs.
  Automationen räknar dessa medieanrop och kräver noll.
- Listans namngivna åtgärder ersätter grafisk träffning och dragning.
  Ett kontrollerat grafikavbrott är inte ett verkligt skärmläsarprov.

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
