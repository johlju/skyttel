# Manuella testfall för navigeringsfönstret

Fallen omfattar navigering, personlig objektflyttning och samtidiga detaljer.
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

### NAVIGATION-01: Normal- och miniläge med oberoende fönsterflytt

**Syfte:** Navigeringsfönstret flyttas utan kamera- eller objektflytt.

**Användare:** Alex Exempel.

**Förutsättningar:** Kartan är synlig i en datorbred vy.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts),
testfallet “NAVIGATION-01: normal and mini navigation move independently
with keyboard and cancelled dragging”.

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

**Syfte:** Verktygen har skilda, användbara ytor i båda öppningsordningar.

**Användare:** Alex Exempel.

**Förutsättningar:** Upprepa på dator samt vid 390 och 320 pixlars bredd,
även i korta fönster på 640 × 500 och 320 × 250 CSS-pixlar. Prova verklig
webbläsarzoom separat från ändrad fönsterstorlek.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts),
testfallet “NAVIGATION-02: navigation and unsent details retain separate
usable areas in both opening orders”.

**Steg:**

1. Markera Lo. Öppna **Navigera**, flytta fönstret in över den blivande
   arbetsytan och öppna sedan **Visa detaljer**.
2. Välj **Redigera valt objekt** och skriv en oskickad beskrivning.
3. Rulla inuti navigationen till **Flytta Lo Exempel: bakåt** och flytta.
   Vänta på beskedet att den personliga vyn är sparad.
4. Panorera, byt till mininavigering och zooma med knapparna.
5. Kontrollera beskrivningen. Ladda om och upprepa med detaljer först
   och navigation sedan.

**Förväntat resultat:**

- Navigation och detaljer öppnas i skilda ytor. Deras innehåll går att
  rulla när utrymmet är litet, med åtkomliga kontroller och synligt fokus.
- En tidigare flyttad navigation återgår till sin reserverade yta när
  detaljer öppnas. Med öppet arbete sker samma sak vid storleksändring
  eller byte mellan normal- och miniläge. Detaljpanelens placering består.
- Oskickad text och detaljer består under navigering och objektflytt.
- Detaljerna visar ingen separat undertitel **Flytta** eller upprepad
  lista över direkta samband. Sambanden nås genom listalternativet.

### NAVIGATION-03: Sex personliga riktningar och beständig placering

**Syfte:** Bara ett namngivet objekt flyttas utan ändrade hushållsuppgifter.

**Användare:** Alex Exempel.

**Förutsättningar:** Spara hushållets uppgifter före provet. En ansvarig
för provinstallationen kan starta om dess server med samma databas.

**Integrationstest:**
[map-navigation.spec.ts](../../tests/integration/map-navigation.spec.ts),
testfallet “NAVIGATION-03: six personal directions persist after restart
while empty and multiple selections retain camera controls”.

**Steg:**

1. Markera bara Lo och öppna **Navigera**. Kontrollera **Flytta Lo Exempel**.
2. Använd vänster, höger, uppåt, nedåt, framåt och bakåt. Vänta på sparad
   personlig vy efter varje rörelse.
3. Markera även Kim med Ctrl/Cmd. Öppna navigationen igen.
4. Avmarkera båda genom listan eller Ctrl/Cmd och kontrollera navigationen.
5. Starta om servern, ladda om sidan och kontrollera placeringarna samt
   hushållets sparade uppgifter och utkast.

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
testfallet “NAVIGATION-04: object details retain directed relationship
access and editing through the list”.

**Steg:**

1. Markera Lo och välj **Visa detaljer**.
2. Välj **Visa samband i listan** i objektpanelen.
3. Välj **Lo Exempel → Använder → Kim Exempel** i listan Samband.
4. Välj sambandets **Redigera** och kontrollera formulärets ändpunkter.

**Förväntat resultat:**

- Listan anger båda ändpunkterna och sambandets riktning i text.
- Formuläret anger Lo som **Från objekt**, Kim som **Till objekt** och
  låter användaren lägga ändringen i samma privata utkast som tidigare.
- Objektpanelen innehåller ingen upprepad lista över direkta samband.
