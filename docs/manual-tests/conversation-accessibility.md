# Manuella testfall för samtalets samlade hjälpmedelsflöde

Fallen förenar verktygsrad, röstruta, textvy och samtalsnotis. De omfattar
läsordning, tangentbord, fokus, uppläsningarnas förekomst och systemets
minskade rörelse på dator och smal skärm. Anteckna commit, webbläsare,
hjälpmedel och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex är vanlig medlem i ett tillfälligt hushåll och loggar in med provets
Google-knapp. Inga administrativa rättigheter krävs för samtalet.

## Allmän förberedelse

1. Följ [den kontrollerade röstguiden](voice-assistant.md#controlled-voice-fixture).
   Starta `npx tsx scripts/manual-voice.ts` i en egen terminal. Logga in
   och skapa ett hushåll på den angivna adressen. Använd påhittade uppgifter.
2. Behåll terminalen och utvecklarkonsolen öppna. `available off` och
   `available on` ändrar samtalets tillgänglighet. `pending` listar
   uppdragets `held`-anrop. `fail REQUEST` avbryter det aktuella anropet;
   `reply REQUEST Kartan är redo.` avslutar det med ett svar.
3. Starta en ny provmiljö inför varje fall. Förbered **Prata med Skyttel**
   och godkänn medgivandet. Invänta **Lyssnar**, om fallet inte anger text.
   Kör först vid 1280 pixels bredd, därefter vid 390 pixels bredd.
4. Provet använder riktig server och tillfällig SQLite men ersätter
   mikrofon, ljudtransport och externa leverantörer. Konsolkommandon
   nedan styr dessa ersättningar, aldrig appens interna tillstånd.
5. För egen hjälpmedelsbedömning: aktivera den skärmläsare som ska provas
   och anteckna dess version. Kontrollera både uppläsning och läsordning
   med dess vanliga läskommandon. Automatiska DOM-prov bevisar inte vad
   en verklig skärmläsare säger. Enhetsprov enligt
   [#220](https://github.com/viscalyx/skyttel/issues/220) kräver en människa.
6. Avsluta med `quit`. Provdatabasen tas bort. Återställ nätverk och
   operativsystemets rörelseinställning efter respektive fall.

## Samtalskontroller och ordning

### HJALP-01: blockerad mikrofon är tillgänglig för hjälpmedel

**Syfte:** Behålla en operabel knapp som förklarar hindret även i ett
pågående samtal på dator och pekskärm.

**Användare:** Alex.

**Förutsättningar:** Mikrofonen är på. Kör fallet med mus och med
pekstyrd webbläsaremulering; verklig pekskärm hör till #220.

**Integrationstest:**
[conversation-accessibility.spec.ts](../../tests/integration/conversation-accessibility.spec.ts),
testfallen:

- “HJALP-01: en blockerad mikrofon i ett pågående samtal går att aktivera
  med hjälpmedel på dator”.
- “HJALP-01: en blockerad mikrofon i ett pågående samtal går att aktivera
  med hjälpmedel på pekskärm”.

**Steg:**

1. Kör `available off`. Vänta upp till fem sekunder på samtalsnotisen.
2. Läs mikrofonknappens namn, läge och beskrivning. Fokusera knappen
   och tryck Retur.
3. Kör `available on`. Läs återkomstbeskedet och knappens läge.

**Förväntat resultat:**

- Notisen säger att samtal inte är tillgängligt. Mikrofonen är av och
  knappen ser avstängd ut, men den är varken inaktiverad eller utmärkt
  som inaktiverad för hjälpmedel. Beskrivningen innehåller **Inte
  tillgängligt just nu.** Även pekläget har denna beskrivning.
- Retur behåller fokus på knappen och förklarar hindret. Mikrofonen
  börjar inte lyssna. Samma synliga notis visas bara en gång.
- Notisen försvinner när tillgängligheten återkommer. **Samtal med
  Skyttel är tillgängligt igen.** läses i tur. Mikrofonen förblir av.

### HJALP-02: läsordning och tabbordning följer samtalet vid flytt

**Syfte:** Bevara samma naturliga ordning även när notisen visuellt
flyttar mellan röstrutans plats och textvyn.

**Användare:** Alex.

**Förutsättningar:** Mikrofonen är på. Textvyn är öppen.

**Integrationstest:**
[conversation-accessibility.spec.ts](../../tests/integration/conversation-accessibility.spec.ts),
testfallen:

- “HJALP-02: röstruta och notis behåller läs- och tabbordning när textvyn
  öppnas vid 1280px”.
- “HJALP-02: röstruta och notis behåller läs- och tabbordning när textvyn
  öppnas vid 390px”.

**Steg:**

1. Skriv **Ge ett förslag.** och välj **Skicka**. Kör `pending`, därefter
   `fail REQUEST` med det aktuella anropets ID.
2. Kör `window.skyttelVoiceFixture.setSound('remote', true, 0.2)` i
   konsolen. Röstrutan visar **Skyttel talar** med **Avbryt**.
3. Fokusera **Prata med Skyttel**. Tabba genom samtalskontrollerna och
   läs dem i dokumentordning med hjälpmedlet.
4. Stäng textvyn, upprepa ordningen, öppna textvyn och upprepa igen.
5. Fokusera **Stäng notisen** och tryck Retur.

**Förväntat resultat:**

- Ordningen är **Prata med Skyttel**, **Skriv till Skyttel**, röstrutans
  **Avbryt**, **Stäng notisen**, sedan de återstående synliga verktygen.
  En notisknapp, när en sådan finns, föregår stängknappen.
- Läsordningen är densamma som tabbordningen. På smal skärm går fokus
  från verktygsraden till nederkanten och tillbaka. Dolda extraverktyg
  får inget tabbstopp; vid visade namn ligger de efter notisen.
- Öppen textvy visar notisen ovanför meddelandefältet. Stängd textvy
  visar den vid röstrutans plats. Bara en notis finns och flytten
  skapar ingen ny uppläsning.
- Stängning tar bort notisen och återför fokus till **Prata med Skyttel**.

## Uppläsning och återkomst

### HJALP-03: arbete och kontexttröskel har en förekomst över ytorna

**Syfte:** Undvika dubbla statusuppläsningar och behålla förekomsten
även vid besök i Inställningar.

**Användare:** Alex.

**Förutsättningar:** Mikrofonen är på och textvyn är öppen.

**Integrationstest:**
[conversation-accessibility.spec.ts](../../tests/integration/conversation-accessibility.spec.ts),
testfallet “HJALP-03: samma arbete och kontexttröskel läses en gång över
textvy, röstruta och inställningar”.

**Steg:**

1. Skriv **Beskriv kartan.** och skicka. Behåll `held`-anropet obesvarat.
2. Läs röstrutan och raden **Skyttel arbetar…** i samtalstexten.
3. Kör `context 85`. Besök **Inställningar**, välj **Tillbaka till kartan**
   och kör `context 88`.
4. Slå av mikrofonen under arbetet. Läs textvyn och släpp anropet med
   `reply REQUEST Kartan är redo.`.

**Förväntat resultat:**

- **Skyttel arbetar** läses i tur en gång, även när båda ytorna visar
  arbetet. Besöket i Inställningar och mikrofonens avslag läser inte
  upp samma arbete igen.
- **Kontexten är 85 procent full** läses i tur en gång. Symbolens
  tillgängliga namn uppdateras till **Kontexten är 88 procent full**
  men högre värden annonseras inte igen. Sammanfattning förnyar inte
  förekomsten; ett uttryckligt **Nytt samtal** börjar en ny förekomst.
- Ett skrivet uppdrag fortsätter när mikrofonen slås av. Den särskilda
  arbetsvakten får inaktivera mikrofonknappen tills detta arbete är klart.

Prova även den automatiska förnyelsen enligt **KONTEXT-09** i
[kontextfallen](conversation-context.md). Behåll fokus i meddelandefältet
under kontrollen. När sammanfattningen pausar inspelningen och byter
röstanslutning ska inget extra **Mikrofonen är av** eller **Lyssnar**
annonseras för den interna pausen. Ett verkligt avslag eller släpp från
användaren ska däremot förbli av efter förnyelsen. Sammanfattningsraden
annonseras en gång som ett nytt textsvar, och 85-procentströskeln behåller
sin tidigare förekomst. Detta är ett separat automatiskt prov med
kontrollerad transport, inte ett intyg om verklig skärmläsaruppläsning.

### HJALP-04: kontaktavbrott förklarar mikrofonen utan dubbel status

**Syfte:** Läsa kontaktfelet med rätt prioritet och behålla notisens
förekomst när användaren byter yta.

**Användare:** Alex.

**Förutsättningar:** Mikrofonen är på, textvyn öppen och fältet fokuserat.

**Integrationstest:**
[conversation-accessibility.spec.ts](../../tests/integration/conversation-accessibility.spec.ts),
testfallet “HJALP-04: kontakt-notisen avbryter en gång utan extra
mikrofonstatus och flyttas med samma identitet”.

**Steg:**

1. Sätt webbläsarens nätverk i **Offline**. Läs notisen.
2. Stäng och öppna textvyn utan att återställa nätverket.
3. Återställ nätverket och kontrollera mikrofonknappens läge.

**Förväntat resultat:**

- **Ingen kontakt med Skyttel. Mikrofonen är av. Slå på den igen när
  kontakten är tillbaka.** annonseras avbrytande. Ingen separat
  **Mikrofonen är av** läggs till samma händelse.
- Ny notis flyttar inte fokus från fältet. Samma notis flyttas visuellt
  utan att bytas ut eller läsas igen. Texten kan fortfarande redigeras.
- Återkomst ger bara **Kontakten med Skyttel är tillbaka.** i tur.
  Mikrofonen förblir av tills användaren själv slår på den.

### HJALP-05: ljudknappens ordning och borttagning behåller fokus

**Syfte:** Placera notisens åtgärd efter samtalsknapparna och undvika
en extra mikrofonuppläsning efter användarens åtgärd.

**Användare:** Alex.

**Förutsättningar:** Börja med **Skriv till Skyttel**, giltigt medgivande
och mikrofonen av. Röstanslutningen ska inte redan vara igång.

**Integrationstest:**
[conversation-accessibility.spec.ts](../../tests/integration/conversation-accessibility.spec.ts),
testfallen:

- “HJALP-05: notisens ljudknapp följer samtalsknapparna och återför fokus
  utan extra uppläsning vid 1280px”.
- “HJALP-05: notisens ljudknapp följer samtalsknapparna och återför fokus
  utan extra uppläsning vid 390px”.

**Steg:**

1. Kör `window.skyttelVoiceFixture.setPlayback('blocked')` i konsolen.
   Tryck **Prata med Skyttel**.
2. Fokusera mikrofonknappen och tabba via **Skriv till Skyttel** till
   **Starta ljudet**.
3. Kör `window.skyttelVoiceFixture.setPlayback('allow')`. Tryck Retur
   medan **Starta ljudet** är fokuserad.

**Förväntat resultat:**

- **Webbläsaren stoppade ljudet. Starta ljudet.** läses i tur en gång.
  Ingen stängknapp finns för detta pågående hinder.
- Åtgärden kommer före återstående verktyg i läs- och tabbordningen.
- Notisen försvinner efter fungerande uppspelning. Fokus återgår till
  mikrofonknappen, vars påslagna läge förmedlas av knappens eget tillstånd.
  **Lyssnar** läses inte upp en extra gång när den knappen är fokuserad.

## Minskad rörelse

### HJALP-06: fasta former följer systemets inställning

**Syfte:** Undvika rörelse och övergångar i alla samtalets ytor.

**Användare:** Alex.

**Förutsättningar:** Aktivera operativsystemets minskade rörelse.
Mikrofonen är på. Ingen särskild appinställning ska användas.

**Integrationstest:**
[conversation-accessibility.spec.ts](../../tests/integration/conversation-accessibility.spec.ts),
testfallen:

- “HJALP-06: systemets minskade rörelse ger fasta former och omedelbara
  ytor vid 1280px”.
- “HJALP-06: systemets minskade rörelse ger fasta former och omedelbara
  ytor vid 390px”.

**Steg:**

1. Läs **Lyssnar** och de sju punkterna. Kör
   `window.skyttelVoiceFixture.setSound('microphone', true, 0.1)` och
   därefter samma kommando med `0.9`.
2. Kör `window.skyttelVoiceFixture.setSound('remote', true, 0.2)`.
   Återställ båda ljudkällorna med `setSound('microphone', false, 0)` och
   `setSound('remote', false, 0)` på samma fixtur.
3. Slå av mikrofonen. Öppna textvyn, skicka **Beskriv kartan.** och
   stäng textvyn medan `held`-anropet väntar.
4. Öppna textvyn och släpp anropet med `reply REQUEST Kartan är redo.`.
   Skicka **Ett nytt försök.** och kör `fail REQUEST` för detta anrop.
5. Läs notisen, öppna och stäng textvyn och växla systemets inställning
   till normal rörelse. Slå på mikrofonen och upprepa fjärrljudet.

**Förväntat resultat:**

- Vågformen har sju fasta punkter i tystnad och samma sju stilla staplar
  när någon hörs. Ljudnivån ändrar inte formen. Statusord och färg
  skiljer vem som hörs; informationen förmedlas inte bara med färg.
- Arbetsmarkeringen roterar inte. Notis, röstruta, textvy och
  mikrofonkontroll visas och försvinner omedelbart utan övergång.
- Systemets ändring till normal rörelse återställer den rörliga
  fjärrvågformen. Appen har ingen egen rörelseinställning.

## Samlad bedömning mot WCAG 2.2 AA

Detta är en avgränsad design- och provbedömning av samtalets kombinerade
flöde på dator och mobil. Den är inte ett påstående om fullständig
överensstämmelse för Skyttel eller alla hjälpmedel. DOM, tillgängliga
namn, fokus, CSS och riktiga serverflöden är automatiskt kontrollerbara;
faktiskt hörda uppläsningar och fysisk användbarhet är inte verifierade.

<!-- markdownlint-disable MD013 -->
| Krav | Design och automatiskt underlag | Kvarstående mänsklig kontroll |
| --- | --- | --- |
| 1.1.1, 1.3.1, 1.3.2, 4.1.2 | Namngiven Röstruta, semantisk samtalstext, dekorativa symboler och samma DOM-/tabbordning i HJALP-02; mikrofonens läge, namn och operabla hinder i HJALP-01/05 och TAL-16. | Läsordning, namn och tillstånd med verklig skärmläsare på dator och pekskärm. |
| 1.3.4, 1.4.10, 1.4.12, 2.4.11 | HJALP-02/05/06 täcker dator och smal skärm; [viewportfallen](text-view.md) täcker orientering, kort synlig höjd och samma fält vid tangentbord. Notisen har begränsad höjd och kan rullas. | Verklig zoom, textavstånd, skärmtangentbord och synligt fokus under långa feltexter i stödda webbläsare. |
| 1.4.1, 1.4.3, 1.4.11 | Statusord kompletterar vågform/färg; fasta former i HJALP-06. [Grafikfallen](spatial-map.md) och [textbrickorna](text-view.md) provar teman, kontrast och oförändrad geometri. NOT-09 mäter notistext och symbolkontrast i båda teman. | Visuell läsbarhet, symbolernas former enligt NOT-11, egna färglägen och fokuskontrast på verkliga skärmar. |
| 2.1.1, 2.1.2, 2.4.3, 2.4.6, 2.4.7, 2.5.3 | HJALP-01/02/05 provar Retur, Tab, synligt namnprefix och logisk borttagningsfokus. [Köfallen](conversation-queue.md) provar Escape/Avbryt; [medgivandet](conversation-consent.md) provar modal fokus och oskickad text. | Skärmläsarens tangentlägen, fokusindikatorer, fullständiga flöden utan pekdon och eventuell tangentkonflikt. |
| 2.2.2, 2.3.1 | HJALP-06 provar OS-styrda fasta former, stilla arbetsmarkering och inga övergångar. Ingen blinkande samtalsåterkoppling finns i designen. | **Skyttel talar** med normal rörelse längre än fem sekunder är uttryckligen inte färdigbedömt. Bedöm det i #220, utöver verklig OS-inställning och upplevd rörelse. |
| 2.5.7, 2.5.8 | [Breddfallen](text-view.md#personliga-bredder-på-dator) har tangentalternativ till dragning; [viewportfallen](text-view.md) provar 44-pixels mål på mobil. Åtgärd/stängning i HJALP-05 nås med tangentbord. | Träffytor, pekprecision och handhavande på fysisk telefon och surfplatta. |
| 3.2.1, 3.2.2, 3.3.1, 3.3.2, 3.3.3 | Notiser tar inte fokus när de uppstår; HJALP-04 provar bibehållet fält. [Röstfel](voice-errors.md), [notiser](conversation-notices.md) och [frågor](conversation-questions.md) har kort orsak och möjlig nästa handling. | Begriplighet, ordningsföljd och felåterhämtning vid lyssning och långsam användning. |
| 3.3.4 | [Sparandets kontroll](save-check.md), [frågor och Sparat](conversation-questions.md) samt medgivandefallen skiljer privat utkast, uttryckligt sparande och beständigt kvitto. | Hela användarens beslut om ändringar, granskning och återhämtning med hjälpmedel. |
| 4.1.3 | HJALP-03/04/05 provar en förekomst över ytorna och riktiga kontakt-/ljudflöden. Status är polite, notiser följer prioritetstabellen; enhetstest provar samtliga sexton uppläsningsnivåer och åtgärdsnamn. Transkriptet annonserar bara nya, ej röstlevererade svar. | Verklig avbrytande respektive köad uppläsning, dubblering, tal/SR-samspel och återkomstordning. |
<!-- markdownlint-enable MD013 -->

Kvarstående begränsning: den externa rösttransporten ger ingen säker signal
för allt framtida ljud efter en tyst paus. Sparat använder känt verifierat
svar, faktisk ljudaktivitet och definitivt avbrott enligt
[sparbeskedets prov](conversation-questions.md). Automatiken bevisar inte
att ett godtyckligt framtida ljudsegment är omöjligt. Lyssningsprov,
mikrofonbehörighet och full hjälpmedelsbedömning hör till #220. Ingen
sådan mänsklig körning redovisas här.

### Mänsklig slutkontroll

Utför [TAL-17](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
med NVDA och Chrome på Windows samt VoiceOver och Chrome på macOS,
iPhone och iPad. Prova först riktigt iPhone-tangentbord, ett fingertryck
som hålls och de två plattformarnas tangentkombinationer. Kör även
MIKROFONTRYCK-03/04, TEXTMOBIL-02/03, NOT-07/08 och HJALP-01–06.
Anteckna enhet, system, webbläsare, hjälpmedel, byggversion och resultat
för varje kombination i [#220](https://github.com/viscalyx/skyttel/issues/220).
Alla dessa mänskliga resultat återstår.

Låt **Skyttel talar** pågå längre än fem sekunder med normal rörelse och
bedöm vågformen enligt
[W3C:s vägledning för 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).
Kontrollera hur användaren stoppar rörelsen medan kartan och samtalet
fortfarande går att använda. Anta inget undantag för nödvändig rörelse.
Ett godkänt prov med minskad rörelse visar inte att normal rörelse uppfyller
2.2.2. Notera också om skärmläsarens röst tas upp av mikrofonen eller
avbryter Skyttel; de kontrollerade medieproven besvarar inte det.

Prova 200 och 400 procents förstoring, ökat textavstånd, båda teman och
hela flödet från medgivande till sparande och återkallande. Bedöm synligt
fokus, pekmål, rätt läsordning vid nederkanten och fri plats för kartans
rad och gemensamma återkoppling med verkligt tangentbord. Redovisa brister
som egna ärenden. Påstå bara överensstämmelse för det som är utvärderat.
