# Granska och spara ditt utkast

[Till användarguidens innehåll](README.md)

Alla förslag från formulär, assistenter och andra enheter för samma
Skyttel-användare och hushåll samlas i ett privat utkast. Andra medlemmar
ser den gemensamma kartan tills du sparar. Utkastet ingår däremot i
administratörens [fullständiga export](household-export.md).

## Följ utkastet i kartan

Under hushållets namn visas sparande, fel och en länk med antal konflikter.
Konfliktantalet gäller hela ditt utkast, även typer och innehåll
som kartans filter döljer. **Utkast** öppnar **Visa utkastet** i textvyn
direkt. Ikonen är avskild från övriga verktyg och visas när förslag finns,
även om förslagen bara gäller typer eller döljs av kartans filter.
**Skriv till Skyttel → Visa utkastet** fungerar även när utkastet är tomt.
Att öppna textvyn eller utkastet startar inget samtal och kräver varken
AI eller samtalsmedgivande. Första **Skicka** kräver fortfarande medgivande.
Återkoppling med antal förslag finns i textvyn och Inställningar.

Teckenförklaringen under namnet visar bara kategorier i den filtrerade
kartan. Sökning, typfilter, markering och fokus påverkar den. Kamerans
rörelser gör det inte. Symbolerna har samma färger som kartan:

- Grönt plus visar ett nytt förslag. Nya samband har heldragna linjer.
- Gul penna visar en ändring. Typ och uppgifter kan ändras utan att
  sambandets riktade ändpunkter ändras; linjen är då heldragen.
- Rött kryss visar en borttagning med streckad sambandslinje. När
  ändpunkter eller riktning ändras visas den gamla kopplingen med rött
  kryss och streckad linje och den nya med grönt plus och heldragen linje.
- En separat ring visar ett markerat objekt, skild från ett nytt objekts
  gröna förslagskontur. Ringen kan finnas kvar efter sparandet.
- Punktade kopplingar binder etiketter till objekt eller samband.
  Höjdhjälpens streckade markeringar handlar om höjd.

**Information och hjälp** förklarar alla symbolerna. Förslag på samband
har etiketter utan att du behöver markera dem eller välja **Alla etiketter**,
så långt de ryms utan krockar.

**Utkastet är sparat** visas i tre sekunder när ett nytt sparförsök
bekräftas. Ett gammalt kvitto spelas inte upp vid omladdning. Att inga
förslagsmarkeringar syns bevisar inte att utkastet är sparat: filter kan
dölja dem och typförslag saknar markeringar i kartan. Läs kvittot i
**Rapporter → Ändringshistorik** för detaljer utan tidsgräns.

