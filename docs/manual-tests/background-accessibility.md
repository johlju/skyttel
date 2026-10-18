# Manuella testfall för bakgrundens tillgänglighet

Fallen hjälper provansvariga att kontrollera kartans läsbarhet och hela
bakgrundsflödet. Anteckna commit, datum, webbläsare, OS, skärmstorlek,
inmatning, hjälpmedel och resultat per utförd observation. Automatiska
Chromium-prov visar inte fysisk mobilanvändning, verklig förstoring eller
hörda skärmläsarbesked. De fastställer inte fullständig WCAG-överensstämmelse.

## Konfigurerade användare

Alex Exempel har tillgång till ett isolerat provhushåll. Använd endast
påhittade uppgifter och lokal provinloggning enligt
[provförberedelsen](../development/devcontainer.md#disposable-local-database).

## Allmän förberedelse

1. Förbered ett hushåll med 16 objekt och ett med 80 objekt. Koppla varje
   objekt till nästa i namnordning med ett samband: 00 till 01, 01 till 02
   och så vidare. Namnge objekten **Läsobjekt 00** till **Läsobjekt 15**
   respektive **Läsobjekt 79**. Ange beskrivningen **Hela beskrivningen går
   att läsa i tabellen.** Spara kartan. Använd automatiska etiketter.
2. Börja med **Visa bakgrund** på och systemets minskade rörelse av.
   Använd ljust respektive mörkt systemtema för att se de separata valen.
3. Jämför 1440 × 960 och 390 × 844 CSS-pixlar. För inställningarnas
   omflöde används också 320 × 568. Återställ kameran med **Återställ vy**
   mellan bakgrunderna. Behåll sparade val inom återläsningsprovet.

## Läsbarhet och alternativa vägar

### BAKGRUND-06: Läsa objekt och använda tabellen med bakgrund

**Syfte:** Läsa ett objekts hela uppgifter och använda tabellens sökning
även när kartans objekt och etiketter överlappar.

**Användare:** Alex Exempel.

**Förutsättningar:** Båda kartstorlekarna och båda bredderna ovan.

**Automatiskt motsvarande test (integration):**
[background-accessibility.spec.ts](../../tests/integration/background-accessibility.spec.ts),
BAKGRUND-06. Provet använder riktig app, scenrendering och isolerad SQLite.
Det följer läsflödet med Gryningsdis i ljust tema och Universum i mörkt
tema, med båda kartstorlekarna och bredderna. Öppna fönster dokumenterar
täckningen. **Fokusera markering** visar Läsobjekt 00 och dess direkta
granne utan att ändra placeringarna. Det bevisar inte fri pekyta i
översikten. Tabellens sökning ger en separat väg till hela uppgifterna.

**Tekniskt underlag:**
[background-contrast.test.tsx](../../tests/browser/background-contrast.test.tsx)
mäter den färdiga skärmbildens samband och symboler över alla sju motiv.
De 28 kombinationerna av bakgrund, kartstorlek och bredd har en fokuserad
kontrastvy var. Linjer och symboler ska nå minst 3:1 och vanlig text minst
4,5:1. Provet använder riktiga komponenter, stilar och scenrendering utan
HTTP-lagring. Det är ett tekniskt webbläsarprov, skilt från läsflödet.
Bildprov och semantik ersätter inte hjälpmedelsprov eller en fullständig
kontrastbedömning från alla kamerariktningar.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/background-accessibility.spec.ts",
    "caseId": "BAKGRUND-06"
  },
  "reference": "Gryningsdis och Universum, 16/80 objekt, 1440/390 px; uppgifter, överlappande paneler, fokuserad markering och tabellsökning.",
  "outcomes": [
    "Fokuserad markering visar objektet och dess samband.",
    "Objekt går att markera och deras hela uppgifter går att öppna.",
    "Tabellens sökning ger fullständiga uppgifter även när kartans etiketter trängs."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Gryningsdis** i ljust tema under **Inställningar → Rymdkartan**.
   Återgå till kartan. Upprepa läsflödet med **Universum** i mörkt tema.
2. Fokusera Läsobjekt 00, tryck Enter och kontrollera markeringen.
   Tryck Skift+F10 och välj **Visa uppgifter för Läsobjekt 00**. Läs hela
   beskrivningen. Tabba till **Navigera** och öppna det med Enter, även om
   uppgiftsfönstret täcker verktygen. Granska båda öppna fönstren. Stäng
   det främre navigeringsfönstret med dess stängknapp och stäng sedan
   uppgifterna med deras stängknapp. Fokus ska återgå till kartans kontroller.
3. Fokusera Läsobjekt 00, tryck Skift+F10 och välj **Fokusera markering**.
   Låt navigeringen vara stängd och jämför samband, symboler och etiketter
   i denna enda fokuserade vy. Återställ vyn efter jämförelsen. Upprepa för
   båda bakgrunderna, kartstorlekarna och bredderna.
4. Öppna **Tabell** och sök det sista objektets namn i **Sök objekt i
   tabellen**. Fokusera dess namn och tryck Enter. Läs hela beskrivningen.

**Förväntat resultat:**

- Sambandens linjer och pilspetsar skiljs från bakgrunden även över ljusa
  motiv. Objektens symboler och namn har egna fasta ytor. Markering och
  synligt tangentbordsfokus består utan att motivet fångar interaktioner.
- Uppgifter går att läsa i panel och tabell. Täta kartor kan ha dolda
  automatiska etiketter och överlappande markörer, även med 16 objekt i
  smal vy. **Alla etiketter** kan ge ytterligare överlappning. Panelerna
  skymmer delar av kartan. Anteckna hindren; provet innebär inte att varje
  markör har fri pekyta eller att alla etiketter är läsbara samtidigt.
- Tabellens sökning och fullständiga uppgifter ger en ordinarie väg förbi
  dessa överlappningar utan dragning eller visuell kartnavigering.
- När fönster överlappar kan navigeringen täcka uppgifternas stängknapp,
  och uppgifter kan täcka verktyg i smal vy. Stäng det främre fönstret
  först för att nå det bakom. Tab höjer fokuserade kontroller; Escape i
  uppgiftsfönstret stänger det. Det är alternativa vägar, inte bevis för
  att båda fönstrens alla knappar är fria samtidigt.

## Inställningar

### BAKGRUND-07: Tangentbord, pekning, omflöde och sparstatus

**Syfte:** Använd hela inställningsflödet vid smal vy med begripliga namn,
logisk tabbordning, synligt fokus och korrekta inaktiva tillstånd.

**Användare:** Alex Exempel.

**Förutsättningar:** 16 objekt, 320 × 568 CSS-pixlar och bakgrunden på.

**Automatiskt motsvarande test (integration):**
[background-accessibility.spec.ts](../../tests/integration/background-accessibility.spec.ts),
BAKGRUND-07. Chromium provar verkliga tangent- och syntetiska pekhändelser,
sparande i isolerad SQLite, båda teman, omladdning och systemets minskade
rörelse. Ett levererat sparförsök får sitt svar hållet av provverktyget för
att kontrollera väntande tillstånd. Det är ingen fysisk pekskärmskontroll.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/background-accessibility.spec.ts",
    "caseId": "BAKGRUND-07"
  },
  "evidence": [
    {
      "kind": "overlap",
      "runner": "playwright",
      "suite": "integration",
      "spec": "tests/integration/personal-view.spec.ts",
      "caseId": "PLACERING-13",
      "purpose": "Bekräftade reglagevärden, bevarat fokus och tillgänglig status vid konflikt och avvisat sparande."
    }
  ],
  "reference": "320 px, tangentbord och pekemulering, båda teman, av/på och minskad rörelse.",
  "outcomes": [
    "Alla tillämpliga kontroller nås i logisk ordning utan dragning.",
    "Fokus består under sparande och väntande reglage ändras inte.",
    "Av och minskad rörelse ger rätt inaktiva kontroller utan förlorade val.",
    "Inställningarna ryms utan horisontell sidrullning och återläses korrekt."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Inställningar → Rymdkartan**. Fokusera **Visa bakgrund** och
   tabba genom båda bakgrundsväljarna, de tre rörelsereglagen och
   **Återställ rörelse**. Ändra väljare med piltangenterna och reglagen med
   End. Kontrollera fokus och sparbesked efter varje ändring.
2. Aktivera **Återställ rörelse** med Enter. Kontrollera 70 procent,
   70 procent och 1,0. Peka en gång i panoreringsreglagets vänstra ände;
   värdet ska gå att ändra utan dragning. Ändra igen med tangentbord.
   Under väntande sparande ska fokus vara kvar och ytterligare ändring
   inte ske. Läs sparbeskedet när svaret kommer.
3. Slå av **Visa bakgrund** med mellanslag. Val och rörelse ska vara
   inaktiva med samma värden kvar. Tab ska nå **Läs in min aktuella vy**
   utan att stanna i inaktiva fält. Slå på igen.
4. Aktivera systemets minskade rörelse. Läs förklaringen. Båda
   bakgrundsväljarna ska gå att nå; rörelsereglagen och
   **Återställ rörelse** ska vara inaktiva. Tabba från den mörka väljaren
   till **Läs in min aktuella vy**.
5. Växla mellan ljust och mörkt tema. Rulla till alla inställningar utan
   horisontell sidrullning. Ladda om och kontrollera samma sparade val.
6. Återgå till kartan. Öppna **Navigera** med tangentbordet och panorera
   med knappen. Stäng navigeringen och aktivera **Återställ vy**. Kartan
   återställs medan sparade bakgrundsval och rörelsevärden består.
7. Öppna **Navigera** igen. Fokusera Läsobjekt 00, tryck Skift+F10 och
   peka på **Visa uppgifter för Läsobjekt 00**. Peka på det främre
   uppgiftsfönstrets stängknapp och sedan navigeringens stängknapp. Båda
   ska kunna stängas utan att fönstren först dras åt sidan.

**Förväntat resultat:**

- Kontroller har namn, logisk tabbordning och synligt fokus. Inaktiva
  fält hoppas över. Fokus på en aktiv kontroll består genom sparandet.
- Regler för av och minskad rörelse följs. Bakgrundsvalen skrivs inte över
  av systeminställningen. Väntande sparande presenteras innan bekräftelsen.
- Inställningarna ryms vid 320 CSS-pixlar i båda teman. Rullning i höjdled
  når alla fält. Omladdning visar bekräftade värden.

Sparfel och konflikt har separata ordinarie prov, PLACERING-02 och
PLACERING-13, i [personliga placeringar](personal-view.md).
De skyddar återgång till
bekräftade val och besked om avvisad ändring; upprepa dem vid ändrat
sparflöde.

## Verklig utrustning

### BAKGRUND-08: Fysisk pekskärm, förstoring och längre bruk

**Syfte:** Bedöma fysisk användning som syntetiska händelser inte visar.

**Användare:** Alex Exempel med fysisk mobil och dator med förstoring.

**Förutsättningar:** Båda kartstorlekarna och samtliga sju bakgrunder.
Anteckna enhet, grafik, OS, webbläsare, faktisk zoom och provets längd.

**Kräver mänsklig observation:** Verkliga pekgester, läsning med 400 procent
webbläsarzoom samt längre användning på den valda utrustningen.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Peka, dra, nyp och läs med verklig mobil och 400 procent webbläsarzoom under längre bruk."
  },
  "reference": "Fysisk mobil, dator med 400 procent zoom, 16/80 objekt och sju bakgrunder.",
  "outcomes": [
    "Inställningar och alternativa textvägar är användbara med verklig inmatning och förstoring.",
    "Kvarstående överlappningar, skymda kontroller och besvär redovisas per enhet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Prova kontrollerna och läsvägarna i BAKGRUND-06 och BAKGRUND-07 med
   pekning på fysisk mobil. Öppna objektmenyn med långtryck, eller använd
   **Tabell** när markörer överlappar. Prova panorering, rotation och
   nypzoom samt navigeringsknapparna som alternativ till dragning.
2. Utför inställningsflödet på dator med 400 procent webbläsarzoom från en
   1280 CSS-pixlar bred vy vid normal zoom. Kontrollera att alla fält nås
   utan sidledes rullning och att fokus inte döljs av paneler.
3. Använd kartan en längre stund. Anteckna längd, läsbarhet, trötthet,
   respons och konkreta hinder. Redovisa varje observation som Godkänt,
   Underkänt eller Ej utfört.

**Förväntat resultat:** Kontroller och textalternativ förblir användbara.
Hinder i tät karta och öppna panelers täckning redovisas utan att döljas.
Ett automatiskt prov får inte registreras som utförd fysisk observation.

Skärmläsaruppläsning ingår inte i de automatiska resultaten. Om den provas
separat ska faktiskt hjälpmedel, version, hörda namn, tillstånd,
sparbesked, fel och konflikter redovisas. Ingen fullständig
WCAG-överensstämmelse följer av dessa begränsade kontroller.
