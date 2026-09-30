# Manuella testfall för profilbilder

Testfallen omfattar privata bildförslag, visning i rymdkartan, historik,
ångring, fel, åtkomst och återgång till ett objekt efter att dess panel stängts.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

- Alex Exempel är administratör i testhushållet och använder Google.
- Robin Exempel är inbjuden medlem och använder Microsoft i en annan
  webbläsarprofil.
- En tredje profil är utloggad. Kontrollen av ett annat hushåll med
  medlemskap utförs av integrationstestets separata testdatabas.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan och öppna dess detaljpanel. För objekt i listan använder
du **Uppgifter**; i kartverktygen väljer du **Visa detaljer**. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. Att bara välja objektet eller sambandet öppnar inte formuläret.

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

### BILD-01: Bevara text och återställ tidigare bild efter omstart

**Syfte:** Verifiera samma privata utkast, beständighet och ångring för bilder.

**Användare:** Alex.

**Förutsättningar:** Lo Exempel finns i Alex utkast utan sparad bild.

**Integrationstest:**
[profile-images.spec.ts](../../tests/integration/profile-images.spec.ts),
testfallet “BILD-01: profile image proposals preserve text, survive restart
and undo replacement”.

**Steg:**

1. Öppna Lo Exempels detaljer. Välj en PNG-bild. Kontrollera förhandsbilden
   och beskedet om privat förslag. Öppna rymdkartan och kontrollera bilden
   i Lo Exempels runda symbol. Öppna detaljerna igen.
2. Skriv en ny beskrivning utan att skicka. Kontrollera att bildvalet är
   inaktiverat. Växla till rymdkartan och kontrollera bilden i Lo Exempels
   runda symbol. Öppna detaljerna. Lägg texten i utkastet och spara hela
   utkastet.
3. Starta om servern normalt och ladda om sidan. Kontrollera bilden i
   detaljerna och rymdkartan. Öppna Lo och byt bilden till WebP. Stäng
   formuläret och spara hela utkastet.
4. Öppna historiken och välj **Visa ändringarna** vid senaste sparandet.
   Läs och se bilderna före och efter. Ångra sparandet och spara hela utkastet.

**Förväntat resultat:**

- Bilden läggs på rätt objekt som privat förslag. Oskickad text bevaras vid
  vybyte och bildvalet kan inte skriva över den.
- Bilden visas i objektets runda symbol före sparandet och efter omstart.
  Sparad bild och beskrivning överlever omstart. Historiken visar bytet.
- Ångring återför den första bilden och bevarar den ändrade beskrivningen.

### BILD-02: Avvisa felaktiga bilder och återhämta bildborttagning

**Syfte:** Bevara tidigare förslag vid fel och bekräfta endast ett sparande.

**Användare:** Alex.

**Förutsättningar:** Lo Exempel finns i Alex utkast. Använd webbläsarens
utvecklarkonsol på den isolerade testsidan för avbrottet i steg 3.

**Integrationstest:**
[profile-images.spec.ts](../../tests/integration/profile-images.spec.ts),
testfallet “BILD-02: invalid images retain proposals and interrupted removal
recovers its durable receipt”.

**Steg:**

1. Välj en JPEG-bild på Lo. Försök sedan välja textfilen döpt till PNG och
   filen över 10 MB. Läs felen och kontrollera bilden och beskrivningen.
2. Stäng formuläret och spara. Öppna Lo och välj **Ta bort profilbild**.
   Granska att borttagningen är ett privat förslag.
3. Stäng formuläret. Kör avbrottskoden nedan i utvecklarkonsolen och
   spara sedan hela utkastet utan att ladda om sidan.
   Läs beskedet om okänt utfall och välj **Hämta samma kvitto igen**.
4. Kontrollera historiken. Ångra bildborttagningen och granska utkastet.

Koden väntar på serverns svar för nästa sparande och döljer sedan svaret
för gränssnittet. Den återställer `fetch` efter det enda avbrottet.
Ladda om sidan efter fallet, eller om du avbryter före sparandet.
Vanligt offlineläge verifierar inte ett avbrott efter transaktionen.

```javascript
(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const target = args[0] instanceof Request ? args[0].url : args[0];
    const method = args[1]?.method ?? args[0]?.method ?? 'GET';
    if (new URL(target, location.href).pathname.endsWith('/map/save')
        && method === 'POST') {
      window.fetch = originalFetch;
      throw new TypeError('Synthetic connection interrupted');
    }
    return response;
  };
})();
```

**Förväntat resultat:**

- Ogiltiga och för stora filer ger begripliga fel med tidigare bild och
  beskrivning kvar. Det går fortfarande att spara det giltiga utkastet.
