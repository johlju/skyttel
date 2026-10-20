# Manuella testfall för samtalsnotiser

Fallen provar korta besked om bruten kontakt, otillgängliga samtal och uppdrag
som Skyttel inte kan slutföra. De omfattar knappar, textinmatning, mikrofon,
placering, uppläsning och fokus. Kartans återkoppling om det privata utkastet
och sparandet ska finnas kvar. Anteckna commit, webbläsare och godkänt eller
underkänt resultat vid körning.

## Konfigurerade användare

Alex Exempel är administratör i provhushållet. Alex loggar in med Google i den
kontrollerade miljön. Samma samtalsknappar och notiser gäller för vanliga
medlemmar; inga administrativa rättigheter används av samtalet.

## Allmän förberedelse

1. Starta en ny installation enligt
   [den kontrollerade röstguiden](voice-assistant.md#controlled-voice-fixture).
   Använd bara påhittade uppgifter. Skapa ett hushåll och lägg **Lo Exempel** i
   ditt utkast genom **Tabell → Nytt objekt → Lägg i utkastet och stäng**.
   Spara inte.
2. Terminalkommandona nedan hör till startguiden. `available off` gör samtalet
   otillgängligt, och `available on` återställer tillgängligheten. Vänta upp
   till fem sekunder på beskedet. Skicka ett skrivet uppdrag och kör
   `fail REQUEST` med det aktuella `held` -anropets ID för uppdragsfel.
   `reply REQUEST Hej.` ger ett nytt kontrollerat svar.
3. Använd webbläsarens nätverksläge **Offline** för kontaktavbrott, och
   återställ till normalt nätverk efter varje fall. Börja en ny provmiljö inför
   NOT-01, NOT-02 och NOT-06. Behåll samma flik under respektive fall.
4. Miljön använder riktig server och tillfällig SQLite men ersätter externa
   leverantörer, mikrofon och ljudtransport. Den verifierar inte verklig
   mikrofonbehörighet, tal eller fysisk nätverksåterhämtning.

## Knappar och inmatning

### NOT-01: avstängda knappar visar notisen utan att öppna textvyn

**Syfte:** Förklara hindret först efter användarens tryck, utan att starta
samtalet eller flytta fokus när notisen visas.

**Användare:** Alex.

**Förutsättningar:** Ny flik utan samtal; operatören har förberett
otillgänglighet enligt
[notisernas tidslinjer](voice-controls-preparation.md#notisernas-tidslinjer).

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-01"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Förklara hindret först efter användarens tryck, utan att starta samtalet eller flytta fokus när notisen visas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Läs kartan utan att trycka på samtalsknapparna.
2. Fokusera **Prata med Skyttel** och tryck Retur. Läs notisen.
3. Välj **Stäng notisen**. Fokusera **Skriv till Skyttel** och tryck Retur.
   Kontrollera textvyn, notisen och knappen **Nytt samtal**.
4. Stäng notisen och sedan textvyn. Läs teckenförklaringen och övriga verktyg.

**Förväntat resultat:**

- Ingen notis visas före första trycket. Båda knapparna ser avstängda ut men går
  att trycka på. Hjälpmedel märker dem inte som inaktiverade; beskrivningen
  slutar med **Inte tillgängligt just nu.**
- Texten är
**Samtal med Skyttel är inte tillgängligt
  just nu. Kontakta administratören om det fortsätter.**
  Symbolen är en överstruken cirkel och dold för hjälpmedel. Mikrofonknappen
  öppnar varken textvyn eller medgivanderutan och startar inget samtal.
- **Skriv till Skyttel** öppnar textvyn även utan tillgängligt samtal. Fokus
  börjar i meddelandefältet på dator. **Nytt samtal** är inaktiverad; inget
  samtal startas och ingen medgivanderuta visas.
- Fokus stannar på mikrofonknappen när den visar notisen. Stängning återför
  fokus till **Prata med Skyttel** och läser inte upp ett återkomstbesked. När
  textvyn stängs återgår fokus till textknappen. Teckenförklaringens gröna plus
  finns kvar. Kartan visar inget privat förslagsantal.

### NOT-02: kontaktavbrott stoppar inmatning men behåller skrivande

**Syfte:** Stoppa mikrofon och sändning på riktigt medan texten går att skriva
och läsa. Återkomst får inte slå på mikrofonen.

**Användare:** Alex.

**Förutsättningar:** Ny flik, normalt nätverk och tillgängligt samtal.

**Separat förberedelse:** Operatören följer NOT-02 i
[notisernas tidslinjer](voice-controls-preparation.md#notisernas-tidslinjer)
vid de angivna stegen. Utför UI-flödet en gång.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-02"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Stoppa mikrofon och sändning på riktigt medan texten går att skriva och läsa. Återkomst får inte slå på mikrofonen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Prata med Skyttel**, godkänn för besöket och invänta **Lyssnar**.
2. Låt operatören bryta HTTP-kontakten enligt tidslinjen och läs notisen.
3. Välj **Skriv till Skyttel**. Skriv **Text som inte ska skickas än.** Tryck
   Retur och kontrollera **Skicka**.
4. När kontakten återkommer, skicka texten och läs det förberedda svaret
   **Hej.** Slå därefter själv på mikrofonen.

**Förväntat resultat:**

- Mikrofonen stängs av vid avbrottet. Knappen ser avstängd ut men är tillgänglig
  för hjälpmedel; beskrivningen slutar med **Inte tillgängligt just nu.** Ett
  tryck visar hindret utan att börja lyssna. Notisen säger
**Ingen kontakt med Skyttel. Mikrofonen är av.
  Slå på den igen när kontakten är tillbaka.**
  Den har ingen stängknapp.
- Textknappen fungerar. Samtalstexten går att läsa och meddelandefältet går att
  skriva i. Retur sänder inte texten; **Skicka** är inaktiverad.
- Notisen försvinner när kontakten återkommer. Hjälpmedel läser i tur
  **Kontakten med Skyttel är tillbaka.** Texten finns kvar att skicka, och
  mikrofonen är fortfarande av tills användaren slår på den.
- Automationen räknar sändningsanrop och modellanrop och kontrollerar
  mikrofonspårets avstängda läge. Ett manuellt prov med den kontrollerade
  mikrofonen ersätter inte ett prov med fysisk mikrofon och nätverk.

### NOT-03: flytt till textvyn bevarar båda fokusvägarna

**Syfte:** Behålla samma notis och statusförekomst utan att starta mikrofonen
vid återkomst.

**Användare:** Alex.

**Förutsättningar:** Följ
[HTTP-avbrottets förberedelse](voice-controls-preparation.md#http-avbrott-och-fokus-not-03).
Ny installation,
Lo Exempel i utkastet med beskrivningen
Påhittad uppgift, mikrofon på och stängd textvy.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-03"
  },
  "reference": "Chromium 1280 × 720; två kontaktavbrott i samma samtal, först mikrofonknapp, sedan meddelandefält.",
  "outcomes": [
    "Både mikrofonknappens och meddelandefältets fokus bevaras när kontaktfelet uppstår.",
    "Notisen har en plats åt gången och täcker inte meddelandefältet; mikrofonen är av genom båda återkomsterna.",
    "Automationen bevarar samma kortnod och statusnod vid varje flytt och kontrollerar att inget extra Mikrofonen är av tillkommer. Faktiskt hört besked bedöms i NOT-24."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Fokusera Prata med Skyttel. Låt operatören bryta HTTP enligt förberedelsen.
   Läs kontakttexten och
   kontrollera att fokus ligger kvar.
2. Öppna textvyn, läs hela notisen ovanför meddelandefältet och stäng textvyn.
   Samma besked ska nu finnas vid röstrutans plats.
3. När operatören återställer kontakten försvinner notisen; mikrofonen är av.
4. Slå själv på mikrofonen. Öppna textvyn och fokusera Meddelande till Skyttel
   innan nästa förberedda kontaktavbrott.
   Kontrollera kvarvarande fältfokus och samma
   kontakttext.
5. Stäng och öppna textvyn medan HTTP är av. Kontrollera en enda synlig
   notis och samma text. Låt operatören återställa kontakten igen.
6. Kontrollera att notisen försvinner och mikrofonen fortfarande är av. Avsluta
   provmiljön.

**Förväntat resultat:**

- Både mikrofonknappens och meddelandefältets fokus bevaras när kontaktfelet
  uppstår.
- Notisen har en plats åt gången och täcker inte meddelandefältet; mikrofonen är
  av genom båda återkomsterna.
- Automationen bevarar samma kortnod och statusnod vid varje flytt och
  kontrollerar att inget extra Mikrofonen är av tillkommer. Faktiskt hört besked
  bedöms i NOT-24.

## Ordning, stängning och fokus

### NOT-04: bruten kontakt går före andra besked

**Syfte:** Visa en notis åt gången och låta kontaktavbrottet gå före
otillgängligt samtal och uppdragsfel.

**Användare:** Alex.

**Förutsättningar:** Textvy och normalt nätverk. Behåll samma samtal.

**Separat förberedelse:** Operatören följer NOT-04 i
[notisernas tidslinjer](voice-controls-preparation.md#notisernas-tidslinjer)
vid de angivna stegen. Utför UI-flödet en gång.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-04"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Visa en notis åt gången och låta kontaktavbrottet gå före otillgängligt samtal och uppdragsfel."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skicka **Ge ett förslag.** och läs det förberedda uppdragsfelet.
2. När otillgängligheten förberetts, skriv **Oskickad text finns kvar.** utan
   att skicka.
3. Läs kontaktavbrottet och sedan återkomsten enligt operatörens tidslinje.

**Förväntat resultat:**

- Först visas **Skyttel kunde inte slutföra uppdraget. Försök igen.**
  Otillgängligt samtal ersätter sedan detta besked och inaktiverar Skicka.
- Kontaktavbrottet ersätter otillgängligheten. Bara en notis visas.
- Efter återkomst syns otillgängligheten igen, tills operatören återställer
  samtalet. Uppdragsfelet syns då igen och texten finns kvar. Återkomsten till
  tillgängligt samtal läses upp i tur.

### NOT-05: uppdragsfel försvinner vid stängning eller nytt försök

**Syfte:** Ge ett stängbart besked och bevara logiskt fokus.

**Användare:** Alex.

**Förutsättningar:** Textvy, normalt nätverk och tillgängligt samtal.

**Separat förberedelse:** Operatören följer NOT-05 i
[notisernas tidslinjer](voice-controls-preparation.md#notisernas-tidslinjer)
vid de angivna stegen. Utför UI-flödet en gång.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-05"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Ge ett stängbart besked och bevara logiskt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skicka ett uppdrag och låt det misslyckas enligt tidslinjen. Kontrollera
   fältets fokus.
2. Välj **Stäng notisen** med tangentbord.
3. Skicka ett nytt uppdrag och låt även detta misslyckas enligt tidslinjen.
4. Skicka **Ett nytt försök.** Läs först medan svaret väntar och sedan det
   förberedda svaret **Ett nytt svar.**.

**Förväntat resultat:**

- Notisen visar en varningstriangel och texten
  **Skyttel kunde inte slutföra uppdraget. Försök igen.** Texten läses i tur.
  Fältet behåller fokus när notisen visas.
- Stängning återför fokus till **Prata med Skyttel**. Det andra felet ger ett
  nytt stängbart besked.
- Det tredje försöket tar bort notisen redan medan svaret väntar. Det nya svaret
  står sedan i samtalstexten. Utkastet finns kvar.

### NOT-06: ett avslutat hinder kräver ett nytt tryck vid nästa avbrott

**Syfte:** Skilja automatisk återkomst från stängning utan pågående samtal.

**Användare:** Alex.

**Förutsättningar:** Ny flik utan samtal, normalt nätverk och tillgänglighet.

**Separat förberedelse:** Operatören följer NOT-06 i
[notisernas tidslinjer](voice-controls-preparation.md#notisernas-tidslinjer)
vid de angivna stegen. Utför UI-flödet en gång.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-06"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Skilja automatisk återkomst från stängning utan pågående samtal."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Efter förberett kontaktavbrott, välj **Prata med Skyttel**.
2. Fokusera **Stäng notisen** utan att trycka och låt kontakten återkomma.
3. Efter nästa förberedda avbrott, tryck **Prata med Skyttel** och stäng notisen.
4. Låt kontakten återkomma igen enligt tidslinjen.

**Förväntat resultat:**

- Varje avbrott väntar på ett nytt tryck innan en notis visas. Textvyn öppnas
  inte. Texten är
  **Ingen kontakt med Skyttel. Försök igen när kontakten är tillbaka.** och
  notisen har en stängknapp.
- Automatisk återkomst tar bort notisen, återför fokus från stängknappen till
  **Prata med Skyttel** och läser i tur upp återkomstbeskedet.
- Manuell stängning ger inget återkomstbesked, inte heller när det redan stängda
  hindret senare upphör.

## Plats och tangentordning

### NOT-07: en kontakt-notis täcker inte kartans återkoppling

**Syfte:** Bevara verktygsfältets Återställ vy och kartans status.

**Användare:** Alex.

**Förutsättningar:** Påslagen mikrofon och stängd textvy. Använd 1280 × 900 före
första UI-handlingen. Övriga mått har egna fall. **Återställ vy** finns i
verktygsfältet även i korta fönster.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-07"
  },
  "reference": "Chromium 1280 × 900; mediernas anslutning bryts oberoende av HTTP.",
  "outcomes": [
    "Bevara verktygsfältets Återställ vy och kartans status."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ
   [medieanslutningens separata förberedelse](voice-controls-preparation.md#notisens-plats-under-bruten-mediekontakt)
   . Operatören bryter medieanslutningen före nästa observation; HTTP och
   fliken behålls. Kontakten återställs först efter steg 3.
2. Läs notisen, kartans status och verktygsfältets **Återställ vy**.
   Kontrollera att kameraverktyget **Navigera** går att nå utan att täckas.
3. I korta fönster: gå med Tab till **Kartans sammanhang**. Kontrollera den
   synliga fokusringen och använd PageDown för att läsa teckenförklaringen. Nå
   **Återställ vy** i verktygsfältet med tangentbordet även i det minsta
   fönstret.

**Förväntat resultat:**

- Med röstrutan borta finns kortet på rutans plats. På smal skärm står det över
  hela bredden, ovanför återkopplingen och kartans nederkant.
- Notisen täcker varken **Återställ vy** eller kartans status. Inget måste
  rullas i sidled för att läsa notisen.
- Vid återkomst är mikrofonen av. Automationen bryter även ljudtransporten
  oberoende av HTTP och kontrollerar kortets geometri vid de sex måtten.
- Kartans sammanhang är en namngiven rullningsyta för tangentbord. Hela statusen
  och teckenförklaringen går att läsa utan att täckas av kartan eller notisen.
  Vid 320 × 250 har sammanhanget och visningsvalen var sin rullningsyta ovanför
  notisen.

### NOT-08: röstruta och uppdragsnotis har var sin plats

**Syfte:** Behålla placering och tangentordning när båda syns.

**Användare:** Alex.

**Förutsättningar:** Mikrofonen på, normalt nätverk och textvyn öppen. Använd
1280 × 900 före första UI-handlingen; andra mått har egna fall.

**Separat förberedelse:** Operatören följer NOT-08 i
[notisernas tidslinjer](voice-controls-preparation.md#notisernas-tidslinjer)
vid de angivna stegen. Utför UI-flödet en gång; NOT-21/22 väljer sin egen
konfiguration före samma steg.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-08"
  },
  "reference": "Chromium 1280 × 900; samtidig röstruta och uppdragsnotis.",
  "outcomes": [
    "Behålla placering och tangentordning när båda syns."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skicka **Ge ett förslag.** och låt det misslyckas enligt tidslinjen.
2. Stäng textvyn. Läs notisen, röstrutan och kartans status.
3. Fokusera **Skriv till Skyttel** och tryck Tab. Tryck Retur på
   **Stäng notisen**.

**Förväntat resultat:**

- På bred skärm står notisen i ett eget kort under röstrutan. På smal skärm står
  kortet ovanför röstrutan, över hela bredden. Symbolen står till vänster,
  texten bredvid och stängknappen uppe till höger.
- Ingen överlappning döljer röstrutan eller återkopplingen. Tab går från
  textknappen till notisens stängknapp när ingen Avbryt-knapp finns.
- Stängning återför fokus till mikrofonknappen. Mikrofonen och **Lyssnar** finns
  kvar; att stänga ett felbesked avslutar inget samtal.

## Symboler och läsbarhet

### NOT-09: symbolfärg och läsbarhet skiljer hinder från händelse

**Syfte:** Skilja hinder från händelser med både form, färg och text.

**Användare:** Alex.

**Förutsättningar:** Den kontrollerade röstinstallationen, normalt nätverk och
ljust tema. Textvyn har öppnats med medgivande och stängts igen.

**Separat förberedelse:** Operatören följer NOT-09 i
[notisernas tidslinjer](voice-controls-preparation.md#notisernas-tidslinjer)
vid de angivna stegen. NOT-23 använder samma flöde en gång i mörkt tema.

**Integrationstest:**
[conversation-audit.spec.ts](../../tests/integration/conversation-audit.spec.ts)
, NOT-09.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-audit.spec.ts",
    "caseId": "NOT-09"
  },
  "reference": "Chromium, ljust tema; avstängt samtal respektive nekad mikrofon.",
  "outcomes": [
    "Skilja hinder från händelser med både form, färg och text."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Efter förberedd otillgänglighet, vänta på knappbeskrivningen
   **Inte tillgängligt just nu.** Tryck på mikrofonknappen och läs notisen.
2. När tillgängligheten återställts, vänta på att notisen försvinner.
3. Efter förberett mikrofonavslag, tryck på mikrofonknappen och läs notisen.
4. Behåll det valda temat. Läs symbolen, texten och kontrollerna; teknisk
   kontrastmätning hör till tidslinjens separata underlag.

**Förväntat resultat:**

- Hindret har en överstruken cirkel; mikrofonhändelsen har en överstruken
  mikrofon. Symbolerna står i tonade cirklar till vänster om texten. Hinder är
  röda och händelser gulbruna.
- Symbol och text förblir tydligt urskiljbara i det valda temat. Numerisk
  kontrast mäts separat enligt förberedelsen och automationen; den bedömer
  inte färgseende eller fysisk bildskärm.
- Symbolen är dold för hjälpmedel; text och namngivna kontroller bär beskedet.
  Båda fallen är stängbara när inget samtal pågår.

### NOT-10: ett väntande sparförsök visar frågesymbol och kontrollknapp

**Syfte:** Visa ett kontrollfel utan att ge en ny befogenhet att spara.

**Användare:** Alex.

**Förutsättningar:** Följ
[NOT-10:s egna förberedelse](voice-controls-preparation.md#väntande-kontroll-not-10)
med Lo Exempel, Person och tom beskrivning. Välj 390 × 844 före första
handlingen. Kör inte hela SPAR-02; detta fall provar ett eget registrerat men
inte genomfört försök.

**Integrationstest:**
[conversation-audit.spec.ts](../../tests/integration/conversation-audit.spec.ts)
, NOT-10.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-audit.spec.ts",
    "caseId": "NOT-10"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Visa ett kontrollfel utan att ge en ny befogenhet att spara."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ladda om och vänta på
   **Skyttel kunde inte kontrollera om utkastet sparades.** Läs symbolen, texten
   och kontrollknappen.
2. Kontrollera mikrofon av. Öppna **Visa utkastet → Visa förslaget: Lo Exempel**
   och läs **Person**, namn och kontrollera att ingen egenskap Beskrivning
   finns. Stäng förslaget utan ändring.
3. När operatören tar bort nätverksblockeringen, välj **Kontrollera om
   utkastet sparades**. Läs
   **Utkastet är tomt.**. I **Tabell**, öppna **Lo Exempel** och läs
   **Person** och kontrollera att ingen egenskap Beskrivning finns.
   Detta avslutar fallet; upprepa inte hela
   SPAR-02 efter kontrollen.

**Förväntat resultat:**

- Ett frågetecken i cirkel står till vänster.
  **Kontrollera om utkastet sparades** står läsbart under texten och går att
  nå och trycka på. Ingen stängknapp finns, och kortet kräver ingen rullning
  i sidled. Exakta mått granskas separat i förberedelsen.
- Mikrofonen är av. Förslaget är identiskt med det som registrerades; felet har
  varken sparat det eller kastat det.
- Kontrollen använder samma försöks-ID. Automationen använder en riktig
  registrering och avbryter bara kontrollsvaret till webbläsaren.

### NOT-11: varje situation har sin avtalade symbol och typfärg

**Syfte:** Granska alla former utan att bara jämföra interna SVG-sökvägar.

**Användare:** Alex.

**Förutsättningar:** Kör de länkade fallen i den kontrollerade miljön. Prova
både ljust och mörkt tema. Detta fall är enbart manuellt; ingen mänsklig
formbedömning redovisas som utförd.

**Kräver mänsklig observation:** Känn igen alla angivna symboler, typfärger och
skillnader utan färg.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "visual-symbol-recognition",
    "observation": "Känn igen de överstrukna symbolerna, mätaren, frågetecknet och varningstriangeln utan att bara jämföra SVG-data."
  },
  "reference": "Ljust och mörkt tema; alla tabellens kontrollerat utlösta situationer.",
  "outcomes": [
    "Människan känner igen symbolens form och kan skilja händelse från hinder."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utlös varje rad genom det angivna fallet. Läs först texten, jämför sedan den
   synliga symbolen med tabellen och anteckna resultat per rad.
2. Kontrollera att alla hinder har samma symbolfärg som hindret i NOT-09, och
   alla händelser samma färg som mikrofonhändelsen. Se också att formerna går
   att skilja åt utan färg.

**Förväntat resultat:**

<!-- markdownlint-disable MD013 -->
| Situation och körbart fall | Synlig symbol | Typfärg |
| --- | --- | --- |
| Kontroll pågår, SPARKONTROLL-01 | Frågetecken i cirkel | Hinder |
| Kontrollfel, NOT-10 | Frågetecken i cirkel | Hinder |
| Bruten kontakt, pågående samtal, NOT-02 | Överstruken kontaktsymbol | Hinder |
| Bruten kontakt, inget samtal, NOT-06 | Överstruken kontaktsymbol | Hinder |
| Samtal otillgängligt, NOT-01 | Överstruken cirkel | Hinder |
| Full kontext efter misslyckad sammanfattning, KONTEXT-10 | Mätare | Hinder |
| Nekad mikrofon, ROSTFEL-01 deny | Överstruken mikrofon | Händelse |
| Ingen mikrofon, ROSTFEL-05 error | Överstruken mikrofon | Händelse |
| Upptagen mikrofon, ROSTFEL-06 busy | Överstruken mikrofon | Händelse |
| Röststödet saknas, ROSTFEL-07 unsupported | Överstruken mikrofon | Händelse |
| Tillfälligt röstfel, ROSTFEL-02 startup | Varningstriangel | Händelse |
| Avbruten röst, ROSTFEL-03 | Överstruken mikrofon | Händelse |
| Administrationsfel, ROSTFEL-08 administration | Varningstriangel | Händelse |
| Återkallat medgivande, MEDGIVANDE-13 | Varningstriangel | Händelse |
| Misslyckat uppdrag, NOT-05 | Varningstriangel | Händelse |
| Stoppat ljud, ROSTFEL-04 | Överstruken högtalare | Hinder |
<!-- markdownlint-enable MD013 -->

Läs [kontrollfallen](save-check.md), [kontextfallen](conversation-context.md),
[röstfelen](voice-errors.md) och [medgivandefallen](conversation-consent.md) för
respektive förberedelse och utlösning. NOT-11 kompletterar deras
beteendekontroller med en uttrycklig granskning av form och typfärg.

## WCAG 2.2 AA: utformning och verifiering

Utformningen syftar till WCAG 2.2 AA. Automationen provar det ändrade flödet
genom gränssnittet mot riktig server och tillfällig SQLite. Ingen manuell
skärmläsar-, kontrast- eller fysisk enhetskontroll intygas. Fullständig
överensstämmelse för hela sidor och flöden är inte verifierad.

<!-- markdownlint-disable MD013 -->
| Kriterium | Utformning och automatisk kontroll | Återstår manuellt |
| --- | --- | --- |
| 1.1.1, 1.3.1 Icke-textuellt innehåll och struktur | Symbolen är dold; text, namngiven notis och knappar bär beskedet. Automationen kontrollerar text och dold symbol. | Läsordning med NVDA och VoiceOver. |
| 1.4.1 Färg | Hinder och händelser har olika symbolfärg. De tre grundfallen har också skilda symbolformer och texter; en händelse har stängknapp. | Igenkänning utan färgseende. |
| 1.4.3, 1.4.11 Kontrast | NOT-09 mäter text minst 4,5:1 och symbol minst 3:1 på hinder- och händelsekort i båda teman. | Fysisk bildskärm, avstängda knappar, kanter och fokus i båda teman. |
| 1.4.4, 1.4.10 Förstoring och omflöde | Automatisk geometri vid fyra kontaktmått och tre samtidiga mått; inget dolt fält eller dold återkoppling. | Verklig zoom 200 och 400 procent samt långa texter i korta fönster. |
| 2.1.1, 2.4.3 Tangentbord och fokusordning | Tab och Retur stänger notisen. Visning flyttar inte fokus; borttagning återför det till mikrofonknappen. Automationen provar detta. | Hjälpmedlens kommandon och flytt av en fokuserad notis mellan vyer. |
| 2.4.7, 2.4.11 Synligt fokus | Fokusramen är kartans vanliga ram; kortet överlappar inte återkoppling eller kartans rad. | Synlig ram och fullständiga tangentbordsflöden på fysisk telefon. |
| 2.5.8 Pekmål | Stängknappen har 44 × 44 px. | Träffsäkerhet på fysisk pekskärm. |
| 3.3.1, 3.3.3 Felbeskrivning och förslag | Varje grundfel har begriplig text och nästa steg. Fältet behåller oskickad text, och sändning stoppas vid hinder. Automationen kontrollerar detta. | Att texterna förstås med hjälpmedel. |
| 4.1.2, 4.1.3 Namn, roll, värde och status | Avbrytande eller väntande uppläsning följer notisens situation. Flytt läser inte upp igen. Automatisk återkomst läses i tur; stängning ger inget återkomstbesked. | Faktisk uppläsning och tur i minst två skärmläsare. |
<!-- markdownlint-enable MD013 -->

## Separata placeringar och teman

### NOT-16: kontakt-notis vid 700 × 900

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Välj 700 × 900 i
observationsstarten. Behåll samma anslutning och native kontroller.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-16.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-16"
  },
  "reference": "Chromium 700 × 900; medieavbrott och separat pausad observationsklocka.",
  "outcomes": [
    "Notis, Kartans status, teckenförklaring, Återställ vy och Navigera går att nå utan överlappning.",
    "Återanslutning tar bort notisen men lämnar mikrofonen av."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [NOT-07](#not-07-en-kontakt-notis-täcker-inte-kartans-återkoppling) en
   gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Notis, Kartans status, teckenförklaring, Återställ vy och Navigera går att nå
  utan överlappning.
- Återanslutning tar bort notisen men lämnar mikrofonen av.

### NOT-17: kontakt-notis vid 390 × 844

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Välj 390 × 844 i
observationsstarten. Behåll samma anslutning och native kontroller.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-17.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-17"
  },
  "reference": "Chromium 390 × 844; medieavbrott och separat pausad observationsklocka.",
  "outcomes": [
    "Notis, Kartans status, teckenförklaring, Återställ vy och Navigera går att nå utan överlappning.",
    "Återanslutning tar bort notisen men lämnar mikrofonen av."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [NOT-07](#not-07-en-kontakt-notis-täcker-inte-kartans-återkoppling) en
   gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Notis, Kartans status, teckenförklaring, Återställ vy och Navigera går att nå
  utan överlappning.
- Återanslutning tar bort notisen men lämnar mikrofonen av.

### NOT-18: kontakt-notis vid 667 × 375

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Välj 667 × 375 i
observationsstarten. I steg 3: tabba till Kartans sammanhang, använd PageDown
och End, kontrollera synlig fokusram och nå Återställ vy.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-18.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-18"
  },
  "reference": "Chromium 667 × 375; medieavbrott och separat pausad observationsklocka.",
  "outcomes": [
    "Notis, Kartans status, teckenförklaring, Återställ vy och Navigera går att nå utan överlappning.",
    "Återanslutning tar bort notisen men lämnar mikrofonen av."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [NOT-07](#not-07-en-kontakt-notis-täcker-inte-kartans-återkoppling) en
   gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Notis, Kartans status, teckenförklaring, Återställ vy och Navigera går att nå
  utan överlappning.
- Återanslutning tar bort notisen men lämnar mikrofonen av.

### NOT-19: kontakt-notis vid 320 × 640

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Välj 320 × 640 i
observationsstarten. Behåll samma anslutning och native kontroller.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-19.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-19"
  },
  "reference": "Chromium 320 × 640; medieavbrott och separat pausad observationsklocka.",
  "outcomes": [
    "Notis, Kartans status, teckenförklaring, Återställ vy och Navigera går att nå utan överlappning.",
    "Återanslutning tar bort notisen men lämnar mikrofonen av."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [NOT-07](#not-07-en-kontakt-notis-täcker-inte-kartans-återkoppling) en
   gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Notis, Kartans status, teckenförklaring, Återställ vy och Navigera går att nå
  utan överlappning.
- Återanslutning tar bort notisen men lämnar mikrofonen av.

### NOT-20: kontakt-notis vid 320 × 250

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Välj 320 × 250 i
observationsstarten. I steg 3: tabba till Kartans sammanhang, använd PageDown
och End, kontrollera synlig fokusram och nå Återställ vy.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-20.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-20"
  },
  "reference": "Chromium 320 × 250; medieavbrott och separat pausad observationsklocka.",
  "outcomes": [
    "Notis, Kartans status, teckenförklaring, Återställ vy och Navigera går att nå utan överlappning.",
    "Återanslutning tar bort notisen men lämnar mikrofonen av."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [NOT-07](#not-07-en-kontakt-notis-täcker-inte-kartans-återkoppling) en
   gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Notis, Kartans status, teckenförklaring, Återställ vy och Navigera går att nå
  utan överlappning.
- Återanslutning tar bort notisen men lämnar mikrofonen av.

### NOT-21: röstruta och uppdragsnotis vid 820 × 1180

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Välj 820 × 1180.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-21.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-21"
  },
  "reference": "Chromium 820 × 1180; påslagen mikrofon och kontrollerat uppdragsfel.",
  "outcomes": [
    "Röstruta, notis och kartåterkoppling täcker inte varandra.",
    "Tab når Stäng notisen; stängning återför fokus utan att avsluta samtalet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [NOT-08](#not-08-röstruta-och-uppdragsnotis-har-var-sin-plats) en gång,
   med ovanstående konfiguration. Följ dess steg i ordning och samma separata
   förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Röstruta, notis och kartåterkoppling täcker inte varandra.
- Tab når Stäng notisen; stängning återför fokus utan att avsluta samtalet.

### NOT-22: röstruta och uppdragsnotis vid 390 × 844

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Välj 390 × 844.

**Integrationstest:**
[conversation-notices.spec.ts](../../tests/integration/conversation-notices.spec.ts)
, NOT-22.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-notices.spec.ts",
    "caseId": "NOT-22"
  },
  "reference": "Chromium 390 × 844; påslagen mikrofon och kontrollerat uppdragsfel.",
  "outcomes": [
    "Röstruta, notis och kartåterkoppling täcker inte varandra.",
    "Tab når Stäng notisen; stängning återför fokus utan att avsluta samtalet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [NOT-08](#not-08-röstruta-och-uppdragsnotis-har-var-sin-plats) en gång,
   med ovanstående konfiguration. Följ dess steg i ordning och samma separata
   förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Röstruta, notis och kartåterkoppling täcker inte varandra.
- Tab når Stäng notisen; stängning återför fokus utan att avsluta samtalet.

### NOT-23: symbolkontrast i mörkt tema

**Syfte:** Behålla hela arbetsflödet i den angivna konfigurationen.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation och välj denna
konfiguration före den första UI-handlingen. Välj mörkt tema före första
UI-handlingen.

**Integrationstest:**
[conversation-audit.spec.ts](../../tests/integration/conversation-audit.spec.ts)
, NOT-23.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-audit.spec.ts",
    "caseId": "NOT-23"
  },
  "reference": "Chromium, mörkt tema och minskad rörelse.",
  "outcomes": [
    "Hinder och händelser har samma texter och kontroller, med läsbar symbol- och textkontrast i mörkt tema."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför [NOT-09](#not-09-symbolfärg-och-läsbarhet-skiljer-hinder-från-händelse)
   en gång, med ovanstående konfiguration. Följ dess steg i ordning och samma
   separata förberedelse. Upprepa inte basfallet först.
2. Kontrollera variantens fokus, läsbarhet och kvarvarande innehåll vid
   motsvarande steg. Avsluta när basfallet avslutas.

**Förväntat resultat:**

- Hinder och händelser har samma texter och kontroller, med läsbar symbol- och
  textkontrast i mörkt tema.

### NOT-24: faktiskt hörda notiser och återkomst

**Syfte:** Hör exakt en avbrytande kontakt-notis, ingen extra mikrofonstatus och
ett köat återkomstbesked.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Hör exakt en avbrytande kontakt-notis, ingen
extra mikrofonstatus och ett köat återkomstbesked.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Hör exakt en avbrytande kontakt-notis, ingen extra mikrofonstatus och ett köat återkomstbesked."
  },
  "reference": "NVDA/Chrome Windows och VoiceOver/Chrome macOS; motsvarande faktiskt provade HTTPS-enhet.",
  "outcomes": [
    "Kontakttexten hörs en gång per avbrott och återkomstbeskedet väntar på sin tur.",
    "Flytt ger ingen extra uppläsning eller mikrofonstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta samtalet med mikrofonen på. Fokusera mikrofonknappen, bryt nätverket
   och lyssna.
2. Öppna och stäng textvyn med hjälpmedlet och återställ nätverket. Mikrofonen
   ska förbli av.
3. Slå själv på mikrofonen, fokusera meddelandefältet och upprepa avbrott, flytt
   och återkomst en gång.

**Förväntat resultat:**

- Kontakttexten hörs en gång per avbrott och återkomstbeskedet väntar på sin
  tur.
- Flytt ger ingen extra uppläsning eller mikrofonstart.

### NOT-12: notisens text och kontroller på dator

**Syfte:** Läsa en mikrofonhändelse och ett ljudhinder i både kort och inline
plats.

**Användare:** Alex.

**Förutsättningar:** Ny installation, Lo i utkastet och 1280 × 800 före starten.
Starta samtalet med text och stäng textvyn.

**Automatiskt motsvarande webbläsartest:**
[conversation-notice-content.test.tsx](../../tests/browser/conversation-notice-content.test.tsx),
NOT-12. Chromium använder produktionsstilar och kontrollerade HTTP- och
mediesvar. Testet visar placering och återställning, inte beständigt sparande.
NOT-01–08 och NOT-10 behåller verklig server och SQLite för sina respektive
samtals- och kontrollflöden.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/conversation-notice-content.test.tsx",
    "caseId": "NOT-12"
  },
  "reference": "Chromium 1280 × 800; datorpekare, produktionsstilar och kontrollerade HTTP-/mediesvar. Placering, fokus och Starta ljudet skyddas här; verklig HTTP/SQLite behålls separat i NOT-01–08/10.",
  "outcomes": [
    "Hela texten och kontrollerna är läsbara inom kortet i båda placeringarna.",
    "Kort och kontroller täcker inte varandra, och ingen extra utkaståterkoppling läggs i textvyn.",
    "Starta ljudet går att fokusera i båda placeringarna; Retur återställer ljudet och Lyssnar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered nekad mikrofon enligt röstguidens mediekontroller. Välj Prata med
   Skyttel. Läs hela händelsen och nå dess stängknapp.
2. Öppna textvyn. Läs samma besked och kontrollera att text och kontroller får
   plats utan rullning i sidled.
3. Förbered tillåten mikrofon men spärrad uppspelning. Välj Prata med Skyttel
   och läs hindret med Starta ljudet.
4. Läs hela hindret i textvyn och fokusera **Starta ljudet**. Stäng textvyn
   och läs kortet igen. Kontrollera samtalstextens kvarvarande läsyta i det
   korta fönstret. När uppspelning tillåts igen, fokusera **Starta ljudet**
   och tryck Retur.

**Förväntat resultat:**

- Hela texten och kontrollerna är läsbara inom kortet i båda placeringarna.
- Kort och kontroller täcker inte varandra, och ingen extra utkaståterkoppling
  läggs i textvyn.
- **Starta ljudet** går att fokusera i båda placeringarna. Retur återställer
  ljudet, tar bort hindret och visar **Lyssnar**.

### NOT-13: notisens text och kontroller på telefon

**Syfte:** Läsa en mikrofonhändelse och ett ljudhinder i både kort och inline
plats.

**Användare:** Alex.

**Förutsättningar:** Ny installation, Lo i utkastet och 390 × 780 före starten.
Starta samtalet med text och stäng textvyn.

**Automatiskt motsvarande webbläsartest:**
[conversation-notice-content.test.tsx](../../tests/browser/conversation-notice-content.test.tsx),
NOT-13. Chromium använder produktionsstilar och kontrollerade HTTP- och
mediesvar. Testet visar placering och återställning, inte beständigt sparande.
NOT-01–08 och NOT-10 behåller verklig server och SQLite för sina respektive
samtals- och kontrollflöden.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/conversation-notice-content.test.tsx",
    "caseId": "NOT-13"
  },
  "reference": "Chromium 390 × 780; emulerad mobil och pekning, produktionsstilar och kontrollerade HTTP-/mediesvar. Placering, fokus och Starta ljudet skyddas här; verklig HTTP/SQLite behålls separat i NOT-01–08/10.",
  "outcomes": [
    "Hela texten och kontrollerna är läsbara inom kortet i båda placeringarna.",
    "Kort och kontroller täcker inte varandra, och ingen extra utkaståterkoppling läggs i textvyn.",
    "Starta ljudet går att fokusera i båda placeringarna; Retur återställer ljudet och Lyssnar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered nekad mikrofon enligt röstguidens mediekontroller. Välj Prata med
   Skyttel. Läs hela händelsen och nå dess stängknapp.
2. Öppna textvyn. Läs samma besked och kontrollera att text och kontroller får
   plats utan rullning i sidled.
3. Förbered tillåten mikrofon men spärrad uppspelning. Välj Prata med Skyttel
   och läs hindret med Starta ljudet.
4. Läs hela hindret i textvyn och fokusera **Starta ljudet**. Stäng textvyn
   och läs kortet igen. Kontrollera samtalstextens kvarvarande läsyta i det
   korta fönstret. När uppspelning tillåts igen, fokusera **Starta ljudet**
   och tryck Retur.

**Förväntat resultat:**

- Hela texten och kontrollerna är läsbara inom kortet i båda placeringarna.
- Kort och kontroller täcker inte varandra, och ingen extra utkaståterkoppling
  läggs i textvyn.
- **Starta ljudet** går att fokusera i båda placeringarna. Retur återställer
  ljudet, tar bort hindret och visar **Lyssnar**.

### NOT-14: notisens text och kontroller på bred pekskärm

**Syfte:** Läsa en mikrofonhändelse och ett ljudhinder i både kort och inline
plats.

**Användare:** Alex.

**Förutsättningar:** Ny installation, Lo i utkastet och 1024 × 1366 före
starten. Starta samtalet med text och stäng textvyn.

**Automatiskt motsvarande webbläsartest:**
[conversation-notice-content.test.tsx](../../tests/browser/conversation-notice-content.test.tsx),
NOT-14. Chromium använder produktionsstilar och kontrollerade HTTP- och
mediesvar. Testet visar placering och återställning, inte beständigt sparande.
NOT-01–08 och NOT-10 behåller verklig server och SQLite för sina respektive
samtals- och kontrollflöden.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/conversation-notice-content.test.tsx",
    "caseId": "NOT-14"
  },
  "reference": "Chromium 1024 × 1366; emulerad mobil och pekning, produktionsstilar och kontrollerade HTTP-/mediesvar. Placering, fokus och Starta ljudet skyddas här; verklig HTTP/SQLite behålls separat i NOT-01–08/10.",
  "outcomes": [
    "Hela texten och kontrollerna är läsbara inom kortet i båda placeringarna.",
    "Kort och kontroller täcker inte varandra, och ingen extra utkaståterkoppling läggs i textvyn.",
    "Starta ljudet går att fokusera i båda placeringarna; Retur återställer ljudet och Lyssnar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered nekad mikrofon enligt röstguidens mediekontroller. Välj Prata med
   Skyttel. Läs hela händelsen och nå dess stängknapp.
2. Öppna textvyn. Läs samma besked och kontrollera att text och kontroller får
   plats utan rullning i sidled.
3. Förbered tillåten mikrofon men spärrad uppspelning. Välj Prata med Skyttel
   och läs hindret med Starta ljudet.
4. Läs hela hindret i textvyn och fokusera **Starta ljudet**. Stäng textvyn
   och läs kortet igen. Kontrollera samtalstextens kvarvarande läsyta i det
   korta fönstret. När uppspelning tillåts igen, fokusera **Starta ljudet**
   och tryck Retur.

**Förväntat resultat:**

- Hela texten och kontrollerna är läsbara inom kortet i båda placeringarna.
- Kort och kontroller täcker inte varandra, och ingen extra utkaståterkoppling
  läggs i textvyn.
- **Starta ljudet** går att fokusera i båda placeringarna. Retur återställer
  ljudet, tar bort hindret och visar **Lyssnar**.

### NOT-15: notisens text och kontroller på kort fönster

**Syfte:** Läsa en mikrofonhändelse och ett ljudhinder i både kort och inline
plats.

**Användare:** Alex.

**Förutsättningar:** Ny installation, Lo i utkastet och 844 × 390 före starten.
Starta samtalet med text och stäng textvyn.

**Automatiskt motsvarande webbläsartest:**
[conversation-notice-content.test.tsx](../../tests/browser/conversation-notice-content.test.tsx),
NOT-15. Chromium använder produktionsstilar och kontrollerade HTTP- och
mediesvar. Testet visar placering och återställning, inte beständigt sparande.
NOT-01–08 och NOT-10 behåller verklig server och SQLite för sina respektive
samtals- och kontrollflöden.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/conversation-notice-content.test.tsx",
    "caseId": "NOT-15"
  },
  "reference": "Chromium 844 × 390; emulerad mobil och pekning, produktionsstilar och kontrollerade HTTP-/mediesvar. Placering, fokus och Starta ljudet skyddas här; verklig HTTP/SQLite behålls separat i NOT-01–08/10.",
  "outcomes": [
    "Hela texten och kontrollerna är läsbara inom kortet i båda placeringarna.",
    "Kort och kontroller täcker inte varandra, och ingen extra utkaståterkoppling läggs i textvyn.",
    "Starta ljudet går att fokusera i båda placeringarna; Retur återställer ljudet och Lyssnar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered nekad mikrofon enligt röstguidens mediekontroller. Välj Prata med
   Skyttel. Läs hela händelsen och nå dess stängknapp.
2. Öppna textvyn. Läs samma besked och kontrollera att text och kontroller får
   plats utan rullning i sidled.
3. Förbered tillåten mikrofon men spärrad uppspelning. Välj Prata med Skyttel
   och läs hindret med Starta ljudet.
4. Läs hela hindret i textvyn och fokusera **Starta ljudet**. Stäng textvyn
   och läs kortet igen. Kontrollera samtalstextens kvarvarande läsyta i det
   korta fönstret. När uppspelning tillåts igen, fokusera **Starta ljudet**
   och tryck Retur.

**Förväntat resultat:**

- Hela texten och kontrollerna är läsbara inom kortet i båda placeringarna.
- Kort och kontroller täcker inte varandra, och ingen extra utkaståterkoppling
  läggs i textvyn.
- **Starta ljudet** går att fokusera i båda placeringarna. Retur återställer
  ljudet, tar bort hindret och visar **Lyssnar**.

## Flyttade motsvarigheter

NOT-12–15 behåller sina identiteter i Chromium-sviten
[conversation-notice-content.test.tsx](../../tests/browser/conversation-notice-content.test.tsx).
Alla fyra storlekar, dator- eller mobil-/pekläge, Lo i utkastet, mikrofonavslag
och spärrad uppspelning samt båda notisplaceringarna behålls. Återställning
med fokus och Retur tillkommer. HTTP-svaren är kontrollerade; fallen provar
inte längre verklig installation, medgivandelagring eller SQLite. NOT-01–08,
NOT-16–22 och NOT-10 behåller sina egna serverflöden, placeringar och
kontrollförberedelser. Fysisk mikrofon, ljud, mobilens tangentbord och
hjälpmedlens uppläsning kräver fortfarande sina separata fall.
