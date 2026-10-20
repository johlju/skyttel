# Manuella testfall för sambandsarbete

Fallen provar oberoende objekt, giltiga ändpunkter, fria egenskaper och
hela sambandsformulärets avbrott, återhämtning, fokus och navigering.

## Förberedelse och arbetssätt

Använd en separat
[provinstallation](../development/devcontainer.md#disposable-local-database)
med påhittade uppgifter. Börja varje fall i ett nytt hushåll. Logga in som
Alex och bjud vid behov in Robin enligt
[tillgångsguiden](../user-guide/access.md)
i en separat webbläsarprofil. Anteckna commit, webbläsare och observerat utfall.
Starta bara om provinstallationen, och behåll dess databas inom samma fall.

Öppna **Nytt objekt** från kartans verktyg eller **Tabell → Redigera [namn]**.
Objektets **Fria egenskaper** innehåller **Lägg till egenskap**. Varje rad
har **Etikett**, **Datatyp** och **Värde**. **Töm värdet** behåller raden;
**Ta bort egenskapen** tar bort raden. Etiketter får upprepas.

Öppna samband genom **Tabell → Samband för [namn]** och **Nytt samband**
eller **Redigera samband**. Egenskapsraderna finns direkt i sambandsformuläret.
**Lägg i utkastet** skickar hela sambandet. Välj **Stäng samband** innan
annat arbete. Typdefinitioner finns under **Inställningar → Typer**;
**Objekttyper** och **Sambandstyper och riktning** visar respektive lista.
Välj **Tillbaka till kartan** före objekt- och sambandsarbete.

Granska utkastet genom **Skriv till Skyttel → Visa utkastet → Visa förslaget:
[namn]**.
Stäng läsningen med krysset. Spara hela utkastet separat och invänta
**Utkastet är sparat**. Stäng textvyn före fortsatt tabellarbete.
Rapporter visar **Ändringshistorik** med **Visa ändringarna**.

Förbered Alex som Person med en fri egenskap Beskrivning (Text,
Personen i hushållet) och Blå cykeln som Fordon med Beskrivning (Text,
Cykeln i garaget). Lägg båda i utkastet. Spara bara när fallet anger det.
Båda ändpunkterna ska vara verkliga objekt även när uppgifterna är osäkra.

## Styrda avbrott

Fallen nedan använder en separat provinstallation och webbläsarens konsol.
Kör följande förberedelse innan den angivna inskickningen. Den påverkar bara
nästa inskickning av ett samband; vanlig hämtning och kontroll går till appen.
Välj `lost-applied` för ett förlorat svar efter verklig inskickning,
`lost-before` för ett avbrott före inskickning eller `delayed-rejection` för
ett väntande försök som sedan avvisas. Ladda om sidan efter avslutat fall.

```javascript
window.relationshipProbe = (mode) => {
  const original = window.fetch;
  window.fetch = async (input, options) => {
    const url = new URL(String(input), location.origin);
    if (!url.pathname.endsWith('/map/relationship-form'))
      return original.call(window, input, options);
    window.fetch = original;
    if (mode === 'lost-before') throw new TypeError('Synthetic interruption');
    if (mode === 'delayed-rejection') {
      await new Promise((resolve) => { window.relationshipRelease = resolve; });
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }
    await original.call(window, input, options);
    throw new TypeError('Synthetic lost response');
  };
};
```

## Arbetsflöden

För den sista kontrollen i SAMBAND-13: operatören installerar följande
efter det förlorade svaret och före kontrollknappen. Receptet håller nästa
verkliga kontrollsvar. När användaren har öppnat Blå cykeln och kontrollerat
dess rubrikfokus kör operatören `relationshipCheckRelease()` i konsolen.
Stäng konsolen före fokusobservationen och ladda om efter provet.

```javascript
const originalCheckFetch = window.fetch;
window.fetch = async (input, options) => {
  const url = new URL(String(input), location.origin);
  if (!url.pathname.includes('/map/relationship-form/'))
    return originalCheckFetch.call(window, input, options);
  window.fetch = originalCheckFetch;
  const response = await originalCheckFetch.call(window, input, options);
  await new Promise((resolve) => { window.relationshipCheckRelease = resolve; });
  return response;
};
```

### SAMBAND-01: Separata objekt och samband rättas oberoende

**Syfte:** Separata objekt och samband kan rättas oberoende i samma privata
utkast.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Nytt provhushåll utan objekt eller förslag.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-01"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Separata objekt och samband kan rättas oberoende i samma privata utkast.",
    "Objektets rättelse behåller sambandet och dess uttryckliga upphörda status; hela utkastet består efter omstart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skapa Alex och Blå cykeln enligt förberedelsen i samma tomma hushåll. Öppna
   Samband
   för Alex och Nytt samband. Kontrollera fokus på dialogrubriken.
2. Välj Använder, sök efter garaget och välj Blå cykeln. Läs meningen Alex
   använder Blå
   cykeln och lägg sambandet i utkastet.
3. Redigera sambandet, välj Upphört som Sambandets status och lägg i utkastet.
   Stäng och
   kontrollera fokus på öppningsknappen.
4. Redigera Blå cykeln och ändra dess fria Beskrivning till Rättad
   beskrivning. Lägg i
   utkastet och stäng. Starta om, ladda om och granska utkastet.

**Förväntat resultat:**

- Separata objekt och samband kan rättas oberoende i samma privata utkast.
- Objektets rättelse behåller sambandet och dess uttryckliga upphörda status;
  hela
  utkastet består efter omstart.

### SAMBAND-02: Fel och avbruten inmatning behåller tidigare förslag

**Syfte:** Ogiltig inmatning skickas inte; felsammanfattning och fellänkar
leder till rätt
kontroll.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Två objekt enligt förberedelsen, inga samband ännu.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-02"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Ogiltig inmatning skickas inte; felsammanfattning och fellänkar leder till rätt kontroll.",
    "Avbruten förlust bevarar söktexten; bekräftad förlust kastar bara nästa oskickade formulär."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Lägg ett Använder-samband från Alex till Blå cykeln i utkastet. Välj Nytt
   samband och
   försök skicka utan typ eller mål. Följ fellänken till Sambandstyp.
2. Välj Äger. Prova först Gäller fortfarande och sedan Upphört med tomt Till
   objekt.
   Försök skicka efter varje val och följ fellänken till Till objekt.
3. Välj Blå cykeln och Upphört. Skriv Oskickad sökning i Sök det andra
   objektet. Tryck
   Escape och sedan Escape i förlustvarningen. Kontrollera återfokus och
söktext.
4. Välj Stäng samband och Kasta ändringarna och fortsätt. Läs det tidigare
   färdiga
   utkastet.

**Förväntat resultat:**

- Ogiltig inmatning skickas inte; felsammanfattning och fellänkar leder till
  rätt
  kontroll.
- Avbruten förlust bevarar söktexten; bekräftad förlust kastar bara nästa
  oskickade
  formulär.

### SAMBAND-03: Förlorat dubblettsvar behåller försökta värden

**Syfte:** Förlorat dubblettsvar leder till kontroll och skyddad övergång utan
överskrivning.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Två sparade objekt och möjlighet till styrt svarstapp i
separat provinstallation.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-03"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Förlorat dubblettsvar leder till kontroll och skyddad övergång utan överskrivning.",
    "Avbruten övergång behåller försöket; bekräftad övergång visar det befintliga sambandets sparade värden."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered ett gemensamt sparat Använder-samband från Alex till Blå cykeln
   med status
   Gäller fortfarande. Öppna Nytt samband med samma typ och objekt men välj
Upphört.
2. Be operatören köra relationshipProbe med lost-applied enligt Styrda avbrott
   och
   bekräfta att nästa verkliga svar tappas efter genomförandet. Välj Lägg i
utkastet och
   sedan Kontrollera om ändringen lades i utkastet.
3. Läs Sambandet finns redan och kontrollera bevarad upphörd status. Välj
   Redigera
   befintligt samband och Fortsätt redigera i förlustvarningen.
4. Välj Redigera befintligt samband igen och bekräfta förlusten. Läs det
   befintliga
   sambandet med Gäller fortfarande och Blå cykeln. Stäng utan ändring.

**Förväntat resultat:**

- Förlorat dubblettsvar leder till kontroll och skyddad övergång utan
  överskrivning.
- Avbruten övergång behåller försöket; bekräftad övergång visar det befintliga
  sambandets
  sparade värden.

### SAMBAND-04: Borttagning kastar bara bekräftade oskickade ändringar

**Syfte:** Avbruten borttagning behåller oskickat arbete; bekräftad
borttagning skapar bara ett
borttagningsförslag.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Två sparade objekt och ett sparat Använder-samband med
uttrycklig aktiv status.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-04"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Avbruten borttagning behåller oskickat arbete; bekräftad borttagning skapar bara ett borttagningsförslag.",
    "Det tidigare sparade sambandet behåller status Gäller fortfarande fram till samlat sparande."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna ett sparat Använder-samband från Alex till Blå cykeln med Gäller
   fortfarande.
   Ändra status till Upphört utan att skicka.
2. Välj Föreslå borttagning och Fortsätt redigera. Kontrollera bevarad Upphört
   och att
   inget borttagningsförslag lagts.
3. Välj Föreslå borttagning igen och Kasta ändringarna och fortsätt. Läs
   bekräftelsen
   och det tidigare sparade sambandet.

**Förväntat resultat:**

- Avbruten borttagning behåller oskickat arbete; bekräftad borttagning skapar
  bara ett
  borttagningsförslag.
- Det tidigare sparade sambandet behåller status Gäller fortfarande fram till
  samlat
  sparande.

### SAMBAND-05: Alla egenskaper består vid typbyte och omvänd riktning

**Syfte:** Varje individuell egenskap behåller identitet, ordning, datatyp och
värde vid typbyte
och omvänd riktning.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Två verkliga objekt enligt förberedelsen.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-05"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Varje individuell egenskap behåller identitet, ordning, datatyp och värde vid typbyte och omvänd riktning.",
    "Ingen ändpunkt försvinner och den gemensamma kartan förblir osparad."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered ett Använder-samband från Alex till Blå cykeln i utkastet. Lägg till
   Anteckning (Text, Bevara texten), Antal (Tal, 3), Kontrolldatum (Datum,
2040-05-06),
   Kontrollerat (Ja/nej, Nej) och Väntar på uppgift (Ingen datatyp, tomt).
Välj Gäller
   fortfarande.
2. Redigera sambandet och byt typ till Äger. Läs samma egenskaper direkt. Välj
   Byt
   riktning och kontrollera Blå cykeln som frånobjekt och Alex som tillobjekt.
Lägg i
   utkastet.
3. Redigera igen, byt tillbaka till Använder och lägg i utkastet. Spara inte
   hela
   utkastet.

**Förväntat resultat:**

- Varje individuell egenskap behåller identitet, ordning, datatyp och värde
  vid typbyte
  och omvänd riktning.
- Ingen ändpunkt försvinner och den gemensamma kartan förblir osparad.

### SAMBAND-06: Läskedjan bevarar ett oklart inskickningsutfall

**Syfte:** Läskedjan bevarar det oklara försöket och dess värden tills
utfallet kontrolleras.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Två verkliga objekt, ett privat Använder-samband och
styrt svarstapp.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-06"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Läskedjan bevarar det oklara försöket och dess värden tills utfallet kontrolleras.",
    "Bekräftad kontroll visar ett enda upphört samband och stängning återställer ursprungligt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered ett Använder-samband i utkastet från Alex till Blå cykeln med Gäller
   fortfarande. Öppna redigering och välj Upphört.
2. Be operatören förbereda lost-applied enligt Styrda avbrott. Lägg i utkastet
   och
   kontrollera att utfallskontroll erbjuds.
3. Öppna Blå cykeln från dialogen, därefter Samband för Blå cykeln. Gå
   Tillbaka två
   gånger till Alex ursprungliga dialog. Kontrollera bevarad Upphört.
4. Välj Kontrollera om ändringen lades i utkastet, läs bekräftelsen, stäng
   sambandet och
   kontrollera fokus på den ursprungliga tabellknappen.

**Förväntat resultat:**

- Läskedjan bevarar det oklara försöket och dess värden tills utfallet
  kontrolleras.
- Bekräftad kontroll visar ett enda upphört samband och stängning återställer
  ursprungligt
  fokus.

### SAMBAND-07: väntande och avvisade försök skyddar hela formuläret

**Syfte:** Kontrollera spärrad dubbelinskickning och bevarade värden efter
avslag.

**Användare:** Alex.

**Förutsättningar:** De två objekten finns i utkastet, utan samband.

**Integrationstest:**
[relationship-dialog.spec.ts](../../tests/integration/relationship-dialog.spec.ts),
testfallet “SAMBAND-07: pending requests block duplicate sends and a rejected
whole
relationship retains editable values”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-07"
  },
  "reference": "Chromium, vanlig datorvy; scenariots angivna provdata och avbrott",
  "outcomes": [
    "väntande och avvisade försök skyddar hela formuläret"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före dubbelklicket i UI-steg 2: kör
`relationshipProbe('delayed-rejection')` enligt Styrda avbrott. Meddela
**Nästa inskickning väntar före avslaget**. Efter fokusprovet, vid steg 3:
kör `relationshipRelease()` och meddela **Avslaget är släppt**.
Stäng konsolen före det vanliga fokusprovet. Ladda om efter avslutad
kontroll eller avbrott för att återställa hooken, enligt den befintliga
förberedelsen. Återställ provhushållet mellan fall, aldrig under kontrollen.

**Steg:**

1. Öppna Nytt samband från Alex. Välj Använder och Blå cykeln. Be operatören
   förbereda det väntande avslaget och invänta bekräftelse.
2. Dubbelklicka Lägg i utkastet. Prova Escape och kontrollera spärrade
   redigeringsfält och stängningsknappar medan begäran väntar.
3. Be operatören släppa avslaget och invänta bekräftelse. Läs avslaget och
   kontrollera bevarade värden. Välj Lägg i utkastet igen utan styrt avslag.

**Förväntat resultat:**

- Ett enda försök skickas under väntan. Dialogen stängs inte och inga delar
  läggs i utkastet vid avslag. Det fullständiga formuläret kan rättas eller
  skickas igen.
- Nästa bekräftade försök lägger ett samband i utkastet och lämnar dialogen
  öppen.

### SAMBAND-08: Äldre framgång skriver inte över senare arbete

**Syfte:** Kontroll av ett äldre genomfört försök läser aktuellt utkast utan
att återspela gamla
värden.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Två objekt i ett tomt hushåll, samma användare i två
fönster och styrt svarstapp.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-08"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Kontroll av ett äldre genomfört försök läser aktuellt utkast utan att återspela gamla värden.",
    "Det senare upphörda sambandet behålls; det gamla formuläret byter inte tyst underlag eller visar en ny framgång."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Nytt samband från Alex och välj Använder till Blå cykeln. Be operatören
   förbereda lost-applied enligt Styrda avbrott. Skicka och behåll det oklara
försöket.
2. I ett annat fönster med samma användare, redigera det nu föreslagna
   sambandet och
   välj Upphört. Lägg ändringen i utkastet.
3. I första fönstret, välj Kontrollera om ändringen lades i utkastet. Läs
   beskedet att
   det aktuella underlaget har ändrats och kontrollera att det gamla formuläret
   fortfarande visar Gäller fortfarande. Skicka inte igen.

**Förväntat resultat:**

- Kontroll av ett äldre genomfört försök läser aktuellt utkast utan att
  återspela gamla
  värden.
- Det senare upphörda sambandet behålls; det gamla formuläret byter inte tyst
  underlag
  eller visar en ny framgång.

### SAMBAND-09: tangentbord, smal skärm och navigationsförlust

**Syfte:** Kontrollera nåbara åtgärder, fokusfälla och bekräftad sidnavigation.

**Användare:** Alex.

**Förutsättningar:** De två objekten finns i utkastet. Börja från hushållets
Inställningar och välj Tillbaka till kartan. Använd webbläsarvy 1280 × 900.
Syftet är tangentbordsarbete och bekräftad navigation på dator.

**Integrationstest:**
[relationship-dialog.spec.ts](../../tests/integration/relationship-dialog.spec.ts),
SAMBAND-09.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-09"
  },
  "reference": "1280 × 900; tangentbordsarbete och navigation",
  "outcomes": [
    "tangentbord, smal skärm och navigationsförlust"
  ]
}
```
-->

**Steg:**

1. Öppna tabellen, Samband för Alex och Nytt samband. Kontrollera fokus på
   dialogrubriken. Välj Använder och Blå cykeln med tangentbordet.
2. Nå Lägg i utkastet genom tangentbord och rullning. Kontrollera att
   fält, text och åtgärder går att använda inom webbläsarvyn.
3. Tabba från sista Stäng samband till första stängningsknappen. Kontrollera
   att dialogen håller fokus och att innehållet bakom är inaktivt.
4. Använd webbläsarens Tillbaka. Avbryt förlusten och kontrollera bevarat mål.
   Använd Tillbaka igen och bekräfta förlusten. Återvänd till kartan.

**Förväntat resultat:**

- Tangentbordet når åtgärderna utan att lämna den öppna dialogen.
  Rubriken får fokus när dialogen öppnas och åtgärderna kan rullas fram.
- Förlustvarningen har Fortsätt redigera förvalt. Bekräftad navigation kastar
  endast oskickade värden. Tidigare förslag finns kvar.

### SAMBAND-16: tangentbord, smal skärm och navigationsförlust

**Syfte:** Kontrollera nåbara åtgärder, fokusfälla och bekräftad sidnavigation.

**Användare:** Alex.

**Förutsättningar:** De två objekten finns i utkastet. Börja från hushållets
Inställningar och välj Tillbaka till kartan. Använd webbläsarvy 320 × 640.
Syftet är smalt omflöde, fokusfälla och nåbara åtgärder.

**Integrationstest:**
[relationship-dialog.spec.ts](../../tests/integration/relationship-dialog.spec.ts),
SAMBAND-16.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-16"
  },
  "reference": "320 × 640; smalt omflöde och fokusfälla",
  "outcomes": [
    "tangentbord, smal skärm och navigationsförlust"
  ]
}
```
-->

