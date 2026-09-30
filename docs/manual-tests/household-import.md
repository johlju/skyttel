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
med påhittade uppgifter. Om fallet inte säger annat loggar två profiler in
med samma konto. IMPORT-09, IMPORT-11 och IMPORT-13 använder även **Robin**,
en annan verifierad användare som bjuds in till provhushållet. Fallens
steg anger respektive roll. Ingen publik webbadress eller tunnel behövs.

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

1. Öppna **Inställningar → Återimportera hushållet** och läs omfattningen.
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
   Låt förslaget vara osparat. Hämta en fullständig export i
   **Inställningar → Fullständig export** och behåll ZIP-filen privat.
4. I profil A: skapa **Senare objekt** och lägg det i utkastet. Kör samma
   fångstkod igen, ange `later` och välj **Spara hela utkastet**. Kontrollera
   konsolbeskedet **IMPORT-06: later sparat** och gränssnittets
   **Utfallet är okänt**. Välj inte att hämta kvittot igen. I profil B:
   öppna aktuell karta och kontrollera att **Senare objekt** finns; det
   visar att servern sparade innan svaret försvann. Börja skriva ett nytt
   objektförslag, men låt formuläret vara öppet utan att skicka det.
5. Öppna en andra flik i profil B och gå till
   **Inställningar → Återimportera hushållet**. Välj exporten
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
   genom **Inställningar → Återimportera hushållet** och bekräfta ersättningen.
   Starta om servern med
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

1. Välj exportfilen i **Inställningar → Återimportera hushållet** och tryck
   **Kontrollera importfil**.
   Granska sammanställningen men bekräfta inte ersättning.
2. Starta om servern med samma databas. Ladda om importsidan.
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

### IMPORT-09: hitta samma ersättning i en annan administratörs webbläsare

**Syfte:** Följ ett bekräftat importförsök trots tappat svar, ny webbläsare
och omstart utan att ersätta innehållet en gång till.

**Användare:** Alex och Robin som aktuella administratörer i separata
webbläsarprofiler. Bjud först in Robin och ge rollen administratör.

**Förutsättningar:** En separat provinstallation och export enligt den
allmänna förberedelsen. Robin har inte öppnat importen tidigare. Använd
Chromium med utvecklarverktyg i Alex profil.

**Integrationstest:**
[household-import-discovery.spec.ts](../../tests/integration/household-import-discovery.spec.ts),
testfallet “IMPORT-09: another administrator discovers the same committed
import after a lost response and restart”.

**Steg:**

1. Alex väljer exportfilen och **Kontrollera importfil**. Läs granskningen.
2. Kör följande kod i utvecklarverktygens Console innan bekräftelsen.
   Den släpper igenom serverns begäran och kastar bort ett lyckat svar.
   Fortsätt endast om konsolen senare visar det slutförda försökets ID.
3. Alex markerar bekräftelsen och väljer **Ersätt hushållets innehåll**.
   Kontrollera beskedet **Utfallet är okänt** och att nytt filval är spärrat.
4. Robin öppnar importen i sin egen webbläsare. Kontrollera att slutfört
   resultat visas för samma försökets ID, utan uppladdning eller bekräftelse.
5. Kontrollera återställt innehåll, privata utkast och aktuell tillgång.
   Starta om servern med samma databas och ladda om Robins importvy.
   Samma försök och resultat ska fortfarande visas.

```javascript
(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== 'POST'
        || !/\/imports\/[^/]+\/confirm$/.test(new URL(request.url).pathname)) {
      return originalFetch(input, init);
    }
    window.fetch = originalFetch;
    const response = await originalFetch(input, init);
    const result = await response.clone().json();
    if (!response.ok || result.status !== 'completed') return response;
    console.info('IMPORT-09: slutfört försök', result.id);
    throw new TypeError('Synthetic lost import response');
  };
})();
```

**Förväntat resultat:**

- Alex får inget falskt framgångs- eller misslyckandebesked när svaret
  försvinner. Robin hittar samma beständiga försök med aktuell behörighet.
- Omstart bevarar försökets identitet och resultat. Ingen ny ersättning
  begärs och inget privat arbete blandas ihop.

### IMPORT-10: återfå en ny granskning efter tappat förberedelsesvar

**Syfte:** Kontrollera att en äldre slutförd import inte döljer en ny
förberedelse som samma administratör ännu inte har bekräftat.

