# Verifiering av den samlade kartupplevelsen

Rapport för [#151](https://github.com/viscalyx/skyttel/issues/151), granskad
mot [#121](https://github.com/viscalyx/skyttel/issues/121), de bindande
[återstående proven i #107](https://github.com/viscalyx/skyttel/issues/107#issuecomment-5848370279)
och [helhetsbeslutet i #109](https://github.com/viscalyx/skyttel/issues/109#issuecomment-5848795499).
Nya resultat gäller källversion `15b1424b8624b1dcb62fe70717522d517fdd862b`
och källträd `733878dcc1588f71ae4978380dd372d483559558`, om inget annat anges.
Dokumentationsändringar efter provet ändrar inte den provade applikationen.

## Sammanhängande arbete och resultat

[ARBETE-08 och ARBETE-09](household-work.md) är två hela, obrutna fall i
[connected-work.spec.ts](../../tests/integration/connected-work.spec.ts).
Båda börjar med synlig Google-inloggning och hushållsstart, och använder en
andra oberoende Microsoft-klient som bjuds in genom det verkliga gränssnittet.
Leverantörernas svar och modellens text/tal är kontrollerade ersättningar;
applikationsserver, HTTP-anrop, sparande och tillfällig SQLite-databas är verkliga.

Alex föreslår **Familjens Molnmusik**, **179 SEK per månad**, genom text.
Röstfallet använder en kontrollerad transkription för **Kim Exempel**, medan
textfallet skriver motsvarande uppdrag. Verktygen hämtar den faktiska
katalogen och använder faktiskt återlämnade identifierare och versioner för
Kim, abonnemanget och sambandet **Kim Exempel → Betalar → Familjens Molnmusik**.
Alex rättar priset till **189 SEK per månad** och beskrivningen till
**Rättad för hand**, behåller Kims oskickade formulärtext och samtalets
oskickade text samt hela dialogen genom Inställningar.

Samma anslutning och levande mikrofonspår pausas och återupptas i röstfallet.
Ett uttryckligt sparande ger exakt två objekt, ett samband, ett faktiskt
beständigt kvitto och ett tomt Alex-utkast. Oskickad formulärtext och Robins
privata notering ingår inte. Efter avslutade mediespår och omstart med samma
databas läses hela kvittot genom **Lista → Visa historik → Visa ändringarna**.
Robin ser de gemensamma värdena och sitt eget privata arbete, medan Alex nya
privata rättelse förblir privat åt båda hållen. Oskickad text provas före
omladdning; fallet lovar inte att sådan text överlever avsiktlig omladdning.

Textalternativet framkallar faktisk förlust av WebGL-kontext hos båda
klienterna, även efter omladdning, och använder listor, formulär och text.
Det begär varken mikrofon eller ljuduppspelning. Samtliga 113 ursprungliga
assertioner och hela de åtta stegen finns kvar i presentationskörningarna.

<!-- markdownlint-disable MD013 -->
| Prov | Faktiskt resultat | Provad källversion |
| --- | --- | --- |
| Hela ARBETE-08/09 vid 1280, 390 och 320 pixlar, ljust/mörkt/System | 18 godkända hela flöden, 2,4 minuter | `15b1424` |
| Samma hela flöden vid faktisk 200/400 %, ljust/mörkt/System | 12 godkända hela flöden, 1,8 minuter | `15b1424` |
| Åtta kompletta fall för Inställningar, 320 pixlar, ljust/mörkt | 16 godkända hela flöden, 37,4 sekunder | `c57c714` |
| Samma fall för Inställningar vid faktisk 400 %, ljust/mörkt | 16 godkända hela flöden, 37,6 sekunder | `c57c714` |
| Tom karta: riktig Tab-följd, fokus och hela höjdhjälpsetiketten | 2 godkända teman vid 320 × 900; ingen vågrät rullning behövs | `15b1424` |
| Exakt återgivning av kartans uppmätta etikettloop | Godkänd vid faktisk 200 %; nio mätvarv med stabil yta, inga webbläsarfel | `15b1424` |
| Berörda ordinarie kart-, fokus-, placerings- och familjefall | 35 godkända webbläsarfall, inklusive 500 objekt och 1 500 samband | `15b1424` |
| Fullständig `CI=1 npm run check` | Godkänd: 1 102 publika fall i 83 filer, 409 webbläsarfall, 138 projektkontroller, 90,17 % grentäckning; typer, format, 158 dokument och byggning godkända | `14818c5` |
| Samtliga nio oförändrade containerfall | 9 av 9 godkända med oförändrade kontroller | `14818c5` |
<!-- markdownlint-enable MD013 -->

Proven för Inställningar är ACCESS-09, AI-03, AI-13, MEDLEM-08, RADERING-07,
RADERING-11, IMPORT-21 och KOST-04. De behåller samtliga 208 ursprungliga
assertioner. Deras faktiska resultat ligger kvar på `c57c714`: senare
produktändringar gäller den synliga tomma kartan och kartans etikettplacering.
Källfilerna för Inställningar, återhämtningsregler, statusyta och formulär
är oförändrade.
Kartåtergångens tidigare observation gäller formuläret, inte ärvd
etikettgeometri; alla nya kartflöden ovan körs om på `15b1424`.

`3d928fe` ändrar endast testets sökningar efter reglage i ikonfallet.
`14818c5` öppnar de synliga statusdetaljerna i BILD-05 före samma kontroll
av spärrat sparande. Applikationen och samtliga 85 byggfiler är identiska
med presentationsprovet på `15b1424`. Inga gamla bilder får en ny källversion.

[Maskinläsbara mätningar](connected-experience-evidence/measurements.json)
innehåller varje matrisfall, faktisk källversion, webbläsare, vy, zoom,
kontrastprov och uttryckligen omätta observationer. De fyra matriserna ger
1 416 icke-tomma vybilder, inklusive upprepade vyer. Det är automatiserad
bildkontroll; inte 1 416 separata mänskliga bildgranskningar.
[Bildunderlaget](connected-experience-evidence/images.json)
anger ursprung, bildmått och kontrollsumma för nio oförändrade originalbilder.

## Presentation, referens och tillgängliga alternativ

Referensen är den godkända versionen
`87ddb0128e25eb5982e7dd910159f628e8ed0703`. Senare beslut om kartgester och
separata inställningssidor har företräde framför tidigare prototypalternativ.
De nya bilderna visar verkliga användarflöden och hushållsdata; prototypens
inloggnings- eller lagringskopior används inte för funktionella slutsatser.

Jämförelsen omfattar referensens **D-dark-dator-karta**, **B-fria-paneler-dator**,
**D-gront**, **D-mobil** för samtal samt **D-dator/D-mobil** för Inställningar.
Kartans mörka hela bakgrund, vänstra verktygsfält på dator, kompakta verktyg
på telefon, avrundade arbetspaneler och tydliga privata förslag motsvarar
underlaget. Piktogram och fristående namn följer det senare kartunderlaget
**A-flerval** från #105, inte de äldre stora objektkorten. De nya
familjebilderna visar verkliga namn, rättade ekonomiska uppgifter, bevarade
separata objektpaneler och samtalets beständiga kvitto.
Överlappande fria skrivbordspaneler är avsiktliga; den aktiva panelen och
panelen som väljs genom **Öppna paneler** ska vara nåbara.

Samtalsreferensens privata förslag, mikrofontillstånd och uttryckliga
helhetssparande jämförs med samma faktiska två objekt och ett samband.
Produktens kompletta dialog, frågor, fel och kvitto ger mer innehåll än
prototypens exempel. Mobilens panelväljare visar en aktiv arbetspanel i taget
utan att kasta de övrigas text. Textfallet behåller motsvarande arbete när
grafiken faktiskt förloras; listor och formulär är det synliga alternativet.

Inställningsreferensens huvudsakliga rubrik, sidnavigation och innehåll
jämförs med den nya separata sidan i båda teman och vid verklig förstoring.
Den bevarade samtalsstatusen har en egen begränsad rullningsyta nedanför
innehållet. På den korta 400-procentsvyn syns bara en del av varje rullningsyta
samtidigt; offentliga kontroller och fokus provas genom faktisk rullning.
Utvidgade detaljer öppnas med ett uttryckligt val. Den ursprungliga
avvikelsen med hela samtalsarbetsytan ovanför inställningsrubriken är rättad,
liksom oläsbara mörka statusfält och text under stängknappen.

Skillnader som följer senare bindande beslut är avsiktliga: kartklick väljer
objekt enligt #105, medan **Uppgifter** öppnar detaljer; #108 ersätter äldre
inställningspaneler med helsidan. Produktens riktiga behörigheter, kvitton,
återhämtning och fullständiga prisuppgifter ersätter prototypens simulerade
exempel enligt #107/#109. Jämförelsen innebär inte pixelidentiska bilder,
fysisk enhetsverifiering eller ett nytt godkännande av designen.

Mätningarna använder verklig Chromium-zoom genom tilläggets
`chrome.tabs.setZoom/getZoom` i båda medlemmarnas separata webbläsarkontexter.
En grundyta på 1280 × 1000 ger uppmätt 640 × 500 vid 200 % och 320 × 250
vid 400 %. CSS-zoom, ändrad pixeltäthet och beskurna helsidesbilder används
inte som ersättning. Varje bild är en kontrollerat icke-tom bild av den
faktiska webbläsarvyn. Referensbredderna är 1280, 390 och 320 vid höjd 900.
Ljust, mörkt och System väljs genom den riktiga temakontrollen. Systemproven
ändrar faktiskt emulerad operativsystemspreferens och kontrollerar samma fokus.

Tangentbordsproven bevarar den ursprungliga inloggningsföljden och provar
synliga fokusmål efter panel- och sidbyten. Rubriker som bara är semantiska
meddelanden redovisas separat från synliga tangentbordskontroller. DOM-ordning,
etiketter och panelväljare registreras, men är inte ett skärmläsarprov.
Proven för Inställningar kontrollerar fokuserade reglage mot samtliga verkliga
klippande föräldrar och håller innehåll och statusyta åtskilda i höjdled.
De extra namngivna fokuskontrollerna är inte en fullständig sekventiell Tab-ordning.

Textkontrast mäts för stödda faktiska färger och bakgrunder, med 4,5:1 för
normal text och 3:1 för stor text. Bakgrundsbilder, genomskinliga föräldrar,
inaktiverade reglage, helt klippta beskrivningar och klippt eller övertäckt
text redovisas uttryckligen som omätta där metoden inte räcker. Text utanför
en rullningsyta räknas inte som läsbar. Små reglage under 24 pixlar är
observationsflaggor; associerade etiketter och avstånd behöver vägas in.
Punktvisa träffprov bevisar inte att varje tecken eller hela målet är synligt.

Utvalda originalvyer för jämförelsen:

- [Gemensam karta på dator](connected-experience-evidence/map-desktop.png)
  och [bevarade fria paneler](connected-experience-evidence/retained-panels.png).
- [Samtal på mobil](connected-experience-evidence/conversation-mobile.png),
  med sparbesked och fortsatt röstläge; mer dialog nås genom rullning.
- [Inställningar på mobil](connected-experience-evidence/settings-mobile.png)
  och [den faktiska 400-procentsvyn](connected-experience-evidence/settings-400.png).
- [Historik utan grafik vid 400 %](connected-experience-evidence/history-text-400.png),
  med verklig öppnad ändringsgrupp; bilden visar en del av dess innehåll.
- [Importens serverresultat](connected-experience-evidence/import-result.png)
  och [raderingens samma ärende](connected-experience-evidence/erasure-recovery.png),
  båda med separat kontrollerat lagringsfel.
- [Tom karta med tangentbordsfokus](connected-experience-evidence/empty-map-keyboard.png),
  där höjdhjälpens hela etikett och reglage ryms utan vågrät rullning.

De frysta bildägarna finns i den godkända versionens
[kartreferens](https://github.com/viscalyx/skyttel/tree/87ddb0128e25eb5982e7dd910159f628e8ed0703/src/client/visual-prototype-assets),
[fria paneler](https://github.com/viscalyx/skyttel/tree/87ddb0128e25eb5982e7dd910159f628e8ed0703/src/client/navigation-prototype-assets),
[samtal](https://github.com/viscalyx/skyttel/tree/87ddb0128e25eb5982e7dd910159f628e8ed0703/src/client/voice-study-assets)
och [Inställningar](https://github.com/viscalyx/skyttel/tree/87ddb0128e25eb5982e7dd910159f628e8ed0703/src/client/admin-study-assets).

## Konkreta uppföljningar från #107 och #109

Tabellen anger de verkliga produktfall som ingår i slutkontrollen. De
kontrollerade externa tjänsterna och felfallen är avgränsade som ovan;
prototypens exempel ersätter inget av dessa flöden.

<!-- markdownlint-disable MD013 -->
| Tidigare lucka | Konkret prov och avgränsning |
| --- | --- |
| Stor karta och listalternativ | [STORKARTA-01](large-map.md) skapar 500 objekt och 1 500 samband, provar läsbara etiketter och når samtliga sidor i båda listorna, rättar ett objekt och återläser efter omstart. Det täta mobilfallet [RYMD-09](spatial-map.md) prioriterar valda namn och separata mål vid 390/320; det lovar inte att alla etiketter ryms samtidigt. |
| Stjärnhimmel och personlig vy | [De publika webbläsarfallen](../../tests/browser/spatial.test.tsx) provar faktiskt målade stjärnpixlar vid panorering, rotation och zoom samt oförändrad bakgrund när ett objekt flyttas. [PLACERING-04/07](personal-view.md) provar sparade val, reducerad rörelse, vybyte och omstart. |
| Samlad dialog, textalternativ och kvitto | De två hela [ARBETE-08/09-fallen](household-work.md) provar samma privata förslag, rättelse, bevarat arbete, uttryckligt sparande, verklig historik efter omstart och tvåvägsisolering. Referens- och zoommatriserna upprepar hela förloppet för båda medlemmarna. |
| Konflikter och nya val | [UTKAST-17–24](drafts.md) går från synlig status till samtliga konflikttyper, bevarar oskickade och oberoende värden och kräver nytt uttryckligt sparande. Sena och förlorade svar provas med verkliga operationer. |
| Historik, upphörande och återställning | [HISTORIK-01–09](history.md) och [LIVSCYKEL-01–06](lifecycle.md) visar tidigare fullständiga värden, överlappningar, upphörda objekt/samband och återställning utan underförstått sparande. |
| Sammanfogning och ofullständig kunskap | [SAMMANSLAGNING-01–07](object-merge.md) provar uttryckliga identiteter och kantval, kompletta värden, oskickat deltagararbete samt återhämtning efter förlorat svar. [AVTAL-05](contracts.md) håller skilda roller och identiteter samt rättar blockerande okända ändpunkter. |
| Administration, kvitton och lås | [Åtkomst](access.md), [medlemskap](membership.md), [export](household-export.md), [import](household-import.md) och [radering](household-erasure.md) använder verkliga roller, exakt ärendeidentitet, lås och status. De åtta kompletta fallen för Inställningar omfattar kopplad inloggning, samtycke, profil, inbjudan, två raderingsfall, import och kostnader vid 320 pixlar och faktisk 400 %. |
| Lagringsfel vid återhämtning | [RADERING-11](household-erasure.md) och [IMPORT-21](household-import.md) skiljer kontrollerade lokala Storage-fel från verkligt serverresultat, blockerar nya destruktiva anrop före sparad återhämtningsidentitet och återförsöker samma ärende. |
| Fullständiga kostnadsuppgifter | [KOST-01–04](costs.md) provar separata kostnader, månadsantaganden, åtkomst, samtliga prisdetaljer, versionshistorik och återhämtning av okänt sparresultat. KOST-04 upprepas i hela matrisen för Inställningar. |
<!-- markdownlint-enable MD013 -->

## Rättelser och bevarade felresultat

Rättelserna omfattar avgränsade produktändringar: hopplänkar har läsbara
temafärger; Inställningar har primär rubrik, navigation och innehåll med
kompakt bevarad samtalsstatus; statusdetaljer går att öppna med avsikt;
redigerings- och utkastlänkar återvänder till rätt synliga kartpanel;
**Skyttel talar** och övrig röstaktivitet förblir synliga; statusytans
färger och höjd fungerar med den egna rullningsytan, och dess stängknapp
täcker inte statusmeddelandets text. Samma monterade samtal,
anslutning, utkast, dialog och oskickade formulär bevaras. Tomma smala
kartor håller visningsreglagen ovanför startkortet i ett gemensamt
rullningsflöde. En stabil plats för etikettinformation bryter den uppmätta
växlingen mellan dold och synlig information som annars kan tömma sidan
vid övergång till Lista; det synliga antalet dolda etiketter förblir aktuellt.

Rättelserna omfattar också korrekt besked när nekad webbläsarlagring
stoppar import eller radering. [RADERING-11](household-erasure.md)
och [IMPORT-21](household-import.md) provar kontrollerat framkallade
lagringsfel vid
webbläsarens Storage-gräns mot riktiga serverärenden. Undantagen styrs i
provet; faktisk lagringskvot eller webbläsarpolicy är inte verifierad. Ett nytt
destruktivt anrop blockeras innan det skickas om återhämtningsuppgifterna
inte kan sparas. Ett redan
läst serverresultat behåller sin verkliga status och identifierare. Användaren
kan återförsöka samma åtgärd när lagring fungerar. Guiderna beskriver att
sidan ska hållas öppen och att återhämtning efter omladdning inte garanteras
medan felet kvarstår.

Tidigare underkända körningar, spår och bilder är bevarade. Fel i observationerna
har hållits skilda från produktfel: normaliserade färgformat, klippta
semantiska beskrivningar, pekarfokus kontra tangentbordsfokus, kompakt
panelnavigation samt föräldrar med `display: contents`. Ingen ursprunglig
assertion, tidsgräns, arbetarmängd eller täckningsgräns har sänkts.
Den tidigare fullkörningen på `1116e95` avbröts med signal efter 70 godkända
webbläsarfall, utan komplett svitresultat. Orsaken är okänd; två separata
210-sekunders processprov kunde inte reproducera en antagen 180-sekundersgräns.
Den körningen är ofullständig och räknas inte som godkänd slutkontroll.

Fullprovet på `15b1424` stannar i ett ikonfall efter den ordinarie
femsekundersgränsen: 1 101 andra publika fall är godkända. Det fokuserade
provet reproducerar inte tidsgränsfelet. Mätning visar onödigt breda
sökningar efter reglage; `3d928fe` avgränsar dem till de verkliga verktygs-,
list- och objektpanelerna. Samtliga fem hela testkroppar, teckeninmatningar,
assertioner och tidsgränser är oförändrade. Tidsmätningen fastställer inte
orsaken till den första fullkörningens timeout; slutresultatet ovan avser
hela den nya körningen.

Fullprovet på `3d928fe` ger 1 102 godkända publika fall och 406 godkända
webbläsarfall. BILD-05 vid tre bredder stannar vid en dold sparknapp i
Inställningars avsiktligt kompakta status. `14818c5` öppnar **Visa samtals-
och utkastdetaljer** innan samma kontroll av spärrat sparande. Alla elva
hela bildarbetsfall är godkända med detta offentliga steg. De tre
ursprungliga felspåren finns kvar; inga produktregler eller tidsgränser ändras.

## Tidigare underlag och dess avgränsning

De 29 föregående delärendena är accepterade vid utgångsversionen `c555ab8`.
Dess källträd motsvarar det tidigare fullprovet på `5081076`: 1 095 publika
fall, 402 webbläsarfall, 138 projektkontroller, 90,07 % grentäckning och
nio containerfall. Dessa historiska antal ersätter inte ovanstående slutprov.

Presentationsunderlagen behåller sina faktiska versioner: #145 på `f54124c`
med 48 referensflöden och 32 zoomflöden; #146 på `3406c674` med tolv och åtta;
samt #149 på `dbb138d` med sex och fyra, plus ett mörkt 400-procentsflöde med
fullständiga identifierare. #146 förstorar bara administratörens sida.
Frysta prototypkörningar är separat underlag. Den ändrade ytan för
Inställningar gör att tidigare placering och överlappning inte kan ärvas
generellt; de åtta
nya hela representationsfallen provar berörda sidor och nya lagringsfel.
Oförändrade kart- och serverregler stöds av den slutliga hela sviten och
avgränsad källjämförelse, utan att gamla bilder ges en ny versionsetikett.

## Miljöer och återstående begränsningar

<!-- markdownlint-disable MD013 -->
| Miljö eller förmåga | Faktiskt resultat och avgränsning |
| --- | --- |
| Lokal Linux arm64, Chromium 153.0.8010.12 | Verklig webbläsare, applikationsserver och tillfällig SQLite; ovanstående automatiserade flöden. CDP anger Chrome/153.0.8010.12. |
| 1280, 390 och 320 pixlar samt System | Ändrade fönsterbredder och faktisk emulerad operativsystemspreferens; inte fysiska telefoner. |
| Verklig webbläsarzoom | Tilläggsstyrd 200/400 %, uppmätt i båda medlemsklienterna; inte enbart ändrad fönsterbredd. |
| Pekskärm | Emulering i de ordinarie navigationsfallen; ingen fysisk pekskärm. |
| Fysisk Windows-dator med Chrome | EJ UTFÖRT; ingen sådan miljö tillgänglig. |
| Fysisk macOS-dator med Chrome och dess gester | EJ UTFÖRT; Linux-pekaremulering ersätter inte detta prov. |
| Fysisk iPhone med Chrome | EJ UTFÖRT; smalt Chromium-fönster är inte en iPhone. |
| Fysisk iPad med Chrome | EJ UTFÖRT; ingen sådan enhet tillgänglig. |
| Faktisk skärmläsare, exempelvis NVDA eller VoiceOver | EJ UTFÖRT; semantik, DOM-ordning och tangentbord är avgränsade automatiska delprov. |
| Verkligt svenskt tal, mikrofon och högtalare | EJ UTFÖRT; kontrollerad transkription och syntetiska mediespår visar applikationsförloppet, inte fysisk ljudfunktion eller talförståelse. |
| Verkliga externa Google/Microsoft-konton | EJ UTFÖRT; kontrollerade leverantörssvar går genom det verkliga åtkomstförloppet men bevisar inte externa leverantörers beteende. |

<!-- markdownlint-enable MD013 -->

Proven visar inte fullständig överensstämmelse med WCAG 2.2 AA. Fysisk
utrustning, verkligt svenskt tal, externa konton och hjälpmedel kräver egna
resultat från respektive miljö. Inga nya externa medgivanden, betalda anrop
eller driftsättningar har gjorts.

Bedömningen av ändringarna från `c555ab8` visar ingen ny operatörsåtgärd,
serverkonfiguration, datamigrering, API- eller exportformatändring.
**No operator notes needed for Operator Upgrade Impact.**
Batchens integrationskontroll och oberoende granskning mot den fasta
startversionen `466f5dfb33fc70114587f36360bd0ed406a3e208` redovisas separat
i [#121](https://github.com/viscalyx/skyttel/issues/121). Rapporten avgränsas
till #151 och är inte ett slutligt godkännande av hela #121.
