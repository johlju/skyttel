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
Den samlade kartupplevelsens
[verifieringsrapport](connected-experience-verification.md) redovisar hela
familjeflöden, verklig webbläsarzoom, granskade bilder och miljöbegränsningar.

## Öppna arbetsytor

Hushållet öppnar rymdkartan. Välj **Lista** i **Kartans verktyg** före
fallens formulär, listor, typer, historik och utkast. Välj **Skriv till Skyttel**
före samtalsfallen. Utan giltigt medgivande visas medgivanderutan först;
välj **Godkänn och starta**. På telefon öppnar **Visa verktygens namn**
även de kompletterande verktygen.

Välj **Uppgifter** vid objektet i Lista för att öppna dess panel. Namnet
visar i stället objektet i kartan. När ett fall återvänder
till ett redan öppet objekt, välj objektet i **Öppna paneler**. Stäng
arbetsytan inför kartgester om panelerna täcker kartan eller dess reglage;
öppna Lista igen för sökning, filter, samband och utkast.

**Din profil** innehåller användar-ID, inbjudningar, **Inloggningssätt**,
**Assistentanslutningar** och **Logga ut**. **Inställningar** öppnar en egen
sida med **Typer och egna fält**, **Administrera tillgång** för
administratören och **Månadskostnad** för driftansvarig. Mobilnavigationen
öppnas med **Välj inställning**. Följ dessa ingångar när ett fall anger en
sådan funktion. **Tillbaka till kartan** återger arbetet.
**Stäng arbetsytan** återgår till kartan och behåller oskickad text.

## Områden

- [Automatisk kontroll av sparande](save-check.md): återkomst efter nätfel,
  ursprungligt försöks-ID efter omstart utan nytt medgivande, ett enda
  utfallsbesked med röstval och kvitto samt återförsök bara vid kontrollfel.

- [Röstfel och ljudåterhämtning](voice-errors.md): fyra mikrofonhinder, tre
  servergrupper, felreferenser, stängning, återförsök och **Starta ljudet**
  med avstängd mikrofon fram till fungerande uppspelning.

- [Objektlistor](object-lists.md): typgrupper, flera typfilter, markeringar,
  separat sortering, sidval, bevarat rulläge, första klicket i en inaktiv
  lista och uttryckligt kartfokus.

- [Navigeringsfönstret](map-navigation.md): normal- och miniläge, oberoende
  fönsterflytt, samtidiga detaljer, sex beständiga personliga riktningar och
  nypzoom med styrplatta.

- [Inställningar och profil](settings-profile.md): helsida, mobilnavigation,
  återgång med fokus, synligt tangentbordsfokus i båda riktningar, läsbara
  teman och typdefinitioner i kartans samlade utkast.

- [Fria paneler](workspace-panels.md): flera objekt och samtal, placering,
  mobil panelväljare med synligt återgångsfokus, återöppning av nya objekt,
  bevarade samband och typer samt fortsatt sökning medan ett förslag skickas.
- [Kartans arbetsyta](workspace-shell.md): kompakt och expanderad verktygslåda,
  teman, läsbara hopplänkar och fokus, stängbar vägledning, hjälp, formulär på
  telefon samt laddning och återhämtning efter nätfel. På en tom mobilkarta
  förblir visningsval, vägledning och deras tangentbordsfokus nåbara.

- [Bevarat hushållsarbete](household-work.md): oskickad text, samtal,
  mikrofon, sökning, urval, synligt återställt fokus, personlig vy och samma
  sparförsök vid tillfälliga vybyten; avveckling vid utloggning, återkallad tillgång
  och ersatt hushållsinnehåll. Väntande permanent radering stoppar mikrofon,
  dolt formulär och registrerat sparförsök före omladdning; oberoende privat
  arbete finns kvar efter uttryckligt slutförande. Ett sammanhängande
  familjeärende går från synlig inloggning, text och tal till rättelse,
  Inställningar med röstruta och utkastets återkoppling, samlat kvitto, omstart
  och två medlemmars skilda utkast;
  samma fullständiga arbete provas med text och listor utan grafik eller ljud.

- [Månadskostnad](costs.md): separata Render-, Live- och Terra-belopp,
  prisunderlag, månadens antaganden, okända värden, kumulativa mätningar,
  omstart, hämtningsfel, okänt sparresultat, tangentbordsfokus och
  installationens särskilda kostnadsbehörighet på mobil och dator.
  En lokal startguide ger kontrollerade leverantörssvar och två identiteter.

