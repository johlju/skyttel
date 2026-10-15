# Manuella testfall

Testfallen är grupperade efter område i applikationen. Varje områdesfil
beskriver användare, förberedelser, steg och förväntat resultat samt länkar
till motsvarande automatiserade prov i integrations- eller Chromium-sviten.
Tekniskt stödjande prov anges separat från ett falls motsvarighet. Fall som
kräver mänskliga observationer anger vad som behöver kontrolleras på riktigt;
automatik ersätter inte de observationerna.
Fall som kräver mänsklig användning av verkliga externa konton anges som
manuella och körs inte i CI.

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

För det förenklade samtalet finns en separat kvarstående
[mänsklig verifiering #220](https://github.com/viscalyx/skyttel/issues/220).
Den omfattar verklig mikrofon, skärmtangentbord och skärmläsare på
Chrome för Windows, macOS, iPhone och iPad. Automatiska DOM-, medie- och
fönsterprov ska redovisas separat från de resultaten.

## Köra och förbereda prov

[Testguiden](../development/testing.md) beskriver kommandon för automatiska
kontroller och rapporter.
[Provförberedelsen](../development/devcontainer.md#disposable-local-database)
ger en separat lokal provdatabas. Förbered utvecklingsmiljön med
[utvecklingsguiden](../development/devcontainer.md). Områdesfallen länkar
till utvecklingsguidernas gemensamma miljöer. Särskilda provdata och
kontroller beskrivs tillsammans med respektive områdesfall.

[Objektlistornas enhetsförberedelse](object-list-device-preparation.md)
ger LISTA-09 och SÖK-16 vanlig HTTPS, verklig leverantörsinloggning och
separata påhittade läs-, storkarts- och sökuppgifter. Fullständiga provarkiv
återställs inför varje delegerat fall; komplett privat provinnehåll kopplas
uttryckligen till det verifierade kontot före de mänskliga observationerna.

För [stora kartor](large-map-performance.md) finns en separat mätplan och
[uppmätta resultat](large-map-results.md).
Den samlade kartupplevelsens
[verifieringsrapport](connected-experience-verification.md) redovisar hela
familjeflöden, verklig webbläsarzoom, granskade bilder och miljöbegränsningar.
De nya arbetsytornas [verifieringsrapport](workspace-verification.md)
kopplar 25 beslutade kravområden och åtta arbetskedjor till faktiska
prov och manualer. Den redovisar automatiska slutkontroller och
slutgranskningarnas aktuella status separat från återstående fysiska
tillgänglighetsprov.

## Öppna arbetsytor

Hushållet öppnar **Karta**. Välj **Tabell** i **Kartans verktyg** för sökning,
filter, sortering och alla objekt. Namnet expanderar radens fullständiga
uppgifter och pennikonen öppnar objektets redigeringsformulär. **Samband för
[namn]** öppnar objektets samband och följbara objektlänkar. Läsning ändrar
inte uppgifter och behöver varken samtal eller medgivande.

Välj **Nytt objekt** i verktygen eller **Redigera [namn]** i tabellen för samma
fullständiga objektformulär. **Lägg i utkastet och stäng** lägger hela förslaget
i det privata utkastet. **Lägg i utkastet och öppna samband** övergår först
efter bekräftat förslag till objektets samband. Där finns **Nytt samband**
och **Redigera samband**. Radens läsuppgifter innehåller också **Åtgärder
för [namn]**, med vanliga objektåtgärder även när kartgrafiken inte fungerar.

Välj **Skriv till Skyttel** för textvyn. Den öppnas utan modellkontakt eller
nytt medgivande. **Visa utkastet** öppnar läsning, borttagning och sparande av
hela utkastet. Förslag kan läsas men redigeras via de vanliga formulären
efter borttagning och nytt förslag. Konflikter granskas från **Karta** eller
**Tabell**. **Rapporter** och **Ändringshistorik** visar gemensamt sparade
fakta.
För att starta ett nytt samtal väljer du uttryckligen **Nytt samtal**; om
medgivande behövs väljer du därefter **Godkänn och starta**.

På telefon öppnar **Visa verktygens namn** de kompletterande verktygen.
Dubbelklicka ett objekt eller högerklicka och välj **Visa uppgifter** för
att läsa det i ett flyttbart uppgiftsfönster. Med tangentbord öppnar
Skift+F10 objektets åtgärder. Dubbelklicka ett samband eller tryck Alt+Enter
på dess etikett för att läsa sambandets uppgifter.
Flera objekts fönster kan vara öppna samtidigt med egna placeringar.
Stäng den med **Stäng uppgifterna** före kartgester om den tar plats.
Stäng text med **Stäng textvyn** när ett fall behöver själva kartan.

**Din profil** innehåller användar-ID, inbjudningar, **Inloggningssätt**,
**Assistentanslutningar**, **Kakor och lagring** och **Logga ut**.
**Inställningar** öppnar en egen
sida med **Typer och egna fält**, **Administrera tillgång** för
administratören och **Månadskostnad** för driftansvarig. Mobilnavigationen
öppnas med **Välj inställning**. **Tillbaka till kartan** återger arbetet.

Objekt- och sambandsformulär skyddar oskickade ändringar när de stängs eller
lämnas. **Fortsätt redigera** eller Escape avbryter förlusten; endast
**Kasta ändringarna och fortsätt** kastar texten. Vid väntande eller oklart
utfall följer du formulärets uttryckliga kontroll före nytt försök.
Rent läsande dialoger stängs med kryss eller Escape och återför fokus.

## Områden

- [Kakor och lagring](cookies.md): publik information, första besök,
  profilvägen och fokusåtergång vid 1280, 390 och 320 pixlar, åtkomst före
  hushållsstart och efter återkallad tillgång samt separat skärmläsarprov.

- [Samtalets samlade hjälpmedelsflöde](conversation-accessibility.md):
  naturlig läs- och tabbordning över verktyg, röstruta och flyttad notis,
  en enda statusförekomst, återkomst och fokus, minskad rörelse samt
  samlad WCAG-bedömning med kvarstående mänskliga prov.

- [Automatisk kontroll av sparande](save-check.md): återkomst efter nätfel,
  ursprungligt försöks-ID efter omstart utan nytt medgivande, ett enda
  utfallsbesked med röstval och kvitto, återkallat medgivande med tappat
  svar samt återförsök bara vid kontrollfel. Genererade varianter har egna
  ID; faktisk uppläsning och mikrofonljud har separata observationsfall.

- [Röstfel och ljudåterhämtning](voice-errors.md): fyra mikrofonhinder, tre
  servergrupper, felreferenser, stängning, återförsök och **Starta ljudet**
  med avstängd mikrofon fram till fungerande uppspelning.

- [Objektlistor](object-lists.md): tabell med fullständiga uppgifter, skilda
  statusar, sortering via kolumnrubriker, 50 objekt per sida och bevarat
  läge på dator och mobil; nästa och föregående motsvarande radknapp när
  redigering eller kartbesök döljer en rad; fullständiga uppgifter direkt
  i raden med pennikon för redigering och
  sambandskedjor utan kartgrafik, uttrycklig identitet och
  sparade/föreslagna preciseringar,
  långa namn, modalernas fokus och återgång även när en sida försvinner;
  separat sökning, synligt kapselfält, kompakta snabbval och borttagning
  av aktiva filter med badges efter Filter, filterdialog utan
  förflyttning av etiketter
  och synliga streckade etikettlinjer i båda teman. SÖK-11/15 och SÖK-12
  körs genom kartans publika kontroller i Chromium med produktens stilar,
  fullständigt kontrollerat kartsvar och profilbilder från tabellförberedelsen.
  De behåller sina ID och ersätter tre integrationsexekveringar; övriga
  sökfall behåller verklig HTTP och jämförelse av hushållets tillstånd.
  Webbläsarfallen bevisar inte beständigt sparande.
  Området omfattar också
  Escape som rensar kartans text och filter, gemensamma kompakta
  filterdialoger med träffantal och sökfält med kryss,
  egna detaljträffar, aktuell rad, teckensammansättning,
  utkastfiltrets återställning,
  markeringar, direkta sammanhang, utforskning utan indirekt expansion,
  upphört även i sammanhang och tabellens kartknapp med bevarat läge;
  kartikoner med tooltips för skillnaden mellan bevarade och återställda
  kartfilter; röda papperskorgar på raden med återfokus och verkliga
  borttagningsberoenden utan
  kartgrafik, med oberoende förslag och sparade uppgifter kvar.
  Kartknappen är inaktiv vid grafikavbrott, medan vanlig läsning och
  redigering fungerar. Återgång från inställningarna behåller användbart
  läge och synligt, otäckt fokus. LISTA-06:s gamla fönstergeometri är
  pensionerad utan återanvänt ID; första aktiveringens läsning finns kvar.
  TABELL-01–05 har egna vanliga fall, liksom varje smal LISTA- och
  SÖK-variant. LISTA-09 skiljer faktisk uppläsning och förstoring från
  Chromium-proven, även för sökning med NVDA och VoiceOver. SÖK-16 har
  fysisk pekning, skärmtangentbord och förstoring på iPhone och iPad.
  Grafikavbrott har separat
  [körbar förberedelse](map-graphics-preparation.md).

- [Navigeringsfönstret](map-navigation.md): normal- och miniläge, oberoende
  fönsterflytt, samtidiga läsbara detaljer och knapptext på flera rader
  med öppen samtalsnotis, sex
  beständiga personliga riktningar och nypzoom med styrplatta.
  NAVIGATION-02 har komplett 1440 × 1000-referens; NAVIGATION-06–18
  skyddar alla sju mått och båda öppningsordningarna. NAVIGATION-05 bevarar
  native Ctrl/hjul, hastighet, begränsat hjulsteg och sidans skala i Chromium
  med publik hushållskarta, produktstilar och kontrollerade svar för karta och vy;
  serverlagring skyddas separat av de kvarvarande integrationsfallen.
  NAVIGATION-19
  anger faktisk styrplatta och webbläsare.

- [Inställningar och profil](settings-profile.md): helsida, mobilnavigation,
  återgång med fokus, synligt tangentbordsfokus i båda riktningar, läsbara
  teman och typdefinitioner i kartans samlade utkast. INST-02 bevarar
  administratörens oskickade typtext; INST-08 utför samma hela flöde som
  vanlig medlem. INST-09–11 delar de genererade mobilfallen; INST-12
  anger faktisk zoom och fysisk tangentbordsinmatning.

- [Objektarbete och samtal](workspace-panels.md): kompletta objektförslag,
  fullständiga uppgifter direkt i raden genom dator- och mobilbyte, bevarat
  samtal,
  skyddad formulärförlust, väntande
  objektdialog och åtkomliga samband och typer genom vanliga ingångar.
  Gamla fria fönsters placeringsfall är pensionerade utan återanvända ID:n.
  PANEL-03 använder två riktiga browserklienter och PANEL-09 anger
  faktiskt mikrofon- och ljudprov.
- [Kontots temaval](theme-preference.md): kontosparande utan hushåll,
  flera enheter och flikar, fokus, systemtema, fel och sena temasvar över
  kontobyte. Faktisk skärmläsning redovisas separat.
- [Kartans arbetsyta](workspace-shell.md): kompakt och expanderad verktygslåda,
  teman, läsbara hopplänkar och fokus, hjälp i det kompakta verktygsfältet,
  samtalshjälp med
  tangentkombination, medgivande och leverantörens datavillkor, formulär på
  telefon samt laddning och återhämtning efter nätfel. Hjälpens långa text
  går att rulla på telefon. På en tom mobilkarta förblir visningsval,
  verktyg och deras tangentbordsfokus nåbara, även med röstruta eller
  samtalsnotis. Höjdhjälpen finns i navigeringen och är inaktiv utan
  ett objektval. YTA-06 och YTA-10 skiljer ljust och mörkt tema.
  [Styrd leverans](workspace-preparation.md) förbereder väntande formulär,
  personliga flyttar och första läsningar utan produktändringar.

- [Bevarat hushållsarbete](household-work.md): separata dator-, 390- och
  320-pixelsfall för avbruten formulärförlust,
  lagda objektförslag, oskickad samtalstext, samtal,
  mikrofon, sökning, urval, synligt återställt fokus, personlig vy och samma
  sparförsök vid tillfälliga vybyten;
  [teknisk förberedelse vid rätt steg](household-work-preparation.md) med en
  befolkad referens som bevarar tidigare objekt, kvitto och separat utkast;
  den verktygskedjan upprepas inte separat från ett tomt hushåll. Faktiskt
  hört NVDA-tal och fysisk mikrofon som separata observationer; avveckling vid
  utloggning, återkallad
  tillgång
  och ersatt hushållsinnehåll. Väntande permanent radering stoppar mikrofon,
  dolt formulär och registrerat sparförsök före omladdning; oberoende privat
  arbete finns kvar efter uttryckligt slutförande. Ett sammanhängande
  familjeärende går från synlig inloggning, text och tal till rättelse,
  Inställningar med röstruta och utkastets återkoppling, samlat kvitto, omstart
  och två medlemmars skilda utkast;
  samma fullständiga arbete provas med text och listor utan grafik eller ljud.

- [Månadskostnad](costs.md): separata belopp för Render, Live och textmodell,
  prisunderlag, månadens antaganden, okända värden, kumulativa mätningar,
  omstart, hämtningsfel, okänt sparresultat, tangentbordsfokus och
  installationens särskilda kostnadsbehörighet på mobil och dator.
  KOST-04 har fullständig 1280px-återhämtning med omstart; KOST-05–06
  bevarar smala fokus- och prisflöden med dokumenterad referensförlust.
  En lokal startguide ger kontrollerade leverantörssvar och två identiteter.

- [Återställning och flytt](household-recovery.md): tomma lokala installationer,
  uttrycklig verifierad ägarkoppling, bevarat undanträngt privat arbete,
  fullständiga valda identiteter utanför vallistorna och förnyad bekräftelse,
  tappat svar vid identitetskoppling, oberoende privata tillstånd,
  gamla sessioner och sparförsök, omstart och fortsatt export till en tredje
  installation utan gammal databas eller inloggningsbehörighet. Separata
  [svarsförberedelser](household-recovery-faults.md) tappar verkligt slutförda
  svar; [konsolunderlag](household-recovery-console.md) skiljer sparbegäranden
  och arkivjämförelser från UI-stegen.

- [Typer, historik och rättelser genom MCP](assistant-advanced.md):
  egna typer och fält, daterade avtal, riktning och typbyte, skyddade
  definitioner och läsbar historik efter import samt vanliga
  rättelser med aktuellt underlag, hela valda kvitton och oförändrat
  oberoende utkast. Separata
  [klientfångster](assistant-client-preparation.md) ger körbara indata och
  tekniska jämförelser utan modell.

- [Samtalsmedgivandet](conversation-consent.md): medgivanderutan från
  verktygsraden och snabblänken, avbruten start med bevarat
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
  Vanliga syntetiska motsvarigheter hålls skilda från MEDGIVANDE-19/20:s
  faktiska skärmläsning, beröring och förstoring samt MEDGIVANDE-21:s
  enda hörda fjärråterkallandebesked.
- [Samtalsnotiser](conversation-notices.md): bruten kontakt, otillgängligt
  samtal och uppdragsfel; en gemensam ordning, bara ett besked, stängning och
  automatisk återkomst, textåtkomst utan tillgängligt samtal, bevarad text
  med stoppad sändning och mikrofon,
  hjälpmedel utan dubbel uppläsning, fokus och placering vid röstrutan
  eller meddelandefältet med hela beskedet läsbart på bred och smal skärm,
  verkligt registrerat
  kontrollfel med full privat och sparad läsning samt mätt text- och
  symbolkontrast i båda teman. NOT-03 behåller båda fokusvägarna och
  den pensionerade HJALP-04:s nodidentitet utan återanvänt ID. NOT-12–23
  har separata placeringar, korta fönster och teman. NOT-12–15 har sina
  stabila motsvarigheter i Chromium med produktionsstilar, kontrollerade
  HTTP-/mediesvar och återställning med fokus och Retur; verklig server,
  medgivandelagring och SQLite skyddas av de kvarvarande integrationsfallen.
  NOT-24 kräver hört besked. NOT-11 har
  en separat körbar mänsklig granskning av alla symbolformer och typfärger.
- [Frågor och talade sparbesked](conversation-questions.md): identiteter,
  konflikter, oberoende svar under väntande frågor, förnyad sparbegäran,
  väntan med mikrofonen av, beständigt kvitto och fyra
  sekunders sparbesked efter ljud eller stopp. Talad och skriven ingång
  har skilda vanliga fall; uppläsning och faktiskt ljud har FRAGA-08/09.
- [Skyttels röst](voice-assistant.md): svenska röstuppdrag,
  start efter medgivande, mikrofonen på och av med **Prata med Skyttel**,
  röstrutans statusord, vågform, stoppikon, plats och uppläsning,
  ljudaktivitet, fördröjda svar med mikrofonen av och fokus efter avbrott
  även i Inställningar samt avbrutet ljud som förblir stoppat över pauser,
  avbrott i långa samtal med bevarad kontext och mikrofonval,
  faktisk markering, exakt sparåterhämtning och tydlig skillnad mellan
  samtalstext och verifierade resultat, löpande dialog och
  raden Skyttel arbetar. Kontrollerat familjeunderlag och
  verkligt tal redovisas separat. TAL-18/19 skiljer mikrofonlägena;
  TAL-20–22 skiljer placeringarna och TAL-17/23–25 kräver verkliga
  mikrofon-, ljud-, system- eller skärmläsarobservationer. TAL-24 behåller
  TAL-16:s exakta hörda fokus-/aktivitetssekvens, inklusive statusord som
  inte ska läsas upp, och skiljer den från verkligt tal.
- [Utkastet i samtalet](conversation-draft.md): tabellen och dess symboler,
  personligt val mellan hushåll och enheter, första förslaget, tomt utkast,
  sparåterkoppling och kvittots plats i Rapporter → Ändringshistorik.
  SAMTALSUTKAST-01 läser fältvärden före/efter och bevarad sparad historik
  med [exakt läsförberedelse](conversation-review-preparation.md).
  SAMTALSUTKAST-04 är pensionerat till TEXT-04 utan återanvänt ID;
  smal dator och bred emulerad pekare har varsin motsvarighet.

- [Mikrofontryck](microphone-press.md): kort och långt tryck, släpp och
  systemavbrott, medgivande, pekfångst och separata Windows/macOS-varianter.
  Faktiska OS-genvägar och pekning har egna mänskliga fall. Väntande tal
  under starten, avbrott och
  spärrad ljuduppspelning och mikrofonens läge vid nytt samtal.

- [Textvyn](text-view.md): **Skriv till Skyttel** öppnar och stänger
  textvyn utan att samtalet avslutas, samtalstexten visar vem som skriver
  och raden Skyttel arbetar sist, **Nytt samtal** behåller utkast, mikrofon
  och oskickad text även vid dubbelklick under fördröjd omstart, och textvyn
  går att använda på pekskärm och smal skärm. Textknappens överlagrade
  markeringar visar skrivet arbete, olästa svar och väntande frågor med
  en enda artig uppläsning, fasta mått och minskad rörelse. Kommentarspaket
  och faktiskt hört tal provas separat. Mobilfallen har separata ID för
  varje kvarvarande emulerad konfiguration, fast sidofält på bred pekare,
  kompakt rad vid kort synlig höjd,
  bibehållet fokus, 190 px synlig höjd med rösten på, fria kartkontroller
  och långa rullbara notiser. Datorfallen provar oberoende breddhandtag
  med mus och piltangenter, personliga bredder mellan hushåll och enheter,
  visningsbegränsning utan ändrat sparat val samt återställning även utan
  tillgängligt samtal. Mobil enhet och smal skärm behåller sina bredder.
  Aktuella och kompatibla äldre hushållsarkiv bevarar personliga samtalsval
  och håller dem och medgivandet utanför hushållsfilen. TEXTBREDD-05 har
  en egen vanlig importmotsvarighet; EXPORT-10 är överlappande underlag.
  Faktisk skärmläsning, mikrofonljud och fysisk inmatning har separata
  observationsfall. De tre godkända mobilkonfigurationerna är borttagna.
- [Samtalets kö och avbrott](conversation-queue.md): serverns kö på dator,
  fokusstyrd Escape, stopp på mobil och smal skärm, talade och skrivna
  uppdrag samt kvarvarande utkast, oskickad text och återkoppling.
  KÖ-05 avser verklig utrustning.
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
  Full kontext sammanfattas automatiskt med kvarvarande samtalstext,
  aktuellt utkast, mikrofonläge och tidigare inspelat tal. Misslyckad
  sammanfattning blockerar nya uppdrag tills Nytt samtal. Pågående
  sparande och dess kontrollerade ljudkvittens avslutas före röstbytet.
  Mikrofonval, felingång och emulerade pekbredder har skilda identiteter;
  KONTEXT-16/17 avser verklig uppläsning, mikrofon och beröring;
  KONTEXT-18 bevarar hört hinderbesked vid textens och röstens
  sammanfattningsfel.
  [Separat samtalsförberedelse](conversation-preparation.md) beskriver
  versionsvärden, paket, registrerat sparande och PCM genom hållen start.
  PCM-receptets tekniska referens är fylld installation med oförändrad
  karta, utkast och historik; separat körning från tomt hushåll ingår inte.
  Båda huvudreceptproven finns kvar, inklusive fylld konfliktlösning.
- [Samtal med Skyttel](text-assistant.md): hela utkast,
  rättelse och samlat sparande, sena svar, avbrott, återfunna kvitton och
  samtidigt synliga objekt och samband i karta och detaljpanel även på
  telefon, med skyddad formulärtext samt obekräftad samtalstext
  skild från resultat samt synliga samband, typer och före-/eftervärden
  i hela ändringslistan och begärda samtalsdetaljer från utkast och kvitto.
  TEXT-07 är pensionerat till SAMTALSUTKAST-01 utan återanvänt ID.
  TEXT-04 återfinner den verkliga sparidentifieraren efter genomfört
  sparande med tappat svar och omstart. Varje TEXT-08-storlek har eget ID.
  [Operatörsförberedelsen](text-conversation-preparation.md) skiljer
  leveransfel och rått protokoll från vanliga UI-steg. Kontrollerade lokala
  leverantörssvar och verklig modellförståelse redovisas separat.
  Textstartens tekniska avvisningsprov behåller ett faktiskt Lo-förslag,
  oförändrat utkast, inga sparförsök samt återställning och städning;
  avvisningen upprepas inte oberoende med tom samling av förslag.

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
  De tio fullständiga bredd- och temaflödena har egna stabila identiteter
  i RADERING-06 och RADERING-12–20. RADERING-21 kräver faktisk zoom och
  fysiskt tangentbord. [Separat förberedelse](household-erasure-preparation.md)
  håller SQLite-läsning, tappar verkligt slutförda svar och blockerar
  återhämtningsminnet med tydliga tidpunkter och återställning.
  Den tekniska receptkontrollen bevarar ett privat förslag; en självständig
  receptkörning utan befintligt förslag ingår inte i den referensen.

- [Fullständig återimport](household-import.md): egna inställningssidor,
  bevarat oskickat arbete före innehållsbyte, uttrycklig ersättning,
  bevarad åtkomst, privata uppgifter, bildhistorik, äldre fältbetydelser,
  lokalt prov med tappat sparbesked, avvisade gamla sparbegäranden,
  ny förberedelse efter omstart, samma importförsök i en annan
  administratörs webbläsare, tappat förberedelsesvar, väntande rensning
  efter rolländring, uppföljning av rätt försök trots en senare ersättning
  och vanliga rättelser med aktuellt underlag. Tangentbord och fokus följs genom
  filfel, granskning, uttryckligt avbrott av obekräftad förberedelse,
  avbrottets rensningsfel och tappade svar, flera samtidiga granskningar
  och fördröjda avbrotts- och statussvar efter navigering. Ersättning och
  innehållskoppling följs i båda teman. Fel i webbläsarens återhämtningsminne
  bevarar vald fil, faktisk granskning och bekräftat serverresultat.
  [Separat filförberedelse](household-recovery-filesystem.md) anger rensningsfel,
  exakta katalogindata och återställning utanför UI-stegen.
  IMPORT-07 använder typ- och objektformulär samt Rapporter med separat
  request-underlag. IMPORT-15 och IMPORT-22–24 har varsin automatiserad
  motsvarighet vid 1280, 390, 320 respektive 640 CSS-pixlar; fysisk zoom
  och skärmläsaruppläsning ingår inte i dessa syntetiska kontroller.
  IMPORT-25 bevarar verklig webbläsarzoom som separat mänsklig observation.

- [Fullständig export](household-export.md): egen sida i Inställningar,
  privata uppgifter före export, tangentbord, fokus, bevarat kartarbete,
  nedladdning, verklig återimport av den hämtade filen efter omstart,
  fortsatt nytt sparande, separata breddfall för dator och smala eller korta
  fönster, bildförslag och historikläsning genom browserkontroller,
  avbrott med oklart rensningsresultat, sidbyte under hämtning,
  återkallad aktiv hämtning, giltighetstid samt
  bevarade identiteter, bildversioner, utkast och placeringar. En lokal
  browserförberedelse pausar den riktiga källströmmen och styr sena svar.
  Separat tekniskt arkivunderlag och en lokal kontrollklient
  pausar en stor HTTP-överföring,
  mäter olästa byte i serverns källfil och kontrollerar borttagna exportfiler.

- [Objektikoner](object-icons.md): svensk sökning och ikonnamn, tangentbord,
  smala CSS-vyer, separat verklig zoom, bildens företräde, typbyte, omstart
  och återgång till standardikon, lokalt tangentbordsfokus samt kompletta
  tillägg med bevarade värden vid avvisat eller okänt utfall.
  IKON-06–07 kräver fysisk inmatning med verklig zoom respektive visuell
  igenkänning av cykelsymbolen.
- [Profilbilder](profile-images.md): privata bildförslag, visning i
  rymdkartan, formatfel, gränser, omstart, bildbyte, borttagning,
  historikläsning,
  kvitton och bildåtkomst. Hela bildformulärets väntande tillägg spärrar
  navigering; avvisning behåller lokala värden, tidigare bild och oberoende
  förslag. Förlustvarningen har synligt tangentbordsfokus och läsbar text
  under pekaren i båda teman, också på korta fönster. Avbrutet filval
  ändrar inget och inaktuellt tillägg bevarar hela formuläret.
  Egen bildtyp är BILD-06:s generiska referens för text, ikon och bild
  i samma förslag och kvitto; bildborttagning återställer inte en äldre
  sparad bild. Den utför inte varje förifylld typ. BILD-07–15 identifierar
  befintliga storleks- och temavarianter; BILD-03 provar faktiskt medlemskap
  i ett annat hushåll. BILD-16 skiljer verklig zoom från CSS-storlekarna.

- [Externa assistenter](assistants.md): OAuth, separat AI-val, avböjd
  anslutning, avgränsade läsningar, egna utkast, hushållsgränser och
  återkallad åtkomst, särskilt kartmedgivande, hela utkast, rättelser,
  konflikter och återfunna kvitton samt ett separat manuellt Codex CLI-prov
  med verklig Google-inloggning i devcontainern, utan CI-hemligheter.
  AI-12 och AI-14 skiljer faktisk klientobservation från separat
  verklig modellverifiering; vanliga fall använder kontrollerade anrop.
  En kontrollerad lokal MCP-klient behåller gamla begäranden, tappar ett
  lyckat sparbesked och provar exakta återförsök efter serveromstart.
  [Separat läsklientprov](assistant-client-preparation.md#läsande-terminalklient-tom-och-fylld-karta)
  läser tom och fylld karta och utkast under samma medgivande och kontrollerar
  oförändrat innehåll, återkallelse och processavslut utan språkmodell.
  Profilens anslutningar får tangentbordsfokus och återgången behåller
  oskickad text och oberoende privata förslag.

- [Inloggning och hushållets start](access.md): skapa hushåll, använda
  säkra gemensamma starter i flera flikar, stoppa blockerade kakor eller
  saknade webbläsarlås och avbryta fördröjd initialisering,
  tangentbord, avbryta extern inloggning, återhämta utgångna försök, börja
  med kartans verktyg utan startdialoger, hantera förlorad tillgång och länka
  inloggningssätt. Inloggningsstartens nätverksavbrott och leverantörsfel
  har separata fall. Nekat Google- och Microsoft-samtycke provas var för sig.
  Länkningens två steg visar aktuell verifiering, båda tjänsternas status
  och övergången till respektive tjänst. Microsoft-inloggning efter
  omstart behåller profil och hushåll; requestdrivet identitetsbevis redovisas
  separat som tekniskt underlag. Tekniskt underlag täcker även överlappande
  inloggningar, utloggning under koppling och sena kakskrivande svar.
  Avbruten länkning bekräftas med bevarad tillgång och krav på ny verifiering.
  Utgången länkning förklarar ny verifiering och bevarar eget utkast och
  identitet.
  Även en redan öppen sida hanterar avvisad utgången verifiering utan ny
  koppling.
- [Tillgång och medlemskap](membership.md): inbjudningar, utgångna och
  ersatta koder, delad administration samt återkallad och återställd
  tillgång med bevarat innehåll i kartan. Stegvis inbjudan och verklig
  kopiering,
  separata medlems- och inbjudningsvyer samt avvecklat oskickat arbete när en
  redan öppen mottagarklient förlorar tillgång.
  Misslyckad urklippsknapp följs av manuell kopiering och faktisk acceptans.
  MEDLEM-07 skiljer utebliven begäran från ett förlorat svar efter serverns
  acceptans genom separat körbar felförberedelse.
- [Objekt och samband](map.md): skapa, söka, rätta och ta bort uppgifter,
  skilja lika namn åt och bevara ofullständiga uppgifter; det gemensamma
  objektformuläret med fullständiga värden, stängda avsnitts fel, typbyte,
  bild och ikon, förlustvarning, återfokus samt väntande, avvisat och oklart
  tillägg till utkastet på dator och mobil. KARTA-18 och KARTA-21 skiljer
  tillämpat och uteblivet tillägg; KARTA-20 och KARTA-22 har skilda
  ordnings- och fokusreferenser, med fullständigt sparande och omstart vid
  1440px.
  KARTA-07 använder verkliga familjeformulär med separat HTTP-underlag;
  KARTA-25 skyddar den samtidiga dubblettdialogen. KARTA-08 har en komplett
  1280px/ljus referens och fem egna native konfigurationsfall.
- [Markering och detaljer](map-selection.md): flerval, tomrumsgester,
  textkontroller, aktiv detaljikon, flera flyttbara uppgiftsfönster och
  högerklickets sju ikoner och uppgiftsfönstrens fem åtgärdsikoner.
  Oberoende fönsterflytt med pekare och tangentbord bevarar kameran och
  den personliga vyn. Vanliga formulär,
  återfokus och oförändrat utkast provas även i smala och korta fönster,
  liksom återgång från Rapporter till text och utkast.
  MARKERING-07–10 skiljer smala och korta konfigurationer; verkliga
  modifierare och pekdragning provas separat i MARKERING-11–12.
- [Kamerans urvalsfokus](map-camera.md): högerklickets tre kartåtgärder,
  bevarat urval och filter, etikettikonens växling och sparade val,
  återställning från verktygsfältet och bevarade personliga placeringar,
  personlig rotationspunkt, direkta grannar,
  vyhistorik steg för steg, nollställning och sammanhängande gester med
  verklig Chromium-inmatning och kontrollerade svar i KAMERA-08/09;
  mus, tangentbord och pekskärm i smala och korta integrationsvyer;
  nå återkoppling och alla sex personliga flyttar utan täckta kontroller,
  återfå fokus efter flytt och bevara senare fokus eller stängd navigering
  när ett verkligt svar hålls och släpps.
- [Rymdkarta](spatial-map.md): gemensam redigering genom Tabell, kompletta
  formulär och utkastets läsning med bevarad kamera och markering;
  samma kartikoner i listan och vid högerklick eller långtryck,
  skillnaden mellan återställda och bevarade filter samt tangentbord och
  stängning;
  sökning och direkta samband, läsbara tidigare sparade samband,
  täta etiketter, publicerat medlemsbortfall och återhämtning av grafik.
  RYMD-13 provar djupordning mellan symboler och samband under flyttning,
  efter kameranavigering och för linjer med olika ändpunktsdjup.
  RYMD-14 provar storlek efter djup, skalade bakgrunder, begränsad
  förstoring och valbara klickytor i ljusa och mörka mobil- och datorvyer.
  RYMD-11–12 skiljer fysisk pekning, orientering, zoom och faktisk
  symboltolkning från syntetisk Chromium-inmatning.

- [Stora kartor](large-map.md): åtkomst till 500 objekt och 1 500 samband
  genom sidvisning, sökning och fokus, med bevarad text och placering.
  Sparat resultat och historik läses genom webbläsaren efter omstart.
- [Personliga placeringar](personal-view.md): stjärnval i Rymdkartans
  inställningar, sparbekräftelse som toast i tre sekunder med bevarat fokus,
  minskad rörelse, flyttning med mus, pekgester
  och tangentbord, stabila fingerpar och kameraväxling, systemets minskade
  rörelse, visningsval, samtidighetskonflikter, bevarad text,
  beständighet och avskildhet mellan användare samt inramning vid sen
  första inläsning med bevarad kamera vid senare uppdateringar. Separata
  provhushåll på samma installation förbereds med ett lokalt kommando.
  Höjdhjälpen har stabil förhandsvisning och ett bevarat val i båda
  navigeringsstorlekarna.
- [Avtal och ekonomiska uppgifter](contracts.md): registrera, hitta och
  rätta hyra, skuld och kredit, separata roller kring bostad och fordon,
  validering, konflikter, historik och bevarade äldre utkast. Ett lokalt
  kommando förbereder äldre provdata för uppgraderingen. AVTAL-07 provar
  saknat känt skuldbelopp i formuläret och AVTAL-08 riktiga konfliktval;
  HTTP-validering, kvitton och historik körs som separat tekniskt underlag
  i Vitests serverprojekt med oberoende autentiserade klienter, verklig
  lokal server, SQLite och faktisk omstart. De tre protokollarbetsflödena
  behåller alla påståenden; tre integrationsexekveringar blir tre
  serverexekveringar.
- [Ditt utkast](drafts.md): fullständig läsning av objekt, samband och typer
  utan AI eller medgivande, giltighet, profilbilder och egna egenskapsnamn,
  separata bredd-, tema- och återfokusfall med
  [styrd sparleverans](save-preparation.md),
  långa fältnamn och sammanfattningar som skiljer giltighet från statusläge,
  direkt borttagning av oberoende förslag och bekräftad eller avbruten
  borttagning av nya objekt med deras verkliga sambandsberoenden,
  samt typförslag vars beroende förslag blir kvar med begriplig feltext,
  bekräftelse och avbrott för hela utkastet med oskickat meddelande kvar,
  uppdaterade beroenden efter inaktuell bekräftelse, typkonflikter med
  bevarade egna värden, fokus efter sista raden och återhämtning av
  borttagning efter tappat svar,
  beständig borttagningskontroll utan avbrott i senare samtalstext,
  tomt utkast och bevarat första meddelande;
  filtrerad teckenförklaring med kartans färger,
  tre sekunders sparbesked och beständiga fel med återhämtning; återuppta
  sparmodalens väntande, okända och avvisade försök från karta och tabell,
  även utan utkastikon efter omladdning; återgå till synligt Utkast efter
  bekräftad kontroll från Karta, behåll senare tangentbordsfokus
  och skilj bekräftat kvitto från fel vid efterföljande hämtning; återuppta
  utkast, hantera gamla kastförsök
  och konfliktval, kombinera egenskaper i Granska konflikter,
  med separat HTTP-underlag i Vitests serverprojekt för privata utkast,
  gamla konfliktval och återkallat medlemskap genom oberoende sessioner,
  separata Karta- och Tabellvägar för genomförda och uteblivna konfliktval,
  historisk fältförlust, skilda objekt- och sambandstypsåterställningar och
  avvisad gammal behörighet med
  [separat historisk förberedelse](historical-definition-preparation.md),
  nyare jämförelser, andra klienters sparande och oberoende formulärarbete;
  UTKAST-30 är pensionerat med skydd överfört till UTKAST-03;
  [styrd konfliktleverans](current-conflict-preparation.md), egna identiteter
  för bredd och valsida samt faktisk skärmläsarobservation i UTKAST-136;
  UTKAST-57 behåller kontrast och betydelser utan exakta dekorativa värden;
  läsa långa namn, bevara konfigurerade egenskapsnamn och
  ange varje egenskaps verkliga sparare, förklara ogiltiga kombinationer
  och avvisa inaktuell jämförelse; bevara val mellan konflikter och återöppning,
  göra om endast berörda egenskapsval, pröva ändrade typer och referenser igen
  och kontrollera genomförda eller uteblivna konfliktval efter tappat svar
  samt acceptera redan genomförda objekt- och sambandsborttagningar genom
  att kasta endast den berörda postens förslag; hantera dubbletter och
  saknade ändpunkter, välja objektets och nya sambands borttagning oberoende,
  kontrollera flera privata borttagningar efter tappat svar och rätta
  inkompatibla egna fält i den vanliga objektdialogen, rätta saknade typer
  genom faktiska definitioner och läsa historiska fältnamn före typbytesförlust;
  bevara oberoende
  utkast och sparad historik; behålla ett ändrat samband och öppna
  objektborttagningens verkliga beroende igen; granska borttagna
  typdefinitioner som hela
  aktiva val, återställa endast deras historiska identitet med fortsatt
  revisionsföljd, avvisa inaktuellt sparande atomiskt, ompröva privat
  återställning efter import och kontrollera dess fullständiga privata
  utfall utan dubblerad mutation; behålla ändrade fakta när nya samband
  försvinner, visa samtidiga typ- och ändpunktshinder, läsa historiska
  fältnamn även när en aktuell definition saknar fältet, kasta ägda
  definitionsförslag utan faktisk borttagningsrevision och kontrollera
  oklara fasta kastval från både Karta och Tabell samt gå till nästa verkliga
  konflikt från resultatet med bevarade val och rubrikfokus
  med en beständig status utan fokusstöld
  samt granska samtidiga ändringar, dubbletter och
  borttagningar före ett gemensamt sparande. Bevara oberoende status
  och slutdatum i samband vid konfliktval samt rätt typdefinitioner
  vid borttagning efter typbyten. Följ status och legend med stängda
  dialoger, samma kvitto vid okänt utfall, bevarat tangentbordsfokus och
  ett samlat utkast från formulär, text och tal efter omstart. Besvara
  nödvändiga frågor före ett nytt uttryckligt sparbesked. Använd Navigation
  och kartans status och teckenförklaring tillsammans utan att tappa åtkomst
  till kontrollerna.
  Avbryt förlust av oskickad objekttext, lägg hela objektändringen i
  utkastet och öppna en namngiven konflikt från status med tangentbord.
  Följ alla fyra konfliktslag till rätt ändring och läs tidigare, föreslagna
  och aktuella
  avsnitt, dolda värden och hela ekonomiska uppgifter. Rätta ett
  konfliktobjekt med det oberoende förslaget och sparade uppgifter kvar
  före ett nytt uttryckligt sparande. Rätta ett sambands
  borttagna mål utan att återuppliva objektet eller spara i förtid.
  Rätta objekt- och sambandstyper genom inställningarna med oberoende
  sparade uppgifter kvar och ett nytt uttryckligt sparbesked.
  Återgå till hela utkastet efter ett konfliktval och bevara senare
  sökfokus när svaret fördröjs.
  Återfinn privata konfliktval efter tappade svar och bekräfta samma
  kvitto efter ett nytt uttryckligt sparande utan dubbletter.
  UTKAST-41–48 och UTKAST-142–150 har separata borttagningsflöden:
  oberoende och beroende förslag, två typsamlingar, smala bekräftelser,
  sena fokusutfall och tappat svar efter genomförd eller utebliven ändring.
  UTKAST-137 följer två samtidigt privata, oberoende objektändringar till
  separata sparanden och båda medlemmarnas läsning efter omstart.
  UTKAST-43 och UTKAST-143 har separat
  [tekniskt HTTP-underlag i server-sviten](../../tests/unit/server/draft-removal-http.test.ts)
  för publika typförslag, beroende värden och oförändrad karta och historik.
- [Objekttyper och egna fält](object-types.md): skapa och rätta gemensamma
  definitioner, fyra frivilliga värdeslag, privata förslag, samtidiga
  ändringar i namngivna avsnitt, flytt och döljning utan värdeförlust,
  gemensamma egenskaper med bevarad säkerhet och datum, tangentbord
  och bevarat arbete på mobil, dator och korta fönster med synlig status.
  Konfigurerad läsordning följer formuläret genom utkast och tabell,
  med uttryckliga nollvärden och **Nej** bevarade.
  Samtidiga
  ändringar med bevarade oberoende uppgifter och samma atomiska kvitto
  som objektens innehåll. Upprepade typbyten granskar skilda gamla svar,
  kräver ny bekräftelse och bevarar identitet, ekonomiska uppgifter,
  bild, ikon och samband samt läser historiska värden.
  TYP-09, TYP-10 och TYP-11 är kompletta referenser vid datorbredd;
  TYP-13–22 skyddar angivna smala, korta och mörka browserflöden. Hela
  sparande- och omstartskedjan upprepas inte i varje konfiguration.
  TYP-23 kräver fysisk tangentbordsanvändning vid verklig förstoring.
  TYP-07:s HTTP-underlag i Vitests serverprojekt bevarar felaktiga värden,
  ändrade definitioner, gamla sparbesked och senare privata fält efter
  faktisk omstart.
  TYP-01 jämför hela privata förslag, beständigt kvitto, historik och
  återspelning i formulärflödet;
  typens och fältets formulärvalidering utförs genom riktiga kontroller.
  Konfigurerad fältordning följer med till formulär, utkast och tabellens
  fullständiga läsning, inklusive uttrycklig noll och Nej.
- [Sambandsarbete](relationships.md): skapa objekt separat, koppla dem i den
  gemensamma dialogen och rätta objekt och samband oberoende. Fullständiga
  egna värden, typbyte, riktning och säkerhet behåller sin betydelse.
  Validering, dubbletter, borttagning, oklara utfall och förlustvarning
  bevarar tidigare förslag. Ett gammalt obekräftat försök efter en senare
  ändring kräver granskning av aktuellt underlag före nytt förslag.
  Läsning, filter, återfokus och tre webbläsarvyer provas med egna
  fallidentiteter. Faktisk skärmläsning och fysiskt skärmtangentbord har
  separata mänskliga observationsfall. Exakta dekorativa värden i
  SAMBAND-12 ingår inte i skyddet.
- [Sambandstyper och riktning](relationship-types.md): benämningar från
  båda objekten, redigerbara definitioner, fyra egna fältslag, obesvarat,
  noll och Nej, uttrycklig hantering vid typbyte, privata förslag,
  ordnade avsnitt och återvisade dolda svar efter omstart, dubbletter
  och samtidiga sparanden utan delsparande. Typ- och fältformulär provas
  genom native kontroller. Hela spara- och omstartskedjan har referensen
  1440px; 390/320px behåller eget formulärarbete, teman och fokus.
  STY-01 jämför hela privata förslag, historiska typdefinitioner, exakt
  kvitto, historik och återspelning i samma formulärflöde.
- [Borttagning av typer och fält](definition-removal.md): granskad
  katalogborttagning, användningsspärrar för upphört innehåll och privata
  utkast utan privat läckage, fullständig förslagsläsning och läsning av
  historiska definitioner som saknas i katalogen även efter omstart.
- [Sparutfall, återhämtning och gemensamma demodata](operations.md):
  kontrollera samma väntande eller obekräftade försök efter omstart,
  läsa genomförda sparanden i Rapporter och kontrollera privat tillgång;
  SPAR-05 provar styrd leverans av verkliga formulärförslag, avvisat inaktuellt
  sparande och återhämtning av ett tappat lyckat sparkvitto. SPAR-01 tappar
  också det verkliga svaret före omstart och återfinner samma kvitto från
  en annan klient; protokollreplay redovisas separat.
  DEMO-01 och DEMO-02 provar färdigt TestHousehold med Google respektive
  Microsoft som konfigurerad administratör. Båda behåller den andra
  leverantörens åtkomstgräns, fulla värden och privata förslag efter omstart.
  Teknisk start, säker sådd och återställning redovisas separat.
- [Ändringshistorik](history.md): Rapporter visar genomförda sparanden
  senaste först, fullständiga historiska värden, direktlänkar och återgång
  till bevarat arbete. Omfattar tangentbord, smala skärmar, återförsök
  och fokus under fördröjd hämtning, sparlänkar med bevarad oskickad text
  samt HISTORIK-14–17:s smala varianter och separat verklig zoom.
  HISTORIK-13 är avvecklat: ikontext före/efter bredvid oförändrad
  profilbild saknar sin specifika integrationskontroll.
- [Upphört och borttaget](lifecycle.md): markera och rätta status, följa
  kända slutdatum och granska, kasta eller spara vanlig borttagning med
  bevarade anslutna objekt och historikunderlag, även efter privata typbyten.
  Kartans samband visar samma status med text och tillgänglig beskrivning
  vid tangentbordsarbete och efter omstart. Objekt och samband behåller
  sina egna namn, typer och statusuppgifter även när identifierare liknar
  varandra.
  Det gäller även tidigare samband som visas tillsammans med aktuella förslag.
  LIVSCYKEL-01–06 har en varsin funktionell motsvarighet; LIVSCYKEL-07–09
  kräver faktisk NVDA-uppläsning och redovisar DOM-prov som separat underlag.
  [Separat HTTP-underlag](lifecycle.md#separat-http-underlag) för datum,
  aktuella och tidigare samband körs i Vitests serversvit med verklig
  SQLite och faktisk omstart. Det flyttar en teknisk integrationsexekvering
  utan att avveckla något arbetsflöde eller fall-ID.

Kamerans KAMERA-10/11, personliga vyns PLACERING-11/12 och profilens
INST-12/13 och arbetsytans YTA-11/12 redovisar faktisk fysisk inmatning,
zoom eller uppläsning separat. KAMERA-12 gäller fysiska hela kameragester.
PLACERING-09 har komplett 1440-referens och PLACERING-10 behåller smal
återkoppling, utgången toast och fokus. Den samlade omstartskedjan provas
inte separat vid varje CSS-mått eller öppningsordning; en kombinationsbugg
specifik för en annan konfiguration kan därför undgå referensen.
[Kontrastmätningens sex hjälpprov](../../tests/browser/accessibility-measurements.test.tsx)
körs i Chromium som tekniskt underlag för beräkningen. De provar
färgtolkning, genomskinliga föräldraytor och avvisning utan opak yta.
De har ingen påhittad UI-procedur; INST-06 och YTA-02 behåller sina egna
browserbaserade kontrastkontroller. SÖK-12 provar separat produktens
kontrast i båda teman; hjälpproven ersätter inte det scenariot.

[Separat kontrollerad röstförberedelse](voice-controls-preparation.md)
anger exakta kommandon, hållna startgränser, syntetiska toner, tekniska
paket/resurser och återställning. Dess publika runner pausar klockan för
manuell inspektion av media- och HTTP-avbrott och återupptar den vid
återanslutning; det är inte naturlig förlupen tid. Varje tekniskt scenario
har `seed-family`-underlag vid 320 × 250 och tomt underlag vid 1280 × 900;
tomt underlag i kort vy och `seed-family` i hög vy provas inte oberoende. De två
scenarierna ger fyra tekniska prov. De flyttade felkommandona och
TAL-11:s ljudaktivitet med mikrofonen av har egna publika prov med fullständig
start, återställning och städning. ROSTFEL-01/05–08,
HJALP-07–10 och TEXTBRICKA-06–08 har egna funktionella motsvarigheter.
HJALP-06/07/10 använder Chromium med hushållskartan, produktionsstilar,
publika kontroller, kontrollerade samtalssvar och medieströmmar samt
fullständig resursstädning. HJALP-07 behåller grov pekare och tangentbord;
HJALP-06/10 behåller båda bredderna och ändrad rörelseinställning.
HJALP-01:s tillgänglighetsväxling och mikrofon av samt TAL-14:s röstsignal
och minskade rörelse behåller riktig HTTP-server. Server-/leverantörskedjan
upprepas inte separat i de tre Chromium-fallen. Fysisk pekskärm och
skärmläsarbesked hör fortsatt till HJALP-11/12.
YTA-13 läser macOS-hjälpen i Chromium med produktens stilmall och kontrollerade
svar. Första macOS-genvägens medgivande provas i MIKROFONTRYCK-09; hela
formulär-, utkast-, samtals- och återkallandekedjan körs i YTA-07 och upprepas
inte oberoende på macOS.
TEXTBRICKA-06/07 använder Chromium med hushållskartan, produktionsstilar och
kontrollerade textsvar för 390 px mörkt respektive 1280 px ljust.
TEXTBRICKA-04/08 behåller hela serverflödet vid 390 px ljust respektive
1280 px mörkt; medgivande och HTTP-flöde körs inte separat i de andra två
kombinationerna.
HJALP-11/12, TEXTBRICKA-09/10 och YTA-14/15 beskriver faktiskt hjälpmedel,
fysisk inmatning eller zoom; syntetisk Chromium etablerar dem inte.
