# Svenska samtal som ändrar Skyttels relationskarta

Kontrolldatum: 2026-09-13. Underlag till beslutsticketen
[Vilka tekniska vägar kan stödja svenska samtal som ändrar en relationskarta?](https://github.com/viscalyx/skyttel/issues/4).

Använd rapporten som tekniskt jämförelseunderlag inför prototyper.
Produktkrav och arkitekturbeslut finns i [beslutsöversikten](../planning/README.md).
Rapportens förslag och frågor är underlag, inte gällande krav eller en lista
över öppna beslut. Kontrollera aktuellt leverantörsstöd inför implementation;
uppgifterna gäller kontrolldatumet ovan.

Underlaget omfattar dokumentationsresearch, utan liveprov,
modellinstallationer, betalda API-anrop eller verkliga hushållsuppgifter.
Alla exempel är påhittade. Med relation avses ett samband enligt
[Skyttels begrepp](../../CONTEXT.md).

## Vad underlaget visar

Tal kan kopplas till ändringar genom antingen en kedja med taligenkänning och
en textbaserad AI, eller en modell som tar emot ljud och för samtalet direkt.
Båda kan lämna verktygsanrop som Skyttel tolkar. OpenAI beskriver även en
hybrid där GPT-Live sköter samtalet och delegerar arbete till en separat
bakomliggande modell eller arbetsprocess.
[OpenAI: Voice agents](https://developers.openai.com/api/docs/guides/voice-agents).

Slutsats för fortsatt utforskning: samtalskvalitet, korrekt relationskarta
och privat informationshantering behöver bedömas var för sig. En behaglig
röst är inte bevis på korrekt förståelse eller genomförd sparning. Att
leverantören dokumenterar svenska är inte ett mätresultat för Skyttel.

## Två huvudsakliga vägar

**Kedja:** mikrofon → strömmad taligenkänning → textbaserad AI →
ändringsförslag → eventuell talsyntes. Text mellan stegen kan inspekteras
och komponenter bytas separat. Bedömning: det underlättar felsökning av
skillnaden mellan felhörning och feltolkning, men Skyttel behöver samordna
turordning, avbrott och svarstid över flera steg.
[OpenAI: kedjade röstflöden](https://developers.openai.com/api/docs/guides/voice-agents#build-a-chained-voice-workflow).

**Direkt ljuddialog:** mikrofon → ljudmodell → tal och verktygsförslag.
Realtime API sammanför ljudförståelse, resonemang och verktygsanvändning.
Bedömning: detta kan passa ett flytande samtal medan kartan växer, men
verktygsresultat och synliga utkast behöver fortfarande hanteras i Skyttel.
[OpenAI: Realtime](https://developers.openai.com/api/docs/guides/realtime).

## Representativt urval och svenska

- **OpenAI, strömmad transkribering:** guiden beskriver
  `gpt-live-transcribe`, delresultat, slutresultat och språktips. Tidigare
  text kan korrigeras, och slutresultat från olika turer kan komma i annan
  ordning. De lästa guiderna fastställer inte uttryckligen svenska för
  denna modell; exakt språkstöd behöver bekräftas före ett jämförande prov.
  [OpenAI: Live transcription](https://developers.openai.com/api/docs/guides/realtime-transcription).
- **OpenAI, direkt ljuddialog:** `gpt-realtime-2.1` dokumenterar ljud in/ut
  och funktionsanrop. Modellkortet anger att Structured Outputs saknar
  stöd. Det ger ingen särskild svensk kvalitetsgaranti; svenska behöver
  provas mot de uppgifter som Skyttel ska klara.
  [OpenAI: GPT-Realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1).
- **Google, Gemini Live:** förmågeguiden listar svenska (`sv`) och beskriver
  direkt ljuddialog, transkription och avbrott. Den separata
  `gemini-3.5-transcribe-live` listar svenska (`sv-SE`) för strömmad
  taligenkänning. Dokumenterat språkstöd gäller inte automatiskt en viss
  träffsäkerhet för namn, e-postadresser eller relationer.
  [Google: Live-förmågor](https://ai.google.dev/gemini-api/docs/live-api/capabilities),
  [Google: Live transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe).
- **Lokalt, whisper.cpp:** implementationen har språkvalet svenska (`sv`)
  och exempel för lokal transkribering på dator, iOS, Android och i
  webbläsare. Detta är taligenkänning; dialog och ändringsförslag kräver
  ytterligare komponenter. Hastighet, minne och batteri behöver provas på
  målutrustningen; plattformsstöd är inte en prestandagaranti.
  [whisper.cpp: projektet](https://github.com/ggml-org/whisper.cpp),
  [whisper.cpp: språkkoder](https://github.com/ggml-org/whisper.cpp/blob/master/src/whisper.cpp).

Urvalet visar möjliga angreppssätt. Kontotillgång, kvoter och den modell
som faktiskt kan användas behöver kontrolleras när prototypen väljs.

## Från uttalande till granskbar ändring

OpenAI beskriver funktionsanrop där applikationen tar emot argument och
returnerar resultat. I textflöden kan strikt schema användas på modeller
som stöder det. Gemini Live kräver att applikationen själv hanterar
verktygssvar. Ett schema begränsar formen, men avgör inte vem som faktiskt
äger ett konto eller om användaren får ändra det.
[OpenAI: Realtime-verktyg](https://developers.openai.com/api/docs/guides/realtime-mcp),
[OpenAI: strikt funktionsschema](https://developers.openai.com/api/docs/guides/function-calling#strict-mode),
[Google: Live-verktyg](https://ai.google.dev/gemini-api/docs/live-api/tools).

Följande är förslag att pröva, inte fastställd arkitektur:

1. Låt AI:n föreslå ett samlat utkast med objekt, relationer och olösta
   frågor. Skyttel kontrollerar typer, behörighet och befintliga objekt.
2. Visa tydligt vad utkastet lägger till, ändrar och tar bort. Delresultat
   från taligenkänningen får ändra utkastet utan att räknas som sparade fakta.
3. Ställ en följdfråga vid verklig tvetydighet: ”Menar du kontots ägare
   eller personen som betalar?” Bevara det som fortfarande är okänt.
4. Låt ”Nej, Kim betalar” rätta just betalningsrelationen. Identiteten hos
   personen och abonnemanget behöver följa med genom rättelsen.
5. Knyt ett samlat godkännande till den utkastversion användaren faktiskt
   ser. En senare rättelse ska inte råka omfattas av ett tidigare ”ja”.
6. Spara genom Skyttels egna regler och returnera ett kvitto på resultatet.
   Ångring och skydd mot dubbla ändringar behövs även efter återanslutning.

## Avbrott, fördröjning och återanslutning

OpenAI Realtime stöder automatisk talaktivitetsdetektering och ett manuellt
tryck-för-att-prata-flöde. WebRTC hanterar avkortning av ospelat svar vid
avbrott; med WebSocket behöver klienten stoppa ljud och meddela hur långt
svaret spelas. Realtime-sessionens dokumenterade maxlängd är 60 minuter.
[OpenAI: samtal och avbrott](https://developers.openai.com/api/docs/guides/realtime-conversations).

Gemini Live beskriver avbrott som stoppar generering och väntande
funktionsanrop; klienten behöver tömma sin ljudkö. Guiden för verktyg anger
att asynkrona funktionsanrop ännu inte stöds i Gemini 3.1 Flash Live.
Återupptagning kräver särskild sessionskonfiguration och en sparad
återupptagningstoken, med dokumenterad giltighet i två timmar efter avslut.
[Google: avbrott](https://ai.google.dev/gemini-api/docs/live-api/capabilities#voice-activity-detection-vad),
[Google: verktygsbegränsningar](https://ai.google.dev/gemini-api/docs/live-api/tools#asynchronous-function-calling),
[Google: sessioner](https://ai.google.dev/gemini-api/docs/live-api/session-management).

Bedömning: ett avbrutet svar får inte likställas med en återställd
dataskrivning. Skyttel behöver skilja på ljudsession, utkast och bekräftat
resultat. Vid tappad anslutning ska det gå att avgöra vad som är sparat
innan någon operation skickas igen. Exakt återhämtning måste provas per
transport och modell; den är inte garanterad genom generellt API-stöd.

Strömmad transkribering har en avvägning mellan tidiga delresultat och mer
ljudkontext för bättre träffsäkerhet. Därför behövs separata mätningar av
tid till första synliga förslag, färdigt utkast och hörbart svar.
[OpenAI: fördröjning och träffsäkerhet](https://developers.openai.com/api/docs/guides/realtime-transcription#tune-latency-and-accuracy).

## Vad klientplattformen behöver klara

- **Webb på dator och telefon:** mikrofon via `getUserMedia` kräver säker
  kontext, exempelvis HTTPS, och mikrofontillstånd. Beviljat tillstånd
  garanterar inte att inspelning lyckas. Synlig mikrofonstatus och hantering
  av nekad åtkomst behöver ingå i gränssnittet.
  [W3C: Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/).
- **Molnanslutning från webben:** OpenAI dokumenterar WebRTC med en
  kortlivad klientnyckel utfärdad via en egen server. Den vanliga
  leverantörsnyckeln ska ligga på servern. Gemini Live beskriver också
  kortlivade token för direkt klientanslutning.
  [OpenAI: WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc),
  [Google: klientautentisering](https://ai.google.dev/gemini-api/docs/live-api/capabilities#client-authentication).
- **Installerad mobilklient:** installation undanröjer inte ljudregler.
  Android begränsar mikrofonåtkomst i bakgrunden; inspelning behöver ske
  i förgrunden eller via tillämplig förgrundstjänst. Låst skärm,
  telefonsamtal och byte av ljudenhet behöver egna prov på varje plattform.
  [Android: MediaRecorder](https://developer.android.com/media/platform/mediarecorder).
- **Lokal bearbetning:** whisper.cpp visar även WebAssembly i webbläsaren,
  där ljudet behandlas på datorn. Exemplet beskriver modellnedladdning,
  minnes- och prestandabegränsningar. Lokal drift kan alltså undersökas
  även för webb, med ett separat genomförbarhetsprov.
  [whisper.cpp: webbläsarexemplet](https://github.com/ggml-org/whisper.cpp/blob/master/examples/whisper.wasm/README.md).

## Privat hushållsdata och publikt repository

Utgångspunkt från produktägaren: källkod och planering är publika,
inmatad hushållsdata är privat. Föreslagen tillämpning: använd endast
syntetiska exempel i kod, issues, skärmbilder och forskningsunderlag.

Dataflödet avgör vilka uppgifter en extern part får. Extern taligenkänning
tar emot ljudet, inklusive uppgifter som senare filtreras ur texten.
En extern textmodell får transkript och den kartkontext som skickas med;
extern talsyntes får svarstexten. Direkt molndialog får ljud och tillförd
kontext. Slutsats: lokal taligenkänning kan minska ljudexponeringen, men
ger inte helt lokal behandling om textmodellen är extern.

OpenAI anger att API-data inte används för träning utan aktivt medgivande.
Tabellen anger ingen lagring av missbruksloggar eller applikationstillstånd
för `/v1/audio/transcriptions`, medan `/v1/realtime` har 30 dagars
missbruksövervakning som utgångspunkt. Särskilda lagringskontroller kräver
godkännande. Regionalitet beror på projekt, endpoint och modell;
Realtime-spårning anges inte vara förenlig med EU-dataresidens.
[OpenAI: datakontroller](https://developers.openai.com/api/docs/guides/your-data).

Googles Gemini API-villkor skiljer mellan betalda och obetalda tjänster.
För betalda tjänster används inte innehållet för produktförbättring, men
begränsad säkerhetsloggning finns. EES, Schweiz och Storbritannien omfattas
av särskilda datavillkor även för obetald användning. Villkoren medger
tillfällig behandling eller cache i länder där Google har anläggningar.
Inget specifikt konto eller regionalt upplägg är verifierat här.
[Google: användning av data](https://ai.google.dev/gemini-api/terms#paid-services).

Kontrollera produktbesluten om vilka externa mottagare som får behandla data,
vilka kartdelar AI:n får se, samt lagringstid för ljud, transkript, utkast,
historik och felsökningsloggar. Privat innebär inte automatiskt enbart
lokalt, men den skillnaden behöver vara begriplig för användaren.

## Kostnadsdrivare

En kedja behöver budget för taligenkänning, textmodell och eventuell
talsyntes. Realtime-dialog debiteras efter modellens ljud- och textbruk;
tidigare samtalsinnehåll kan räknas som indata igen vid senare turer.
Separat transkribering kan tillkomma. Samtalslängd, svarslängd, mängden
kartkontext och återanvändning av cache påverkar därmed kostnaden.
[OpenAI: röstkostnader](https://developers.openai.com/api/docs/guides/voice-latency-cost),
[Google: modellernas prisdimensioner](https://ai.google.dev/gemini-api/docs/pricing).

Bedömning: lokal bearbetning flyttar kostnader till utrustning, energi,
modellhantering och utveckling. Ett meningsfullt budgetprov bör mäta
kostnad per korrekt sparat abonnemang, inklusive rättelser. Någon
kronkostnad eller hastighetsvinst är inte uppmätt i detta underlag.

## Vad en prototyp behöver pröva

1. Svenska namn, e-postadresser, belopp och relationer i påhittade
   hushållsexempel; dialekter, bakgrundsljud och blandade språk.
2. Skillnaden mellan ”äger”, ”betalar” och ”använder”, oklara ”jag”/”vi”,
   samt återanvändning av ett objekt som redan finns i kartan.
3. Synliga delresultat, följdfrågor, rättelse medan AI:n talar och ett
   samlat godkännande. Mät uppgiftens resultat och talets kvalitet separat.
4. Nätavbrott före och efter godkännande: inget dubbelsparande och tydlig
   återgång till rätt utkast eller sparat resultat.
5. Mikrofonnekande, ljudenhetsbyte, mobilbakgrund och 3D-navigering medan
   samtalet pågår; behov av en alternativ inmatningsväg.
6. Fördröjning, resursbruk, kostnad och vilka data som faktiskt lämnar
   enheten. Lokala och externa vägar ska använda jämförbara uppgifter.

Inför ett prototypval, kontrollera produktbesluten om offlinebruk,
accepterad molnbehandling, första målplattform, om AI:n måste svara med röst,
tolererad väntetid och hur användaren godkänner ändringar. Använd dem för att
välja en rättvis prototypjämförelse och precisera leverantörskraven.
