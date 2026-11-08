# Förbered hela utkastet för läsning

SAMTALSUTKAST-01 provar **läsning** av serverstödda förslag, inte att skapa
typen i ett visst formulär. Förberedelsen använder en ny tillfällig
installation med tom karta. Alternativt får utkastet bara ha **Lo Exempel**,
**Person**, med tom beskrivning och utan tidigare sparande. Inga andra
objekt-, sambands- eller typförslag får finnas.
Fältet Sista fyra kan vara dolt i formuläret när det saknar sektion;
förberedelsen ger därför dess värden genom det publika HTTP-gränssnittet.
Försök inte skriva i ett fält som gränssnittet inte visar.
Förberedelsen anger **Inloggningsadress** och **Betalar** som fria verb på
de enskilda sambanden, separat från deras typer.

**Före starten av den interaktiva installationen**, när ingen annan
bygg- eller testprocess äger det gemensamma låset, kör operatören följande
från repositoryts rot. Det skriver den körbara funktionen för exakt samma
fiktiva data som browserprovet använder:

<!-- markdownlint-disable MD013 -->
```sh
npm run test:env -- node --import tsx --input-type=module -e \
  "import {prepareConversationReview} from './tests/support/conversation-review-preparation.ts'; console.log(prepareConversationReview.toString())"
```
<!-- markdownlint-enable MD013 -->

Behåll hela den utskrivna funktionen i en separat textfil eller i
urklippet. Vänta tills kommandot avslutas och lämnar tillbaka låset.
Starta **därefter** den nya tillfälliga installationen enligt
[textguiden](text-assistant.md#controlled-text-fixture). Logga in som Alex,
skapa Utkastprov och lämna kartan tom eller med enbart Lo-förslaget ovan.
Starta inget samtal ännu. Kör inga andra npm-bygg- eller testkommandon
medan den interaktiva installationen äger låset.

Efter inloggningen och hushållets skapande: öppna provprofilens Console,
klistra in hela den behållna funktionen och kör den som en
funktionsdeklaration. Kör därefter följande i samma Console, efter att
`ID` ersatts med hushållets ID från sidans adress:

<!-- markdownlint-disable MD013 -->
```js
const path = '/api/households/ID/map';
const read = async () => (await fetch(path)).json();
const post = async (route, data) => {
  const state = await read();
  const response = await fetch(`${path}/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: state.draft.version,
      contentVersion: state.contentVersion,
      ...data,
    }),
  });
  if (!response.ok) throw Error(await response.text());
};
await prepareConversationReview({ read, post });
```
<!-- markdownlint-enable MD013 -->

Funktionen vägrar en redan sparad karta eller andra objektförslag än Lo.
Utgångsläget är sparade Lo, Kim, Kortet (Provkort, Sista fyra 1111),
musikkonto, två e-postadresser och den första inloggningsadressen. Utkastet
har åtta ändringar: Lo Rättad, borttagen Kim, nytt objekt med Provtyp,
Kortets 1111 → 2222, rättad inloggningsadress, nytt Betalar-samband från
Lo till Kortet, Provtyp och Förvaras med förvaras i/innehåller.
Ladda om sidan efter förberedelsen; skapa inte ett nytt utkast under provet.

Före granskningen och efter **Nytt samtal** läser användaren det enda
baslinjesparandet i **Rapporter → Ändringshistorik → Visa ändringarna**.
Kortets sparade Sista fyra ska fortfarande vara 1111. Hela private/saved
HTTP-jämförelsen och symbolordningen är separat automatiserat underlag.
Kör följande först **efter** `quit` och `closed`, när den interaktiva
installationen lämnat tillbaka låset:

<!-- markdownlint-disable MD013 -->
```sh
npm run build
npm run test:integration -- tests/integration/conversation-draft.spec.ts \
  --grep 'SAMTALSUTKAST-01|conversation review preparation'
```
<!-- markdownlint-enable MD013 -->

Den vanliga körningen börjar med Lo-förslaget. Separata tekniska
förberedelsekontroller börjar tomt respektive med Lo-förslaget och utför
samma utskrivna Console-funktion genom verkliga publika HTTP-gränser och
SQLite. Ingen av dem påstår fysisk eller mänsklig körning.
Efter sista läsningen: `quit`, invänta `closed`, stäng provprofilen och
ta bort portvidarebefordran. Ny installation krävs inför nästa fall.
