# Manuella testfall för permanent radering

Testfallen omfattar administratörens granskning, uttrycklig bekräftelse,
osäkert resultat, ändrat underlag och väntande städning efter omstart.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Använd den lokala devcontainern och värddatorns webbläsare enligt
[utvecklingsguiden](../development/devcontainer.md#run-the-application).
Inloggningen ska fungera med den konfigurerade första administratörens
Google- eller Microsoft-konto innan du börjar.

- **Alex** är namnet på testrollen för detta konto, inte ett krav på
  kontots visningsnamn. Alex är administratör i Linden och använder profil A.
- Profil B använder samma administratör för samtidig ändring av utkastet.
  Logga in med samma konto i båda profilerna; ingen inbjudan behövs.

Använd bara påhittade uppgifter och testbilder. Permanent radering kan
inte ångras i Skyttel. Kör inte testfallen mot ett verkligt hushåll.

## Allmän förberedelse

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan. Detaljpanelen visar uppgifterna. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. I hel kartvy heter knappen **Redigera val**. Att bara välja
objektet eller sambandet öppnar inte formuläret.

1. Starta en ny provdatabas enligt nästa avsnitt inför varje fall. Öppna
   <http://localhost:5173>, logga in som Alex och skriv **Linden** i
   **Hushållets namn**. Välj **Skapa hushåll**.
2. Välj **Nytt objekt**, fyll i **Lampan att radera** i **Objektets namn**,
   välj **Fordon** som **Objekttyp** och välj **Lägg i mitt utkast**.
   Lägg till **Stolen att bevara** på samma sätt. Typen används bara för
   detta tekniska prov. Välj **Spara hela utkastet** och invänta kvittot.
3. Öppna lampans detaljer och välj en liten påhittad PNG-bild genom
   **Välj profilbild**. Stäng detaljerna utan att ändra texten och välj
   **Spara hela utkastet**. Öppna lampan igen. Högerklicka på bilden,
   välj att kopiera bildens adress och spara adressen för senare kontroll.
4. Välj lampan i listan, välj **Öppna rymdkartan** och öppna **Ordna min vy**.
   Välj **Flytta höger i rummet** en gång. Välj stolen och flytta den åt vänster
   med **Flytta vänster i rummet**. Ladda om och kontrollera placeringarna.
5. Öppna stolen i **Lista och detaljer**, skriv **Oberoende privat förslag**
   i **Beskrivning** och välj **Lägg i mitt utkast**. Kontrollera förslaget
   under **Hela mitt utkast**. Spara inte hela utkastet.
6. Behåll samma databas vid omstart inom ett fall. RADERING-02 använder
   Chromium med utvecklarverktyg; RADERING-04 behöver en andra terminal.
   Förbered en privat mapp för hämtade exporter och radera filerna efteråt.

### Ny lokal provdatabas och omstart

Stoppa eventuell befintlig `npm run dev:all` med Ctrl+C. Kör följande från
projektets rot i en terminal i devcontainern inför varje nytt fall.
Kommandot skapar en separat tom databas och använder befintlig
inloggningskonfiguration. Kör bara ett av fallen åt gången.

```sh
erasure_case_dir=$(mktemp -d /tmp/skyttel-radering.XXXXXX)
printf 'SKYTTEL_DATABASE_PATH=%s/skyttel.sqlite\n' "$erasure_case_dir" \
  > /tmp/skyttel-radering.env
env -u SKYTTEL_DATABASE_PATH node --env-file=/tmp/skyttel-radering.env \
  scripts/develop.mjs
```

Vid **omstart inom samma fall**: tryck Ctrl+C i serverns terminal, vänta
tills kommandot avslutas och kör bara följande. Låt en eventuell separat
SQLite-läsare fortsätta i sin egen terminal.

```sh
env -u SKYTTEL_DATABASE_PATH node --env-file=/tmp/skyttel-radering.env \
  scripts/develop.mjs
```

Ladda sedan om webbläsarsidan. Kör inte databasförberedelsen på nytt vid
omstart; den skulle välja en annan, tom databas. Efter sista fallet kan du
stoppa provservern och starta den vanliga miljön med `npm run dev:all`.

## Granska och genomför

### RADERING-01: Radera valt innehåll med tangentbordet

**Syfte:** Kontrollera att omfattningen granskas före radering och att
oberoende innehåll och privat arbete finns kvar efter omstart.

**Användare:** Alex som administratör.

**Förutsättningar:** Lampan har bild och historik. Stolen har ett privat
förslag enligt förberedelsen.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
testfallet “RADERING-01: keyboard review erases selected content and
preserves unrelated work after restart”.

**Steg:**

1. Öppna **Administrera tillgång** och gå till **Permanent radering**.
   Läs skillnaden mot vanlig borttagning och upphört innehåll samt
   begränsningarna för nedladdade exporter och leverantörens interna kopior.
2. Använd Tab till lampans kryssruta och välj den med mellanslag.
   Välj **Granska raderingen** med tangentbordet.
3. Kontrollera **Omfattning att bekräfta**. Lampan, dess bildversion och
   en personlig placering ingår; stolen ska inte ingå. Bildens identifierare
   visas. Antalen för andras privata innehåll ska vara noll i denna provkarta.
4. Kontrollera att **Radera permanent** är inaktiverad. Skriv
   **RADERA PERMANENT** i bekräftelsefältet och aktivera knappen med Enter.
5. Invänta **Den permanenta raderingen är slutförd.** Starta om enligt
   avsnittet ovan, ladda om sidan och kontrollera samma raderingsstatus.
6. Välj **Till hushållet** och **Lista och detaljer**. Sök efter lampan;
   ingen träff ska visas. Öppna stolen och kontrollera dess beskrivning
   samt förslaget under **Hela mitt utkast**. Välj **Visa historik** under
   **Ändringshistorik**: stolen ska finnas i det ursprungliga sparandet,
   men lampan ska saknas.
   Kontrollera också att stolens placering finns kvar i **Rymdkarta**.
7. Öppna lampans sparade bildadress i en ny flik i samma profil. Ladda om
   adressen så att en ny begäran görs; kontrollera HTTP-status 404 i
   utvecklarverktygens **Network**, utan någon bild.
8. Öppna **Administrera tillgång**, välj **Förbered fullständig export**
   och sedan **Hämta ZIP-fil**. Öppna ZIP-filen och `content.json`. Sök efter
   **Lampan att radera**; namnet ska saknas i hela filen. Stolen och
   **Oberoende privat förslag** ska finnas. `images` ska vara en tom lista
   och `images.bin` ska vara tom. Se även
   [EXPORT-01](household-export.md#export-01-hämta-en-fullständig-export-med-tangentbordet).

**Förväntat resultat:**

- Enbart granskning raderar inget. Bekräftelse kräver den angivna texten.
- Lampan, dess tidigare värden och dess bild är inte åtkomliga genom
  kartan, historiken, bildadressen eller den nya exporten, även efter omstart.
- Stolen, dess bevarade historik, privata förslag och placering finns kvar.
- Ett besked om slutförd radering visas först när servern bekräftar hela
  rutinen. En tidigare nedladdad export ändras inte av raderingen.

## Osäkert och förändrat underlag

### RADERING-02: Återfinn resultatet efter förlorat svar

**Syfte:** Kontrollera att ett anslutningsavbrott inte presenteras som
slutförd radering och att serverns beständiga resultat kan återfinnas.

**Användare:** Alex som administratör.

**Förutsättningar:** En ny provkarta är förberedd i Chromium. Koden nedan
låter servern slutföra en enda radering men kastar bort svaret innan
applikationen får det. Begäran skickas oförändrad. Integrationstestet
bryter motsvarande svar vid nätverket.

Öppna utvecklarverktygen med F12. Under **Sources → Snippets** skapar du
ett nytt utdrag, lägger in koden nedan och kör det med Ctrl+Enter medan
administrationssidan är öppen. **Console** ska visa
**RADERING-02: redo för ett svar.** Kör utdraget bara en gång per försök.

```js
(() => {
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = new URL(response.url);
    if (url.origin === location.origin &&
        url.pathname.endsWith('/erasure/execute')) {
      window.fetch = originalFetch;
      const result = await response.clone().json();
      if (response.ok && result.status?.phase === 'completed') {
        console.info('RADERING-02: slutfört svar kastas bort.');
        throw new TypeError('RADERING-02: kontrollerat förlorat svar');
      }
      console.error('RADERING-02: inget slutfört svar; avbrottet sker inte.');
    }
    return response;
  };
  console.info('RADERING-02: redo för ett svar.');
})();
```

Öppna **Network**, aktivera **Preserve log**, töm listan och filtrera på
`erasure/execute`. Skyttel ska skicka ett enda sådant anrop under hela
fallet. Svaret kan visas som HTTP 200 här trots att utdraget gör det
otillgängligt för applikationen.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
testfallet “RADERING-02: a lost completion reply is recovered from durable
status without another erasure”.

**Steg:**

1. Välj lampan och **Granska raderingen**. Skriv **RADERA PERMANENT**
   och välj **Radera permanent** efter att utdraget är förberett.
2. Kontrollera **Utfallet är oklart** och konsolens besked om att ett
   slutfört svar kastas bort. Avbrottet avaktiveras automatiskt. Ladda
   inte om sidan ännu. Om konsolen i stället säger att avbrottet inte
   sker, anteckna utfallet och följ eventuell väntande återhämtning;
   detta försök verifierar då inte ett förlorat slutfört svar.
3. Välj **Kontrollera raderingsstatus och läs in aktuellt innehåll**.
   Kontrollera att den genomförda raderingen återfinns.
4. Kontrollera att **Network** fortfarande visar exakt ett
   `erasure/execute`-anrop. Ladda om sidan och kontrollera samma slutförda
   resultat. Välj **Till hushållet**: stolen ska finnas och lampan saknas.
   Omladdning tar även bort utdragets påverkan om fallet avbryts i förtid.

**Förväntat resultat:**

- Ett förlorat svar ger **Utfallet är oklart** och inget påstående om
  slutförd radering. Nytt innehåll kan inte väljas medan utfallet är oklart.
- Statuskontrollen återfinner den genomförda raderingen utan att skicka
  en andra radering. Resultatet finns kvar efter omladdning.
- Lampan är borta och stolen finns kvar. Avbrottet återställer inget.

### RADERING-03: Granska på nytt efter en samtidig ändring

**Syfte:** Kontrollera att en tidigare bekräftelse inte används när
innehållet ändras efter granskningen.

**Användare:** Alex i profil A och B.

**Förutsättningar:** Samma nya provkarta är öppen i båda profilerna.
Profil A visar **Administrera tillgång**. Profil B visar hushållets
**Lista och detaljer** och är inloggad med samma konto som profil A.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
testfallet “RADERING-03: a changed scope requires a new review and
confirmation before erasure”.

**Steg:**

1. Välj lampan och granska raderingen i profil A utan att bekräfta ännu.
2. Öppna stolen i profil B, ändra **Beskrivning** till
   **Senare privat förslag** och välj **Lägg i mitt utkast**.
   Invänta att **Hela mitt utkast** visar den nya texten. Spara inte.
3. Skriv **RADERA PERMANENT** och välj **Radera permanent** i profil A.
4. Kontrollera beskedet **Innehållet har ändrats. Granska raderingen igen**.
   Kontrollera i profil B att båda objekten finns kvar. I profil A väljer
   du **Granska raderingen** igen utan att först ladda om sidan.
5. Kontrollera att bekräftelsefältet är tomt och knappen inaktiverad.
   Granska, skriv bekräftelsen igen och genomför raderingen.
6. Invänta slutfört resultat och välj **Till hushållet** i profil A.
   Kontrollera att lampan saknas och att **Hela mitt utkast** visar stolen
   med **Senare privat förslag**.

**Förväntat resultat:**

- Den gamla granskningen avvisas utan radering och kräver en ny granskning.
- Bekräftelsetexten återanvänds inte för den nya omfattningen.
- Den nya bekräftelsen kan slutföra raderingen och bevarar stolens
  oberoende privata förslag.

## Återhämtning av väntande städning

### RADERING-04: Slutför väntande städning efter omstart

**Syfte:** Kontrollera att en upptagen databas inte ger falskt besked om
slutförd radering och att ärendet kan fortsättas efter omstart.

**Användare:** Alex som administratör samt testinstallationens operatör.

**Förutsättningar:** En ny provkarta är förberedd med den lokala
provdatabasen ovan. Kör följande från projektets rot i en **andra**
terminal i devcontainern. Kommandot läser samma databas och håller en
separat lästransaktion öppen så att äldre journalsidor inte kan städas.
Vänta på beskedet **Läsningen är öppen** och lämna terminalen orörd tills
steg 5. Integrationstestet håller en motsvarande riktig SQLite-läsare.

```sh
env -u SKYTTEL_DATABASE_PATH node --env-file=/tmp/skyttel-radering.env \
  --input-type=module -e '
import Database from "better-sqlite3";
const database = new Database(process.env.SKYTTEL_DATABASE_PATH, {
  readonly: true,
  fileMustExist: true,
});
database.exec("BEGIN");
database.prepare("SELECT id FROM map_object LIMIT 1").get();
function release() {
  database.exec("ROLLBACK");
  database.close();
  console.log("Läsningen är avslutad.");
  process.exit(0);
}
process.stdin.resume();
process.stdin.once("data", release);
process.once("SIGINT", release);
console.log("Läsningen är öppen. Tryck Enter när steg 5 säger till.");
'
```

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
testfallet “RADERING-04: pending cleanup survives application restart and
completes only after the reader releases”.

**Steg:**

1. Välj lampan, granska och bekräfta permanent radering medan operatörens
   läsning är öppen.
2. Kontrollera beskedet **Raderingen är inte slutförd**. Öppna
   **Till hushållet** i en ny flik och försök läsa kartan. På den kvarvarande
   administrationssidan väljer du **Förbered fullständig export**.
   Båda försöken ska avvisas; ingen karta eller export ska lämnas ut.
3. Starta om enligt **Ny lokal provdatabas och omstart** ovan i serverns
   terminal. Låt läsarens andra terminal vara kvar. Ladda om
   administrationssidan när servern åter är redo.
4. Kontrollera att raderingen fortfarande inte påstås vara slutförd och
   att **Försök slutföra raderingen** erbjuds.
5. Tryck Enter i läsarens terminal. Invänta **Läsningen är avslutad**.
   Välj sedan **Försök slutföra raderingen** på administrationssidan.
6. Invänta **Den permanenta raderingen är slutförd.** Välj **Till hushållet**
   och kontrollera att lampan saknas, stolen finns och **Hela mitt utkast**
   visar **Oberoende privat förslag**. Öppna och ladda om lampans sparade
   bildadress; **Network** ska visa HTTP 404 utan bild.

Om fallet avbryts: avsluta läsaren med Enter eller Ctrl+C och använd samma
väntande ärendes **Försök slutföra raderingen** innan nästa fall påbörjas.

**Förväntat resultat:**

- Raderingen är inte slutförd medan äldre journalsidor är låsta.
  Berört hushållsinnehåll kan inte läsas eller exporteras under väntan.
- Väntande status och stängd tillgång finns kvar efter serveromstart.
- När läsningen släpps kan samma ärende slutföras. Lampan och dess bild
  återkommer inte; stolen och dess privata förslag finns kvar.

## Historiska bilder efter typbyte

### RADERING-05: Radera en tidigare typ och dess sista historiska bild

**Syfte:** Kontrollera att en tidigare bild försvinner även ur en ny export
när dess sista historiska hänvisning raderas, medan objektet med ny typ och
ny bild finns kvar efter omstart.

**Användare:** Alex som administratör i profil A.

**Förutsättningar:** Starta en ny lokal provdatabas enligt avsnittet ovan
och skapa Linden. Förbered två tydligt olika påhittade PNG-bilder, till
exempel en blå bild och en orange bild. Använd följande förberedelse i
stället för allmän förberedelse steg 2–5:

1. Välj **Ny objekttyp**, skriv **Tidigare bildtyp** i **Typens namn** och
   välj **Lägg typförslaget i mitt utkast**. Lägg inga egna fält till typen.
2. Skapa **Lampan att radera** av **Tidigare bildtyp** och **Stolen att
   bevara** av **Fordon**. Lägg båda i utkastet och välj
   **Spara hela utkastet**. Trots lampans testnamn ska själva objektet
   bevaras i detta fall.
3. Öppna lampan, välj den blå bilden med **Välj profilbild** och spara
   hela utkastet. Öppna lampan igen, kopiera bildens adress och anteckna
   dess bild-ID, den sista delen efter `/profile-images/` i adressen.
4. Byt lampans **Objekttyp** till **Fordon**. Bekräfta
   **Jag har hanterat tidigare fältvärden för typbytet** om fältet visas
   och välj **Lägg i mitt utkast**. Välj sedan den orange profilbilden.
   Spara typbytet och bildbytet tillsammans med **Spara hela utkastet**.
   Anteckna den nya bildens adress och ID. ID:na ska skilja sig åt.
5. Flytta lampan och stolen enligt allmän förberedelse steg 4. Lägg
   stolens **Oberoende privat förslag** i utkastet enligt steg 5 utan
   att spara hela utkastet. Öppna den blå bildens adress i en annan flik;
   bilden ska fortfarande gå att läsa från historiken före radering.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
testfallet “RADERING-05: erasing a former type removes its historical image
from a fresh export while preserving the current object after restart”.

**Steg:**

1. Öppna **Administrera tillgång → Permanent radering**. Välj bara
   **Tidigare bildtyp** under objekttyper och välj **Granska raderingen**.
2. Kontrollera att inga objekt eller personliga placeringar ska raderas.
   **Bildversioner: 1** ska visas. **Berörda bildversioner** ska innehålla
   den blå bildens ID, men inte den orange bildens ID.
3. Skriv **RADERA PERMANENT**, välj **Radera permanent** och invänta
   **Den permanenta raderingen är slutförd.** Starta om enligt kommandot
   för samma databas ovan. Ladda om och kontrollera slutförd status.
4. Välj **Till hushållet**. Lampan ska finnas med **Fordon** och orange
   bild. Stolen och dess privata förslag samt båda placeringarna ska
   finnas kvar. Välj **Visa historik**: stolen ska ha bevarad historik,
   men lampans blå bild och tidigare typ ska inte visas.
5. Öppna och ladda om de två sparade bildadresserna. I utvecklarverktygens
   **Network** ska den blå bildens adress ge HTTP 404 och den orange
   bildens adress HTTP 200 med bilden kvar.
6. Hämta en ny fullständig export genom **Förbered fullständig export**
   och **Hämta ZIP-fil**. Öppna ZIP-filen och sök i `content.json` efter
   den blå bildens ID; det ska saknas i hela filen. Listan `images` ska
   innehålla exakt en bild, med den orange bildens ID. Lampan, stolen och
   **Oberoende privat förslag** ska finnas kvar i innehållet.
7. Kopiera den exporterade `images.bin` till `kvarvarande-bild.webp`
   och öppna kopian i webbläsaren. Eftersom exporten innehåller en enda
   bild ska den visa den orange bilden. Radera hämtade provfiler efteråt.

**Förväntat resultat:**

- Granskningen räknar och visar den historiska bildversion som ska raderas
  trots att dess nuvarande objekt bevaras.
- Den tidigare typen och den blå bilden är borta ur historik, bildåtkomst
  och en ny fullständig export, även efter omstart.
- Det nuvarande objektet, dess orange bild, stolens oberoende historik
  och privata förslag samt båda placeringarna finns kvar.