**Steg:**

1. Öppna tabellen, Samband för Alex och Nytt samband. Kontrollera fokus på
   dialogrubriken. Välj Använder och Blå cykeln med tangentbordet.
2. Nå Lägg i utkastet genom tangentbord och rullning. Kontrollera att
   fält, text och åtgärder går att använda inom webbläsarvyn.
3. Tabba från sista Stäng samband till första stängningsknappen. Kontrollera
   att dialogen håller fokus och att innehållet bakom är inaktivt.
4. Använd webbläsarens Tillbaka. Avbryt förlusten och kontrollera bevarat mål.
   Använd Tillbaka igen och bekräfta förlusten. Återvänd till kartan.

**Förväntat resultat:**

- Tangentbordet når åtgärderna utan att lämna den öppna dialogen.
  Rubriken får fokus när dialogen öppnas och åtgärderna kan rullas fram.
- Förlustvarningen har Fortsätt redigera förvalt. Bekräftad navigation kastar
  endast oskickade värden. Tidigare förslag finns kvar.

### SAMBAND-17: tangentbord, smal skärm och navigationsförlust

**Syfte:** Kontrollera nåbara åtgärder, fokusfälla och bekräftad sidnavigation.

**Användare:** Alex.

**Förutsättningar:** De två objekten finns i utkastet. Börja från hushållets
Inställningar och välj Tillbaka till kartan. Använd webbläsarvy 320 × 240.
Syftet är nåbara åtgärder och förlustvarning vid extremt låg vyhöjd.

