# Manuella testfall för profilbilder

Testfallen omfattar privata bildförslag, visning i rymdkartan, historik,
historikläsning, fel, åtkomst och återgång till ett objekt efter att dess
formulär stängts.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

- Alex Exempel är administratör i testhushållet och använder Google.
- Robin Exempel är inbjuden medlem och använder Microsoft i en annan
  webbläsarprofil.
- Robin har också medlemskap i **Eken**, ett annat hushåll på samma
  installation, enligt den separata förberedelsen i BILD-03.
- En tredje profil är utloggad.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

Välj **Tabell** och använd radens **Redigera [objektets namn]** för att
öppna hela objektformuläret. För samband väljer du **Samband för [namn]**
och **Redigera samband** vid det aktuella sambandet. Nytt objekt öppnas
från kartans verktyg. Att bara markera en rad öppnar inte ett formulär.

Granska ett beständigt förslag genom **Skriv till Skyttel → Visa utkastet**
och radens **Visa förslaget: [namn]**. Stäng fullständig läsning med krysset.
Spara separat med utkastets sparikon och vänta på **Utkastet är sparat**.
Stäng textvyn före nästa steg i Tabell, Karta eller Inställningar.

1. Använd en isolerad installation med påhittade uppgifter. Skapa objektet
   Lo Exempel med en beskrivning och ett privat förslag. Förbered påhittade
   JPEG-, PNG- och WebP-bilder, en textfil döpt till PNG och en fil över 10 MB
   med kommandot nedan.
2. Använd ett nytt hushåll eller återställ samma testutgångsläge mellan
   fallen. Behåll inloggningar och databas vid normal omstart.

Kör i projektets terminal efter `npm ci`. Kommandot skapar en ny privat
testmapp och skriver ut dess sökväg; det ändrar ingen databas:

```sh
node --input-type=module <<'NODE'
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const directory = await mkdtemp(join(tmpdir(), 'skyttel-image-case-'));
for (const [format, background] of [
  ['jpeg', '#992233'], ['png', '#0088ff'], ['webp', '#33aa44'],
]) {
  await sharp({ create: { width: 600, height: 400, channels: 3, background } })
    .toFormat(format).toFile(join(directory, `bild.${format}`));
}
await writeFile(join(directory, 'fel.png'), 'synthetic invalid pixels');
await writeFile(join(directory, 'stor.png'), Buffer.alloc(10_000_001));
console.log(directory);
NODE
```

Om webbläsaren körs på värddatorn, öppna mappen i VS Codes filutforskare
och hämta de fem filerna till en separat testmapp på värddatorn. Använd
dessa kopior i filväljaren. Radera båda testmapparna efter körningen.

## Bildförslag och historik

