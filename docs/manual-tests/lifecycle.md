# Manuella testfall för upphört och borttaget innehåll

Testfallen gäller status, slutdatum och vanlig borttagning i privata utkast.
Upphört finns kvar med avslutad giltighet. Borttaget lämnar den aktuella
kartan men har tidigare värden i historiken. Dessa fall utför ingen
permanent radering; dess oåterkalleliga omfattning provas separat i
[raderingsfallen](household-erasure.md).
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Separat HTTP-underlag

[lifecycle-http.test.ts](../../tests/unit/server/lifecycle-http.test.ts)
kör det direkta datum- och sambandsscenariot i Vitests serversvit. Det
använder autentiserade HTTP-anrop till en verklig lokal installation och
SQLite, med samma session och databas genom faktisk omstart. LIVSCYKEL-02
och LIVSCYKEL-06 behåller sina ordinarie webbläsarfall; HTTP-underlaget
ersätter ingen formulärkontroll eller mänsklig observation.

Det tekniska scenariot byter svit med oförändrad titel och fullständiga
kontroller av kända och osäkra datum, tidigare och föreslagna samband,
privat utkast och historik efter omstart. En integrationsexekvering
flyttas till serversviten; inget arbetsflöde eller fall-ID avvecklas.
Upphört och borttaget behåller sina olika betydelser och ordinarie fall.

## Konfigurerade användare

Använd den konfigurerade administratören i en separat testinstallation.
Logga in genom den konfigurerade identitetsleverantören enligt
[installationsguiden](../operations/installation.md).
Samma kartarbete är tillgängligt för en vanlig hushållsmedlem.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

För samband, öppna **Tabell**, välj **Samband för** objektet och
**Redigera samband** vid kopplingen. **Lägg i utkastet** skickar hela
formuläret. Välj **Stäng samband** innan du sparar eller fortsätter med
annat arbete. Objekt öppnas för redigering från Tabell eller objektets
uppgifter. Vid kontroll i kartan, öppna **Filter** bredvid sökfältet och
välj **Ta med upphörda**, även efter omladdning, för att se upphörda
objekt och samband. För kontroll i Tabell, öppna dess **Filter**, välj
**Ta med upphörda** och stäng filterdialogen med krysset.

Fullständiga förslag läses genom **Skriv till Skyttel → Visa utkastet →
Visa förslaget: [namn]**. Stäng läsningen med krysset. Utkastets sparikon
öppnar **Spara utkastet**; vänta på **Utkastet är sparat** och stäng
textvyn före nästa arbete i Tabell eller Karta.

1. Använd ett tomt testhushåll med påhittade uppgifter enligt
   [familjeabonnemanget](../user-guide/family-subscription.md).
2. Skapa abonnemanget **Familjemusik**, personen **Lo Exempel** och tjänsten
   **Molnmusik**. Lägg dem i utkastet och spara hela utkastet.
3. Skapa sambanden **Lo Exempel → Använder → Familjemusik** och
   **Familjemusik → Använder → Molnmusik**. Spara hela utkastet.
4. Använd ett nytt testhushåll för varje fall. Behåll samma databas när
   appen startas om inom ett fall. Läs
   [livscykelguiden](../user-guide/lifecycle.md) för begrepp och datumgräns.

## Separat förberedelse av överlappande identiteter

LIVSCYKEL-05 och LIVSCYKEL-06 använder giltiga identifierare som kan
kollidera i ett tillgänglighetsnamn om objekt och samband blandas ihop.
Vanlig namnlikhet provar inte denna tekniska gräns. Efter Allmän
förberedelse, innan respektive UI-flöde, öppna Console i det nya
provhushållet. Kör följande gemensamma förberedelse. Indata är det aktiva
hushållets URL och exakt de tre unika testobjekten ovan.

