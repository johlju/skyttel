# Manuella testfall för sammanslagning

Testfallen omfattar uttrycklig identitet, uppgifter och samband vid
sammanslagning samt privat utkast, kvitto, historik och ångring.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex är administratör och medlem i hushållet Linden. Använd en andra
webbläsare med samma inloggning för att kontrollera återupptagning.
Robin är en annan inbjuden medlem i samma hushåll och använder en egen
webbläsarprofil. Använd endast påhittade uppgifter och installationens
testinloggning.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

1. Starta en isolerad testinstallation. Logga in som Alex och skapa Linden.
2. Återställ installationen mellan körningar. Behåll databasen vid omstart
   och använd samma hushåll och inloggning i båda webbläsarna.

## Sammanslagning och ångring

### SAMMANSLAGNING-01: granska identiteter, samband och ångra hela sparandet

**Syfte:** Kontrollera uttryckliga val, blockerad identitet, återupptagning
och återställning av originalidentiteter med oberoende arbete bevarat.

**Användare:** Alex i båda webbläsarna.

**Förutsättningar:** Två sparade objekt heter Lo Exempel. Det första har
beskrivningen Första uppgiften, det andra Andra uppgiften. Anteckna deras
identiteter. Båda har varsitt samband av samma typ till Blått kort;
det andra sambandet är manuellt upphört. Lägg Robin Exempel i ett eget
utkast och behåll förslaget osparat.

**Integrationstest:**
[merge.spec.ts](../../tests/integration/merge.spec.ts),
testfallet “SAMMANSLAGNING-01: explicit identities and edge choices survive
restart, lost receipt and whole-save undo”.

**Steg:**

1. Välj **Slå samman objekt**. Välj första Lo som objekt som behåller sin
   identitet och andra Lo som objekt som tas in. Granska identifierare,
   beskrivningar och samband. Välj andra objektets beskrivning.
2. Välj **Behåll sambandet** för båda och lägg förslaget i utkastet.
   Kontrollera att dubbletten avvisas utan att utkastet ändras.
3. Välj **Ta bort sambandet** för det första sambandet. Lämna bekräftelsen
   av samma företeelse omarkerad och lägg förslaget i utkastet.
4. Kontrollera att **Spara hela utkastet** är spärrad. Välj **Kasta
   sammanslagningen för att rätta**. Robin ska finnas kvar i utkastet.
5. Välj objekten och uppgifterna igen, behåll endast det andra sambandet
   och bekräfta uttryckligen att objekten är samma företeelse.
