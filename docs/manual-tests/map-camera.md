# Manuella testfall för kamerans urvalsfokus

Testfallen omfattar rotation, fokus och återgång till en tidigare vy.
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
   till Kim och Kim till Långt borta. Flytta objekten till olika personliga
   placeringar, även i höjdled. Placera Långt borta tydligt utanför gruppen.
3. Börja varje fall med en omladdad karta. Kamerarörelser ska inte skapa
   hushållsförslag eller ändra personliga objektplaceringar.

## Rotation och kameravy

### KAMERA-01: Rotera kring personlig placering utan hopp

**Syfte:** Verifiera rotationscentrum med knappar och tangentbord.

**Användare:** Alex Exempel.

**Förutsättningar:** Lo ligger utanför bildens mitt i översikten.

**Integrationstest:**
[map-camera.spec.ts](../../tests/integration/map-camera.spec.ts),
testfallet “KAMERA-01: rotation keeps the selected personal position fixed
on screen without a selection jump”.

**Steg:**

1. Markera Lo och kontrollera att kameran ligger kvar utan hopp.
2. Öppna **Navigera rymden** och välj **Rotera vänster**.
3. Fokusera samma knapp med tangentbord och tryck Enter.
4. Flytta Lo uppåt med **Ordna min vy**. Vänta på bekräftad personlig
   placering och välj **Luta nedåt** under **Navigera rymden**.

**Förväntat resultat:**

- Lo behåller sin plats i bilden under rotationen och är fortsatt markerad.
- Rotation ändrar inte hushållets uppgifter eller objektens placeringar.
- Efter den uttryckliga flyttningen roterar kartan kring Los nya läge.

### KAMERA-02: Fokusera direkta grannar och återgå till sparad vy

**Syfte:** Verifiera avgränsat fokus och kamerans bestående återgångsvy.

**Användare:** Alex Exempel.

**Förutsättningar:** Alla fyra objekt syns i översikten på dator.

**Integrationstest:**
[map-camera.spec.ts](../../tests/integration/map-camera.spec.ts),
testfallet “KAMERA-02: focus fits only selection and direct neighbors while
overview retains its return view”.

**Steg:**

1. Kontrollera att **Fokusera markering** är inaktiv med tomt urval.
2. Markera Lo, öppna detaljer och skriv oskickad beskrivningstext.
3. Välj **Fokusera markering**. Kontrollera Lo och Kim i det närmare
   utsnittet, med marginal till verktygen och oförändrad kamerariktning.
4. Välj **Visa hela kartan**. Panorera, fokusera markeringen igen och
   rotera. Välj sedan **Återgå till föregående vy**.

**Förväntat resultat:**

- Endast Lo och dess direkta granne Kim bestämmer fokusutsnittet.
  Långt borta utökar inte utsnittet genom Kims andra samband.
- Kim blir inte markerad. Panelens läge och oskickade text finns kvar.
- Återgången återställer vyn före översikten trots mellanliggande rörelser.
  Knappen heter åter **Visa hela kartan** och urvalet består.

### KAMERA-03: Rotera med mus och pekskärm i smala vyer

**Syfte:** Verifiera samma rotationsregel, pekmål och grafikavbrott.

**Användare:** Alex Exempel.

**Förutsättningar:** Prova i 390 och 320 CSS-bildpunkters bredd. För att
prova grafikavbrott behövs webbläsarens stöd för att avbryta och återställa
WebGL. Saknas det stödet, anteckna den delen som ej utförd.

**Integrationstest:**
[map-camera.spec.ts](../../tests/integration/map-camera.spec.ts),
testfallet “KAMERA-03: mouse and touch rotation preserve the pivot and
narrow focus controls survive unavailable graphics”.

**Steg:**

1. Markera Lo och välj **Fokusera markering**. Börja dra tom rymd med
   mus. Kontrollera både start och fortsatt rotation.
2. Upprepa med ett finger på pekskärmen. Kontrollera att Lo ligger kvar
   på samma plats i bilden och behåller markeringen.
3. Öppna **Lista** och återgå till kartan. Kontrollera att fokus går att
   använda igen och att båda kameraknapparna är åtkomliga.
4. Avbryt kartgrafiken, kontrollera att fokus är inaktivt och återställ
   grafiken. Kontrollera att fokusering blir tillgänglig igen.

**Förväntat resultat:**

- Mus och pekskärm ger inget hopp och roterar kring samma personliga läge.
- Knapparna har begripliga namn, synligt tangentbordsfokus och pekmål som
  ryms i vyn. Kartgrafik som döljs eller avbryts kan inte fokuseras.
- Urval och pågående arbete finns kvar efter panelbyte och grafikavbrott.

### KAMERA-04: Fokusera i en kort vy med åtkomliga verktyg

**Syfte:** Verifiera kartutrymme och verktyg vid kraftig webbläsarzoom.

**Användare:** Alex Exempel.

**Förutsättningar:** Börja med Lo markerad. Prova 400 procent riktig
webbläsarzoom från en vy på 1280 × 1000 bildpunkter, så innehållet får
320 × 250 CSS-bildpunkter. Anteckna faktiskt mått och zoomnivå.

**Integrationstest:**
[map-camera.spec.ts](../../tests/integration/map-camera.spec.ts),
testfallet “KAMERA-04: short viewports retain a usable focus rectangle
and reachable camera and display controls”. Testet använder motsvarande
CSS-mått; riktig webbläsarzoom provas separat.

**Steg:**

1. Fokusera **Fokusera markering** med tangentbord och tryck Enter.
2. Kontrollera Lo och Kim mellan övre och nedre verktyg. Välj översikt
   och återgå till den föregående vyn.
3. Öppna **Visningsval**, slå på och av **Alla etiketter** och stäng valet.
4. Öppna **Navigera rymden**, rotera och stäng navigeringen.
5. Välj **Visa verktygens namn** och kontrollera att **Samtal och text**
   samt **Visa detaljer** går att nå.
6. Aktivera kamerafokus med tangentbord från det utökade verktygsfältet.
   Upprepa med översikt och återgång efter att verktygsnamnen öppnats igen.

**Förväntat resultat:**

- Både markeringen och dess direkta granne får plats i fri kartarea med
  marginal till verktygen och går att välja. Kamerafokus ligger kvar på
  den aktiverade knappen.
- Kamera- och visningskontroller går att använda. Inga kontroller kräver
  vågrät rullning av sidan.
- Kameraåtgärder fäller ihop verktygsnamnen och behåller fokus på samma
  knapp. Urval och öppna arbetspaneler finns kvar.