**Användare:** Alex i två separata webbläsarprofiler.

**Förutsättningar:** En separat provinstallation och en fullständig export.
Genomför först IMPORT-01. Behåll servern igång under detta fall; en
obekräftad förberedelse upphör efter tio minuter eller vid omstart.

**Integrationstest:**
[household-import-discovery.spec.ts](../../tests/integration/household-import-discovery.spec.ts),
testfallet “IMPORT-10: the current administrator recovers a lost
preparation before an older completed import”.

**Steg:**

1. Öppna importen i profil A och välj exportfilen på nytt. Kör följande
   kod i utvecklarverktygens Console före **Kontrollera importfil**.
2. Välj **Kontrollera importfil**. Fortsätt endast om konsolen visar
   ID för en kontrollerad förberedelse. Läs felbeskedet i gränssnittet.
3. Logga in med samma konto i en ny profil B och öppna importen.
   Kontrollera att den nya granskningen och samma ID visas, istället
   för att den äldre importen visas som resultatet av det nya försöket.
4. Kontrollera att innehållet fortfarande är oförändrat och att
   ersättning kräver en ny markering av bekräftelsen.
5. Bekräfta ersättningen i profil B. Kontrollera det slutförda resultatet.

```javascript
(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== 'POST'
        || !/\/imports$/.test(new URL(request.url).pathname)) {
      return originalFetch(input, init);
    }
    window.fetch = originalFetch;
    const response = await originalFetch(input, init);
    const result = await response.clone().json();
    if (!response.ok || result.status !== 'ready') return response;
    console.info('IMPORT-10: kontrollerad förberedelse', result.id);
    throw new TypeError('Synthetic lost preparation response');
  };
})();
```

**Förväntat resultat:**

- Samma administratör återfår den nya granskningen utan ny uppladdning.
  En annan administratör får inte bekräfta den obekräftade förberedelsen.
- Den äldre slutförda importen används inte som besked för det nya
  försöket. Ingen ny ersättning sker innan ett uttryckligt beslut.

### IMPORT-11: slutför samma rensning med en annan administratör

**Syfte:** Kontrollera att en verklig rensningsspärr består efter
ersättningen och kan lösas av en annan aktuell administratör.

**Användare:** Alex och Robin som aktuella administratörer i separata
webbläsarprofiler samt driftansvarig för den lokala provinstallationen.

**Förutsättningar:** En separat provinstallation och en fullständig export.
Bjud in Robin och ge rollen administratör. Kör servern utan rootbehörighet.
Driftansvarig behöver kunna ändra rättigheter för provets tillfälliga filer.
Gör aldrig detta i en installation som används för riktigt hushållsarbete.

**Integrationstest:**
[household-import-discovery.spec.ts](../../tests/integration/household-import-discovery.spec.ts),
testfallet “IMPORT-11: another administrator finishes the same gated
cleanup after the original administrator loses authority”.

**Steg:**

1. Alex väljer exportfilen och **Kontrollera importfil**. Anteckna
   försökets visade ID före bekräftelsen.
2. Driftansvarig hittar katalogen `.skyttel-imports` bredvid provets
   SQLite-fil och dess underkatalog med samma ID. Sätt endast den
   underkatalogens rättigheter till `500` med `chmod`. Behåll terminalen.
3. Alex bekräftar ersättningen. Kontrollera beskedet att innehållet är
   ersatt men att tillfälliga filer behöver rensas. Försök öppna kartan
   och göra en export i Robins profil; båda ska vara spärrade.
4. Robin ändrar Alex roll till medlem genom administrationen. Öppna
   sedan importen i Robins profil. Samma ID och väntande rensning ska
   visas automatiskt. Ny uppladdning ska vara spärrad.
5. Driftansvarig återställer underkatalogens rättigheter till `700`.
   Robin väljer **Slutför importens rensning**. Kontrollera att samma
   försök blir slutfört och att katalogen försvinner.
6. Läs in kartan igen. Kontrollera återställt innehåll och privat arbete.
   Starta om med samma databas och kontrollera försökets resultat igen.
   Vid avbrutet test: återställ alltid katalogens rättigheter till `700`.

**Förväntat resultat:**

- Ersättningen är beständig trots att rensningen misslyckas. Kartan och
  ny export är spärrade tills rensningen faktiskt lyckas.
- Alex kan inte läsa eller slutföra importförsöket efter rolländringen.
  Robin kan följa och slutföra exakt samma försök utan en ny ersättning.
