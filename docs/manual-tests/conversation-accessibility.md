# Manuella testfall för samtalets samlade hjälpmedelsflöde

Fallen förenar verktygsrad, röstruta, textvy och samtalsnotis. De omfattar
läsordning, tangentbord, fokus, uppläsningarnas förekomst och systemets minskade
rörelse på dator och smal skärm. Anteckna commit, webbläsare, hjälpmedel och
godkänt eller underkänt resultat vid körning.

HJALP-06/07/10 har sina stabila identiteter i Chromium-sviten
[conversation-accessibility.test.tsx](../../tests/browser/conversation-accessibility.test.tsx).
Den använder hushållskartans publika kontroller och produktionsstilar med
kontrollerade svar och medieströmmar genom samma externa medieram som
integrationsproven. HJALP-07 provar grov pekare och tangentbord; HJALP-06/10
provar minskad och normal rörelse vid 1280 respektive 390 pixels bredd.
Städningen efter kartans avmontering kontrollerar avslutade mikrofon- och
fjärrspår, anslutning och ljuduppspelning innan ersatta medier återställs.

Ingen identitet pensioneras. Dessa tre server-/leverantörskedjor upprepas
inte i motsvarande konfigurationer. HJALP-01 behåller tillgänglighetsväxling
och mikrofon av genom riktig HTTP-server. TAL-14 behåller röstsignal och
minskad rörelse genom riktig HTTP-server. Browserproven visar kontrollerad
komposition och resursstädning, inte beständigt sparande, fysisk pekskärm,
riktig mikrofon eller faktiskt hörda skärmläsarbesked. De manuella fallen
behåller den körbara serverförberedelsen nedan.

## Konfigurerade användare

Alex är vanlig medlem i ett tillfälligt hushåll och loggar in med provets
Google-knapp. Inga administrativa rättigheter krävs för samtalet.

## Allmän förberedelse

