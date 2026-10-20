# Förbered objektlistor på verkliga enheter

Denna förberedelse används av LISTA-09 och SÖK-16. Den ger samma påhittade
uppgifter och sparade/föreslagna betydelser som deras delegerade fall.
De lokala kommandona används bara på datorn för att framställa provarkiv.
Telefoner öppnar en vanlig HTTPS-installation och loggar in genom en
verklig identitetsleverantör.

## Ordinarie HTTPS, inloggning och hushåll

Följ hela
[förberedelsen för verkliga enheter](../development/testing.md#physical-device-manual-preparation).
Använd en separat, vanlig provinstallation på samma commit och skapa ett
tomt provhushåll som dess verkliga administratör. Anteckna hushållets
fullständiga HTTPS-adress. Logga in som samma verifierade Skyttel-användare
på förberedelsedatorn och på varje enhet. Användaren motsvarar rollen Alex
Exempel i fallen; objektet Alex i läskedjan är fortfarande påhittat.
Kontrollera tillgången och adressen på iPhone och iPad innan provdata läggs
in. Certifikat, inloggning och medlemskap måste fungera även när datorns
lokala syntetiska installation är avstängd.

Öppna **Din profil** på HTTPS-installationen och anteckna användarens ID
privat. Denna verifierade nuvarande medlem ska få provarkivets påhittade
privata innehåll genom en uttrycklig innehållskoppling. Den syntetiska
användaren och den verkliga personen påstås inte vara samma identitet.
Ingen modell- eller röstnyckel behövs. Öppna **Skriv till Skyttel** för
utkast eller oskickad text utan att starta något samtal.

## Framställ tre fullständiga provarkiv på datorn

Kör ett kommando i taget efter `npm run build`. Öppna den utskrivna lokala
adressen på datorn och välj Google för den syntetiska administratören.
Använd inte dessa adresser på telefonerna.

<!-- markdownlint-disable MD013 -->
| Arkivnamn efter nedladdning | Befintlig förberedelse | Delegerade fall |
| :-- | :-- | :-- |
| `laskedja.zip` | `node --import tsx scripts/manual-household-reading.ts` | LÄS-01, LÄS-02, LÄS-07 |
| `sokning.zip` | `node --import tsx scripts/manual-household-table.ts --search` | SÖK-03, SÖK-05, SÖK-10 |
| `storkarta.zip` | `MAP_PAUSE=1 npm run measure:map` | LISTA-05 |
<!-- markdownlint-enable MD013 -->

För varje start:

1. För läs- och sökarkiven öppnar du **Din profil** och antecknar den
   syntetiska användarens ID privat.
   Öppna sedan **Inställningar → Koppla historiskt innehåll → Hämta aktuella
   innehållskopplingar**. Välj den historiska identitet vars **Nuvarande
   koppling** visar just profilens användar-ID. Anteckna dess stabila
   historiska ID tillsammans med arkivnamnet, utan att ändra kopplingen.
   Kontrollera historiskt innehålls-ID separat från profilens användar-ID;
   anta inte att de sammanfaller. Namnet räcker inte. Återgå till hushållet.
   För storkartan behövs ingen historisk innehållskoppling: förberedelsen
   innehåller bara gemensamma fakta. Ändra inga placeringar eller egna
   visningsval före dess export.
2. Kontrollera utgångspunkten enligt rätt familj nedan. Behåll läs- och
   sökkommandonas privata förslag; kasta eller spara dem inte. Storkartan
   har inget utkast vid kommandots paus.
3. Välj **Inställningar → Fullständig export → Förbered fullständig export**.
   Invänta **Exporten är klar att hämta** och välj **Hämta ZIP-fil**.
   Kontrollera den färdiga filen i datorns nedladdningar och byt namn enligt
   tabellen. Förvara arkiven och anteckningen med ursprungliga ägar-ID
   i en separat privat provmapp.
4. För läs- och sökkommandona skriver du `quit`. Vid storkartans paus
   trycker du Enter först efter exporten och låter kommandot avsluta sina
   mätningar och rensa sin tillfälliga installation. Senare ändringar
   påverkar inte den redan hämtade filen.

Använd **--search**, inte standardkommandot eller **--details**, för
sökarkivet. **--details** hör till TABELL-02 och har andra privata
preciseringar. Läskedjan behöver sitt eget kommando; LISTA-05 behöver
den kompletta kartan med 500 objekt och 1 500 samband.

Fullständig export innehåller gemensamma uppgifter och privata utkast,
bilder och vyer. Alla fria egenskaper går att läsa och redigera på sina
respektive objekt och samband. Bevara hela originalförberedelsen i arkivet.
Import tilldelar inte automatiskt den verkliga användaren det privata
arbetet: det krävs en uttrycklig koppling till det verifierade kontot.

## Återställ och koppla inför varje fall och enhet

1. Stäng andra provflikar. Kontrollera att den verkliga användaren inte har
   något annat privat arbete eller oskickade formulär i provhushållet.
   Efter ett tidigare prov återställer du hela provarkivet enligt nästa
   steg. Bevara inget annat arbete i detta disponibla hushåll.
2. På förberedelsedatorn, som verklig administratör, öppnar du
   **Inställningar → Återimportera hushållet**. Välj rätt arkiv ovan och
   **Kontrollera importfil**. Läs sammanställningen, markera bekräftelsen
   och välj **Ersätt hushållets innehåll**. Invänta slutförd import och
   välj **Läs in det återställda hushållet**. Om svaret saknas använder du
   **Hämta importens status** för samma försök innan du fortsätter.
3. För storkartan hoppar du över innehållskopplingen i steg 3–5 och
   kontrollerar direkt dess gemensamma data och tomma utkast nedan.
   För läs- och sökarkiven behålls medlemskap och verkliga inloggningar.
   Importen ersätter tidigare
   provinnehåll och privata utkast. Hämta aktuella innehållskopplingar.
   Om den aktuella användaren har en importerad koppling från ett tidigare
   prov, välj dess identitet, **Ingen aktuell ägare** och bekräfta ändringen.
   Kontrollera tomt eget utkast innan du tilldelar det nya arkivets arbete.
4. Öppna **Inställningar → Koppla historiskt innehåll → Hämta aktuella
   innehållskopplingar**. Välj **Historisk innehållsidentitet** vars stabila
   ID är det antecknade för just detta arkiv. Välj **Aktuell verifierad
   medlem** med den verkliga användarens antecknade ID, inte bara namnet.
   Läs granskningen: rätt historisk ägare, rätt verifierad medlem och tomt
   eget privat arbete före kopplingen. Bekräfta kontrollen och välj
   **Bekräfta innehållskopplingen**.
5. Läs in hushållet igen. Kontrollera hela familjens sparade och privata
   uppgifter nedan, inklusive alla ordnade egenskaper i fullständig läsning.
   Vid tappat kopplingssvar hämtar du aktuella innehållskopplingar och
   kontrollerar exakt aktuell ägare före fortsatt prov. Egenskaperna är
   oberoende av typernas definitioner. Se
   [innehållskopplingens guide](../user-guide/household-recovery.md).
6. Gör bara LÄS-02:s eller LÄS-07:s ytterligare tillägg nedan när det behövs.
   Stäng förberedelsedatorns provflik. Rensa HTTPS-adressens webbplatsdata
   på målenheten, logga in igen som samma användare och öppna hushållets
   fullständiga adress. Kontrollera familjens uppgifter även där. Återställ
   kontrolläsningens sökning, filter och sidval före fallet. Aktivera sedan
   hjälpmedlet och verklig zoom.

Gör om alla steg för varje delegerat fall, enhet och separat
NVDA-/VoiceOver-körning. Serveromstart eller **Kasta hela utkastet** ensamt
återställer inte sparade data, historik och webbläsarläge. Granska alltid
aktuella kopplingar; ett nytt arkivs ID kan skilja sig från det förra.

## Läskedja för LÄS-01, LÄS-02 och LÄS-07

Använd `laskedja.zip`. Kontrollera före export och efter kopplingen:

- Cykel har textegenskapen **Dold egen uppgift** och typen **Läsobjekt**.
Alex, Cykel,
  Garage och A 1–A 53 finns: totalt 56 objekt, över två tabellsidor.
  Varje beskrivning är **Hela beskrivningen för [namnet].** upprepad
  femton gånger med mellanslag mellan meningarna.
- Cykel har cykelikon, **Ramens märkning är ett påhittat exempel** i det
  egenskapen, sparat pris **2000 SEK**, skuld **Uttryckligen inget**
  och slutdatum **Okänt**. Garage har identiteten **Ospecificerat objekt**.
- Alex **använder** Cykel, som **används av** Alex. Cykel **förvaras i**
  Garage, som **förvarar** Cykel. Förvaringen är **Osäkert uppgivet**,
  **Manuellt upphört**, med känt slutdatum **2024-12-31** och eget
  **Dold sambandsuppgift** = **Sparad dold sambandsuppgift**.
- Cykel har självkopplingen **Har ingen** med den fria uppgiften
  **Uttryckligen inget** och självkopplingen **Okänd
  koppling** med den fria uppgiften **Okänt**. Båda har Cykel som
  verkligt och klickbart start- och målobjekt.
  Alla fyra samband är sparade.
- Eget utkast har precis två ändringar: Cykels föreslagna pris är
  **2500 SEK** och förvaringssambandets fria uppgift är **Föreslagen dold
  sambandsuppgift**. Läs båda priserna och båda sambandsuppgifterna.
  Beskrivning, ikon, identitet, ändpunkter, osäkerhet, status och slutdatum
  är oförändrade.

För **LÄS-01** är detta hela dataförberedelsen. Behåll alla 53 A-objekt för
sidbyte och öppna rader. Detta delegerade grafikfria prov utförs på dator
med NVDA respektive VoiceOver i Chrome. Före fallet öppnar du Karta på
den inloggade **HTTPS-hushållssidan**. Kör bara det befintliga kodblocket för
[grafikförlust](map-graphics-preparation.md#lista-04-och-lista-08)
i just denna sidas Console; LISTA-04:s förberedelse med Lo gäller inte här.
Kontrollera att just HTTPS-sidans kartgrafik slutar fungera och välj
Tabell där. Stäng inte sidan eller återställ grafiken under fallet.
Grafikförlust på den gamla lokala sidan påverkar inte HTTPS-sidan.
Efter LÄS-01 återställer du grafiken med `skyttelGraphics.restoreContext()`
i samma Console innan du stänger sidan och återställer nästa provarkiv.
Fysiska telefonprov för sökning och filter utförs separat nedan.

För **LÄS-02** föreslår du dessutom borttagning av det sparade sambandet
Alex → Använder → Cykel genom **Redigera samband → Föreslå borttagning**
och inväntar bekräftelsen av förslaget. Spara inte. Från **Samband för
Cykel** kontrollerar du fyra samband och **Aktuellt · ◇ Föreslagen
borttagning** för det första, med övriga betydelser oförändrade.
De extra A-objekten påverkar inte läsningen; behåll dem i arkivet.

För **LÄS-07** lägger du dessutom ett **Nytt objekt** av typen Läsobjekt,
med identifierad identitet, tom beskrivning och **Långtobjektnamn**
upprepat tolv gånger utan mellanslag som namn. Kopiera hela följande namn
till **Namn** och välj **Lägg i utkastet och stäng**:

<!-- cSpell:disable-next-line -->
`LångtobjektnamnLångtobjektnamnLångtobjektnamnLångtobjektnamnLångtobjektnamnLångtobjektnamnLångtobjektnamnLångtobjektnamnLångtobjektnamnLångtobjektnamnLångtobjektnamnLångtobjektnamn`

Kontrollera hela nya namnet i Tabell, även om det behöver nästa sida.
Återställ sedan sökning och sidval inför själva läsningen.

## Sökuppgifter för SÖK-03, SÖK-05 och SÖK-10

Använd `sokning.zip`. Kontrollera före export och efter kopplingen:

- Sparade typer **Typ 2** och **Typ 10**, 57 vanliga objekt **A 2**,
  **A 10**, **Zebra**, **Åke**, **Älg**, **Örn** och **B 1–B 51**, samt
  **Upphört prov**, **Tas bort prov** och sparat borttaget **Borttaget prov**.
  Typ 2 har det dolda textfältet **Egen anteckning**. Upphört prov och
  Tas bort prov är manuellt upphörda. Borttaget prov kan läsas med
  borttagningsfiltret men är inte aktuellt.
- A 2:s sparade värden: cykelikon, blå profilbild, identifierad identitet
  och **Lång egen uppgift** upprepad trettio gånger med mellanslag efter
  varje i Egen anteckning. Beskrivningen är **En lång beskrivning med
  hushållets fullständiga uppgifter.** upprepad tolv gånger med mellanslag,
  följd av **Föreslagen sluttext.** Priset är känt **299 SEK**, valutan
  **Okänt**, skulden **Uttryckligen inget**, kreditgränsen
  **100 000 SEK (Osäkert uppgivet)** med datum **2026-01-01**.
- A 2:s privata förslag: bilikon, grön profilbild, känt pris **399 SEK**
  och samma tolv meningar följda av **Nytt föreslaget slut.** Alla övriga
  uppgifter är kvar. Läs båda priserna, bilderna och hela beskrivningarna.
- Eget utkast har fyra objektförslag: ändrat A 2, föreslagen borttagning
  av Tas bort prov samt nya **Nytt prov** och **Övrigt Élan**, båda Typ 2
  med identifierad identitet. Nytt prov har ingen beskrivningsegenskap. Övrigt
  Élan
  har **Åker äpple** som beskrivning och **Hemlig anteckning** i det
  fria textegenskapen.
- Utkastet har också sambandstypen **Endast i sambandet**, tom beskrivning,
  **går till** från startobjektet, **kommer från** från målobjektet, inga
  fria egenskaper, samt det privata sambandet
  **A 2 → går till → Övrigt Élan**. Inga nya gemensamma fakta har sparats.

Alla tre sökfall använder hela förberedelsen. På målenheten kontrollerar
du också att Övrigt Élan är ett eget förslag och att Typ 2, Typ 10 och
utkaststatusarna kan väljas i filtren. Återställ kontrollsökningar och
filter innan fallet börjar. Ersätt inte dolda värden eller bildförslag
med enbart synliga formulärfält.

## Stor karta för LISTA-05

Använd `storkarta.zip`. Den har bara gemensamma provdata och behöver ingen
historisk ägare kopplad till det verkliga kontot. Efter import
kontrollerar du tomt eget utkast, alla 500 Provobjekt och tio sidor i
Tabell med **Ta med upphörda** valt, samt kartans 1 500 samband.
**Provobjekt 045** ska ha redigeringsknapp, fullständiga uppgifter och
sambandsknapp. Återgå till första sidan och stäng kontrolläsningen.
Utför fallets filterval, expandering, rullning och fokus från detta nya
läge. Ersätt inte provkartan med den mindre läs- eller sökförberedelsen.

## Avslut och redovisning

Följ HTTPS-förberedelsens avslut för alla datorer, iPhone och iPad.
Radera provarkiven och ägaranteckningen från provmappen och nedladdningar.
Avsluta varje lokal provprocess så att dess tillfälliga databas rensas.
Behåll inga privata provfiler som vanliga hushållsexporter.

Redovisa verklig leverantörsinloggning, certifikatåtkomst, NVDA/VoiceOver,
fysisk pekning, skärmtangentbord och verklig 200-/400-procentszoom med
enhet och resultat när de faktiskt utförs. Syntetiska lokala kontroller
och arkivkontroller är separat teknisk evidens för provdata, inte utförda
fysiska eller mänskliga observationer.
