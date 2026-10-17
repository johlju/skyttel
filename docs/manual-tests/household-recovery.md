# Manuella testfall för återställning och flytt

Testfallet omfattar fullständig flytt till tom lagring, uttrycklig koppling
av historiskt privat innehåll, omstart och fortsatt export till ännu en
installation. Anteckna commit, webbläsare och godkänt eller underkänt
resultat vid körning. Använd isolerade provinstallationer och bekräfta
förberedelserna nedan innan en mänsklig körning påbörjas.

## Konfigurerade användare

**Alex** är rollen för den befintliga första administratörens verifierade
inloggning på källan. **Robin** är en annan verifierad inloggning som blir
första administratör på målet; samma person får kontrollera båda kontona.
Namnen är testroller, inte krav på kontonas verkliga namn. Källans historiska
innehåll kopplas avsiktligt till Robin efter uttrycklig granskning.

## Allmän förberedelse

1. Följ [den lokala flyttförberedelsen](#local-recovery-preparation).
   Den skapar separata tomma databaser och hemligheter på port 5173 och
   3301. Använd separata Chrome-profiler A och B enligt guiden. Skapa ett
   tomt hushåll på vardera installationen efter normal inloggning.
2. Använd endast påhittat innehåll. Skapa tre tydligt olika provbilder enligt
   [bildförberedelsen](profile-images.md#allmän-förberedelse), med olika färger.
   Spara hämtade arkiv och nedanstående begäransfiler privat, utanför Git.
3. Förbered ytterligare en tom Chrome-profil C. Samma temporära katalog
   används för omstarter; återskapa inte databaserna mitt i fallet.

## Flytt utan gammal inloggningsbehörighet

### FLYTT-01: återställ, koppla ägare och flytta vidare

**Syfte:** Kontrollera att en fullständig export ensam räcker för innehållet,
att verifierad ny inloggning krävs och att privat arbete förblir återställbart.

**Användare:** Alex på källan, Robin på målet och Alex i profil C på en tredje,
tom installation. Den tredje installationen använder en ny egen hemlighet.

**Förutsättningar:** Båda installationerna fungerar enligt förberedelsen.
Ingen annan skriver till dem. Chromium med utvecklarverktyg finns tillgängligt.

**Separat förberedelse:** Driftansvarig följer
[återhämtningsblockeringen och åtkomstprovet](#flytt-01-separata-operatörssteg).
Invänta besked att blockeringen är aktiv i A och B innan ett väntande
försök registreras, och i C före återimporten i steg 11. Alla tre profiler
behåller blockeringen genom båda privata läsningarna i steg 13. Den släpps
först omedelbart före det nya uttryckliga sparandet med aktuellt underlag.

**Integrationstest:**
[household-recovery.spec.ts](../../tests/integration/household-recovery.spec.ts),
testfallet “FLYTT-01: a fresh installation restores an archive, explicitly
assigns private ownership and remains portable after restart”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-recovery.spec.ts",
    "caseId": "FLYTT-01"
  },
  "reference": "Tre tomma installationer med egna hemligheter; endast exportarkivet flyttas.",
  "outcomes": [
    "Kontrollera att en fullständig export ensam räcker för innehållet, att verifierad ny inloggning krävs och att privat arbete förblir återställbart."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. På källan: lägg till ett eget textfält **Notering** på en objekttyp.
   Skapa och spara **Kvarvarande lampa** och **Borttagen lampa** med fältvärden.
   Spara den första bilden på det kvarvarande objektet, byt till den andra
   och spara igen. Ta bort det andra objektet och spara. Anteckna objektens
   stabila ID och kvittonas författare, ID och tidpunkter från historiken.
2. Föreslå den tredje bilden på kvarvarande objekt, men spara inte förslaget.
   Flytta objektet till en igenkännlig personlig plats i rymdkartan. Aktivera
   stjärnor och välj axelindikatorn i övre vänstra hörnet. Anteckna källans
   historiska innehålls-ID från **Koppla historiskt innehåll**.
3. Be driftansvarig registrera det väntande försöket i profil A enligt
   [förberedelsen](household-recovery-console.md#flytt-01-förberedelse-1).
   Invänta **Väntande försök förberett, begäransfilen sparad**.
4. Be driftansvarig starta det separata åtkomstprovet. Öppna dess angivna
   auktoriseringsadress i profil A, välj källhushållet och godkänn de
   särskilda AI- och kartmedgivandena. Invänta bekräftelse att den gamla
   behörigheten fungerar och kan läsa det privata bildförslaget.
5. Stoppa alla innehållsändringar på källan. Hämta dess fullständiga export
   och invänta driftansvarigs sista kontroll av fungerande behörighet
   enligt åtkomstprovet. Stoppa sedan endast källservern i
   terminal A. Behåll profilen, konfigurationen, arkivet och kontrollklienten.
6. I profil B: återimportera källarkivet genom
   **Inställningar → Återimportera hushållet** på målet.
   Granska och bekräfta uttryckligen. Läs in hushållet igen. Kartan och
   historiken ska finnas, men Robins privata utkast ska vara tomt; källans
   tredje bild ska inte visas som Robins förslag. Ingen identitet kopplas
   automatiskt, även om verkliga konton råkar ha samma namn eller e-postadress.
7. Lägg **Nytt privat arbete** i Robins utkast utan att spara. Anteckna
   Robins historiska innehålls-ID. Be driftansvarig registrera målets
   väntande försök enligt förberedelsen. Invänta
   **Väntande försök förberett, begäransfilen sparad**.
8. Öppna **Inställningar → Koppla historiskt innehåll** och välj
   **Hämta aktuella innehållskopplingar**.
   Välj källans historiska ID och Robins aktuella verifierade användar-ID.
   Läs att Robins tidigare privata arbete bevaras utan aktuell ägare.
   Bekräftelseknappen ska vara avstängd tills rutan om identifierad person
   markeras. Bekräfta, starta om målservern med samma databas och läs in kartan.
9. Kontrollera källans privata tredje bild, personliga plats och visningsval.
   Kvittonas författare, stabila ID och tidpunkter ska vara oförändrade.
   Robins tidigare privata identitet ska fortfarande visas utan aktuell
   ägare i administrationslistan. Exportera målet på nytt; behåll det andra
   arkivet. Stoppa därefter målservern. Bara en installation ska vara skrivbar.
10. Be driftansvarig starta den tredje tomma installationen enligt den
    separata förberedelsen. Innan någon ny inloggning i profil A:
    invänta driftansvarigs bekräftelse från åtkomstprovet att både den gamla
    sessionen och det gamla medgivandet saknar åtkomst. Logga sedan in som
    Alex i profil C och skapa ett nytt tomt hushåll.
11. Återimportera målarkivet i profil C. Koppla uttryckligen källans
    historiska ID till profil C:s verifierade medlem. Starta om tredje
    servern med samma konfiguration; behåll begäransblockeringen aktiv.
    Kontrollera samma privata bild och
    historik. Invänta den separata tekniska kontrollen av gamla försök
    innan nästa export.
12. Hämta en tredje fullständig export genom
    **Inställningar → Fullständig export → Förbered fullständig export →
    Hämta ZIP-fil**. Behåll filen och invänta den separata arkivkontrollen
    innan någon innehållskoppling ändras.
13. Först efter jämförelsen: koppla Robins tidigare privata identitet till
    profil C:s medlem. Läs in kartan och kontrollera **Nytt privat arbete**.
    Koppla tillbaka källidentiteten och kontrollera det privata bildförslaget.
    Medlemskapet ska bestå under båda bytena. Be först nu driftansvarig
    släppa återhämtningsblockeringen i profil C enligt förberedelsen och
    invänta besked. Spara omedelbart därefter hela utkastet med ett
    nytt aktuellt underlag och kontrollera kvittot efter omstart.
14. Stäng testprofilerna. Stoppa servern, radera de privata export- och
    begäransfilerna och städa endast provkatalogen enligt förberedelseguiden.
    Starta inte den gamla källan för fortsatt arbete efter flytten.

#### FLYTT-01: separata operatörssteg

Driftansvarig utför följande förberedelse och tekniska kontroller vid de
angivna UI-stegen. Anteckna resultaten separat från människans kartläsning.

1. Före UI-steg 3 och 7: blockera `*/text-assistant/recover` med Chromiums
   beständiga begäransblockering i profil A och B. Aktivera samma regel i
   profil C före återimporten i steg 11. Behåll utvecklarverktygen och regeln
   aktiva i alla tre profiler genom sidbyten, omladdningar, serveromstarter
   och båda innehållskopplingarna och privata läsningarna i steg 13.
   Kontrollera regeln i nätverkspanelen efter varje omladdning och meddela
   **Återhämtningsblockeringen är aktiv**. En tillfällig ersättning av fetch
   räcker inte. Lossa verktygen till ett separat fönster så att sidans
   avsedda bredd bevaras; stäng dem inte medan blockeringen behövs.
2. Vid UI-steg 4: vidarebefordra port 47731 privat till samma värdport.
   Starta klienten i en tredje terminal från projektets rot:

   ```sh
   node --import tsx scripts/manual-mcp-client.ts http://localhost:5173 47731
   ```

   Lämna dess `authorize`-adress till människan. Efter godkännandet i profil
   A: invänta `ready`, kör `read` och kontrollera det privata bildförslaget.
   Meddela **Källans medgivande och privata läsning fungerar**. Behåll
   processen öppen. Kopiera inga token, cookies eller returadresser.
3. Vid UI-steg 5, efter exporten men före källserverns stopp: kör `read`
   en sista gång i samma klient. Bekräfta att behörigheten fortfarande
   fungerar. Vid utgånget medgivande görs åtkomstprovet om; en sådan
   avvisning bevisar inte att en ny installation avvisar gammal behörighet.
4. Vid UI-steg 10: skapa och starta den tredje tomma installationen på
   källans lediga port 5173 enligt **Tredje installationen utan rå
   databaskopia** nedan. Behåll samma provkatalog och egna nya hemlighet.
   Före ny inloggning i profil A: öppna `/api/bootstrap` i profil A och
   kontrollera att den gamla Skyttel-sessionen inte är inloggad. Kör `read`
   i den gamla klienten och kräv `MCP HTTP 401`. Avsluta med `quit`.
   Meddela **Gammal session och gammalt medgivande saknar åtkomst** innan
   människan loggar in normalt i profil C.
5. Först efter båda meningsfulla privata läsningarna i UI-steg 13: ta bort
   blockeringen i profil C och meddela **Återhämtning är tillåten inför
   nytt sparande** omedelbart före människans nya uttryckliga sparande.
   Profiler A och B behåller sina regler tills de stängs i steg 14;
   de gamla installationerna får inte användas för fortsatt arbete.

**Förbered ett känt väntande försök:**

Kör i Console på respektive installations hushållssida före dess export
eller ägarbyte. Koden hämtar aktuellt bygg-ID och utkast, förbereder en
operation och laddar ned endast dess tre begäransfält. Inga inloggningsdata
följer med filen. Ange hushållets ID från sidans adress.

Kör [den separata förberedelsen 1](household-recovery-console.md#flytt-01-förberedelse-1)
för FLYTT-01 i det angivna läget.

**Tredje installationen utan rå databaskopia:**

I terminal A, med källan och målet stoppade och samma provkatalog kvar:

```sh
node --input-type=module <<'JS'
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const root = process.env.SKYTTEL_MOVE_CASE_DIR;
if (!root) throw new Error('Keep the original temporary directory.');
const values = parseEnv(readFileSync(`${root}/source.env`, 'utf8'));
values.SKYTTEL_DATABASE_PATH = `${root}/third.sqlite`;
values.BETTER_AUTH_SECRET = randomBytes(48).toString('base64url');
writeFileSync(`${root}/third.env`, Object.entries(values)
  .map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n',
{ mode: 0o600, flag: 'wx' });
JS
PORT=5173 HOST=0.0.0.0 NODE_ENV=development \
  node --env-file="$SKYTTEL_MOVE_CASE_DIR/third.env" dist/server/index.js
```

Vid senare omstart körs bara de två sista raderna. Den första delen får inte
köras igen. Tidigare privata providerinställningar återanvänds, men ingen
gammal databas, session eller historisk inloggningsbehörighet kopieras.

**Avvisa de gamla försöken:**

Separat tekniskt underlag efter UI-steg 11, före exporten i steg 12:
i profil C:s Console, efter import, ägarbyte och omstart, kör blocket.
Använd de två ursprungliga JSON-filerna från profilerna A och B. Båda
gamla försök ska få HTTP 409 trots aktuell innehållsgeneration; utkast
och historik ska vara oförändrade. Anteckna detta separat från UI-resultatet.
Välj de två lokala JSON-filerna. Koden jämför aktuell karta och historik
före och efter varje försök; inget gammalt lyckat kvitto får returneras.

Kör [den separata förberedelsen 2](household-recovery-console.md#flytt-01-förberedelse-2)
för FLYTT-01 i det angivna läget.

**Separat teknisk kontroll:**

Kör [arkivjämförelsen](household-recovery-console.md#flytt-01-arkivjämförelse)
efter den tredje exporten, innan nytt arbete sparas. Den jämför de tre
privata ZIP-filerna och redovisas separat från de synliga UI-resultaten.
Kör efter UI-steg 12 och före första bytet i steg 13. Kontrollen jämför
exakta bildbytesföljder, objekt inklusive borttagningar, definitioner och
fullständiga kvitton. Den kräver också båda historiska väntande försöken
och Robins undanträngda privata förslag. Inga gamla databaser används.

**Förväntat resultat:**

- ZIP-filen räcker för innehållet på tom lagring. Inga gamla användarkonton,
  sessioner eller assistentmedgivanden får ny behörighet. Normal verifierad
  inloggning och uttrycklig koppling krävs på varje ny installation.
- Objekt, borttaget innehåll, fält, bilder och historiska författare behåller
  sina identiteter. Privata utkast, placeringar och inställningar återkommer
  efter koppling och omstart. Ingen privat vy blandas med den undanträngda.
- Båda gamla försöken avvisas även med den aktuella generationen. Karta och
  historik är oförändrade. Ett nytt granskat sparande fungerar efter flytten.
- Robins undanträngda privata arbete går att koppla tillbaka även efter
  ännu en export och import. Medlemskap ändras inte av innehållskopplingen.

### FLYTT-02: kontrollera ett oklart ägarbyte och bevara båda privata arbetena

**Syfte:** Följ ett uttryckligt ägarbyte efter tappat svar genom aktuell
läsning och bevara två oberoende privata tillstånd utan obehörig insyn.

**Användare:** Alex på källan och Robin som administratör på målet.

**Förutsättningar:** Två separata provinstallationer enligt förberedelsen.
Spara ett gemensamt objekt på källan och anteckna dess kvitto. Lägg ett
nytt privat objekt i utkastet utan att spara och flytta det gemensamma
objektet i din personliga vy. Exportera och återimportera på målet.
Namnen får vara lika; verifiera den nuvarande personens användar-ID.

**Separat förberedelse:** Driftansvarig följer
[FLYTT-02:s operatörssteg](#flytt-02-separata-operatörssteg).
Invänta besked om aktiv återhämtningsblockering före steg 1. Den ska bestå
genom ägarbytet, båda statusläsningarna och källans privata läsning i steg 6.
Den gamla formulärfliken laddas inte om innan den angivna återställningen.

**Integrationstest:**
[household-owners-ui.spec.ts](../../tests/integration/household-owners-ui.spec.ts),
testfallet “FLYTT-02: an uncertain explicit identity assignment is read
back while both private states and historical receipts remain intact”.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/household-owners-ui.spec.ts",
    "caseId": "FLYTT-02"
  },
  "reference": "Chromium, 390×900; två installationer och en gammal kartflik.",
  "outcomes": [
    "Följ ett uttryckligt ägarbyte efter tappat svar genom aktuell läsning och bevara två oberoende privata tillstånd utan obehörig insyn."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. På målet: kontrollera att källans privata utkast inte visas för Robin.
   Skapa ett annat privat objektförslag och en annan personlig placering.
   Anteckna Robins innehålls-ID. Öppna ett nytt oskickat objektformulär
   i en extra kartflik. Be därefter driftansvarig registrera målets
   väntande försök enligt [förberedelsen](household-recovery-console.md#flytt-01-förberedelse-1).
   Invänta **Väntande försök förberett, begäransfilen sparad**.
2. Öppna **Inställningar → Koppla historiskt innehåll** och hämta aktuell
   metadata. Välj källans historiska identitet och Robins verifierade
   användar-ID. Kontrollera antal, tidigare koppling och följderna för
   Robins oberoende privata arbete. Inga privata innehållsvärden ska visas.
   Läs hela den valda historiska identitetens namn och ID samt den avsedda
   medlemmens namn och ID i granskningen utanför vallistorna, även på smal
   skärm. Markera bekräftelsen och välj **Ingen aktuell ägare**; granskningen
   ska visa detta och bekräftelsen nollställas. Markera igen och byt historisk
   identitet; bekräftelsen ska nollställas igen. Välj sedan källans identitet
   och Robin på nytt och kontrollera båda fullständiga ID:na före nästa steg.
3. Be driftansvarig installera [den separata svarsförberedelsen](household-recovery-console.md#flytt-02-förberedelse-1).
   Invänta installationsbesked, markera sedan identitetsbekräftelsen och
   genomför kopplingen med tangentbordet. Invänta därefter bekräftelse att
   servern har sparat kopplingen och att just dess svar har tappats.
4. Kontrollera okänt utfall, spärrad granskning och fokus på
   **Hämta aktuella innehållskopplingar**. Be driftansvarig förbereda det
   tappade lässvaret enligt samma separata förberedelse. Invänta
   installationsbesked före hämtningen. Välj hämtningen och invänta
   bekräftelse att serverns verkliga lässvar har tappats.
   Granskningen ska fortfarande vara spärrad.
5. Hämta igen. Välj källans identitet och kontrollera den aktuella
   kopplingen. Hämtningen ska inte påstå att den bekräftar en tidigare
   begäran och ska inte skicka ett nytt ägarbyte.
6. Kontrollera källans privata utkast och placering i Robins aktuella
   karta. Öppna **Skriv till Skyttel → Utkast → Visa förslaget** för
   källans privata objekt och läs hela beskrivningen. Robins oberoende
   privata namn och uppgifter får inte visas i detta utkast. Stäng
   läsningen utan att spara. Invänta den separat identifierade tekniska
   kontrollen av den gamla begäran. Be driftansvarig släppa blockeringen
   enligt operatörsstegen och återvänd sedan till den extra fliken.
   Dess gamla oskickade formulär ska försvinna och
   historikens kvitto ska vara oförändrat. Avvisning av den gamla
   begäran kontrolleras separat i automationens tekniska underlag.
7. Välj Robins tidigare innehålls-ID och samma medlem. Granska följderna
   och bekräfta uttryckligen igen. Robins oberoende privata utkast och
   placering ska återkomma. Starta om målet med samma databas och kontrollera
   båda dessa uppgifter samt det oförändrade historiska kvittot.
   Öppna **Utkast → Visa förslaget** igen och läs Robins fullständiga
   privata beskrivning. Källans privata namn och uppgifter får inte visas.
   Öppna **Rapporter → Visa ändringarna** för det tidigare sparandet;
   kontrollera den delade lampan, författaren och tidpunkten.

**Förväntat resultat:**

- Samma namn eller e-postadress ger ingen automatisk innehållskoppling.
  Granskningen visar identiteter, medlems-ID och antal utan privata värden.
  Den valda historiska identiteten och den avsedda nya kopplingen går att
  läsa separat från nuvarande och undanträngd koppling. Hela deras ID:n syns
  utanför vallistorna; ett nytt val kräver en ny uttrycklig bekräftelse.
- Okänt utfall och misslyckad hämtning medför ingen blind upprepning.
  Aktuell läsning behövs innan ett nytt uttryckligt val kan göras.
- Båda privata utkasten och placeringarna bevaras separat och kan kopplas
  tillbaka. Historiska författare, tidpunkter och kvitton ändras inte.
- Gamla öppna formulär och sparförsök kan inte ändra den nya generationen.

**Separat tekniskt underlag:** Motsvarigheten återanvänder exakt det
registrerade sparförsöket efter ägarbytet och kontrollerar avvisning samt
oförändrade utkast, placeringar och historik. Denna request-kontroll ingår
inte i människans UI-steg. FLYTT-01 har en separat körbar filkontroll av
gamla försök på den tredje installationen.

#### FLYTT-02: separata operatörssteg

1. Före det väntande försöket i UI-steg 1: aktivera beständig
   begäransblockering för `*/text-assistant/recover` i Robins profil.
   Behåll regeln i alla kartflikar genom ägarbytet, båda statusläsningarna
   och den fullständiga privata läsningen i steg 6. Meddela
   **Återhämtningsblockeringen är aktiv**. Lossa utvecklarverktygen till ett
   separat fönster för att bevara 390×900, men håll dem och regeln aktiva.
2. Vid UI-steg 3 och 4: följ
   [de separata installera-och-invänta-tidpunkterna](household-recovery-console.md#flytt-02-förberedelse-1).
   Installera alltid före respektive klick; invänta alltid servermarkören
   först efter klicket. Utan lyckad servermarkör är felgränsen inte prövad.
3. Efter källans privata läsning i UI-steg 6: avvisningen av exakt det
   gamla registrerade försöket och oförändrade utkast, placeringar och
   historik har sitt tekniska underlag i
   [FLYTT-02:s motsvarighet](../../tests/integration/household-owners-ui.spec.ts).
   Anteckna automationens faktiska resultat separat; en ny eller gissad
   begäran ersätter inte den kontrollen. Om detta underlag saknas redovisas
   gränsen som ej verifierad, även om UI-arbetet kan fortsätta.
4. Efter denna kontroll, före återgången till den gamla formulärfliken i
   steg 6: ta bort regeln i Robins profil och meddela
   **Återhämtningsblockeringen är borttagen**. Ladda inte om den gamla
   fliken i förväg; människan ska först observera att formuläret försvinner.
   Kontrollera därefter båda privata tillstånden och historiken enligt steg 7.

Vid avbrutet prov återställs tillfällig fetch-kod genom omladdning och den
beständiga blockeringen tas bort. Stäng profilerna och städa provfilerna
enligt den lokala förberedelsen; återanvänd inte ett gammalt väntande försök.

## Local recovery preparation

This setup gives a human two disposable compiled installations in the
devcontainer: a source at `http://localhost:5173` and a destination at
`http://localhost:3301`. Each has a separate database and authentication
secret. Use the host browser with separate Chrome profiles; cookies on
`localhost` are shared across ports within one profile.

Use invented household content only. The setup does not change the ordinary
development database. It does not need a public address or tunnel.
`tests/integration/household-recovery.spec.ts` automates this scenario with
isolated installations. The steps here support optional troubleshooting;
automated coverage does not require a manual repeat.

### Prerequisites

- Complete [local authentication](../development/devcontainer.md#set-up-local-sign-in)
  and have a working private development configuration. Its path is
  `SKYTTEL_DEV_ENV_FILE`, or `.devcontainer/.env` by default.
- Keep the source's existing configured first-administrator account.
  Use a different verified login identity for the destination. The example
  selects Microsoft when the source uses Google, and Google otherwise.
  The person must control the selected account and be able to sign in.
- The selected destination provider needs its callback at port 3301.
  Google uses the [existing two-callback setup](../development/devcontainer.md#set-up-local-sign-in).
  Microsoft localhost callbacks follow that guide's port handling. Keep
  the normal source callback at port 5173.
- Install the repository dependencies. Stop normal development servers and
  keep ports 3300, 5173 and 3301 free. Forward 5173 and 3301 to the same host
  ports in VS Code's **Ports** panel, with local/private visibility.

Do not run `db:setup`; each database must begin empty. These preparation
steps configure access only. Follow the relevant manual case for synthetic
household content and application assertions.

### Create private temporary configuration

In terminal A, from the repository root, run:

```sh
umask 077
export SKYTTEL_MOVE_CASE_DIR=$(mktemp -d /tmp/skyttel-move-case.XXXXXX)
node --input-type=module <<'JS'
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const root = process.env.SKYTTEL_MOVE_CASE_DIR;
const file = process.env.SKYTTEL_DEV_ENV_FILE ?? '.devcontainer/.env';
const source = parseEnv(readFileSync(file, 'utf8'));
const keys = [
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET',
  'SKYTTEL_FIRST_ADMIN_PROVIDER', 'SKYTTEL_FIRST_ADMIN_SUBJECT',
];
if (!root || keys.some((key) => !source[key])) {
  throw new Error('Complete the existing private login configuration first.');
}
for (const name of ['source', 'target']) {
  const values = Object.fromEntries(keys.map((key) => [key, source[key]]));
  Object.assign(values, {
    SKYTTEL_ORIGIN: 'http://localhost:5173',
    SKYTTEL_DATABASE_PATH: `${root}/${name}.sqlite`,
    BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
    HOST: '0.0.0.0', PORT: '3300',
  });
  if (name === 'target') {
    values.SKYTTEL_FIRST_ADMIN_PROVIDER =
      source.SKYTTEL_FIRST_ADMIN_PROVIDER === 'google' ? 'microsoft' : 'google';
    values.SKYTTEL_FIRST_ADMIN_SUBJECT = 'not-configured';
  }
  writeFileSync(`${root}/${name}.env`, Object.entries(values)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n',
  { mode: 0o600, flag: 'wx' });
}
console.log('Created source.env and target.env in the temporary directory.');
JS
printf '%s\n' "$SKYTTEL_MOVE_CASE_DIR"
```

Copy only the printed directory path to terminal B, setting the variable to
that exact path there. Do not copy or print either environment file. If you
need another destination provider, edit only `target.env` privately before
starting it. Keep the source and destination secrets and paths distinct.

### Start the source and destination

In each terminal, clear inherited application settings so the corresponding
temporary file supplies them:

```sh
unset SKYTTEL_ORIGIN SKYTTEL_DATABASE_PATH BETTER_AUTH_SECRET
unset SKYTTEL_FIRST_ADMIN_PROVIDER SKYTTEL_FIRST_ADMIN_SUBJECT
unset GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
unset MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET PORT HOST
```

Start the source in terminal A:

```sh
npm run build
PORT=5173 HOST=0.0.0.0 NODE_ENV=development \
  node --env-file="$SKYTTEL_MOVE_CASE_DIR/source.env" dist/server/index.js
```

The compiled server exposes browser, OAuth discovery and MCP endpoints on
the same origin. The ordinary Vite development proxy does not expose MCP.
For a source restart, repeat only the last two command lines with the same
file; rebuilding is unnecessary unless application code changed.

In Chrome profile A, open `http://localhost:5173` and sign in as the source's
configured administrator. Keep terminal A open. Start the destination in
terminal B:

```sh
SKYTTEL_DEV_ENV_FILE="$SKYTTEL_MOVE_CASE_DIR/target.env" \
  node scripts/develop-prodlike.mjs
```

The destination launcher builds the application and sets its public origin
and listening port to 3301. In a different Chrome profile B, open
`http://localhost:3301` and sign in with the selected destination provider.
Access is initially denied because its first administrator is not configured.
That denial is expected; do not change the source configuration.

### Verify the destination administrator

In profile B, open `http://localhost:3301/api/bootstrap` and privately copy
the authenticated `user.id`. In terminal B, press Ctrl+C and wait for the
destination to stop. Then run the following, entering that ID at the prompt:

```sh
printf 'Destination Skyttel user ID: '
read -r SKYTTEL_MOVE_TARGET_USER
export SKYTTEL_MOVE_TARGET_USER
node --input-type=module <<'JS'
import Database from 'better-sqlite3';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const file = `${process.env.SKYTTEL_MOVE_CASE_DIR}/target.env`;
const settings = parseEnv(readFileSync(file, 'utf8'));
const db = new Database(settings.SKYTTEL_DATABASE_PATH, {
  readonly: true, fileMustExist: true,
});
try {
  if (db.prepare('SELECT 1 FROM installation WHERE id = 1').get()) {
    throw new Error('Destination household exists. Stop administrator setup.');
  }
  const accounts = db.prepare(
    'SELECT accountId FROM account WHERE userId = ? AND providerId = ?',
  ).all(process.env.SKYTTEL_MOVE_TARGET_USER,
    settings.SKYTTEL_FIRST_ADMIN_PROVIDER);
  if (accounts.length !== 1) {
    throw new Error('Expected the selected verified destination account.');
  }
  settings.SKYTTEL_FIRST_ADMIN_SUBJECT = accounts[0].accountId;
  writeFileSync(file, Object.entries(settings)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n',
  { mode: 0o600 });
  console.log('Destination administrator configured; no identity printed.');
} finally {
  db.close();
}
JS
unset SKYTTEL_MOVE_TARGET_USER
```

This reads only the target database's actual authenticated account; it does
not insert a login or household membership. Restart with the same terminal-B
command. Profile B can now create the empty destination household. Keep it
empty until the case instructs you to import. A historical owner's name or
ID from the source is not a substitute for this destination sign-in.

### Restart, stop and clean up

For a persistence check, press Ctrl+C in the relevant terminal, wait for
shutdown, and repeat only that terminal's start command. Keep the same
temporary directory, configuration and database. Do not recreate files or
run `db:setup`. Reload the corresponding browser profile after startup.

For the final move, stop source editing before export and stop terminal A
after its download, as described in the
[move runbook](../operations/recovery.md#pause-changes-and-take-the-final-export).
The destination uses only that downloaded archive. Do not copy a source
SQLite file or read it to complete destination recovery.

When the whole case is complete, stop both servers, close both test browser
profiles, clear copied IDs, and delete downloaded synthetic archives and
images. In terminal A, remove only this temporary directory:

```sh
rm -r -- "${SKYTTEL_MOVE_CASE_DIR:?}"
unset SKYTTEL_MOVE_CASE_DIR
```

Unset the same directory variable in terminal B. Resume ordinary development
with its original private environment file and `npm run dev:all`. Provider
registrations remain available for later local work; the disposable database
sessions and temporary copies of credentials are removed with the directory.