- [Återställning och flytt](household-recovery.md): tomma lokala installationer,
  uttrycklig verifierad ägarkoppling, bevarat undanträngt privat arbete,
  fullständiga valda identiteter utanför vallistorna och förnyad bekräftelse,
  tappat svar vid identitetskoppling, oberoende privata tillstånd,
  gamla sessioner och sparförsök, omstart och fortsatt export till en tredje
  installation utan gammal databas eller inloggningsbehörighet.

- [Typer, historik och rättelser genom MCP](assistant-advanced.md):
  egna typer och fält, daterade avtal, riktning och typbyte, skyddade
  definitioner, granskad sammanslagning med bilder samt ångring efter import.

- [Samtalsmedgivandet](conversation-consent.md): medgivanderutan från
  verktygsraden, vägledningen och snabblänken, avbruten start med bevarat
  fokus, start med röst eller text efter vald knapp, medgivande för besöket
  eller sparat per användare och hushåll på flera enheter samt tangentbord,
  pekskärm och placering vid verktygsraden. Sidan **Samtal med Skyttel** i
  Inställningar: plats i menyn för alla medlemmar, sparat och återkallat
  medgivande, medgivande för besöket, återkallande från en annan enhet,
  bekräftelse under samtal, kvarvarande utkast och oskickad text,
  slutfört registrerat sparande med kvitto, tangentbord och pekskärm,
  otillgängligt samtal, misslyckat sparande och ny fråga efter en ny
  inbjudan. Ändrad medgivandetext kräver ett nytt sparat medgivande;
  en separat tillfällig installation förbereder det syntetiska tillståndet.
- [Samtalsnotiser](conversation-notices.md): bruten kontakt, otillgängligt
  samtal och uppdragsfel; en gemensam ordning, bara ett besked, stängning och
  automatisk återkomst, bevarad text med stoppad sändning och mikrofon,
  hjälpmedel utan dubbel uppläsning, fokus och placering vid röstrutan
  eller meddelandefältet på bred och smal skärm.
- [Frågor och talade sparbesked](conversation-questions.md): identiteter,
  konflikter, väntan med mikrofonen av, beständigt kvitto och fyra
  sekunders sparbesked efter ljud eller stopp.
- [Skyttels röst](voice-assistant.md): svenska röstuppdrag,
  start efter medgivande, mikrofonen på och av med **Prata med Skyttel**,
  röstrutans statusord, vågform, stoppikon, plats och uppläsning,
  ljudaktivitet, fördröjda svar med mikrofonen av och fokus efter avbrott
  även i Inställningar samt avbrutet ljud som förblir stoppat över pauser,
  faktisk markering, exakt sparåterhämtning och tydlig skillnad mellan
  samtalstext och verifierade resultat, löpande dialog och
  raden Skyttel arbetar. Kontrollerat familjeunderlag och
  verkligt tal redovisas separat.
- [Utkastet i samtalet](conversation-draft.md): tabellen och dess symboler,
  personligt val mellan hushåll och enheter, första förslaget, tomt utkast,
  sparåterkoppling och kvittots plats i Utkast och historik.

- [Mikrofontryck](microphone-press.md): kort och långt tryck, släpp och
  systemavbrott, medgivande, pekfångst och tangentkombinationer på riktiga
  Windows- och macOS-enheter; väntande tal under starten, avbrott och
  spärrad ljuduppspelning och mikrofonens läge vid nytt samtal.

- [Textvyn](text-view.md): **Skriv till Skyttel** öppnar och stänger
  textvyn utan att samtalet avslutas, samtalstexten visar vem som skriver
  och raden Skyttel arbetar sist, **Nytt samtal** behåller utkast, mikrofon
  och oskickad text även vid dubbelklick under fördröjd omstart, och textvyn
  går att använda på pekskärm och smal skärm. Kontrollerade kommentarspaket
  och faktiskt hört tal provas separat. Mobilfallen provar iPhone och
  iPad, fast sidofält på bred pekskärm, kompakt rad vid kort synlig höjd,
  bibehållet fokus, 190 px synlig höjd med rösten på, fria kartkontroller
  och långa rullbara notiser.
