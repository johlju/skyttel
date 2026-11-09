# Manuella testfall för samtalets kontext

Fallen provar att samma samtal följer text och röst, även efter
utkaständringar, sparande, avbrott och fel. De provar också aktuella
kommandon för nytt samtal och för att kasta hela utkastet.
Kontextmätaren och röstrutans procenttal provas med kontrollerade
leverantörsmätningar; de bevisar inte en verklig modells kapacitet.
Full kontext provas också med automatiska sammanfattningar, kvarvarande
utkast och samtalstext, säkert röstbyte och ett uttryckligt felhinder.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.
Kontrollerade röstspår är tysta; faktiskt hört tal redovisas separat.

KONTEXT-24 provar beständigt bevarande genom omladdning, utloggning,
serveromstart och uttryckligt avslut. Exakta utgångsgränser har separat
tekniskt HTTP-underlag; klientåterställning ensam bevisar inte beständig
lagring.

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
    "Samtalet bevaras efter medgivande. Leverantörsanropen använder `store:false` och serverns vanliga diagnostik innehåller inte provorden."
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
- Samtalet bevaras efter medgivande. Leverantörsanropen använder
  `store:false`; serverns vanliga diagnostik innehåller inte provorden.

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
  serverns tidigare samtal och kontrollerade namnändring, utan att historiken
  blir ett nytt sparbesked.

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
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-draft-ordering.test.ts",
      "title": "a queued ordinary discard respects verified predecessor and manual versions (manual=true)",
      "purpose": "HTTP-bevis att ett köat kastkommando bevarar en senare manuell rättelse och kräver en aktuell begäran. En verifierad tidigare batch provas separat i samma serverfil."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/new-conversation.test.ts",
      "title": "a delegated spoken reset completes its own request while retiring the old voice work (discard=false)",
      "purpose": "HTTP-bevis att det talade nytt-samtal-kommandot slutför återstarten när den gamla röstanslutningens arbete avslutas och behåller utkastet."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/new-conversation.test.ts",
      "title": "a delegated spoken reset completes its own request while retiring the old voice work (discard=true)",
      "purpose": "HTTP-bevis att det kombinerade talade kommandot slutför återstarten och kastar utkastet utan att tidigare samtalsord följer med."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/new-conversation.test.ts",
      "title": "a retired spoken reset still cancels its retained request on stop",
      "purpose": "HTTP-bevis att ett separat Stopp avbryter det talade reset-kommandot även under återstartens fördröjda statusläsning."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/new-conversation.test.ts",
      "title": "a retired spoken reset still cancels its retained request on newer reset",
      "purpose": "HTTP-bevis att ett senare nytt samtal ersätter det tidigare talade reset-kommandot och att dess sena svar inte ändrar det nya samtalet."
    }
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
    "Orden **Spara hela utkastet nu** i historiska data ger inget sparande. Automationen kontrollerar `store:false`. Bevarande på installationen ändrar inte leverantörslagringen."
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
  Automationen kontrollerar `store:false`. Bevarande på installationen
  ändrar inte leverantörslagringen.

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

1. Skicka **Behåll vårt sammanhang om Lo Exempel.** och släpp ett vanligt
   textsvar. Slå på mikrofonen. Låt mikrofonen vara på.
2. Be operatören förbereda och leverera sammanfattningsgränsen. Invänta
   bekräftelse av samma nya sammanfattningsanrops släppta historiska
   Lo-sammandrag.
3. Kräv sammanfattningsraden en gång, lägre procenttal, gamla repliker kvar och
   samma mikrofonläge efter bytet. Inget nytt reset- eller sparbesked visas.
4. Släpp den gamla mätningen enligt den separata förberedelsen. Procenttalet ska
   inte höjas av den gamla anslutningen.
5. Stäng av mikrofonen vid behov. Läs det oförändrade Lo-förslaget med
   **Utkast → Visa förslaget: Lo Exempel**. Skicka **Ändra den sista.** och
   släpp rättelsen till Lo Senaste enligt KONTEXT-08, steg 3. Läs rättelsen
   i utkastet. Lo ska fortfarande vara osparad och inget sparbesked visas.

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

Det kontrollerade felet ger också beskedet **Modellen är tillfälligt
otillgänglig. Valet är kvar. Försök igen genom en egen handling när felet
är löst.** Läs detta tillsammans med sammanfattningsfelet i steg 2.
Saknad kontoåtkomst och kombinationer som inte stöds har egna förklaringar;
de separata HTTP-proven verifierar dessa fel vid leverantörsgränsen.

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
    "Notisen visar hinderbeskedet och modellfelets förklaring. Knappen **Nytt samtal** går att nå, har synligt fokus och kan användas utan tal eller pekdon."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-model-choice.test.ts",
      "title": "summary provider HTTP 403 preserves its classified failure and the completed work",
      "purpose": "Saknad kontoåtkomst vid sammanfattning bevaras separat från färdigt arbete."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-model-choice.test.ts",
      "title": "summary provider HTTP 400 preserves its classified failure and the completed work",
      "purpose": "Modell eller nivå som inte stöds får en egen förklaring vid sammanfattning."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-model-choice.test.ts",
      "title": "summary provider HTTP 503 preserves its classified failure and the completed work",
      "purpose": "Tillfälligt leverantörsfel vid sammanfattning ändrar inte verifierat resultat eller modellval."
    }
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
2. Kräv notisen **Skyttel kunde inte sammanfatta samtalet.** Läs
   modellfelets förklaring och nästa steg. Läs att samtalstext och utkast
   ligger kvar och att ett nytt samtal inte löser modellfelet eller ändrar
   kontots åtkomst. Samtalsrader och Lo-förslaget ligger kvar. Ingen lyckad
   sammanfattningsrad visas, och det allmänna uppdragsfelet används inte.
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
      "suite": "technical-browser",
      "spec": "tests/technical-browser/conversation-preparation.spec.ts",
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

