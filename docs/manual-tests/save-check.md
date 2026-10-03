# Manuella testfall för automatisk kontroll av sparande

Fallen omfattar kontaktavbrott, omstart, avvisade eller saknade försök,
kontrollens enda återförsöksknapp och förklaringens text och röst.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex är medlem i provhushållet och loggar in med provets Google-knapp.
Ingen administratörsbehörighet behövs. Driftansvarig kan kontrollera
loggar och kvitton vid ett kvarstående fel.

## Allmän förberedelse

1. Starta en separat installation enligt
   [den kontrollerade talprovsguiden](voice-assistant.md#controlled-voice-fixture).
   Den har riktig server och tillfällig SQLite men syntetisk leverantör och media.
2. Logga in som Alex, skapa Kontrollprov och lägg Lo Exempel i utkastet
   genom **Lista → Nytt objekt → Lägg i mitt utkast**. Anteckna utkastets
   version och innehållsversion från terminalens nästa `held`.
3. Öppna **Skriv till Skyttel** och godkänn medgivandet för besöket.
   Använd webbläsarens utvecklarverktyg för **Network request blocking**
   och **Offline** när fallet anger ett verkligt nätavbrott.
4. Ta bort nätblockering och återställ kontakten mellan fallen. Starta
   en ny separat installation när ett fall behöver tom historik. Avsluta
   med `quit`; provdatabasen tas bort.

## Tappat svar och återförsök

### SPARKONTROLL-01: ett tappat sparbesked kontrolleras före nytt arbete

**Syfte:** Kontrollera automatiken när kontakten kommer tillbaka.

**Användare:** Alex.

**Förutsättningar:** Lo ligger i utkastet och textsamtalet är öppet.

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts), testfallet
“SPARKONTROLL-01: ett tappat sparbesked kontrolleras automatiskt före nytt
arbete och förklaras en gång”.

**Steg:**

1. Skriv **Spara hela utkastet.** och välj **Skicka**. Släpp modellens anrop
   med `tool REQUEST save_draft {"version":VERSION,"contentVersion":CONTENT,"operationId":"kontroll-prov"}`.
   Avsluta modellens nästa anrop med `reply REQUEST Sparat.`.
2. Bryt kontakten med **Offline** medan svaret hämtas. Automatiken för
   fallet tappar uttryckligen det redan genomförda sparandets svar. Kräv
   **Det är oklart om utkastet sparades. Skyttel kontrollerar det.** när
   klienten saknar utfallet. Skriv nästa uppdrag i fältet.
3. Kräv avstängd **Skicka** och mikrofon. Texten ska gå att skriva och läsa.
   Ingen knapp för att kontrollera sparandet visas under den egna kontrollen.
4. Återställ kontakten. Vänta på förklaringen **Kontrollen visar att hela
   utkastet sparades. Ändringarna finns i hushållets karta.** i samtalstexten.
5. Öppna **Utkast och historik → Tidigare sparförsök**. Kontrollera ett
   genomfört försök och ett kvitto med samma operation-ID. Lo finns i kartan.

**Förväntat resultat:**

- Kontrollnotisen går före nätfel och andra notiser. Skyttel försöker själv
  när kontakten är tillbaka; oskickad text och fokus finns kvar.
- Förklaringen förekommer en gång. Nytt arbete blir möjligt efter kontrollen.
  Historiken innehåller ett kvitto; kontrollen skapar inget ytterligare sparande.
- Manuellt avbrott mellan genomförande och svar kan vara svårt att tajma.
  Automatiken verifierar det exakta tappade svaret genom nätgränsen.

### SPARKONTROLL-02: omstart slutför samma försök utan nytt medgivande

**Syfte:** Kontrollera ursprunglig identitet och den enda manuella återhämtningen.

**Användare:** Alex.

**Förutsättningar:** Förbered ett registrerat väntande försök enligt
[TAL-03](voice-assistant.md#tal-03-synlig-markering-och-exakt-sparåterhämtning-fungerar-efter-röstomstart).
Blockera `*text-assistant/*/recover` innan registreringen släpps.

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts), testfallen:

- “SPARKONTROLL-02: omstart kontrollerar samma väntande försök utan medgivande”.
- “SPARKONTROLL-02: omstart kontrollerar samma väntande försök utan medgivande
  och bara en misslyckad kontroll kräver återförsök”.

**Steg:**

1. Anteckna det registrerade operation-ID:t och versionerna. Kör `restart`
   och ladda om sidan. Besökets medgivande är nu borta.
2. Prova först med nätblockeringen borttagen. Kontrollera att Skyttel själv
   kontrollerar och slutför försöket innan något nytt samtal eller medgivande.