- Samma resultat och oförändrat återställt innehåll består efter omstart.

### IMPORT-12: egna inställningssidor och skyddat kartarbete

**Syfte:** Bevara oskickat kartarbete vid vanlig navigering och stoppa
det gamla arbetet när hushållets innehåll ersätts.

**Användare:** Alex som administratör.

**Förutsättningar:** En separat provinstallation och en fullständig export.
Använd tangentbord och kontrollera både mobil och dator.

**Integrationstest:**
[household-import-settings.spec.ts](../../tests/integration/household-import-settings.spec.ts),
testfallet “IMPORT-12: protected Settings recovery pages preserve ordinary
work and retire it after replacement”.

**Steg:**

1. Öppna formuläret för ett nytt objekt. Skriv ett namn men lägg inte
   förslaget i utkastet. Låt fokus vara i namnfältet.
2. Öppna **Inställningar → Återimportera hushållet**. På mobil fäller
   du först ut **Välj inställning**. Kontrollera att sidrubriken får
   synligt fokus och att kartan inte kan användas bakom sidan.
3. Välj exportfilen. Aktivera **Kontrollera importfil** med tangentbordet.
   Läs **Ersätts** och **Behålls**; ersättning kräver fortfarande bekräftelse.
4. Besök **Koppla historiskt innehåll** genom inställningarnas navigation.
   Hämta aktuell metadata och läs identitetsvarningen, utan att ändra något.
5. Välj **Tillbaka till kartan**. Kontrollera samma oskickade namn och fokus.
6. Gå tillbaka till importen och välj **Hämta importens status**. Granska
   samma förberedelse, markera bekräftelsen och genomför ersättningen.
7. Kontrollera slutfört resultat och fokus på återinläsningen. Återgå till
   kartan. Det gamla oskickade formuläret ska försvinna; inget gammalt
   förslag får följa med till det ersatta innehållet.

**Förväntat resultat:**

- Import och historisk identitetsgranskning har egna sidor i Inställningar.
  Vanlig navigering behåller oskickad text och dess fokus utan att spara den.
- Ersättning kräver uttryckligt beslut. Därefter kan det gamla kartarbetet
  inte fortsätta mot det återställda innehållet.

### IMPORT-13: åtkomst till import och historisk identitetsgranskning

**Syfte:** Kontrollera att direkta adresser och förlorad administratörsroll
inte ger tillgång till administrativa innehållsåtgärder.

**Användare:** Alex som administratör och Robin i en separat profil.

**Förutsättningar:** En separat provinstallation. Robin har ännu inte
fått tillgång till hushållet. Spara adresserna till de två sidorna i
Inställningar för att kunna öppna dem direkt.

**Integrationstest:**
[household-import-settings.spec.ts](../../tests/integration/household-import-settings.spec.ts),
testfallet “IMPORT-13: import and identity Settings destinations enforce
current household administrator access”.

**Steg:**

1. Öppna importens adress i en utloggad profil. Kontrollera att
   inloggning krävs och att filval saknas.
2. Robin loggar in utan inbjudan och öppnar adressen för historiskt
   innehåll. Ingen metadata eller kontroll för innehållskoppling ska visas.
3. Bjud in Robin och acceptera som medlem. Öppna båda adresserna igen.
   Sidorna ska neka administration utan filval eller identitetsgranskning.
4. Alex ger Robin rollen administratör och öppnar importen i sin egen
   profil. Robin ändrar sedan Alex roll till medlem.
5. Återvänd till Alex öppna flik och kontrollera att importsidan förlorar
   sina administrativa kontroller när åtkomsten uppdateras. Båda sidorna
   kräver fortsatt aktuell administratörsroll.

**Förväntat resultat:**

- Inloggning, aktuellt medlemskap och administratörsroll krävs. En direkt
  adress kringgår inte skyddet och visar inga privata innehållsvärden.
- När rollen försvinner tas kontrollerna bort även på en öppen sida.

### IMPORT-14: håll ett oklart försök skilt från en senare ersättning

**Syfte:** Kontrollera att ett känt men oklart försök följs med sitt eget
ID, även när en annan klient genomför en ny ersättning.

**Användare:** Alex i två separata webbläsarprofiler.

**Förutsättningar:** En separat provinstallation och samma giltiga export
i båda profilerna. Använd utvecklarverktygen i den första profilen.