```js
const lifecyclePath = `/api${location.pathname}/map`;
const lifecycleRead = async () => (await fetch(lifecyclePath)).json();
const lifecyclePost = async (route, data) => {
  const state = await lifecycleRead();
  const reply = await fetch(`${lifecyclePath}/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: state.draft.version,
      contentVersion: state.contentVersion, ...data })
  });
  if (!reply.ok) throw new Error(`Preparation failed: ${reply.status}`);
};
const lifecycleState = await lifecycleRead();
const lifecycleLo = lifecycleState.objects.find(x => x.name === 'Lo Exempel');
const lifecycleMusic = lifecycleState.objects.find(x => x.name === 'Familjemusik');
const lifecycleService = lifecycleState.objects.find(x => x.name === 'Molnmusik');
if (!lifecycleLo || !lifecycleMusic || !lifecycleService)
  throw new Error('Missing named lifecycle test objects');
const lifecycleIncoming = lifecycleState.relationships.find(x =>
  x.sourceId === lifecycleLo.id && x.targetId === lifecycleMusic.id);
if (!lifecycleIncoming) throw new Error('Missing incoming relationship');
```

För LIVSCYKEL-05 kör sedan:

```js
await lifecyclePost('draft', {
  id: `relationship-${lifecycleIncoming.id}`, baseRevision: null,
  value: { name: 'Kim Exempel',
    typeId: lifecycleLo.typeId, lifecycle: 'active',
    properties: [{ id: 'endDate', label: 'Slutdatum',
      kind: 'date', value: '2000-01-01' }] }
});
await lifecyclePost('relationship', {
  id: lifecycleIncoming.id, baseRevision: lifecycleIncoming.revision,
  value: { ...lifecycleIncoming, lifecycle: 'ended' }
});
```

För LIVSCYKEL-06 kör i stället:

Utgå direkt från Allmän förberedelses två sparade samband. Denna kod
skapar det separata sambandet från Molnmusik till Lo; skapa det enbart här.

```js
await lifecyclePost('relationship', {
  id: lifecycleIncoming.id, baseRevision: lifecycleIncoming.revision,
  value: { ...lifecycleIncoming, lifecycle: 'ended',
    properties: [{ id: 'endDate', label: 'Slutdatum',
      kind: 'date', value: '2000-01-01' }] }
});
await lifecyclePost('relationship', {
  id: `previous-${lifecycleIncoming.id}`, baseRevision: null,
  value: { sourceId: lifecycleService.id, targetId: lifecycleLo.id,
    typeId: lifecycleState.relationshipTypes.find(x => x.name === 'Betalar').id,
    lifecycle: 'active',
    properties: [{ id: 'endDate', label: 'Slutdatum',
      kind: 'date', value: '2000-01-01' }] }
});
```

Ladda om sidan, granska fullständiga förslag och spara hela utkastet genom
UI. Förväntat: de namngivna uppgifterna är gemensamt sparade och utkastet
är tomt. Skapa sedan det privata arbetet för LIVSCYKEL-05 enligt fallet.
Avsluta och återställ genom att ta bort endast det separata provhushållet
enligt Allmän förberedelse. Inga internidentifierare läses i UI-stegen.

## Status

### LIVSCYKEL-01: upphört innehåll finns kvar och kan rättas separat

**Syfte:** Kontrollera att status inte sprids till anslutna uppgifter.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** De sparade objekten och sambanden ovan, utan slutdatum.

**Integrationstest:**
[lifecycle.spec.ts](../../tests/integration/lifecycle.spec.ts),
testfallet “LIVSCYKEL-01: ended objects and relationships stay visible and
independently correctable”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/lifecycle.spec.ts",
    "caseId": "LIVSCYKEL-01"
  },
  "reference": "1280 × 720; Chromium; syntetiska identiteter och verklig SQLite",
  "outcomes": [
    "Upphört objekt finns kvar efter omstart. Sambanden behåller sina egna statusval.",
    "Native rättelse av objektet gör det gällande utan att rätta det upphörda sambandet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Tabell → Filter**, välj **Ta med upphörda** och stäng
   filterdialogen. Välj **Redigera Familjemusik** i objektets rad.
   Öppna **Livscykel och utseende** och välj **Upphört** under
   **Objektets status**. Välj **Lägg i utkastet och stäng** och granska
   utkastet. Läs alla rader med Visa förslaget före sparandet.
2. Välj **Spara hela utkastet**. Starta om appen med samma databas och
   ladda om sidan. Välj **Ta med upphörda** igen i Tabellens filter.
   Kontrollera objekten och sambanden.
3. Öppna **Lo Exempel → Använder → Familjemusik**, välj **Upphört** under
   **Sambandets status**, lägg sambandet i utkastet med tangentbordet,
   välj **Stäng samband** och spara.
4. Välj **Redigera Familjemusik** i Tabell och
   **Livscykel och utseende**. Välj **Gäller fortfarande** under
   **Objektets status** och **Lägg i utkastet och stäng**. Spara hela
   utkastet och ladda om sidan. Välj **Ta med upphörda** igen för att
   kontrollera det fortfarande upphörda sambandet.

**Förväntat resultat:**

- Förslaget visar Upphört med text och orange markering, skild från
  förslagets markering. Den sparade kartans status är ännu oförändrad.
- Efter omstart finns Familjemusik kvar med Upphört. Andra objekt och
  samband har oförändrad status och kan fortfarande öppnas.
- Det markerade sambandet blir upphört utan att det andra sambandet ändras.
- Rättelsen gör Familjemusik gällande. Sambandet från Lo är fortsatt upphört.

### LIVSCYKEL-02: Slutdatum är en egenskap och status väljs uttryckligen

**Syfte:** Kontrollera att ett passerat datum saknar automatisk verkan.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** De sparade objekten och sambanden ovan.

**Automatiskt motsvarande test:**
[lifecycle.spec.ts](../../tests/integration/lifecycle.spec.ts), LIVSCYKEL-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/lifecycle.spec.ts",
    "caseId": "LIVSCYKEL-02"
  },
  "reference": "Syntetiskt hushåll, verklig SQLite och serveromstart; datum 2000-01-01 är en vanlig fri egenskap.",
  "outcomes": [
    "Slutdatum behåller sitt värde utan att ändra aktiv status eller filtrering.",
    "Uttryckligt Upphört består efter sparande och omstart; Gäller fortfarande kan föreslås med datumet kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Redigera Familjemusik. Lägg till egenskapen Slutdatum med datatyp
   Datum och värde 2000-01-01. Lägg i utkastet och stäng. Läs datumet
   och Gäller fortfarande i tabellens fullständiga detaljer.
2. Läs alla förslag och spara hela utkastet. Redigera Familjemusik igen,
   öppna Livscykel och utseende och välj Objektets status Upphört.
   Lägg i utkastet, läs förslagen och spara hela utkastet.
3. Starta om appen med samma databas och ladda om. Öppna Tabell och
   kontrollera att Familjemusik döljs av standardfiltret. Ta med upphörda
   och läs Manuellt upphört i objektets fullständiga detaljer.
4. Redigera objektet och välj Gäller fortfarande. Lägg i utkastet och
   läs både statusen och det oförändrade datumvärdet.

**Förväntat resultat:**

- Datumet ändrar aldrig status. Status Upphört kräver uttryckligt val.
- Statusen består efter sparande och omstart. Filter använder statusen.
- Återgång till Gäller fortfarande bevarar Slutdatum och övriga egenskaper.

### LIVSCYKEL-04: kartans sambandsstatus är åtkomlig med tangentbord

**Syfte:** Kontrollera att kartans samband förmedlar samma status genom
synlig text och kontrollens tillgängliga beskrivning.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** De sparade objekten och sambanden ovan. Ange ett känt
slutdatum **2000-01-01** för båda sambanden. Välj **Upphört** för
sambandet från Lo till Familjemusik och **Gäller fortfarande** för
sambandet från Familjemusik till Molnmusik. Spara hela utkastet.

Skapa dessutom objektet **Privat livscykelanteckning**, typ Person,
med beskrivningen **Hela mitt oberoende privata arbete** genom Nytt objekt.
Lägg i utkastet och stäng utan att spara. Läs hela förslaget före steg 1.

**Integrationstest:**
[lifecycle.spec.ts](../../tests/integration/lifecycle.spec.ts),
testfallet “LIVSCYKEL-04: keyboard relationship targets expose ended status
without changing saved facts”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/lifecycle.spec.ts",
    "caseId": "LIVSCYKEL-04"
  },
  "reference": "1280 × 720; Chromium; syntetiska identiteter och verklig SQLite",
  "outcomes": [
    "Kartans samband förmedlar rätt effektiv status och datum genom text och tillgängliga beskrivningar.",
    "Tangentbordsfokus och aktivering fungerar före och efter omstart utan ändring av sparade fakta eller oberoende privat arbete."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse och tekniskt underlag:**

När användaren har nått Lo-sambandet med Tab och Skift+Tab i steg 2,
läser operatören båda sambandens tillgängliga beskrivningar med
webbläsarens tillgänglighetsinspektör. Lo-sambandets namn behåller
**Lo Exempel → Använder → Familjemusik** och beskrivningen anger
**Upphört**; det andra sambandet behåller sin egen riktning och saknar
Upphört. Anteckna hela läsningen separat och bekräfta den före Alt+Enter.
Efter användarens läsning av Valt samband startar operatören om samma
app med samma databas och bekräftar omstarten före omladdningen i steg 4.
Efter den nya kartans synliga läsning upprepar operatören samma två
Inspector-läsningar och bekräftar dem före det privata förslaget i steg 5.
Detta är tekniskt underlag; faktisk uppläsning provas i LIVSCYKEL-07.

**Steg:**

1. Öppna kartan och välj **Alla etiketter**. Kontrollera de två sambanden.
2. Använd Tab och Skift+Tab för att nå sambandet från Lo till Familjemusik.
   Kontrollera synligt fokus. Be operatören läsa de separata beskrivningarna
   och invänta bekräftelse enligt förberedelsen.
3. Tryck Alt+Enter på sambandet.
   Läs **Valt samband** utan att redigera eller spara något.
4. Be operatören starta om appen med samma databas och invänta bekräftelse.
   Ladda om sidan och öppna kartan igen. Kontrollera båda sambandens namn,
   riktning och synliga status. Be operatören upprepa den separata läsningen
   och invänta bekräftelse.

5. Öppna Utkast efter omstart och läs Privat livscykelanteckning genom
   Visa förslaget. Hela den oberoende beskrivningen finns kvar och är osparad.

**Förväntat resultat:**

- Sambandet från Lo visar **Upphört** med text och samma uppgift finns i
  kontrollens tillgängliga beskrivning. Dess namn behåller båda objekten
  och riktningen **Lo Exempel → Använder → Familjemusik**.
- Sambandet till Molnmusik saknar markeringen Upphört eftersom det
  uttryckliga statusvalet är Gäller fortfarande.
- Tangentbordets fokus är synligt och kontrollen går att aktivera.
  Detaljerna visar **Manuellt upphört**, **2000-01-01** och **Upphört**.
- Samma status består efter omstart. Inget nytt förslag eller sparande
  uppstår av visningen. Automationen jämför hela kartunderlaget via HTTP.
- Automationen kontrollerar webbläsarens tillgängliga beskrivning och
  fokus. Faktiska skärmläsarprov dokumenteras separat när de utförs.

### LIVSCYKEL-05: objekt och samband behåller sina egna beskrivningar

**Syfte:** Kontrollera att namn, typ och status för ett objekt inte ersätts
av ett annat sambands uppgifter i hjälpmedel.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** De sparade objekten och sambanden ovan. Lägg till
personen **Kim Exempel** med känt slutdatum **2000-01-01** och status
**Gäller fortfarande** genom den separata förberedelsen ovan. Förberedelsen
anger också Upphört för sambandet från Lo till Familjemusik. Spara enligt
förberedelsen; gör inte ett extra sparande. Automationen väljer de giltiga
identifierarna `relationship-incoming` för Kim och `incoming` för sambandet
genom det publika API:et för att prova att beskrivningarna hålls åtskilda.

Skapa dessutom objektet **Privat livscykelanteckning**, typ Person,
med beskrivningen **Hela mitt oberoende privata arbete** genom Nytt objekt.
Lägg i utkastet och stäng utan att spara. Läs hela förslaget före steg 1.

**Integrationstest:**
[lifecycle.spec.ts](../../tests/integration/lifecycle.spec.ts),
testfallet “LIVSCYKEL-05: object and relationship descriptions remain
distinct for valid overlapping identities”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/lifecycle.spec.ts",
    "caseId": "LIVSCYKEL-05"
  },
  "reference": "1280 × 720; Chromium; syntetiska identiteter och verklig SQLite",
  "outcomes": [
    "Kim och sambandets giltigt överlappande identiteter behåller sina egna namn, typ och effektiva status.",
    "Visning och omstart bevarar sparade uppgifter och ett fullständigt oberoende privat förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse och tekniskt underlag:**

Behåll den befintliga förberedelsen av överlappande identiteter och det
oberoende privata arbetet. Vid steg 2 läser operatören Kims namnetikett
och objektsymbol med webbläsarens tillgänglighetsinspektör. Båda
beskrivningarna anger **Kim Exempel** och **Person** utan Upphört eller
det andra sambandets uppgifter. Vid steg 3 läser operatören beskrivningen
för **Lo Exempel → Använder → Familjemusik**, som anger **Upphört**.
Anteckna varje fullständig läsning separat och bekräfta den för användaren.
Först därefter startar operatören om samma app med samma databas och
bekräftar omstarten före omladdningen i steg 4. Efter användarens nya
synliga läsning upprepas alla tre Inspector-läsningar och bekräftas före
det privata förslaget i steg 5. Faktisk uppläsning provas i LIVSCYKEL-08.

**Steg:**

1. Öppna kartan och välj **Alla etiketter**. Kontrollera Kim och sambandet
   från Lo till Familjemusik.
2. Läs Kims namn, typ och synliga status. Be operatören läsa de separata
   beskrivningarna för namnetiketten och objektsymbolen och invänta bekräftelse.
3. Läs hela riktningen och Upphört för sambandet från Lo till Familjemusik.
   Be operatören läsa dess separata beskrivning och invänta bekräftelse.
4. Be operatören starta om appen med samma databas och invänta bekräftelse.
   Ladda om kartan och kontrollera samma fullständiga namn, typ, riktning och
   synliga status igen. Be operatören upprepa de separata läsningarna och
   invänta bekräftelse.

5. Öppna Utkast efter omstart och läs Privat livscykelanteckning genom
   Visa förslaget. Hela den oberoende beskrivningen finns kvar och är osparad.

**Förväntat resultat:**

- Båda kontrollerna för Kim beskriver **Kim Exempel** och typen **Person**.
  De anger inte Upphört och visar inte det andra sambandets uppgifter.
- Sambandet visar **Upphört** både med text och i sin tillgängliga beskrivning.
- Samma namn, typ och status består efter omstart. Visningen ändrar inga
  sparade uppgifter eller privata förslag; automationen jämför hela underlaget.
- Automationen kontrollerar tillgängliga beskrivningar i webbläsaren.
  Faktiska skärmläsarprov dokumenteras separat när de utförs.

### LIVSCYKEL-06: aktuella och tidigare samband behåller sin egen status

**Syfte:** Kontrollera att ett tidigare sambands beskrivning behåller dess
namn och status när utkastet ändrar sambandet och andra samband visas samtidigt.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** Utför Allmän förberedelse i ett nytt hushåll: tre
objekt och exakt två samband, sparade genom de ordinarie formulären.
Kör därefter den gemensamma Console-förberedelsen och endast dess kod för
LIVSCYKEL-06. Den anger känt slutdatum **2000-01-01** och **Upphört**
för Lo → Använder → Familjemusik och skapar
**Molnmusik → Betalar → Lo Exempel** med samma slutdatum och
**Gäller fortfarande**. Läs de fullständiga förslagen och spara dem genom
Utkast. Detta är hela förberedelsen; skapa inget extra samband mellan
Molnmusik och Lo. De överlappande identiteterna ska komma från detta enda
Console-steg, följt av UI-granskningen och sparandet.

**Integrationstest:**
[lifecycle.spec.ts](../../tests/integration/lifecycle.spec.ts),
testfallet “LIVSCYKEL-06: current and previous relationships retain their
own accessible status”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/lifecycle.spec.ts",
    "caseId": "LIVSCYKEL-06"
  },
  "reference": "1280 × 720; Chromium; syntetiska identiteter och verklig SQLite",
  "outcomes": [
    "Native ändring av Från, typ och status behåller slutdatum; hela förslaget kan läsas utan gemensamt sparande.",
    "Tidigare, föreslaget och separat sparat samband behåller egna riktningar och status efter omstart."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/lifecycle-http.test.ts",
      "title": "direct lifecycle date and current-versus-previous staging preserves original public request guards",
      "purpose": "Autentiserade HTTP-anrop med verklig SQLite och faktisk omstart bevarar ursprungliga lyckade förberedelser, exakta värden, privat utkast och historik separat från de ordinarie formulären."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse och tekniskt underlag:**

Behåll den befintliga förberedelsen och användarens fullständiga
privata ändring i steg 1. Efter kartläsningen i steg 2 läser operatören
de tre kontrollernas tillgängliga beskrivningar med webbläsarens
tillgänglighetsinspektör: tidigare **Lo Exempel → Använder →
Familjemusik** anger **Använder** och **Upphört**; föreslaget
**Molnmusik → Betalar → Familjemusik** och separat sparat
**Molnmusik → Betalar → Lo Exempel** anger **Betalar** utan Upphört.
Anteckna de tre fullständiga läsningarna separat och bekräfta dem i steg 3.
Starta först därefter om samma app med samma databas och bekräfta
omstarten före omladdningen i steg 4. Efter användarens nya kartläsning
upprepas och bekräftas samma Inspector-läsningar före den fullständiga
privata förslagsläsningen. Ingen separat kontroll sparar eller ändrar
förslaget. Faktisk uppläsning provas i LIVSCYKEL-09.

**Steg:**

1. Redigera sambandet från Lo till Familjemusik. Ändra Från objekt till
   Molnmusik, välj typen **Betalar** och
   status **Gäller fortfarande**. Lägg sambandet i ditt utkast med Enter och
   välj Stäng samband utan att spara. Öppna Utkast → Visa förslaget för
   Molnmusik → Betalar → Familjemusik. Läs båda värdesidorna:
   tidigare Lo, Använder och Manuellt
   upphört; föreslaget Molnmusik, Betalar och Gäller fortfarande; samma
   2000-01-01 på båda sidor. Stäng dialogen och textvyn.
2. Öppna kartan och välj **Alla etiketter**. Granska det tidigare sambandet
   från Lo, det föreslagna sambandet och det sparade sambandet från Molnmusik.
3. Be operatören läsa de tre kontrollernas separata beskrivningar och
   invänta bekräftelse enligt förberedelsen.
4. Be operatören starta om appen med samma databas och invänta bekräftelse.
   Ladda om kartan och läs åter alla tre hela riktningar och egna synliga
   statusuppgifter. Be operatören upprepa den separata läsningen och invänta
   bekräftelse. Öppna Utkast → Visa förslaget och läs åter båda värdesidorna
   med samma datum enligt steg 1. Förslaget är osparat; spara inget.

**Förväntat resultat:**

- Det tidigare sambandet från Lo visar **Använder** och **Upphört** både
  med text och i sin tillgängliga beskrivning.
- Det föreslagna sambandet och sambandet från Molnmusik visar **Betalar**
  utan Upphört. Deras beskrivningar anger inte att de har upphört.
- Samma skillnad består efter omstart. Förslaget är fortfarande privat och
  de sparade sambanden är oförändrade; automationen jämför hela underlaget.
- Automationen kontrollerar tillgängliga beskrivningar i webbläsaren.
  Faktiska skärmläsarprov dokumenteras separat när de utförs.

## Borttagning

### LIVSCYKEL-03: direkt borttagning bevarar anslutna objekt och historik

**Syfte:** Kontrollera hela borttagningsförslaget, kastande och bevarande.

**Användare:** Den konfigurerade administratören.

**Förutsättningar:** De sparade objekten och sambanden ovan.

**Integrationstest:**
[lifecycle.spec.ts](../../tests/integration/lifecycle.spec.ts),
testfallet “LIVSCYKEL-03: removing from the list immediately proposes every
connected edge and preserves history”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/lifecycle.spec.ts",
    "caseId": "LIVSCYKEL-03"
  },
  "reference": "1280 × 720; Chromium; syntetiska identiteter och verklig SQLite",
  "outcomes": [
    "Hela borttagningsförslaget innehåller objektet och båda anslutna sambanden med sparad typ.",
    "Kastande återger sparade samband. Sparande och omstart tar bort endast objektet och dess samband och bevarar tidigare värden i historiken."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Lo Exempel → Använder → Familjemusik**, välj **Betalar** som
   sambandstyp och lägg sambandet i utkastet utan att spara. Välj
   **Stäng samband**.
2. Välj den röda papperskorgen **Ta bort Familjemusik** på tabellraden.
   Granska **Visa utkastet**
   utan något ytterligare förslagssteg.
3. Ladda om sidan och granska förslaget igen. Öppna **Skriv till Skyttel**,
   välj **Visa utkastet** och **Kasta hela utkastet**. Läs
   **Ta bort hela utkastet?** och bekräfta **Ta bort hela utkastet**.
   Stäng textvyn och kontrollera att de sparade sambanden finns kvar.
4. Upprepa typbytet och **Ta bort Familjemusik** i Tabell. Välj **Spara hela
   utkastet**.
5. Starta om appen med samma databas och ladda om sidan. Öppna
   Rapporter → Ändringshistorik → Visa ändringarna för borttagningen.
   Läs Familjemusik, Abonnemang, båda sambandens riktningar och Använder
   i tidigare värden samt Borttaget efter sparandet.

**Förväntat resultat:**

- Utkastet innehåller borttagning av Familjemusik och båda sambanden med
  läsbara objektnamn och riktningar. Den gemensamma kartan är oförändrad.
- Borttagningen visar sambandets sparade typ **Använder**, utan **Betalar**
  eller någon typkonflikt. Hela utkastet går att spara direkt.
- Förslaget överlever omladdning. Kastande återger båda sambanden och
  tömmer utkastet utan att ändra den gemensamma kartan eller sambandets typ.
- Efter sparande och omstart är Familjemusik och båda sambanden borta.
  Lo och Molnmusik finns kvar. Inga typdefinitioner städas bort.
- Automationen läser historikunderlaget via HTTP och kontrollerar tidigare
  objekt, samband, namn och definitioner samt tidpunkt och användare.
  Läsning i gränssnittet provas i [historikfallen](history.md).

Konflikter som blockerar hela borttagningen provas även i
[UTKAST-06](drafts.md#utkast-06-granska-nya-samband-före-objektborttagning).

### LIVSCYKEL-07: faktiskt uppläst livscykelstatus för fall 04

**Syfte:** Kontrollera faktisk uppläsning utöver DOM-beskrivningar.

**Användare:** Den konfigurerade administratören med NVDA.

**Förutsättningar:** Förbered LIVSCYKEL-04 i en skrivbordsmiljö med
Chrome, NVDA och svensk röst. Anteckna samtliga versioner.

**Kräver mänsklig observation:** Hör NVDA läsa sambandets riktning, Manuellt upphört
och Upphört utan att tilldela
Molnmusik-sambandet upphörandestatus.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Hör NVDA läsa sambandets riktning, Manuellt upphört och Upphört utan att tilldela Molnmusik-sambandet upphörandestatus."
  },
  "reference": "Windows, Chrome och NVDA; svensk röst; namnge versioner i protokollet",
  "outcomes": [
    "Hör NVDA läsa sambandets riktning, Manuellt upphört och Upphört utan att tilldela Molnmusik-sambandet upphörandestatus."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/lifecycle.spec.ts",
      "caseId": "LIVSCYKEL-04",
      "purpose": "DOM-beskrivningar, status och beständig läsning; automationen hör inte NVDA."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför LIVSCYKEL-04 en gång. Under dess beskrivningsläsning, navigera
   med NVDA till varje namngiven objekt- eller sambandskontroll och lyssna.
2. Efter omstart, lyssna på samma kontroller igen.

**Förväntat resultat:**

- Hör NVDA läsa sambandets riktning, Manuellt upphört och Upphört utan att
  tilldela Molnmusik-sambandet upphörandestatus.
- Den faktiska uppläsningen behåller samma betydelser efter omstart.
  Anteckna hörda ord; DOM-automation är separat underlag.

### LIVSCYKEL-08: faktiskt uppläst livscykelstatus för fall 05

**Syfte:** Kontrollera faktisk uppläsning utöver DOM-beskrivningar.

**Användare:** Den konfigurerade administratören med NVDA.

**Förutsättningar:** Förbered LIVSCYKEL-05 i en skrivbordsmiljö med
Chrome, NVDA och svensk röst. Anteckna samtliga versioner.

**Kräver mänsklig observation:** Hör NVDA läsa Kim Exempel som Person utan
Upphört och det separata Lo-sambandet
som Upphört.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Hör NVDA läsa Kim Exempel som Person utan Upphört och det separata Lo-sambandet som Upphört."
  },
  "reference": "Windows, Chrome och NVDA; svensk röst; namnge versioner i protokollet",
  "outcomes": [
    "Hör NVDA läsa Kim Exempel som Person utan Upphört och det separata Lo-sambandet som Upphört."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/lifecycle.spec.ts",
      "caseId": "LIVSCYKEL-05",
      "purpose": "DOM-beskrivningar, status och beständig läsning; automationen hör inte NVDA."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför LIVSCYKEL-05 en gång. Under dess beskrivningsläsning, navigera
   med NVDA till varje namngiven objekt- eller sambandskontroll och lyssna.
2. Efter omstart, lyssna på samma kontroller igen.

**Förväntat resultat:**

- Hör NVDA läsa Kim Exempel som Person utan Upphört och det separata Lo-
  sambandet som Upphört.
- Den faktiska uppläsningen behåller samma betydelser efter omstart.
  Anteckna hörda ord; DOM-automation är separat underlag.

### LIVSCYKEL-09: faktiskt uppläst livscykelstatus för fall 06

**Syfte:** Kontrollera faktisk uppläsning utöver DOM-beskrivningar.

**Användare:** Den konfigurerade administratören med NVDA.

**Förutsättningar:** Förbered LIVSCYKEL-06 i en skrivbordsmiljö med
Chrome, NVDA och svensk röst. Anteckna samtliga versioner.

**Kräver mänsklig observation:** Hör NVDA skilja det tidigare upphörda
Använder-sambandet från de två gällande
Betalar-sambanden.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Hör NVDA skilja det tidigare upphörda Använder-sambandet från de två gällande Betalar-sambanden."
  },
  "reference": "Windows, Chrome och NVDA; svensk röst; namnge versioner i protokollet",
  "outcomes": [
    "Hör NVDA skilja det tidigare upphörda Använder-sambandet från de två gällande Betalar-sambanden."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/lifecycle.spec.ts",
      "caseId": "LIVSCYKEL-06",
      "purpose": "DOM-beskrivningar, status och beständig läsning; automationen hör inte NVDA."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför LIVSCYKEL-06 en gång. Under dess beskrivningsläsning, navigera
   med NVDA till varje namngiven objekt- eller sambandskontroll och lyssna.
2. Efter omstart, lyssna på samma kontroller igen.

**Förväntat resultat:**

- Hör NVDA skilja det tidigare upphörda Använder-sambandet från de två gällande
  Betalar-sambanden.
- Den faktiska uppläsningen behåller samma betydelser efter omstart.
  Anteckna hörda ord; DOM-automation är separat underlag.
