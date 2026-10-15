# Manuella testfall för samtalets kö och avbrott

Fallen provar ordnade uppdrag på dator och gemensamma avbrott för text
och röst på dator, mobil och smal skärm. Anteckna commit, webbläsare och
godkänt eller underkänt resultat vid körning. Kontrollerade ljudspår är
tysta; faktiskt hört tal och skärmläsarens uppläsning redovisas separat.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Köprov och
  loggar in med Google i den kontrollerade installationen.

Körbara paket, versionsvärden, felgränser och städning finns i
[den separata förberedelsen](conversation-preparation.md). Följ den vid
angivet arbetssteg, tillsammans med UI-proceduren en gång.

## Läsning av bevarade och sparade uppgifter

När ett steg kräver kvarvarande eller rättat Lo-förslag: öppna
**Utkast → Visa förslaget: Lo Exempel** (eller det rättade namnet).
Läs Person, det aktuella namnet och **Påhittad uppgift** som beskrivning.
Stäng dialogen före nästa samtalssteg. När ett steg kräver sparad Lo:
öppna **Tabell**, fäll ut objektets rad och läs samma fullständiga värden.
Ett kvitto läses genom **Rapporter → Ändringshistorik → Visa ändringarna**.
Läs objektets namn, typ och beskrivning och välj **Tillbaka till arbetet**.
Gör läsningen vid respektive bevarat/rättat/sparat steg, utan att lägga
nya förslag i utkastet eller utföra ett extra sparande.

## Allmän förberedelse

