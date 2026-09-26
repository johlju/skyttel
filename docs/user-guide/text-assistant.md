# Skyttels textassistent

[Till användarguidens innehåll](README.md)

Öppna **Skyttels textassistent** i hushållets karta. Godkänn separat att
OpenAI behandlar uppgifter och att assistenten får föreslå ändringar och
spara när du ber om det. Detta är skilt från cookieval och andra klienters
medgivanden. Om assistenten inte är tillgänglig fungerar kartans formulär.

Assistenten finns i kartans detaljdel. I rymdkartans helskärmsvy väljer du
**Visa detaljer och utkast** för att öppna den. Samtalet och oskickad text
finns kvar när du växlar tillbaka till kartan.

Beskriv vad du vill hitta, lägga till eller rätta. Assistenten använder
hushållets egna typer och ditt befintliga privata utkast. Förslag från
andra klienter ingår också. Oskickad formulärtext ligger kvar i formuläret
och ingår först när du lägger den i utkastet.

## Tala med Skyttel

Välj **Starta röst** i ditt pågående samtal och tillåt mikrofonen i
webbläsaren. Rösten använder samma utkast och regler som textassistenten.
OpenAI behandlar ljudet när rösten är igång. Mikrofonen startar först när
du väljer det och anslutningen är klar. Om webbläsaren blockerar ljudet,
välj **Spela upp ljud**. Du kan fortsätta med text eller formulär när
mikrofonen eller ljuduppspelningen inte fungerar.

**Lyssnar** betyder att rösten är ansluten. **Assistenten arbetar** visar
att ett uppdrag pågår, med ökande tid längst ned på skärmen.
Om ett sparresultat är oklart visas att det tidigare
sparförsöket måste kontrolleras innan nya ändringar.

Skyttel ger korta resultatbesked, exempelvis **Utkastet är uppdaterat**
eller **Sparat**, utan att läsa upp ändringarna efter varje steg.
Be om detaljer när du vill höra dem. Nödvändiga följdfrågor och felbesked
ges även när vanliga bekräftelser är korta.

I **Samtalet** visas både dina ord och Skyttels svar löpande. Tidigare
rader finns kvar under samtalet. Korta pauser kan fortsätta samma rad.
Välj **Pausa mikrofon** för att sluta skicka ljud utan att avsluta samtalet;
du kan fortfarande höra Skyttel. **Återuppta mikrofon** fortsätter med
samma anslutning. En pausad mikrofon förblir pausad efter en kort störning.

Beskriv ärendet på svenska, svara på följdfrågor och rätta uppgifter med
rösten. Säg exempelvis **Rätta priset till 189 kr och spara** för ett
samlat sparande. En paus, ett ofullständigt fragment eller ett tidigare
sparbesked ger inte tillåtelse för ett nytt sparande. Vid oklarheter
behövs ett nytt tydligt besked. Kvittot och kartans verkliga markering
är bekräftelsen även när du använder röst.

**Stäng av rösten** stoppar mikrofonen och pågående röstarbete. Nytt tal
kan också avbryta ett äldre uppdrag. Vid bruten anslutning stängs
mikrofonen av medan anslutningen kontrolleras; en längre störning kräver
ett nytt startval. Ett ljudsvar som inte hördes betyder inte att ett
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
detaljer från det sparandet i samtalet. **Assistentens samtalstext – inte en
bekräftelse** visar modellens frågor och svar separat. Texten kan innehålla
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
det pågående samtalet. Felminnet följer samtalet och försvinner när det
avslutas. Ett oklart sparresultat behöver kontrolleras innan ett nytt
uppdrag kan börja.

**Stäng av rösten** behåller den synliga dialogen i det pågående samtalet.
**Avsluta textassistenten** tar bort anslutningen och samtalsminnet.
Dialogen försvinner också vid omladdning eller när åtkomsten upphör.
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
