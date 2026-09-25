# Manuella testfall för fullständig export

Testfallen omfattar administratörens information före export, nedladdning,
avbrott, ändrad tillgång, giltighetstid och bevarat innehåll efter
sammanslagning. Anteckna commit, webbläsare och godkänt eller underkänt
resultat vid körning.

## Konfigurerade användare

Använd en isolerad testinstallation och separata webbläsarprofiler med
testinloggning eller kontrollerade identiteter enligt
[installationsguiden](../operations/installation.md).

- **Alex** är administratör i hushållet Linden och använder profil A.
- **Robin** är medlem i samma hushåll och använder profil B. EXPORT-04 och
  EXPORT-07 kräver att Robin också är administratör.

Använd bara påhittade uppgifter och testbilder. Vanlig tillgång till kartan
ger ingen rätt att göra fullständig export.

## Allmän förberedelse

1. Skapa Linden som Alex och bjud in Robin enligt
   [guiden för tillgång](../user-guide/access.md#bjud-in-en-skyttel-användare).
2. Spara ett gemensamt objekt med profilbild. Ändra beskrivningen och
   spara igen så att historik finns. Lägg ett eget privat objekt i Robins
   utkast och ändra Robins personliga vy utan att spara utkastet.
3. Använd en tom, privat mapp för nedladdningarna. Kontrollera att du kan
   öppna ZIP-filer och JSON-filer. Radera testexporterna efter körningen.
4. Återställ installationen mellan testfallen. Vid omstart i EXPORT-06
   ska databasen och samma inloggning finnas kvar.

## Förberedelse och hämtning

### EXPORT-01: Hämta en fullständig export med tangentbordet

**Syfte:** Kontrollera att administratören får information om privata
uppgifter före exporten och kan hämta en komplett fil med tangentbordet.

**Användare:** Alex som administratör och Robin som medlem.

**Förutsättningar:** Gemensamt innehåll, historik, bild och Robins privata
uppgifter finns enligt förberedelsen.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-01: an administrator downloads the complete household
archive by keyboard”.

**Steg:**

1. Kontrollera som Robin att **Administrera tillgång** saknas. Öppna samma
   administrationsadress som Alex använder och kontrollera att ingen
   export erbjuds.
2. Öppna **Administrera tillgång** som Alex. Läs **Fullständig export**
   innan du trycker på någon exportknapp.
3. Använd Tab till **Förbered fullständig export** och tryck Enter.
   Vänta tills exporten är klar och kontrollera den visade sluttiden.
4. Använd tangentbordet till **Hämta ZIP-fil** och tryck Enter. Spara
   filen i testmappen och öppna den med ett ZIP-program.
5. Kontrollera att arkivet innehåller `manifest.json`, `content.json`
   och `images.bin`. Öppna `content.json` och hitta det gemensamma
   objektet, historiken, Robins privata utkast och personliga vy.

**Förväntat resultat:**

- Endast administratören kan förbereda export. Före starten framgår att
  andras privata utkast, personliga vyer, bilder och historik ingår,
  att filen behöver förvaras säkert och att senare ändringar kan gå
  förlorade vid ett större driftfel.
- Förberedelsen startar ingen nedladdning. En färdig export visar en
  sluttid och kan hämtas med tangentbordet.
- Webbläsaren erbjuder en ZIP-fil först efter att hela filen tas emot.
  Meddelandet säger att webbläsarens nedladdning startar; kontrollen av
  den sparade filen återstår för användaren.
- Arkivet går att öppna och innehåller hushållets gemensamma och privata
  uppgifter. Knappen för samma hämtning försvinner.

### EXPORT-02: Avbryt en förberedd export och börja om

**Syfte:** Kontrollera att avbrott lämnar hushållets innehåll kvar och
att en ny export kan förberedas.

**Användare:** Alex som administratör.

**Förutsättningar:** Administrationssidan är öppen.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-02: an administrator cancels an export and prepares
another”.

**Steg:**

1. Välj **Förbered fullständig export** och vänta tills den är klar.
2. Välj **Avbryt export** och kontrollera beskedet.
3. Förbered en ny export och hämta ZIP-filen. Kontrollera att samma
   gemensamma innehåll och privata utkast finns kvar.

**Förväntat resultat:**

- **Exporten har avbrutits** visas. Den gamla hämtknappen försvinner
  och ingen fil laddas ned vid avbrottet.
- En ny förberedelse och hämtning fungerar. Hushållets uppgifter ändras
  inte av exporten eller avbrottet.

### EXPORT-03: Avbruten hämtning kräver en ny export

**Syfte:** Kontrollera att anslutningsfel inte visas som en lyckad
nedladdning och att användaren kan försöka igen.

**Användare:** Alex som administratör.

**Förutsättningar:** En export är färdig. Webbläsarens nätverksverktyg
är öppna. Integrationstestet bryter motsvarande hämtning vid nätverket.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-03: an interrupted download offers a new export without
reporting success”.

**Steg:**

1. Sätt webbläsarens nätverk till frånkopplat efter att förberedelsen
   är klar och före **Hämta ZIP-fil**.
2. Välj **Hämta ZIP-fil** och kontrollera felmeddelandet och testmappen.
3. Återställ nätverket. Välj **Förbered fullständig export** och hämta
   den nya filen.

**Förväntat resultat:**

- Felet ber användaren kontrollera anslutningen och förbereda en ny
  export. Ingen fil eller lyckad nedladdning erbjuds efter felet.
- Den gamla hämtknappen försvinner. En ny förberedelse ersätter felet
  och kan följas av en komplett ZIP-fil.

### EXPORT-04: Ändrad administratörsroll stoppar en färdig export

**Syfte:** Kontrollera att en färdig export kräver aktuell
administratörsroll när filen hämtas.

**Användare:** Alex och Robin som administratörer i separata profiler.

**Förutsättningar:** Alex har en färdig export. Robin kan ändra Alex roll.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-04: a changed administrator role blocks export and
clears the ready download”.

**Steg:**

1. Behåll Alex färdiga export öppen i profil A.
2. Välj **Gör till medlem** för Alex som Robin i profil B.
3. Återgå till Alex profil. Om **Hämta ZIP-fil** fortfarande visas,
   välj den direkt. Annars kontrollera att exportflödet redan stängs.
4. Ladda om administrationsadressen som Alex och kontrollera tillgången.

**Förväntat resultat:**

- Ingen ZIP-fil erbjuds efter rolländringen. Den färdiga exporten och
  dess knappar försvinner när den ändrade tillgången upptäcks.
- Alex kan fortfarande använda hushållets karta som medlem men inte
  förbereda eller hämta fullständig export.

### EXPORT-05: Utgången export kräver ny förberedelse

**Syfte:** Kontrollera att en passerad sluttid inte lämnar en användbar
hämtknapp och att en ny export kan göras.

**Användare:** Alex som administratör.

**Förutsättningar:** En export är färdig. Integrationstestet ger ett
svar om utgången export; serverns tidsgräns kontrolleras separat.

**Integrationstest:**
[household-export-ui.spec.ts](../../tests/integration/household-export-ui.spec.ts),
testfallet “EXPORT-05: an expired export requires a new preparation”.

**Steg:**

1. Anteckna sluttiden och låt sidan vara öppen utan att hämta filen.
   Vänta tills tio minuter har gått och den visade tiden passerar.
2. Kontrollera beskedet och vilka knappar som finns.
3. Förbered och hämta en ny export.

**Förväntat resultat:**

- Ett besked visar att exporten har gått ut. Den gamla hämtknappen
  försvinner och ingen fil erbjuds för den utgångna exporten.
- En ny förberedelse får en ny giltighetstid och kan hämtas.

## Historiskt och privat innehåll

### EXPORT-06: Bevara sammanslagning, bildversioner och privat utkast

**Syfte:** Kontrollera att exporten efter omstart innehåller underlaget
för sammanslagning och ångring samt senare privat arbete.

**Användare:** Alex som administratör.

**Förutsättningar:** Två sparade objekt av samma typ heter Lo Exempel.
Anteckna båda identifierarna. Det andra har en sparad profilbild.
Flytta båda i Alex personliga vy så att placeringarna sparas.

**Integrationstest:**
[household-export-content.spec.ts](../../tests/integration/household-export-content.spec.ts),
testfallet “EXPORT-06: a full archive preserves merge identities and
original, copied and private image versions”.

**Steg:**

1. Följ [guiden för sammanslagning](../user-guide/object-merge.md). Låt det
   första objektet behålla sin identitet och välj det andra objektets
   profilbild. Bekräfta samma företeelse och spara hela utkastet.
2. Anteckna kvittot. Öppna **Visa historik** och granska sammanslagningen,
   inklusive ursprungliga identiteter och bildval. Kontrollera att den
   gemensamma bilden på det kvarvarande objektet visar samma motiv som
   bilden på det andra objektet före sammanslagningen.
3. Välj en annan profilbild på det kvarvarande objektet. Lämna
   bildförslaget i det privata utkastet utan att spara.
4. Starta om installationen med samma databas. Kontrollera att det
   privata bildförslaget och sammanslagningens historik finns kvar.
5. Hämta fullständig export och öppna `content.json` i ZIP-filen.
   Jämför objekten, kvittot och historiken med identifierarna och
   uppgifterna du antecknar. Kontrollera även utkast, bildreferenser
   och personliga placeringar. Kontrollera att varje bildversion har
   en egen identifierare och ett byteintervall inom `images.bin`.

**Förväntat resultat:**

- Båda objektens ursprungliga identiteter finns i arkivet. Det andra
  objektet är markerat som borttaget och historiken beskriver hela
  sammanslagningen med samma kvitto som i Skyttel.
- Bilden på det andra objektet, kopian på det kvarvarande objektet och
  den senare privata bildversionen finns med. Utkastet hänvisar till den
  privata versionen. Arkivet innehåller bilddata i `images.bin`.
- Alex personliga placeringar för båda objektens identiteter finns kvar.
  Den privata ändringen ersätter inte det gemensamma innehållet.

## Ändrad tillgång under hämtning

### EXPORT-07: Återkallad tillgång avbryter pågående hämtning

**Syfte:** Kontrollera att ändrad roll och återkallat medlemskap stoppar
en pågående överföring och tar bort dess tillfälliga serverkopia.

**Användare:** Alex som administratör i webbläsaren och Robin som
administratör i en separat, kontrollerad HTTP-klient.

**Förutsättningar:** Använd
[exportförberedelsen](#controlled-export-fixture) i stället för den
allmänna förberedelsen. Den startar en isolerad app med riktig SQLite,
kontrollerade externa inloggningssvar och 100 syntetiska bildversioner.
Alex och Robin får sina separata sessioner genom appens vanliga inloggning.
Håll kontrollklienten och en andra terminal för filkontrollen öppna.
Använd inte webbläsarens hastighetsbegränsning som bevis för aktiv server.

**Integrationstest:**
[household-export-content.spec.ts](../../tests/integration/household-export-content.spec.ts),
testfallet “EXPORT-07: revocation or demotion interrupts an active download
and removes its private copy”.

**Steg:**

1. Skriv `pause` i kontrollklienten. Kräv händelsen `paused` med
   `archiveBytes > 16777216`, `receivedBytes > 0`,
   `sourceReadBytes < archiveBytes` och `active: true`. Kontrollera den
   privata filens storlek och rättigheter med guidens `ls`-kommandon.
2. Skriv `inspect` och kontrollera på nytt `active: true` samt olästa byte
   i serverns källfil. Välj omedelbart **Gör till medlem** för Robin som
   Alex. Gör kontrollen inom en minut, före angiven `expiresAt`.
3. Skriv `resume`. Kräv färre mottagna byte än hela arkivet,
   `interrupted: true`, `beforeExpiry: true`, `scratchEmpty: true` och
   `retryStatus: 403`. Kör guidens separata kontroll av
   `.skyttel-exports`: resultatet ska vara `[]` och slutstatus noll.
4. Gör Robin till administratör igen som Alex. Upprepa steg 1–3 med ett
   nytt export-ID, men välj denna gång **Återkalla tillgång** och bekräfta
   återkallelsen direkt efter `inspect`. Kontrollera åter både det
   ofullständiga svaret, nekad ny hämtning och den tomma serverkatalogen.
5. Skriv `quit` och kontrollera att den tillfälliga katalogen försvinner
   enligt guidens avslutningskommando. Anteckna resultatet för båda
   åtkomständringarna; en utgången export eller `active: false` räknas inte.

**Förväntat resultat:**

- Både rolländring och återkallat medlemskap avbryter den aktiva hämtningen.
  Kontrollklienten tar emot färre byte än det annonserade arkivets storlek
  och redovisar avbrott. Ingen komplett ZIP kan återskapas från svaret.
  Klienten skriver ingen fil; webbläsarens filerbjudande provas i EXPORT-01.
- Den tillfälliga serverkopian tas bort och samma hämtning kan inte
  återupptas. Redan mottagna data eller data i nätverkets buffertar kan
  inte återkallas.

## Controlled export fixture

This disposable Linux fixture prepares
[EXPORT-07](household-export.md#export-07-återkallad-tillgång-avbryter-pågående-hämtning).
It runs the actual application, authentication, SQLite and HTTP export
stream. Only external Google/Microsoft responses use the existing controlled
test identities. It does not test live provider login. It accepts no origin,
database path, credentials or production configuration.

### Start the isolated application

From the repository root in the devcontainer, use Node.js 24 and run:

```sh
npm ci
npm run build
node --import tsx scripts/manual-export.ts
```

Keep this terminal open. The launcher creates a new private directory under
`/tmp`, starts the app on a random loopback port and establishes Alex and
Robin through the normal public authentication callbacks. It creates Linden,
invites Robin, accepts the invitation and makes Robin an administrator
through public HTTP. The fixture adds 100 retained synthetic lossless image
versions containing random pixels, matching the automated export fixture.
The exported ZIP must exceed 16 MiB; compressible solid-color images would
not provide the required transfer size.

Wait for the JSON line whose `event` is `ready`. It gives `origin`,
`administrationUrl`, `directory` and `scratchDirectory`. No session cookies
or provider tokens are printed or written to a client credential file.
If using VS Code port forwarding, forward the printed port to the same
number on the host and open the exact `http://127.0.0.1:PORT` address.
Use a fresh browser profile and **Fortsätt med Google** to enter as the
controlled Alex. Open the printed `administrationUrl`. The HTTP reader is
already signed in as the controlled Robin in a separate session.

Use the [manual case](household-export.md#export-07-återkallad-tillgång-avbryter-pågående-hämtning)
for the application actions. Do not start extra exports or another app on
this fixture database. This preparation is not a manual test result.

### Reader controls and evidence

Type these commands in the launcher's terminal, one at a time:

```text
pause
inspect
resume
quit
```

`pause` prepares a fresh export as Robin and opens its real HTTP response.
It consumes one chunk and then stops reading. It samples the server's open
archive file position through Linux `/proc/self/fdinfo` until that position
stops advancing. The `paused` event must show:

- `archiveBytes` greater than `16777216`;
- `receivedBytes` greater than zero;
- `sourceReadBytes` at least `receivedBytes` and less than `archiveBytes`;
- `active: true`, with an `expiresAt` still in the future.

These measurements show unread bytes in the server's source file, not just
a browser request that appears pending. `inspect` repeats the measurement
without consuming more of the response. Run it immediately before changing
access as Alex. A missing source, `active: false` or an `error` event is not
valid evidence: quit and start a fresh fixture instead of recording a pass.

Complete each role-change check well before the displayed expiry, normally
within a minute. Exports expire after ten minutes, which would otherwise
confound the access-change result. Do not use browser throttling.

After changing access, `resume` drains the response and reports `result`.
Require `receivedBytes < archiveBytes`, `interrupted: true`,
`beforeExpiry: true`, `scratchEmpty: true` and `retryStatus: 403`.
The client counts bytes and never writes a ZIP. A complete response or any
other result is a failed check, not a successful interrupted transfer.
For the second run, restore Robin's administrator role through Alex's UI,
then use `pause` again; it creates a different export ID.

### Inspect the private server copy

Open a second terminal. Set this variable to the exact `directory` printed
by this launcher's `ready` event; do not use an ordinary database directory:

```sh
SKYTTEL_EXPORT_CASE_DIR='/tmp/skyttel-test-REPLACE-WITH-PRINTED-DIRECTORY'
ls -ld -- "$SKYTTEL_EXPORT_CASE_DIR/.skyttel-exports"
ls -l -- "$SKYTTEL_EXPORT_CASE_DIR/.skyttel-exports"/*/archive.zip
```

Run these commands while `pause` holds the stream open. The directory should
have private permissions (`drwx------`), and its one export subdirectory
contains `archive.zip`. Its size matches `archiveBytes`.

After **each** access change and `resume`, run this exact emptiness check.
It lists names only, never archive content or login data. Require `[]` and
exit status zero, while the `.skyttel-exports` directory itself still exists:

```sh
node -e 'const fs = require("node:fs");
const entries = fs.readdirSync(process.argv[1]);
console.log(JSON.stringify(entries));
if (entries.length) process.exitCode = 1;' \
  "$SKYTTEL_EXPORT_CASE_DIR/.skyttel-exports"
```

### Finish or reset

Type `quit` in the launcher terminal. Ctrl+C also requests shutdown. The
launcher closes the reader and server, removes its own temporary directory
and prints `closed`. Verify from the second terminal:

```sh
test ! -e "${SKYTTEL_EXPORT_CASE_DIR:?}" && printf '%s\n' 'Fixture removed'
unset SKYTTEL_EXPORT_CASE_DIR
```

Close the test browser profile and remove the forwarded port. No downloaded
ZIP or client credentials need cleaning. If the process is forcibly killed
instead of quitting, first ensure it is stopped. In the second terminal,
with the variable still set to its exact printed temporary directory, run:

```sh
rm -r -- "${SKYTTEL_EXPORT_CASE_DIR:?}"
unset SKYTTEL_EXPORT_CASE_DIR
```

Restart the launcher for a new case; it never reuses the previous database
or sessions.
