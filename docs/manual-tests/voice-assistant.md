# Manuella testfall för Skyttels röst

Fallen provar samma privata utkast, MCP-regler och kvitton som textassistenten.
Anteckna commit, webbläsare, operativsystem, mikrofon, modell eller kontrollerad
ersättare samt resultat. De kontrollerade flödena verifieras automatiskt.
I [#97](https://github.com/viscalyx/skyttel/issues/97) återstår mänsklig
bedömning av faktiskt hört ljud och användning med egen utrustning.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Talprov, eller
  TestHousehold när det färdiga familjeunderlaget används.
- Kontrollerad inloggning använder Google utan ett verkligt externt konto.
- Verkliga modellprov använder konfigurerad inloggning och enbart påhittade data.

## Allmän förberedelse

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan. Detaljpanelen visar uppgifterna. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. I hel kartvy heter knappen **Redigera val**. Att bara välja
objektet eller sambandet öppnar inte formuläret.

1. Välj den kontrollerade vägen eller det verkliga talprovet i TAL-01.
   TAL-02 och TAL-03 använder den
   [kontrollerade startguiden](#controlled-voice-fixture).
   Den senare håller varje Terra-anrop och använder tysta mediespår; den
   lyssnar inte på din mikrofon och provar inte svensk talförståelse.
2. För TAL-02 och TAL-03: skapa Talprov och lägg **Lo Exempel**, typ
   **Person**, med beskrivningen **Påhittad uppgift** i ditt utkast.
   Spara inte. TAL-01 har egna förberedelser nedan.
3. För TAL-02 och TAL-03: godkänn båda valen i textassistenten, välj
   **Starta textassistenten** och sedan **Starta röst**.
   Kontrollerade kommandon nedan skrivs i startguidens
   terminal. Ersätt `REQUEST`, `VERSION`, `CONTENT` och objekt-ID med värden
   från första `held`-meddelandets `draft`. Efter ett verktyg som ändrar
   utkastet hämtas den nya versionen från nästa `held.lastToolResult.version`.
   Läs hela verktygsresultatet; ett avvisat verktyg ger ingen ny godkänd version.
4. Starta en ny tom installation mellan fallen. Behåll samma databas under
   omstartsprovet. Stäng med `quit` och kontrollera städningen enligt guiden.

## Samtal och samlat sparande

### TAL-01: familjeärendet sparas med röst och bevarad oskickad formulärtext

**Syfte:** Utföra ett svenskt familjeärende utan tangentbord efter röststart,
inklusive rättelse och samlat sparande med verifierat kvitto.

**Användare:** Alex med kontrollerade leverantörer eller verklig Live,
marin och Terra low. Redovisa de två vägarna var för sig.

**Förutsättningar:** Den kontrollerade vägen kräver bara startguiden.
Det verkliga talprovet kräver isolerad installation, privat servernyckel
och fungerande mikrofon. Verkliga leverantörsanrop kan kosta pengar.
CI ersätter leverantörerna och mediegränsen; det bevisar inte språkförståelse
eller ljud.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
“TAL-01: familjeärendet sparas med röst och bevarad oskickad formulärtext”.
Det separata leverantörsprovet
[swedish-speech.spec.ts](../../tests/real-voice/swedish-speech.spec.ts),
“TAL-01: recorded Swedish speech changes the family map through real Live
and Terra”, provar inspelat svenskt tal genom verkliga leverantörer enligt
[körguiden](real-voice-tests.md).

**Steg, kontrollerat familjeunderlag:**

1. Starta en ny kontrollerad installation. Kör `seed-family` i terminalen
   före första inloggningen och vänta på `seeded`. Logga in som Alex.
   Hushållet TestHousehold finns redan; skapa inget nytt.
2. Välj **Kim Exempel** i listan. Skriv **Osänd text som ska finnas kvar**
   i beskrivningen utan att lägga texten i utkastet. Starta assistenten och
   rösten. Kontrollera Lo-förslaget, adressändringen och namnkonflikten
   i assistentens hela utkast.
3. Skriv `user Behåll Lo-förslaget, rätta priset till 189 kr och spara.`
   och sedan `delegate`. Från `held.draft` kopieras `version`,
   `contentVersion` och hela första objektet i `conflicts`. Ersätt markörerna
   nedan; `CONFLICT` ska vara det kopierade JSON-objektet, utan extra citattecken:

   ```text
   tool REQUEST resolve_conflict {"version":VERSION,"contentVersion":CONTENT,"conflict":CONFLICT,"choice":"proposed"}
   ```

4. Nästa `held.lastToolResult.version` är den nya utkastversionen. Anteckna
   den och skicka följande med det nya anropets ID:

   ```text
   tool REQUEST read_map {"query":"Familjens Molnmusik"}
   ```

5. Från nästa `held.lastToolResult.objects` kopieras abonnemangets `id`,
   `revision` och övriga värden. Bygg argumentet till `propose_object` med
   antecknad utkastversion, samma `contentVersion`, kopierat `id` och
   `baseRevision` lika med objektets `revision`. `value` ska innehålla hela
   det kopierade objektet utom `id`, `householdId` och `revision`. Ändra
   `description` till **Familjeabonnemang 189 kr per månad.** och ersätt
   `financialFacts` med följande JSON:

   ```json
   {
     "price": { "knowledge": "known", "value": "189" },
     "currency": { "knowledge": "known", "value": "SEK" },
     "paymentInterval": { "knowledge": "known", "value": "månad" }
   }
   ```

   Skriv `tool REQUEST propose_object` följt av hela argumentet som JSON
   på samma terminalrad. De tidigare delarna i utkastet ska finnas kvar.
6. Läs den nya `lastToolResult.version`. Släpp det nya hållna anropet med:

   ```text
   tool REQUEST save_draft {"version":VERSION,"contentVersion":CONTENT,"operationId":"family-manual-save"}
   ```

7. Kräv **Sparat. Hela utkastet finns i hushållets karta.** och öppna
   **Visa kvittot**. Återläs priset 189, Lo Lind, inloggningsadressen och
   befintliga betalningsroller. Utkastet ska vara tomt, osänd formulärtext
   bevarad och tidigare okända/osäkra uppgifter oförändrade.
8. Stäng rösten och kontrollera avslutade spår enligt startguiden.
   Avsluta med `quit` och kontrollera att den tillfälliga katalogen försvinner.

**Steg, verkligt svenskt tal:**

1. Följ [röstguidens verkliga setup](../development/devcontainer.md#optional-assistant-access)
   i en ny isolerad installation med påhittade data. Skapa Talprov och lägg
   Lo Exempel, typ Person, med beskrivningen Påhittad uppgift i utkastet.
   Välj Lo och skriv **Osänd text som ska finnas kvar** i beskrivningen
   utan att lägga texten i utkastet. Godkänn assistentens båda val.
   Kontrollera att mikrofonen inte används före **Starta röst**. Starta
   rösten och tillåt mikrofonen. Om ljud blockeras, välj **Spela upp ljud**.
2. Beskriv familjens Molnmusik med rösten: separat tjänstekonto, kontaktadress
   och inloggningsadress, Alex som avtalspart, Kim som betalare och ett kort
   som betalningsmedel. Lo använder tjänsten. Ange 149 kr per månad.
3. Svara muntligt på frågor, även med korta svar och rättelser. Ange ett
   bankkonto uttryckligen som ospecificerat. Lämna en uppgift okänd och en
   annan osäkert uppgiven. Be om en sammanställning av hela utkastet.
4. Kontrollera att det tidigare Lo-förslaget ingår. Konto och e-postadress
   ska förbli olika objekt. Säg en rättelse av inloggningsadressen.
5. Säg **Rätta priset till 189 kr och spara**. Inget tangentbord behövs
   för kartarbetet efter röststart.
6. Öppna kvittot och återläs roller, pris, kunskapsstatus och osänd text.
   Stäng rösten. Fortsätt med ett normalt formulär.
7. Anteckna den faktiskt provade enheten, mikrofonen och ljudutgången.
   Ytterligare Windows-, iPhone- och iPad-prov hör till den uppskjutna
   enhetsmatrisen i #97. De är inga nya villkor för detta falls eller
   specifikationens avslut. När sådana prov väljs, redovisa varje
   kombination separat, inklusive mikrofonavslag och ljuduppspelning.

**Förväntat resultat:**

- Rösten ställer följdfrågor när identiteten är oklar och bevarar rättelser.
  Ett fragment eller en paus blir inte ett nytt sparbesked.
- Ett tydligt aktuellt besked sparar hela utkastet, även den egna rättelsen,
  utan ett extra obligatoriskt ja. Konflikter behöver däremot redas ut.
- Sparstatus bygger på ett riktigt kvitto. Osänd text blir inte sparad.
  Konto, adresser och roller behåller sin betydelse och kunskapsstatus.
- Mikrofon och ljudresurser avslutas. Inget verkligt plattformsresultat
  tillskrivs CI eller de tysta kontrollerade ersättarna.

## Avbrott och återhämtning

### TAL-02: negativa besked och förlorad anslutning stoppar sena röständringar

**Syfte:** Stoppa otillåtna sparanden och sena förslag när anslutningen bryts.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns och rösten är igång.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
“TAL-02: negativa besked och förlorad anslutning stoppar sena röständringar”.

**Steg:**

1. Skriv `user Spara inte.` och sedan `delegate`. Släpp det hållna anropet
   med följande rad, efter att du ersatt markörerna med aktuella tal:

   ```text
   tool REQUEST save_draft {"version":VERSION,"contentVersion":CONTENT,"operationId":"tal-prov"}
   ```

2. Kräv **Inget sparades**. Upprepa med `user Spara senare.`,
   `user Om jag säger spara.` och `user Säg ”spara”.`, alltid följt av
   `delegate` och en ny verktygsrad med det nya anropets ID och versioner.
3. Skriv `user Rätta namnet.` och `delegate`. Låt anropet vara hållet.
   Kopiera Lo-förslagets fullständiga `after`-värde och versioner från `held`.
4. Kör `window.skyttelVoiceFixture.disconnect()` i webbläsarkonsolen.
   Kräv avstängd mikrofon direkt och avslutad röst efter tre sekunder.
5. Släpp det gamla anropet med `tool REQUEST propose_object` följt av JSON
   med ursprunglig `version`, `contentVersion`, Lo-förslagets `id`,
   `baseRevision:null` och `value` lika med kopierat `after`, men ändrat
   `name` till **För sent**. Ta bort eventuella servermetadata som `id`,
   `householdId` och `revision` ur `value`.
6. Kontrollera Lo i utkastet och att vanlig formulärredigering fungerar.
   Kontrollera avslutade spår med `window.skyttelVoiceFixture.stats()`.
7. Prova även guidens exakta kontroller för nekad mikrofon och blockerad
   ljuduppspelning; återställ dem och kontrollera ett nytt uttryckligt startval.

**Förväntat resultat:**

- Inga negativa, uppskjutna, hypotetiska eller citerade besked sparar.
- Det sena förslaget ändrar ingenting. Lo heter fortfarande Lo Exempel.
- Alla mediespår avslutas och text/formulär är fortsatt användbara.
  Inget avbrutet ljudsvar påstås ha ångrat ett redan genomfört sparande.

### TAL-03: synlig markering och exakt sparåterhämtning fungerar efter röstomstart

**Syfte:** Bekräfta verklig markering och återhämta samma beständiga sparförsök.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns och rösten är igång.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
“TAL-03: synlig markering och exakt sparåterhämtning fungerar efter röstomstart”.

Det kontrollerade fallet förbereder ett väntande försök och bryter senare
anslutningen efter bekräftat sparande. Det döljer inget kvittosvar efter
databasens sparande; redovisa inte det som ett prov av förlorat sådant svar.

**Steg:**

1. Skriv `user Markera Lo Exempel.` och `delegate`. Hämta Lo-förslagets ID
   från `held`. Släpp med `tool REQUEST show_map_object {"objectId":"LO-ID"}`.
   Nästa `held` ska visa `displayed:true`. Avsluta med
   `reply REQUEST Objektet visas.`. Kräv synlig markering i kartan.
2. Skriv `user Spara.` och `delegate`. Släpp det hållna anropet med
   `tool REQUEST prepare_save {"version":VERSION,"contentVersion":CONTENT,"operationId":"tal-prov"}`.
   Avsluta nästa anrop med `reply REQUEST Försöket är förberett.`.
3. Kräv väntande sparförsök och ingen sparbekräftelse. Anteckna det riktiga
   operation-ID:t från **Tidigare sparförsök**; modellens `tal-prov` är inte
   kvittots ID. Stäng rösten och kör `restart` i terminalen.
4. Ladda om webbläsaren, godkänn en ny assistentanslutning och starta rösten.
   Skriv `user Slutför samma sparförsök.` och `delegate`. Inget Terra-svar
   behöver släppas: det exakta väntande försöket återhämtas via MCP.
5. Kontrollera ett genomfört kvitto med samma operation-ID och Lo i kartan.
   Kör `drop` efter sparandet; kontrollera att det genomförda kvittot finns
   kvar även om ett ljudsvar inte hördes. Vänta på avstängd röst, ladda om
   och godkänn en ny textassistentanslutning. Öppna **Tidigare sparförsök**
   och kontrollera samma genomförda kvitto igen.
6. Starta rösten igen. Kör `usage 12`, `usage 15` och `finalize off`.
   Stäng rösten. Kontrollera nätverkssvarets `voice.seconds:15` och
   `voice.usageFinal:false`. Återställ `finalize on` innan nästa prov.

**Förväntat resultat:**

- Markering bekräftas först efter den verkliga webbläsarens återkoppling.
  Ett accepterat kommentarspaket är inte bevis för hörbart tal.
- Omstart glömmer samtalet men bevarar utkast och sparförsök. Samma försök
  slutförs exakt en gång; korta ja eller nya allmänna uppdrag ersätter det inte.
- Avbrutet ljud återtar inget genomfört sparande. Saknad slutlig mätning
  förblir osäker: 12 följt av 15 är 15 kända sekunder, inte 27 eller säkert noll.

### TAL-04: samtalstext hålls isär från verifierade röstresultat

**Syfte:** Hålla modellens samtalstext skild från bekräftade resultat även
när den gemensamma assistenten används genom rösten.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Starta en ny installation enligt
[röstförberedelsen](#controlled-voice-fixture). Skapa Talprov
med Lo Exempel som osparat Person-förslag. Starta textassistenten och rösten.
Vänta på **Lyssnar**. Anteckna kartans aktuella urval. Tysta mediespår
och terminalens kommentarspaket är inte bevis för hört tal.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
“TAL-04: samtalstext hålls isär från verifierade röstresultat”.

**Steg:**

1. Kontrollera röstens synliga förklaring: AI-rösten kan innehålla fel;
   Skyttels status och kvitton bekräftar vad som har sparats eller markerats.
2. Kör `user Kontrollera utkastet.` och `delegate` i terminalen. Vänta på
   `held` och ersätt `REQUEST` med anropets ID:

   ```text
   reply REQUEST Klart. Ändringarna är nu lagrade i hushållets karta.
   ```

3. Kontrollera webbläsarens **Assistentens samtalstext – inte en
   bekräftelse**, kvarvarande Lo-förslag och status utan bekräftat sparande
   eller ny markering.
4. Kör `sessions`. Läs det senaste paketet med typen
   `session.commentary.append`. Beskedet **Utkast: 1 osparat förslag**
   ska beskriva det faktiska utkastet utan att bekräfta något sparande
   eller någon markering. Modellens svar ska stå separat, citerat under
   **Samtal (obekräftat)**.
5. Upprepa `user Kontrollera utkastet.` och `delegate` för varje rad
   nedan. Använd det nya hållna anropets ID och släpp ett svar i taget:

   ```text
   reply REQUEST Saved successfully.
   reply REQUEST Lo är nu vald och visas i kartan.
   reply REQUEST Har du sparat tidigare, och vem betalar?
   ```

6. Kontrollera oförändrat utkast och urval samt avsaknad av nytt kvitto.
   Frågan ska finnas i samtalsdelen och som obekräftad text i det senaste
   kommentarspaketet.
7. Kör `user Markera Lo Exempel.` och `delegate`. Kopiera Lo-förslagets
   ID från `held.draft` och använd följande kommando:

   ```text
   tool REQUEST show_map_object {"objectId":"LO-ID"}
   ```

8. Nästa `held.lastToolResult` ska visa `displayed:true`. Släpp med
   `reply REQUEST Vem betalar?`. Kräv verkligt markerad Lo, bekräftad
   markeringsstatus och kvarvarande fråga som obekräftad samtalstext.
   Kontrollera samma uppdelning i det senaste kommentarspaketet.
9. Kör `user Spara hela utkastet nu.` och `delegate`. Läs `version` och
   `contentVersion` från det nya `held.draft`. Ersätt markörerna och kör:

   ```text
   tool REQUEST save_draft {"version":VERSION,"contentVersion":CONTENT,"operationId":"voice-proof-save"}
   ```

10. Kräv statusen **Sparat. Hela utkastet finns i hushållets karta.**
    Öppna kvittot och återläs Lo. Kontrollera att det senaste
    kommentarspaketets sparbesked är verifierat. Stäng rösten, välj
    `quit` och kontrollera städningen enligt guiden.

**Förväntat resultat:**

- Kommentarspaketet skiljer verifierbar status från modellens fria ord.
  Ett lyckat mottaget paket innebär inte att tal hördes eller var korrekt.
- De fyra fria svaren ändrar inte kartan eller bekräftad status.
  Samtalsfrågor finns kvar och kan besvaras, även efter verklig markering.
- De sista verktygsanropen ger faktisk markeringsbekräftelse respektive
  sparat innehåll och kvitto. De fria orden ersätter aldrig dessa bevis.

### TAL-05: dialog, mikrofonpaus och arbetstid finns kvar under samtalet

**Syfte:** Följa båda talarna, pausa mikrofonen utan att tappa samtalet och
se väntetiden under kartarbete.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Följ förberedelsen för TAL-02 med Lo Exempel i
utkastet. Rösten är igång. Detta prov använder syntetiska textfragment och
tysta mediespår; verkligt tal redovisas separat i TAL-01.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
“TAL-05: dialog, mikrofonpaus och arbetstid finns kvar under samtalet”.

**Steg:**

1. Kör följande i webbläsarkonsolen. Tiderna beskriver korta respektive
   längre pauser i det syntetiska ljudet:

   ```javascript
   for (const [role, delta, start_ms, end_ms] of [
     ['input', 'Kim betalar', 0, 1000],
     ['output', 'Jag lyssnar.', 1100, 1300],
     ['input', ' för musiken.', 1500, 1900],
     ['output', ' Berätta mer.', 2000, 2600],
     ['input', 'Rätta till Lo.', 5000, 6000],
   ]) {
     window.skyttelVoiceFixture.emit({
       type: `session.${role}_transcript.delta`,
       event_id: crypto.randomUUID(), delta, start_ms, end_ms,
     });
   }
   ```

2. Läs samtalet. **Du** har en sammanhållen rad med **Kim betalar för
   musiken.**, **Skyttel** har **Jag lyssnar. Berätta mer.** och den senare
   rättelsen **Rätta till Lo.** ligger på en ny rad.
3. Välj **Pausa mikrofon**. Kräv **Mikrofonen är pausad** och kör:

   ```javascript
   window.skyttelVoiceFixture.disconnect();
   window.skyttelVoiceFixture.reconnect();
   window.skyttelVoiceFixture.stats();
   ```

4. Mikrofonspåret ska fortfarande ha `enabled: false` och `state: 'live'`.
   Välj **Återuppta mikrofon** och kontrollera `enabled: true`, samma
   antal anslutningar och kvarvarande dialog.
5. Kör `user Kontrollera utkastet.` och `delegate` i terminalen. Låt
   modellanropet vara hållet och kontrollera att arbetsindikeringen syns
   längst ned med ökande tid. Släpp sedan det hållna anropet med
   `reply REQUEST Vem använder musiken?`, där `REQUEST` är dess ID.
6. Kräv frågan i dialogen och avslutad arbetsindikering. Stäng rösten:
   tidigare dialog finns kvar. Välj **Avsluta textassistenten**:
   dialogen försvinner medan Lo-förslaget finns kvar i utkastet.

**Förväntat resultat:**

- Fragment visas löpande med talarroll och sammanhängande korta pauser.
  Tidigare rader ersätts inte av det senaste svaret.
- Paus behåller samtal och ljuduppspelning. En återhämtad anslutning
  startar inte en mikrofon som användaren har pausat.
- Arbetsstatus och tid skiljer väntan från ett färdigt svar. Klockan
  ger inga upprepade statusuppläsningar för skärmläsaren.
- Dialogen är tillfällig och är inte ett sparkvitto. Avslut tar bort
  samtalet men bevarar utkastet.

## Controlled voice fixture

Use this disposable fixture to check Skyttel's voice controls, delegation,
delayed backend work and recovery. The browser runs the actual application
and Live SDK; authentication, OAuth/MCP and SQLite are real. External identity,
Live and Terra responses are controlled substitutes. Browser microphone and
WebRTC resources are also substitutes, with silent synthetic media tracks.

**This fixture does not listen to your microphone or speak.** It does not test
speech recognition, Swedish pronunciation, actual browser permission prompts,
device audio or real-provider availability. The application's listening label
describes the simulated connection. Keep actual speech/device results separate.
Integration tests cover these controls; #97 does not require a manual
repeat. Use the [real speech check](real-voice-tests.md) for automated
provider evidence. Human listening and equipment assessment remain separate.

### Start the isolated application

From the repository root in the devcontainer, run:

```sh
npm ci
npm run build
node --import tsx scripts/manual-voice.ts
```

The launcher accepts no origin, database or credentials. It uses a fresh private
temporary directory, ignores the normal private environment file, and makes no
real Google, Microsoft or OpenAI requests. Keep its terminal open.

Wait for `ready`, which prints `origin` and `directory`. Forward that random
port privately in VS Code's **Ports** panel, using the same host port.

For the prepared family case, enter `seed-family` in the launcher's terminal
**before opening the browser or signing in**. Wait for `seeded`. The household
is **TestHousehold**,
with Molnmusik, people, accounts, addresses, payment roles, a private draft
and a concurrent Lo-name conflict. This is the same synthetic setup as the
browser test. The command refuses any database with an existing user; it
never resets your current work. Use a new launcher for a different case.

Open the exact printed `http://127.0.0.1:PORT` origin in a new private browser
window. Sign in with Google as the controlled **Alex Exempel**. The prepared
family case opens its existing household. Otherwise, create **Talprov** through
the normal form. Use only invented information.

Open **Skyttels textassistent**, approve its separate AI and map-work choices,
and select **Starta textassistenten**. Then choose **Starta röst** under
**Tala med Skyttel**. In fullscreen map mode, open **Visa detaljer och utkast**
to reach these controls. The fixture needs no hardware microphone permission.
Keep the tab open and active: its normal status requests maintain the server's
voice connection. Closing the tab is a connection-loss check, not a pause.

### Transcript fragments and delegation

Commands below go into the launcher's terminal, not a shell. Start exactly one
voice session at a time. To simulate a request, enter these separate lines:

```text
user Läs vilka typer hushållet har.
delegate
```

`user` sends one input-transcript fragment. It does not claim that a pause or
fragment is a complete instruction. `delegate` sends a separate metadata-only
delegation event with a new ID. The application builds the current task from
the fragments and prior bounded context, then calls the shared text backend.

A `held` event identifies each stopped Terra request with a numeric `id` and
shows its synthetic context, draft versions, latest tool result and tool names.
If request `1` is held, enter:

```text
tool 1 read_type_catalog {}
```

The actual MCP client reads the catalog. The next `held` event has a new ID;
its `lastToolResult` contains the actual types. If that ID is `2`, finish with:

```text
reply 2 Typkatalogen är läst. Inget har sparats.
sessions
```

`sessions` shows active provider IDs and the commentary events sent by Skyttel.
Completion must refer to the originating delegation ID. Commentary submission
is not proof of audible speech; this fixture has no speech output. For proposals
and saves, check the browser's whole draft, actual MCP results and durable
receipts. Follow the manual case's exact tool arguments, using IDs and versions
from the held request. The launcher does not repair stale arguments.

### Terminal controls

<!-- markdownlint-disable MD013 -->
| Command | Effect |
| --- | --- |
| `seed-family` | Prepare the synthetic family map and conflict before the first sign-in; refuses a nonempty installation. |
| `user TEXT` | Add a synthetic user transcript fragment; a new fragment can interrupt older backend work. |
| `assistant TEXT` | Add prior synthetic assistant speech as context; it grants no save authority. |
| `delegate` | Send a new metadata-only delegation for the accumulated user fragments. |
| `pending` | Inspect held Terra requests and their original synthetic context. |
| `tool REQUEST TOOL JSON` | Release one model tool call through the actual MCP entry point. |
| `reply REQUEST TEXT` | Release a final model reply; it cannot manufacture a durable receipt. |
| `fail REQUEST` | Fail that held Terra request at the external provider boundary. |
| `usage SECONDS` | Send cumulative Live usage, not an increment. |
| `final SECONDS` | Send a matching final Live closure event with total seconds. |
| `finalize off` | Withhold the final provider event when Skyttel requests closure. |
| `finalize on` | Restore final closure events for subsequent stops. |
| `drop` | Drop the controlled server-side provider connection. |
| `sessions` | Inspect current provider IDs and submitted commentary/close events. |
| `restart` | Reject held responses and restart with the same temporary database and origin. |
| `quit` | Stop the application and remove the temporary database. |
<!-- markdownlint-enable MD013 -->

For a delayed response, leave a request held while the case changes or discards
the draft, cancels work, stops voice or supplies a correction. Release the old
request afterward with its original ID and arguments. The SDK may ignore an
aborted request entirely. The browser and persisted draft/receipt determine the
result; a terminal `released` event alone proves no application change.

To check incomplete final usage, send `usage 12`, then `usage 15`, then
`finalize off`. Stop voice in the browser. The last known total is 15, not 27,
and the final provider value is unknown. In the browser Network panel, the
voice `stop` response exposes `voice.seconds: 15` and `voice.usageFinal: false`.
Restore `finalize on` before the next session. These synthetic values do not
prove provider billing or any actual charge.

For restart recovery, enter `restart` and wait for `restarted`. Reload the page,
approve a fresh assistant connection and inspect the persistent draft and
previous save attempts. Conversation and voice resources do not survive;
committed map changes and durable receipts do. The controlled recovery case
prepares a pending attempt and separately interrupts an already confirmed save.
It does not hide a post-commit reply; record that distinction in its result.

### Browser transport and audio controls

Open this fixture's browser developer console. These controls exist only in
the disposable fixture and change the external browser media substitute. They
do not change production settings or the application's access rules.

Before choosing **Starta röst**, simulate denied microphone access:

```js
window.skyttelVoiceFixture.setMicrophone('deny');
```

After checking the visible error and working forms, set it back to `allow`
and start again. Use `error` instead of `deny` for a missing-device failure.
To simulate blocked audio playback, set this before starting voice:

```js
window.skyttelVoiceFixture.setPlayback('blocked');
```

Require the visible playback message and **Spela upp ljud** button. Set playback
to `allow`, then press that button; the simulated playback warning should clear.
No sound is produced. During an active session, the following console command
simulates a broken native connection:

```js
window.skyttelVoiceFixture.disconnect();
```

Use `reconnect()` within three seconds for a transient interruption. Leave it
disconnected for the application's timeout, or use `fail()` for immediate
failure. `audioError()` emits a media-output error. After stopping, inspect:

```js
window.skyttelVoiceFixture.stats();
```

Require `openPeers: 0`, `audioElements: 0`, and `state: 'ended'` for every
microphone and remote track. A disconnected connection must disable its
microphone track while waiting. These are actual silent browser media tracks,
not evidence that a physical microphone or speaker works. Reloading resets all
substitute controls; a new voice session follows normal application rules.

### Cleanup

Stop voice, then type `quit` in the launcher terminal, or press Ctrl+C. Wait for
`closed`, which prints the removed directory. From another terminal, set the
variable to the exact directory printed by this launcher's `ready` event:

```sh
SKYTTEL_VOICE_CASE_DIR='/tmp/skyttel-test-REPLACE-WITH-PRINTED-DIRECTORY'
test ! -e "${SKYTTEL_VOICE_CASE_DIR:?}" && printf '%s\n' 'Fixture removed'
unset SKYTTEL_VOICE_CASE_DIR
```

Close the private browser window and remove its port forward. If the process is
forcibly killed, stop any remaining process before removing only its printed
temporary directory. Each new launcher starts empty. Do not publish terminal
recordings: the intentionally visible fixture context is synthetic household
content. Never use this launcher with real household information.
