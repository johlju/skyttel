# Manuella testfall för samtalets kontext

Fallen provar att samma tillfälliga samtal följer text och röst, även efter
utkaständringar, sparande, avbrott och fel. De provar också aktuella
kommandon för nytt samtal och för att kasta hela utkastet.
Kontextmätaren och röstrutans procenttal provas med kontrollerade
leverantörsmätningar; de bevisar inte en verklig modells kapacitet.
Full kontext provas också med automatiska sammanfattningar, kvarvarande
utkast och samtalstext, säkert röstbyte och ett uttryckligt felhinder.
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

**Förutsättningar:** Lo-förslaget ligger osparat i utkastet. Textvyn är
öppen i ett datorfönster bredare än 700 px.

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
   hållet. Tryck Escape med fokus i meddelandefältet och släpp sedan
   det gamla svaret med
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

**Förutsättningar:** Lo-förslaget ligger osparat i utkastet. Textvyn är
öppen i ett datorfönster bredare än 700 px.

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

**Förutsättningar:** Lo-förslaget ligger osparat i utkastet. Textvyn är
öppen i ett datorfönster bredare än 700 px.

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
   samma resultat med mikrofonen av. Ingen medgivanderuta visas. Kör
   `sessions`; ingen ny röstkommentar skickas för detta skrivna kommando.
4. Slå på mikrofonen. Kör `user Nytt samtal`, slå av mikrofonen innan
   du kör `delegate`, och skriv **Oskickat under avstängning** utan att
   skicka. Släpp delegeringen. Kräv nytt samtal, kvarvarande Lo-förslag,
   oskickad text kvar och mikrofonen fortsatt av. `stats()` enligt
   röstguiden ska visa ett levande avstängt mikrofonspår och
   `microphoneRequests:1`.
   Kör `sessions`; det redan talade kommandot får sitt röstbesked även
   efter avstängningen.
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
- Ett skrivet nytt samtal med mikrofonen av ger enbart text. Ett talat
  nytt samtal får sitt röstbesked efter släpp eller avstängning, medan
  mikrofonen förblir av. Kontrollera överlämningen i `sessions`; faktiskt
  hört tal kräver den separata verkliga röstinstallationen.

## Kontextmätaren

För dessa fall behövs inget Lo-förslag. Starta en ny kontrollerad
installation och skapa Kontextprov enligt den allmänna förberedelsen.
Terminalkommandona ändrar endast den externa provleverantörens nästa
mätning. Servern och den tillfälliga SQLite-databasen är riktiga.
`context` gäller den aktuella röstanslutningen. `text-context` gäller
framtida textsvar; kommandot ändrar inte mätaren förrän ett svar släpps.

### KONTEXT-04: textmätaren följer modellens mätning och nytt samtal tömmer den

**Syfte:** Läsa serverns procenttal och börja om utan gamla samtalsrader.

**Användare:** Alex.

**Förutsättningar:** Kontextprov har ett nytt samtal utan utkaständringar.

**Integrationstest:**
[conversation-capacity.spec.ts](../../tests/integration/conversation-capacity.spec.ts),
testfallet “KONTEXT-04: textmätaren följer modellens mätning och nytt
samtal tömmer den”.

**Steg:**

1. Välj **Skriv till Skyttel** och **Godkänn och starta**. Läs **Kontext**
   under textvyns rubrik. Kräv **0%**. Läs mätaren med skärmläsare och
   kontrollera namnet, värdet och beskrivningen.
2. Kör `text-context 84` i terminalen. Skriv **Första provfrågan** och
   välj **Skicka**. Släpp det hållna anropet med `reply ANROP Ett provsvar.`;
   ersätt `ANROP` med ID från `held`. Kräv **84%** efter svaret.
3. Kör `text-context 92`. Skicka **Nästa provfråga** och släpp nästa
   anrop med `reply ANROP Ett nytt provsvar.`. Kräv **92%**.
4. Välj **Nytt samtal**. Kräv **0%** och att provfrågorna och svaren
   är borta.

**Förväntat resultat:**

- Mätaren följer serverns värden för den konfigurerade textmodellen.
  Flera svar summerar inte tidigare uppmätta procenttal.
- Namnet är **Kontext**. Skärmläsaren kan läsa värdet som procent och
  beskrivningen **Så mycket av samtalets kontext som är fylld. Nytt
  samtal tömmer den.** Ingen ny automatisk uppläsning krävs för varje värde.
- Automationen kontrollerar att mätaren står under rubriken och att
  modellen använder sin verkligt konfigurerade kapacitet som nämnare.

