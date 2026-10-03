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

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan och öppna dess detaljpanel. För objekt i listan använder
du **Uppgifter**; i kartverktygen väljer du **Visa detaljer**. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. Att bara välja objektet eller sambandet öppnar inte formuläret.

1. Välj den kontrollerade vägen eller det verkliga talprovet i TAL-01.
   TAL-02 och TAL-03 använder den
   [kontrollerade startguiden](#controlled-voice-fixture).
   Den senare håller varje Terra-anrop och använder tysta mediespår; den
   lyssnar inte på din mikrofon och provar inte svensk talförståelse.
2. För TAL-02 och TAL-03: skapa Talprov och lägg **Lo Exempel**, typ
   **Person**, med beskrivningen **Påhittad uppgift** i ditt utkast.
   Spara inte. TAL-01 har egna förberedelser nedan.
3. För TAL-02 och TAL-03: välj **Skriv till Skyttel**, välj
   **Godkänn och starta** i medgivanderutan och sedan **Prata med Skyttel**
   i **Kartans verktyg**. Knappen är intryckt, och röstrutan visar
   **Lyssnar**.
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
   Välj **Nytt samtal** i textvyn. Ingen medgivanderuta visas. Öppna
   **Tidigare sparförsök**. Familjens kvitto och sparade karta ska
   finnas kvar utan ett nytt modelluppdrag.
   Avsluta med `quit` och kontrollera att den tillfälliga katalogen försvinner.

**Steg, verkligt svenskt tal:**

1. Följ [röstguidens verkliga setup](../development/devcontainer.md#optional-assistant-access)
   i en ny isolerad installation med påhittade data. Skapa Talprov och lägg
   Lo Exempel, typ Person, med beskrivningen Påhittad uppgift i utkastet.
   Välj Lo och skriv **Osänd text som ska finnas kvar** i beskrivningen
   utan att lägga texten i utkastet. Godkänn assistentens båda val.
   Kontrollera att mikrofonen inte används före **Prata med Skyttel**.
   Välj knappen och tillåt mikrofonen. Om ljud blockeras, välj
   **Starta ljudet**.
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
   Stäng av mikrofonen. Fortsätt med ett normalt formulär.
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
   Kräv att **Prata med Skyttel** inte längre är intryckt och att
   mikrofonspåret är avstängt direkt. Efter tre sekunder är rösten avslutad
   och felet **Rösten avbröts** visas.
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
Använd en telefonbred vy, 390 × 844 CSS-pixlar i det automatiska provet.
Markeringen och detaljpanelens sammanfattning ska vara synliga samtidigt
med kartans återkoppling; den får inte täcka detaljpanelens kontroller.
Prova även navigationen vid 640 × 500 och 320 × 250 CSS-pixlar.

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
   Öppna **Navigera**, panorera och välj **Stäng navigering** även i de
   korta vyerna. Stängknappen ska gå att klicka på och lämna fokus på
   **Navigera**. Lo ska fortfarande vara vald, synlig och åtkomlig i kartan.
2. Öppna webbläsarens utvecklarverktyg, **Network request blocking**.
   Lägg till mönstret `*text-assistant/*/recover` och aktivera blockeringen.
   Skriv `user Spara.` och `delegate`. Släpp det hållna anropet med
   `tool REQUEST prepare_save {"version":VERSION,"contentVersion":CONTENT,"operationId":"tal-prov"}`.
   Avsluta nästa anrop med `reply REQUEST Försöket är förberett.`.
3. Kräv väntande sparförsök och samtalsnotisen **Skyttel kunde inte
   kontrollera om utkastet sparades.**. Anteckna det riktiga operation-ID:t
   från **Utkast och historik → Tidigare sparförsök**. Modellens `tal-prov`
   är inte kvittots ID. Mikrofonen är av under den blockerade kontrollen.
   Kör `restart` i terminalen.
4. Ta bort nätblockeringen och ladda om webbläsaren. Skyttel kontrollerar
   och slutför själv det registrerade försöket, innan något nytt samtal
   startas eller något medgivande ges. Välj sedan **Skriv till Skyttel**
   och godkänn medgivandet om det behövs. Kräv förklaringen **Kontrollen
   visar att hela utkastet sparades. Ändringarna finns i hushållets karta.**
   i samtalstexten. Slå på mikrofonen för resten av fallet.
5. Kontrollera ett genomfört kvitto med samma operation-ID och Lo i kartan.
   Kör `drop` efter sparandet; kontrollera att det genomförda kvittot finns
   kvar även om ett ljudsvar inte hördes. Vänta på avstängd röst, ladda om
   och välj **Skriv till Skyttel**. Godkänn medgivanderutan om den visas.
   Öppna **Utkast och historik → Tidigare sparförsök**
   och kontrollera samma genomförda kvitto igen.
6. Slå på mikrofonen igen. Kör `usage 12`, `usage 15` och `finalize off`.
   Anteckna adressen och svarets `voice.id` för det senaste POST-anropet
   till `/voice` i nätverkspanelen. Öppna textvyn och välj **Nytt samtal**.
   Den gamla röstanslutningen stängs, och en ny behåller mikrofonens läge.
   Kopiera det gamla startanropet som `fetch` från nätverkspanelen. Ändra
   adressen till `GAMLA-ADRESSEN/GAMLA-ID/stop` och kroppen till `"{}"`;
   behåll anropets rubriker. Kör det i konsolen och läs JSON-svaret.
   Det bekräftar den redan stängda anslutningen och ska visa
   `voice.phase:"closed"`, `voice.seconds:15` och `voice.usageFinal:false`.
   Återställ `finalize on`. Öppna **Din profil → Inloggningssätt**,
   öppna **Välj inställning** om menyn är hopfälld och välj **Logga ut**.
   Alla mikrofonspår och röstanslutningar ska vara stängda.

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
med Lo Exempel som osparat Person-förslag. Starta samtalet och slå på
mikrofonen med **Prata med Skyttel**. Vänta på **Lyssnar** i röstrutan.
Anteckna kartans aktuella urval. Tysta mediespår och terminalens
kommentarspaket är inte bevis för hört tal.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
“TAL-04: samtalstext hålls isär från verifierade röstresultat”.

**Steg:**

1. Kör `user Kontrollera utkastet.` och `delegate` i terminalen. Vänta på
   `held` och ersätt `REQUEST` med anropets ID:

   ```text
   reply REQUEST Klart. Ändringarna är nu lagrade i hushållets karta.
   ```

2. Kontrollera svaret i samtalstexten, kvarvarande Lo-förslag och status
   utan bekräftat sparande eller ny markering.
3. Kör `sessions`. Läs det senaste paketet med typen
   `session.commentary.append`. Beskedet **Utkast: 1 osparat förslag**
   ska beskriva det faktiska utkastet utan att bekräfta något sparande
   eller någon markering. Modellens svar ska stå separat, citerat under
   **Samtal (obekräftat)**.
4. Upprepa `user Kontrollera utkastet.` och `delegate` för varje rad
   nedan. Använd det nya hållna anropets ID och släpp ett svar i taget:

   ```text
   reply REQUEST Saved successfully.
   reply REQUEST Lo är nu vald och visas i kartan.
   reply REQUEST Har du sparat tidigare, och vem betalar?
   ```

5. Kontrollera oförändrat utkast och urval samt avsaknad av nytt kvitto.
   Frågan ska finnas i samtalsdelen och som obekräftad text i det senaste
   kommentarspaketet.
6. Kör `user Markera Lo Exempel.` och `delegate`. Kopiera Lo-förslagets
   ID från `held.draft` och använd följande kommando:

   ```text
   tool REQUEST show_map_object {"objectId":"LO-ID"}
   ```

7. Nästa `held.lastToolResult` ska visa `displayed:true`. Släpp med
   `reply REQUEST Vem betalar?`. Kräv verkligt markerad Lo, bekräftad
   markeringsstatus och kvarvarande fråga som obekräftad samtalstext.
   Kontrollera samma uppdelning i det senaste kommentarspaketet.
8. Kör `user Spara hela utkastet nu.` och `delegate`. Läs `version` och
   `contentVersion` från det nya `held.draft`. Ersätt markörerna och kör:

   ```text
   tool REQUEST save_draft {"version":VERSION,"contentVersion":CONTENT,"operationId":"voice-proof-save"}
   ```

9. Öppna textvyn och kräv **Sparat.** i samtalstexten.
   Öppna kvittot och återläs Lo. Kontrollera att det senaste
   kommentarspaketets sparbesked är verifierat. Stäng av mikrofonen, välj
   `quit` och kontrollera städningen enligt guiden.

**Förväntat resultat:**

- Kommentarspaketet skiljer verifierbar status från modellens fria ord.
  Ett lyckat mottaget paket innebär inte att tal hördes eller var korrekt.
- De fyra fria svaren ändrar inte kartan eller bekräftad status.
  Samtalsfrågor finns kvar och kan besvaras, även efter verklig markering.
- De sista verktygsanropen ger faktisk markeringsbekräftelse respektive
  sparat innehåll och kvitto. De fria orden ersätter aldrig dessa bevis.

### TAL-05: dialog, avstängd mikrofon och arbetsraden finns kvar under samtalet

**Syfte:** Följa båda talarna, stänga av mikrofonen utan att tappa samtalet och
se att Skyttel arbetar med ett talat uppdrag.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Följ förberedelsen för TAL-02 med Lo Exempel i
utkastet. Rösten är igång. Detta prov använder syntetiska textfragment och
tysta mediespår; verkligt tal redovisas separat i TAL-01.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
“TAL-05: dialog, avstängd mikrofon och arbetsraden finns kvar under samtalet”.

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

2. Läs samtalstexten. Din sammanhållna rad **Kim betalar för musiken.**
   står i en tonad ruta, Skyttels rad **Jag lyssnar. Berätta mer.** står
   utan ruta och den senare rättelsen **Rätta till Lo.** ligger på en ny
   rad. Talade rader är inte märkta.
3. Välj **Prata med Skyttel**. Kontrollera att knappen inte är intryckt och kör:

   ```javascript
   window.skyttelVoiceFixture.disconnect();
   window.skyttelVoiceFixture.reconnect();
   window.skyttelVoiceFixture.stats();
   ```

4. Mikrofonspåret ska fortfarande ha `enabled: false` och `state: 'live'`.
   Välj **Prata med Skyttel** igen och kontrollera `enabled: true`, samma
   antal anslutningar och kvarvarande dialog.
5. Kör `user Kontrollera utkastet.` och `delegate` i terminalen. Låt
   modellanropet vara hållet och kontrollera att raden **Skyttel arbetar…**
   står sist i samtalstexten, utan tidräknare. Släpp sedan det hållna
   anropet med
   `reply REQUEST Vem använder musiken?`, där `REQUEST` är dess ID.
6. Kräv frågan i dialogen och avslutad arbetsindikering. Stäng rösten:
   tidigare dialog finns kvar. Välj **Nytt samtal**: samtalstexten töms
   och Skyttel säger hur många osparade ändringar som finns, medan
   Lo-förslaget finns kvar i utkastet.

**Förväntat resultat:**

- Fragment visas löpande med talarroll och sammanhängande korta pauser.
  Tidigare rader ersätts inte av det senaste svaret.
- Paus behåller samtal och ljuduppspelning. En återhämtad anslutning
  startar inte en mikrofon som användaren har pausat.
- Raden **Skyttel arbetar…** skiljer väntan från ett färdigt svar. Ingen
  tidräknare visas.
- Samtalstexten är tillfällig och är inte ett sparkvitto. **Nytt samtal**
  tömmer den men bevarar utkastet.

### TAL-06: avbryt uppdrag från kartan och behåll samtalet och tidigare förslag

**Syfte:** Nå avbrott utan öppen dialog och bevara redan utfört arbete.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Följ TAL-02:s förberedelse. Lo-förslaget och rösten
finns kvar. Anteckna utkastets innehåll och version.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
“TAL-06: avbryt uppdrag från kartan och behåll samtalet och tidigare förslag”.

**Steg:**

1. Skriv **Osänd rättelse** i samtalets textfält utan att skicka.
   Kör `user Rätta Lo.` och `delegate` i startguiden. Håll modellanropet.
2. Stäng textvyn och arbetsytan med **Till kartan**. Kräv **Skyttel
   arbetar** i röstrutan och välj dess **Avbryt**.
3. Släpp det gamla anropet med ett `propose_object` som försöker byta
   Lo-förslagets namn till **För sent**. Använd det hållna anropets version,
   innehållsversion och hela tidigare objektvärde enligt TAL-01:s verktygssteg.
4. Öppna textvyn med **Skriv till Skyttel**. Kräv **Avbrutet. Föreslagna
   ändringar ligger kvar i utkastet.** och oförändrat utkast.
   Stäng av mikrofonen med **Prata med Skyttel**.
   **Osänd rättelse** ska finnas kvar.
5. Välj **Nytt samtal**. Samtalstexten töms, **Osänd rättelse** och
   Lo-förslaget finns kvar.

**Förväntat resultat:**

- Avbrott stoppar det gamla uppdragets sena ändringar, utan att radera förslag.
- Röst av, uppdragsavbrott och nytt samtal är separata handlingar.
- Röstresurser avslutas vid avstängning; oskickad text behålls också efter
  **Nytt samtal**.

### TAL-07: uppmätt ljudaktivitet skiljs från avstängd mikrofon och består i Inställningar

**Syfte:** Skilja ljudaktivitet från mikrofonens läge och bevara
anslutningen medan Skyttel talar klart och användaren navigerar.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Följ TAL-02:s förberedelse. Använd enbart de
genererade webbläsarsignalerna nedan. De provar ljudmätningen, inte
svensk talförståelse, högtalare eller fysisk mikrofon.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
“TAL-07: uppmätt ljudaktivitet skiljs från avstängd mikrofon och består i
Inställningar”.

**Steg:**

1. Kräv sju stilla punkter i röstrutan. Kör i webbläsarkonsolen:

   ```javascript
   window.skyttelVoiceFixture.setSound('microphone', true);
   ```

2. Kräv **Du talar** och rörlig vågform. Stäng signalen med samma anrop
   och `false`; röstrutan visar **Lyssnar**. Starta sedan
   `setSound('remote', true)`; kräv **Skyttel talar**.
3. Aktivera webbläsarens minskade rörelse. Vågformen ska finnas kvar men
   stå stilla, samtidigt som **Skyttel talar** visas.
4. Stäng av mikrofonen med **Prata med Skyttel**. Knappen visar samma
   mikrofonsymbol men är inte längre intryckt, och röstrutan visar fortsatt
   **Skyttel talar**. `stats()` ska visa en öppen anslutning, ett
   ljudobjekt, levande avstängt mikrofonspår och levande påslaget
   inkommande spår.
5. Skriv **Kvar i samtalet** utan att skicka. Öppna Inställningar och
   invänta sidrubrikens fokus. Kräv **Skyttel talar** i röstrutan längst
   ned. Välj **Tillbaka till kartan** och öppna textvyn med
   **Skriv till Skyttel** om den är stängd. Kräv kvarvarande text och fokus
   i meddelandefältet.
6. Stoppa den inkommande signalen. Röstrutan försvinner. Vänta mer än
   tre sekunder: anslutningen och det avstängda mikrofonspåret finns kvar.

**Förväntat resultat:**

- Vågformen följer uppmätt ljud i den befintliga anslutningen; tystnad
  eller transkript startar ingen animation. Minskad rörelse behåller status.
- Avstängd mikrofon stoppar eget ljud utan att stoppa inkommande ljud
  eller skapa en ny leverantörsanslutning. Tangentbordsfokus följer
  återgången.
- Prova även ljust och mörkt tema, smal skärm och faktisk webbläsarzoom
  200 och 400 procent. Kortets kontroller nås med tangentbord och rullning
  i kortet eller arbetsytan utan horisontell sidrullning. Prova även
  kartmarkering och navigering med stängd dialog. Anteckna faktiskt
  provade storlekar.

### TAL-08: nödvändiga frågor finns i samtalet och fel visas i en samtalsnotis

**Syfte:** Visa ett aktuellt svarskrav utan att tolka all frågande modelltext
som ett hinder eller låta gamla frågor följa ett nytt uppdrag.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Följ TAL-02:s förberedelse med Lo-förslaget.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
“TAL-08: nödvändiga frågor finns i samtalet och fel visas i en samtalsnotis”.

**Steg:**

1. Stäng av mikrofonen, öppna textvyn och skicka **Lägg till uppgiften.**
   Släpp anropet med `submit_changes`,
   `completion: "draft"`, `questions: ["Vem använder tjänsten?"]` och
   en `propose_object`-operation som behåller Lo men ändrar beskrivningen
   till **Förslag väntar på svar**. Använd det hållna utkastets versioner.
2. Stäng textvyn. Frågan ska inte visas i en separat ruta.
   Kontrollera frågans samtalstext genom att själv öppna textvyn; det
   syntetiska terminalfragmentet är inte bevis för att frågan hörs.
3. Välj **Skriv till Skyttel**, skriv **Lo använder tjänsten.** och skicka.
   Håll nästa anrop. Den gamla frågan ska vara borta och arbetsraden
   ska stå sist i samtalstexten. Ett skrivet uppdrag med mikrofonen av
   visar ingen röstruta.
4. Släpp anropet med `reply REQUEST Vill du läsa vidare?`.
   Det vanliga svaret ska inte skapa ett nytt nödvändigt svarskrav.
5. Öppna textvyn, skicka **Berätta mer.**, stäng arbetsytan och kör
   `fail REQUEST`. Kräv samtalsnotisen **Skyttel kunde inte slutföra
   uppdraget. Försök igen.**
6. Öppna textvyn och välj **Nytt samtal**.
   Beskrivningen **Förslag väntar på svar** ska fortfarande finnas i utkastet.

**Förväntat resultat:**

- Validerade följdfrågor ger ett uttryckligt svarskrav. Skyttel frågar
  själv om obesvarade identiteter och konflikter i samtalet; gränssnittet
  skapar inte en egen fråga. Fri modelltext bekräftar varken krav eller sparande.
- Nytt uppdrag och **Nytt samtal** rensar tidigare samtalsfrågor. Fel och
  nästa handling nås även med stängd dialog. Utkastet bevaras vid
  **Nytt samtal**.

### TAL-09: starten kräver medgivande och återhämtar mikrofonavbrott

**Syfte:** Starta samtalet först efter medgivande och skilja väntan på
mikrofonåtkomst från anslutning, med återhämtning efter avslag eller
avbruten start.

**Användare:** Alex i en ny kontrollerad installation.

**Förutsättningar:** Skapa Talprov. Ingen samtalsanslutning finns.

**Integrationstest:**
[voice-assistant.spec.ts](../../tests/integration/voice-assistant.spec.ts),
“TAL-09: starten kräver medgivande och återhämtar mikrofonavbrott”.

**Steg:**

1. Välj **Prata med Skyttel**. Medgivanderutan visas, och mikrofonen är
   av. Välj **Avbryt**. Välj **Skriv till Skyttel** och **Godkänn och starta**.
2. Skicka ett textmeddelande och svara från startguiden. Mikrofonen ska
   fortfarande vara oanvänd och inga röstanslutningar skapade.
3. Kör `window.skyttelVoiceFixture.setMicrophone('hold')` i konsolen.
   Välj **Prata med Skyttel**. Kräv **Rösten startar** i röstrutan,
   beskrivningen **Avbryt starten av rösten** på knappen och mikrofon av.
   Välj **Prata med Skyttel** igen, kör `releaseMicrophone()` på samma
   testobjekt och kontrollera att det sena mikrofonspåret avslutas utan
   röstanslutning.
4. Välj läget `deny` och välj knappen igen. Kräv fel, bevarad dialog och
   fungerande textfält. Byt till `allow`, sätt `setAutoStart(false)` och
   välj knappen.
5. Kräv **Rösten startar** med avstängd mikrofon. Kör `started()` på
   testobjektet. Först nu är knappen intryckt och röstrutan visar
   **Lyssnar**.

**Förväntat resultat:**

- Röst och text kräver samma medgivande. Att öppna eller avbryta
  medgivanderutan eller använda text begär inte mikrofonåtkomst.
- Sen mikrofonåtkomst återupplivar inte avbruten start. Avslag lämnar
  samtalet användbart. Klar anslutning och mikrofonåtkomst skiljs åt.

## Mikrofonen och röstrutan

Fallen TAL-10 till TAL-14 och TAL-16 använder den
[kontrollerade startguiden](#controlled-voice-fixture) med Talprov och
Lo Exempel som osparat förslag, enligt förberedelsens steg 2. Starta en ny
installation för varje fall. Kommandon som `setSound` och `stats()` körs i
webbläsarkonsolen, och `user`, `delegate` och `reply` i startguidens
terminal. TAL-17 kräver riktig utrustning.

### TAL-10: Prata med Skyttel slår på och av mikrofonen utan att någon panel öppnas

**Syfte:** Slå på och av mikrofonen med ett kort tryck, avbryta starten och
se att bara röstrutan visas.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Kartan visar vägledningen. Inget medgivande är
godkänt under besöket.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts),
testfallet “TAL-10: Prata med Skyttel slår på och av mikrofonen utan att
någon panel öppnas”.

**Steg:**

1. Kontrollera att **Prata med Skyttel** i **Kartans verktyg** visar en
   mikrofon och inte är intryckt.
2. Kör `window.skyttelVoiceFixture.setMicrophone('hold')`. Välj **Tala** i
   vägledningen och **Godkänn och starta** i medgivanderutan.
3. Läs röstrutan och för muspekaren över **Prata med Skyttel**.
4. Välj **Prata med Skyttel**. Kör `releaseMicrophone()` och sedan
   `setMicrophone('allow')` på samma testobjekt.
5. Välj **Prata med Skyttel** igen.
6. Välj **Prata med Skyttel** en gång till. Vänta några sekunder och kör
   `window.skyttelVoiceFixture.stats()`.
7. Välj **Prata med Skyttel** igen.

**Förväntat resultat:**

- Steg 3: röstrutan visar grå punkter och **Rösten startar**, utan
  stoppikon. Knappen heter fortfarande **Prata med Skyttel**, är inte
  intryckt och beskrivs **Avbryt starten av rösten**.
- Steg 4: röstrutan försvinner. Det sena mikrofonspåret avslutas, och
  ingen röstanslutning skapas.
- Steg 5: knappen är intryckt och visar samma mikrofon. Röstrutan visar
  sju punkter och **Lyssnar**. Ingen panel öppnas, och samtalets textfält syns
  inte.
- Steg 6: knappen är inte intryckt, och röstrutan försvinner direkt.
  Mikrofonspåret är avstängt från första stund och fortsätter vara levande.
  Anslutningen är kvar så att ett fördröjt svar kan höras: `openPeers: 1`.
- Steg 7: samma samtal fortsätter utan medgivanderuta, och röstrutan visar
  **Lyssnar**.

### TAL-11: Skyttel arbetar färdigt och talar klart när mikrofonen stängs av

**Syfte:** Låta Skyttel bearbeta det sagda och tala klart sitt svar när
mikrofonen stängs av mitt i arbetet, utan att något mer ljud skickas.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Samtalet är startat med **Prata med Skyttel**, och
röstrutan visar **Lyssnar**.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts),
testfallet “TAL-11: Skyttel arbetar färdigt och talar klart när mikrofonen
stängs av”.

**Steg:**

1. Kör `user Rätta namnet till Lo Lind.` och `delegate`. Låt anropet vara
   hållet.
2. Välj **Prata med Skyttel**. Kör `stats()`. Flytta fokus till
   **Återställ vy** med Tab.
3. Kör `setSound('remote', true)`. Släpp anropet med ett
   `propose_object` som ändrar Lo-förslagets namn till **Lo Lind**, enligt
   TAL-02:s verktygssteg, och nästa anrop med
   `reply REQUEST Namnet är ändrat i utkastet.`.
4. Kör `sessions`. Kör sedan `setSound('remote', false)` och vänta några
   sekunder. Kör `stats()`.

**Förväntat resultat:**

- Steg 1: röstrutan visar **Skyttel arbetar** och stoppikonen **Avbryt**.
- Steg 2: knappen är inte intryckt men går att välja. Mikrofonspåret har
  `enabled: false` och `state: 'live'`. Röstrutan visar fortfarande
  **Skyttel arbetar**.
- Steg 3: utkastet visar **Lo Lind**. Röstrutan visar **Skyttel talar**.
- Steg 4: `sessions` visar ett kommentarspaket för uppdraget. Röstrutan
  försvinner när ljudet tystnar, och skärmläsaren får **Mikrofonen är av**.
  Anslutningen och det avstängda mikrofonspåret finns kvar även efter en
  längre paus. Kör `setSound('remote', true)` igen: **Skyttel talar** visas
  utan att mikrofonen slås på. Inget fel visas.

### TAL-12: Avbryt i röstrutan stoppar arbetet och tystar Skyttel men behåller förslagen

**Syfte:** Stoppa ett talat uppdrag och tysta Skyttels röst med
stoppikonen, utan att redan föreslagna ändringar försvinner.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Mikrofonen är på. Anteckna utkastets innehåll.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts),
testfallet “TAL-12: Avbryt i röstrutan stoppar arbetet och tystar Skyttel
men behåller förslagen”.