1. Starta [den kontrollerade röstinstallationen](voice-assistant.md#controlled-voice-fixture).
   Skapa Köprov efter inloggningen. Kör inte `seed-family`.
2. Skapa Lo Exempel, typ Person, beskrivning Påhittad uppgift, via
   **Tabell → Nytt objekt** och välj **Lägg i utkastet och stäng**.
   Lämna förslaget osparat.
   Välj **Skriv till Skyttel → Nytt samtal → Godkänn och starta**.
3. Varje uppdrag hålls i terminalen som `held`. Släpp svaret med
   `reply REQUEST TEXT`, där REQUEST är anrops-ID och TEXT är provsvaret.
   Kör `pending` för att se vilka modelluppdrag som har börjat.
   Väntande meddelanden i serverns kö har ännu inget modelluppdrag.
4. För talade uppdrag används `user TEXT` och `delegate` enligt
   [röstguiden](voice-assistant.md#transcript-fragments-and-delegation).
   För faktiskt ljud används den separata verkliga enhetskontrollen i
   [röstrutans fall](voice-assistant.md).
5. Börja med en ny installation för varje fall. Avsluta med `quit`.

## Ordnade uppdrag och gemensamt stopp

### KÖ-01: datorn besvarar serverns kö i ordning och Escape avbryter bara i textvyn

**Syfte:** Skicka fler uppdrag utan att avbryta det första och sedan
avbryta allt med rätt fokus.

**Användare:** Alex.

**Förutsättningar:** Datorfönster bredare än 700 px och textvyn öppen.

**Integrationstest:**
[conversation-queue.spec.ts](../../tests/integration/conversation-queue.spec.ts),
testfallet “KÖ-01: datorn besvarar serverns kö i ordning och Escape
avbryter bara i textvyn”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-queue.spec.ts",
    "caseId": "KÖ-01"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven bredd och pekare skyddar FIFO, rätt avbrottsgräns och oskickad text.",
  "outcomes": [
    "Skicka behåller sitt namn. Endast första modelluppdraget har börjat i steg 1. Arbetsraden visar **2 meddelanden väntar. Tryck på Escape för att avbryta.**. Svaren visas i samma ordning; antalet minskar.",
    "Escape gör inget utan arbete eller med fokus utanför textvyn. Med fokus i textvyn avbryts aktuellt arbete och hela kön.",
    "**Avbrutet. Föreslagna ändringar ligger kvar i utkastet.** står ovanför fältet även när textvyn öppnas igen, men visas inte utanför textvyn. Texten och Lo-förslaget ligger kvar. Sena svar visas inte.",
    "Nästa uppdrag tar bort avbrottstexten. Nytt samtal tömmer också kön; de borttagna uppdragen börjar aldrig. Det nya uppdraget kan besvaras."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/text-assistant-deadlines.test.ts",
      "title": "queue time and identical retries consume the original deadline instead of renewing it",
      "purpose": "Separat HTTP- och databasbevis för köns fasta uppgiftsfrist; verifierar inte manuellt förlopp eller faktisk leverans."
    },
    {
      "kind": "technical",
      "runner": "playwright",
      "suite": "integration",
      "spec": "tests/integration/text-task-deadlines.spec.ts",
      "title": "an accepted text tool waiting at MCP cannot write at its original deadline",
      "purpose": "Syntetiskt installationsbevis för sent verktygsresultat vid den ursprungliga fristen."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

Den separata tekniska evidensen styr serverklockan och fördröjer modell
eller verktyg. Den är inte ett utfört manuellt prov och bekräftar inte
att ett färdigt svar når webbläsaren vid frånkoppling.

1. Skicka **Första uppdraget.**, **Andra uppdraget.** och **Tredje
   uppdraget.** utan att släppa något svar. Läs arbetsraden.
2. Släpp svaren ett i taget med **Första svaret.**, **Andra svaret.**
   och **Tredje svaret.**. Läs arbetsraden mellan svaren.
3. Tryck Escape i fältet när inget arbete pågår. Skicka **Hållet
   uppdrag.** och **Väntande uppdrag.**. Flytta fokus till kartverktygens
   **Skriv till Skyttel** utan att aktivera knappen och tryck Escape.
4. Skriv **Text som inte skickas** i fältet och tryck Escape där.
   Släpp det gamla svaret med **För sent.**. Stäng och öppna textvyn.
5. Skicka **Ny uppgift.** och **Bort med kön.**. Välj **Nytt samtal**.
   Släpp det gamla svaret. Skicka **Efter nytt samtal.** och släpp dess
   svar med **Efter nytt.**.

**Förväntat resultat:**

- Skicka behåller sitt namn. Endast första modelluppdraget har börjat
  i steg 1. Arbetsraden visar **2 meddelanden väntar. Tryck på Escape
  för att avbryta.**. Svaren visas i samma ordning; antalet minskar.
- Escape gör inget utan arbete eller med fokus utanför textvyn.
  Med fokus i textvyn avbryts aktuellt arbete och hela kön.
- **Avbrutet. Föreslagna ändringar ligger kvar i utkastet.** står
  ovanför fältet även när textvyn öppnas igen, men visas inte utanför
  textvyn. Texten och Lo-förslaget ligger kvar. Sena svar visas inte.
- Nästa uppdrag tar bort avbrottstexten. Nytt samtal tömmer också kön;
  de borttagna uppdragen börjar aldrig. Det nya uppdraget kan besvaras.

### KÖ-02: smal dator visar stopp, behåller oskickad text och tillåter Escape

**Syfte:** Avbryta från fältets stoppikon utan att skicka fältets text.

**Användare:** Alex.

**Förutsättningar:** Datorfönster 600 px brett och mikrofonen på.

**Integrationstest:**
[conversation-queue.spec.ts](../../tests/integration/conversation-queue.spec.ts),
testfallet “KÖ-02: smal dator visar stopp, behåller oskickad text och tillåter
Escape”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-queue.spec.ts",
    "caseId": "KÖ-02"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven bredd och pekare skyddar FIFO, rätt avbrottsgräns och oskickad text.",
  "outcomes": [
    "Skicka ersätts av **Avbryt**, med en stoppikon. Endast en stoppikon syns och röstrutan visar statusordet. Inga meddelanden köas av Retur.",
    "Stoppet skickar inte oskickad text. Texten, utkastet och mikrofonläget behålls; fokus återgår till fältet. Rösten tystnar och sena svar uteblir.",
    "Escape avbryter också på smal dator. Det avbryter inte när Skyttel bara talar. Automationen verifierar ljudaktivitet och att utgångsspåret förblir anslutet; faktiskt hört tal behöver mänsklig kontroll."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Prata med Skyttel**. Skicka **Ett uppdrag åt gången.**.
   Skriv **Oskickad text** och tryck Retur medan svaret hålls.
2. Läs röstrutan och arbetsraden. Aktivera textvyns stoppikon med
   tangentbord eller pekare. Släpp det gamla svaret.
3. Skicka **Avbryt med tangentbord.** och tryck Escape i fältet medan
   det nya svaret hålls. Släpp svaret.
4. Starta den kontrollerade utgångssignalen enligt förberedelsen när
   inget arbete pågår. Tryck Escape i fältet. Röstrutan ska fortfarande
   visa **Skyttel talar**. Avsluta signalen efter kontrollen.

**Förväntat resultat:**

- Skicka ersätts av **Avbryt**, med en stoppikon. Endast en stoppikon
  syns och röstrutan visar statusordet. Inga meddelanden köas av Retur.
- Stoppet skickar inte oskickad text. Texten, utkastet och mikrofonläget
  behålls; fokus återgår till fältet. Rösten tystnar och sena svar uteblir.
- Escape avbryter också på smal dator. Det avbryter inte när Skyttel bara
  talar. Automationen verifierar ljudaktivitet och att utgångsspåret
  förblir anslutet; faktiskt hört tal behöver mänsklig kontroll.

### KÖ-03: röstrutans stopp avbryter talat arbete och textkön utan att ändra utkastet

**Syfte:** Avbryta väntande uppdrag från båda inmatningssätten.

**Användare:** Alex.

**Förutsättningar:** Datorfönster bredare än 700 px och mikrofonen på.

**Integrationstest:**
[conversation-queue.spec.ts](../../tests/integration/conversation-queue.spec.ts),
testfallet “KÖ-03: röstrutans stopp avbryter talat arbete och textkön
utan att ändra utkastet”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-queue.spec.ts",
    "caseId": "KÖ-03"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven bredd och pekare skyddar FIFO, rätt avbrottsgräns och oskickad text.",
  "outcomes": [
    "Ett nytt talat eller skrivet meddelande avbryter inte det första. Stoppet tömmer både de talade och de skrivna väntande uppdragen.",
    "Rösten tystnar. Mikrofonen förblir av och Lo-förslaget ligger kvar. Textvyn visar avbrottstexten tills det nya textuppdraget börjar.",
    "Bara det nya uppdraget får ett svar. Inga sena kommentarer skickas till rösten. Faktiskt hört ljud provas separat på verklig utrustning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steg 1: kör `user Hållet talat uppdrag.` och `delegate`
i terminalen. Invänta dess verkliga modellanrop och meddela
**Första taluppdraget hålls** utan att släppa svaret. Kör sedan
`user Väntande talat uppdrag.` och `delegate` och meddela
**Nästa taluppdrag är levererat till kön** före användarens skrivna
Väntande text. Behåll första svaret genom mikrofon OFF och faktiskt
Avbryt i steg 2. Släpp det gamla svaret först i steg 3 enligt
förberedelsen; nästa textuppdrag använder sitt nya aktuella anrop.
Använd [den separata samtalsförberedelsen](conversation-preparation.md)
och samma provinstallation under fallet. Operatören styr bara den
kontrollerade leverantören; vanliga UI-steg läser verkliga resultat.
Stäng konsolen före fokusproven. Återställ signaler och hållningar
efter känt utfall, avsluta med `quit` och starta nytt mellan fallen.

**Steg:**

1. Be operatören leverera det första talade uppdraget och behålla dess verkliga
   modellsvar hållet. Invänta bekräftelse. Be sedan operatören leverera det
   väntande talade uppdraget och invänta bekräftelse. Skicka **Väntande text.**
   i textvyn.
2. Läs att två uppdrag väntar. Stäng av mikrofonen med mikrofonknappen och
   aktivera röstrutans **Avbryt**.
3. Släpp det första svaret med **För sent.**. Skicka **Ett nytt textuppdrag.**
   och släpp det med **Textsvaret.**.

**Förväntat resultat:**

- Ett nytt talat eller skrivet meddelande avbryter inte det första.
  Stoppet tömmer både de talade och de skrivna väntande uppdragen.
- Rösten tystnar. Mikrofonen förblir av och Lo-förslaget ligger kvar.
  Textvyn visar avbrottstexten tills det nya textuppdraget börjar.
- Bara det nya uppdraget får ett svar. Inga sena kommentarer skickas
  till rösten. Faktiskt hört ljud provas separat på verklig utrustning.

### KÖ-04: mobilens stopp skickar inte oskickad text och köar inget meddelande

**Syfte:** Skicka ett uppdrag i taget på mobil med kvarvarande fälttext.

**Användare:** Alex.

**Förutsättningar:** Chromium med emulerad pekskärm, 390 × 844 px, textvyn
öppen.
Den grova pekaren skyddar skillnaden mellan Retur/Escape och stopp.
Fysisk beröring provas i KÖ-05.

**Integrationstest:**
[conversation-queue.spec.ts](../../tests/integration/conversation-queue.spec.ts),
testfallet “KÖ-04: mobilens stopp skickar inte oskickad text och köar
inget meddelande”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-queue.spec.ts",
    "caseId": "KÖ-04"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven bredd och pekare skyddar FIFO, rätt avbrottsgräns och oskickad text.",
  "outcomes": [
    "Ett uppdrag behandlas, inga meddelanden väntar. Retur köar inget. Arbetsraden ger ingen Escape-instruktion på mobil.",
    "En stoppikon syns. Stoppet skickar inte fältets text och det sena svaret visas inte. Texten och Lo-förslaget behålls."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skicka **Mobiluppdrag.**. Skriv **Ska ligga kvar** när svaret hålls
   och tryck Retur. Om en fysisk tangent finns, tryck även Escape.
2. Aktivera stoppikonen på Skickas plats. Släpp det gamla svaret med
   **För sent på mobilen.**. Läs fältet, samtalstexten och utkastet.

**Förväntat resultat:**

- Ett uppdrag behandlas, inga meddelanden väntar. Retur köar inget.
  Arbetsraden ger ingen Escape-instruktion på mobil.
- En stoppikon syns. Stoppet skickar inte fältets text och det sena
  svaret visas inte. Texten och Lo-förslaget behålls.

## Tillgänglighetsbedömning

Designmålet är WCAG 2.2 AA. Automationen provar kontroller med begripliga
namn och tangentbord (2.1.1, 4.1.2), Escape inom rätt fokusyta (2.1.2),
återgång av fokus till fältet (2.4.3), ett tillgängligt stoppmål på minst
24 × 24 px (2.5.8) och en bestående avbrottstext med `aria-live="polite"`
(4.1.3). Smal vy provar att röstrutan inte täcker stoppkontrollen
(1.4.10, 2.4.11). Information ges med text och symbol, inte bara färg.

Kontrollera med skärmläsare att avbrottstexten läses när det blir dess tur,
att fältets namn och fokus behålls samt att förstoring och synligt fokus
fungerar på verklig utrustning. Faktiskt ljud, färgkontrast och hela
flödets överensstämmelse är inte verifierade enbart av dessa tester.

## Observationer med verkliga hjälpmedel och utrustning

### KÖ-05: gemensamt stopp på verklig utrustning

**Syfte:** Bedöma den verkliga observationen separat från Chromium-emulering.

**Användare:** Alex; Robin i medlemskapets förberedelse om den behövs.

**Förutsättningar:** Fysisk telefon, tangentbord, mikrofon och hörlurar i
isolerad HTTPS-installation.

**Separat förberedelse:**

Följ [den fysiska förberedelsen](../development/testing.md#physical-device-manual-preparation)
med isolerad, nåbar HTTPS-installation, verklig inloggning och påhittade
uppgifter. Loopback-adressen från launchern når inte en fysisk telefon.
Verkliga leverantörsanrop kräver separat godkännande innan körning.
Skapa Lo Exempel som Person med Påhittad uppgift när fallet behöver utkast;
använd tom beskrivning för FRAGA. Återställ utkast och samtal mellan fallen,
och ta bort provhushållet när granskningen är klar.

**Kräver mänsklig observation:** Stopp avbryter väntande tal och text utan att
skicka oskickad text. Escape i fältet avbryter arbete på dator men stoppar inte
enbart uppspelning. Mobilens beröring fungerar och mikrofonen förblir av när
användaren valt av.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Stopp avbryter väntande tal och text utan att skicka oskickad text. Escape i fältet avbryter arbete på dator men stoppar inte enbart uppspelning. Mobilens beröring fungerar och mikrofonen förblir av när användaren valt av."
  },
  "reference": "Fysisk telefon, tangentbord, mikrofon och hörlurar i isolerad HTTPS-installation",
  "outcomes": [
    "Stopp avbryter väntande tal och text utan att skicka oskickad text. Escape i fältet avbryter arbete på dator men stoppar inte enbart uppspelning. Mobilens beröring fungerar och mikrofonen förblir av när användaren valt av."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ de synliga arbetsstegen i KÖ-01–04, ett fall i taget,
   från rätt utgångsläge. Använd verklig utrustning för den angivna
   observationen; syntetiska terminalpaket ersätter inte faktiskt tal.
2. Anteckna det faktiskt hörda eller utförda resultatet, plattform,
   webbläsare och hjälpmedel. För fysiskt ljud, använd samma påhittade
   meddelanden; följ den angivna ljud- eller inmatningsobservationen.

**Förväntat resultat:**

- Stopp avbryter väntande tal och text utan att skicka oskickad text. Escape i
  fältet avbryter arbete på dator men stoppar inte enbart uppspelning. Mobilens
  beröring fungerar och mikrofonen förblir av när användaren valt av.