1. Följ
   [den kontrollerade röstguiden](voice-assistant.md#controlled-voice-fixture).
   Starta `npx tsx scripts/manual-voice.ts` i en egen terminal. Logga in och
   skapa ett hushåll på den angivna adressen. Använd påhittade uppgifter.
2. Behåll terminalen och utvecklarkonsolen öppna. `available off` och
   `available on` ändrar samtalets tillgänglighet. `pending` listar uppdragets
   `held` -anrop. `fail REQUEST` avbryter det aktuella anropet;
   `reply REQUEST Kartan är redo.` avslutar det med ett svar.
3. Starta en ny provmiljö inför varje fall. För röst, välj **Prata med
   Skyttel → Godkänn och starta** och invänta **Lyssnar**. För text utan
   röststart, välj **Skriv till Skyttel → Nytt samtal → Godkänn och starta**.
   Kör
   bara det aktuella fallets angivna bredd och pekarkonfiguration. Övriga
   konfigurationer har egna fall; upprepa inte dem i samma körning.
4. Provet använder riktig server och tillfällig SQLite men ersätter mikrofon,
   ljudtransport och externa leverantörer. Konsolkommandon nedan styr dessa
   ersättningar, aldrig appens interna tillstånd.
5. För egen hjälpmedelsbedömning: aktivera den skärmläsare som ska provas och
   anteckna dess version. Kontrollera både uppläsning och läsordning med dess
   vanliga läskommandon. Automatiska DOM-prov bevisar inte vad en verklig
   skärmläsare säger. Redovisa hjälpmedelsflöden enligt
   [Manuell verifiering av hushållsarbetet med skärmläsare och fysiska enheter](https://github.com/viscalyx/skyttel/issues/260).
6. Avsluta med `quit`. Provdatabasen tas bort. Återställ nätverk och
   operativsystemets rörelseinställning efter respektive fall.

## Samtalskontroller och ordning

### HJALP-01: blockerad mikrofon är tillgänglig för hjälpmedel

**Syfte:** Behålla en operabel knapp som förklarar hindret även i ett pågående
samtal på dator och pekskärm.

**Användare:** Alex.

**Förutsättningar:** Mikrofonen är på. Kör HJALP-01 med fin pekare vid
1280 pixels bredd. Den emulerade grova pekaren har eget fall HJALP-07;
verklig pekskärm hör till #220.

**Integrationstest:**
[conversation-accessibility.spec.ts](../../tests/integration/conversation-accessibility.spec.ts)
, HJALP-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-accessibility.spec.ts",
    "caseId": "HJALP-01"
  },
  "reference": "Chromium på dator med fin pekare; otillgängligt pågående samtal.",
  "outcomes": [
    "Behålla en operabel knapp som förklarar hindret även i ett pågående samtal på dator och pekskärm."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för HJALP-01](voice-controls-preparation.md#tidslinje-hjalp-01) vid
respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska resurser
separat. Utför arbetsflödet en gång.

**Steg:**

1. Låt förberedelsen göra det pågående samtalet otillgängligt. Läs hela notisen
   och mikrofonknappens tillgängliga beskrivning.
2. Fokusera **Prata med Skyttel** och tryck Enter. Fokus stannar där, en enda
   notis finns och mikrofonen är av.
3. När tillgängligheten återställts enligt förberedelsen försvinner notisen utan
   att mikrofonen startas. Läs återkomstens DOM-status separat; faktiskt hört
   besked hör till HJALP-11.

**Förväntat resultat:**

- Notisen säger att samtal inte är tillgängligt. Mikrofonen är av och knappen
  ser avstängd ut, men den är varken inaktiverad eller utmärkt som inaktiverad
  för hjälpmedel. Beskrivningen innehåller **Inte tillgängligt just nu.** Även
  pekläget har denna beskrivning.
- Retur behåller fokus på knappen och förklarar hindret. Mikrofonen börjar inte
  lyssna. Samma synliga notis visas bara en gång.
- Notisen försvinner när tillgängligheten återkommer.
  **Samtal med Skyttel är tillgängligt igen.** läses i tur. Mikrofonen förblir
  av.

### HJALP-02: läsordning och tabbordning följer samtalet vid flytt

**Syfte:** Bevara samma naturliga ordning även när notisen visuellt flyttar
mellan röstrutans plats och textvyn.

**Användare:** Alex.

**Förutsättningar:** Mikrofonen är på. Textvyn är öppen.

**Integrationstest:**
[conversation-accessibility.spec.ts](../../tests/integration/conversation-accessibility.spec.ts)
, HJALP-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-accessibility.spec.ts",
    "caseId": "HJALP-02"
  },
  "reference": "Chromium 1280 × 900; röstruta, uppdragsnotis och öppnad/stängd textvy.",
  "outcomes": [
    "Bevara samma naturliga ordning även när notisen visuellt flyttar mellan röstrutans plats och textvyn."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för HJALP-02](voice-controls-preparation.md#tidslinje-hjalp-02) vid
respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska resurser
separat. Utför arbetsflödet en gång.

**Steg:**

1. Skicka **Ge ett förslag.** och låt förberedelsen ge ett uppdragsfel. Läs hela
   notisen.
2. Låt förberedelsen ge inkommande aktivitet. Läs **Skyttel talar** och
   **Avbryt**.
3. Fokusera **Prata med Skyttel**. Gå med Tab genom **Skriv till Skyttel**,
   **Avbryt**, **Stäng notisen** och återstående synliga verktyg.
4. Stäng textvyn, prova samma ordning, öppna textvyn och prova igen. Läs
   dokumentordningen separat enligt förberedelsen.
5. Fokusera **Stäng notisen** och tryck Enter. Fokus återgår till
   mikrofonknappen.

**Förväntat resultat:**

- **Navigera** ligger bland kartverktygen efter **Karta**, före
  samtalskontrollerna. Samtalets ordning är **Prata med Skyttel**,
  **Skriv till Skyttel**, röstrutans **Avbryt**, **Stäng notisen**, sedan de
  återstående synliga verktygen. En notisknapp, när en sådan finns, föregår
  stängknappen.
- Läsordningen är densamma som tabbordningen. På smal skärm går fokus från
  verktygsraden till nederkanten och tillbaka. Dolda extraverktyg får inget
  tabbstopp; vid visade namn ligger de efter notisen. Efter notisen följer
  **Rapporter** på dator och **Information och hjälp** när extraverktygen är
  dolda på smal skärm.
- Öppen textvy visar notisen ovanför meddelandefältet. Stängd textvy visar den
  vid röstrutans plats. Bara en notis finns och flytten skapar ingen ny
  uppläsning.
- Stängning tar bort notisen och återför fokus till **Prata med Skyttel**.

## Uppläsning och återkomst

### HJALP-03: arbete och kontexttröskel har en förekomst över ytorna

**Syfte:** Undvika dubbla statusförekomster och behålla förekomsten även vid
besök i Inställningar.

**Användare:** Alex.

**Förutsättningar:** Mikrofonen är på och textvyn är öppen.

**Integrationstest:**
[conversation-accessibility.spec.ts](../../tests/integration/conversation-accessibility.spec.ts)
, HJALP-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-accessibility.spec.ts",
    "caseId": "HJALP-03"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Undvika dubbla statusförekomster och behålla förekomsten även vid besök i Inställningar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för HJALP-03](voice-controls-preparation.md#tidslinje-hjalp-03) vid
respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska resurser
separat. Utför arbetsflödet en gång.

**Steg:**

1. Skicka **Beskriv kartan.** och låt anropet vänta. Läs **Skyttel arbetar** och
   arbetsraden sist i samtalstexten.
2. Låt förberedelsen sätta kontexten till 85 procent. Besök **Inställningar**,
   välj **Tillbaka till kartan** och låt kontexten bli 88 procent.
3. Slå av mikrofonen under arbetet. Låt **Kartan är redo.** komma och läs
   svaret. Kontrollera DOM-status och nodförekomster separat; faktisk uppläsning
   hör till HJALP-11.

**Förväntat resultat:**

- **Skyttel arbetar** finns en gång som status för hjälpmedel, även när båda
  ytorna visar arbetet. Besöket i Inställningar och mikrofonens avslag upprepar
  inte upp samma arbete igen.
- **Kontexten är 85 procent full** finns en gång som status för hjälpmedel.
  Symbolens tillgängliga namn uppdateras till **Kontexten är 88 procent full**
  men högre värden annonseras inte igen. Sammanfattning förnyar inte
  förekomsten; ett uttryckligt **Nytt samtal** börjar en ny förekomst.
- Ett skrivet uppdrag fortsätter när mikrofonen slås av. Den särskilda
  arbetsvakten får inaktivera mikrofonknappen tills detta arbete är klart.

Prova även den automatiska förnyelsen enligt **KONTEXT-09** i
[kontextfallen](conversation-context.md). Behåll fokus i meddelandefältet under
kontrollen. När sammanfattningen pausar inspelningen och byter röstanslutning
ska inget extra **Mikrofonen är av** eller **Lyssnar** annonseras för den
interna pausen. Ett verkligt avslag eller släpp från användaren ska däremot
förbli av efter förnyelsen. Sammanfattningsraden annonseras en gång som ett nytt
textsvar, och 85-procentströskeln behåller sin tidigare förekomst. Detta är ett
separat automatiskt prov med kontrollerad transport, inte ett intyg om verklig
skärmläsaruppläsning.

#### Pensionerat HJALP-04

HJALP-04 är pensionerat till
[NOT-03](conversation-notices.md#not-03-flytt-till-textvyn-bevarar-båda-fokusvägarna)
. Samma notiskort, en enda statusförekomst, inget extra mikrofonbesked, fokus i
meddelandefältet och avstängd mikrofon genom återkomsten ingår i samma
överlevande scenario som mikrofonknappens fokus och placering. Identiteten får
inte återanvändas. Faktiskt hört besked är ett separat mänskligt prov; ingen
sådan observation är automatiserad.

### HJALP-05: ljudknappens ordning och borttagning behåller fokus

**Syfte:** Placera notisens åtgärd efter samtalsknapparna och undvika en extra
mikrofonuppläsning efter användarens åtgärd.

**Användare:** Alex.

**Förutsättningar:** Börja med **Skriv till Skyttel → Nytt samtal → Godkänn
och starta**, giltigt medgivande och
mikrofonen av. Röstanslutningen ska inte redan vara igång.

**Integrationstest:**
[conversation-accessibility.spec.ts](../../tests/integration/conversation-accessibility.spec.ts)
, HJALP-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-accessibility.spec.ts",
    "caseId": "HJALP-05"
  },
  "reference": "Chromium 1280 × 900; blockerad uppspelning före mikrofonstart.",
  "outcomes": [
    "Placera notisens åtgärd efter samtalsknapparna och undvika en extra mikrofonuppläsning efter användarens åtgärd."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för HJALP-05](voice-controls-preparation.md#tidslinje-hjalp-05) vid
respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska resurser
separat. Utför arbetsflödet en gång.

**Steg:**

1. Starta mikrofonen med förberedelsens blockerade uppspelning. Läs
   ljudhindret och **Starta ljudet** utan aktiv mikrofon.
2. Fokusera **Prata med Skyttel**. Tabba till **Skriv till Skyttel**
   och sedan **Starta ljudet**; läs den artiga DOM-statusen separat.
3. När förberedelsen tillåter ljudet, tryck Enter på **Starta ljudet**.
   Notisen försvinner, mikrofonknappen får fokus och **Lyssnar** visas.

**Förväntat resultat:**

- **Webbläsaren stoppade ljudet. Starta ljudet.** finns en gång som status för
  hjälpmedel. Ingen stängknapp finns för detta pågående hinder.
- Åtgärden kommer före återstående verktyg i läs- och tabbordningen.
- Notisen försvinner efter fungerande uppspelning. Fokus återgår till
  mikrofonknappen, vars påslagna läge förmedlas av knappens eget tillstånd.
  **Lyssnar** upprepas inte i statusen en extra gång när den knappen är
  fokuserad.

## Minskad rörelse

### HJALP-06: fasta former följer systemets inställning

**Syfte:** Undvika rörelse och övergångar i alla samtalets ytor.

**Användare:** Alex.

**Förutsättningar:** Emulera minskad rörelse i webbläsarens utvecklarverktyg.
Mikrofonen är på. Ingen särskild appinställning ska användas.

**Automatiskt motsvarande Chromium-test:**
[conversation-accessibility.test.tsx](../../tests/browser/conversation-accessibility.test.tsx)
, HJALP-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/conversation-accessibility.test.tsx",
    "caseId": "HJALP-06"
  },
  "evidence": [
    {
      "kind": "overlap",
      "runner": "playwright",
      "suite": "integration",
      "spec": "tests/integration/voice-box.spec.ts",
      "caseId": "TAL-14",
      "purpose": "Röstsignal och minskad rörelse behåller riktig HTTP-server och kontrollerad leverantörskedja."
    }
  ],
  "reference": "Chromium 1280 × 900; faktisk hushållskarta med produktionsstilar, emulerad minskad/normal rörelse och kontrollerade samtalssvar och medieströmmar. Ingen verklig HTTP-server eller leverantör körs i denna motsvarighet.",
  "outcomes": [
    "Undvika rörelse och övergångar i alla samtalets ytor."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för HJALP-06](voice-controls-preparation.md#tidslinje-hjalp-06) vid
respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska resurser
separat. Utför arbetsflödet en gång.

**Steg:**

1. Välj emulerad minskad rörelse före första handlingen. Läs stilla former vid
   egen och inkommande aktivitet enligt förberedelsen.
2. Skicka **Beskriv kartan.** och håll anropet. Läs **Skyttel arbetar**,
   öppna/stäng textvyn och granska stilla former utan övergång.
3. Låt **Kartan är redo.** komma. Skicka **Ett nytt försök.** och låt
   förberedelsen ge ett fel. Läs stilla notis och kontroller.
4. Återställ normal rörelse, slå på mikrofonen och låt inkommande aktivitet börja.
   Läs den synliga vågformen och nå **Avbryt**. Fysisk normal rörelse och
   förstoring bedöms i HJALP-12.

**Förväntat resultat:**

- Vågformen har sju fasta punkter i tystnad och samma sju stilla staplar när
  någon hörs. Ljudnivån ändrar inte formen. Statusord och färg skiljer vem som
  hörs; informationen förmedlas inte bara med färg.
- Arbetsmarkeringen roterar inte. Notis, röstruta, textvy och mikrofonkontroll
  visas och försvinner omedelbart utan övergång.
- Systemets ändring till normal rörelse återställer den rörliga fjärrvågformen.
  Appen har ingen egen rörelseinställning.

## Samlad bedömning mot WCAG 2.2 AA

Detta är en avgränsad design- och provbedömning av samtalets kombinerade flöde
på dator och mobil. Den är inte ett påstående om fullständig överensstämmelse
för Skyttel eller alla hjälpmedel. DOM, tillgängliga namn, fokus, CSS och
riktiga serverflöden är automatiskt kontrollerbara; faktiskt hörda uppläsningar
och fysisk användbarhet är inte verifierade.

<!-- markdownlint-disable MD013 -->
| Krav | Design och automatiskt underlag | Kvarstående mänsklig kontroll |
| --- | --- | --- |
| 1.1.1, 1.3.1, 1.3.2, 4.1.2 | Namngiven Röstruta, semantisk samtalstext, dekorativa symboler och samma DOM-/tabbordning i HJALP-02; mikrofonens läge, namn och operabla hinder i HJALP-01/05 och TAL-16. | Läsordning, namn och tillstånd med verklig skärmläsare på dator och pekskärm. |
| 1.3.4, 1.4.10, 1.4.12, 2.4.11 | HJALP-02/05/06 täcker dator och smal skärm; [viewportfallen](text-view.md) täcker orientering, kort synlig höjd och samma fält vid tangentbord. Notisen har begränsad höjd och kan rullas. | Verklig zoom, textavstånd, skärmtangentbord och synligt fokus under långa feltexter i stödda webbläsare. |
| 1.4.1, 1.4.3, 1.4.11 | Statusord kompletterar vågform/färg; fasta former i HJALP-06. [Grafikfallen](spatial-map.md) och [textbrickorna](text-view.md) provar teman, kontrast och oförändrad geometri. NOT-09 mäter notistext och symbolkontrast i båda teman. | Visuell läsbarhet, symbolernas former enligt NOT-11, egna färglägen och fokuskontrast på verkliga skärmar. |
| 2.1.1, 2.1.2, 2.4.3, 2.4.6, 2.4.7, 2.5.3 | HJALP-01/02/05 provar Retur, Tab, synligt namnprefix och logisk borttagningsfokus. [Köfallen](conversation-queue.md) provar Escape/Avbryt; [medgivandet](conversation-consent.md) provar modal fokus och oskickad text. | Skärmläsarens tangentlägen, fokusindikatorer, fullständiga flöden utan pekdon och eventuell tangentkonflikt. |
| 2.2.2, 2.3.1 | HJALP-06 provar OS-styrda fasta former, stilla arbetsmarkering och inga övergångar. Ingen blinkande samtalsåterkoppling finns i designen. | **Skyttel talar** med normal rörelse längre än fem sekunder är uttryckligen inte färdigbedömt. Bedöm det i #220, utöver verklig OS-inställning och upplevd rörelse. |
| 2.5.7, 2.5.8 | [Breddfallen](text-view.md#personliga-bredder-på-dator) har tangentalternativ till dragning; [viewportfallen](text-view.md) provar 44-pixels mål på mobil. Åtgärd/stängning i HJALP-05 nås med tangentbord. | Träffytor, pekprecision och handhavande på fysisk telefon och surfplatta. |
| 3.2.1, 3.2.2, 3.3.1, 3.3.2, 3.3.3 | Notiser tar inte fokus när de uppstår; NOT-03 provar bibehållet fält. [Röstfel](voice-errors.md), [notiser](conversation-notices.md) och [frågor](conversation-questions.md) har kort orsak och möjlig nästa handling. | Begriplighet, ordningsföljd och felåterhämtning vid lyssning och långsam användning. |
| 3.3.4 | [Sparandets kontroll](save-check.md), [frågor och Sparat](conversation-questions.md) samt medgivandefallen skiljer privat utkast, uttryckligt sparande och beständigt kvitto. | Hela användarens beslut om ändringar, granskning och återhämtning med hjälpmedel. |
| 4.1.3 | HJALP-03/05 och NOT-03 provar en förekomst över ytorna och riktiga kontakt-/ljudflöden. Status är polite, notiser följer prioritetstabellen; enhetstest provar samtliga sexton uppläsningsnivåer och åtgärdsnamn. Transkriptet annonserar bara nya, ej röstlevererade svar. | Verklig avbrytande respektive köad uppläsning, dubblering, tal/SR-samspel och återkomstordning. |
<!-- markdownlint-enable MD013 -->

Kvarstående begränsning: den externa rösttransporten ger ingen säker signal för
allt framtida ljud efter en tyst paus. Sparat använder känt verifierat svar,
faktisk ljudaktivitet och definitivt avbrott enligt
[sparbeskedets prov](conversation-questions.md). Automatiken bevisar inte att
ett godtyckligt framtida ljudsegment är omöjligt. Ansvar för fysiska prov,
hjälpmedelsflöden och driftens ljudavbrott anges i
[ansvarsfördelningen](README.md#ansvar-och-delade-resultat). Ingen sådan
mänsklig körning redovisas här.

### Mänsklig slutkontroll

Utför
[TAL-17](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
med NVDA och Chrome på Windows samt VoiceOver och Chrome på macOS, iPhone och
iPad. Följ HJALP-11 för faktiskt hörda besked och HJALP-12 för fysisk
inmatning, zoom och rörelse. Använd TEXTMOBIL-13 för riktigt
skärmtangentbord och MIKROFONTRYCK-10–12 för fysiska tangentkombinationer
och håll/släpp. De automatiserade fallen behöver inte handköras igen.
Redovisa läsordning, uppläsningar, skärmtangentbord, zoom och layout i
[Manuell verifiering av hushållsarbetet med skärmläsare och fysiska enheter](https://github.com/viscalyx/skyttel/issues/260).
Redovisa mikrofonstyrning, tangentkombinationer, OS-behörighet, rörelse och
upptaget skärmläsarljud i
[Prova mikrofonstyrning, tangentkombinationer, rörelse och skärmläsarljud](https://github.com/viscalyx/skyttel/issues/220).
Anteckna varje kombination enligt
[ansvar och delade resultat](README.md#ansvar-och-delade-resultat).

Låt **Skyttel talar** pågå längre än fem sekunder med normal rörelse och bedöm
vågformen enligt
[W3C:s vägledning för 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
. Kontrollera hur användaren stoppar rörelsen medan kartan och samtalet
fortfarande går att använda. Anta inget undantag för nödvändig rörelse. Ett
godkänt prov med minskad rörelse visar inte att normal rörelse uppfyller 2.2.2.
Notera också om skärmläsarens röst tas upp av mikrofonen eller avbryter Skyttel;
de kontrollerade medieproven besvarar inte det.

Prova 200 och 400 procents förstoring, ökat textavstånd, båda teman och hela
flödet från medgivande till sparande och återkallande. Bedöm synligt fokus,
pekmål, rätt läsordning vid nederkanten och fri plats för kartans rad och
gemensamma återkoppling med verkligt tangentbord. Redovisa brister som egna
ärenden. Påstå bara överensstämmelse för det som är utvärderat.

## Separata konfigurationer

### HJALP-07: blockerad mikrofon med grov pekare

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Emulera grov pekare i webbläsarens
enhetsverktyg; ingen fysisk pekskärm är verifierad.

**Automatiskt motsvarande Chromium-test:**
[conversation-accessibility.test.tsx](../../tests/browser/conversation-accessibility.test.tsx)
, HJALP-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/conversation-accessibility.test.tsx",
    "caseId": "HJALP-07"
  },
  "evidence": [
    {
      "kind": "overlap",
      "runner": "playwright",
      "suite": "integration",
      "spec": "tests/integration/conversation-accessibility.spec.ts",
      "caseId": "HJALP-01",
      "purpose": "Tillgängligheten återkommer genom riktig HTTP-server utan att mikrofonen startas."
    }
  ],
  "reference": "Chromium 1280 × 720; grov pekare via webbläsaremulering och Retur genom webbläsarens tangentbord, faktisk hushållskarta med produktionsstilar och kontrollerade samtalssvar/medieströmmar. HJALP-01 behåller riktig HTTP-tillgänglighet och mikrofon av.",
  "outcomes": [
    "Den operabla mikrofonknappen beskriver hindret, Retur behåller fokus och en enda notis visas med mikrofonen av.",
    "Tillgängligheten återkommer med DOM-status utan att mikrofonen startas; automatisk städning avslutar medieresurserna."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [HJALP-01](#hjalp-01-blockerad-mikrofon-är-tillgänglig-för-hjälpmedel)
   en gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Den operabla mikrofonknappen beskriver hindret. Retur behåller fokus,
  en enda notis visas och mikrofonen förblir av när tillgängligheten återkommer.
- Återkomstens DOM-status finns. Automatisk städning av hushållskartan
  avslutar mikrofon- och fjärrspår, anslutning och ljuduppspelning.

### HJALP-08: samtalsordning på smal skärm

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Sätt fönstret till 390 × 900.

**Integrationstest:**
[conversation-accessibility.spec.ts](../../tests/integration/conversation-accessibility.spec.ts)
, HJALP-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-accessibility.spec.ts",
    "caseId": "HJALP-08"
  },
  "reference": "Chromium 390 × 900; samma distinkta smala arbetsflöde.",
  "outcomes": [
    "Mikrofonens val, operabla kontroller och den angivna statusförekomsten bevaras.",
    "Samma läs-/tabbordning, åtkomliga ytor och återgångsfokus skyddas i denna konfiguration."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför
   [HJALP-02](#hjalp-02-läsordning-och-tabbordning-följer-samtalet-vid-flytt) en
   gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Mikrofonens val, operabla kontroller och den angivna statusförekomsten
  bevaras.
- Samma läs-/tabbordning, åtkomliga ytor och återgångsfokus skyddas i denna
  konfiguration.

### HJALP-09: ljudknapp och fokus på smal skärm

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Sätt fönstret till 390 × 900.

**Integrationstest:**
[conversation-accessibility.spec.ts](../../tests/integration/conversation-accessibility.spec.ts)
, HJALP-09.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-accessibility.spec.ts",
    "caseId": "HJALP-09"
  },
  "reference": "Chromium 390 × 900; samma distinkta smala arbetsflöde.",
  "outcomes": [
    "Mikrofonens val, operabla kontroller och den angivna statusförekomsten bevaras.",
    "Samma läs-/tabbordning, åtkomliga ytor och återgångsfokus skyddas i denna konfiguration."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför
   [HJALP-05](#hjalp-05-ljudknappens-ordning-och-borttagning-behåller-fokus) en
   gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Mikrofonens val, operabla kontroller och den angivna statusförekomsten
  bevaras.
- Samma läs-/tabbordning, åtkomliga ytor och återgångsfokus skyddas i denna
  konfiguration.

### HJALP-10: minskad rörelse på smal skärm

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Sätt fönstret till 390 × 900.

**Automatiskt motsvarande Chromium-test:**
[conversation-accessibility.test.tsx](../../tests/browser/conversation-accessibility.test.tsx)
, HJALP-10.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/conversation-accessibility.test.tsx",
    "caseId": "HJALP-10"
  },
  "evidence": [
    {
      "kind": "overlap",
      "runner": "playwright",
      "suite": "integration",
      "spec": "tests/integration/voice-box.spec.ts",
      "caseId": "TAL-14",
      "purpose": "Röstsignal och minskad rörelse behåller riktig HTTP-server och kontrollerad leverantörskedja."
    }
  ],
  "reference": "Chromium 390 × 900; faktisk hushållskarta med produktionsstilar, emulerad minskad/normal rörelse och kontrollerade samtalssvar och medieströmmar. TAL-14 behåller signal- och rörelseunderlag mot riktig HTTP-server.",
  "outcomes": [
    "Sju fasta punkter eller stilla staplar bevaras vid olika ljudnivåer och båda ljudkällorna; arbetsmarkeringen står stilla.",
    "Notis, textvy, hörnyta och kontroller saknar övergångar; normal rörelse återställer fjärrvågformens animation."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [HJALP-06](#hjalp-06-fasta-former-följer-systemets-inställning) en
   gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Samma fasta former, stilla arbetsmarkering och omedelbara ytor som i
  HJALP-06 visas vid den smala bredden.
- Normal rörelse återställer fjärrvågformens animation; ingen egen
  rörelseinställning finns i appen.

### HJALP-11: faktisk läsordning och en enda uppläsning

**Syfte:** Hör verklig avbrytande respektive köad uppläsning och bedöm
läsordning utan dubbla mikrofon- eller arbetsbesked.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Hör verklig avbrytande respektive köad
uppläsning och bedöm läsordning utan dubbla mikrofon- eller arbetsbesked.

**Resultatansvar:**
[Manuell verifiering av hushållsarbetet med skärmläsare och fysiska enheter](https://github.com/viscalyx/skyttel/issues/260).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Hör verklig avbrytande respektive köad uppläsning och bedöm läsordning utan dubbla mikrofon- eller arbetsbesked."
  },
  "reference": "NVDA/Chrome på Windows och VoiceOver/Chrome på macOS, iPhone och iPad.",
  "outcomes": [
    "Varje nytt besked hörs en gång i rätt tur; vybyten dubblerar det inte.",
    "Kontroller, status och återställt fokus är begripliga med det faktiskt provade hjälpmedlet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta ett samtal, läs med skärmläsarens kommandon och växla mellan verktyg,
   textvy, röstruta och Inställningar.
2. Bryt nätverket med fokus först på mikrofonknappen, sedan i meddelandefältet.
   Återställ nätverket och lyssna på återkomstbeskedet.
3. Stäng och öppna textvyn, stoppa ett uppdrag och återkalla medgivandet. Bedöm
   hela flödet och anteckna faktisk ordning/fokus per enhet.

**Förväntat resultat:**

- Varje nytt besked hörs en gång i rätt tur; vybyten dubblerar det inte.
- Kontroller, status och återställt fokus är begripliga med det faktiskt provade
  hjälpmedlet.

### HJALP-12: fysisk inmatning zoom och normal rörelse

**Syfte:** Bedöm verklig pekning, tangentkommandon, 200/400 procents zoom,
textavstånd och rörelse längre än fem sekunder.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Bedöm verklig pekning, tangentkommandon,
200/400 procents zoom, textavstånd och rörelse längre än fem sekunder.

**Resultatansvar:** Rörelse och mikrofonens tangentkombinationer hör till
[Prova mikrofonstyrning, tangentkombinationer, rörelse och skärmläsarljud](https://github.com/viscalyx/skyttel/issues/220).
Zoom, textavstånd, pekning och hela hjälpmedelsflöden hör till
[Manuell verifiering av hushållsarbetet med skärmläsare och fysiska enheter](https://github.com/viscalyx/skyttel/issues/260).
Länka samma körning när den faktiskt täcker båda slags observationer.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Bedöm verklig pekning, tangentkommandon, 200/400 procents zoom, textavstånd och rörelse längre än fem sekunder."
  },
  "reference": "Windows/macOS/iPhone/iPad; båda teman, faktisk OS-inställning och fysisk inmatning.",
  "outcomes": [
    "De faktiskt provade kompletta flödena är nåbara och läsbara.",
    "Rörelse och hjälpmedel bedöms separat; automatisk minskad rörelse etablerar inte full WCAG-överensstämmelse."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför medgivande, skriv ett uppdrag, granska hela förslaget och spara, läs
   kvittot och återkalla medgivandet med fysiskt tangentbord eller pekning.
2. Prova båda teman, 200/400 procents zoom, ökat textavstånd och minskad
   rörelse. Bedöm oskymt fokus, läsbarhet och pekprecision.
3. Låt Skyttel talar pågå över fem sekunder med normal rörelse. Bedöm hur
   rörelsen stoppas medan kartan och samtalet fortsatt går att använda; anteckna
   brister utan att anta ett undantag.

**Förväntat resultat:**

- De faktiskt provade kompletta flödena är nåbara och läsbara.
- Rörelse och hjälpmedel bedöms separat; automatisk minskad rörelse etablerar
  inte full WCAG-överensstämmelse.