**Steg:**

1. Kör `user Rätta namnet.` och `delegate`. Låt anropet vara hållet.
2. Gå med Tab till **Avbryt** i röstrutan och tryck Enter.
3. Släpp det gamla anropet med ett `propose_object` som byter namnet till
   **För sent**.
4. Kör `setSound('remote', true)`. Välj **Avbryt** och kör `stats()`.
5. Kör `setSound('remote', false)`, vänta mer än en sekund och kontrollera
   att de gamla inkommande spåren fortfarande är avslutade. Kör sedan
   `setSound('remote', true)` för ett nytt svar i den nya anslutningen.

**Förväntat resultat:**

- Steg 2: röstrutan visar **Lyssnar** utan stoppikon. Fokus står på
  **Prata med Skyttel**, som fortfarande är intryckt.
- Steg 3: utkastet är oförändrat. Lo heter fortfarande Lo Exempel, och
  inget kommentarspaket skickas för det avbrutna uppdraget.
- Steg 4: den gamla ljudutgången och dess spår avslutas direkt. Samma
  mikrofonspår är kvar. En ny anslutning behåller samtalets tidigare text,
  och röstrutan återgår till **Lyssnar**. Förslagen finns kvar.
- Steg 5: det avbrutna ljudet kan inte återupptas efter en paus.
  **Skyttel talar** visas för det nya svaret, som går att höra.

