# Manuella testfall för utkastet i samtalet

Fallen omfattar utkasttabellen i textvyn, det personliga valet på sidan
**Samtal med Skyttel** och kvittots plats i **Utkast och historik**.
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

1. För SAMTALSUTKAST-01, SAMTALSUTKAST-02 och SAMTALSUTKAST-04, starta
   [den kontrollerade kostnadsmiljön](costs.md#controlled-cost-fixture).
   Följ dess privata portvidarebefordran. Logga in som Alex och skapa
   hushållet Utkastprov. Skapa personen **Lo Exempel** med tom beskrivning
   genom Lista och välj **Lägg i mitt utkast**. Lämna förslaget osparat.
2. För SAMTALSUTKAST-03, använd i stället
   [den kontrollerade textmiljön](text-assistant.md#controlled-text-fixture).
   Skapa samma hushåll men lämna kartan och utkastet tomma.
3. Använd en ny installation för varje fall. Avsluta med `quit` och
   kontrollera att den tillfälliga katalogen tas bort. Använd endast de
   påhittade uppgifterna här. SAMTALSUTKAST-05 har en egen miljö nedan.

## Utkastet i textvyn

### SAMTALSUTKAST-01: utkasttabellen visar alla slags ändringar med kartans symboler

**Syfte:** Läsa osparade ändringar i en tabell utan att ändra eller spara dem.

**Användare:** Alex.

**Förutsättningar:** Lo-förslaget från förberedelsen finns.

**Integrationstest:**
[conversation-draft.spec.ts](../../tests/integration/conversation-draft.spec.ts),
testfallet “SAMTALSUTKAST-01: utkasttabellen visar alla slags ändringar med
kartans symboler”.
Samband och sambandstyper täcks också av
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-07: hela ändringslistan visar samband, typer och verkliga före-
och eftervärden”.

**Steg:**

1. Lägg till personen **Kim** och spara hela utkastet genom
   **Utkast och historik**.
2. Rätta Lo till **Lo Rättad**, lägg rättelsen i utkastet och föreslå att
   Kim tas bort. Skapa objekttypen **Provtyp** i Inställningar och ett
   **Nytt objekt** av denna typ. Lämna de fyra ändringarna osparade.
3. Välj **Skriv till Skyttel** och godkänn medgivandet. Läs antalet på
   **Visa utkastet**. Öppna utkastet och läs varje rad.
4. Välj **Dölj utkastet**, stäng och öppna textvyn och kontrollera att
   utkastet fortfarande är hopfällt. Öppna utkastet och välj **Nytt samtal**.

**Förväntat resultat:**

- Knappen står ovanför samtalstexten, anger fyra osparade ändringar och
  visar en pil åt öppningsriktningen. Den heter **Dölj utkastet** när
  tabellen visas. Tangentbord och skärmläsare når knappen och dess läge.
- Tabellen har kolumnerna Symbol, Namn, Typ och Vad som ändras, en rad
  per ändring. Penna, kryss och plus motsvarar kartans symboler och har
  textalternativen Ändra, Ta bort och Lägg till. Rättelsen visar
  **Namn: Lo Exempel → Lo Rättad**.
- På dator står utkastet till vänster om samtalstexten. Utkastet har ingen
  länk till **Utkast och historik**. Panelen **Ändringar under samtalet**
  finns inte. Inget sparas genom att läsa tabellen.
- Efter **Nytt samtal** är utkastet hopfällt enligt grundvalet; samma
  osparade ändringar ligger kvar.

### SAMTALSUTKAST-02: valet följer användaren mellan hushåll och enheter

**Syfte:** Spara valet för Alex på alla enheter och hålla Robins val skilt.

**Användare:** Alex och Robin.

**Förutsättningar:** Lo-förslaget finns. För att kontrollera två hushåll i
samma tillfälliga installation, kör följande i en annan terminal. Ersätt
sökvägen med katalogen som kostnadsmiljön skriver ut. Kommandot accepterar
bara denna tillfälliga provdatabas. Den vanliga installationens gränssnitt
skapar ett hushåll; extra hushållet är provdata för åtkomstgränsen.

<!-- markdownlint-disable MD013 -->
```sh
SAMTALSUTKAST_DB=/tmp/skyttel-test-REPLACE/skyttel.db node --input-type=module <<'JS'
import Database from 'better-sqlite3';
const path = process.env.SAMTALSUTKAST_DB;
if (!/^\/tmp\/skyttel-test-[^/]+\/skyttel\.db$/.test(path ?? '')) throw Error('Fel provdatabas');
const db = new Database(path, { fileMustExist: true });
db.pragma('foreign_keys = ON');
const alex = db.prepare('SELECT id FROM user WHERE name = ?').get('Alex Exempel');
if (!alex) throw Error('Logga in som Alex först');
db.transaction(() => {
  db.prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)').run('draft-other-household', 'Andra hushållet', new Date().toISOString());
  db.prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)').run('draft-other-household', alex.id, 'administrator');
})();
db.close();
JS
```
<!-- markdownlint-enable MD013 -->

**Integrationstest:**
[conversation-draft.spec.ts](../../tests/integration/conversation-draft.spec.ts),
testfallet “SAMTALSUTKAST-02: valet följer användaren mellan hushåll och enheter”.

**Steg:**

1. Öppna **Inställningar**, **Samtal med Skyttel** och delen **Utkastet**.
   Markera **Visa utkastet när ett samtal börjar**. Läs återkopplingen.
2. Återgå till kartan och starta med text. Dölj utkastet och välj
   **Nytt samtal**. Spara sedan utkastet genom **Utkast och historik**,
   återgå till textvyn och välj **Nytt samtal**. Öppna det tomma utkastet.
3. Logga in som Alex i den andra webbläsarprofilen. Öppna den utskrivna
   adressen följd av `/households/draft-other-household`. Öppna samma
   inställning. Avmarkera den där, ladda om Alex första sida och läs valet.
4. Kör `identity robin` i miljöns terminal. Logga in med Microsoft i
   Robins profil och kopiera användar-ID från **Din profil**. Bjud in
   Robin från Alex **Administrera tillgång**; Robin accepterar i sin profil.
   Kör `identity alex`. Markera Alex val igen. Kontrollera Robins val.
5. Kör `restart` i terminalen, ladda om Alex sida och kontrollera valet.

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
Använd en smal skärm, eller ett datorfönster högst 700 px brett.

**Integrationstest:**
[conversation-draft.spec.ts](../../tests/integration/conversation-draft.spec.ts),
testfallet “SAMTALSUTKAST-03: första förslaget öppnar utkastet på mobil enhet”.

**Steg:**

1. Markera utkastvalet i Inställningar, återgå och starta med text.
2. Skriv **Lägg till Lo.** Läs terminalens `held`-rad. Besvara dess begäran
   med `tool ID read_map {"query":""}`, där ID är begärans nummer. Nästa
   `held`-rad visar typerna i `lastToolResult`; kopiera ID för typen Person.
3. Besvara nästa begäran med `tool ID propose_object JSON`. JSON ska ha
   `version` och `contentVersion` från den radens `draft`, `id` satt till
   `lo`, `baseRevision` satt till `null` och `value` satt till
   `{"typeId":"PERSON-ID","name":"Lo Exempel","description":""}`.
   Släpp följande begäran med `reply ID Lo ligger i utkastet.`
4. Läs utkastet och samtalstexten. Prova också att öppna och stänga utkastet
   på en bred pekskärm, till exempel iPad.

**Förväntat resultat:**

- Det tomma utkastet börjar hopfällt trots det markerade valet. Det första
  förslaget öppnar tabellen och ökar antalet på knappen till ett.
- Utkastet står mellan knappen och samtalstexten på mobil enhet och smal
  skärm, även på bred pekskärm. Tabellen och samtalstexten går att läsa
  med tangentbord och skärmläsare. Sidan kräver ingen vågrät rullning.

### SAMTALSUTKAST-04: kvittot och tidigare sparförsök finns i Utkast och historik

**Syfte:** Hitta beständigt sparresultat utanför textvyn.

**Användare:** Alex.

**Förutsättningar:** Lo-förslaget finns.

**Integrationstest:**
[conversation-draft.spec.ts](../../tests/integration/conversation-draft.spec.ts),
testfallet “SAMTALSUTKAST-04: kvittot och tidigare sparförsök finns i Utkast och
historik”.

**Steg:**

1. Välj **Utkast och historik** och spara hela utkastet. Starta därefter
   med text och kontrollera att varken kvitto eller tidigare försök står där.
2. Välj **Utkast och historik**, **Tidigare sparförsök** och **Visa kvittot**.

**Förväntat resultat:**

- Textvyn visar samtalet och utkastet. Sparförsöken och kvittot finns i
  **Utkast och historik**. Kvittot anger Lo Exempel, sparförsökets ID och
  tidpunkten. Att läsa kvittot sparar ingenting igen.

### SAMTALSUTKAST-05: utkastvalet fungerar utan tillgängligt samtal

**Syfte:** Ändra personliga val utan tillgängligt samtal och få begriplig
felåterkoppling.

**Användare:** Alex.

**Förutsättningar:** Bygg med `npm run build` och starta denna tillfälliga
installation utan samtalsleverantör. Vidarebefordra den utskrivna porten
privat, logga in med Google och skapa Utkastprov.

<!-- markdownlint-disable MD013 -->
```sh
node --import tsx --input-type=module <<'JS'
import { createInstallation } from './tests/support/installation.ts';
const app = await createInstallation();
console.log(app.origin, app.directory);
process.stdin.resume();
process.once('SIGINT', async () => { await app.close(); process.exit(); });
JS
```
<!-- markdownlint-enable MD013 -->

**Integrationstest:**
[conversation-draft.spec.ts](../../tests/integration/conversation-draft.spec.ts),
testfallet “SAMTALSUTKAST-05: utkastvalet fungerar utan tillgängligt samtal”.

**Steg:**

1. Öppna sidan **Samtal med Skyttel**. Läs att samtalet inte är tillgängligt.
2. Sätt webbläsarens nätverk till Offline i utvecklingsverktygen och
   markera utkastvalet. Läs återkopplingen och kontrollera fokus.
3. Återställ nätverket till Online och markera kryssrutan igen.
4. Avsluta installationen med Ctrl+C och kontrollera att provkatalogen
försvinner.

**Förväntat resultat:**

- Valet går att ändra även utan tillgängligt samtal. Efter nätfelet står
  **Valet kunde inte sparas. Försök igen.** Kryssrutan återgår till det
  sparade valet och behåller fokus. Nästa försök visar **Valet är sparat**.

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
