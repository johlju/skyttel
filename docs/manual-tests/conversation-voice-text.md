# Manuella testfall för röst och text i samma samtal

Fallen provar skrivna uppdrag med mikrofonen på och av, ordnade svar och
uppläsning av samtalstexten. Anteckna commit, webbläsare och godkänt eller
underkänt resultat vid körning. Kontrollerade ljudspår är tysta; faktiskt
hört tal och skärmläsarens uppläsning redovisas separat.

## Konfigurerade användare

Alex Exempel är administratör i det påhittade hushållet Röst och text.
Alex loggar in med Google i den kontrollerade installationen.

## Allmän förberedelse

1. Starta en ny installation enligt
   [den kontrollerade röstguiden](voice-assistant.md#controlled-voice-fixture).
   Skapa hushållet Röst och text. Kör inte `seed-family`.
2. Välj **Skriv till Skyttel** och **Godkänn och starta**. Låt utkastet
   vara tomt. Använd ett datorfönster som är bredare än 700 px.
3. Skrivna uppdrag hålls i terminalen som `held`. Läs `pending` och
   ersätt `REQUEST` med anrops-ID. Släpp ett vanligt svar med
   `reply REQUEST TEXT`. `sessions` visar kommentarerna som Skyttel
   faktiskt skickat till den kontrollerade röstleverantören. Ett skrivet
   uppdrag har ingen talad delegering; dess kommentar saknar delegerings-ID.
4. För kontrollerad transporttext och ljudaktivitet, använd
   [webbläsarkonsolens förberedelse](conversation-questions.md#allmän-förberedelse).
   Skicka den text som anges i fallet. Signalen är fortfarande tyst och
   bevisar inte att en verklig röst hörs eller uttalar hela svaret rätt.
5. Börja med en ny installation inför varje fall. För lyssning och
   skärmläsare används en separat installation med verklig röstleverantör
   och enhet enligt [talproven](real-voice-tests.md). Anteckna faktiskt
   hört ljud och uppläsning separat från den kontrollerade körningen.

## Gemensamma svar

<!-- markdownlint-disable MD013 -->
### RÖSTTEXT-01: skrivet uppdrag med mikrofonen på får röst och text utan att öppna textvyn
<!-- markdownlint-enable MD013 -->

**Syfte:** Få svar med röst på ett skrivet uppdrag och läsa svaret senare.

**Användare:** Alex.

**Förutsättningar:** Textvyn är öppen och mikrofonen av.

**Integrationstest:**
[conversation-voice-text.spec.ts](../../tests/integration/conversation-voice-text.spec.ts),
testfallet “RÖSTTEXT-01: skrivet uppdrag med mikrofonen på får röst och text
utan att öppna textvyn”.

**Steg:**

1. Slå på **Prata med Skyttel**. Skicka **Berätta om ordningen.** och
   låt svaret vara hållet. Läs röstrutan och arbetsraden.
2. Stäng textvyn. Släpp svaret med **Vi tar ett förslag i taget.**.
   Kör `sessions` och kontrollera hela svaret i kommentarerna.
3. Skicka samma text som transportfragment och slå på ljudaktiviteten
   enligt förberedelsen. Öppna textvyn först efter att svaret har kommit.
4. På verklig utrustning: upprepa uppdraget med mikrofonen på, stäng
   textvyn och lyssna på svaret. Öppna den igen och jämför vad som hördes.
5. Välj **Nytt samtal** med mikrofonen på. Kontrollera dess besked i
   samtalstexten och kommentarerna.

**Förväntat resultat:**

- Röstrutan visar **Skyttel arbetar** även för det skrivna uppdraget.
  Arbetsraden syns i samtalstexten. Arbetsbeskedet läses upp en gång.
- Svaret skickas till rösten och finns i samtalstexten när textvyn
  öppnas senare. Transportens ljudaktivitet ger **Skyttel talar**.
  Ingen textvy öppnas av sig själv och mikrofonen förblir på.
- Talade rader har ingen extra synlig märkning. Att öppna textvyn läser
  inte upp gamla svar. Faktiskt hört tal kräver en verklig ljudkontroll.
- Nytt samtals besked överlämnas till rösten när mikrofonen är på och
  dubbleras inte av samtalstextens uppläsning.

<!-- markdownlint-disable MD013 -->
### RÖSTTEXT-02: mikrofonen av ger bara text och gamla svar spelas inte upp när den slås på
<!-- markdownlint-enable MD013 -->

**Syfte:** Låta mikrofonens aktuella läge styra det skrivna svarets röst.

**Användare:** Alex.

**Förutsättningar:** Textvyn är öppen och ingen fråga eller sparstatus väntar.

**Integrationstest:**
[conversation-voice-text.spec.ts](../../tests/integration/conversation-voice-text.spec.ts),
testfallet “RÖSTTEXT-02: mikrofonen av ger bara text och gamla svar spelas
inte upp när den slås på”.

**Steg:**

1. Slå på och sedan av **Prata med Skyttel**. Skicka **Svara bara i
   text.** och släpp svaret med **Det här är textsvaret.**.
2. Läs svaret och kör `sessions`. Vänta tills svaret syns och slå sedan
   på mikrofonen igen. Kontrollera kommentarerna en gång till.
3. Skicka **Stäng av innan svaret är klart.**. Stäng av mikrofonen
   medan svaret hålls. Släpp **Även detta svar finns bara i text.**.
4. Skriv **Nytt samtal** med mikrofonen av och läs beskedet.

**Förväntat resultat:**

- Med mikrofonen av kommer båda svaren bara i samtalstexten. Ingen
  röstruta syns medan ett sådant skrivet uppdrag arbetar eller besvaras.
  Svaren skickas inte till rösten och läses artigt av skärmläsaren.
- Att slå på mikrofonen spelar inte upp det gamla textsvaret. Det
  finns kvar i samtalstexten. Att stänga av före det andra svaret ger
  samma textbeteende. Mikrofonen går inte att slå på igen under arbetet.
- Skrivet Nytt samtal med mikrofonen av ger ett textbesked som läses
  artigt, utan en röstkommentar eller en röstruta.

<!-- markdownlint-disable MD013 -->
### RÖSTTEXT-03: köns skrivna svar överlämnas till rösten en gång och samtalstexten läser aldrig egna eller talade rader
<!-- markdownlint-enable MD013 -->

**Syfte:** Behålla ordning, fullständiga svar och en enda uppläsning.

**Användare:** Alex.

**Förutsättningar:** Dator, textvyn öppen och mikrofonen på.

**Integrationstest:**
[conversation-voice-text.spec.ts](../../tests/integration/conversation-voice-text.spec.ts),
testfallet “RÖSTTEXT-03: köns skrivna svar överlämnas till rösten en gång
och samtalstexten läser aldrig egna eller talade rader”.

**Steg:**

1. Skicka **Första frågan.** och **Andra frågan.** utan att släppa svar.
   Släpp första svaret med **Första svaret med åäö.**, upprepat 30 gånger
   i samma svar. Släpp sedan **Andra svaret.** och läs `sessions`.
2. Skicka **Ett talat tillägg.** som transportfragment och slå på och
   av ljudaktiviteten. Läs raden i samtalstexten.
3. Stäng av mikrofonen. Skicka **Min egen text ska inte läsas.** och
   släpp **Bara Skyttels nya text läses.**. Stäng och öppna textvyn.
4. På verklig utrustning: använd skärmläsare och upprepa flödet. Lyssna
   på både Skyttels röst och skärmläsaren när varje rad tillkommer.

**Förväntat resultat:**

- Ett meddelande väntar bakom det första. Båda fullständiga svaren
  överlämnas en gång och i ordning. Å, ä och ö bevaras över kommentarernas
  paketgränser. Båda svaren finns i samtalstexten.
- Det talade tillägget finns som vanlig Skyttel-rad. Skärmläsaren läser
  aldrig användarens egna rader eller svar som Skyttel säger med rösten.
- Med mikrofonen av läser skärmläsaren bara Skyttels nya text och väntar
  på sin tur. Öppnad textvy upprepar inte historiska svar. Ingen kontroll
  får fokus av att ett svar kommer.

<!-- markdownlint-disable MD013 -->
### RÖSTTEXT-04: ett skrivet obekräftat sparpåstående blir inget verifierat talat sparbesked
<!-- markdownlint-enable MD013 -->

**Syfte:** Behålla gränsen mellan ett modellsvar och ett sparkvitto.

**Användare:** Alex.

**Förutsättningar:** Tomt utkast, inget sparkvitto och mikrofonen på.

**Integrationstest:**
[conversation-voice-text.spec.ts](../../tests/integration/conversation-voice-text.spec.ts),
testfallet “RÖSTTEXT-04: ett skrivet obekräftat sparpåstående blir inget
verifierat talat sparbesked”.

**Steg:**

1. Skicka **Berätta om utkastet.**. Släpp provsvaret med **Sparat.**,
   utan att anropa något sparverktyg. Läs svaret och kör `sessions`.
2. Skicka **Sparat.** som transportfragment, slå på ljudaktiviteten och
   avsluta den. Kontrollera röstrutan och **Utkast och historik**.

**Förväntat resultat:**

- Påståendet står i samtalstexten och överlämnas som obekräftad
  samtalstext till rösten. Det är inget verifierat resultat.
- Ingen grön bock eller **Sparat**-status visas. Röstrutan återgår till
  **Lyssnar**. Kartan är tom och inga sparförsök eller kvitton har skapats.

## Tillgänglighetsbedömning

Designmålet är WCAG 2.2 AA. Namngivna knappar, mikrofonens växlingsläge
och tangentbordskontroller provas mot riktig server (2.1.1, 4.1.2).
Samtalstexten anger vem som sa vad för hjälpmedel utan synliga namn eller
talmarkeringar (1.3.1). En separat artig live-region för nya textlevererade
Skyttel-rader håller användarrader, talade svar och historik tysta (4.1.3).
Arbetsbeskedet dubbleras inte mellan röstrutan och textvyn. Svar flyttar
inte fokus och öppnar ingen vy (2.4.3).

Automationen kontrollerar text, tillstånd, faktisk kommentaröverlämning
och live-regionernas attribut. Den bevisar inte hörbart tal eller faktisk
uppläsning. Prova NVDA med Chrome på Windows och VoiceOver med Chrome på
macOS, iPhone och iPad: bara nya tysta Skyttel-svar ska läsas när det blir
deras tur, utan att skärmläsarens röst tolkas som nytt tal. Synligt fokus,
förstoring och kontrast bedöms på verkliga enheter. Fullständig
WCAG-överensstämmelse och dessa fysiska prov är inte fastställda här.