**Integrationstest:**
[household-import-discovery.spec.ts](../../tests/integration/household-import-discovery.spec.ts),
testfallet “IMPORT-14: a locally known uncertain import keeps its exact
identity after a newer replacement and a lost status response”.

**Steg:**

1. Förbered filen i den första profilen. Kör koden i IMPORT-09 för att
   kasta bort det riktiga lyckade bekräftelsesvaret. Bekräfta ersättningen
   och anteckna försökets ID. Utfallet ska visas som okänt.
2. Öppna importen i den andra profilen. Den visar första försökets resultat.
   Välj sedan exporten igen, granska och bekräfta en ny ersättning.
   Anteckna det nya försökets ID; det ska skilja sig från det första.
3. Starta om servern med samma databas. Ladda om den första profilens
   importsida. Det första ID:t ska finnas kvar och nytt filval vara spärrat.
4. Sätt den första profilens Network-panel till **Offline** och välj
   **Hämta importens status**. Ett fel ska visas utan slutfört resultat.
   Filvalet förblir spärrat och samma första ID ska fortfarande visas.
5. Återställ **Online** och hämta status igen. Det första försökets
   slutförda resultat ska visas. Ingen ny ersättning ska skickas.
6. Kontrollera att hushållets innehåll och privata arbete motsvarar
   exporten efter den andra ersättningen.

**Förväntat resultat:**

- En senare ersättning används inte som kvitto för ett äldre oklart försök.
- Ett misslyckat statusförsök bevarar osäkerheten. Lyckad läsning följer
  samma kända ID utan ny uppladdning eller bekräftelse.

### IMPORT-15: tangentbord genom fel, granskning och innehållskoppling

**Syfte:** Kontrollera att nästa användbara kontroll får synligt fokus
genom återimport och uttrycklig ändring av en innehållskoppling.

**Användare:** Alex som administratör.

**Förutsättningar:** En separat provinstallation med ett privat utkast
och en fullständig export av samma hushåll. Skapa också en vanlig textfil
med namnet `invalid.zip`; den ska inte vara ett ZIP-arkiv. Upprepa i ljust
och mörkt tema på dator, smal mobil och kort fönster. Välj minskad rörelse.

**Integrationstest:**
[household-recovery-accessibility.spec.ts](../../tests/integration/household-recovery-accessibility.spec.ts),
testfallet “IMPORT-15: keyboard recovery controls remain visible through
review, errors and assignment at 1280px”, samma titel med “390px”,
“320px” och “640px”.

**Steg:**

1. Öppna Inställningar och välj importsidan med tangentbordet. På mobil
   öppnar du först **Välj inställning**. Sidans fokuserade rubrik ska synas.
2. Välj `invalid.zip` och aktivera **Kontrollera importfil** med Enter.
   Kontrollera det tydliga felet och att fokus återgår till filvalet.
   Inget hushållsinnehåll ska ändras.
3. Välj den riktiga exporten och kontrollera filen. Fördröj vid behov
   svaret med webbläsarens nätverksverktyg. Flytta fokus till
   **Tillbaka till kartan** medan svaret väntar. Ditt nya fokus ska
   finnas kvar när granskningen visas.
4. Aktivera **Hämta importens status**. Fokus ska gå till
   **Granska ersättningen**. Läs vad som ersätts och behålls.
5. Aktivera **Avbryt förberedelsen** med Enter. Efter lyckat avbrott ska
   fokus återgå till filvalet och kartan vara oförändrad. Välj filen och
   kontrollera den igen. Fokus ska återgå till den nya granskningen.
6. Markera bekräftelsen med mellanslag och aktivera ersättningsknappen
   med Enter. Efter slutförd ersättning ska fokus ligga på
   **Läs in det återställda hushållet**.
7. Öppna **Koppla historiskt innehåll** genom Inställningar. Hämta
   underlaget, välj din innehållsidentitet och **Ingen aktuell ägare**.
   Läs hela den historiska identitetens namn och ID samt valet utan ägare
   i den separata granskningen utanför vallistorna.
   Läs följderna och bekräfta med tangentbordet. Fokus ska återgå till
   **Hämta aktuella innehållskopplingar** efter det sparade resultatet.
8. Välj samma identitet och din aktuella verifierade användare. En ny
   bekräftelse krävs. Läs båda fullständiga ID:na i granskningen, även på
   smal skärm och med förstoring. Bekräfta och kontrollera att ditt privata
   utkast finns kvar när du läser in kartan igen.
