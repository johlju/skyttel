# Manuella testfall för fria paneler

Fallen omfattar objekt, samtal, panelplacering och byte av skärmstorlek.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex är administratör i ett separat provhushåll. Använd en konfigurerad
testidentitet och påhittade uppgifter.

## Allmän förberedelse

1. Förbered en
   [separat provdatabas](../development/devcontainer.md#disposable-local-database)
   och logga in. Skapa ett tomt hushåll för PANEL-01. I övriga fall behövs
   objekten Cykeln, Bilen och Garaget.
2. Spara hela utkastet. Börja varje fall med stängda paneler utan oskickad
   text. Behåll fliken mellan stegen.
3. För samtalet krävs en
   [konfigurerad assistent](setup/assistants.md). Använd text; mikrofon
   behöver inte startas.
4. Kör även med tangentbord och skärmläsare på fysisk telefon och dator.
   Anteckna hjälpmedel och plattformar separat från Chromium-emulering.

## Objekt och samtal

### PANEL-01: flera objekt i ett gemensamt utkast

**Syfte:** Jämföra och redigera flera objekt utan att kasta oskickad text.

**Användare:** Alex.

**Förutsättningar:** Provhushållets karta är tom.

**Integrationstest:**
[workspace-panels.spec.ts](../../tests/integration/workspace-panels.spec.ts),
testfallet “PANEL-01: independent object panels preserve unsent work and
reuse each object”.

**Steg:**

1. Öppna Lista och välj **Nytt objekt**. Skriv Cykeln som namn och stäng
   panelen med krysset. Upprepa med Bilen och Garaget utan att skicka något.
2. Öppna varje formulär med **Fortsätt** under **Påbörjade objekt** i Lista.
   Kontrollera namnet, lägg det i utkastet och spara alla tre tillsammans.
3. Öppna Lista och välj Cykeln. Kontrollera rubrikfokus, välj
   **Redigera valt objekt** och skriv en beskrivning utan att skicka den.
4. Öppna Lista igen och upprepa för Bilen och Garaget. Öppna även
   **Samtal och text**.
5. Välj Cykeln i **Öppna paneler** och stäng den med **Stäng Cykeln**.
   Öppna Cykeln från listan två gånger och kontrollera rubrikfokus även
   när panelen redan är öppen.
6. Välj varje objektpanel och lägg dess text i utkastet. Välj
   **Spara hela utkastet** från **Lista och utkast**.
7. Läs sparbeskedet, ladda om och öppna de tre objekten igen.

**Förväntat resultat:**

- Alla tre objekt och samtalet kan vara öppna samtidigt på dator.
- Varje objekt återanvänder sin panel och sin egen oskickade text.
- Även nya objekt som aldrig har skickats till utkastet finns kvar efter
  panelstängning och kan återöppnas från **Påbörjade objekt**.
- Panelstängning skickar eller kastar ingen text. Den uttryckliga
  handlingen **Stäng utan att skicka texten** kastar formulärtexten.
- Alla tre förslag kan läggas i samma privata utkast och sparas tillsammans.
  Beskrivningarna finns kvar efter omladdning.

### PANEL-02: flytta paneler och fortsätt på mobil

**Syfte:** Bevara samtalstext, objekttext och datorplacering vid skärmbyte.

**Användare:** Alex.

**Förutsättningar:** Cykeln finns i kartan och textassistenten är tillgänglig.

**Integrationstest:**
[workspace-panels.spec.ts](../../tests/integration/workspace-panels.spec.ts),
testfallet “PANEL-02: mobile panel choice retains conversation, object text
and desktop positions”.

**Steg:**

1. Öppna Cykeln på dator och skriv en oskickad beskrivning.
2. Fokusera **Flytta Cykeln** och flytta med piltangenter. Klicka på
   rubrikens flyttkontroll, välj **Vänster** och stäng flyttknapparna med
   Escape. Dra därefter rubriken. Anteckna placeringen. Minska datorfönstret
   och kontrollera att panelen ryms; återställ fönstret och kontrollera
   att panelen återfår placeringen.
3. Öppna samtalet, lämna nödvändiga medgivanden och starta textassistenten.
   Skriv ett meddelande utan att skicka det.
4. Minska fönstret till telefonbredd. Välj varje panel med **Öppna paneler**.
   Öppna Lista och välj Cykeln igen; kontrollera rubrikfokus.
   Stäng samtalspanelen och öppna den igen från verktygsfältet.
5. Återgå till den ursprungliga datorbredden och välj Cykeln.

**Förväntat resultat:**

- Dragning, piltangenter och flyttknappar fungerar. Escape återför fokus
  från flyttknapparna till flyttkontrollen.
- Aktiv panel kommer framför övriga vid pekning eller fokus.
- Mobil visar en panel i taget och väljaren kommer före panelen i
  läsordningen. Väljaren innehåller alla öppna paneler.
- Nya paneler får rubrikfokus; stängning går till nästa panel eller
  väljaren. När sista panelen stängs går fokus till Lista i verktygsfältet.
- Oskickad objekttext och samtalstext finns kvar. Datorplaceringen återkommer.
- Kontroller och text kan nås utan horisontell sidrullning.

### PANEL-03: ett nyare förslag får inte skrivas över

**Syfte:** Bevara oskickad text när samma objekt får ett annat förslag.

**Användare:** Alex.

**Förutsättningar:** Cykeln finns i kartan och textassistenten är tillgänglig.

**Integrationstest:**
[workspace-panels.spec.ts](../../tests/integration/workspace-panels.spec.ts),
testfallet “PANEL-03: an intervening proposal for the same object preserves
text and blocks stale staging”.

**Steg:**

1. Öppna Cykeln, välj **Redigera valt objekt** och skriv
   **Min oskickade text** som beskrivning utan att skicka formuläret.
   Flytta direkt till beskrivningen när formuläret öppnas; kontrollera
   att namnet fortfarande är Cykeln och att texten hamnar i valt fält.
2. Starta textassistenten och be om ett förslag till en annan beskrivning
   för samma cykel. Vänta på det bekräftade förslaget i ditt utkast.
3. Välj Cykeln i panelväljaren. Läs varningen och kontrollera din text.
4. Kopiera eventuell text som ska behållas. Välj
   **Stäng utan att skicka texten**, öppna Cykeln igen och börja redigera.

**Förväntat resultat:**

- Den oskickade texten bevaras men ett äldre formulär kan inte läggas i
  utkastet över det nyare förslaget.
- Efter uttrycklig stängning av formuläret bygger nästa redigering på det
  aktuella förslaget. Inget gemensamt sparande sker automatiskt.

### PANEL-04: kartval bevarar oskickade samband och typer

**Syfte:** Bevara formulärtext när ett samband markeras i kartan.

**Användare:** Alex.

**Förutsättningar:** Cykeln och Garaget finns med ett sparat samband.

**Integrationstest:**
[workspace-panels.spec.ts](../../tests/integration/workspace-panels.spec.ts),
testfallet “PANEL-04: map selection preserves unsent relationship and type forms”.

**Steg:**

1. Slå på **Alla etiketter** i kartan. Öppna Lista och välj **Nytt samband**.
   Välj Cykeln som **Från objekt**.
2. Välj **Stäng arbetsytan** och markera det sparade sambandet i kartan.
   Öppna Lista igen och kontrollera ditt oskickade val. Välj
   **Stäng sambandet utan att skicka**.
3. Upprepa med **Ny objekttyp**: skriv **Oskickad typ** i **Typens namn**,
   stäng arbetsytan, markera sambandet och öppna Lista. Kontrollera texten
   och välj **Stäng typformuläret utan att skicka**.
4. Upprepa med **Ny sambandstyp** och **Oskickad riktning** i
   **Sambandstypens namn**. Avsluta med **Stäng sambandstypen utan att skicka**.

**Förväntat resultat:**

- Markeringen ändrar inte eller kastar något oskickat formulär.
- Endast uttrycklig stängning av formuläret kastar den oskickade texten.
- Inget nytt förslag eller sparande uppstår av navigeringen.

### PANEL-05: fortsätt söka medan ett förslag skickas

**Syfte:** Ett sent svar får inte flytta fokus från ett nytt arbetsval.

**Användare:** Alex.

**Förutsättningar:** Cykeln och Bilen finns i kartan. Använd ett separat
provhushåll och webbläsarens nätverksbegränsning med hög fördröjning, så att
du hinner välja sökfältet innan svaret kommer.

**Integrationstest:**
[workspace-panels.spec.ts](../../tests/integration/workspace-panels.spec.ts),
testfallet “PANEL-05: a delayed object proposal preserves a newer search
focus and the normal return target”.

**Steg:**

1. Öppna Lista, sök Cykeln och öppna dess detaljer. Välj
   **Redigera valt objekt** och skriv **Skickad beskrivning**.
2. Välj **Lägg i mitt utkast**. Medan svaret väntar, öppna Lista och
   ersätt sökningen med **Bi**.
3. Vänta tills förslaget visas i utkastet. Fortsätt skriva **len** utan
   att välja sökfältet igen.
4. Stäng av nätverksbegränsningen. Skicka en annan objektändring och stanna
   i formuläret medan svaret kommer.

**Förväntat resultat:**

- Sökfältet behåller fokus efter det sena svaret. Sökningen blir **Bilen**
  och objektet går att välja i listan.
- Den skickade beskrivningen finns i samma privata utkast. Inget sparas
  automatiskt i den gemensamma kartan.
- När du stannar i formuläret återgår fokus till **Nytt objekt** efter
  att förslaget har lagts i utkastet.
