# Följ installationens månadskostnad

[Till användarguidens innehåll](README.md)

Den här sidan är till för installationens driftansvarige. Logga in med den
identitet som är konfigurerad för det ansvaret och välj **Månadskostnad** i
sidhuvudet, eller öppna `/costs`. Du behöver inte vara medlem i ett hushåll.
Att vara hushållsadministratör ger inte i sig tillgång till kostnadsöversikten.

## Läs underlaget

Välj **Månad (UTC)**. Ett modellförsök räknas till månaden när det startar,
även om det avslutas senare. Vyn gäller hela installationen och skiljer på:

- **Render – hel månad:** ett antagande för en hel månads tjänst, tilldelad
  disk och arbetsyta. Det är inte uppmätt modellförbrukning eller en
  automatisk avläsning av ditt Render-abonnemang.
- **Live – uppmätt hittills:** rapporterade sekunder och uppskattad kostnad
  för talet. Prisuppskattningens sekunder visas separat eftersom en antagen
  minimitid kan vara längre än den rapporterade tiden.
- **Terra – uppmätt hittills:** registrerade token och uppskattad kostnad
  för textassistenten, även när den arbetar bakom ett talärende.
  Resonemang ingår i utdata och läggs inte till en gång till.

Beloppen visas i SEK och USD. **Prisunderlag** visar använda modellpriser,
kontrolldatum, källor och valutakurs. Öppna detaljerna för att se priserna
för cache och långa anrop. Sparade modellpriser följer respektive anrop;
månadens valutakurs används för den visade omräkningen.
Om leverantören inte anger modell eller servicenivå visar vyn att begärd
Terra-modell respektive Standardnivå används som prisantagande.

**Delsumma för beräkningsbara delar** betyder att summan är ofullständig.
Saknade mätvärden, saknade slutvärden och delar som inte går att prissätta
visas vid den berörda modellen. De är okända belopp, inte nollkostnad. Även
en månad som börjar före registreringen har en synlig lucka. Förbrukning
som ännu inte har registrerats kan tillkomma.

Översikten är inte leverantörens slutliga faktura. Render-antagandet gäller
hela månaden medan modellförbrukningen kan avse bara en del av månaden.
Extra trafik, byggen, domäner, andra tjänster, skatt och krediter ingår inte
i driftantagandet. Cirka 200 kronor per månad är ett riktmärke, inte ett tak
eller en automatisk spärr för kartarbetet.

## Ändra månadens antaganden

Välj **Ändra månadens antaganden**, kontrollera **SEK per USD** och ange
månadens tjänst, tilldelade disk och arbetsyta. Namnet **Render-arbetsyta**
ändrar inte priset automatiskt: fyll också i **Arbetsyta (USD/månad)** med
den del som ska räknas till installationen. Förvalet 10 SEK per USD är en
uppskattning, inte en aktuell hämtad valutakurs.

Välj **Spara månadens antaganden**. Ändringen gäller bara den valda månaden
och ändrar inga tjänster hos leverantören. Sparade antaganden och deras
tidigare versioner återkommer efter omladdning och normal serveromstart.
Första visningen eller mätningen sparar månadens förvalda antaganden
automatiskt. Den versionen är inte ett godkännande från driftansvarig.
**Tidigare antaganden för månaden** visar versionerna och när de sparades.

Om någon annan ändrar samma månads antaganden kan sparandet stoppas.
Välj då **Uppdatera underlaget**, granska den aktuella versionen och öppna
redigeringen igen. Om sparresultatet är okänt efter ett avbrott, hämta och
kontrollera de aktuella antagandena innan du försöker spara igen.

## Uppdateringar och fel

Vyn hämtar nytt underlag regelbundet medan sidan är synlig och när du
återvänder till fönstret. **Uppdatera underlaget** hämtar direkt.
Oskickade ändringar i antagandena bevaras vid vanlig uppdatering. Ett byte
av månad eller **Stäng redigering** stänger däremot den osparade redigeringen.

Vid anslutningsfel behålls äldre kända belopp med ett tydligt besked om
att underlaget är inaktuellt. Om registreringen har haft ett fel sedan
senaste serverstart visas en varning om att fler mätvärden kan saknas.
Ett nytt lyckat anrop kan
ge ett mer fullständigt underlag; ett upprepat mätvärde räknas inte dubbelt.
Om åtkomsten försvinner tas kostnadsuppgifterna bort från vyn.

Kostnadsunderlaget innehåller bara tekniska mätvärden och antaganden.
Hushållstexter, bilder, token för inloggning, ljud och fullständiga samtal
sparas inte för kostnadsuppföljning. Se
[driftguiden](../operations/costs.md) för prisuppdateringar, begränsningar
och felsökning av registreringen.
