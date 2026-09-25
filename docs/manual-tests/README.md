# Manuella testfall

Testfallen är grupperade efter område i applikationen. Varje områdesfil
beskriver användare, förberedelser, steg och förväntat resultat samt länkar
till motsvarande automatiserade integrationstester. Fall som uttryckligen
kräver verkliga externa konton anges som enbart manuella och körs inte i CI.

Fallen fungerar som körbara beskrivningar och stöd för felsökning.
Automatiserade fall behöver inte upprepas manuellt för specifikation #31.
Den separata [restlistan #97](https://github.com/viscalyx/skyttel/issues/97)
innehåller bara kvarvarande mänskliga bedömningar och bekräftelser.
Förberedelsen för dessa finns i
[ärendets kommentar](https://github.com/viscalyx/skyttel/issues/97#issuecomment-5835778540).
Registrera automatiska körningar med version och resultat; skilj dem från
verkliga leverantörsprov och mänskliga observationer.

Separata automatiska [modellprov](real-model-tests.md) och
[talprov](real-voice-tests.md) använder verkliga leverantörer.
De körs uttryckligen med privat konfiguration och redovisas separat från CI.

## Köra och förbereda prov

[Testguiden](../development/testing.md) beskriver kommandon för automatiska
kontroller och rapporter.
[Provförberedelsen](../development/devcontainer.md#disposable-local-database)
ger en separat lokal provdatabas. Förbered utvecklingsmiljön med
[utvecklingsguiden](../development/devcontainer.md). Områdesfallen länkar
till utvecklingsguidernas gemensamma miljöer. Särskilda provdata och
kontroller beskrivs tillsammans med respektive områdesfall.

För [stora kartor](large-map-performance.md) finns en separat mätplan och
[uppmätta resultat](large-map-results.md).

## Områden

- [Månadskostnad](costs.md): separata Render-, Live- och Terra-belopp,
  prisunderlag, månadens antaganden, okända värden, kumulativa mätningar,
  omstart, hämtningsfel och installationens särskilda kostnadsbehörighet.
  En lokal startguide ger kontrollerade leverantörssvar och två identiteter.

- [Återställning och flytt](household-recovery.md): tomma lokala installationer,
  uttrycklig verifierad ägarkoppling, bevarat undanträngt privat arbete,
  gamla sessioner och sparförsök, omstart och fortsatt export till en tredje
  installation utan gammal databas eller inloggningsbehörighet.

- [Typer, historik och rättelser genom MCP](assistant-advanced.md):
  egna typer och fält, daterade avtal, riktning och typbyte, skyddade
  definitioner, granskad sammanslagning med bilder samt ångring efter import.

- [Skyttels röst](voice-assistant.md): svenska röstuppdrag, avbrott,
  faktisk markering, exakt sparåterhämtning och tydlig skillnad mellan
  samtalstext och verifierade resultat, löpande dialog, mikrofonpaus och
  synlig arbetstid. Kontrollerat familjeunderlag och
  verkligt tal redovisas separat.
- [Skyttels textassistent](text-assistant.md): separat AI-val, hela utkast,
  rättelse och samlat sparande, sena svar, avbrott, återfunna kvitton och
  samtidigt synliga objekt och samband i karta och detaljpanel även på
  telefon, med skyddad formulärtext samt obekräftad samtalstext
  skild från resultat samt synliga samband, typer och före-/eftervärden
  i hela ändringslistan och begärda samtalsdetaljer från utkast och kvitto.
  Kontrollerade lokala
  leverantörssvar och verklig modellförståelse redovisas separat.

- [Permanent radering](household-erasure.md): uttrycklig granskning och
  bekräftelse, bevarat oberoende innehåll efter omstart, förlorat svar och
  förnyad granskning efter samtidig ändring samt väntande städning och
  återhämtning efter omstart. Radering av en tidigare typ tar bort dess
  sista historiska bildversion utan att ta bort objektets nuvarande bild.

- [Fullständig återimport](household-import.md): uttrycklig ersättning,
  bevarad åtkomst, privata uppgifter, bildhistorik, äldre fältbetydelser,
  lokalt prov med tappat sparbesked, avvisade gamla sparbegäranden,
  ny förberedelse efter omstart och ångring med aktuellt underlag.

- [Fullständig export](household-export.md): privata uppgifter före
  export, nedladdning, avbrott, återkallad aktiv hämtning, giltighetstid samt
  bevarade identiteter, bildversioner, utkast och placeringar efter
  sammanslagning. En lokal kontrollklient pausar en stor HTTP-överföring,
  mäter olästa byte i serverns källfil och kontrollerar borttagna exportfiler.

- [Sammanslagning](object-merge.md): uttrycklig identitet, val av uppgifter
  och samband, privata förslag, kontrollerat förlorat sparsvar, omstart
  och ångring av hela sparandet.

- [Profilbilder](profile-images.md): privata bildförslag, visning i
  rymdkartan, formatfel, gränser, omstart, bildbyte, borttagning, ångring,
  kvitton och bildåtkomst.

- [Externa assistenter](assistants.md): OAuth, separat AI-val, avböjd
  anslutning, avgränsade läsningar, egna utkast, hushållsgränser och
  återkallad åtkomst, särskilt kartmedgivande, hela utkast, rättelser,
  konflikter och återfunna kvitton samt ett separat manuellt Codex CLI-prov
  med verklig Google-inloggning i devcontainern, utan CI-hemligheter.
  En kontrollerad lokal MCP-klient behåller gamla begäranden, tappar ett
  lyckat sparbesked och provar exakta återförsök efter serveromstart.

- [Inloggning och hushållets start](access.md): skapa hushåll, använda
  tangentbord, återhämta anslutningsfel, logga ut och länka inloggningssätt.
- [Tillgång och medlemskap](membership.md): inbjudningar, utgångna och
  ersatta koder, delad administration samt återkallad och återställd
  tillgång med bevarat innehåll i kartan.
- [Objekt och samband](map.md): skapa, söka, rätta och ta bort uppgifter,
  skilja lika namn åt och bevara ofullständiga uppgifter.
- [Rymdkarta](spatial-map.md): gemensam redigering och navigering,
  fokus på tidigare och föreslagna samband med läsbara tidigare värden,
  fokus, filter, namn vid runda symboler, sambandsetiketter vid val,
  bevarat etikettläge vid återställning, pekmenyer, uttrycklig redigering
  med bevarat listfokus, sambandens antal vid direkt borttagning, upphörd status,
  ändringssymboler och bevarad oskickad text vid vybyte, orientering och
  grafikavbrott samt fungerande navigation när tillgången återkallas i helskärm.
- [Stora kartor](large-map.md): åtkomst till 500 objekt och 1 500 samband
  genom sidvisning, sökning och fokus, med bevarad text och placering.
- [Personliga placeringar](personal-view.md): flyttning med mus, pekgester
  och tangentbord, stabila fingerpar och kameraväxling, systemets minskade
  rörelse, visningsval, samtidighetskonflikter, bevarad text,
  beständighet och avskildhet mellan användare samt inramning vid sen
  första inläsning med bevarad kamera vid senare uppdateringar. Separata
  provhushåll på samma installation förbereds med ett lokalt kommando.
- [Avtal och ekonomiska uppgifter](contracts.md): registrera, hitta och
  rätta hyra, skuld och kredit, separata roller kring bostad och fordon,
  validering, konflikter, historik och bevarade äldre utkast. Ett lokalt
  kommando förbereder äldre provdata för uppgraderingen.
- [Privata utkast](drafts.md): återuppta utkast, hantera gamla kastförsök
  och konfliktval samt granska samtidiga ändringar, dubbletter och
  borttagningar före ett gemensamt sparande. Bevara oberoende status
  och slutdatum i samband vid konfliktval samt rätt typdefinitioner
  vid borttagning efter typbyten.
- [Objekttyper och egna fält](object-types.md): skapa och rätta gemensamma
  definitioner, fyra frivilliga värdeslag, privata förslag, samtidiga
  ändringar med bevarade oberoende uppgifter och samma atomiska kvitto
  som objektens innehåll. Typbyten granskar tidigare och nya värden,
  bevarar identitet och samband samt följer historikens ångring.
  Felaktiga värden provas med aktuella versioner i det publika gränssnittet.
- [Sambandstyper och riktning](relationship-types.md): benämningar från
  båda objekten, redigerbara definitioner, privata förslag, dubbletter
  och samtidiga sparanden utan delsparande.
- [Borttagning av typer och fält](definition-removal.md): granskad
  katalogborttagning, användningsspärrar för upphört innehåll och privata
  utkast samt uttrycklig återställning av saknade definitioner med innehållet.
- [Sparförsök](operations.md): återfinna genomförda, väntande och avvisade
  försök efter omstart, återförsöka från en annan klient och kontrollera
  privat tillgång.
- [Historik och ångring](history.md): läsa hela ändringsgrupper, skapa
  privata ångringsförslag, bevara oberoende arbete, granska överlapp och
  återställa borttagna objekt och samband med samma identiteter samt
  granska äldre fält mot dagens definitioner före återställning.
- [Upphört och borttaget](lifecycle.md): markera och rätta status, följa
  kända slutdatum och granska, kasta eller spara vanlig borttagning med
  bevarade anslutna objekt och historikunderlag, även efter privata typbyten.
