# Manuella testfall för permanent radering

Testfallen omfattar administratörens granskning, uttrycklig bekräftelse,
avbruten granskning i Inställningar, osäkert resultat, ändrat underlag
och väntande städning efter omstart.
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
kartan eller listan och öppna dess detaljpanel. För objekt i listan använder
du **Uppgifter**; i kartverktygen väljer du **Visa detaljer**. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. Att bara välja objektet eller sambandet öppnar inte formuläret.

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
4. Välj lampan i listan, välj **Stäng arbetsytan** och öppna **Navigera**.
   Välj **Flytta [objektets namn]: höger** en gång. Välj stolen och flytta den
   åt vänster
   med **Flytta [objektets namn]: vänster**. Ladda om och kontrollera placeringarna.
5. Öppna stolen från **Lista**, välj **Redigera valt objekt** och skriv
   **Oberoende privat förslag** i **Beskrivning**. Välj **Lägg i mitt utkast**.
   Kontrollera förslaget
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

1. Öppna **Inställningar → Permanent radering**.
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
6. Välj **Läs in kartan på nytt** och **Lista**. Sök efter lampan;
   ingen träff ska visas. Öppna stolen och kontrollera dess beskrivning
   samt förslaget under **Hela mitt utkast**. Välj **Visa historik** under
   **Ändringshistorik**: stolen ska finnas i det ursprungliga sparandet,
   men lampan ska saknas.
   Kontrollera också att stolens placering finns kvar i **Rymdkarta**.
7. Öppna lampans sparade bildadress i en ny flik i samma profil. Ladda om
   adressen så att en ny begäran görs; kontrollera HTTP-status 404 i
   utvecklarverktygens **Network**, utan någon bild.
8. Öppna **Inställningar → Fullständig export**, välj
   **Förbered fullständig export** och sedan **Hämta ZIP-fil**.
   Öppna ZIP-filen och `content.json`. Sök efter
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

### RADERING-06: Avbryt granskningen och återgå till bevarat arbete

**Syfte:** Granska på en egen inställningssida, avbryt utan radering och
kräv ny uttrycklig bekräftelse innan ett verifierat resultat öppnar aktuell karta.

**Användare:** Alex i profil A.

**Förutsättningar:** Följ allmän förberedelse med lampans sparade bild och
stolens oberoende privata förslag. Spara inte hela utkastet.
Upprepa i ljust och mörkt tema på dator samt vid 390 och 320 pixlars bredd.
Prova även korta fönster på 640 × 500 och 320 × 250 pixlar.
Verklig webbläsarzoom vid 200 och 400 procent kontrolleras separat;
en liten fönsterstorlek är inte i sig ett prov av webbläsarzoom.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
testfallet “RADERING-06: dedicated Settings review can be cancelled before
explicit erasure and a fresh map at {width}x{height}px {theme}”, med storlekarna
1280 × 900, 390 × 900, 320 × 900, 640 × 500 och 320 × 250 samt temana
light och dark.

**Steg:**

1. Öppna **Nytt objekt**. Skriv **Oskickat arbete före radering** i
   **Objektets namn** utan att lägga texten i utkastet.
2. Öppna **Inställningar** och välj **Permanent radering** i
   sidnavigationen med tangentbordet. Sidans huvudrubrik får fokus;
   kartan och det oskickade formuläret är dolda.
   På smala fönster öppnar du **Välj inställning** med Enter.
   Kontrollera att den valda sidans länk är läsbar innan menyn stängs igen.
3. Välj **Lampan att radera** och **Granska raderingen**. Kontrollera
   lampans namn, bildversionens hela ID och antalet personliga placeringar.
   Stolen och dess privata förslag ska inte ingå i granskningens omfattning.
4. Kontrollera att **Radera permanent** är inaktiverad. Skriv först
   **RADERA permanent**: knappen ska fortfarande vara inaktiverad. Skriv
   **RADERA PERMANENT**, men välj sedan **Avbryt** med tangentbordet.
   Granskningen stängs, valrubriken får fokus och lampans val finns kvar.
   Ingen radering genomförs.
5. Välj **Tillbaka till kartan**. Den oskickade texten och fokus i
   **Objektets namn** finns kvar. De sparade objekten, deras placeringar
   och stolens privata förslag är oförändrade.
6. Öppna samma inställningssida igen. Välj lampan och granska på nytt.
   Bekräftelsefältet är tomt och **Radera permanent** är inaktiverad.
   Skriv **RADERA PERMANENT** och välj **Radera permanent** med Enter.
