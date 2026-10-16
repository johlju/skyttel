# Manuella testfall för frågor och talade sparbesked

Fallen provar nödvändiga frågor i samma samtal med text och röst, väntan
med mikrofonen av och ett verifierat sparbesked. Anteckna commit,
webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex Exempel är administratör i provhushållet och Robin Exempel är medlem.
De använder var sin webbläsarprofil. I den kontrollerade miljön loggar de
in med Google. Samtalet kräver inte administrativa rättigheter.

Körbara paket, versionsvärden, felgränser och städning finns i
[den separata förberedelsen](conversation-preparation.md). Följ den vid
angivet arbetssteg, tillsammans med UI-proceduren en gång.

## Läsning av bevarade och sparade uppgifter

När ett steg kräver kvarvarande eller rättat Lo-förslag: öppna
**Skriv till Skyttel → Visa utkastet → Visa förslaget: Lo Exempel**
(eller det rättade namnet).
Läs Person, det aktuella namnet och tom beskrivning (**Ej uppgivet**).
Stäng dialogen före nästa samtalssteg. När ett steg kräver sparad Lo:
öppna **Tabell**, fäll ut objektets rad och läs samma fullständiga värden.
Ett kvitto läses genom **Rapporter → Ändringshistorik → Visa ändringarna**.
Läs objektets namn, typ och tom beskrivning (**Ingen beskrivning**) och välj
**Tillbaka till arbetet**.
Gör läsningen vid respektive bevarat/rättat/sparat steg, utan att lägga
nya förslag i utkastet eller utföra ett extra sparande.

## Allmän förberedelse

