# Manuella testfall för utkastet i samtalet

Fallen omfattar utkasttabellen i textvyn, det personliga valet på sidan
**Samtal med Skyttel** och sparandets plats i **Rapporter → Ändringshistorik**.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.
Mått och placering kontrolleras också automatiskt i Chromium.

## Konfigurerade användare

- Alex Exempel loggar in med Google i den kontrollerade installationen
  och är administratör i hushållet Utkastprov.
- Robin Exempel loggar in med Microsoft i en separat webbläsarprofil och
  bjuds in till Utkastprov som medlem i SAMTALSUTKAST-02.
- Ytterligare en webbläsarprofil med Alex inloggning motsvarar en andra
  enhet. Installationen använder inga verkliga externa konton.

## Allmän förberedelse

1. För SAMTALSUTKAST-02, starta
   [den kontrollerade kostnadsmiljön](costs.md#controlled-cost-fixture).
   Följ dess privata portvidarebefordran. Logga in som Alex och skapa
   hushållet Utkastprov. Skapa personen **Lo Exempel** med tom beskrivning
   genom **Nytt objekt** och välj **Lägg i utkastet och stäng**.
   Lämna förslaget osparat.
2. För SAMTALSUTKAST-01, använd dess exakta
   [läsförberedelse](conversation-review-preparation.md).
   För SAMTALSUTKAST-03 och SAMTALSUTKAST-06, använd i stället
   [den kontrollerade textmiljön](text-assistant.md#controlled-text-fixture).
   Skapa samma hushåll men lämna kartan och utkastet tomma.
3. Använd en ny installation för varje fall. Avsluta med `quit` och
   kontrollera att den tillfälliga katalogen tas bort. Använd endast de
   påhittade uppgifterna här. SAMTALSUTKAST-05 har en egen miljö nedan.

## Utkastet i textvyn

### SAMTALSUTKAST-01: utkasttabellen visar alla slags ändringar med kartans symboler

**Syfte:** Läsa osparade ändringar i en tabell utan att ändra eller spara dem.

**Användare:** Alex.

**Förutsättningar:** Åtta exakta ändringar enligt
[separat körbar läsförberedelse](conversation-review-preparation.md).

**Integrationstest:**
[conversation-draft.spec.ts](../../tests/integration/conversation-draft.spec.ts),
testfallet “SAMTALSUTKAST-01: utkasttabellen visar alla slags ändringar med
kartans symboler”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-draft.spec.ts",
    "caseId": "SAMTALSUTKAST-01"
  },
  "reference": "Dator; hela serverstödda utkastet och det angivna personliga valet/felutfallet.",
  "outcomes": [
    "Läsa osparade ändringar i en tabell utan att ändra eller spara dem."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Rapporter → Ändringshistorik → Visa ändringarna** före samtalet.
   Läs Kortets sparade **Sista fyra: 1111 (Text)**. Välj **Tillbaka till arbetet**.
2. Välj **Skriv till Skyttel → Nytt samtal**, godkänn och läs
   **Visa utkastet (8)**. Öppna utkastet och läs samtliga åtta rader.
   Kontrollera **Namn: Lo Exempel → Lo Rättad**, Kim **Tas bort**, nytt
   objekt, **Sista fyra: 1111 (Text) → Sista fyra: 2222 (Text)**,
   gammal/ny inloggningsadress,
   **Lo Rättad → Betalar → Kortet**, Provtyp och Förvaras.
3. Läs kolumnerna Symbol, Namn, Typ och Vad som ändras. Penna, kryss och
   plus har textalternativen Ändra, Ta bort och Lägg till. Namn och typer
   går att läsa utan bokstavskolumner. Inget sparas genom läsningen.
4. Dölj utkastet, stäng och öppna textvyn och kontrollera att det fortfarande
   är hopfällt. Öppna det och välj **Nytt samtal**. Läs det hopfällda läget.
5. Öppna samma baslinjesparande i Rapporter igen. Välj **Visa ändringarna**
   om uppgifterna är hopfällda. Läs fortfarande
   **Sista fyra: 1111 (Text)**. Det föreslagna 2222 hör till utkastet, inte kvittot.

**Förväntat resultat:**

- Knappen står ovanför samtalstexten, anger åtta osparade ändringar och
  visar en pil åt öppningsriktningen. Den heter **Dölj utkastet** när
  tabellen visas. Tangentbord och skärmläsare når knappen och dess läge.
- Tabellen har kolumnerna Symbol, Namn, Typ och Vad som ändras, en rad
  per ändring. Penna, kryss och plus motsvarar kartans symboler och har
  textalternativen Ändra, Ta bort och Lägg till. Rättelsen visar
  **Namn: Lo Exempel → Lo Rättad**. Sambandets ändring visar den gamla
  och nya e-postadressen utan att upprepa hela sambandets namn.
- På dator börjar utkastet vid panelens överkant med rubriken **Utkast**,
  till vänster om samtalsrubriken och samtalstexten. Namn och typer går
  att läsa utan att enskilda ord bryts till bokstavskolumner.
  Inget sparas genom att läsa tabellen.
- Efter **Nytt samtal** är utkastet hopfällt enligt grundvalet; samma
  osparade ändringar ligger kvar.

### SAMTALSUTKAST-02: valet följer användaren mellan hushåll och enheter

**Syfte:** Spara valet för Alex på alla enheter och hålla Robins val skilt.

**Användare:** Alex och Robin.

**Förutsättningar:** Lo-förslaget finns. Operatören följer
[den separata förberedelsen för två hushåll och identiteter](text-conversation-preparation.md#personligt-utkastval).

**Integrationstest:**
[conversation-draft.spec.ts](../../tests/integration/conversation-draft.spec.ts),
testfallet “SAMTALSUTKAST-02: valet följer användaren mellan hushåll och
enheter”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-draft.spec.ts",
    "caseId": "SAMTALSUTKAST-02"
  },
  "reference": "Dator; hela serverstödda utkastet och det angivna personliga valet/felutfallet.",
  "outcomes": [
    "Spara valet för Alex på alla enheter och hålla Robins val skilt."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Inställningar**, **Samtal med Skyttel** och delen **Utkastet**.
   Markera **Visa utkastet när ett samtal börjar**. Läs återkopplingen.
2. Återgå till kartan och starta med text. Dölj utkastet och välj
   **Nytt samtal**. Öppna **Visa förslaget: Lo Exempel**, läs Person och
   kontrollera att ingen egenskap Beskrivning finns. Stäng dialogen.
   Välj **Spara hela utkastet** i utkastet. Vänta tills sparandet är klart,
   återgå till textvyn och välj **Nytt samtal**. Öppna det tomma utkastet.
3. Logga in som Alex i den andra webbläsarprofilen. Öppna den utskrivna
   adressen följd av `/households/draft-other-household`. Öppna samma
   inställning. Avmarkera den där, ladda om Alex första sida och läs valet.
4. Operatören väljer Robin enligt förberedelsen. Logga in med Microsoft i
   Robins profil och kopiera användar-ID från **Din profil**. Bjud in
   Robin från Alex **Administrera tillgång**; Robin accepterar i sin profil.
   Operatören återgår till Alex. Markera Alex val igen. Kontrollera Robins val.
5. Operatören startar om samma installation enligt förberedelsen.
   Ladda om Alex sida och kontrollera valet.

**Förväntat resultat:**

- Kryssrutan är omarkerad från början. Raden säger **Gäller dig i alla
  dina hushåll.** Hjälptexten säger **Ett tomt utkast visas när Skyttel
  föreslår den första ändringen.** Valet sparas direkt med **Valet är sparat**.
- Ett befintligt utkast är utfällt vid start och efter **Nytt samtal**.
  **Dölj utkastet** ändrar bara det pågående samtalet, inte det sparade valet.
  Ett tomt utkast börjar hopfällt; när det öppnas står **Utkastet är tomt.**
- Alex val följer mellan båda hushållen, båda webbläsarprofilerna och efter
  serverns omstart. Robin har fortfarande det omarkerade grundvalet.

### SAMTALSUTKAST-03: första förslaget öppnar utkastet på mobil enhet

**Syfte:** Visa det första förslaget utan att ta bort samtalet på en smal skärm.

**Användare:** Alex.

**Förutsättningar:** Textmiljön från förberedelsen har ett tomt utkast.
Använd ett datorfönster 390 × 844 CSS-pixlar.

**Integrationstest:**
[conversation-draft.spec.ts](../../tests/integration/conversation-draft.spec.ts),
testfallet “SAMTALSUTKAST-03: första förslaget öppnar utkastet på mobil enhet”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-draft.spec.ts",
    "caseId": "SAMTALSUTKAST-03"
  },
  "reference": "390 × 844, smal dator; första förslaget öppnar bordet utan sidöverflöde.",
  "outcomes": [
    "Visa det första förslaget utan att ta bort samtalet på en smal skärm."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Markera utkastvalet i Inställningar, återgå och starta med text.
2. Skriv **Lägg till Lo.** Operatören levererar det första förslaget enligt
   [förberedelsen](text-conversation-preparation.md#första-förslaget).
3. Läs **Lo Exempel** i utkastet och svaret **Lo ligger i utkastet.** i
   samtalet. Öppna **Visa förslaget: Lo Exempel**, läs **Person** och
   kontrollera att ingen egenskap Beskrivning finns. Stäng dialogen.
4. Läs placeringen och fortsätt med samma samtal. Bred emulerad pekare
   har sitt eget fall nedan.

**Förväntat resultat:**

- Det tomma utkastet börjar hopfällt trots det markerade valet. Det första
  förslaget öppnar tabellen och ökar antalet på knappen till ett.
- Utkastet står mellan knappen och samtalstexten på mobil enhet och smal
  skärm, på denna smala datorreferens. Tabellen och samtalstexten går att läsa
  med tangentbord och skärmläsare. Sidan kräver ingen vågrät rullning.

### SAMTALSUTKAST-05: utkastvalet fungerar utan tillgängligt samtal

**Syfte:** Ändra personliga val utan tillgängligt samtal och få begriplig
felåterkoppling.

**Användare:** Alex.

**Separat förberedelse:** Operatören bygger med `npm run build` och startar
denna tillfälliga installation utan samtalsleverantör. Vidarebefordra
den utskrivna porten privat, logga in med Google och skapa Utkastprov.

<!-- markdownlint-disable MD013 -->
```sh
npm run test:env -- node --import tsx --input-type=module <<'JS'
import { createInstallation } from './tests/support/installation.ts';
const app = await createInstallation();
console.log(app.origin, app.directory);
process.stdin.resume();
process.once('SIGINT', async () => { await app.close(); process.exit(); });
JS
```
<!-- markdownlint-enable MD013 -->

Före kryssrutan i UI-steg 2 sätter operatören webbläsarens nätverk till
Offline i utvecklingsverktygen och bekräftar det. Detta provar ett fel
vid sparandet av det personliga valet, inte ett okänt sparande av kartan.
Efter användarens fel- och fokusläsning, före kryssrutan i steg 3,
återställer operatören nätverket till Online och bekräftar det.
Först efter sista synliga **Valet är sparat** avslutar operatören
installationen med Ctrl+C och kontrollerar att provkatalogen försvinner.
Återställ även nätverket vid avslut om fallet avbryts.

**Integrationstest:**
[conversation-draft.spec.ts](../../tests/integration/conversation-draft.spec.ts),
testfallet “SAMTALSUTKAST-05: utkastvalet fungerar utan tillgängligt samtal”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-draft.spec.ts",
    "caseId": "SAMTALSUTKAST-05"
  },
  "reference": "Dator; hela serverstödda utkastet och det angivna personliga valet/felutfallet.",
  "outcomes": [
    "Ändra personliga val utan tillgängligt samtal och få begriplig felåterkoppling."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna sidan **Samtal med Skyttel**. Läs att samtalet inte är tillgängligt.
2. Be operatören förbereda anslutningsfelet och invänta bekräftelse.
   Markera utkastvalet. Läs återkopplingen och kontrollera fokus.
3. Be operatören återställa anslutningen och invänta bekräftelse.
   Markera kryssrutan igen och läs **Valet är sparat**.

**Förväntat resultat:**

- Valet går att ändra även utan tillgängligt samtal. Efter nätfelet står
  **Valet kunde inte sparas. Försök igen.** Kryssrutan återgår till det
  sparade valet och behåller fokus. Nästa försök visar **Valet är sparat**.

### SAMTALSUTKAST-06: första förslaget öppnar utkastet på bred pekskärm

**Syfte:** Skydda mobil utkastplacering på en bred emulerad pekare.

**Användare:** Alex.

**Förutsättningar:** Samma nya tomma installation som SAMTALSUTKAST-03,
med 820 × 1180 CSS-pixlar och emulerad pekare. Fysisk enhet har separat prov.

**Integrationstest:**
[conversation-draft.spec.ts](../../tests/integration/conversation-draft.spec.ts),
SAMTALSUTKAST-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/conversation-draft.spec.ts",
    "caseId": "SAMTALSUTKAST-06"
  },
  "reference": "820 × 1180, emulerad bred pekare; mobilens utkastplacering trots sidofält.",
  "outcomes": [
    "Första förslaget öppnar utkastet mellan knappen och samtalstexten utan sidöverflöde."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför SAMTALSUTKAST-03:s steg 1–4 **en gång** med denna konfiguration.
   Under steg 4 läses utkastet mellan knappen och samtalstexten, även när
   textvyn är ett sidofält. Ingen horisontell sidrullning behövs.

**Förväntat resultat:**

- Det tomma utkastet börjar hopfällt; första förslaget öppnar hela listan.
- Mobilens placering bevaras på bred emulerad pekare.

## Pensionerat ID

SAMTALSUTKAST-04 får aldrig återanvändas. Dess synliga sparidentifierare
är överförd till TEXT-04 med faktiskt tappat svar, omstart, ett enda sparat
objekt/försök och utökad läsbar Rapporter-historik. Separat API-förberedd
historiköppning upphör efter demonstrerad överföring.

## Tillgänglighetsbedömning

Designmålen omfattar WCAG 2.2 AA: semantiska tabellrubriker och samband
(1.3.1), textalternativ till symboler (1.1.1), läsordning (1.3.2), omflöde
(1.4.10), tangentbord (2.1.1), synligt fokus och pekmål (2.4.7, 2.5.8),
begripliga kontrollnamn (2.5.3, 4.1.2) och sparåterkoppling (4.1.3).
Automatiska tester kontrollerar tabellens struktur, öppet/stängt läge,
fokus efter sparfel, mått och omflöde. De bevisar inte full överensstämmelse.
Kontrollera läsordning, tabellnavigation, uppläsning en gång, kontrast,
förstoring och verkliga pekmål med NVDA och VoiceOver på målplattformarna;
redovisa dessa mänskliga kontroller separat.
