# Manuella testfall för samtalsmedgivandet

Fallen omfattar medgivanderutan vid samtalets start: när den visas, vad
**Godkänn och starta** och **Avbryt** gör, hur länge ett medgivande gäller
och hur ett sparat medgivande följer användaren mellan enheter.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

Fallen MEDGIVANDE-05 till MEDGIVANDE-18 omfattar sidan **Samtal med
Skyttel** i Inställningar: var sidan står, vad delen **Medgivande** visar,
hur medgivandet sparas och återkallas där, att återkallandet gäller på
användarens alla enheter och att medgivandet följer medlemskapet.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Medgivandeprov
  och loggar in med Google.
- Robin Exempel är medlem i samma hushåll i MEDGIVANDE-03 och loggar in
  med Microsoft i en separat webbläsarprofil.
- Robin är medlem på samma sätt i MEDGIVANDE-05 och MEDGIVANDE-12.
- Alex använder en andra webbläsarprofil som en andra enhet i
  MEDGIVANDE-06, MEDGIVANDE-13 och MEDGIVANDE-18.
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

## Förberedelse för återkallande under samtal

För MEDGIVANDE-15 till MEDGIVANDE-18 används en separat kontrollerad
installation med riktiga servervägar och en tillfällig SQLite-databas.
Kostnadsmiljön ovan kan inte hålla ett registrerat sparande. Kör från
repositoryts rot:

```sh
npm run build
npx tsx scripts/manual-voice.ts
```

Öppna den utskrivna adressen privat och logga in som Alex med Google.
Skapa hushållet Medgivandeprov. Lägg till den påhittade personen
**Lo Exempel** i utkastet genom kartans lista och formulär. Spara inte;
utkastet ska innehålla exakt en ändring. Den kontrollerade mikrofonen
använder tyst ljud och spelar inte in din riktiga mikrofon.

Textsvar väntar i terminalen. När den skriver `held`, använd dess aktuella
`id` i kommandot `reply ID Ett provsvar.`. `pending` visar aktuella
förfrågningar. `quit` avslutar installationen och tar bort provdatabasen.
Starta en ny installation och upprepa förberedelsen för varje fall.

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
   rubriken **Samtal med Skyttel**, medgivandetexten i tre stycken som
   förklarar att tidigare inspelat tal från långt tryck kan skickas efter
   släpp och att släpp stänger av ny inspelning direkt,
   kryssrutan **Fråga inte igen för det här hushållet**, raden
   **Du kan återkalla det i Inställningar.** samt **Godkänn och starta**
   och **Avbryt**.
2. Markera kryssrutan och välj **Avbryt**. Kontrollera att fokus står på
   **Prata med Skyttel** och att varken samtal eller mikrofon har startat.
3. Välj **Skriv till Skyttel**. Kontrollera att kryssrutan är omarkerad igen.
   Stäng rutan med Escape.
4. Upprepa med **Tala** och **Skriv** i kartans vägledning. Vägledningen
   ska ligga kvar när rutan stängs.
5. Gå med Tab från sidans början till snabblänken **Till samtalet med Skyttel**
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
   kryssrutan. Kontrollera att knappen är intryckt, att röstrutan visar
   **Lyssnar** och att ingen panel öppnas.
2. Välj **Skriv till Skyttel** och **Nytt samtal** i textvyn.
   Samtalstexten töms och Skyttel säger
   att utkastet är tomt. Ingen medgivanderuta visas, och mikrofonen är
   fortfarande på.
3. Öppna **Inställningar** och välj **Tillbaka till kartan**. Välj
   **Skriv till Skyttel** om textvyn är stängd; samtalet ska visas utan
   medgivanderutan.
4. Ladda om sidan. Välj **Skriv till Skyttel**. Medgivanderutan ska visas
   igen, med omarkerad kryssruta. Välj **Godkänn och starta**.

**Förväntat resultat:**

- Röstknappen startar samtalet med mikrofonen. Textknappen startar
  samtalet utan att begära mikrofonåtkomst.
- **Nytt samtal** frågar inte igen, och samtalet frågar inte igen efter
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

1. Som Alex, välj **Skriv till Skyttel**, markera
   **Fråga inte igen för det här hushållet** och välj **Godkänn och starta**.
