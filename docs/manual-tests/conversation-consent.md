# Manuella testfall för samtalsmedgivandet

Fallen omfattar medgivanderutan vid samtalets start: när den visas, vad
**Godkänn och starta** och **Avbryt** gör, hur länge ett medgivande gäller
och hur ett sparat medgivande följer användaren mellan enheter.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

Fallen MEDGIVANDE-05 till MEDGIVANDE-11 omfattar sidan **Samtal med
Skyttel** i Inställningar: var sidan står, vad delen **Medgivande** visar
och hur medgivandet sparas och återkallas där.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Medgivandeprov
  och loggar in med Google.
- Robin Exempel är medlem i samma hushåll i MEDGIVANDE-03 och loggar in
  med Microsoft i en separat webbläsarprofil.
- Robin är medlem på samma sätt i MEDGIVANDE-05.
- Den kontrollerade miljön använder inga verkliga externa konton.

## Allmän förberedelse

1. Starta den kontrollerade
   [kostnadsmiljön](costs.md#controlled-cost-fixture). Den har två
   identiteter, automatiska textsvar och tyst taltransport. Miljön provar
   inte fysiskt ljud och lyssnar inte på din mikrofon.
2. Logga in som Alex med Google och skapa hushållet Medgivandeprov. Lämna
   kartan tom, så att kartans vägledning visas.
3. Starta en ny installation för varje fall, så att inget medgivande är
   sparat när fallet börjar. Avsluta med `quit`.
4. Kör även med tangentbord, skärmläsare och pekskärm på fysisk telefon
   och dator. Anteckna hjälpmedel och plattformar separat från
   Chromium-emulering.

## Medgivanderutan

### MEDGIVANDE-01: samtalsknapparna visar medgivanderutan och Avbryt startar inget

**Syfte:** Visa samma medgivanderuta från varje ingång till samtalet och
lämna allt orört när användaren avbryter.

**Användare:** Alex.

**Förutsättningar:** Kartan är tom. Inget medgivande är sparat eller
godkänt under besöket.

**Integrationstest:**
[conversation-consent.spec.ts](../../tests/integration/conversation-consent.spec.ts),
testfallet “MEDGIVANDE-01: samtalsknapparna visar medgivanderutan och
Avbryt startar inget”.

**Steg:**

1. Välj **Prata med Skyttel** i **Kartans verktyg**. Läs medgivanderutan:
   rubriken **Samtal med Skyttel**, medgivandetexten i tre stycken,
   kryssrutan **Fråga inte igen för det här hushållet**, raden
   **Du kan återkalla det i Inställningar.** samt **Godkänn och starta**
   och **Avbryt**.
2. Markera kryssrutan och välj **Avbryt**. Kontrollera att fokus står på
   **Prata med Skyttel** och att varken samtal eller mikrofon har startat.
3. Välj **Samtal och text**. Kontrollera att kryssrutan är omarkerad igen.
   Stäng rutan med Escape.
4. Upprepa med **Tala** och **Skriv** i kartans vägledning. Vägledningen
   ska ligga kvar när rutan stängs.
5. Gå med Tab från sidans början till snabblänken **Till samtal och text**
   och välj den med Enter. Stäng rutan.

**Förväntat resultat:**

- Varje ingång visar samma ruta. Kryssrutan är omarkerad varje gång, och
  raden om återkallande är ren text utan länk. Rutan hänvisar inte till
  **Information och hjälp**.
- Rutan är en dialog med namnet **Samtal med Skyttel**. Resten av sidan
  går inte att använda medan den visas.
- **Avbryt** och Escape startar ingenting och sparar inget medgivande.
  Fokus återgår till den knapp som valdes. Vägledningen ligger kvar.

### MEDGIVANDE-02: vald knapp avgör röst eller text och medgivandet gäller besöket

**Syfte:** Starta samtalet på det sätt som den valda knappen anger och
låta ett osparat medgivande gälla tills kartan lämnas eller sidan laddas om.

**Användare:** Alex.

**Förutsättningar:** Inget medgivande är sparat eller godkänt under besöket.

**Integrationstest:**
[conversation-consent.spec.ts](../../tests/integration/conversation-consent.spec.ts),
testfallet “MEDGIVANDE-02: vald knapp avgör röst eller text och
medgivandet gäller besöket”.

**Steg:**

1. Välj **Prata med Skyttel** och **Godkänn och starta** utan att markera
   kryssrutan. Kontrollera **Mikrofonen är på** och att samtalet är öppet.
2. Välj **Avsluta samtalet** under **Samtalskontroller**. Välj
   **Samtal och text**. Samtalet ska starta direkt, med mikrofonen av.
3. Avsluta samtalet. Öppna **Inställningar** och välj
   **Tillbaka till kartan**. Välj **Samtal och text**; samtalet ska starta
   direkt.
4. Ladda om sidan. Välj **Samtal och text**. Medgivanderutan ska visas
   igen, med omarkerad kryssruta. Välj **Godkänn och starta**.

**Förväntat resultat:**

- Röstknappen startar samtalet med mikrofonen. Textknappen startar
  samtalet utan att begära mikrofonåtkomst.
- Ett nytt samtal under samma besök frågar inte igen, inte heller efter
  ett besök i Inställningar.
- Efter omladdningen frågar Skyttel igen. Inget medgivande har sparats.

### MEDGIVANDE-03: sparat medgivande följer användaren men inte andra medlemmar

**Syfte:** Spara medgivandet per Skyttel-användare och hushåll, så att
samtalet startar direkt på användarens alla enheter men inte för andra.

**Användare:** Alex och Robin.

**Förutsättningar:** Kör `identity robin` i startterminalen, logga in som
Robin med Microsoft i en separat profil och bjud in Robins ID från Alex
profil. Acceptera som Robin. Inget medgivande är sparat.

**Integrationstest:**
[conversation-consent.spec.ts](../../tests/integration/conversation-consent.spec.ts),
testfallet “MEDGIVANDE-03: sparat medgivande följer användaren men inte
andra medlemmar”.

**Steg:**

1. Som Alex, välj **Samtal och text**, markera
   **Fråga inte igen för det här hushållet** och välj **Godkänn och starta**.
2. Ladda om sidan och välj **Prata med Skyttel**. Samtalet ska starta
   direkt med mikrofonen.
3. Kör `identity alex`. Logga in som Alex i ytterligare en webbläsarprofil,
   som en andra enhet. Välj **Samtal och text**; samtalet ska starta direkt.
4. Som Robin, välj **Samtal och text**. Medgivanderutan ska visas, med
   omarkerad kryssruta. Välj **Avbryt**.

**Förväntat resultat:**

- Alex sparade medgivande gäller efter omladdning och på den andra
  enheten, för både röst och text.
- Robin har inget medgivande i hushållet och får frågan. Robins avbrott
  ändrar inte Alex medgivande.

### MEDGIVANDE-04: medgivanderutan fungerar med tangentbord och pekskärm

**Syfte:** Använda medgivanderutan utan mus och på små skärmar.

**Användare:** Alex.

**Förutsättningar:** Inget medgivande är sparat eller godkänt under besöket.

**Integrationstest:**
[conversation-consent.spec.ts](../../tests/integration/conversation-consent.spec.ts),
testfallet “MEDGIVANDE-04: medgivanderutan fungerar med tangentbord och
pekskärm”.

**Steg:**

1. På dator, välj en samtalsknapp i verktygsraden. Rutan ska öppnas intill
   den valda knappen. Stäng den.
2. Minska fönstret till telefonbredd, där verktygsraden ligger överst.
   Välj **Samtal och text**. Rutan ska öppnas under verktygsraden och
   rymmas på skärmen utan rullning i sidled. Stäng den.
3. Återställ fönstret. Flytta fokus till **Samtal och text** med Tab och
   tryck Enter. Gå med Tab till kryssrutan och markera den med
   mellanslag. Gå vidare till **Godkänn och starta** och tryck Enter.
4. På en pekskärm med en annan användare, eller i en ny installation, tryck
   på **Samtal och text** och sedan på **Godkänn och starta**.
5. Upprepa steg 3 med skärmläsare. Lyssna efter dialogens namn,
   medgivandetexten, kryssrutans namn och raden om återkallande.

**Förväntat resultat:**

- Verktygsradens plats avgör var rutan öppnas, inte om enheten är mobil.
  I ett lågt fönster nås alla kontroller genom att rulla i rutan.
- Fokus står på rubriken när rutan öppnas och syns på varje kontroll.
  Tangentordningen är kryssrutan, **Godkänn och starta** och **Avbryt**.
- Kryssrutan och knapparna går att träffa med ett finger. Samtalet
  startar efter godkännandet.

## Sidan Samtal med Skyttel

Sidan öppnas med **Inställningar** i verktygsraden och sedan **Samtal med
Skyttel**. Exemplen nedan använder hushållet Medgivandeprov.

### MEDGIVANDE-05: sidan Samtal med Skyttel visar medgivandet för alla medlemmar

**Syfte:** Hitta sidan på samma plats i menyn och på översikten, som
administratör och som medlem, och läsa vad medgivandet gäller.

**Användare:** Alex och Robin.

**Förutsättningar:** Robin är medlem enligt förutsättningarna i
MEDGIVANDE-03. Inget medgivande är sparat eller godkänt under besöket.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-05: sidan Samtal med Skyttel visar medgivandet för
alla medlemmar”.

**Steg:**

1. Som Alex, öppna **Inställningar**. Läs gruppen **Hushållets karta** på
   översikten och i menyn till vänster.
2. Välj **Samtal med Skyttel**. Läs delen **Medgivande**.
3. Upprepa steg 1 och 2 som Robin.

**Förväntat resultat:**

- **Samtal med Skyttel** står efter **Rymdkartan** och före
  **Typer och egna fält**, både på översikten och i menyn. Översikten
  beskriver sidan med **Ditt medgivande, utkastet och textvyns bredd.**
- Sidan öppnas med fokus på rubriken **Samtal med Skyttel**, och menyn
  markerar sidan.
- Under **Medgivande** står raden
  **Gäller dig i hushållet Medgivandeprov.**, medgivandetexten i tre
  stycken med samma ordalydelse som i medgivanderutan, meningen
  **Ett sparat medgivande gäller alla dina samtal i hushållet
  Medgivandeprov tills du återkallar det.**, statusraden
  **Inget medgivande är sparat.** och knappen **Spara medgivandet**.
- Sidan har ingen knapp som sparar hela sidan. Robin ser samma sida som
  Alex, utan gruppen **Administration**.

### MEDGIVANDE-06: Spara medgivandet sparar direkt utan att starta ett samtal

**Syfte:** Spara medgivandet från Inställningar, så att samtalet sedan
startar utan medgivanderutan, på användarens alla enheter.

**Användare:** Alex.

**Förutsättningar:** Inget medgivande är sparat eller godkänt under besöket.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-06: Spara medgivandet sparar direkt utan att starta
ett samtal”.

**Steg:**

1. Öppna sidan **Samtal med Skyttel** och välj **Spara medgivandet**.
2. Läs texten vid knappen och statusraden. Kontrollera var fokus står.
3. Välj **Tillbaka till kartan** och sedan **Prata med Skyttel**.
4. Logga in som Alex i ytterligare en webbläsarprofil, som en andra enhet,
   och öppna sidan där.

**Förväntat resultat:**

- Texten **Medgivandet är sparat** visas vid knappen. Statusraden visar
  **Sparat den** följt av dagens datum, till exempel
  **Sparat den 1 oktober 2026.**
- Knappen heter nu **Återkalla medgivandet** och har kvar fokus. Varken
  samtal eller mikrofon startar när medgivandet sparas.
- **Prata med Skyttel** startar samtalet direkt, utan medgivanderutan.
- Den andra enheten visar samma statusrad och **Återkalla medgivandet**.

### MEDGIVANDE-07: Återkalla medgivandet gäller genast och Skyttel frågar igen

**Syfte:** Återkalla ett sparat medgivande utan pågående samtal, så att
Skyttel frågar på nytt före nästa samtal.

**Användare:** Alex.

**Förutsättningar:** Alex har sparat medgivandet enligt steg 1 i
MEDGIVANDE-06 och sedan laddat om sidan, så att inget samtal pågår.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-07: Återkalla medgivandet gäller genast och Skyttel
frågar igen”.

**Steg:**

1. Öppna sidan **Samtal med Skyttel** och välj **Återkalla medgivandet**.
2. Läs texten vid knappen och statusraden. Ladda om sidan och läs
   statusraden igen.
3. Välj **Tillbaka till kartan**. Välj **Prata med Skyttel** och därefter
   verktygsradens andra samtalsknapp. Välj **Avbryt** i rutan varje gång.

**Förväntat resultat:**

- Texten **Medgivandet är återkallat** visas vid knappen, som nu heter
  **Spara medgivandet** och har kvar fokus. Statusraden visar
  **Inget medgivande är sparat.**, även efter omladdningen.
- Båda samtalsknapparna visar medgivanderutan. Varken samtal eller
  mikrofon startar.
- Integrationstestet kontrollerar dessutom att servern vägrar att starta
  ett samtal för användaren och anger skälet.

### MEDGIVANDE-08: medgivande för besöket går att återkalla och att spara

**Syfte:** Se att ett medgivande som bara gäller besöket går att återkalla
och att spara, och att sparandet inte stör ett pågående samtal.

**Användare:** Alex.

**Förutsättningar:** Inget medgivande är sparat eller godkänt under besöket.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-08: medgivande för besöket går att återkalla och att
spara”.

**Steg:**

1. Välj **Prata med Skyttel** och **Godkänn och starta** utan att markera
   kryssrutan. Vänta tills mikrofonen är på.
2. Öppna sidan **Samtal med Skyttel**. Läs statusraden och knapparna.
3. Välj **Återkalla medgivandet**. Läs statusraden och kontrollera
   mikrofonen.
4. Välj **Tillbaka till kartan** och **Prata med Skyttel**. Välj
   **Godkänn och starta** i medgivanderutan, utan att markera kryssrutan.
5. Öppna sidan igen och välj **Spara medgivandet**.

**Förväntat resultat:**

- I steg 2 visar statusraden
  **Du har godkänt för det här besöket. Inget medgivande är sparat.**
  Både **Spara medgivandet** och **Återkalla medgivandet** visas.
- Efter återkallandet visar statusraden **Inget medgivande är sparat.**
  Bara **Spara medgivandet** finns kvar, och den har fokus. Samtalet är
  avslutat och mikrofonen är av.
- I steg 4 visas medgivanderutan igen, med omarkerad kryssruta.
- Efter **Spara medgivandet** visar statusraden **Sparat den** med dagens
  datum, och knappen heter **Återkalla medgivandet**. Samtalet pågår som
  förut, med mikrofonen på.

### MEDGIVANDE-09: sidan visas och återkallar när samtalet inte är tillgängligt

**Syfte:** Använda sidan när servern inte erbjuder samtalet.

**Användare:** Alex.

**Förutsättningar:** Använd en
[separat provdatabas](../development/devcontainer.md#disposable-local-database)
i stället för kostnadsmiljön. Starta den med en påhittad `OPENAI_API_KEY`
i den privata miljöfilen, logga in och spara medgivandet på sidan. Ta
sedan bort nyckeln ur miljöfilen och starta om med samma databas. Utan
nyckeln erbjuder servern inte samtalet.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-09: sidan visas och återkallar när samtalet inte är
tillgängligt”.

**Steg:**

1. Öppna sidan **Samtal med Skyttel**. Läs texten överst, statusraden och
   knapparna.
2. Välj **Återkalla medgivandet**.

**Förväntat resultat:**

- Sidan visar **Samtal med Skyttel är inte tillgängligt just nu.**
  tillsammans med medgivandetexten och statusraden **Sparat den** med
  datum. Bara **Återkalla medgivandet** visas.
- Efter återkallandet visar statusraden **Inget medgivande är sparat.**
  **Spara medgivandet** visas inte så länge samtalet inte är tillgängligt.

### MEDGIVANDE-10: ett misslyckat sparande sägs och knappen behåller sitt läge

**Syfte:** Få veta när medgivandet inte kunde sparas eller återkallas, och
se att sidan då visar det läge som fortfarande gäller.

**Användare:** Alex.

**Förutsättningar:** Inget medgivande är sparat eller godkänt under besöket.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-10: ett misslyckat sparande sägs och knappen behåller
sitt läge”.

**Steg:**

1. Öppna sidan **Samtal med Skyttel**. Bryt nätverket i webbläsarens
   utvecklarverktyg och välj **Spara medgivandet**.
2. Återställ nätverket och välj **Spara medgivandet** igen.
3. Bryt nätverket och välj **Återkalla medgivandet**. Återställ nätverket
   och välj knappen igen.

**Förväntat resultat:**

- I steg 1 visas **Medgivandet kunde inte sparas. Försök igen.** vid
  knappen. Statusraden visar fortfarande **Inget medgivande är sparat.**,
  och **Spara medgivandet** har kvar sitt namn och fokus.
- I steg 2 sparas medgivandet, och texten vid knappen säger det.
- I steg 3 visas **Medgivandet kunde inte återkallas. Försök igen.**
  Statusraden visar fortfarande **Sparat den** med datum, och
  **Återkalla medgivandet** har kvar sitt namn och fokus. Med nätverket
  tillbaka återkallas medgivandet.

### MEDGIVANDE-11: sidan sköts med tangentbord och pekskärm i båda teman

**Syfte:** Använda delen **Medgivande** utan mus, på små skärmar och i
ljust och mörkt tema.

**Användare:** Alex.

**Förutsättningar:** Inget medgivande är sparat eller godkänt under besöket.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-11: sidan sköts med tangentbord och pekskärm i båda
teman”.

**Steg:**

1. Öppna sidan **Samtal med Skyttel**. Tryck Tab från sidans rubrik tills
   **Spara medgivandet** har fokus, och tryck Enter. Tryck sedan mellanslag
   på **Återkalla medgivandet**.
2. Spara medgivandet igen. Växla mellan ljust och mörkt tema med
   temaknappen och läs delen i båda.
3. På en pekskärm med telefonbredd, med en annan användare eller i en ny
   installation, öppna sidan och tryck på **Spara medgivandet** och sedan
   på **Återkalla medgivandet**.
4. Upprepa steg 1 med skärmläsare. Lyssna efter knappens namn före och
   efter varje tryck och efter texten vid knappen.

**Förväntat resultat:**

- Fokus syns på knappen och står kvar på den när den byter namn. Texten
  vid knappen säger resultatet efter varje tryck.
- Rubrik, texter, statusrad, knappar och texten vid knappen går att läsa
  i båda teman.
- På telefonbredd ryms delen utan rullning i sidled. Knappen går att
  träffa med ett finger, och texten vid knappen syns utan att rulla.
- Skärmläsaren läser upp texten vid knappen utan att fokus flyttas.

## Bedömning och återstående manuella prov

Flödet är utformat mot WCAG 2.2 nivå AA. Kraven nedan är designmål, och
automationen visar bara det som anges. Ingen skärmläsare och ingen fysisk
enhet är provad, och fullständig överensstämmelse intygas inte.

<!-- markdownlint-disable MD013 -->
| Kriterium | Utformning | Automatisk kontroll | Återstår att prova manuellt |
| --- | --- | --- | --- |
| 1.3.1, 4.1.2 Namn, roll och relationer | Rutan är en modal dialog med rubriken som namn och medgivandetexten som beskrivning. Raden om återkallande beskriver kryssrutan. | Namn, beskrivning, roller och modalt läge. | Uppläsning med NVDA och VoiceOver. |
| 1.4.3, 1.4.11 Kontrast | Rutan använder kartans färger för text, ytor och fokus i ljust och mörkt tema. | Textens kontrast mot ytan, minst 4,5:1 i båda teman. | Kontrast för kryssrutan och fokusramen. |
| 1.4.4, 1.4.10 Förstoring och omflöde | Rutan är högst 380 px bred, ryms på 320 px och rullar inuti när fönstret är lågt. | Placering inom skärmen på 320 och 390 px samt i ett 320 px högt fönster, utan rullning i sidled. | Verklig webbläsarzoom och textförstoring. |
| 2.1.1, 2.1.2 Tangentbord | Alla kontroller nås med Tab. Escape avbryter. | Öppna, markera, godkänna och avbryta med tangentbord. | Hjälpmedlens egna tangentkommandon. |
| 2.4.3, 2.4.7, 2.4.11 Fokus | Fokus går till rubriken, följer läsordningen och återgår till den valda knappen. Rutan täcker inte den kontroll som har fokus. | Fokus på rubriken, tangentordning, synlig fokusram och återgång till vald knapp. | Fokusordning med skärmläsare. |
| 2.5.8 Pekmål | Kryssrutans etikett och knapparna är minst 44 px höga. | Mått på etikett och knappar. | Träffsäkerhet på fysisk pekskärm. |
| 3.2.2, 3.3.2 Inmatning och etiketter | Kryssrutan ändrar ingenting förrän användaren godkänner. Alla kontroller har synliga namn. | Avbruten ruta sparar inget. | – |
| 4.1.3 Statusmeddelanden | Ett misslyckat sparande av medgivandet står som en feltext i rutan, som hjälpmedel läser upp. | Feltextens ordalydelse och roll i klientens enhetstester. | Uppläsning av feltexten. |
<!-- markdownlint-enable MD013 -->

Ett sparat medgivande för en äldre version av medgivandetexten ger
medgivanderutan igen. Det provas i serverns och klientens enhetstester,
eftersom texten bara har en version.

### Delen Medgivande på sidan Samtal med Skyttel

Samma förbehåll gäller sidan: kraven är designmål, och ingen skärmläsare
och ingen fysisk enhet är provad.

<!-- markdownlint-disable MD013 -->
| Kriterium | Utformning | Automatisk kontroll | Återstår att prova manuellt |
| --- | --- | --- | --- |
| 1.3.1, 2.4.6, 4.1.2 Namn, roll och rubriker | Delen är ett område med rubriken **Medgivande** som namn, under sidans rubrik. Knapparnas synliga namn säger vad de gör. En knapp som väntar på servern är märkt som inte tillgänglig och behåller fokus. | Områdets namn, rubriknivåer och knapparnas namn i varje läge. | Uppläsning med NVDA och VoiceOver. |
| 1.4.1, 3.3.1 Färg och fel | Ett misslyckat sparande eller återkallande sägs i text vid knappen, inte med färg. | Feltexternas ordalydelse och att läget är oförändrat. | – |
| 1.4.3 Kontrast | Delen använder Inställningars färger för text, ytor och knappar i ljust och mörkt tema. | Kontrast mot ytan, minst 4,5:1 i båda teman, för rubrik, texter, statusrad, knappar och texten vid knappen. | Kontrast för fokusramen. |
| 1.4.4, 1.4.10 Förstoring och omflöde | Texten bryts efter sidans bredd, och knapparna radbryts. | Ingen rullning i sidled på 390 och 320 px. | Verklig webbläsarzoom och textförstoring. |
| 2.1.1 Tangentbord | Knapparna nås med Tab och används med Enter och mellanslag. | Spara och återkalla med enbart tangentbord. | Hjälpmedlens egna tangentkommandon. |
| 2.4.3, 2.4.7, 3.2.2 Fokus | Fokus går till sidans rubrik när sidan öppnas. Det står kvar på knappen när den byter namn och går till den knapp som finns kvar när den tryckta försvinner. Inget annat flyttar fokus. | Fokus efter varje åtgärd och synlig fokusram. | Fokusordning med skärmläsare. |
| 2.5.8 Pekmål | Knapparna är minst 44 px höga. | Mått på knappen på 390 och 320 px. | Träffsäkerhet på fysisk pekskärm. |
| 4.1.3 Statusmeddelanden | Texten vid knappen är ett statusområde som finns från början och läses upp utan att fokus flyttas. Den töms före varje åtgärd, så att samma besked läses upp igen. | Områdets roll, att det finns före första åtgärden och textens ordalydelse. | Uppläsning av texten, även när samma besked upprepas. |
<!-- markdownlint-enable MD013 -->

Statusraden **Medgivandetexten har ändrats. Inget medgivande är sparat.**
går inte att nå för hand, eftersom texten bara har en version.
Integrationstestet “a consent that is saved for another version of the
consent text is told as changed and saved anew” provar den med två
installationer på samma databas.