### KONTEXT-05: rösten visar procent från 85 och läser tröskeln en gång

**Syfte:** Läsa den aktuella procenten utan upprepade skärmläsarbesked.

**Användare:** Alex.

**Förutsättningar:** Ett nytt samtal, skärmläsare på och textvyn öppen.
Den kontrollerade rösten är tyst och ersätter inte ett verkligt ljudprov.

**Integrationstest:**
[conversation-capacity.spec.ts](../../tests/integration/conversation-capacity.spec.ts),
testfallet “KONTEXT-05: rösten visar procent från 85 och läser
tröskeln en gång”.

**Steg:**

1. Välj **Prata med Skyttel**. Kör `context 84`. Kräv **84%** i textmätaren
   och ingen kontextsymbol i röstrutan.
2. Kör `context 85`. Kräv symbolen och **85%**. Läs symbolen med
   skärmläsaren: **Kontexten är 85 procent full**. Kräv samma besked en
   gång automatiskt, efter annan pågående uppläsning.
3. Kör `context 88`. Kräv **88%** och namnet **Kontexten är 88 procent
   full**, utan en ny automatisk uppläsning av procenttalet.
4. Kör `context 70` och sedan `context 85`. Symbolen försvinner och kommer
   tillbaka; inget nytt procentbesked ska läsas upp. Slå av och på
   mikrofonen. Kräv fortfarande inget nytt procentbesked.
5. Välj **Nytt samtal**. Kräv **0%** och ingen symbol. När den nya
   röstanslutningen är klar, kör `context 85`. Kräv ett nytt enda
   procentbesked för det nya samtalet.

**Förväntat resultat:**

- Symbolen börjar visas vid 85 procent och visar det aktuella talet.
  Röstrutan får plats med symbolen utan att bli högre. Bredd och höjd
  jämförs med pixelmått i automationen.
- En separat artig uppläsning anger 85-procentströskeln en gång per
  samtal. Högre tal, samma tröskel efter en nedgång och mikrofon av/på
  ger inga nya procentbesked.
- **Nytt samtal** återställer både procenttalet och den enda uppläsningen.

### KONTEXT-06: ogiltig mätning och gamla rösthändelser ändrar inte den nya kontexten

**Syfte:** Ignorera mätningar som inte hör till det aktuella samtalet.

**Användare:** Alex.

**Förutsättningar:** Ett nytt samtal, textvyn öppen och mikrofonen på.

**Integrationstest:**
[conversation-capacity.spec.ts](../../tests/integration/conversation-capacity.spec.ts),
testfallet “KONTEXT-06: ogiltig mätning och gamla rösthändelser ändrar
inte den nya kontexten”.

**Steg:**

1. Kör `context 85` och kräv **85%** och kontextsymbolen.
2. Kör `context-invalid`. Kräv oförändrade **85%**. Kör sedan
   `capture-context-source` för att behålla den gamla provleverantörens
   anslutning som testkälla.
3. Välj **Nytt samtal** och vänta tills rösten är klar. Kräv **0%** och
   ingen kontextsymbol. Kör `context-old 99`. Kräv fortfarande **0%**.
4. Kör `context 20`. Kräv **20%**, utan kontextsymbol.

**Förväntat resultat:**

- Fel format och mätningar från den avslutade röstanslutningen ändrar
  inte procenttalet. Bara aktuell giltig leverantörsmätning används.
- Automationen provar även negativt värde, saknat värde och en
  påhittad användningshändelse från webbläsarens externa röstprov.
  Webbläsaren kan inte själv välja serverns procenttal.

### KONTEXT-07: mätaren och röstrutans procent går att läsa på pekskärm

**Syfte:** Läsa kontexten och använda samtalet på telefon och surfplatta.

**Användare:** Alex.

**Förutsättningar:** Ett nytt samtal på en telefon eller surfplatta.
Aktivera minskad rörelse. Prova både ljust och mörkt tema. Anteckna
verklig enhet, operativsystem, webbläsare och skärmläsare separat.

**Integrationstest:**
[conversation-capacity.spec.ts](../../tests/integration/conversation-capacity.spec.ts),
testfallet “KONTEXT-07: mätaren och röstrutans procent går att läsa på
pekskärm”, under grupperna för 390 respektive 820 pixlars bredd.

**Steg:**

1. Välj **Skriv till Skyttel**, godkänn och kör `text-context 88`.
   Skicka **Ett prov på pekskärm** och släpp anropet med
   `reply ANROP Ett provsvar.`. Läs **Kontext**, **88%** och beskrivningen.
