# Manuella testfall för röst och text i samma samtal

Fallen provar samma utkast i röst och text, fortsatt arbete efter ljudavbrott,
ordnade svar och uppläsning av samtalstexten. Anteckna commit, webbläsare och
godkänt eller underkänt resultat vid körning. Kontrollerade ljudspår är tysta.
Faktiskt hört tal och skärmläsarens uppläsning redovisas separat.

## Konfigurerade användare

Alex Exempel är administratör i det påhittade hushållet Röst och text. Alex
loggar in med Google i den kontrollerade installationen.

## Allmän förberedelse

1. Starta en ny installation enligt
   [den kontrollerade röstguiden](voice-assistant.md#controlled-voice-fixture).
   Skapa hushållet Röst och text. Kör inte `seed-family`.
2. Välj **Skriv till Skyttel**, **Nytt samtal** och **Godkänn och starta**.
   Låt utkastet vara
   tomt. Använd ett datorfönster som är bredare än 700 px.
3. Skrivna uppdrag hålls i terminalen som `held`. Läs `pending` och ersätt
   `REQUEST` med anrops-ID. Släpp ett vanligt svar med `reply REQUEST TEXT`.
   `sessions` visar kommentarerna som Skyttel faktiskt skickat till den
   kontrollerade röstleverantören. Ett skrivet uppdrag har ingen talad
   delegering; dess kommentar saknar delegerings-ID.
4. För kontrollerad transporttext och ljudaktivitet, använd
   [webbläsarkonsolens förberedelse](conversation-questions.md#allmän-förberedelse)
   . Skicka den text som anges i fallet. Signalen är fortfarande tyst och
   bevisar inte att en verklig röst hörs eller uttalar hela svaret rätt.
5. Börja med en ny installation inför varje fall. För lyssning och skärmläsare,
   följ
   [förberedelsen i TAL-17](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
   med verklig leverantör, fysisk mikrofon och enhet. Anteckna faktiskt hört
   ljud och uppläsning separat från den kontrollerade körningen och det
   automatiska [WAV-provet](real-voice-tests.md).

## Gemensamma svar

### RÖSTTEXT-01: följ samma cykel i röst och text efter ljudavbrott

**Syfte:** Följ Alex blå cykel i samma samtal och granska utkastet efter att
ljudet bryts.

**Användare:** Alex.

**Förutsättningar:** Textvyn är öppen och mikrofonen av.

**Integrationstest:**
[conversation-voice-text.spec.ts](../../tests/integration/conversation-voice-text.spec.ts)
, RÖSTTEXT-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-voice-text.spec.ts",
    "caseId": "RÖSTTEXT-01"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Ett skrivet svar går till rösten och kan läsas när textvyn öppnas igen.",
    "Röstens cykelförslag syns i utkastet och den muntliga följdfrågan besvaras utifrån det skrivna valet.",
    "Den talade låsfärgen hör till rätt cykel och frågan om märket väntar.",
    "Efter ljudavbrottet kan Alex fortsätta i text och granska ett enda osparat förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för RÖSTTEXT-01](voice-controls-preparation.md#tidslinje-rösttext-01)
vid respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska
resurser separat. Utför arbetsflödet en gång.

För separat lyssning, använd den riktiga utrustningen i den allmänna
förberedelsen. Följ steg 5–8 i ett nytt samtal med tomt utkast. Lyssna efter
cykelns namn när förslaget görs med stängd textvy. Med mikrofonen av ska
frågorna komma i text. När du slår på den igen, ställ följdfrågan och jämför
namnet du hör med textsvaret. Svara om låset och lyssna efter ändringen på
rätt cykel. Anteckna vad som faktiskt hörs. Använd den kontrollerade
installationen för att bryta ljudet vid den angivna ändringen.

**Steg:**

1. Slå på **Prata med Skyttel**. Skicka **Berätta om ordningen.** och låt
   svaret vänta. Läs röstruta och arbetsrad.
2. Stäng textvyn. Låt förberedelsens **Vi tar ett förslag i taget.** och
   inkommande aktivitet tillkomma. Ingen textvy öppnas av sig själv.
3. Öppna textvyn och läs hela svaret. Mikrofonen är fortsatt på.
4. Välj **Nytt samtal** med mikrofonen på och läs beskedet om tomt utkast.
   Teknisk kommentaröverlämning granskas separat; faktiskt ljud hör till
   RÖSTTEXT-05.
5. Stäng textvyn. Säg **Föreslå Alex blå cykel av typen Fordon.** Öppna
   textvyn och välj **Visa utkastet**. Läs cykelns namn i förslaget.
6. Slå av mikrofonen. Skriv **Till utflykten väljer jag Alex blå cykel. Fråga
   om låsets färg och cykelns märke.** Läs båda frågorna.
7. Slå på mikrofonen, stäng textvyn och fråga **Vilken cykel väljer jag till
   utflykten?** Lyssna på svaret vid verkligt talprov. Öppna textvyn igen.
8. Säg **Den har ett grönt lås.** Bryt ljudet enligt förberedelsen så snart
   samtalstexten visar den genomförda ändringen. Skriv **Vad ändrades i
   förslaget och vilken fråga återstår?** med mikrofonen av.
9. Öppna cykelns förslag i utkastet och läs låsfärgen. Stäng dialogen och
   kontrollera sparknappen. Skriv **Strunta i märket.** och kontrollera den
   igen. Öppna **Rapporter** och läs ändringshistoriken.
10. Välj **Tillbaka till arbetet**, öppna utkastet och välj **Spara hela
    utkastet**. Läs sparbekräftelsen och ändringshistoriken.

**Förväntat resultat:**

- Röstrutan visar **Arbetar** även för det skrivna uppdraget.
  Arbetsraden syns i samtalstexten. Arbetsbeskedet erbjuds som DOM-status en
  gång.
- Svaret skickas till rösten och finns i samtalstexten när textvyn öppnas
  senare. Transportens ljudaktivitet ger **Skyttel talar**. Ingen textvy öppnas
  av sig själv och mikrofonen förblir på.
- Talade rader har ingen extra synlig märkning. Att öppna textvyn läser inte upp
  gamla svar. Faktiskt hört tal kräver en verklig ljudkontroll.
- Nytt samtals besked överlämnas till rösten när mikrofonen är på och dubbleras
  inte av samtalstextens uppläsning.
- Det talade förslaget finns i utkastet. Den muntliga följdfrågan besvaras med
  **Till utflykten väljer du Alex blå cykel.** Samma svar går att läsa.
- Efter **Rösten avbröts** går det att skriva vidare. Svaret anger grönt lås
  på Alex blå cykel och bara frågan **Vilket märke har cykeln?** återstår.
- Utkastet visar en cykel med **Grönt (Text)** som låsfärg. Sparknappen är
  spärrad medan märket väntar. När Alex avstår från märket går det att spara.
  Ändringshistoriken är tom tills Alex väljer att spara. Därefter visas
  sparbekräftelsen och cykeln finns i ändringshistoriken.

### RÖSTTEXT-02: mikrofonen av ger bara text och gamla svar spelas inte upp

**Syfte:** Låta mikrofonens aktuella läge styra det skrivna svarets röst.

**Användare:** Alex.

**Förutsättningar:** Textvyn är öppen och ingen fråga eller sparstatus väntar.

**Integrationstest:**
[conversation-voice-text.spec.ts](../../tests/integration/conversation-voice-text.spec.ts)
, RÖSTTEXT-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-voice-text.spec.ts",
    "caseId": "RÖSTTEXT-02"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Låta mikrofonens aktuella läge styra det skrivna svarets röst."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för RÖSTTEXT-02](voice-controls-preparation.md#tidslinje-rösttext-02)
vid respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska
resurser separat. Utför arbetsflödet en gång.

**Steg:**

1. Slå på och sedan av **Prata med Skyttel**. Skicka **Svara bara i text.** och
   läs det förberedda **Det här är textsvaret.**.
2. Efter att svaret kommit, slå på mikrofonen igen. Den tidigare texten finns
   kvar utan ny överlämning till rösten.
3. Skicka **Stäng av innan svaret är klart.**. Slå av mikrofonen medan det
   väntar. Läs **Även detta svar finns bara i text.** utan röstruta.
4. Skriv **Nytt samtal** med mikrofonen av och läs textbeskedet.

**Förväntat resultat:**

- Med mikrofonen av kommer båda svaren bara i samtalstexten. Ingen röstruta syns
  medan ett sådant skrivet uppdrag arbetar eller besvaras. Svaren skickas inte
  till rösten och erbjuds av den artiga statusregionen.
- Att slå på mikrofonen spelar inte upp det gamla textsvaret. Det finns kvar i
  samtalstexten. Att stänga av före det andra svaret ger samma textbeteende.
  Mikrofonen går inte att slå på igen under arbetet.
- Skrivet Nytt samtal med mikrofonen av ger ett textbesked som läses artigt,
  utan en röstkommentar eller en röstruta.

### RÖSTTEXT-03: ordnade svar och en enda statusförekomst

**Syfte:** Behålla ordning, fullständiga svar och en enda uppläsning.

**Användare:** Alex.

**Förutsättningar:** Dator, textvyn öppen och mikrofonen på.

**Integrationstest:**
[conversation-voice-text.spec.ts](../../tests/integration/conversation-voice-text.spec.ts)
, RÖSTTEXT-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-voice-text.spec.ts",
    "caseId": "RÖSTTEXT-03"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Behålla ordning, fullständiga svar och en enda uppläsning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för RÖSTTEXT-03](voice-controls-preparation.md#tidslinje-rösttext-03)
vid respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska
resurser separat. Utför arbetsflödet en gång.

**Steg:**

1. Skicka **Första frågan.** och **Andra frågan.** utan att släppa svaren. Läs
   köbeskedet.
2. Låt båda svaren bli klara innan ljudet börjar. Spela upp det upprepade
   första svaret. Låt det spela färdigt och läs båda svaren i ordning.
3. Låt **Ett talat tillägg.** och inkommande aktivitet tillkomma. Läs den
   vanliga Skyttel-raden.
4. Stäng av mikrofonen och skicka **Min egen text ska inte läsas.**. Fokusera
   meddelandefältet före det förberedda **Bara Skyttels nya text läses.**.
   Fokus stannar där.
5. Stäng och öppna textvyn. Tidigare dialog finns kvar utan en ny DOM-status.
   Faktiskt hörda rader bedöms i RÖSTTEXT-06.

**Förväntat resultat:**

- Ett meddelande väntar bakom det första. Båda fullständiga svaren överlämnas
  en gång och i ordning. Det andra svaret väntar tills den första
  uppläsningen är klar. Å, ä och ö bevaras över svarens paketgränser.
  Båda svaren finns i samtalstexten.
- Det talade tillägget finns som vanlig Skyttel-rad. Statusen för hjälpmedel
  erbjuder aldrig användarens egna rader eller svar som Skyttel säger med
  rösten.
- Med mikrofonen av statusen för hjälpmedel erbjuder bara Skyttels nya text och
  väntar på sin tur. Öppnad textvy upprepar inte historiska svar. Ingen kontroll
  får fokus av att ett svar kommer.

### RÖSTTEXT-04: bara en aktuell sparbegäran ger kvitto för cykeln

**Syfte:** Följ ett granskat cykelförslag från röst till text. Kontrollera
hur kartan skiljer förslaget från ett bekräftat sparande i historiken.

**Användare:** Alex.

**Förutsättningar:** Tomt utkast, inget sparkvitto och mikrofonen på.

**Integrationstest:**
[conversation-voice-text.spec.ts](../../tests/integration/conversation-voice-text.spec.ts)
, RÖSTTEXT-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-voice-text.spec.ts",
    "caseId": "RÖSTTEXT-04"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "En läsfråga ger inget kvitto även om modellen säger Sparat.",
    "Efter Avbryt och ett förtydligande finns cykeln kvar i utkastet och ingen sparbekräftelse visas.",
    "En ny sparbegäran ger en bekräftelse och cykeln visas som sparad i kartan utan omladdning.",
    "Sparkvittot visar tidpunkt, sparandets och användarens identitet samt ett tillagt objekt av typen Fordon."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-whole-draft-save.test.ts",
      "title": "an old whole-draft approval with a plain reply cannot save newer proposals and a rejected attempt needs fresh authority",
      "purpose": "En rättelse under kontrollen av hela utkastet får inte sparas på den tidigare begäran."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för RÖSTTEXT-04](voice-controls-preparation.md#tidslinje-rösttext-04)
vid respektive UI-steg. Operatören sköter dess svar/fel och läser tekniska
resurser separat. Utför arbetsflödet en gång.

Det automatiska testet jämför också sparandets och användarens identitet
och tidpunkten i historiken med det bekräftade utfallet från servern.

**Steg:**

1. Skicka **Berätta om utkastet.** och läs det förberedda obekräftade
   **Sparat.**. Ingen sparhandling görs.
2. Låt samma transportfragment och inkommande aktivitet tillkomma och upphöra.
   Läs **Lyssnar** utan grön sparkvittostatus.
3. Öppna **Visa utkastet** och läs **Utkastet är tomt.**. Öppna
   **Rapporter → Ändringshistorik** och läs **Inga genomförda sparanden.**.
   Välj **Tillbaka till arbetet**.
4. Säg **Föreslå Alex blå cykel av typen Fordon.** Öppna utkastet och välj
   **Visa förslaget: Alex blå cykel**. Läs typen **Fordon**, stäng dialogen
   och stäng av mikrofonen. Skicka **Vilket fordon finns i mitt utkast?**
   Läs cykelns namn i svaret. Förslaget finns kvar.
5. Skicka **Spara hela utkastet.** Tryck på **Escape** i meddelandefältet
   medan Skyttel arbetar.
   Skicka **Jag menade den blå cykeln.** Läs svaret och kontrollera att
   cykeln finns kvar i utkastet utan sparbekräftelse. Kartan visar fortfarande
   cykeln med förslagets plustecken. Öppna **Rapporter → Ändringshistorik**
   och läs **Inga genomförda sparanden.**.
6. Välj **Tillbaka till arbetet**, granska cykeln igen och skicka
   **Spara hela utkastet.** Läs sparbekräftelsen och kontrollera utkastet,
   cykeln i kartan och ändringshistoriken utan att ladda om sidan. Läs
   tidpunkten och vem som sparade. Välj **Identifiera sparandet och
   användaren** och läs identifierarna och tidpunkten. Välj **Visa
   ändringarna** och läs uppgifterna före och efter sparandet.

**Förväntat resultat:**

- Påståendet står i samtalstexten och överlämnas som obekräftad samtalstext till
  rösten. Det är inget verifierat resultat.
- Ingen grön bock eller **Sparat** -status visas. Röstrutan återgår till
  **Lyssnar** efter läsfrågan.
- Det sena svaret efter **Avbryt** och förtydligandet lämnar cykeln osparad.
- Först den nya sparbegäran ger **Utkastet är sparat**. Utkastet är tomt,
  kartan visar cykeln som sparad och historiken innehåller en ändringsgrupp.
  Sparkvittot visar tidpunkten, **Alex Exempel**, sparandets och användarens
  identitet samt **1 objekt**. Det står **Fanns inte i kartan** före
  sparandet. Efter sparandet visas namnet **Alex blå cykel** och typen
  **Fordon**.

## Tillgänglighetsbedömning

Designmålet är WCAG 2.2 AA. Namngivna knappar, mikrofonens växlingsläge och
tangentbordskontroller provas mot riktig server (2.1.1, 4.1.2). Samtalstexten
anger vem som sa vad för hjälpmedel utan synliga namn eller talmarkeringar
(1.3.1). En separat artig live-region för nya textlevererade Skyttel-rader
håller användarrader, talade svar och historik tysta (4.1.3). Arbetsbeskedet
dubbleras inte mellan röstrutan och textvyn. Svar flyttar inte fokus och öppnar
ingen vy (2.4.3).

Automationen kontrollerar text, tillstånd, faktisk kommentaröverlämning och
live-regionernas attribut. Den bevisar inte hörbart tal eller faktisk
uppläsning. Prova NVDA med Chrome på Windows och VoiceOver med Chrome på macOS,
iPhone och iPad: bara nya tysta Skyttel-svar ska läsas när det blir deras tur,
utan att skärmläsarens röst tolkas som nytt tal. Synligt fokus, förstoring och
kontrast bedöms på verkliga enheter. Fullständig WCAG-överensstämmelse och dessa
fysiska prov är inte fastställda här.

### RÖSTTEXT-05: faktiskt textlevererat röstljud och inget gammalt ljud

**Syfte:** Hör att skrivna uppdrag får röst endast vid påslagen mikrofon och att
gamla svar inte spelas upp vid återaktivering.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Hör att skrivna uppdrag får röst endast vid
påslagen mikrofon och att gamla svar inte spelas upp vid återaktivering.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-microphone-audio",
    "observation": "Hör att skrivna uppdrag får röst endast vid påslagen mikrofon och att gamla svar inte spelas upp vid återaktivering."
  },
  "reference": "Verklig röstleverantör, fysisk mikrofon/ljudutgång och isolerade påhittade data.",
  "outcomes": [
    "Faktiskt ljud följer det valda mikrofonläget; gamla textlevererade svar spelas inte upp senare.",
    "Text och röst behåller samma samtal och svarsinnehåll."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Med mikrofonen på, skicka ett skrivet uppdrag, stäng textvyn och lyssna.
   Öppna senare och jämför hela textsvaret.
2. Slå av mikrofonen, skicka ett nytt uppdrag och läs dess textsvar. Slå på
   mikrofonen igen: det gamla svaret ska inte höras.
3. Stäng av medan nästa svar arbetar. Lyssna och läs att svaret ges bara i text.
   Prova Nytt samtal i båda lägena.

**Förväntat resultat:**

- Faktiskt ljud följer det valda mikrofonläget; gamla textlevererade svar spelas
  inte upp senare.
- Text och röst behåller samma samtal och svarsinnehåll.

### RÖSTTEXT-06: faktiskt hörda rader och turordning

**Syfte:** Hör bara nya textlevererade Skyttel-rader, inte användarrader, redan
talade svar eller gammal samtalstext.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Hör bara nya textlevererade Skyttel-rader, inte
användarrader, redan talade svar eller gammal samtalstext.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Hör bara nya textlevererade Skyttel-rader, inte användarrader, redan talade svar eller gammal samtalstext."
  },
  "reference": "NVDA/Chrome Windows och VoiceOver/Chrome macOS, iPhone och iPad.",
  "outcomes": [
    "Bara nya tysta Skyttel-svar hörs i hjälpmedlets tur.",
    "Röst och skärmläsare dubblerar inte svar eller historiska rader."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skicka två skrivna frågor i samma samtal med mikrofonen på och lyssna på
   Skyttel och skärmläsaren.
2. Stäng av mikrofonen och skriv en egen rad. Hör bara det nya Skyttel-svaret
   och dess turordning.
3. Stäng och öppna textvyn, byt mellan röst/text och bedöm att gammal dialog
   inte läses igen och att skärmläsarens tal inte tolkas som nytt användartal.

**Förväntat resultat:**

- Bara nya tysta Skyttel-svar hörs i hjälpmedlets tur.
- Röst och skärmläsare dubblerar inte svar eller historiska rader.

### RÖSTTEXT-07: ett skrivet förtydligande hörs efter Avbryt

**Syfte:** Fortsätt i text efter att ha tystat en hörbar replik. Kontrollera
att den öppna röstanslutningen spelar upp det nya svaret från början.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Dator, textvyn öppen och mikrofonen på.

**Automatiskt motsvarande test:**
[conversation-voice-text.spec.ts](../../tests/integration/conversation-voice-text.spec.ts),
RÖSTTEXT-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-voice-text.spec.ts",
    "caseId": "RÖSTTEXT-07"
  },
  "reference": "Chromium med styrt modellsvar och syntetiska toner på den verkliga ljudvägen.",
  "outcomes": [
    "Avbryt tystar uppläsningen. Ett sent ljud från den gamla repliken hörs inte innan förtydligandet.",
    "Ett skrivet förtydligande ger ett nytt svar som hörs från början. Mikrofonen är på och samtalstexten visar förtydligandet och svaret."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat förberedelse:** Följ
[tidslinjen för RÖSTTEXT-07](voice-controls-preparation.md#tidslinje-rösttext-07)
för de styrda ljuden och modellens svar.

**Steg:**

1. Låt Skyttel tala enligt tidslinjen. Välj **Avbryt** i röstrutan medan det
   hörs. Läs **Lyssnar**.
2. Låt den gamla replikens sena ljud komma enligt tidslinjen. Lyssna och
   kontrollera att mikrofonen fortfarande är på.
3. Skicka **Jag menar cykeln.** utan att tala. Lyssna från början av svaret
   och läs förtydligandet och svaret i samtalstexten.

**Förväntat resultat:**

- Pågående ljud tystnar och det sena ljudet förblir tyst före förtydligandet.
- Svaret på förtydligandet hörs från början i samma röstanslutning. Mikrofonen
  är på. Samtalstexten visar **Jag menar cykeln.** och **Jag förstår att du
  menar cykeln.**
