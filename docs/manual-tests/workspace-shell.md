# Manuella testfall för kartans arbetsyta

Fallen omfattar kartans verktyg, teman, vägledning, samtalshjälp och
återhämtning.
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
4. För YTA-03, YTA-07, YTA-08 och YTA-09: använd i stället
   [den kontrollerade röstinstallationen](voice-assistant.md#controlled-voice-fixture).
   Starta med `node --import tsx scripts/manual-voice.ts` efter bygget,
   följ den privata portvidarebefordran och logga in med Google som Alex.
   Skapa ett tomt hushåll Hjälpprov; kör inte `seed-family`.
   Börja med stängda arbetsytor och utan sparat medgivande. Installationens
   ljudspår är tysta och bevisar inte hört tal. Avsluta med `quit`.

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
   **Till verktygen**, **Till lista och formulär** och **Till samtalet med Skyttel**.
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
3. Stäng arbetsytan och välj **Skriv till Skyttel**. Ge medgivande med
   **Godkänn och starta** om rutan visas. Kontrollera att samtalsytan går
   att nå utan mikrofon.
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

### YTA-07: hjälpen förklarar samtalet och leder till rätt kontroller

**Syfte:** Läsa hjälpen innan medgivande och följa dess samtalskontroller.

**Användare:** Alex, administratör i Hjälpprov.

**Förutsättningar:** Den kontrollerade installationen enligt steg 4.
Börja med tomt utkast på dator. Använd Windows eller Linux och upprepa
på macOS; anteckna faktiskt provad enhet och eventuella genvägskrockar.

**Integrationstest:**
[conversation-help.spec.ts](../../tests/integration/conversation-help.spec.ts),
testfallet “YTA-07: hjälpen förklarar samtalet och leder till rätt kontroller”,
i grupperna Windows och Linux samt macOS.
Automationen emulerar plattformsnamnet och provar tangentkommandot i
Chromium; fysisk mikrofon, faktisk uppläsning och OS-genvägar återstår.
Tal som väntar under starten provas i
[MIKROFONTRYCK-05](microphone-press.md#mikrofontryck-05-tal-under-starten-förs-över-efter-släpp-utan-ny-inspelning).

**Steg:**

1. Nå **Information och hjälp** med Tab och öppna med Enter. Läs rubriken
   och delarna om samma samtal, långt tryck, medgivande, OpenAI och formulär.
   Kontrollera att läsning inte startar mikrofonen eller frågar om medgivande.
2. Läs att släpp stoppar ny inspelning direkt och att redan inspelat tal
   från starten kan skickas efter släpp. Läs tangentkombinationen för din
   enhet: Ctrl+Mellanslag eller Ctrl+Skift+Mellanslag. Läs förbehållet om
   fel i samtalstexten och att kartan och kvittot bekräftar resultatet.
3. Läs vilka uppgifter OpenAI behandlar. Läs att begäran om att inte lagra
   inte garanterar behandling enbart i EU eller omedelbar radering av alla
   kopior.
   Nå **Läs OpenAI:s datavillkor** med Tab och kontrollera länkens namn.
4. Stäng med Escape. Välj **Lista**, **Nytt objekt**, ange **Lo Exempel**
   och välj **Lägg i mitt utkast** utan att starta något samtal.
   Välj **Stäng arbetsytan**.
5. Tryck tangentkombinationen kort. I medgivanderutan, markera
   **Fråga inte igen för det här hushållet** och välj **Godkänn och starta**.
   Tryck kombinationen kort igen för att stänga av mikrofonen.
   Håll sedan kombinationen tills mikrofonen är på och släpp.
6. Välj **Skriv till Skyttel**, skicka **Vad finns i utkastet?** och släpp
   modellsvaret i terminalen med `reply ANROP Lo-förslaget ligger kvar.`,
   där `ANROP` är ID från `held`. Skriv **Oskickat medan hjälpen läses**
   utan att skicka. Öppna och stäng hjälpen igen.
7. Följ hjälpens väg: **Inställningar**, **Samtal med Skyttel**,
   **Återkalla medgivandet** och **Återkalla och avsluta samtalet**.
   Återgå till kartan och välj **Skriv till Skyttel** igen.

**Förväntat resultat:**

- Hjälpens rubrik får fokus. Texten använder **Prata med Skyttel** och
  **Skriv till Skyttel**, förklarar att röst och text är samma samtal och
  att formulären kan användas utan mikrofon eller samtalsmedgivande.
- Texten förklarar långt och kort tryck, medgivande före inspelning,
  fortsatt svar efter släpp och att väntande tal kasseras vid avbruten start.
  Tangentkombinationen följer plattformen. Kort tryck räcker alltid.
- Mikrofonen växlar med kort tryck och är av efter släpp av långt tryck.
  Samma samtal fortsätter i text utan ny medgivanderuta. Lo-förslaget
  finns kvar; oskickad text bevaras medan hjälpen läses.
- Återkallandet avslutar samtalet, bevarar Lo-förslaget och frågar om
  medgivande vid nästa start. Hjälpens kontrollnamn leder till dessa steg.
- OpenAI:s behandling, möjliga kvarvarande uppgifter och begränsningar
  beskrivs utan löfte om omedelbar radering eller behandling enbart i EU.
  Automationen granskar också att verkliga text- och röstanrop begär
  att inte lagra svar eller session; den provar inte leverantörens drift.

### YTA-08: hjälpens långa text går att läsa och stänga på smal skärm

**Syfte:** Läsa hela hjälpen och nå verktygen utan rullning i sidled.

**Användare:** Alex.

**Förutsättningar:** Samma installation på smal skärm, gärna 320×568 px.
Inget samtal pågår. Använd tangentbord och upprepa på fysisk pekskärm.

**Integrationstest:**
[conversation-help.spec.ts](../../tests/integration/conversation-help.spec.ts),
testfallet “YTA-08: hjälpens långa text går att läsa och stänga på smal skärm”.
Att fälla ihop verktygen medan hjälpen är öppen täcks även av YTA-03.

**Steg:**

1. Expandera verktygen och öppna **Information och hjälp** med tangentbord.
   Kontrollera fokus på rubriken. Rulla till slutet, med End på dator
   eller genom hjälpens text på pekskärm. Läs formuläralternativet.
2. Nå länken till datavillkoren och stängknappen med Tab. Kontrollera
   att det fokuserade innehållet syns och att hjälpen ryms i sidled.
3. Välj **Dölj verktygens namn** medan hjälpen är öppen. Kräv att knappen
   går att aktivera och att hjälpen fortfarande går att läsa.
4. Stäng med Escape. Öppna igen, rulla och använd **Stäng verktyget**.

**Förväntat resultat:**

- Hjälpen och verktygen har egna nåbara ytor. Lång text rullar inom
  hjälpen och täcker inte knappen som fäller ihop verktygen.
- Rubriker, stycken, datavillkorslänk och stängknapp går att nå med
  tangentbord. Ingen rullning i sidled behövs. Mikrofonen startar inte.
- Stängning återför fokus till hjälpknappen eller den synliga knappen
  för att expandera verktygen när hjälpknappen har dolts.

**Tillgänglighetsbedömning för samtalshjälpen:**

Designmålen är WCAG 2.2 AA: semantisk region och rubrikordning (1.3.1),
beskrivande rubriker och länk (2.4.6), tangentbord och logiskt återställt
fokus (2.1.1, 2.4.3), samt omflöde och oskymt fokus (1.4.10, 2.4.11).
Länken använder arbetsytans minst 44 px höga träffyta (2.5.8).
Automationen kontrollerar region, rubrikfokus, genvägarnas kontrollerade
beteende, smal läsyta, rullning, nåbara verktyg och återställt fokus.
Verklig NVDA/VoiceOver-uppläsning, genvägar på fysisk Windows/macOS,
pekning på iPhone/iPad, kontrast i båda teman och 200/400 procents zoom
återstår. Inget intyg om fullständig WCAG-överensstämmelse ges.

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

### YTA-09: den tomma kartan förblir användbar med röst och samtalsnotis

**Syfte:** Nå den tomma kartans listknapp när röstrutan eller en samtalsnotis
visas ovanför kartans visningsval och utkastets återkoppling.

**Användare:** Alex.

**Förutsättningar:** Den kontrollerade röstinstallationen enligt den allmänna
förberedelsen, med ett tomt hushåll och stängda arbetsytor. Använd ett
320 pixlar brett fönster med höjderna 900 och 568 pixlar.

**Integrationstest:**
[workspace-shell.spec.ts](../../tests/integration/workspace-shell.spec.ts),
testfallet “YTA-09: voice and notices leave the empty map entry and lower
controls reachable”.

**Steg:**

1. Välj **Prata med Skyttel** och godkänn samtalsmedgivandet. Läs **Lyssnar**
   i röstrutan. Kortet **Din karta börjar här** ska finnas kvar. Välj
   **Återställ vy** och läs **Översikt återställd.** i kartans statusyta.
2. Nå kortets **Öppna Lista** med tangentbordet. Fokus och knappen ska synas
   och vara fria från röstrutan. Kontrollera båda fönsterhöjderna.
3. Slå på **Offline** i webbläsarens nätverkspanel. Läs samtalsnotisen
   **Ingen kontakt med Skyttel. Mikrofonen är av.** och kontrollera samma
   listknapp vid båda höjderna.
4. Slå av **Offline**, välj **Öppna Lista** och sedan **Nytt objekt**.
   Formuläret med **Objektets namn** ska gå att använda. Skapa inget objekt.

**Förväntat resultat:**

- Röstrutan och samtalsnotisen täcker inte den tomma kartans listknapp.
- Röstrutan eller notisen ligger ovanför visningsvalen, som ligger ovanför
  kartans statusyta och utkastets återkoppling. Vid platsbrist är
  återkopplingen nåbar med rullning.
- Samtalet öppnar ingen arbetsyta automatiskt; listknappen öppnar formuläret
  när Alex väljer den. Installationen provar placering, inte hört tal.
