# Manuella testfall för röstfel och ljudåterhämtning

Fallen omfattar webbläsarens mikrofonhinder, serverns tre felgrupper,
felreferenser och återhämtning från stoppat ljud genom samtalsnotisen. Anteckna
commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex är administratör i det tillfälliga hushållet och loggar in genom provets
Google-knapp. Administratören är den som läser startguidens serverloggar; inga
administrativa rättigheter behövs för samtalsflödet.

## Allmän förberedelse

1. Följ
   [den kontrollerade talprovsguiden](voice-assistant.md#controlled-voice-fixture)
   . Starta `npx tsx scripts/manual-voice.ts` i en egen terminal. Varje start
   skapar en separat tillfällig SQLite och verkliga applikationsrutter.
2. Logga in som Alex på den angivna adressen, skapa ett hushåll och välj
   **Skriv till Skyttel → Nytt samtal → Godkänn och starta**. Håll terminalen
   öppen.
3. Öppna webbläsarens utvecklarkonsol. Provets `window.skyttelVoiceFixture`
   ersätter endast webbläsarens media och den externa leverantören. Den spelar
   inte in den verkliga mikrofonen.
4. Slå av mikrofonen med **Prata med Skyttel** och välj **Nytt samtal** i
   textvyn mellan fallen. Återställ med
   `window.skyttelVoiceFixture.setMicrophone('allow')` och
   `window.skyttelVoiceFixture.setPlayback('allow')`. Skriv `voice-failure off`
   i terminalen. Avsluta med `quit`; provdatabasen tas bort.

## Mikrofonhinder

### ROSTFEL-01: nekad mikrofon kan stängas och prövas igen

**Syfte:** Återhämta en distinkt mikrofonhändelse utan att starta i förväg.

**Användare:** Alex.

**Förutsättningar:** Textsamtal pågår med mikrofon av. Följ
[mikrofonhindrens separata förberedelse](voice-controls-preparation.md#mikrofonhinder)
för deny.

**Integrationstest:**
[voice-errors.spec.ts](../../tests/integration/voice-errors.spec.ts),
ROSTFEL-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-errors.spec.ts",
    "caseId": "ROSTFEL-01"
  },
  "reference": "Kontrollerad extern mikrofonersättning deny; stängning, samma nya fel, väntande åtkomst och lyckad start.",
  "outcomes": [
    "Webbläsaren tillåter inte mikrofonen. Tillåt den i webbläsarens inställningar och tryck på mikrofonknappen igen.",
    "Stängning och nytt försök behåller logiskt fokus och skiljer en ny händelse från den stängda.",
    "Faktisk mikrofonbehörighet bedöms separat i ROSTFEL-09."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj Prata med Skyttel och läs hela notisen.
2. Fokusera Stäng notisen och tryck Enter. Kräv borttagen notis, fokus på
   mikrofonknappen och mikrofon av.
3. Försök igen utan att ändra hindret. Samma text ska ge en ny notis.
4. Startoperatören återställer hindret och förbereder väntande mikrofonåtkomst.
   Tryck igen och läs Rösten startar utan kvarvarande fel. Efter släppt åtkomst,
   läs Lyssnar och påslagen mikrofon.

**Förväntat resultat:**

- Webbläsaren tillåter inte mikrofonen. Tillåt den i webbläsarens inställningar
  och tryck på mikrofonknappen igen.
- Stängning och nytt försök behåller logiskt fokus och skiljer en ny händelse
  från den stängda.
- Faktisk mikrofonbehörighet bedöms separat i ROSTFEL-09.

## Serverfel

### ROSTFEL-02: tillfälligt serverstartfel med läsbar referens

**Syfte:** Läsa rätt nästa handling utan privat leverantörsinnehåll.

**Användare:** Alex.

**Förutsättningar:** Textsamtal pågår och ingen röstanslutning finns. Förbered
voice-failure startup enligt
[serverfelets förberedelse](voice-controls-preparation.md#serverfel-och-referenser)
.

**Integrationstest:**
[voice-errors.spec.ts](../../tests/integration/voice-errors.spec.ts),
ROSTFEL-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-errors.spec.ts",
    "caseId": "ROSTFEL-02"
  },
  "reference": "Kontrollerat serverfel startup; faktisk felreferens och lyckat uttryckligt återförsök.",
  "outcomes": [
    "Rösten kunde inte starta just nu. Försök igen om en stund.",
    "En läsbar Felreferens hör till samma försök; rå svar-/loggjämförelse görs i separat förberedelse.",
    "Notisen visar inget privat leverantörsinnehåll."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj Prata med Skyttel. Läs feltexten och hela synliga Felreferens.
2. Kontrollera att notisen säger vad som går att göra och att mikrofonen är av.
3. Startoperatören återställer voice-failure off. Välj Prata med Skyttel igen.
   Kräv borttagen notis och Lyssnar.

**Förväntat resultat:**

- Rösten kunde inte starta just nu. Försök igen om en stund.
- En läsbar Felreferens hör till samma försök; rå svar-/loggjämförelse görs i
  separat förberedelse.
- Notisen visar inget privat leverantörsinnehåll.

### ROSTFEL-03: ett avbrott stoppar mikrofonen och visar diagnostisk referens

**Syfte:** Kontrollera serverns grupp för fel under pågående röst.

**Användare:** Alex och administratören för kontroll av loggreferens.

**Förutsättningar:** **Prata med Skyttel** visar **Lyssnar**.

**Integrationstest:**
[voice-errors.spec.ts](../../tests/integration/voice-errors.spec.ts),
ROSTFEL-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-errors.spec.ts",
    "caseId": "ROSTFEL-03"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Kontrollera serverns grupp för fel under pågående röst."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Separat operatörsförberedelse:**

Använd
[serverfel och referenser](voice-controls-preparation.md#serverfel-och-referenser)
. Först när Prata med Skyttel visar Lyssnar, vid begäran i UI-steg 1: skriv
`drop` i provterminalen och meddela **Aktuell röst har avbrutits**. Följ den
synliga Felreferens separat i serverloggen utan privat innehåll. Efter
observationerna återställs installationen enligt förberedelsen; återanslutning i
steg 4 sker genom användarens mikrofonknapp.

**Steg:**

1. Be operatören avbryta den aktuella rösten. Invänta bekräftelse och
   samtalsnotisen.
2. Kontrollera **Rösten avbröts. Tryck på mikrofonknappen för att fortsätta.**
   och att mikrofonknappen är av. Ingen automatisk återanslutning sker.
3. Läs hela Felreferens. Serveroperatören följer den separat i
   [referensförberedelsen](voice-controls-preparation.md#serverfel-och-referenser)
   .
4. Tryck på mikrofonknappen igen och kontrollera att rösten startar utan den
   tidigare händelsen. Prova sedan att stänga en ny avbrottsnotis.

**Förväntat resultat:**

- Ett pågående avbrott väljer avbrottstexten och frigör mikrofonspåren. Loggen
  innehåller orsak och referens utan ljud eller hushållsinnehåll.
- Försök igen och stängning fungerar som för övriga felhändelser.

## Stoppat ljud

### ROSTFEL-04: Starta ljudet återställer uppspelning före mikrofonen

**Syfte:** Kontrollera det väntande ljudhindret och logiskt återgångsfokus.

**Användare:** Alex.

**Förutsättningar:** Textsamtalet är igång och mikrofonen av.

**Separat förberedelse:** Följ
[ljudhindret ROSTFEL-04](voice-controls-preparation.md#ljudhinder-rostfel-04)
vid respektive UI-steg. Operatören förbereder blockering, tillåtelse och
spårkontroll; utför UI-flödet en gång.

**Integrationstest:**
[voice-errors.spec.ts](../../tests/integration/voice-errors.spec.ts),
ROSTFEL-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-errors.spec.ts",
    "caseId": "ROSTFEL-04"
  },
  "reference": "Chromium och kontrollerade text-/mediesvar enligt angiven separat förberedelse; faktisk röst eller uppläsning bedöms separat.",
  "outcomes": [
    "Kontrollera det väntande ljudhindret och logiskt återgångsfokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. När ljudhindret förberetts, tryck på
   mikrofonknappen. Kontrollera **Webbläsaren stoppade ljudet.** och knappen
   **Starta ljudet** i samtalsnotisen.
2. Kontrollera att mikrofonknappen visar avstängt läge.
   Notisen har ingen stängknapp medan hindret pågår.
3. När operatören tillåter uppspelning enligt förberedelsen, tabba till
   **Starta ljudet** och tryck Retur.
4. Kontrollera att ljudhindret försvinner, mikrofonknappen får fokus och
   röstrutan visar **Lyssnar**. Kontrollera att textvyn behåller sitt
   öppningsläge.

**Förväntat resultat:**

- Uppspelning försöker starta i den användargest som startar rösten. Misslyckad
  uppspelning håller mikrofonen av och visas som ett hinder.
- **Starta ljudet** låser upp uppspelningen i sitt eget tryck. Mikrofonen
  lyssnar först efter fungerande uppspelning. Notisen försvinner och
  mikrofonknappen får tillbaka fokus.
- En skärmläsare får den artiga meningen
  **Webbläsaren stoppade ljudet. Starta ljudet.**, med både text och åtgärd.

## Tillgänglighetsbedömning och körgränser

Designen använder samma prioritet, teman, fokus och reglage som
[samtalsnotiserna](conversation-notices.md). Bedömningen är ett designmål för
WCAG 2.2 AA, inte ett intyg om verifierad överensstämmelse.

<!-- markdownlint-disable MD013 -->

| Kriterium | Design och automatiskt kontrollerat beteende | Manuell bedömning som återstår |
| --- | --- | --- |
| 1.1.1, 1.3.1 | Symboler döljs från hjälpmedel; text och åtgärd står tillsammans. | Begriplighet med egna hjälpmedel. |
| 1.4.1, 1.4.3, 1.4.11 | Befintliga temafärger, synlig text och av/på-tillstånd återanvänds. | Verklig skärm, kontrast och högkontrastläge. |
| 2.1.1, 2.4.3 | Stängning och ljudstart provas med tangentbord och återgår till mikrofonknappen. Ingen textvy öppnas automatiskt. | Full tangentbordsordning med zoom och hjälpmedel. |
| 2.4.7, 2.4.11, 2.5.8 | Befintliga fokusmarkeringar och reglagens mått återanvänds. | Fokus synligt utan skymning på fysisk liten skärm. |
| 4.1.2, 4.1.3 | Felhändelser har en assertiv region; ljudhindret har en artig region med åtgärdens namn. Nytt försök återställer händelsen. | Faktisk uppläsning, avbrott och upprepning i flera skärmläsare. |

<!-- markdownlint-enable MD013 -->

Automatiserade fall använder riktig server och tillfällig SQLite men syntetiska
media- och leverantörsgränser. Verkliga mikrofonbehörigheter, upptagen fysisk
mikrofon, mobil uppspelningspolicy och skärmläsarens hörbara uppläsning kräver
separat mänsklig körning enligt [röstfallen](voice-assistant.md) och
[hjälpmedelsfallen](conversation-accessibility.md).

### ROSTFEL-05: saknad mikrofon kan stängas och prövas igen

**Syfte:** Återhämta en distinkt mikrofonhändelse utan att starta i förväg.

**Användare:** Alex.

**Förutsättningar:** Textsamtal pågår med mikrofon av. Följ
[mikrofonhindrens separata förberedelse](voice-controls-preparation.md#mikrofonhinder)
för error.

**Integrationstest:**
[voice-errors.spec.ts](../../tests/integration/voice-errors.spec.ts),
ROSTFEL-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-errors.spec.ts",
    "caseId": "ROSTFEL-05"
  },
  "reference": "Kontrollerad extern mikrofonersättning error; stängning, samma nya fel, väntande åtkomst och lyckad start.",
  "outcomes": [
    "Ingen mikrofon hittades. Anslut en mikrofon och tryck på mikrofonknappen igen.",
    "Stängning och nytt försök behåller logiskt fokus och skiljer en ny händelse från den stängda.",
    "Faktisk mikrofonbehörighet bedöms separat i ROSTFEL-09."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj Prata med Skyttel och läs hela notisen.
2. Fokusera Stäng notisen och tryck Enter. Kräv borttagen notis, fokus på
   mikrofonknappen och mikrofon av.
3. Försök igen utan att ändra hindret. Samma text ska ge en ny notis.
4. Startoperatören återställer hindret och förbereder väntande mikrofonåtkomst.
   Tryck igen och läs Rösten startar utan kvarvarande fel. Efter släppt åtkomst,
   läs Lyssnar och påslagen mikrofon.

**Förväntat resultat:**

- Ingen mikrofon hittades. Anslut en mikrofon och tryck på mikrofonknappen igen.
- Stängning och nytt försök behåller logiskt fokus och skiljer en ny händelse
  från den stängda.
- Faktisk mikrofonbehörighet bedöms separat i ROSTFEL-09.

### ROSTFEL-06: upptagen mikrofon kan stängas och prövas igen

**Syfte:** Återhämta en distinkt mikrofonhändelse utan att starta i förväg.

**Användare:** Alex.

**Förutsättningar:** Textsamtal pågår med mikrofon av. Följ
[mikrofonhindrens separata förberedelse](voice-controls-preparation.md#mikrofonhinder)
för busy.

**Integrationstest:**
[voice-errors.spec.ts](../../tests/integration/voice-errors.spec.ts),
ROSTFEL-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-errors.spec.ts",
    "caseId": "ROSTFEL-06"
  },
  "reference": "Kontrollerad extern mikrofonersättning busy; stängning, samma nya fel, väntande åtkomst och lyckad start.",
  "outcomes": [
    "Mikrofonen kunde inte öppnas. Kontrollera om en annan app använder den.",
    "Stängning och nytt försök behåller logiskt fokus och skiljer en ny händelse från den stängda.",
    "Faktisk mikrofonbehörighet bedöms separat i ROSTFEL-09."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj Prata med Skyttel och läs hela notisen.
2. Fokusera Stäng notisen och tryck Enter. Kräv borttagen notis, fokus på
   mikrofonknappen och mikrofon av.
3. Försök igen utan att ändra hindret. Samma text ska ge en ny notis.
4. Startoperatören återställer hindret och förbereder väntande mikrofonåtkomst.
   Tryck igen och läs Rösten startar utan kvarvarande fel. Efter släppt åtkomst,
   läs Lyssnar och påslagen mikrofon.

**Förväntat resultat:**

- Mikrofonen kunde inte öppnas. Kontrollera om en annan app använder den.
- Stängning och nytt försök behåller logiskt fokus och skiljer en ny händelse
  från den stängda.
- Faktisk mikrofonbehörighet bedöms separat i ROSTFEL-09.

### ROSTFEL-07: saknat röststöd kan stängas och prövas igen

**Syfte:** Återhämta en distinkt mikrofonhändelse utan att starta i förväg.

**Användare:** Alex.

**Förutsättningar:** Textsamtal pågår med mikrofon av. Följ
[mikrofonhindrens separata förberedelse](voice-controls-preparation.md#mikrofonhinder)
för unsupported.

**Integrationstest:**
[voice-errors.spec.ts](../../tests/integration/voice-errors.spec.ts),
ROSTFEL-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-errors.spec.ts",
    "caseId": "ROSTFEL-07"
  },
  "reference": "Kontrollerad extern mikrofonersättning unsupported; stängning, samma nya fel, väntande åtkomst och lyckad start.",
  "outcomes": [
    "Webbläsaren har inte stöd för röst. Du kan skriva till Skyttel.",
    "Stängning och nytt försök behåller logiskt fokus och skiljer en ny händelse från den stängda.",
    "Faktisk mikrofonbehörighet bedöms separat i ROSTFEL-09."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj Prata med Skyttel och läs hela notisen.
2. Fokusera Stäng notisen och tryck Enter. Kräv borttagen notis, fokus på
   mikrofonknappen och mikrofon av.
3. Försök igen utan att ändra hindret. Samma text ska ge en ny notis.
4. Startoperatören återställer hindret och förbereder väntande mikrofonåtkomst.
   Tryck igen och läs Rösten startar utan kvarvarande fel. Efter släppt åtkomst,
   läs Lyssnar och påslagen mikrofon.

**Förväntat resultat:**

- Webbläsaren har inte stöd för röst. Du kan skriva till Skyttel.
- Stängning och nytt försök behåller logiskt fokus och skiljer en ny händelse
  från den stängda.
- Faktisk mikrofonbehörighet bedöms separat i ROSTFEL-09.

### ROSTFEL-08: administrationsfel med läsbar referens

**Syfte:** Läsa rätt nästa handling utan privat leverantörsinnehåll.

**Användare:** Alex.

**Förutsättningar:** Textsamtal pågår och ingen röstanslutning finns. Förbered
voice-failure administration enligt
[serverfelets förberedelse](voice-controls-preparation.md#serverfel-och-referenser)
.

**Integrationstest:**
[voice-errors.spec.ts](../../tests/integration/voice-errors.spec.ts),
ROSTFEL-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/voice-errors.spec.ts",
    "caseId": "ROSTFEL-08"
  },
  "reference": "Kontrollerat serverfel administration; faktisk felreferens och lyckat uttryckligt återförsök.",
  "outcomes": [
    "Rösten fungerar inte. Kontakta administratören.",
    "En läsbar Felreferens hör till samma försök; rå svar-/loggjämförelse görs i separat förberedelse.",
    "Notisen visar inget privat leverantörsinnehåll."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Välj Prata med Skyttel. Läs feltexten och hela synliga Felreferens.
2. Kontrollera att notisen säger vad som går att göra och att mikrofonen är av.
3. Startoperatören återställer voice-failure off. Välj Prata med Skyttel igen.
   Kräv borttagen notis och Lyssnar.

**Förväntat resultat:**

- Rösten fungerar inte. Kontakta administratören.
- En läsbar Felreferens hör till samma försök; rå svar-/loggjämförelse görs i
  separat förberedelse.
- Notisen visar inget privat leverantörsinnehåll.

### ROSTFEL-09: riktigt nekat eller otillgängligt mikrofonljud

**Syfte:** Prova faktisk webbläsar-/OS-behörighet, saknad eller upptagen fysisk
mikrofon och återhämtning på verklig utrustning.

**Användare:** Den konfigurerade testmedlemmen.

**Förutsättningar:** Använd den
[riktiga enhetsförberedelsen](voice-assistant.md#tal-17-röstrutan-med-riktig-mikrofon-pekskärm-och-skärmläsare)
, med enbart påhittade uppgifter. Telefon och surfplatta behöver nåbar
HTTPS-adress och konfigurerad inloggning.

**Kräver mänsklig observation:** Prova faktisk webbläsar-/OS-behörighet, saknad
eller upptagen fysisk mikrofon och återhämtning på verklig utrustning.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "os-permission",
    "observation": "Prova faktisk webbläsar-/OS-behörighet, saknad eller upptagen fysisk mikrofon och återhämtning på verklig utrustning."
  },
  "reference": "Stödplattformarnas riktiga behörighetskontroller, fysisk mikrofon och ljudutgång.",
  "outcomes": [
    "Riktiga behörighets- och utrustningshinder lämnar text/formulär användbara.",
    "Ingen inspelning sker före godkänd åtkomst och fungerande uppspelning."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta ett samtal med text. Neka den riktiga mikrofonprompten och läs
   notisen. Stäng den och pröva igen.
2. Tillåt enligt webbläsarens inställningar och starta uttryckligen. Prova även
   frånkopplad eller upptagen mikrofon där plattformen medger det.
3. Prova verkligt blockerat ljud, Starta ljudet, fältets fortsatta användning
   och återställt fokus. Anteckna vad OS och webbläsare faktiskt gör.

**Förväntat resultat:**

- Riktiga behörighets- och utrustningshinder lämnar text/formulär användbara.
- Ingen inspelning sker före godkänd åtkomst och fungerande uppspelning.