7. Invänta **Den permanenta raderingen är slutförd.** Kontrollera hela
   raderingsidentifieraren och resultatets ett objekt, en bildversion samt
   noll samband och typer. Välj den fokuserade
   **Läs in kartan på nytt**. Kontrollera i listan att lampan är borta,
   stolen finns kvar och **Hela mitt utkast** behåller dess privata förslag.

**Förväntat resultat:**

- Avbruten granskning raderar inget och bevarar oberoende arbete.
- Tidigare bekräftelsetext kan inte användas vid nästa granskning.
- En uttryckligt bekräftad radering följs av ett verifierat resultat och
  en ny inläsning av kartan. Gammal oskickad text kan inte fortsätta mot
  det raderade innehållet; administratörens tillgång finns kvar.
- Stegmarkering, val, granskning och resultat motsvarar samma verkliga åtgärd.
  Tangentbordsfokus syns och täcks inte; bekräftelse, avbrytande och återgång
  går att använda utan mus. Hela bild- och raderingsidentifierarna går att läsa
  utan vågrät rullning. Kontrollera läsbarhet för vald sidlänk samt fokuserade
  raderings- och återgångsknappar i båda teman. Automationen mäter fokus,
  pekmål, textradernas utrymme och minst 4,5:1 textkontrast för dessa kontroller.

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
raderingssidan är öppen. **Console** ska visa
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
   resultat. Välj **Läs in kartan på nytt**: stolen ska finnas och lampan saknas.
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
Profil A visar **Inställningar → Permanent radering**. Profil B visar hushållets
**Lista och utkast** och är inloggad med samma konto som profil A.

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
6. Invänta slutfört resultat och välj **Läs in kartan på nytt** i profil A.
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
   **Tillbaka till kartan** i en ny flik och försök läsa kartan. I
   inställningarnas sidmeny öppnar du **Fullständig export** i en ny
   flik och väljer **Förbered fullständig export**.
   Båda försöken ska avvisas; ingen karta eller export ska lämnas ut.
3. Starta om enligt **Ny lokal provdatabas och omstart** ovan i serverns
   terminal. Låt läsarens andra terminal vara kvar. Ladda om
   raderingssidan när servern åter är redo.
4. Kontrollera att raderingen fortfarande inte påstås vara slutförd och
   att **Försök slutföra raderingen** erbjuds.
5. Tryck Enter i läsarens terminal. Invänta **Läsningen är avslutad**.
   Välj sedan **Försök slutföra raderingen** på raderingssidan.
6. Invänta **Den permanenta raderingen är slutförd.** Välj **Läs in kartan på nytt**
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

### RADERING-08: En aktuell administratör fortsätter samma väntande ärende

**Syfte:** Kontrollera aktuell behörighet, ärendets identitet och ett ärligt
resultat när en annan administratör slutför städningen efter omstart och
svaret försvinner.

**Användare:** Alex och Robin i skilda webbläsarprofiler samt
testinstallationens operatör.

**Förutsättningar:** En ny provkarta enligt allmän förberedelse. Bjud in
Robin och ge Robin administratörsrollen genom **Administrera tillgång**.
Robin lägger dessutom **Robins eget privata förslag** i stolens
**Beskrivning** genom **Lägg i mitt utkast**, utan att spara hela utkastet.
Alex behåller sitt eget oberoende privata förslag. Öppna den separata
SQLite-läsaren enligt RADERING-04 och behåll den till steg 6 nedan.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
testfallet “RADERING-08: a current administrator continues the same cleanup
after role loss, restart and a lost resume reply”.

**Steg:**

1. Alex granskar lampan och bekräftar uttryckligen permanent radering.
   Robins privata beskrivning ska inte visas. Invänta väntande städning
   och anteckna den fullständiga identifieraren under **Raderingsförsök**.
2. Robin öppnar **Administrera tillgång** och ändrar Alex till medlem.
   Alex laddar om raderingssidan. Kontrollera **Du kan inte administrera
   hushållet** och att ingen knapp för slutförande visas.
3. Robin öppnar **Inställningar → Permanent radering** i sin profil.
   Samma identifierare och väntande ärende ska visas utan automatisk
   radering eller slutförande. Alex privata beskrivning ska inte visas.
   Försök öppna kartan och förbereda en export i separata flikar;
   hushållsinnehållet ska fortfarande vara otillgängligt.