- [Samtalets kö och avbrott](conversation-queue.md): serverns kö på dator,
  fokusstyrd Escape, stopp på mobil och smal skärm, talade och skrivna
  uppdrag samt kvarvarande utkast, oskickad text och återkoppling.
- [Röst och text i samma samtal](conversation-voice-text.md): skrivna svar
  med röst när mikrofonen är på, text när den är av, ordnad överlämning av
  långa svar, kvarvarande samtalstext och artig uppläsning bara av nya
  textlevererade Skyttel-rader. Obekräftad text ger inget sparkvitto.
- [Samtalets kontext](conversation-context.md): samma tillfälliga samtal
  genom utkast, sparande, avbrott, fel, mikrofon av och på samt byte mellan
  röst och text. Äldre sparbesked ger inget nytt sparande. Skrivna och
  talade kommandon börjar om samtalet och kastar hela utkastet.
  Kontextmätaren följer serverns procenttal, röstrutan visar procent från
  85 och ger en enda artig uppläsning, även på smal pekskärm. Nytt samtal
  återställer mätaren och gamla mätningar ignoreras.
- [Skyttels textassistent](text-assistant.md): hela utkast,
  rättelse och samlat sparande, sena svar, avbrott, återfunna kvitton och
  samtidigt synliga objekt och samband i karta och detaljpanel även på
  telefon, med skyddad formulärtext samt obekräftad samtalstext
  skild från resultat samt synliga samband, typer och före-/eftervärden
  i hela ändringslistan och begärda samtalsdetaljer från utkast och kvitto.
  Kontrollerade lokala
  leverantörssvar och verklig modellförståelse redovisas separat.

- [Permanent radering](household-erasure.md): egen inställningssida,
  avbruten granskning med bevarat kartarbete, uttrycklig granskning och
  bekräftelse, bevarat oberoende innehåll efter omstart, förlorat svar och
  förnyad granskning efter samtidig ändring samt väntande städning och
  återhämtning efter omstart. Kända försök behåller sin identitet genom
  sidnavigation och omladdning trots senare resultat från en annan
  administratör. En annan aktuell administratör kan fortsätta samma
  väntande städning efter rollbyte, omstart och förlorat svar, med bevarat
  oberoende privat arbete. Ett saknat känt resultat är fortsatt okänt även
  efter omladdning och ett annat ärendes slutförande.
  Sena statussvar från en lämnad sida ändrar inte ett nyare försök eller fokus.
  Lagringsfel bevarar granskningen och verklig status för samma väntande
  ärende och blockerar nya åtgärder innan återhämtningen kan säkras.
  Hela granskningen och resultatet behåller läsbara identifierare och synligt
  tangentbordsfokus i båda teman, också på smala och korta fönster.
  Radering av en tidigare typ tar bort dess
  sista historiska bildversion utan att ta bort objektets nuvarande bild.

- [Fullständig återimport](household-import.md): egna inställningssidor,
  bevarat oskickat arbete före innehållsbyte, uttrycklig ersättning,
  bevarad åtkomst, privata uppgifter, bildhistorik, äldre fältbetydelser,
  lokalt prov med tappat sparbesked, avvisade gamla sparbegäranden,
  ny förberedelse efter omstart, samma importförsök i en annan
  administratörs webbläsare, tappat förberedelsesvar, väntande rensning
  efter rolländring, uppföljning av rätt försök trots en senare ersättning
  och ångring med aktuellt underlag. Tangentbord och fokus följs genom
  filfel, granskning, uttryckligt avbrott av obekräftad förberedelse,
  avbrottets rensningsfel och tappade svar, flera samtidiga granskningar
  och fördröjda avbrotts- och statussvar efter navigering. Ersättning och
  innehållskoppling följs i båda teman. Fel i webbläsarens återhämtningsminne
  bevarar vald fil, faktisk granskning och bekräftat serverresultat.

- [Fullständig export](household-export.md): egen sida i Inställningar,
  privata uppgifter före export, tangentbord, fokus, bevarat kartarbete,
  nedladdning, verklig återimport av den hämtade filen efter omstart,
  avbrott med oklart rensningsresultat, sidbyte under hämtning,
  återkallad aktiv hämtning, giltighetstid samt
  bevarade identiteter, bildversioner, utkast och placeringar efter
  sammanslagning. En lokal kontrollklient pausar en stor HTTP-överföring,
  mäter olästa byte i serverns källfil och kontrollerar borttagna exportfiler.