### TAL-13: ett skrivet meddelande visar aldrig röstrutan och stänger av mikrofonknappen

**Syfte:** Hålla röstrutan borta från ett samtal med enbart text och låta
mikrofonknappen vänta medan Skyttel arbetar med ett skrivet meddelande.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Samtalet är startat med **Skriv till Skyttel**.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts),
testfallet “TAL-13: ett skrivet meddelande visar aldrig röstrutan och
stänger av mikrofonknappen”.

**Steg:**

1. Skriv **Beskriv utkastet.** och välj **Skicka**. Låt anropet vara
   hållet.
2. Släpp anropet med `reply REQUEST Utkastet har ett förslag.`.
3. På dator: skicka ett nytt meddelande och tryck Escape med fokus i
   meddelandefältet medan anropet är hållet.
4. Välj **Prata med Skyttel**. Skicka **Beskriv det nu.** i textfältet och
   välj **Avbryt** i röstrutan medan anropet är hållet.

**Förväntat resultat:**

- Steg 1: **Prata med Skyttel** är avstängd, och ingen röstruta visas.
- Steg 2 och 3: knappen går att välja igen när Skyttel är klar eller
  uppdraget är avbrutet. Ingen röstruta visas, och ingen mikrofon används.
- Steg 4: med mikrofonen på visar röstrutan **Skyttel arbetar** med
  stoppikonen. Efter **Avbryt** visar den **Lyssnar**.

