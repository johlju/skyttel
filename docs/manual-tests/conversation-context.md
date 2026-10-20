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

Körbara paket, versionsvärden, felgränser och städning finns i
[den separata förberedelsen](conversation-preparation.md). Följ den vid
angivet arbetssteg, tillsammans med UI-proceduren en gång.

## Läsning av bevarade och sparade uppgifter

I KONTEXT-01/02/03/08/09/10/11/12/14/15, när ett steg kräver kvarvarande eller
rättat Lo-förslag: öppna
**Utkast → Visa förslaget: Lo Exempel** (eller det rättade namnet).
Läs Person, det aktuella namnet och den fria egenskapen **Beskrivning** med
värdet **Påhittad uppgift (Text)**.
Stäng dialogen före nästa samtalssteg. När ett steg kräver sparad Lo:
öppna **Tabell**, fäll ut objektets rad och läs samma fullständiga värden.
Ett kvitto läses genom **Rapporter → Ändringshistorik → Visa ändringarna**.
Läs objektets namn, typ och beskrivning och välj **Tillbaka till arbetet**.
Gör läsningen vid respektive bevarat/rättat/sparat steg, utan att lägga
nya förslag i utkastet eller utföra ett extra sparande.

## Allmän förberedelse

1. Starta [den kontrollerade röstinstallationen](voice-assistant.md#controlled-voice-fixture).
   Kör inte `seed-family`. Skapa Kontextprov efter inloggningen.
2. Skapa **Lo Exempel**, typ **Person**, via **Tabell → Nytt objekt**.
   Öppna **Fria egenskaper** och lägg till **Beskrivning** med datatyp
   **Text** och värdet **Påhittad uppgift**. Välj **Lägg i utkastet och stäng**.
   Lämna förslaget osparat.
   Välj **Skriv till Skyttel → Nytt samtal → Godkänn och starta**.
3. Terminalen håller modelluppdragen. Läs anrops-ID, `draft.version`,
   `draft.contentVersion` och Lo-förslagets ID från varje `held`.
   Varje nytt uppdrag får ett nytt ID och aktuella versioner i `draft`.
   Terminalverktygen avslutar de angivna uppdragen enligt den separata
   förberedelsen. Verktygskommandon beskrivs i
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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-context.spec.ts",
    "caseId": "KONTEXT-01"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Den senaste ändringen kan rättas efter att den har lagts i utkastet. Sparande, avbrott och fel raderar inte sammanhanget.",
    "**För sent.** visas inte. Ett äldre sparbesked ger inget nytt sparande eller nytt kvitto. Felet kan följas av ett nytt vanligt uppdrag.",
    "Samtalet är tillfälligt. Automationen kontrollerar att provorden inte finns i SQLite eller dess transaktionsfil och att leverantörsanropen använder `store:false`. Ingen samtalslogg skapas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skicka **Rätta Lo till Lo Lind.**. Låt operatören släppa rättelsen
   enligt utkastbatchen i den separata förberedelsen. Läs hela Lo Lind
   i utkastet och stäng läsningen.
2. Skicka **Ändra den sista.**. Släpp rättelsen till **Lo Senaste**
   enligt samma förberedelse. Läs hela förslaget igen.
3. Skicka **Spara hela utkastet nu.** och släpp sparverktyget enligt
   förberedelsen. Läs sparad Lo Senaste i Tabell och kvittot i Rapporter.
   Välj **Tillbaka till arbetet**.
4. Skicka **Kontrollera samtalets tillfälliga provord.**. Håll svaret.
   Tryck Escape i meddelandefältet. Släpp sedan **För sent.** enligt
   förberedelsen; det får inte visas.
5. Skicka **Vad gjorde vi?**. Låt operatören pröva sparverktyget utan
   ny sparbegäran. Läs **Skyttel kunde inte slutföra uppdraget. Försök
   igen.** och läs samma sparade Lo Senaste igen.
6. Skicka **Finns samtalet kvar?** och släpp **Samtalet finns kvar.**.
   Läs svaret i samma samtal.

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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-context.spec.ts",
    "caseId": "KONTEXT-02"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "**Ändra den sista** har samma sammanhang i båda lägena. Mikrofon av raderar inget och startar ingen ny anslutning av sig självt.",
    "Efter anslutningsfelet väljer användaren själv att starta rösten. Det pågående samtalet och det privata utkastet finns kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Slå på **Prata med Skyttel**. Operatören förbereder det talade
   **Rätta Lo till Lo Lind.** med röstguidens `user`/`delegate` och
   släpper utkastbatchen. Läs hela Lo Lind i utkastet.
2. Slå av och på mikrofonen. Förbered det talade **Ändra den sista.**
   och rättelsen till **Lo Senaste**. Läs hela förslaget.
3. Stäng av mikrofonen. Skriv **Ändra den sista.** i textvyn och släpp
   rättelsen med aktuellt underlag enligt förberedelsen.
4. Operatören bryter den externa mediaanslutningen med röstguidens
   kontroller. Välj själv **Prata med Skyttel** igen.
5. Förbered det talade **Ändra den sista.** och släpp rättelsen. Läs
   hela Lo Senaste, bevarad samtalstext och mikrofonen på.

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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-context.spec.ts",
    "caseId": "KONTEXT-03"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Kommandona har samma verkan som **Nytt samtal** och den befintliga funktionen för att kasta hela utkastet. Bara ett uttryckligt **Kasta utkastet** tar bort de osparade förslagen.",
    "Tidigare samtalsord och pågående arbete följer inte med till det nya samtalet. Utkast, mikrofonläge och annan oskickad text bevaras vid nytt samtal utan kastkommando. Redan sparade uppgifter påverkas inte.",
    "Logga ut avslutar samtalet. Samtalsord och ljud lagras inte. Faktiskt hört tal, mikrofon och skärmläsare återstår att prova manuellt enligt [förberedelsen i TAL-17](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare).",
    "Ett skrivet nytt samtal med mikrofonen av ger enbart text. Ett talat nytt samtal får sitt röstbesked efter släpp eller avstängning, medan mikrofonen förblir av. Teknisk överlämning kontrolleras separat; faktiskt hört tal kräver den verkliga röstinstallationen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steg 2: kör `user Nytt samtal` och `delegate` efter att
mikrofonen slagits på. Meddela **Det talade reset-kommandot är levererat**.
Vid steg 4: kör först `user Nytt samtal` med mikrofonen på och meddela
**Kommandot väntar på överlämning**. Behåll det tills användaren slagit
av mikrofonen och skrivit Oskickat under avstängning. Kör först då
`delegate` och meddela **Överlämningen är släppt med mikrofonen av**.
Vid steg 5: kör `user Kasta utkastet` och `delegate` efter röststarten;
bekräfta leveransen före användarens läsning och avstängning.
Vid steg 7: kör `user Kasta utkastet och nytt samtal` och `delegate`
med mikrofonen på och bekräfta leveransen. Behåll den befintliga
separata kontrollen av reset-kommentar och spårägande; den är inget
påstående om faktiskt hört tal.
Använd [den separata samtalsförberedelsen](conversation-preparation.md)
och samma provinstallation under fallet. Operatören styr bara den
kontrollerade leverantören; vanliga UI-steg läser verkliga resultat.
Stäng konsolen före fokusproven. Återställ signaler och hållningar
efter känt utfall, avsluta med `quit` och starta nytt mellan fallen.

**Steg:**

1. Skicka **Ett tillfälligt samtalsord.** och släpp ett vanligt svar. Skicka
   **Vad betyder ”nytt samtal och kasta utkastet”?** och släpp ett vanligt svar.
   Läs att Lo-förslaget ligger kvar: ett citerat kommando ska inte börja om
   samtalet eller kasta utkastet. Slå på mikrofonen och skriv **Oskickat** utan
   att skicka.
2. Be operatören leverera det talade nytt-samtal-kommandot och invänta
   bekräftelse. Kräv en tömd samtalstext med **Nytt samtal. 1 osparad ändring
   ligger kvar i ditt utkast.**, kvarvarande Lo-förslag, mikrofon på och
   **Oskickat** kvar.
3. Slå av mikrofonen och skicka **Nytt samtal** i textvyn. Kontrollera samma
   resultat med mikrofonen av. Ingen medgivanderuta visas. Kontrollera att inget
   nytt röstbesked visas för detta skrivna kommando.
4. Slå på mikrofonen. Be operatören leverera det talade kommandot och invänta
   bekräftelse att det är förberett för överlämning. Slå av mikrofonen och skriv
   **Oskickat under avstängning** utan att skicka. Be först därefter operatören
   släppa överlämningen och invänta bekräftelse. Kräv nytt samtal, kvarvarande
   Lo-förslag, oskickad text kvar och mikrofonen fortsatt av. Det redan talade
   kommandots svar visas även efter avstängningen. Spårägande och röstpaket
   kontrolleras som tekniskt underlag.
5. Slå på mikrofonen, be operatören leverera det talade kastkommandot och
   invänta bekräftelse. Kräv tomt utkast och **Utkastet är kastat.** Stäng av
   mikrofonen och skicka sedan **Kasta utkastet** i textvyn. Utkastet är
   fortsatt tomt.
6. Skicka **Nytt samtal och kasta utkastet**. Kräv enbart **Nytt samtal.
   Utkastet är tomt.** och mikrofonen fortsatt av.
7. Slå på mikrofonen. Be operatören leverera det kombinerade talade kommandot
   och invänta bekräftelse. Kräv tomt utkast, nytt samtal och mikrofon fortsatt
   på.
8. Skicka **Har vi börjat om?**. Släpp svaret och logga ut via **Din profil**,
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
  enligt
  [förberedelsen i TAL-17](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare).
- Ett skrivet nytt samtal med mikrofonen av ger enbart text. Ett talat
  nytt samtal får sitt röstbesked efter släpp eller avstängning, medan
  mikrofonen förblir av. Överlämningens tekniska underlag finns i den
  separata förberedelsen; faktiskt hört tal kräver den verkliga
  röstinstallationen.

## Kontextmätaren

För dessa fall behövs inget Lo-förslag. Starta en ny kontrollerad
installation och skapa Kontextprov enligt allmän förberedelse steg 1.
Lägg inget förslag i utkastet. KONTEXT-04/07/13 startar samtalet i sitt
första steg. Före KONTEXT-05/06: välj
**Skriv till Skyttel → Nytt samtal → Godkänn och starta**; slå dessutom
på mikrofonen före KONTEXT-06.
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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-capacity.spec.ts",
    "caseId": "KONTEXT-04"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Mätaren följer serverns värden för den konfigurerade textmodellen. Flera svar summerar inte tidigare uppmätta procenttal.",
    "Namnet är **Kontext**. Skärmläsaren kan läsa värdet som procent och beskrivningen **Så mycket av samtalets kontext som är fylld. Nytt samtal tömmer den.** Ingen ny automatisk uppläsning krävs för varje värde."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Inför varje meddelande i UI-steg 2: kör först `text-context 70`,
sedan `text-context 90`, var och en före dess eget skickade meddelande.
Bekräfta förberedelsen före Skicka, och släpp det verkliga hållna
modellsvaret efter Skicka innan nästa värde förbereds.
Kör därefter `text-context 84` före Första provfrågan och bekräfta
förberedelsen. Efter Skicka: använd `reply ANROP Ett provsvar.`;
ersätt `ANROP` med ID från just detta `held`. Meddela **Provsvar släppt**.
Före Nästa provfråga i steg 3: kör `text-context 92`. Efter Skicka:
använd `reply ANROP Ett nytt provsvar.` med det nya aktuella anropets ID.
Meddela **Nästa provsvar släppt**. Ingen ny mätning gäller förrän
dess eget verkliga svar släppts.
Använd [den separata samtalsförberedelsen](conversation-preparation.md)
och samma provinstallation under fallet. Operatören styr bara den
kontrollerade leverantören; vanliga UI-steg läser verkliga resultat.
Stäng konsolen före fokusproven. Återställ signaler och hållningar
efter känt utfall, avsluta med `quit` och starta nytt mellan fallen.

**Steg:**

1. Välj **Skriv till Skyttel → Nytt samtal → Godkänn och starta**. Läs
   **Kontext** under textvyns rubrik. Kräv **0%**. Läs mätarens synliga namn och
   värde. Uppläsning och beskrivning bedöms separat i KONTEXT-16.
2. Be operatören förbereda först den lägre och sedan den högre mätningen.
   Invänta installationen och skicka ett nytt meddelande för varje värde;
   invänta operatörens bekräftelse av det släppta svaret efter varje meddelande.
   Läs **70%** och **90%**. Be sedan operatören förbereda nästa mätning och
   invänta bekräftelse. Skriv **Första provfrågan** och välj **Skicka**. Be
   operatören släppa det verkliga hållna anropets provsvar och invänta
   bekräftelse. Kräv **84%** efter svaret.
3. Be operatören förbereda nästa högre mätning och invänta bekräftelse. Skicka
   **Nästa provfråga** och be operatören släppa samma anrops provsvar och
   invänta bekräftelse. Kräv **92%**.
4. Välj **Nytt samtal**. Kräv **0%** och att provfrågorna och svaren är borta.

**Förväntat resultat:**

- Mätaren följer serverns värden för den konfigurerade textmodellen.
  Flera svar summerar inte tidigare uppmätta procenttal.
- Namnet är **Kontext**. Det tekniska underlaget kontrollerar procent och
  beskrivningen **Så mycket av samtalets kontext som är fylld. Nytt
  samtal tömmer den.** Ingen ny automatisk uppläsning krävs för varje värde.
- Automationen kontrollerar att mätaren står under rubriken och att
  modellen använder sin verkligt konfigurerade kapacitet som nämnare.

### KONTEXT-05: rösten visar procent från 85 och läser tröskeln en gång

**Syfte:** Läsa den aktuella procenten utan upprepade skärmläsarbesked.

**Användare:** Alex.

**Förutsättningar:** Ett nytt samtal och textvyn öppen.
Faktisk tröskeluppläsning provas separat i KONTEXT-16.
Den kontrollerade rösten är tyst och ersätter inte ett verkligt ljudprov.

**Integrationstest:**
[conversation-capacity.spec.ts](../../tests/integration/conversation-capacity.spec.ts),
testfallet “KONTEXT-05: rösten visar procent från 85 och läser
tröskeln en gång”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-capacity.spec.ts",
    "caseId": "KONTEXT-05"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Symbolen börjar visas vid 85 procent och visar det aktuella talet. Röstrutan får plats med symbolen utan att bli högre. Bredd och höjd jämförs med pixelmått i automationen.",
    "En separat artig uppläsning anger 85-procentströskeln en gång per samtal. Högre tal, samma tröskel efter en nedgång och mikrofon av/på ger inga nya procentbesked.",
    "**Nytt samtal** återställer både procenttalet och den enda uppläsningen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Invänta den aktuella röstanslutningen efter röststarten. Vid
UI-steg 1: kör `context 84`; steg 2: `context 85`; steg 3: `context 88`.
Bekräfta varje leverans före användarens läsning. Vid steg 4: kör
`context 70`, låt användaren läsa symbolens försvinnande, och kör
sedan `context 85`. Bekräfta innan mikrofonens av/på-prov.
Efter det verkliga Nytt samtal i steg 5: invänta den nya
röstanslutningen, kör `context 85` och bekräfta leveransen.
Tröskelns DOM-annonsering och fysisk uppläsning behåller sina
separata evidensgränser.
Använd [den separata samtalsförberedelsen](conversation-preparation.md)
och samma provinstallation under fallet. Operatören styr bara den
kontrollerade leverantören; vanliga UI-steg läser verkliga resultat.
Stäng konsolen före fokusproven. Återställ signaler och hållningar
efter känt utfall, avsluta med `quit` och starta nytt mellan fallen.

**Steg:**

1. Välj **Prata med Skyttel**. Be operatören leverera den första mätningen och
   invänta bekräftelse. Kräv **84%** i textmätaren och ingen kontextsymbol i
   röstrutan.
2. Be operatören leverera tröskelmätningen och invänta bekräftelse. Kräv
   symbolen och **85%**. Läs den synliga procenten. Tröskelns enda
   DOM-statusuppdatering är automatiskt underlag; verklig uppläsning bedöms i
   KONTEXT-16.
3. Be operatören leverera den högre mätningen och invänta bekräftelse. Kräv
   **88%** och namnet **Kontexten är 88 procent full**, utan att
   procentvisningen fastnar på det gamla värdet.
4. Be operatören leverera mätningen under tröskeln och därefter tröskeln igen.
   Invänta bekräftelse och läs resultatet efter varje mätning. Symbolen
   försvinner och kommer tillbaka; Slå av och på mikrofonen. Kräv fortfarande
   **85%**; uppläsningen bedöms separat i KONTEXT-16.
5. Välj **Nytt samtal**. Kräv **0%** och ingen symbol. När den nya
   röstanslutningen är klar, be operatören leverera tröskelmätningen till den
   nya anslutningen och invänta bekräftelse. Kräv symbolen och **85%** för det
   nya samtalet. Uppläsningen bedöms separat i KONTEXT-16.

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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-capacity.spec.ts",
    "caseId": "KONTEXT-06"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Fel format och mätningar från den avslutade röstanslutningen ändrar inte procenttalet. Bara aktuell giltig leverantörsmätning används."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steg 1: kör `context 85` på aktuell röstanslutning och
bekräfta leveransen. Vid steg 2: kör `context-invalid` och bekräfta
leveransen; kör därefter `capture-context-source` och meddela
**Den gamla anslutningen är sparad som testkälla** före Nytt samtal.
Efter det verkliga bytet och ny röstanslutning i steg 3: kör
`context-old 99` och bekräfta leveransen från den gamla källan.
Vid steg 4: kör `context 20` på den nya anslutningen och bekräfta
leveransen. De separata tekniska felvärdena förblir i automationen.
Använd [den separata samtalsförberedelsen](conversation-preparation.md)
och samma provinstallation under fallet. Operatören styr bara den
kontrollerade leverantören; vanliga UI-steg läser verkliga resultat.
Stäng konsolen före fokusproven. Återställ signaler och hållningar
efter känt utfall, avsluta med `quit` och starta nytt mellan fallen.

**Steg:**

1. Be operatören leverera tröskelmätningen och invänta bekräftelse. Kräv **85%**
   och kontextsymbolen.
2. Be operatören leverera den ogiltiga mätningen och invänta bekräftelse. Kräv
   oförändrade **85%**. Be sedan operatören behålla den gamla anslutningen som
   separat testkälla och invänta bekräftelse före nästa steg.
3. Välj **Nytt samtal** och vänta tills rösten är klar. Kräv **0%** och ingen
   kontextsymbol. Be operatören leverera den gamla anslutningens mätning och
   invänta bekräftelse. Kräv fortfarande **0%**.
4. Be operatören leverera den nya giltiga mätningen och invänta bekräftelse.
   Kräv **20%**, utan kontextsymbol.

**Förväntat resultat:**

- Fel format och mätningar från den avslutade röstanslutningen ändrar
  inte procenttalet. Bara aktuell giltig leverantörsmätning används.
- Automationen provar även negativt värde, saknat värde och en
  påhittad användningshändelse från webbläsarens externa röstprov.
  Webbläsaren kan inte själv välja serverns procenttal.

### KONTEXT-07: mätaren och röstrutans procent går att läsa på pekskärm

**Syfte:** Läsa kontexten och använda samtalet på telefon och surfplatta.

**Användare:** Alex.

**Förutsättningar:** Chromium med emulerad pekskärm, 390 × 1180 px,
minskad rörelse och ljust tema. Bredden skyddar procentens läsbarhet och
omflöde. Verklig utrustning och uppläsning provas i KONTEXT-16/17.

**Integrationstest:**
[conversation-capacity.spec.ts](../../tests/integration/conversation-capacity.spec.ts),
KONTEXT-07 i gruppen pekskärm 390.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-capacity.spec.ts",
    "caseId": "KONTEXT-07"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Procenttalet framgår av text och tillgängligt namn, oberoende av färg och rörelse. Mätaren har samma beskrivning på alla skärmstorlekar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Efter godkännandet men före meddelandet i UI-steg 1: kör
`text-context 88` och bekräfta förberedelsen. Efter verklig Skicka:
släpp just det hållna anropet med `reply ANROP Ett provsvar.`, med
anropets aktuella ID, och meddela **Provsvar släppt**. Efter röststarten
i steg 2: invänta aktuell anslutning, kör `context 88` och meddela
**Röstens mätning är levererad**. Samma tidsordning används av
KONTEXT-13:s emulerade variant; fysisk utrustning provas separat.
Använd [den separata samtalsförberedelsen](conversation-preparation.md)
och samma provinstallation under fallet. Operatören styr bara den
kontrollerade leverantören; vanliga UI-steg läser verkliga resultat.
Stäng konsolen före fokusproven. Återställ signaler och hållningar
efter känt utfall, avsluta med `quit` och starta nytt mellan fallen.

**Steg:**

1. Välj **Skriv till Skyttel → Nytt samtal**, godkänn. Be operatören förbereda
   textmätningen och invänta bekräftelse. Skicka **Ett prov på pekskärm** och be
   operatören släppa samma hållna provsvar och invänta bekräftelse. Läs
   **Kontext**, **88%** och beskrivningen.
2. Välj **Prata med Skyttel** och be operatören leverera röstens mätning.
   Invänta bekräftelse. Läs symbolen och procenttalet. Kräv att statusord och
   **Avbryt**, när det visas, fortfarande går att läsa och använda.
3. Stäng textvyn och öppna den igen med **Skriv till Skyttel**. Läs samma
   **88%**. Kontrollera att mätaren och symbolen syns utan rullning i sidled.

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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-summary.spec.ts",
    "caseId": "KONTEXT-08"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Sammanfattningen kortar kontexten utan att ta bort samtalstext eller utkast. Det senaste förslaget går att rätta med samma hänvisning.",
    "Orden **Spara hela utkastet nu** i historiska data ger inget sparande. Automationen kontrollerar `store:false` och att provordet saknas i SQLite och dess transaktionsfil. Samtalet loggas inte av servern."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered textmätning 99 procent enligt den separata förberedelsen.
   Skicka **Fyll kontexten.**. Släpp **kontextprovord** och därefter
   det historiska sammandraget med ett gammalt sparkommando.
2. Läs **Skyttel har sammanfattat samtalet för att få plats i
   kontexten.**, lägre procenttal och tidigare repliker kvar.
3. Återställ den förberedda textmätningen till noll. Skicka **Ändra
   den sista.**. Läs kvarvarande Lo Exempel och släpp rättelsen enligt
   förberedelsen. Läs hela Lo Senaste i utkastet.
4. Skicka **Vad gjorde vi?**. Operatören försöker släppa sparverktyget
   med de aktuella versionerna utan ny sparbegäran.
5. Läs **Skyttel kunde inte slutföra uppdraget. Försök igen.**. Läs
   oförändrad gemensam karta och hela Lo Senaste kvar i utkastet.
   Sammanfattningsraden ska förekomma en gång.

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

**Förutsättningar:** Lo-förslaget och textvyn finns kvar. Mikrofonen ska vara
på. KONTEXT-14 provar valet av.

**Integrationstest:**
[conversation-summary.spec.ts](../../tests/integration/conversation-summary.spec.ts),
KONTEXT-09, mikrofonen på.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-summary.spec.ts",
    "caseId": "KONTEXT-09"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Samma samtal, senaste utkast och tidigare mikrofonläge finns kvar. Ett tillfälligt kontextbyte ger ingen ny automatisk 85-procentsuppläsning. Gammal anslutning påverkar inte den nya mätaren."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steg 2, efter vald mikrofon och aktuell anslutning: kör
`capture-context-source`, sedan `context 89`. Bekräfta leveransen och
invänta det verkliga nya sammanfattningsanropet. Släpp just detta anrop
med det befintliga historiska Lo-sammandraget och bekräfta släppet.
Behåll den gamla källan för steg 4:s separat förberedda mätning efter
bytet. KONTEXT-14 använder samma tidsordning med mikrofonen av;
operatören ändrar inte användarens val.
Använd [den separata samtalsförberedelsen](conversation-preparation.md)
och samma provinstallation under fallet. Operatören styr bara den
kontrollerade leverantören; vanliga UI-steg läser verkliga resultat.
Stäng konsolen före fokusproven. Återställ signaler och hållningar
efter känt utfall, avsluta med `quit` och starta nytt mellan fallen.

**Steg:**

1. Skicka **Behåll vårt sammanhang.** och släpp ett vanligt textsvar. Slå på
   mikrofonen. Låt mikrofonen vara på.
2. Be operatören förbereda och leverera sammanfattningsgränsen. Invänta
   bekräftelse av samma nya sammanfattningsanrops släppta historiska
   Lo-sammandrag.
3. Kräv sammanfattningsraden en gång, lägre procenttal, gamla repliker kvar och
   samma mikrofonläge efter bytet. Inget nytt reset- eller sparbesked visas.
4. Släpp den gamla mätningen enligt den separata förberedelsen. Procenttalet ska
   inte höjas av den gamla anslutningen.
5. Stäng av mikrofonen vid behov. Skicka **Ändra den sista.** och släpp
   rättelsen till Lo Senaste enligt KONTEXT-08, steg 3.

**Förväntat resultat:**

- Samma samtal, senaste utkast och tidigare mikrofonläge finns kvar.
  Ett tillfälligt kontextbyte ändrar inte användarens mikrofonval.
  Faktisk uppläsning provas separat i KONTEXT-16. Gammal anslutning påverkar
inte den nya mätaren.
- Automationen kontrollerar den nya anslutningens historiska underlag,
  aktuella utkast och mikrofonspårets ägande. Verkligt tal och fysisk
  mikrofon kräver separat prov enligt röstguiden.

### KONTEXT-10: misslyckad sammanfattning blockerar tills nytt samtal

**Syfte:** Bevara det ursprungliga samtalet och utkastet efter ett
uttryckligt sammanfattningsfel, och kunna börja om.

**Användare:** Alex.

**Förutsättningar:** Lo-förslaget ligger osparat. Textvyn är öppen. KONTEXT-15
provar röst som ingång.

**Integrationstest:**
[conversation-summary.spec.ts](../../tests/integration/conversation-summary.spec.ts),
KONTEXT-10, text som ingång.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-summary.spec.ts",
    "caseId": "KONTEXT-10"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Servern skiljer sammanfattningsfel från allmänt uppdragsfel och blockerar användning av Skicka och mikrofonen; servergränserna kontrolleras separat i automationen. Ursprunglig kontext, samtalstext och utkast finns kvar tills användaren uttryckligen väljer nytt samtal. Inga nya uppgifter spelas in.",
    "Notisen visar hinderbeskedet. Knappen **Nytt samtal** går att nå, har synligt fokus och kan användas utan tal eller pekdon."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före Fyll kontexten i UI-steg 1: kör `text-context 99` och
bekräfta förberedelsen. Efter Skicka: släpp det vanliga arbetssvaret.
Invänta därefter det nya verkliga sammanfattningsanropet; kör
`fail ANROP` med just dess ID och meddela **Sammanfattningen har
misslyckats**. Felet får inte läggas på det föregående arbetssvaret.
Efter verkligt Nytt samtal men före Kan vi fortsätta i steg 5:
kör `text-context 0` och bekräfta förberedelsen. Släpp det vanliga
svaret först efter nästa Skicka, enligt den befintliga förberedelsen.
Använd [den separata samtalsförberedelsen](conversation-preparation.md)
och samma provinstallation under fallet. Operatören styr bara den
kontrollerade leverantören; vanliga UI-steg läser verkliga resultat.
Stäng konsolen före fokusproven. Återställ signaler och hållningar
efter känt utfall, avsluta med `quit` och starta nytt mellan fallen.

**Steg:**

1. Be operatören förbereda sammanfattningsgränsen och invänta bekräftelse.
   Skicka **Fyll kontexten.**. Be operatören släppa det vanliga svaret och
   därefter låta just sammanfattningen misslyckas. Invänta bekräftelse.
2. Kräv notisen **Kontexten är full, och Skyttel kunde inte sammanfatta
   samtalet. Inget har gått förlorat, och utkastet ligger kvar.** Samtalsrader
   och Lo-förslaget ligger kvar. Ingen lyckad sammanfattningsrad visas, och det
   allmänna uppdragsfelet används inte.
3. Skriv **Detta ska inte skickas.**. **Skicka** är avstängd. Fokusera
   mikrofonknappen med tangentbord och tryck Enter; den ser avstängd ut och ska
   inte börja spela in. Inget nytt modelluppdrag skapas.
4. Välj **Nytt samtal** i notisen med tangentbord. Kräv noll procent, borttagen
   notis, borttagna gamla samtalsrader och samma Lo-förslag.
5. Be operatören återställa nästa textmätning och invänta bekräftelse. Skicka
   **Kan vi fortsätta?** och släpp svaret. Samtalet ska åter gå att använda.

**Förväntat resultat:**

- Servern skiljer sammanfattningsfel från allmänt uppdragsfel och
  blockerar användning av Skicka och mikrofonen; servergränserna
  kontrolleras separat i automationen.
  Ursprunglig kontext, samtalstext och utkast finns kvar tills användaren
  uttryckligen väljer nytt samtal. Inga nya uppgifter spelas in.
- Notisen visar hinderbeskedet. Knappen **Nytt samtal** går
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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-summary.spec.ts",
    "caseId": "KONTEXT-11"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Kontextbytet avbryter inte det accepterade sparandet eller dess kvitto. Okänt sparresultat ska fortfarande kontrolleras före nya uppdrag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Vid UI-steg 1: kör `user Spara hela utkastet nu.` och `delegate`
och invänta det verkliga hållna uppdraget. Meddela **Sparuppdraget
är mottaget och hålls**. Behåll uppdraget och kör först därefter
`context 89`; bekräfta leveransen. Följ sedan det befintliga receptet
för KONTEXT-11 i [ljudfragment och tid](conversation-preparation.md#ljudfragment-och-tid-för-sparbesked):
släpp sparverktyget i steg 2; låt användaren läsa hela sparade Lo
FÖRE fragment och ljud. Leverera först fragmentet, därefter startad
och avslutad signal i steg 3. Släpp det efterföljande verkliga
sammanfattningsanropet först i steg 4.
Använd [den separata samtalsförberedelsen](conversation-preparation.md)
och samma provinstallation under fallet. Operatören styr bara den
kontrollerade leverantören; vanliga UI-steg läser verkliga resultat.
Stäng konsolen före fokusproven. Återställ signaler och hållningar
efter känt utfall, avsluta med `quit` och starta nytt mellan fallen.

**Steg:**

1. Be operatören leverera det kontrollerade talade sparuppdraget och behålla det
   hållet. Invänta bekräftelse. Be sedan operatören leverera
   sammanfattningsgränsen och invänta bekräftelse. Läs kvarvarande Lo-förslag
   och att sammanfattning ännu inte visas.
2. Låt operatören släppa sparverktyget enligt den separata förberedelsen. Läs
   hela sparade Lo Exempel i Tabell innan ljudsignalen börjar. Läs **Utkastet är
   sparat** under hushållsnamnet.
3. Operatören släpper först textfragmentet och därefter ljudaktiviteten enligt
   förberedelsen. Ett textfragment ensamt ska inte räcka för röstbyte. Läs
   **Skyttel talar** under signalen.
4. Släpp det efterföljande sammanfattningsanropet. Kräv sammanfattningsraden,
   lägre procenttal, sparad Lo, tomt utkast, mikrofon på och inget återspelat
   sparkvitto.

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

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-summary.spec.ts",
    "caseId": "KONTEXT-12"
  },
  "evidence": [
    {
      "kind": "technical",
      "runner": "playwright",
      "suite": "integration",
      "spec": "tests/integration/conversation-preparation.spec.ts",
      "title": "context preparation preserves buffered PCM through summary on seeded public installation",
      "purpose": "Det publicerade konsolreceptet håller verklig röststart och bevarar äldre PCM genom sammanfattning på fylld installation. Mikrofon av, en mikrofonbegäran, uteslutet senare ljud, återställd fetch samt hela karta, utkast och historik kontrolleras; separat PCM-receptprov från tomt hushåll ingår inte."
    }
  ],
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Redan inspelat tal förs vidare i ordning över kontextbytet. Släpp stoppar inspelningen omedelbart, även medan sammanfattningen arbetar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Installera den separata förberedelsens hållning för nästa röststart.
   Håll mikrofonknappen minst tre sekunder medan starten hålls, och
   släpp. Läs att mikrofonen är av.
2. Släpp starten och utlös sammanfattning enligt förberedelsen, före
   fortsatt arbete. Släpp sammanfattningsanropet. Ändra inget medgivande.
3. Läs sammanfattningsraden, bevarat utkast och mikrofon av. Granska
   PCM/spår separat vid de angivna gränserna i förberedelsen.

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
KONTEXT-16/17 anger de verkliga observationer som återstår.

Sammanfattningsflödets designmål är att behålla läsordning, fokus och
tidigare samtalstext (1.3.1, 2.4.3 och 3.2.2), ge ett artigt nytt
textbesked och ett tydligt hinderbesked (4.1.3), samt låta **Nytt samtal**
ha namn, avstängt läge för blockerade kontroller, synligt fokus och
tangentbordsåtkomst (2.1.1, 2.4.7, 2.4.11 och 4.1.2). Samma åtgärd finns
utan tal. Automationen verifierar synliga rader, bevarad samtalstext,
spärrad Skicka/mikrofon och en användbar återställningsknapp.
Faktisk skärmläsaruppläsning, fysisk pekskärm, förstoring och kontrast
återstår att verifiera manuellt; full WCAG-överensstämmelse påstås inte.

### KONTEXT-13: 820 px: mätaren och röstrutans procent på pekskärm

**Syfte:** 820 px: mätaren och röstrutans procent på pekskärm.

**Användare:** Alex.

**Förutsättningar:** Samma nya installation och Lo-förslag som i
KONTEXT-07. Följ dess förberedelse.

**Integrationstest:**
[conversation-capacity.spec.ts](../../tests/integration/conversation-capacity.spec.ts),
KONTEXT-13.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-capacity.spec.ts",
    "caseId": "KONTEXT-13"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Samma skyddade resultat som KONTEXT-07, med det angivna valet kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ KONTEXT-07 en gång, med följande ändring vid angivet steg.

Använd 820 × 1180 px i stället för 390 × 1180 px från första
steget. Bredden skyddar läsbarhet och omflöde på bredare emulerad pekskärm.

**Förväntat resultat:**

- Samma skyddade resultat som KONTEXT-07, med det angivna valet kvar.

### KONTEXT-14: sammanfattning behåller mikrofonen av

**Syfte:** sammanfattning behåller mikrofonen av.

**Användare:** Alex.

**Förutsättningar:** Samma nya installation och Lo-förslag som i
KONTEXT-09. Följ dess förberedelse.

**Integrationstest:**
[conversation-summary.spec.ts](../../tests/integration/conversation-summary.spec.ts),
KONTEXT-14.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-summary.spec.ts",
    "caseId": "KONTEXT-14"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Samma skyddade resultat som KONTEXT-09, med det angivna valet kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ KONTEXT-09 en gång, med följande ändring vid angivet steg.

Stäng av mikrofonen direkt efter starten i steg 1, före `context 89`.
Kontrollera att den förblir av genom bytet och rättelsen. Detta skyddar
användarens val att inte spela in under automatisk förnyelse.

**Förväntat resultat:**

- Samma skyddade resultat som KONTEXT-09, med det angivna valet kvar.

### KONTEXT-15: röstens sammanfattningsfel kan återställas

**Syfte:** röstens sammanfattningsfel kan återställas.

**Användare:** Alex.

**Förutsättningar:** Samma nya installation och Lo-förslag som i
KONTEXT-10. Följ dess förberedelse.

**Integrationstest:**
[conversation-summary.spec.ts](../../tests/integration/conversation-summary.spec.ts),
KONTEXT-15.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-summary.spec.ts",
    "caseId": "KONTEXT-15"
  },
  "reference": "Chromium, kontrollerad leverantör, riktig server och SQLite. Angiven ingång, mikrofonval och bredd skyddar kontextens gräns, bevarat utkast och återstart.",
  "outcomes": [
    "Samma skyddade resultat som KONTEXT-10, med det angivna valet kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

I stället för KONTEXT-10:s textgräns i UI-steg 1: invänta aktuell
röstanslutning, kör `context 89` och invänta det verkliga
sammanfattningsanropet. Kör `fail ANROP` med just detta anrops ID
och meddela **Röstens sammanfattning har misslyckats**. Textvyn är
öppen under detta; därefter används grundfallets steg 2–5 med dess
separata återställning före fortsatt textarbete.
Använd [den separata samtalsförberedelsen](conversation-preparation.md)
och samma provinstallation under fallet. Operatören styr bara den
kontrollerade leverantören; vanliga UI-steg läser verkliga resultat.
Stäng konsolen före fokusproven. Återställ signaler och hållningar
efter känt utfall, avsluta med `quit` och starta nytt mellan fallen.

**Steg:**

1. Följ KONTEXT-10 en gång, med följande ändring vid angivet steg.

Ersätt steg 1 med: slå på mikrofonen. Be operatören leverera röstens
sammanfattningsgräns och låta just sammanfattningen misslyckas. Invänta
bekräftelse. Textvyn ska vara öppen. Följ därefter steg 2–5 en gång. Varianten
skyddar blockering och återstart vid röstens sammanfattningsfel.

**Förväntat resultat:**

- Samma skyddade resultat som KONTEXT-10, med det angivna valet kvar.

## Observationer med verkliga hjälpmedel och utrustning

### KONTEXT-18: skärmläsaren läser sammanfattningsfelets hinderbesked

**Syfte:** Bevara den faktiska uppläsningen vid båda felingångarna.

**Användare:** Alex.

**Förutsättningar:** NVDA i Chromium på dator och hörlurar.

**Separat förberedelse:**

Starta en ny kontrollerad installation och skapa hela Lo-förslaget enligt
områdets allmänna förberedelse. Starta NVDA i samma fönster. Provmedia är
tysta; NVDA:s verkliga tal är observationen, inte leverantörens röst.
Börja en ny installation mellan text- och röstingången. Avsluta med `quit`.

**Kräver mänsklig observation:** Lyssna på NVDA:s hinderbesked efter
misslyckad sammanfattning i KONTEXT-10 och KONTEXT-15. Det särskilda felet
ska höras; ett allmänt uppdragsfel får inte ersätta det.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "NVDA läser det särskilda hinderbeskedet efter misslyckad sammanfattning från både text och röst."
  },
  "reference": "NVDA i Chromium på dator; text- och röstingång i separata nya installationer",
  "outcomes": ["Det särskilda sammanfattningsfelet hörs och Nytt samtal kan nås och aktiveras med tangentbord."],
  "evidence": [
    {"kind":"overlap","spec":"tests/integration/conversation-summary.spec.ts","caseId":"KONTEXT-10","purpose":"Textingångens synliga fel och tangentbordsåterstart; hör inte NVDA."},
    {"kind":"overlap","spec":"tests/integration/conversation-summary.spec.ts","caseId":"KONTEXT-15","purpose":"Röstingångens synliga fel och tangentbordsåterstart; hör inte NVDA."}
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ KONTEXT-10 steg 1–3 en gång. Lyssna när det hållna
   sammanfattningsanropet misslyckas. Läs även samma kvarvarande Lo-förslag.
2. Följ steg 4–5 med tangentbord. Lyssna på knappens namn och kontrollera
   synligt fokus före Enter och att samtalet går att använda igen.
3. Starta på nytt och följ KONTEXT-15 en gång, med dess röstingång och
   samma lyssning vid felet och tangentbordsåterstart.

**Förväntat resultat:**

- NVDA läser **Kontexten är full, och Skyttel kunde inte sammanfatta
  samtalet. Inget har gått förlorat, och utkastet ligger kvar.** vid båda
  ingångarna. Ett allmänt uppdragsfel ersätter inte beskedet.
- **Nytt samtal** kan nås, har synligt fokus och fungerar med tangentbord.

### KONTEXT-16: kontextens verkliga uppläsning

**Syfte:** Bedöma den verkliga observationen separat från Chromium-emulering.

**Användare:** Alex; Robin i medlemskapets förberedelse om den behövs.

**Förutsättningar:** NVDA i Chromium på dator.

**Separat förberedelse:**

Starta den kontrollerade installationen enligt områdets förberedelse på
dator. Använd NVDA i samma Chromium-fönster. Tyst syntetisk media räcker
för denna uppläsningskontroll; inget verkligt leverantörsanrop behövs.
Avsluta med `quit` efter granskningen och anteckna NVDA-versionen.

**Kräver mänsklig observation:** Mätarens namn, procent och beskrivning kan
läsas. Tröskeln 85 procent annonseras en gång per samtal, efter pågående
uppläsning. Nytt samtal ger ett nytt enda besked; förnyelse upprepar inte
mikrofonvalet.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Mätarens namn, procent och beskrivning kan läsas. Tröskeln 85 procent annonseras en gång per samtal, efter pågående uppläsning. Nytt samtal ger ett nytt enda besked; förnyelse upprepar inte mikrofonvalet."
  },
  "reference": "NVDA i Chromium på dator",
  "outcomes": [
    "Mätarens namn, procent och beskrivning kan läsas. Tröskeln 85 procent annonseras en gång per samtal, efter pågående uppläsning. Nytt samtal ger ett nytt enda besked; förnyelse upprepar inte mikrofonvalet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ de synliga arbetsstegen i KONTEXT-04, KONTEXT-05 och KONTEXT-09/14, ett
   fall i taget,
   från rätt utgångsläge. Använd verklig utrustning för den angivna
   observationen; syntetiska terminalpaket ersätter inte faktiskt tal.
2. Anteckna det faktiskt hörda eller utförda resultatet, plattform,
   webbläsare och hjälpmedel. För fysiskt ljud, använd samma påhittade
   meddelanden; framkalla kontextbyte med ett tillräckligt långt samtal.

**Förväntat resultat:**

- Mätarens namn, procent och beskrivning kan läsas. Tröskeln 85 procent
  annonseras en gång per samtal, efter pågående uppläsning. Nytt samtal ger ett
  nytt enda besked; förnyelse upprepar inte mikrofonvalet.

### KONTEXT-17: kontextbyte med fysisk mikrofon och pekskärm

**Syfte:** Bedöma den verkliga observationen separat från Chromium-emulering.

**Användare:** Alex; Robin i medlemskapets förberedelse om den behövs.

**Förutsättningar:** Fysisk mikrofon, hörlurar och telefon i isolerad
HTTPS-installation.

**Separat förberedelse:**

Följ [den fysiska förberedelsen](../development/testing.md#physical-device-manual-preparation)
med isolerad, nåbar HTTPS-installation, verklig inloggning och påhittade
uppgifter. Loopback-adressen från launchern når inte en fysisk telefon.
Verkliga leverantörsanrop kräver separat godkännande innan körning.
Skapa Lo Exempel som Person med Påhittad uppgift när fallet behöver utkast;
använd tom beskrivning för FRAGA. Återställ utkast och samtal mellan fallen,
och ta bort provhushållet när granskningen är klar.

**Kräver mänsklig observation:** Tal inspelat före släpp finns kvar genom
sammanfattningen; inget nytt tal spelas in efter släpp. Ett faktiskt hört
sparkvitto avslutas före röstbyte. Procent, symbol och text kan läsas i båda
teman och vid zoom.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-microphone-audio",
    "observation": "Tal inspelat före släpp finns kvar genom sammanfattningen; inget nytt tal spelas in efter släpp. Ett faktiskt hört sparkvitto avslutas före röstbyte. Procent, symbol och text kan läsas i båda teman och vid zoom."
  },
  "reference": "Fysisk mikrofon, hörlurar och telefon i isolerad HTTPS-installation",
  "outcomes": [
    "Tal inspelat före släpp finns kvar genom sammanfattningen; inget nytt tal spelas in efter släpp. Ett faktiskt hört sparkvitto avslutas före röstbyte. Procent, symbol och text kan läsas i båda teman och vid zoom."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ de synliga arbetsstegen i KONTEXT-07/13, KONTEXT-11 och KONTEXT-12, ett
   fall i taget,
   från rätt utgångsläge. Använd verklig utrustning för den angivna
   observationen; syntetiska terminalpaket ersätter inte faktiskt tal.
2. Anteckna det faktiskt hörda eller utförda resultatet, plattform,
   webbläsare och hjälpmedel. För fysiskt ljud, använd samma påhittade
   meddelanden; framkalla kontextbyte med ett tillräckligt långt samtal.

**Förväntat resultat:**

- Tal inspelat före släpp finns kvar genom sammanfattningen; inget nytt tal
  spelas in efter släpp. Ett faktiskt hört sparkvitto avslutas före röstbyte.
  Procent, symbol och text kan läsas i båda teman och vid zoom.