- Okänt utfall ger ingen falsk sparbekräftelse. Kvittot bekräftar en enda
  bildborttagning och historiken har inget dubbelt sparande.
- Ångring föreslår rätt tidigare bild igen.

### BILD-03: Neka privata och historiska bildadresser efter återkallad tillgång

**Syfte:** Verifiera privata förslag och aktuellt medlemskap för bildåtkomst.

**Användare:** Alex, Robin och den utloggade profilen.

**Förutsättningar:** Robin har tillgång till samma hushåll som Alex.
Öppna utvecklarverktygens nätverkspanel i Alex profil före uppladdningen.
Anteckna sökvägen till bildens `POST`-begäran, till exempel
`/api/households/…/profile-images/…`. Den innehåller objektets ID;
bildadressen i förhandsvisningen innehåller ett annat ID.
Anteckna även begärans `X-Skyttel-Draft-Version`,
`X-Skyttel-Content-Version` och `X-Skyttel-Object-Revision`.
Kopiera inga cookies, token eller autentiseringshuvuden mellan profilerna.

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
3. Lägg JPEG-bilden som ett nytt privat bildförslag utan att spara.
   Kopiera den tredje bildadressen; den ska nekas som Robin. Prova alla
   tre bildadresserna i den utloggade profilen: samtliga ska nekas.
4. Återkalla Robins tillgång som Alex. Prova alla tre bildadresserna igen,
   även efter att du ersätter hushållets ID i adressen med `unknown-household`.
5. Öppna appens startsida i Robins profil och i den utloggade profilen.
   Kör koden nedan i respektive utvecklarkonsol och ange den antecknade
   objektadressens sökväg och versionsvärden. Kontrollera statuskoderna.

Koden använder en liten påhittad PNG-bild och profilens egen session.
Kör den först efter återkallelsen och endast på testinstallationen.
Den skriver ut HTTP-status, inga identiteter eller hemligheter.

```javascript
await (async () => {
  const path = prompt('Objektadressens sökväg från POST-begäran');
  const pattern = /^\/api\/households\/[^/]+\/profile-images\/[^/]+$/;
  if (!path || !pattern.test(path)) {
    throw new Error('invalid path');
  }
  const identity = await (await fetch('/api/version')).json();
  const headers = {
    'Content-Type': 'application/octet-stream',
    'X-Skyttel-Build': `${identity.commit}:${identity.version}`,
    'X-Skyttel-Draft-Version': prompt('X-Skyttel-Draft-Version'),
    'X-Skyttel-Content-Version': prompt('X-Skyttel-Content-Version'),
    'X-Skyttel-Object-Revision': prompt('X-Skyttel-Object-Revision'),
  };
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2;
  const pixels = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  for (const method of ['POST', 'DELETE']) {
    const response = await fetch(path, {
      method, headers, credentials: 'same-origin',
      body: method === 'POST' ? pixels : undefined,
    });
    console.log(method, response.status);
  }
})();
```

**Förväntat resultat:**

- Endast Alex ser osparade bildversioner. Robin ser den gemensamma bilden
  och den äldre bilden som bara finns i historiken. Utloggad får inte tillgång.
- Återkallad tillgång stoppar läsning av aktuell, historisk och privat bild samt
  bildändringar. API-proven ger 403 som Robin och 401 som utloggad.
  En okänd hushållsadress ger inte tillgång.

Integrationstestet kontrollerar dessutom att Robin, med giltigt medlemskap
i ett annat hushåll, inte kan läsa Lindens bilder genom det hushållets
adress. Det testet skapar det andra hushållet i sin egen databas; den
manuella kontrollen med en okänd adress ersätter inte medlemskapsprovet.

### BILD-04: Återgå till rätt objekt efter ett fördröjt bildfel

**Syfte:** Behålla senaste bild, ikon och pågående arbete när ett bildfel
kommer efter att objektets panel stängts.

**Användare:** Alex.

**Förutsättningar:** Skapa privata förslag för Cykeln och Garaget med
beskrivningar. Välj cykelikonen för Cykeln. Använd de syntetiska bilderna
och den ogiltiga filen från förberedelsen.
Upprepa i ljust och mörkt tema på dator och vid 320 pixlars fönsterbredd.
Prova också korta fönster på 1440 × 500 och 320 × 250 pixlar. Verklig webbläsarzoom
kontrolleras separat i flödet vid 200 och 400 procent.

**Integrationstest:**
[profile-image-work.spec.ts](../../tests/integration/profile-image-work.spec.ts),
testfallet “BILD-04: a delayed image error returns to its closed object without
losing newer work at {width}x{height}px {colorScheme}”, med storlekarna
1440 × 1000, 1440 × 500, 320 × 1000 och 320 × 250 samt temana light och dark.

