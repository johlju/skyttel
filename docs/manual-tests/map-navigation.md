# Manuella testfall för navigeringsfönstret

Fallen omfattar navigering, personlig objektflyttning, koordinatläsning,
samtidiga detaljer och nypzoom med styrplatta.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.
Fysiska enheter och skärmläsare provas och redovisas separat.

## Konfigurerade användare

Alex Exempel är inloggad medlem i ett separat provhushåll. Använd endast
påhittade uppgifter. Administratörsrollen behövs inte för kartarbetet.

## Allmän förberedelse

1. Starta en isolerad installation enligt
   [provförberedelsen](../development/devcontainer.md#disposable-local-database).
   Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor).
2. Skapa och spara objekten Lo Exempel och Kim Exempel. Börja varje fall
   med en omladdad karta och tomt urval.
3. Prova dator och telefon, även 390 och 320 pixlars bredd. Kontrollera
   också verklig webbläsarzoom, synligt fokus och minskad rörelse.

## Fönster och personlig vy

### NAVIGATION-20: Läs koordinater via tabellen i ljust datorläge

**Syfte:** Läs sparade och automatiska positioner med tangentbord utan
att placera objekten eller ändra sparade värdens precision.

**Användare:** Alex Exempel.

**Förutsättningar:** 1440 × 1000 CSS-pixlar och systemets ljusa tema.
Använd standardvalet **System** för Skyttels tema.

**Separat förberedelse:** Skapa och spara Lo Exempel och Kim Exempel.
Förbered ett samband **Lo Exempel → Använder → Kim Exempel** med vanliga
formulär. Kim ska sakna sparad personlig position. Förbered Los sparade
position före teststegen. Öppna hushållet och kör följande i webbläsarens
konsol för detta provhushåll:

```js
const household = location.pathname.split('/')[2];
const path = `/api/households/${household}/map`;
const map = await (await fetch(path)).json();
const view = await (await fetch(`${path}/view`)).json();
const lo = map.objects.find((object) => object.name === 'Lo Exempel');
const response = await fetch(`${path}/view/position`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: lo.id,
    contentVersion: map.contentVersion,
    version: view.positions.find((p) => p.id === lo.id)?.version ?? 0,
    position: { x: -10000, y: 1.23456789, z: -0.001 },
  }),
});
if (!response.ok) throw new Error(`Förberedelsen misslyckades: ${response.status}`);
location.reload();
```

Förväntad förberedelse är en sparad Lo-position och automatisk placering
för Kim. Återställ ett separat provhushåll inför nästa körning.

**Automatiskt motsvarande integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts),
NAVIGATION-20.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-20"
  },
  "reference": "Ljust systemtema, 1440 × 1000, förberedda positioner och samband.",
  "outcomes": [
    "Valet i tabellen följer med till Navigation och koordinaterna kan läsas.",
    "Hjälpen stängs med Escape och återkommer efter byte från miniläge.",
    "Sambandets båda objekt kan identifieras och deras koordinater nås via tabellen."
  ]
}
```
-->

**Steg:**

1. Öppna **Tabell**. Fokusera **Lo Exempel** och tryck Enter. Kontrollera
   **Markerad** i raden. Välj **Karta** och sedan **Navigera** med
   tangentbordet. Navigationens titelrad får fokus.
2. Läs **Sidled (X)**, **Höjd (Y)** och **Djup (Z)** i gruppen för
   Lo Exempel: **-10000.00**, **1.23** och **0.00**. Fälten ligger i en rad
   ovanför flyttknapparna. Fälten är redigerbara; behåll deras värden under
   läsprovet. Hela värdena ska gå att läsa vid normal textstorlek.
3. Fokusera **Om koordinater** bredvid **Ange position** och tryck Enter.
   Läs fasta axlar, att värdena inte är verkliga mått, inklusive gränser
   och tvådecimalers avrundning. Tryck Escape. Hjälpen stängs, Navigation
   är kvar och fokus stannar på infoikonen.
4. Öppna hjälpen igen och välj **Visa mininavigering**. Rubriken, infoikonen
   och hjälpen döljs. Fälten ligger i en kolumn i ordningen X, Y, Z.
   Fokusera och läs varje helt värde med tangentbordet. Fälten är fortfarande
   redigerbara. Välj
   **Visa normal navigering**. Den öppna hjälpen visas igen.
5. Välj **Stäng navigering**. Fokus återgår till **Navigera**. Öppna
   **Tabell** och **Samband för Lo Exempel**. Läs att sambandet går från
   Lo Exempel till Kim Exempel. Stäng med **Stäng samband**.
6. Välj **Kim Exempel** i tabellen med tangentbordet. Gå till **Karta**
   och **Navigera**. Läs Kims automatiska X/Y/Z med två decimaler i den
   namngivna gruppen. Stäng Navigation, välj Lo igen via tabellen och läs
   samma tre Lo-värden.

**Förväntat resultat:**

- Objektet förblir markerat vid vybytet. Läsbara, redigerbara fält, namn,
  fokus och hjälp fungerar i båda navigeringslägena. Vanlig markering
  flyttar inte kameran.
- Läsning flyttar inget objekt och sparar ingen ny placering. Ingen
  positionsinformation behöver läsas ur kartgrafiken.
- Sambandet har ingen egen koordinat; dess två objekts positioner nås
  genom vanliga objektval.

### NAVIGATION-21: Läs koordinater vid 320 pixlar i mörkt läge

**Syfte:** Behåll hela koordinatvärden, logisk fokusordning och åtkomlig
hjälp i normal- och miniläge på en smal skärm.

**Användare:** Alex Exempel.

**Förutsättningar och separat förberedelse:** Följ NAVIGATION-20:s
förberedelse. Använd 320 × 1000 CSS-pixlar och systemets mörka tema.
De korta dellägena använder 320 × 250 samt 701 × 500, 800 × 500 och
1000 × 500 CSS-pixlar med öppna objektuppgifter. Det första skyddar smala
fält bredvid uppgifterna; de övriga skyddar läsningen i liggande läge vid
dess gränsbredder och en mellanbredd.

**Automatiskt motsvarande integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts),
NAVIGATION-21.

<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-21"
  },
  "reference": "Mörkt: 320 × 1000/250, 701/800/1000 × 500. Uppgifter öppna.",
  "outcomes": [
    "Hela koordinater och namngivna kontroller är tillgängliga i normal- och miniläge.",
    "Val, fokus och öppen hjälp består vid läsning av båda ändpunkternas objekt."
  ]
}
```
-->

