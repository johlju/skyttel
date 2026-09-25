# Skapa objekttyper och egna fält

[Till användarguidens innehåll](README.md)

Alla medlemmar kan anpassa hushållets objekttyper. En typ kan beskriva
exempelvis en solcellsanläggning och ha samma egna fält för alla objekt
av den typen. Även förifyllda typer, som Person och Fordon, går att ändra.
Den som skapar en typ får ingen särskild roll eller ensam rätt till den.

## Skapa en typ och ett objekt tillsammans

1. Välj **Ny objekttyp** i kartan. Ange **Typens namn** och en förklarande
   **Typens beskrivning**.
2. Välj **Lägg till fält** för varje egen uppgift. Ange fältets namn,
   beskrivning och värdeslag: **Text**, **Tal**, **Datum** eller **Ja/nej**.
   För Solcellsanläggning kan du använda Leverantör, Effekt,
   Installationsdatum och Batteri. Skriv måttenheten i beskrivningen.
3. Välj **Lägg typförslaget i mitt utkast**. Skapa sedan ett **Nytt objekt**
   och välj den nya typen i **Objekttyp**. Fälten visas i objektformuläret.
4. Lägg objektet i utkastet. Granska definitionen och objektets uppgifter
   i **Hela mitt utkast**. Välj **Spara hela utkastet** när du vill göra
   alla förslagen gemensamma.

Alla fyra fälttyper får lämnas obesvarade. För ja/nej är **Obesvarat**,
**Ja** och **Nej** tre olika val. Ett tomt tal blir inte noll. Datum måste
vara giltiga kalenderdatum och tal måste vara tal. Fel stoppar förslaget;
ingen del av ett oförenligt utkast sparas.

Skriv aldrig lösenord, fullständiga konto- eller kortnummer, pinkoder,
säkerhetskoder eller återställningskoder. Egna fält är inte ett undantag
från regeln att hemliga uppgifter inte hör hemma i Skyttel.

## Rätta definitioner och värden

Öppna **Objekttyper och egna fält** och välj **Ändra typ** för rätt typ.
Namn och beskrivning kan rättas även när typen eller fältet används.
Objekten behåller sina identiteter och värden när definitionerna byter namn.
Snarlika namn kopplas inte ihop automatiskt.

För att rätta ett värde väljer du objektet och **Redigera valt objekt**
i detaljpanelen. Ändra fältet, lägg rättelsen i utkastet och spara hela
utkastet. Du kan också rensa ett värde eller välja **Obesvarat**.
Andra medlemmar ser den sparade definitionen och kan
skapa egna objekt med samma fält. Din privata nya typ blir tillgänglig
för dem först efter ditt sparande.

Om ett använt fält behöver ett annat värdeslag, lägg till ett nytt fält.
Det tidigare fältet och värdena finns kvar. Skyttel konverterar inte värden
automatiskt. Även användning i ett privat utkast kan hindra byte av
värdeslag; felbeskedet avslöjar inte utkastets innehåll.

## Byt typ på ett objekt

Välj objektet och **Redigera valt objekt** i detaljpanelen. Välj sedan
en annan **Objekttyp**, exempelvis från Cykel till Fordon.
Objektets identitet och alla dess samband finns kvar. Namn,
beskrivning och andra uppgifter som inte hör till typens egna fält påverkas
inte av själva typvalet.

Den nya typens fält börjar obesvarade. Tidigare fältvärden visas separat,
även om den nya typen har fält med samma namn. Fyll själv i de uppgifter
som ska gälla efter bytet. Inga värden överförs eller konverteras automatiskt.
Lämna **Obesvarat** för uppgifter du inte känner till; det är skilt från
**Nej**. Bekräfta **Jag har hanterat tidigare fältvärden för typbytet** när
du har rättat de nya fälten eller valt att lämna dem obesvarade.

Välj **Lägg i mitt utkast**. I **Hela mitt utkast** ser du tidigare typ och
värden samt den nya typen och dess värden. Typbytet och fälträttelserna
sparas tillsammans med resten av utkastet. Ett fel stoppar hela sparandet.
Tidigare sparade värden finns kvar i historiken. Oskickade formulärvärden
försvinner om du stänger formuläret utan att lägga förslaget i utkastet.

Ett typbyte gäller ett objekt. Ett namnbyte på typdefinitionen ändrar
benämningen för alla objekt av den typen. Sammanslagning gäller flera
objekt som ska bli ett; ett typbyte slår inte samman objekt och flyttar
inga samband.

Vid konflikt mellan typer granskar du typen och dess fältvärden som en
helhet. Oberoende ändringar, exempelvis ett senare namn, bevaras. Ångring
lägger tillbaka tidigare typ och värden i ett nytt förslag. Senare ändrade
fält kräver ett uttryckligt val; ett överlappande eget fältförslag behöver
hanteras innan du ångrar. Oberoende eget utkastarbete finns kvar.

## Samtidiga ändringar och återupptagning

Typförslag och objektförslag finns kvar efter omladdning och omstart när
de har lagts i utkastet. Oskickad text i formuläret är ännu inte bevarad.
Vid en samtidig definitionsändring sparas inget av det berörda försöket.
Välj **Hämta aktuellt underlag** och granska den sparade definitionen.
Välj vilken definition eller vilket objektförslag du vill behålla,
granska hela utkastet och ge ett nytt sparbesked.
Om du behåller din typdefinition bevaras också andras oberoende ändringar,
exempelvis ett nytt fält eller en beskrivning som du inte har ändrat.

Kvittot omfattar definitioner och objekt i samma sparande. Historiken
bevarar äldre definitioner och fältens betydelse. Följ
[utkast och sparande](drafts.md) vid oklart sparande.
[Ångring av ett helt sparande](history.md) omfattar också definitioner
och egna fält. En typ som fortfarande används kan inte tas bort genom
ångring utan att användningen hanteras. Läs om
[borttagning och återställning av typer och fält](definition-removal.md).