Ett ändrat formulär frågar innan du lämnar det. **Fortsätt redigera**
behåller hela formulärtexten. Lägg texten i utkastet innan du sparar, eller
välj uttryckligen **Kasta ändringarna och fortsätt** om den ska kastas.
Valet ändrar inte förslag som redan finns i utkastet.
Oskickade samtalsmeddelanden finns kvar i textvyn.
Besvara eller återta väntande ändringar i samtalet före ett nytt
uttryckligt sparbesked. De hindrar också manuellt sparande i webbläsaren
som har samtalet öppet. En oberoende informationsfråga hindrar inte
sparande. Att besvara en fråga ger inte i sig tillåtelse att spara.
Mikrofonläge och samtalsproblem visas i röstrutan och
[samtalsnotiserna](text-assistant.md#följ-samtalet).

## Granska, spara eller kasta förslag

1. Lägg formulärets ändringar i utkastet med **Lägg i utkastet och stäng** eller
   motsvarande knapp för typen av förslag. Text som fortfarande bara
   finns i formuläret ingår inte i sparandet.
2. Öppna **Utkast** och välj förslagets rad för att läsa hela förslaget,
   inklusive samband, typer, bilder, alla egenskaper och borttagningar.
   Läsdialogen skiljer sparade värden från föreslagna värden.
   Stäng med krysset eller Escape för att återgå till raden.
3. Utkastets läsdialog erbjuder ingen redigering eller konfliktjämförelse.
   Rättningar görs i vanliga formulär. Lägg rättelsen i utkastet och granska
   den igen före sparandet.
4. Välj sparikonen **Spara hela utkastet** i **Utkast** när
   förslagen stämmer. Sparmodalen öppnas direkt med besked om sparandet.
   Sparandet gäller
   allt i utkastet tillsammans. Ett fel eller en konflikt stoppar hela
   sparandet; inget sparas delvis.
5. Invänta bekräftelsen **Utkastet är sparat**. Modalen stängs och det
   sparade utkastet töms. Bekräftelsen visas i tre sekunder. Det gemensamma innehållet
   blir tillgängligt för de andra medlemmarna och får en ändringsgrupp i
   [historiken](history.md).

Radens röda papperskorg tar bort ett oberoende förslag direkt. Ett nytt
objekt med beroende nya samband kräver bekräftelse som visar vilka
förslag som försvinner. Vid borttagning av ett typförslag visar samma
dialog vilka förslag som blir kvar men påverkas. De behåller sina värden
och visar eventuell typkonflikt med varningssymbol och text. Rätta dem
i ordinarie formulär eller typinställningar.

När du föreslår att ta bort ett sparat objekt följer dess inkommande och
utgående samband med, även självsamband. Utkastet visar
**Följer objektborttagning** och vilka objekt som orsakar borttagningen.
Egna nya och ändrade sambandsförslag bevaras under tiden. Öppna deras rad
för att läsa **Bevarat sambandsförslag**, inklusive egenskaper och ordning.

Ta bort objektets borttagningsförslag med radens papperskorg för att återta
borttagningen. Sambandsförslagen återkommer för granskning när alla berörda
objektborttagningar återtas. Samband som du separat föreslår att ta bort
förblir borttagna i utkastet. Om någon annan tar bort en ändpunkt kan ett
återgivet förslag vara blockerat: rätta ändpunkterna eller kasta förslaget
innan du sparar hela utkastet. Borttagna sparade objekt återställs inte.
Återtagningen gäller utkastet; redan sparade borttagningar kan inte ångras
på detta sätt.

Rubrikens **Kasta hela utkastet** visar alla dina förslag och kräver
bekräftelse. **Avbryt** ändrar ingenting. Om utkastet har ändrats eller
svaret försvinner väljer du **Hämta aktuellt utkast** för att kontrollera
utfallet och läsa aktuella beroenden innan ett nytt försök.
Om du hunnit fortsätta med annat arbete öppnas ingen feldialog över det.
**Kontrollera borttagningen** ger en beständig ingång till uppföljningen.
Ingen av knapparna ångrar ett redan
genomfört sparande. Läs då [ändringshistoriken](history.md) och lägg
eventuella rättelser
i ett nytt utkast.

## Fortsätt ett utkast och lös konflikter

Förslag som du lägger i utkastet finns kvar efter omladdning, stängd app
och normal omstart av servern. Logga in som samma Skyttel-användare på en
annan enhet för att fortsätta. **Visa utkastet** visar underlaget och
förslagen, inklusive osäkerhet och obesvarade frågor. Text som bara finns
i ett öppet formulär är ännu inte bevarad. Ljud och fullständig
samtalshistorik behövs inte för att fortsätta.

Varje hushållsmedlem arbetar med sitt eget privata utkast mot samma sparade
karta. Oberoende ändringar av olika objekt kan sparas var för sig.
Om två klienter ändrar samma användares utkast avvisas ett gammalt
ändrings-, kasta- eller sparförsök. Välj **Hämta aktuellt underlag**.
Nyare förslag finns kvar. Kopiera eventuell formulärtext du vill behålla,
stäng formuläret och öppna det aktuella förslaget innan du fortsätter.

Vid konflikt sparas inget från försöket, inte heller de konfliktfria
förslagen. Välj exempelvis **1 konflikt i ditt utkast** under hushållets
namn. **Granska konflikter** öppnas med fokus på rubriken från både karta
och tabell, även när sökningen döljer det berörda objektet.

Välj posten i **Alla konflikter**. Jämförelsen visar **Sparat i kartan nu**
och **Ditt förslag**. Motstridiga ändringar behöver ett aktivt val.
Rader med ram går att välja. Klicka på raden på den sida du vill
använda, eller välj den med Tab och Enter. Valda värden har starkare ramar.
Du kan kombinera egenskaper från båda sidorna. Identiska värden visas som
vanlig text och behöver inget val. Egenskaper visas med sina egna etiketter.

Ändringar av olika fria egenskaper kombineras, även om etiketterna är lika.
De visas som **Oberoende ändring · kombineras** och ingår i resultatet utan
extra val. Lika etiketter skiljs åt med egenskapens nummer i jämförelsen.
För en motstridig egenskap visas även tidigare innehåll. Etikett, datatyp
och värde väljs tillsammans. Om någon tar bort en egenskap som den andra
ändrar behöver du välja mellan borttagningen och den ändrade egenskapen.

Samtidiga tillägg finns kvar med skilda identiteter. Tillägg på samma plats
får en beständig ordning; varje användares inbördes ordning på sina egna
tillägg behålls. Motstridiga ändringar av befintliga egenskapers ordning
kräver ett val under **Egenskapernas ordning**. Ordningens val tar aldrig
bort egenskaper som ingår i kombinationen. Läs hela **Efter dina val**
innan du bekräftar.

**Efter dina val** visar den exakta kombinationen och vilken sida varje
valt värde kommer från. **Lägg valen i utkastet**
blir tillgänglig först när alla nödvändiga val är gjorda och kombinationen
är giltig. Om en vald ändpunkt inte längre finns förklaras felet och
dina val finns kvar. Rätta sambandet med befintliga ändpunkter;
Skyttel ändrar inte andra egenskaper åt dig.

Bekräftelsen ändrar enbart ditt utkast. Postens namn och typ finns kvar i
konfliktlistan med en bock. Granska hela utkastet och spara kartan separat.
Övriga förslag och oskickad formulärtext finns kvar. Stäng dialogen med
krysset eller Escape för att återgå till knappen som öppnar den.

Om någon sparar nya uppgifter medan du väljer avvisas den gamla
jämförelsen. Även återöppning kontrollerar aktuellt underlag. Välj
**Visa aktuell jämförelse**, granska uppgifterna och gör om bara val för
berörda egenskaper. Opåverkade val finns kvar mellan konflikter och när
dialogen stängs och öppnas under samma sidbesök. Ändrade typer och
referenser prövas på nytt innan du bekräftar. Ett känt avvisat försök ändrar
inte utkastet. Har en annan klient redan löst konflikten visas ett
aktuellt besked i läsläge utan gammal bekräftelse.
Om svaret försvinner och resultatet är oklart får samma ändring inte
skickas igen innan dess utfall kontrolleras. Välj **Kontrollera om valet
lades i utkastet**. Har ändringen genomförts visas lösningen med bock;
annars kan du försöka igen med de bevarade valen. Misslyckas kontrollen
är utfallet fortfarande oklart och ett nytt försök spärrat. Stängning och
återöppning kringgår inte kontrollen. Under en pågående begäran är
växling och stängning spärrade; vid oklart utfall kan du stänga utan att
förlora det tillgängliga statusbeskedet. Om den sista konflikten försvinner
när aktuellt underlag hämtas når du kontrollen med **Visa konfliktvalet**
i Karta eller Tabell. Om en annan klient har sparat och tömt utkastet
visas i stället aktuellt besked utan att det tidigare konfliktvalet
erbjuds igen. Kontrollen av utkastet bevisar då inget eget privat resultat.
Konfliktval ger inget
sparkvitto; gemensamt sparande är en separat åtgärd.

Om ett sparat objekt eller samband redan är borttaget visar jämförelsen
**Borttaget** som
**✓ Förvalt**. Ditt ändringsförslag går att läsa men kan inte återställa
posten. **Acceptera borttagningen och kasta ditt förslag** kastar bara
förslaget för den posten. Andra förslag finns kvar och den gemensamma kartan
ändras inte av bekräftelsen.

Om någon annan tar bort ett objekt som ditt tidigare giltiga
sambandsförslag använder finns förslaget kvar i konfliktlistan med alla
dina uppgifter. Det visas utanför kartans och tabellens aktuella samband.
Hela utkastets sparande väntar tills du rättar eller kastar förslaget,
även efter omladdning eller omstart. Välj **Rätta ändpunkter**, välj
befintliga objekt i hushållet och **Lägg i utkastet**. Förslagets identitet
och övriga innehåll behålls; borttagna objekt återställs inte. Det gäller
både nya och ändrade sambandsförslag. Alternativt kastar **Ta bort
sambandet ur ditt utkast** bara det berörda förslaget. Annat utkastarbete
finns kvar. Granska och spara hela utkastet separat efter rättningen.

Ett dubblerat samband går att läsa men har inga valbara egenskaper.
**Ta bort sambandet ur ditt utkast** tar bara bort det förslaget.
När din egen objektborttagning möter nya sparade
uppgifter eller samband väljer du objektets och varje nytt sambands
borttagning för sig. Objektet kan inte tas bort medan ett sådant samband
behålls. Valen ändrar ditt utkast; spara hela utkastet separat när du har
granskat resultatet.
Om ytterligare samband tillkommer före sparandet stoppas hela försöket.
Granska de nya följderna och lämna ett nytt sparbesked; ett tidigare besked
omfattar inte nya borttagningar. Ditt övriga arbete finns kvar. Du kan också
återta objektborttagningen. Då behålls samband som du bara har valt att ta
bort som följd av den, medan separata sambandsborttagningar ligger kvar.

En saknad objekttyp behöver rättas utanför konfliktfönstret.
Följ den visade instruktionen till
**Inställningar → Typer** eller den vanliga objektdialogen.
Ditt förslag finns kvar medan du rättar det. Lägg rättelsen i utkastet så
bedöms det på nytt mot aktuellt underlag. Ett objekt med saknad typ kan
också tas bort ur utkastet med den uttryckliga åtgärden i jämförelsen.

Om själva typdefinitionen har tagits bort jämför du **Borttaget** med hela
din föreslagna definition och väljer uttryckligen en sida. Ett
återställningsval bevarar typens ursprungliga identitet och föreslår din
definition i utkastet. Det återställer inga objekt eller samband. Kartan
ändras först vid separat sparande, som kontrollerar att underlaget
fortfarande gäller. Har någon hunnit återställa och ändra typen behöver
du granska den faktiskt aktuella definitionen på nytt.

Efter import kan ett tidigare privat återställningsförslag behöva
bekräftas igen i **Granska konflikter**. Förslaget och dess egna uppgifter
finns kvar, men en export överför ingen tidigare återställningsbehörighet.
Granska aktuellt underlag och lägg valet i utkastet före separat sparande.
Om aktuell import saknar en faktisk borttagningsrevision kan definitionen
inte återställas. Du kan fortfarande välja den sparade sidans **Borttaget**
för att kasta just ditt definitionsförslag. Andra förslag finns kvar.

## Följ upp ett oklart sparande

Stäng sparmodalen med krysset eller Escape; det avbryter inte försöket.
**Visa sparandet** finns i både karta och tabell när försöket fortfarande
behöver följas upp. Det är nåbart även efter omladdning utan utkastikon,
aktivt samtal eller medgivande. **Kontrollera sparandet igen** följer
samma beständiga försök och skapar inga dubblerade sparanden.

**Sparar utkastet…** och **Kontrollerar sparandet…** betyder att svaret
inväntas. **Sparandet kunde inte bekräftas.** lämnar utfallet okänt och
behåller förslagen; nytt sparande och kastande är spärrade tills försöket
kontrolleras. **Utkastet kunde inte sparas.** betyder ett avvisat försök:
läs orsaken och hämta aktuellt underlag innan du rättar förslagen.

Det beständiga kvittot för ett genomfört sparande finns i **Rapporter →
Ändringshistorik**. **Visa sparandet** gäller ditt aktuella privata försök.
Logga in som samma Skyttel-användare på en annan enhet för att följa upp det,
även efter omstart. Du behöver inte komma ihåg ett operations-ID eller
ha kvar den ursprungliga fliken. Ett återförsök av samma sparande ger samma
kvitto utan dubbletter.

Ett tidigare kvitto bekräftar bara sitt eget sparande. Nya förslag och
text som ännu bara finns i ett öppet formulär omfattas inte av kvittot.
Andra hushållsmedlemmar ser de gemensamma ändringarna efter sparandet,
men kan inte läsa dina privata sparförsök.

Om kvittot är bekräftat men kartan inte kan hämtas är sparandet fortfarande
genomfört. Välj **Hämta aktuellt underlag** för att uppdatera visningen.