4. Operatören startar om med samma databas och den separata läsaren kvar.
   Robin laddar om raderingssidan. Kontrollera samma identifierare och
   välj **Försök slutföra raderingen** medan läsaren fortfarande är öppen.
5. Kontrollera att inget slutförandebesked visas. Kartan och en ny export
   ska fortfarande avvisas. I **Network** ger slutförandebegäran HTTP 202
   med samma identifierare och väntande städning.
6. Operatören avslutar läsaren med Enter. Robin förbereder utdraget från
   RADERING-02 i sin webbläsare, men ändrar den enda adressändelsen
   `/erasure/execute` till `/erasure/resume`. Detta kastar bara bort
   leveransen av ett verkligt slutfört svar; serverns begäran är oförändrad.
   Välj **Försök slutföra raderingen** igen.
7. Kontrollera **Utfallet är oklart**, utan slutförandebesked eller
   resultatantal. Välj **Översikt**, återvänd till **Permanent radering**
   och ladda om sidan. Välj **Kontrollera raderingsstatus och läs in
   aktuellt innehåll**. Samma identifierare ska nu visa slutfört resultat:
   ett objekt, en bildversion och noll samband, objekttyper och sambandstyper.
8. Kontrollera i **Network** att navigation och statusläsning inte skickar
   nya `erasure/execute` eller `erasure/resume`. Välj **Läs in kartan på nytt**.
   Lampan och dess bild ska saknas. Alex och Robin kontrollerar var för sig
   stolen och sitt eget privata förslag; båda ska finnas kvar. Alex
   personliga placering för stolen ska vara kvar.

**Förväntat resultat:**

- Bara en aktuell administratör får läsa och fortsätta ärendet. Automationen
  kontrollerar också HTTP 403 för Alex exakta statusläsning och slutförande.
- Ny webbläsarprofil och omstart hittar samma väntande ärende. Ett misslyckat
  städningsförsök öppnar inte tillgången och påstår inte att allt är klart.
- Det verkliga slutförandet kan återläsas efter förlorat svar utan en ny
  radering. Automationen jämför identifierare, antal och hela oberoende
  privata utkast samt kräver bara en ändring av innehållets generation.
- Andras privata beskrivningar lämnas inte ut på raderingssidan. Lampans
  bild ger HTTP 404; kvarvarande objekt, typer och personliga vyer bevaras.

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

1. Öppna **Inställningar → Permanent radering**. Välj bara
   **Tidigare bildtyp** under objekttyper och välj **Granska raderingen**.
2. Kontrollera att inga objekt eller personliga placeringar ska raderas.
   **Bildversioner: 1** ska visas. **Berörda bildversioner** ska innehålla
   den blå bildens ID, men inte den orange bildens ID.
3. Skriv **RADERA PERMANENT**, välj **Radera permanent** och invänta
   **Den permanenta raderingen är slutförd.** Starta om enligt kommandot
   för samma databas ovan. Ladda om och kontrollera slutförd status.
4. Välj **Läs in kartan på nytt**. Lampan ska finnas med **Fordon** och orange
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

## Följ ett känt försök

### RADERING-07: Följ ett känt försök när ett senare resultat finns

**Syfte:** Behåll rätt raderingsärende genom vanlig sidnavigation och
omladdning även om en annan administratör slutför en senare radering.

**Användare:** Alex och Robin, båda aktuella administratörer i skilda
webbläsarprofiler.

**Förutsättningar:** Förbered en ny provkarta enligt ovan med lampan,
stolen och Alex oberoende privata förslag. Bjud in Robin och ge Robin
administratörsrollen genom **Administrera tillgång**. Robin skapar och
sparar den tomma sambandstypen **Senare tom sambandstyp** genom
**Inställningar → Typer och egna fält**. Inget samband ska använda typen.
Ange **använder** från startobjektet och **används av** från målobjektet.
Alex privata förslag ska fortfarande vara osparat. Förbered samma
kontrollerade bortkastade svar som i RADERING-02 i Alex profil.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
testfallet “RADERING-07: a known erasure survives Settings navigation and
reload despite a newer result”.

**Steg:**

1. Alex granskar lampan och skriver **RADERA PERMANENT**. Välj
   **Radera permanent**. Kontrollera **Utfallet är oklart**, utan något
   slutförandebesked, och konsolens besked om det bortkastade slutförda
   svaret. Anteckna försökets identifierare från dess begäran i **Network**.
