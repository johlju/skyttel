# Manuella testfall för kamerans urvalsfokus

Testfallen omfattar rotation, fokus, kamerans vyhistorik och återställning.
Anteckna commit, webbläsare, fysisk eller emulerad inmatning samt godkänt
eller underkänt resultat. Fysiska enheter och hjälpmedel provas separat.

## Konfigurerade användare

Alex Exempel är inloggad medlem i ett separat provhushåll. Använd bara
påhittade uppgifter. Administratörsrollen behövs inte.

## Allmän förberedelse

1. Starta en isolerad installation enligt
   [provförberedelsen](../development/devcontainer.md#disposable-local-database).
   Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor).
2. Skapa Lo Exempel, Kim Exempel, Alex Exempel och Långt borta. Koppla Lo
   till Kim och Kim till Långt borta. Spara hela utkastet. Flytta objekten
   till olika personliga
   placeringar, även i höjdled. Placera Långt borta tydligt utanför gruppen.
   Redigera därefter varje objekt: skriv **Privat kameraförslag** i
   Beskrivning och välj **Lägg i utkastet och stäng**. Redigera båda
   sambanden: välj **Osäkert uppgivet** i **Uppgiftens säkerhet** och
   **Lägg i utkastet**. Stäng sambandsdialogen. Spara inte dessa förslag.
3. Börja varje fall med en omladdad karta. Kamerarörelser ska inte skapa
   hushållsförslag eller ändra personliga objektplaceringar.