3. Upprepa från ett nytt väntande försök med blockeringen kvar. Kräv
   **Skyttel kunde inte kontrollera om utkastet sparades.** med endast
   **Kontrollera om utkastet sparades** som återförsök.
4. Ta bort blockeringen, tabba till knappen och tryck Retur. Kontrollnotisen
   ersätter felnotisen och knappen försvinner medan kontrollen pågår.
5. Öppna textsamtalet och godkänn det vanliga medgivandet om det behövs.
   Läs förklaringen och kontrollera kvittot i **Tidigare sparförsök**.

**Förväntat resultat:**

- Kontroll kräver hushållstillgång men inget medgivande eller nytt modelluppdrag.
- Samma operation-ID, ägare, innehållsversion och utkastversion slutförs.
  Kvittot kan hämtas igen utan ett nytt historiksteg eller nytt sparande.
- Ett avvisat eller saknat försök skapar ingen ny operation. Återförsök
  visas endast efter en misslyckad egen kontroll. Nytt arbete är blockerat
  tills dess.

## Förklaring och röst

### SPARKONTROLL-03: ett saknat försök förklaras även när inget sparades

**Syfte:** Kontrollera ett osparat utfall, deduplicering och mikrofonens val.

**Användare:** Alex.

**Förutsättningar:** Ett textsamtal är igång. Prova både mikrofonen av och på.

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts), testfallen:

- “SPARKONTROLL-03: ett oregistrerat sparande förklaras en gång med mikrofonen av”.
- “SPARKONTROLL-03: ett oregistrerat sparande förklaras en gång med mikrofonen på”.

**Steg:**

1. Blockera `*text-assistant/*/messages` i nätverkspanelen innan ett
   skrivet sparuppdrag skickas. Det finns då inget registrerat nytt försök.
2. Återställ kontakten. Kräv **Kontrollen visar att utkastet inte sparades.
   Dina osparade ändringar ligger kvar.** i samtalstexten.
3. Med mikrofonen på ska samma förklaring sägas med rösten och inte också
   läsas upp som ny samtalstext av skärmläsaren. Ingen **Sparat**-symbol visas.
4. Med mikrofonen av ska förklaringen bara komma i text, med en artig
   uppläsning för skärmläsaren. Slå sedan på mikrofonen: det gamla svaret
   ska inte spelas upp igen.
5. Upprepa avbrottet för ett nytt uppdrag. Den nya kontrollen ska ge en
   andra förklaring, medan återförsök av samma kontroll aldrig ger dubletter.

**Förväntat resultat:**

- Varje egen kontroll har ett eget utfall, också utan operation. Samma
  kontrolls tappade svar kan hämtas igen utan en ny samtalsrad.
- Utkastet och tom historik finns kvar. Ingen operation skapas av kontrollen.
- Röstvalet gäller den kontrollerade förklaringen. Textvyn öppnas inte automatiskt.

### SPARKONTROLL-04: Sparat följer kvittot och det avslutade röstsvaret

**Syfte:** Kontrollera spärrad fångst och bekräftelsens start efter svaret.

**Användare:** Alex.

**Förutsättningar:** Mikrofonen är på. Lo ligger i ett registrerat väntande
försök; använd förberedelsen i TAL-03 och ta bort nätblockeringen utan omstart.

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts), testfallet
“SPARKONTROLL-04: verifierad sparåterhämtning stoppar fångst under
kontrollen och visar Sparat först efter svaret”.

**Steg:**

1. Kontrollera att mikrofonen är av medan kontrollnotisen visas. Kontrollera
   spårens `enabled` med provets mediestatistik; inget nytt ljud får fångas.
2. Släpp kontrollen. Kräv förklaringen i samtalstexten och det verifierade
   kommentarspaketet med förklaringen följd av **Sparat.** i `sessions`.