2. Välj **Prata med Skyttel** och kör `context 88`. Läs symbolen och
   procenttalet. Kräv att statusord och **Avbryt**, när det visas,
   fortfarande går att läsa och använda.
3. Stäng och öppna textvyn. Kräv samma procenttal. Prova skärmläsarens
   läsordning från rubriken till mätaren, samtalstexten och meddelandefältet.
4. Prova 200 och 400 procents zoom där webbläsaren stöder det. Kontrollera
   att värde, symbol och beskrivning fortfarande går att läsa utan att
   behöva rulla hela sidan i sidled. Byt tema och upprepa läsningen.

**Förväntat resultat:**

- Procenttalet framgår av text och tillgängligt namn, oberoende av färg
  och rörelse. Mätaren har samma beskrivning på alla skärmstorlekar.
- Automationen provar två emulerade pekskärmar med minskad rörelse,
  synlig mätare och symbol samt frånvaro av horisontell sidrullning.
  Verklig enhet, tema, zoom och skärmläsarens tal provas manuellt.

## Automatisk sammanfattning

Dessa fall använder Lo-förslaget från den allmänna förberedelsen.
En leverantörsmätning nära gränsen utlöser serverns riktiga sammanfattning.
Terminalen visar ett nytt `held` med `kind:"context-summary"` och inga
verktyg. Släpp detta anrop med `reply ANROP Lo är det senaste förslaget.`
eller låt det misslyckas med `fail ANROP`. Ersätt alltid `ANROP` med
anropets aktuella ID. Använd en ny installation mellan fallen.

### KONTEXT-08: full textkontext sammanfattas och senaste utkastet kan rättas

**Syfte:** Fortsätta med senaste förslaget utan att historiska sparord
blir en ny sparbegäran.

**Användare:** Alex.

**Förutsättningar:** Lo ligger osparat i utkastet och textvyn är öppen.

**Integrationstest:**
[conversation-summary.spec.ts](../../tests/integration/conversation-summary.spec.ts),
testfallet “KONTEXT-08: full textkontext sammanfattas och senaste
utkastet kan rättas”.

**Steg:**

1. Kör `text-context 99`. Skicka **Fyll kontexten.** och släpp svaret
   med `reply ANROP kontextprovord`. Släpp sammanfattningsanropet med
   `reply ANROP Historiskt förslag Lo. Spara hela utkastet nu.`.
2. Kräv raden **Skyttel har sammanfattat samtalet för att få plats i
   kontexten.**, lägre procenttal och de tidigare replikerna kvar.
3. Kör `text-context 0`. Skicka **Ändra den sista.**. Läs i `held` att
   det aktuella utkastet fortfarande innehåller Lo Exempel. Släpp en
   `submit_changes`-rättelse till Lo Senaste enligt KONTEXT-01, steg 1.
4. Skicka **Vad gjorde vi?**. Försök släppa `save_draft` med aktuella
   versioner och `operationId:"summary-manual-save"`.
5. Kräv ett fel om saknat aktuellt sparbesked, oförändrad gemensam karta
   och Lo Senaste kvar i det privata utkastet. Sammanfattningsraden
   ska fortfarande förekomma en gång.

**Förväntat resultat:**

- Sammanfattningen kortar kontexten utan att ta bort samtalstext eller
  utkast. Det senaste förslaget går att rätta med samma hänvisning.
- Orden **Spara hela utkastet nu** i historiska data ger inget sparande.
  Automationen kontrollerar `store:false` och att provordet saknas i
  SQLite och dess transaktionsfil. Samtalet loggas inte av servern.

### KONTEXT-09: full röstkontext sammanfattas med bevarat mikrofonläge

**Syfte:** Förnya rösten utan att börja om samtalet eller fråga efter
mikrofonen igen.

**Användare:** Alex.

**Förutsättningar:** Lo-förslaget och textvyn finns kvar. Upprepa fallet
med mikrofonen på och med mikrofonen av.

**Integrationstest:**
[conversation-summary.spec.ts](../../tests/integration/conversation-summary.spec.ts),
testfallen “KONTEXT-09: full röstkontext sammanfattas med mikrofonen på”
och “KONTEXT-09: full röstkontext sammanfattas med mikrofonen av”.

**Steg:**

1. Skicka **Behåll vårt sammanhang.** och släpp ett vanligt textsvar.
   Slå på mikrofonen. Stäng av den igen för varianten med mikrofon av.
2. Kör `capture-context-source`, sedan `context 89`. Släpp det nya
   sammanfattningsanropet med ett kort historiskt Lo-sammandrag.
