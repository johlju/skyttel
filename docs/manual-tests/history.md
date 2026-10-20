# Manuella testfall för ändringshistorik

Fallen omfattar Rapporter, fullständiga historiska uppgifter, direktlänkar
och återgång till pågående arbete. Anteckna commit, webbläsare och godkänt
eller underkänt resultat. Historiken erbjuder läsning av genomförda sparanden.

## Konfigurerade användare

Alex Exempel har tillgång till ett separat provhushåll. Logga in med den
syntetiska inloggningen enligt [utvecklingsguiden](../development/devcontainer.md).
Använd inga verkliga personuppgifter.

## Allmän förberedelse

1. Starta den isolerade provinstallationen enligt utvecklingsguiden.
2. Skapa personen **Lo Exempel**, lägg förslaget i utkastet och spara.
   Byt därefter namnet till **Lo Lind** och spara separat.
3. Återställ provhushållet mellan fallen. Behåll databasen när ett steg
   uttryckligen kräver omladdning eller omstart.

## Historik och bevarat arbete

### HISTORIK-01: läs sparanden senaste först och återgå till tabellens arbete

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/history.spec.ts",
    "caseId": "HISTORIK-01"
  },
  "reference": "1280×720; genomförda sparanden senaste först och återgång till tabellsökning.",
  "outcomes": [
    "Senaste sparandet visas först; privat förslag, tabellsökning och återgångsfokus bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Läsa gemensamma sparanden utan att ändra det egna utkastet,
tabellens sökning eller fokus.

**Användare:** Alex Exempel.

**Förutsättningar:** Två sparanden enligt förberedelsen. Lägg dessutom
**Privat person** i utkastet utan att spara.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts), testfallet
“HISTORIK-01: Reports preserves table work and lists only completed saves latest
first”.

**Steg:**

1. Välj **Tabell**, skriv **Lo Lind** i **Sök objekt i tabellen**.
2. Välj **Rapporter**. Läs den första fliken **Ändringshistorik**.
3. Kontrollera kortens ordning, person, tidpunkt och sammanfattning.
   Öppna **Visa ändringarna** på namnbytets kort och läs före och efter.
4. Välj **Tillbaka till arbetet**. Kontrollera sökning, fokus och utkast.

**Förväntat resultat:**

- Namnbytet kommer före tillägget. Kortet visar Alex, tidpunkt,
  sammanfattning samt Lo Exempel före och Lo Lind efter.
- Privat person förekommer inte i gemensam historik.
- Sökningen och utkastet är oförändrade. Fokus återgår till tabellens
  sökfält. Ingen åtgärd startar ett samtal eller begär medgivande.

