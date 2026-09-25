# Manuella testfall för fullständig återimport

Testfallen omfattar uttrycklig ersättning, bevarad åtkomst, bildhistorik,
privata utkast, personliga placeringar och ångring med nytt underlag.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.
Manuell körning sker efter att hela specifikationen är implementerad.

## Konfigurerade användare

Använd [en separat lokal provdatabas](../development/devcontainer.md#disposable-local-database)
i devcontainern och värddatorns webbläsare. **Alex** är testrollen för den
konfigurerade första administratörens befintliga Google- eller
Microsoft-konto; kontot behöver inte heta Alex. Skapa hushållet **Linden**
med påhittade uppgifter. När två profiler behövs loggar båda in med samma
konto. Ingen inbjudan, publik webbadress eller tunnel behövs.

## Allmän förberedelse

1. Starta en ny provdatabas enligt länken ovan inför varje fall. Skapa
   Linden och ett sparat objekt **Lampa från exporten**.
2. Hämta en fullständig export enligt
   [exportguiden](../user-guide/household-export.md). Spara ZIP-filen privat.
3. Ändra objektets namn till **Senare namn** och spara hela utkastet.
4. Återställ provmiljön mellan fallen. Radera hämtade testfiler efteråt.
   Vid omstart ska samma databas användas: följ bara guidens
   omstartskommando och behåll dess terminal öppen.

## Bekräftad ersättning

### IMPORT-01: Ersätt hushållet med tangentbordet

**Syfte:** Kontrollera att förberedelse inte ändrar innehåll och att
ersättning kräver ett uttryckligt beslut från aktuell administratör.

**Användare:** Alex som administratör.

**Förutsättningar:** ZIP-filen och den senare namnändringen finns enligt
förberedelsen. Ingen annan ändrar hushållet under detta fall.

**Integrationstest:**
[household-import-ui.spec.ts](../../tests/integration/household-import-ui.spec.ts),
testfallet “IMPORT-01: an administrator reviews and explicitly replaces
household content with the keyboard”.

**Steg:**

1. Öppna **Administrera tillgång** och läs **Återimportera hushållet**.
2. Välj ZIP-filen. Använd Tab till **Kontrollera importfil** och Enter.
3. Läs sammanställningen. Kontrollera i den andra profilen att **Senare
   namn** fortfarande finns. Ersättningsknappen ska ännu vara avstängd.
4. Använd tangentbordet för att markera bekräftelsen. Tryck Enter på
   **Ersätt hushållets innehåll** och invänta resultatet.
5. Läs in hushållet igen och kontrollera objektets namn. Starta om servern
   med samma databas och kontrollera innehåll och administration igen.

**Förväntat resultat:**

- Förberedelsen ändrar inget. Efter uttrycklig bekräftelse visas **Lampa
  från exporten**, och den senare namnändringen saknas.
- Alex är fortfarande administratör efter ersättning och omstart.
- Ett tydligt resultat visas. Ett uteblivet svar ska följas upp med
  **Hämta importens status**, inte tolkas som ett säkert misslyckande.

## Historik och gamla klienter

### IMPORT-06: återställ bildhistorik och ångra med nytt underlag

**Syfte:** Kontrollera att en återimport bevarar sammanslagningens
bildversioner, privata förslag och personliga placeringar, samtidigt som
gamla klientunderlag och sparförsök inte kan skriva tillbaka senare innehåll.

**Användare:** Alex i två separata webbläsarprofiler, A och B, med samma
administratörskonto. Profil B behöver två flikar under importen.

**Förutsättningar:** En ny lokal provdatabas enligt förberedelsen och inga
andra pågående sparförsök. Använd två tydligt olika små provbilder från
[bildförberedelsen](profile-images.md#allmän-förberedelse). Använd Chromium
med utvecklarverktyg i båda profilerna. Kör konsolkoden endast på provsidan.

**Integrationstest:**
[household-import-history.spec.ts](../../tests/integration/household-import-history.spec.ts),
testfallet “IMPORT-06: replacement preserves merged image history and
private work, rejects a lost-receipt retry and permits fresh undo after
restart”.

**Steg:**

1. I profil A: skapa två objekt med namnet **Lo Exempel** som föreställer
   samma påhittade person. Spara ett samband från det andra objektet med
   okänd målpunkt. Placera objekten på två igenkännliga platser i rymdkartan.
2. Lägg den första provbilden på det andra objektet och spara den.
   Slå samman objekten med det första som kvarvarande identitet.
   Bekräfta identiteten, välj det andra objektets bild och behåll sambandet.
   Kör **Fånga nästa sparbegäran** nedan i profil A och ange `merge`.
   Välj därefter **Spara hela utkastet** utan att ladda om sidan. Invänta
   kvittot och konsolbeskedet **IMPORT-06: merge sparat**.
3. Lägg den andra provbilden som privat bildförslag på kvarvarande objekt.
   Låt förslaget vara osparat. Hämta en fullständig export i Administration
   och behåll ZIP-filen privat.
4. I profil A: skapa **Senare objekt** och lägg det i utkastet. Kör samma
   fångstkod igen, ange `later` och välj **Spara hela utkastet**. Kontrollera
   konsolbeskedet **IMPORT-06: later sparat** och gränssnittets
   **Utfallet är okänt**. Välj inte att hämta kvittot igen. I profil B:
   öppna aktuell karta och kontrollera att **Senare objekt** finns; det
   visar att servern sparade innan svaret försvann. Börja skriva ett nytt
   objektförslag, men låt formuläret vara öppet utan att skicka det.
5. Öppna en andra flik i profil B och gå till Administration. Välj exporten
   från steg 3, granska rätt hushåll och bekräfta ersättningen. Försök sedan
   lägga den första flikens gamla öppna objektförslag i utkastet, innan
   servern startas om. Kontrollera att förslaget avvisas och inte syns i
   aktuell karta eller historik. Läs in aktuell karta när klienten begär det.
6. Starta om servern med samma databas enligt utvecklingsguiden. Ladda om
   profil A och B. Kontrollera den sammanslagna kartan, den privata andra
   bilden och det ursprungliga sammanslagningskvittot. **Senare objekt**
   ska saknas. Kör **Prova båda gamla sparbegärandena** nedan i profil A,
   på samma ursprung och i samma flik som fångstkodens båda körningar.
   Omladdning behåller de fångade uppgifterna. Kontrollera två HTTP 409,
   ett för `merge` och ett för `later`, samt beskedet att karta och historik
   är oförändrade. Inget gammalt lyckat kvitto får returneras.
7. I profil B: kasta det återställda privata bildförslaget, välj
   sammanslagningskvittot i historiken och ångra sparandet. Granska och
   spara hela det nya utkastet. Starta om med samma databas och kontrollera
   båda objektens bilder, samband och personliga placeringar.
8. Ta bort konsolens två sparade testbegäranden genom den sista kodraden
   nedan. Stäng testprofilerna och följ provmiljöns städning efter fallet.

**Fånga nästa sparbegäran:**

Öppna F12 → **Console** i profil A. Kör blocket en gång före
sammanslagningens sparande med svaret `merge`, och en gång före det senare
sparandet med svaret `later`. Ingen annan sparbegäran får skickas mellan
förberedelsen och respektive knapptryckning. Koden sparar bara sökvägen och
begärans ursprungliga `version`, `contentVersion` och `operationId` i flikens
`sessionStorage`. Den kopierar inga cookies, token eller inloggningshuvuden.

För `later` kontrollerar koden först ett lyckat serversvar med rätt kvitto,
återställer `fetch` och kastar sedan bort svaret för applikationen. Om inget
lyckat svar kommer avbryts inte svaret, och fallet ska markeras som ej
verifierat. Vanligt offlineläge bevisar inte ett avbrott efter transaktionen.
Ladda om fliken om du avbryter innan nästa sparande.

```javascript
(() => {
  const slot = prompt('merge eller later');
  if (!['merge', 'later'].includes(slot)) throw new Error('invalid slot');
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(
      input instanceof Request ? input.clone() : input, init,
    );
    const url = new URL(request.url);
    if (url.origin !== location.origin || request.method !== 'POST'
        || !/^\/api\/households\/[^/]+\/map\/save$/.test(url.pathname)) {
      return originalFetch(input, init);
    }
    window.fetch = originalFetch;
    const body = await request.json();
    const keys = Object.keys(body).sort().join(',');
    if (keys !== 'contentVersion,operationId,version') {
      throw new Error('unexpected save fields; stop this case');
    }
    const response = await originalFetch(input, init);
    const result = await response.clone().json();
    if (!response.ok || result.receipt?.operationId !== body.operationId) {
      console.error('IMPORT-06: inget lyckat kvitto; kontrollera utfallet');
      return response;
    }
    sessionStorage.setItem(`skyttel-import06-${slot}`, JSON.stringify({
      path: url.pathname, body,
    }));
    console.info(`IMPORT-06: ${slot} sparat`);
    if (slot === 'later') throw new TypeError('Synthetic lost save response');
    return response;
  };
  console.info('IMPORT-06: redo för nästa sparande');
})();
```

**Prova båda gamla sparbegärandena:**

Kör efter import och omstart, före det nya ångringsförslaget. Koden använder
profil A:s egen session och aktuellt bygg-ID, men återanvänder de tre gamla
begäransfälten exakt. Den tar en aktuell karta och historik före försöken och
jämför dem efter varje försök. Endast status och felkod skrivs ut; kopiera
inte privata webbläsardata till en rapport.

```javascript
await (async () => {
  const saved = ['merge', 'later'].map(slot => ({
    slot,
    ...JSON.parse(sessionStorage.getItem(`skyttel-import06-${slot}`)),
  }));
  const pattern = /^\/api\/households\/[^/]+\/map\/save$/;
  if (saved.some(item => !pattern.test(item.path) || !item.body)
      || saved[0].path !== saved[1].path) {
    throw new Error('missing requests or different household; stop');
  }
  const mapPath = saved[0].path.slice(0, -'/save'.length);
  const read = async path => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`read failed: ${response.status}`);
    return response.json();
  };
  const snapshot = async () => JSON.stringify({
    map: await read(mapPath), history: await read(`${mapPath}/history`),
  });
  const before = await snapshot();
  const build = await read('/api/version');
  for (const item of saved) {
    const response = await fetch(item.path, {
      method: 'POST', credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Skyttel-Build': `${build.commit}:${build.version}`,
      },
      body: JSON.stringify(item.body),
    });
    const result = await response.json();
    console.info('IMPORT-06', item.slot, response.status, result.error);
    if (response.status !== 409
        || !['content_conflict', 'operation_conflict'].includes(result.error)) {
      throw new Error('old save was not rejected by content protection');
    }
    if (await snapshot() !== before) {
      throw new Error('map or history changed after old save retry');
    }
  }
  console.info('IMPORT-06: karta och historik är oförändrade');
})();
```

Efter fallet, ta bort de två lokalt sparade begärandena:

```javascript
for (const slot of ['merge', 'later']) {
  sessionStorage.removeItem(`skyttel-import06-${slot}`);
}
```

**Förväntat resultat:**

- För det senare sparandet visas okänt utfall trots att aktuell karta i
  den andra profilen bekräftar transaktionen. Efter importen finns den
  sammanslagna kartan och dess första bild samt det osparade förslaget med
  den andra bilden. Senare sparat innehåll blandas inte in.
- Både det senare sparandets gamla begäran och den importerade
  sammanslagningens gamla begäran avvisas med HTTP 409. Karta, privata
  utkast och historik är oförändrade efter varje försök. Inget nytt
  sparande eller falskt gammalt lyckat kvitto uppstår.
- Det gamla öppna objektförslaget avvisas utan ny kartändring. Det
  ursprungliga kvittots identitet, författare och tidpunkt bevaras.
  Ett nytt aktuellt underlag kan ångra den importerade sammanslagningen.
- Efter ångrandet finns båda ursprungliga identiteterna. Det andra
  objektets första bild, okända målpunkt och båda personliga placeringarna
  är bevarade även efter omstart.

### IMPORT-07: bevara äldre fältbetydelser och ångra med nytt underlag

**Syfte:** Kontrollera att import bevarar både dagens fältdefinition och
historiska värden med en annan definition, utan att konvertera värden.

**Användare:** Alex som administratör.

**Förutsättningar:** Ett separat provhushåll utan andra ändringar. Välj
en objekttyp utan använda egna fält. Följ förberedelserna för fullständig
export och återimport i detta dokument.

**Integrationstest:**
[household-import-definitions.spec.ts](../../tests/integration/household-import-definitions.spec.ts),
testfallet “IMPORT-07: historical field meanings survive replacement and
fresh whole-save undo”.

**Steg:**

1. Lägg till textfältet **Serienummer** på den oanvända objekttypen och
   spara hela utkastet.
2. Ändra det ännu oanvända fältets värdeslag till tal. Lägg objektet
   **Mätare** av samma typ med värdet **42** i utkastet. Spara dessa två
   ändringar tillsammans och anteckna kvittot.
3. Ångra hela sparandet från steg 2 genom historiken och spara
   ångringsförslaget. Kontrollera att objektet saknas och fältet är text
   igen. Behåll även detta kvitto.
4. Hämta en fullständig export. Återimportera filen till samma hushåll
   genom Administration och bekräfta ersättningen. Starta om servern med
   samma databas och öppna hushållet igen.
5. Kontrollera båda kvittona i historiken. Ångra sparandet från steg 3
   med aktuellt underlag och spara hela förslaget. Starta om igen och
   kontrollera **Mätare** och fältdefinitionen.

**Förväntat resultat:**

- Exporten accepteras även när ett historiskt talvärde hör till ett fält
  som nu är text. Fältets och objektets stabila identiteter bevaras.
- Historiken behåller samma kvitton, författare, tidpunkter och tidigare
  värden efter importen. Talet **42** konverteras inte till text.
- Det nya ångrandet återställer **Mätare**, talfältet och värdet **42**.
  Resultatet kvarstår efter omstart och de tidigare kvittona är oförändrade.

### IMPORT-08: förbered filen på nytt när en tidigare förberedelse saknas

**Syfte:** Kontrollera att en bortstädad förberedelse inte låser importen
och att en ny ersättning kräver ny granskning och bekräftelse.

**Användare:** Alex som administratör.

**Förutsättningar:** En fullständig provexport och en separat testinstallation
som får startas om. Ingen ersättning har bekräftats.

**Integrationstest:**
[household-import-recovery.spec.ts](../../tests/integration/household-import-recovery.spec.ts),
testfallet “IMPORT-08: an unavailable prepared archive allows fresh review
after restart without changing content”.

**Steg:**

1. Välj exportfilen i Administration och tryck **Kontrollera importfil**.
   Granska sammanställningen men bekräfta inte ersättning.
2. Starta om servern med samma databas. Ladda om administrationssidan.
   Tryck **Hämta importens status** innan du väljer någon ny fil.
3. Läs beskedet om den saknade förberedelsen och kontrollera att kartan
   fortfarande har sitt tidigare innehåll.
4. Välj filen på nytt, kontrollera den och granska den nya sammanställningen.
   Bekräfta uttryckligen ersättningen och invänta resultatet.

**Förväntat resultat:**

- Omstarten städar tillfälligt material utan att ersätta hushållets innehåll.
- Statusbeskedet gör det möjligt att välja en ny fil. Ett saknat förberett
  arkiv påstås inte vara en genomförd import.
- Den nya filen kräver ny granskning och ett nytt uttryckligt beslut.
  Därefter kan samma giltiga export återimporteras.