**Integrationstest:**
[relationship-dialog.spec.ts](../../tests/integration/relationship-dialog.spec.ts),
SAMBAND-17.

<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-17"
  },
  "reference": "320 × 240; åtgärder i extremt låg webbläsarvy",
  "outcomes": [
    "tangentbord, smal skärm och navigationsförlust"
  ]
}
```
-->

**Steg:**

1. Öppna tabellen, Samband för Alex och Nytt samband. Kontrollera fokus på
   dialogrubriken. Välj Använder och Blå cykeln med tangentbordet.
2. Nå Lägg i utkastet genom tangentbord och rullning. Kontrollera att
   fält, text och åtgärder går att använda inom webbläsarvyn.
3. Tabba från sista Stäng samband till första stängningsknappen. Kontrollera
   att dialogen håller fokus och att innehållet bakom är inaktivt.
4. Använd webbläsarens Tillbaka. Avbryt förlusten och kontrollera bevarat mål.
   Använd Tillbaka igen och bekräfta förlusten. Återvänd till kartan.

**Förväntat resultat:**

- Tangentbordet når åtgärderna utan att lämna den öppna dialogen.
  Rubriken får fokus när dialogen öppnas och åtgärderna kan rullas fram.
- Förlustvarningen har Fortsätt redigera förvalt. Bekräftad navigation kastar
  endast oskickade värden. Tidigare förslag finns kvar.

### SAMBAND-10: ett uteblivet tillägg kontrolleras före nytt försök

**Syfte:** Kontrollera tryggt nytt försök och ett senare borttaget dubblettmål.

**Användare:** Alex i två fönster med samma inloggning.

**Förutsättningar:** De två objekten finns i utkastet, utan samband.

**Integrationstest:**
[relationship-dialog.spec.ts](../../tests/integration/relationship-dialog.spec.ts),
testfallet “SAMBAND-10: a request that never reached the server is checked
before
safe retry and later duplicate removal is reported truthfully”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-10"
  },
  "reference": "Chromium, vanlig datorvy; scenariots angivna provdata och avbrott",
  "outcomes": [
    "ett uteblivet tillägg kontrolleras före nytt försök"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före inskickningen i UI-steg 1: kör `relationshipProbe('lost-before')`
och meddela **Nästa inskickning stoppas före servern**. Efter det första
kontrollerade försöket, före inskickningen i steg 3: kör
`relationshipProbe('lost-applied')` och meddela **Nästa verkliga svar
tappas efter genomförandet**. Använd Styrda avbrott för båda gränserna.
Stäng konsolen före det vanliga fokusprovet. Ladda om efter avslutad
kontroll eller avbrott för att återställa hooken, enligt den befintliga
förberedelsen. Återställ provhushållet mellan fall, aldrig under kontrollen.

**Steg:**

1. Fyll Nytt samband med Använder från Alex till Blå cykeln. Be operatören
   förbereda stopp före servern och invänta bekräftelse. Välj Lägg i utkastet.
2. Välj Kontrollera om ändringen lades i utkastet. Läs beskedet att ändringen
   inte lades i utkastet. Kontrollera mål och typ och skicka igen utan avbrott.
3. Stäng dialogen och spara hela utkastet. Öppna Nytt samband med samma typ och
   ändpunkter igen. Be operatören förbereda tappat verkligt svar och invänta
   bekräftelse. Skicka sedan.
4. Föreslå borttagning av det befintliga sambandet i andra fönstret. Kontrollera
   dubblettförsöket i första fönstret och läs beskedet om ändring eller
   borttagning.

**Förväntat resultat:**

- Ett uteblivet tillägg kan skickas igen först efter kontroll. Värdena behålls
  och det bekräftade försöket skapar exakt ett samband.
- Ett historiskt dubblettutfall påstår inte att sambandet fortfarande finns
  tillgängligt för redigering. Försökets värden och senare borttagningsförslag
behålls.

### SAMBAND-11: Objektval söker fria uppgifter oberoende av tabellfilter

**Syfte:** Ändpunktsval använder hela hushållets giltiga objekt och fria
uppgifter oberoende av
tabellfiltret.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Tomt provhushåll; både sparade och föreslagna objekt
används.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-11"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Ändpunktsval använder hela hushållets giltiga objekt och fria uppgifter oberoende av tabellfiltret.",
    "Borttagna objektförslag erbjuds inte; nytt föreslaget objekt kan väljas med sitt verkliga ID och typnamn."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered de två objekten samt Upphörd sak med status Upphört och Tas bort.
   Spara.
   Skapa Egen föremålstyp och Ny sak av den typen med Förklaring (Text, Särskild
   förklaring) i utkastet. Föreslå borttagning av Tas bort.
2. Filtrera tabellen på Alex och öppna Samband för Alex och Nytt samband.
   Granska Till
   objekt: Ny sak med sin typ och identitet samt Upphörd sak ska gå att välja;
Tas bort
   ska inte erbjudas.
3. Sök efter Särskild förklaring i Sök det andra objektet. Välj Ny sak och
   Använder.
   Lägg i utkastet och stäng. Kontrollera att tabellens sökning fortfarande är
Alex.

**Förväntat resultat:**

- Ändpunktsval använder hela hushållets giltiga objekt och fria uppgifter
  oberoende av
  tabellfiltret.
- Borttagna objektförslag erbjuds inte; nytt föreslaget objekt kan väljas med
  sitt
  verkliga ID och typnamn.

### SAMBAND-12: Långa benämningar och fria etiketter bryts på smal skärm

**Syfte:** Lång mening och egenskapsetikett bryts utan vågrät rullning i
dialogen.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Separat provhushåll med långa syntetiska namn och
typbenämning.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-dialog-accessibility.spec.ts",
    "caseId": "SAMBAND-12"
  },
  "reference": "Chromium 320 × 700 CSS-pixlar; lång text skyddar omflöde och bevarat arbete.",
  "outcomes": [
    "Lång mening och egenskapsetikett bryts utan vågrät rullning i dialogen.",
    "Värdet Bevara uppgiften finns kvar och inget förslag skickas."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Förbered Alex och ett fordonsobjekt med ett namn på 180 C. Skapa
   sambandstypen Långa
   provuppgifter med en benämning från startobjektet på 180 L och omvänd
benämning
   gäller för.
2. Vid 320 CSS-pixlar, öppna Samband för Alex, Nytt samband och välj den nya
   typen och
   fordonsobjektet.
3. Lägg till en fri textegenskap med etiketten 180 F och värdet Bevara
   uppgiften. Läs
   meningen och hela formuläret utan att skicka.

**Förväntat resultat:**

- Lång mening och egenskapsetikett bryts utan vågrät rullning i dialogen.
- Värdet Bevara uppgiften finns kvar och inget förslag skickas.

### SAMBAND-13: Inskickning och utfallskontroll bevarar meningsfullt fokus

**Syfte:** Tangentbordsinskickning, avbrytande och uttrycklig kontroll återger
meningsfullt
rubrikfokus.

**Användare:** Alex, och Robin i separat profil när stegen anger en annan
medlem.

**Förutsättningar:** Två objekt enligt förberedelsen och operatör som styr
svarstapp och leverans av
utfallskontroll.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/relationship-dialog-accessibility.spec.ts",
    "caseId": "SAMBAND-13"
  },
  "reference": "Chromium på dator; riktig lokal server och SQLite.",
  "outcomes": [
    "Tangentbordsinskickning, avbrytande och uttrycklig kontroll återger meningsfullt rubrikfokus.",
    "Senare läsning behåller sitt fokus när ett fördröjt kontrollsvar anländer."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Samband för Alex, Nytt samband, Använder till Blå cykeln. Fokusera
   Lägg i
   utkastet och tryck Enter. Läs bekräftelsen och kontrollera fokus på
dialogrubriken.
2. Öppna ett nytt samband, skriv cykel i sökfältet och avbryt med bekräftad
   förlust.
   Kontrollera fokus på rubriken.
3. Redigera det första sambandet, välj Upphört och förbered lost-applied
   enligt Styrda
   avbrott. Skicka och aktivera utfallskontrollen med Enter. Kontrollera
rubrikfokus.
4. Redigera igen, välj Gäller fortfarande och tappa svaret på samma sätt. Be
   operatören
   hålla nästa utfallskontrolls svar tills du öppnat Blå cykeln. Släpp svaret,
läs
   status utan att fokus flyttas från den nya läsningens rubrik. Gå Tillbaka.

**Förväntat resultat:**

- Tangentbordsinskickning, avbrytande och uttrycklig kontroll återger
  meningsfullt
  rubrikfokus.
- Senare läsning behåller sitt fokus när ett fördröjt kontrollsvar anländer.

### SAMBAND-14: gammalt försök lämnas utan att skriva över senare arbete

**Syfte:** Kontrollera att ett försök utan bevarad bekräftelse kan lämnas
när ett senare förslag har ändrat utkastet, med bevarade värden och nytt
aktuellt underlag före fortsatt inskickning.

**Användare:** Alex i två fönster med samma hushåll och användare.

**Förutsättningar:** Två objekt enligt allmän förberedelse och inga samband.
Öppna samma hushåll i ett andra fönster. Förbered `relationshipProbe` enligt
Styrda avbrott ovan. Använd en separat provinstallation med påhittade uppgifter.

**Integrationstest:**
[relationship-outcome-absence.spec.ts](../../tests/integration/relationship-outcome-absence.spec.ts),
testfallet “SAMBAND-14: an absent old-version attempt unlocks retained input and
requires current-basis review before retry”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/relationship-outcome-absence.spec.ts",
    "caseId": "SAMBAND-14"
  },
  "reference": "Chromium, vanlig datorvy; scenariots angivna provdata och avbrott",
  "outcomes": [
    "gammalt försök lämnas utan att skriva över senare arbete"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före inskickningen i UI-steg 1: kör `relationshipProbe('lost-before')` enligt
Styrda avbrott och meddela **Nästa inskickning stoppas före servern**. Behåll
första fönstret och dess försöksvärden medan det andra fönstret lägger Lo i
samma utkast. Stäng konsolen före det vanliga fokusprovet. Ladda om efter
avslutad kontroll eller avbrott för att återställa hooken, enligt den befintliga
förberedelsen. Återställ provhushållet mellan fall, aldrig under kontrollen.

**Steg:**

1. I första fönstret, öppna tabellen och Samband för Alex. Välj Nytt samband,
   Använder, Blå cykeln och Osäkert uppgivet. Be operatören förbereda stopp före
   servern och invänta bekräftelse. Välj Lägg i utkastet.
2. I andra fönstret, skapa Lo som Person med Nytt objekt. Välj Lägg i utkastet
   och stäng. Kontrollera att Lo finns i ditt utkast.
3. I första fönstret, välj Kontrollera om ändringen lades i utkastet. Läs
   beskedet om saknad bevarad bekräftelse och ändrat utkast. Kontrollera att
   säkerhet och objektval finns kvar och går att läsa eller ändra. Lägg i
   utkastet är spärrat tills formuläret öppnas med aktuellt underlag.
4. Välj Stäng samband och sedan Fortsätt redigera. Kontrollera att värdena finns
   kvar. Anteckna de värden du vill använda. Välj Stäng samband igen och Kasta
   ändringarna och fortsätt. Kontrollera fokus på öppningsknappen.
5. Öppna Samband för Alex igen, välj Nytt samband och ange samma typ, ändpunkter
   och Osäkert uppgivet efter granskning av aktuella uppgifter. Välj Lägg i
   utkastet och kontrollera bekräftelsen.

**Förväntat resultat:**

- Kontrollsvaret låser inte formuläret för alltid. Det gamla försöket kan
  inte längre ändra det aktuella utkastet. Ingen bekräftelse eller tidigare
  framgång uppfinns och formulärets underlag byts inte automatiskt.
- Avbruten förlust behåller inmatningen. Bekräftad stängning kastar endast
  oskickade formulärvärden. Lo och båda tidigare objektförslagen behålls.
- Det nya förslaget blir ett enda osäkert samband på aktuellt underlag.
  Den gemensamma kartan är fortfarande tom. Automatiseringen kontrollerar
  även att den försenade ursprungliga HTTP-begäran avvisas med 409, att dess
  utfall saknas och att ingen del av utkastet ändras av det gamla försöket.

### SAMBAND-15: gammal redigering skriver inte över en senare sambandsändring

**Syfte:** Kontrollera att uppföljning av ett gammalt försök inte ersätter
eller tar bort ett senare förslag till samma samband från samma användare.

**Användare:** Alex i två fönster med samma hushåll och användare.

**Förutsättningar:** Två objekt enligt allmän förberedelse. Lägg ett känt
Använder-samband från Alex till Blå cykeln i utkastet; spara inte gemensamt.
Öppna hushållet i ett andra fönster. Förbered `relationshipProbe` enligt
Styrda avbrott ovan i det första fönstret.

**Integrationstest:**
[relationship-outcome-absence.spec.ts](../../tests/integration/relationship-outcome-absence.spec.ts),
testfallet “SAMBAND-15: absent stale editing cannot overwrite or remove a later
same-owner relationship proposal”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/relationship-outcome-absence.spec.ts",
    "caseId": "SAMBAND-15"
  },
  "reference": "Chromium, vanlig datorvy; scenariots angivna provdata och avbrott",
  "outcomes": [
    "gammal redigering skriver inte över en senare sambandsändring"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före inskickningen i UI-steg 1: kör `relationshipProbe('lost-before')` enligt
Styrda avbrott och meddela **Nästa inskickning stoppas före servern**. Behåll
första fönstret och dess gamla redigering medan den andra klienten ändrar samma
samband och lägger ett oberoende förslag. Stäng konsolen före det vanliga
fokusprovet. Ladda om efter avslutad kontroll eller avbrott för att återställa
hooken, enligt den befintliga förberedelsen. Återställ provhushållet mellan
fall, aldrig under kontrollen.

**Steg:**

1. I första fönstret, öppna tabellen, Samband för Alex och Redigera samband.
   Ändra säkerheten till Osäkert uppgivet. Be operatören förbereda stopp före
   servern och invänta bekräftelse. Välj Lägg i utkastet.
2. I andra fönstret, redigera samma samband till Obesvarad identitetsfråga och
   lägg i utkastet. Kontrollera att inget identifierat målobjekt anges. Stäng
   sambandsdialogen, skapa Lo som Person och lägg även det i utkastet.
3. I första fönstret, välj Kontrollera om ändringen lades i utkastet.
   Kontrollera beskedet om saknad bevarad bekräftelse och ändrat utkast. Det
   försökta formuläret visar fortfarande Osäkert uppgivet och Blå cykeln. Lägg i
   utkastet och Föreslå borttagning är spärrade.
4. Välj Stäng samband och Fortsätt redigera. Kontrollera att de försökta värdena
   finns kvar. Välj Stäng samband igen och bekräfta Kasta ändringarna och
   fortsätt. Öppna Samband för Alex och Redigera samband igen.
5. Läs det aktuella formuläret: säkerheten är Obesvarad identitetsfråga och
   Till objekt visar Blå cykeln. Skicka eller ta inte bort något.

**Förväntat resultat:**

- Kontrollen behåller både oskickade värden och det aktuella privata
  utkastet. Den överför inte ett gammalt formulär till nyare underlag utan
  granskning och ger inga påhittade framgångsbesked.
- Stängning skyddas av förlustvarningen. Avbruten förlust behåller de
  försökta värdena. Bekräftad stängning påverkar inte senare förslag.
- Det befintliga sambandet är fortfarande Obesvarad identitetsfråga med
  Blå cykeln som mål,
  Lo och båda tidigare objektförslagen finns kvar och den gemensamma kartan
  är tom. Automatiseringen provar även den försenade gamla HTTP-begärans
  avvisning och oförändrat aktuellt utkast.

## Mänskliga hjälpmedelsprov

### SAMBAND-18: skärmläsaren beskriver sambandsarbetet

**Syfte:** Kontrollera faktiskt upplästa rubriker, etiketter, fel och status.

**Användare:** Alex med en riktig skärmläsare och webbläsare.

**Förutsättningar:** De två objekten enligt allmän förberedelse finns
i utkastet. Anteckna skärmläsare, version och webbläsare.

**Kräver mänsklig observation:** Lyssna på skärmläsarens faktiska uppläsning.
DOM-fokus i SAMBAND-09 bevisar inte uppläst innehåll.

<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "Lyssna på rubriker, fältetiketter, fel och status."
  },
  "reference": "Riktig skärmläsare och webbläsare; anteckna versionerna",
  "outcomes": ["Rubriker, etiketter, fel och status går att förstå"],
  "evidence": [{
    "kind": "overlap",
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-09",
    "purpose": "Syntetiskt tangentbord och DOM-fokus på dator"
  }]
}
```
-->