### HISTORIK-06: läs fullständiga historiska värden med tangentbord

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/history.spec.ts",
    "caseId": "HISTORIK-06"
  },
  "reference": "1280×850; datorreferens för tangentbord och fullständiga historiska värden.",
  "outcomes": [
    "Båda namn, beskrivning, skuld, osäkerhet och datum kan läsas med tangentbord."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Läsa sparandets fullständiga värden på dator och telefon.

**Användare:** Alex Exempel.

**Förutsättningar:** Två sparanden för **Familjeabonnemang** och
**Musik för familjen**, med beskrivning **Hushållets musik**, osäkert
uppgiven skuld **1 200 SEK** och datum **2026-06-01**.
Använd 1280 × 850 CSS-bildpunkter, datorreferensen för fullständig
historikläsning. Smala motsvarigheter har egna fall nedan; verklig zoom
redovisas i HISTORIK-18.

**Separat förberedelse:** Kör
[fullständiga historiska värden](#fullständiga-historiska-värden) en gång
i ett nytt hushåll med tom karta och tomt utkast. Detta förbereder exakt
de värden som ska läsas; testet provar historikläsningen, inte skuldens
formulär. Återställ genom ett nytt provhushåll mellan körningar.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts), HISTORIK-06.

**Steg:**

1. Välj **Rapporter**. Hitta namnbytets kort först.
2. Fokusera **Visa ändringarna** och tryck Enter.
3. Läs båda namnen, beskrivningen, skulden, dess osäkerhet och datum.
4. Kontrollera tangentbordsåtkomst, synligt fokus och textens omflöde.

**Förväntat resultat:**

- Fullständiga värden går att läsa utan kartgrafik, ljud eller samtal.
- Uppgifterna skiljer belopp, osäkerhet och datum åt. Texten är läsbar
  vid smal bredd utan vågrät rullning av hela sidan.

### HISTORIK-07: återförsök bevarar ett senare fokusval

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/history.spec.ts",
    "caseId": "HISTORIK-07"
  },
  "reference": "1280×720; första historikbegäran avbryts och återförsöket fördröjs.",
  "outcomes": [
    "Återförsöket visar verkligt sparande utan att stjäla ett senare fokusval."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Återhämta en misslyckad historikhämtning utan påhittade resultat
eller flytt av användarens senare fokusval.

**Användare:** Alex Exempel.

**Förutsättningar:** Ett genomfört sparande, öppnad hushållskarta
och stängda Rapporter.

**Separat förberedelse:** Kör koden i
[styrd historikhämtning](#styrd-historikhämtning) i konsolen på hushållets
sida. Den avbryter första historikhämtningen innan servern och håller nästa
begäran tills `releaseHistoryRead()` körs. Ladda om efter fallet eller om
du avbryter innan svaret släpps.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts), testfallet
“HISTORIK-07: failed and delayed Reports reads preserve newer focus and retry
real saves”.

**Separat operatörsförberedelse:**

Följ [styrd historikhämtning](#styrd-historikhämtning). Installera kontrollen
före Rapporter i UI-steg 1. Första hämtningen avbryts före servern; nästa
verkliga svar hålls efter återförsöket. Bekräfta hållningen utan att släppa
svaret. Stäng konsolen före användarens senare fokusval i steg 3. Först i steg
4: kör `releaseHistoryRead()` i konsolen och meddela **Historiksvaret är
släppt**. Ladda om efter fallet eller avbrott enligt den befintliga
återställningen.

**Steg:**

1. Välj **Rapporter** med det förberedda engångsfelet. Läs felet.
2. Välj **Hämta historik igen**. Den förberedda andra begäran hålls.
3. Kontrollera fokus på historikens rubrik. Fokusera därefter **Tillbaka till
   arbetet** utan att aktivera knappen.
4. Be operatören släppa samma historiksvar och invänta bekräftelse. Läs det
   verkliga sparandets kort och kontrollera fokus.

**Förväntat resultat:**

- Felet erbjuder återförsök. Det lyckade svaret ersätter felet med
  ett verkligt sparande.
- Fokus stannar på det senare valda reglaget när svaret kommer.

## Direkt åtkomst och historiska typer

### HISTORIK-10: öppna ett utpekat sparande efter ändrad typdefinition

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/history.spec.ts",
    "caseId": "HISTORIK-10"
  },
  "reference": "1280×720; direktlänk efter sparad ändring av typbenämningen.",
  "outcomes": [
    "Utpekat sparande öppnas med fokus och sin historiska typbenämning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Läsa rätt historisk benämning genom en direktlänk.

**Användare:** Alex Exempel.

**Förutsättningar:** Lo Exempel är sparat. Ändra personens typbenämning
till **Dagens personbenämning** och spara definitionen separat.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts), testfallet
“HISTORIK-10: a direct save link reads historical types after their definitions
change”.

**Steg:**

1. Öppna **Rapporter**. Kopiera **Länk till sparandet** på kortet som
   lägger till Lo Exempel.
2. Öppna länken i en ny flik med samma inloggning och utan aktivt samtal.
3. Kontrollera fokus och öppnade före/efter-detaljer.
4. Läs objektets typbenämning och jämför den med dagens definition.

**Förväntat resultat:**

- Länken öppnar rätt sparande med detaljer och fokus på kortets rubrik.
- Kortet använder typdefinitionen från sparandet, även om dagens
  benämning är ändrad. Ingen AI eller medgivanderuta krävs.

### HISTORIK-11: privata väntande och avvisade sparförsök saknas i historiken

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/history.spec.ts",
    "caseId": "HISTORIK-11"
  },
  "reference": "1280×720; API-förberedda privata avvisade/väntande sparförsök, med automatisk återhämtning hållen före servern.",
  "outcomes": [
    "Bara genomförda sparanden visas; karta, utkast och sparförsök ändras inte av läsningen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skilja privata sparförsök från genomförda gemensamma sparanden.

**Användare:** Alex Exempel.

**Förutsättningar:** Ett genomfört sparande för **Lo Exempel** och
**Osparad person** i det egna utkastet. Skapa dem manuellt i ett nytt
provhushåll utan att starta ett samtal. Rapporter är stängda.

**Separat förberedelse:** Förbered först
[styrd objektleverans](map.md#styrd-objektleverans) för detta hushåll och
skriv `arm recover:before` innan koden för sparförsöken körs. Den håller
den automatiska kontrollen av det väntande försöket innan begäran når
servern. Kör därefter [privata sparförsök](#privata-sparförsök) på
hushållets sida. Koden skapar ett verkligt avvisat och ett väntande försök
via API utan att genomföra sparande. När båda statusarna är utskrivna,
ladda om hushållskartan så att arbetsytan upptäcker försöken. Vänta på
`held-before` för `recover` och låt begäran vara hållen genom hela fallet.
Att bara registrera ett väntande försök hindrar inte arbetsytans
automatiska kontroll från att senare genomföra sparandet.

Koden förbereder sparförsöken; transporten håller deras återhämtning.
Läsningen av Rapporter och Tabell ska inte själv ändra dem. Efter fallet,
stäng testprofilens flikar. Om transporten fortfarande visar `held-before`,
skriv `drop` så att den hållna begäran inte skickas till servern. Återställ
HTTPS-ingången innan `quit`. Använd en ny databas för nästa fall och ta
bort provdatabasen när installationen är avstängd.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts), HISTORIK-11.

**Steg:**

1. Välj **Rapporter** och läs **Ändringshistorik**.
2. Kontrollera att bara Lo Exempels genomförda sparande visas, utan
   Osparad person eller de förberedda försöken.
3. Välj **Tillbaka till arbetet → Tabell**. Kontrollera att
   Osparad person finns kvar i ditt arbete utan att spara eller kasta
   förslaget.
4. Avsluta enligt den separata förberedelsen medan återhämtningen
   fortfarande är hållen. Släpp inte fram begäran under kontrollerna.

**Förväntat resultat:**

- Historiken visar bara det genomförda sparandet. Väntande och avvisade
  försök samt det osparade objektet är inte historikposter.
- Historikläsningen ändrar varken karta, utkast eller sparförsök.
- Osparad person finns kvar i ditt utkast vid återgången medan den
  automatiska återhämtningen är hållen före servern.

### HISTORIK-12: följ sparlänkar och behåll pågående arbete

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/history.spec.ts",
    "caseId": "HISTORIK-12"
  },
  "reference": "1280×720; två sparlänkar och pekaråtergång med samtalsnotis.",
  "outcomes": [
    "Sökning, utkast och oskickad text bevaras; notisen hindrar inte återgång."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Öppna utpekade sparanden utan att tappa tabellsökningen,
det egna utkastet eller oskickad samtalstext.

**Användare:** Alex Exempel.

**Förutsättningar:** Två sparanden enligt förberedelsen och ett osparat
förslag för **Privat person**. Använd en provinstallation utan
konfigurerad samtalsleverantör för att kontrollera återgången med en
synlig samtalsnotis.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts), HISTORIK-12.
Referens: 1280 × 720 CSS-pixlar. Smala varianter har egna fall nedan.

**Steg:**

1. Öppna **Skriv till Skyttel**. Skriv ett meddelande utan att skicka det.
   Stäng textvyn. Om samtal inte är tillgängligt, låt notisen vara kvar.
2. Välj **Tabell** och sök efter **Lo Lind**.
3. Välj **Rapporter** och sedan **Länk till sparandet** på tilläggets kort.
   Läs uppgifterna och kontrollera fokus på sparandets rubrik.
4. Följ namnbytets länk på samma sätt. Kontrollera den nya länken i
   adressfältet och att rätt sparandes uppgifter öppnas.
5. Välj **Tillbaka till arbetet** med pekaren utan att först stänga
   samtalsnotisen. Öppna sedan textvyn igen.

**Förväntat resultat:**

- Varje sparlänk öppnar rätt detaljer och flyttar fokus till kortets rubrik.
- Återgången visar samma tabellsökning med fokus i sökfältet.
- En synlig samtalsnotis förblir läsbar och täcker inte återgångsknappen.
- Utkastet och det oskickade meddelandet är oförändrade. Besöket begär
  inget medgivande och skickar inget meddelande.

## Avvecklade fall

HISTORIK-02–05 och HISTORIK-08–09 är avvecklade med historisk ångring.
Deras identiteter återanvänds inte.

HISTORIK-13 är avvecklat utan ersättande motsvarighet. Därmed finns inget
inspekterat integrationstest som särskilt upptäcker att historisk ikontext
före och efter döljs bredvid en oförändrad profilbild. Andra bild- och
historikfall påstås inte ge samma skydd. Identiteten återanvänds inte.

## Smal historikläsning

Fallen behåller varsin fullständig variant av det ursprungliga arbetsflödet.
Ställ in CSS-storleken före stegen. Detta utför inte verklig webbläsarzoom,
fysisk touch eller skärmläsaruppläsning.

### HISTORIK-14: Läs fullständiga historiska värden vid 390px

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/history.spec.ts",
    "caseId": "HISTORIK-14"
  },
  "reference": "390×850; smal bredd skyddar omflöde och tangentbordsåtkomst till hela värden.",
  "outcomes": [
    "Namn, beskrivning, skuld, osäkerhet och datum visas utan vågrät sidrullning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Behålla fullständig tangentbordsläsning vid smal bredd.

**Användare:** Alex Exempel.

**Förutsättningar:** Ett nytt hushåll med HISTORIK-06:s två sparanden för
Familjeabonnemang, vid 390 × 850 CSS-bildpunkter.

**Separat förberedelse:** Kör
[fullständiga historiska värden](#fullständiga-historiska-värden) en gång
i det nya hushållet. Ladda om sidan innan stegen.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts), HISTORIK-14.

**Steg:**

1. Välj **Rapporter** vid den angivna bredden. Hitta namnbytets kort först.
2. Fokusera **Visa ändringarna** med tangentbord och tryck Enter en gång. Läs
   före- och eftervärdenas namn och beskrivning samt skuldens belopp,
   osäkerhet och datum.
3. Kontrollera synligt fokus och textens omflöde medan detaljerna är öppna.

**Förväntat resultat:**

- Samtliga historiska värden går att läsa utan kartgrafik, ljud eller
  samtal. Innehållet kräver ingen vågrät rullning av hela sidan.

### HISTORIK-15: Läs fullständiga historiska värden vid 320px

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/history.spec.ts",
    "caseId": "HISTORIK-15"
  },
  "reference": "320×850; smal bredd skyddar omflöde och tangentbordsåtkomst till hela värden.",
  "outcomes": [
    "Namn, beskrivning, skuld, osäkerhet och datum visas utan vågrät sidrullning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Behålla fullständig tangentbordsläsning vid smal bredd.

**Användare:** Alex Exempel.

**Förutsättningar:** Ett nytt hushåll med HISTORIK-06:s två sparanden för
Familjeabonnemang, vid 320 × 850 CSS-bildpunkter.

**Separat förberedelse:** Kör
[fullständiga historiska värden](#fullständiga-historiska-värden) en gång
i det nya hushållet. Ladda om sidan innan stegen.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts), HISTORIK-15.

**Steg:**

1. Välj **Rapporter** vid den angivna bredden. Hitta namnbytets kort först.
2. Fokusera **Visa ändringarna** med tangentbord och tryck Enter en gång. Läs
   före- och eftervärdenas namn och beskrivning samt skuldens belopp,
   osäkerhet och datum.
3. Kontrollera synligt fokus och textens omflöde medan detaljerna är öppna.

**Förväntat resultat:**

- Samtliga historiska värden går att läsa utan kartgrafik, ljud eller
  samtal. Innehållet kräver ingen vågrät rullning av hela sidan.

### HISTORIK-16: Bevara arbete genom sparlänkar vid 390px

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/history.spec.ts",
    "caseId": "HISTORIK-16"
  },
  "reference": "390×844; smal vy skyddar pekaråtergång förbi synlig samtalsnotis.",
  "outcomes": [
    "Båda sparlänkar öppnar rätt kort; sökning, fokus, utkast och oskickad text bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skydda återgångsknappen och pågående arbete i en smal vy.

**Användare:** Alex Exempel.

**Förutsättningar:** HISTORIK-12:s två sparanden och privata förslag.
Samtalsleverantör saknas. Använd 390 × 844 CSS-bildpunkter.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts), HISTORIK-16.