2. Ladda om sidan och välj **Prata med Skyttel**. Samtalet ska starta
   direkt med mikrofonen.
3. Kör `identity alex`. Logga in som Alex i ytterligare en webbläsarprofil,
   som en andra enhet. Välj **Skriv till Skyttel**; samtalet ska starta direkt.
4. Som Robin, välj **Skriv till Skyttel**. Medgivanderutan ska visas, med
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
   Välj **Skriv till Skyttel**. Rutan ska öppnas under verktygsraden och
   rymmas på skärmen utan rullning i sidled. Stäng den.
3. Återställ fönstret. Flytta fokus till **Skriv till Skyttel** med Tab och
   tryck Enter. Gå med Tab till kryssrutan och markera den med
   mellanslag. Gå vidare till **Godkänn och starta** och tryck Enter.
4. På en pekskärm med en annan användare, eller i en ny installation, tryck
   på **Skriv till Skyttel** och sedan på **Godkänn och starta**.
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
3. Välj **Återkalla medgivandet** och därefter
   **Återkalla och avsluta samtalet** i bekräftelserutan. Läs statusraden
   och kontrollera mikrofonen.
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
  Ingen knapp finns kvar, så fokus står på rubriken **Medgivande**.

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

### MEDGIVANDE-12: en medlem som bjuds in igen har inget sparat medgivande

**Syfte:** Se att ett sparat medgivande tas bort med medlemskapet, så att
Skyttel frågar på nytt när samma användare bjuds in igen.

**Användare:** Alex och Robin.

**Förutsättningar:** Robin är medlem enligt förutsättningarna i
MEDGIVANDE-03 och har sparat medgivandet på sidan **Samtal med Skyttel**.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-12: en medlem som bjuds in igen har inget sparat
medgivande”.

**Steg:**

1. Som Alex, öppna **Inställningar** och **Administrera tillgång**. Välj
   **Återkalla tillgång** för Robin under **Medlemmar** och bekräfta.
2. Bjud in Robins användar-ID igen, och acceptera inbjudan som Robin.
3. Som Robin, öppna sidan **Samtal med Skyttel** och läs statusraden.
4. Välj **Tillbaka till kartan** och **Prata med Skyttel**.

**Förväntat resultat:**

- Statusraden visar **Inget medgivande är sparat.**, och knappen heter
  **Spara medgivandet**.
- **Prata med Skyttel** visar medgivanderutan, med omarkerad kryssruta.
  Varken samtal eller mikrofon startar.

### MEDGIVANDE-13: ett återkallande på en annan enhet avslutar samtalet

**Syfte:** Se att ett återkallande gäller användarens samtal i hushållet
även på en annan enhet, utan att kartan där går förlorad.

**Användare:** Alex.

**Förutsättningar:** Alex har sparat medgivandet enligt steg 1 i
MEDGIVANDE-06.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-13: ett återkallande på en annan enhet avslutar
samtalet”.

**Steg:**

1. Välj **Prata med Skyttel** i kartan. Vänta tills mikrofonen är på.
2. Logga in som Alex i ytterligare en webbläsarprofil, som en andra
   enhet. Öppna sidan **Samtal med Skyttel** där och välj
   **Återkalla medgivandet**.
3. Gå tillbaka till den första enheten. Vänta några sekunder och välj
   sedan **Prata med Skyttel** igen.

**Förväntat resultat:**

- På den första enheten stängs mikrofonen av, och samtalet avslutas.
  Kartan finns kvar, och ingen text säger att åtkomsten har upphört.
  En notis säger **Medgivandet är återkallat. Samtalet är avslutat.
  Utkastet ligger kvar.**
- **Prata med Skyttel** visar medgivanderutan, med omarkerad kryssruta.

### MEDGIVANDE-14: ändrad medgivandetext kräver ett nytt sparat medgivande

**Syfte:** Visa att ett medgivande för en annan version av texten inte
gäller och att användaren kan ersätta det från Inställningar.

**Användare:** Alex.

