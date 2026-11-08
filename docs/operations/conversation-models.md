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

De stödda profilerna har 1 050 000 kontexttoken och högst 128 000
utmatningstoken enligt de officiella
[Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra)- och
[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)-sidorna,
kontrollerade 2026-11-03. `store:false` behålls. Kostnadsöversikten visar
saknade modellpriser som okända; den befintliga prislistan ger inte ett
pris för Terra. Använd faktisk leverantörsdebitering för avstämning.
