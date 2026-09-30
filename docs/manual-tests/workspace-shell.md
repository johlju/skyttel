# Manuella testfall för kartans arbetsyta

Fallen omfattar kartans verktyg, teman, vägledning och återhämtning.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex är administratör i ett separat provhushåll. Använd en konfigurerad
testidentitet och påhittade hushållsuppgifter.

## Allmän förberedelse

1. Förbered en
   [separat provdatabas](../development/devcontainer.md#disposable-local-database),
   logga in och skapa ett tomt hushåll.
2. Börja varje fall med ett tomt hushåll och stängda arbetsytor. Behåll
   fliken mellan steg när inget annat anges.
3. Kör med tangentbord på dator och pekskärm på telefon. Kontrollera
   skärmläsarens namn, läsordning och statusmeddelanden separat. Anteckna
   fysiska enheter och hjälpmedel; Chromium-emulering verifierar inte dem.

## Verktyg och teman

### YTA-01: öppna och bevara hushållsarbete

**Syfte:** Nå verkliga formulär från kartan och behålla oskickad text.

**Användare:** Alex.

**Förutsättningar:** Tom karta.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
testfallet “YTA-01: map tools open real household work and preserve it when
closed”.

**Steg:**

1. Öppna hushållet. Kontrollera kartan och beskedet **Din karta börjar här**.
2. Välj **Visa verktygens namn**, sedan **Lista** och **Nytt objekt**.
   Ange namnet **Cykeln**.
3. Välj **Stäng arbetsytan**. Öppna **Lista** igen, välj
   **Nytt objekt** i panelväljaren och kontrollera namnet.
4. Välj **Lägg i mitt utkast**, sedan **Spara hela utkastet**.
5. Läs sparbeskedet och ladda om sidan.

**Förväntat resultat:**

- Verktygen har begripliga namn. Stängning återför fokus till **Lista**.
- Oskickad text finns kvar efter stängning utan att sparas automatiskt.
- Det verifierade sparbeskedet anger Cykeln, som finns i kartan efter
  omladdning.

### YTA-02: temaval och enhetens inställning

**Syfte:** Byta tema med bibehållet fokus.

**Användare:** Alex.

**Förutsättningar:** Enheten använder ljust tema.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
testfallet “YTA-02: theme choice returns focus and System follows the
device”.

**Steg:**

1. Öppna **Tema** och välj **Mörkt**. Kontrollera kartan och verktygen.
2. Ladda om och kontrollera att valet består. Välj sedan **Ljust**.
3. Välj **System** och ändra enhetens tema till mörkt och sedan ljust.
4. I varje temaläge, flytta tangentbordsfokus till **Hoppa till innehållet**,
   **Till verktygen**, **Till lista och formulär** och **Till samtal och text**.
   Kontrollera att länkarna och knapparna går att läsa och har synligt fokus.
5. Öppna temavalet med tangentbordet och tryck Escape.

**Förväntat resultat:**

- Kartans bakgrund, text och verktyg följer det valda temat. Hopplänkarna
  är läsbara med synligt, oskymt tangentbordsfokus i ljust, mörkt och
  systemstyrt tema.
- Fokus återgår till temaknappen efter val och Escape.
- System följer enheten utan omladdning; ett uttryckligt val består efter
  omladdning när webbläsaren tillåter lagring.

### YTA-03: hjälp och formulär på telefon

**Syfte:** Utföra arbetet utan att behöva navigera i kartgrafiken.

**Användare:** Alex.

**Förutsättningar:** Tom karta på en smal telefon.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
testfallet “YTA-03: narrow screens keep tools, help and text work reachable
without graphics”.

**Steg:**

1. Välj **Stäng vägledningen**. Expandera verktygen och öppna
   **Information och hjälp**. Läs instruktionerna och tryck Escape.
2. Välj **Lista**, **Nytt objekt** och skriv **Min cykel**. Kontrollera att
   fält och knappen för att lägga i utkastet går att nå.
3. Stäng arbetsytan och välj **Samtal och text**. Kontrollera att
   samtalsytan går att nå utan mikrofon.
4. Upprepa med förstoring och tangentbord; använd hopplänkarna till
   formulär och samtal före kartgrafiken.
5. Öppna **Sök i kartan** och **Utkast och historik** från de expanderade
   verktygen. Stäng arbetsytan efter varje val och kontrollera fokus.
6. Öppna hjälpen igen och fäll ihop verktygen. Flytta fokus till hjälpen
   och tryck Escape. Kontrollera att fokus är kvar på en synlig knapp.

**Förväntat resultat:**

- Vägledningen försvinner. Hjälpens rubrik får fokus; Escape återför
  fokus till hjälpknappen eller den synliga knappen för att expandera
  verktygen om hjälpknappen har dolts.
- Formulär och samtal går att nå utan att välja något grafiskt objekt.
- Innehållet är läsbart och kontrollerna nåbara även med förstoring.
- Fokus återgår till en synlig verktygsknapp. Täckta kartkontroller går
  inte att tabba till medan arbetsytan ligger över kartan; stäng
  arbetsytan för att använda kartans kontroller igen.

## Återhämtning

### YTA-04: laddning och misslyckad hämtning

**Syfte:** Förstå vad som händer och kunna försöka igen efter nätfel.

**Användare:** Alex.

**Förutsättningar:** Använd webbläsarens nätverkspanel för att pausa eller
blockera kartans läsbegäran med adressen som slutar på `/map?...`.
Låt inloggning och övriga begäranden fungera.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
testfallet “YTA-04: loading and a failed map read offer a working next
action”.

**Steg:**

1. Öppna hushållet med kartbegäran pausad. Läs laddningsbeskedet.
2. Avbryt begäran och kontrollera felmeddelandet.
3. Ta bort blockeringen och välj **Hämta aktuellt underlag**.

**Förväntat resultat:**

- Verktygen och laddningsbeskedet finns medan kartan hämtas.
- Felet erbjuder en nästa handling. Efter nytt försök visas den tomma
  kartans vägledning.

Förlorad tillgång och avslutad mikrofon verifieras i
[bevarat hushållsarbete](household-work.md#arbete-03-återkallad-tillgång-avvecklar-dolt-arbete).

### YTA-05: läsbart sparbesked på surfplatta

**Syfte:** Läsa sparresultatet och fortsätta arbeta med öppen arbetsyta.

**Användare:** Alex.

**Förutsättningar:** Tom karta på surfplatta i stående läge.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
testfallet “YTA-05: save results remain readable beside tablet work”.

**Steg:**

1. Öppna **Lista** och **Nytt objekt**. Skriv
   **Familjens gemensamma cykel** och välj **Lägg i mitt utkast**.
2. Välj **Spara hela utkastet** och läs hela sparbeskedet.
3. Välj **Stäng status** och därefter **Stäng arbetsytan**.

**Förväntat resultat:**

- Sparbeskedet är läsbart medan arbetsytan är öppen.
- Att stänga beskedet ändrar inte det sparade innehållet. Cykeln finns
  kvar i kartan när arbetsytan stängs.

### YTA-06: synliga visningsval på en tom mobilkarta

**Syfte:** Kontrollera att tangentbordsfokus, fullständiga etiketter och
kortets ingångar är nåbara även när en tom karta visar vägledning och status.

**Användare:** Alex.

**Förutsättningar:**

- Börja i ett nytt tomt hushåll enligt den allmänna förberedelsen.
- Använd ett 320 pixlar brett webbläsarfönster. Upprepa i ljust och mörkt tema
  med höjderna 900, 568 och 451 pixlar. Detta är fönstermått, inte ett prov
  på en fysisk telefon.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
testfallen “YTA-06: empty mobile maps keep focused display choices readable
and operable in light” och “YTA-06: empty mobile maps keep focused display
choices readable and operable in dark”.

**Steg:**

1. Behåll vägledningen på den tomma kartan. Använd tangentbordet för att
   fokusera **Återställ vy**, sedan Tab till **Alla etiketter** och
   **Visa höjdhjälp**. Fokus och hela namnet ska synas för varje kontroll.
2. Tryck mellanslag på **Visa höjdhjälp**, kontrollera att valet aktiveras
   och tryck igen för att återställa det. Nå vägledningens **Öppna listan**
   med tangentbordet; sidan får rulla för att visa hela knappen.
3. Välj **Stäng vägledningen** och upprepa kontrollerna. Det kvarvarande
   kortet **Din karta börjar här** och statusytan får inte täcka fokus.
   Kontrollera att kortets **Öppna Lista** går att nå.
4. Öppna Lista, välj **Nytt objekt**, skriv **Cykeln** och lägg i utkastet.
   Stäng arbetsytan. Kortet för en tom karta ska försvinna; höjdhjälpen ska
   fortfarande vara avstängd. Spara inte utkastet.

**Förväntat resultat:**

- Vägledning, visningsval och status delar en rullbar yta när utrymmet är
  trångt; fullständiga etiketter och fokuserade kontroller förblir synliga.
- Vägledningens och det tomma kortets listknappar förblir användbara.
- Ett verkligt objektförslag lämnar tomläget utan att ändra höjdhjälpsvalet.
- Den separata **Visningsval**-menyn i vyer som är högst 450 pixlar höga
  behåller sitt befintliga beteende, vilket provas i KAMERA-04.