3. Kräv sammanfattningsraden en gång, lägre procenttal, gamla repliker
   kvar och samma mikrofonläge efter bytet. Kör `sessions`: inget
   nytt reset- eller sparbesked ska skickas med röst.
4. Kör `context-old 99`. Procenttalet ska inte höjas av den gamla
   anslutningen. Läs `window.skyttelVoiceFixture.stats()` i konsolen:
   ett öppet röstpar, ett levande mikrofonspår och `microphoneRequests:1`.
5. Stäng av mikrofonen vid behov. Skicka **Ändra den sista.** och släpp
   rättelsen till Lo Senaste enligt KONTEXT-08, steg 3.

**Förväntat resultat:**

- Samma samtal, senaste utkast och tidigare mikrofonläge finns kvar.
  Ett tillfälligt kontextbyte ger ingen ny automatisk
  85-procentsuppläsning. Gammal anslutning påverkar inte den nya mätaren.
- Automationen kontrollerar den nya anslutningens historiska underlag,
  aktuella utkast och mikrofonspårets ägande. Verkligt tal och fysisk
  mikrofon kräver separat prov enligt röstguiden.

### KONTEXT-10: misslyckad sammanfattning blockerar tills nytt samtal

**Syfte:** Bevara det ursprungliga samtalet och utkastet efter ett
uttryckligt sammanfattningsfel, och kunna börja om.

**Användare:** Alex.

**Förutsättningar:** Lo-förslaget ligger osparat. Upprepa med text och
med röst. Textvyn är öppen i båda varianterna.

**Integrationstest:**
[conversation-summary.spec.ts](../../tests/integration/conversation-summary.spec.ts),
testfallen “KONTEXT-10: misslyckad sammanfattning blockerar text tills
nytt samtal” och “KONTEXT-10: misslyckad sammanfattning blockerar röst
tills nytt samtal”.

**Steg:**

1. För text: kör `text-context 99`, skicka **Fyll kontexten.** och
   släpp ett vanligt svar. För röst: slå på mikrofonen och kör
   `context 89`. Kör `fail ANROP` för sammanfattningsanropet.
2. Kräv notisen **Kontexten är full, och Skyttel kunde inte sammanfatta
   samtalet. Inget har gått förlorat, och utkastet ligger kvar.**
   Samtalsrader och Lo-förslaget ligger kvar. Ingen lyckad
   sammanfattningsrad visas, och det allmänna uppdragsfelet används inte.
3. Skriv **Detta ska inte skickas.**. **Skicka** är avstängd. Fokusera
   mikrofonknappen med tangentbord och tryck Enter; den ser avstängd
   ut och ska inte börja spela in. Inget nytt modelluppdrag skapas.
4. Välj **Nytt samtal** i notisen med tangentbord. Kräv noll procent,
   borttagen notis, borttagna gamla samtalsrader och samma Lo-förslag.
5. Kör `text-context 0`. Skicka **Kan vi fortsätta?** och släpp svaret.
   Samtalet ska åter gå att använda.

**Förväntat resultat:**

- Servern skiljer sammanfattningsfel från allmänt uppdragsfel och
  vägrar även faktiska HTTP-försök att skicka eller öppna mikrofonen.
  Ursprunglig kontext, samtalstext och utkast finns kvar tills användaren
  uttryckligen väljer nytt samtal. Inga nya uppgifter spelas in.
- Skärmläsaren får notisens hinderbesked. Knappen **Nytt samtal** går
  att nå, har synligt fokus och kan användas utan tal eller pekdon.

### KONTEXT-11: sammanfattning väntar på talat sparande och dess hörda kvitto

**Syfte:** Avsluta ett redan accepterat sparuppdrag före röstbytet.

**Användare:** Alex.

**Förutsättningar:** Lo-förslaget ligger osparat, mikrofonen är på och
textvyn öppen. Den kontrollerade rösten ersätter inte verkligt hört tal.

**Integrationstest:**
[conversation-summary.spec.ts](../../tests/integration/conversation-summary.spec.ts),
testfallet “KONTEXT-11: sammanfattning väntar på talat sparande och dess
hörda kvitto”.

**Steg:**

1. Kör `user Spara hela utkastet nu.` och `delegate`. Låt uppdraget
   vara hållet. Kör `context 89`. Kräv kvarvarande Lo-förslag och ingen
   stängd röstanslutning i `sessions`.
2. Släpp `save_draft` med aktuella versioner och
   `operationId:"summary-active-save"`. Kräv Lo Exempel i kartan och
   röstens enda `Sparat.`-kommentar i `sessions`.
