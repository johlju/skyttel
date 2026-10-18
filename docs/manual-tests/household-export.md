# Manuella testfall för fullständig export

Testfallen omfattar administratörens information före export, nedladdning,
avbrott, ändrad tillgång, giltighetstid och bevarat innehåll efter
vanliga bildförslag. Anteckna commit, webbläsare och godkänt eller underkänt
resultat vid körning.

## Konfigurerade användare

Använd en isolerad testinstallation och separata webbläsarprofiler med
testinloggning eller kontrollerade identiteter enligt
[installationsguiden](../operations/installation.md).

- **Alex** är administratör i hushållet Linden och använder profil A.
- **Robin** är medlem i samma hushåll och använder profil B. EXPORT-04 och
  EXPORT-07 kräver att Robin också är administratör.

Använd bara påhittade uppgifter och testbilder. Vanlig tillgång till kartan
ger ingen rätt att göra fullständig export.

## Allmän förberedelse

1. Skapa Linden som Alex och bjud in Robin enligt
   [guiden för tillgång](../user-guide/access.md#bjud-in-en-skyttel-användare).
2. Spara ett gemensamt objekt med profilbild. Ändra beskrivningen och
   spara igen så att historik finns. Lägg ett eget privat objekt i Robins
   utkast och ändra Robins personliga vy utan att spara utkastet.
3. Använd en tom, privat mapp för nedladdningarna. Kontrollera att du kan
   öppna ZIP-filer och JSON-filer. Radera testexporterna efter körningen.
4. Återställ installationen mellan testfallen. Vid omstart i EXPORT-06
   ska databasen och samma inloggning finnas kvar.

## Förberedelse och hämtning

### EXPORT-01: Hämta en fullständig export med tangentbordet

**Syfte:** Kontrollera att administratören får information om privata
uppgifter före exporten och kan hämta en komplett fil med tangentbordet.

**Användare:** Alex som administratör och Robin som medlem.

**Förutsättningar:** Gemensamt innehåll, historik, bild och Robins privata
uppgifter finns enligt förberedelsen.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-01: an administrator downloads the complete household
archive by keyboard”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-01"
  },
  "reference": "Dator, administratör; isolerad installation med kontrollerad inloggning",
  "outcomes": [
    "Endast administratören kan hämta och webbläsaren erbjuder en ZIP-fil efter tangentbordsval"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Kontrollera som Robin att **Fullständig export** saknas i Inställningar.
   Öppna samma exportadress som Alex använder och kontrollera att ingen
   export erbjuds.
2. Öppna **Inställningar** som Alex. Använd tangentbordet till
   **Fullständig export** i sidnavigationen och tryck Enter. Kontrollera
   fokus på sidrubriken och läs informationen före exportknapparna.
3. Använd Tab till **Förbered fullständig export** och tryck Enter.
   Vänta tills exporten är klar och kontrollera den visade sluttiden.
4. Använd tangentbordet till **Hämta ZIP-fil** och tryck Enter. Spara
   filen i testmappen och öppna den med ett ZIP-program.
5. Kontrollera att webbläsaren erbjuder `skyttel-hushall.zip` och att
   sidan visar att webbläsarens nedladdning har startats.
   Arkivinnehållet kontrolleras i separat tekniskt underlag nedan.

**Förväntat resultat:**

- Endast administratören kan förbereda export. Före starten framgår att
  andras privata utkast, personliga vyer, bilder och historik ingår,
  att administratören kan läsa det privata innehållet, att filen inte är
  lösenordsskyddad och behöver förvaras säkert. Inloggningssessioner,
  aktiva token och serverhemligheter ingår inte. Senare ändringar kan
  gå förlorade vid ett större driftfel.
- Exporten har en egen sida med fokus på rubriken. Kartan är dold och
  dess kontroller går inte att nå med tangentbordet från exportsidan.
- Förberedelsen startar ingen nedladdning. En färdig export visar en
  sluttid och kan hämtas med tangentbordet.
- Webbläsaren erbjuder en ZIP-fil först efter att hela filen tas emot.
  Meddelandet säger att webbläsarens nedladdning startar; kontrollen av
  den sparade filen återstår för användaren.
- Arkivet går att öppna och innehåller hushållets gemensamma och privata
  uppgifter. Knappen för samma hämtning försvinner.

### EXPORT-02: Avbryt en förberedd export och börja om

**Syfte:** Kontrollera att avbrott lämnar hushållets innehåll kvar och
att en ny export kan förberedas.

**Användare:** Alex som administratör.

**Förutsättningar:** Inställningar → Fullständig export är öppen.
Ett eget nytt objekt ligger i Alex utkast utan gemensamt sparande.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-02: an administrator cancels an export and prepares
another”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-02"
  },
  "reference": "Dator, administratör; isolerad installation med kontrollerad inloggning",
  "outcomes": [
    "Avbrott erbjuder ingen fil och en ny export fungerar utan ändrat utkast"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Förbered fullständig export** och vänta tills den är klar.
2. Välj **Avbryt export** och kontrollera beskedet.
3. Förbered en ny export och hämta ZIP-filen. Kontrollera att samma
   gemensamma innehåll finns kvar i Tabell. Öppna **Visa utkastet** och
   kontrollera det egna osparade förslaget.

**Förväntat resultat:**

- **Exporten har avbrutits** visas. Den gamla hämtknappen försvinner
  och ingen fil laddas ned vid avbrottet.
- En ny förberedelse och hämtning fungerar. Hushållets uppgifter ändras
  inte av exporten eller avbrottet.

### EXPORT-03: Avbruten hämtning kräver en ny export

**Syfte:** Kontrollera att anslutningsfel inte visas som en lyckad
nedladdning och att användaren kan försöka igen.

**Användare:** Alex som administratör.

**Förutsättningar:** En export är färdig. Webbläsarens nätverksverktyg
är öppna. Integrationstestet bryter motsvarande hämtning vid nätverket.

**Separat operatörsförberedelse:** Efter användarens läsning av den
färdiga exporten i steg 1, före **Hämta ZIP-fil**, sätter operatören
webbläsarens nätverk till frånkopplat och bekräftar det. Behåll felet
tills användaren har läst anslutningsfelet, utebliven fil och borttagen
gammal hämtknapp. Återställ därefter nätverket och bekräfta det före
**Förbered fullständig export** i steg 3. Återställ även vid avbrutet
prov. Detta provar hämtning av en färdig export; det är inte ett tappat
sparkvitto eller en avbruten ström med olästa arkivbyte.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-03: an interrupted download offers a new export without
reporting success”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-03"
  },
  "reference": "Dator, administratör; isolerad installation med kontrollerad inloggning",
  "outcomes": [
    "Anslutningsfel visas utan nedladdning och ny export fungerar"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Läs att exporten är klar att hämta. Be operatören bryta anslutningen
   och invänta bekräftelse före **Hämta ZIP-fil**.
2. Välj **Hämta ZIP-fil** och kontrollera felmeddelandet och testmappen.
3. Kontrollera att ingen fil hämtas och att den gamla hämtknappen
   försvinner. Be operatören återställa anslutningen och invänta bekräftelse.
   Välj **Förbered fullständig export** och hämta
   den nya filen.

**Förväntat resultat:**

- Felet ber användaren kontrollera anslutningen och förbereda en ny
  export. Ingen fil eller lyckad nedladdning erbjuds efter felet.
- Den gamla hämtknappen försvinner. En ny förberedelse ersätter felet
  och kan följas av en komplett ZIP-fil.

### EXPORT-04: Ändrad administratörsroll stoppar en färdig export

**Syfte:** Kontrollera att en färdig export kräver aktuell
administratörsroll när filen hämtas.

**Användare:** Alex och Robin som administratörer i separata profiler.

**Förutsättningar:** Alex har en färdig export. Robin kan ändra Alex roll.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-04: a changed administrator role blocks export and
clears the ready download”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-04"
  },
  "reference": "Dator, administratör; isolerad installation med kontrollerad inloggning",
  "outcomes": [
    "Ändrad roll före hämtning nekar export och bevarar medlemstillgång"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Behåll Alex färdiga export öppen i profil A.
2. Välj **Gör till medlem** för Alex som Robin i profil B.
3. Återgå till Alex profil. Om **Hämta ZIP-fil** fortfarande visas,
   välj den direkt. Annars kontrollera att exportflödet redan stängs.
4. Ladda om exportadressen som Alex och kontrollera tillgången.

**Förväntat resultat:**

- Ingen ZIP-fil erbjuds efter rolländringen. Den färdiga exporten och
  dess knappar försvinner när den ändrade tillgången upptäcks.
- Alex kan fortfarande använda hushållets karta som medlem men inte
  förbereda eller hämta fullständig export.

### EXPORT-05: Utgången export kräver ny förberedelse

**Syfte:** Kontrollera att en passerad sluttid inte lämnar en användbar
hämtknapp och att en ny export kan göras.

**Användare:** Alex som administratör.

**Förutsättningar:** En export är färdig. Integrationstestet ger ett
svar om utgången export; serverns tidsgräns kontrolleras separat.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-05: an expired export requires a new preparation”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-05"
  },
  "reference": "Dator, administratör; isolerad installation med kontrollerad inloggning",
  "outcomes": [
    "Utgången export erbjuder ingen fil och en ny förberedelse fungerar"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Anteckna sluttiden och låt sidan vara öppen utan att hämta filen.
   Vänta tills tio minuter har gått och den visade tiden passerar.
2. Välj **Hämta ZIP-fil** efter sluttiden. Kontrollera beskedet och
   att den gamla hämtknappen försvinner.
3. Förbered och hämta en ny export.

**Förväntat resultat:**

- Ett besked visar att exporten har gått ut. Den gamla hämtknappen
  försvinner och ingen fil erbjuds för den utgångna exporten.
- En ny förberedelse får en ny giltighetstid och kan hämtas.

## Historiskt och privat innehåll

### EXPORT-06: Bevara objekt, bildversioner och privat utkast

**Syfte:** Hämta en verklig webbläsarfil efter bildförslag, historikläsning
och omstart. Identitet och kontrollsummor har separat tekniskt underlag.

**Användare:** Alex som administratör.

**Förutsättningar:** Ett nytt isolerat hushåll med tom karta. Två små
provbilder med olika motiv finns på datorn. Ingen röst eller AI behövs.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
EXPORT-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-06"
  },
  "reference": "Dator, administratör; isolerad installation med kontrollerad inloggning",
  "outcomes": [
    "Bildförslagets nya bild går att läsa efter omstart och webbläsaren erbjuder exportfilen",
    "Bildsparandets historik går att läsa före nästa privata bildförslag"
  ],
  "evidence": [
    {
      "kind": "technical",
      "spec": "tests/integration/household-export-content.spec.ts",
      "title": "technical: a full archive preserves object identities and saved, historical and private image versions",
      "purpose": "Separat arkivinnehåll och kontrollsummor"
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Tabell. Skapa två objekt som heter **Lo Exempel**, med
   beskrivningarna **Första objektet** och **Andra objektet**.
   Välj den första provbilden på det andra objektet under
   **Livscykel och utseende → Profilbild**. Lägg båda i utkastet och
   välj **Spara hela utkastet**. Vänta på sparbekräftelsen.
2. Redigera det första objektet. Kontrollera dess beskrivning så att samma
   namn inte blandar ihop objekten. Välj samma provbild, lägg i utkastet
   och spara hela utkastet. Öppna **Rapporter**, fäll ut det senaste
   sparandets **Visa ändringarna** och kontrollera objektets namn och bild.
3. Stäng Rapporter. Redigera det första objektet och välj den andra bilden.
   Lägg i utkastet och lämna förslaget osparat.
4. Låt den driftansvariga starta om samma installation och ladda om sidan.
   Öppna **Visa utkastet → Visa förslaget: Lo Exempel**. Kontrollera att
   **Föreslagna värden** visar den andra provbilden från steg 3. Stäng
   läsningen utan att spara förslaget.
5. Öppna **Inställningar → Fullständig export**. Välj
   **Förbered fullständig export**, vänta på klarbeskedet och välj
   **Hämta ZIP-fil**. Spara den erbjudna filen i den privata testmappen.

**Förväntat resultat:**

- Bildsparandets historik går att läsa och ett senare bildförslag finns
  kvar efter omstart utan att bli gemensamt sparat.
- Webbläsaren erbjuder en ZIP-fil och sidan visar startad nedladdning.
  Exakta identiteter, sparkvitto, placeringar, bildintervall och kontrollsummor
  verifieras separat av arkivtestet; de är inga UI-kontroller.

## Ändrad tillgång under hämtning

### EXPORT-07: Återkallad tillgång avbryter pågående hämtning

**Syfte:** Både rolländring och återkallat medlemskap avbryter en aktiv
webbläsarhämtning utan att erbjuda en komplett privat ZIP-fil.

**Användare:** Robin hämtar som administratör; Alex ändrar tillgången
som den andra administratören i ett separat webbläsarfönster.

**Separat förberedelse:** Starta
[webbläsarförberedelsen](#styrd-export-i-webbläsaren).
Den skapar de två fönstren och ett stort arkiv i en ny Linux-installation.
Serverkällan måste ha olästa byte när terminalen skriver `paused`.
Den tekniska HTTP-kontrollklienten nedan är ytterligare underlag.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
EXPORT-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-07"
  },
  "reference": "Linux, två administratörer; demotion och återkallelse under aktiv verklig HTTP-ström",
  "outcomes": [
    "Aktiv hämtning avbryts efter både rolländring och återkallelse utan erbjuden ZIP-fil"
  ],
  "evidence": [
    {
      "kind": "technical",
      "spec": "tests/integration/household-export-content.spec.ts",
      "title": "technical: revocation or demotion interrupts an active download and removes its private copy",
      "purpose": "Separat hållen HTTP-ström, ofullständiga byte och rensad privat kopia"
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före Hämta ZIP-fil i UI-steg 1: skriv `arm-stream` i terminalen
och bekräfta installationen. Efter hämtknappen: invänta `paused` och
kräv guidens olästa byte i serverns arkivkälla. Meddela **Verklig
aktiv ström hålls före slut och giltighetstidens utgång**. Behåll
strömmen genom Alex faktiska rolländring. Först i steg 2: skriv
`release` och meddela **Samma ström är släppt efter rolländringen**.
Vid upprepningen i steg 3: arma och bekräfta en ny faktisk ström på
samma sätt; skriv `release` först efter bekräftad återkallelse.
Kontrollera guidens avbrott och giltighetstid separat.
Använd [styrd export i webbläsaren](#styrd-export-i-webbläsaren), samma
provinstallation och dess två verifierade fönster. Avsluta med `quit`
och kontrollera städningen efter fallet; radera separat sparade ZIP-filer.

**Steg:**

1. Förbered exporten i Robins exportfönster. Be operatören förbereda aktiv ström
   och invänta installationen. Välj **Hämta ZIP-fil** och invänta operatörens
   bekräftelse av verkligt hållen aktiv ström. Kontrollera att sidan visar
   **Hämtar och kontrollerar ZIP-filen…**.
2. Välj **Gör till medlem** för Robin i Alex administrationsfönster. Be
   operatören släppa samma ström och invänta bekräftelse. Kontrollera Robins
   felbesked och att ingen ZIP-fil erbjuds. Ladda om Robins sida och kontrollera
   att administrationen nekas.
3. Gör Robin till administratör igen genom Alex administrationssida. Öppna
   exportadressen i Robins fönster. Upprepa steg 1, välj sedan **Återkalla
   tillgång** och **Bekräfta återkallelse** som Alex. Be operatören släppa samma
   ström och invänta bekräftelse. Kontrollera felet och avsaknaden av fil igen.
4. Ladda om Robins sida. Kontrollera att hushållstillgången nekas. Be operatören
   avsluta förberedelsen och invänta bekräftelse. Radera eventuella testfiler.

**Förväntat resultat:**

- Båda åtkomständringarna avbryter den aktiva serveröverföringen.
  Webbläsaren visar anslutningsfel, tar bort den gamla hämtknappen och
  erbjuder ingen komplett ZIP-fil eller lyckad nedladdning.
- En medlem kan inte administrera hushållet; efter återkallelse kan Robin
  inte heller läsa kartan. EXPORT-04 skyddar den andra gränsen, där
  åtkomsten ändras före en förberedd hämtning startar.
- Automatiken och kontrollklienten verifierar separat ofullständiga byte,
  nekad ny hämtning och borttagen serverkopia. Data som redan har lämnat
  servern eller finns i nätverksbuffertar kan inte återkallas.

### EXPORT-08: Avbryt förberedelsen innan svaret kommer fram

**Syfte:** Skilj avbruten förberedelse i webbläsaren från bekräftad
borttagning av en färdig tillfällig kopia.

**Användare:** Alex som administratör.

**Förutsättningar:** Ett gemensamt objekt finns i kartan. Skapa dessutom
**Privat förslag** med beskrivningen **Förslaget ska finnas kvar** genom
**Nytt objekt → Lägg i utkastet och stäng**. Spara inte hela utkastet.

**Separat förberedelse:** Använd
[webbläsarförberedelsen](#styrd-export-i-webbläsaren) och skriv `arm-ready`.
Vänta på terminalens `held` efter steg 1; servern har då skapat arkivet
men svaret har ännu inte nått webbläsaren.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-08: canceling preparation with an unseen ready response
explains cleanup uncertainty”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-08"
  },
  "reference": "Dator, administratör; isolerad installation med kontrollerad inloggning",
  "outcomes": [
    "Avbruten förberedelse visar oklar rensning och sent svar återöppnar inte exporten",
    "Gemensamt objekt och osparad beskrivning går att läsa genom browsern efter avbrott och ny export"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Behåll fallets separat förberedda `arm-ready` före UI-steg 1.
Efter Förbered fullständig export: invänta terminalens `held` och
meddela **Arkivet är förberett och samma färdiga svar hålls**.
Behåll svaret genom användarens verkliga avbrott i steg 2. Först
i steg 3: skriv `release` i terminalen och meddela **Samma äldre
svar är släppt efter avbrottet**.
Använd [styrd export i webbläsaren](#styrd-export-i-webbläsaren), samma
provinstallation och dess två verifierade fönster. Avsluta med `quit`
och kontrollera städningen efter fallet; radera separat sparade ZIP-filer.

**Steg:**

1. Välj **Förbered fullständig export** och kontrollera väntemeddelandet.
   Invänta operatörens bekräftelse att samma färdiga svar hålls.
2. Innan svaret kommer fram, använd tangentbordet till **Avbryt export**.
3. Läs beskedet och be operatören släppa samma färdiga svar. Invänta
   bekräftelse. Kontrollera att ingen fil erbjuds från det avbrutna försöket.
4. Förbered en ny export och hämta ZIP-filen. Kontrollera att hushållets
   gemensamma objekt finns kvar i Tabell. Öppna **Visa utkastet → Visa
   förslaget: Privat förslag** och kontrollera den osparade beskrivningen. Stäng
   läsningen utan att spara eller kasta förslaget.

**Förväntat resultat:**

- Förberedelsen är avbruten i webbläsaren. Beskedet förklarar att en
  tillfällig kopia kan finnas kvar tills giltighetstiden går ut.
- Ett sent svar återöppnar inte den avbrutna exporten. Nästa förberedelse
  ersätter den tidigare kopian och erbjuder en ny fungerande hämtning.
- Avbrottet eller exporten ändrar inte hushållets innehåll.

### EXPORT-09: Tangentbord, tema och bevarat kartarbete

**Syfte:** Behålla användbart fokus genom exporten och återgå till
utkastet utan att hushållets karta ändras. Oskickad text skyddas vid stängning.

**Användare:** Alex som administratör.

**Förutsättningar:** 1280 × 900 CSS-pixlar, ljust och mörkt tema, minskad
rörelse. Referensen skyddar tangentbordsfokus på dator. Övriga bredder
har egna fall EXPORT-12–14. Ett gemensamt objekt finns i kartan.

**Separat förberedelse:** Använd
[webbläsarförberedelsen](#styrd-export-i-webbläsaren). Skriv `arm-ready`
före steg 5. Svaret ska hållas först efter serverns färdiga förberedelse.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
EXPORT-09 vid 1280 × 900 CSS-pixlar.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-09"
  },
  "reference": "1280 × 900 CSS-pixlar; båda teman för fokus och nåbarhet",
  "outcomes": [
    "Båda teman bevarar fokus och skyddar oskickat formulärarbete"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Före den sista förberedelsen i UI-steg 5: skriv `arm-ready` och
bekräfta installationen. Efter den verkliga förberedelsen: invänta
terminalens `held` och meddela **Samma färdiga svar hålls**. Behåll
svaret tills användaren med Tab fokuserat Tillbaka till kartan utan
att aktivera länken. Skriv först då `release` i terminalen och meddela
**Samma färdiga svar är släppt**, utan att ändra användarens fokus.
Använd [styrd export i webbläsaren](#styrd-export-i-webbläsaren), samma
provinstallation och dess två verifierade fönster. Avsluta med `quit`
och kontrollera städningen efter fallet; radera separat sparade ZIP-filer.

**Steg:**

1. Välj **Nytt objekt** och skriv namn och beskrivning. Tryck Escape och
   **Fortsätt redigera**. Kontrollera båda värdena och fokus i beskrivningen.
   Tryck Escape igen och välj **Kasta ändringarna och fortsätt**. Det privata
   utkastet ska vara oförändrat.
2. Öppna Inställningar och Fullständig export. På mobil, fäll först ut Välj
   inställning. Kontrollera att exportens fokuserade rubrik syns även efter att
   navigationen fälls ihop.
3. Använd tangentbordet för att förbereda en export. Kontrollera fokus på Hämta
   ZIP-fil när filen blir klar. Avbryt med tangentbordet och kontrollera fokus
   på Förbered fullständig export.
4. Upprepa med det andra temat. Kontrollera läsbar text, synligt fokus,
   åtkomliga knappar och att sidan inte behöver rullas i sidled.
5. Be operatören förbereda nästa hållna svar och invänta installationen.
   Förbered exporten igen och invänta operatörens bekräftelse av hållet färdigt
   svar. Flytta med Tab fokus till **Tillbaka till kartan** och låt länken vara
   fokuserad utan att aktivera den. Tryck inte Enter och klicka inte på länken.
   Be operatören släppa samma svar först efter detta fokusval och invänta
   bekräftelse. Kontrollera att svaret låter fokus vara kvar på länken och att
   exportsidan fortfarande är öppen.
6. Hämta ZIP-filen med tangentbordet. Kontrollera fokus på knappen för ny
   förberedelse och återgå sedan till kartan.

**Förväntat resultat:**

- Förberedelse, avbrott och hämtning lämnar fokus på nästa användbara
  exportkontroll. Ett senare eget fokusval skrivs inte över.
- Kartans kontroller är dolda i Inställningar. Vid återgång finns namn
  och beskrivning inte kvar från det kastade formuläret. Öppna **Nytt
  objekt** och kontrollera tomma fält. Ingenting är sparat.
- Den hämtade filen innehåller hushållets sparade information och privata
  utkast. Oskickad text i formulär är ännu inte del av exporten.

### EXPORT-10: Återimportera den hämtade filen och kontrollera efter omstart

**Syfte:** Kontrollera att ZIP-filen som webbläsaren hämtar är användbar
för fullständig återimport av gemensamma, privata och historiska uppgifter.

**Användare:** Alex som administratör.

**Förutsättningar:** Använd ett separat testhushåll som får ersättas.
Förbered två objekt och ett samband med egna fält för text, tal, datum
och ja/nej. Ange bland annat noll och nej. Ordna beskrivning och egna fält
i typavsnitt, dölj ett eget fält och en osäkert uppgiven skuld med datum.
Spara uppgifterna och två olika profilbilder i separata sparanden.
Lägg därefter ett nytt objekt i det privata utkastet utan att spara det
gemensamt. Flytta ett objekt personligen och slå på bakgrunden.
Anteckna innehåll, bildversioner, historik, utkast och användarnas roller.
En driftansvarig ska kunna starta om testinstallationen.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-10: the downloaded current-format archive restores shared,
private and historical content after restart”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-10"
  },
  "reference": "Dator, administratör; isolerad installation med kontrollerad inloggning",
  "outcomes": [
    "Hämtad fil återimporteras och fortsatt arbete kan sparas efter omstart"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Inställningar och Fullständig export. Förbered och hämta ZIP-filen.
   Spara filen i testmappen. Arkivformat, hemligheters frånvaro och
   objektidentiteter verifieras separat i automatiken.
2. Ändra ett gemensamt objektnamn och spara hela utkastet. Anteckna det nya
   namnet så att det går att skilja den nuvarande kartan från exporten.
3. Öppna **Inställningar → Återimportera hushållet** och välj den hämtade
   filen. Kontrollera filen. Kontrollera att den nya
   kartan är kvar och att ersättningsknappen kräver uttrycklig bekräftelse.
4. Markera bekräftelsen och välj Ersätt hushållets innehåll.
   Kontrollera beskedet om ersättning och bevarad åtkomst.
5. Låt den driftansvariga starta om testinstallationen och ladda om sidan.
   Återgå till Tabell och kontrollera ursprungsnamnet. Öppna utkastet
   och kontrollera det återställda privata förslaget.
6. Skapa **Fortsatt arbete efter återimport**, lägg i utkastet och
   granska det tillsammans med det återställda förslaget. Spara hela
   utkastet, vänta på sparbekräftelsen och ladda om. Kontrollera båda
   objektens namn i Tabell.

**Förväntat resultat:**

- Den hämtade filen går att återimportera. Ursprungliga namn, samband,
  typavsnitt, ordning, egna värden, noll, nej och dolda uppgifter består.
- Historiken och båda bildversionerna finns kvar. Det privata förslaget
  återkommer i utkastet och blir inte gemensamt före det nya uttryckliga
  sparandet i steg 6.
- Personliga placeringar och bakgrundsval består efter omstart. Nuvarande
  användare och roller behåller sin åtkomst.
- Återställt och nytt arbete går att spara tillsammans och läsa efter
  omladdning. Den tidigare gemensamma kartan finns kvar.

### EXPORT-11: Lämna en färdig export före hämtningen

**Syfte:** Kontrollera att sidbyte avbryter exporten utan att kasta
privata förslag eller erbjuda en sen fil. Oskickad text skyddas vid stängning.

**Användare:** Alex som administratör.

**Förutsättningar:** Hushållet har ett sparat objekt. Exporten lämnas
innan filhämtningen börjar. EXPORT-15 skyddar sidbyte under svarleverans;
EXPORT-07 skyddar aktiv serveröverföring efter ändrad tillgång.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
EXPORT-11.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-11"
  },
  "reference": "Dator, administratör; isolerad installation med kontrollerad inloggning",
  "outcomes": [
    "Sidbyte före hämtning avbryter exporten utan ändrad karta"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Nytt objekt** och skriv namn och beskrivning. Tryck Escape
   och **Fortsätt redigera**. Kontrollera båda värdena och fokus i
   beskrivningen. Tryck Escape igen och bekräfta **Kasta ändringarna
   och fortsätt**. Det privata utkastet ska vara oförändrat.
2. Öppna Inställningar och Fullständig export. Förbered en export.
3. Välj Tillbaka till kartan innan hämtningen startar. Kontrollera att
   det kastade formuläret är stängt och det privata utkastet finns kvar
   utan nedladdning.
4. Öppna Fullständig export igen. Kontrollera att ingen tidigare hämtning
   eller resultat visas. Förbered och hämta en ny export.

**Förväntat resultat:**

- Avbruten stängning bevarar oskickade värden och fokus; bekräftad
  stängning kastar endast dem. Exporten ändrar inte kartan
  eller det privata utkastet och skapar inget sparande.
- Ingen fil erbjuds efter sidbytet. Den kända exportens avbrott bekräftas
  och samma kopia kan inte hämtas. EXPORT-15 kontrollerar sena ZIP-svar.
- Återbesöket börjar med en ny förberedelse. Dess ZIP-fil innehåller det
  sparade innehållet; den oskickade redigeringen är ännu inte del av utkastet.

### EXPORT-12: Tangentbord och export vid 390 × 900 CSS-pixlar

**Syfte:** Skydda mobilnavigationens hopfällning och synligt fokus.

**Användare:** Administratören i exportfönstret.

**Förutsättningar:** Samma data och separata förberedelse som EXPORT-09.
Ställ in 390 × 900 CSS-pixlar i webbläsarens responsiva läge.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
EXPORT-12.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-12"
  },
  "reference": "390 × 900 CSS-pixlar; båda teman för mobilnavigation och fokus",
  "outcomes": [
    "Mobilnavigation och fokus fungerar vid 390 CSS-pixlar i båda teman"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför EXPORT-09 steg 1–6 en gång vid denna storlek, inklusive båda
   teman och den fördröjda förberedelsen. Vid steg 2, fäll ut
   **Välj inställning** före sidvalet och kontrollera att navigationen
   fälls ihop med exportens fokuserade rubrik fortfarande synlig.
   Under steg 3–4 ska hämtknappen vara nåbar och sidan rymmas utan
   sidledsrullning. Vid steg 6 ska nya objektfält vara tomma.

**Förväntat resultat:**

- Samma fokus, avbrott, hämtning och oförändrade karta som i EXPORT-09.
- Mobilnavigationens hopfällning och synligt fokus fungerar i båda teman.
  CSS-storleken är automatiserat underlag; den bevisar inte fysisk touch.

### EXPORT-13: Tangentbord och export vid 320 × 900 CSS-pixlar

**Syfte:** Skydda omflöde och nåbara exportknappar vid den smalaste bredden.

**Användare:** Administratören i exportfönstret.

**Förutsättningar:** Samma data och separata förberedelse som EXPORT-09.
Ställ in 320 × 900 CSS-pixlar i webbläsarens responsiva läge.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
EXPORT-13.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-13"
  },
  "reference": "320 × 900 CSS-pixlar; båda teman för smalt omflöde",
  "outcomes": [
    "Omflöde och exportknappar fungerar vid 320 CSS-pixlar i båda teman"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför EXPORT-09 steg 1–6 en gång vid denna storlek, inklusive båda
   teman och den fördröjda förberedelsen. Vid steg 2, fäll ut
   **Välj inställning** före sidvalet och kontrollera att navigationen
   fälls ihop med exportens fokuserade rubrik fortfarande synlig.
   Under steg 3–4 ska hämtknappen vara nåbar och sidan rymmas utan
   sidledsrullning. Vid steg 6 ska nya objektfält vara tomma.

**Förväntat resultat:**

- Samma fokus, avbrott, hämtning och oförändrade karta som i EXPORT-09.
- Omflöde och nåbara exportknappar vid den smalaste bredden fungerar i båda teman.
  CSS-storleken är automatiserat underlag; den bevisar inte fysisk touch.

### EXPORT-14: Tangentbord och export vid 640 × 500 CSS-pixlar

**Syfte:** Skydda rubrik och exportkontroller i ett kort fönster.

**Användare:** Administratören i exportfönstret.

**Förutsättningar:** Samma data och separata förberedelse som EXPORT-09.
Ställ in 640 × 500 CSS-pixlar i webbläsarens responsiva läge.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
EXPORT-14.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-14"
  },
  "reference": "640 × 500 CSS-pixlar; båda teman för kort fönster",
  "outcomes": [
    "Kort fönster behåller fokus och nåbara knappar i båda teman"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför EXPORT-09 steg 1–6 en gång vid denna storlek, inklusive båda
   teman och den fördröjda förberedelsen. Vid steg 2, fäll ut
   **Välj inställning** före sidvalet och kontrollera att navigationen
   fälls ihop med exportens fokuserade rubrik fortfarande synlig.
   Under steg 3–4 ska hämtknappen vara nåbar och sidan rymmas utan
   sidledsrullning. Vid steg 6 ska nya objektfält vara tomma.

**Förväntat resultat:**

- Samma fokus, avbrott, hämtning och oförändrade karta som i EXPORT-09.
- Rubrik och exportkontroller i ett kort fönster fungerar i båda teman.
  CSS-storleken är automatiserat underlag; den bevisar inte fysisk touch.

### EXPORT-15: Lämna hämtningen innan ett färdigt svar levereras

**Syfte:** Ett sent ZIP-svar ska inte erbjuda en fil efter sidbytet.

**Användare:** Administratören i exportfönstret.

**Förutsättningar:** Samma data som EXPORT-11.

**Separat förberedelse:** Använd
[webbläsarförberedelsen](#styrd-export-i-webbläsaren). Skriv `arm-response`
före hämtningen i steg 3. Det verkliga ZIP-svaret buffras och leveransen
hålls; detta är skilt från serverns aktiva ström i EXPORT-07.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
EXPORT-15.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-export-ui.spec.ts",
    "caseId": "EXPORT-15"
  },
  "reference": "Dator; buffrat verkligt ZIP-svar hålls efter serverns slutförda överföring",
  "outcomes": [
    "Sen ZIP-leverans efter sidbyte erbjuder ingen fil och ny export fungerar"
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Behåll fallets `arm-response` före Hämta ZIP-fil i grundfallets
UI-steg 3. Efter hämtningen: invänta terminalens `held` och meddela
**Samma färdiga ZIP-svar hålls**. Detta är buffrad slutförd hämtning,
skild från EXPORT-07:s olästa serverbyte. Behåll svaret genom det
verkliga sidbytet. Skriv `release` efter sidbytet, före återbesöket
i grundfallets steg 4, och meddela **Samma äldre ZIP-svar är släppt**.
Använd [styrd export i webbläsaren](#styrd-export-i-webbläsaren), samma
provinstallation och dess två verifierade fönster. Avsluta med `quit`
och kontrollera städningen efter fallet; radera separat sparade ZIP-filer.

**Steg:**

1. Utför EXPORT-11 steg 1–4 en gång med följande kontroller under flödet. Vid
   steg 3 väljer du först **Hämta ZIP-fil**. Invänta operatörens bekräftelse av
   hållet färdigt ZIP-svar och sidans **Hämtar och kontrollerar ZIP-filen…**,
   och välj sedan **Tillbaka till kartan**. Be operatören släppa samma äldre
   svar efter sidbytet och invänta bekräftelse före återbesöket i grundfallets
   steg 4. Kontrollera att det sena svaret inte erbjuder en fil. Fortsätt sedan
   steg 4 med en ny förberedelse och en fungerande hämtning.

**Förväntat resultat:**

- Det kastade formuläret är stängt, kartan och utkastet är oförändrade.
- Ingen fil erbjuds från den lämnade exporten, även efter det sena svaret.
  En ny förberedelse erbjuder en fungerande ZIP-fil.

## Identiteter och separat arkivunderlag

EXPORT-01–11 behåller sina identiteter. EXPORT-12–14 identifierar de tre
övriga breddfallen från EXPORT-09; EXPORT-15 identifierar svarleveransen
från EXPORT-11. Inga exportfall eller ursprungliga kontroller tas bort.

Arkivets identiteter, sparkvitto, bildversioner, byteintervall,
kontrollsummor, privata utkast och personliga placeringar kontrolleras av
det separat märkta tekniska testet i
[household-export-content.spec.ts](../../tests/integration/household-export-content.spec.ts).
Det andra tekniska testet behåller HTTP-strömmens avbrott efter både
rolländring och återkallelse, nekad ny hämtning och tom serverkatalog.
Det är ytterligare underlag till EXPORT-06/07, inte deras UI-motsvarigheter.
EXPORT-10 är dessutom arkivunderlag till TEXTBREDD-05; dess egen vanliga
motsvarighet är fortfarande EXPORT-10.

## Styrd export i webbläsaren

Bygg först. Kör i Linux med grafisk skrivbordsmiljö:

```sh
npm run build
npm run test:env -- node --import tsx scripts/manual-export-browser.ts
```

`--chrome` väljer installerad Chrome; utan flaggan används Playwrights
Chromium. `--headless` är endast till för automatisk förberedelsekontroll.
Kontrollera förberedelsens tre styrningar och städning utan mänsklig
observation med:

```sh
npm run test:env -- node --import tsx scripts/manual-export-browser.ts \
  --headless --smoke
```

Kräv `smoke-passed`, `closed` och att den tryckta testkatalogen försvinner.
Förberedelsen skapar en ny privat testkatalog, två inloggade fönster och
100 stora syntetiska bildversioner. Inga riktiga provideranrop görs.
Vänta på `ready`. Alex visar administrationen; Robin visar exporten.
I EXPORT-08/09/12–15 arbetar Robin i exportfönstret som administratör i
stället för Alex. Rollgränsen är densamma.

För de fallen skapar du först ett gemensamt objekt via kartans vanliga
**Nytt objekt → Lägg i utkastet och stäng → Spara hela utkastet**.
Återgå till exporten. Välj en ny körning för varje fall så att inget
tidigare utkast eller kvarvarande export används.

- `arm-stream` styr nästa browserhämtning genom en riktig HTTP-ström.
  Efter första datadelen pausas läsningen. `paused` kräver att Linux visar
  olästa byte i serverns arkivkälla; det är ingen vanlig offlineförberedelse.
  Ändra åtkomsten direkt, väl före exportens tio minuters giltighetstid.
  `completed` ska visa `interrupted: true` och `beforeExpiry: true` efter
  åtkomständringen; ett avbrott efter sluttiden är inte giltigt underlag.
- `arm-ready` håller nästa verkliga förberedelsesvar efter serverns
  transaktion. `held` visar att arkivet finns innan leveransen stoppas.
- `arm-response` håller nästa färdiga ZIP-svar efter verklig serverhämtning.
  Det simulerar sen leverans, inte olästa byte i serverns källfil.
- `release` levererar det hållna svaret eller fortsätter strömläsningen.
- `quit` stänger browserfönstren och raderar den tryckta testkatalogen.
  Radera separat eventuella ZIP-filer som du sparar på datorn.

Armera bara en kontroll åt gången. Om `error` visas, eller ingen `paused`
kommer efter hämtningen, räknas det inte som en aktiv-ström-kontroll.
Avsluta och starta en ny körning. Den äldre HTTP-förberedelsen nedan
kan köras separat som tekniskt underlag utan ett browserresultat.

## Controlled export fixture

This disposable Linux fixture prepares
[EXPORT-07](household-export.md#export-07-återkallad-tillgång-avbryter-pågående-hämtning).
It runs the actual application, authentication, SQLite and HTTP export
stream. Only external Google/Microsoft responses use the existing controlled
test identities. It does not test live provider login. It accepts no origin,
database path, credentials or production configuration.

### Start the isolated application

From the repository root in the devcontainer, use Node.js 24 and run:

```sh
npm ci
npm run build
node --import tsx scripts/manual-export.ts
```

Keep this terminal open. The launcher creates a new private directory under
`/tmp`, starts the app on a random loopback port and establishes Alex and
Robin through the normal public authentication callbacks. It creates Linden,
invites Robin, accepts the invitation and makes Robin an administrator
through public HTTP. The fixture adds 100 retained synthetic lossless image
versions containing random pixels, matching the automated export fixture.
The exported ZIP must exceed 16 MiB; compressible solid-color images would
not provide the required transfer size.

Wait for the JSON line whose `event` is `ready`. It gives `origin`,
`administrationUrl`, `directory` and `scratchDirectory`. No session cookies
or provider tokens are printed or written to a client credential file.
If using VS Code port forwarding, forward the printed port to the same
number on the host and open the exact `http://127.0.0.1:PORT` address.
Use a fresh browser profile and **Fortsätt med Google** to enter as the
controlled Alex. Open the printed `administrationUrl`. The HTTP reader is
already signed in as the controlled Robin in a separate session.

This is separate technical evidence for EXPORT-07. Its HTTP reader does
not perform that case's browser download. After `pause` and `inspect`, use
Alex's administration page to choose **Gör till medlem** for Robin, then
use `resume` and inspect the result. Restore Robin with **Gör till
administratör** and repeat `pause` and `inspect`, this time choosing
**Återkalla tillgång → Bekräfta återkallelse** before `resume`.
Do not start extra exports or another app on this fixture database.
This preparation is not a manual test result.

### Reader controls and evidence

Type these commands in the launcher's terminal, one at a time:

```text
pause
inspect
resume
quit
```

`pause` prepares a fresh export as Robin and opens its real HTTP response.
It consumes one chunk and then stops reading. It samples the server's open
archive file position through Linux `/proc/self/fdinfo` until that position
stops advancing. The `paused` event must show:

- `archiveBytes` greater than `16777216`;
- `receivedBytes` greater than zero;
- `sourceReadBytes` at least `receivedBytes` and less than `archiveBytes`;
- `active: true`, with an `expiresAt` still in the future.

These measurements show unread bytes in the server's source file, not just
a browser request that appears pending. `inspect` repeats the measurement
without consuming more of the response. Run it immediately before changing
access as Alex. A missing source, `active: false` or an `error` event is not
valid evidence: quit and start a fresh fixture instead of recording a pass.

Complete each role-change check well before the displayed expiry, normally
within a minute. Exports expire after ten minutes, which would otherwise
confound the access-change result. Do not use browser throttling.

After changing access, `resume` drains the response and reports `result`.
Require `receivedBytes < archiveBytes`, `interrupted: true`,
`beforeExpiry: true`, `scratchEmpty: true` and `retryStatus: 403`.
The client counts bytes and never writes a ZIP. A complete response or any
other result is a failed check, not a successful interrupted transfer.
For the second run, restore Robin's administrator role through Alex's UI,
then use `pause` again; it creates a different export ID.

### Inspect the private server copy

Open a second terminal. Set this variable to the exact `directory` printed
by this launcher's `ready` event; do not use an ordinary database directory:

```sh
SKYTTEL_EXPORT_CASE_DIR='/tmp/skyttel-test-REPLACE-WITH-PRINTED-DIRECTORY'
ls -ld -- "$SKYTTEL_EXPORT_CASE_DIR/.skyttel-exports"
ls -l -- "$SKYTTEL_EXPORT_CASE_DIR/.skyttel-exports"/*/archive.zip
```

Run these commands while `pause` holds the stream open. The directory should
have private permissions (`drwx------`), and its one export subdirectory
contains `archive.zip`. Its size matches `archiveBytes`.

After **each** access change and `resume`, run this exact emptiness check.
It lists names only, never archive content or login data. Require `[]` and
exit status zero, while the `.skyttel-exports` directory itself still exists:

```sh
node -e 'const fs = require("node:fs");
const entries = fs.readdirSync(process.argv[1]);
console.log(JSON.stringify(entries));
if (entries.length) process.exitCode = 1;' \
  "$SKYTTEL_EXPORT_CASE_DIR/.skyttel-exports"
```

### Finish or reset

Type `quit` in the launcher terminal. Ctrl+C also requests shutdown. The
launcher closes the reader and server, removes its own temporary directory
and prints `closed`. Verify from the second terminal:

```sh
test ! -e "${SKYTTEL_EXPORT_CASE_DIR:?}" && printf '%s\n' 'Fixture removed'
unset SKYTTEL_EXPORT_CASE_DIR
```

Close the test browser profile and remove the forwarded port. No downloaded
ZIP or client credentials need cleaning. If the process is forcibly killed
instead of quitting, first ensure it is stopped. In the second terminal,
with the variable still set to its exact printed temporary directory, run:

```sh
rm -r -- "${SKYTTEL_EXPORT_CASE_DIR:?}"
unset SKYTTEL_EXPORT_CASE_DIR
```

Restart the launcher for a new case; it never reuses the previous database
or sessions.
