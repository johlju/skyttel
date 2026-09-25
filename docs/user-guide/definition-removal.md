# Ta bort och återställa typer och fält

[Till användarguidens innehåll](README.md)

Alla medlemmar kan föreslå borttagning av oanvända objekttyper,
sambandstyper och egna fält. Egna och förifyllda typer följer samma regler.
Skyttel städar inte bort oanvända definitioner automatiskt. Du kan behålla
dem för framtida användning.

## Föreslå borttagning

1. Öppna **Objekttyper och egna fält** eller **Sambandstyper och riktning**.
   Välj **Ändra typ** eller **Ändra sambandstyp** för rätt definition.
2. Välj **Ta bort objekttypen** eller **Ta bort sambandstypen**. För ett
   fält väljer du **Ta bort fält** och sedan **Lägg typförslaget i mitt
   utkast**. Andra fält och typens namn kan vara kvar.
3. Granska tidigare definition och förslag i **Hela mitt utkast**.
   Definitionen finns kvar i den gemensamma kartan tills du sparar.
4. Välj **Spara hela utkastet** för att genomföra alla förslagen, eller
   **Kasta förslaget** för att avstå från just borttagningen.

## När definitionen används

Även upphörda objekt och samband räknas som aktuell användning.
Beständiga privata utkast kan också hindra borttagning. Felbeskedet
visar inte vem som har ett privat utkast eller vad det innehåller.

- För en objekttyp behöver användande objekt tas bort eller byta typ.
- För en sambandstyp behöver användande samband tas bort eller byta typ.
  Deras ändpunkter, exempelvis en person och ett garage, kan finnas kvar.
- För ett fält behöver dess värden tas bort ur användande objekt och
  privata utkast. Berörda privata typförslag behöver också hanteras.

Skyttel tar aldrig bort användande innehåll för att möjliggöra
definitionsborttagningen. Lägg först de avsedda ändringarna i ditt
utkast; de kan sparas tillsammans med borttagningen. Andra medlemmar
hanterar sina egna utkast.

Användning och definitionsversion kontrolleras igen vid sparandet.
Om någon börjar använda eller ändrar definitionen under tiden sparas
ingen del av ditt utkast. Hämta aktuellt underlag, hantera användningen
eller konflikten och granska hela resultatet före ett nytt sparbesked.

## Återställ genom historiken

Borttaget innehåll och äldre historik hindrar inte katalogborttagning.
Historiken bevarar definitionerna så att tidigare fältvärden och
samband fortfarande går att förstå. De återkommer inte i katalogen
bara för att du läser historiken.

1. Öppna **Visa historik** och hitta sparandet som tar bort innehållet.
2. Välj **Ångra sparandet**. Om innehållet behöver en borttagen typ visas
   **Återställ objekttyp** eller **Återställ sambandstyp** i utkastet,
   tillsammans med objektet och sambanden.
3. Granska definitionerna och hela utkastet. Oberoende egna förslag finns
   kvar. Överlapp med egna förslag måste hanteras innan ångringen kan
   läggas till. En ändrad definition kan kräva ett uttryckligt konfliktval.
4. Välj **Spara hela utkastet** för att återföra både definitioner och
   innehåll. Du får ett nytt kvitto; den gamla historiken finns kvar.

Ett borttaget eller ändrat fält kan också behöva återställas för ett äldre
värde. Då visar Skyttel en definitionskonflikt. Värdet omvandlas aldrig
automatiskt. Se [historik och ångring](history.md) för konfliktvalen.

Vanlig borttagning är skild från permanent radering och har ingen
automatisk tidsgräns. Aktuella och äldre definitioner, privata utkast och
historik behålls som hushållsinnehåll. Administratörer använder de separata
flödena för [fullständig export](household-export.md),
[återimport](household-import.md) och
[permanent radering](household-erasure.md). En permanent radering kan inte
ångras genom historiken; granska dess omfattning före bekräftelsen.
