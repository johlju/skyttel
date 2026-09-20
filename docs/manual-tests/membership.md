# Manuella testfall för medlemskap och inbjudningar

Testfallen omfattar inbjudningar, delad administration och återkallad
tillgång till hushållets karta. De kontrollerar även att en återkallelse
bevarar gemensamt innehåll och att en ny inbjudan krävs för att återfå
tillgång. Anteckna commit, webbläsare och godkänt eller underkänt resultat
vid körning.

## Konfigurerade användare

Använd en separat testinstallation med påhittat hushåll och kontrollerade
Google- eller Microsoft-identiteter enligt
[installationsguiden](../operations/installation.md).

- **Alex** är hushållets administratör och loggar in i webbläsarprofil A.
- **Robin** loggar in med en annan identitet i webbläsarprofil B. Robin
  saknar tillgång tills ett testfall anger något annat.

Namnen är roller i testfallen. Använd profilernas faktiska visningsnamn
och Skyttel-användar-ID när du granskar listorna. En person i kartan med
namnet Robin ger ingen inloggning eller tillgång.

## Allmän förberedelse

1. Skapa testhushållet som Alex. Logga in som Robin och kopiera
   **Ditt Skyttel-användar-ID** från sidan **Du har inte tillgång till
   hushållet**. Behåll separata profiler under hela körningen.
