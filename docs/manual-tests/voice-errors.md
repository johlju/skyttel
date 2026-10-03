# Manuella testfall för röstfel och ljudåterhämtning

Fallen omfattar webbläsarens mikrofonhinder, serverns tre felgrupper,
felreferenser och återhämtning från stoppat ljud genom samtalsnotisen.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex är vanlig medlem i det tillfälliga hushållet och loggar in genom
provets Google-knapp. Administratören är den som läser startguidens
serverloggar; inga administrativa rättigheter behövs för samtalsflödet.

## Allmän förberedelse

1. Följ [den kontrollerade talprovsguiden](voice-assistant.md#controlled-voice-fixture).
   Starta `npx tsx scripts/manual-voice.ts` i en egen terminal. Varje start
   skapar en separat tillfällig SQLite och verkliga applikationsrutter.
2. Logga in som Alex på den angivna adressen, skapa ett hushåll och välj
   **Skriv till Skyttel**. Godkänn medgivandet. Håll terminalen öppen.
3. Öppna webbläsarens utvecklarkonsol. Provets
   `window.skyttelVoiceFixture` ersätter endast webbläsarens media och den
   externa leverantören. Den spelar inte in den verkliga mikrofonen.
4. Slå av mikrofonen med **Prata med Skyttel** och välj **Nytt samtal**
   i textvyn mellan fallen. Återställ med
   `window.skyttelVoiceFixture.setMicrophone('allow')` och
   `window.skyttelVoiceFixture.setPlayback('allow')`. Skriv
   `voice-failure off` i terminalen. Avsluta med `quit`; provdatabasen tas bort.

## Mikrofonhinder

### ROSTFEL-01: fyra mikrofonhinder kan stängas och prövas igen

**Syfte:** Kontrollera de fyra fasta webbläsartexterna och nya felhändelser.

**Användare:** Alex.

**Förutsättningar:** Textsamtalet är igång, mikrofonen av och textvyn öppen.

**Integrationstest:**
[voice-errors.spec.ts](../../tests/integration/voice-errors.spec.ts), testfallen:

- “ROSTFEL-01: deny ger en stängbar mikrofonnotis och återförsöket tar bort den”.
- “ROSTFEL-01: error ger en stängbar mikrofonnotis och återförsöket tar bort den”.
- “ROSTFEL-01: busy ger en stängbar mikrofonnotis och återförsöket tar bort den”.
- “ROSTFEL-01: unsupported ger en stängbar mikrofonnotis och återförsöket
  tar bort den”.

**Steg:**

1. Kör `window.skyttelVoiceFixture.setMicrophone('deny')`. Tryck på
   **Prata med Skyttel** och läs samtalsnotisen.
2. Fokusera **Stäng notisen** med tangentbordet och tryck Retur. Kontrollera
   att notisen försvinner och fokus återgår till mikrofonknappen.
3. Tryck på mikrofonknappen igen. Samma hinder ska ge en ny notis.
4. Kör `window.skyttelVoiceFixture.setMicrophone('hold')` och tryck igen.
   Notisen ska försvinna medan starten väntar. Kör
   `window.skyttelVoiceFixture.releaseMicrophone()` och kontrollera **Lyssnar**.
5. Upprepa med `error` och `busy` efter återställningen mellan fallen.
6. Prova saknat stöd genom `window.savedPeer = window.RTCPeerConnection`
   och `window.RTCPeerConnection = undefined`. Upprepa steg 1–3.
   Återställ med `window.RTCPeerConnection = window.savedPeer` före steg 4.

**Förväntat resultat:**

- Nekad mikrofon: **Webbläsaren tillåter inte mikrofonen. Tillåt den i
  webbläsarens inställningar och tryck på mikrofonknappen igen.**
- Saknad mikrofon: **Ingen mikrofon hittades. Anslut en mikrofon och tryck
  på mikrofonknappen igen.**
- Upptagen mikrofon: **Mikrofonen kunde inte öppnas. Kontrollera om en
  annan app använder den.**
- Saknat stöd: **Webbläsaren har inte stöd för röst. Du kan skriva till Skyttel.**
- Händelsen har text och symbol, mikrofonen är av och inget ljud spelas in.
  Symbolen läses inte som en separat mening. Stängning och nytt försök
  tar bort föregående händelse; texten återkommer inte från en annan felruta.

## Serverfel

### ROSTFEL-02: startfel och administrationsfel har korta besked med referens

**Syfte:** Kontrollera serverns klassificering utan leverantörsprosa.

**Användare:** Alex och administratören för kontroll av loggreferens.

**Förutsättningar:** Textsamtalet är igång och inga röstanslutningar finns.

**Integrationstest:**
[voice-errors.spec.ts](../../tests/integration/voice-errors.spec.ts), testfallen:

- “ROSTFEL-02: serverns startup visar ett kort besked med felreferens”.
- “ROSTFEL-02: serverns administration visar ett kort besked med felreferens”.

**Steg:**

1. Skriv `voice-failure startup` i terminalen. Tryck på mikrofonknappen.
2. Kontrollera **Rösten kunde inte starta just nu. Försök igen om en stund.**
   och **Felreferens**. Sök efter referensen i terminalens
   `voice_start_failed` och kontrollera `code`, `stage` och `providerStatus`.
3. Skriv `voice-failure off`. Tryck igen och kontrollera att notisen
   försvinner och röstrutan visar **Lyssnar**.
4. Återställ samtalet. Skriv `voice-failure administration` och tryck på
   mikrofonknappen. Kontrollera **Rösten fungerar inte. Kontakta
   administratören.**, med samma möjlighet att hitta orsaken genom referensen.
5. Skriv `voice-failure off` och pröva igen.

**Förväntat resultat:**

- Serverns tillfälliga startfel och administrationsfel väljer rätt kort text.
  Referensen på skärmen motsvarar serverns logg och svar.
- Notisen nämner inte leverantör, konfiguration, text och formulär eller
  att sparande inte är ångrat. Mikrofonen förblir av vid fel.
- Nytt försök tar bort händelsen och startar med samma vanliga gränssnitt.

### ROSTFEL-03: ett avbrott stoppar mikrofonen och visar diagnostisk referens

**Syfte:** Kontrollera serverns grupp för fel under pågående röst.

**Användare:** Alex och administratören för kontroll av loggreferens.

**Förutsättningar:** **Prata med Skyttel** visar **Lyssnar**.

**Integrationstest:**
[voice-errors.spec.ts](../../tests/integration/voice-errors.spec.ts), testfallet
“ROSTFEL-03: serverns avbrott stoppar mikrofonen och visar samma diagnostiska referens”.

**Steg:**

1. Skriv `drop` i provterminalen. Vänta på samtalsnotisen.
2. Kontrollera **Rösten avbröts. Tryck på mikrofonknappen för att fortsätta.**
   och att mikrofonknappen är av. Ingen automatisk återanslutning sker.
3. Sök efter visad **Felreferens** i serverns `voice_interrupted`. Kontrollera
   att `stage` är `session`, att `group` är `interrupted` och att `code`
   anger orsaken. Kontrollera att samma referens hör till röstförsökets mätning.
4. Tryck på mikrofonknappen igen och kontrollera att rösten startar utan
   den tidigare händelsen. Prova sedan att stänga en ny avbrottsnotis.

**Förväntat resultat:**

- Ett pågående avbrott väljer avbrottstexten och frigör mikrofonspåren.
  Loggen innehåller orsak och referens utan ljud eller hushållsinnehåll.
- Försök igen och stängning fungerar som för övriga felhändelser.

## Stoppat ljud

### ROSTFEL-04: Starta ljudet återställer uppspelning före mikrofonen

**Syfte:** Kontrollera det väntande ljudhindret och logiskt återgångsfokus.

**Användare:** Alex.

**Förutsättningar:** Textsamtalet är igång och mikrofonen av.

**Integrationstest:**
[voice-errors.spec.ts](../../tests/integration/voice-errors.spec.ts), testfallet
“ROSTFEL-04: Starta ljudet återställer ljudet innan mikrofonen lyssnar och
försvinner med logiskt fokus”.
Det tidigare inspelade talets gräns efter släpp provas också i
[MIKROFONTRYCK-07](microphone-press.md#mikrofontryck-07-spärrat-ljud-ger-ingen-inspelning).

**Steg:**

1. Kör `window.skyttelVoiceFixture.setPlayback('blocked')`. Tryck på
   mikrofonknappen. Kontrollera **Webbläsaren stoppade ljudet.** och
   knappen **Starta ljudet** i samtalsnotisen.
2. Kontrollera att mikrofonen är av. Kör
   `window.skyttelVoiceFixture.stats()` och kontrollera att samtliga
   `microphoneTracks` har `enabled: false`. Notisen har ingen stängknapp
   medan hindret pågår.
3. Kör `window.skyttelVoiceFixture.setPlayback('allow')`. Tabba till
   **Starta ljudet** och tryck Retur.
4. Kontrollera att ljudhindret försvinner, mikrofonknappen får fokus och
   röstrutan visar **Lyssnar**. Kontrollera att textvyn behåller sitt öppningsläge.

**Förväntat resultat:**

- Uppspelning försöker starta i den användargest som startar rösten.
  Misslyckad uppspelning håller mikrofonen av och visas som ett hinder.
- **Starta ljudet** låser upp uppspelningen i sitt eget tryck. Mikrofonen
  lyssnar först efter fungerande uppspelning. Den gamla ljudknappen finns inte.
- En skärmläsare får den artiga meningen **Webbläsaren stoppade ljudet.
  Starta ljudet.**, med både text och åtgärd.

## Tillgänglighetsbedömning och körgränser

Designen använder samma prioritet, teman, fokus och reglage som
[samtalsnotiserna](conversation-notices.md). Bedömningen är ett designmål
för WCAG 2.2 AA, inte ett intyg om verifierad överensstämmelse.

<!-- markdownlint-disable MD013 -->

| Kriterium | Design och automatiskt kontrollerat beteende | Manuell bedömning som återstår |
| --- | --- | --- |
| 1.1.1, 1.3.1 | Symboler döljs från hjälpmedel; text och åtgärd står tillsammans. | Begriplighet med egna hjälpmedel. |
| 1.4.1, 1.4.3, 1.4.11 | Befintliga temafärger, synlig text och av/på-tillstånd återanvänds. | Verklig skärm, kontrast och högkontrastläge. |
| 2.1.1, 2.4.3 | Stängning och ljudstart provas med tangentbord och återgår till mikrofonknappen. Ingen textvy öppnas automatiskt. | Full tangentbordsordning med zoom och hjälpmedel. |
| 2.4.7, 2.4.11, 2.5.8 | Befintliga fokusmarkeringar och reglagens mått återanvänds. | Fokus synligt utan skymning på fysisk liten skärm. |
| 4.1.2, 4.1.3 | Felhändelser har en assertiv region; ljudhindret har en artig region med åtgärdens namn. Nytt försök återställer händelsen. | Faktisk uppläsning, avbrott och upprepning i flera skärmläsare. |

<!-- markdownlint-enable MD013 -->

Automatiserade fall använder riktig server och tillfällig SQLite men
syntetiska media- och leverantörsgränser. Verkliga mikrofonbehörigheter,
upptagen fysisk mikrofon, mobil uppspelningspolicy och skärmläsarens hörbara
uppläsning kräver separat mänsklig körning enligt restlistan #220.