**Steg:** Följ NAVIGATION-20 steg 1–6 vid den angivna smala bredden.
Efter steg 4: ändra till 320 × 250. Fokusera Lo i kartan, tryck Skift+F10
och välj **Visa uppgifter för Lo Exempel**. Behåll uppgifterna öppna och
fokusera **Sidled (X)** i både normal- och miniläge. Läs hela värdet
**-10000.00** vid normal textstorlek. Rulla navigationens innehåll vid behov.
Kontrollera tre lodräta fält i miniläget. Ändra till 701 × 500,
800 × 500 och 1000 × 500 med uppgifterna kvar. Upprepa läsningen i
normal- och miniläge vid varje bredd.
Återgå till normal navigering och 320 × 1000,
**Stäng uppgifterna** och återgå till normal navigering före steg 5.

**Förväntat resultat:** Samma läsning, val och hjälp som NAVIGATION-20
fungerar utan att minska textstorleken eller behöva hitta objekt visuellt.

**Separata mänskliga observationer för NAVIGATION-20–21:** Kör samma
läsflöde med faktisk skärmläsare, fysisk pekskärm och verklig förstoring
i båda teman. Kontrollera upplästa grupp- och fältnamn, fokusmarkering,
kontrollernas kontrast och att hela värden kan läsas vid omflöde.
Automationen utför inte dessa observationer och fastställer inte full
WCAG-överensstämmelse.

### NAVIGATION-01: Normal- och miniläge med oberoende fönsterflytt

**Syfte:** Navigeringsfönstret flyttas utan kamera- eller objektflytt.

**Användare:** Alex Exempel.