- NVDA läser **Skyttel kunde inte sammanfatta samtalet**, modellfelets
  orsak och nästa steg vid båda ingångarna. Beskedet bevarar skillnaden
  mellan ett modellfel och valet att tömma samtalet. Ett allmänt
  uppdragsfel ersätter inte beskedet.
- **Nytt samtal** kan nås, har synligt fokus och fungerar med tangentbord.

### KONTEXT-19: exakt väntande uppdrag efter sammanfattning och ny röst

**Syfte:** Behålla användarens exakta begränsningar när modellens historik
sammanfattas och rösten får en ny anslutning.

**Användare:** Alex.

**Förutsättningar:** Textläge och ett osparat objekt Lo Exempel med
egenskapen Beskrivning. Kontrollerad leverantör frågar vilken färg som avses,
svarar på avslutade diskussionspunkter och framkallar sammanfattning via
kapacitetsmätningen. Den kan också lämna ett ofullständigt röstfragment utan
känt uppdrag. Detta bevisar inte verkliga modellers kontextgränser.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-summary.spec.ts",
    "caseId": "KONTEXT-19"
  },
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "a new selected model reconstructs fresh draft context without stale read results or draft snapshots",
      "purpose": "Publik HTTP-kontroll med riktig server och databas: manuell ändring och modellbyte återbildar aktuellt utkast utan gamla läsresultat."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "repeated draft reads replace old snapshots while verified batch evidence remains available",
      "purpose": "Upprepade läsningar och en verifierad batch genom publik HTTP behåller aktuellt underlag och batchens kontrollerade resultat."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "identical completed and unfinished wording retains distinct causal summary provenance",
      "purpose": "Två likalydande begäranden skiljs åt med serverns uppdragsidentitet. Bara den avslutade diskussionen sammanfattas."
    }
  ],
  "reference": "Kontrollerad leverantör, riktig server och databas. Sammanfattningen framkallas med kontrollerad mätning, inte verklig modellkapacitet.",
  "outcomes": [
    "Hela den exakta begäran finns kvar i samtalstexten och kan återges efter sammanfattning och ny röstanslutning.",
    "Färgfrågan väntar och Lo Exempel ligger kvar osparad utan ändrat namn."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Slå på mikrofonen. Låt leverantören lämna fragmentet ”Ett ofullständigt
   röstfragment som saknar uppdragsidentitet.” Kontrollera samtalstexten och
   slå av mikrofonen.
2. Skriv ”Ändra Lo när jag ger färgen. Behåll Beskrivning ordagrant:
   blå, grön; spara inte.” Kontrollera frågan ”Vilken färg?”.
3. Skriv ”Prata färdigt om punkt 0.” till och med punkt 8, ett meddelande
   i taget. Skriv sedan ”Fyll kontexten.” Vänta på sammanfattningsbeskedet.
4. Vänta tills Skyttel har talat färdigt innan röstanslutningen förnyas.
   Slå på mikrofonen, vänta på röstanslutningen och slå av mikrofonen.
5. Öppna Modell och resonemang, öppna modellvalet via modellnamnet och
   välj GPT-6.1 Sol. Vänta på ”Valet är sparat” och stäng dialogen med Escape.
6. Skriv ”Vad väntar exakt?”. Läs den återgivna begäran och samtalets
   ursprungliga begäran. Öppna utkastet och läs Lo Exempel.

**Förväntat resultat:**

- Båda begäranden återger alla ord och skiljetecken från steg 2.
- Färgfrågan väntar. Namnet Lo Exempel ligger kvar i utkastet; inget sparas.
- Samtalstexten innehåller diskussionspunkterna och sammanfattningsbeskedet.
- Den väntande frågan och det ofullständiga röstfragmentet följer med oförändrade
  till ny röst och modell. De behandlas inte som avslutad diskussion i sammanfattningen.

### KONTEXT-20: kapacitetsstopp och ett nytt avgränsat uppdrag

**Syfte:** Behålla originalets ordalydelse och utkastet när nödvändigt
underlag inte ryms, och kunna lämna en ny fullständig avgränsad begäran.

**Användare:** Alex.

**Förutsättningar:** Lo Exempel ligger osparad i utkastet. Textvyn är
öppen. Använd [den kontrollerade förberedelsen](conversation-preparation.md#sammanfattning-och-mätning)
för kapacitetsfelet. Det kontrollerade felet bevisar inte en verklig
modells faktiska kontextgräns.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-summary.spec.ts",
    "caseId": "KONTEXT-20"
  },
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "necessary exact instructions exceeding the selected profile pause without truncation or effects",
      "purpose": "En liten kontrollerad profil stoppar nödvändiga instruktioner före anrop utan att förkorta dem eller ändra utkastet."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "completed local discussion is summarized before the selected request budget rejects it",
      "purpose": "Stor avslutad lokal diskussion sammanfattas före arbetsanropets uppskattade profilgräns. Detta provar konstruerat underlag, inte verkliga leverantörers tokenisering eller gränser."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "an explicit complete restatement scopes capacity-paused work while retaining the original instruction and unrelated queue",
      "purpose": "Publik HTTP visar att en fullständig ny avgränsning krävs, att kön förblir pausad även över samtal och att tidigare sparbegäran inte återupplivas när kön släpps."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-draft-ordering.test.ts",
      "title": "capacity restatement waits for the shared draft barrier executing",
      "purpose": "En ny avgränsning väntar på ett annat samtals pågående arbete."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-draft-ordering.test.ts",
      "title": "capacity restatement waits for the shared draft barrier preparation",
      "purpose": "En ny avgränsning väntar på en tidigare reserverad förberedelse."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-draft-ordering.test.ts",
      "title": "capacity restatement waits for the shared draft barrier registered-save",
      "purpose": "Ett registrerat sparförsök måste få verifierat utfall före en ny avgränsning."
    },
    {
      "kind": "technical",
      "runner": "playwright",
      "suite": "technical-browser",
      "spec": "tests/technical-browser/conversation-preparation.spec.ts",
      "title": "literal context preparation completes batch, questions, save, rejection and admitted revoke on empty public installation",
      "purpose": "Det publicerade terminalkommandot framkallar kapacitetsstopp och tillåter en ny fullständig avgränsning genom textvyn."
    }
  ],
  "reference": "Chromium, kontrollerat kapacitetsfel, riktig server och SQLite. Inga fakturerbara anrop.",
  "outcomes": [
    "Stoppet ber användaren avgränsa uppdraget och lämnar den exakta samtalstexten och utkastet kvar.",
    "En fullständig ny avgränsad begäran kan skickas med alla tillämpliga begränsningar; ursprungligt oavslutat arbete och tidigare kö förblir pausade.",
    "Lo Exempel ligger kvar osparad och tidigare sparord ger inget nytt sparande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skriv ”Spara inte. Behåll instruktionerna ordagrant:” följt av 300
   upprepningar av ”blå; grön, ”. Låt operatören framkalla det kontrollerade
   kapacitetsfelet på arbetsanropet enligt förberedelsen.
2. Läs stoppbeskedet och den ursprungliga texten. Läs hjälpen vid textfältet:
   det nya uppdraget ska stå för sig självt och ange mål och alla begränsningar.
   Slå på mikrofonen, vänta på anslutningen och slå sedan av mikrofonen.
3. Skriv ”Beskriv enbart mitt aktuella utkast. Spara inte.” och välj
   **Avgränsa uppdraget**. Låt operatören släppa ett svar som beskriver Lo
   Exempel. Läs svaret och kontrollera att ursprungstexten ligger kvar.
4. Öppna utkastet och läs Lo Exempel. Stäng dialogen. Vänta på förnyad
   röstanslutning med mikrofonen fortfarande av och ursprungstexten kvar.

**Förväntat resultat:**

- Den exakta ursprungstexten, inklusive alla upprepningar, finns kvar.
- Det nya uppdraget behandlas utan att starta ursprungligt arbete eller
  annan tidigare kö. En ofullständig hänvisning kräver en fullständig ny begäran.
- Lo Exempel ligger kvar osparad med oförändrade värden.

### KONTEXT-21: köad rättelse behåller en aktuell oberoende uppgift

**Syfte:** Läsa aktuella uppgifter vid köstart och bevara en manuell
ändring som inte ändrar rättelsens åtgärd eller mål.

**Användare:** Alex.

**Förutsättningar:** Lo Exempel ligger osparad med Beskrivning som
Påhittad uppgift. Förbered en kontrollerad textmätning på 99 procent
enligt [sammanfattningsförberedelsen](conversation-preparation.md#sammanfattning-och-mätning).
Håll den första läsningens svar och dess följande sammanfattning separat.
Följ [förberedelsen för oberoende kontroll](conversation-preparation.md#köad-rättelse-och-oberoende-kontroll)
för läsbehörighet, aktuell arbetsbehörighet och kontrollens separata svar.
Detta mäter inte en verklig modells kontextgräns.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-summary.spec.ts",
    "caseId": "KONTEXT-21"
  },
  "evidence": [{
    "kind": "technical",
    "runner": "vitest",
    "suite": "server",
    "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
    "title": "queued actions use fresh facts but preserve the admitted target when facts are unrelated",
    "purpose": "Publik HTTP visar att nytt aktuellt underlag får användas med oförändrad entydig åtgärd och mål."
  }, {
    "kind": "technical",
    "runner": "vitest",
    "suite": "server",
    "spec": "tests/unit/server/manual-voice.test.ts",
    "title": "published queued correction preparation compares admitted and current targets with manual rename false",
    "purpose": "Det publicerade terminalreceptet håller den verkliga oberoende kontrollen och släpper ett tillåtande svar för samma mål med ändrad beskrivning."
  }],
  "reference": "Kontrollerad sammanfattning, riktig server och SQLite; vanligt formulär gör den oberoende ändringen.",
  "outcomes": [
    "Den köade rättelsen byter namnet till Lo Klar och bevarar den manuellt ändrade beskrivningen.",
    "Utkastet är osparat och den synliga samtalstexten finns kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skicka ”Fyll kontexten.” och håll svaret. Köa sedan ”Rätta Lo Exempel
   till Lo Klar. Spara inte.”.
2. Släpp den första läsningens svar och håll dess sammanfattning. Öppna
   **Tabell → Redigera Lo Exempel → Fria egenskaper**. Ändra Beskrivning
   till ”Manuell aktuell uppgift”. Välj **Lägg i utkastet och stäng**.
3. Öppna textvyn och släpp sammanfattningen. Låt den köade begäran rätta
   samma Lo-förslag med den aktuella beskrivningen. Släpp kontrollens
   tillåtande svar enligt förberedelsen.
4. Läs ”Lo Exempel bytte namn till Lo Klar.” och öppna Lo Klar i utkastet.

**Förväntat resultat:**

- Namnet är Lo Klar och Beskrivning är Manuell aktuell uppgift.
- Ingenting sparas. Begäran ligger kvar i samtalstexten.

### KONTEXT-22: köad rättelse frågar efter manuell namnändring

**Syfte:** Kräva förtydligande när det benämnda målet ändras under väntan.

**Användare:** Alex.

**Förutsättningar:** Samma kontrollerade uppställning som KONTEXT-21.
Återställ hushåll, utkast och samtal mellan fallen.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-summary.spec.ts",
    "caseId": "KONTEXT-22"
  },
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/manual-voice.test.ts",
      "title": "published queued correction preparation compares admitted and current targets with manual rename true",
      "purpose": "Det publicerade terminalreceptet visar ursprungligt och manuellt ändrat mål i den verkliga kontrollen och släpper ett förtydligande svar utan effekt."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "queued actions use fresh facts but preserve the admitted target when facts are renamed",
      "purpose": "En manuell namnändring kräver förtydligande före effekt."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "queued actions use fresh facts but preserve the admitted target when facts are retargeted",
      "purpose": "Ett annat objekt som får det efterfrågade namnet får inte bli ett nytt mål."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "queued actions use fresh facts but preserve the admitted target when facts are ambiguous",
      "purpose": "Två aktuella kandidater kräver förtydligande i stället för ett gissat mål."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "queued actions use fresh facts but preserve the admitted target when facts are overbudget",
      "purpose": "Ett underlag som överskrider den lokala storleksgränsen behandlas som ofullständigt och kräver förtydligande; det kortas inte till ett falskt fullständigt underlag."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-draft-ordering.test.ts",
      "title": "queued target stays bound across conversations with executing and replacement=false",
      "purpose": "Köstart efter ett annat samtals aktiva arbete bevarar det ursprungliga målet vid manuellt namnbyte."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-draft-ordering.test.ts",
      "title": "queued target stays bound across conversations with executing and replacement=true",
      "purpose": "Ett annat samtals aktiva arbete får inte låta ett ersättningsobjekt bli mål för den äldre begäran."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-draft-ordering.test.ts",
      "title": "queued target stays bound across conversations with preparation and replacement=false",
      "purpose": "En tidigare reserverad förberedelse bevarar senare köade begärans ursprungliga mål vid namnbyte."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-draft-ordering.test.ts",
      "title": "queued target stays bound across conversations with preparation and replacement=true",
      "purpose": "En tidigare reserverad förberedelse tillåter inget byte till ett ersättningsobjekt vid köstart."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-draft-ordering.test.ts",
      "title": "queued target stays bound across conversations with target-preparation and replacement=false",
      "purpose": "Målunderlaget fångas före begärans egen väntan i förberedelse, före manuell namnändring."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-draft-ordering.test.ts",
      "title": "queued target stays bound across conversations with target-preparation and replacement=true",
      "purpose": "Senare aktuella fakta under förberedelse får inte ersätta det ursprungliga målunderlaget."
    }
  ],
  "reference": "Namnbyte genom vanligt formulär i UI; byte av referent och tvetydighet samt väntan över samtal och asynkron förberedelse har separat tekniskt HTTP-underlag.",
  "outcomes": [
    "Skyttel ber användaren förtydliga rättelsen och bevarar det manuella namnet Lo Manuell.",
    "Utkast, beskrivning och synlig begäran finns kvar utan nytt sparande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Köa samma rättelse som KONTEXT-21 bakom den hållna läsningen. Släpp
   läsningen och håll sammanfattningen.
2. Öppna **Tabell → Redigera Lo Exempel**. Byt Namn till ”Lo Manuell”
   och välj **Lägg i utkastet och stäng**.
3. Öppna textvyn och släpp sammanfattningen. Låt operatören föreslå den
   tidigare rättelsen och släppa kontrollens förtydligande svar enligt
   förberedelsen. Välj **Läs mer** i **Samtalsnotis**, läs förtydligandet
   och öppna Lo Manuell i utkastet.

**Förväntat resultat:**

- Skyttel säger ”Förtydliga vilka ändringar du vill göra.”.
- Namnet är Lo Manuell och Beskrivning är Påhittad uppgift. Ingenting sparas.
- Den ursprungliga köade begäran finns kvar i samtalstexten.

### KONTEXT-23: text och röst läser aktuellt förslag efter en manuell rättelse

**Syfte:** Besvara en fråga med aktuella uppgifter och bevara en manuell
rättelse samt tidigare synlig samtalstext vid byte till röst.

**Användare:** Alex.

**Förutsättningar:** Lo Exempel ligger osparad med Beskrivning som
Påhittad uppgift enligt områdets allmänna förberedelse. Återställ
installation, hushåll och samtal mellan fallen.

**Separat förberedelse:** Låt terminalen hålla varje arbetsanrop. Läs det
aktuella Lo-förslaget i `held.draft`. Släpp det första svaret med
`reply REQUEST Lo-förslaget heter Lo Exempel.` och det andra med
`reply REQUEST Lo-förslaget heter Lo Manuell.`, där REQUEST är respektive
verkligt anrops-ID. Använd startguidens `user` och `delegate` för den andra
frågan om du provar med syntetisk mikrofon. Faktiskt hört ljud ingår inte.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-context.spec.ts",
    "caseId": "KONTEXT-23"
  },
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "verified relevant start facts answer directly while unrelated draft details remain unread",
      "purpose": "Relevant verifierat startunderlag ger ett svar utan extra arbetsomgång medan orelaterade utkastdetaljer inte skickas."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "a completed human follow-up starts with bounded current saved facts without another read round",
      "purpose": "En avslutad fråga om Lina följs av hon utan en extra läsomgång; äldre orelaterade personuppgifter utelämnas."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "a completed human follow-up starts with bounded current draft facts without another read round",
      "purpose": "Samma indirekta följdfråga använder aktuella relevanta utkastuppgifter utan en extra läsomgång."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "a bare pending answer reuses verified saved facts after unrelated completed questions",
      "purpose": "Ett svar med enbart telefonnummer återanvänder aktuella sparade fakta för den exakta väntande begäran efter oberoende frågor; avslutade delar väljer inga fakta."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "a bare pending answer preserves current saved candidates after a saved revision",
      "purpose": "Ett svar med enbart datum kräver en ny läsning efter en sparad rättelse och återför inte gamla värden."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "a bare pending answer preserves current saved candidates after a duplicate name",
      "purpose": "Ett kort svar bevarar båda sparade kandidaternas identiteter vid samma namn och omformulerar samma väntande fråga utan att välja person."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "a bare pending answer keeps the count limit and excludes a cached whole map",
      "purpose": "Sjutton relevanta sparade läsningar ger högst sexton startfakta; en tillgänglig hel karta skickas inte automatiskt."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "a bare pending answer keeps the bytes limit and excludes a cached whole map",
      "purpose": "Stora relevanta läsningar håller startunderlaget inom 32 KiB och lämnar orelaterade uppgifter utanför."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "a bare pending answer rejects verified saved facts after grant revocation",
      "purpose": "Verkligt återkallad MCP-behörighet stoppar ett hållet svar för den väntande begäran även när fakta redan finns tillgängliga."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "a bare pending answer rejects verified saved facts after content replacement",
      "purpose": "Verklig återimport byter innehållsägare och stoppar ett hållet svar med tidigare verifierade fakta för en väntande begäran."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "successive single corrections supersede obsolete draft pictures and preserve checked batch evidence",
      "purpose": "Efter flera rättelser ser nästa arbetsanrop aktuell utkastbild och bevarade kontrollerade ändringsbesked."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "superseding a duplicate relationship draft picture preserves its real existing identity",
      "purpose": "Ett verkligt återanvänt sambands identitet bevaras när dess gamla utkastbild ersätts efter en senare rättelse."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "plural follow-ups retain both bounded saved candidates and singular ambiguity asks which person",
      "purpose": "En plural hänvisning får båda aktuella sparade kandidaterna; en senare oklar singular hänvisning ger en fråga utan ändring."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "plural follow-ups retain both bounded draft candidates and singular ambiguity asks which person",
      "purpose": "Motsvarande kandidater i utkastet bevaras utan att en av personerna väljs vid oklar hänvisning."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "an indirect saved follow-up preserves two people with the same name for clarification",
      "purpose": "Två sparade personer med samma namn behåller skilda identiteter och ger en riktad fråga."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "an indirect draft follow-up preserves two people with the same name for clarification",
      "purpose": "Två personer med samma namn i utkastet ger en riktad fråga utan gissning eller ändring."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "an initial human reference without a prior target cannot select an unrelated sole proposal",
      "purpose": "Hon utan tidigare mål väljer inte ett orelaterat ensamt förslag; samtalet frågar vilken person som avses."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "an indirect follow-up after a saved revision uses the new date and never the obsolete cached value",
      "purpose": "En sparad rättelse kräver aktuell läsning och gamla egenskapsvärden återförs inte till nästa arbetsanrop."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "an indirect follow-up after a draft revision uses the new date and never the obsolete cached value",
      "purpose": "En manuell rättelse i utkastet ger aktuellt relevant startunderlag utan gammalt värde eller extra läsomgång."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "grant revocation rejects a held indirect cached-fact reply and a new conversation inherits no prior referent",
      "purpose": "Återkallad verklig MCP-behörighet stoppar ett väntande svar byggt på tidigare läsning och ett nytt samtal ärver ingen hänvisning."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "content replacement rejects a held indirect cached-fact reply and a new conversation inherits no prior referent",
      "purpose": "Verklig återimport ersätter innehållsägaren, stoppar gammalt väntande svar och förhindrar återanvändning av dess hänvisning."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/text-assistant.test.ts",
      "title": "independent reads overlap and identical concurrent reads share one authorized result",
      "purpose": "Publik MCP och kontrollerad leverantör visar överlappande oberoende läsningar och ett gemensamt resultat för identiska anrop."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/text-assistant.test.ts",
      "title": "parallel reads that cross a manual draft change cannot supply a mixed snapshot to the model",
      "purpose": "En manuell ändring under asynkron läsning stoppar blandat underlag före nästa arbetsanrop och bevarar den manuella ändringen."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/text-assistant.test.ts",
      "title": "a relevant verified map read answers a follow-up without another tool round and refreshes after saving",
      "purpose": "En relevant aktuell läsning återanvänds vid begärans start, medan ett senare sparande kräver aktuella uppgifter."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "continued batch work and renewed Live context retain current relevant facts without unrelated draft details",
      "purpose": "Fortsatt batcharbete och förnyad röstanslutning använder aktuella relevanta fakta utan orelaterade utkastdetaljer."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "continued single work and renewed Live context retain current relevant facts without unrelated draft details",
      "purpose": "Även en enskild ändrings fortsättning och förnyad röstanslutning bevarar urvalet av relevanta fakta."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "a manual edit during summary prevents another work request with the older draft snapshot",
      "purpose": "En manuell ändring under asynkron sammanfattning stoppar en ny arbetsomgång med gamla utkastuppgifter och bevarar den exakta begäran."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-provider-contracts.test.ts",
      "title": "ordinary conversation requests select the 30-minute minimum prompt lifetime without persistent provider state",
      "purpose": "Kontrollerade leverantörer verifierar begärans 30-minutersinställning och store:false, inte verklig lagringstid eller snabbare svar."
    }
  ],
  "reference": "Chromium, riktig server och SQLite, kontrollerade text- och röstleverantörer. Teknisk evidens mäter anropsantal och giltighet, inte verklig modellförståelse eller kortare väntetid.",
  "outcomes": [
    "Textfrågan besvaras med Lo Exempel och den senare röstfrågan med det manuella namnet Lo Manuell.",
    "Tidigare fråga och svar finns kvar i samtalstexten; hela Lo Manuell finns kvar osparad med oförändrad beskrivning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skriv ”Vad heter Lo Exempel i förslaget?”. Släpp det första svaret och
   läs ”Lo-förslaget heter Lo Exempel.”. Öppna förslaget och läs namn,
   Person och Beskrivning. Stäng läsningen.
2. Öppna **Tabell → Redigera Lo Exempel**. Sätt **Namn** till ”Lo Manuell”
   och välj **Lägg i utkastet och stäng**. Öppna textvyn och läs hela
   Lo Manuell i utkastet. Stäng läsningen.
3. Slå på mikrofonen. Säg ”Vad heter Lo Manuell i förslaget nu?” och släpp
   det andra svaret. Läs ”Lo-förslaget heter Lo Manuell.” i samtalstexten.
   Kontrollera att den första frågan och det första svaret finns kvar.
4. Slå av mikrofonen. Läs hela Lo Manuell i utkastet igen. Ingenting
   ska vara sparat i hushållets karta.

**Förväntat resultat:**

- Det senare svaret använder det manuella namnet Lo Manuell.
- Namn, typ och beskrivning finns kvar i utkastet, utan nytt sparande.
- Den tidigare synliga samtalstexten ändras inte.

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

## Bevarat samtal

### KONTEXT-24: omladdning bevarar pausat samtal och avslut lämnar utkastet

**Syfte:** Återfå samtalets text, fråga och modellval efter omladdning,
utloggning och omstart utan fortsatt arbete, och kunna ta bort samtalet
utan att kasta utkastet.

**Användare:** Alex.

**Förutsättningar:** Kontrollerad installation i ett datorfönster med
bredd 1280 px. Skapa Kontextprov och ett osparat Lo Exempel av typen
Person, utan beskrivning. Börja ett textsamtal och godkänn den aktuella
medgivandetexten utan att spara medgivandet.

**Separat förberedelse:** Använd
[frågan före omladdning](conversation-preparation.md#fråga-före-omladdning)
vid steg 2. Starta en ny installation för fallet och avsluta med `quit`.

**Automatiskt motsvarande test:**
[conversation-persistence.spec.ts](../../tests/integration/conversation-persistence.spec.ts),
KONTEXT-24. Provet använder riktig server, SQLite och kontrollerad modell.
Separat HTTP-underlag provar tal utan uppdrag och fördröjd delegering med
kontrollerad klocka. Det skiljer den mottagna repliken från senare arbete
och verifierar sjudygnsgränsen genom verklig omstart.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-persistence.spec.ts",
    "caseId": "KONTEXT-24"
  },
  "reference": "Dator 1280 px, textläge och nödvändig webbläsarlagring. Riktig server med kontrollerad modell. HTTP-underlaget skiljer faktisk databasbeständighet från klientåterställning.",
  "outcomes": [
    "Efter omladdning, utloggning och verklig serveromstart visas den exakta instruktionen, frågan och Sol/låg, med pausat arbete och en utgångstid.",
    "Avslut raderar samtalstext och fråga även efter en ny omladdning, medan Lo-förslaget ligger kvar osparat. Tangentbordsfokus går till Nytt samtal."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-persistence-http.test.ts",
      "title": "actual restart restores the exact conversation and choice without starting model work",
      "purpose": "Faktisk omstart med samma SQLite återställer samtal och val utan nytt modellarbete."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-persistence-http.test.ts",
      "title": "logout pauses exact unfinished work, queued work and pending-part identities across restart",
      "purpose": "Utloggning, verklig omstart och ny inloggning behåller väntande delars identitet och status samt kön, utan fortsatt modellarbete."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-persistence-http.test.ts",
      "title": "seven-day expiry survives restart and ignores model completion, polling and restoration",
      "purpose": "Kontrollerad klocka och verklig omstart bevisar den ursprungliga sjudygnsgränsen; modellarbete och upprepad visning förlänger den inte."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-persistence-http.test.ts",
      "title": "non-delegated speech renews the seven-day lifetime across restart without renewal by other voice activity",
      "purpose": "Tal utan delegerat uppdrag flyttar sjudygnsgränsen från mottagandet och består genom verklig omstart; tomt tal, Skyttels tal, ljudaktivitet och kontroller flyttar den inte."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-persistence-http.test.ts",
      "title": "spoken instructions and pending parts survive actual restart with voice paused and no provider reconnect",
      "purpose": "Fördröjd delegering av ett redan mottaget talat uppdrag flyttar inte sjudygnsgränsen; samma gräns och väntande del består genom verklig omstart."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-persistence-http.test.ts",
      "title": "expiry erases held conversation work while an unknown registered save keeps its barrier",
      "purpose": "Ett sent modellsvar återskapar inte utgånget samtal eller ändrar utkastet; registrerat okänt sparutfall behåller sin oberoende spärr."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Modell och resonemang** vid textfältet, välj **Låg**, öppna
   modellnamnet och välj **GPT-6.1 Sol**. Stäng dialogen med Escape.
2. Skriv **Byt cykelns namn till Blå, men ändra inte ägaren.** och välj
   **Skicka**. Släpp den kontrollerade frågan enligt förberedelsen.
   Läs **Vilken cykel?** i samtalstexten.
3. Skicka **Beskriv garaget utan att ändra.** och lämna modellsvaret
   hållet i terminalen. Skicka sedan **Förklara vem som använder cykeln,
   men ändra eller spara ingenting.** medan arbetet pågår.
4. Ladda om sidan och välj **Skriv till Skyttel**. Läs hela instruktionen
   och frågan igen. Kontrollera **Samtalet är pausat**, **Löper ut** med
   tidpunkt och modellvalet **GPT-6.1 Sol, Låg**. Det köade meddelandet
   visas ordagrant i samma samtalstext. Ingen arbetsrad ska visas.
5. Öppna **Din profil → Logga ut**. Logga in igen med **Fortsätt med
   Google → Fortsätt till Google**. Öppna textvyn och läs samma instruktion,
   fråga och pausbesked. Kör `restart` i förberedelseterminalen och invänta
   `restarted`. Ladda om sidan och läs samma innehåll igen.
6. Öppna **Visa utkastet → Visa förslaget: Lo Exempel**. Läs Person och
   Lo Exempel utan beskrivning; stäng dialogen. Flytta tangentbordsfokus
   till **Avsluta samtalet** och tryck Enter. Den tidigare instruktionen
   och frågan ska försvinna. Fokus ska gå till **Nytt samtal**.
7. Ladda om igen och öppna textvyn. Den tidigare samtalstexten ska saknas.
   Läs Lo-förslaget på samma sätt igen; det ska vara kvar osparat.

**Förväntat resultat:**

- Samtalstext, fråga, köat meddelande och eget modellval består genom
  omladdning,
  utloggning och omstart.
  Återkomsten visar pausat arbete och utgångstid, utan automatisk körning.
- Uttryckligt avslut raderar samtalet. Omladdning återställer det inte.
  Utkastet varken sparas eller kastas av avslutet. Tangentbordsfokus går
  till **Nytt samtal** när den fokuserade avslutsknappen försvinner.

### KONTEXT-25: återuppta rätt samtal på samma och annan enhet

**Syfte:** Välja ett eget bevarat samtal, läsa paus och utgångstid, och
uttryckligen fortsätta samma väntande fråga. Separata samtal och deras
modellval ska förbli åtskilda.

**Användare:** Alex i två separata webbläsarprofiler eller enheter.

**Förutsättningar:** Datorfönster med bredd 1280 px. Samma hushåll,
**Återuppta samtal**, finns i båda profilerna. Utkastet är tomt.

**Separat förberedelse:** Följ
[återuppta samtal på två enheter](conversation-preparation.md#återuppta-samtal-på-två-enheter).
Använd en ny kontrollerad installation och avsluta den efter fallet.

**Automatiskt motsvarande test:**
[conversation-resume.spec.ts](../../tests/integration/conversation-resume.spec.ts),
KONTEXT-25. Chromium använder två separata profiler, riktig server och SQLite
med kontrollerad modell och Live. Mikrofon och media är kontrollerade och
tysta; fysisk mikrofon, hört tal och skärmläsare provas separat.
Separat HTTP-underlag använder ett verkligt lagringsfel för att kontrollera
att ett okänt registrerat sparutfall behåller paus och spärr vid återupptagning.
Ett annat HTTP-underlag startar om med två separata oavslutade samtal.
Det äldre kan återupptas medan det yngre förblir pausat tills användaren
uttryckligen återupptar även det.
Om båda i stället väntar på förtydligande kan frågan i det äldre besvaras.
En väntande ändringsdel i det yngre behåller samtidigt sin spärr mot sparande.
Separat HTTP-underlag avbryter en talad förtydligandereplik efter en
verifierad deländring och startar om servern. Efter uttrycklig återupptagning
fortsätter samma replik med kvarvarande arbete utan att upprepa deländringen
eller återuppliva dess tidigare sparbegäran. En separat variant tappar
batchsvaret efter genomförandet och verifierar samma utfall efter omstart.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/conversation-resume.spec.ts",
    "caseId": "KONTEXT-25"
  },
  "reference": "Dator 1280 px i två separata Chromium-profiler, riktig server och SQLite, kontrollerad modell och Live med tyst media. Samma profil efter omladdning och en annan profil skyddar skilda vägar till samma bevarade samtal; den väntande textfrågan besvaras med röst.",
  "outcomes": [
    "Paus och utgångstid visas före uttrycklig återupptagning. Samma väntande textfråga kan besvaras med röst efter omladdning och på annan enhet.",
    "Bevarade samtal kan väljas separat utan att deras text blandas. Äldre Sol/låg ändrar inte det senaste personliga valet Terra/medium för ett nytt samtal.",
    "Efter öppning får Återuppta samtalet tangentbordsfokus. Enter återupptar samtalet."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-resume-http.test.ts",
      "title": "another device discovers separate retained conversations and opens the selected one paused without model work",
      "purpose": "Egen upptäckt och pausad öppning förblir skilda från modellarbete och behåller samtalets modellval."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-resume-http.test.ts",
      "title": "only explicit approved resume renews the retained lifetime and enables the same conversation",
      "purpose": "Endast uttrycklig återupptagning med aktuellt medgivande förnyar sju dygn; läsning gör det inte."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-resume-http.test.ts",
      "title": "explicit resume after actual restart continues the interrupted identity before its queue without duplicating conversation turns",
      "purpose": "En verklig omstart behåller uppdragens identitet och ordning utan dubbla samtalsrader."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-resume-http.test.ts",
      "title": "after actual restart the oldest retained conversation resumes while its younger conversation stays paused until explicitly resumed",
      "purpose": "Ett yngre pausat samtal blockerar inte det äldre efter omstart. Det yngre startar först efter sin egen uttryckliga återupptagning."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-resume-http.test.ts",
      "title": "after actual restart an older retained question can be answered while a younger question stays paused and blocks saving",
      "purpose": "Ett slutfört modelluppdrag med kvarvarande fråga hindrar inte svar i ett annat återupptaget samtal. En väntande ändringsdel behåller spärren mot sparande."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-resume-http.test.ts",
      "title": "a new request after reopening an active crash image waits for earlier retained work before that conversation is loaded",
      "purpose": "En aktiv databasavbild med aktuell struktur återöppnas. Senare arbete på en annan enhet får inte gå före äldre ännu oläst arbete."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-resume-http.test.ts",
      "title": "resume after actual restart preserves a verified partial batch and never renews its old save request",
      "purpose": "Verifierade deländringar upprepas inte efter omstart, och gammal sparauktoritet återupplivas inte."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-resume-http.test.ts",
      "title": "a spoken clarification resumes only unfinished work after actual restart without renewing its old save request: lostBatchReply=false",
      "purpose": "En talad replik behåller sin identitet efter egna verifierade förtydliganden och deländringar. Omstart följd av uttrycklig återupptagning fortsätter bara kvarvarande arbete utan nytt sparande."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-resume-http.test.ts",
      "title": "a spoken clarification resumes only unfinished work after actual restart without renewing its old save request: lostBatchReply=true",
      "purpose": "Efter förlorat svar från en genomförd delbatch verifierar återupptagning samma utfall. Replikens eget förtydligande slutförs utan upprepad ändring eller ny sparbegäran."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/operation-recovery-http.test.ts",
      "title": "a text request recovers its committed batch after lost MCP delivery without another model call",
      "purpose": "Paus under förlorat batchsvar följt av öppning och återupptagning kontrollerar samma batch. Ett verifierat helt färdigt uppdrag startar inget nytt modellarbete."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-resume-http.test.ts",
      "title": "explicit resume checks a registered save before continuing only its unfinished explanation: explanation=false",
      "purpose": "Ett verifierat registrerat sparande som slutför hela det ursprungliga uppdraget upprepas inte vid återupptagning."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-resume-http.test.ts",
      "title": "explicit resume checks a registered save before continuing only its unfinished explanation: explanation=true",
      "purpose": "Efter samma verifierade sparande återupptas bara den återstående förklaringen, utan nytt sparande eller nya kvitton."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/conversation-persistence-http.test.ts",
      "title": "restoration cannot return or recreate a snapshot retired during connection: another device",
      "purpose": "Två samtidiga öppningar på skilda enheter kan inte flytta över den senast öppnade anslutningen till den tidigare enheten."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/save-operation-recovery-http.test.ts",
      "title": "a lost registered save response survives conversation stop and restart with a repeatable unknown outcome",
      "purpose": "Ett verkligt lagringsfel behåller det ursprungliga sparförsöket som okänt. Återupptagning lämnar samtalet pausat och startar inget modellarbete."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/save-operation-recovery-http.test.ts",
      "title": "a lost registered save response survives conversation stop and restart with a repeatable known outcome",
      "purpose": "Återupptagning kontrollerar och slutför samma redan registrerade sparförsök med ett enda kvitto, utan nytt modellarbete."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. I första profilen: välj **Skriv till Skyttel → Nytt samtal** och
   godkänn aktuellt medgivande utan att spara det. Välj **Låg** i
   resonemangsdialogen och **GPT-6.1 Sol** i modelldialogen. Skicka
   **Beskriv garaget utan att ändra något.**. Läs **Vilket garage?**.
2. Ladda om och öppna textvyn. Läs **Samtalet är pausat** och **Löper ut**
   med tidpunkt. Välj **Återuppta samtalet** och godkänn aktuellt medgivande
   igen. Frågan ska vara kvar och meddelandefältet ska gå att använda.
3. Logga in som Alex i den andra profilen och öppna samma hushåll.
   Starta ett nytt textsamtal. Välj **Medium** och **GPT-6.1 Terra**.
   Skicka **Beskriv cykeln utan att ändra något.**. Läs
   **Det andra samtalet gäller cykeln.**.
4. Välj **Bevarade samtal** och läs utgångstiderna. Välj
   **Öppna Beskriv garaget utan att ändra något.**. Läs **Vilket garage?**
   och **GPT-6.1 Sol, Låg**. Cykelsamtalets svar ska inte ingå här.
5. Kontrollera synligt fokus på **Återuppta samtalet**. Tryck Enter, slå
   på **Prata med Skyttel** och säg **Det västra garaget.** enligt den
   kontrollerade förberedelsen. Läs **Garaget heter Västra.**.
6. Välj **Bevarade samtal → Öppna Beskriv cykeln utan att ändra något.**.
   Läs cykelsamtalets svar utan garagets nya svar. Välj **Nytt samtal**.
   Modellvalet ska vara **GPT-6.1 Terra, Medium**.
   Mikrofonen ska vara av efter bytet till det andra samtalet.

**Förväntat resultat:**

- Öppning visar det valda samtalet pausat före fortsatt arbete. Läsning
  ensam startar inget nytt modellarbete och förlänger inte livslängden.
  Uttrycklig återupptagning förnyar de sju dygnen.
- Samma väntande fråga och dess svar hör till samma samtal. Text från
  det andra samtalet blandas inte in, och ett äldre samtals val ändrar
  inte nästa nya samtals personliga modellval.
  En redan visad fråga visas inte en gång till av återupptagningen.
- Kontrollerna går att nå med tangentbord och öppning lämnar fokus på
  den meningsfulla nästa handlingen, **Återuppta samtalet**.