### BILD-01: Bevara text och läs tidigare bilder efter omstart

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-images.spec.ts",
    "caseId": "BILD-01"
  },
  "reference": "1280×720; bildens faktiska målning före sparande och efter serveromstart.",
  "outcomes": [
    "Bild och text bevaras efter omstart; historiken visar bildbytet utan att ändra aktuella värden."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Verifiera samma privata utkast, beständighet och historikläsning för
bilder.

**Användare:** Alex.

**Förutsättningar:** Lo Exempel finns i Alex utkast utan sparad bild.

**Integrationstest:**
[profile-images.spec.ts](../../tests/integration/profile-images.spec.ts),
testfallet “BILD-01: profile image proposals preserve text, survive restart
and expose historical replacements”.

**Steg:**

1. Redigera Lo och öppna Livscykel och utseende. Välj en PNG-bild och
   kontrollera förhandsbilden. Välj Lägg i utkastet och stäng. Öppna kartan
   och kontrollera bilden i Lo Exempels runda symbol.
2. Redigera Lo igen. Skriv Oskickad text som egenskapen Beskrivning under Fria egenskaper.
   Öppna Livscykel och utseende och kontrollera att bildvalet är nåbart.
   Lägg hela formuläret i utkastet och spara hela utkastet separat.
3. Starta om servern och ladda om. Kontrollera bilden i redigeringen och
   kartan. Byt bilden till WebP, lägg hela formuläret i utkastet och spara.
4. Välj **Rapporter** och **Visa ändringarna** vid senaste sparandet.
   Läs och se bilderna före och efter. Kontrollera att aktuell bild och
   beskrivning är oförändrade.

**Förväntat resultat:**

- Bild och text läggs tillsammans på rätt objekt i utkastet först efter
  bekräftat tillägg av hela formuläret. Bildval skriver inte över text.
- Bilden visas i objektets runda symbol före sparandet och efter omstart.
  Sparad bild och beskrivning överlever omstart. Historiken visar bytet.
- Historiken visar båda bilderna utan att ändra den aktuella bilden
  eller beskrivningen.

### BILD-02: Avvisa felaktiga bilder och återhämta bildborttagning

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-images.spec.ts",
    "caseId": "BILD-02"
  },
  "reference": "1280×720; ogiltig och överstor fil samt tappat svar efter genomförd bildborttagning.",
  "outcomes": [
    "Fel bevarar tidigare förslag; kontrollen bekräftar en bildborttagning och ett tomt utkast."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Bevara tidigare förslag vid fel och bekräfta endast ett sparande.

**Användare:** Alex.

**Förutsättningar:** Lo Exempel finns i Alex utkast.

**Separat förberedelse:** Förbered
[styrd objektleverans](map.md#styrd-objektleverans). Inför steg 3, skriv
`arm save:drop-after` i transportterminalen. Terminalen ska visa
`application-completed` med status 200 innan `dropped`. Efter kontrollen,
återställ HTTPS-ingången innan `quit`. Behåll databasen tills utfallet är
kontrollerat. Vanligt offlineläge ersätter inte tappat svar efter sparande.

**Integrationstest:**
[profile-images.spec.ts](../../tests/integration/profile-images.spec.ts),
testfallet “BILD-02: invalid images retain proposals and interrupted removal
recovers its durable receipt”.

**Steg:**

1. Välj en JPEG-bild på Lo och lägg hela formuläret i utkastet. Redigera
   igen, välj textfilen döpt till PNG och försök lägga formuläret i utkastet.
   Upprepa med filen över 10 MB. Läs felen och kontrollera beskrivningen.
   Avbryt och kasta endast de oskickade ändringarna.
2. Spara hela utkastet. Redigera Lo och välj Ta bort profilbilden ur
   formuläret i Livscykel och utseende. Lägg hela ändringen i utkastet.
   Granska borttagningsförslaget innan separat sparande.
3. Stäng formuläret. Armera det förberedda avbrottet och spara sedan
   hela utkastet utan att ladda om sidan.
   Läs beskedet om okänt utfall i **Spara utkastet** och välj
   **Kontrollera sparandet igen**.
4. Välj **Rapporter** och öppna bildborttagningens historiska detaljer.
   Kontrollera den tidigare bilden och det tomma utkastet.

**Förväntat resultat:**

- Ogiltiga och för stora filer ger begripliga fel med tidigare bild och
  beskrivning kvar. Det går fortfarande att spara det giltiga utkastet.
- Okänt utfall ger ingen falsk sparbekräftelse. Kvittot bekräftar en enda
  bildborttagning och historiken har inget dubbelt sparande.
- Historiken visar rätt tidigare bild. Aktuell bild är borttagen och
  utkastet är tomt; läsningen skapar inget nytt förslag.

### BILD-03: Neka privata och historiska bildadresser efter återkallad tillgång

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-images.spec.ts",
    "caseId": "BILD-03"
  },
  "reference": "1280×720; ägare, medlem, återkallad medlem med annat hushåll och utloggad profil.",
  "outcomes": [
    "Privata, aktuella och historiska bilder följer medlemskap; bilder läcker inte genom ett annat hushåll."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Verifiera privata förslag och aktuellt medlemskap för bildåtkomst.

**Användare:** Alex, Robin och den utloggade profilen.

**Förutsättningar:** Robin har tillgång till samma hushåll som Alex.

**Separat förberedelse:** Följ
[ett andra hushåll på samma installation](../development/testing.md#a-second-household-on-the-same-installation)
innan Robin bjuds in till Alex hushåll. Använd en ny provdatabas, låt
Robin först logga in utan medlemskap och kör `second-household` för den
verifierade användaren. Robin får då Eken. Anteckna Ekens fulla adress och
hushålls-ID från adressfältet. Bjud därefter in Robin till Alex hushåll.
Öppna dess fulla adress i Robinprofilen och kontrollera att Tabell går att
använda. Behåll båda medlemskapen tills Alex tillgång återkallas i steg 4.

Kopiera bildadressen från förhandsbilden efter ett bekräftat tillägg i
utkastet: öppna formuläret igen, välj **Livscykel och utseende** och använd
webbläsarens **Kopiera bildadress**. Kopiera inga kakor eller token mellan
profilerna. Använd nya flikar för direkt bildläsning.
Stäng det oförändrade formuläret med **Avbryt** efter att adressen
kopierats, innan separat sparande eller nästa bildbyte.

Inför åtkomstprovet efter återkallelsen förbereder testledaren tre
Eken-adresser med [adressförberedelsen](#bildadresser-för-ekens-medlemskap).
Använd endast de färdiga adresserna i de vanliga browserstegen.

**Integrationstest:**
[profile-images.spec.ts](../../tests/integration/profile-images.spec.ts),
testfallet “BILD-03: private, historical and known image addresses enforce
current household access”.

**Steg:**

1. Lägg en WebP-bild på Lo i Alex utkast. Kopiera bildadressen och öppna
   den som Robin och utloggad. Spara som Alex och öppna samma adress som Robin.
2. Byt till PNG-bilden i Alex utkast. Prova den nya bildadressen som Robin:
   den ska ännu nekas. Stäng formuläret och spara hela utkastet som Alex.
   Kontrollera att objektets aktuella bild är PNG-bilden. Öppna historiken,
   välj **Visa ändringarna** och jämför bilderna före och efter bytet.
   Den första WebP-bilden ska nu
   bara finnas i historiken. Robin ska kunna öppna både dess gamla adress
   och den aktuella PNG-bildens adress.
3. Välj **Tillbaka till arbetet → Tabell**. Lägg JPEG-bilden som ett nytt
   privat bildförslag utan att spara.
   Kopiera den tredje bildadressen; den ska nekas som Robin. Prova alla
   tre bildadresserna i den utloggade profilen: samtliga ska nekas.
4. Återkalla Robins tillgång som Alex. Prova alla tre bildadresserna igen.
   Öppna sedan Ekens antecknade adress som Robin och kontrollera att
   Robin fortfarande har tillgång till det hushållet. Öppna de tre
   förberedda Eken-adresserna i Robins profil.
   De ska nekas även med giltigt medlemskap i Eken.
5. Kontrollera att Alex fortfarande kan läsa det aktuella objektet och
   det tredje privata förslaget. Behåll provdatabasen för de tekniska
   åtkomstproven nedan, och ta sedan bort den enligt förberedelseguiden.

**Separat teknisk åtkomstkontroll:** Efter återkallelsen kan följande kod
köras på startsidan i Robins respektive den utloggade profilen. Ange
Alex hushålls-ID och Lo Exempels objekt-ID, som Alex hämtar från följande
förberedelse i sin konsol. Dessa är identifierare, inga inloggningsuppgifter.
Alex första kod skriver providentifierare och aktuella versioner. Den
andra provar nekade bildändringar och skriver svarens status. Dessa
API-prov utför inte ett vanligt formulärflöde.

```javascript
await (async () => {
  const householdId = location.pathname.match(/households\/([^/]+)/)?.[1];
  if (!householdId) throw new Error('Öppna Alex hushållskarta');
  const state = await (await fetch(`/api/households/${householdId}/map`)).json();
  const object = (state.objects ?? []).find(item => item.name === 'Lo Exempel');
  if (!object) throw new Error('Lo Exempel ska vara sparat');
  console.log(JSON.stringify({ householdId, objectId: object.id,
    draftVersion: state.draft.version, contentVersion: state.contentVersion,
    revision: object.revision }));
})();
```

```javascript
await (async () => {
  const preparation = JSON.parse(prompt('Klistra in Alex förberedelse som JSON'));
  const { householdId, objectId, draftVersion, contentVersion, revision } = preparation;
  if (![householdId, objectId].every(value => /^[\w-]+$/.test(value)))
    throw new Error('Ogiltiga providentifierare');
  const build = await (await fetch('/api/version')).json();
  const headers = {
    'Content-Type': 'image/png',
    'X-Skyttel-Build': `${build.commit}:${build.version}`,
    'X-Skyttel-Draft-Version': String(draftVersion),
    'X-Skyttel-Content-Version': String(contentVersion),
    'X-Skyttel-Object-Revision': String(revision),
  };
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2;
  const pixels = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const path = `/api/households/${householdId}/profile-images/${objectId}`;
  for (const method of ['POST', 'DELETE']) {
    const response = await fetch(path, { method, headers,
      body: method === 'POST' ? pixels : undefined });
    console.log(method, response.status);
  }
})();
```

**Förväntat resultat:**

- Endast Alex ser osparade bildversioner. Robin ser den gemensamma bilden
  och den äldre bilden som bara finns i historiken. Utloggad får inte tillgång.
- Återkallad tillgång stoppar läsning av aktuell, historisk och privat bild samt
  bildändringar. API-proven ger 403 som Robin och 401 som utloggad.
  Giltigt medlemskap i Eken ger inte tillgång till Alex hushålls bilder.

### Bildadresser för Ekens medlemskap

Detta är separat teknisk förberedelse för BILD-03:s steg 4. Kör efter att
Alex återkallar Robins tillgång och de tre ursprungliga bildadresserna
är antecknade. Öppna Ekens hushållskarta som Robin. Ange adresserna en
i taget i konsolens frågor. Koden använder Ekens verkliga medlemskap och
konstruerar adresserna; browserstegen ändrar inga identifierare.
Inga bilder eller hushåll ändras. Ladda om sidan efter förberedelsen.

```javascript
await (async () => {
  const householdId = location.pathname.match(/households\/([^/]+)/)?.[1];
  if (!householdId) throw new Error('Öppna Ekens hushållskarta');
  const membership = await fetch(`/api/households/${householdId}/map`);
  if (!membership.ok) throw new Error('Robin måste ha tillgång till Eken');
  const prepared = [];
  for (const label of ['Historisk bild', 'Aktuell bild', 'Privat bild']) {
    const original = new URL(prompt(`${label}: ursprunglig bildadress`));
    const match = original.pathname.match(
      /^\/api\/households\/([^/]+)\/profile-images\/([^/]+)$/);
    if (original.origin !== location.origin || !match || match[1] === householdId)
      throw new Error('Använd en ursprunglig bildadress från Alex hushåll');
    const address = `${location.origin}/api/households/${householdId}` +
      `/profile-images/${match[2]}`;
    prepared.push({ label, address });
  }
  console.table(prepared);
})();
```

### BILD-04: Behåll kompletta bildformulär vid fördröjt avvisande

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-image-work.spec.ts",
    "caseId": "BILD-04"
  },
  "reference": "1440×1000, ljust tema; datorreferens för komplett avvisat bildarbete.",
  "outcomes": [
    "Väntan spärrar bakgrunden; avvisning och avbruten förlustvarning bevarar lokala värden och tidigare förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Bevara lokala uppgifter, tidigare bilder och oberoende förslag.

**Användare:** Alex.

**Förutsättningar:** Privata förslag för Cykeln och Garaget med beskrivningar.
Cykeln har cykelikonen. Ha två giltiga bilder och `fel.png` från förberedelsen.
Använd 1440 × 1000 CSS-bildpunkter och ljust systemtema. Detta är
datorreferensen för väntande och avvisat komplett bildarbete.

**Separat förberedelse:** Förbered
[styrd objektleverans](map.md#styrd-objektleverans). Inför steg 3, skriv
`arm stage:after` och bekräfta armningen före tillägget. Efter klicket på
**Lägg i utkastet och stäng** i steg 3, vänta på `held-after` med status 400
innan steg 4 börjar. Skriv `release`
när steg 4 anger att svaret ska släppas. En regel förbrukas av nästa
tillägg, så armera den först efter de giltiga tilläggen. Återställ
HTTPS-ingången innan `quit`.

**Integrationstest:**
[profile-image-work.spec.ts](../../tests/integration/profile-image-work.spec.ts),
BILD-04.

**Separat operatörsförberedelse:**

Använd fallets befintliga separat förberedda `stage:after`.
Efter UI-steg 3: invänta det verkliga hållna 400-svaret och meddela
**Avslaget hålls**. Behåll det under spärr- och fokusprovet. Vid steg 4,
först efter det senare fokusförsöket: kör `release` i transportterminalen
och meddela **Samma avslag är släppt**. Återställ HTTPS-ingången före
`quit` enligt den befintliga förberedelsen.

**Steg:**

1. Redigera Garaget. Öppna **Fria egenskaper**, ändra värdet i egenskapen
   Beskrivning till Separat förslag om Garaget och välj **Lägg i utkastet och
   stäng**.
2. Redigera Cykeln. Öppna **Livscykel och utseende**, välj första bilden och
   lägg hela formuläret i utkastet. Upprepa med andra bilden.
3. Redigera Cykeln igen. Öppna **Fria egenskaper** och ändra värdet i
   egenskapen Beskrivning till Oskickad bildtext. Öppna
   **Livscykel och utseende** och välj `fel.png`. Be operatören förbereda
   hållet svar enligt förberedelsen och invänta installationen. Välj **Lägg i
   utkastet och stäng**. Invänta operatörens bekräftelse att det verkliga
   avslaget hålls.
4. Kontrollera spärrade fält och Avbryt. Tryck Escape och försök fokusera
   bakgrundens sökfält med Tab och Shift+Tab. Be operatören släppa samma avslag
   enligt förberedelsen och invänta bekräftelse.
5. Läs bildfelet. Öppna Fria egenskaper och kontrollera egenskapen
   Beskrivning. Välj
   **Avbryt**. Kontrollera standardfokus, läsbarhet och synligt fokus på
   **Fortsätt redigera**, även med pekaren över knappen. Tryck Tab och Shift+Tab
   och kontrollera att fokus återgår till samma knapp.
6. Tryck Escape i varningen. Kontrollera text och fokus på Avbryt. Välj Avbryt
   igen och **Kasta ändringarna och fortsätt**.
7. Redigera Cykeln igen. Öppna **Fria egenskaper** och kontrollera ursprungligt
   värde i egenskapen Beskrivning. Öppna **Livscykel och utseende** och
   kontrollera den andra giltiga bilden. Avbryt det oförändrade formuläret och
   öppna Garaget igen. Öppna **Fria egenskaper** och kontrollera dess lagda
   förslag.

**Förväntat resultat:**

- Bildval ensamt ändrar inte utkastet. Väntande tillägg spärrar fält,
  stängning och arbete bakom formuläret.
- Avvisat bildtillägg bevarar lokala värden. Escape i förlustvarningen
  fortsätter redigering med texten kvar.
- Uttryckligt kastande tar endast bort oskickade uppgifter. Tidigare
  giltig bild, ikon och Garagets lagda förslag finns kvar.
- Varningens fokus och text är synliga och läsbara i referenstemat. Automationen
  mäter minst 4,5:1 textkontrast. Korta fönster tillåter rullning till fält
  och knappar. Ingen ändring har sparats i kartan eller historiken.

### BILD-05: Spärra navigering under bildtillägg och behåll inaktuellt formulär

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-image-work.spec.ts",
    "caseId": "BILD-05"
  },
  "reference": "1440×900; datorreferens för Bakåt under väntan och inaktuellt komplett bildformulär.",
  "outcomes": [
    "Bakåt spärras under väntan; inaktuellt tillägg bevarar text och fil utan ett delvis förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skydda komplett oskickat bildarbete vid navigering och samtidighet.

**Användare:** Alex.

**Förutsättningar:** Ett nytt hushåll. Ha `fel.png`, en giltig bild och
svarsfördröjningen i BILD-04. Ha en andra flik med samma användare.
Använd 1440 × 900 CSS-bildpunkter för datorns navigeringsreferens.

**Integrationstest:**
[profile-image-work.spec.ts](../../tests/integration/profile-image-work.spec.ts).
BILD-05.

**Separat operatörsförberedelse:**

Följ fallets befintliga styrda objektleverans. Håll det verkliga
avslagssvaret enligt förberedelsen och bekräfta hållningen efter
inskickningen. Först efter navigationsprovet i UI-steg 2: kör `release`
och meddela **Samma avslag är släppt**. Behåll samma session och utkast
genom senare redigering; återställ HTTPS-ingången före `quit`.

**Steg:**

1. Öppna Inställningar och följ **Tillbaka till kartan**. Välj Nytt objekt,
   skriv Bildarbete och Behåll bildens text. Öppna Livscykel och utseende.
   Avbryt filväljaren utan fil och kontrollera oförändrat utkast.
2. Välj `fel.png`. Be operatören förbereda hållet avslag och invänta
   installationen. Lägg hela formuläret i utkastet. Invänta operatörens
   bekräftelse att samma verkliga avslag hålls. Använd webbläsarens Bakåt.
   Kontrollera att formuläret stannar och är spärrat. Be operatören släppa samma
   avslag och invänta bekräftelse. Vänta tills bildfelet visas. Återställ
   transporten efter fallet enligt BILD-04.
3. Använd Bakåt igen. Tryck Escape i förlustvarningen och kontrollera att
   formuläret finns kvar. Använd Bakåt igen och välj **Kasta ändringarna och
   fortsätt**. Kontrollera återgång till Inställningar.
4. Återgå till kartan och skapa ett nytt formulär för Bildarbete med Oskickat
   efter bildfelet och en giltig bild, utan att lägga det i utkastet.
5. Lägg ett oberoende objektförslag, Annat förslag, i utkastet från andra
   fliken. Försök lägga första flikens hela formulär i utkastet.
6. Kontrollera felet, egenskapen Beskrivning under Fria egenskaper och
   filvalet i Livscykel
   och utseende. Granska det privata utkastet från andra fliken.

**Förväntat resultat:**

- Avbrutet filval ändrar inget. Väntande tillägg spärrar Bakåt och fält.
- Känd avvisning behåller formuläret. Escape avbryter förlustvarningen.
  Uttryckligt kastande tillåter navigering utan att skapa ett förslag.
- Inaktuellt komplett tillägg bevarar lokal text och bild. Det oberoende
  förslaget är oförändrat; inget ofullständigt bildförslag eller gemensamt
  sparande har skapats. Historiken är tom.

### BILD-06: Dela text, ikon och bild tillsammans för Egen bildtyp

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-image-types.spec.ts",
    "caseId": "BILD-06"
  },
  "reference": "1280×720; Egen bildtyp är den generiska bildreferensen.",
  "outcomes": [
    "Text, ikon och bild delar förslag och sparkvitto; borttagning återställer ingen äldre bild."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Hantera bilder för Egen bildtyp i samma privata objektförslag
och kvitto samt ta bort senaste bilden utan att få tillbaka en äldre.

**Användare:** Alex.

**Förutsättningar:** Ett nytt isolerat hushåll med tomt objektutkast.

**Separat förberedelse:** Öppna **Inställningar → Typer →
Ny objekttyp**. Ange namnet **Egen bildtyp** och beskrivningen **Egen typ
med profilbild**, utan ytterligare uppgifter. Lägg definitionen i utkastet
utan att
spara. Återgå till kartan. Definitionen ingår inte i objektförslagen som
räknas i stegen. Ha två giltiga bilder och `fel.png` från förberedelsen.

**Integrationstest:**
[profile-image-types.spec.ts](../../tests/integration/profile-image-types.spec.ts),
BILD-06.

**Steg:**

1. Välj **Nytt objekt**. Fyll **Bild för Egen bildtyp** som namn och välj typen
   **Egen bildtyp**. Lägg till egenskapen **Beskrivning** under **Fria
   egenskaper**, välj datatypen Text och ange **Text i samma förslag** som
   värde. Öppna **Livscykel och utseende**. Sök cykel under
   **Ikon**, välj
   **Cykel** och välj den första giltiga bilden. Kontrollera förhandsbilden.
   Inget objektförslag ska ännu finnas i utkastet.
2. Välj **Lägg i utkastet och stäng**. Granska hela objektförslaget med text,
   ikon och bild. Spara hela utkastet och läs kvittot.
3. Redigera objektet igen. Öppna **Fria egenskaper** och ändra värdet i samma
   Beskrivning-egenskap till **Ny text före bildbytet**. Öppna Livscykel och
   utseende och välj den andra giltiga bilden.
   Välj **Lägg i utkastet och stäng** utan att spara gemensamt.
4. Redigera igen och öppna Livscykel och utseende. Avbryt filväljaren utan
   fil. Välj sedan `fel.png` och **Lägg i utkastet och stäng**. Läs felet:
   formuläret ska finnas kvar och det senaste giltiga förslaget är oförändrat.
5. Välj **Ta bort profilbilden ur formuläret**. Ingen förhandsbild visas.
   Kontrollera att cykelikonen fortfarande är vald och välj
   **Lägg i utkastet och stäng**.
6. Granska det enda objektförslaget med ny text och utan bild. Spara hela
   utkastet. Läs kvittot och historiken för båda sparandena.

**Förväntat resultat:**

- Text, ikon och bild hör till samma objekt med samma identitet och typ.
  Ett uttryckligt helt sparande delar dem tillsammans med ett kvitto.
- Avbrutet eller ogiltigt filval ändrar inte det senaste giltiga förslaget.
  Privat bildbyte och borttagning ändrar inte det tidigare gemensamma objektet.
- Borttagningen föreslår ingen bild och bevarar vald ikon och den nya texten.
  Det andra kvittot visar den första sparade bilden före ändringen och
  ingen bild efteråt. Historiken innehåller de två hela sparandena.

## Storleks- och temavarianter

Varje fall nedan körs med ett nytt hushåll och sitt angivna systemtema.
CSS-storlekarna provar webbläsarens omflöde och fokus; de utför inte verklig
zoom eller fysisk telefoninmatning.

### BILD-07: Behåll komplett bildarbete vid 1440 × 1000, mörkt tema

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-image-work.spec.ts",
    "caseId": "BILD-07"
  },
  "reference": "1440×1000, mörkt tema; Datorns mörka tema skyddar varningens kontrast och fokus.",
  "outcomes": [
    "Avvisning bevarar lokala värden, senaste giltiga bilden och Garagets oberoende förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Datorns mörka tema skyddar varningens kontrast och fokus.

**Användare:** Alex.

**Förutsättningar:** Ett nytt hushåll enligt BILD-04, vid 1440 × 1000
CSS-bildpunkter och mörkt systemtema.

**Separat förberedelse:** Använd filerna och den styrda leveransen i
[BILD-04](#bild-04-behåll-kompletta-bildformulär-vid-fördröjt-avvisande).
Armera `stage:after` först inför det ogiltiga tillägget; återställ ingången
innan `quit` efter fallet.

**Integrationstest:**
[profile-image-work.spec.ts](../../tests/integration/profile-image-work.spec.ts),
BILD-07.

**Steg:**

1. Utför BILD-04:s steg 1–7 en gång vid den angivna storleken och temat.
   Under steg 4, medan svaret hålls, kontrollera Escape och bakgrundsfokus.
   Släpp sedan svaret och kontrollera den bevarade texten enligt steg 5.
   Under steg 5–6, medan förlustvarningen är öppen, kontrollera Tab,
   Shift+Tab, Escape och fokusets läsbarhet.
   Under steg 7, efter att bara lokala uppgifter kastats, kontrollera
   Cykelns senaste bild och Garagets oberoende förslag.

**Förväntat resultat:**

- Alla BILD-04:s bevarandekontroller gäller även här. Varningens text
  och fokus går att läsa, och knapparna går att nå genom rullning.
- Cykelns andra giltiga bild och Garagets förslag finns kvar. Ingen
  gemensam ändring eller historikpost skapas.

### BILD-08: Behåll komplett bildarbete vid 1440 × 500, ljust tema

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-image-work.spec.ts",
    "caseId": "BILD-08"
  },
  "reference": "1440×500, ljust tema; Kort höjd skyddar rullning och varningens nåbarhet.",
  "outcomes": [
    "Avvisning bevarar lokala värden, senaste giltiga bilden och Garagets oberoende förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kort höjd skyddar rullning och varningens nåbarhet.

**Användare:** Alex.

**Förutsättningar:** Ett nytt hushåll enligt BILD-04, vid 1440 × 500
CSS-bildpunkter och ljust systemtema.

**Separat förberedelse:** Använd filerna och den styrda leveransen i
[BILD-04](#bild-04-behåll-kompletta-bildformulär-vid-fördröjt-avvisande).
Armera `stage:after` först inför det ogiltiga tillägget; återställ ingången
innan `quit` efter fallet.

**Integrationstest:**
[profile-image-work.spec.ts](../../tests/integration/profile-image-work.spec.ts),
BILD-08.

**Steg:**

1. Utför BILD-04:s steg 1–7 en gång vid den angivna storleken och temat.
   Under steg 4, medan svaret hålls, kontrollera Escape och bakgrundsfokus.
   Släpp sedan svaret och kontrollera den bevarade texten enligt steg 5.
   Under steg 5–6, medan förlustvarningen är öppen, kontrollera Tab,
   Shift+Tab, Escape och fokusets läsbarhet.
   Under steg 7, efter att bara lokala uppgifter kastats, kontrollera
   Cykelns senaste bild och Garagets oberoende förslag.

**Förväntat resultat:**

- Alla BILD-04:s bevarandekontroller gäller även här. Varningens text
  och fokus går att läsa, och knapparna går att nå genom rullning.
- Cykelns andra giltiga bild och Garagets förslag finns kvar. Ingen
  gemensam ändring eller historikpost skapas.

### BILD-09: Behåll komplett bildarbete vid 1440 × 500, mörkt tema

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-image-work.spec.ts",
    "caseId": "BILD-09"
  },
  "reference": "1440×500, mörkt tema; Kort höjd skyddar rullning och varningens nåbarhet.",
  "outcomes": [
    "Avvisning bevarar lokala värden, senaste giltiga bilden och Garagets oberoende förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kort höjd skyddar rullning och varningens nåbarhet.

**Användare:** Alex.

**Förutsättningar:** Ett nytt hushåll enligt BILD-04, vid 1440 × 500
CSS-bildpunkter och mörkt systemtema.

**Separat förberedelse:** Använd filerna och den styrda leveransen i
[BILD-04](#bild-04-behåll-kompletta-bildformulär-vid-fördröjt-avvisande).
Armera `stage:after` först inför det ogiltiga tillägget; återställ ingången
innan `quit` efter fallet.

**Integrationstest:**
[profile-image-work.spec.ts](../../tests/integration/profile-image-work.spec.ts),
BILD-09.

**Steg:**

1. Utför BILD-04:s steg 1–7 en gång vid den angivna storleken och temat.
   Under steg 4, medan svaret hålls, kontrollera Escape och bakgrundsfokus.
   Släpp sedan svaret och kontrollera den bevarade texten enligt steg 5.
   Under steg 5–6, medan förlustvarningen är öppen, kontrollera Tab,
   Shift+Tab, Escape och fokusets läsbarhet.
   Under steg 7, efter att bara lokala uppgifter kastats, kontrollera
   Cykelns senaste bild och Garagets oberoende förslag.

**Förväntat resultat:**

- Alla BILD-04:s bevarandekontroller gäller även här. Varningens text
  och fokus går att läsa, och knapparna går att nå genom rullning.
- Cykelns andra giltiga bild och Garagets förslag finns kvar. Ingen
  gemensam ändring eller historikpost skapas.

### BILD-10: Behåll komplett bildarbete vid 320 × 1000, ljust tema

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-image-work.spec.ts",
    "caseId": "BILD-10"
  },
  "reference": "320×1000, ljust tema; Smal bredd skyddar omflöde och varningens fokus.",
  "outcomes": [
    "Avvisning bevarar lokala värden, senaste giltiga bilden och Garagets oberoende förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Smal bredd skyddar omflöde och varningens fokus.

**Användare:** Alex.

**Förutsättningar:** Ett nytt hushåll enligt BILD-04, vid 320 × 1000
CSS-bildpunkter och ljust systemtema.

**Separat förberedelse:** Använd filerna och den styrda leveransen i
[BILD-04](#bild-04-behåll-kompletta-bildformulär-vid-fördröjt-avvisande).
Armera `stage:after` först inför det ogiltiga tillägget; återställ ingången
innan `quit` efter fallet.

**Integrationstest:**
[profile-image-work.spec.ts](../../tests/integration/profile-image-work.spec.ts),
BILD-10.

**Steg:**

1. Utför BILD-04:s steg 1–7 en gång vid den angivna storleken och temat.
   Under steg 4, medan svaret hålls, kontrollera Escape och bakgrundsfokus.
   Släpp sedan svaret och kontrollera den bevarade texten enligt steg 5.
   Under steg 5–6, medan förlustvarningen är öppen, kontrollera Tab,
   Shift+Tab, Escape och fokusets läsbarhet.
   Under steg 7, efter att bara lokala uppgifter kastats, kontrollera
   Cykelns senaste bild och Garagets oberoende förslag.

**Förväntat resultat:**

- Alla BILD-04:s bevarandekontroller gäller även här. Varningens text
  och fokus går att läsa, och knapparna går att nå genom rullning.
- Cykelns andra giltiga bild och Garagets förslag finns kvar. Ingen
  gemensam ändring eller historikpost skapas.

### BILD-11: Behåll komplett bildarbete vid 320 × 1000, mörkt tema

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-image-work.spec.ts",
    "caseId": "BILD-11"
  },
  "reference": "320×1000, mörkt tema; Smal bredd skyddar omflöde och varningens fokus.",
  "outcomes": [
    "Avvisning bevarar lokala värden, senaste giltiga bilden och Garagets oberoende förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Smal bredd skyddar omflöde och varningens fokus.

**Användare:** Alex.

**Förutsättningar:** Ett nytt hushåll enligt BILD-04, vid 320 × 1000
CSS-bildpunkter och mörkt systemtema.

**Separat förberedelse:** Använd filerna och den styrda leveransen i
[BILD-04](#bild-04-behåll-kompletta-bildformulär-vid-fördröjt-avvisande).
Armera `stage:after` först inför det ogiltiga tillägget; återställ ingången
innan `quit` efter fallet.

**Integrationstest:**
[profile-image-work.spec.ts](../../tests/integration/profile-image-work.spec.ts),
BILD-11.

**Steg:**

1. Utför BILD-04:s steg 1–7 en gång vid den angivna storleken och temat.
   Under steg 4, medan svaret hålls, kontrollera Escape och bakgrundsfokus.
   Släpp sedan svaret och kontrollera den bevarade texten enligt steg 5.
   Under steg 5–6, medan förlustvarningen är öppen, kontrollera Tab,
   Shift+Tab, Escape och fokusets läsbarhet.
   Under steg 7, efter att bara lokala uppgifter kastats, kontrollera
   Cykelns senaste bild och Garagets oberoende förslag.

**Förväntat resultat:**

- Alla BILD-04:s bevarandekontroller gäller även här. Varningens text
  och fokus går att läsa, och knapparna går att nå genom rullning.
- Cykelns andra giltiga bild och Garagets förslag finns kvar. Ingen
  gemensam ändring eller historikpost skapas.

### BILD-12: Behåll komplett bildarbete vid 320 × 250, ljust tema

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-image-work.spec.ts",
    "caseId": "BILD-12"
  },
  "reference": "320×250, ljust tema; Kort höjd skyddar rullning och varningens nåbarhet.",
  "outcomes": [
    "Avvisning bevarar lokala värden, senaste giltiga bilden och Garagets oberoende förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kort höjd skyddar rullning och varningens nåbarhet.

**Användare:** Alex.

**Förutsättningar:** Ett nytt hushåll enligt BILD-04, vid 320 × 250
CSS-bildpunkter och ljust systemtema.

**Separat förberedelse:** Använd filerna och den styrda leveransen i
[BILD-04](#bild-04-behåll-kompletta-bildformulär-vid-fördröjt-avvisande).
Armera `stage:after` först inför det ogiltiga tillägget; återställ ingången
innan `quit` efter fallet.

**Integrationstest:**
[profile-image-work.spec.ts](../../tests/integration/profile-image-work.spec.ts),
BILD-12.

**Steg:**

1. Utför BILD-04:s steg 1–7 en gång vid den angivna storleken och temat.
   Under steg 4, medan svaret hålls, kontrollera Escape och bakgrundsfokus.
   Släpp sedan svaret och kontrollera den bevarade texten enligt steg 5.
   Under steg 5–6, medan förlustvarningen är öppen, kontrollera Tab,
   Shift+Tab, Escape och fokusets läsbarhet.
   Under steg 7, efter att bara lokala uppgifter kastats, kontrollera
   Cykelns senaste bild och Garagets oberoende förslag.

**Förväntat resultat:**

- Alla BILD-04:s bevarandekontroller gäller även här. Varningens text
  och fokus går att läsa, och knapparna går att nå genom rullning.
- Cykelns andra giltiga bild och Garagets förslag finns kvar. Ingen
  gemensam ändring eller historikpost skapas.

### BILD-13: Behåll komplett bildarbete vid 320 × 250, mörkt tema

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-image-work.spec.ts",
    "caseId": "BILD-13"
  },
  "reference": "320×250, mörkt tema; Kort höjd skyddar rullning och varningens nåbarhet.",
  "outcomes": [
    "Avvisning bevarar lokala värden, senaste giltiga bilden och Garagets oberoende förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Kort höjd skyddar rullning och varningens nåbarhet.

**Användare:** Alex.

**Förutsättningar:** Ett nytt hushåll enligt BILD-04, vid 320 × 250
CSS-bildpunkter och mörkt systemtema.

**Separat förberedelse:** Använd filerna och den styrda leveransen i
[BILD-04](#bild-04-behåll-kompletta-bildformulär-vid-fördröjt-avvisande).
Armera `stage:after` först inför det ogiltiga tillägget; återställ ingången
innan `quit` efter fallet.

**Integrationstest:**
[profile-image-work.spec.ts](../../tests/integration/profile-image-work.spec.ts),
BILD-13.

**Steg:**

1. Utför BILD-04:s steg 1–7 en gång vid den angivna storleken och temat.
   Under steg 4, medan svaret hålls, kontrollera Escape och bakgrundsfokus.
   Släpp sedan svaret och kontrollera den bevarade texten enligt steg 5.
   Under steg 5–6, medan förlustvarningen är öppen, kontrollera Tab,
   Shift+Tab, Escape och fokusets läsbarhet.
   Under steg 7, efter att bara lokala uppgifter kastats, kontrollera
   Cykelns senaste bild och Garagets oberoende förslag.

**Förväntat resultat:**

- Alla BILD-04:s bevarandekontroller gäller även här. Varningens text
  och fokus går att läsa, och knapparna går att nå genom rullning.
- Cykelns andra giltiga bild och Garagets förslag finns kvar. Ingen
  gemensam ändring eller historikpost skapas.

### BILD-14: Skydda navigering och inaktuellt bildarbete vid 390px

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-image-work.spec.ts",
    "caseId": "BILD-14"
  },
  "reference": "390×900; smal navigering och komplett bildarbete vid samtidig ändring.",
  "outcomes": [
    "Väntan spärrar Bakåt; text, vald fil och oberoende förslag överlever avvisningen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skydda Bakåt och hela bildformuläret även vid smal bredd.

**Användare:** Alex i två flikar.

**Förutsättningar:** Nytt hushåll enligt BILD-05, vid 390 × 900
CSS-bildpunkter.

**Separat förberedelse:** Använd BILD-04:s styrda leverans och bildfiler.
Armera `stage:after` inför det ogiltiga tillägget och avsluta enligt
leveransguiden efter fallet.

**Integrationstest:**
[profile-image-work.spec.ts](../../tests/integration/profile-image-work.spec.ts),
BILD-14.

**Steg:**

1. Utför [BILD-05](#bild-05-spärra-navigering-under-bildtillägg-och-behåll-inaktuellt-formulär),
   steg 1–6 en gång vid den angivna bredden. Under steg 2, medan svaret
   hålls, kontrollera spärrad Bakåt. Under steg 3, efter synligt bildfel,
   avbryt första förlustvarningen med Escape och bekräfta nästa kastande.
   Under steg 5–6, medan första flikens nya formulär är öppet, ändra
   utkastet från andra fliken och kontrollera både text och vald fil
   efter det inaktuella tilläggets avslag.

**Förväntat resultat:**

- BILD-05:s kontroller gäller: Bakåt spärras under väntan, bekräftat
  kastande återgår till Inställningar och inaktuellt tillägg behåller
  hela formuläret. Bara det oberoende förslaget finns i utkastet.

### BILD-15: Skydda navigering och inaktuellt bildarbete vid 320px

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/profile-image-work.spec.ts",
    "caseId": "BILD-15"
  },
  "reference": "320×900; smal navigering och komplett bildarbete vid samtidig ändring.",
  "outcomes": [
    "Väntan spärrar Bakåt; text, vald fil och oberoende förslag överlever avvisningen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Syfte:** Skydda Bakåt och hela bildformuläret även vid smal bredd.

**Användare:** Alex i två flikar.

**Förutsättningar:** Nytt hushåll enligt BILD-05, vid 320 × 900
CSS-bildpunkter.

**Separat förberedelse:** Använd BILD-04:s styrda leverans och bildfiler.
Armera `stage:after` inför det ogiltiga tillägget och avsluta enligt
leveransguiden efter fallet.

**Integrationstest:**
[profile-image-work.spec.ts](../../tests/integration/profile-image-work.spec.ts),
BILD-15.

**Steg:**

1. Utför [BILD-05](#bild-05-spärra-navigering-under-bildtillägg-och-behåll-inaktuellt-formulär),
   steg 1–6 en gång vid den angivna bredden. Under steg 2, medan svaret
   hålls, kontrollera spärrad Bakåt. Under steg 3, efter synligt bildfel,
   avbryt första förlustvarningen med Escape och bekräfta nästa kastande.
   Under steg 5–6, medan första flikens nya formulär är öppet, ändra
   utkastet från andra fliken och kontrollera både text och vald fil
   efter det inaktuella tilläggets avslag.

**Förväntat resultat:**

- BILD-05:s kontroller gäller: Bakåt spärras under väntan, bekräftat
  kastande återgår till Inställningar och inaktuellt tillägg behåller
  hela formuläret. Bara det oberoende förslaget finns i utkastet.

## Identiteter och täckningsgränser

BILD-04 behåller 1440 × 1000 i ljust tema. Dess övriga sju upptäckta
varianter får BILD-07–13. BILD-05 behåller 1440px; 390px och 320px får
BILD-14–15. Alla tidigare påståenden om väntan, avvisning, fokus, kontrast,
navigering och bevarade förslag finns kvar i dessa integrationstester.

BILD-06 behåller sin identitet med Egen bildtyp. Dess 18 upprepningar för
förifyllda typer avvecklas. Text, ikon, bild, komplett kvitto, bildbyte,
ogiltig fil, uttrycklig borttagning och skydd mot återställd äldre bild
finns kvar i referensen. Ett framtida fel som är specifikt för en
förifylld objekttyp kan undgå den. Referensen utför inte varje typ.

### BILD-16: Behåll bildarbete med verklig webbläsarzoom

**Syfte:** Kontrollera bildformuläret och förlustvarningen vid verklig zoom.

**Användare:** Alex.

**Förutsättningar:** BILD-04:s nya hushåll, två bilder och ogiltig fil.
Använd datorwebbläsare och ljust respektive mörkt systemtema.

**Separat förberedelse:** Förbered BILD-04:s styrda leverans och armera
`stage:after` inför det ogiltiga tillägget. Återställ HTTPS-ingången
innan transporten avslutas med `quit` efter fallet.

**Kräver mänsklig observation:** Ställ in 200 och 400 procent med
webbläsarens verkliga zoomreglage. Använd fysiskt tangentbord och pekare
för att kontrollera nåbara fält, knappar och synligt fokus i varningen.
De automatiska CSS-storlekarna utför inte denna observation.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Använd verklig 200/400-procentszoom och fysiskt tangentbord/pekare; nå bildfält och förlustvarning utan täckande kontroller."
  },
  "reference": "Datorwebbläsare, 200 och 400 procent, ljust och mörkt systemtema.",
  "outcomes": ["Bildarbete och förlustvarning är läsbara och nåbara med lokala värden kvar."],
  "evidence": [{
    "kind": "overlap", "spec": "tests/integration/profile-image-work.spec.ts",
    "caseId": "BILD-13", "purpose": "Automatiskt kort och smalt CSS-fönster i mörkt tema utan fysisk inmatning eller verklig zoom."
  }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Börja med ett nytt hushåll för varje kombination av 200 eller 400
   procents zoom och ljust eller mörkt tema. Ställ in kombinationen innan
   bildarbetet börjar och förbered den styrda leveransen för hushållet.
2. Utför BILD-04:s steg 1–7 en gång per kombination. Rulla till bildfält
   och knappar under steg 2–4. Under steg 5–6, medan förlustvarningen
   är öppen, prova Tab, Shift+Tab och Escape och läs fokus under pekaren.
   Under steg 7, efter kastandet, kontrollera Cykelns senaste giltiga
   bild och Garagets förslag.
3. Återställ zoom till 100 procent och avsluta transporten efter sista
   kombinationen.

**Förväntat resultat:**

- Varningens text och fokus går att läsa med pekaren över knappen.
  Fält och knappar går att nå utan att minska zoom.
- Avvisning och kastande av lokala uppgifter bevarar tidigare bild och
  Garagets oberoende förslag.