**Steg:**

1. Redigera Garaget och skriv en ny beskrivning utan att lägga den i utkastet.
   Stäng panelen med **Stäng Garaget** och öppna **Lista** från verktygen.
   Kontrollera att **Till kartan** inte täcker listknappen i det korta fönstret.
2. Redigera Cykeln. Välj först den blå PNG-bilden och sedan den gröna
   WebP-bilden. Vänta på det privata bildförslaget efter varje val.
3. Fördröj svaret från bildanropet med webbläsarens utvecklarverktyg enligt
   instruktionen nedan. Välj `fel.png`. Stäng panelen med **Stäng Cykeln**,
   öppna listan och skriv början av Garagets namn i **Sök objekt**.
4. Släpp fram svaret. Läs det globala felet och fortsätt skriva i sökfältet.
   Välj sedan **Återgå till bilden för Cykeln**.
5. Kontrollera Cykelns beskrivning och gröna bild. Öppna Garaget igen och
   kontrollera den oskickade beskrivningen.
6. Använd bildfelets återgång till Cykeln igen. Skriv en ny beskrivning
   och välj uttryckligen **Stäng utan att skicka texten**. Kontrollera att
   det redan lagda bildförslaget finns kvar i utkastet.
7. Ge bildfelets återgång tangentbordsfokus och för pekaren över knappen.
   Kontrollera läsbar text och synligt fokus. Välj sedan återgången igen.
   Kontrollera Cykelns ursprungliga
   utkastbeskrivning, gröna bild och ikon. Kontrollera också att Garagets
   oskickade beskrivning finns kvar när du öppnar Garaget.
8. Välj **Till kartan** för att stänga arbetsytan. Öppna **Lista** och
   Garaget igen. Kontrollera att den oskickade beskrivningen finns kvar.

För en kontrollerad fördröjning, kör detta i webbläsarens konsol innan steg 3.
Det verkliga serveranropet och dess svar används. Anropa `releaseImageError()`
i konsolen i steg 4; kör `window.fetch = originalImageFetch` efter kontrollen:

```js
window.originalImageFetch = window.fetch;
let release;
const held = new Promise(resolve => { release = resolve; });
window.releaseImageError = release;
window.fetch = async (...args) => {
  const response = await originalImageFetch(...args);
  if (String(args[0]).includes('/profile-images/') && args[1]?.method === 'POST')
    await held;
  return response;
};
```

**Förväntat resultat:**

- Bildvalet är inaktiverat medan svaret väntar.
- Felet visas globalt utan att Cykelns panel öppnas eller sökfältets fokus flyttas.
- Den uttryckliga återgången öppnar Cykelns panel och fokuserar dess rubrik.
- Den senaste giltiga bilden, Cykelns ikon och båda objektens beskrivningar
  finns kvar. Garagets oskickade text har inte skickats eller sparats.
- Efter att Cykelns nya oskickade text uttryckligen kastas öppnar bildfelets
  återgång objektets aktuella förslag igen med fokus på rubriken. Den kastade
  texten återkommer inte; det oberoende arbetet i Garaget finns kvar.
- Återgångens text och fokus är läsbara också när pekaren ligger över den
  fokuserade knappen, i båda teman och på det smala fönstret. Automationen
  mäter textkontrast på minst 4,5:1.
- Både **Lista** och **Till kartan** går att trycka på i korta fönster.
  Återgången till kartan ändrar inga privata förslag eller oskickade texter.

### BILD-05: Behåll bildarbete genom Inställningar och avsluta felåtergången

**Syfte:** Spärra sparande under bildarbete och låta bildfelets återgång gälla
bara det aktuella felet, också när Inställningar öppnas.

**Användare:** Alex.

**Förutsättningar:** Ett nytt isolerat hushåll. Använd den ogiltiga filen och
den kontrollerade svarsfördröjningen i BILD-04. Ha en andra flik med samma
inloggade användare tillgänglig för det samtidiga förslaget.

**Integrationstest:**
[profile-image-work.spec.ts](../../tests/integration/profile-image-work.spec.ts),
testfallet “BILD-05: Settings preserves pending image work and retires its error
destination at 1440px”, samma titel med “390px” respektive “320px”.

**Steg:**

1. Skapa Bildarbete med en beskrivning. Kontrollera att bildvalet är spärrat
   innan **Lägg i mitt utkast**. Lägg uppgifterna i utkastet och redigera
   objektet igen. Öppna filväljaren och avbryt utan fil.