### TAL-14: röstrutan visar ett statusord åt gången och en vågform som följer rösten

**Syfte:** Se statusordens ordning, vågformens fyra former och de två
fasta formerna vid minskad rörelse.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Mikrofonen är på, och röstrutan visar **Lyssnar**.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts),
testfallet “TAL-14: röstrutan visar ett statusord åt gången och en vågform
som följer rösten”.

**Steg:**

1. Läs röstrutan. Kör `setSound('microphone', true, 0.08)` och sedan
   `setSound('microphone', true, 0.9)`.
2. Kör `setSound('remote', true)` med mikrofonljudet kvar.
3. Kör `user Beskriv utkastet.` och `delegate`. Släpp sedan anropet med
   `reply REQUEST Utkastet har ett förslag.`.
4. Slå på minskad rörelse i operativsystemet eller i webbläsarens
   utvecklarverktyg. Stoppa sedan Skyttels ljud och därefter
   mikrofonljudet.

**Förväntat resultat:**

- Steg 1: **Lyssnar** har sju punkter i accentfärg. **Du talar** har
  staplar i accentfärg som är låga vid svagt ljud och höga vid starkt ljud.
- Steg 2: **Skyttel talar** går före **Du talar**. Staplarna rör sig
  jämnt i textfärg, och stoppikonen visas.
