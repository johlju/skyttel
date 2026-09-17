# Externa AI-assistenter och privat åtkomst till Skyttel

Kunskapsläge: 2026-09-13. Underlag för
[Hur kan externa AI-assistenter läsa och föreslå ändringar i Skyttel?](https://github.com/viscalyx/skyttel/issues/5).
Använd rapporten som tekniskt jämförelseunderlag inför integrationsprov.
Produktkrav och arkitekturbeslut finns i [beslutsöversikten](../planning/README.md).
Rapportens förslag och frågor är underlag, inte gällande krav eller en lista
över öppna beslut. Kontrollera aktuellt klientstöd inför implementation;
uppgifterna gäller kunskapsläget ovan.

## Slutsats för den fortsatta diskussionen

Externa assistenter kan anslutas genom verktyg som läser eller ändrar ett
systems data. MCP standardiserar sådana verktyg; varje assistentklient avgör
vilka funktioner och gränssnitt den stöder.
[MCP: verktyg](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).

Rapportens rekommendation att bedöma mot produktbesluten är:
behåll en gemensam uppsättning regler för läsning, ändringsförslag och
verkställande, oavsett om samtalet sker i Skyttel eller i en extern assistent.
Den externa assistenten får bara de rättigheter och uppgifter som användaren
väljer att lämna ut. Ett sparat förslag är också privat applikationsdata.

Projektets fasta förutsättning är att källkoden är publik och alla uppgifter
som användare matar in är privata. Publika rapporter, ärenden och testfall
ska därför endast innehålla syntetiska exempel. Kontrollera produktbesluten
innan privata uppgifter skickas till en molnleverantör.

## Tre skilda sätt att koppla ihop systemen

1. **AI inne i Skyttel via ett modell-API.** Modellen kan begära ett
   funktionsanrop som Skyttels kod utför och skickar tillbaka resultatet från.
   MCP behövs inte för den mekanismen. Detta är ett eget applikationsflöde,
   inte automatiskt en anslutning till användarens externa AI-assistent.
   [OpenAI: function calling](https://developers.openai.com/api/docs/guides/function-calling).
2. **Extern assistent via MCP.** Skyttel kan exponera namngivna verktyg med
   indata- och resultatscheman. Verktygen kan anropa Skyttels funktioner;
   protokollet kräver inte direkt tillgång till en databas. Protokollet
   föreskriver heller inget visst användargränssnitt.
   [MCP: verktyg](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).
3. **Lokal eller fjärransluten MCP-server.** `stdio` kör servern som en process
   som klienten startar. Streamable HTTP ansluter till en separat server.
   En lokal server kan ge tillgång till lokala data, men det säger inget om
   var assistentens modell behandlar svaren. Den sista slutsatsen följer av
   att transport och modell är olika delar av arkitekturen.
   [MCP: stdio](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio),
   [MCP: Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http),
   [MCP: arkitektur](https://modelcontextprotocol.io/specification/2026-07-28).

En separat API-adapter kan alltså räcka för ett eget samtalsgränssnitt. MCP
är en kandidat för flera externa klienter. Inget av alternativen bestämmer
lagring, grafdatabas eller 3D-teknik; det är en slutsats för Skyttels planering.

## Dokumenterat stöd hos representativa klienter

### ChatGPT och lokala Codex-klienter

ChatGPT på webben kan använda fjärranslutna MCP-verktyg genom installerade
plugins. Desktopappen och lokala Codex-klienter kan även ansluta till `stdio`
och Streamable HTTP med exempelvis OAuth. Webbklienten läser inte den lokala
Codex-konfigurationen. Stödet för lokalt konfigurerade servrar kan skilja sig
från stödet för pluginverktyg i molnet.
[ChatGPT Learn: MCP](https://learn.chatgpt.com/docs/extend/mcp).

OpenAI beskriver testanslutning i utvecklarläge via publik HTTPS eller Secure
MCP Tunnel till en privat server. Tunnelalternativet för utveckling ersätter
inte kravet på publik HTTPS vid plugininlämning. Tillgång till utvecklarläge
beror på konto och arbetsytans policy; dokumentationen ger inte en fullständig
garanti för varje abonnemang och miljö.
[OpenAI: anslut och testa plugins](https://developers.openai.com/plugins/deploy/connect-chatgpt).

ChatGPT Voice dokumenteras för Chat, Work och Codex i desktopappen samt via
Remote på iOS med parkopplad desktopvärd. Plus, Pro, Business, Edu och
Enterprise anges; utrullning, arbetsyteinställningar och separata röstgränser
påverkar åtkomst. Röst följer uppgifternas behörigheter.
[ChatGPT Learn: Voice](https://learn.chatgpt.com/docs/features/voice).

**Begränsning:** detta belägger inte hela kombinationen svensk röst,
egen Skyttel-plugin, privata läsningar, ändringsförslag och granskning av
3D-kartan på varje klient. Kombinationen behöver ett praktiskt test. API-stöd
för röst eller verktyg är heller inget löfte om motsvarande ChatGPT-funktion.

### Claude

Claude beskriver egna fjärranslutna MCP-anslutningar för Free, Pro, Max, Team
och Enterprise; Free begränsas till en egen anslutning. Verktyg kan läsa,
skapa, ändra och radera data. Team och Enterprise kräver att en ägare först
lägger till anslutningen, varefter användarna ansluter individuellt.
[Claude: anslutningar](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities),
[Claude: egna MCP-anslutningar](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Fjärranslutningarna går från Anthropics molninfrastruktur, även när användaren
kör desktopappen. Servern måste vara nåbar därifrån. Lokala MCP-servrar är en
separat anslutningsväg; desktoputökningar anges för Desktop och Claude Code,
inte webb eller mobil.
[Claude: nätverkskrav](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp),
[Claude: lokala och fjärranslutna verktyg](https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors).

Claude dokumenterar röstläge på mobil, desktop och webb för alla planer och
att anslutna verktyg fungerar som i textchatt. Röst är beta; flera språk
stöds, men svensk kvalitet är inte belagd här. Alla resultat kan inte visas
i röstläget. Claude Code och Cowork har diktering, men inte detta röstläge.
[Claude: röstläge](https://support.claude.com/en/articles/11101966-use-voice-mode).

**Begränsning:** det finns dokumenterat stöd för anslutna verktyg i röstläge,
men den egna Skyttel-anslutningen, dess granskningsvy och lokala varianter
behöver fortfarande verifieras. Abonnemang och aktuell klient påverkar utfallet.

## Privat data kräver kontroll i Skyttel

MCP:s HTTP-auktorisering bygger på OAuth. En skyddad server kontrollerar
åtkomsttoken på varje begäran, dess giltighet och att token gäller just den
servern. Scopes begränsar tillåtna operationer. MCP definierar inte Skyttels
hushåll eller roller; dessa regler behöver produkten själv uttrycka.
[MCP: auktorisering](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

Klientidentitet och användaridentitet är skilda. OpenAI anger exempelvis att
mTLS kan identifiera ChatGPT som klient, medan OAuth fortfarande behövs för
slutanvändaren och verktygsåtkomsten. Tokenkontroll och lokala policykontroller
är serverns ansvar.
[OpenAI: autentisering](https://developers.openai.com/plugins/build/auth).

**Konsekvens för Skyttel:** härled användare och tillåtna hushåll från betrodd
autentisering och kontrollera varje läsning och ändring där reglerna verkställs.
Lita inte på att modellen anger rätt hushåll eller person i ett verktygsanrop.
Ett publikt nåbart API kan skydda privata uppgifter med autentisering och
behörigheter; publik källkod ger ingen rätt att läsa driftsdata.

Verktygsmetadata är beskrivningar, ingen behörighetskontroll. MCP kräver att
klienten behandlar annotationer som obetrodda om servern inte är betrodd.
OpenAI:s API har konfigurerbara MCP-godkännanden som kan hoppas över. Claude
har också möjlighet att alltid tillåta ett verktyg.
[MCP: verktygsmetadata](https://modelcontextprotocol.io/specification/2026-07-28/server/tools),
[OpenAI: MCP-godkännanden](https://developers.openai.com/api/docs/guides/tools-connectors-mcp),
[Claude: verktygsåtgärder](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

**Konsekvens:** en extern bekräftelsedialog eller ett modellargument som
`confirmed: true` bevisar inte att rätt Skyttel-användare godkänner den exakta
ändringen. Inloggning, delegerad åtkomst och godkännande av ett visst förslag
behöver definieras var för sig.

## Ett förslagsflöde att pröva

Bedöm följande designförslag mot produktbesluten inför ett integrationsprov:

1. **Läs begränsat.** Sök och hämta bara de objekt och relationer som behövs
   för uppgiften och som användaren får se.
2. **Föreslå.** Assistenten skickar strukturerade ändringar. Skyttel validerar
   identifierare och relationer och returnerar ett privat förslag med ID,
   versionsunderlag, oklarheter och begriplig sammanfattning. Att lagra
   förslaget kräver egen skrivrättighet, även om nätverket ännu inte ändras.
3. **Granska.** Visa förslaget i Skyttels karta och låt användaren rätta det.
   En länk till förslaget kräver inloggning; själva länken ger ingen åtkomst.
4. **Verkställ.** Skyttel kontrollerar behörighet och ett godkännande bundet
   till exakt förslagsversion. Upprepade anrop ska inte skapa dubbletter;
   samtidiga ändringar ska upptäckas. Gruppen ändringar blir en begriplig
   enhet att bekräfta, spåra och vid behov ångra.

En första prototyp kan låta den externa assistenten läsa och lämna förslag,
med godkännande i Skyttel. Om även verkställandet ska kunna ske helt genom
den externa assistenten behövs ett särskilt beslut om delegering och hur
Skyttel verifierar godkännandet. Det följer inte automatiskt av MCP-stöd.

Förslag, ljud, transkript, ändringshistorik, felsökningsloggar och verktygssvar
omfattas av privatkravet. Kontrollera produktbesluten om vilka av dessa som
får lämna enheten, bevaras av en assistentleverantör eller synas för andra
hushållsmedlemmar. Lokal MCP innebär ingen garanti om lokal eller offline AI.

## Frågor att kontrollera mot produktbesluten

- Ska externa assistenter ingå i första versionen, eller förberedas senare?
- Får privata uppgifter skickas till en vald assistentleverantör, vilka
  uppgifter i så fall, och under vilka lagrings- och raderingsvillkor?
- Ska externa assistenter läsa, lämna förslag eller även verkställa?
- Är granskning i Skyttel godtagbar, även när samtalet börjar på telefonen?
- Vilka personer, hushåll och objekt får varje anslutning använda, och hur
  återkallar användaren åtkomsten?
- Vilka faktiska klienter, abonnemang och enheter ska den första versionen
  fungera med? MCP-version och tillägg behöver verifieras för dessa klienter.

## Verifieringsnivå och nästa praktiska kontroll

Underlaget bygger på primärkällor och MCP-specifikationen 2026-07-28;
det bevisar inte att varje klient stöder hela den versionen.
Undersökningen omfattar inga integrationsprov med Skyttel, betalda
modell-API-anrop, kontokopplingar eller privata hushållsdata. Använd
[beslutsöversikten](../planning/README.md) för att hitta beslut och separat
verifiering av MCP-flödet.

En senare prototyp bör använda syntetiska hushåll och kontrollera svensk
röst, felaktiga relationer, åtkomst mellan hushåll, utgången eller återkallad
åtkomst, ändringar under granskning och återförsök efter avbrott. Kontrollera
också vad assistenten säger när bara ett förslag finns: den får inte beskriva
nätverket som uppdaterat före verkställandet. Detta är föreslagna
acceptanskriterier, inte resultat från tester.