**Förutsättningar:** Starta en ny kontrollerad installation enligt den
allmänna förberedelsen, med bara Alex och hushållet Medgivandeprov. Spara
medgivandet enligt steg 1 i MEDGIVANDE-06. Lämna sidan öppen utan samtal.
Förbered sedan en annan sparad textversion enligt nedan. Värdet 1 är den
tidigare textversionen; den aktuella textversionen är 2. Det motsvarar det sparade
tillståndet efter ett byte av medgivandetextens version.

I en andra terminal, från repositoryts rot, sätt katalogen till exakt
`directory` från startterminalens `ready`-händelse. Kör hela blocket:

```sh
SKYTTEL_MANUAL_CONSENT_DIR='/tmp/skyttel-test-ersätt-med-utskriven-katalog'
node --input-type=module - "$SKYTTEL_MANUAL_CONSENT_DIR" <<'JS'
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import Database from 'better-sqlite3';

const directory = realpathSync(process.argv[2]);
if (dirname(directory) !== realpathSync(tmpdir()) ||
    !basename(directory).startsWith('skyttel-test-')) {
  throw new Error('Use the disposable fixture directory from ready.');
}
const database = new Database(join(directory, 'skyttel.db'), {
  fileMustExist: true,
});
try {
  database.transaction(() => {
    const rows = database.prepare(
      'SELECT textVersion FROM conversation_consent',
    ).all();
    if (rows.length !== 1 || rows[0].textVersion !== 2) {
      throw new Error('Prepare one saved consent in a new fixture.');
    }
    database.prepare(
      'UPDATE conversation_consent SET textVersion = 1',
    ).run();
  })();
  console.log('Prepared saved consent for text version 1.');
} finally {
  database.close();
}
JS
```

Kräv utskriften `Prepared saved consent for text version 1.`. Kör därefter
`restart` i startterminalen och vänta på `restarted`. Behåll samma
webbläsarprofil och adress. Avsluta med `quit` efter fallet enligt den
allmänna förberedelsen; starta en ny installation inför nästa körning.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-14: ändrad medgivandetext kräver ett nytt sparat
medgivande”.

**Steg:**

1. Ladda om sidan och öppna **Inställningar**, **Samtal med Skyttel**.
   Läs statusraden och knappen under **Medgivande**.
2. Välj **Spara medgivandet**. Läs texten vid knappen, statusraden och
   knappens nya namn.

**Förväntat resultat:**

- Före sparandet står **Medgivandetexten har ändrats. Inget medgivande
  är sparat.** och endast **Spara medgivandet** erbjuds.
- Efter sparandet visas **Medgivandet är sparat**, statusraden börjar
  med **Sparat den** och visar dagens datum. Knappen heter
  **Återkalla medgivandet**. Det nya medgivandet ersätter den andra
  textversionens medgivande.

## Återkallande under samtal

### MEDGIVANDE-15: återkallandet behåller utkast och oskickad text

**Syfte:** Bekräfta återkallandet och tömma samtalstext och kontext utan
att förlora utkast eller oskickad text.

**Användare:** Alex.

**Förutsättningar:** Följ förberedelsen för återkallande under samtal ovan.
Utkastet har en osparad ändring. Inget medgivande är sparat.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-15: återkallandet behåller utkast och oskickad text”.

**Steg:**

1. Välj **Skriv till Skyttel** och **Godkänn och starta**. Vänta på
   textvyn. Slå på mikrofonen med **Prata med Skyttel**.
2. Skicka **Tillfälligt provord för återkallandet.**. Låt terminalens
   förfrågan vänta. Skriv **Min oskickade text.** utan att skicka.
3. Öppna **Inställningar**, sidan **Samtal med Skyttel**, och välj
   **Återkalla medgivandet**. Läs rutan. Stäng med Escape. Öppna igen
   och välj **Avbryt**. Kontrollera fokus efter båda handlingarna.
4. Öppna rutan igen och välj **Återkalla och avsluta samtalet**.
5. Släpp det gamla svaret med `reply ID För sent efter återkallandet.`.
   Välj **Tillbaka till kartan**. Kontrollera utkastet.
6. Välj **Skriv till Skyttel** och godkänn igen. Läs skrivfältet och
   samtalstexten. Skicka **Börja om.** och släpp det nya svaret med
   `reply ID Ett nytt samtal.`.

**Förväntat resultat:**

