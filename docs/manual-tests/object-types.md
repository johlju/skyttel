# Manuella testfall för objekttyper och egna fält

Testfallen hjälper den som provar Skyttel att kontrollera gemensamma
definitioner, privata förslag, frivilliga fält, typbyten och samtidiga
ändringar.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

- Alex är administratör i testhushållet och loggar in med Google.
- Lo är vanlig medlem i samma hushåll och använder en annan webbläsarprofil.
  Alex bjuder in Lo enligt [tillgångsguiden](../user-guide/access.md).
- Använd endast påhittade uppgifter. Alla prov gäller en separat
  testinstallation med riktig SQLite, aldrig ett verkligt hushåll.

## Allmän förberedelse

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan. Detaljpanelen visar uppgifterna. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. I hel kartvy heter knappen **Redigera val**. Att bara välja
objektet eller sambandet öppnar inte formuläret.

1. Starta appen enligt [provförberedelsen](../development/devcontainer.md#disposable-local-database).
   Börja varje fall i ett nytt testhushåll utan privata förslag.
2. Ha båda profilerna öppna när fallet använder två medlemmar. Använd
   [typguiden](../user-guide/object-types.md) för att hitta formulären.
3. Vid kontroll av publika HTTP-svar, använd webbläsarens nätverkspanel
   för den egna inloggade profilen. Kartan läses på
   `/api/households/<hushållets id>/map`, historiken på samma adress med
   `/history`. Hushållets ID finns i kartans vanliga nätverksbegäran.
   Skriv inte inloggningsuppgifter eller testinnehåll i offentliga rapporter.

### Skicka ett felaktigt fältvärde med aktuell utkastversion

Använd detta kontrollsteg i TYP-05 och TYP-07. Ett lokalt avvisat formulär
skickar ingen begäran att kopiera. Lägg därför först det giltiga
objektförslaget i utkastet enligt fallet. Kopiera därefter endast JSON-kroppen
från den lyckade `POST /api/households/<id>/map/draft` i nätverkspanelen.
Anteckna hushållets ID och fältets ID under `value.customValues` i kroppen.
Fältets visningsnamn är inte dess ID.

Låt båda användarna avstå från andra ändringar under kontrollen. Kör koden
nedan i den inloggade profilens Console. Klistra in den giltiga JSON-kroppen,
hushållets ID, fältets ID och fallets ogiltiga värde i frågorna. Koden läser
aktuella versioner och ändrar bara det angivna fältet. Den kopierade
begärans gamla `version` är redan förbrukad och får inte återanvändas.

```js
await (async () => {
  const body = JSON.parse(prompt('Giltig JSON-kropp från map/draft'));
  const householdId = prompt('Hushållets ID');
  const fieldId = prompt('Fältets ID i value.customValues');
  const invalidValue = prompt('Ogiltigt värde: 2026-02-30 eller fel');
  if (!Object.hasOwn(body.value?.customValues ?? {}, fieldId)) {
    throw new Error('Fältet saknas i den kopierade begäran');
  }
  const path = `/api/households/${encodeURIComponent(householdId)}/map`;
  const read = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Läsning misslyckades: ${response.status}`);
    return response.json();
  };
  const before = await read(path);
  const historyBefore = await read(`${path}/history`);
  const identity = await read('/api/version');
  body.version = before.draft.version;
  body.contentVersion = before.contentVersion;
  body.value.customValues[fieldId] = invalidValue;
  const response = await fetch(`${path}/draft`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Skyttel-Build': `${identity.commit}:${identity.version}`,
    },
    body: JSON.stringify(body),
  });
  console.log({
    status: response.status,
    error: (await response.json()).error,
    unchangedMap: JSON.stringify(before) === JSON.stringify(await read(path)),
    unchangedHistory:
      JSON.stringify(historyBefore) === JSON.stringify(await read(`${path}/history`)),
  });
})();
```

Resultatet ska vara `status: 400`, `error: "invalid_request"`,
`unchangedMap: true` och `unchangedHistory: true`. HTTP 409 betyder att en
versionskontroll stoppar begäran; det är inte ett godkänt valideringsprov.
Hämta då ett nytt giltigt underlag och gör om kontrollen utan samtidiga
ändringar. Koden sparar inte hela utkastet och ska inte ändra något.

## Definitioner och fält

### TYP-01: Definition och objekt sparas tillsammans med beständigt kvitto

**Syfte:** Kontrollera samma utkast, sparande och historik för typ och objekt.

**Användare:** Alex.

**Förutsättningar:** Typen Solcellsanläggning saknas.

**Integrationstest:**
[object-types.spec.ts](../../tests/integration/object-types.spec.ts),
testfallet “TYP-01: custom definitions and four optional fields share one
durable save and history”.

**Steg:**

1. Skapa Solcellsanläggning med beskrivningen Hushållets elproduktion.
   Lägg till Leverantör som text, Effekt som tal, Installationsdatum som
   datum och Batteri som ja/nej. Lägg definitionen i utkastet.
2. Skapa Paneler på taket av den nya typen. Ange Exempelsol, `12.5` och
   `2026-09-01`. Lämna Batteri obesvarat. Lägg objektet i utkastet.
3. Starta om testinstallationen och ladda om sidan. Kontrollera förslagen.
   Läs kartans HTTP-svar: typen och objektet finns bara i det egna utkastet.
4. Spara hela utkastet och läs kvittot från sparbegärans svar. Kontrollera
   definition, fält, objekt, sparande användare och tidpunkt.
5. Starta om igen och läs kartan samt historiken genom publika HTTP-anrop.
   Återförsök samma sparbegäran med samma operations-ID och utkastversion.

**Förväntat resultat:**

- Definitionen och objektet återkommer i utkastet efter omstart och blir
  gemensamma först vid samma sparande.
- Batteri är obesvarat även i den sparade kartan. Historiken innehåller
  samma kvitto och definition som sparandet. Återförsöket ger samma kvitto.

### TYP-02: Fyra frivilliga fält kan lämnas öppna, fyllas i och rättas

**Syfte:** Skilja obesvarat från nej genom formulär, utkast och omladdning.

**Användare:** Alex.

**Förutsättningar:** Solcellsanläggning och Paneler på taket saknas.

**Integrationstest:**
[object-types.spec.ts](../../tests/integration/object-types.spec.ts),
testfallet “TYP-02: forms create, review and correct optional custom fields
without confusing unanswered and no”.

**Steg:**

1. Skapa samma typ och fyra fält som i TYP-01. Skapa Paneler på taket men
   lämna alla fälten obesvarade. Lägg båda förslagen i utkastet.
2. Ladda om och öppna objektet. Kontrollera tomma text-, tal- och datumfält
   samt **Obesvarat** för Batteri. Stäng formuläret och spara hela utkastet.
3. Ladda om. Ange Exempelsol, `12.5`, `2026-09-01` och **Nej**.
   Lägg i utkastet och kontrollera **Batteri: Nej**. Spara och ladda om.
4. Rätta till Ny leverantör, `-14.25`, `2026-09-02` och **Ja**. Granska, spara
   och ladda om igen. Öppna objektets detaljer.

**Förväntat resultat:**

- Alla fält kan sparas obesvarade. Obesvarat är skilt från nej.
- Värden och rättelser finns kvar genom sparande och omladdning.
- Definition och objekt granskas tillsammans före första sparandet.

### TYP-03: Medlemmar delar typer och kan rätta använda definitioner

**Syfte:** Kontrollera delning, privata förslag och redigerbara förifyllda typer.

**Användare:** Alex och Lo.

**Förutsättningar:** Lo är vanlig medlem. Inga privata förslag finns.

**Integrationstest:**
[object-types.spec.ts](../../tests/integration/object-types.spec.ts),
testfallet “TYP-03: members share editable definitions while private proposals
and used field kinds stay protected”.

**Steg:**

1. Lo skapar Solcellsanläggning med textfältet Anteckning och lägger typen
   i sitt utkast. Alex laddar om och kontrollerar att typen inte visas.
   Lo sparar definitionen. Alex laddar om och väljer typen för Paneler.
2. Alex anger Privat värde i Anteckning och lägger objektet i utkastet.
   Lo försöker ändra Anteckning till tal och lägger typförslaget i utkastet.
3. Kontrollera det begripliga felet. Lo behåller text som värdeslag,
   ändrar typens namn till Solkraft, fältnamnet till Kommentar och båda
   beskrivningarna. Lo lägger också till ett nytt talfält som heter
   Anteckning och sparar definitionen.
4. Alex försöker spara sitt äldre utkast. Hämta aktuellt underlag och
   välj **Behåll mitt förslag** för objektet. Granska Kommentar och
   Privat värde innan ett nytt sparande.
5. Lo skapar Medlemmens paneler av typen Solkraft och fyller i Kommentar.
   Spara objektet. Skapa dessutom Lo av typen Person och spara.
6. Lo ändrar namn och beskrivning på den använda typen Person till
   Människa och En person i kartan. Spara, ladda om och öppna Nytt objekt.

**Förväntat resultat:**

- En privat typ avslöjas inte eller används av en annan medlem.
- En använd fälttyp ändras inte. Ett nytt fält med liknande namn får eget
  värde; Kommentar behåller Privat värde utan automatisk koppling.
- Vanliga medlemmar kan använda gemensamma fält och rätta förifyllda typer.
  Formulären visar de aktuella namnen efter sparande och omladdning.

### TYP-04: Samtidiga definitionsändringar kräver ett nytt konfliktval

**Syfte:** Stoppa hela utkastet, bevara oberoende ändringar och visa tidigare
definition i historiken.

**Användare:** Alex och Lo.

**Förutsättningar:** Båda ser den förifyllda typen Person.

**Integrationstest:**
[object-types.spec.ts](../../tests/integration/object-types.spec.ts),
testfallet “TYP-04: concurrent definition changes reject the whole draft
until an explicit current choice”.

**Steg:**

1. Alex ändrar Person till Människor med beskrivningen Mitt förslag och
   lägger definitionen i utkastet. Skapa Alex av typen Människor i samma utkast.
2. Lo ändrar Person till Personer med beskrivningen Annans rättelse och
   lägger till textfältet Smeknamn. Lo sparar hela sitt utkast.
3. Alex försöker spara, hämtar aktuellt underlag och granskar konflikten.
   Kontrollera att inga objekt sparas och att det egna utkastet finns kvar.
4. Välj **Behåll min typdefinition**. Kontrollera att inget sparas förrän
   Alex uttryckligen väljer **Spara hela utkastet** igen.
5. Starta om och läs historiken via den publika HTTP-adressen.

**Förväntat resultat:**

- Den aktuella definitionen och förslaget visas tillsammans vid konflikten.
- Senaste sparandet omfattar definitionen Människor och objektet Alex.
  Beskrivningen är Mitt förslag. Los oberoende tillägg Smeknamn finns kvar
  i definitionen och i objektets formulär.
- Historiken bevarar Personer med Annans rättelse och Smeknamn som tidigare
  definition. Objektets sparade typdefinition innehåller också Smeknamn.

### TYP-05: Felaktiga värden och ny användning stoppar hela sparandet

**Syfte:** Kontrollera värdevalidering och ny användning mellan förslag och spara.

**Användare:** Alex och Lo.

**Förutsättningar:** Solkraft är sparad med Effekt som tal och Datum som
datum. Inga objekt använder fälten.

**Integrationstest:**
[object-types.spec.ts](../../tests/integration/object-types.spec.ts),
testfallet “TYP-05: invalid values and newly used field kinds preserve the
entire draft and map”.

**Steg:**

1. Alex föreslår att det oanvända Effekt blir text. Lägg också ett
   oberoende nytt Person-objekt i samma utkast.
2. Skapa ett förslag av typen Solkraft med det giltiga datumet
   `2026-02-28` och lägg förslaget i utkastet. Följ kontrollsteget
   [för felaktigt fältvärde](#skicka-ett-felaktigt-fältvärde-med-aktuell-utkastversion)
   för Datum med värdet `2026-02-30`. Kontrollera HTTP 400 och att kartan,
   hela utkastet och historiken är oförändrade jämfört med före återförsöket.
3. Lo lägger ett nytt objekt med Effekt `12` i sitt privata utkast utan
   att spara. Alex försöker nu spara hela sitt utkast.
4. Kontrollera felet, kartan, det egna utkastet och historikens HTTP-svar.

**Förväntat resultat:**

- Felaktigt datum ändrar inget i kartan eller utkastet.
- Ny privat användning hindrar byte av värdeslag även vid sparandet.
  Felet säger att ett nytt fält behövs utan att avslöja Los privata innehåll.
- Ingen del sparas, inte heller Person-objektet. Tidigare fältdefinition,
  hela utkastet och historiken är oförändrade.

## Byte av objekttyp

### TYP-06: Typbyte bevarar objekt, samband och tidigare fältbetydelse

**Syfte:** Granska gamla värden, rätta nya fält och ångra ett typbyte.

**Användare:** Alex.

**Förutsättningar:** Skapa Cykel med Nummer som text och Försäkrad som
ja/nej. Skapa Motorfordon med samma fältnamn men Nummer som tal. Spara
Alex blå cykel av typen Cykel med Nummer `SYNTH-42` och Försäkrad **Nej**.
Spara Garaget och ett samband från cykeln till garaget. Anteckna objektets
och sambandets ID från kartans publika HTTP-svar.

**Integrationstest:**
[type-change.spec.ts](../../tests/integration/type-change.spec.ts),
testfallet “TYP-06: type changes review displaced values and preserve
identity, edges and history through restart and undo”.

**Steg:**

1. Öppna Alex blå cykel och välj Motorfordon som **Objekttyp**. Kontrollera
   **Tidigare fältvärden**: Cykel, Nummer `SYNTH-42` och Försäkrad **Nej**.
   Kontrollera att nya Nummer är tomt och Försäkrad är **Obesvarat**.
   **Lägg i mitt utkast** ska vara inaktiverat innan värdena hanteras.
2. Ange `42` i det nya Nummer. Lämna Försäkrad obesvarat. Markera
   **Jag har hanterat tidigare fältvärden för typbytet** och lägg i utkastet.
   Granska båda typerna, gamla och nya Nummer samt obesvarat Försäkrad.
3. Starta om installationen och ladda om. Kontrollera samma privata
   förslag. Spara hela utkastet och kontrollera cykelns och sambandets ID.
4. Byt typdefinitionens namn från Cykel till Trampcykel och dess fältnamn
   till Tidigare Nummer och Tidigare Försäkrad. Spara. Starta om och öppna
   **Visa historik**. Hitta typbytet från Cykel till Motorfordon.
5. Kontrollera tidigare typnamn, Nummer `SYNTH-42`, sparande användare
   och tidpunkt. Välj **Ångra sparandet** för typbytet och granska förslaget.
   Spara hela utkastet, starta om och läs kartan igen.

**Förväntat resultat:**

- Inga gamla värden kopieras eller konverteras till den nya typens fält.
  Historiken behåller de ursprungliga namnen trots dagens namnbyte.
- Typbyte och ångring behåller objektets och sambandets identiteter.
  Typbytet sparar talet `42` och obesvarat Försäkrad; ångring återför
  texten `SYNTH-42` och uttryckligt **Nej**.
- Sparat utkast och historik finns kvar efter normal omstart.

### TYP-07: Fel och samtidiga ändringar stoppar hela typbytet

**Syfte:** Kontrollera atomiskt sparande, nytt sparbesked och eget utkast.

**Användare:** Alex och Lo.

**Förutsättningar:** Samma sparade typer, objekt och samband som i TYP-06.
Lo har aktuell tillgång till hushållet.

**Integrationstest:**
[type-change.spec.ts](../../tests/integration/type-change.spec.ts),
testfallet “TYP-07: invalid values and concurrent definitions block whole
saves until fresh choices while undo protects private fields”.

**Steg:**

1. Alex lägger namnbytet Garaget till Eget namn i sitt utkast. Föreslå
   typbytet till Motorfordon: ange Nummer `42`, välj Försäkrad **Nej**,
   hantera gamla värden och lägg typbytet i utkastet. Följ kontrollsteget
   [för felaktigt fältvärde](#skicka-ett-felaktigt-fältvärde-med-aktuell-utkastversion)
   för Nummer med texten `fel`. Kontrollera HTTP 400 och oförändrad karta,
   helt utkast och historik jämfört med före återförsöket.
2. Behåll det giltiga typbytet med Nummer `42` och Försäkrad **Nej** i
   utkastet. Lo ändrar och sparar Motorfordons beskrivning.
3. Alex försöker spara hela utkastet. Kontrollera att varken Garagets namn
   eller cykelns typ ändras. Hämta aktuellt underlag och behåll förslaget
   efter granskning av den nya definitionen. Återsänd tidigare sparbegäran
   med samma gamla utkastversion men nytt operations-ID: HTTP 409.
4. Ge ett nytt sparbesked och kontrollera båda sparade ändringarna. Lägg
   sedan Nummer `43` i eget utkast. Försök ångra typbytet: överlappet ska
   stoppas utan att det egna fältförslaget ändras.
5. Kasta eget utkast och lägg i stället beskrivningen Oberoende uppgift på
   cykeln i utkastet. Ångra typbytet. Starta om och granska det kvarvarande
   förslaget; spara sedan hela utkastet.

**Förväntat resultat:**

- Felaktiga värden och inaktuella definitioner sparar ingen del av gruppen.
  Konfliktvalet kräver ett nytt sparbesked för det aktuella utkastet.
- Eget överlappande fältförslag blockerar ångringen. Den oberoende
  beskrivningen bevaras tillsammans med återförd Cykel och dess gamla värden.