1. Starta en ny installation enligt
   [den kontrollerade röstguiden](voice-assistant.md#controlled-voice-fixture).
   Skapa ett hushåll. Lägg ett Person-objekt **Lo Exempel** i det privata
   utkastet genom **Nytt objekt → Lägg i utkastet och stäng**. Spara inte.
2. För identitetsfrågan: välj **Objektets identitet → Obesvarad
   identitetsfråga** innan förslaget läggs i utkastet. Börja en ny
   installation med en identifierad Lo inför sparfallen FRAGA-04–06.
3. Ersätt `REQUEST` med terminalens aktuella `held`-ID. En nödvändig
   fråga utan ändringar släpps med:

   <!-- markdownlint-disable MD013 -->
   ```text
   tool REQUEST ask_questions {"questions":["Vilken person avses med Lo, och vilket namn ska objektet ha?"]}
   ```
   <!-- markdownlint-enable MD013 -->

   Ett vanligt svar släpps med `reply REQUEST Tack, nu vet jag vilken Lo
   du menar.`. För sparande används `save_draft` med `version` och
   `contentVersion` från det aktuella `held.draft`, enligt röstguiden.
4. De kontrollerade mediespåren är tysta. För gränssnittets prov av ett
   mottaget ljudstycke använder du webbläsarkonsolen. Slå först på
   signalen och kontrollera **Skyttel talar**:

   ```javascript
   window.skyttelVoiceFixture.setSound('remote', true);
   ```

   Skicka sedan den kontrollerade texten genom det externa
   transportsubstitutet. Ersätt `TEXT` med hela frågan eller `Sparat.`:

   ```javascript
   window.skyttelVoiceFixture.emit({
     type: 'session.output_transcript.delta',
     event_id: crypto.randomUUID(),
     delta: 'TEXT', start_ms: 200, end_ms: 300
   });
   ```

   Avsluta signalen med
   `window.skyttelVoiceFixture.setSound('remote', false);`.
5. Detta provar ljudaktivitet och gränssnitt mot riktig server och SQLite.
   Det verifierar inte fysisk mikrofon, svensk talförståelse, en verklig
   röst eller att modellens uppläsning matchar frågan. Följ
   [förberedelsen i TAL-17](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
   för dessa observationer med verkliga leverantörer och fysisk mikrofon.
   Redovisa faktiskt hört tal separat från den kontrollerade körningen
   och det automatiska [WAV-provet](real-voice-tests.md).

## Nödvändiga frågor

### FRAGA-01: identitetsfrågan finns i samtalet

**Syfte:** Skyttel ställer frågan i samtalet utan en separat frågeruta.

**Användare:** Alex.

**Förutsättningar:** Lo har en obesvarad identitetsfråga i utkastet.

**Integrationstest:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
testfallet “FRAGA-01: en nödvändig identitetsfråga finns i samtalstexten
med serverns väntesignal”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-questions.spec.ts",
    "caseId": "FRAGA-01"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven talad eller skriven ingång skyddar nödvändig väntan och verifierat sparbesked.",
  "outcomes": [
    "Frågan står som Skyttels svar i samtalstexten. Ingen röstruta visas i ett samtal med enbart text och inget sparas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Skriv till Skyttel → Nytt samtal**, godkänn medgivandet och
   skicka **Red ut vilken Lo som avses.** Släpp frågan enligt förberedelsen.
2. Läs frågan i **Samtalstext**. Kontrollera kartan och utkastet.

**Förväntat resultat:**

- Frågan står som Skyttels svar i samtalstexten. Ingen röstruta visas
  i ett samtal med enbart text och inget sparas.
- Det automatiserade provet kontrollerar även serverns uttryckliga
  väntesignal och det verkliga utkastets obesvarade identitet.

### FRAGA-02: konflikter reds ut i samtalet

**Syfte:** Fråga om de verkliga alternativen utan att välja åt användaren.

**Användare:** Alex och Robin.

**Förutsättningar:** Följ
[konfliktförberedelsen UTKAST-17](drafts.md#utkast-17-avbruten-formulärförlust-och-oberoende-utkast-består-vid-konflikt).
Lo Exempel är sparad, Alex föreslår Lo Lind och Robin sparar Lo Berg.

**Integrationstest:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
testfallet “FRAGA-02: Skyttel frågar om en verklig konflikt i samtalet
utan en genererad frågeruta”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-questions.spec.ts",
    "caseId": "FRAGA-02"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven talad eller skriven ingång skyddar nödvändig väntan och verifierat sparbesked.",
  "outcomes": [
    "Skyttel frågar vilket värde Alex vill behålla och beskriver de verkliga alternativen i samtalstexten. Lo Berg förblir sparat; Alex förslag är privat. Alex läser hela Lo Lind genom förslaget och Robin läser hela sparade Lo Berg i sin Tabell. Alex tabell visar utkastets Lo Lind och används inte som sparad läsning.",
    "Gränssnittet skapar inte raden **Utkastet har konflikter**. Kartans konfliktnavigering och privata utkast finns kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Alex väljer **Skriv till Skyttel → Nytt samtal → Godkänn och starta**
   och skickar **Hjälp mig välja vilket namn vi ska behålla.**
2. Släpp en riktad `ask_questions`-fråga om Lo Exempel, Lo Lind och
   Lo Berg. Läs frågan och kontrollera båda klienternas karta.

**Förväntat resultat:**

- Skyttel frågar vilket värde Alex vill behålla och beskriver de verkliga
  alternativen i samtalstexten. Lo Berg förblir sparat; Alex förslag är privat.
  Alex läser hela Lo Lind
  genom förslaget och Robin läser hela sparade Lo Berg i sin Tabell.
  Alex tabell visar utkastets Lo Lind och används inte som sparad läsning.
- Kartans konfliktnavigering och privata utkast finns kvar.
  Automationens ursprungliga kontroll av separat frågepresentation
  behålls som underlag.

### FRAGA-03: den talade frågan väntar kvar med mikrofonen av

**Syfte:** Kunna svara med tal eller text utan automatisk vyöppning.

**Användare:** Alex.

**Förutsättningar:** Lo har en obesvarad identitet. Starta rösten och
invänta **Lyssnar**. Använd ett talat uppdrag. FRAGA-07 provar skriven ingång.

**Integrationstest:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
FRAGA-03, talat uppdrag.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-questions.spec.ts",
    "caseId": "FRAGA-03"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven talad eller skriven ingång skyddar nödvändig väntan och verifierat sparbesked.",
  "outcomes": [
    "Det kontrollerade svaret och frågan finns i samtalstexten. Ingen frågetext visas bredvid röstrutan och textvyn öppnas inte automatiskt.",
    "**Väntar på ditt svar** består när mikrofonen är av. De sju punkterna är då nedtonade. Faktisk uppläsning provas i FRAGA-08.",
    "Det skrivna svaret avlägsnar det gamla vänteläget; mikrofonen förblir av."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steg 1: kör `user Vilken Lo avses?` och `delegate` och
bekräfta leveransen. Vid steg 2: använd det verkliga hållna uppdragets
aktuella värden och befintligt `ask_questions`-recept. Återge hela
frågan med förberedd signal och transporttext, avsluta signalen och
meddela **Hela frågan är släppt och signalen avslutad**. Bevara
FRAGA-07:s skrivna ingång: där skickar användaren sitt meddelande
i grundfallets steg 1 och operatören använder inget talat
`user Vilken Lo avses?` eller `delegate` för det steget.
Använd [den separata samtalsförberedelsen](conversation-preparation.md)
och samma provinstallation under fallet. Operatören styr bara den
kontrollerade leverantören; vanliga UI-steg läser verkliga resultat.
Stäng konsolen före fokusproven. Återställ signaler och hållningar
efter känt utfall, avsluta med `quit` och starta nytt mellan fallen.

**Steg:**

1. Be operatören leverera det kontrollerade taluppdraget och invänta
   bekräftelse.
2. Be operatören släppa hela frågan med dess förberedda signal och text. Invänta
   bekräftelse av släppet och avslutad signal.
3. Kontrollera **Väntar på ditt svar**. Stäng av mikrofonen och läs rutan.
4. Välj själv **Skriv till Skyttel**. Läs frågan och svara **Det är Lo Exempel
   som avses.** Släpp det vanliga svaret enligt förberedelsen.

**Förväntat resultat:**

- Det kontrollerade svaret och frågan finns i samtalstexten. Ingen frågetext
  visas bredvid röstrutan och textvyn
  öppnas inte automatiskt.
- **Väntar på ditt svar** består när mikrofonen är av. De sju punkterna
  är då nedtonade. Faktisk uppläsning provas i FRAGA-08.
- Det skrivna svaret avlägsnar det gamla vänteläget; mikrofonen förblir av.

## Verifierade sparbesked

### FRAGA-10: väntande fråga bevarar oberoende svar och nytt sparbesked

**Syfte:** En oklar identitet pausar bara den berörda delen. Andra frågor
besvaras och sparandet väntar på ett nytt uttryckligt uppdrag.

**Användare:** Alex.

**Förutsättningar:** Lo Exempel finns i utkastet med obesvarad identitet
enligt den allmänna förberedelsen.

**Separat förberedelse:** Släpp den hållna identitetsfrågan med
`continueResponse: true` enligt följande terminalrecept. Ersätt `REQUEST`
med aktuellt hållnings-ID. På nästa hållning, använd det nya ID:t och släpp
`reply REQUEST Lo Exempel är en person i ditt utkast.`. Återställ enligt
[samtalsförberedelsen](conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
```text
tool REQUEST ask_questions {"questions":["Vilken person avses med Lo, och vilket namn ska objektet ha?"],"continueResponse":true}
```
<!-- markdownlint-enable MD013 -->

**Automatiskt motsvarande test:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
FRAGA-10. Kontrollerad leverantör med riktig server och SQLite; ingen
verklig taligenkänning eller uppläsning provas.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-questions.spec.ts",
    "caseId": "FRAGA-10"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite.",
  "outcomes": [
    "Identitetsfrågan och svaret om objekttypen finns samtidigt i samtalstexten.",
    "Både upphörd sparbegäran och behovet av ett nytt sparbesked framgår. Lo finns kvar i utkastet; inget sparas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Skriv till Skyttel → Nytt samtal → Godkänn och starta**.
1. Skicka **Red ut vilken Lo som avses och berätta förslagets objekttyp.
   Spara.** Låt operatören släppa frågan och det oberoende svaret.
1. Läs båda svaren och sparbeskedet i **Samtalstext**.
1. Öppna Lo-förslaget enligt läsanvisningen och kontrollera kartan.

**Förväntat resultat:**

- Identitetsfrågan och svaret om objekttypen finns samtidigt i samtalet.
- Både att den tidigare sparbegäran upphört och att sparande måste begäras
  igen när frågorna är lösta framgår.
- Lo finns kvar som Person i utkastet. Inget har sparats.

### FRAGA-04: fyra sekunder börjar efter det talade sparbeskedet

**Syfte:** Ett kvitto och observerat ljud krävs för det gröna sparbeskedet.

**Användare:** Alex.

**Förutsättningar:** Identifierad Lo i utkastet, mikrofonen på och textvyn
stängd. Ett tidtagarur finns tillgängligt.

**Integrationstest:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
testfallet “FRAGA-04: ett verifierat Sparat väntar på hela ordet och
ljudet innan fyra sekunder börjar”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-questions.spec.ts",
    "caseId": "FRAGA-04"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Hela det aktuella talbeskedet levereras i fragment, även när samma kvitto kontrolleras före röstsvaret.",
  "outcomes": [
    "Ingen tid räknas från kvittot, ett ofullständigt ord eller enbart transporttext före det kontrollerade ljudet. **Skyttel talar** består medan ljudet är aktivt.",
    "Efter ljudet visas **Sparat** i fyra sekunder, med en grön bock mellan vågformen och ordet. Bocken är dold för hjälpmedel. Sparbeskedet under hushållsnamnet annonseras artigt en gång vid kvittot; röstrutan upprepar ingen sparannons. Textvyn öppnas inte av sig själv.",
    "**Sparat.** finns i samtalstexten. Lo finns en gång i den sparade kartan och det bekräftade sparandet finns under **Rapporter → Ändringshistorik**."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ [ljudfragment och tid](conversation-preparation.md#ljudfragment-och-tid-för-sparbesked).
Vid UI-steg 1: kör `user Spara hela utkastet.` och `delegate`.
Släpp det verkliga hållna uppdragets `save_draft` enligt det befintliga
receptet och meddela **Samma sparande är bekräftat** efter lyckat
genomförande, före användarens sparbeskedsläsning.
Vid steg 2: starta signalen, skicka hela beskedet fram till och med Spar
och avsluta signalen med det befintliga fragmentreceptet. Om servern först
bekräftar att samma sparande kontrolleras ingår även den förklaringen i
fragmentet. Bekräfta varje gräns utan nytt kvitto.
Vid steg 3: skicka at. med signalen av och bekräfta leveransen;
vänta minst fyra sekunder innan signalen startas igen. Bekräfta
starten och behåll signalen minst fyra sekunder. Vid steg 4: avsluta
signalen och meddela **Signalen är avslutad; starta tidtagningen nu**.
Användarens tre/fyrasekundersläsning räknas först från detta avslut.
Använd [den separata samtalsförberedelsen](conversation-preparation.md)
och samma provinstallation under fallet. Operatören styr bara den
kontrollerade leverantören; vanliga UI-steg läser verkliga resultat.
Stäng konsolen före fokusproven. Återställ signaler och hållningar
efter känt utfall, avsluta med `quit` och starta nytt mellan fallen.

**Steg:**

1. Be operatören leverera det kontrollerade talade sparuppdraget och släppa
   samma sparverktyg enligt förberedelsen. Invänta bekräftelse. Läs **Utkastet
   är sparat** under hushållsnamnet i tre sekunder.
2. Be operatören starta signalen, leverera beskedet fram till och med
   fragmentet **Spar** och avsluta signalen enligt förberedelsen. Invänta
   bekräftelse. Kontrollera att det gröna sparbeskedet inte visas.
3. Be operatören leverera fragmentet **at.** medan signalen är av och invänta
   bekräftelse. Vänta minst fyra sekunder. Be sedan operatören starta signalen
   igen och invänta bekräftelse. Håll provet i minst fyra sekunder.
4. Be operatören avsluta signalen. Starta tidtagningen vid operatörens
   bekräftade avslut. Läs röstrutan efter tre sekunder och igen efter drygt fyra
   sekunder.
5. Öppna själv textvyn och läs sparbeskedet. Öppna **Rapporter →
   Ändringshistorik** och kontrollera det enda sparandet med Lo Exempel.

**Förväntat resultat:**

- Ingen tid räknas från kvittot, ett ofullständigt ord eller enbart
  transporttext före det kontrollerade ljudet. **Skyttel talar** består
  medan ljudet är aktivt.
- Efter ljudet visas **Sparat** i fyra sekunder, med en grön bock mellan
  vågformen och ordet. Bocken är dold för hjälpmedel. Sparbeskedet under
  hushållsnamnet syns vid kvittot. Faktisk enda uppläsning provas i
  FRAGA-08. Textvyn öppnas inte av sig själv.
- **Sparat.** finns i samtalstexten. Lo finns en gång i den sparade kartan
  och det bekräftade sparandet finns under **Rapporter → Ändringshistorik**.

### FRAGA-05: stopp startar tiden från avbrottet

**Syfte:** Avbrutet ljud återtar inte det beständiga sparandet.

**Användare:** Alex.

**Förutsättningar:** Som FRAGA-04, med ett verifierat kvitto och ett
pågående kontrollerat sparbesked.

**Integrationstest:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
testfallet “FRAGA-05: stopp under det verifierade sparbeskedet startar de
fyra sekunderna från avbrottet”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-questions.spec.ts",
    "caseId": "FRAGA-05"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven talad eller skriven ingång skyddar nödvändig väntan och verifierat sparbesked.",
  "outcomes": [
    "Ljudet stoppas och **Sparat** visas i fyra sekunder från avbrottet. Röstrutan upprepar inte sparannonsen från kartans tre sekunders sparbesked. Inget öppnas automatiskt.",
    "Lo och det bekräftade kvittot består. Ett genomfört sparande ångras inte."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ
[ljudfragment och tid](conversation-preparation.md#ljudfragment-och-tid-för-sparbesked)
. Förbered det verkliga sparandet enligt FRAGA-04:s första steg och bekräfta
kvittot före sparbeskedsläsningen. Vid UI-steg 1 här: starta signalen och skicka
Spar med det befintliga fragmentreceptet; meddela **Fragmentet är levererat och
signalen pågår**. Behåll signalen tills användaren själv väljer Avbryt i steg 2.
Skicka inte at. och avsluta inte signalen enligt grundfallets steg 2–4 i denna
variant. Återställ signalen efter observationerna och avsluta enligt
startguiden.

**Steg:**

1. Läs **Utkastet är sparat** under hushållsnamnet när kvittot bekräftas. Be
   operatören starta signalen och leverera fragmentet **Spar** enligt
   förberedelsen. Invänta bekräftelse att signalen fortfarande pågår.
2. Välj röstrutans stoppikon **Avbryt** och starta tidtagningen.
3. Läs rutan efter tre sekunder och efter drygt fyra sekunder.

**Förväntat resultat:**

- Ljudet stoppas och **Sparat** visas i fyra sekunder från avbrottet.
  Röstrutan upprepar inte sparannonsen från kartans tre sekunders
  sparbesked. Inget öppnas automatiskt.
- Lo och det bekräftade kvittot består. Ett genomfört sparande ångras inte.

### FRAGA-06: fria ord ersätter inte kvittot

**Syfte:** Förhindra ett falskt grönt sparbesked.

**Användare:** Alex.

**Förutsättningar:** Lo är fortfarande privat och inget sparförsök finns.

**Integrationstest:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
testfallet “FRAGA-06: providertext som säger Sparat utan beständigt
kvitto ger inget grönt sparbesked”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-questions.spec.ts",
    "caseId": "FRAGA-06"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven talad eller skriven ingång skyddar nödvändig väntan och verifierat sparbesked.",
  "outcomes": [
    "Röstrutan återgår till **Lyssnar** och visar ingen grön bock eller verifierad **Sparat**-status. Lo förblir privat och inget kvitto finns."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steg 1: kör `user Berätta om utkastet.` och `delegate`,
och släpp just det verkliga hållna anropet med `reply REQUEST Sparat.`.
Använd inget sparverktyg. Meddela **Påståendet är släppt utan sparande**.
Vid steg 2: använd det befintliga fragmentreceptet, starta signalen,
skicka Sparat. som transporttext och avsluta signalen. Meddela
**Text och avslutad signal är levererade utan sparkvitto**.
Använd [den separata samtalsförberedelsen](conversation-preparation.md)
och samma provinstallation under fallet. Operatören styr bara den
kontrollerade leverantören; vanliga UI-steg läser verkliga resultat.
Stäng konsolen före fokusproven. Återställ signaler och hållningar
efter känt utfall, avsluta med `quit` och starta nytt mellan fallen.

**Steg:**

1. Be operatören leverera det kontrollerade taluppdraget och dess påstående
   enligt förberedelsen. Invänta bekräftelse. Ge inget sparbesked.
2. Be operatören leverera förberedd signal och **Sparat.** som transporttext.
   Invänta bekräftelse av avslutad signal.
3. Kontrollera röstrutan och förslaget genom **Visa utkastet** i textvyn. Öppna
   **Rapporter → Ändringshistorik** och kontrollera att inget sparande
   tillkommer. Fokusera **Tillbaka till arbetet** med tangentbordet och tryck
   **Enter**.

**Förväntat resultat:**

- Röstrutan återgår till **Lyssnar** och visar ingen grön bock eller
  verifierad **Sparat**-status. Lo förblir privat och inget kvitto finns.

## Tillgänglighet och återstående verifiering

<!-- markdownlint-disable MD013 -->
| WCAG 2.2 | Designmål | Automatiserat underlag | Kvarvarande manuellt prov |
| --- | --- | --- | --- |
| 1.1.1, 1.3.1, 1.4.1 | Statusord bär beskedet; vågform och bock är dolda för hjälpmedel. | Namngiven röstruta, statusord och dold bock kontrolleras. | Granska faktisk hjälpmedelspresentation. |
| 1.4.3, 1.4.11 | Läsbara statusord och grön bock i båda teman; färg är inte enda beskedet. | Bocken använder kartans temafärg. | Visuell kontrastgranskning i ljus och mörk miljö. |
| 1.4.10, 2.4.7, 2.4.11 | Statusbyten ändrar inte fokus eller öppnar en vy; reglage förblir nåbara. | Publika vyöppningar och frånvaro av automatisk textvy provas. | Verklig förstoring, smal skärm och synligt fokus. |
| 2.1.1, 2.5.8 | Mikrofon, textvy och stopp fungerar med tangentbord och pekare. | Publika kontroller används i Chromium. | Fysiska pekmål och tangentbord i övriga webbläsare. |
| 4.1.2, 4.1.3 | Väntan läses inte upp igen; Utkastet är sparat meddelas artigt en gång. | Live-regionens text och statusord kontrolleras. | Skärmläsarens kö och faktisk uppläsning under tal. |
<!-- markdownlint-enable MD013 -->

Bedömningen är ett designmål med begränsat verifieringsunderlag, inte
ett påstående om fullständig WCAG-överensstämmelse eller utförda fysiska prov.

Live lämnar inget besked om att en hel replik är färdig. Dess
transkriptfragment beskriver delar av leverantörens ljudtidslinje, inte
webbläsarens uppspelningsslut. Sparbeskedet använder därför det verifierade
korta ordet, matchande transporttext och observerad ljudaktivitet efter
texten. Ett kvitto eller en tyst paus före sista ordet räcker inte.
Detta bevisar inte att leverantören aldrig skickar ytterligare fördröjt
ljud efter en observerad tystnad. Om texten når klienten först efter att
allt ljud har spelats kan slutet inte bekräftas på detta sätt. Ett
verkligt leverantörsprov måste bedöma dessa ordnings- och ljudfall;
stoppikonens avbrott ger däremot ett bestämt slut.

### FRAGA-07: skrivet uppdrag väntar på svar med mikrofonen av

**Syfte:** Bevara samma väntan vid skriven ingång medan rösten är på.

**Användare:** Alex.

**Förutsättningar:** Som FRAGA-03, i en ny installation.

**Integrationstest:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
FRAGA-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-questions.spec.ts",
    "caseId": "FRAGA-07"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven talad eller skriven ingång skyddar nödvändig väntan och verifierat sparbesked.",
  "outcomes": [
    "Väntan består med mikrofonen av. Frågan finns i textvyn som öppnas av användaren; det skrivna svaret avslutar väntan utan mikrofonstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ FRAGA-03 en gång. Ersätt steg 1 med att öppna textvyn, skicka
   **Vilken Lo avses?** och stänga textvyn innan frågan släpps.
2. Följ steg 2–4 i FRAGA-03 utan att upprepa steg 1.

**Förväntat resultat:**

- Väntan består med mikrofonen av. Frågan finns i textvyn som öppnas
  av användaren; det skrivna svaret avslutar väntan utan mikrofonstart.

## Observationer med verkliga hjälpmedel och utrustning

### FRAGA-08: frågans och sparbeskedets verkliga uppläsning

**Syfte:** Bedöma den verkliga observationen separat från Chromium-emulering.

**Användare:** Alex; Robin i medlemskapets förberedelse om den behövs.

**Förutsättningar:** NVDA i Chromium på dator.

**Separat förberedelse:**

Starta den kontrollerade installationen enligt områdets förberedelse på
dator. Använd NVDA i samma Chromium-fönster. Tyst syntetisk media räcker
för denna uppläsningskontroll; inget verkligt leverantörsanrop behövs.
Avsluta med `quit` efter granskningen och anteckna NVDA-versionen.

**Kräver mänsklig observation:** Väntar på ditt svar annonseras inte som ett
nytt statusord. Utkastet är sparat annonseras artigt en gång; röstrutan upprepar
inte sparannonsen.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Väntar på ditt svar annonseras inte som ett nytt statusord. Utkastet är sparat annonseras artigt en gång; röstrutan upprepar inte sparannonsen."
  },
  "reference": "NVDA i Chromium på dator",
  "outcomes": [
    "Väntar på ditt svar annonseras inte som ett nytt statusord. Utkastet är sparat annonseras artigt en gång; röstrutan upprepar inte sparannonsen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ de synliga arbetsstegen i FRAGA-03/07 och FRAGA-04/05, ett fall i taget,
   från rätt utgångsläge. Använd verklig utrustning för den angivna
   observationen; syntetiska terminalpaket ersätter inte faktiskt tal.
2. Anteckna det faktiskt hörda eller utförda resultatet, plattform,
   webbläsare och hjälpmedel. För fysiskt ljud, använd samma påhittade
   meddelanden; följ den angivna ljud- eller inmatningsobservationen.

**Förväntat resultat:**

- Väntar på ditt svar annonseras inte som ett nytt statusord. Utkastet är sparat
  annonseras artigt en gång; röstrutan upprepar inte sparannonsen.

### FRAGA-09: verklig fråga och sparbesked med ljud

**Syfte:** Bedöma den verkliga observationen separat från Chromium-emulering.

**Användare:** Alex; Robin i medlemskapets förberedelse om den behövs.

**Förutsättningar:** Fysisk mikrofon och hörlurar i isolerad HTTPS-installation.

**Separat förberedelse:**

Följ [den fysiska förberedelsen](../development/testing.md#physical-device-manual-preparation)
med isolerad, nåbar HTTPS-installation, verklig inloggning och påhittade
uppgifter. Loopback-adressen från launchern når inte en fysisk telefon.
Verkliga leverantörsanrop kräver separat godkännande innan körning.
Skapa Lo Exempel som Person med Påhittad uppgift när fallet behöver utkast;
använd tom beskrivning för FRAGA. Återställ utkast och samtal mellan fallen,
och ta bort provhushållet när granskningen är klar.

**Kräver mänsklig observation:** Frågan hörs, kan besvaras med tal eller text,
och väntan består med mikrofon av. Hela Sparat och dess ljud måste avslutas
innan fyra sekunder börjar; stopp ger ett bestämt slut. Fördröjt ljud och
transporttext bedöms separat.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-microphone-audio",
    "observation": "Frågan hörs, kan besvaras med tal eller text, och väntan består med mikrofon av. Hela Sparat och dess ljud måste avslutas innan fyra sekunder börjar; stopp ger ett bestämt slut. Fördröjt ljud och transporttext bedöms separat."
  },
  "reference": "Fysisk mikrofon och hörlurar i isolerad HTTPS-installation",
  "outcomes": [
    "Frågan hörs, kan besvaras med tal eller text, och väntan består med mikrofon av. Hela Sparat och dess ljud måste avslutas innan fyra sekunder börjar; stopp ger ett bestämt slut. Fördröjt ljud och transporttext bedöms separat."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ de synliga arbetsstegen i FRAGA-03/07 och FRAGA-04/05, ett fall i taget,
   från rätt utgångsläge. Använd verklig utrustning för den angivna
   observationen; syntetiska terminalpaket ersätter inte faktiskt tal.
2. Anteckna det faktiskt hörda eller utförda resultatet, plattform,
   webbläsare och hjälpmedel. För fysiskt ljud, använd samma påhittade
   meddelanden; följ den angivna ljud- eller inmatningsobservationen.

**Förväntat resultat:**

- Frågan hörs, kan besvaras med tal eller text, och väntan består med mikrofon
  av. Hela Sparat och dess ljud måste avslutas innan fyra sekunder börjar; stopp
  ger ett bestämt slut. Fördröjt ljud och transporttext bedöms separat.