3. Släpp en motsvarande syntetisk svarstext och håll simulerat fjärrljud
   aktivt enligt [ljudkontrollerna](voice-assistant.md#browser-transport-and-audio-controls).
   Kräv **Skyttel talar** och ingen grön sparsymbol medan svaret hörs.
4. Välj **Avbryt** i röstrutan. Kräv **Sparat** med grön bock under fyra
   sekunder, grundat i det kvarstående kvittot. Kontrollera ett historiksteg.

**Förväntat resultat:**

- Ny fångst spärras under kontrollen. Ett tidigare kort trycks på-val
  bevaras till svaret; ett släppt långt tryck börjar aldrig fånga igen.
- Förklaringen står i samtalet och sägs när mikrofonvalet är på.
- Sparsymbolen kräver ett verkligt kvitto. Den börjar efter svarets
  observerade ljuddränering eller ett definitivt avbrott, aldrig bara av text.

### SPARKONTROLL-05: avvisat försök behåller utkastet

**Syfte:** Kontrollera att en verifierad avvisning inte blir ett nytt sparande.

**Användare:** Alex.

**Förutsättningar:** Använd en separat provdatabas och ett nytt, tomt hushåll.
Förbered ett redan registrerat sparförsök med olöst identitet genom de publika
HTTP-rutterna. Detta är provdata för ett tidigare uttryckligt sparbesked,
inte ett nytt sparande från kontrollen. Kopiera hushållets ID från adressen
för `/api/households/ID/map` i Network. Öppna webbläsarens Console på samma
inloggade sida och kör följande med det kopierade ID:t:

```javascript
const mapPath = '/api/households/ID/map';
const map = await (await fetch(mapPath)).json();
await fetch(`${mapPath}/draft`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    version: map.draft.version,
    contentVersion: map.contentVersion,
    id: 'lo',
    baseRevision: null,
    value: {
      typeId: map.types[0].id,
      name: 'Oklart Lo',
      description: '',
      identity: 'unresolved',
    },
  }),
});
const draft = (await (await fetch(mapPath)).json()).draft;
await fetch(`${mapPath}/operations`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    operationId: 'manual-rejected-original',
    version: draft.version,
    contentVersion: map.contentVersion,
  }),
});
```

Kräv status 200 för båda POST-anropen. Kvittot kan inte skapas innan
identiteten är utredd. Lämna Console och följ de synliga stegen nedan.

**Integrationstest:**
[save-check.spec.ts](../../tests/integration/save-check.spec.ts), testfallet
“SPARKONTROLL-05: ett avvisat väntande försök förklaras som osparat och
behåller samma privata utkast”.

**Steg:**

1. Starta om installationen och ladda om sidan. Låt Skyttel kontrollera försöket.
2. Öppna textsamtalet och läs förklaringen att utkastet inte sparades.
3. Öppna **Utkast och historik → Tidigare sparförsök**. Kontrollera avvisat
   resultat med det ursprungliga ID:t. Kontrollera hela privata utkastet.
4. Red ut identiteten eller konflikten. Ett nytt sparande behöver ett nytt
   uttryckligt sparbesked; kontrollen får inte skapa eller basera om ett försök.

**Förväntat resultat:**

- Utkastet är oförändrat och historiken har inget nytt kvitto. Den avvisade
  identiteten är beständig och inget nytt försöks-ID har skapats.
- Förklaringen är det enda utfallsbeskedet i samtalet. En lyckad kontroll
  av ett osparat resultat visar ingen återförsöksknapp för själva kontrollen.

## Tillgänglighetsbedömning och körgränser

Bedömningen är ett designmål för WCAG 2.2 AA, inte ett intyg om verifierad
överensstämmelse. Befintliga temafärger och fokusmarkeringar återanvänds.

<!-- markdownlint-disable MD013 -->
| Kriterium | Utformning och automatiskt prov | Mänsklig verifiering som återstår |
| --- | --- | --- |
| 1.1.1, 1.3.1, 1.4.1 | Frågesymbolen är dold för hjälpmedel; text anger kontroll och fel, utöver färg. | Begriplighet och verkliga teman. |
| 1.4.3, 1.4.11, 2.4.7, 2.4.11 | Befintliga teman, fokusmarkeringar och notisplacering återanvänds. | Kontrast, zoom och oskymt fokus på verkliga skärmar. |
| 2.1.1, 2.4.3, 2.5.8 | Återförsök med tangentbord, logiskt fokus efter notisens borttagning och befintliga knappmått. Ingen automatisk textvy. | Full fokusordning och fysisk pekskärm. |
| 4.1.2, 4.1.3 | Högst prioriterad artig kontrollnotis, assertivt kontrollfel, en kanonisk samtalsrad med röstberoende uppläsning. | Hörbara skärmläsare och avbrott mellan uppläsningar. |
<!-- markdownlint-enable MD013 -->

Automatiken använder riktig server och tillfällig SQLite med syntetiskt
leverantörs- och medieunderlag. Live saknar en säker signal för färdig
uppspelning: matchad verifierad svarstext och faktiskt observerad
ljudaktivitet används tillsammans; framtida fördröjt ljud kan inte uteslutas.
Ett uttryckligt avbrott är en säker slutpunkt. Verklig uppspelning,
mikrofonintegritet, mobil policy och hörbar skärmläsare återstår enligt #220.
