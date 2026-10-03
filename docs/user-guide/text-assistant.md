# Samtal med Skyttel

[Till användarguidens innehåll](README.md)

Välj **Prata med Skyttel** eller **Skriv till Skyttel** i hushållets karta.
**Prata med Skyttel** startar samtalet med mikrofonen, och
**Skriv till Skyttel** startar det med text. Utan giltigt medgivande visas
först [medgivanderutan](#medgivande). Om samtalet inte är tillgängligt
fungerar kartans formulär.

## Medgivande

Skyttel behöver ditt medgivande innan ett samtal startar. Samma medgivande
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
  och ditt utkast ligger kvar. Nästa gång du väljer en samtalsknapp visas
  medgivanderutan igen.

Knapparna gäller direkt, och sidan har ingen knapp för att spara hela
sidan. En kort text vid knappen säger hur det gick. Om den säger att
medgivandet inte kunde sparas eller återkallas är ingenting ändrat, och du
kan försöka igen. När sidan visar
**Samtal med Skyttel är inte tillgängligt just nu.** går det inte att
spara ett medgivande, men du kan återkalla ett som är sparat.

Ett sparat medgivande tas bort när du inte längre är medlem i hushållet.
Om du bjuds in igen frågar Skyttel på nytt. Medgivandet ingår inte i en
[fullständig export](household-export.md) och ändras inte av en
[återimport](household-import.md).

Medgivandet är skilt från cookieval och från andra klienters medgivanden
under **Assistentanslutningar**.

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
- Skriv ditt meddelande och välj **Skicka** eller tryck Retur. Skift+Retur
  ger en ny rad. Fältet behåller fokus efter att meddelandet har skickats.
- I samtalstexten står det du skriver i en tonad ruta till höger och det
  Skyttel svarar utan ruta. Det du och Skyttel säger med rösten står där
  också. Raden **Skyttel arbetar…** står sist medan Skyttel arbetar.
- **Stäng textvyn** eller **Skriv till Skyttel** stänger textvyn. Samtalet,
  mikrofonen och din oskickade text finns kvar tills du öppnar den igen.
- **Nytt samtal** tömmer samtalstexten och det Skyttel minns av samtalet
  och stoppar pågående arbete. Mikrofonen behåller sitt läge, och ditt
  utkast och din oskickade text finns kvar. Skyttel säger hur många
  osparade ändringar som ligger kvar i utkastet.

## Följ samtalet

Med textvyn stängd visar det kompakta kortet fortfarande status,
nödvändiga frågor och fel. Samtalet och oskickad text finns kvar när du
växlar mellan kartan, panelerna och Inställningar. Vid en begärd
kartmarkering visas kartan och uppgifterna bredvid varandra så att kortet
inte täcker dem. Verktygsradens mikrofonkontroll finns kvar.

På Inställningar har sidans innehåll och samtalets kompakta status var sitt
utrymme. Mikrofonkontroller, nödvändiga frågor, fel och sparstatus finns
kvar. Välj **Visa samtals- och utkastdetaljer** för ytterligare uppgifter
om samtalet och ditt privata arbete. **Stäng aktuell status** återgår
till den kompakta vyn. I korta fönster kan båda områdena rullas var för sig.

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
utkast och regler som texten. OpenAI behandlar ljudet från
mikrofonen medan den är på. Om webbläsaren blockerar ljudet, välj
**Spela upp ljud**. Du kan fortsätta med text eller formulär när
mikrofonen eller ljuduppspelningen inte fungerar.

Om rösten inte startar visar felmeddelandet vad du kan prova. Om det visar
**Felreferens**, skicka referensen till den som driver installationen för
felsökning. Du kan fortsätta med text och formulär under tiden.

Röstrutan visar vad rösten gör, med en vågform och ett ord. Den står
uppe till höger, och nere till höger på en smal skärm. Röstrutan syns bara
när du använder rösten:

- **Rösten startar**: mikrofonen är inte på ännu.
- **Lyssnar**: mikrofonen är på, och ingen talar.
- **Du talar**: staplarna följer hur starkt du talar.
- **Skyttel arbetar**: Skyttel arbetar med ditt uppdrag.
- **Skyttel talar**: Skyttel svarar med rösten.

Medan Skyttel arbetar eller talar finns stoppikonen **Avbryt** i
röstrutan. Den stoppar arbetet och tystar Skyttel. Förslag som redan
ligger i utkastet finns kvar. Med minskad rörelse i systemet rör sig
vågformen inte: den visar sju punkter när ingen hörs och sju stilla
staplar när någon hörs. En skärmläsare får höra **Lyssnar** när mikrofonen slås
på, **Skyttel arbetar** och **Mikrofonen är av** när röstrutan försvinner.

Om ett sparresultat är oklart visas att det tidigare sparförsöket måste
kontrolleras innan nya ändringar. En nödvändig fråga visas med
**Svara i samtalet** så att du kan öppna dialogen och svara.

Skyttel ger korta resultatbesked, exempelvis **Utkastet är uppdaterat**
eller **Sparat**, utan att läsa upp ändringarna efter varje steg.
Be om detaljer när du vill höra dem. Nödvändiga följdfrågor och felbesked
ges även när vanliga bekräftelser är korta.

I samtalstexten visas både dina ord och Skyttels svar löpande. Tidigare
rader finns kvar under samtalet. Korta pauser kan fortsätta samma rad.
När du stänger av mikrofonen arbetar Skyttel färdigt med det du sade och
talar klart sitt svar. Inget mer ljud från mikrofonen skickas. Rösten
stängs några sekunder efter att Skyttel har tystnat, och samtalet finns
kvar. Medan Skyttel arbetar med ett skrivet meddelande går mikrofonen
inte att slå på, förrän Skyttel är klar eller uppdraget är avbrutet.

Beskriv ärendet på svenska, svara på följdfrågor och rätta uppgifter med
rösten. Säg exempelvis **Rätta priset till 189 kr och spara** för ett
samlat sparande. En paus, ett ofullständigt fragment eller ett tidigare
sparbesked ger inte tillåtelse för ett nytt sparande. Vid oklarheter
behövs ett nytt tydligt besked. Kvittot och kartans verkliga markering
är bekräftelsen även när du använder röst.

Nytt tal kan avbryta ett äldre uppdrag. Vid bruten anslutning stängs
mikrofonen av medan anslutningen kontrolleras. Efter en längre störning
slår du själv på den igen. Ett ljudsvar som inte hördes betyder inte att ett
sparande misslyckades. Kontrollera sparresultat först. Du kan säga
**Slutför samma sparförsök** när exakt ett väntande försök finns.
Genomförda sparanden och deras kvitton finns kvar efter avstängning,
omladdning och omstart.

## Granska, rätta och spara

**Hela ditt utkast** visar de samlade förslagen för objekt, samband och
typer. Rättelser visar tidigare och föreslagna värden, exempelvis
**Sista fyra: 1111 → 2222**. Öppna detaljerna för mer information.
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

**Avbryt uppdrag** stoppar fortsatta anrop från det uppdraget. Ett nytt
meddelande ersätter också pågående arbete. Genomförda förslag finns kvar
i utkastet. Ett genomfört sparande blir inte ångrat av ett avbrott.

Om svaret saknas, välj **Kontrollera sparresultat** innan nytt arbete.
Ett väntande försök kan slutföras med **Slutför samma sparförsök**. Det
återanvänder exakt det beständiga försöket. Efter omladdning eller omstart
startar du en ny anslutning och öppnar **Tidigare sparförsök**. Där finns
även kvitton från andra enheter. Ett avvisat försök behöver ett nytt
underlag och ett nytt sparbesked.

Fråga **Vad var felet?** för att höra det senaste registrerade felet i
det pågående samtalet. Felminnet följer samtalet och försvinner vid
**Nytt samtal** eller när samtalet avslutas. Ett oklart sparresultat
behöver kontrolleras innan ett nytt
uppdrag kan börja.

En avstängd mikrofon behåller samtalstexten i det pågående samtalet.
**Nytt samtal** tömmer samtalstexten och det Skyttel minns av samtalet.
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