- Steg 3: **Skyttel arbetar** går före båda, med stilla punkter. Efter
  svaret visar den **Skyttel talar**.
- Steg 4: vågformen rör sig inte. **Skyttel talar** och **Du talar** har
  samma sju stilla staplar, som inte ändras med ljudnivån. **Lyssnar** har
  sju punkter. Formerna byts utan övergång. Statusordet
  **Mikrofonen är av** visas aldrig.

### TAL-16: hjälpmedel får röstrutans namn, knappens läge och uppläsningarna i tur

**Syfte:** Ge skärmläsaren knappens läge, röstrutans namn och de tre
uppläsningarna, en gång och utan att avbryta.

**Användare:** Alex i den kontrollerade installationen, med skärmläsare
om en sådan finns.

**Förutsättningar:** Inget samtal pågår.

**Integrationstest:**
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts),
testfallet “TAL-16: hjälpmedel får röstrutans namn, knappens läge och
uppläsningarna i tur”.

**Steg:**

1. Starta samtalet med **Prata med Skyttel** och **Godkänn och starta**.
   Välj knappen igen med fokus kvar på den.
2. Slå på mikrofonen och flytta fokus till **Återställ vy** innan
   uppläsningen börjar.
3. Kör `setSound('microphone', true)` och sedan
   `setSound('microphone', false)`.