- Rutan säger **Samtalet avslutas och samtalstexten töms. Utkastet med 1
  osparade ändringar ligger kvar.** och har två knappar.
- Escape och **Avbryt** återför fokus till **Återkalla medgivandet**.
  Mikrofonen och arbetet fortsätter.
- Bekräftelsen stänger mikrofonen och avslutar arbetet. Fokus går till
  **Spara medgivandet**; resultatet säger **Medgivandet är återkallat**.
- Textvyn och röstrutan är borta i kartan. Ingen samtalsnotis visas där.
  Lo Exempel ligger kvar i utkastet. Det sena svaret visas inte.
- Nästa start frågar om medgivande igen. **Min oskickade text.** ligger
  kvar i skrivfältet. Den gamla samtalstexten och kontexten är tömda.
  Det nya svaret visas i det nya samtalet.

### MEDGIVANDE-16: registrerat sparande slutförs vid återkallandet

**Syfte:** Slutföra ett redan godkänt och registrerat sparande och visa
samma kvitto när användaren återkallar medgivandet.

**Användare:** Alex.

**Förutsättningar:** Följ förberedelsen ovan. Utkastet har en ändring.
Skriv `hold-save on` i terminalen innan samtalet börjar.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-16: registrerat sparande slutförs vid återkallandet”.

**Steg:**

1. Välj **Skriv till Skyttel**, godkänn för besöket och vänta på textvyn.
   Slå på mikrofonen med **Prata med Skyttel** och skicka
   **Spara hela utkastet nu.**.
2. Läs `id`, `draft.version` och `draft.contentVersion` i terminalens
   `held`. Ersätt ID, V och C med dessa värden i följande kommando:

   ```text
   tool ID save_draft {"version":V,"contentVersion":C,"operationId":"prov"}
   ```

3. Vänta på terminalens `save-registered`. Notera dess `operationId`.
   Öppna **Samtal med Skyttel** i Inställningar och välj
   **Återkalla medgivandet**. Läs rutan och bekräfta.
4. Skriv `release-save`. Gå tillbaka till kartan och läs sparresultatet.
   Öppna **Utkast och historik** och kontrollera kvittot.

**Förväntat resultat:**

- Rutan säger **Skyttel sparar ditt utkast. Sparandet slutförs.** i
  stället för att ange antal osparade ändringar.
- Medgivandet återkallas medan det registrerade sparandet slutförs.
  Kartan innehåller Lo Exempel och utkastet är tomt.
- Sparresultatet visar kvittot med det noterade ID:t. Historiken har ett
  sparande för samma ID, även efter att det fördröjda svaret släpps.
- Textvyn och röstrutan är stängda och ingen samtalsnotis visas.
  Sparresultatet går att kontrollera utan ett nytt samtalsmedgivande.

### MEDGIVANDE-17: återkallanderutan med tangentbord och pekskärm

**Syfte:** Använda bekräftelsen utan visuell kartnavigering och utan mus.

**Användare:** Alex.

**Förutsättningar:** Följ förberedelsen ovan. Börja ett textsamtal och
öppna **Samtal med Skyttel** i Inställningar. Prova ljust och mörkt tema
på dator och telefon; anteckna faktisk enhet och hjälpmedel separat.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-17: återkallanderutan med tangentbord och pekskärm”.

**Steg:**

1. Använd Tab och Enter för att välja **Återkalla medgivandet**.
   Läs rutans rubrik, beskrivning och knappar med skärmläsare.
2. Gå framåt och bakåt med Tab. Välj **Avbryt** och kontrollera fokus.
   Öppna igen och stäng med Escape.
3. Upprepa på pekskärm i båda teman. Förstora texten och kontrollera
   läsordning, synligt fokus och att alla handlingar går att nå.
4. Öppna igen och välj **Återkalla och avsluta samtalet**. Lyssna på
   resultatet utan att flytta fokus.

**Förväntat resultat:**

- Fokus börjar på rubriken. Namn och beskrivning berättar vad som
  avslutas och vad som ligger kvar. Tab stannar inom rutan.
- Escape och **Avbryt** återför fokus till den valda knappen utan att
  ändra medgivandet. Bekräftelse återför fokus till **Spara medgivandet**.
- Text och knappar kan läsas och nås även efter förstoring. Knapparna
  fungerar med beröring. Resultatet läses upp en gång vid knappen.