9. Upprepa med det andra temat. Alla kontroller, statusbesked och texter
   ska vara läsbara och möjliga att nå utan rullning i sidled.
   Kontrollera särskilt texten för den valda sidan i inställningsmenyn.
   Läs också knapparna för ersättning och innehållskoppling när de har
   tangentbordsfokus.
   På mobil öppnar du menyn för att läsa den valda sidan.

**Förväntat resultat:**

- Fel, granskning, ersättning och innehållskoppling lämnar fokus på en
  användbar plats. Ett nyare eget fokusval skrivs inte över av ett svar.
- Bekräftelser är uttryckliga och kan utföras med tangentbordet.
  Identitetsbytet slår inte ihop eller raderar det privata arbetet.
- Hela flödet går att använda i båda teman på smal och bred skärm.

### IMPORT-16: avbryt en obekräftad förberedelse

**Syfte:** Ta bort en kontrollerad men ännu obekräftad import utan att
ersätta hushållets innehåll.

**Användare:** Alex som aktuell administratör.

**Förutsättningar:** En separat provinstallation och giltig export enligt
den allmänna förberedelsen. Ingen ersättning har bekräftats.

**Integrationstest:**
[household-import-cancel.spec.ts](../../tests/integration/household-import-cancel.spec.ts),
testfallet “IMPORT-16: an administrator explicitly cancels only an
unconfirmed preparation and removes its staged archive”.

**Steg:**

1. Börja ett nytt objekt med namnet **Oskickat arbete under avbrottet**
   utan att skicka förslaget. Öppna importsidan, välj exporten och
   **Kontrollera importfil**. Läs granskningen utan att markera bekräftelsen.
2. Använd Tab till **Avbryt förberedelsen** och tryck Enter.
3. Kontrollera beskedet att förberedelsen är avbruten. Granskningen ska
   försvinna och fokus återgå till filvalet.
4. Återgå till kartan. Det oskickade formuläret ska finnas kvar. Kontrollera
   att den senare ändringen **Senare namn**, privata utkast och aktuell
   tillgång är oförändrade.
5. Öppna importen och ladda om sidan. Ingen granskning av den avbrutna filen
   ska komma tillbaka. Hushållets sparade och privata uppgifter är oförändrade.

**Förväntat resultat:**

- Ett uttryckligt avbrott tar bort den obekräftade tillfälliga filen.
  Hushållet ersätts inte och ingen innehållskoppling ändras.
- Att lämna sidan är inte samma sak som att avbryta. Ett redan bekräftat
  eller oklart importförsök följs med **Hämta importens status**.

### IMPORT-17: följ avbrottets rensning och tappade svar

**Syfte:** Behåll samma obekräftade förberedelse vid rensningsfel och
skilj ett saknat svar från ett bekräftat avbrott.

**Användare:** Alex som aktuell administratör i två webbläsarprofiler.

**Förutsättningar:** En separat provinstallation där driftansvarig kan
ändra filrättigheter och starta om servern. En giltig export och ett
privat utkast ska finnas. Använd aldrig en produktionsinstallation.

**Integrationstest:**
[household-import-cancel.spec.ts](../../tests/integration/household-import-cancel.spec.ts),
testfallet “IMPORT-17: failed cancellation cleanup and a lost success
remain bound to the same unconfirmed preparation”.

**Steg:**

1. Kontrollera exportfilen utan att bekräfta ersättningen. Anteckna
   förberedelsens ID. Driftansvarig sätter dess underkatalog i
   `.skyttel-imports` till läs- och sökbehörighet, men tar bort
   skrivbehörighet (`chmod 500`).
2. Välj **Avbryt förberedelsen**. Kontrollera att förberedelsen inte
   längre kan användas och att rensning återstår. Kartan och utkastet
   ska gå att läsa. Inget lyckat avbrott ska påstås.
3. Logga in med samma konto i den andra profilen och öppna importen.
   Samma ID och **Slutför förberedelsens rensning** ska visas. Filval och
   ersättning ska vara spärrade.
4. Driftansvarig återställer katalogens rättigheter till `chmod 700`.
   Kör koden nedan i den andra profilens Console. Aktivera rensningen.
   Fortsätt endast om konsolen visar **Avbrott utfört, svar dolt**.
5. Välj **Hämta importens status**. Det första lässvaret försvinner också;
   samma ID och spärrat filval ska finnas kvar. Välj status en gång till.
