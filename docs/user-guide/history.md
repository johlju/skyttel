# Läs historik och ångra ett sparande

[Till användarguidens innehåll](README.md)

Även en [sammanslagning av objekt](object-merge.md) kan ångras genom
samma flöde, med ursprungliga identiteter och samband bevarade.

Alla hushållets medlemmar kan läsa **Ändringshistorik**. Välj **Visa
historik** för att se sparade ändringsgrupper. Varje grupp hör till ett
helt sparande och visar tidigare och nya värden, objekt, samband och
berörda typdefinitioner. Rubriken visar tidpunkten och den som sparar.
Öppna **Identifiera sparandet och användaren** när du behöver deras ID:n.
Äldre grupper kan sakna användarens namn; användarens ID finns ändå kvar.

Privata utkast ingår inte i historiken. Ett nytt förslag, ett konfliktval
eller **Kasta hela utkastet** skapar ingen sparad ändringsgrupp.

## Ångra en ändringsgrupp

1. Hitta rätt grupp under **Ändringshistorik**. Läs tidigare och nya värden,
   tidpunkten och den som sparar för att skilja liknande ändringar åt.
2. Välj **Ångra sparandet** i gruppen. Skyttel räknar fram ett nytt privat
   förslag mot den karta som gäller nu. Den gemensamma kartan ändras inte.
3. Granska **Hela mitt utkast**. Ångringen omfattar hela det valda sparandet,
   tillsammans med de oberoende förslag som redan finns i ditt utkast.
4. Gör eventuella konfliktval och granska hela resultatet igen.
5. Välj **Spara hela utkastet** när du vill göra ändringarna gemensamma.
   Du får ett nytt kvitto och en ny grupp i historiken. Den ursprungliga
   gruppen finns kvar oförändrad.

Oberoende senare ändringar bevaras. Om du exempelvis ångrar ett namnbyte
behålls en beskrivning som någon lägger till senare. Om någon i stället
ändrar samma namn igen visas en konflikt. Välj **Behåll mitt förslag**
eller **Använd sparat värde**, granska resten av utkastet och ge ett nytt
sparbesked. Valet sparar inget i sig.
**Använd sparat värde** vid ångring bevarar dina oberoende egna ändringar;
eventuella kvarvarande konflikter måste också lösas före sparande.

## När du redan har ett utkast

Oberoende privata förslag finns kvar när ångringen läggs till. Om ditt
utkast överlappar ändringarna som ska ångras stoppas hela ångringen.
Ingen del läggs till och ditt befintliga utkast är oförändrat.

Granska det berörda förslaget. Spara det om du vill genomföra det, eller
välj **Kasta förslaget** för att ta bort just det egna förslaget. Försök
sedan ångra sparandet igen. Att kasta ett förslag ändrar aldrig den
gemensamma kartan. Ett förslag som behövs av andra delar av utkastet kan
kräva att även de delarna granskas.

**Kasta hela utkastet** tar bort alla dina osparade förslag, även förslaget
att ångra. Knappen ångrar aldrig ett genomfört sparande. Förslag som har
lagts i utkastet finns kvar efter omladdning och omstart och kan granskas
från en annan klient med samma inloggning och hushåll.

## Återställ borttaget innehåll

Ångra gruppen där innehållet tas bort för att föreslå återställning av
objekt och tillhörande samband. De behåller sina identiteter, tidigare
värden och status. Ett objekt med **Upphört** blir alltså inte gällande
bara för att det återställs. Andra objekt påverkas inte av återställningen.
Öppna **Objektets identitet** eller **Sambandets objektidentiteter** för
att skilja objekt med samma namn åt.

Typdefinitioner och egna fält som ingår i sparandet följer också med i
granskningen. En definition som fortfarande behövs av annat innehåll
kan inte tas bort genom ångring utan att användningen hanteras.
När innehållet behöver en typ som saknas i katalogen visar utkastet
**Återställ objekttyp** eller **Återställ sambandstyp**. Granska och
spara definitionen tillsammans med innehållet. Läs om
[katalogborttagning och återställning](definition-removal.md).

Återställning tar också med äldre fält som behövs för objektets värden.
Om fältet saknas eller har ett annat värdeslag visas en konflikt för
typdefinitionen. Granska det äldre värdeslaget tillsammans med dagens
definition. Oberoende namn, beskrivningar och andra fält behålls.
Ett värdeslag som används av annat innehåll eller ett annat privat utkast
kan inte bytas genom konfliktvalet.

Om du väljer **Använd sparad typdefinition** och det äldre värdet inte
passar finns objektförslaget kvar som en konflikt. Värdet omvandlas inte.
Rätta objektförslaget uttryckligen eller välj **Använd sparat värde** för
att avstå från återställningen av objektet. Granska hela utkastet innan
du sparar igen.

Vanlig borttagning har ingen automatisk tidsgräns för bevarat innehåll.
Permanent raderad information kan aldrig återställas genom ångring.
Administratörer använder det separata, uttryckligt bekräftade flödet för
[permanent radering](household-erasure.md).
Läs mer om [upphört, borttaget och permanent raderat](lifecycle.md).
