# Kartbakgrundens respons och stabilitet

Den här planen är för utvecklare och provare som jämför hela kartans
respons, bildrutor och stabilitet med bakgrunder. Använd påhittade uppgifter.
Anteckna commit, byggd klient, webbläsare, grafikdrivrutin, enhet och resultat.
En smal datorvy ersätter inte en fysisk mobil.

## Mätning

Kör separat från andra tester för att undvika konkurrerande belastning:

```sh
MAP_BACKGROUNDS=1 MAP_REPORT=/tmp/backgrounds.json npm run measure:map
```

Kommandot bygger produktionsklienten och använder den riktiga applikationen
med en tillfällig SQLite-installation. Inloggningsleverantören är ersatt;
inga riktiga hushåll, modell- eller röstanrop används. Det vanliga läget
för 500 objekt och dess gränser behålls när `MAP_BACKGROUNDS` utelämnas.

Matrisen innehåller 16 respektive 80 objekt med samband, 1440 × 960 och
390 × 844, alla sju bakgrunder samt av i varje tema. Navigering och ett
objekts uppgifter är öppna. Varje kombination värms före två omgångar med
12 navigeringshandlingar. `MAP_RUNS` och `MAP_FRAME_SAMPLES` ändrar antalet.
Handlingen är **Rotera vänster**, med den vanliga knappens Enter-handling.
`MAP_APPEARANCES=off,universe` begränsar ett felsökningsprov; det ersätter
inte hela matrisen. `MAP_HEADED=1` öppnar den installerade Chromium på den
aktuella datorns skärm. Kontrollera rapportens faktiska grafikprocessor;
ett synligt fönster bevisar inte hårdvaruacceleration.
Smal vy använder samma datorwebbläsare med pixeltäthet 1 och utan
mobil- eller pekemulering. Verkliga mobiler kan ha högre pixeltäthet och
annan bildskärmsfrekvens; motsvarande kostnad ingår inte i detta prov.

Rapporten skiljer mellan tre mått, alla i millisekunder:

- Respons: från tangenttryckningens avsändande tills en hel PNG-bild av
  sidan är färdig. Kartans verkliga canvas, SVG, etiketter och öppna
  paneler ingår, liksom inmatning, bildkodning och överföring. Det är en
  konservativ observerad svarstid, ingen ren knapphanterartid.
- Bildrutans pipeline: Chromium-spårningens `PipelineReporter` från
  bildrutans början till helt presenterat resultat (`STATE_PRESENTED_ALL`).
  Delvis presenterade och tappade försök redovisas separat; de räknas inte
  som en helt uppdaterad karta. Råa händelser, tillstånd,
  antal, median och närmaste rang för 95-percentilen sparas. Resultatet
  omfattar webbläsarens bildrutepipeline, ingen fysisk skärms fördröjning.
- Bildfångstens takt: tidsavstånd mellan kompositorns bildfångster.
  Seriella PNG-bilder och inmatningspauser ingår. Detta mått är varken
  en ren renderingstid eller ett mått på grafikprocessorns kapacitet.

Bildfångst och spårning påverkar belastningen. Jämför samma metod och miljö.
Rårapporten innehåller grafikidentifiering, operativsystem, CPU, synliga
resursgränser, byggda filers kontrollsummor och enskilda observationer.
JavaScript-observation av skapade och frigjorda WebGL-resurser samt heap
efter skräpinsamling redovisas under upprepade val. Det är antal levande
resurser, inte en mätning av grafikminne eller ett bevis mot alla läckor.

Se [mätresultat och numerisk budget](background-performance-results.md).
`MAP_CALIBRATE=1` skriver ett referensunderlag utan att tillämpa budgeten;
rapportens `targetsMet` blir då `null`, aldrig ett godkänt budgetprov.
Använd det för en uttrycklig referensmätning i en ny miljö. Ändra inte
budgetgränser för att dölja ett misslyckat regressionsprov.
Använd samma metod på en dator med riktig grafikacceleration. Prova också
en fysisk mobil med verkliga pekgester och längre bruk. Redovisa modell,
operativsystem, webbläsare, drivrutin, temperatur och strömläge. Separera
SwiftShader från fysisk grafik. Prov i utvecklingsbehållaren ger inget
löfte om fysisk mobilprestanda.

