# Manuella testfall för frågor och talade sparbesked

Fallen provar nödvändiga frågor i samma samtal med text och röst, väntan
med mikrofonen av och ett verifierat sparbesked. Anteckna commit,
webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex Exempel är administratör i provhushållet och Robin Exempel är medlem.
De använder var sin webbläsarprofil. I den kontrollerade miljön loggar de
in med Google. Samtalet kräver inte administrativa rättigheter.

## Allmän förberedelse

1. Starta en ny installation enligt
   [den kontrollerade röstguiden](voice-assistant.md#controlled-voice-fixture).
   Skapa ett hushåll. Lägg ett Person-objekt **Lo Exempel** i det privata
   utkastet genom **Lista → Nytt objekt**. Spara inte.
2. För identitetsfrågan: välj **Objektets identitet → Obesvarad
   identitetsfråga** innan förslaget läggs i utkastet. Börja en ny
   installation med en identifierad Lo inför sparfallen FRAGA-04–06.
3. Ersätt `REQUEST` med terminalens aktuella `held`-ID. En nödvändig
   fråga utan ändringar släpps med:

   <!-- markdownlint-disable MD013 -->
   ```text
   tool REQUEST ask_questions {"questions":["Vilken person avses med Lo, och vilket namn ska objektet ha?"]}
   ```
   <!-- markdownlint-enable MD013 -->

   Ett vanligt svar släpps med `reply REQUEST Tack, nu vet jag vilken Lo
   du menar.`. För sparande används `save_draft` med `version` och
   `contentVersion` från det aktuella `held.draft`, enligt röstguiden.
4. De kontrollerade mediespåren är tysta. För gränssnittets prov av ett
   mottaget ljudstycke använder du webbläsarkonsolen. Slå först på
   signalen och kontrollera **Skyttel talar**:

   ```javascript
   window.skyttelVoiceFixture.setSound('remote', true);
   ```

   Skicka sedan den kontrollerade texten genom det externa
   transportsubstitutet. Ersätt `TEXT` med hela frågan eller `Sparat.`:

   ```javascript
   window.skyttelVoiceFixture.emit({
     type: 'session.output_transcript.delta',
     event_id: crypto.randomUUID(),
     delta: 'TEXT', start_ms: 200, end_ms: 300
   });
   ```

   Avsluta signalen med
   `window.skyttelVoiceFixture.setSound('remote', false);`.
5. Detta provar ljudaktivitet och gränssnitt mot riktig server och SQLite.
   Det verifierar inte fysisk mikrofon, svensk talförståelse, en verklig
   röst eller att modellens uppläsning matchar frågan. Följ
   [förberedelsen i TAL-17](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
   för dessa observationer med verkliga leverantörer och fysisk mikrofon.
   Redovisa faktiskt hört tal separat från den kontrollerade körningen
   och det automatiska [WAV-provet](real-voice-tests.md).

## Nödvändiga frågor

### FRAGA-01: identitetsfrågan finns i samtalet

**Syfte:** Skyttel ställer frågan i samtalet utan en separat frågeruta.

**Användare:** Alex.

**Förutsättningar:** Lo har en obesvarad identitetsfråga i utkastet.

**Integrationstest:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
testfallet “FRAGA-01: en nödvändig identitetsfråga finns i samtalstexten
med serverns väntesignal”.

**Steg:**

1. Välj **Skriv till Skyttel**, godkänn medgivandet och skicka **Red ut
   vilken Lo som avses.** Släpp frågan enligt förberedelsen.
2. Läs frågan i **Samtalstext**. Kontrollera kartan och utkastet.

**Förväntat resultat:**

- Frågan står som Skyttels svar i samtalstexten. Ingen röstruta visas
  i ett samtal med enbart text och inget sparas.
- **Besked från Skyttel**, **Nödvändigt svar**, **Svara i samtalet** och
  den genererade raden **Vilka objekt avses?** finns inte.
- Det automatiserade provet kontrollerar även serverns uttryckliga
  väntesignal och det verkliga utkastets obesvarade identitet.

### FRAGA-02: konflikter reds ut i samtalet

**Syfte:** Fråga om de verkliga alternativen utan att välja åt användaren.

**Användare:** Alex och Robin.

**Förutsättningar:** Följ
[konfliktförberedelsen UTKAST-17](drafts.md#utkast-17-nå-en-objektkonflikt-från-status-med-oskickat-arbete-kvar).
Lo Exempel är sparad, Alex föreslår Lo Lind och Robin sparar Lo Berg.

**Integrationstest:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
testfallet “FRAGA-02: Skyttel frågar om en verklig konflikt i samtalet
utan en genererad frågeruta”.

**Steg:**

1. Alex väljer **Skriv till Skyttel** och skickar **Hjälp mig välja
   vilket namn vi ska behålla.**
2. Släpp en riktad `ask_questions`-fråga om Lo Exempel, Lo Lind och
   Lo Berg. Läs frågan och kontrollera båda klienternas karta.

**Förväntat resultat:**

- Skyttel frågar vilket värde Alex vill behålla och beskriver de verkliga
  alternativen i samtalstexten. Lo Berg förblir sparat; Alex förslag är privat.
- Gränssnittet skapar inte raden **Utkastet har konflikter**. Kartans
  konfliktnavigering och privata utkast finns kvar.

### FRAGA-03: den talade frågan väntar kvar med mikrofonen av

**Syfte:** Kunna svara med tal eller text utan automatisk vyöppning.

**Användare:** Alex.

**Förutsättningar:** Lo har en obesvarad identitet. Starta rösten och
invänta **Lyssnar**. Upprepa med ett talat och ett skrivet uppdrag.

**Integrationstest:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
testfallen “FRAGA-03: en fråga från tal som sagts med rösten väntar kvar
med mikrofonen av” och samma titel med “text”.

**Steg:**

1. För tal: kör `user Vilken Lo avses?` och `delegate`. För text: öppna
   textvyn, skriv samma fråga, skicka och stäng textvyn.
2. Släpp frågan med `ask_questions`. Återge hela frågan med signal och
   transporttext enligt förberedelsen och avsluta signalen.
3. Kontrollera **Väntar på ditt svar**. Stäng av mikrofonen och läs rutan.
4. Välj själv **Skriv till Skyttel**. Läs frågan och svara **Det är Lo
   Exempel som avses.** Släpp det vanliga svaret enligt förberedelsen.

**Förväntat resultat:**

- Frågan sägs med rösten i ett verkligt leverantörsprov och finns alltid
  i samtalstexten. Ingen frågetext visas bredvid röstrutan och textvyn
  öppnas inte automatiskt.
- **Väntar på ditt svar** består när mikrofonen är av. De sju punkterna
  är då nedtonade. En skärmläsare ska inte läsa upp detta statusord.
- Användaren kan också slå på mikrofonen och svara med tal. Det skrivna
  svaret avlägsnar det gamla vänteläget; mikrofonen förblir av.

## Verifierade sparbesked

### FRAGA-04: fyra sekunder börjar efter det talade sparbeskedet

**Syfte:** Ett kvitto och observerat ljud krävs för det gröna sparbeskedet.

**Användare:** Alex.

**Förutsättningar:** Identifierad Lo i utkastet, mikrofonen på och textvyn
stängd. Ett tidtagarur finns tillgängligt.

**Integrationstest:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
testfallet “FRAGA-04: ett verifierat Sparat väntar på hela ordet och
ljudet innan fyra sekunder börjar”.

**Steg:**

1. Kör `user Spara hela utkastet.` och `delegate`. Släpp `save_draft`
   enligt förberedelsen. Kommentarspaketet ska innehålla **Sparat.**
2. Starta signalen, skicka fragmentet **Spar** och avsluta signalen.
   Kontrollera att det gröna sparbeskedet inte visas.
3. Skicka fragmentet **at.** medan signalen är av. Vänta minst fyra
   sekunder. Starta signalen igen och håll den på i minst fyra sekunder.
4. Avsluta signalen och starta tidtagningen. Läs röstrutan efter tre
   sekunder och igen efter drygt fyra sekunder.
5. Öppna själv textvyn och läs sparbeskedet. Öppna **Utkast och historik**,
   **Tidigare sparförsök** och **Visa kvittot**.

**Förväntat resultat:**

- Ingen tid räknas från kvittot, ett ofullständigt ord eller enbart
  transporttext före det kontrollerade ljudet. **Skyttel talar** består
  medan ljudet är aktivt.
- Efter ljudet visas **Sparat** i fyra sekunder, med en grön bock mellan
  vågformen och ordet. Bocken är dold för hjälpmedel. En skärmläsare
  läser **Sparat** en gång. Textvyn öppnas inte av sig själv.
- **Sparat.** finns i samtalstexten. Lo finns en gång i den sparade kartan
  och kvittot finns under **Utkast och historik**.

### FRAGA-05: stopp startar tiden från avbrottet

**Syfte:** Avbrutet ljud återtar inte det beständiga sparandet.

**Användare:** Alex.

**Förutsättningar:** Som FRAGA-04, med ett verifierat kvitto och ett
pågående kontrollerat sparbesked.

**Integrationstest:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
testfallet “FRAGA-05: stopp under det verifierade sparbeskedet startar de
fyra sekunderna från avbrottet”.

**Steg:**

1. Starta signalen och skicka fragmentet **Spar** enligt förberedelsen.
2. Välj röstrutans stoppikon **Avbryt** och starta tidtagningen.
3. Läs rutan efter tre sekunder och efter drygt fyra sekunder.

**Förväntat resultat:**

- Ljudet stoppas och **Sparat** visas i fyra sekunder från avbrottet.
  Ordet läses upp en gång och inget öppnas automatiskt.
- Lo och det bekräftade kvittot består. Ett genomfört sparande ångras inte.

### FRAGA-06: fria ord ersätter inte kvittot

**Syfte:** Förhindra ett falskt grönt sparbesked.

**Användare:** Alex.

**Förutsättningar:** Lo är fortfarande privat och inget sparförsök finns.

**Integrationstest:**
[conversation-questions.spec.ts](../../tests/integration/conversation-questions.spec.ts),
testfallet “FRAGA-06: providertext som säger Sparat utan beständigt
kvitto ger inget grönt sparbesked”.

**Steg:**

1. Kör `user Berätta om utkastet.` och `delegate` och släpp med
   `reply REQUEST Sparat.`. Ge inget sparbesked.
2. Starta signalen, skicka **Sparat.** som transporttext och avsluta den.
3. Kontrollera röstrutan, privata utkastet och **Tidigare sparförsök**.

**Förväntat resultat:**

- Röstrutan återgår till **Lyssnar** och visar ingen grön bock eller
  verifierad **Sparat**-status. Lo förblir privat och inget kvitto finns.

## Tillgänglighet och återstående verifiering

<!-- markdownlint-disable MD013 -->
| WCAG 2.2 | Designmål | Automatiserat underlag | Kvarvarande manuellt prov |
| --- | --- | --- | --- |
| 1.1.1, 1.3.1, 1.4.1 | Statusord bär beskedet; vågform och bock är dolda för hjälpmedel. | Namngiven röstruta, statusord och dold bock kontrolleras. | Granska faktisk hjälpmedelspresentation. |
| 1.4.3, 1.4.11 | Läsbara statusord och grön bock i båda teman; färg är inte enda beskedet. | Bocken använder kartans temafärg. | Visuell kontrastgranskning i ljus och mörk miljö. |
| 1.4.10, 2.4.7, 2.4.11 | Statusbyten ändrar inte fokus eller öppnar en vy; reglage förblir nåbara. | Publika vyöppningar och frånvaro av automatisk textvy provas. | Verklig förstoring, smal skärm och synligt fokus. |
| 2.1.1, 2.5.8 | Mikrofon, textvy och stopp fungerar med tangentbord och pekare. | Publika kontroller används i Chromium. | Fysiska pekmål och tangentbord i övriga webbläsare. |
| 4.1.2, 4.1.3 | Väntan läses inte upp igen; Sparat meddelas artigt en gång. | Live-regionens text och statusord kontrolleras. | Skärmläsarens kö och faktisk uppläsning under tal. |
<!-- markdownlint-enable MD013 -->

Bedömningen är ett designmål med begränsat verifieringsunderlag, inte
ett påstående om fullständig WCAG-överensstämmelse eller utförda fysiska prov.

Live lämnar inget besked om att en hel replik är färdig. Dess
transkriptfragment beskriver delar av leverantörens ljudtidslinje, inte
webbläsarens uppspelningsslut. Sparbeskedet använder därför det verifierade
korta ordet, matchande transporttext och observerad ljudaktivitet efter
texten. Ett kvitto eller en tyst paus före sista ordet räcker inte.
Detta bevisar inte att leverantören aldrig skickar ytterligare fördröjt
ljud efter en observerad tystnad. Om texten når klienten först efter att
allt ljud har spelats kan slutet inte bekräftas på detta sätt. Ett
verkligt leverantörsprov måste bedöma dessa ordnings- och ljudfall;
stoppikonens avbrott ger däremot ett bestämt slut.