6. Lägg förslaget i utkastet. Starta om installationen och ladda om sidan.
   Kontrollera hela skillnaden. Kör engångskoden för förlorat sparsvar i
   [BILD-02](profile-images.md#bild-02-avvisa-felaktiga-bilder-och-återhämta-bildborttagning)
   i den här sidans Console **före** nästa sparande. Välj **Spara hela
   utkastet** utan att ladda om först. Koden inväntar serversvaret innan
   appen får anslutningsfelet. Kontrollera det okända utfallet och välj
   **Hämta samma kvitto igen**. Ladda om, öppna **Mina sparförsök** och
   **Visa historik**: samma genomförda försök och kvitto ska finnas, med
   exakt en ändringsgrupp för sammanslagningen. Koden återställer `fetch`
   efter ett svar; ladda om sidan för att återställa om provet avbryts.
7. Rätta det kvarvarande objektets namn till Senare namn och spara.
   Lägg Eget senare objekt i utkastet. Starta om installationen.
8. Öppna den andra webbläsaren. Välj **Visa historik**, hitta
   sammanslagningen och välj **Visa ändringarna**. Öppna **Granskade objekt
   före sammanslagningen** och granska identiteter och upphörd status.
9. Välj **Ångra sparandet**, granska hela förslaget och spara.

**Förväntat resultat:**

- Samma namn bekräftar inte identiteten. Olika uppgifter och kolliderande
  samband kräver uttryckliga val. Obesvarad identitet spärrar hela sparandet.
- Utkastet och historiken överlever omstart. Förlorat svar skapar inte en
  extra ändringsgrupp. Kvitto och gemensam karta beskriver samma resultat.
- Ångringen återställer båda ursprungliga identiteterna, beskrivningarna
  och sambanden, inklusive upphörd status. Senare namn och Eget senare
  objekt bevaras. Robin ingår i samma ursprungliga sparande och ångras också.

### SAMMANSLAGNING-02: granska ändrat underlag utan att tappa oberoende val

**Syfte:** Kräv nya uttryckliga val när granskade uppgifter ändras och
behåll granskningen när bara oberoende innehåll ändras.

**Användare:** Alex och Robin i varsin webbläsarprofil.

**Förutsättningar:** Två sparade objekt heter Lo Exempel med olika
beskrivningar. Båda har varsitt likadant samband till Blått kort. Ett
fjärde sparat objekt heter Oberoende objekt. Alex har Eget privat förslag
i sitt utkast, av en annan objekttyp än de båda Lo. Den privata typen ska
inte ändras under provet. Anteckna objektens, typernas och sambandens
identiteter.

**Integrationstest:**
[merge.spec.ts](../../tests/integration/merge.spec.ts),
testfallet “SAMMANSLAGNING-02: refreshed source facts require new choices
while independent changes preserve review”.

**Steg:**

1. Alex öppnar **Slå samman objekt**, väljer de två Lo, den andra
   beskrivningen och att behålla båda sambanden. Bekräfta samma företeelse.
2. Robin ändrar beskrivningen på Oberoende objekt och sparar hela utkastet.
3. Alex lägger sammanslagningen i utkastet och läser dubblettfelet.
   Välj **Hämta aktuellt underlag**. Kontrollera att identitetsbekräftelse,
   beskrivningsval och sambandsval finns kvar. Välj nu att ta bort det
   första sambandet.
4. Robin ändrar beskrivningen på det andra Lo till Ändrat efter
   granskningen och sparar hela utkastet.
5. Alex försöker lägga sammanslagningen i utkastet. Läs beskedet om ändrat
   underlag och välj **Hämta aktuellt underlag**. Läs den nya beskrivningen
   och kontrollera att tidigare val och identitetsbekräftelse är tömda.
6. Granska på nytt. Upprepa försöket med nya val när Robin först ändrar
   den granskade objekttypens namn, sedan andra sambandet till upphört och
   slutligen dess sambandstyps namn. Varje ändring ska avvisa det gamla
   underlaget och tömma granskningen efter hämtning, utan ändrat utkast.
7. Granska båda objekten igen, välj den nya andra beskrivningen, bekräfta
   samma företeelse och behåll endast det andra sambandet. Lägg förslaget
   i utkastet och välj uttryckligen **Spara hela utkastet**.
8. Starta om installationen och öppna kartan och historiken igen.

**Förväntat resultat:**

- Oberoende sparade ändringar återställer inte granskningen. Dubblettfel
  och inaktuellt underlag ändrar inget i Alex privata utkast.
- Ändrade granskade uppgifter kräver nya val och ny identitetsbekräftelse.
  Det gamla valet tillämpas inte automatiskt på ett nytt värde.
- Efter uttryckligt sparande behålls första identiteten, den nya andra
  beskrivningen, Robins oberoende ändring och Alex privata förslag. Endast
  det andra sambandet finns kvar och pekar på första objektet.
- Historiken återger de faktiskt granskade nya uppgifterna. Avvisade
  försök skapar inga extra sparanden. Resultatet överlever omstart.

### SAMMANSLAGNING-03: tangentbord, återgång och oberoende oskickat arbete

**Syfte:** Hålla granskning och oberoende text kvar vid tillfällig
navigering samt ge synligt fokus vid öppning, avbrott och nytt förslag.

**Användare:** Alex.

**Förutsättningar:** Två sparade objekt heter Lo Exempel med olika
beskrivningar. Ett tredje sparat objekt heter Oberoende objekt. Inga
privata förslag eller oskickade formulär finns när provet börjar.

**Integrationstest:**
[merge.spec.ts](../../tests/integration/merge.spec.ts),
testfallet “SAMMANSLAGNING-03: keyboard merge review survives panels and
Settings with independent unsent work”.

**Steg:**

1. Öppna Lista och använd tangentbordet för **Slå samman objekt**.
   Kontrollera synligt fokus på sammanslagningens rubrik.
2. Välj båda Lo, den andra beskrivningen och bekräfta samma företeelse.
3. Öppna uppgifterna för Oberoende objekt och läs beskrivningen.
4. Växla till **Lista och utkast**. Besök Inställningar och välj
   **Tillbaka till kartan**. Stäng arbetsytan och öppna Lista igen.
   Kontrollera att sammanslagningens val finns kvar efter varje återgång.
5. Använd tangentbordet för **Stäng sammanslagningen utan att skicka**.
   Kontrollera fokus på **Slå samman objekt** och att kartan är oförändrad.
   Återgå till Oberoende objekt och börja redigera beskrivningen. Skriv
   Oskickat arbete finns kvar utan att lägga texten i utkastet.
6. Öppna sammanslagningen igen. Kontrollera att det uttryckliga avbrottet
   tömmer valen. Välj objekten och den andra beskrivningen, bekräfta samma
   företeelse. Besök Inställningar och återgå med valen kvar. Lägg
   sammanslagningen i utkastet med tangentbordet.
7. Kontrollera fokus på **Hela mitt utkast**. Sparandet ska fortfarande
   vara spärrat eftersom den andra texten är oskickad. Återgå till den
   texten och välj **Lägg i mitt utkast**.
8. Välj **Spara hela utkastet**, invänta kvittot och starta om installationen.

**Förväntat resultat:**

- Tillfällig navigering behåller granskningen och den oberoende texten.
  Ett uttryckligt avbrott tömmer enbart sammanslagningens formulärval.
- Öppning, avbrott och skickat förslag ger logiskt, synligt fokus.
  Oberoende oskickad text hindrar inte att sammanslagningen granskas.
- Varken navigering eller skickade förslag ändrar den gemensamma kartan.
  Hela sparandet inväntar att oskickad text hanteras uttryckligen.
- Ett kvitto omfattar sammanslagningen och den andra beskrivningen.
  Det första Lo behåller sin identitet; resultatet finns kvar efter omstart.

### SAMMANSLAGNING-04: fullständiga värden, bilder och samband i båda teman

**Syfte:** Bevara typbundna dolda värden, ekonomiska uppgifter, bilder,
ikonval och sambandsvärden genom uttrycklig granskning och sparande.

**Användare:** Alex.

**Förutsättningar:** Två sparade objekt heter Alex blå cykel. Anteckna
bådas identiteter. Första har typen Utrustning med dolda fält Nummer
(tal, värdet 0) och Försäkrad (ja/nej, värdet Nej). Andra har typen
Registrering med fältet Nummer (text, värdet SYNTH-42). Första är
ospecificerat och manuellt upphört, andra är identifierat och aktuellt.
De har olika beskrivningar, profilbilder och ikonerna Cykel respektive Musik.

Första objektets skuld är osäkert uppgiven som 125 000,50 den
2026-09-01, kreditutrymmet uttryckligen inget den 2026-09-02, utnyttjad
kredit känt 0 den 2026-09-03 och priset okänt. Andra har känt skuldbelopp
140 000 från 2026-08-01. Båda förvaras i Garaget genom egna samband av
samma typ. Andra sambandet är upphört och har de dolda värdena Platser 0
och Under tak Nej; första har Platser 2 och Under tak Ja.

**Integrationstest:**
[merge-values.spec.ts](../../tests/integration/merge-values.spec.ts),
testfallen “SAMMANSLAGNING-04: complete typed values, images, icons and
edges survive explicit merge and restart at 1280px in light”, samt samma
scenario med 390px och 320px och respektive tema light och dark.

**Steg:**

1. Kör flödet i både ljust och mörkt tema på dator och smal skärm.
   Öppna **Slå samman objekt** och välj rätt identiteter.
2. Läs båda typerna, de dolda värdena, beloppens säkerhet och datum,
   profilbilderna, livscykeln och alla berörda samband.
3. Välj första objektets typ, identitetsstatus, livscykel och ekonomiska
   uppgifter samt andra objektets beskrivning, profilbild och ikon.
4. Välj första objektets Nummer och Försäkrad, men välj även andra
   objektets Nummer. Behåll endast andra sambandet. Kontrollera att
   förslaget spärras med en förklaring om fältens olika typer.
5. Välj **Utelämna uppgiften** för Registrering: Nummer, bekräfta samma
   företeelse och lägg sammanslagningen i utkastet. Läs förslaget.
6. Välj **Spara hela utkastet**, invänta kvittot och starta om installationen.
7. Öppna historiken och rätt sparandes **Visa ändringarna**, sedan
   **Granskade objekt före sammanslagningen**. Läs de ursprungliga
   identiteterna, typerna, värdena, bilderna och sambanden.

**Förväntat resultat:**

- Lika namn eller fältnamn slår inte ihop identiteter eller olika
  betydelser. Dolda 0 och Nej förblir skilda från obesvarade uppgifter.
- Hela ekonomiska uppgiften behåller belopp, säkerhet och datum.
  Okänt och uttryckligen inget förblir olika.
- Första identiteten behålls med valda uppgifter. Andra bilden kopieras
  till den identiteten och ikonvalet finns kvar bakom profilbilden.
- Endast andra sambandet finns kvar med första objektet som ändpunkt,
  upphörd status och de exakta egna värdena 0 och Nej.
- Kartan ändras först vid uttryckligt sparande. Ett kvitto omfattar båda
  objekten och sambanden; fullständigt resultat och granskade original
  finns kvar efter omstart. Långa identiteter kan läsas på smal skärm.

### SAMMANSLAGNING-05: behåll deltagarnas oskickade text tills den överges

**Syfte:** Skydda båda objektens öppna formulär och tidigare privata förslag
när sammanslagningen granskas eller kastas.

**Användare:** Alex.

**Förutsättningar:** Två sparade objekt heter Första Lo och Andra Lo med
olika beskrivningar. Lägg en ny privat beskrivning för vartdera objektet
och ett Oberoende privat objekt i utkastet, utan att spara.

**Integrationstest:**
[merge-participants.spec.ts](../../tests/integration/merge-participants.spec.ts),
testfallet “SAMMANSLAGNING-05: participant text survives merge and blocks
discard until explicitly abandoned”.

**Steg:**

1. Öppna och redigera båda objekten i egna paneler. Skriv Första oskickade
   texten respektive Andra oskickade texten utan att skicka formulären.
2. Öppna **Slå samman objekt**. Behåll första identiteten och namnet,
   välj andra beskrivningen och bekräfta samma företeelse. Lägg förslaget
   i utkastet. Kontrollera att sparande och kastning är spärrade.
3. Stäng arbetsytan och öppna Lista igen. Återgå till Första Lo: texten
   finns kvar men formuläret visar äldre underlag och kan inte skickas.
   Stäng objektpanelen, öppna uppgifterna igen och kontrollera texten.
4. Återgå till Andra Lo. Även det formuläret ska visa äldre underlag,
   behålla texten och spärra **Lägg i mitt utkast**.
5. Kopiera eventuell text som ska behållas. Välj uttryckligen **Stäng
   utan att skicka texten** för Andra Lo. Kastning är fortfarande spärrad
   tills samma uttryckliga val görs för Första Lo.
6. Välj **Kasta sammanslagningen för att rätta**. Läs de ursprungliga
   privata beskrivningarna och det oberoende förslaget. Starta om
   installationen och öppna utkastet igen.

**Förväntat resultat:**

- Vanlig panel- och arbetsytestängning kastar inte oskickad text.
  Äldre underlag och sammanslagna identiteter skyddas av befintliga regler.
- Enskilda formulär får inte skriva över sammanslagningen. Integrationstestet
  kontrollerar även att servern avvisar ett sådant förslag med aktuell
  utkastsversion utan att ändra något. Kastning väntar tills oskickade
  formulär hanteras uttryckligen.
- Båda tidigare privata förslagen återkommer med sina identiteter;
  oberoende förslag bevaras. Ingen gemensam ändring eller extra kvitto
  skapas. Utkastet finns kvar efter omstart.

### SAMMANSLAGNING-06: behåll senare sökfokus vid långsamt förslag och fel

**Syfte:** Ge användarens senare fokusval företräde när ett riktigt
förslag eller avvisande kommer tillbaka.

**Användare:** Alex.

**Förutsättningar:** Två sparade Lo Exempel med olika beskrivningar och
varsitt likadant samband till Blått kort. Ett oberoende privat förslag
finns i utkastet. Använd nätverksbegränsning i webbläsarens utvecklarverktyg
så att svaret hinner inväntas medan sökfältet används.

**Integrationstest:**
[merge-recovery.spec.ts](../../tests/integration/merge-recovery.spec.ts),
testfallet “SAMMANSLAGNING-06: delayed real rejection and proposal preserve
newer search focus”.

**Steg:**

1. Granska de båda Lo, välj andra beskrivningen, bekräfta samma företeelse
   och välj att behålla båda sambanden.
2. Lägg sammanslagningen i utkastet. Medan svaret väntar, välj **Sök
   objekt** och skriv Lo. Läs sedan dubblettfelet utan att flytta fokus.
3. Välj att ta bort första sambandet och skicka det rättade förslaget.
   Medan svaret väntar, skriv kort i **Sök objekt**.
4. Läs beskedet om privat utkast och kontrollera sökfältets fokus och text.
   Återställ nätverksinställningen.

**Förväntat resultat:**

- Både det avvisade och det lyckade svaret behåller användarens senare
  sökfokus och text. Dubblettfelet bevarar hela utkastet och granskningen.
- Det rättade förslaget och det oberoende förslaget finns i samma privata
  utkast. Gemensam karta och historik ändras inte utan uttryckligt sparande.

### SAMMANSLAGNING-07: återläs ett förslag efter förlorat svar

**Syfte:** Återhämta det faktiska privata förslaget utan automatiskt nytt
försök eller sparande när svaret går förlorat.

**Användare:** Alex.

**Förutsättningar:** Samma sparade objekt, samband och oberoende privata
förslag som i SAMMANSLAGNING-06. Återställ installationen först.

**Integrationstest:**
[merge-recovery.spec.ts](../../tests/integration/merge-recovery.spec.ts),
testfallet “SAMMANSLAGNING-07: lost proposal reply is read back without
resubmitting or saving implicitly”.

**Steg:**

1. Granska sammanslagningen, välj andra beskrivningen, behåll endast andra
   sambandet och bekräfta samma företeelse.
2. Kör följande engångskod i utvecklarverktygens Console. Den låter
   servern svara på det riktiga förslaget men tappar svaret för appen.
   Ladda om om provet avbryts innan förslaget skickas.

   ```javascript
   const originalFetch = window.fetch;
   window.fetch = async (...args) => {
     const response = await originalFetch(...args);
     if (response.url.endsWith('/map/merge')) {
       window.fetch = originalFetch;
       throw new TypeError('Kontrollerat förlorat förslagssvar');
     }
     return response;
   };
   ```

3. Lägg förslaget i utkastet. Läs beskedet om obekräftad ändring och
   kontrollera att ett nytt förslag är spärrat.
4. Välj Offline i utvecklarverktygens nätverksinställning och välj
   **Hämta aktuellt underlag**. Läs hämtningsfelet; spärren ska bestå.
5. Återställ nätverket och hämta igen. Läs sammanslagningen och det
   oberoende förslaget i **Hela mitt utkast**.
6. Stäng det oskickade granskningsformuläret uttryckligen. Det återlästa
   privata förslaget ska finnas kvar. Starta om installationen och ladda om.
7. Granska utkastet igen och välj **Spara hela utkastet**. Läs kvittot,
   kartan och historiken.

**Förväntat resultat:**

- Okänt utfall framställs inte som ett misslyckat eller sparat förslag.
  En misslyckad läsning låser fortsatt nytt förslag. Återhämtning skickar
  inte sammanslagningen igen och sparar inget automatiskt.
- Samma privata sammanslagning och oberoende förslag överlever omstart.
  Att stänga granskningsformuläret kastar inte det återlästa utkastet.
- Endast uttryckligt sparande skapar ett kvitto och gemensamt resultat:
  första identiteten, andra beskrivningen och det valda sambandet finns
  kvar tillsammans med det oberoende objektet.
