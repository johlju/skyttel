# Manuella testfall för bevarat hushållsarbete

Fallen gäller tillfälliga besök i befintliga vyer under samma användning.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex är administratör i ett separat provhushåll. Robin är medlem och
använder en separat webbläsarprofil. Använd konfigurerade testidentiteter
eller den kontrollerade miljön nedan, aldrig verkliga hushållsuppgifter.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

1. Förbered en
   [separat provdatabas](../development/devcontainer.md#disposable-local-database).
   Skapa hushållet och ge Robin tillgång enligt
   [inbjudningsguiden](../user-guide/access.md#bjud-in-en-skyttel-användare).
2. För samtalsfallen används den kontrollerade
   [kostnadsmiljön](costs.md#controlled-cost-fixture): den har både två
   identiteter, automatiska textsvar och tyst taltransport. Följ dess
   start- och stoppanvisningar. Logga in som Alex med Google och skapa
   ett tomt hushåll. Kör `text known` i startterminalen. För ARBETE-03,
   kör `identity robin`, logga in med Microsoft i en separat profil och
   bjud in Robins ID från Alex profil. Acceptera som Robin; behåll rollen
   medlem. Befintliga sessioner påverkas inte av identitetsvalet.
   Välj medgivandena och **Starta textassistenten**, sedan **Starta röst**
   när ett fall kräver samtal. Miljön ersätter taltransporten och provar
   inte fysiskt ljud.
3. Börja varje fall med en ny provinstallation eller ett tomt utkast utan
   pågående sparande. Behåll fliken och databasen under varje fall.
4. Prova ARBETE-01 på dator och mobil. Använd även tangentbord och
   skärmläsare: kontrollera logisk ordning, synligt fokus och att dolda
   kartkontroller inte går att nå. Dokumentera fysiska enheter och
   hjälpmedel separat från automatiserad Chromium-emulering.

## Tillfälliga vybyten

### ARBETE-01: oskickad formulärtext och sökning finns kvar

**Syfte:** Återgå till oskickat arbete utan att göra det till ett utkast.

**Användare:** Alex.

**Förutsättningar:** Tomt utkast, ingen aktiv redigering.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallen “ARBETE-01: unsent household work survives ordinary navigation
at 1280px”, “ARBETE-01: unsent household work survives ordinary navigation
at 390px” och “ARBETE-01: unsent household work survives ordinary navigation
at 320px”.

**Steg:**

1. Välj **Nytt objekt**. Skriv **Oskickad cykel** och beskrivningen
   **Behåll denna text**. Öppna Lista igen och skriv **cykel** i
   **Sök objekt**. Välj **Nytt objekt** i panelväljaren och fokusera namnfältet.
2. Använd Tab och Enter för att besöka **Inloggningssätt**. Kontrollera
   rubrikfokus och att kartan och dess formulär inte går att nå.
3. Välj **Till startsidan** med tangentbordet. Kontrollera namn,
   beskrivning, sökning och fokus. Kontrollera att utkastet ännu är tomt.
4. Välj **Lägg i mitt utkast** och kontrollera förslaget.

**Förväntat resultat:**

- Alla tre texter finns kvar efter återgång. Namnfältet får fokus.
- Inget förslag skapas förrän formuläret uttryckligen skickas.
- Dolda kontroller stör inte navigationen på den andra sidan.

### ARBETE-02: samtal och mikrofon består och avslutas vid utloggning

**Syfte:** Bevara samtalet och styra mikrofonen från en annan vy.

**Användare:** Alex.

**Förutsättningar:** Startat samtal enligt förberedelsen.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-02: conversation and microphone survive navigation and
end on logout”.

**Steg:**

1. Skicka en textfråga om cykeln. Den kontrollerade miljön svarar automatiskt
   **Det kontrollerade kostnadsprovet är klart.** Anteckna svaret och skriv
   ett nytt svar utan att skicka det.
2. Besök **Inloggningssätt**. Kontrollera att mikrofonen är på. Välj
   **Pausa mikrofon** och återgå med **Till startsidan**.
3. Kontrollera samtalets tidigare texter, det oskickade svaret och pausläget.
   Återuppta mikrofonen.
4. Besök **Inloggningssätt** igen och välj **Logga ut**.

**Förväntat resultat:**

- Samtalstext och oskickat svar bevaras. Pausat lyssnande förblir pausat.
- Mikrofonen går att styra i den andra vyn utan att starta ett nytt samtal.
- Utloggning visar inloggningen, tar bort samtalet och stoppar mikrofonen.
  Den automatiserade mediegränsen verifierar stoppade ljudspår; ett
  fysiskt mikrofonprov redovisas separat.

### ARBETE-03: återkallad tillgång avvecklar dolt arbete

**Syfte:** Bevarande ger inte fortsatt tillgång efter återkallelse.

**Användare:** Alex och Robin i separata profiler.

**Förutsättningar:** Robin har ett startat samtal och mikrofonen är på.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-03: revoked household access retires hidden forms and
microphone”.

**Steg:**

1. Som Robin, öppna **Nytt objekt**, skriv **Privat oskickad cykel** och
   besök **Inloggningssätt** utan att skicka formuläret.
2. Som Alex, öppna **Administrera tillgång**, återkalla Robins tillgång
   och bekräfta återkallelsen.
3. Vänta på Robins åtkomstkontroll, högst tio sekunder. Kontrollera
   mikrofonen och välj **Till startsidan**.

**Förväntat resultat:**

- Robins mikrofon stoppas även när kartan inte visas.
- Återgång visar saknad tillgång. Det gamla formuläret är borta och
  hushållsinnehållet är inte åtkomligt.

### ARBETE-04: ersatt innehåll avvecklar tidigare arbete

**Syfte:** Gamla formulär och samtal får inte fortsätta mot ersatt innehåll.

**Användare:** Alex.

**Förutsättningar:** En fullständig export av det tomma provhushållet
enligt [exportguiden](../user-guide/household-export.md).

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-04: replaced household content retires hidden work and
microphone”.

**Steg:**

1. Starta samtal och mikrofon. Öppna **Nytt objekt** och skriv
   **Gammal oskickad cykel** utan att skicka texten.
2. Besök **Administrera tillgång**. Välj exportfilen under
   **Återimportera hushållet**, kontrollera filen och bekräfta uttryckligen
   att innehållet ska ersättas.
3. Invänta bekräftad ersättning och mikrofonstopp. Välj **Till hushållet**.

**Förväntat resultat:**

- Nuvarande tillgång består, men den tidigare mikrofonen och samtalet
  avslutas. Ett nytt samtal kräver en ny start.
- Det gamla formuläret är borta. Det återimporterade tomma utkastet visas.
- Om innehållet tillfälligt är spärrat visas ett besked och kartarbetet
  kan inte fortsätta förrän innehållet är tillgängligt igen.

### ARBETE-05: samma sparförsök kan återhämtas efter vybyte

**Syfte:** Ett okänt utfall får inte glömmas vid navigation.

**Användare:** Alex.

**Förutsättningar:** Chrome med utvecklarverktyg. Läs
[SPAR-02](operations.md#spar-02-återförsöka-ett-väntande-sparande-från-en-annan-klient)
för hur endast begäran till `*/map/save` blockeras.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-05: navigation preserves a save attempt after its
response disappears”.

**Steg:**

1. Skapa **Sparad cykel** och lägg objektet i utkastet. Blockera
   `*/map/save` och välj **Spara hela utkastet**.
2. Kontrollera beskedet om okänt utfall. Besök **Inloggningssätt** och
   återgå. Kontrollera att beskedet och **Hämta samma kvitto igen** finns kvar.
3. Ta bort nätblockeringen. Välj **Hämta samma kvitto igen** och kontrollera
   kvittot. Ladda om och kontrollera att cykeln finns en gång i kartan.

**Förväntat resultat:**

- Okänt utfall visas även utanför kartan. Återförsöket gäller samma sparande.
- Verifierat sparande visas först efter serverns kvitto.

Det automatiserade provet fördröjer och tappar svaret efter att den riktiga
servern sparar, medan de manuella stegen stoppar själva begäran. Endast
automationen verifierar avbrottet efter transaktionen, pågående status
under vybytet och exakt en historikhändelse via det publika API:et.

### ARBETE-06: urval och personlig vy består vid storleksbyte

**Syfte:** Behålla valt objekt och egna kartinställningar vid återgång.

**Användare:** Alex.

**Förutsättningar:** Datorfönster och tomt utkast.

**Integrationstest:**
[household-work.spec.ts](../../tests/integration/household-work.spec.ts),
testfallet “ARBETE-06: selection and personal map view survive navigation
and resizing”.

**Steg:**

1. Skapa och spara **Min cykel**. Välj cykeln i listan och öppna Lista igen.
2. Öppna **Ordna min vy**. Välj **Flytta höger i rummet**, invänta sparad
   personlig vy och markera **Visa höjdhjälp**.
3. Besök **Inloggningssätt**, minska fönstret till mobilstorlek och
   återgå med **Till startsidan**.
4. Välj **Min cykel** i panelväljaren och kontrollera uppgifterna. Välj
   **Stäng arbetsytan** för att kontrollera kartans urval, höjdhjälp och
   personliga placering.

**Förväntat resultat:**

- De öppna panelerna, cykelns urval och **Visa höjdhjälp** består.
- Den personliga placeringen är densamma efter återgång.

## Bedömning och återstående manuella prov

Referensen 87ddb01, alternativ D i administrationsprovet, kräver att
kartarbete och mikrofon består när kartan döljs bakom andra vyer.
Dessa fall provar den livstiden i befintlig navigation. Panelernas placering och
byte på mobil beskrivs i [fria paneler](workspace-panels.md).

Automationen provar semantiska namn, rubrik- och formulärfokus, dolda
kontroller och funktionella flöden vid dator- och mobilbredder.
Kontrast, verklig zoom, skärmläsare, fysiska målplattformar och faktiskt
svenskt tal kräver separat manuell bedömning. Inga sådana prov eller
fullständig WCAG 2.2 AA-överensstämmelse intygas av integrationstesterna.