KAMERA-10/11/12 använder
[nåbar fysisk provinstallation och egna provdata](workspace-preparation.md#fysiska-enheter-och-egen-provdata).
KAMERA-03:s grafikdel har
[separat förberedelse med exakt tidpunkt](workspace-preparation.md#kontrollerat-grafikavbrott-för-kamera).

## Automatiserat underlag

KAMERA-08/09 har sina motsvarigheter i
[kamerans webbläsartest](../../tests/browser/household-camera-history.test.tsx).
De provar verkliga kartkontroller, produktionsstilar och inmatning i Chromium
med kontrollerade svar för sparade uppgifter, utkast och personlig vy.
Inga skrivningar till hushållet eller objektplaceringarna tillåts i dessa prov.
De visar lokal vyhistorik, inte beständig serverlagring. KAMERA-01–07 behåller
sina integrationstest med verklig installation och sparade provuppgifter.
KAMERA-08/09 behåller samma fallidentiteter vid flytten; inga ID:n frigörs.
Fysiska gester och faktisk uppläsning provas fortfarande separat i
KAMERA-10–12.

## Rotation och kameravy

### KAMERA-01: Rotera kring personlig placering utan hopp

**Syfte:** Verifiera rotationscentrum med knappar och tangentbord.

**Användare:** Alex Exempel.

**Förutsättningar:** Lo ligger utanför bildens mitt i översikten.

**Integrationstest:**
[map-camera.spec.ts](../../tests/integration/map-camera.spec.ts),
KAMERA-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-camera.spec.ts",
    "caseId": "KAMERA-01"
  },
  "reference": "Chromium, dator samt de smala och korta CSS-mått som anges i fallet.",
  "outcomes": [
    "Kameran och urvalet följer de uttryckliga åtgärderna med nåbara kontroller och bevarat arbete."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Markera Lo och kontrollera att kameran ligger kvar utan hopp.
2. Öppna **Navigera** och välj **Rotera vänster**.
3. Fokusera samma knapp med tangentbord och tryck Enter.
4. Flytta Lo uppåt med **Navigera**. Vänta på bekräftad personlig
   placering och välj **Luta nedåt** under **Navigera**.

**Förväntat resultat:**

- Lo behåller sin plats i bilden under rotationen och är fortsatt markerad.
- Rotation ändrar inte hushållets uppgifter eller objektens placeringar.
- Efter den uttryckliga flyttningen roterar kartan kring Los nya läge.

### KAMERA-02: Fokusera direkta grannar och backa kameran

**Syfte:** Verifiera avgränsat fokus och återgång utan förlorat arbete.

**Användare:** Alex Exempel.

**Förutsättningar:** Alla fyra objekt syns i översikten på dator.

**Integrationstest:**
[map-camera.spec.ts](../../tests/integration/map-camera.spec.ts),
KAMERA-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-camera.spec.ts",
    "caseId": "KAMERA-02"
  },
  "reference": "Chromium, dator samt de smala och korta CSS-mått som anges i fallet.",
  "outcomes": [
    "Kameran och urvalet följer de uttryckliga åtgärderna med nåbara kontroller och bevarat arbete."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Fokusera Lo utan att markera objektet och tryck Shift+F10. Kontrollera
   att **Fokusera markering** är inaktiv med tomt urval. Stäng med Escape.
2. Dubbelklicka Lo. Läs namnet, typen Person, den tidigare tomma sparade
   beskrivningen och **Ditt förslag: Privat kameraförslag**.
3. Öppna Los högerklicksmeny och välj **Fokusera markering**. Kontrollera
   Lo och Kim i det närmare utsnittet, med marginal till verktygen och
   oförändrad kamerariktning.
4. Öppna **Navigera**, panorera höger och rotera vänster. Välj
   **Föregående vy** två gånger för att gå tillbaka till fokusutsnittet.
5. Stäng **Navigera**. Välj **Redigera Lo Exempel** och skriv Oskickat under
   kamerafokus i **Beskrivning**. Välj **Stäng objektdialogen** och kontrollera
   fokus på **Fortsätt redigera**. Tryck Escape och kontrollera att texten
   består.
6. Stäng igen och välj uttryckligen **Kasta ändringarna och fortsätt**.
   Kontrollera oförändrad kamera, tidigare utkast och sparade uppgifter.

**Förväntat resultat:**

- Endast Lo och dess direkta granne Kim bestämmer fokusutsnittet.
  Långt borta utökar inte fokusutsnittet genom Kims andra samband; övrigt
  kartinnehåll finns fortfarande kvar.
- Kim blir inte markerad. Den fasta läsytan behåller sitt läge under
  kamerarörelser. Escape bevarar senare oskickad formulärtext, medan
  uttryckligt kastande lämnar tidigare fakta och utkast oförändrade.
- Två steg bakåt återställer vyn före panoreringen och rotationen.
  Knappen heter fortsatt **Föregående vy** och urvalet består.

### KAMERA-03: Rotera med mus och pekskärm i smala vyer

**Syfte:** Verifiera samma rotationsregel, pekmål och grafikavbrott.

**Användare:** Alex Exempel.

**Förutsättningar:** Prova i 390 och 320 CSS-bildpunkters bredd. För att
prova grafikavbrott behövs webbläsarens stöd för att avbryta och återställa
WebGL. Saknas det stödet, anteckna den delen som ej utförd.

**Integrationstest:**
[map-camera.spec.ts](../../tests/integration/map-camera.spec.ts),
KAMERA-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-camera.spec.ts",
    "caseId": "KAMERA-03"
  },
  "reference": "Chromium, dator samt de smala och korta CSS-mått som anges i fallet.",
  "outcomes": [
    "Kameran och urvalet följer de uttryckliga åtgärderna med nåbara kontroller och bevarat arbete."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Markera Lo, öppna högerklicksmenyn och välj **Fokusera markering**. Börja
   dra tom rymd med mus. Kontrollera både start och fortsatt rotation.
2. Upprepa med ett finger på pekskärmen. Kontrollera att Lo ligger kvar
   på samma plats i bilden och behåller markeringen.
3. Öppna **Tabell** och återgå med **Karta**. Kontrollera att fokus går att
   använda igen från högerklicksmenyn och att översikt är åtkomlig.
4. Öppna Los högerklicksmeny. Avbryt kartgrafiken, kontrollera att
   **Fokusera markering** är inaktiv och återställ grafiken. Kontrollera att
   fokusering blir tillgänglig igen.

**Förväntat resultat:**

- Mus och pekskärm ger inget hopp och roterar kring samma personliga läge.
- Knapparna har begripliga namn, synligt tangentbordsfokus och pekmål som
  ryms i vyn. Kartgrafik som döljs eller avbryts kan inte fokuseras.
- Urval och pågående arbete finns kvar efter vybyte och grafikavbrott.

### KAMERA-04: Fokusera i en kort vy med åtkomliga verktyg

**Syfte:** Verifiera kartutrymme och verktyg i korta CSS-vyer.

**Användare:** Alex Exempel.

**Förutsättningar:** Börja med Lo markerad. Prova 320 × 250 och
640 × 500 CSS-pixlar. Riktig webbläsarzoom provas i KAMERA-10.

**Integrationstest:**
[map-camera.spec.ts](../../tests/integration/map-camera.spec.ts),
KAMERA-04.

**Separat förberedelse:** Följ
[kontrollerad personlig leverans](workspace-preparation.md#väntande-personlig-flytt)
före varje försök i steg 7. Transporten håller samma verkliga svar efter
att flytten genomförts; provet ändrar inte annan hushållsinformation.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-camera.spec.ts",
    "caseId": "KAMERA-04"
  },
  "reference": "Chromium, dator samt de smala och korta CSS-mått som anges i fallet.",
  "outcomes": [
    "Kameran och urvalet följer de uttryckliga åtgärderna med nåbara kontroller och bevarat arbete."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Följ
[väntande personlig flytt](workspace-preparation.md#väntande-personlig-flytt).
Arma före den verkliga flytten i UI-steg 7. Efter flytten: invänta hållningen
efter genomförandet och meddela **Samma genomförda svar hålls**. Behåll svaret
tills användaren fokuserat Stäng navigering. Kör först då `release` i
förberedelseterminalen och meddela **Samma svar är släppt**. Arma på nytt inför
andra flytten, och släpp dess svar först efter verklig stängning. Återställ
transporten enligt den befintliga guiden efter båda fokusproven.

**Steg:**

1. Fokusera Lo med tangentbord och tryck Shift+F10. Nå **Fokusera markering**
   med högerpil och tryck Enter.
2. Kontrollera Lo och Kim i den fria kartytan. Välj **Föregående vy** medan
   verktygsnamnen är öppna. Knappen behåller fokus och blir dimmad. Öppna namnen
   igen och fokusera markeringen via högerklicksmenyn.
3. Slå på och av **Alla etiketter** med etikettikonen under **Föregående vy** i
   verktygsfältet.
4. Öppna **Navigera**. Läs söksammanfattningen och hushållets återkoppling
   bredvid navigeringen. Fokusera sammanhangsytan med tangentbord; rulla vid
   behov hela arbetsytan för att läsa den. Nå var och en av de sex **Flytta Lo
   Exempel**-knapparna med tangentbord och aktivera dem: vänster, höger, uppåt,
   nedåt, framåt och bakåt. Kontrollera fokus och att enbart din personliga
   placering ändras. Rotera och stäng navigeringen. Upprepa detta steg vid 640 ×
   500 CSS-pixlar.
5. Välj **Visa verktygens namn** och kontrollera att **Skriv till Skyttel** går
   att nå.
6. Öppna Los högerklicksmeny med Shift+F10 och aktivera **Fokusera markering**
   med tangentbord medan verktygsnamnen är öppna.
7. Be operatören förbereda det kontrollerade svaret och invänta installationen.
   Öppna Navigera. Flytta Lo med tangentbord och kontrollera att flyttknappen
   blir inaktiv i väntan på svaret. Invänta operatörens bekräftelse av den
   verkliga hållningen. Flytta fokus till **Stäng navigering** utan att aktivera
   den. Be operatören släppa samma svar enligt förberedelsen och invänta
   bekräftelse. Kontrollera att fokus ligger kvar. Be operatören förbereda nästa
   svar och invänta installationen. Upprepa flytten och invänta bekräftelse av
   hållningen, men aktivera nu **Stäng navigering** före svaret. Be operatören
   släppa samma svar och invänta bekräftelse. Kontrollera att **Navigera**
   behåller fokus; den stängda navigeringen återöppnas inte.

**Förväntat resultat:**

- Både markeringen och dess direkta granne får plats i fri kartarea med
  marginal till verktygen och går att välja. Menyn stängs och
  tangentbordsfokus går till kartan.
- Kamera- och visningskontroller går att använda. Inga kontroller kräver
  vågrät rullning av sidan.
- Kameraåtgärder fäller ihop verktygsnamnen. Menyns urvalsfokus flyttar
  fokus till kartan; **Föregående vy** behåller fokus på samma knapp.
  Urval och personliga inställningar finns kvar.
- Efter en vanlig flytt återgår fokus till samma aktiva flyttknapp.
  Ett kontrollerat fördröjt svar tar inte fokus från en senare kontroll och
  återöppnar inte stängd navigering.
- Navigering och återkoppling täcker inte varandras kontroller. Sökräkningen,
  fullständiga benämningar och alla sex flyttknappar går att läsa och nå
  med tangentbord och rullning. Sparade fakta och privata förslag ändras inte.

### KAMERA-05: Högerklickets kartåtgärder förklarar urval och filter

**Syfte:** Skilja de tre kartåtgärderna och bevara flera markeringar.

**Användare:** Alex Exempel.

**Förutsättningar:** De fyra objekten finns enligt allmän förberedelse.

**Integrationstest:**
[map-camera.spec.ts](../../tests/integration/map-camera.spec.ts),
KAMERA-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-camera.spec.ts",
    "caseId": "KAMERA-05"
  },
  "reference": "Chromium, dator samt de smala och korta CSS-mått som anges i fallet.",
  "outcomes": [
    "Kameran och urvalet följer de uttryckliga åtgärderna med nåbara kontroller och bevarat arbete."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Sök **Exempel** och markera **Ta med upphörda** i kartans filter.
2. Markera Lo och lägg till Alex i urvalet med Ctrl-klick eller Cmd-klick.
3. Högerklicka Långt borta utan att ändra urvalet. Läs verktygstipsen och de tre
   kartåtgärdernas beskrivningar.
   Faktisk uppläsning prövas i KAMERA-11.
4. Nå **Fokusera markering** med tangentbord och tryck Enter.
5. Välj **Föregående vy** och kontrollera att kameran återgår. Kontrollera
   markeringarna, kartans söktext, filtret och utkastet.

**Förväntat resultat:**

- Kartikonen **Visa i kartan** förklarar att Långt borta markeras, att sökning
  och
  filter rensas och att upphörda tas med vid behov.
- Nätverksikonen **Visa samband i kartan** förklarar att Långt borta markeras
  och
  att sökning, filter och tidigare visat innehåll behålls.
- Fokusramen **Fokusera markering** förklarar att alla markerade objekt och
  deras direkta grannar ramas in med bevarat urval, sökning och filter.
  Alla tre behåller kamerans riktning.
- Efter urvalsfokus är Lo och Alex fortsatt markerade, Kim är inte markerad.
  Lo, Alex och den direkta grannen Kim är åtkomliga. Menyn stängs och
  tangentbordsfokus går till kartan. Söktexten och **Ta med upphörda** består.
- Sparade uppgifter och utkastet är oförändrade.
  **Föregående vy** bevarar också sökning, filter och båda markeringarna.

### KAMERA-06: Etikettikonen växlar och sparar personligt visningsval

**Syfte:** Verifiera etikettknappens läge, växling och bestående val.

**Användare:** Alex Exempel.

**Förutsättningar:** Börja med **Alla etiketter** avstängt på dator.

**Integrationstest:**
[map-camera.spec.ts](../../tests/integration/map-camera.spec.ts),
KAMERA-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-camera.spec.ts",
    "caseId": "KAMERA-06"
  },
  "reference": "Chromium, dator samt de smala och korta CSS-mått som anges i fallet.",
  "outcomes": [
    "Kameran och urvalet följer de uttryckliga åtgärderna med nåbara kontroller och bevarat arbete."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Hitta etikettikonen **Alla etiketter** under **Föregående vy**.
   Kontrollera att knappen visas som avstängd.
2. Klicka på etikettikonen. Kontrollera att den visar påslaget läge och
   att objektens och sambandens etiketter visas, även om de överlappar.
3. Ladda om sidan. Kontrollera att knappen fortfarande är påslagen.
4. Minska vyn till 320 × 250 CSS-pixlar. Fokusera etikettikonen med
   tangentbord och tryck mellanslag. Kontrollera att läget blir avstängt.
5. Ladda om igen. Kontrollera att läget fortfarande är avstängt.

**Förväntat resultat:**

- Knappen har en etikettikon, synligt fokus och ett tydligt aktivt läge.
  Namnet **Alla etiketter** och påläget finns för hjälpmedel.
  Faktisk uppläsning prövas i KAMERA-11.
- Ett klick slår på valet och nästa klick slår av. Enter och mellanslag
  växlar samma val. Automatiska etiketter används när valet är avstängt.
- Den personliga inställningen består vid omladdning och i en kort vy.
- Tangentbordsfokus ligger kvar på knappen efter växling. Hushållets
  sparade uppgifter och utkastet ändras inte.

### KAMERA-07: Återställningsikonen återgår till hela kartan

**Syfte:** Verifiera återställning från verktygsfältets kameragrupp.

**Användare:** Alex Exempel.

**Förutsättningar:** Alla fyra objekt finns enligt allmän förberedelse.

**Integrationstest:**
[map-camera.spec.ts](../../tests/integration/map-camera.spec.ts),
KAMERA-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/map-camera.spec.ts",
    "caseId": "KAMERA-07"
  },
  "reference": "Chromium, dator samt de smala och korta CSS-mått som anges i fallet.",
  "outcomes": [
    "Kameran och urvalet följer de uttryckliga åtgärderna med nåbara kontroller och bevarat arbete."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Sök **Lo** i kartan och markera Lo. Slå på **Alla etiketter**.
2. Hitta cirkelpilen **Återställ vy** under etikettikonen i verktygsfältet.
3. Aktivera återställningen med tangentbord och kontrollera kartan.
4. Kontrollera sökfältet, markeringen, etikettvalet och utkastet.

**Förväntat resultat:**

- Kameran ramar in hela kartan. Sökning och filter återställs och inget
  objekt är markerat. Kamerans riktning behålls.
- **Föregående vy** och **Återställ vy** är dimmade. Vyhistoriken är tom.
- **Alla etiketter** är fortsatt påslaget. Tangentbordsfokus ligger kvar
  på återställningsknappen.
- Personliga objektplaceringar, sparade uppgifter och utkastet är oförändrade.
- Information om dolda etiketter och närmare utsnitt finns under kartans
  status när sådan information behövs.

### KAMERA-08: Backa genom kamerans vyer och töm historiken

**Syfte:** Verifiera varje steg bakåt och återställningens nya startläge.

**Användare:** Alex Exempel.

**Förutsättningar:** Omladdad karta på dator, utan sökning eller markering.

**Webbläsartest:**
[household-camera-history.test.tsx](../../tests/browser/household-camera-history.test.tsx),
KAMERA-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/household-camera-history.test.tsx",
    "caseId": "KAMERA-08"
  },
  "reference": "Chromium 1440 × 1000, verkliga kartkontroller och produktionsstilar; kontrollerade kompletta kart- och vysvar med fyra sparade objekt, två samband, fyra objektförslag, två osäkra sambandsförslag och fyra personliga 3D-placeringar. Lokal kamera, inte beständig HTTP-lagring.",
  "outcomes": [
    "Varje kamerasteg återgår till föregående utsnitt i rätt ordning, med fokus kvar på Föregående vy även i inaktivt läge.",
    "Sökning aktiverar bara återställning; återställning rensar sökning och historik utan att ändra hushållsuppgifter, utkast eller personliga placeringar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Kontrollera att **Föregående vy** och **Återställ vy** är dimmade.
   Sök **Lo** utan att flytta kameran. Återställningsknappen aktiveras,
   men **Föregående vy** är fortsatt inaktiv. Välj **Återställ vy** och
   kontrollera tom sökning och att båda knapparna är dimmade igen.
2. Öppna **Navigera**. Välj **Rotera vänster**, **Panorera uppåt** och
   **Zooma in**. Lägg märke till utsnittet efter varje knapptryckning.
3. Fokusera **Föregående vy** och tryck Enter tre gånger. Kontrollera varje
   utsnitt i omvänd ordning. Tryck Enter igen när knappen är dimmad.
4. Välj **Zooma ut** och **Återställ vy**. Kontrollera den återställda kartan.
5. Panorera vänster och välj **Föregående vy** en gång.
6. Kontrollera hushållets uppgifter, utkast och personliga placeringar.

**Förväntat resultat:**

- Varje navigeringsknapp skapar ett steg i kamerans historik och aktiverar
  båda kameraknapparna. Stegen går att backa i omvänd ordning, inklusive
  riktning och zoom. Namnet är alltid **Föregående vy**.
- Efter sista steget tillbaka är båda knapparna dimmade. Fokus ligger kvar
  på **Föregående vy**, även då den är inaktiv. Ett nytt tryck ändrar inget.
- **Återställ vy** visar hela kartan och tömmer historiken. Båda knapparna
  blir dimmade. Efter en ny panorering räcker ett steg tillbaka till det
  återställda läget; äldre vyer återkommer inte.
- Hushållets uppgifter, utkast och objektplaceringar är oförändrade.
  Knapparnas namn och inaktiva lägen finns för hjälpmedel;
  faktisk uppläsning prövas i KAMERA-11.

### KAMERA-09: En sammanhängande gest blir ett steg bakåt

**Syfte:** Verifiera hela gester utan mellanliggande rörelsefragment.

**Användare:** Alex Exempel.

**Förutsättningar:** Omladdad karta på dator, mus och pekskärm tillgängliga.
Anteckna om pekskärmen är emulerad eller fysisk. Automatiseringen använder
Chromiums verkliga mus-, tangentbords- och pekinmatning via CDP och väljer
Ctrl-rullning i steg 3. Under Ctrl-rullningen styr automatiseringen tiden
för när gesten avslutas. Fysiska styrplatte- och pekgester provas separat i
KAMERA-12.

**Webbläsartest:**
[household-camera-history.test.tsx](../../tests/browser/household-camera-history.test.tsx),
KAMERA-09.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "vitest",
    "suite": "browser",
    "spec": "tests/browser/household-camera-history.test.tsx",
    "caseId": "KAMERA-09"
  },
  "reference": "Chromium 1440 × 1000, verkliga kartkontroller, produktionsstilar och native CDP-inmatning: sexstegs musdragningar, fem Ctrl-rullningar med styrd tid för avslut och tvåfingersgest. Samma kompletta kontrollerade kart- och vysvar som KAMERA-08; lokal kamera, inte beständig HTTP-lagring eller fysisk enhet.",
  "outcomes": [
    "Varje sammanhängande rotation, panorering, Ctrl-rullning och tvåfingersgest blir ett helt steg i Föregående vy; knappen blir inaktiv i startläget.",
    "Gester och återgång bevarar hushållsuppgifter, utkast och personliga placeringar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Rotera kartan med en sammanhängande vänsterdragning på tom rymd.
2. Panorera med en sammanhängande högerdragning på tom rymd.
3. Zooma med en sammanhängande nypgest på styrplattan eller flera snabba
   Ctrl-rullningar med musen.
4. Välj **Föregående vy** tre gånger. Kontrollera utsnitten efter varje steg.
5. Panorera och zooma med två fingrar på pekskärm under samma gest. Släpp
   båda fingrarna och välj **Föregående vy** en gång.
6. Kontrollera hushållets uppgifter, utkastet och personliga placeringar.

**Förväntat resultat:**

- Ett tryck bakåt återställer vyn före hela zoomningen, nästa före hela
  panoreringen och nästa före hela rotationen. Knappen blir sedan dimmad.
- Hela tvåfingersgesten går att backa med ett tryck, även när den innehåller
  både panorering och zoom. Knappen blir dimmad i startläget.
- Gester och återgång ändrar inga hushållsuppgifter, utkast eller personliga
  placeringar.

### KAMERA-10: fysisk pekrotation och riktig zoom

**Syfte:** Fysisk pekrotation behåller markerad pivot och verklig 400 procents
webbläsarzoom lämnar kamera, navigation och senare fokus nåbara.

**Användare:** Alex enligt områdets förberedelse.

**Förutsättningar:** Pekskärm samt webbläsare med faktisk 400 procents zoom från
1280 × 1000.

**Kräver mänsklig observation:** Fysisk pekrotation behåller markerad pivot och
verklig 400 procents webbläsarzoom lämnar kamera, navigation och senare fokus
nåbara.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Fysisk pekrotation behåller markerad pivot och verklig 400 procents webbläsarzoom lämnar kamera, navigation och senare fokus nåbara."
  },
  "reference": "Pekskärm samt webbläsare med faktisk 400 procents zoom från 1280 × 1000.",
  "outcomes": [
    "Fysisk pekrotation behåller markerad pivot och verklig 400 procents webbläsarzoom lämnar kamera, navigation och senare fokus nåbara."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/map-camera.spec.ts",
      "caseId": "KAMERA-03",
      "purpose": "Kontrollerat webbläsarunderlag för vanliga kontroller; utför inte den faktiska mänskliga observationen."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/map-camera.spec.ts",
      "caseId": "KAMERA-04",
      "purpose": "Kontrollerat webbläsarunderlag för vanliga kontroller; utför inte den faktiska mänskliga observationen."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ KAMERA-03 steg 1–4 med faktisk pekinmatning.
2. Återställ provet. Följ KAMERA-04 steg 1–7 med riktig webbläsarzoom.
   Anteckna faktisk zoom, CSS-mått, enhet och eventuella hinder.

**Förväntat resultat:**

- Fysisk pekrotation behåller markerad pivot och verklig 400 procents
  webbläsarzoom lämnar kamera, navigation och senare fokus nåbara.

### KAMERA-11: skärmläsarens kamera- och etikettkontroller

**Syfte:** NVDA eller VoiceOver läser kartåtgärdernas olika syften, Alla
etiketter med påläge och kameraknapparnas inaktiva lägen.

**Användare:** Alex enligt områdets förberedelse.

**Förutsättningar:** Faktisk NVDA eller VoiceOver och sparade kameraobjekt.

**Kräver mänsklig observation:** NVDA eller VoiceOver läser kartåtgärdernas
olika syften, Alla etiketter med påläge och kameraknapparnas inaktiva lägen.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "NVDA eller VoiceOver läser kartåtgärdernas olika syften, Alla etiketter med påläge och kameraknapparnas inaktiva lägen."
  },
  "reference": "Faktisk NVDA eller VoiceOver och sparade kameraobjekt.",
  "outcomes": [
    "NVDA eller VoiceOver läser kartåtgärdernas olika syften, Alla etiketter med påläge och kameraknapparnas inaktiva lägen."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/map-camera.spec.ts",
      "caseId": "KAMERA-05",
      "purpose": "Kontrollerat webbläsarunderlag för vanliga kontroller; utför inte den faktiska mänskliga observationen."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/map-camera.spec.ts",
      "caseId": "KAMERA-06",
      "purpose": "Kontrollerat webbläsarunderlag för vanliga kontroller; utför inte den faktiska mänskliga observationen."
    },
    {
      "kind": "overlap",
      "runner": "vitest",
      "suite": "browser",
      "spec": "tests/browser/household-camera-history.test.tsx",
      "caseId": "KAMERA-08",
      "purpose": "Kartans faktiska kontroller och lokala vyhistorik med kontrollerade svar i Chromium; utför inte faktisk uppläsning eller beständig serverlagring."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ KAMERA-05 steg 1–5 och lyssna på de tre åtgärdernas beskrivningar.
2. Återställ. Följ KAMERA-06 steg 1–5 och KAMERA-08 steg 1–5.
   Lyssna på namn, påläge och inaktivt läge. Anteckna hjälpmedlets version.

**Förväntat resultat:**

- NVDA eller VoiceOver läser kartåtgärdernas olika syften, Alla etiketter med
  påläge och kameraknapparnas inaktiva lägen.

### KAMERA-12: fysiska sammanhängande kameragester

**Syfte:** Fysisk mus, styrplatta och pekskärm grupperar varje sammanhängande
rotation, panorering och zoom till rätt hela steg i Föregående vy.

**Användare:** Alex enligt områdets förberedelse.

**Förutsättningar:** Faktisk mus, styrplatta och pekskärm med de sparade
kameraobjekten.

**Kräver mänsklig observation:** Fysisk mus, styrplatta och pekskärm grupperar
varje sammanhängande rotation, panorering och zoom till rätt hela steg i
Föregående vy.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Fysisk mus, styrplatta och pekskärm grupperar varje sammanhängande rotation, panorering och zoom till rätt hela steg i Föregående vy."
  },
  "reference": "Faktisk mus, styrplatta och pekskärm med de sparade kameraobjekten.",
  "outcomes": [
    "Fysisk mus, styrplatta och pekskärm grupperar varje sammanhängande rotation, panorering och zoom till rätt hela steg i Föregående vy."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "runner": "vitest",
      "suite": "browser",
      "spec": "tests/browser/household-camera-history.test.tsx",
      "caseId": "KAMERA-09",
      "purpose": "Native CDP-mus, Ctrl-rullning och tvåfingersgest grupperas i kartans lokala vyhistorik med kontrollerade svar och styrd tid för Ctrl-rullning; utför inte fysisk mus-, styrplatte- eller pekinmatning."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ KAMERA-09 steg 1–6 med fysisk mus och pekskärm. Upprepa zoomningen
   i steg 3 med en sammanhängande nypgest på en fysisk styrplatta.
2. Anteckna verklig gest, fingerordning och de tre återgångarna.
   Kontrollera att tvåfingersgesten går att backa som ett helt steg.

**Förväntat resultat:**

- Fysisk mus, styrplatta och pekskärm grupperar varje sammanhängande rotation,
  panorering och zoom till rätt hela steg i Föregående vy.