- [Sammanslagning](object-merge.md): uttrycklig identitet, val av uppgifter
  och samband, privata förslag, kontrollerat förlorat sparsvar, omstart
  och ångring av hela sparandet. Ändrat granskat underlag kräver nya val;
  oberoende samtidiga ändringar bevarar granskningen. Tangentbord, paneler
  och Inställningar behåller granskning och annan oskickad text.
  Typbundna dolda värden, ekonomiska uppgifter, bilder, ikoner och
  sambandsvärden granskas och återläses i båda teman på dator och mobil.
  Båda deltagarnas oskickade text bevaras tills den överges uttryckligen;
  kastning återger tidigare privata förslag med samma identiteter.
  Fördröjda svar bevarar senare sökfokus; förlorat förslagssvar följs av
  återläsning utan nytt förslag eller automatiskt sparande.

- [Objektikoner](object-icons.md): svensk sökning och ikonnamn, tangentbord,
  mobil, korta fönster vid förstoring, bildens företräde, typbyte, omstart
  och återgång till standardikon samt fokus vid fördröjda svar och återförsök.
- [Profilbilder](profile-images.md): privata bildförslag, visning i
  rymdkartan, formatfel, gränser, omstart, bildbyte, borttagning, ångring,
  kvitton, bildåtkomst och uttrycklig återgång efter bildfel i en stängd panel
  eller i Inställningar samt avbrutet filval och avslutade felåtergångar.
  Bildfelets återgång behåller läsbar text och tangentbordsfokus under
  pekaren i båda teman på dator och smala fönster; listverktyget är nåbart
  också i korta fönster efter att ett objekt stängts. Återgång till kartan
  och öppning av arbetet igen bevarar oskickad text också på kort datorvy.
  Alla objekttyper delar text, ikon och bild i samma förslag och kvitto;
  bildborttagning återställer inte en äldre sparad bild.

- [Externa assistenter](assistants.md): OAuth, separat AI-val, avböjd
  anslutning, avgränsade läsningar, egna utkast, hushållsgränser och
  återkallad åtkomst, särskilt kartmedgivande, hela utkast, rättelser,
  konflikter och återfunna kvitton samt ett separat manuellt Codex CLI-prov
  med verklig Google-inloggning i devcontainern, utan CI-hemligheter.
  En kontrollerad lokal MCP-klient behåller gamla begäranden, tappar ett
  lyckat sparbesked och provar exakta återförsök efter serveromstart.
  Profilens anslutningar får tangentbordsfokus och återgången behåller
  oskickad text och oberoende privata förslag.

- [Inloggning och hushållets start](access.md): skapa hushåll, använda
  tangentbord, avbryta extern inloggning, återhämta utgångna försök, börja
  med kartans vägledning, hantera förlorad tillgång och länka inloggningssätt.
  Länkningens två steg visar aktuell verifiering, båda tjänsternas status
  och övergången till respektive tjänst.
  Avbruten länkning bekräftas med bevarad tillgång och krav på ny verifiering.
  Utgången länkning förklarar ny verifiering och bevarar eget utkast och identitet.
  Även en redan öppen sida hanterar avvisad utgången verifiering utan ny koppling.
- [Tillgång och medlemskap](membership.md): inbjudningar, utgångna och
  ersatta koder, delad administration samt återkallad och återställd
  tillgång med bevarat innehåll i kartan. Stegvis inbjudan och verklig kopiering,
  separata medlems- och inbjudningsvyer samt avvecklat oskickat arbete när en
  redan öppen mottagarklient förlorar tillgång.
  Misslyckad urklippsknapp följs av manuell kopiering och faktisk acceptans.
- [Objekt och samband](map.md): skapa, söka, rätta och ta bort uppgifter,
  skilja lika namn åt, bevara ofullständiga uppgifter och rätta obesvarad
  identitet från aktuell status med bevarad oskickad text. Påbörjade objekt
  kan få en ny typ från Inställningar och sparas med nya samband i ett kvitto.
- [Markering och detaljer](map-selection.md): flerval, tomrumsgester,
  textkontroller, aktiv detaljikon och placering nära objektet.