2. Robin öppnar **Inställningar → Permanent radering**, markerar bara
   **Senare tom sambandstyp** och granskar. Inga objekt, bilder eller
   privata ändringar ska ingå. Bekräfta uttryckligen och invänta slutfört
   resultat. Anteckna Robins andra identifierare.
3. Alex väljer **Översikt** i inställningarnas navigation och återvänder
   till **Permanent radering**. Ladda om sidan. Välj **Kontrollera
   raderingsstatus och läs in aktuellt innehåll**. Det slutförda resultatet
   ska tydligt visa Alex
   ursprungliga identifierare, aldrig Robins senare identifierare.
   Resultatets antal ska vara ett objekt, en bildversion och noll samband,
   objekttyper och sambandstyper.
4. Öppna **Översikt**, återvänd till raderingssidan och kontrollera status
   igen. Samma ursprungliga identifierare och slutförda resultat ska visas.
   **Network** ska inte visa någon ny `erasure/execute` eller
   `erasure/resume` i Alex profil.
5. Läs in kartan på nytt. Lampan och den senare tomma sambandstypen ska
   saknas; stolen, dess placering och Alex oberoende privata förslag ska
   finnas kvar. Övriga typer ska vara oförändrade.

**Förväntat resultat:**

- Ett nytt senaste resultat ersätter inte identiteten hos ett redan känt
  raderingsförsök när en sida lämnas eller laddas om.
- Statusläsning återfinner det ursprungliga resultatet utan en ny
  destruktiv begäran. Robins separata radering har sin egen identifierare.
- Endast de två uttryckligen granskade omfattningarna raderas. Oberoende
  sparat och privat innehåll förblir oförändrat.

### RADERING-09: Ett saknat känt försök har fortfarande okänt utfall

**Syfte:** Kontrollera att ett känt försök utan bekräftat resultat beskrivs
som okänt även efter navigation och omladdning, utan att ett annat
slutfört försök används som svar.

**Användare:** Alex som aktuell administratör i profilerna A och B.

**Förutsättningar:** Ny provkarta enligt allmän förberedelse. Logga in med
samma konto i profil B. Typen **Person** ska vara oanvänd; lampan och stolen
använder **Fordon**. I profil A öppnar du utvecklarverktygen och använder
**Network request blocking** för att blockera bara adressmönstret
`*/erasure/execute`. Blockeringen ska hindra nästa begäran innan servern
tar emot den. Inga andra adresser ska blockeras.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
testfallet “RADERING-09: an unavailable exact attempt stays explicitly
unknown after navigation and a newer result”.

**Steg:**

1. Profil A öppnar **Inställningar → Permanent radering**, granskar lampan,
   skriver **RADERA PERMANENT** och väljer **Radera permanent**. Kontrollera
   **Utfallet är oklart**. Anteckna den fullständiga identifieraren under
   **Raderingsförsök** och kontrollera i **Network** att begäran blockerades.
   Stäng av blockeringen. Välj inte något återförsök av raderingen.
2. Profil B öppnar raderingssidan, väljer bara den oanvända typen **Person**
   och granskar. Kontrollera noll objekt, samband, privata ändringar och
   bildversioner. Bekräfta den separata raderingen uttryckligen. Anteckna
   dess andra identifierare och slutförda resultat med exakt en objekttyp.
3. Profil A väljer **Översikt**, återvänder till **Permanent radering**
   och laddar om sidan. Den första identifieraren ska fortfarande visas
   tillsammans med ett uttryckligt besked om att utfallet är okänt.
   **Network** ska visa HTTP 404 för läsningen av just den identifieraren.
   Profil B:s identifierare, slutförandebesked och resultatantal får inte
   visas som svar på profil A:s försök.
4. Blockera tillfälligt bara adressen till profil A:s exakta statusläsning
   i utvecklarverktygen. Välj **Kontrollera raderingsstatus och läs in
   aktuellt innehåll**. Samma försök ska fortfarande ha okänt utfall.
   Ta bort blockeringen och välj samma statusknapp igen. Kontrollera
   beskedet **Inget bekräftat resultat hittades för ditt försök** och
   fortsatt okänt utfall. Ingen radering ska skickas automatiskt.
5. Läs kartan i profil B. Lampan, dess bild, stolen, stolens privata
   förslag och personliga placeringar ska vara kvar. Bara den separat
   granskade oanvända typen ska saknas. Kontrollera i profil A:s
   **Network** att ingen ny `erasure/execute` eller `erasure/resume` har
   skickats vid navigation, omladdning eller statusläsning.