6. Förberedelsen ska nu vara otillgänglig och filvalet tillgängligt.
   Detta ska inte presenteras som ett kvitto på avbrottet. Starta om
   servern och ladda om sidan. Kartan och det privata utkastet är kvar.

```javascript
const originalFetch = window.fetch;
let cancelledId;
let hideRead = true;
window.fetch = async (...args) => {
  const request = new Request(...args);
  const url = new URL(request.url);
  const cancelRoute = /\/imports\/[^/]+\/cancel$/.test(url.pathname);
  if (request.method === 'POST' && cancelRoute) {
    const response = await originalFetch(...args);
    const result = await response.clone().json();
    if (!response.ok || result.cancelled !== true) return response;
    cancelledId = url.pathname.replace(/\/cancel$/, '');
    console.log('Avbrott utfört, svar dolt');
    throw new TypeError('Synthetic lost cancellation response');
  }
  if (request.method === 'GET' && url.pathname === cancelledId && hideRead) {
    hideRead = false;
    throw new TypeError('Synthetic failed status read');
  }
  return originalFetch(...args);
};
```

**Förväntat resultat:**

- Rensningsfel kan följas av samma aktuella administratör i en ny profil.
  Förberedelsen kan inte ersätta innehåll efter att avbrottet börjar.
- Ett saknat svar låser filvalet tills just det försöket kan läsas.
  Ingen ny rensning eller ersättning skickas automatiskt.
- Tillfälliga filer försvinner efter lyckad rensning. Hushållets innehåll,
  privata arbete och innehållsversion är oförändrade, även efter omstart.

### IMPORT-18: hitta väntande avbrott trots en annan granskning

**Syfte:** Hitta och rensa en avbruten förberedelses kvarvarande filer i
en ny klient utan att förlora en annan obekräftad granskning.

**Användare:** Samma aktuella administratör i två webbläsarprofiler.

**Förutsättningar:** Provinstallation och filrättigheter enligt IMPORT-17.
Ingen ersättning bekräftas under provet.

**Integrationstest:**
[household-import-cancel.spec.ts](../../tests/integration/household-import-cancel.spec.ts),
testfallet “IMPORT-18: a fresh administrator client can find cancelled
files even when another review is ready”.

**Steg:**

1. Kontrollera exportfilen i första profilen och anteckna ID.
2. Öppna importen i andra profilen. Kontrollera samma fil på nytt och
   anteckna det nya ID:t. Den första profilens granskning ska vara kvar.
3. Driftansvarig tar bort skrivbehörigheten från första förberedelsens
   underkatalog (`chmod 500`). Avbryt den i första profilen och läs att
   rensning återstår.
4. Öppna importen i en helt ny flik utan kopierad fliklagring. Det första
   ID:t och dess väntande rensning ska gå att hitta. Filval är spärrat.
5. Återställ första katalogens rättigheter (`chmod 700`) och välj
   **Slutför förberedelsens rensning** i den nya fliken.
6. Ladda om den nya fliken. Den andra granskningen ska finnas kvar med
   sitt eget ID och omarkerad bekräftelse. Avbryt även den uttryckligen.

**Förväntat resultat:**

- En annan obekräftad granskning döljer inte kvarvarande filer som
  administratören behöver hitta och rensa efter ett uttryckligt avbrott.
- Rensning tar endast bort rätt förberedelse. Den andra granskningen
  finns kvar, och inget hushållsinnehåll ersätts eller sparas automatiskt.

### IMPORT-19: ett äldre svar får inte glömma en ny förberedelse

**Syfte:** Behålla den aktuella förberedelsens ID när ett äldre avbrottssvar
kommer tillbaka efter navigering i Inställningar.

**Användare:** Alex som aktuell administratör.

**Förutsättningar:** Giltig export och separat provinstallation. Använd
utvecklarverktygens Console för det kontrollerade fördröjda svaret.

**Integrationstest:**
[household-import-cancel.spec.ts](../../tests/integration/household-import-cancel.spec.ts),
testfallet “IMPORT-19: a retired cancellation response cannot forget a
newer preparation after Settings navigation”.

**Steg:**

1. Kontrollera exportfilen och anteckna ID. Kör koden nedan och välj
   **Avbryt förberedelsen**. Fortsätt när konsolen visar **Avbrottet är
   utfört, svaret väntar**.