**Steg:**

1. Utför [HISTORIK-12](#historik-12-följ-sparlänkar-och-behåll-pågående-arbete),
   steg 1–5 en gång vid den angivna storleken. Under steg 3–4, medan
   Rapporter är öppna, följ båda sparlänkarna och kontrollera rätt kort
   och rubrikfokus. Under steg 5, innan återgången, kontrollera att
   notisen är läsbar och att den inte täcker **Tillbaka till arbetet**.
   Rulla vid behov, aktivera knappen med pekaren och öppna textvyn igen
   enligt samma steg.

**Förväntat resultat:**

- Notisen är läsbar och täcker inte återgångsknappen. Sökningen,
  sökfältets fokus, utkastet och oskickad text finns kvar.
- Ingen medgivanderuta öppnas och inget samtalsmeddelande skickas.

### HISTORIK-17: Bevara arbete genom sparlänkar vid 320px

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/history.spec.ts",
    "caseId": "HISTORIK-17"
  },
  "reference": "320×640; smal vy skyddar pekaråtergång förbi synlig samtalsnotis.",
  "outcomes": [
    "Båda sparlänkar öppnar rätt kort; sökning, fokus, utkast och oskickad text bevaras."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skydda återgångsknappen och pågående arbete i en smal vy.

**Användare:** Alex Exempel.

**Förutsättningar:** HISTORIK-12:s två sparanden och privata förslag.
Samtalsleverantör saknas. Använd 320 × 640 CSS-bildpunkter.

**Integrationstest:**
[history.spec.ts](../../tests/integration/history.spec.ts), HISTORIK-17.

**Steg:**

1. Utför [HISTORIK-12](#historik-12-följ-sparlänkar-och-behåll-pågående-arbete),
   steg 1–5 en gång vid den angivna storleken. Under steg 3–4, medan
   Rapporter är öppna, följ båda sparlänkarna och kontrollera rätt kort
   och rubrikfokus. Under steg 5, innan återgången, kontrollera att
   notisen är läsbar och att den inte täcker **Tillbaka till arbetet**.
   Rulla vid behov, aktivera knappen med pekaren och öppna textvyn igen
   enligt samma steg.

**Förväntat resultat:**

- Notisen är läsbar och täcker inte återgångsknappen. Sökningen,
  sökfältets fokus, utkastet och oskickad text finns kvar.
- Ingen medgivanderuta öppnas och inget samtalsmeddelande skickas.

## Fria egenskaper och historiska betydelser

### Fria historiska egenskaper

Kör i konsolen på ett nytt provhushålls sida. Koden skapar två sparanden
med fria egenskaper och ändrade typförklaringar. Därefter tar den bort
objekten och deras egna typer ur den aktuella kartan. Ladda om sidan
innan UTKAST-157. Använd ett nytt hushåll för varje körning.

```javascript
await (async () => {
  const householdId = location.pathname.match(/households\/([^/]+)/)?.[1];
  if (!householdId) throw new Error('Öppna provhushållets karta');
  const path = `/api/households/${householdId}/map`;
  const read = async () => (await fetch(path)).json();
  const initial = await read();
  if (initial.objects.length || initial.relationships.length ||
      ['changes', 'relationships', 'objectTypes', 'relationshipTypes']
        .some(key => initial.draft[key]?.length))
    throw new Error('Använd ett nytt hushåll med tom karta och tomt utkast');
  const build = await (await fetch('/api/version')).json();
  const headers = { 'Content-Type': 'application/json',
    'X-Skyttel-Build': `${build.commit}:${build.version}` };
  const post = async (route, value) => {
    const state = await read();
    const response = await fetch(`${path}/${route}`, {
      method: 'POST', headers,
      body: JSON.stringify({ version: state.draft.version, ...value }) });
    if (!response.ok) throw new Error(`Förberedelsen misslyckades: ${route}`);
    return response.json();
  };
  const properties = [
    { id: 'zero', label: 'Samma', kind: 'number', value: 0 },
    { id: 'false', label: 'Samma', kind: 'boolean', value: false },
    { id: 'typed-empty', label: 'Väntar', kind: 'date' },
    { id: 'untyped', label: 'Väntar' },
    { id: 'blank', label: 'Anteckning', kind: 'text', value: '' },
  ];
  const objectType = {
    name: 'Växt', description: 'Odling i hemmet',
  };
  const edgeType = { name: 'Stödjer', description: 'Hjälp vid odling',
    forwardLabel: 'stödjer', reverseLabel: 'stöds av' };
  await post('object-type', {
    id: 'plant', baseRevision: null, value: objectType });
  await post('relationship-type', {
    id: 'supports', baseRevision: null, value: edgeType });
  for (const [id, name] of [['lo', 'Lo'], ['rose', 'Rosen']])
    await post('draft', { id, baseRevision: null,
      value: { typeId: 'plant', name,
        ...(id === 'rose' ? { properties } : {}) } });
  const edge = { typeId: 'supports', sourceId: 'lo', targetId: 'rose',
    properties };
  await post('relationship', { id: 'edge', baseRevision: null, value: edge });
  await post('save', { operationId: 'properties-created' });
  const after = [properties[1],
    { id: 'zero', label: 'Antal', kind: 'text', value: 'Noll' },
    properties[3], properties[2]];
  await post('draft', { id: 'rose', baseRevision: 1,
    value: { typeId: 'plant', name: 'Rosen',
      properties: after } });
  await post('relationship', { id: 'edge', baseRevision: 1,
    value: { ...edge, properties: after } });
  await post('object-type', { id: 'plant', baseRevision: 1,
    value: { ...objectType, description: 'Prydnadsväxter' } });
  await post('relationship-type', { id: 'supports', baseRevision: 1,
    value: { ...edgeType, description: 'Dagens omvårdnad',
      forwardLabel: 'vårdar', reverseLabel: 'vårdas av' } });
  await post('save', { operationId: 'properties-changed' });
  for (const [route, id, baseRevision] of [
    ['draft', 'lo', 1], ['draft', 'rose', 2],
    ['object-type', 'plant', 2], ['relationship-type', 'supports', 2],
  ]) await post(route, { id, baseRevision, value: null });
  await post('save', { operationId: 'properties-removed' });
  console.log('Historik för UTKAST-157 är förberedd');
})();
```

### UTKAST-157: läs egenskapernas identiteter och dåvarande betydelser

**Syfte:** Skilja egenskaper med upprepade etiketter åt genom ändrad
ordning, namn och datatyp, även när objekten och typerna är borttagna.

**Användare:** Alex Exempel, med aktuell tillgång till provhushållet.

**Förutsättningar:** Kör
[Fria historiska egenskaper](#fria-historiska-egenskaper) i ett nytt
hushåll. Använd 320 × 850 CSS-bildpunkter och ljust tema.

**Automatiskt motsvarande webbläsartest:**
[property-history.test.tsx](../../tests/browser/property-history.test.tsx),
UTKAST-157. Chromium-testet använder kontrollerade historiksvar och riktiga
produktionsstilar. Det bevisar läsning och tangentbordsarbete; separat
HTTP-underlag provar beständighet, förlorat svar och omstart mot SQLite.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": { "runner": "vitest", "suite": "browser", "spec": "tests/browser/property-history.test.tsx", "caseId": "UTKAST-157" },
  "reference": "320×850, ljust tema. Kontrollerat historiksvar med båda sidor av ett objekt och ett samband; upprepade etiketter, ändrad ordning, namn och datatyp samt borttagen egenskap. Riktig HTTP/SQLite verifieras separat.",
  "outcomes": [
    "Visa ändringarna öppnas med Enter och behåller fokus. Båda sidors egenskapslistor visar ordning, identiteter, noll, Nej, tomt datum, tomt utan datatyp och tom text.",
    "Antal med textvärdet Noll behåller identiteten zero efter flytt och namnbyte. Anteckning saknas efter sparandet. Typbeskrivningar och båda riktningsbetydelser läses i dåvarande sammanhang utan vågrät sidrullning."
  ],
  "evidence": [
    { "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/property-save-recovery-http.test.ts", "title": "a lost mixed-property save reply replays the exact atomic history and receipt after restart", "purpose": "Verklig HTTP/SQLite, förlorat svar efter transaktionen, omstart, exakt replay, historiska typförklaringar och borttagning utan återinförande." },
    { "kind": "technical", "runner": "vitest", "suite": "server", "spec": "tests/unit/server/operations.test.ts", "title": "a failed durable write leaves a discoverable pending operation and an intact draft", "purpose": "Avbruten kvittoskrivning rullar tillbaka både objekt och samband med hela egenskapslistor; samma försök sparar atomiskt efter omstart." }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Rapporter** och hitta kortet för egenskapsändringen. Kontrollera
   **Alex Exempel** och tidpunkten. Använd **Identifiera sparandet och
   användaren** om kortet behöver skiljas från borttagningen.
2. Fokusera **Visa ändringarna** med tangentbord och tryck Enter. Kontrollera
   att fokus ligger kvar på reglaget.
3. Läs Rosens och sambandets listor före sparandet. Kontrollera ordningen
   **Samma: 0 (Tal)**, **Samma: Nej (Ja/nej)**, **Väntar: Tomt (Datum)**,
   **Väntar: Tomt (ingen datatyp)** och **Anteckning: Tom text (Text)**.
   Läs identiteterna på varje rad.
4. Läs båda listorna efter sparandet. Kontrollera ordningen **Samma: Nej**,
   **Antal: Noll (Text)**, tomt utan datatyp och tomt datum. **Antal** har
   samma identitet `zero` som det tidigare talvärdet. **Anteckning**
   finns bara före sparandet.
5. Läs typförklaringarna **Odling i hemmet → Prydnadsväxter** och
   **Hjälp vid odling → Dagens omvårdnad**. Läs sambandets tidigare
   **stödjer / stöds av** och senare **vårdar / vårdas av**.

**Förväntat resultat:**

- Ordning, identiteter, etiketter, datatyper och värden går att läsa för
  både objekt och samband med tangentbord utan vågrät sidrullning.
- Historiken visar båda sidors dåvarande typförklaringar och riktning.
  Läsningen återinför inga objekt, samband eller typer i den aktuella kartan.
- Kontrollerade webbläsarsvar bevisar inte beständigt sparande. Det
  separata serverunderlaget provar även oförändrade äldre historikposter
  efter borttagning och identiskt kvitto efter omstart och återförsök.

## Separat felberedning

### Fullständiga historiska värden

Öppna ett nytt hushåll med tom karta och tomt utkast. Kör i konsolen på
hushållets sida. Koden förbereder två genomförda sparanden med samma
historiska uppgifter som integrationstestet, utan samtalsleverantör.
Ladda om sidan efter kommandot. Kör inte detta i ett vanligt hushåll.

```javascript
await (async () => {
  const householdId = location.pathname.match(/households\/([^/]+)/)?.[1];
  if (!householdId) throw new Error('Öppna provhushållets karta');
  const path = `/api/households/${householdId}/map`;
  const read = async () => (await fetch(path)).json();
  const initial = await read();
  if ((initial.objects ?? []).length || (initial.relationships ?? []).length ||
      ['changes', 'relationships', 'objectTypes', 'relationshipTypes']
        .some(key => (initial.draft[key] ?? []).length))
    throw new Error('Använd ett nytt hushåll med tom karta och tomt utkast');
  const build = await (await fetch('/api/version')).json();
  const headers = { 'Content-Type': 'application/json',
    'X-Skyttel-Build': `${build.commit}:${build.version}` };
  const post = async (route, value) => {
    const response = await fetch(`${path}/${route}`, {
      method: 'POST', headers, body: JSON.stringify(value) });
    if (!response.ok) throw new Error(`Förberedelsen misslyckades: ${route}`);
    return response.json();
  };
  for (const [name, operationId] of [
    ['Familjeabonnemang', 'initial'], ['Musik för familjen', 'rename'],
  ]) {
    const state = await read();
    const before = (state.objects ?? []).find(item => item.id === 'subscription');
    await post('draft', { version: state.draft.version, id: 'subscription',
      baseRevision: before?.revision ?? null,
      value: { typeId: initial.types[0].id, ...before, name, properties: [
        { id: 'description', label: 'Beskrivning', kind: 'text',
          value: 'Hushållets musik' },
        { id: 'debt', label: 'Senast uppgiven skuld', kind: 'text',
          value: '1 200 SEK' },
        { id: 'certainty', label: 'Osäkert uppgivet', kind: 'boolean',
          value: true },
        { id: 'reportedOn', label: 'Datum för uppgiften', kind: 'date',
          value: '2026-06-01' }
      ] } });
    await post('save', { version: (await read()).draft.version, operationId });
  }
  console.log('Två historiska sparanden är förberedda');
})();
```

### Styrd historikhämtning

Kör på hushållets sida före HISTORIK-07. Koden gäller bara nästa två
historikbegäranden. Ladda om sidan efter kontrollen.

```javascript
(() => {
  const originalFetch = window.fetch.bind(window);
  let reads = 0;
  window.fetch = async (...args) => {
    const target = args[0] instanceof Request ? args[0].url : args[0];
    const method = args[1]?.method ?? args[0]?.method ?? 'GET';
    if (method === 'GET' &&
        new URL(target, location.href).pathname.endsWith('/map/history')) {
      reads += 1;
      if (reads === 1) throw new TypeError('Förberett historikfel');
      if (reads === 2) {
        window.fetch = originalFetch;
        await new Promise(resolve => { window.releaseHistoryRead = resolve; });
      }
    }
    return originalFetch(...args);
  };
})();
```

### Privata sparförsök

Kör en gång i HISTORIK-11:s isolerade hushåll med **Lo Exempel** sparad
och **Osparad person** i utkastet. Kommandot avbryts om utgångsläget
saknas. De två försöken använder provnamn; skapa ett nytt hushåll mellan
körningarna. Armera `recover:before` enligt fallet innan kommandot körs.
Koden sparar inga förslag i den gemensamma kartan; efter registreringen
behöver den automatiska återhämtningen fortsätta vara hållen.

```javascript
await (async () => {
  const householdId = location.pathname.match(/households\/([^/]+)/)?.[1];
  if (!householdId) throw new Error('Öppna provhushållets karta');
  const path = `/api/households/${householdId}/map`;
  const state = await (await fetch(path)).json();
  if (!(state.objects ?? []).some(item => item.name === 'Lo Exempel') ||
      !(state.draft.changes ?? []).some(item => item.after?.name === 'Osparad person'))
    throw new Error('Förbered sparad Lo Exempel och Osparad person i utkastet');
  const build = await (await fetch('/api/version')).json();
  const headers = { 'Content-Type': 'application/json',
    'X-Skyttel-Build': `${build.commit}:${build.version}` };
  for (const [operationId, version, expected] of [
    ['private-rejected', state.draft.version - 1, 'rejected'],
    ['private-pending', state.draft.version, 'pending'],
  ]) {
    const response = await fetch(`${path}/operations`, { method: 'POST', headers,
      body: JSON.stringify({ operationId, version,
        contentVersion: state.contentVersion }) });
    const result = await response.json();
    if (!response.ok || result.operation?.status !== expected)
      throw new Error(`Förberedelsen misslyckades: ${operationId}`);
    console.log(operationId, result.operation.status);
  }
})();
```

## Identiteter och mänsklig observation

HISTORIK-06 behåller 1280px; dess smala varianter får HISTORIK-14–15.
HISTORIK-12 behåller 1280px; dess smala varianter får HISTORIK-16–17.
Alla befintliga kontroller i dessa varianter finns kvar.

### HISTORIK-18: Läs historiska värden med verklig webbläsarzoom

**Syfte:** Kontrollera verklig zoom med tangentbord på testdatorn.

**Användare:** Alex Exempel.

**Förutsättningar:** HISTORIK-06:s sparanden och en vanlig datorwebbläsare.

**Kräver mänsklig observation:** Använd webbläsarens verkliga zoomreglage
och fysiska tangentbord. Kontrollera att text och fokus går att läsa vid
200 och 400 procent. CSS-storlekarna i integrationstesterna utför inte
denna observation.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Använd verklig webbläsarzoom och fysiskt tangentbord; läs historiska värden och synligt fokus vid 200 och 400 procent."
  },
  "reference": "Datorwebbläsare, 200 och 400 procent verklig zoom.",
  "outcomes": ["Alla historiska värden är läsbara och kan öppnas med tangentbord."],
  "evidence": [{
    "kind": "overlap", "spec": "tests/integration/history.spec.ts",
    "caseId": "HISTORIK-15", "purpose": "Automatiskt omflöde vid 320px, utan verklig zoom."
  }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ in 200 procents zoom i webbläsaren. Välj **Rapporter**,
   tabba till namnbytets **Visa ändringarna** och tryck Enter.
2. Läs båda namnen, beskrivningen, skuldens belopp, osäkerhet och datum.
   Kontrollera synligt fokus och rullning till hela texten.
3. Stäng detaljerna med **Visa ändringarna**. Ställ in 400 procent och
   fokusera samma reglage med tangentbord. Tryck Enter en gång för att
   öppna detaljerna och läs värdena enligt steg 2 igen.
4. Återställ zoom till 100 procent.

**Förväntat resultat:**

- Samtliga värden kan läsas och öppnas utan att först minska zoomen.
  Ingen vågrät sidrullning eller täckande kontroll hindrar läsningen.