2. Håll det verkliga bildsvaret enligt BILD-04. Välj `fel.png`, stäng
   objektpanelen och arbetsytan. Kontrollera **Spara hela utkastet**.
3. Öppna Inställningar och **Visa samtals- och utkastdetaljer**. Kontrollera
   sparknappen igen och sätt tangentbordsfokus på **Tillbaka till kartan**.
   Släpp bildsvaret enligt BILD-04.
4. Läs felet utan att lämna Inställningar. Välj **Återgå till bilden för
   Bildarbete** och kontrollera objektets rubrik och beskrivning.
5. Välj **Hämta aktuellt underlag**. Kontrollera att bildfelet och dess
   återgångsknapp försvinner. Skriv en ny beskrivning utan att skicka.
6. Lägg ett annat objektförslag i samma utkast från den andra fliken.
   Försök lägga den första flikens text i utkastet utan att ladda om den.

**Förväntat resultat:**

- Avbrutet filval lämnar utkastet oförändrat. Väntande bildarbete spärrar
  hela sparandet både i kartan och i Inställningar.
- Bildfelet öppnar inte objektet automatiskt och flyttar inte det nyare
  tangentbordsfokuset. Den uttryckliga återgången lämnar Inställningar och
  fokuserar rätt objektrubrik. Beskrivningen finns kvar.
- Uppdateringen avslutar bildfelet. Det senare samtidighetsfelet återupplivar
  inte bildens återgång. Oskickad text och det andra förslaget finns kvar;
  inget delas med hushållet.

### BILD-06: Dela text, ikon och bild tillsammans för varje objekttyp

**Syfte:** Hantera bilder för alla objekttyper i samma privata objektförslag
och kvitto samt ta bort senaste bilden utan att få tillbaka en äldre.

**Användare:** Alex.

**Förutsättningar:** Använd ett nytt isolerat hushåll för varje typ. Prova
Person, Tjänst, Tjänstekonto, Abonnemang, E-postadress, Bankkonto, Kort,
Företag, Förening, Bostad, Garage, Fordon, Avtal, Hyresavtal, Låneavtal,
Kreditavtal, Avbetalningsavtal och Försäkringsavtal. Prova också en egen
typ med namnet Egen bildtyp, skapad genom **Typer och egna fält** i
Inställningar. Använd två giltiga bilder och `fel.png` från förberedelsen.

**Integrationstest:**
[profile-image-types.spec.ts](../../tests/integration/profile-image-types.spec.ts),
testfallet “BILD-06: Person shares text, icon and image in one proposal and
removes the latest image”, med samma titel där “Person” ersätts av var och
en av de övriga arton typerna ovan.

**Steg:**

1. Välj **Nytt objekt**. Fyll namn och beskrivning och välj den aktuella
   typen. Kontrollera att bildvalet är spärrat. Välj **Lägg i mitt utkast**.
2. Redigera objektet igen. Sök cykel under **Ikon** och välj **Cykel**.
   Välj den första giltiga bilden och kontrollera förhandsbilden.
3. Granska hela utkastet. Objektets text, ikon och bild ska ingå i ett
   objektförslag. Inget ska ännu vara delat med hushållet. Stäng formuläret
   utan att skicka mer text och välj **Spara hela utkastet**. Läs kvittot.
4. Redigera objektet igen. Skriv en ny beskrivning och kontrollera att
   bildvalet är spärrat tills texten läggs i utkastet. Lägg texten i utkastet
   och redigera objektet igen.
5. Välj den andra giltiga bilden. Öppna filväljaren igen och avbryt.
   Välj därefter `fel.png`. Kontrollera att den andra bilden, ikonen
   och den nya beskrivningen finns kvar efter felet.
6. Välj **Ta bort profilbild**. Kontrollera att ingen bild visas och att
   cykelikonen kommer fram. Den första sparade bilden ska inte komma tillbaka.
7. Granska det enda objektförslaget med den nya texten och utan bild.
   Stäng formuläret och välj **Spara hela utkastet**. Läs kvittot och
   historiken för båda sparandena.

**Förväntat resultat:**

- Samma flöde fungerar för alla förifyllda typer och den egna typen.
- Text, ikon och bild hör till samma objekt med samma identitet och typ.
  Ett uttryckligt helt sparande delar dem tillsammans med ett kvitto.
- Avbrutet eller ogiltigt filval ändrar inte det senaste giltiga förslaget.
  Privat bildbyte och borttagning ändrar inte det tidigare gemensamma objektet.
- Borttagningen föreslår ingen bild och bevarar vald ikon och den nya texten.
  Det andra kvittot visar den första sparade bilden före ändringen och
  ingen bild efteråt. Historiken innehåller de två hela sparandena.