### MEDGIVANDE-18: nästa textförsök visar återkallandet på en annan enhet

**Syfte:** Avsluta samma användares textsamtal på en annan enhet utan
att förlora hushållets karta, utkast eller oskickad text.

**Användare:** Alex i två samtidigt inloggade webbläsarprofiler.

**Förutsättningar:** Följ förberedelsen ovan och spara medgivandet i
Inställningar. Logga in som Alex i en andra profil på samma adress.

**Integrationstest:**
[conversation-settings.spec.ts](../../tests/integration/conversation-settings.spec.ts),
testfallet “MEDGIVANDE-18: nästa textförsök visar återkallandet på en annan
enhet”.

**Steg:**

1. Börja ett textsamtal i första profilen. Skriv **Text som inte hunnit
   skickas.** i skrivfältet utan att skicka.
2. Öppna **Samtal med Skyttel** i andra profilen och välj
   **Återkalla medgivandet**. Inget samtal pågår där; ingen
   bekräftelseruta ska visas.
3. Gå tillbaka direkt till första profilen och välj **Skicka**. Om
   servern redan har avslutat vyn genom sin kontroll, läs notisen där.
4. Välj **Skriv till Skyttel** igen och godkänn. Läs skrivfältet.

**Förväntat resultat:**

- Första profilen visar **Medgivandet är återkallat. Samtalet är avslutat.
  Utkastet ligger kvar.** senast vid nästa försök att skicka. Notisen
  läses upp en gång och säger inte att hushållets åtkomst har upphört.
- Textvyn och samtalet avslutas; kartan och utkastet finns kvar.
- Nästa start visar medgivanderutan. Skrivfältet har kvar **Text som inte
  hunnit skickas.**. Texten ingår inte i det nya samtalets historik.

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
| 2.4.3, 2.4.7, 3.2.2 Fokus | Fokus går till sidans rubrik när sidan öppnas. Det står kvar på knappen när den byter namn och går till den knapp som finns kvar när den tryckta försvinner, eller till rubriken **Medgivande** när ingen knapp finns kvar. Inget annat flyttar fokus. | Fokus efter varje åtgärd och synlig fokusram. | Fokusordning med skärmläsare. |
| 2.5.8 Pekmål | Knapparna är minst 44 px höga. | Mått på knappen på 390 och 320 px. | Träffsäkerhet på fysisk pekskärm. |
| 4.1.3 Statusmeddelanden | Texten vid knappen är ett statusområde som finns från början och läses upp utan att fokus flyttas. Den töms före varje åtgärd, så att samma besked läses upp igen. | Områdets roll, att det finns före första åtgärden och textens ordalydelse. | Uppläsning av texten, även när samma besked upprepas. |
<!-- markdownlint-enable MD013 -->

MEDGIVANDE-14 provar statusraden för ändrad medgivandetext och ett nytt
sparande med syntetiskt förberedd textversion. Integrationstestet använder
två installationer på samma databas för motsvarande tillstånd.

### Bekräftat återkallande under samtal

Designmålet är WCAG 2.2 AA. MEDGIVANDE-15 till MEDGIVANDE-18 provar
funktionerna genom offentliga gränssnitt; detta är ingen fullständig
verifiering av överensstämmelse.

- 1.3.1, 2.4.6 och 4.1.2: den modala rutan har rubrik, namn och
  beskrivning. Kontrollerna har synliga, semantiska namn.
- 2.1.1, 2.4.3 och 2.4.7: fokus börjar på rubriken, Tab går inom rutan,
  Escape avbryter och fokus återställs efter avbrott och bekräftelse.
- 1.4.3, 1.4.10 och 2.5.8: automatiska kontroller provar minst 4,5:1
  textkontrast, omflöde på 390 px och minst 44 px höga och breda knappar
  i båda teman. Verklig zoom och fysisk pekskärm återstår.
- 4.1.3: inställningsresultat och kvitto använder befintliga statusområden.
  Ett återkallande från en annan enhet annonseras som en enda notis.
  Faktisk uppläsning med NVDA och VoiceOver återstår, liksom lyssning på
  riktigt ljud; den kontrollerade transporten är tyst.