4. Kör `user Beskriv utkastet.`, `delegate`, släpp anropet med ett svar och
   kör `setSound('remote', true)`.
5. Gå med Tab från **Prata med Skyttel**.
6. Välj **Prata med Skyttel**, flytta fokus till **Återställ vy** och kör
   `setSound('remote', false)`.
7. Slå på mikrofonen igen och öppna **Inställningar**. Kör
   `setSound('remote', true)`, gå med Tab till **Avbryt** och tryck Enter.

**Förväntat resultat:**

- Steg 1: skärmläsaren säger knappens läge själv. Inget mer läses upp.
- Steg 2: **Lyssnar** läses upp en gång när mikrofonen slås på.
- Steg 3: **Du talar** läses inte upp, och **Lyssnar** läses inte upp igen.
- Steg 4: **Skyttel arbetar** läses upp. **Skyttel talar** läses inte upp.
  Stoppikonen heter **Avbryt**.
- Steg 5: ordningen är **Prata med Skyttel**, **Skriv till Skyttel**,
  **Avbryt**, **Sök i kartan**.
- Steg 6: **Mikrofonen är av** läses upp när röstrutan försvinner.
- Röstrutan är gruppen **Röstruta**, och vågformen läses inte. Alla
  uppläsningar väntar på sin tur, och inga ljudsignaler hörs.
