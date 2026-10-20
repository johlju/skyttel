# Arbeta med kartan genom en extern assistent

[Till användarguidens innehåll](README.md)

Skyttels anslutning ger en extern textassistent tillgång till ett valt
hushålls sparade karta och ditt eget privata utkast. Personer i kartan
ger aldrig inloggning. Du kan välja en läsanslutning eller uttryckligen
tillåta förslag och sparande. Äldre läsanslutningar förblir läsande.

## Anslut och välj AI-behandling

1. Öppna **Assistentanslutningar** från hushållets karta och kopiera
   MCP-adressen. Den slutar med `/mcp`.
2. Lägg till adressen i din textklient med OAuth. Logga in i Skyttel
   med ditt vanliga inloggningssätt när anslutningen ber om det.
3. Kontrollera ditt namn, Skyttel-användar-ID och klientens namn.
   Klientnamnet är klientens egen uppgift. Välj rätt hushåll.
4. Läs informationen om extern AI-behandling och välj om du tillåter
   behandlingen. Rutan är inte markerad från början. Välj därefter
   **Godkänn läsåtkomst**, eller **Nej, anslut inte**. Om klienten begär
   kartarbete behöver du också markera det separata valet om förslag
   och sparande och välja **Godkänn kartarbete**. Det medgivandet sparar
   inga kartuppgifter och ersätter inte ditt besked för varje sparande.

AI-valet är skilt från cookies och annan lagring. Ett nej lämnar
formulär och manuellt kartarbete tillgängliga. Den externa tjänsten
behandlar de hämtade uppgifterna enligt ditt avtal och dina inställningar
där. En databas i EU garanterar inte att all AI-behandling sker i EU.
Lägg inte lösenord eller andra hemligheter i kartan.

Be assistenten läsa det som behövs för frågan, exempelvis ett visst
objekt eller ditt utkast. En avgränsad objektläsning visar objektets
direkta inkommande och utgående samband. Andra ändpunkter visas med
namn, ID och typ, utan sina övriga uppgifter eller samband. Be om en
ny avgränsad läsning om även deras detaljer behövs. Bara berörda
typdefinitioner följer med; en sökning utan träffar lämnar inget
kartinnehåll. Andra medlemmars privata utkast ingår inte.
Sökning omfattar objektets eget namn, typ, egenskapsetiketter och värden.
Alla egenskapers identiteter, datatyper, värden och ordning följer med
objektets och sambandets fullständiga läsning. Be assistenten granska
kandidaternas uppgifter före ett ändpunktsval; lika namn är olika objekt.
Om resultatet uteblir ska assistenten inte påstå sig ha läst informationen.

## Förslag, rättelser och sparande

Be assistenten återuppta ditt utkast och beskriva hela skillnaden mot
den sparade kartan. Tidigare förslag från webbläsaren följer med.
Nya uppgifter och rättelser ändrar bara ditt privata utkast. Du kan
be assistenten kasta ett förslag eller hela utkastet; det ångrar inte
tidigare sparanden. Vanlig borttagning är också ett utkastförslag.

Använd aktuella typer och tydliga identiteter. Om flera personer kan avses
ska assistenten fråga före det berörda förslaget. Du kan uttryckligen
välja ett ospecificerat verkligt objekt när det är det du menar.
Uppgifter om osäkerhet eller att något saknas kan beskrivas med fria
egenskaper. Inga ersättningsobjekt eller egenskaper skapas automatiskt.

