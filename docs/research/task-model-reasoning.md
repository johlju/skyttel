# Modell och resonemangsnivå per uppgift i Skyttels samtal

Underlag för produktägare och utvecklare som behöver bestämma vad
användarens modellval styr. Granskningen gäller GPT-6.1 Terra,
GPT-6.1 Sol och röstflödets GPT-Live 1. Officiell OpenAI-dokumentation
kontrolleras 2026-11-03; datumet anger hämtning, inte modellsläpp.
Lokal kod avser
[`8fd3c0cb`](https://github.com/viscalyx/skyttel/tree/8fd3c0cbecb89c15ffb239d54e97e3d7fe10e625).
Inga konto- eller fakturerbara modell- och röstanrop ingår. Produktkoden
ändras inte. Dokumentation kan inte bevisa en kvalitets- eller tidsvinst i
Skyttel.

## Slutsats och rekommendation

Rekommendationen är ett gemensamt användarvalt backendval för arbete,
uppdragstolkning, ändringskontroll och sammanfattning tills mätningar
motiverar namngivna undantag. GPT-Live 1 har redan en dokumenterad annan
roll: den lyssnar och talar medan backend arbetar. Det ger ett begripligt
löfte utan att påstå att Terra eller Sol alltid är bäst.

Rekommendationen är en slutsats av dokumentationen och kodens risker, inte
ett produktbeslut eller verifierad överlägsenhet. Underlaget motiverar att
bevara kontroller och tydligt beskriva valet; det motiverar inte ett fast
billigare kontrollsteg, automatisk uppgradering till Sol eller högre nivå
som en säkerhetsgaranti. Fördelningen mellan uppgifter återstår att välja.

Givna produktkrav är Terra/hög som första val och därefter användarens
senaste uttryckliga modell- och nivåval, gemensamt över nya samtal, enheter
och hushåll. Befintliga samtal på andra enheter behåller sitt aktiva val.
Att ett äldre samtal använder äldre inställningar skriver inte över
preferensen. Ett byte gäller när nästa uppdrag startar; pågående arbete
behåller sina inställningar och köat arbete tar det nya valet vid start.
Utkast, samtalstext och väntande delar bevaras. Saknas det valda stödet
krävs ett nytt uttryckligt val. Dessa krav är produktförutsättningar, inte
leverantörsfakta, och väljer inte vilka interna uppgifter valet ska styra.

## Dokumenterat modellstöd och allmän vägledning

Modellsidorna anger följande. De verifierar inte installationens åtkomst,
svensk samtalskvalitet eller en inbördes rangordning för hushållsuppgifter.

<!-- markdownlint-disable MD013 -->
| Modell | Dokumenterade egenskaper relevanta här | Källa |
| --- | --- | --- |
| GPT-6.1 Terra, `gpt-6.1-terra` | Visuellt resonemang, användning av gränssnitt och naturligt skrivande; `none`, `low`, `medium` som standard, `high`, `xhigh`, `max`. | [Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra) |
| GPT-6.1 Sol, `gpt-6.1-sol` | Komplex kod, användning av gränssnitt och professionellt arbete; `low`, `medium` som standard, `high`, `xhigh`, `max`. | [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) |
| GPT-Live 1, `gpt-live-1` | Text och ljud in/ut, funktionsanrop, inget stöd för Structured Outputs; ingen dokumenterad egen väljare för resonemangsnivå. | [Live](https://developers.openai.com/api/docs/models/gpt-live-1) |
<!-- markdownlint-enable MD013 -->

Terra och Sol stöder båda låg, medium och hög, Structured Outputs och
funktionsanrop via Responses. De har text in/ut, bild in och inget eget
ljudstöd; båda anger 1 050 000 token kontext och 128 000 token maximal
utdata. Hög måste skickas uttryckligen för att motsvara Skyttels krav.
Källor: modellsidorna ovan. Lika kontextstorlek bevisar inte lika kvalitet
eller att intern modellinformation kan flyttas fritt.

OpenAI rekommenderar att jämföra Terra och Sol med samma indata och
resonemangsnivå för relevanta uppgifter. Kvalitetskrav ska bestämmas före
jämförelsen, flera representativa uppgifter provas och tiden för granskning
och reparation räknas med. Det är allmän metodvägledning, inte resultat
från Skyttel. Se
[Model selection](https://developers.openai.com/api/docs/guides/model-selection).

Leverantörens allmänna riktlinje är lägre nivå för extraktion och
klassificering, medium/hög för bedömning och komplex planering. `xhigh`
eller `max` kräver att utvärdering visar en vinst som motiverar tid och
kostnad. Det stöder hypoteser om olika nivåer, inte fasta gränser mellan
Skyttels uppgifter. Se
[API deployment checklist](https://developers.openai.com/api/docs/guides/deployment-checklist).

## Lokal anropskedja och felens betydelse

En gemensam
[`respond`](https://github.com/viscalyx/skyttel/blob/8fd3c0cbecb89c15ffb239d54e97e3d7fe10e625/src/server/text-assistant.ts#L228)
fångar den injicerade profilen när applikationen skapas. Produktionsvalet
är Sol/hög i
[modellprofilerna](https://github.com/viscalyx/skyttel/blob/8fd3c0cbecb89c15ffb239d54e97e3d7fe10e625/src/server/conversation-capacity.ts#L1).
Följande gäller samma anropsfunktion:

- [Uppdragstolkningen](https://github.com/viscalyx/skyttel/blob/8fd3c0cbecb89c15ffb239d54e97e3d7fe10e625/src/server/assistant-turn-scope.ts#L72)
  får aktuell och tidigare autentiserad användartext. Den avgör läsning,
  arbete eller förtydligande och formulerar uppdragets gräns.
- [Arbetsmodellen](https://github.com/viscalyx/skyttel/blob/8fd3c0cbecb89c15ffb239d54e97e3d7fe10e625/src/server/text-assistant.ts#L1454)
  får instruktioner, kontext och verktyg och föreslår operationer.
- [Ändringskontrollen](https://github.com/viscalyx/skyttel/blob/8fd3c0cbecb89c15ffb239d54e97e3d7fe10e625/src/server/assistant-turn-scope.ts#L121)
  jämför operationerna med aktuell begäran och en låst uppdragsgräns.
  Kartdata och utkast är opålitliga data; inget här får utöka uppdraget.
- [Sammanfattningen](https://github.com/viscalyx/skyttel/blob/8fd3c0cbecb89c15ffb239d54e97e3d7fe10e625/src/server/conversation-summary.ts#L8)
  får historisk text, saknar verktyg och ska bevara mål, beslut, frågor och
  osäkerheter samt skilja förslag från bekräftade resultat.

[Anropsomslaget](https://github.com/viscalyx/skyttel/blob/8fd3c0cbecb89c15ffb239d54e97e3d7fe10e625/src/server/text-assistant-model.ts#L96)
skickar modell och nivå per Responses-anrop, `store: false` och
`parallel_tool_calls: false`. Tolkning och kontroll begär JSON i prompten
och validerar lokalt; de begär inte leverantörens Structured Outputs.
Felaktiga format och ofullständiga svar stoppar arbetet, men giltig JSON
kan bära en felaktig bedömning. Även Structured Outputs kan innehålla
sakfel enligt
[dokumentationen](https://developers.openai.com/api/docs/guides/structured-outputs).

## Hypoteser per uppgift

Tabellen beskriver analys och provbara hypoteser. Ingen rad är ett uppmätt
resultat eller en rekommendation att införa undantaget nu.

<!-- markdownlint-disable MD013 -->
| Uppgift | Rimlig hypotes om modell eller nivå | Risk och vad som behöver visas |
| --- | --- | --- |
| Arbete | Terra är relevant för avgränsad textbearbetning; Sol är en kandidat vid komplexa beroenden. Hög kan hjälpa när flera ändringar och villkor måste hållas samman. | Fel identitet, extra ändring, tappat villkor eller onödigt lång väntan. Ingen officiell jämförelse visar att Sol ger bättre hushållsuppgifter. |
| Uppdragstolkning | Kort klassificering kan tänkas klara lägre nivå; längre förtydliganden och blandade förbud kan kräva mer bedömning. | Fel gräns påverkar allt efteråt. Kontrollsteget får också den tolkade gränsen och är därför inget bevis på oberoende rättning av tolkningsfel. |
| Ändringskontroll | En avgränsad jämförelse kan tänkas vara billigare vid lägre nivå; svåra identiteter, beroenden och raderingar kan gynnas av mer arbete. | Felaktigt tillåtna operationer och felaktiga stopp måste räknas separat. Annan modell kan tänkas hitta andra fel, men oberoende fel och säkerhetsvinst är obevisade. |
| Sammanfattning | Terra är en rimlig kandidat för textbearbetning; lägre nivå kan minska kostnaden när källan är tydlig. | Förlorad osäkerhet, väntande fråga eller sammanblandning av förslag och resultat kan påverka många senare uppdrag. Kortare text är inget mått på bättre bevarande. |
<!-- markdownlint-enable MD013 -->

Uppgifternas korta svar betyder alltså inte att de är semantiskt enkla.
Särskilt tolkning och kontroll kräver precision snarare än ett välskrivet
svar. Att alltid ge dem Sol/hög är också ett obevisat undantag: det kan
öka väntan utan att rätta just de fel som förekommer.

## Sparande, behörighet, väntande delar och kontext

Koden upprätthåller
[separata kontroller](https://github.com/viscalyx/skyttel/blob/8fd3c0cbecb89c15ffb239d54e97e3d7fe10e625/src/server/text-assistant.ts#L1180)
av åtkomst, aktuell utkastversion och operationernas omfattning. Ett
[sparande](https://github.com/viscalyx/skyttel/blob/8fd3c0cbecb89c15ffb239d54e97e3d7fe10e625/src/server/text-assistant.ts#L1807)
kräver dessutom aktuell sparbegäran, färdiga ändringsdelar och ett verifierat
sparkvitto. Modellval eller hög nivå är inget nytt medgivande. Ingen modell
får låta historisk text, en sammanfattning eller kartinnehåll skapa
sparbehörighet. Det följer också sammanfattningspromptens kontrakt.

[Installationen av en sammanfattning](https://github.com/viscalyx/skyttel/blob/8fd3c0cbecb89c15ffb239d54e97e3d7fe10e625/src/server/text-assistant.ts#L606)
sker atomärt efter kontroll av revision och ny läsning av utkastet; ett fel
behåller gammalt underlag. Samtalstexten kapas inte. Slutsats för modellbyte:
bevara serverns väntande delar, utkast, sparförsök och verifierade resultat
som egna fakta. Att bara skicka en ny modell en sammanfattning kan inte
ersätta dem. Säkerställ även att kapacitetsmätningen följer aktiv profil.

OpenAI dokumenterar att återanvändbart resonemang är opakt och har
kompatibilitetsgränser mellan modellfamiljer. Guiden nämner stöd för
`all_turns` hos GPT-6.1 Sol, men etablerar inte fullständig överföring av
intern state mellan just Terra och Sol. Samtalstext och verifierat
applikationstillstånd måste därför bära produktens kontinuitet; replay av
providerobjekt behöver särskild verifiering. Se
[Reasoning models](https://developers.openai.com/api/docs/guides/reasoning).

## Röst, väntetid och cache

Skyttels
[röststart](https://github.com/viscalyx/skyttel/blob/8fd3c0cbecb89c15ffb239d54e97e3d7fe10e625/src/server/voice-assistant.ts#L540)
använder `gpt-live-1` med klientdelegering. Röstuppdrag går till samma
[backendvägar](https://github.com/viscalyx/skyttel/blob/8fd3c0cbecb89c15ffb239d54e97e3d7fe10e625/src/server/voice-assistant.ts#L723)
som text. OpenAI beskriver backendvalet som oberoende av röstmodellen och
rekommenderar lägre nivå bara när den klarar uppgiften tillförlitligt.
Se [Delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation).
Att byta själva Live-modellen kräver ny Live-session enligt
[sessionsdokumentationen](https://developers.openai.com/api/docs/guides/live-conversations).
Ett backendval ersätter således inte modellen som lyssnar och talar.

Tolkning föregår arbete och kontroll kan tillkomma före ändringar;
sammanfattning kan också behövas. Slutsats: mät hela kedjans väntetid.
Snabbare enskilda anrop kan förlora vinsten genom fler försök, frågor,
omtag eller röstfördröjningar. Live kan hålla samtalet igång under arbete,
men det bevisar inte snabbare färdiga ändringar.

Promptcache kräver matchande prefix; instruktioner, verktyg,
resonemangsinställningar och sammanfattning påverkar återanvändningen.
GPT-6.1 Sol och Terra har dokumenterade cacheläsningspriser på 5 procent
av vanligt indatapris och separat kostnad för cacheskrivning. En gemensam
modell garanterar därför inte cacheträff mellan olika uppgifter. Det finns
ingen verifierad överförbar cachevinst mellan de två modellerna här. Se
[Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

På stödda GPT-6-modeller kan `configuration_update` ändra nivå mellan
svar och bevara det tidigare prefixet, med begränsningar för automatisk
kompaktering och trunkering. Skyttels omslag använder inte denna mekanism.
Den är en möjlig separat optimering som måste förenas med egen
sammanfattning och den bekräftade gränsen vid uppdragsstart, inte ett skäl
att ändra produktlöftet. Se
[Change reasoning effort mid-conversation](https://developers.openai.com/api/docs/guides/deployment-checklist#change-reasoning-effort-mid-conversation).

## Begripliga alternativ för användarvalet

1. **Gemensamt backendval.** Löftet kan vara: "Ditt val gäller Skyttels
   arbete med text, tolkning, kontroll och sammanfattning. Röstens lyssnande
   och tal använder GPT-Live 1." Enkelt att följa upp; lägre användarvalda
   nivåer kräver samma skydd men innebär inget löfte om lika kvalitet.
2. **Arbetsval med fasta undantag.** Löftet kan vara: "Ditt val gäller
   arbetsmodellen. Tolkning och kontroll använder [namngiven modell/nivå];
   sammanfattning använder [namngiven modell/nivå]. Röst använder GPT-Live
   1." Kräver redovisade undantag, motivering och verifiering per uppgift.
   Röstuppdelningen motiverar inte automatiskt dessa ytterligare undantag.

Det första alternativet rekommenderas med nuvarande evidens. Om det andra
väljs bör inga undantag beskrivas som snabbare eller säkrare före mätning.
Automatisk växling efter en modellbedömning har ytterligare en felkälla och
ingår inte som ett färdigt förslag.

## Verifiering innan fasta undantag kan motiveras

Följande är behov, inte genomförda eller godkända fakturerbara prov:

- Bestäm en jämförelsebas och acceptanskriterier före prov: gemensam
  Terra/hög respektive Sol/hög, därefter ett namngivet undantag åt gången.
  Håll indata, instruktioner och nivå lika vid modelljämförelse; håll
  modellen fast vid nivåjämförelse. Mät både isolerat steg och hela kedjan.
- Använd svenska uppdrag med entydiga och tvetydiga identiteter, negationer,
  "ändra men spara inte", förtydliganden, avbrutet sparande, beroende och
  oberoende väntande delar, konflikter och instruktioner i lagrade data.
  Bedöm mot facit från mänsklig granskning och verkligt applikationstillstånd.
- Mät felaktigt tillåtna och felaktigt stoppade ändringar separat samt
  nödvändiga förtydliganden, extra operationer och felaktiga sparpåståenden.
  För sammanfattning: kontrollera fakta, osäkerhet och väntande delar samt
  kör fortsättningsuppdrag som visar effekten av bortfall.
- Prova modellbyte vid start, under arbete och med kö, samt bevarat utkast,
  frågor, sparförsök och samtalstext. Verifiera att ändrade preferenser på
  annan enhet inte ändrar ett redan aktivt samtal eller återställs av det.
- Upprepa jämförelser, variera ordning och redovisa misslyckanden. Mät
  median och långsam svans, total tid till korrekt resultat, antal anrop,
  reparationer, indata, cacheläsning/-skrivning, utdata och resonemangstoken.
  Registrera modell, faktisk nivå och uppgift per anrop. Tokenpris ensamt
  avgör inte kostnad per korrekt uppdrag.

Dokumentations- och kodanalysen kan motivera dessa kontroller och en
avgränsad mätplan. Den kan inte fastställa kontoåtkomst, acceptera en
felmarginal åt produktägaren eller styrka ett fast undantags nytta.
Jämförande mätning av lägre användarvalda nivåer ligger utanför nuvarande
leverans; ett behov av sådan mätning utökar inte omfattningen eller ger
tillstånd till fakturerbara anrop.

Det kompletterande
[underlaget om modellstöd](https://github.com/viscalyx/skyttel/blob/b1b4fc5e31ac33cfc7e6d759fa5ea034b699f322/docs/research/ai-model-reasoning-support.md)
redovisar API-identiteter och anropsvägar. Denna notering använder aktuellt
hämtade primärkällor för slutsatserna om uppgiftsfördelning.
