# Samtal med Skyttel

[Till användarguidens innehåll](README.md)

Välj **Prata med Skyttel** eller **Skriv till Skyttel** i hushållets karta.
**Prata med Skyttel** startar samtalet med mikrofonen, och
**Skriv till Skyttel** startar det med text. Utan giltigt medgivande visas
först [medgivanderutan](#medgivande). Om samtalet inte är tillgängligt
fungerar kartans formulär.

## Medgivande

Skyttel behöver ditt medgivande innan ett samtal startar. Textversion 2
förklarar att tal från långt tryck kan skickas efter släpp, medan ny
inspelning stängs av direkt. Ett sparat medgivande för version 1 behöver
godkännas på nytt. Samma medgivande
gäller röst och text. Medgivanderutan **Samtal med Skyttel** visas när du
väljer en samtalsknapp i verktygsraden, **Tala** eller **Skriv** i kartans
vägledning eller snabblänken **Till samtalet med Skyttel**.

1. Läs texten i rutan. Den säger vad OpenAI behandlar, att Skyttel sparar
   ändringar först när du ber om det och att samtalet inte sparas.
2. Markera **Fråga inte igen för det här hushållet** om du vill spara
   medgivandet. Det gäller då dig i det här hushållet, på alla dina enheter.
3. Välj **Godkänn och starta**. Samtalet startar med röst eller text, efter
   den knapp du valde. **Avbryt** startar ingenting.

Utan kryssrutan gäller medgivandet tills du lämnar hushållets karta eller
laddar om sidan. **Nytt samtal** frågar inte igen. Om
medgivandetexten ändras i sak frågar Skyttel på nytt, även om du har sparat
ett tidigare medgivande. Om rutan säger att medgivandet inte kunde sparas
kan du försöka igen eller godkänna utan att markera kryssrutan.

Du ser och ändrar ditt medgivande på sidan **Samtal med Skyttel**. Öppna
**Inställningar** och välj sidan under **Hushållets karta**. Alla medlemmar
i hushållet har sidan. Under **Medgivande** står medgivandetexten och en
statusrad. Den säger om ett medgivande är sparat och när, om du bara har
godkänt för det här besöket, eller om medgivandetexten har ändrats sedan
du sparade.

- **Spara medgivandet** sparar medgivandet direkt. Inget samtal startar,
  och ett pågående samtal påverkas inte. Nästa gång du väljer en
  samtalsknapp startar samtalet utan att rutan visas.
- **Återkalla medgivandet** tar bort ett sparat medgivande och ett som bara
  gäller besöket. Dina samtal i hushållet avslutas, på alla dina enheter,
  och ditt utkast ligger kvar. Under ett pågående samtal visar en ruta
  hur många osparade ändringar som ligger kvar. Välj **Avbryt** för att
  fortsätta eller **Återkalla och avsluta samtalet** för att bekräfta.
  Ett redan påbörjat sparande slutförs och visar sitt kvitto. Då säger
  rutan **Skyttel sparar ditt utkast. Sparandet slutförs.**.
  Textvyn stängs och samtalstexten töms; oskickad text ligger kvar.
  Nästa gång du väljer en samtalsknapp visas medgivanderutan igen.

Om medgivandet återkallas på en annan enhet avslutas samtalet senast vid
nästa försök att tala eller skicka. En notis säger **Medgivandet är
återkallat. Samtalet är avslutat. Utkastet ligger kvar.**. Hushållets karta
finns kvar. Ett okänt sparresultat går att kontrollera utan att godkänna
samtalsmedgivandet igen.

Utan pågående samtal gäller knapparna direkt. Sidan har ingen knapp för
att spara hela
sidan. En kort text vid knappen säger hur det gick. Om den säger att
medgivandet inte kunde sparas eller återkallas har medgivandet inte
ändrats, och du kan försöka igen. Mikrofonen kan behöva slås på igen
efter ett misslyckat återkallande. När sidan visar
**Samtal med Skyttel är inte tillgängligt just nu.** går det inte att
spara ett medgivande, men du kan återkalla ett som är sparat.

Ett sparat medgivande tas bort när du inte längre är medlem i hushållet.
Om du bjuds in igen frågar Skyttel på nytt. Medgivandet ingår inte i en
[fullständig export](household-export.md) och ändras inte av en
[återimport](household-import.md).

Medgivandet är skilt från cookieval och från andra klienters medgivanden
under **Assistentanslutningar**.

## Håll in för att tala

Ett kort tryck på **Prata med Skyttel** slår på eller av mikrofonen.
När mikrofonen är av kan du också hålla knappen längre än 0,45 sekunder
för att tala tills du släpper. Knappen får en ring medan du håller.
Lyssnandet fortsätter när pekaren eller fingret glider från knappen.
När du släpper är mikrofonen av, och Skyttel talar klart sitt svar.
Ett systemavbrott räknas som att du släpper.

Om röstanslutningen dröjer bevaras det du säger under trycket tillfälligt
i webbläsaren, efter godkänt medgivande och fungerande ljuduppspelning.
Det talet överförs när anslutningen är färdig, även om du redan har släppt.
Släpp stänger av ny inspelning direkt. Om du avbryter starten kasseras
det väntande talet.

Ctrl+Mellanslag på Windows och Linux, och Ctrl+Skift+Mellanslag på macOS,
gör samma sak: tryck kort för att växla på och av eller håll för att tala
tills du släpper. Utan giltigt medgivande visar långt tryck samma
medgivanderuta som kort tryck. Kort tryck räcker alltid, även med
skärmläsare på pekskärm.

## Skriv till Skyttel

**Skriv till Skyttel** öppnar och stänger textvyn. Textvyn visar
samtalstexten och meddelandefältet **Meddelande till Skyttel**.

- På en dator ligger textvyn vid högerkanten och knuffar undan kartan, så
  att du ser ändringarna i kartan medan du skriver. Meddelandefältet får
  fokus när textvyn öppnas.
- På en mobil enhet och en smal skärm får fältet inte fokus av sig självt.
  Tryck i fältet när du vill skriva. På en smal skärm fyller textvyn
  skärmen under verktygsraden, och **Lista** och kartans paneler tar dess
  plats när du väljer dem.
- På en bred pekskärm är textvyn 400 px bred, också på en liggande
  telefon. Kartan syns bredvid. En dator med pekskärm och mus följer
  datorläget; den främsta pekaren avgör.
- När den synliga höjden är under 520 px på mobil enhet eller smal skärm
  blir överkanten en kompakt rad med kontextmätaren, **Utkast** och
  antalet ändringar, **Nytt samtal** och stängknappen. Fältet är en rad
  högt. Rubriken, **Kontext** och fältets etikett finns kvar för
  skärmläsaren. Textvyn följer den del av skärmen som tangentbordet lämnar.
- Skriv ditt meddelande och välj **Skicka** eller tryck Retur. Skift+Retur
  ger en ny rad. Fältet behåller fokus efter att meddelandet har skickats.
- I samtalstexten står det du skriver i en tonad ruta till höger och det
  Skyttel svarar utan ruta. Det du och Skyttel säger med rösten står där
  också. Raden **Skyttel arbetar…** står sist medan Skyttel arbetar.
- **Stäng textvyn** eller **Skriv till Skyttel** stänger textvyn. Samtalet,
  mikrofonen och din oskickade text finns kvar tills du öppnar den igen.
- **Nytt samtal** tömmer samtalstexten och kontexten och stoppar pågående
  arbete. Mikrofonen behåller sitt läge, och ditt
  utkast och din oskickade text finns kvar. Skyttel säger hur många
  osparade ändringar som ligger kvar i utkastet.

På smal skärm står röstrutan ovanför meddelandefältet när textvyn är
öppen. Ingen rad är reserverad för rösten ovanför textvyn.
Kartans återkoppling för utkastet går då att nå genom att rulla i
textvyn, och den täcker inte fältet. När textvyn är stängd står röstrutan
och samtalsnotisen ovanför kartans nedersta rad och dess återkoppling.
Långa samtalsnotiser i ett kort fönster går att rulla utan att fältet
flyttas bort.

## Utkastet i textvyn

**Visa utkastet** ovanför samtalstexten visar antalet osparade ändringar.
Välj knappen för en tabell med symbol, namn, typ och vad som ändras.
Plus betyder nytt förslag, penna betyder rättelse och kryss betyder
borttagning. Objekt, samband och egna typer ingår. Tabellen står till
vänster om samtalstexten på dator och mellan knappen och samtalstexten på
mobil enhet och smal skärm. **Dölj utkastet** fäller ihop den.
Ett utfällt utkast utan ändringar säger **Utkastet är tomt.**

På sidan **Samtal med Skyttel** i Inställningar kan du markera
**Visa utkastet när ett samtal börjar** under **Utkastet**. Valet sparas
direkt och gäller dig i alla dina hushåll, på alla dina enheter. Grundvalet
är hopfällt. Med valet på öppnas ett befintligt utkast när samtalet börjar
och efter **Nytt samtal**. Ett tomt utkast väntar tills Skyttel föreslår den
första ändringen. Att visa eller dölja utkastet ändrar bara det pågående
samtalet. Valet går att spara även när samtalet inte är tillgängligt.
En kort text vid kryssrutan säger om valet sparades eller om du behöver
försöka igen.

**Visa kvittot** och **Tidigare sparförsök** finns i **Utkast och historik**
i kartans verktygsrad. Där kan du granska det beständiga sparresultatet,
oberoende av om textvyn är öppen.

## Samtalets kontext

Under rubriken i textvyn visar **Kontext** hur många procent av samtalets
kontext som är fylld. Beskrivningen är **Så mycket av samtalets kontext
som är fylld. Nytt samtal tömmer den.** Procenttalet bygger på
leverantörens mätningar och uppskattningar mellan mätningarna, så det
är ungefärligt. Text och röst kan ha olika kapacitet; mätaren visar den
som är mest fylld. Procenttalet kan sjunka när leverantören frigör plats.

Från 85 procent visar röstrutan en symbol och procenttalet. Rutan blir
bredare, med samma höjd. Skärmläsaren säger **Kontexten är 85 procent
full** en gång, utan att avbryta annan uppläsning. Högre värden läses
inte upp automatiskt; du kan läsa det aktuella talet i röstrutan.
**Nytt samtal** tömmer kontexten och återställer mätaren till noll.

Skyttel har med sig hela det pågående samtalet, också efter att ett förslag
har lagts i utkastet, efter sparande, avbrott eller fel. Du kan exempelvis
säga eller skriva **Ändra den sista** för att rätta det senaste förslaget.
Samma sammanhang följer med när mikrofonen stängs av och slås på igen och
när du växlar mellan röst och text. Ett tidigare sparbesked ger aldrig ett
nytt sparande; du behöver be om att spara det aktuella utkastet.

Du kan också säga eller skriva **Nytt samtal**. Det gör samma sak som
knappen och frågar inte om medgivande igen. Vill du kasta hela det
osparade utkastet, säg eller skriv **Kasta utkastet**, eller
**Nytt samtal och kasta utkastet** för att också börja om samtalet.
Redan sparade uppgifter påverkas inte av att utkastet kastas.

## Följ samtalet

Röst och text hör till samma samtal och kan användas samtidigt. Skriver du
med mikrofonen på svarar Skyttel också med rösten. Med mikrofonen av kommer
ett skrivet svar bara som text. Alla dina ord och Skyttels svar finns i
samtalstexten, även om du öppnar textvyn senare. Talade rader har ingen
extra märkning och textvyn öppnas aldrig av ett svar.

En skärmläsare läser bara Skyttels nya svar som inte sägs med rösten, och
väntar på sin tur. Dina egna rader och gamla svar läses inte upp när du
öppnar textvyn. Du kan ändå läsa alla rader själv med skärmläsaren.

Röstrutans korta statusord visar vad rösten gör. **Skriv till Skyttel**
öppnar samtalstexten, där du kan läsa frågor och svar. Samtalet, mikrofonen
och oskickad text finns kvar när du växlar mellan kartan, panelerna och
Inställningar. På Inställningar har röstrutan och kartans återkoppling
om utkast och sparande var sitt utrymme under sidans innehåll.

En samtalsnotis förklarar ett hinder eller ett misslyckat uppdrag. På bred
skärm står den under röstrutan; på smal skärm står den ovanför rutan,
över hela bredden. När textvyn är öppen finns samma besked bara som en rad
ovanför meddelandefältet. Du kan läsa och skriva text även när kontakten
är bruten, men **Skicka** är avstängd tills kontakten är tillbaka.
Mikrofonen stängs av vid kontaktavbrott. Slå själv på den igen när du vill
fortsätta tala. **Samtal med Skyttel är inte tillgängligt just nu.** betyder
att du behöver vänta eller kontakta administratören; Skicka är avstängd
även då.

Utan pågående samtal ser båda samtalsknapparna avstängda ut vid ett sådant
hinder, men ett tryck visar förklaringen. Textvyn öppnas inte. Notisen går
att stänga och försvinner också när hindret upphör. I ett pågående samtal
står hinder kvar tills de är borta. **Skyttel kunde inte slutföra
uppdraget. Försök igen.** kan stängas med **Stäng notisen** och försvinner
också vid nästa försök. Att stänga notisen avslutar inte samtalet och
ändrar inte utkastet.

Beskriv vad du vill hitta, lägga till eller rätta. Skyttel använder
hushållets egna typer och ditt befintliga privata utkast. Förslag från
andra klienter ingår också. Oskickad formulärtext ligger kvar i formuläret
och ingår först när du lägger den i utkastet.

## Tala med Skyttel

**Prata med Skyttel** i kartans verktyg slår på och av mikrofonen. Ett
tryck slår på den, och nästa tryck stänger av den. Knappen har
accentfärg medan mikrofonen är på. Ingen panel öppnas. Första gången under
ett besök visas medgivanderutan först. Tillåt mikrofonen i webbläsaren.
Medan rösten startar avbryter ett tryck starten. Rösten använder samma
utkast och regler som texten. OpenAI behandlar ljud som spelats in medan
mikrofonen är på. Tidigare inspelat tal från långt
tryck kan överföras efter släpp. Om webbläsaren blockerar ljudet, välj
**Starta ljudet**. Mikrofonen börjar lyssna först när ljudet fungerar.
Om kontakten bryts är mikrofonen av tills du själv slår på den igen.
Du kan fortsätta med text eller formulär när
mikrofonen eller ljuduppspelningen inte fungerar.

När rösten inte startar eller avbryts visar en samtalsnotis vad du kan prova.
Webbläsarens notis skiljer på nekad, saknad eller upptagen mikrofon och saknat
röststöd. Serverns notis skiljer på ett tillfälligt startfel, avbruten röst och
ett fel som kräver administratören. Om notisen visar **Felreferens**, skicka
referensen till den som driver installationen för felsökning. Stäng notisen
med **Stäng notisen**, eller försök igen med mikrofonknappen. Ett stoppat
ljud visas med **Webbläsaren stoppade ljudet.** och **Starta ljudet**.

Röstrutan visar vad rösten gör, med en vågform och ett ord. Den står
uppe till höger, och nere till höger på en smal skärm. Röstrutan syns bara
när du använder rösten:

- **Rösten startar**: röstanslutningen förbereds. Vid långt tryck kan
  mikrofonen redan lyssna lokalt medan du håller knappen.
- **Lyssnar**: mikrofonen är på, och ingen talar.
- **Du talar**: staplarna följer hur starkt du talar.
- **Skyttel arbetar**: Skyttel arbetar med ditt uppdrag.
- **Skyttel talar**: Skyttel svarar med rösten.
- **Väntar på ditt svar**: Skyttel har ställt en nödvändig fråga. Rutan
  finns kvar när mikrofonen är av; punkterna blir då nedtonade.
- **Sparat**: ett beständigt kvitto bekräftar sparandet. En grön bock
  visas med ordet i fyra sekunder efter det talade sparbeskedet, eller
  från avbrottet om du trycker **Avbryt** under beskedet.

Medan Skyttel arbetar eller talar finns stoppikonen **Avbryt** i
röstrutan. Den stoppar arbetet och tystar Skyttel. Förslag som redan
ligger i utkastet finns kvar. Med minskad rörelse i systemet rör sig
vågformen inte: den visar sju punkter när ingen hörs och sju stilla
staplar när någon hörs. En skärmläsare får höra **Lyssnar** när mikrofonen slås
på, **Skyttel arbetar**, **Sparat** och **Mikrofonen är av** när röstrutan
försvinner. **Väntar på ditt svar** läses inte upp: Skyttel har just sagt frågan.

Om ett sparresultat är oklart kontrollerar Skyttel det automatiskt när
kontakten är tillbaka. Under kontrollen är Skicka och mikrofonen avstängda.
Skyttel ställer nödvändiga frågor
i samtalet, även om vilken person eller sak som avses och vilket värde
du vill behålla vid en konflikt. Slå på mikrofonen för att svara med rösten
eller välj **Skriv till Skyttel** för att läsa frågan och skriva ett svar.
Textvyn öppnas inte automatiskt och frågan visas inte i en separat ruta.

Skyttel ger korta resultatbesked, exempelvis **Utkastet är uppdaterat**
eller **Sparat**, utan att läsa upp ändringarna efter varje steg.
Be om detaljer när du vill höra dem. Nödvändiga följdfrågor och felbesked
ges även när vanliga bekräftelser är korta.

I samtalstexten visas både dina ord och Skyttels svar löpande. Tidigare
rader finns kvar under samtalet. Korta pauser kan fortsätta samma rad.
När du stänger av mikrofonen arbetar Skyttel färdigt med det du sade och
talar klart sitt svar. Inget mer ljud från mikrofonen skickas. Rösten
behåller anslutningen medan du är kvar i samtalet, så att en paus inte
avbryter det sista yttrandet eller svaret. Medan Skyttel arbetar med ett
skrivet meddelande går mikrofonen
inte att slå på, förrän Skyttel är klar eller uppdraget är avbrutet.

Beskriv ärendet på svenska, svara på följdfrågor och rätta uppgifter med
rösten. Säg exempelvis **Rätta priset till 189 kr och spara** för ett
samlat sparande. En paus, ett ofullständigt fragment eller ett tidigare
sparbesked ger inte tillåtelse för ett nytt sparande. Vid oklarheter
behövs ett nytt tydligt besked. Kvittot och kartans verkliga markering
är bekräftelsen även när du använder röst.

Nya talade och skrivna uppdrag köas medan Skyttel arbetar. Vid bruten
anslutning stängs
mikrofonen av medan anslutningen kontrolleras. Efter en längre störning
slår du själv på den igen. Ett ljudsvar som inte hördes betyder inte att ett
sparande misslyckades. Skyttel kontrollerar själv ett oklart resultat innan
nytt arbete och förklarar utfallet i samtalet.
Genomförda sparanden och deras kvitton finns kvar efter avstängning,
omladdning och omstart.

## Granska, rätta och spara

**Visa utkastet** i textvyn visar de samlade förslagen för objekt,
samband och typer. Rättelser visar tidigare och föreslagna värden, exempelvis
**Sista fyra: 1111 → 2222**. Välj **Utkast och historik** för mer information.
Skriv eller säg **Läs upp hela utkastet** för att granska förslagen i
samtalet. Svaret beskriver ändrade värden före och efter, inklusive
objektens identitet, om de gäller eller har upphört, profilbildsändringar
och egna typdefinitioner. Profilbilder beskrivs som tillagda, bytta eller
borttagna.
Fråga om något är oklart. Assistenten
ska fråga vid tvetydig identitet och skilja okänt, uttryckligen inget,
osäkert uppgivet och ospecificerat objekt åt.

Du kan ge flera önskemål samtidigt. Assistenten kan lägga tydliga delar
i utkastet och fråga om den del som är oklar. **Spara inte** låter dig
göra beställda utkaständringar utan att spara dem i hushållets karta.

Skriv exempelvis **Rätta priset till 189 kr och spara**. Ett tydligt
sparbesked gäller hela det aktuella utkastet, utan ett extra ja bara för
att rättelsen ändrar utkastversionen. Vid konflikt eller samtidig ändring
visas aktuellt underlag och ett nytt besked behövs. Nekade, citerade,
hypotetiska och uppskjutna sparkommandon ger inte tillåtelse att spara.
Om formuleringen är oklar kan du behöva skriva **Spara hela utkastet nu**.

Statusen **Sparat** kommer från ett beständigt kvitto. **Visa kvittot**
visar vad sparandet omfattar. Fråga **Vad sparades senast?** för att få
detaljer från det sparandet i samtalet. Samtalstexten visar Skyttels frågor
och svar. Skyttel kan höra och förstå fel, så samtalstexten kan innehålla
fel, även ett påstående om att något har sparats eller markerats. Lita på
Skyttels status och kvitto för sådana resultat. Detsamma gäller AI-röstens
formuleringar; ett ljudsvar är inte i sig ett sparbevis.
En markeringsstatus visas först när den öppna
webbläsaren har visat det valda objektet. Oskickad formulärtext skyddas
genom att en sådan visningsbegäran kan nekas.

## Avbrott och återupptagning

Ett nytt meddelande avbryter inte pågående arbete. På dator kan du fortsätta
med **Skicka**: meddelandena väntar på servern och besvaras i ordning.
Raden **Skyttel arbetar…** visar hur många som väntar. Tryck Escape när
fokus är i textvyn för att avbryta arbete och allt som väntar. Escape gör
ingenting när Skyttel bara talar eller fokus är utanför textvyn.

På mobil och smal skärm ersätter en stoppikon **Skicka** medan Skyttel
arbetar. Ett tryck avbryter utan att skicka den text som ligger kvar i
fältet. Här skickas ett meddelande åt gången. Escape fungerar också i
ett smalt datorfönster. När stoppikonen finns i textvyn visar röstrutan
bara statusordet.

Stoppikonen i röstrutan avbryter också. Alla avbrott stoppar pågående
arbete, tystar rösten och tömmer kön, oavsett om uppdragen kom med tal
eller text. Genomförda förslag finns kvar i utkastet. Ett genomfört
sparande blir inte ångrat. Textvyn visar **Avbrutet. Föreslagna ändringar
ligger kvar i utkastet.** tills nästa uppdrag börjar eller du väljer
**Nytt samtal**. Nytt samtal tömmer också kön.

Om ett sparresultat är oklart visar samtalsnotisen **Det är oklart om
utkastet sparades. Skyttel kontrollerar det.** Kontrollen kräver inget
samtalsmedgivande. Den väntar tills kontakten är tillbaka och slutför bara
ett redan registrerat sparförsök med samma identitet och innehåll. Den
skapar aldrig ett nytt sparande av ett nyare utkast.

Efter kontrollen förklarar Skyttel alltid utfallet i samtalstexten, även
när utkastet inte sparades. Med mikrofonen på sägs förklaringen också med
rösten. Ett kvitto ger **Sparat**; ett osparat utkast ger ingen sådan
bekräftelse. Oskickad text finns kvar och nytt arbete blir möjligt när
kontrollen är klar. Textvyn öppnas inte av förklaringen.

Bara om kontrollen misslyckas visas **Skyttel kunde inte kontrollera om
utkastet sparades.** med **Kontrollera om utkastet sparades**. Försök igen
med den knappen. **Utkast och historik → Tidigare sparförsök** innehåller
även kvitton från andra enheter. Ett avvisat försök behåller utkastet och
behöver ett nytt underlag och ett nytt sparbesked.

Fråga **Vad var felet?** för att höra det senaste registrerade felet i
det pågående samtalet. Felminnet följer samtalet och försvinner vid
**Nytt samtal** eller när samtalet avslutas. Ett oklart sparresultat
behöver kontrolleras innan ett nytt
uppdrag kan börja.

En avstängd mikrofon behåller samtalstexten i det pågående samtalet.
**Nytt samtal** tömmer samtalstexten och kontexten.
Samtalet avslutas när du lämnar hushållets karta, laddar om sidan eller
när åtkomsten upphör.
Anslutningen upphör senast efter 30 minuter eller när dess medgivande
återkallas. Utkast, sparade uppgifter och kvitton finns kvar. Återimport
eller byte av innehållsägare kräver en ny anslutning.

## Vilka uppgifter behandlas?

Vid röst används även ljud och tillfälliga textfragment av samtalet.
Skyttel skickar meddelandet, hela det egna utkast som behöver granskas och
relevanta kartdelar till OpenAI. Bilder skickas inte i textanropen.
Fullständiga samtal sparas inte som hushållsinnehåll. Skriv inte lösenord,
fullständiga konto- eller kortnummer, pinkoder eller återställningskoder.

Anrop använder `store: false`. Det är ingen garanti om enbart behandling
i EU eller omedelbar radering av alla leverantörskopior. Läs
[OpenAI:s datavillkor](https://developers.openai.com/api/docs/guides/your-data).
Hushållets administratör hanterar användare, export, återimport och
permanent radering i Skyttels egna administrationsvyer.