2. Öppna **Koppla historiskt innehåll** och återgå till importen. Hämta
   första försökets status och läs att förberedelsen inte finns längre.
3. Kontrollera filen igen och anteckna det nya ID:t. Kör
   `window.releaseImportReply()` i Console för att släppa det äldre svaret.
4. Ladda om sidan. Det nya ID:t ska finnas kvar med spärrat filval tills
   **Hämta importens status** läser just den nya förberedelsen.
5. Läs den nya granskningen och avbryt den uttryckligen. Kartan ska vara
   oförändrad genom hela provet. Omladdning återställer Console-koden.

```javascript
const originalFetch = window.fetch;
const heldReply = new Promise((resolve) => {
  window.releaseImportReply = resolve;
});
window.fetch = async (...args) => {
  const request = new Request(...args);
  const response = await originalFetch(...args);
  const isCancel = /\/imports\/[^/]+\/cancel$/.test(new URL(request.url).pathname);
  if (request.method === 'POST' && isCancel) {
    window.fetch = originalFetch;
    const result = await response.clone().json();
    if (!response.ok || result.cancelled !== true) return response;
    console.log('Avbrottet är utfört, svaret väntar');
    await heldReply;
    if (request.signal.aborted) throw new DOMException('Avbruten', 'AbortError');
  }
  return response;
};
```

**Förväntat resultat:**

- Ett svar för en lämnad vy tar inte bort en ny förberedelses identitet.
  Omladdning följer det lokalt kända nya ID:t genom uttrycklig läsning.
- Navigering ångrar inte det avbrott som redan utförs på servern och
  skickar varken ny ersättning eller automatisk upprepning.

### IMPORT-20: en äldre statusläsning får inte glömma en ny förberedelse

**Syfte:** Behålla den aktuella förberedelsens ID när ett fördröjt svar
om ett äldre, borttaget försök kommer efter navigering i Inställningar.

**Användare:** Alex som aktuell administratör i två flikar.

**Förutsättningar:** Giltig export och separat provinstallation. Använd
utvecklarverktygens Console för den kontrollerade fördröjningen.

**Integrationstest:**
[household-import-cancel.spec.ts](../../tests/integration/household-import-cancel.spec.ts),
testfallet “IMPORT-20: a retired unavailable status response cannot forget
a newer preparation after Settings navigation”.

**Steg:**

1. Kontrollera exportfilen i första fliken och anteckna ID. Öppna
   importen i en andra flik med samma inloggning och avbryt just den
   förberedelsen där. Läs att tillfälliga filer är borttagna.
2. Kör koden nedan i första fliken och välj **Hämta importens status**.
   Fortsätt när konsolen visar **Försöket saknas, svaret väntar**.
3. Öppna **Koppla historiskt innehåll** och återgå till importen i
   första fliken. Hämta status igen och läs att förberedelsen inte finns.
4. Kontrollera filen på nytt och anteckna det nya ID:t. Kör
   `window.releaseImportStatus()` i Console för att släppa det äldre svaret.
5. Ladda om sidan. Det nya ID:t ska finnas kvar med spärrat filval tills
   **Hämta importens status** läser just den nya förberedelsen.
6. Läs granskningen och avbryt den uttryckligen. Kartan ska vara
   oförändrad. Omladdning återställer Console-koden.

```javascript
const originalFetch = window.fetch;
const heldStatus = new Promise((resolve) => {
  window.releaseImportStatus = resolve;
});
window.fetch = async (...args) => {
  const request = new Request(...args);
  const response = await originalFetch(...args);
  const isStatus = /\/imports\/[^/]+$/.test(new URL(request.url).pathname);
  if (request.method === 'GET' && isStatus) {
    window.fetch = originalFetch;
    const result = await response.clone().json();
    if (response.status !== 404 || result.error !== 'import_unavailable') {
      return response;
    }
    console.log('Försöket saknas, svaret väntar');
    await heldStatus;
    if (request.signal.aborted) throw new DOMException('Avbruten', 'AbortError');
  }
  return response;
};
```

**Förväntat resultat:**

- Ett äldre felsvar efter sidbyte kan inte glömma den nya förberedelsen.
  Omladdning följs av uttrycklig läsning av rätt, lokalt känt ID.
- Statusläsningen varken ändrar hushållsinnehåll eller upprepar avbrottet.
  Den nya granskningen kräver fortfarande ett uttryckligt eget val.