**Förväntat resultat:**

- HTTP 404 eller en otillgänglig statusläsning bekräftar inte att
  raderingen är slutförd eller att ingen radering skett. Sidan visar
  samma kända identifierare och ett uttryckligen okänt utfall.
- Ett annat ärendes slutförda resultat ersätter inte det saknade resultatet.
  Efter omladdning återskapas ingen destruktiv begäran från lagrad metadata.
- Endast profil B:s separat bekräftade typ tas bort. Automationen jämför
  hela kartan, det oberoende privata utkastet och personliga vyer samt
  kontrollerar att lampans verkliga bild fortfarande kan läsas.

### RADERING-10: Ett gammalt statussvar ändrar inte ett nyare försök

**Syfte:** Kontrollera att en fördröjd statusläsning från en lämnad sida
inte ersätter ett senare uttryckligen granskat ärende eller tar dess fokus.

**Användare:** Alex som aktuell administratör.

**Förutsättningar:** Ny provkarta enligt allmän förberedelse. Typen
**Person** är oanvänd; lampan och stolen använder **Fordon**. Genomför
steg 1 innan det kontrollerade utdraget nedan installeras. Utdraget håller
bara leveransen av ett verkligt svar; inga uppgifter eller begäranden ändras.

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
testfallet “RADERING-10: a retired status reply cannot replace a newer
reviewed erasure after Settings navigation”.

**Steg:**

1. Öppna **Inställningar → Permanent radering**, granska lampan och
   bekräfta uttryckligen. Invänta slutfört resultat med ett objekt och en
   bildversion. Anteckna den fullständiga identifieraren.
2. Installera utdraget nedan genom **Sources → Snippets** i
   utvecklarverktygen. Välj **Kontrollera raderingsstatus och läs in
   aktuellt innehåll**. Invänta konsolens **RADERING-10: svaret väntar**.
   **Network** ska visa HTTP 200 för den exakta identifieraren och för
   den efterföljande innehållsläsningen. Utdraget håller det senare svaret.
3. Stäng utvecklarverktygen. Välj **Översikt** och återvänd till
   **Permanent radering**. Välj bara **Person** och granska. Kontrollera
   noll bildversioner, ett tomt bekräftelsefält och inaktiverad
   **Radera permanent**. Skriv **RADERA PERMANENT** och bekräfta.
4. Invänta ett nytt slutfört resultat med en annan identifierare,
   en objekttyp och noll objekt, samband, sambandstyper och bildversioner.
   Ge **Översikt** tangentbordsfokus utan att öppna länken.
5. Tryck Alt+Skift+R för att släppa det gamla svaret. Samma nyare
   identifierare och resultat ska vara kvar; fokus ska stanna på
   **Översikt**. Tryck Enter, återvänd till raderingssidan och ladda om.
   Kontrollera status igen. Bara det nyare försöket ska läsas och visas.
6. Kontrollera i **Network** att bara de två uttryckliga raderingarna
   skickas; inget slutförande eller ny radering startar av det gamla svaret.
   Läs kartan: lampan, dess bild och den oanvända typen ska saknas.
   Stolen, dess eget privata förslag, övriga typer och dess personliga
   placering ska vara kvar.

```js
(() => {
  const originalFetch = window.fetch;
  let releaseResponse = () => {};
  const held = new Promise((resolve) => { releaseResponse = resolve; });
  function release(event) {
    if (!event.altKey || !event.shiftKey || event.code !== 'KeyR') return;
    event.preventDefault();
    releaseResponse();
    window.removeEventListener('keydown', release);
  }
  window.addEventListener('keydown', release);
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = new URL(response.url);
    if (url.origin === location.origin &&
        url.pathname.endsWith('/erasure') && response.ok) {
      window.fetch = originalFetch;
      console.info('RADERING-10: svaret väntar');
      await held;
    }
    return response;
  };
})();
```

Om fallet avbryts: tryck Alt+Skift+R och ladda om sidan innan nästa fall.

**Förväntat resultat:**

- Ett svar som hör till den lämnade sidan kan inte ersätta det aktuella
  försökets identifierare, antal eller fokus. Navigation och omladdning
  fortsätter att läsa det senare kända försöket.
- De två verkliga raderingarna behåller var sin identifierare. Att lämna
  en sida ångrar ingen serveråtgärd och utlöser ingen ny destruktiv begäran.
- Automationen jämför hela det kvarvarande privata utkastet, objekt,
  typer och personliga vyer samt bekräftar att lampans bild ger HTTP 404.