2. Återställ en separat testinstallation mellan testfallen. Om ett fall
   kräver medlemskap, använd flödet i
   [inbjudan av en användare](../users/access.md#invite-a-skyttel-user).
   Behåll koder endast för det aktuella testfallet och dela dem privat.
3. MEDLEM-05 kräver en förberedd inbjudan vars sjudagarsfrist har gått ut.
   Skapa den minst sju dagar före körningen, anteckna koden privat och
   kontrollera att dess **Gäller till** har passerat. Ersätt eller
   återkalla inte inbjudan under väntetiden. Logga in på nytt vid körning.

## Bjuda in och ansluta

### MEDLEM-01: Acceptera en inbjudan med tangentbordet

**Syfte:** Kontrollera att en inbjuden Skyttel-användare blir medlem och
att administratören ser resultatet.

**Användare:** Alex som administratör och Robin utan tillgång.

**Förutsättningar:** Robin visar sitt eget Skyttel-användar-ID i profil B.

**Integrationstest:**
[membership-ui.spec.ts](../../tests/integration/membership-ui.spec.ts),
testfallet “MEDLEM-01: an administrator invites an authenticated user who
joins by keyboard on a phone”.

**Steg:**

1. Välj **Administrera tillgång** som Alex. Ange Robins ID i
   **Skyttel-användar-ID att bjuda in** och välj **Skapa inbjudan**.
2. Kopiera **Inbjudningskod att dela**. Kontrollera **Väntar på svar**
   under **Inbjudningar**.
3. Fokusera **Inbjudningskod** som Robin och skriv koden. Tryck Tab och
   kontrollera att **Acceptera inbjudan** får fokus. Tryck Enter.
4. Kontrollera hushållets namn och rollen **Medlem** som Robin. Ladda om
   Alex sida och granska **Medlemmar** och **Inbjudningar**.

**Förväntat resultat:**

- Robin kan acceptera med tangentbordet och öppna hushållet som medlem.
  **Administrera tillgång** visas inte för Robin.
- Alex ser Robin bland medlemmarna och inbjudan som **Accepterad**.
- Koden visas inte på Alex sida efter omladdning.

### MEDLEM-02: Felaktigt ID kan rättas och återkallad kod nekas

**Syfte:** Kontrollera återhämtning från ett okänt Skyttel-användar-ID
och att en återkallad inbjudan inte ger tillgång.

**Användare:** Alex som administratör och Robin utan tillgång.

**Förutsättningar:** Robins faktiska Skyttel-användar-ID är tillgängligt.

**Integrationstest:**
[membership-ui.spec.ts](../../tests/integration/membership-ui.spec.ts),
testfallet “MEDLEM-02: invitation errors are recoverable and a revoked
code cannot grant access”.

**Steg:**

1. Öppna **Administrera tillgång** som Alex. Skriv `unknown-user` i
   **Skyttel-användar-ID att bjuda in** och välj **Skapa inbjudan**.
2. Kontrollera felmeddelandet och ersätt värdet med Robins faktiska ID.
   Välj **Skapa inbjudan** och kopiera koden.
3. Välj **Återkalla inbjudan** och **Bekräfta återkallelse**.
4. Ange den kopierade koden som Robin och välj **Acceptera inbjudan**.

**Förväntat resultat:**

- Det okända ID:t ger **Skyttel-användaren finns inte**. Det går att
  rätta ID:t och skapa inbjudan utan att lämna sidan.
- Efter bekräftelsen visar inbjudan **Återkallad** och fältet med koden
  försvinner.
- Robin får **Inbjudan kan inte användas** och saknar fortfarande tillgång.
  Den inmatade koden finns kvar så att den kan kontrolleras eller ersättas.

### MEDLEM-04: Ersätt en kod och avbryt återkallelse

**Syfte:** Kontrollera att endast den senaste väntande inbjudan fungerar
och att **Avbryt** lämnar den nya inbjudan användbar.

**Användare:** Alex som administratör och Robin utan tillgång.

**Förutsättningar:** Ingen inbjudan till Robin är accepterad.

**Integrationstest:**
[membership-ui.spec.ts](../../tests/integration/membership-ui.spec.ts),
testfallet “MEDLEM-04: replacing an invitation invalidates the old code
and cancellation keeps the new code usable”.

**Steg:**

1. Skapa en inbjudan till Robin som Alex och kopiera den första koden.
   Ladda om sidan. Kontrollera att koden försvinner men att inbjudan
   fortfarande visar **Väntar på svar**.
2. Skapa en ny inbjudan till samma ID och kopiera den nya koden. Granska
   båda raderna under **Inbjudningar**.
3. Välj **Återkalla inbjudan** för den väntande inbjudan. Kontrollera
   förklaringen att koden slutar fungera och välj **Avbryt**.
4. Försök acceptera den första koden som Robin. Kontrollera felet och
   att tillgång fortfarande saknas. Ersätt koden med den nya och acceptera.
5. Ladda om Alex sida och granska medlemmarna och inbjudningarna.

**Förväntat resultat:**

- Den nya koden skiljer sig från den första. Den första inbjudan visar
  **Återkallad**, den nya **Väntar på svar**.
- **Avbryt** stänger bekräftelsen. Den nya koden är fortfarande synlig
  och användbar.
- Den första koden nekas. Den nya öppnar hushållet och felmeddelandet
  försvinner.
- Alex ser Robin som medlem och den nya inbjudan som **Accepterad**.

### MEDLEM-05: Utgången inbjudan kräver en ny kod

**Syfte:** Kontrollera att en passerad giltighetstid visas och hindrar
anslutning, samt att en ny inbjudan kan användas.

**Användare:** Alex som administratör och Robin utan tillgång.

**Förutsättningar:** En oanvänd inbjudan till Robin har passerat
**Gäller till**, enligt den allmänna förberedelsen. Koden finns sparad.
Integrationstestet ordnar motsvarande datum i en separat testdatabas.

**Integrationstest:**
[membership-ui.spec.ts](../../tests/integration/membership-ui.spec.ts),
testfallet “MEDLEM-05: an expired invitation is visibly unusable and a
fresh invitation restores the join flow”.

**Steg:**

1. Öppna **Administrera tillgång** som Alex. Granska den gamla inbjudan.
2. Ange den gamla koden som Robin och välj **Acceptera inbjudan**.
3. Skapa en ny inbjudan till Robins ID som Alex. Kopiera den nya koden.
4. Ersätt den gamla koden som Robin med den nya och acceptera.
5. Ladda om Alex sida och kontrollera medlemmarna och inbjudningarna.

**Förväntat resultat:**

- Den gamla inbjudan visar **Utgången** utan knapp för återkallelse.
- Den gamla koden ger **Inbjudan kan inte användas**. Koden finns kvar i
  inmatningen och Robin saknar tillgång till hushållet.
- Den nya koden öppnar hushållet med rollen **Medlem**.
- Alex ser Robin bland medlemmarna och en **Accepterad** inbjudan.

### MEDLEM-07: Kontrollera tillgång efter ett avbrott

**Syfte:** Kontrollera att ett oklart svar ger möjlighet att läsa aktuell
tillgång och att inbjudan kan användas när anslutningen fungerar igen.

**Användare:** Alex som administratör och Robin utan tillgång.

**Förutsättningar:** Alex skapar en inbjudan till Robin och delar koden.
Använd Chromium eller Chrome med utvecklarverktyg i Robins profil.

**Integrationstest:**
[membership-ui.spec.ts](../../tests/integration/membership-ui.spec.ts),
testfallet “MEDLEM-07: a recipient can check access when the acceptance
response is lost”.

**Steg:**

1. Öppna utvecklarverktygen som Robin. Öppna kommandomenyn med
   `Ctrl+Shift+P` eller `Cmd+Shift+P`, sök efter
   **Show Network request blocking** och öppna panelen. Aktivera
   **Enable network request blocking**, lägg till mönstret
   `*/api/invitations/accept` och aktivera dess kryssruta.
2. Ange koden i **Inbjudningskod** och välj **Acceptera inbjudan**.
   Kontrollera felmeddelandet och att koden finns kvar.
3. Välj **Kontrollera tillgång**. Kontrollera att sidan fortfarande visar
   **Du har inte tillgång till hushållet**.
4. Stäng av nätverksblockeringen. Ange koden igen vid behov och välj
   **Acceptera inbjudan**. Kontrollera att hushållet öppnas.

**Förväntat resultat:**

- Avbrottet visar **Inbjudan kunde inte bekräftas** och knappen
  **Kontrollera tillgång**. Koden finns kvar före kontrollen.
- Kontrollen ger inte tillgång när acceptansen inte når servern.
- Samma inbjudan kan användas efter att blockeringen stängs av.

Integrationstestet bryter dessutom svaret efter att servern accepterar
inbjudan. I det fallet ska **Kontrollera tillgång** öppna hushållet utan
en ny inbjudan eller upprepad acceptans. Det kontrollerade avbrottet efter
acceptans provas endast automatiserat; de manuella stegen bryter
begäran innan den når servern.

## Roller och återkallad tillgång

### MEDLEM-03: Dela administration och återkalla tillgång

**Syfte:** Kontrollera att rolländringar och återkallelse gäller öppna
sidor och att användaren inte kan ändra sin egen roll genom gränssnittet.

**Användare:** Alex som administratör och Robin som medlem.

**Förutsättningar:** Robin är medlem genom en accepterad inbjudan.
Alex håller sidan **Administrera tillgång** öppen.

**Integrationstest:**
[membership-ui.spec.ts](../../tests/integration/membership-ui.spec.ts),
testfallet “MEDLEM-03: administrators share responsibility and open clients
lose revoked access without disrupting input”.

**Steg:**

1. Välj **Gör till administratör** på Robins rad som Alex.
2. Skriv `påbörjat-id` i **Skyttel-användar-ID att bjuda in** och behåll
   fokus där under nästa automatiska uppdatering av listorna.
3. Öppna **Administrera tillgång** som Robin. Kontrollera knapparna
   **Gör till medlem** och **Återkalla tillgång** på raden märkt **(du)**.
4. Välj **Gör till medlem** för Alex som Robin. Kontrollera Alex öppna
   sida och välj **Till startsidan** där.
5. Välj **Återkalla tillgång** för Alex som Robin. Läs bekräftelsen och
   välj **Avbryt**. Öppna bekräftelsen igen och välj
   **Bekräfta återkallelse**.
6. Kontrollera Alex öppna sida och Robins medlemslista.

**Förväntat resultat:**

- Robin blir administratör. Alex påbörjade text och fokus finns kvar
  vid automatisk uppdatering.
- Robins egna roll- och åtkomstknappar är synliga men inaktiva, både
  före och efter att Alex blir medlem.
- Alex ser **Du kan inte administrera hushållet** och ingen medlemslista
  efter rolländringen. Startsidan ger fortfarande tillgång till hushållet
  utan länken **Administrera tillgång**.
- Återkallelsen kräver bekräftelse och förklarar att personer och innehåll
  i kartan finns kvar. **Avbryt** stänger bekräftelsen.
- Efter bekräftad återkallelse ser Alex **Du har inte tillgång till
  hushållet**, och Alex försvinner från Robins medlemslista.

### MEDLEM-06: Bevara kartan vid återkallelse och bjud in på nytt

**Syfte:** Kontrollera att medlemskap och kartans innehåll är skilda och
att en accepterad kod inte kan återställa återkallad tillgång.

**Användare:** Alex som administratör och Robin som medlem.

**Förutsättningar:** Robin är medlem genom en accepterad inbjudan.
Behåll den accepterade koden för steg 4. Kartan saknar **Robin i kartan**.

**Integrationstest:**
[membership-ui.spec.ts](../../tests/integration/membership-ui.spec.ts),
testfallet “MEDLEM-06: revocation preserves shared objects and only a
new invitation restores membership”.

**Steg:**

1. Välj **Nytt objekt** som Robin. Ange **Robin i kartan** som
   **Objektets namn**, välj **Lägg i mitt utkast** och
   **Spara hela utkastet**. Kontrollera bekräftelsen **Sparat**.
2. Öppna **Administrera tillgång** som Alex och försök skapa en inbjudan
   till Robins befintliga ID. Kontrollera felmeddelandet.
3. Välj **Återkalla tillgång** på Robins rad. Läs bekräftelsen och välj
   **Bekräfta återkallelse**. Kontrollera att Robin försvinner från listan.
4. Ladda om Robins sida och försök acceptera den tidigare accepterade
   koden. Kontrollera felet och att tillgång saknas.
5. Välj **Till hushållet** som Alex och sök efter **Robin i kartan**.
   Kontrollera att objektet finns kvar.
6. Skapa en ny inbjudan till Robins ID som Alex. Acceptera den nya koden
   som Robin och sök efter **Robin i kartan** igen.

**Förväntat resultat:**

- En befintlig medlem kan inte bjudas in igen. Alex ser **har redan
  tillgång till hushållet** och ingen ny kod.
- Återkallelsen tar bort medlemskapet. Den gamla koden nekas och kan
  inte återställa tillgången.
- Objektet som Robin sparar finns kvar och kan hittas av Alex efter
  återkallelsen.
- En ny kod ger Robin rollen **Medlem** igen, med tillgång till samma
  sparade objekt.
