# Manuella testfall för Skyttels textassistent

Fallen provar samlat utkast, rättelse och sparande, sena svar, avbrott,
kvittoåterhämtning, begärda samtalsdetaljer och faktisk markering.
Anteckna commit, webbläsare,
modell eller kontrollerad ersättare samt godkänt eller underkänt resultat.
De länkade integrationstesterna verifierar de kontrollerade flödena.
Stegen här är stöd för felsökning; #97 kräver ingen manuell upprepning.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Textprov.
- I den kontrollerade miljön väljs Google för lokal testinloggning utan
  externa konton. I verkligt modellprov använder Alex sin konfigurerade
  inloggning men enbart påhittat hushållsinnehåll.

## Allmän förberedelse

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan. Detaljpanelen visar uppgifterna. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. I hel kartvy heter knappen **Redigera val**. Att bara välja
objektet eller sambandet öppnar inte formuläret.

1. TEXT-01 använder den
   [verkliga modellens isolerade setup](../development/devcontainer.md#optional-assistant-access).
   Övriga fall använder den
   [kontrollerade startguiden](#controlled-text-fixture).
   Den senare håller varje modellsvar tills du släpper det i terminalen.
   Den provar inte en verklig modells svenska språkförståelse.
2. Skapa hushållet Textprov. Skapa objektet **Lo Exempel** av typen
   **Person**, med beskrivningen **Påhittad uppgift**, genom formuläret.
   Välj **Lägg i mitt utkast** och lämna förslaget osparat.
3. Starta textassistenten med båda uttryckliga valen. Kontrollera först
   att enbart AI-valet inte räcker för att aktivera startknappen.
4. Starta en ny tom kontrollerad installation mellan TEXT-02 till TEXT-09.
   Behåll samma databas under ett omstartsprov. Avsluta med `quit` och
   stäng provfönstret enligt startguidens städningssteg.

## Samtal och samlat sparande

### TEXT-01: familjeärendet sparas samlat med bevarad oskickad formulärtext

**Syfte:** Fortsätta ett befintligt utkast och spara en tydlig rättelse
utan extra ja, med ett riktigt kvitto.

**Användare:** Alex med verklig Terra low. CI använder en deterministisk
leverantörsersättare för samma applikationsflöde.

**Förutsättningar:** Isolerad installation med serverns privata OpenAI-nyckel.
Lo-förslaget finns redan. API-anrop i detta mänskliga prov kan kosta pengar.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-01: familjeärendet sparas samlat med bevarad oskickad
formulärtext”.

**Steg:**

1. Beskriv familjens påhittade Molnmusik: tjänstekonto, separat kontakt-
   och inloggningsadress, Alex som avtalspart, Kim som betalare och ett
   kort som betalningsmedel. Lo använder tjänsten. Ange 149 kr per månad.
2. Svara på frågor om identiteter. Ange uttryckligen att ett omnämnt
   bankkonto är ospecificerat; låt en uppgift vara okänd och en annan
   osäkert uppgiven. Be om en begriplig sammanställning av hela utkastet.
3. Kontrollera att tidigare Lo-förslaget ingår och att kontot inte har
   blivit en e-postadress. Be om en rättelse av inloggningsadressen.
4. Öppna ett objekt i formuläret och skriv **Osänd text som ska finnas
   kvar** i beskrivningen utan att lägga texten i utkastet.
5. Skriv **Rätta priset till 189 kr och spara** i assistenten. Öppna kvittot.
6. Återläs abonnemang, betalare, betalningsmedel, konto och adresser.
   Kontrollera också okända och osäkra uppgifter samt den osända texten.

**Förväntat resultat:**

- Hela det beständiga utkastet sparas samlat. Ett extra ja krävs inte
  enbart därför att rättelsen ändrar version. Osäker identitet eller
  samtidig konflikt måste däremot redas ut före ett nytt sparbesked.
- Statusen bekräftar ett beständigt kvitto. Pris är 189 kr och de olika
  rollerna samt uppgifternas kunskapsstatus bevaras utan antagna fakta.
- Oskickad formulärtext finns kvar och har inte blivit del av sparandet.
- Dokumentera verklig modellförståelse separat från CI:s deterministiska
  verifiering. Ingen sådan mänsklig körning påstås här vara genomförd.

## Kontrollerade sena svar och fel

### TEXT-02: sena svar efter kastat utkast och avbrott ändrar inte nytt arbete

**Syfte:** Ett äldre uppdrag får inte återinföra ett kastat förslag.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns. Terminalen håller modellsvar.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-02: sena svar efter kastat utkast och avbrott ändrar inte
nytt arbete”.

**Steg:**

1. Skriv **Rätta namnet**. Behåll numret från terminalens `held`-händelse.
   Kopiera `draft.version`, `contentVersion`, Lo-förslagets `id` och hela
   dess `after`-objekt. Byt bara `name` till **För sent** i kopian.
2. Välj **Kasta hela utkastet** i kartan medan svaret fortfarande hålls.
3. Släpp det gamla numret med `tool NUMMER propose_object JSON`.
   `JSON` ska innehålla de ursprungliga `version`, `contentVersion`,
   `id`, `baseRevision: null` och det kopierade objektet under `value`.
   Använd inte den nya versionen efter kastandet.
4. Skicka **Skapa ett nytt förslag**. När nästa svar hålls, välj
   **Avbryt uppdrag**. Släpp även det svaret som ett `propose_object`
   med den version som hörde till just det uppdraget och ett nytt ID.
5. Kontrollera utkast och sparad karta. Fortsätt med ett vanligt formulär.

**Förväntat resultat:**

- Pågående status syns medan svaret hålls. Den gamla versionen avvisas
  efter kastandet, och aktuellt underlag visas för nästa besked.
- Det avbrutna uppdraget lägger inte tillbaka något. Nya formulär fungerar.
- Ett avbrott påstås aldrig ångra ett redan genomfört sparande.

### TEXT-03: nekade sparbesked och modellfel lämnar formulärarbetet tillgängligt

**Syfte:** Det verkliga meddelandet styr tillåtelsen att spara och ett
leverantörsfel förstör inte utkastet.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns osparat.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-03: nekade sparbesked och modellfel lämnar formulärarbetet
tillgängligt”.

**Steg:**

1. Skicka **Spara inte**. Släpp det hållna svaret med
   `tool NUMMER save_draft JSON`, där `JSON` innehåller terminalens aktuella
   `version`, `contentVersion` och `operationId: "nekad-1"`.
2. Upprepa med **Vad händer om vi sparar?**, **Spara ej**, **Spara senare**
   och **Skriv ”spara” i beskrivningen**. Använd ett nytt prov-ID varje gång.
3. Skicka **Beskriv mitt utkast** och skriv `fail NUMMER` för det svaret.
4. Öppna Lo i formuläret, rätta namnet till **Lo Lind** och lägg det i
   utkastet. Kontrollera att tidigare förslag finns kvar.

**Förväntat resultat:**

- Ingen av de nekade, hypotetiska, uppskjutna eller citerade begärandena
  sparar kartan, även när ersättaren försöker anropa sparverktyget.
- Modellfelet visas begripligt. Utkastet och vanligt formulärarbete finns
  kvar. Provet är ett kontrollerat verktygsprov, inte bevis på språkförståelse.

## Kvitton och faktisk visning

### TEXT-04: ett tappat sparbesked återfinns efter omstart utan dubbelt sparande

**Syfte:** Återfinna ett genomfört sparande när webbläsaren saknar svaret.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns. Chrome utvecklarverktyg är öppna.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-04: ett tappat sparbesked återfinns efter omstart utan
dubbelt sparande”.

**Steg:**

1. Skicka **Spara hela utkastet nu** och vänta på terminalens `held`.
2. I Chrome Network, välj **Offline**. Detta bryter webbläsarens hämtning
   av uppdragsstatus; serverns leverantörsersättare fortsätter i terminalen.
3. Släpp det hållna svaret med `tool NUMMER save_draft JSON`. Ange den
   ursprungliga utkastversionen, `contentVersion` och ett prov-ID.
4. Välj **No throttling** igen och stäng eller ladda inte om sidan än.
   Läs sparförsöken genom följande skrivskyddade konsolkommando. Ersätt
   `HUSHÅLL` med hushållets ID från den hållna begärans objekttyp:

   ```javascript
   const kontroll = await fetch('/api/households/HUSHÅLL/map/operations');
   console.log((await kontroll.json()).operations.map(
     ({ operationId, status }) => ({ operationId, status })
   ));
   ```

5. Vänta tills försöket visar `succeeded`. Om det ännu inte är klart,
   upprepa bara den skrivskyddade kontrollen; gör inget nytt sparförsök.
   Skriv sedan `restart` i launcher-terminalen.
6. Ladda om sidan, godkänn en ny textanslutning och öppna **Tidigare
   sparförsök**. Kontrollera kvittot, Lo och det nu tomma utkastet.

**Förväntat resultat:**

- Frånkopplingen visas som saknat svar. Det betyder inte att sparandet
  misslyckades. Omstart bevarar det genomförda försöket och dess enda kvitto.
- En ny normal MCP-anslutning återfinner kvittot. Ingen extra kopia eller
  nytt sparande behövs. Webbläsarens offlineprov bryter statushämtningen;
  CI avbryter dessutom det accepterade meddelandesvaret efter verklig commit.

### TEXT-05: markering kräver visning och skyddar oskickad text

**Syfte:** Markeringsbesked ska motsvara ett faktiskt visat urval.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns och inget formulär har osänd text.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-05: markering kräver visning och skyddar oskickad text”.

**Steg:**

1. Skriv **Markera Lo i kartan**. Kopiera Lo-förslagets ID från `held`.
   Svara med `tool NUMMER show_map_object {"objectId":"LO-ID"}`, där
   `LO-ID` ersätts med det verkliga prov-ID:t.
2. Kontrollera att Lo blir valt och synligt i kartan och att detaljpanelen
   visar **Lo Exempel** samt **Påhittad uppgift**.
   Nästa `held` ska innehålla `displayed: true`. Svara
   `reply NUMMER Markerat!` och kontrollera markeringsstatusen.
3. Öppna Lo och skriv **Osänd uppgift** i beskrivningen. Skicka
   **Markera Lo igen** och upprepa visningsanropet.
4. Kontrollera `displayed: false`, släpp sluttexten **Markerat!** igen
   och kontrollera både statusen och den oskickade texten.

**Förväntat resultat:**

- Första markeringsstatusen kommer efter faktisk webbläsarvisning.
- Det andra försöket ger ingen ny bekräftad markering. Oskickad text
  finns kvar. **Markerat!** visas som obekräftad samtalstext, skild från
  Skyttels status. Modellens text ensam ändrar inte den betrodda statusen.

### TEXT-06: obekräftad samtalstext skiljs från sparande och markering

**Syfte:** Skilja modellens fria svar från bekräftade resultat, även när
svaret påstår att något har utförts med andra ord.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns i utkastet. Anteckna aktuellt urval
i kartan innan du börjar. Inget sparande är genomfört.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
“TEXT-06: obekräftad samtalstext skiljs från sparande och markering”.

**Steg:**

1. Skicka **Kontrollera utkastet.** till textassistenten. Vänta på `held`
   i terminalen och ersätt `NUMMER` med anropets ID:

   ```text
   reply NUMMER Klart. Ändringarna är nu lagrade i hushållets karta.
   ```

2. Kräv rubriken **Assistentens samtalstext – inte en bekräftelse** vid
   texten och förklaringen att bara Skyttels status och kvitton bekräftar
   sparande och markering. Kontrollera det osparade Lo-förslaget och att
   inget nytt spar- eller markeringsbesked visas i statusen.
3. Skicka samma fråga på nytt för varje svar nedan. Använd det nya
   `held`-numret och släpp ett svar i taget:

   ```text
   reply NUMMER Saved successfully.
   reply NUMMER Lo är nu vald och visas i kartan.
   reply NUMMER Har du sparat tidigare, och vem betalar?
   ```

4. Kontrollera att varje svar visas i samma tydligt märkta samtalsdel.
   Frågan ska gå att läsa som en vanlig följdfråga. Kontrollera utkastet,
   kartans urval och **Tidigare sparförsök** igen.
5. Skicka **Spara hela utkastet nu**. Läs `version` och `contentVersion`
   från det nya `held.draft`. Släpp anropet med följande kommando, efter
   att du ersatt `NUMMER`, `VERSION` och `CONTENT` med aktuella värden:

   ```text
   tool NUMMER save_draft {"version":VERSION,"contentVersion":CONTENT,"operationId":"text-proof-save"}
   ```

6. Kräv den verkliga statusen **Sparat. Hela utkastet finns i hushållets
   karta.** Öppna **Visa kvittot** och kontrollera Lo i den sparade kartan
   samt ett tomt utkast.

**Förväntat resultat:**

- Andra språk och omskrivningar blir inte bevis på sparande eller markering.
  Samtalstexten behålls men dess obekräftade källa framgår.
- Efter de fyra fria svaren är Lo fortfarande osparad, kartans urval är
  oförändrat och inget kvitto finns för dessa svar. Det sista riktiga
  sparanropet ger däremot kvitto, sparad Lo och bekräftad status.
- Användbara frågor försvinner inte genom en lista med förbjudna ord.

### TEXT-07: hela ändringslistan visar samband, typer och verkliga före- och eftervärden

**Syfte:** Förstå hela utkastets ändringar utan att behöva öppna detaljer.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Ny isolerad installation enligt startguiden. Detta
fall använder egna förberedelser i stället för det vanliga Lo-förslaget.
Inga modellsvar behövs; assistenten läser det befintliga utkastet.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
“TEXT-07: hela ändringslistan visar samband, typer och verkliga före- och eftervärden”.

**Steg:**

1. Skapa objekttypen **Provkort** med textfältet **Sista fyra**, enligt
   [typfallen](object-types.md). Skapa **Kortet** av denna typ med värdet
   **1111** i fältet och personen **Kim**. Spara hela utkastet.
2. Rätta Kortets **Sista fyra** till **2222** och lägg ändringen i utkastet.
3. Lägg till ett samband från **Kim** med typen **Betalar** till **Kortet**.
   Skapa också den oanvända objekttypen **Förvaring** och sambandstypen
   **Förvaras**, med riktningarna **förvaras i** och **innehåller**.
   Lämna alla fyra förslagen osparade.
4. Godkänn assistentens två val och starta textassistenten. Läs
   **Ändringar under samtalet** utan att öppna detaljerna.
5. Kräv **Sista fyra: 1111 → 2222**, sambandet från Kim som betalar
   Kortet samt de båda nya typerna i den synliga listan.
6. Öppna detaljer vid behov. Kontrollera att den sparade kartan fortfarande
   har värdet 1111 och att de fyra förslagen ligger kvar i utkastet.

**Förväntat resultat:**

- Objekt, samband, objekttyper och sambandstyper ingår i samma synliga
  sammanfattning. Ett föreslaget samband döljs inte i en detaljsektion.
- Rättelsen använder verkligt tidigare och föreslaget värde. Den får
  aldrig beskrivas som 2222 → 2222.
- Att läsa sammanfattningen sparar ingenting. Fullständiga detaljer finns
  kvar för fortsatt granskning.

### TEXT-08: markering öppnar och centrerar objekt och samband före bekräftelsen

**Syfte:** Assistentens markeringsbesked ska följa synlig karta och rätt
uppgifter i detaljpanelen, även när kartan är stängd eller bortpanorerad
och när skärmen är smal.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns. Lägg även **Molnmusik**, typ
**Tjänst**, och ett samband **Lo Exempel → Använder → Molnmusik** i
utkastet genom formulären. Stäng formulären utan oskickad text.

**Integrationstest:**
[assistant-map.spec.ts](../../tests/integration/assistant-map.spec.ts),
testfallet “TEXT-08: markering öppnar och centrerar objekt och samband
före bekräftelsen”, både dator- och telefonvarianten.

**Steg:**

1. Välj **Lista och detaljer**. Skriv **Visa Lo i kartan** i assistenten.
   Kopiera Lo-förslagets ID från terminalens `held`. Svara med
   `tool NUMMER show_map_item {"kind":"object","id":"LO-ID"}`;
   byt `NUMMER` och `LO-ID` mot provets verkliga värden.
2. Kontrollera att kartan öppnas och att Lo syns markerad i den.
   Detaljpanelen ska samtidigt synas med Lo och beskrivningen
   **Påhittad uppgift**, utan att du behöver rulla sidan för att hitta den.
   Nästa `held` ska innehålla `displayed: true`. Släpp det svaret med
   `reply NUMMER Här är urvalet.` och kontrollera **Markerat i kartan**.
3. Öppna **Navigera rymden** och panorera tills objekten inte syns.
   Skriv **Visa sambandet mellan Lo och Molnmusik**. Kopiera sambandets
   ID från `held` och svara med
   `tool NUMMER show_map_item {"kind":"relationship","id":"SAMBANDS-ID"}`.
4. Kontrollera att båda objekten och det valda sambandet syns igen.
   Detaljpanelen ska samtidigt visa **Lo Exempel → Använder → Molnmusik**.
   Kontrollera `displayed: true` och släpp sluttexten.
5. Välj **Redigera valt samband**. Ändra **Till objekt** i formuläret
   utan att lägga ändringen i utkastet.
   Skriv **Visa Lo igen** och upprepa visningsanropet från steg 1.
   Kontrollera `displayed: false`, släpp sluttexten och kontrollera att
   formulärets oskickade ändring finns kvar.
6. Stäng formuläret och upprepa steg 1–5 med ett smalt telefonfönster.
   Detaljpanelen ska synas direkt under kartan. Om uppgifterna är längre
   kan du rulla inuti panelen. Markeringen öppnar inget redigeringsformulär.

**Förväntat resultat:**

- Markeringsbekräftelsen kommer först efter att det efterfrågade objektet
  eller sambandet visas i kartan och dess uppgifter samtidigt syns i
  detaljpanelen, även på telefon.
- Kamera och vy anpassas till urvalet utan att personliga placeringar
  eller hushållets innehåll ändras.
- Oskickad formulärtext förhindrar ett nytt urval. Ingen ny bekräftad
  markering påstås, och formulärets uppgifter finns kvar.

### TEXT-09: samtalet beskriver verkliga ändringar i utkast och kvitto

**Syfte:** Granska verkliga före- och eftervärden i samtalet och få samma
detaljer från kvittot efter ett kort sparbesked.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns. Terminalen håller modellsvar.
Alla uppgifter är påhittade.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-09: samtalet beskriver verkliga ändringar i utkast och kvitto”.

**Steg:**

1. Skapa **Tonrum**, typ **Tjänst**, genom formuläret. Välj **Gäller
   fortfarande** under **Objektets status**. Lägg objektet och sambandet
   **Lo Exempel → Använder → Tonrum** i utkastet. Spara hela utkastet.
2. Redigera sambandet och byt typen till **Betalar**. Lägg rättelsen i
   utkastet. Redigera sedan Tonrum, välj statusen **Upphört** och lägg
   även den rättelsen i utkastet. Lämna båda osparade.
3. Välj **Lista och detaljer** och skicka **Läs upp hela utkastet.** i
   assistenten. Ersätt `NUMMER` med det aktuella `held`-numret i terminalen:

   ```text
   tool NUMMER report_result {"source":"draft"}
   ```

4. Under **Besked från Skyttel**, kräv **Utkast:**, **Gäller: aktuellt →
   upphört** för Tonrum och **Lo Exempel Använder Tonrum → Lo Exempel
   Betalar Tonrum**. Kontrollera att båda rättelserna fortfarande ligger
   i utkastet och att **Lista och detaljer** förblir valt.
5. Skicka **Spara hela utkastet nu.** Läs `version` och `contentVersion`
   från det nya `held.draft`. Ersätt `NUMMER`, `VERSION` och `CONTENT`:

   ```text
   tool NUMMER save_draft {"version":VERSION,"contentVersion":CONTENT,"operationId":"text-details-save"}
   ```

6. Kräv det korta beskedet **Sparat. Hela utkastet finns i hushållets
   karta.** och ett tomt utkast. Öppna **Visa kvittot** och kontrollera
   att **Tonrum** och sambandstypen **Betalar** finns med.
7. Skicka **Vad sparades senast?** Använd det nya `held`-numret:

   ```text
   tool NUMMER report_result {"source":"latest_save"}
   ```

8. Kräv **Sparandet:** och samma tidigare och nya status respektive
   sambandstyp under **Besked från Skyttel**. Kontrollera att utkastet
   förblir tomt och att inget nytt sparförsök tillkommer under **Tidigare
   sparförsök**. **Lista och detaljer** ska fortfarande vara valt.

**Förväntat resultat:**

- Både det osparade utkastet och det senaste kvittot beskriver den
  verkliga ändringen från aktuellt till upphört och från Använder till
  Betalar. Förevärdet får inte beskrivas med den nya sambandstypen.
- Begärda detaljer visas som besked från Skyttel. Granskningen kräver
  ingen kartmarkering och ändrar eller sparar inga uppgifter.
- Själva sparandet bekräftas kort. Detaljer ges när de efterfrågas och
  bygger då på det beständiga kvittot.

## Controlled text fixture

Use this launcher for reproducible provider failures and delayed replies.
It runs the actual application, browser authentication, OAuth/MCP and SQLite
against a fresh temporary database. Only the external identity and model
providers are substitutes. It makes no real Google, Microsoft or OpenAI
requests and needs no provider credentials. It never opens your normal
development database or private environment file.

These controls verify application behavior, not a real model's understanding
of Swedish. Keep real-model results separate. Integration tests cover these
controlled scenarios; manual repetition is optional troubleshooting and is
not required by #97.

### Start and sign in

From the repository root, with dependencies installed, run:

```sh
npm run build
node --import tsx scripts/manual-text-assistant.ts
```

Keep this terminal open. The `ready` event prints an `origin` such as
`http://127.0.0.1:43127`. In VS Code's **Ports** panel, forward that printed
port to the same host port, keeping it private. Open the exact printed
origin in a new private browser window. Use `127.0.0.1`, not `localhost`:
authentication and same-origin checks use the printed address.

Choose Google sign-in. The substitute provider signs in **Alex Exempel**
without an external account or password. Complete the normal first-household
form with the name **Textprov**. Create only made-up content. Start
**Skyttels textassistent** with both explicit choices for external AI and
map work. The substitute uses that same application consent flow.

Enter the scenario's message and press **Skicka**. Each provider request
stops at the external boundary and prints a `held` event in the terminal.
Its increasing `id` identifies that exact request. The event includes the
synthetic message, draft versions, latest tool result, and available tool
names. The browser must continue showing ongoing work until you release a
response or cancel the task.

### Terminal commands

Enter commands in the launcher terminal, one line at a time. These are
launcher commands, not shell commands. Tool arguments must be one JSON
object using the tool's documented schema. The actual MCP entrance still
validates scope, permissions, versions and domain rules.

<!-- markdownlint-disable MD013 -->
| Command | Effect |
| --- | --- |
| `pending` | Display every held provider request and its original context. |
| `tool REQUEST TOOL JSON` | Return one model tool call for that held request. The application processes it through its actual MCP client. |
| `reply REQUEST TEXT` | Return a final plain-text model reply for that held request. |
| `fail REQUEST` | Fail that held provider request at the external boundary. |
| `restart` | Reject outstanding provider responses, restart the application with the same temporary database and origin, and release old assistant sessions. |
| `quit` | Stop the installation and delete its temporary database. |
<!-- markdownlint-enable MD013 -->

Replace `REQUEST` with the numeric `id` from the relevant `held` event.
For example, when request `1` is held, enter:

```text
tool 1 read_type_catalog {}
```

This releases request `1`. The application runs `read_type_catalog` through
MCP and asks the substitute model what to do next. A new `held` event, `2`,
contains the actual catalog under `lastToolResult`. To finish this simple
read without making a proposal, enter:

```text
reply 2 Typkatalogen är läst. Inget förslag har ändrats.
```

For a proposal, use the exact tool name and JSON arguments specified by the
manual case. Copy type/object IDs from the tool result and use the draft
`version` and `contentVersion` shown when the request was held. The launcher
does not repair, refresh or replace those arguments. A released tool call
does not itself prove that a proposal or save succeeded: inspect the next
`lastToolResult`, browser draft and any durable receipt.

### Delay, failure and restart

For a delayed response, leave the request held while performing the manual
case's browser edit, discard, cancellation or new instruction. Release the
original request by its original ID with its original arguments. Releasing
an old request must not replace newer work. Cancellation may cause the SDK
to ignore the released provider response entirely; confirm the actual
browser and saved/private map state, not just the terminal's `released`
event. `pending` can still show that intentionally retained old response.

For a provider failure, enter `fail` followed by the current held ID. Check
the browser error and preserved draft. Continue ordinary manual map editing
to confirm that it remains available. A new assistant message produces a
new held request that can be answered normally. No real network outage or
API charge is involved.

For restart recovery, enter `restart` and wait for `restarted`. Reload the
browser and start a new assistant session using its normal consent choices.
The database and browser login remain, while old conversation memory and
assistant grants are closed. The application reads durable proposals and
operation results through a new ordinary MCP connection. `restart` does
not simulate a missing post-commit response: use the manual case's stated
response-loss control when that fault is required.

### Cleanup

Enter `quit`, or press Ctrl+C. Wait for `closed`, which confirms deletion
of this launcher's temporary database. Close the private browser window
and remove its port-forward entry. Each new launcher process starts empty.
If the process is forcibly killed, stop any remaining process before
deleting only the temporary `directory` printed by its `ready` event.

Do not reuse this fixture for real household data. Terminal output includes
synthetic task context intentionally; do not publish terminal recordings.
No production endpoint, provider-address override or authentication bypass
is added by this development launcher.
