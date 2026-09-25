# Manuella testfall för profilbilder

Testfallen omfattar privata bildförslag, visning i rymdkartan, historik,
ångring, fel och åtkomst.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

- Alex Exempel är administratör i testhushållet och använder Google.
- Robin Exempel är inbjuden medlem och använder Microsoft i en annan
  webbläsarprofil.
- En tredje profil är utloggad. Kontrollen av ett annat hushåll med
  medlemskap utförs av integrationstestets separata testdatabas.

## Allmän förberedelse

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan. Detaljpanelen visar uppgifterna. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. I hel kartvy heter knappen **Redigera val**. Att bara välja
objektet eller sambandet öppnar inte formuläret.

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
4. Öppna historiken. Läs och se bilderna före och efter senaste sparandet.
   Ångra sparandet och spara hela utkastet.

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
   Kontrollera att objektets aktuella bild är PNG-bilden. Öppna historiken
   och jämför bilderna före och efter bytet. Den första WebP-bilden ska nu
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