**Förutsättningar:** Kartan är synlig i en datorbred vy.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts),
NAVIGATION-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-01"
  },
  "reference": "Chromium, angiven vanlig navigering och sparade objekt.",
  "outcomes": [
    "Navigation, riktning, fokus och personliga placeringar bevarar hushållets uppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Markera Lo och välj **Navigera**. Kontrollera titelradens ordning:
   miniikonen, **Navigation**, stängikonen. Titelraden får fokus.
2. Välj **Visa mininavigering**. Kontrollera ikonernas verktygstips och
   tillgängliga namn. Kameraknappar och sex flyttriktningar finns kvar.
3. Fokusera titelraden. Använd piltangenter och Skift med piltangent.
4. Dra titelraden och tryck Escape innan du släpper pekaren.
5. Öppna **Fönstrets placering**. Flytta med knapparna och återställ
   fönstrets placering utan att dra.
6. Tryck Escape igen när ingen dragning pågår.

**Förväntat resultat:**

- Fönstret flyttas med tangentbord eller pekare. Kameran och objektens
  placeringar ändras inte. Avbruten dragning återger fönstrets placering.
- Normalläget visar knapptext; miniläget behåller begripliga namn.
- Escape utan dragning stänger navigationen och återför fokus till
  **Navigera** utan att ändra urval eller andra öppna paneler.

### NAVIGATION-02: Navigation och oskickade detaljer samtidigt

**Syfte:** Bevara navigation, läsbara uppgifter och oskickad formulärtext
med den gemensamma objektdialogens förlustskydd i båda öppningsordningarna.

**Användare:** Alex Exempel.

**Förutsättningar:** 1440 × 1000 CSS-pixlar. Öppna Navigation först.
De separata NAVIGATION-06–18 anger övriga mått och öppningsordning.
Återställ sparade Lo och Kim inför varje fall; använd samma databas vid omstart.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts),
NAVIGATION-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-02"
  },
  "reference": "1440 × 1000 CSS-pixlar, Navigation först. Komplett referens med samlat sparande och serveromstart.",
  "outcomes": [
    "Navigation, riktning, fokus och personliga placeringar bevarar hushållets uppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Markera Lo. Öppna **Navigera**, flytta titelraden med Skift+pil nedåt
   och fokusera sedan Lo. Tryck Skift+F10 och välj
   **Visa uppgifter för Lo Exempel**. Läs Lo i det flyttbara uppgiftsfönstret.
   På dator: flytta dess
   titelrad åt vänster med Skift+pil tills fönstren ligger bredvid varandra.
   Fokusera navigationens stängikon och kontrollera att den kan nås.
   Fokusera sedan Los rubrik och kontrollera att uppgifterna visas framför
   navigationen om fönstren överlappar på en liten skärm.
   Vid 844 × 390 och 320 × 250: använd en provinstallation utan samtalstjänst,
   aktivera **Prata med Skyttel** före öppningen och låt den verkliga
   otillgänglighetsnotisen vara öppen under samma steg.
   Läs uppgiftsytans sista värde och nå **Samband för Lo Exempel** med
   notisen kvar. Fokusera först notisens stängikon för att läsa notisen och
   sedan
   uppgiftsfönstrets rubrik för att läsa uppgifterna. Sambandsikonen
   ska kunna nås även när innehållet behöver rullas.
2. På dator: flytta navigationen åt vänster med Skift+pil. Ändra fönstrets
   bredd lite och återställ den. Navigationens möjliga placering och
   uppgiftsytans placering ska bestå. Flytta åt vänster igen.
3. Välj **Redigera Lo Exempel**. Lägg till egenskapen **Beskrivning** under
   **Fria egenskaper**, välj datatypen Text och skriv en ny text. Försök stänga
   med krysset. Kontrollera att **Fortsätt redigera** får fokus och tryck
   Escape. Beskrivningen ska finnas kvar. Navigationen i bakgrunden är
   inaktiv medan den fullständiga objektdialogen skyddar formuläret.
4. Välj **Lägg i utkastet och stäng** med tangentbordet. Läs den föreslagna
   beskrivningen i uppgiftsytan. Rulla navigationens innehåll vid behov
   och välj **Flytta Lo Exempel: bakåt**. Vänta på bekräftad personlig vy.
5. Panorera, byt till mininavigering och zooma med knapparna.
   I de korta varianterna ska otillgänglighetsnotisen fortfarande vara öppen.
   Rulla hela navigationen
   vid behov i det kortaste fönstret. Läs den oförändrade föreslagna
   beskrivningen med datatypen Text och uppgiftsytans sista värde. Rulla genom
   hela värdet om det är högre än läsytan. Varje textrad ska gå att läsa utan
   att täckas av titelraden, knappar eller andra fönster. Fokusera först därefter
   notisens **Stäng notisen** i de två notisvarianterna och aktivera den
   utan att ändra utkastet.
   Hushållets sparade uppgifter
   ska fortfarande vara oförändrade.
6. Välj **Visa utkastet**, sedan **Visa förslaget: Lo Exempel**. Läs
   namnet, objekttypen och hela den föreslagna beskrivningen. Välj
   **Stäng dialogen** och **Spara hela utkastet**. Vänta på sparbekräftelsen.
7. Stäng textvyn och starta om provservern med samma databas och ladda om.
   Öppna **Tabell**,
   välj **Lo Exempel** och läs den sparade typen och egenskapen Beskrivning
   med datatypen Text. Välj också **Kim Exempel** och läs namnet och samma
   objekttyp. Ingen egenskap Beskrivning ska finnas för Kim. Öppna
   **Samband för Lo Exempel** respektive
   **Samband för Kim Exempel** och läs att inga samband finns för objekten;
   stäng varje dialog med **Stäng samband**. Den sparade förberedelsen har
   inga samband, och de förblir oförändrade efter sparande och omstart.
   Återgå till **Karta** och kontrollera Los personliga placering.
   Utkastet är tomt.
8. Markera Lo, öppna **Navigera** och välj **Flytta Lo Exempel: uppåt**.
   Kontrollera att flytten fortsätter från den sparade personliga placeringen
   med synlig förflyttning och bevarat fokus. Övriga objekt kan ha fått
   nya automatiska placeringar vid omladdningen; identisk kamerainramning
   krävs inte.

**Förväntat resultat:**

- På dator kan uppgiftsfönstret placeras bredvid navigationen. I små
  fönster kan de överlappa; den fokuserade ytan visas framför den andra.
  Innehållet går att rulla med nåbara kontroller och synligt fokus.
- Den öppna samtalsnotisen har en egen plats utanför navigationen.
  Fokusera dess stängikon för att läsa notisen framför överlappande
  uppgiftsfönster. Zoom, panorering, sista värdet och uppgiftsfönstrets
  åtgärder går att nå utan att först stänga notisen.
- Åtgärdsikonerna går att visa inom uppgiftsfönstrets rullade område.
  Notisens fullständiga text och stängknapp är fortfarande åtkomliga.
- Navigation och uppgiftsfönster kan flyttas med tangentbord och pekare
  inom synligt utrymme. Redigering använder det vanliga fullständiga
  formuläret med förlustskydd.
- Byte till mininavigering bevarar uppgiftsytans placering och lämnar
  de läsbara uppgifterna åtkomliga. Längre uppgifter kan kräva rullning.
- Avbruten formulärförlust behåller alla oskickade värden. Ingen personlig
  flyttning sker genom den inaktiva bakgrunden. Efter uttrycklig komplett
  tilläggning behålls förslaget under navigering och personlig objektflytt.
- Personlig flyttning ändrar bara den personliga vyn. Den sparade
  hushållskartan och dess samband ändras inte.
- **Samband för Lo Exempel** öppnar den
  ordinarie sambandsdialogen.

### NAVIGATION-03: Sex personliga riktningar och beständig placering

**Syfte:** Bara ett namngivet objekt flyttas utan ändrade hushållsuppgifter.

**Användare:** Alex Exempel.

**Förutsättningar:** Spara hushållets uppgifter före provet. En ansvarig
för provinstallationen kan starta om dess server med samma databas.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts),
NAVIGATION-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-03"
  },
  "reference": "Chromium, angiven vanlig navigering och sparade objekt.",
  "outcomes": [
    "Navigation, riktning, fokus och personliga placeringar bevarar hushållets uppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Markera bara Lo och öppna **Navigera**. Kontrollera **Flytta Lo Exempel**.
2. Använd vänster, höger, uppåt, nedåt, framåt och bakåt. Vänta på sparad
   personlig vy efter varje rörelse.
3. Markera även Kim med Ctrl/Cmd. Öppna navigationen igen.
4. Avmarkera båda med Ctrl/Cmd i kartan och kontrollera navigationen.
5. Starta om servern, ladda om sidan och kontrollera placeringarna samt
   hushållets sparade uppgifter och utkast.
6. Markera Lo, öppna **Navigera** och flytta uppåt en gång. Kontrollera
   synlig fortsatt flytt från den sparade personliga placeringen och
   bevarat fokus på flyttknappen.

**Förväntat resultat:**

- De sex riktningarna ändrar bara det namngivna objektets personliga
  placering. Hushållets uppgifter och utkast är oförändrade.
- Vid tomt urval eller flerval döljs objektflyttningen. Kameraknapparna
  finns kvar och fungerar.
- Den personliga placeringen återläses efter omstart.

### NAVIGATION-04: Samband nås och redigeras från listan

**Syfte:** Detaljernas textalternativ behåller riktning och redigering.

**Användare:** Alex Exempel.

**Förutsättningar:** Lo Exempel använder Kim Exempel genom ett samband
av typen Använder. Sambandet kan vara sparat eller ligga i utkastet.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts),
NAVIGATION-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-04"
  },
  "reference": "Chromium, angiven vanlig navigering och sparade objekt.",
  "outcomes": [
    "Navigation, riktning, fokus och personliga placeringar bevarar hushållets uppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Dubbelklicka Lo för att öppna uppgiftsfönstret.
2. Välj **Samband för Lo Exempel** i det flyttbara uppgiftsfönstret.
3. Läs **Lo Exempel → Använder → Kim Exempel**, båda ändpunkterna och
   riktningen. Välj **Kim Exempel**, läs dess fullständiga uppgifter och
   kontrollera fokus på rubriken **Uppgifter för Kim Exempel**.
4. Välj **Tillbaka**. Välj **Redigera samband** vid samma samband och
   kontrollera Lo som **Från objekt** och Kim som **Till objekt**.
5. Lägg till den fria egenskapen **Uppgiftens säkerhet** med datatyp **Text**
   och värdet **Osäkert uppgivet**. Läs meningen
   **Lo Exempel använder Kim Exempel** och välj **Lägg i utkastet**.
   Sambandsdialogen ska finnas kvar i läsläge. Under samma samband visar
   egenskapen **Osäkert uppgivet (Text)**.

**Förväntat resultat:**

- Båda ändpunkterna och riktningen anges i text. Det andra objektets
  namn öppnar dess verkliga fullständiga uppgifter och Tillbaka återgår.
- Det vanliga formuläret behåller Lo och Kim i rätt riktning. Det färdiga
  förslaget ersätter bara samma samband i utkastet; inget extra samband
  skapas och hushållets sparade objekt och samband ändras inte.
- Uppgiftsytan innehåller ingen upprepad lista över direkta samband.

## Zoom med styrplatta

### NAVIGATION-05: Nypzoom följer fingrarnas hastighet

**Syfte:** Nypzoom med styrplatta är snabb nog och följer fingrarnas
hastighet. Ett hack med Ctrl och mushjul zoomar begränsat.

**Användare:** Alex Exempel.

**Förutsättningar:** Lo och Kim syns i Chromium vid 1440 × 1000 CSS-pixlar.
Styrplattans
Ctrl-hjulhändelser och musens stora hjulsteg provas kontrollerat i
automationen. Faktiska Mac-gester och Safari provas i NAVIGATION-19.

**Automatiskt motsvarande webbläsartest:**
[household-camera.test.tsx](../../tests/browser/household-camera.test.tsx),
NAVIGATION-05.
Testet använder den publika hushållskartan med produktens stilmallar och
native tangent- och hjulhändelser i Chromium. Fullständiga svar för karta och vy
är kontrollerade; inget skrivförsök får göras. Det verifierar kamerans
beteende och oförändrade svar, men inte beständigt sparande på servern.
NAVIGATION-03 behåller personlig flyttning och omstart mot verklig server.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/household-camera.test.tsx",
    "caseId": "NAVIGATION-05"
  },
  "reference": "Chromium 1440 × 1000, publik hushållskarta och produktstilar, native Ctrl och hjulhändelser, kontrollerade fullständiga svar för Lo och Kim och personlig vy; ingen verklig serverlagring.",
  "outcomes": [
    "Långsamt och snabbt nyp ger skilda zoomhastigheter; ett Ctrl-hjulhack är begränsat.",
    "Återställning återför kameran utan att förstora sidan eller skriva hushållsuppgifter och personliga placeringar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Börja i återställt läge. Om **Återställ vy** är aktiv, välj den.
   Håll pekaren över tom rymd.
2. Nyp långsamt isär med två fingrar på styrplattan. Nyp sedan långsamt
   ihop.
3. Välj **Återställ vy**. Nyp snabbt isär med samma fingeravstånd som i
   steg 2. Nyp sedan snabbt ihop.
4. Välj **Återställ vy**. Håll Ctrl och rulla mushjulet ett hack.

**Förväntat resultat:**

- Ett långsamt nyp zoomar lugnt och går att styra noga.
- Ett snabbt nyp zoomar tydligt mer än ett långsamt nyp.
- Ett nyp isär zoomar in och ett nyp ihop zoomar ut.
- Ett hack med Ctrl och mushjul zoomar ett begränsat steg utan hopp.
- Webbläsaren förstorar inte hela sidan. Objektens placeringar ändras inte.

### NAVIGATION-06: uppgifter först vid 1440 × 1000

**Syfte:** Båda ytorna förblir användbara med fullständigt förlustskydd och
läsbart förslag.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som NAVIGATION-02.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts), NAVIGATION-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-06"
  },
  "reference": "1440 × 1000 CSS-pixlar, uppgifter först: överlappning, fokus och nåbara sista värden skyddas; full omstart ligger i NAVIGATION-02.",
  "outcomes": [
    "Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart förslag.",
    "Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 1440 × 1000 CSS-pixlar. Följ NAVIGATION-02
   steg 1–5 en gång, med uppgifter först. I steg 1 öppnar du
   Los uppgifter före **Navigera**; flytta inte den ännu stängda navigationen.
2. Utför notiskontrollerna i steg 1 och 5 endast vid 320 × 250 eller
   844 × 390. Den breda vyns fria fönsterflytt i steg 2 gäller endast 1440-bredden.
3. Stanna efter steg 5. Spara inte hushållsutkastet och starta inte om.
   Kontrollera den föreslagna beskrivningen efter sista kameraåtgärden.

**Förväntat resultat:**

- Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart
  förslag.
- Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter.

### NAVIGATION-07: Navigation först vid 320 × 250

**Syfte:** Båda ytorna förblir användbara med fullständigt förlustskydd och
läsbart förslag.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som NAVIGATION-02.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts), NAVIGATION-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-07"
  },
  "reference": "320 × 250 CSS-pixlar, navigation först: överlappning, fokus och nåbara sista värden skyddas; full omstart ligger i NAVIGATION-02.",
  "outcomes": [
    "Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart förslag.",
    "Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 320 × 250 CSS-pixlar. Följ NAVIGATION-02
   steg 1–5 en gång, med navigation först. Behåll grundfallets
   ordning i steg 1.
2. Utför notiskontrollerna i steg 1 och 5 endast vid 320 × 250 eller
   844 × 390. Den breda vyns fria fönsterflytt i steg 2 gäller endast 1440-bredden.
3. Stanna efter steg 5. Spara inte hushållsutkastet och starta inte om.
   Kontrollera den föreslagna beskrivningen efter sista kameraåtgärden.

**Förväntat resultat:**

- Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart
  förslag.
- Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter.

### NAVIGATION-08: uppgifter först vid 320 × 250

**Syfte:** Båda ytorna förblir användbara med fullständigt förlustskydd och
läsbart förslag.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som NAVIGATION-02.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts), NAVIGATION-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-08"
  },
  "reference": "320 × 250 CSS-pixlar, uppgifter först: överlappning, fokus och nåbara sista värden skyddas; full omstart ligger i NAVIGATION-02.",
  "outcomes": [
    "Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart förslag.",
    "Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 320 × 250 CSS-pixlar. Följ NAVIGATION-02
   steg 1–5 en gång, med uppgifter först. I steg 1 öppnar du
   Los uppgifter före **Navigera**; flytta inte den ännu stängda navigationen.
2. Utför notiskontrollerna i steg 1 och 5 endast vid 320 × 250 eller
   844 × 390. Den breda vyns fria fönsterflytt i steg 2 gäller endast 1440-bredden.
3. Stanna efter steg 5. Spara inte hushållsutkastet och starta inte om.
   Kontrollera den föreslagna beskrivningen efter sista kameraåtgärden.

**Förväntat resultat:**

- Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart
  förslag.
- Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter.

### NAVIGATION-09: Navigation först vid 844 × 390

**Syfte:** Båda ytorna förblir användbara med fullständigt förlustskydd och
läsbart förslag.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som NAVIGATION-02.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts), NAVIGATION-09.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-09"
  },
  "reference": "844 × 390 CSS-pixlar, navigation först: överlappning, fokus och nåbara sista värden skyddas; full omstart ligger i NAVIGATION-02.",
  "outcomes": [
    "Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart förslag.",
    "Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 844 × 390 CSS-pixlar. Följ NAVIGATION-02
   steg 1–5 en gång, med navigation först. Behåll grundfallets
   ordning i steg 1.
2. Utför notiskontrollerna i steg 1 och 5 endast vid 320 × 250 eller
   844 × 390. Den breda vyns fria fönsterflytt i steg 2 gäller endast 1440-bredden.
3. Stanna efter steg 5. Spara inte hushållsutkastet och starta inte om.
   Kontrollera den föreslagna beskrivningen efter sista kameraåtgärden.

**Förväntat resultat:**

- Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart
  förslag.
- Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter.

### NAVIGATION-10: uppgifter först vid 844 × 390

**Syfte:** Båda ytorna förblir användbara med fullständigt förlustskydd och
läsbart förslag.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som NAVIGATION-02.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts), NAVIGATION-10.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-10"
  },
  "reference": "844 × 390 CSS-pixlar, uppgifter först: överlappning, fokus och nåbara sista värden skyddas; full omstart ligger i NAVIGATION-02.",
  "outcomes": [
    "Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart förslag.",
    "Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 844 × 390 CSS-pixlar. Följ NAVIGATION-02
   steg 1–5 en gång, med uppgifter först. I steg 1 öppnar du
   Los uppgifter före **Navigera**; flytta inte den ännu stängda navigationen.
2. Utför notiskontrollerna i steg 1 och 5 endast vid 320 × 250 eller
   844 × 390. Den breda vyns fria fönsterflytt i steg 2 gäller endast 1440-bredden.
3. Stanna efter steg 5. Spara inte hushållsutkastet och starta inte om.
   Kontrollera den föreslagna beskrivningen efter sista kameraåtgärden.

**Förväntat resultat:**

- Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart
  förslag.
- Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter.

### NAVIGATION-11: Navigation först vid 390 × 1000

**Syfte:** Båda ytorna förblir användbara med fullständigt förlustskydd och
läsbart förslag.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som NAVIGATION-02.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts), NAVIGATION-11.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-11"
  },
  "reference": "390 × 1000 CSS-pixlar, navigation först: överlappning, fokus och nåbara sista värden skyddas; full omstart ligger i NAVIGATION-02.",
  "outcomes": [
    "Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart förslag.",
    "Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 390 × 1000 CSS-pixlar. Följ NAVIGATION-02
   steg 1–5 en gång, med navigation först. Behåll grundfallets
   ordning i steg 1.
2. Utför notiskontrollerna i steg 1 och 5 endast vid 320 × 250 eller
   844 × 390. Den breda vyns fria fönsterflytt i steg 2 gäller endast 1440-bredden.
3. Stanna efter steg 5. Spara inte hushållsutkastet och starta inte om.
   Kontrollera den föreslagna beskrivningen efter sista kameraåtgärden.

**Förväntat resultat:**

- Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart
  förslag.
- Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter.

### NAVIGATION-12: uppgifter först vid 390 × 1000

**Syfte:** Båda ytorna förblir användbara med fullständigt förlustskydd och
läsbart förslag.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som NAVIGATION-02.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts), NAVIGATION-12.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-12"
  },
  "reference": "390 × 1000 CSS-pixlar, uppgifter först: överlappning, fokus och nåbara sista värden skyddas; full omstart ligger i NAVIGATION-02.",
  "outcomes": [
    "Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart förslag.",
    "Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 390 × 1000 CSS-pixlar. Följ NAVIGATION-02
   steg 1–5 en gång, med uppgifter först. I steg 1 öppnar du
   Los uppgifter före **Navigera**; flytta inte den ännu stängda navigationen.
2. Utför notiskontrollerna i steg 1 och 5 endast vid 320 × 250 eller
   844 × 390. Den breda vyns fria fönsterflytt i steg 2 gäller endast 1440-bredden.
3. Stanna efter steg 5. Spara inte hushållsutkastet och starta inte om.
   Kontrollera den föreslagna beskrivningen efter sista kameraåtgärden.

**Förväntat resultat:**

- Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart
  förslag.
- Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter.

### NAVIGATION-13: Navigation först vid 320 × 1000

**Syfte:** Båda ytorna förblir användbara med fullständigt förlustskydd och
läsbart förslag.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som NAVIGATION-02.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts), NAVIGATION-13.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-13"
  },
  "reference": "320 × 1000 CSS-pixlar, navigation först: överlappning, fokus och nåbara sista värden skyddas; full omstart ligger i NAVIGATION-02.",
  "outcomes": [
    "Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart förslag.",
    "Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 320 × 1000 CSS-pixlar. Följ NAVIGATION-02
   steg 1–5 en gång, med navigation först. Behåll grundfallets
   ordning i steg 1.
2. Utför notiskontrollerna i steg 1 och 5 endast vid 320 × 250 eller
   844 × 390. Den breda vyns fria fönsterflytt i steg 2 gäller endast 1440-bredden.
3. Stanna efter steg 5. Spara inte hushållsutkastet och starta inte om.
   Kontrollera den föreslagna beskrivningen efter sista kameraåtgärden.

**Förväntat resultat:**

- Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart
  förslag.
- Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter.

### NAVIGATION-14: uppgifter först vid 320 × 1000

**Syfte:** Båda ytorna förblir användbara med fullständigt förlustskydd och
läsbart förslag.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som NAVIGATION-02.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts), NAVIGATION-14.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-14"
  },
  "reference": "320 × 1000 CSS-pixlar, uppgifter först: överlappning, fokus och nåbara sista värden skyddas; full omstart ligger i NAVIGATION-02.",
  "outcomes": [
    "Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart förslag.",
    "Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 320 × 1000 CSS-pixlar. Följ NAVIGATION-02
   steg 1–5 en gång, med uppgifter först. I steg 1 öppnar du
   Los uppgifter före **Navigera**; flytta inte den ännu stängda navigationen.
2. Utför notiskontrollerna i steg 1 och 5 endast vid 320 × 250 eller
   844 × 390. Den breda vyns fria fönsterflytt i steg 2 gäller endast 1440-bredden.
3. Stanna efter steg 5. Spara inte hushållsutkastet och starta inte om.
   Kontrollera den föreslagna beskrivningen efter sista kameraåtgärden.

**Förväntat resultat:**

- Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart
  förslag.
- Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter.

### NAVIGATION-15: Navigation först vid 700 × 600

**Syfte:** Båda ytorna förblir användbara med fullständigt förlustskydd och
läsbart förslag.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som NAVIGATION-02.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts), NAVIGATION-15.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-15"
  },
  "reference": "700 × 600 CSS-pixlar, navigation först: överlappning, fokus och nåbara sista värden skyddas; full omstart ligger i NAVIGATION-02.",
  "outcomes": [
    "Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart förslag.",
    "Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 700 × 600 CSS-pixlar. Följ NAVIGATION-02
   steg 1–5 en gång, med navigation först. Behåll grundfallets
   ordning i steg 1.
2. Utför notiskontrollerna i steg 1 och 5 endast vid 320 × 250 eller
   844 × 390. Den breda vyns fria fönsterflytt i steg 2 gäller endast 1440-bredden.
3. Stanna efter steg 5. Spara inte hushållsutkastet och starta inte om.
   Kontrollera den föreslagna beskrivningen efter sista kameraåtgärden.

**Förväntat resultat:**

- Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart
  förslag.
- Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter.

### NAVIGATION-16: uppgifter först vid 700 × 600

**Syfte:** Båda ytorna förblir användbara med fullständigt förlustskydd och
läsbart förslag.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som NAVIGATION-02.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts), NAVIGATION-16.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-16"
  },
  "reference": "700 × 600 CSS-pixlar, uppgifter först: överlappning, fokus och nåbara sista värden skyddas; full omstart ligger i NAVIGATION-02.",
  "outcomes": [
    "Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart förslag.",
    "Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 700 × 600 CSS-pixlar. Följ NAVIGATION-02
   steg 1–5 en gång, med uppgifter först. I steg 1 öppnar du
   Los uppgifter före **Navigera**; flytta inte den ännu stängda navigationen.
2. Utför notiskontrollerna i steg 1 och 5 endast vid 320 × 250 eller
   844 × 390. Den breda vyns fria fönsterflytt i steg 2 gäller endast 1440-bredden.
3. Stanna efter steg 5. Spara inte hushållsutkastet och starta inte om.
   Kontrollera den föreslagna beskrivningen efter sista kameraåtgärden.

**Förväntat resultat:**

- Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart
  förslag.
- Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter.

### NAVIGATION-17: Navigation först vid 640 × 500

**Syfte:** Båda ytorna förblir användbara med fullständigt förlustskydd och
läsbart förslag.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som NAVIGATION-02.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts), NAVIGATION-17.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-17"
  },
  "reference": "640 × 500 CSS-pixlar, navigation först: överlappning, fokus och nåbara sista värden skyddas; full omstart ligger i NAVIGATION-02.",
  "outcomes": [
    "Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart förslag.",
    "Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 640 × 500 CSS-pixlar. Följ NAVIGATION-02
   steg 1–5 en gång, med navigation först. Behåll grundfallets
   ordning i steg 1.
2. Utför notiskontrollerna i steg 1 och 5 endast vid 320 × 250 eller
   844 × 390. Den breda vyns fria fönsterflytt i steg 2 gäller endast 1440-bredden.
3. Stanna efter steg 5. Spara inte hushållsutkastet och starta inte om.
   Kontrollera den föreslagna beskrivningen efter sista kameraåtgärden.

**Förväntat resultat:**

- Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart
  förslag.
- Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter.

### NAVIGATION-18: uppgifter först vid 640 × 500

**Syfte:** Båda ytorna förblir användbara med fullständigt förlustskydd och
läsbart förslag.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som NAVIGATION-02.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts), NAVIGATION-18.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-navigation.spec.ts",
    "caseId": "NAVIGATION-18"
  },
  "reference": "640 × 500 CSS-pixlar, uppgifter först: överlappning, fokus och nåbara sista värden skyddas; full omstart ligger i NAVIGATION-02.",
  "outcomes": [
    "Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart förslag.",
    "Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Ställ fönstret på 640 × 500 CSS-pixlar. Följ NAVIGATION-02
   steg 1–5 en gång, med uppgifter först. I steg 1 öppnar du
   Los uppgifter före **Navigera**; flytta inte den ännu stängda navigationen.
2. Utför notiskontrollerna i steg 1 och 5 endast vid 320 × 250 eller
   844 × 390. Den breda vyns fria fönsterflytt i steg 2 gäller endast 1440-bredden.
3. Stanna efter steg 5. Spara inte hushållsutkastet och starta inte om.
   Kontrollera den föreslagna beskrivningen efter sista kameraåtgärden.

**Förväntat resultat:**

- Båda ytorna förblir användbara med fullständigt förlustskydd och läsbart
  förslag.
- Personlig flyttning och kamera ändrar inte sparade hushållsuppgifter.

### NAVIGATION-19: faktisk styrplatta och mushjul

**Syfte:** Mac-styrplattans långsamma och snabba nyp ger styrbar kamerazoom i
Chrome och Safari; ett Ctrl-hjulhack ger begränsad zoom utan sidförstoring.

**Användare:** Alex enligt områdets förberedelse.

**Förutsättningar:** Faktisk Mac med styrplatta och mus med hjul, både Chrome
och Safari.

**Kräver mänsklig observation:** Mac-styrplattans långsamma och snabba nyp ger
styrbar kamerazoom i Chrome och Safari; ett Ctrl-hjulhack ger begränsad zoom
utan sidförstoring.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Mac-styrplattans långsamma och snabba nyp ger styrbar kamerazoom i Chrome och Safari; ett Ctrl-hjulhack ger begränsad zoom utan sidförstoring."
  },
  "reference": "Faktisk Mac med styrplatta och mus med hjul, både Chrome och Safari.",
  "outcomes": [
    "Mac-styrplattans långsamma och snabba nyp ger styrbar kamerazoom i Chrome och Safari; ett Ctrl-hjulhack ger begränsad zoom utan sidförstoring."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "runner": "vitest",
      "suite": "browser",
      "spec": "tests/browser/household-camera.test.tsx",
      "caseId": "NAVIGATION-05",
      "purpose": "Native Chromium-hjulhändelser i publik hushållskarta med kontrollerade svar; utför inte faktisk observation med Mac, styrplatta eller Safari."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ NAVIGATION-05 steg 1–4 en gång i varje faktisk webbläsare.
2. Använd samma fingeravstånd vid långsam och snabb rörelse. Anteckna
   vilken enhet och webbläsare som provas samt eventuell sidförstoring.

**Förväntat resultat:**

- Mac-styrplattans långsamma och snabba nyp ger styrbar kamerazoom i Chrome och
  Safari; ett Ctrl-hjulhack ger begränsad zoom utan sidförstoring.

## Svittillhörighet

NAVIGATION-05 har samma stabila ID i Chromium-sviten. Dess motsvarighet är
[household-camera.test.tsx](../../tests/browser/household-camera.test.tsx).
Native inmatning, zoomhastighet, återställning, träffyta och sidans skala
skyddas med kontrollerade fullständiga svar. Detta fall kör inte verklig
HTTP-lagring; NAVIGATION-02, NAVIGATION-03 och NAVIGATION-06–18 behåller
sina integrationsflöden och konfigureringar. Inget ID pensioneras eller
återanvänds. NAVIGATION-19 kräver fortfarande mänsklig observation.