### RADERING-11: Lagringsfel bevarar granskningen och samma väntande radering

**Syfte:** Skilja ett fel i webbläsarens återhämtningsminne från ett
verkligt serverresultat och stoppa nya åtgärder innan deras identifierare
kan sparas.

**Användare:** Alex som administratör i profil A.

**Förutsättningar:** Ny provkarta med lampans bild och stolens privata
förslag enligt allmän förberedelse. Använd Chromium och en andra terminal
för SQLite-läsaren i RADERING-04. Installera följande utdrag en gång genom
**Sources → Snippets** efter att raderingssidan har laddats. Det blockerar
bara raderingsärendets lagring i denna flik. Stäng utvecklarverktygen.
Alt+Skift+S blockerar skrivning, Alt+Skift+R blockerar borttagning och
Alt+Skift+A tillåter båda igen. Ladda om efter fallet för att återställa
webbläsarens vanliga funktioner.

```js
(() => {
  const prefix = 'skyttel-erasure:';
  const originalSet = Storage.prototype.setItem;
  const originalRemove = Storage.prototype.removeItem;
  let blocked = 'removeItem';
  window.addEventListener('keydown', (event) => {
    if (!event.altKey || !event.shiftKey) return;
    if (event.code === 'KeyS') blocked = 'setItem';
    else if (event.code === 'KeyR') blocked = 'removeItem';
    else if (event.code === 'KeyA') blocked = '';
    else return;
    event.preventDefault();
  });
  Storage.prototype.setItem = function (key, value) {
    if (key.startsWith(prefix) && blocked === 'setItem')
      throw new DOMException('Kontrollerat lagringsfel', 'QuotaExceededError');
    return originalSet.call(this, key, value);
  };
  Storage.prototype.removeItem = function (key) {
    if (key.startsWith(prefix) && blocked === 'removeItem')
      throw new DOMException('Kontrollerat lagringsfel', 'SecurityError');
    return originalRemove.call(this, key);
  };
})();
```

**Integrationstest:**
[household-erasure.spec.ts](../../tests/integration/household-erasure.spec.ts),
testfallet “RADERING-11: unavailable recovery storage preserves review
and the exact pending cleanup without another erasure”.

**Steg:**

1. Försök markera **Lampan att radera**. Ett meddelande om
   **Webbläsarens återhämtningsminne** ska visas. Lampan ska förbli
   omarkerad och sidan ska gå att använda; ingen radering skickas.
2. Tryck Alt+Skift+A, markera lampan och välj **Granska raderingen**.
   Skriv **RADERA PERMANENT**. Tryck Alt+Skift+S och välj
   **Radera permanent**. Läs att ingen ny radering har startats.
   Granskningen och bekräftelsetexten ska finnas kvar, utan en ny
   identifierare för ett påstått raderingsförsök.
3. Starta den oberoende SQLite-läsaren enligt RADERING-04 och låt den
   behålla sin lästransaktion. Tryck Alt+Skift+A och bekräfta samma
   granskning. Invänta verklig väntande städning och anteckna hela
   identifieraren. Kartan är tillfälligt låst.
4. Tryck Alt+Skift+S. Besök **Översikt** och återvänd till
   **Permanent radering**. Samma identifierare och väntande städning ska
   visas tillsammans med det separata lagringsfelet. Sidan får inte säga
   att den framgångsrika statusläsningen misslyckades.
5. Välj **Försök slutföra raderingen**. Läs att ingen fortsättning har
   skickats. I **Network** ska ingen ny `/erasure/execute` eller
   `/erasure/resume` ha skickats av detta försök.
6. Tryck Alt+Skift+A och avsluta lästransaktionen enligt RADERING-04.
   Välj samma fortsättningsknapp. Invänta slutförd radering med samma
   identifierare. Läs in kartan och kontrollera stolen och dess privata
   förslag. Lampan och dess tidigare bild ska vara borta.

**Förväntat resultat:**

- Lagringsfel blir synliga och lämnar granskning och kontroller användbara.
  Ett blockerat nytt försök skapar ingen falsk identifierare.
- Ett faktiskt väntande serverärende behåller sin identitet och status.
  Endast den uttryckliga fortsättningen efter återställd lagring skickas;
  ingen ersättande radering skapas.
- Automationen jämför det oförändrade innehållet före den enda raderingen,
  dess exakta identifierare, det oberoende privata utkastet och bildens HTTP 404.