3. Kör `skyttel Sparat.`. Ett textfragment ensamt ska inte räcka för
   röstbyte. Kör `window.skyttelVoiceFixture.setSound('remote', true)`
   i konsolen. Kräv **Skyttel talar**. Kör samma kommando med `false`.
4. Släpp det efterföljande sammanfattningsanropet. Kräv
   sammanfattningsraden, lägre procenttal, sparad Lo, tomt utkast,
   mikrofon på och inget återspelat sparkvitto.

**Förväntat resultat:**

- Kontextbytet avbryter inte det accepterade sparandet eller dess kvitto.
  Okänt sparresultat ska fortfarande kontrolleras före nya uppdrag.
- Automationen observerar kontrollerat ljud före och efter ordet.
  Det verkligt hörda kvittot och fördröjningar provas separat enligt röstguiden.

### KONTEXT-12: sammanfattning bevarar tal som spelades in före släpp

**Syfte:** Bevara tal som spelades in under starten genom sammanfattning utan
att spela in efter släpp.

**Användare:** Alex.

**Förutsättningar:** Giltigt medgivande, textvyn öppen, rösten ännu av.
Använd den kontrollerade installationens webbläsarprov för syntetiskt
ljud; prova också fysisk mikrofon i isolerad verklig röstinstallation.

**Integrationstest:**
[conversation-summary.spec.ts](../../tests/integration/conversation-summary.spec.ts),
testfallet “KONTEXT-12: sammanfattning bevarar tal som spelades in före
släpp”.

**Steg:**

1. Kör `window.skyttelVoiceFixture.setAutoStart(false)` i konsolen.
   Håll mikrofonknappen tills inspelningen börjar. Kör
   `window.skyttelVoiceFixture.setMicrophoneTone(440)`, håll minst tre
   sekunder och släpp. Kräv mikrofon av.
2. Kör `window.skyttelVoiceFixture.setMicrophoneTone(880)` och sedan
   `window.skyttelVoiceFixture.started()`. Kör `context 89` omedelbart.
   Släpp sammanfattningsanropet och kör `started()` när den nya rösten
   startar. Ändra inget medgivande.
3. Läs `sentAudio()` och `captureChanges()` enligt röstguiden. Kräv
   tidigare 440 Hz också efter röstbytet, ingen 880 Hz och ingen ny
   inspelning efter släpp. Kräv mikrofon av och `microphoneRequests:1`.

**Förväntat resultat:**

- Redan inspelat tal förs vidare i ordning över kontextbytet. Släpp
  stoppar inspelningen omedelbart, även medan sammanfattningen arbetar.
- Automationen provar verkliga utgående PCM-prov med syntetiska
  frekvenser. Fysisk mikrofon, faktiskt förstått tal och mobil
  webbläsares ljudtillstånd behöver fortfarande provas manuellt.

## Tillgänglighetsbedömning för kontextmätaren

Designmålen enligt WCAG 2.2 AA är semantisk mätare med namn, värde och
beskrivning (1.3.1 och 4.1.2), procenttext som inte kräver färgseende
(1.4.1), läsbar kontrast i båda teman (1.4.3 och 1.4.11), omflöde vid
zoom (1.4.10) och ett artigt statusbesked som väntar på sin tur (4.1.3).
Mätaren och symbolen är läsinformation, utan nya tangentbordssteg.

Automation verifierar namn, procentvärde, beskrivning, tröskelns enda
uppdatering i en artig region, symbolens geometri och emulerat omflöde.
Det verifierar inte faktisk skärmläsaruppläsning, kontrastmätning i alla
teman, zoom på verklig enhet eller fullständig WCAG-överensstämmelse.
KONTEXT-05 och KONTEXT-07 anger de manuella kontroller som återstår.

Sammanfattningsflödets designmål är att behålla läsordning, fokus och
tidigare samtalstext (1.3.1, 2.4.3 och 3.2.2), ge ett artigt nytt
textbesked och ett tydligt hinderbesked (4.1.3), samt låta **Nytt samtal**
ha namn, avstängt läge för blockerade kontroller, synligt fokus och
tangentbordsåtkomst (2.1.1, 2.4.7, 2.4.11 och 4.1.2). Samma åtgärd finns
utan tal. Automationen verifierar synliga rader, bevarad samtalstext,
spärrad Skicka/mikrofon och en användbar återställningsknapp.
Faktisk skärmläsaruppläsning, fysisk pekskärm, förstoring och kontrast
återstår att verifiera manuellt; full WCAG-överensstämmelse påstås inte.
