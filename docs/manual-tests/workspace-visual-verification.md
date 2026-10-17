# Visuell verifiering av arbetsytornas A, C och D

Rapporten är för testare och granskare. Den kompletterar
[krav- och flödeskartan](workspace-verification.md) med faktisk jämförelse
mot de låsta referenserna. Den ersätter inte områdesmanualernas steg,
offentliga funktionsprov eller fysisk tillgänglighetsverifiering.

## Källa och metod

Produktionsbilderna gäller den rena versionen
[`07f31e9cd1c957999cf223d55463d119a00a1fe3`](https://github.com/viscalyx/skyttel/tree/07f31e9cd1c957999cf223d55463d119a00a1fe3),
med `src`-trädet `43ddca812c97e9c650aa3b2227cedbe24f1cd758`.
Källversionen kontrolleras före och efter bilderna. Dokumentationen ändrar
inte den källan. Bildtagningen använder Playwrights Chromium på Linux,
verklig offentlig HTTP och SQLite med endast påhittade hushållsuppgifter.

- [A](https://github.com/viscalyx/skyttel/tree/d28a1f94b10d3d5dc98410933667ab320be5d908):
  14 obligatoriska konfliktfall vid 1280 × 900 och 320 × 640 CSS-pixlar.
  Produktion och faktisk referens har vardera 52 observationer och
  132 bilder: grundläge och bekräftat resultat samt bilder av valda
  förhandsresultat för 12 fall.
- [C](https://github.com/viscalyx/skyttel/tree/cc0410566b7056bcd6b1fec2d940620a0eab3be7):
  12 produktionskontrollpunkter vid 1280 × 900, 320 × 640 och 844 × 390:
  36 observationer och bilder. Referensen har 11 punkter vid samma storlekar,
  33 observationer och bilder; produktionens ingång är extra inramning.
- [D](https://github.com/viscalyx/skyttel/tree/19f18f7ecaafbe87b6944284992402d8abdd46b0):
  27 produktionskontrollpunkter vid 1280 × 900 och 320 × 640:
  54 observationer och bilder. Referensen har 26 punkter vid samma storlekar,
  52 observationer och bilder; produktionen visar rubrikikoner separat.

Den angivna versionen är byggd och samtliga produktionsbilder tagna på
nytt efter rättelsen av samtalets avbrytningar. Oberoende genomgång
av samtliga 142 nya produktionsobservationer, 137 faktiska
referensobservationer och 216 uppmätta radattribut är utförd.
De 137 referensobservationerna behåller sina faktiska låsta källor.
Deras identiska texter bedöms med det bevarade jämförelseunderlaget;
referenserna tas inte på nytt i denna bildtagning.
Alla 439 förväntade bildfiler finns och har giltiga PNG-signaturer.
Upprepade vybredder grupperas utan att utelämna tillstånd.
Text, radmarkering, valram, riktning, läsläge och resultat jämförs.
Alla uppmätta observationer och radattribut är identiska med föregående
bildtagning när endast källmetadata tas bort.
214 av 222 produktionsbilder är identiska med föregående bildtagning.
Alla åtta ändrade bilder öppnas med sina åtta föregående bilder och åtta
låsta referenser. Tre kritiska referenspar och A02:s åtgärdspar öppnas
också: totalt 32 faktiska bilder. Övriga bilders existens och PNG-format
kontrolleras; varje pixel bedöms inte separat. De tre visade
produktionsbilderna nedan är identiska med både nya och föregående
råbilder. Bilder kan visa en avsiktligt rullad del av dialogen; en rubrik
utanför bilden bevisar inte att rubrik eller kryss saknas.
Fullständiga verkliga uppgifter kräver mer rullning än korta exempel.

A01:s nya mobilbild av åtgärderna visar en tom, fyrkantig färgad yta.
Den föregående bildtagningen och låsta referensen visar knappens etikett
och rundade hörn. A02:s motsvarande nya bild är också tom; det gäller
även dess föregående bild och låsta referens. I båda fallen är uppmätt
knapptext fortfarande **Lägg valen i utkastet**. Den underliggande
orsaken är okänd. Bildskillnaden fastställer inte att kontrollens
tillgängliga text saknas i applikationen. Ett äldre separat A01-prov
efter två bildrutor förklarar inte de nuvarande A01/A02-bilderna.
Ursprungliga bilder bevaras. Underlaget bevisar därför inte läsbarhet
eller kontrast hos varje kontroll; inga nya åtgärdbara visuella
funktionsfel fastställs inom denna avgränsade genomgång.

De vanliga A/C/D-storlekarna använder inte läsytans regel för fönster
högst 700 × 320 CSS-pixlar. Bildskillnaderna tillskrivs inte den regeln.
Två bevarade diagnosbilder med verkligt DejaVu Sans vid 320 × 250 visar
den klippta Samband-knappen och hela knappen efter rättelsen på `d3474ed`.
De är historiskt underlag, inte nya bilder på `07f31e9`, och räknas inte
bland de 32 öppnade bilderna ovan. Produktionsregeln ändras inte.
Det fullständiga navigationsprovet kontrollerar hela knappens plats inom
läsytans rullningsgränser, fönstret och fem faktiska pekträffar.
Notisens text och kryss samt navigationen behålls.
Det ursprungliga GitHub-felets typsnitt och exakta orsak är inte fastställda.
Pekprovet använder emulering och är inte fysisk telefonverifiering.

## A:s 14 obligatoriska fall

Referensnamnen nedan identifierar fallen. Verkliga syntetiska objekt och
aktörer används i produktionsproven; namn eller sparanden uppfinns inte
för att få produktionen att likna prototypens exempeldata.

<!-- markdownlint-disable MD013 -->
| Fall | Referensens namn | Faktiskt jämfört beteende |
| --- | --- | --- |
| 01 | Familjens bil | Oberoende egenskapsval för objekt, blandade sidor och sammansatt resultat; faktisk Lo Lind |
| 02 | Alex använder bilen | Sambandets riktning och namngivna ändpunkter; faktisk Lo → Molnmusik |
| 03 | Gamla cykeln | Borttaget sparat objekt, fullständigt förslag i läsläge och förvald privat borttagning |
| 04 | Garaget | Egen föreslagen borttagning mot nyare sparade fakta, aktivt val och privat resultat |
| 05 | Gamla lägenheten | Nytillkommet samband; objektets och sambandets borttagning väljs oberoende |
| 06 | Lo använder surfplattan | Saknad ändpunkt, historiskt namn, läsbar jämförelse och uttrycklig borttagning av förslaget |
| 07 | Alex använder musiktjänsten | Dubblett med fullständiga värden; endast förslaget tas bort och befintligt samband behålls |
| 08 | Fordon | Ändrad objekttyp med fullständiga egenskaper, aktiva val och valt/bekräftat resultat |
| 09 | Använder | Ändrad sambandstyp med båda riktningarnas etiketter och hela definitionen |
| 10 | Solcellsanläggningen | Ändrad datatyp; exakt hänvisning till vanlig objektdialog utan konfliktfönstrets redigering |
| 11 | Vindsförrådet | Saknad objekttyp; hänvisning till Inställningar eller uttrycklig privat borttagning |
| 12 | Lo använder gamla bilen | Borttaget sparat samband, fullständigt historiskt förslag och exakt privat borttagningsresultat |
| 13 | Förvaras i | Borttagen, privat ändrad definition; granskad återställning av faktisk identitet och separata uppgifter |
| 14 | Alex använder reservdatorn | Saknad sambandstyp; exakt hänvisning till Inställningar och vanlig sambandsdialog |
<!-- markdownlint-enable MD013 -->

Samma konfliktlista, ram, jämförelsekolumner på dator och stapling på mobil
behålls. Överlappande ändringar är bärnstensfärgade, oberoende ändringar gröna
och identiska värden dämpade. Valda värden har ram och markering.
Faktiska aktörer och sparade tidpunkter bestämmer vem som anges ha ändrat
underlaget. Alla 12 bekräftbara fall har rätt resultat och **Nästa konflikt**;
fall 10 och 14 kräver extern rättelse och har ingen intern bekräftelse.
Flerkonfliktsnavigationens verkliga privata effekter provas separat i
[UTKAST-78](drafts.md#utkast-78-gå-till-nästa-verkliga-konflikt-efter-bekräftelsen).

Alla 28 grundobservationer saknar horisontell överströmning i den mätta
artikeln. Det är en avgränsad observation, inte ett påstående om hela sidan.
Separata rader för definitionen i valt och bekräftat resultat bevarar namn,
beskrivning, riktningar, avsnitt och fält på båda vybredderna.
[UTKAST-67](drafts.md#utkast-67-återställ-en-borttagen-objekttyp-genom-privat-granskning-och-sparande)
och [UTKAST-140](drafts.md#utkast-140-återställ-en-borttagen-sambandstyp-med-läsbara-riktningar)
provar definitionstypernas fullständiga värden och verkliga privata
bekräftelse före separat gemensamt sparande och läsning efter omstart.

Borttagna posters förslag visas som statiska fullständiga läsvärden,
inte som nedtonade avaktiverade valknappar. Uppgifterna ska vara läsbara
men kan inte väljas. Skillnaden innebär inte nya
redigeringsmöjligheter eller genomförd kontrastverifiering av hela appen.

### Bevarat bildpar: återställd definition vid 320 CSS-pixlar

[Produktion](workspace-evidence/a-restoration-production-320.png) visar
alla fem separata uppgifter i en verklig fullständig sambandstyp.
[Referens](workspace-evidence/a-restoration-reference-320.png) visar sitt
kortare simulerade resultat. Båda behåller ram, typnamn, resultat och
**Nästa konflikt**. Referensens prototypkontroller är demonstrationsyta
utanför den produktionsjämförelsen.

## C:s tabell, sökytor och vanliga formulär

<!-- markdownlint-disable MD013 -->
| Kontrollpunkter | Faktisk jämförelse och avgränsning |
| --- | --- |
| Ingång, tabell och fullständiga rader | Ljus ram, fem kolumner, etiketter, lodräta värdeavskiljare och radåtgärder; kollapsad tabell och separat expanderad Cykel motsvarar referensens expanderade exempel |
| Tabellens filter | 800 CSS-pixlars datorram, mobilens hela vybredd, exakt rubrik, förklaring, kryss, kryssrutor bredvid etiketter och resultatknapp; verkligt antal typer ger mer rullning |
| Formulärrubrik och Grunduppgifter | Vitt formulär, blågrå kant, dämpad bakgrund och initialt öppet Grunduppgifter |
| Egna fält, Ekonomiska uppgifter och Utseende | Fyra dragspelsavsnitt totalt; verkliga kännedomslägen och ikonval ingår, även när referensen visar kortare exempel |
| Formuläråtgärder | Båda exakta knapparna för tillägg i utkastet och mobil stapling; vid 844 × 390 rullas hela modalen till åtgärderna |
| Sambandsläsning och kartans sökyta | Sparade/föreslagna värden, riktning, saknat/okänt och faktisk giltighet; samma ordinarie formulär, sökutseende och verkliga filter |
<!-- markdownlint-enable MD013 -->

Expanderad läsning visar **Ramnummer**, **Sparat: Ej uppgivet** och
**◇ Ditt förslag: RAM-2026-42** på alla tre storlekarna. Ett historiskt
saknat fält får ingen etikett med `undefined`.
Hela offentliga delade och privata karttillståndet är oförändrat efter
C:s bildflöde. De tre avsiktligt horisontellt rullbara tabellregionerna
rapporterar överströmning; detta redovisas som tabellinnehåll, inte som
noll överströmning på hela sidan. Övriga 87 mätta C/D-mål saknar
horisontell överströmning.

### Bevarat bildpar: filter vid 320 CSS-pixlar

[Produktion](workspace-evidence/c-filter-production-320.png) och
[referens](workspace-evidence/c-filter-reference-320.png) visar kryssrutor
bredvid sina etiketter och fast resultatknapp. Produktionens fler typer
och tre träffar motsvarar dess faktiska provdata; referensen har färre typer
och 61 träffar. Det är inte samma dataset. Krysset syns i båda bevarade
bilderna; målbildens rullning bedöms separat från kontrollens existens.

## D:s fyra kolumner, fulla läsare och stödmodaler

D:s 27 punkter omfattar rubrikikoner, fyra kolumner, sju läsare vardera
vid rubrik, kropp och sista värde samt beroendeborttagning, hela utkastets
borttagning och väntande/oklart sparande.

<!-- markdownlint-disable MD013 -->
| Läsare | Faktiskt produktionsförslag | Referensens motsvarande presentation |
| --- | --- | --- |
| 1 | Ändrad Alex blå cykel | Ändrad Blå bilen, två kolumner för ändringar |
| 2 | Ny cykel | Ny Alex cykel, fullständigt förslag |
| 3 | Borttagen Gamla cykeln | Borttagen Gamla bilen, sparade värden |
| 4 | Ändrad Alex → använder → Alex blå cykel | Referensens rad 4 är ett nytt samband; samma läsutseende kombineras med verklig ändringslayout |
| 5 | Nytt Alex → använder → Ny cykel | Referensens nya samband på rad 5 |
| 6 | Ändrad Fordon-definition | Referensens ändrade Fordon i hushållet-definition |
| 7 | Ny Förvaras i-definition | Referensens nya Använder-definition |
<!-- markdownlint-enable MD013 -->

Referensen har två nya samband och inget separat ändrat samband.
Produktionsläsare 4 är därför inte samma förslagskategori som referensrad 4.
Den visar två kolumner, sparat **Bekräftat**, föreslaget **Osäkert uppgivet**
och fullständiga dolda svar. Den skillnaden redovisas, inte döljs.

De fyra exakta kolumnerna, pennans bärnstensfärg, grönt plus, rött kryss,
separata röda borttagningsikoner och rubrikens spar- och borttagningsikoner
behålls. Dator delar samtal och utkast; mobil staplar dem.
Läsarna har vita ytor, blågrå avskiljare och markerade ändrade värden.
Mobilens sju sista-värde-bilder visar faktiskt slutvärde, inklusive daterad
osäker kredit, dolda svar och hela fältdefinitioner. Rå **Status** skiljs
från effektivt **Gäller**, och objektets identifiering är läsbar.

Beroende och hela utkastets borttagning har varning, lista, kryss och röd
bekräftelse. Avbrott bevarar hela det offentliga karttillståndet.
Sparbilderna håller en verklig begäran och avbryter den **före vidarebefordran**
med `route.abort()`. De visar väntande/oklart UI och bevarat utkast, inte
ett genomfört sparande med tappat svar. Den senare återhämtningen provas
separat i UTKAST-38 och sparkontrollen, där `route.fetch()` genomför
serverbegäran innan svaret tappas. Prototypens simulering bevisar inget
beständigt sparande.

### Bevarat bildpar: fyra kolumner vid 320 CSS-pixlar

[Produktion](workspace-evidence/d-summary-production-320.png) och
[referens](workspace-evidence/d-summary-reference-320.png) visar samma fyra
kolumner, förslagssymboler och separata borttagningsikoner. Längre verkliga
sammanfattningar rullas i produktionen. Referensens **Prototypkontroller**
är inte produktionsfunktioner. Samtalsnotisen finns i båda bilderna;
bildparet bevisar inte läsning av alla sju förslag eller deras lagring.

## Gränser för slutsatsen

Denna jämförelse omfattar angivna tillstånd och storlekar i Chromium.
Den säger inte att varje pixel eller varje kontroll samtidigt får plats
i alla rullade bilder. Bildtagning och inställningssimulering är inte
kontroller av fysisk touch, installerad Chrome, skärmtangentbord, NVDA,
VoiceOver, iPhone, iPad, faktisk 200/400-procentig webbläsarförstoring
eller systemets kontrastläge. Sådana prov är **INTE UTFÖRDA**.
Fullständig WCAG-överensstämmelse kan inte fastställas av dessa bilder.
