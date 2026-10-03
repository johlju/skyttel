# Manuella testfall för samtalets kö och avbrott

Fallen provar ordnade uppdrag på dator och gemensamma avbrott för text
och röst på dator, mobil och smal skärm. Anteckna commit, webbläsare och
godkänt eller underkänt resultat vid körning. Kontrollerade ljudspår är
tysta; faktiskt hört tal och skärmläsarens uppläsning redovisas separat.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Köprov och
  loggar in med Google i den kontrollerade installationen.

## Allmän förberedelse

1. Starta [den kontrollerade röstinstallationen](voice-assistant.md#controlled-voice-fixture).
   Skapa Köprov efter inloggningen. Kör inte `seed-family`.
2. Skapa Lo Exempel, typ Person, beskrivning Påhittad uppgift, via Lista
   och välj **Lägg i mitt utkast**. Lämna förslaget osparat.
   Välj **Skriv till Skyttel** och **Godkänn och starta**.
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

**Steg:**

1. Skicka **Första uppdraget.**, **Andra uppdraget.** och **Tredje
   uppdraget.** utan att släppa något svar. Läs arbetsraden och `pending`.
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

**Steg:**

1. Välj **Prata med Skyttel**. Skicka **Ett uppdrag åt gången.**.
   Skriv **Oskickad text** och tryck Retur medan svaret hålls.
2. Läs röstrutan och arbetsraden. Aktivera textvyns stoppikon med
   tangentbord eller pekare. Släpp det gamla svaret.
3. Skicka **Avbryt med tangentbord.** och tryck Escape i fältet medan
   det nya svaret hålls. Släpp svaret.
4. På verklig utrustning: låt Skyttel tala när inget arbete pågår och
   tryck Escape i fältet. Redovisa lyssningskontrollen separat.

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

**Steg:**

1. Kör `user Hållet talat uppdrag.` och `delegate` i terminalen.
   Låt modellsvaret vara hållet. Kör sedan `user Väntande talat uppdrag.`
   och `delegate`. Skicka **Väntande text.** i textvyn.
2. Läs att två uppdrag väntar. Stäng av mikrofonen med mikrofonknappen
   och aktivera röstrutans **Avbryt**.
3. Släpp det första svaret med **För sent.**. Skicka **Ett nytt
   textuppdrag.** och släpp det med **Textsvaret.**.

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

**Förutsättningar:** Mobil med pekskärm, cirka 390 px bredd, textvyn öppen.

**Integrationstest:**
[conversation-queue.spec.ts](../../tests/integration/conversation-queue.spec.ts),
testfallet “KÖ-04: mobilens stopp skickar inte oskickad text och köar
inget meddelande”.

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