**Steg:**

1. Öppna Tabell, Samband för Alex och Nytt samband med skärmläsaren.
   Lyssna på dialogrubriken och fältens namn.
2. Försök lägga till utan typ och mål. Lyssna på felsammanfattningen och
   följ fellänkarna. Fyll Använder och Blå cykeln och lägg i utkastet.
3. Lyssna på bekräftelsen. Stäng dialogen och fortsätt från öppningsknappen.

**Förväntat resultat:**

- Uppläsningen gör riktning, fält, fel och bekräftelse begripliga.
- Inga åtgärder kräver att användaren ser den rumsliga kartan.

### SAMBAND-19: ett fysiskt skärmtangentbord lämnar åtgärder nåbara

**Syfte:** Kontrollera faktisk skymning när telefonens tangentbord öppnas.

**Användare:** Alex med en fysisk telefon.

**Förutsättningar:** De två objekten enligt allmän förberedelse finns
i utkastet. Anteckna telefon, operativsystem och webbläsare.

**Kräver mänsklig observation:** Öppna telefonens verkliga skärmtangentbord
och kontrollera skymning och rullning. Ändrad Chromium-vyhöjd utför inte det.

<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Öppna fysiskt skärmtangentbord och prova nåbara åtgärder."
  },
  "reference": "Fysisk telefon med verkligt skärmtangentbord",
  "outcomes": ["Inmatning och åtgärder kan användas med tangentbordet öppet"],
  "evidence": [{
    "kind": "overlap",
    "spec": "tests/integration/relationship-dialog.spec.ts",
    "caseId": "SAMBAND-17",
    "purpose": "Syntetisk extremt låg webbläsarvy"
  }]
}
```
-->

**Steg:**

1. Öppna Tabell, Samband för Alex och Nytt samband. Tryck i Sök det andra
   objektet så att telefonens skärmtangentbord öppnas. Skriv cykel.
2. Välj Använder och Blå cykeln. Rulla fram Lägg i utkastet och
   Stäng samband medan tangentbordet är öppet.
3. Stäng sambandet och välj Fortsätt redigera i förlustvarningen.
   Kontrollera bevarad sökning och mål.

**Förväntat resultat:**

- Inmatning, text och åtgärder går att nå trots det verkliga tangentbordet.
- Avbruten förlust bevarar inmatningen och återgår till redigeringen.

## Täckningens gräns

Alla SAMBAND-identiteter består. SAMBAND-05 skyddar värdebevarande
fria egenskaper vid typbyte; tidigare förlustdialog och skilda mållösa
säkerhetslägen har avvecklats tillsammans med funktionerna. Verkliga
ändpunkter och uttrycklig livscykel används i fortsatta avbrottsflöden.
Fysisk förstoring, uppläsning och mobil tangentbordsskymning kräver sina
mänskliga observationer. Inga sådana resultat följer av syntetiska tester.