## Konfigurerade användare och förberedelse

Använd en Skyttel-användare med tillgång till ett separat provhushåll.
Förbered 16 påhittade objekt och samband enligt
[bakgrundsfallens förberedelse](background.md#allmän-förberedelse).
Välj **Karta** så att rymdkartan visas. Börja med systemets minskade rörelse av.
Återställ vyn mellan bakgrunderna; behåll personliga placeringar.

### BAKGRUND-05: Alla bakgrunder behåller navigering och stabilitet

**Syfte:** Upptäcka felaktigt återanvända bakgrundsbilder, oavsiktlig
animation och förlorad orientering eller placering vid bakgrundsbyten.

**Användare:** Provhushållets Skyttel-användare.

**Förutsättningar:** Förberedelsen ovan, datorvy och 16 objekt.

**Automatiskt motsvarande test:**
[background-stability.spec.ts](../../tests/integration/background-stability.spec.ts),
BAKGRUND-05. Provet använder den riktiga applikationen och tillfällig
SQLite. Jämförelsen använder endast bakgrundspixlar som är fria från
DOM-överlägg i båda bilderna. Varje motiv får en kort kontroll av rotation,
panorering, zoom, återställning och av/på. Objektflyttning provas en gång
före bytena; den sparade placeringen kontrolleras för alla motiv.
Nollstyrkor, lageravstånd och vanlig navigering provas en gång i
[PLACERING-14](personal-view.md#placering-14-rörelseinställningar-och-vanlig-navigering).
Hela varv och zoomens ytterlägen provas separat som tekniskt underlag i
[spatial-scene.test.tsx](../../tests/browser/spatial-scene.test.tsx).
Bildigenkänning av motiven och fysisk pekrespons bedöms separat.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/background-stability.spec.ts",
    "caseId": "BAKGRUND-05"
  },
  "reference": "16 objekt, datorvy, en objektflyttning och en kort navigerings- och byteskontroll per bakgrund.",
  "outcomes": [
    "Bakgrunden är stilla utan kamerahandlingar och återställning ger samma vy.",
    "Objektflyttning lämnar bakgrunden stilla.",
    "Bakgrundsbyten och av/på bevarar kamera och personliga placeringar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj **Pärlemor** i ljust tema. Markera **Provobjekt 00**, öppna
   **Navigera → Ordna min vy** och flytta objektet uppåt med knappen.
   Kontrollera att bakgrunden står stilla och placeringen sparas.
   Avmarkera objektet med Enter på dess markör.
2. Välj varje bakgrund genom **Inställningar → Rymdkartan** och dess tema.
   Återgå till kartan och öppna **Navigera**. Välj **Återställ vy** vid behov.
3. Kontrollera att bakgrunden står stilla utan navigering. Tryck två gånger
   på **Rotera vänster**, två gånger på **Panorera höger** och två gånger
   på **Zooma in**. Kontrollera synlig bakgrundsrespons efter varje reglage.
   Välj **Återställ vy** och jämför med ursprungsbilden.
4. Växla **Visa bakgrund** av och på en gång för samma bakgrund.
   Kontrollera att objektens lägen, den sparade placeringen och kamerans
   orientering behålls. Upprepa steg 2–4 för alla sju bakgrunder.

**Förväntat resultat:**

- Varje bakgrund följer rotation, panorering och zoom; återställning ger
  samma bild som före kamerahandlingarna.
- Ingen självständig animation, skarv, tom bakgrund eller tappad karta uppstår.
- Bakgrundsbyten och av/på bevarar den personliga placeringen.

Den visuella jämförelsen av sand, yta och de sex djurformerna hör till
[bakgrundsfallen](background.md). Täta kartors överlappningar bedöms
separat; detta fall lovar inte fria pekmål för dem.
