# Privata utkast sparas som en kontrollerad ändringsgrupp

Användaren granskar förslag löpande i sitt privata, beständiga utkast och
godkänner hela det aktuella utkastet genom ett uttryckligt sparbesked,
så att samtalets sammanfattning ersätter ett separat granskningssteg.
Servern kontrollerar åtkomst, utkastversion, berörda värden och
domänvillkor och skriver karta, historik, förbrukad version och kvitto
tillsammans; kvittot styr bekräftelsen och samma operations-ID med samma
innehåll ger samma resultat vid återförsök.
En entydig rättelse med sparbesked får slutföras utan extra ja, medan
konflikter kräver ett aktuellt sparbesked. Historiken visar genomförda
sparanden med historiska värden och typdefinitioner. Historisk ångring
och sammanslagning av objekt erbjuds inte i gränssnitt eller
samtalsverktyg; rättelser använder vanliga förslag i det egna utkastet.

Varje effektivt samband har två befintliga ändpunkter i hushållets karta
eller det egna utkastet. Inaktuella förslag bevaras utanför den effektiva
kartans samband och blockerar hela sparandet tills användaren rättar eller
kastar dem; objektborttagningar undertrycker berörda sambandsförslag så att
återtagning kan återge arbetet utan att återta separata borttagningar.
Nya samtidiga borttagningsföljder kräver aktuell granskning och ett nytt
sparbesked, medan oberoende egenskapsändringar kombineras efter identitet
och motstridiga värden eller ordning kräver uttryckligt val.

## Beständiga utfall efter avbrott

För utvecklare som underhåller kartarbete gäller att en utkastbatch och
underlaget som bekräftar dess genomförande ska skrivas i samma transaktion.
Ett förlorat svar är inte bevis på att batchen saknar effekt. Samma
operation återger sitt verifierade utfall utan nya ändringar. Aktuell
åtkomst, användare, hushåll, innehållsägare och innehållsversion kontrolleras
även vid återhämtning.

Det beständiga underlaget innehåller endast operationsidentitet,
innehållsversion, utkastets version före och efter samt antal operationer.
Kontrollsummor av begäran och det genomförda utkastet skiljer exakt
återleverans från återanvänd identitet och visar om utkastet fortfarande
är aktuellt. Ursprungliga argument, utkastvärden och mellanresultat lagras
inte i detta underlag. Det undviker en extra historik över privata värden
som användaren rättar, kastar eller tar bort. Rika före- och efteruppgifter
kan användas för det pågående svaret utan att sparas med utfallet.

Återhämtning läser det verkliga aktuella utkastet. Ett tidigare genomförande
består som verifierat utfall efter senare ändringar, men får inte användas
som om dess gamla utkast fortfarande gällde. Skyttel pausar fortsatt arbete
när underlaget har ändrats och ber användaren granska det och förtydliga
fortsättningen. Ett registrerat sparförsök kontrolleras separat före nya
ändringar. Statuskontroll får slutföra samma försök utan ett nytt sparförsök
eller modellarbete; fortsatt okänt utfall behåller spärren.

Batchutfall och registrerade sparförsök har egna livslängder oberoende av
samtalet. Byte av innehåll eller innehållsägare tar bort batchens underlag
och kontrollsummor. Det gäller även återimport och permanent radering.
Endast hushållet och den ogenomskinliga operationsidentiteten finns kvar
som spärr mot att en gammal operation får en ny effekt på ersatt innehåll.
Den spärren innehåller inga utkastvärden eller användarnamn och försvinner
om hushållet tas bort. Batchunderlaget följer inte med hushållets export.
