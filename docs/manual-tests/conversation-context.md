# Manuella testfall för samtalets kontext

Fallen provar att samma tillfälliga samtal följer text och röst, även efter
utkaständringar, sparande, avbrott och fel. De provar också aktuella
kommandon för nytt samtal och för att kasta hela utkastet.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.
Kontrollerade röstspår är tysta; faktiskt hört tal redovisas separat.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Kontextprov och
  loggar in med Google i den kontrollerade installationen.

## Allmän förberedelse

1. Starta [den kontrollerade röstinstallationen](voice-assistant.md#controlled-voice-fixture).
   Kör inte `seed-family`. Skapa Kontextprov efter inloggningen.
2. Skapa **Lo Exempel**, typ **Person**, beskrivning **Påhittad uppgift**,
   via Lista och välj **Lägg i mitt utkast**. Lämna förslaget osparat.
   Välj **Skriv till Skyttel** och **Godkänn och starta**.
3. Terminalen håller modelluppdragen. Läs anrops-ID, `draft.version`,
   `draft.contentVersion` och Lo-förslagets ID från varje `held`.
   När ett verktyg anropas används nästa anrops nya ID och de aktuella
   versionerna från `lastToolResult`. Verktygskommandon beskrivs i
   [röstguiden](voice-assistant.md#transcript-fragments-and-delegation).
4. Starta en ny installation mellan fallen. Avsluta med `quit` och
   kontrollera att den tillfälliga katalogen försvinner enligt startguiden.

## Samma samtal genom hela arbetet

### KONTEXT-01: kontexten består efter utkast, sparande, avbrott och fel

**Syfte:** Rätta det senaste förslaget och behålla sammanhanget utan att
ett gammalt sparbesked kan spara igen.

**Användare:** Alex.

**Förutsättningar:** Lo-förslaget ligger osparat i utkastet. Textvyn är öppen.

**Integrationstest:**
[conversation-context.spec.ts](../../tests/integration/conversation-context.spec.ts),
testfallet “KONTEXT-01: kontexten består efter utkast, sparande,
avbrott och fel”.

**Steg:**

1. Skicka **Rätta Lo till Lo Lind.**. Släpp ett `submit_changes` med
   aktuella versioner, `completion:"draft"`, `questions:[]` och en
   `propose_object`-operation för Lo. Operationens `arguments` innehåller
   Lo:s ID, `baseRevision:null` och `value` lika med kopierat `after`, med
   `name` ändrat till **Lo Lind**. Ta bort servermetadata ur `value`;
   lägg inte versioner i operationens `arguments`.
2. Skicka **Ändra den sista.**. Läs `held.input`: det tidigare uppdraget
   och dess verkliga verktygsresultat ska finnas kvar. Släpp motsvarande
   batch med aktuella versioner och **Lo Senaste** som namn.
3. Skicka **Spara hela utkastet nu.**. Släpp `save_draft` med aktuella
   `version`, `contentVersion` och `operationId:"context-manual-save"`.
   Kontrollera Lo Senaste i kartan och det verkliga kvittot.
4. Skicka **Kontrollera samtalets tillfälliga provord.**. Låt svaret vara
   hållet. Välj **Avbryt uppdrag** och släpp sedan det gamla svaret med
   `reply` och texten **För sent.**.
5. Skicka **Vad gjorde vi?**. Läs `held.input`: tidigare uppdrag och
   sparbesked ska finnas kvar. Försök släppa ett `save_draft` med de nu
   aktuella versionerna och ett nytt operations-ID.
6. Kräv ett fel om saknat aktuellt sparbesked och oförändrad karta.
   Skicka **Finns samtalet kvar?**. Läs att tidigare sammanhang och felet
   finns i `held.input`, och släpp `reply` med **Samtalet finns kvar.**

**Förväntat resultat:**

- Den senaste ändringen kan rättas efter att den har lagts i utkastet.
  Sparande, avbrott och fel raderar inte sammanhanget.
- **För sent.** visas inte. Ett äldre sparbesked ger inget nytt sparande
  eller nytt kvitto. Felet kan följas av ett nytt vanligt uppdrag.
- Samtalet är tillfälligt. Automationen kontrollerar att provorden inte
  finns i SQLite eller dess transaktionsfil och att leverantörsanropen
  använder `store:false`. Ingen samtalslogg skapas.

### KONTEXT-02: röst och text delar kontext över avstängning och ny röstanslutning

**Syfte:** Rätta samma senaste ändring genom röst, text och en återstartad
röstanslutning.

**Användare:** Alex.

**Förutsättningar:** Lo-förslaget ligger osparat i utkastet. Textvyn är öppen.

**Integrationstest:**
[conversation-context.spec.ts](../../tests/integration/conversation-context.spec.ts),
testfallet “KONTEXT-02: röst och text delar kontext över avstängning och
ny röstanslutning”.

**Steg:**

1. Slå på **Prata med Skyttel**. Kör `user Rätta Lo till Lo Lind.` och
   `delegate` i terminalen. Släpp en utkastbatch enligt KONTEXT-01, steg 1.
2. Slå av och på mikrofonen. Kör `user Ändra den sista.` och `delegate`.
   Läs det tidigare uppdraget och verktygsresultatet i `held.input`.
   Släpp en rättelse till **Lo Senaste** med aktuella versioner.
3. Stäng av mikrofonen. Skriv **Ändra den sista.** i textvyn, skicka och
   släpp en rättelse med samma aktuella underlag.
4. Kör `window.skyttelVoiceFixture.fail()` i webbläsarkonsolen. Vänta på
   avslutad anslutning. Välj **Prata med Skyttel** igen.
5. Kör `user Ändra den sista.` och `delegate`. Kräv tidigare uppdrag och
   Lo:s ändringar i `held.input`. Släpp rättelsen.

**Förväntat resultat:**

- **Ändra den sista** har samma sammanhang i båda lägena. Mikrofon av
  raderar inget och startar ingen ny anslutning av sig självt.
- Efter anslutningsfelet väljer användaren själv att starta rösten.
  Det pågående samtalet och det privata utkastet finns kvar.
- Automationen verifierar att den nya röstleverantörsanslutningen får
  serverns tidigare samtal, utan att historiken blir ett nytt sparbesked.

### KONTEXT-03: skrivna och talade kommandon börjar om samtalet och kastar utkastet

**Syfte:** Använda samma nya samtal och samma utkastborttagning med text
eller tal, med bevarat mikrofonläge.

**Användare:** Alex.

**Förutsättningar:** Lo-förslaget ligger osparat i utkastet. Textvyn är öppen.

**Integrationstest:**
[conversation-context.spec.ts](../../tests/integration/conversation-context.spec.ts),
testfallet “KONTEXT-03: skrivna och talade kommandon börjar om samtalet
och kastar utkastet”.

**Steg:**

1. Skicka **Ett tillfälligt samtalsord.** och släpp ett vanligt svar.
   Slå på mikrofonen och skriv **Oskickat** utan att skicka.
2. Kör `user Nytt samtal` och `delegate`. Kräv en tömd samtalstext med
   **Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.**,
   kvarvarande Lo-förslag, mikrofon på och **Oskickat** kvar.
3. Slå av mikrofonen och skicka **Nytt samtal** i textvyn. Kontrollera
   samma resultat med mikrofonen av. Ingen medgivanderuta visas.
4. Slå på mikrofonen. Kör `user Nytt samtal`, slå av mikrofonen innan
   du kör `delegate`, och skriv **Oskickat under avstängning** utan att
   skicka. Släpp delegeringen. Kräv nytt samtal, kvarvarande Lo-förslag,
   oskickad text kvar och mikrofonen fortsatt av. `stats()` enligt
   röstguiden ska visa ett levande avstängt mikrofonspår och
   `microphoneRequests:1`.
5. Slå på mikrofonen, kör `user Kasta utkastet` och `delegate`.
   Kräv tomt utkast och **Utkastet är kastat.** Stäng av mikrofonen och
   skicka sedan **Kasta utkastet** i textvyn. Utkastet är fortsatt tomt.
6. Skicka **Nytt samtal och kasta utkastet**. Kräv enbart
   **Nytt samtal. Utkastet är tomt.** och mikrofonen fortsatt av.
7. Slå på mikrofonen. Kör `user Kasta utkastet och nytt samtal` och
   `delegate`. Kräv tomt utkast, nytt samtal och mikrofon fortsatt på.
8. Skicka **Har vi börjat om?**. Nästa `held.input` ska sakna det gamla
   samtalsordet. Släpp svaret och logga ut via **Din profil**,
   **Inloggningssätt**, **Logga ut**.

**Förväntat resultat:**

- Kommandona har samma verkan som **Nytt samtal** och den befintliga
  funktionen för att kasta hela utkastet. Bara ett uttryckligt
  **Kasta utkastet** tar bort de osparade förslagen.
- Tidigare samtalsord och pågående arbete följer inte med till det nya
  samtalet. Utkast, mikrofonläge och annan oskickad text bevaras vid
  nytt samtal utan kastkommando. Redan sparade uppgifter påverkas inte.
- Logga ut avslutar samtalet. Samtalsord och ljud lagras inte.
  Faktiskt hört tal, mikrofon och skärmläsare återstår att prova manuellt
  i en isolerad verklig röstinstallation enligt
  [röstguiden](voice-assistant.md#tal-01-familjeärendet-sparas-med-röst-och-bevarad-oskickad-formulärtext).