- [Kamerans urvalsfokus](map-camera.md): personlig rotationspunkt, direkta
  grannar, återgångsvy, mus, tangentbord och pekskärm i smala och korta vyer.
- [Rymdkarta](spatial-map.md): gemensam redigering och navigering,
  stabil etikettinformation vid växling mellan kompakt karta och lista,
  täta mobilutsnitt med prioriterade objekt- och sambandsetiketter samt
  alternativ utan grafik,
  fokus på tidigare och föreslagna samband med läsbara tidigare värden,
  fokus, filter, namn vid runda symboler, sambandsetiketter vid val,
  bevarat etikettläge vid återställning, pekmenyer, uttrycklig redigering
  med bevarat listfokus, sambandens antal vid direkt borttagning, upphörd status,
  ändringssymboler och bevarad oskickad text vid vybyte, orientering och
  grafikavbrott samt fungerande navigation när tillgången återkallas i helskärm.
- [Stora kartor](large-map.md): åtkomst till 500 objekt och 1 500 samband
  genom sidvisning, sökning och fokus, med bevarad text och placering.
- [Personliga placeringar](personal-view.md): stjärnval i Rymdkartans
  inställningar, minskad rörelse, flyttning med mus, pekgester
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
  vid borttagning efter typbyten. Följ status och legend med stängda
  paneler, samma kvitto vid okänt utfall, bevarat tangentbordsfokus och
  ett samlat utkast från formulär, text och tal efter omstart. Besvara
  nödvändiga frågor före ett nytt uttryckligt sparbesked. Använd Navigation
  och aktuell status tillsammans utan att tappa åtkomst till kontrollerna.
  Öppna en namngiven konflikt från status med tangentbord och återgå till
  ett annat oskickat objektformulär med texten kvar. Följ alla fyra
  konfliktslag till rätt ändring och läs tidigare, föreslagna och aktuella
  avsnitt, dolda värden och hela ekonomiska uppgifter. Rätta ett
  konfliktobjekt med annan oskickad text kvar och bevara oberoende
  sparade uppgifter före ett nytt uttryckligt sparande. Rätta ett sambands
  borttagna mål utan att återuppliva objektet eller spara i förtid.
  Rätta objekt- och sambandstyper genom inställningarna med oberoende
  sparade uppgifter kvar och ett nytt uttryckligt sparbesked.
  Återgå till hela utkastet efter ett konfliktval och bevara senare
  sökfokus när svaret fördröjs.
  Återfinn privata konfliktval efter tappade svar och bekräfta samma
  kvitto efter ett nytt uttryckligt sparande utan dubbletter.
- [Objekttyper och egna fält](object-types.md): skapa och rätta gemensamma
  definitioner, fyra frivilliga värdeslag, privata förslag, samtidiga
  ändringar i namngivna avsnitt, flytt och döljning utan värdeförlust,
  gemensamma egenskaper med bevarad säkerhet och datum, tangentbord
  och bevarat arbete på mobil, dator och korta fönster med synlig status. Samtidiga
  ändringar med bevarade oberoende uppgifter och samma atomiska kvitto
  som objektens innehåll. Upprepade typbyten granskar skilda gamla svar,
  kräver ny bekräftelse och bevarar identitet, ekonomiska uppgifter,
  bild, ikon och samband samt följer historikens ångring.
  Felaktiga värden provas med aktuella versioner i det publika gränssnittet.
- [Sambandstyper och riktning](relationship-types.md): benämningar från
  båda objekten, redigerbara definitioner, fyra egna fältslag, obesvarat,
  noll och Nej, uttrycklig hantering vid typbyte, privata förslag,
  ordnade avsnitt och återvisade dolda svar efter omstart, dubbletter
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
  Omfattar historikkort, tangentbord, mobil, återförsök och fokus under
  fördröjd hämtning och ångring.
- [Upphört och borttaget](lifecycle.md): markera och rätta status, följa
  kända slutdatum och granska, kasta eller spara vanlig borttagning med
  bevarade anslutna objekt och historikunderlag, även efter privata typbyten.
  Kartans samband visar samma status med text och tillgänglig beskrivning
  vid tangentbordsarbete och efter omstart. Objekt och samband behåller
  sina egna namn, typer och statusuppgifter även när identifierare liknar varandra.
  Det gäller även tidigare samband som visas tillsammans med aktuella förslag.