Du kan be assistenten lägga till, rätta, tömma, ta bort och ordna objektets
[fria egenskaper](map.md#beskriv-objekt-och-samband-med-fria-egenskaper).
Upprepade etiketter är separata egenskaper. Beskriv vilken post du menar
vid en rättelse. Typbyte bevarar egenskaperna och ordningen. Etiketter
som Pris och Slutdatum får ingen automatisk ekonomisk eller datumstyrd
verkan; ange uttryckligen om objektet är aktuellt eller upphört.

Ange datatyp när den inte framgår tydligt. Ett telefonnummer behandlas som
text när avsikten är entydig, så att inledande nollor bevaras. Vid oklar
datatyp eller flera möjliga egenskaper med samma etikett ska assistenten
fråga före den berörda ändringen. **Töm värdet** behåller egenskapen och
dess datatyp; **ta bort egenskapen** tar bort hela posten. En tom egenskap
kan också sakna vald datatyp. Tomt är skilt från noll, Nej och tom text.

Ett samband behöver två verkliga objekt. Om en ändpunkt saknas eller flera
objekt har samma namn ska assistenten fråga vilket objekt du menar.
Önskemålet finns kvar i samtalet medan du preciserar det. Annat giltigt
utkastarbete bevaras. Assistenten ska inte hitta på en motpart eller en
ersättningsegenskap för att kringgå frågan.

”Spara” gäller hela ditt aktuella utkast, även förslag från andra klienter.
En tydlig rättelse och ”spara” i samma meddelande kan utföras utan ett
extra ja bara för att rättelsen ger en ny utkastversion. ”Spara inte”
och hypotetiska frågor ska inte spara något. Om underlaget oväntat ändras
eller en konflikt uppstår ska assistenten beskriva det aktuella utkastet
och invänta ett nytt sparbesked. Oberoende delar sparas inte var för sig.
Du behöver inte besöka kartan eller gå igenom ett extra granskningssteg.

Assistenten ska ge ett kort besked utifrån Skyttels beständiga kvitto.
Kvitto och detaljer kan begäras vid behov. Om svaret försvinner är utfallet
okänt: be assistenten kontrollera sparförsöket innan något nytt görs.
Ett väntande försök kan återförsökas med samma identitet och innehåll;
ett genomfört försök ska bara återge det befintliga kvittot. Även
**Rapporter → Ändringshistorik** visar genomförda sparanden. Avbrutet samtal
betyder
inte att ett genomfört sparande är återställt.

Assistenten ansvarar för tolkningen av ditt besked. Servern kontrollerar
åtkomst, versioner och kartans regler. De kontrollerna bevisar inte
oberoende vad du faktiskt har sagt eller hört. Skyttel lagrar inte hela
samtalet som hushållsinnehåll.

## Egna typer, historik och rättelser av identitet

Du kan beskriva hyra, lån, kredit och avbetalning med fria egenskaper,
exempelvis Skuld, Kreditutrymme och Datum för uppgiften. Saknade fakta
fylls inte i.

Be assistenten läsa hushållets aktuella typer, även när kartan är tom.
Du kan föreslå egna typer och ändra förifyllda typers namn och gemensamma
beskrivning. Egna sambandstyper har benämningar från båda hållen och en
tydlig riktning. Egenskaperna hör till enskilda objekt och samband,
oberoende av deras typ. Assistenten använder samma definitioner, värden
och privata utkast som formulären.

Ett typbyte behåller objektets identitet, samband och fria egenskaper.
En använd definition kan inte tas bort, även om innehållet är upphört
eller bara används i ett beständigt privat utkast. Felet visar inte
andra användares privata uppgifter.

Be om relevant historik för att läsa tidigare värden, samband, tidpunkt
och författare. Assistenten använder samma sparade historik som
**Rapporter**. Rättelser görs som vanliga förslag i ditt utkast före ett
nytt sparbesked.

Upphört innehåll finns kvar i kartan. Vanlig borttagning bevarar
historiska uppgifter. Permanent radering är en separat
administratörsåtgärd som kan radera även historiska värden.

## Återkalla anslutningen

Öppna **Assistentanslutningar** och välj **Återkalla anslutning** för
klienten. Du kan återkalla dina egna anslutningar. Administratören kan
också återkalla medlemmarnas anslutningar i sitt hushåll. Återkallat
medlemskap stoppar alla berörda anslutningar, även redan öppna klienter.
En ny anslutning kräver ett nytt medgivande.

Återkallelsen stoppar nya läsningar, förslag och sparanden. Den raderar
inte information som den externa klienten redan har fått. Hantera den
informationen hos klienten enligt dess villkor och inställningar.

Användarhantering, fullständig export, återimport och permanent radering
görs genom Skyttels inloggade administrationssidor när funktionerna är
tillgängliga. Inte heller administratörens assistent har sådana verktyg.

## Välj textklient

Målet är ChatGPT på webben och Codex-appen. För ChatGPT anger OpenAI att
MCP-appar läggs till genom utvecklarläge med OAuth; kontot och arbetsytans
policy måste tillåta funktionen.
[OpenAI: utvecklarläge](https://developers.openai.com/api/docs/guides/developer-mode).

Codex kan använda Streamable HTTP och OAuth. MCP-inställningar delas av
de lokala klienter som OpenAI beskriver; webbklienten har egen installation.
[OpenAI: MCP](https://learn.chatgpt.com/docs/extend/mcp).

Tillgången till anslutningar beror på klienten, ditt konto och arbetsytans
inställningar. Om anslutningen inte är tillgänglig kan du fortsätta med
Skyttels formulär eller [Skriv till Skyttel](text-assistant.md#skriv-till-skyttel).
Den externa anslutningen gäller text. För röst använder du
[Tala med Skyttel](text-assistant.md#tala-med-skyttel) i appen.
