# Manuella testfall för sambandstyper

Testfallen omfattar riktning, gemensamma definitioner, privata utkast,
dubbletter och samtidiga ändringar.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

- Alex är administratör i testhushållet och loggar in med Google.
- Lo är vanlig medlem i samma hushåll och använder en separat profil.
  Alex bjuder in Lo enligt [tillgångsguiden](../user-guide/access.md).
- Kim är inloggad men saknar tillgång till hushållet.
- Alla uppgifter är påhittade och lagras i en separat testinstallation.

## Allmän förberedelse

När ett befintligt objekt eller samband ska ändras, välj det först i
kartan eller listan. Detaljpanelen visar uppgifterna. Välj sedan
**Redigera valt objekt** eller **Redigera valt samband** för att öppna
formuläret. I hel kartvy heter knappen **Redigera val**. Att bara välja
objektet eller sambandet öppnar inte formuläret.

1. Starta appen enligt
   [provförberedelsen](../development/devcontainer.md#disposable-local-database)
   med riktig SQLite. Börja varje fall i ett nytt hushåll utan privata förslag.
2. Använd [sambandstypguiden](../user-guide/relationship-types.md) för att hitta
   formulären. Starta bara om den separata testinstallationen.
3. Vid HTTP-kontroll, använd den inloggade profilens nätverkspanel.
   Kartans adress är `/api/households/<hushållets id>/map` och historiken
   har tillägget `/history`. Hushållets ID finns i kartans vanliga
   nätverksbegäran. Publicera inga sessionsuppgifter eller testinnehåll.

## Definition och koppling

### STY-01: Definition och valfria ändpunkter sparas tillsammans

**Syfte:** Kontrollera beständigt utkast, samlat sparande och historik.

**Användare:** Alex.

**Förutsättningar:** Typen Förvaring saknas.

**Integrationstest:**
[relationship-types.spec.ts](../../tests/integration/relationship-types.spec.ts),
testfallet “STY-01: a directed definition and arbitrary endpoints share a
durable draft, save and history”.

**Steg:**

1. Skapa Förvaring med beskrivningen Var hushållets saker finns och
   benämningarna förvaras i och innehåller. Lägg typen i utkastet.
2. Skapa Alex blå cykel och Garaget med valfria olika objekttyper.
   Koppla cykeln till garaget med den nya sambandstypen.
3. Starta om och ladda om. Kontrollera kartans HTTP-svar: definitionen,
   objekten och sambandet finns bara i det egna utkastet.
4. Spara hela utkastet. Läs kvittot, starta om igen och läs kartan samt
   historiken. Återförsök samma sparbegäran med samma operations-ID och
   utkastversion via nätverkspanelen.

**Förväntat resultat:**

- Definition och innehåll finns kvar i utkastet efter omstart och blir
  gemensamma tillsammans vid sparandet.
- Båda benämningarna, stabila identiteter och definitionsversion finns
  i kartan och kvittot. Historik och återförsök ger samma kvitto.

### STY-02: Båda benämningarna öppnar samma riktade samband

**Syfte:** Kontrollera formulär, obligatorisk typ och rättade definitioner.

**Användare:** Alex.

**Förutsättningar:** Alex blå cykel och Garaget finns i utkastet.

**Integrationstest:**
[relationship-types.spec.ts](../../tests/integration/relationship-types.spec.ts),
testfallet “STY-02: forms show the same directed relationship from both
objects and edit the shared definition”.

**Steg:**

1. Skapa Förvaring med benämningarna och beskrivningen i STY-01.
2. Öppna Nytt samband och välj cykeln samt garaget. Prova att lägga
   kopplingen i utkastet utan typ. Välj sedan Förvaring och lägg till.
3. Granska definition och koppling tillsammans. Prova ett identiskt
   tillägg i samma utkast och läs beskedet med cykelns och garagets namn.
   Spara hela utkastet och ladda om. Öppna cykeln och läs dess samband.
   Stäng och öppna garaget.
4. Klicka på garagets samband. Kontrollera att startobjektet fortfarande
   är cykeln och målobjektet garaget. Stäng sambandsformuläret.
5. Ändra typens namn till Plats, beskrivningen till Hushållets
   förvaringsplatser och startbenämningen till finns i. Granska skillnaden,
   spara och ladda om. Läs kartans samband via HTTP.

**Förväntat resultat:**

- Kopplingen kräver en typ. Benämningarna beskriver samma samband:
  cykeln förvaras i garaget och garaget innehåller cykeln.
- Även när typen är privat beskriver ett upprepat tillägg det befintliga
  sambandet med namn och benämning utan att skapa en dubblett.
- Definitionens rättelse ändrar visad text men inte sambandets identitet,
  revision, startobjekt eller målobjekt. Bara ett samband finns.

### STY-03: Medlemmar redigerar typer utan att privata förslag röjs

**Syfte:** Kontrollera medlemsroll, förifyllda typer och hushållsgränser.

**Användare:** Alex, Lo och Kim.

**Förutsättningar:** Lo är vanlig medlem och Kim saknar tillgång.

**Integrationstest:**
[relationship-types.spec.ts](../../tests/integration/relationship-types.spec.ts),
testfallet “STY-03: members share editable prefills while private definitions
and household boundaries stay protected”.

**Steg:**

1. Lo lägger Förvaring i sitt utkast. Alex laddar om och läser kartan.
   Lo sparar, varefter Alex laddar om igen.
2. Lo ändrar en förifylld typ till Redigerad förifylld typ och anger båda
   benämningarna. Spara, ladda om och öppna Nytt samband.
3. Alex skapar och sparar en separat typ som också heter Förvaring.
4. Kopiera Alex vanliga typbegäran i nätverkspanelen. Prova tomt namn,
   tom benämning från respektive håll och ett extra `fields: []` i
   definitionen. Använd aktuell utkastversion för varje försök.
5. Kim försöker läsa kartan och skicka en typbegäran till samma adress.

**Förväntat resultat:**

- Privata definitioner röjs inte. Vanliga medlemmar får skapa typer och
  rätta förifyllda definitioner; formuläret visar aktuellt namn.
- Lika namn ger två separata identiteter. Ogiltiga definitioner ger
  HTTP 400 och ändrar inget utkast. Sambandstyper har inga egna fält.
- Kim får HTTP 403 för både läsning och ändring.

## Samtidighet och dubbletter

### STY-04: Konfliktval bevarar oberoende definitionsändringar

**Syfte:** Stoppa hela sparandet och bevara oberoende rättelser i historiken.

**Användare:** Alex och Lo.

**Förutsättningar:** Förvaring är sparad med benämningarna i STY-01.

**Integrationstest:**
[relationship-types.spec.ts](../../tests/integration/relationship-types.spec.ts),
testfallet “STY-04: stale definitions stop the whole save and explicit
resolution preserves independent edits”.

**Steg:**

1. Alex ändrar typnamnet till Plats och målbenämningen till har. Lägg
   definitionen samt nya objekt och ett samband av typen i utkastet.
2. Lo ändrar beskrivningen till Los nya förklaring och målbenämningen
   till rymmer. Lo sparar före Alex.
3. Alex försöker spara. Hämta aktuellt underlag och läs konflikten.
   Kontrollera att inga av Alex objekt sparas och att utkastet finns kvar.
4. Välj Behåll min sambandstyp. Kontrollera den bevarade beskrivningen
   och att objekten fortfarande är privata. Ge ett nytt sparbesked.
5. Starta om och läs kartan samt historiken via HTTP.

**Förväntat resultat:**

- Hela det äldre sparandet stoppas. Konfliktvalet ändrar bara utkastet.
- Det nya sparandet innehåller Plats, Los nya förklaring och har samt
  objekten och sambandet. Historiken bevarar även Los tidigare definition
  med rymmer. Sambandets definitionsunderlag motsvarar den nya versionen.

### STY-05: Dubbletter ger ett begripligt resultat utan delsparande

**Syfte:** Kontrollera tillägg, ändring och samtidiga försök med egna typer.

**Användare:** Alex och Lo.

**Förutsättningar:** Cykeln, Garaget och Förrådet finns samt typerna
Förvaring och Annan betydelse, med skilda identiteter.

**Integrationstest:**
[relationship-types.spec.ts](../../tests/integration/relationship-types.spec.ts),
testfallet “STY-05: duplicate adds, edits and concurrent saves preserve
identity and reject every partial write”.

**Steg:**

1. Skapa och spara ett samband av varje typ från cykeln till garaget.
   Prova ett identiskt tillägg av Förvaring. Kontrollera befintlig identitet
   i tilläggsbegärans HTTP-svar.
2. Försök ändra det andra sambandet till Förvaring med samma ändpunkter.
   Kontrollera avvisningen och att både karta och utkast är oförändrade.
3. Ändra i stället det andra sambandet till Förvaring i omvänd riktning.
   Markera Upphört och ange slutdatum `2020-01-01`. Granska och spara.
4. Alex föreslår ett nytt typnamn, ett nytt objekt och Förvaring från
   cykeln till förrådet. Lo lägger samma samband i sitt eget utkast och
   sparar först. Alex försöker sedan spara hela utkastet.
5. Kontrollera att inget av Alex förslag sparas. Hämta aktuellt underlag,
   välj Använd sparat värde för dubbletten och spara återstående förslag.
   Läs kartan och historiken via HTTP.

**Förväntat resultat:**

- Ett upprepat tillägg ger befintligt samband; en överlappande ändring
  avvisas. Olika typer och motsatt riktning kan ha separata samband.
- Samtidig dubblett stoppar hela sparandet, även typnamn och nytt objekt.
  Efter konfliktval finns Los samband kvar utan Alex dubblett.
- Historiken bevarar tidigare typ, riktning och ändpunkter. Status och
  slutdatum hör till samma samband efter rättelsen.
