# Manuella testfall för rymdkartan

Testfallen omfattar gemensam redigering, navigering och bevarad text i
lista och rymdkarta. Anteckna commit, webbläsare, enhet, fysisk eller
emulerad inmatning samt godkänt eller underkänt resultat vid körning.
Fysiska enhetsprov och hjälpmedelsprov följs separat i
[uppföljningen för manuella prov](https://github.com/viscalyx/skyttel/issues/97).

## Konfigurerade användare

Alex Exempel är inloggad medlem i ett separat provhushåll. Använd bara
påhittade uppgifter. Administratörsrollen behövs inte för kartarbetet.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

1. Starta en isolerad installation enligt
   [provförberedelsen](../development/devcontainer.md#disposable-local-database).
   Använd ett nytt
   provhushåll mellan fallen så att inget tidigare utkast finns kvar.
2. Skapa förslag för personen Lo Exempel och tjänsten Molnmusik. Lägg vid
   behov till sambandet Lo Exempel → Använder → Molnmusik. Lämna förslagen
   osparade om fallet inte uttryckligen säger annat.

RYMD-10 använder i stället sin egen förberedelse med ett nytt provhushåll.

## Gemensam redigering

### RYMD-01: samma utkast och beständiga sparande i båda vyerna

**Syfte:** Prova att rymdkartan använder samma uppgifter som listan.

**Användare:** Alex Exempel.

**Förutsättningar:** De två objektförslagen finns i eget utkast.

**Integrationstest:**
[spatial.spec.ts](../../tests/integration/spatial.spec.ts),
testfallet “RYMD-01: spatial and list editing share private proposals and one
durable save”.

**Steg:**

1. Öppna rymdkartan och välj Molnmusik. Kontrollera att kartan ligger
   kvar. Öppna Lista, välj **Uppgifter för Molnmusik** och sedan
   **Redigera valt objekt**. Skriv **Molnmusik familj** som namn.
2. Välj **Stäng arbetsytan** och öppna Lista igen. Välj **Molnmusik**
   genom **Öppna paneler**. Kontrollera texten och lägg den i utkastet.
3. Granska och spara hela utkastet. Starta om appen och öppna kartan igen.

**Förväntat resultat:**

- Namntexten finns kvar vid vybytet. Förslagen ändrar inte sparad karta.
- Ett samlat sparande ger kvitto. Båda objekten och det rättade namnet
  finns kvar efter omstart, i både lista och karta.

### RYMD-02: fokus och filter ändrar urvalet med bevarad kamera

**Syfte:** Prova riktade samband, fokus och kamerans separata kontroller.

**Användare:** Alex Exempel.

**Förutsättningar:** De två objekten och användningssambandet finns.

**Integrationstest:**
[spatial.spec.ts](../../tests/integration/spatial.spec.ts),
testfallet “RYMD-02: focus, filters and camera navigation preserve the shared
selection”.

**Steg:**

1. Öppna rymdkartan. Kontrollera pilen från Lo Exempel till Molnmusik
   före och efter rotation och panorering. Välj
   Lo Exempels runda symbol. Kontrollera att sambandets etikett visas.
   Öppna Lista, filtrera på Person och kontrollera att tjänsten döljs.
2. Välj Visa hela rymden, högerklicka Lo Exempel och välj Visa kopplingar.
   Kontrollera
   fokus utan att objektmenyn öppnas. Rulla lodrätt över tom rymd,
   objektsymbolen och namnet. Kontrollera att alla tre panorerar likadant.
3. Panorera med knappen under Navigera. Välj Visa hela rymden.
4. Sök efter Lo. Flytta tangentbordsfokus till en kameraknapp och tryck
   Escape. Kontrollera att sökningen finns kvar. Flytta fokus till själva
   kartytan och tryck Escape; kontrollera att sökningen nu är tom.
5. Fokusera Lo Exempel igen, sök efter Lo och filtrera på Person. Välj
   Återställ vy och fäll ihop Navigera. Öppna Lista och Filter och
   kontrollera tom sökning och avmarkerad Person. Återgå till kartan,
   välj Alla etiketter och sedan användningssambandets etikett.

**Förväntat resultat:**

- Pilspetsen syns utanför målets runda symbol, även efter kamerarörelse.
  Riktning och rätt ändobjekt syns. Sambandets etikett visas när ett
  anslutet objekt väljs eller Alla etiketter är på. Fokus visar direkta
  samband.
- Visa hela rymden rensar filter och fokus med bibehållen kamera.
- Escape från en kameraknapp bevarar sökningen. Escape på kartytan
  rensar den. Sambandet öppnar rätt detaljer med Molnmusik som mål.
- Återställ vy rensar även fokus, sökning och typfilter och ramar in hela
  kartan.

### RYMD-03: menyer och symboler visar ändringar före sparande

**Syfte:** Skilja förslag från sparad karta och kasta vanlig borttagning.

**Användare:** Alex Exempel.

**Förutsättningar:** De två objekten och användningssambandet är förslag.

**Integrationstest:**
[spatial.spec.ts](../../tests/integration/spatial.spec.ts),
testfallet “RYMD-03: context actions and draft symbols distinguish proposals
from saved content”.

**Steg:**

1. Öppna kartan, välj Alla etiketter och kontrollera plusmarkeringarna.
   Visa utkastet och spara.
2. Högerklicka Molnmusik och välj Redigera objekt. Lägg en ändrad
   beskrivning i utkastet. Gå tillbaka till kartan.
3. Kontrollera bärnstensfärgad penna och öppna menyn via objektets namnetikett.
   Läs att objektet och ett samband läggs som borttagningar i utkastet.
   Välj Ta bort objekt.
4. Kontrollera objektet, sambandet och hela ändringslistan. Kasta utkastet.

**Förväntat resultat:**

- Nytt innehåll har grönt plus, ändringar bärnstensfärgad penna och
  borttagningar rött kryss. Objektens namn visas bredvid de runda symbolerna.
- Samband som föreslås tas bort visas med en böjd, streckad linje.
- Borttagningen omfattar det anslutna sambandet direkt i utkastet.
  Sparad karta och det andra objektet ändras inte.
- Kasta hela utkastet återgår till sparad karta utan historisk ångring.

## Inmatning och återhämtning

### RYMD-04: pekmeny och grafikavbrott bevarar oskickad text

**Syfte:** Prova långtryck, orientering och fortsatt redigering vid avbrott.

**Användare:** Alex Exempel.

**Förutsättningar:** Telefon eller emulerad pekinmatning, minskad rörelse
påslagen och de två objektförslagen i eget utkast.

**Integrationstest:**
[spatial.spec.ts](../../tests/integration/spatial.spec.ts),
testfallet “RYMD-04: touch menus, viewport changes and graphics recovery retain
unsent editing”.

**Steg:**

1. Kontrollera att rymdkartan är startläge. Håll
   på Molnmusik tills menyn visas. Släpp och välj Redigera objekt.
2. Skriv Oskickad mobiltext i beskrivningen. Vänd enheten, välj Till
   kartan och byt vy.
3. Öppna kartan igen. Använd webbläsarens verktyg för att simulera förlust
   och återställning av WebGL-kontext, eller kör det länkade automatiska
   provet för detta avbrott. Anteckna separat vad som faktiskt provas.
4. Öppna detaljerna, kontrollera texten, lägg den i utkastet och spara.

För ett avbrott i Chromes utvecklarkonsol, med kartan öppen:

```javascript
const skyttelGraphics = document.querySelector('canvas')
  .getContext('webgl2').getExtension('WEBGL_lose_context');
skyttelGraphics.loseContext();
setTimeout(() => skyttelGraphics.restoreContext(), 4000);
```

**Förväntat resultat:**

- Fingersläppet väljer inte någon menyåtgärd. Kartan ryms i tillgänglig
  webbyta i båda orienteringarna och listan kan nås.
- Avbrottsbeskedet förklarar att utkastet finns kvar. Detaljerna behåller
  oskickad text. Texten är inte sparad förrän utkastet sparas med kvitto.

### RYMD-05: etiketter och tangentbord behåller sambandets formulär

**Syfte:** Prova etikettläge och redigering utan rumsliga gester.

**Användare:** Alex Exempel.

**Förutsättningar:** De två objekten och användningssambandet finns.

**Integrationstest:**
[spatial.spec.ts](../../tests/integration/spatial.spec.ts),
testfallet “RYMD-05: labels, keyboard editing and relationship text survive view
changes”.

**Steg:**

1. Öppna kartan och välj Lo Exempels runda symbol. Kontrollera namn,
   typikoner och sambandets etikett. Välj Alla etiketter, slå av och på
   valet igen och kontrollera att kameran står kvar. Panorera och välj
   Återställ vy.
2. Öppna Lista och välj **Uppgifter** för Lo Exempel med tangentbord.
   Kontrollera rubrikfokus i objektpanelen. Återgå till Lista och prova
   tabbordningen markering, namn, Uppgifter, Redigera och Ta bort; gå även
   bakåt från Uppgifter till markeringen. Återgå till objektpanelen.
   Välj **Redigera valt objekt**,
   läs att objektet och ett samband läggs som borttagningar i utkastet.
   Kontrollera rätt formulär och stäng utan ändring.
3. Välj sambandet i listan med tangentbord och välj Redigera. Ange känt slutdatum
   2026-12-31 utan att skicka formuläret.
4. Öppna kartan, ändra fönsterstorlek och öppna detaljer och utkast.
5. Kontrollera datumet, lägg sambandet i utkastet och spara hela utkastet.

**Förväntat resultat:**

- Alla etiketter ger ett närmare panorerbart utsnitt. Återställ vy ger
  överblick igen och behåller valet Alla etiketter. Objektnamn ligger nära
  sina runda symboler och stödlinjer visar anknytningen.
- Tangentbordsvägen öppnar rätt samband. Oskickat slutdatum finns kvar
  efter vybyte och blir beständigt först vid det samlade sparandet.

### RYMD-06: förlorad tillgång lämnar helskärmen och visar inloggningsvägen

**Syfte:** Prova att en nekad ändring inte låser navigationen.

**Användare:** Alex Exempel som medlem; en annan administratör återkallar
tillgången från en separat inloggning.

**Förutsättningar:** Alex har öppnat Molnmusik i helskärmskartan och
skrivit oskickad text. Administratören kan administrera hushållet.

**Integrationstest:**
[spatial.spec.ts](../../tests/integration/spatial.spec.ts),
testfallet “RYMD-06: losing household access in fullscreen restores login
navigation”.

**Steg:**

1. Återkalla Alex tillgång från administratörens separata inloggning.
2. Försök lägga Alex oskickade text i utkastet innan nästa omladdning.
3. Läs beskedet och välj Logga ut i den vanliga sidans navigation.

**Förväntat resultat:**

- Ändringen nekas, privata uppgifter döljs och helskärmsläget lämnas.
- Navigationen kan användas omedelbart. Utloggning visar inloggningssidan
  utan kvarvarande oskickad text.

## Uppgifter över tid

### RYMD-07: upphörda uppgifter behåller status bredvid ändringssymboler

**Syfte:** Skilja upphört från förslag i rymdkartans objekt och samband.

**Användare:** Alex Exempel.

**Förutsättningar:** De två objekten och användningssambandet är förslag.

**Integrationstest:**
[spatial.spec.ts](../../tests/integration/spatial.spec.ts),
testfallet “RYMD-07: ended objects and relationships retain status beside
draft symbols”.

**Steg:**

1. Välj Molnmusik i listan och Redigera, välj status Upphört och lägg
   i utkastet.
2. Välj Lo Exempel och Redigera. Ange ett känt slutdatum i det förflutna under
   Ekonomiska uppgifter och avtalsvillkor, välj Gäller fortfarande och
   lägg i utkastet.
3. Välj användningssambandet och Redigera. Ange ett känt slutdatum i det förflutna,
   behåll Följ slutdatum och lägg sambandet i utkastet.
4. Öppna rymdkartan, välj Alla etiketter och kontrollera objektens och
   sambandets etiketter.
5. Öppna Utkast och historik, spara hela utkastet, starta om appen och
   öppna rymdkartan igen.
6. Välj sambandets etikett, Lista och Redigera valt samband.
   Välj Gäller fortfarande
   och lägg sambandet
   i utkastet. Gå tillbaka till kartan.

**Förväntat resultat:**

- Molnmusik visar Upphört vid namnet och grönt plus vid den runda symbolen.
  Sambandets etikett visar både Upphört och plus. Status och förslag har
  olika färger. Lo Exempel visar inget Upphört trots slutdatumet.
- Namn, typikon och riktning är fortfarande begripliga. Upphört finns
  kvar efter sparande och omstart; plusmarkeringarna försvinner.
- Sambandets rättelse visar amberfärgad penna och tar bort dess
  Upphört-markering.
  Molnmusiks status påverkas inte.

### RYMD-08: fokusera och granska tidigare och föreslagna samband

**Syfte:** Förstå en ändrad betalare utan att ändra det sparade sambandet.

**Användare:** Alex Exempel.

**Förutsättningar:** Lo Exempel, Kim Exempel och Molnmusik är sparade.
Lo Exempel → Betalar → Molnmusik är ett sparat samband. Ett förslag ändrar
betalaren till Kim Exempel.

**Integrationstest:**
[spatial.spec.ts](../../tests/integration/spatial.spec.ts),
testfallet “RYMD-08: focus retains old and proposed relationship endpoints
and opens the saved route read-only”.

**Steg:**

1. Öppna kartan, högerklicka Molnmusik och välj Visa kopplingar.
2. Kontrollera Lo Exempel och Kim Exempel med båda betalningssambanden.
3. Välj den tidigare etiketten Lo Exempel → Betalar → Molnmusik med ×.
4. Läs Tidigare samband. Högerklicka sedan Kim Exempel, välj Visa
   kopplingar och därefter det föreslagna betalningssambandet.

**Förväntat resultat:**

- Molnmusiks fokus visar både sparad och föreslagen betalare.
- Den böjda tidigare linjen och etiketten leder till läsbara tidigare
  värden utan redigeringsfält. Fokus på Molnmusik behålls vid valet.
- Det föreslagna sambandet visar Kim som betalare. Redigera valt samband
  öppnar formuläret med Kim som Från objekt. Granskningen ändrar inga
  uppgifter i utkastet eller den sparade kartan.

### RYMD-09: täta mobilutsnitt och valbara etiketter

**Syfte:** Välja tätt placerade objekt utan att flytta dem eller kameran.

**Användare:** Alex Exempel.

**Förutsättningar:** Skapa och spara åtta objekt med namnen Nära objekt 1
till Nära objekt 8 utöver Lo Exempel och Molnmusik. Lägg till sambandet
Nära objekt 7 → Använder → Nära objekt 8. Använd personlig flyttning så att
de ligger nära varandra i ett utsnitt. Använd 390 och
320 pixlars bredd. Upprepa med webbläsarens zoom på 200 och 400 procent.

**Integrationstest:**
[spatial.spec.ts](../../tests/integration/spatial.spec.ts), testfallet
“RYMD-09: dense mobile maps offer separate pointer and keyboard targets with
selected label priority and text alternatives”.

**Steg:**

1. Öppna rymdkartan. Välj ett tätt placerat objekt med dess namnetikett.
   Kontrollera att samma objekt markeras utan att kartans utsnitt flyttas.
2. Använd Tab och Enter för att markera ett annat kartobjekt. Kontrollera
   att dess etikett prioriteras och kan läsas. Välj Nära objekt 8 och
   därefter dess samband från Nära objekt 7. Sambandets etikett ska vara
   synlig och valbar utan att täckas av objektnamn eller flytta kartan.
3. Öppna Lista och markera Nära objekt 1 i listan. Läs och arbeta vidare
   utan att använda kartgrafik, tal eller ljud. Vid ett grafikavbrott ska
   samma listarbete fortfarande fungera.
4. Återgå till kartan och kontrollera att alla objekt finns kvar och att
   deras placeringar består. Upprepa vid den andra bredden och med zoom.

**Förväntat resultat:**

- Etiketter ger separata träffytor med linjer till objektens riktiga lägen.
- Urval prioriteras när alla namn inte ryms. Listan ger tillgång till alla
  objekt och urval även utan grafik.
- Varken valet eller de nya etikettlägena ändrar objektens personliga
  placeringar, hushållets information eller kamerans utsnitt.

### RYMD-10: etikettinformation bevarar karta och lista vid vybyte

**Syfte:** Prova att information om dolda etiketter förblir läsbar utan
att hindra fortsatt arbete i en kompakt karta.

**Användare:** Alex Exempel.

**Förutsättningar:** Använd ett nytt provhushåll. Skapa och spara personen
Kim Exempel, abonnemanget Familjens Molnmusik med beskrivningen Rättad för
hand och sambandet Kim Exempel → Betalar → Familjens Molnmusik. Skapa sedan
personen Robins notering i ditt privata utkast utan att spara. Använd en
kompakt vy, exempelvis 640 × 500 CSS-pixlar eller motsvarande verklig
webbläsarzoom. Olika automatiska placeringar kan ge olika antal dolda namn.

**Integrationstest:**
[spatial.spec.ts](../../tests/integration/spatial.spec.ts),
testfallet “RYMD-10: label notices remain stable while a compact map opens
its saved and private list”.

**Steg:**

1. Öppna kartan, stäng eventuell vägledning och ladda om sidan. Öppna
   Lista och välj **Uppgifter för Familjens Molnmusik**. Läs beskrivningen.
2. Öppna Lista igen och välj **Lista och utkast** i **Öppna paneler** om
   detaljpanelen fortfarande är aktiv. Kontrollera Robins notering.
3. Stäng arbetsytan och välj Kim Exempel i kartan. Kontrollera att namnet
   går att läsa och välja. Om information om dolda etiketter visas får den
   inte täcka namnens träffytor.
4. Minska vyn till ungefär 320 × 250 CSS-pixlar. Öppna **Visningsval**,
   slå på **Alla etiketter** och kontrollera att samtliga tre namn finns.
   Slå av valet och stäng Visningsval. Återställ den större vyn och öppna
   Lista igen.

**Förväntat resultat:**

- Karta, detaljer och lista fortsätter att fungera utan en tom sida eller
  växlande etikettinformation som hindrar arbetet.
- Den synliga informationen anger antalet dolda etiketter. När ingen
  information behövs visas ingen tom informationsruta.
- Visningsval går att öppna och stänga i den korta vyn. Vid återgång blir
  visningskontrollerna åtkomliga igen.
- De två sparade objekten och sambandet består. Robins notering förblir
  ett privat förslag och den sparade beskrivningen ändras inte.
