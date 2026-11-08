# Aktivera samtalets modeller

Installationsansvarig styr vilka modell- och nivåkombinationer som
Skyttel-användarna kan välja för samtalets backendarbete. Aktivering
verifierar varken OpenAI-kontots åtkomst eller modellens kvalitet.

## Konfiguration

`SKYTTEL_CONVERSATION_MODELS` är en JSON-lista med objekt som har
`model` och `effort`. Modellerna är `gpt-6.1-terra` och `gpt-6.1-sol`;
nivåerna är `low`, `medium` och `high`. Om variabeln saknas är alla sex
kombinationer aktiverade. En tom lista stänger av modellarbete utan att
radera personliga val. Ogiltig konfiguration hindrar serverstart.

Exempel med enbart höga nivåer:

```sh
export SKYTTEL_CONVERSATION_MODELS='[
  {"model":"gpt-6.1-terra","effort":"high"},
  {"model":"gpt-6.1-sol","effort":"high"}
]'
```

Ändra installationens miljö och starta om servern enligt dess vanliga
driftsrutin. Leverantörens modellista lägger aldrig automatiskt till val.
Utan sparat personligt val används Terra/hög. Ett avstängt standardval
eller sparat val bevaras med ett felbesked; användaren väljer själv ett
aktiverat alternativ. Personliga val hör till Skyttel-användaren och
gäller nya samtal över hushåll och enheter. De sparas i installationens
databas och kräver ingen ny webbläsarlagring.

## Åtkomst och fel

Åtkomstfel upptäcks först vid användarens begärda arbete. Det finns inga
dolda modellprov, tysta reservmodeller eller automatiska modellåterförsök.
Logghändelsen `assistant_model_failed` anger modell, resonemangsnivå,
felkategori, tidpunkt och diagnostisk referens utan samtalsinnehåll eller
inloggningsuppgifter. Skilj tillfälligt fel från saknad kontoåtkomst och
modell/nivå som inte stöds. Återställd åtkomst startar inget modellarbete.

Text och röst använder samma val för uppdragstolkning, arbete, oberoende
ändringskontroll och sammanfattning. GPT-Live 1 fortsätter att lyssna och
tala. Valet binds vid varje begärans start, också när begäran väntar i kö.
Pågående arbete avbryts inte av ett nytt val.

## Separat försök med överlappning

Installationsansvarig kan välja `SKYTTEL_CONVERSATION_WORK_MODE=overlap`
för ett uttryckligt försök. `sequential` är standard när variabeln saknas
och väljer baslinjen. Andra värden hindrar serverstart. Ändra miljön och
starta om servern enligt vanlig driftsrutin. Valet gäller både text och
röst; modell, resonemangsnivå och övrigt underlag väljs som vanligt.

Försöket låter arbetsmodellens resonemang och tillåtna läsningar börja
medan uppdragstolkningen pågår. Förslag väntar på tolkning, oberoende
ändringskontroll och vanliga åtkomst- och versionskontroller.
Förtydligande, fel och stopp kan göra påbörjat modellarbete oanvänt.
Anrop som avbryts kan ha okänd tokenåtgång och kostnad.

Behåll sekventiell körning vid vanlig drift tills en separat jämförelse
ger underlag för ett annat beslut. Aktiveringen visar ingen uppmätt
väntetidsvinst och godkänner ingen fakturerbar utvärdering. Jämför samma
modell, nivå, uppdrag, startdata och övriga optimeringar. Ta med hela
väntan till korrekt färdigt svar, även uppspelat tal, och alla faktiska
anrop vid förtydligande och tidigt stopp. Anta inget fast extra antal
anrop: ett vanligt lyckat uppdrag behöver redan tolkning och arbete.

Den uttryckligt aktiverade diagnostiken anger körsätt vid uppdragets
start och slut. Arbetsresultat anger leverantörsanropets identitet och
om resultatet används, förkastas eller ännu har okänt utfall. Ett tappat
ändringsbesked kan höra till genomfört arbete. Verifierat genomförande räknas
som använt även när beskedet saknas eller arbetet stoppas. Saknas behörig
åtkomst till underlaget förblir klassificeringen okänd.

En senare statuskontroll kan precisera ett okänt arbetsresultat med samma
leverantörsanrops identitet. Använd den senaste klassificeringen och bevara
tidigare observationer som historik. Utvärderingens arbetsresultat samlar
klassificeringarnas historik och kopplar token en gång per leverantörsanrop.
Knyt detta till anropets faktiska
tokenuppgifter och installationens kostnadsunderlag. Bevara okända
värden och avbrutna försök; de är inga lyckade slutförandetider.
Diagnostik kan innehålla hushållsuppgifter och följer installationens
befintliga medgivande och åtkomstregler.

De stödda profilerna har 1 050 000 kontexttoken och högst 128 000
utmatningstoken enligt de officiella
[Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra)- och
[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)-sidorna,
kontrollerade 2026-11-03. `store:false` behålls. Kostnadsöversikten visar
saknade modellpriser som okända; den befintliga prislistan ger inte ett
pris för Terra. Använd faktisk leverantörsdebitering för avstämning.
