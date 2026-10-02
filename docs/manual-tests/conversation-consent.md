# Manuella testfall för samtalsmedgivandet

Fallen omfattar medgivanderutan vid samtalets start: när den visas, vad
**Godkänn och starta** och **Avbryt** gör, hur länge ett medgivande gäller
och hur ett sparat medgivande följer användaren mellan enheter.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Medgivandeprov
  och loggar in med Google.
- Robin Exempel är medlem i samma hushåll i MEDGIVANDE-03 och loggar in
  med Microsoft i en separat webbläsarprofil.
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