- Steg 7: röstrutan står kvar i Inställningarnas statusrad och följer
  rösten där. När **Avbryt** försvinner står fokus på **Tillbaka till
  kartan**.

### TAL-17: röstrutan med riktig mikrofon, pekskärm och skärmläsare

**Syfte:** Pröva det som de kontrollerade fallen inte kan visa: riktig
mikrofon, riktig enhet och riktiga hjälpmedel.

**Användare:** Alex i en isolerad installation med påhittade data och
verklig röst, enligt
[röstguidens verkliga setup](../development/devcontainer.md#optional-assistant-access).

**Förutsättningar:** Chrome på Windows med NVDA, Chrome på macOS med
VoiceOver, och Chrome på iPhone och iPad med VoiceOver. Verkliga
leverantörsanrop kan kosta pengar.

**Integrationstest:** Enbart manuellt. Inget automatiskt prov använder
riktig mikrofon, enhet eller skärmläsare.

**Steg:**

1. Välj **Prata med Skyttel** och tillåt mikrofonen. Säg
   **Lägg till en påhittad cykel.** och stäng av mikrofonen direkt efter.
2. Lyssna medan Skyttel arbetar och svarar. Kontrollera i webbläsarens
   adressfält eller i systemet när mikrofonen används.
3. Slå på mikrofonen, tala i olika styrka och se vågformen. Låt Skyttel
   svara och välj **Avbryt** medan Skyttel talar.
4. Gör om stegen med skärmläsare och med fokus både på knappen och
   någon annanstans. Lyssna efter dubbla eller avbrutna uppläsningar och
   efter om skärmläsarens röst tolkas som tal.
5. På iPhone i stående läge: se var röstrutan står och att den inte
   täcker raden med **Återställ vy** eller kartans återkoppling. Gör om på
   iPad och på liggande telefon.

**Förväntat resultat:**

- Skyttel bearbetar det sagda färdigt och talar klart efter att
  mikrofonen är av. Webbläsaren slutar använda mikrofonen några sekunder
  efter att Skyttel har tystnat.
- Staplarna följer rösten. **Avbryt** tystar Skyttel direkt.
- Uppläsningarna kommer en gång, i tur och med rätt text. Anteckna om
  skärmläsarens röst tas upp av mikrofonen.
- Röstrutan står uppe till höger på iPad och liggande telefon och vid
  nederkanten på stående telefon. Anteckna enhet, system, webbläsare och
  hjälpmedel för varje prov.

### Bedömning mot WCAG 2.2 AA

Flödet är utformat mot WCAG 2.2 nivå AA. Kraven nedan är designmål, och
automationen visar bara det som anges. Ingen riktig mikrofon, skärmläsare,
pekskärm eller fysisk enhet är provad, och fullständig överensstämmelse
intygas inte.

<!-- markdownlint-disable MD013 -->
| Kriterium | Utformning | Automatisk kontroll | Återstår att prova manuellt |
| --- | --- | --- | --- |
| 1.1.1 Icke-textuellt innehåll | Vågformen är dold för hjälpmedel. Statusordet bär beskedet, och stoppikonen heter **Avbryt**. | Dold vågform, namn på stoppikonen. | Uppläsning med NVDA och VoiceOver. |
| 1.3.1, 4.1.2 Namn, roll och värde | **Prata med Skyttel** är en växlingsknapp med samma namn i båda lägena. Röstrutan är gruppen **Röstruta**. Beskrivningen är **Avbryt starten av rösten** medan rösten startar. | Namn, roll, intryckt läge och beskrivning. | Hur skärmläsare säger läget. |
| 1.4.1 Färg | Påslagen knapp har fylld bakgrund, inte bara en annan nyans, och intryckt läge för hjälpmedel. Röstrutan med **Lyssnar** visar också att mikrofonen är på. Vågformens färg följs av statusordet. | Intryckt läge, ändrad bakgrund och statusord i alla lägen. | Om fylld och ofylld knapp går att skilja åt utan färgseende. |
| 1.4.3, 1.4.11 Kontrast | Rutan och knappen använder kartans färger i ljust och mörkt tema. De grå punkterna bär ingen egen information. | – | Kontrast för text, stoppikon och fokusram i båda teman. |
| 1.4.4, 1.4.10 Förstoring och omflöde | Rutan har fast höjd och följer innehållets bredd, utan rullning i sidled. | Placering på 1280, 820 och 390 px utan rullning i sidled. | Verklig webbläsarzoom 200 och 400 procent. |
| 2.1.1 Tangentbord | Knappen och stoppikonen nås med Tab. | Tangentordning och Enter på **Avbryt**. | Hjälpmedlens egna kommandon. |
| 2.2.2 Paus, stopp, dölj | **Skyttel talar** rör sig medan Skyttel talar. **Avbryt** tystar Skyttel och stoppar rörelsen, och minskad rörelse ger fasta former. | Fasta former vid minskad rörelse. | Bedömning av rörelse som varar längre än fem sekunder. |
| 2.3.3 Animering från interaktioner | Vid minskad rörelse rör sig inget, och formerna byts utan övergång. | Ingen animering och ingen övergång. | – |
| 2.4.3, 2.4.7 Fokus | Ordningen är **Prata med Skyttel**, **Skriv till Skyttel**, **Avbryt**, sedan resten av verktygsraden. Försvinner **Avbryt** med fokus går fokus till **Prata med Skyttel**. | Tangentordning och fokus efter **Avbryt**. | Läsordning med VoiceOver när rutan står vid nederkanten. |
| 2.5.8 Pekmål | Stoppikonen är 26 px och har en tryckyta på 44 px på mobil enhet. | Stoppikonens mått. | Träffsäkerhet på fysisk pekskärm. |
| 4.1.3 Statusmeddelanden | **Lyssnar**, **Skyttel arbetar** och **Mikrofonen är av** läses upp i tur, utan att flytta fokus och utan ljudsignaler. | Uppläsningarnas text, tur och att de inte upprepas. | Att varje uppläsning kommer en gång med riktig skärmläsare. |
<!-- markdownlint-enable MD013 -->

Samtalsnotisernas uppläsning och fokus provas i
[samtalsnotiserna](conversation-notices.md). Röstrutans plats, bredd,
höjd och pekmål kontrolleras automatiskt i
[voice-box.spec.ts](../../tests/integration/voice-box.spec.ts), med de
testfall vars titel börjar med “röstrutan står på sin plats”. På riktig
enhet prövas platsen i TAL-17.

Placeringsproven kräver att hela röstrutan är synlig och står ovanför
den faktiska raden med **Återställ vy**, kartans återkoppling och
utkastets återkoppling, utan överlappning. På smal skärm kan dessa
skyddade ytor följa den synliga skärmens rullningsflöde; de bestämmer
gränsen som rutan måste lämna fri. Rutan ska inte hamna under kartans
rad eller täcka verktygsraden när textvyn stängs. Samtalsdelarnas
samlade läsordning, statusförekomster och kvarstående hjälpmedelsprov
finns i [den samlade bedömningen](conversation-accessibility.md).

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

Choose **Skriv till Skyttel** from the map tools and select
**Godkänn och starta** in the consent box. Then choose **Prata med Skyttel**
in the map tools to turn the microphone on. The fixture needs no hardware
microphone permission.
Keep the tab open and active: its normal status requests maintain the server's
voice connection. Closing the tab is a connection-loss check, not a pause.

### Conversation availability and task failure

`available off` makes the conversation unavailable without replacing the
household or the held task. `available on` restores it. The normal availability
check updates the notice within five seconds. `fail REQUEST` rejects a held
Terra request and shows the task-failure notice. These commands change only
the disposable fixture; they do not configure a production installation.

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
| `voice-failure startup` | Reject new Live sessions with a temporary provider failure; exercises the short startup notice and diagnostic log. |
| `voice-failure administration` | Reject new Live sessions with an authentication failure; exercises the administrator notice and diagnostic log. |
| `voice-failure off` | Restore successful provider startup for retries. |
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

Before choosing **Prata med Skyttel**, simulate denied microphone access:

```js
window.skyttelVoiceFixture.setMicrophone('deny');
```

After checking the visible error and working forms, set it back to `allow`
and start again. Use `error` instead of `deny` for a missing-device failure.
To simulate blocked audio playback, set this before starting voice:

```js
window.skyttelVoiceFixture.setPlayback('blocked');
```

Require the visible playback message and **Starta ljudet** button. Set playback
to `allow`, then press that button; the playback conversation notice should clear.
No sound is produced. `setSound('microphone', true, 0.8)` and
`setSound('remote', true)` simulate a loud user and Skyttel talking, and
`false` ends either sound. During an active session, the following console
command simulates a broken native connection:

```js
window.skyttelVoiceFixture.disconnect();
```

Use `reconnect()` within three seconds for a transient interruption. Leave it
disconnected for the application's timeout, or use `fail()` for immediate
failure. `audioError()` emits a media-output error. A transient recovery
keeps the microphone off until another explicit press. Blocked playback
keeps capture off until **Starta ljudet** succeeds. Microphone-off keeps
the connection alive for delayed answers. Open **Din profil → Inloggningssätt**,
expand **Välj inställning** if needed and choose **Logga ut** to close and
release all resources. Then inspect:

```js
window.skyttelVoiceFixture.stats();
```

Require `openPeers: 0`, `audioElements: 0`, and `state: 'ended'` for every
microphone and remote track. A disconnected connection must disable its
microphone track while waiting. These are actual silent browser media tracks,
not evidence that a physical microphone or speaker works. Reloading resets all
substitute controls; a new voice session follows normal application rules.

### Cleanup

Turn the microphone off, then type `quit` in the launcher terminal, or press
Ctrl+C. Wait for
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
