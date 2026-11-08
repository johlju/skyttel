# Manuella testfall för samtal med Skyttel

Fallen provar samlat utkast, rättelse och sparande, stoppade obeställda
åtgärder med felreferens, sena svar, avbrott,
kvittoåterhämtning, begärda samtalsdetaljer och faktisk markering.
Anteckna commit, webbläsare,
modell eller kontrollerad ersättare samt godkänt eller underkänt resultat.
De länkade integrationstesterna verifierar de kontrollerade flödena.
Stegen här är stöd för felsökning; automatiken kräver ingen manuell upprepning.

## Konfigurerade användare

- Alex Exempel är administratör i det påhittade hushållet Textprov.
- I den kontrollerade miljön väljs Google för lokal testinloggning utan
  externa konton. I verkligt modellprov använder Alex sin konfigurerade
  inloggning men enbart påhittat hushållsinnehåll.

## Allmän förberedelse

Följ [ingångarna till arbetsytorna](README.md#öppna-arbetsytor) när
fallen anger formulär, samtal, profil eller administration.

Öppna **Tabell → Redigera [objektets namn]** för ett befintligt objekt.
Samband nås genom **Samband för [namn]**. Formulär är modala; oskickade
uppgifter ligger kvar där medan redan startat arbete fortsätter. En ny
interaktion med textvyn kräver att formuläret först lämnas uttryckligen.
Escape visar **Lämna ändrade uppgifter?**. **Fortsätt redigera** behåller
alla värden. **Kasta ändringarna och fortsätt** lämnar bara det oskickade
formuläret; befintliga förslag i utkastet påverkas inte.

1. TEXT-01 använder familjeunderlaget i
   [separat förberedelse](text-conversation-preparation.md#familjerättelsen).
   TEXT-15 och TEXT-17 använder röstinstallationen enligt sin separata
   förberedelse.
   Övriga fall använder den
   [kontrollerade startguiden](#controlled-text-fixture).
   Den senare håller varje modellsvar tills du släpper det i terminalen.
   Den provar inte en verklig modells svenska språkförståelse.
2. För övriga fall: skapa hushållet Textprov. Skapa objektet **Lo Exempel** av typen
   **Person**, med beskrivningen **Påhittad uppgift**, genom formuläret.
   Välj **Lägg i utkastet och stäng** och lämna förslaget osparat.
3. När fallet inte anger en egen samtalsstart: välj **Skriv till Skyttel →
   Nytt samtal** och **Godkänn och starta**. Övriga fall anger starten i
   sina steg.
   [Samtalsmedgivandet](conversation-consent.md) har egna testfall.
4. Starta en ny tom kontrollerad installation mellan TEXT-02 till TEXT-09.
   Behåll samma databas under ett omstartsprov. Avsluta med `quit` och
   stäng provfönstret enligt startguidens städningssteg.

## Samtal och samlat sparande

### TEXT-SCOPE-01: stoppad åtgärd visar felreferens och behåller utkastet

**Syfte:** Läsa en stoppnotis utan att förlora befintliga förslag.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Startguidens osparade **Lo Exempel** finns i utkastet.
Modellers språkförståelse och verklig prompt-injektion ingår inte i provet.

**Separat förberedelse:** Starta den
[kontrollerade miljön](#controlled-text-fixture). Operatören skriver
`scope-read` före meddelandet. När terminalen visar `held`, använd dess
begärande-ID, `draft.version` och `draft.contentVersion` i:

```text
tool REQUEST discard_draft {"version":VERSION,"contentVersion":CONTENT_VERSION}
```

Detta släpper ett avsiktligt felaktigt modellsvar. Terminalens händelse
`assistant_action_out_of_scope` ska ha samma `reference` som notisen.
Inför mikrofonförsöken sätter operatören den simulerade mikrofonen till
nekad i webbläsarens konsol:

```javascript
window.skyttelVoiceFixture.setMicrophone('deny');
```

Ingen fysisk mikrofon eller röstleverantör används. För det sista
textuppdraget släpper operatören nästa hållna svar med
`reply REQUEST Ett nytt svar.`. De två vanliga felproven använder
`fail REQUEST` för respektive hållna svar. Återställ med `scope-work`; avsluta och
städa med `quit` efter provet.

**Automatiskt motsvarande test:**
[assistant-turn-scope.spec.ts](../../tests/integration/assistant-turn-scope.spec.ts),
TEXT-SCOPE-01. Separata HTTP-prov verifierar två medlemmars bevarade
utkast, sparade uppgifter och historik samt loggens begränsade innehåll.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/assistant-turn-scope.spec.ts",
    "caseId": "TEXT-SCOPE-01"
  },
  "reference": "Kontrollerad läsomfattning och felaktigt kastande; ingen verklig leverantör.",
  "outcomes": ["Notis och samtalstext visar samma felreferens, Lo ligger kvar och senare mikrofonnotiser och textuppdrag fungerar."],
  "evidence": [{
    "kind": "technical",
    "runner": "vitest",
    "suite": "server",
    "spec": "tests/unit/server/assistant-turn-scope.test.ts",
    "title": "a read-only request rejects a model proposal after a map read and reports a private-content-free reference",
    "purpose": "Kontrollerar gemensam loggreferens och oförändrat utkast utan privat innehåll i händelsen."
  }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta samtalet med text och godkänn. Visa utkastet och läs **Lo Exempel**.
2. Skicka **Sammanfatta kartan. Ändra ingenting.** Låt operatören släppa
   det felaktiga modellsvar som beskrivs ovan.
3. Läs notisen om stoppad åtgärd. Jämför felreferensen med samtalstexten.
4. Kontrollera att **Lo Exempel** ligger kvar i utkastet.
5. Stäng notisen. Låt operatören neka den simulerade mikrofonen.
   Tryck **Prata med Skyttel**, läs mikrofonnotisen och stäng den.
   Upprepa en gång; även det andra försöket ska visa samma mikrofonhinder.
6. Skicka **Sammanfatta kartan igen. Ändra ingenting.** Låt operatören
   åter släppa ett felaktigt kastande enligt förberedelsen. En ny stoppnotis
   ska visas med en annan felreferens. Stäng notisen.
7. Skicka **Prova ett vanligt fel.** Låt operatören neka svaret.
   Läs uppdragsfelets notis och stäng den. Upprepa en gång; båda felen
   ska visas trots det tidigare mikrofonhindret.
8. Skriv och skicka **Mitt nästa uppdrag**. Låt operatören släppa svaret.
   Läs **Ett nytt svar.** och kontrollera att ingen gammal notis visas.

**Förväntat resultat:** Åtgärden stoppas, samma referens finns i notis och
samtalstext och utkastet finns kvar. Senare fel kan visas på nytt och ett
nytt textuppdrag kan slutföras.
Ingen automatisk upprepning eller extra godkännanderuta visas.

### TEXT-01: familjeärendet sparas samlat med bevarad oskickad formulärtext

**Syfte:** Fortsätta ett befintligt utkast och spara en tydlig rättelse
utan extra ja, med ett riktigt kvitto.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Det exakt förberedda familjeunderlaget enligt separat
förberedelse, före inloggning. Ingen verklig API-nyckel krävs.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-01: familjeärendet sparas samlat med bevarad oskickad
formulärtext”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-01"
  },
  "reference": "Kontrollerat familjeunderlag på dator; samtidig konflikt och oskickat objektformulär.",
  "outcomes": [
    "Fortsätta ett befintligt utkast och spara en tydlig rättelse utan extra ja, med ett riktigt kvitto."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Börja med det kontrollerade, fullständiga familjeunderlaget. Öppna textvyn,
   godkänn, öppna utkastet och läs Lo-förslaget med samtidig konflikt.
2. Skicka **Behåll Lo-förslaget, rätta priset till 189 kr och spara.** Håll
   svaret enligt separat förberedelse. Stäng textvyn och välj **Tabell →
   Redigera Kim Exempel**. Skriv **Osänd text som ska finnas kvar** i
   Beskrivning utan att lägga den i utkastet.
3. Låt operatören släppa rättelsen och sparandet. Läs samma oskickade text.
   Tryck Escape, välj **Fortsätt redigera**, läs igen och lämna sedan med
   **Kasta ändringarna och fortsätt**.
4. Läs **Sparat.** i textvyn och det tomma utkastet. Fäll ut
   **Familjens Molnmusik** i Tabell och läs **Familjeabonnemang 189 kr per
   månad.**, pris 189, valuta SEK och intervall månad. Fäll ut **Lo Lind**
   och läs **Spelar piano i musikföreningen.**
5. Öppna **Rapporter → Ändringshistorik**, senaste familjerättelsen och
   **Visa ändringarna**. Läs Lo Lind, 189 SEK per månad och
   `musik@example.test`. De skilda rollerna och kunskapsstatusarna hör till
   det kompletta förberedda familjeunderlaget; tidigare kvitton finns kvar.

**Förväntat resultat:**

- Hela det beständiga utkastet sparas samlat. Ett extra ja krävs inte
  enbart därför att rättelsen ändrar version. Osäker identitet eller
  samtidig konflikt måste däremot redas ut före ett nytt sparbesked.
- Statusen bekräftar ett beständigt kvitto. Pris är 189 kr och de olika
  rollerna samt uppgifternas kunskapsstatus bevaras utan antagna fakta.
- Oskickad formulärtext finns kvar och har inte blivit del av sparandet.
- Dokumentera verklig modellförståelse separat från CI:s deterministiska
  verifiering. Ingen sådan mänsklig körning påstås här vara genomförd.

## Kontrollerade sena svar och fel

### TEXT-17: verifierat slutbesked behåller beställd förklaring i text och röst

**Syfte:** Få ett kort besked för ett färdigt enkelt uppdrag och hela den
beställda förklaringen när samma slags uppdrag kräver mer än beskedet.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo Exempel av typen Person med beskrivningen
Påhittad uppgift ligger osparad i utkastet. Mikrofonen är av.

**Separat förberedelse:** Följ
[verifierat slutbesked](text-conversation-preparation.md#verifierat-slutbesked).
En kontrollerad leverantör lämnar svaren. Provet verifierar serverns och
webbläsarens hantering; fysisk uppläsning och verklig modellförståelse
ingår inte.

**Automatiskt motsvarande test:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
TEXT-17.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-17"
  },
  "reference": "Dator; riktig server och databas med kontrollerade leverantörer. Enkelt textuppdrag, textuppdrag med förklaring och talad sparbegäran med förklaring. Separata nya installationer prövar skrivna uppdrag med mikrofonen på där förklaringen misslyckas efter verkligt sparande med en oberoende informationsfråga respektive en osparad utkaständring med en separat väntande ändringsfråga.",
  "outcomes": [
    "Ett verifierat enkelt uppdrag ger kort slutbesked utan att förslagen sparas.",
    "En beställd förklaring finns kvar efter utkaständringen och efter sparande med röst.",
    "Sparandet bekräftas med tomt utkast, verkliga objekt och ett gemensamt kvitto.",
    "Ett verkligt sparande, dess oberoende väntande informationsfråga och felet i en återstående förklaring finns med i text och kontrollerad röstleverans.",
    "En genomförd osparad ändring, dess separata väntande fråga och den uteblivna förklaringens felbesked finns med i text och kontrollerad röstleverans utan sparbesked."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/assistant-result-completion-http.test.ts",
      "title": "direct save continues requested explanation with missing result certification",
      "purpose": "Saknad slutkontroll får inte avsluta uppdraget före den beställda förklaringen."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/assistant-result-completion-http.test.ts",
      "title": "direct save continues requested explanation with following catalog read certification",
      "purpose": "Ett sparande får inte hoppa över en efterföljande beställd läsning i samma verktygsomgång innan förklaringen fortsätter."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/assistant-result-completion-http.test.ts",
      "title": "a report before requested changes keeps unfinished work active",
      "purpose": "Ett statusbesked får inte avsluta ett ändringsuppdrag innan något av det begärda arbetet är genomfört."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/assistant-result-completion-http.test.ts",
      "title": "a report after a partial batch keeps unfinished work active",
      "purpose": "En godkänd självständig del och ett statusbesked får inte ersätta återstående begärda ändringar."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/assistant-result-completion-http.test.ts",
      "title": "a report after a partial batch beside an older waiting question keeps unfinished work active",
      "purpose": "En äldre väntande fråga får inte avsluta en ny begäran efter enbart en självständig del."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/assistant-result-completion-http.test.ts",
      "title": "a report with a ready pending change keeps unfinished work active",
      "purpose": "En felaktig kontrolluppgift om slutförande får inte avsluta en känd återstående ändringsdel som är redo att utföras."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/voice-assistant.test.ts",
      "title": "a verified voice save retains requested saved-change report details before its final response",
      "purpose": "Begärda verifierade detaljer från samma sparande måste nå rösten tillsammans med det fullständiga svaret."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/voice-assistant.test.ts",
      "title": "a verified voice save retains its independent information question after its requested explanation",
      "purpose": "En lyckad beställd förklaring får inte tappa en separat väntande informationsfråga efter verkligt sparande."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/voice-assistant.test.ts",
      "title": "a verified voice save retains its independent information question when the required explanation fails",
      "purpose": "En oberoende informationsfråga får inte försvinna ur röstleveransen när sparandet lyckas men den återstående förklaringen misslyckas."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/voice-assistant.test.ts",
      "title": "a verified voice save retains the failure of its remaining requested explanation",
      "purpose": "Ett verkligt sparresultat får inte dölja felet när en beställd förklaring fortfarande saknas."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/voice-assistant.test.ts",
      "title": "a verified unsaved voice change retains its details when the required explanation fails",
      "purpose": "En talad begärans verifierade utkaständring och verkliga fel måste båda levereras utan att påstå sparande."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/voice-assistant.test.ts",
      "title": "a verified unsaved voice change retains its pending question when the required explanation fails",
      "purpose": "En talad begärans självständiga ändring, väntande fråga och senare förklaringsfel måste alla levereras med sina sakliga roller."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/voice-typed-delivery.test.ts",
      "title": "a failed typed completion delivers its own question before a later task question",
      "purpose": "En senare begärans fråga får inte ersätta en tidigare slutförd begärans väntande fråga i röstleveransen."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skriv **Lägg till Kim som person med samma objekttyp som Lo Exempel
   utan att spara.** Läs **Kim lades
   till.** när arbetet är klart. Öppna utkastet och läs Kim. Inget
   sparbesked visas.
2. Skriv **Ändra Kim till Kim Lind och förklara vad objekttypen Person
   betyder. Spara inte.** Läs både namnändringen och **Person är en
   objekttyp. Kim Lind är ett objekt av den typen.** Utkastet visar Kim
   Lind och inget sparbesked.
3. Slå på mikrofonen i samma samtal. Operatören lämnar det kontrollerade
   talet **Beskriv efter sparandet vilka objekt som är sparade. Spara
   hela utkastet.** Läs **Sparat.** och **Lo Exempel och Kim Lind
   finns nu i hushållets karta.** från samma svar. Utkastet är tomt.
4. Öppna Tabell och läs Person för både Lo Exempel och Kim Lind. Öppna
   **Rapporter → Ändringshistorik → Visa ändringarna** och läs båda
   objekten i samma sparande.
5. Följ förberedelsens separata felvariant i en ny installation med
   enbart Lo Exempel osparad. Starta text och slå på mikrofonen.
6. Skriv **Beskriv de sparade objekten och vilket år uppgifterna gäller.
   Lägg till Kim som person. Spara hela utkastet.**
   Operatören släpper tillägget och sparandet och avbryter därefter
   förklaringen. Läs **Sparat.**, **Vilket år gäller beskrivningen?** och
   felbeskedet. Kontrollera samma besked i den kontrollerade
   röstleveransen enligt förberedelsen.
7. Läs ett tomt utkast samt Lo Exempel och Kim av typen Person i Tabell.
   Öppna **Rapporter → Ändringshistorik** och kontrollera att ett sparande
   innehåller båda objekten. Informationsfrågan väntar fortfarande;
   den gör inget osparat ändringsförslag.
8. Följ förberedelsens osparade felvariant i ytterligare en ny
   installation med enbart Lo Exempel osparad. Starta text och slå på
   mikrofonen. Skriv **Lägg till Kim och en kollega med samma objekttyp
   som Lo Exempel och förklara typen Person. Spara inte.**
9. Operatören släpper utkaständringen och avbryter därefter förklaringen.
   Läs **Kim lades till.**, **Vad heter kollegan?** och felbeskedet.
   Kontrollera samma sakliga innehåll i den kontrollerade
   röstleveransen. Inget **Sparat.** ska finnas i text eller röstleverans.
10. Läs Kim och Lo Exempel i utkastet. Öppna
    **Rapporter → Ändringshistorik** och kontrollera att inget sparande
    finns.

**Förväntat resultat:**

- Det enkla slutbeskedet gäller ett verifierat osparat förslag. Förslaget
  blir sparat först när ett beständigt kvitto bekräftar sparandet.
- En beställd förklaring kräver fortsatt arbete och kommer med i hela
  svaret, även när resultatet sparas. Ett kort statusbesked ersätter den
  inte. Text och den kontrollerade röstleveransen ger samma sakliga
  sparresultat och förklaring.
- Om förklaringen misslyckas efter verkligt sparande behåller båda
  leveranssätten sparbeskedet, den oberoende informationsfrågan och det
  aktuella felbeskedet. Sparandet ersätter inte den uteblivna
  förklaringen och informationsdelen väntar fortfarande.
- Om förklaringen misslyckas efter en osparad ändring behåller båda
  leveranssätten den genomförda ändringens detaljer, frågan om kollegan
  och det aktuella felet. Den väntande delen framstår inte som färdig.
  Ändringen ligger kvar i utkastet; inget sparande påstås.

### TEXT-15: avvisat sparande bevarar utkastet före ett nytt talat sparbesked

**Syfte:** Behålla både tidigare och nya förslag när sparandet inte kan
godkännas, och sedan spara en uttryckligen begärd rättelse i samma samtal.

**Användare:** Alex i Textprov.

**Förutsättningar:** En ny kontrollerad röstinstallation med ett osparat
Lo Exempel av typen Person och beskrivningen Påhittad uppgift. Mikrofonen
är av från början. Inga verkliga leverantörer eller fysiska ljud används.

**Separat förberedelse:** Följ
[avvisad kontroll av hela utkastet](text-conversation-preparation.md#avvisad-kontroll-av-hela-utkastet).
Operatören styr modellens svar och det simulerade talet där.

**Automatiskt motsvarande test (integration eller webbläsare):**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
TEXT-15.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-15"
  },
  "reference": "Samma samtal med text och simulerat tal; hela utkastets kontroll avvisas efter en genomförd rättelse och nästa uttryckliga begäran tillåts. Kontrollerade leverantörer bevisar inte svensk talförståelse eller hörbart ljud.",
  "outcomes": [
    "Lo och Kim finns kvar osparade efter avvisat sparande, med tydligt besked.",
    "En informationsfråga återupplivar inget sparande.",
    "Ett nytt talat ändra-och-spara-besked sparar både Lo och Kim Lind med ett kvitto utan extra ja."
  ],
  "evidence": [{
    "kind": "technical",
    "runner": "vitest",
    "suite": "server",
    "spec": "tests/unit/server/conversation-whole-draft-save.test.ts",
    "title": "a rejected whole-draft check preserves both earlier proposals and the applied edit without registering a save",
    "purpose": "Avvisar den oberoende kontrollen av hela det resulterande utkastet före registrering och verifierar bevarat utkast genom publika HTTP-vägar."
  }, {
    "kind": "technical",
    "runner": "vitest",
    "suite": "server",
    "spec": "tests/unit/server/conversation-whole-draft-save.test.ts",
    "title": "an old whole-draft approval cannot save newer proposals and a rejected attempt needs fresh authority",
    "purpose": "Ändrar utkastet medan den oberoende kontrollen hålls och verifierar beständig avvisning, återhämtning och krav på ny uttrycklig sparbegäran."
  }, {
    "kind": "technical",
    "runner": "playwright",
    "suite": "technical-browser",
    "spec": "tests/technical-browser/whole-draft-preparation.spec.ts",
    "title": "literal whole-draft preparation reads omitted proposals before a rejected combined save",
    "purpose": "Kör publicerad läsning, batch, avvisning, informationsfråga och nytt talat sparande mot den disponibla installationen; hela utkastet hämtas innan Lo-förslagets typ används och omfattningen växlar uttryckligen mellan läsning och arbete."
  }]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna textvyn, börja samtalet och godkänn. Visa utkastet och läs Lo.
2. Skicka **Lägg till Kim som person och spara.** Låt operatören
   släppa förslaget och avvisa sparandet enligt förberedelsen.
3. Läs att ändringarna ligger kvar osparade och att ett nytt sparbesked
   behövs. Läs både Lo Exempel och Kim i utkastet. Öppna Lo och
   kontrollera att beskrivningen Påhittad uppgift finns kvar. Stäng detaljen.
4. Skicka **Vad finns i utkastet?** Läs redovisningen av båda personerna.
   Utkastet finns kvar och inget **Sparat.** visas.
5. Slå på **Prata med Skyttel** i samma samtal. Låt operatören förmedla
   **Ändra namnet på Kim till Kim Lind och spara.**
6. Läs **Sparat.** och ett tomt utkast. Läs Lo Exempel och Kim Lind i
   Tabell. Öppna **Rapporter → Ändringshistorik**, senaste sparandet och
   **Visa ändringarna**. Båda personerna ingår i samma sparande.

**Förväntat resultat:** Avvisat sparande lämnar genomförda förslag kvar
osparade. Informationsfrågan sparar ingenting. Ett nytt uttryckligt
talat besked kan både rätta och spara hela utkastet utan extra ja. Först
ett verkligt sparkvitto ger sparbesked och en gemensam historikpost.

### TEXT-02: sena svar efter kastat utkast och avbrott ändrar inte nytt arbete

**Syfte:** Ett äldre uppdrag får inte återinföra ett kastat förslag.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns. Terminalen håller modellsvar.
Datorfönstret är bredare än 700 px.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-02: sena svar efter kastat utkast och avbrott ändrar inte
nytt arbete”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-02"
  },
  "reference": "Dator; kontrollerad leverantör och den angivna motiverade felgränsen.",
  "outcomes": [
    "Ett äldre uppdrag får inte återinföra ett kastat förslag."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta med text och skicka **Rätta namnet.** Läs **Skyttel arbetar**.
   Välj **Kasta hela utkastet** medan operatören håller svaret.
2. Låt operatören släppa det gamla förslaget. Läs felnotisen och tomt utkast.
3. Skicka **Skapa ett nytt förslag.** När nästa svar hålls, tryck Escape
   med fokus i meddelandefältet. Släpp det sena svaret. Läs avbrottsbeskedet
   och tomt utkast; inget **För sent** har lagts tillbaka.
4. Fortsätt genom det vanliga objektformuläret med ett nytt förslag och
   kontrollera att endast detta nya arbete läggs i utkastet.

**Förväntat resultat:**

- Pågående status syns medan svaret hålls. Den gamla versionen avvisas
  efter kastandet, och aktuellt underlag visas för nästa besked.
- Det avbrutna uppdraget lägger inte tillbaka något. Nya formulär fungerar.
- Ett avbrott påstås aldrig ångra ett redan genomfört sparande.

### TEXT-03: nekade sparbesked och modellfel lämnar formulärarbetet tillgängligt

**Syfte:** Det verkliga meddelandet styr tillåtelsen att spara och ett
leverantörsfel förstör inte utkastet.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns osparat.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-03: nekade sparbesked och modellfel lämnar formulärarbetet
tillgängligt”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-03"
  },
  "reference": "Dator; kontrollerad leverantör och den angivna motiverade felgränsen.",
  "outcomes": [
    "Det verkliga meddelandet styr tillåtelsen att spara och ett leverantörsfel förstör inte utkastet.",
    "Samtalstexten förklarar att modellen är tillfälligt otillgänglig, att valet är kvar och att återförsök kräver en egen handling."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skicka **Spara inte.**, **Vad händer om vi sparar?**, **Spara ej.**,
   **Spara senare.** och **Skriv ”spara” i beskrivningen.**, ett i taget.
   Låt operatören försöka spara efter varje meddelande. Vänta på den
   uttryckliga felnotisen före nästa meddelande.
2. Skicka **Beskriv mitt utkast.** och låt operatören ge leverantörsfel.
   Läs felnotisen, modellens felbesked i samtalstexten och kvarvarande
   Lo-förslag.
3. Stäng textvyn, välj **Tabell → Redigera Lo Exempel**, rätta Namn till
   **Lo Lind** och välj **Lägg i utkastet och stäng**. Läs Lo Lind med
   oförändrad **Påhittad uppgift** i utkastets fullständiga uppgifter.

**Förväntat resultat:**

- Ingen av de nekade, hypotetiska, uppskjutna eller citerade begärandena
  sparar kartan, även när ersättaren försöker anropa sparverktyget.
- Felnotisen visar att uppdraget inte slutförs. Samtalstexten förklarar att
  modellen är tillfälligt otillgänglig, att valet är kvar och att återförsök
  kräver en egen handling när felet är löst.
- Utkastet och vanligt formulärarbete finns kvar. Provet är ett kontrollerat
  verktygsprov, inte bevis på språkförståelse.

## Kvitton och faktisk visning

### TEXT-04: ett tappat sparbesked återfinns efter omstart utan dubbelt sparande

**Syfte:** Återfinna ett genomfört sparande när webbläsaren saknar svaret.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns. Chrome utvecklarverktyg är öppna.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-04: ett tappat sparbesked återfinns efter omstart utan
dubbelt sparande”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-04"
  },
  "reference": "Dator; faktisk202, native UUID, genomförd transaktion, tappat svar och samma databas efter restart.",
  "outcomes": [
    "Återfinna ett genomfört sparande när webbläsaren saknar svaret."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "playwright",
      "suite": "technical-browser",
      "spec": "tests/technical-browser/text-assistant.spec.ts",
      "title": "manual text launcher public preparation seeded rejects an unaccepted delivery",
      "purpose": "Publik textstart med ett verkligt Lo-förslag: saknad session ger 404/not-accepted, oförändrat utkast, inga sparförsök, återställd leveranskontroll efter omladdning och borttagen provkatalog. Tomt utkast provas inte längre oberoende."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/save-operation-recovery-http.test.ts",
      "title": "a lost registered save response survives conversation stop and restart with a repeatable known outcome",
      "purpose": "Verklig registrering före tappat HTTP-svar, avslutat samtal och omstart; samma försök återfås utan nya modellbegäranden, kvitton eller historikposter."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/save-operation-recovery-http.test.ts",
      "title": "a lost registered save response survives conversation stop and restart with a repeatable unknown outcome",
      "purpose": "Bestående lagringsfel bevarar okänt utfall och spärr mot redigering och kastande vid upprepade kontroller; efter åtgärdat fel slutförs samma försök en gång utan modellarbete."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta med text. Låt operatören arma faktisk svarsförlust före
   **Spara hela utkastet nu.** Skicka meddelandet. Låt operatören genomföra
   sparandet och tappa svaret först efter riktig commit. Läs
   **Det är oklart om utkastet sparades. Skyttel kontrollerar det.**
2. Låt operatören starta om samma server och databas. Ladda om sidan och
   öppna textvyn. Gör inget nytt sparförsök.
3. Öppna **Rapporter → Ändringshistorik**, läs det enda sparandet med Lo.
   Öppna **Identifiera sparandet och användaren**. Läs det visade sparandet,
   användaren och tidpunkten. Låt operatören utföra den separata tekniska
   jämförelsen efter denna läsning, före nästa steg.
4. Öppna **Visa ändringarna** och läs **Person**, **Lo Exempel** och
   **Påhittad uppgift** efter sparandet. Återgå till arbetet och kontrollera
   det tomma utkastet.

**Förväntat resultat:**

- Frånkopplingen visas som bruten kontakt eller oklart sparande.
  Det betyder inte att sparandet
  misslyckades. Omstart bevarar det genomförda försöket och dess enda kvitto.
- Den automatiska kontrollen återfinner kvittot med ursprungligt ID.
  Ingen extra kopia eller
  nytt sparande behövs. Den kontrollerade browserleveransen tappar accepterat
  textsvar först
  efter genomfört sparande; offlineläge används inte som ersättning.

**Separat tekniskt underlag:** Den publika textstartens avvisningsprov
behåller ett faktiskt Lo-förslag. Det provar saknad session, oförändrat
utkast, inga sparförsök samt återställning och städning enligt
[förberedelsens avvisningsgräns](text-conversation-preparation.md#avvisad-leverans-med-befintligt-utkast).
Det oberoende avvisningsprovet från tomt utkast ingår inte längre.
Separat serverevidens tappar också registreringssvaret före avslut och
omstart. Den provar både verifierat utfall och ett verkligt lagringsfel
med fortsatt okänt utfall, bevarad spärr och upprepade statuskontroller.

### TEXT-16: tappat ändringsbesked återfinns utan dubbla förslag

**Syfte:** Återfinna genomförda osparade ändringar efter ett tappat
verktygssvar, med tidigare självständiga förslag kvar. Skilj genomförandet
från ett slutfört uppdrag när återstående arbete inte är klart.

**Användare:** Alex i den kontrollerade textinstallationen.

**Förutsättningar:** Lo Exempel av typen Person med beskrivningen
Påhittad uppgift finns i ditt utkast. Kim finns inte ännu.

**Separat förberedelse:** Operatören följer
[tappat ändringsbesked](text-conversation-preparation.md#tappat-ändringsbesked).
Den förberedelsen tappar svaret efter verkligt genomförande och startar
om samma server med samma databas vid det angivna steget.

**Automatiskt motsvarande test (integration):**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
`TEXT-16`.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "runner": "playwright",
    "suite": "integration",
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-16"
  },
  "reference": "Dator; kontrollerad leverantör, genomförda utkaständringar före tappat MCP-svar, tillfälligt otillgänglig statuskontroll och omstart med samma databas. Separat ny installation prövar ett skrivet uppdrag med beställd förklaring och mikrofonen på. Den enkla textvarianten saknar intyg om hela uppdragets slutförande; förklaringsvarianten har ett batchintyg men kräver fortfarande svar.",
  "outcomes": [
    "Ett verifierat ändringsbesked visas efter tappat verktygssvar.",
    "Nytt arbete väntar tills samma ändringars utfall kan kontrolleras; notisen beskriver ändringar utan att påstå att något sparas.",
    "Tidigare Lo-förslag och ett enda Kim-förslag ligger kvar osparade även efter omstart.",
    "Genomförandet visas tillsammans med besked om pausat återstående arbete och ursprunglig instruktion när hela uppdraget inte är verifierat klart.",
    "Beställd men utebliven förklaring blir inte ett lyckat slutbesked i text eller kontrollerad röstleverans; statuskontrollen startar inget nytt arbete.",
    "Den oberoende väntande frågan om vilket år uppgifterna gäller finns kvar i både text och den återhämtade röstleveransen."
  ],
  "evidence": [
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/operation-recovery-http.test.ts",
      "title": "status-only recovery preserves unfinished requested explanation in voice",
      "purpose": "Tappat genomfört ändringsbesked och otillgänglig första statuskontroll får inte ersätta beställd förklaring med ett färdigt uppdrag; den ursprungliga instruktionen och felbeskedet följer även den accepterade begärans publika hämtning."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/operation-recovery-http.test.ts",
      "title": "status-only recovery checks pending changes after batch resolution with another ready change",
      "purpose": "En batch slutför sin bevisade väntande del men får inte ge ett färdigt uppdrag när en annan förtydligad ändring återstår."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/operation-recovery-http.test.ts",
      "title": "an unresolved batch retains its identity through failed status reads and recovers without new work",
      "purpose": "Genomförd batch, tappat svar och otillgänglig första statuskontroll bevarar operationens identitet och spärrar nytt arbete tills samma utfall återhämtas utan nya modell- eller ändringsanrop."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/operation-recovery-http.test.ts",
      "title": "a text request recovers its committed batch after lost MCP delivery without another model call",
      "purpose": "Verkligt genomförande, tappad MCP-leverans, en arbetsbegäran, beständigt utfall och oförändrat utkast efter omstart."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/operation-recovery-http.test.ts",
      "title": "a committed batch changed during withheld delivery pauses with its verified outcome and the actual current draft",
      "purpose": "En verklig manuell rättelse under hållen leverans behålls och tidigare genomförande skiljs från aktuellt utkast."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/operation-recovery-http.test.ts",
      "title": "a committed batch changed during withheld delivery pauses with its verified outcome and the actual current draft during a draft response race",
      "purpose": "Ett redan läst men fördröjt utkastbesked får inte ersätta en senare manuell rättelse eller ge ett falskt färdigbesked."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/operation-recovery-http.test.ts",
      "title": "an unresolved batch blocks direct admission in a new conversation on another browser",
      "purpose": "Ett uttryckligen skickat uppdrag i en annan webbläsare väntar på samma utkast tills den tidigare batchens utfall är verifierat och fortsätter sedan en gång med aktuellt underlag."
    },
    {
      "kind": "technical",
      "runner": "vitest",
      "suite": "server",
      "spec": "tests/unit/server/operation-recovery-http.test.ts",
      "title": "an unresolved batch blocks direct admission in a previously opened conversation on another browser",
      "purpose": "Ett redan öppet samtal i en annan webbläsare har samma spärr för nya uppdrag medan en tidigare batch har okänt utfall."
    },
    {
      "kind": "technical",
      "runner": "playwright",
      "suite": "technical-browser",
      "spec": "tests/technical-browser/text-assistant.spec.ts",
      "title": "literal text preparation drops a committed batch reply and preserves its proposals across restart",
      "purpose": "Den publicerade operatörsförberedelsen kör verkliga kommandon mot textverktyget, tappar genomfört MCP-svar, startar om samma databas och städar provkatalogen."
    },
    {
      "kind": "technical",
      "runner": "playwright",
      "suite": "technical-browser",
      "spec": "tests/technical-browser/text-assistant.spec.ts",
      "title": "literal voice preparation drops a committed batch reply and preserves its proposals across restart",
      "purpose": "Röstverktygets publicerade kommandon prövas med skrivet uppdrag och mikrofonen på: tappat genomfört MCP-svar återhämtas med Kim, pausat återstående arbete och väntande fråga i text och kontrollerad röstleverans utan nytt modellarbete eller sparande; utkastet bevaras vid omstart och provkatalogen städas."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Starta med text. Skicka **Lägg till Kim utan att spara.** Låt operatören
   leverera förslaget vid den förberedda felgränsen. Läs notisen att det är
   oklart om ändringarna genomförs och att Skyttel kontrollerar dem.
   Skriv **Vänta med nästa uppdrag.** utan att skicka. Kontrollera att
   **Skicka** inte går att välja.
   Låt operatören återställa statuskontrollen. Läs beskedet att Kim läggs
   till i utkastet och att uppdraget inte är slutfört, med återstående
   arbete pausat och ursprunglig instruktion kvar. Kontrollera att den
   oskickade texten finns kvar och ta sedan bort den.
2. Välj **Visa utkastet**. Läs det tidigare förslaget om Lo Exempel och ett
   enda förslag om Kim. Öppna Kim-förslaget och kontrollera typen Person.
   Stäng förslaget.
3. Låt operatören starta om servern. Ladda om sidan, öppna tabellen och
   starta med text igen. Välj **Visa utkastet** och läs samma Lo-förslag och
   ett enda Kim-förslag.
4. Upprepa i en ny kontrollerad röstinstallation med samma Lo-förslag.
   Starta med text och slå på mikrofonen. Skriv **Lägg till Kim utan att
   spara, förklara vad ett utkast betyder och beskriv vilket år uppgifterna
   gäller.** Upprepa steg 1–3 med samma
   leveransbortfall. Läs beskedet om genomfört förslag och pausat återstående
   arbete i text och kontrollerad röstleverans. Kontrollera att hela din
   instruktion finns kvar i samtalstexten.
   Läs även **Vilket år gäller beskrivningen?** i text och i den återhämtade
   röstleveransen. Lämna frågan obesvarad under kontrollen.

**Förväntat resultat:**

- Ändringsbeskedet bygger på det genomförda förslaget trots tappat
  verktygssvar. Samma förslag utförs en gång.
- Både Lo Exempel och Kim ligger kvar osparade före och efter omstart.
  Inget sparbesked visas. Omstarten bevarar utkastet; ett nytt samtal får
  sitt eget tillstånd.
- Det genomförda förslaget betyder inte att den uteblivna förklaringen
  är klar. Beskedet om pausat arbete finns kvar utan ny instruktion,
  förklaring eller sparande genom statuskontrollen. Om hela det enkla
  uppdraget har ett separat verifierat slutintyg räcker dess korta
  ändringsbesked; den kontrollerade manuella textleverantören saknar det.

Separat serverevidens kontrollerar nya och redan öppna samtal i andra
webbläsare. Deras skickade uppdrag väntar på tidigare ändringars utfall och
fortsätter sedan i ordning med aktuellt underlag. En manuell rättelse
under fördröjd utkastläsning finns kvar och ger ett besked om att utkastet
ändras efter det tidigare genomförandet.
Ytterligare serverevidens skiljer en slutförd väntande del från en annan
förtydligad ändring som återstår. Ett senare uttryckligen registrerat
sparförsök kan kontrolleras även efter ett tidigare ändringsbesked.

### TEXT-05: markering kräver visning och skyddar oskickad text

**Syfte:** Markeringsbesked ska motsvara ett faktiskt visat urval.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns och inget formulär har osänd text.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-05: markering kräver visning och skyddar oskickad text”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-05"
  },
  "reference": "Dator; kontrollerad leverantör och den angivna motiverade felgränsen.",
  "outcomes": [
    "Markeringsbesked ska motsvara ett faktiskt visat urval."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skicka **Markera Lo i kartan.** Släpp visningen enligt separat
   förberedelse. Läs Lo markerad, **Påhittad uppgift** i detaljpanelen och
   **Markerat i kartan.** i kartans status. Sluttexten är **Markerat!**.
2. Skicka **Markera Lo igen.** Håll svaret. Stäng textvyn och välj
   **Tabell → Redigera Lo Exempel**. Skriv **Osänd uppgift** i Beskrivning.
3. Släpp det gamla visningsanropet och samma sluttext. Läs kvarvarande
   oskickad beskrivning. Escape, **Fortsätt redigera**, läs igen, sedan
   Escape och **Kasta ändringarna och fortsätt**.
4. Läs den fria sluttexten i textvyn. Återgå till Karta; inget nytt
   **Markerat i kartan.** ska bekräfta den avvisade visningen.

**Förväntat resultat:**

- Första markeringen motsvarar faktisk webbläsarvisning och
  `displayed: true`.
- Det andra försöket ger ingen ny bekräftad markering. Oskickad text
  finns kvar. **Markerat!** visas som obekräftad samtalstext, skild från
  det faktiska urvalet. Modellens text ensam ändrar inte kartans urval.

### TEXT-06: obekräftad samtalstext skiljs från sparande och markering

**Syfte:** Skilja modellens fria svar från bekräftade resultat, även när
svaret påstår att något har utförts med andra ord.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns i utkastet. Anteckna aktuellt urval
i kartan innan du börjar. Inget sparande är genomfört.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
“TEXT-06: obekräftad samtalstext skiljs från sparande och markering”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-06"
  },
  "reference": "Dator; kontrollerad leverantör och den angivna motiverade felgränsen.",
  "outcomes": [
    "Skilja modellens fria svar från bekräftade resultat, även när svaret påstår att något har utförts med andra ord."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Anteckna kartans urval. Skicka **Beskriv mitt utkast.** fyra gånger,
   ett meddelande för varje förberett fritt svar. Läs varje svar i
   Samtalstext. Öppna **Visa utkastet → Visa förslaget: Lo Exempel** och
   läs **Person** och **Påhittad uppgift** efter varje svar; stäng uppgifterna
   och dölj utkastet före nästa meddelande.
2. Kartans urval och utkast är oförändrade. Ingen av de fria texterna
   skapar ett kvitto; historiken är tom.
3. Skicka **Spara hela utkastet nu.** Låt operatören släppa faktiskt
   sparverktyg. Kräv **Sparat.**, tomt utkast och ett enda Lo-sparande
   i **Rapporter → Ändringshistorik**.

**Förväntat resultat:**

- Andra språk och omskrivningar blir inte bevis på sparande eller markering.
  Samtalstexten behålls men dess obekräftade källa framgår.
- Efter de fyra fria svaren är Lo fortfarande osparad, kartans urval är
  oförändrat och inget kvitto finns för dessa svar. Det sista riktiga
  sparanropet ger däremot kvitto, sparad Lo och bekräftad status.
- Användbara frågor försvinner inte genom en lista med förbjudna ord.

### TEXT-08: markering öppnar och centrerar objekt och samband före bekräftelsen

**Syfte:** Skyttels markeringsbesked ska följa synlig karta och rätt
uppgifter i detaljpanelen, även när kartan är stängd eller bortpanorerad
och när skärmen är smal.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo-förslaget finns. Lägg även **Molnmusik**, typ
**Person**, och ett samband **Lo Exempel → Använder → Molnmusik** i
utkastet genom formulären. Stäng formulären utan oskickad text.

**Integrationstest:**
[assistant-map.spec.ts](../../tests/integration/assistant-map.spec.ts),
testfallet “TEXT-08: markering öppnar och centrerar objekt och samband
före bekräftelsen”, referensen 1440 × 1000 CSS-pixlar. Separata storleksfall
finns nedan.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-map.spec.ts",
    "caseId": "TEXT-08"
  },
  "reference": "1440 × 1000 CSS-pixlar; synlig karta och detaljer, bortpanorerat samband, oskickat sambandsformulär.",
  "outcomes": [
    "Skyttels markeringsbesked ska följa synlig karta och rätt uppgifter i detaljpanelen, även när kartan är stängd eller bortpanorerad och när skärmen är smal."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Skicka **Visa Lo i kartan.** Låt operatören släppa objektvisningen.
   Läs Lo markerad och **Påhittad uppgift** samtidigt i detaljpanelen.
   Stäng uppgifterna efter sluttexten och öppna textvyn; Lo är fortfarande
   valt och **Markerat i kartan.** står i kartans status.
2. Öppna **Navigera**, panorera vänster tills objekten inte syns. Skicka
   **Visa sambandet mellan Lo och Molnmusik.** Släpp sambandsvisningen.
   Läs båda objekten och det markerade sambandet samtidigt med
   **Lo Exempel → Använder → Molnmusik** i detaljpanelen.
   På smal skärm: använd Tab eller Skift+Tab till **Kartans sammanhang**
   längre ned i arbetsytan. Läs statusen och använd End för att nå
   teckenförklaringens sista rad, **Punkter: etikettens koppling**.
3. Skicka **Visa Lo igen.** Håll svaret, stäng textvyn och välj
   **Redigera valt samband** med tangentbord. Kontrollera Molnmusik i
   **Till objekt** och ändra till Lo utan att lägga ändringen i utkastet.
4. Släpp den gamla visningen. Läs samma oskickade värde Lo i formuläret.
   Ingen ny bekräftad markering tillkommer. Avsluta provet utan att lägga
   formulärändringen i utkastet. Vid hopfällda verktyg används
   **Visa verktygens namn** före skrivandet.

**Förväntat resultat:**

- Markeringsbekräftelsen kommer först efter att det efterfrågade objektet
  eller sambandet visas i kartan och dess uppgifter samtidigt syns i
  detaljpanelen, även på telefon.
- Kamera och vy anpassas till urvalet utan att personliga placeringar
  eller hushållets innehåll ändras.
- Kartans sammanhang och teckenförklaring går att fokusera och läsa med
  tangentbord på smal skärm. Den fokuserade ytan är helt synlig.
- Oskickad formulärtext förhindrar ett nytt urval. Ingen ny bekräftad
  markering påstås, och formulärets uppgifter finns kvar.

### TEXT-09: samtalet beskriver verkliga ändringar i utkast och kvitto

**Syfte:** Granska verkliga före- och eftervärden i samtalet och få samma
detaljer från kvittot efter ett kort sparbesked.

**Användare:** Alex i den kontrollerade installationen.

**Förutsättningar:** Lo och Tonrum (Tjänst, Gäller fortfarande) samt deras
Använder-samband
är samlat sparade. Terminalen håller modellsvar.
Datorfönstret är bredare än 700 px.
Alla uppgifter är påhittade.

**Integrationstest:**
[text-assistant.spec.ts](../../tests/integration/text-assistant.spec.ts),
testfallet “TEXT-09: samtalet beskriver verkliga ändringar i utkast och kvitto”.

**Separat förberedelse:**
[Operatörens exakta verktyg och felgränser](text-conversation-preparation.md).

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/text-assistant.spec.ts",
    "caseId": "TEXT-09"
  },
  "reference": "Dator; kontrollerad leverantör och den angivna motiverade felgränsen.",
  "outcomes": [
    "Granska verkliga före- och eftervärden i samtalet och få samma detaljer från kvittot efter ett kort sparbesked."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Redigera det sparade sambandet via **Tabell → Samband för Lo Exempel**.
   Byt Använder till **Betalar**, välj **Lägg i utkastet**, läs bekräftelsen
   och stäng samband. Redigera Tonrum och välj **Upphört** under
   **Objektets status**, sedan **Lägg i utkastet och stäng**.
2. Öppna utkastet och läs båda rättelserna innan något senare uppdrag.
   Skicka **Läs upp hela utkastet.** Låt operatören leverera rapporten.
   Läs **Utkast:**, **Tonrum (Gäller: aktuellt → upphört)** och
   **Lo Exempel Använder Tonrum → Lo Exempel Betalar Tonrum**.
3. Skicka **Spara hela utkastet nu.** Läs **Sparat.** och tomt utkast.
   Öppna **Tabell → Filter**, markera **Ta med upphörda** och stäng
   filtret med Escape. Fäll ut Tonrum och läs **Tjänst** och
   **Manuellt upphört**.
4. Skicka **Vad sparades senast?** Låt operatören leverera kvittorapporten.
   Läs **Sparandet:** med samma före-/eftervärden. Tabell finns kvar och
   inget nytt sparande har tillkommit.

**Förväntat resultat:**

- Både det osparade utkastet och det senaste kvittot beskriver den
  verkliga ändringen från aktuellt till upphört och från Använder till
  Betalar. Förevärdet får inte beskrivas med den nya sambandstypen.
- Begärda detaljer visas som Skyttels svar i samtalstexten. Granskningen kräver
  ingen kartmarkering och ändrar eller sparar inga uppgifter.
- Själva sparandet bekräftas kort. Detaljer ges när de efterfrågas och
  bygger då på det beständiga kvittot.

## Separata kvarvarande kartstorlekar

### TEXT-10: markering öppnar och centrerar objekt och samband före bekräftelsen

**Syfte:** Skydda kortare datorvy.

**Användare:** Alex.

**Förutsättningar:** Nytt identiskt underlag som TEXT-08, vid 1280 × 720.

**Integrationstest:**
[assistant-map.spec.ts](../../tests/integration/assistant-map.spec.ts), TEXT-10.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-map.spec.ts",
    "caseId": "TEXT-10"
  },
  "reference": "1280 × 720 CSS-pixlar; kortare datorvy.",
  "outcomes": [
    "Objekt och samband visas med läsbara detaljer före bekräftelsen.",
    "Oskickad Till objekt-rättelse bevaras och hindrar ett nytt urval."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXT-08:s steg 1–4 **en gång** vid 1280 × 720. Under steg 1–2
   bedöms samtidiga läsbara detaljer; under steg 3–4 bevarat formulär.

**Förväntat resultat:**

- Samma fullständiga visnings- och oskickade formulärgräns som TEXT-08
  fungerar vid denna storlek. Ingen faktisk zoom eller fysisk pekare påstås.

### TEXT-11: markering öppnar och centrerar objekt och samband före bekräftelsen

**Syfte:** Skydda smal karta med samtidig detaljläsning.

**Användare:** Alex.

**Förutsättningar:** Nytt identiskt underlag som TEXT-08, vid 390 × 844.

**Integrationstest:**
[assistant-map.spec.ts](../../tests/integration/assistant-map.spec.ts), TEXT-11.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-map.spec.ts",
    "caseId": "TEXT-11"
  },
  "reference": "390 × 844 CSS-pixlar; smal karta med samtidig detaljläsning.",
  "outcomes": [
    "Objekt och samband visas med läsbara detaljer före bekräftelsen.",
    "Kartans sammanhang och teckenförklaring går att läsa med tangentbord efter ett nytt urval.",
    "Oskickad Till objekt-rättelse bevaras och hindrar ett nytt urval."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXT-08:s steg 1–4 **en gång** vid 390 × 844. Under steg 1–2
   bedöms samtidiga läsbara detaljer; under steg 3–4 bevarat formulär.

**Förväntat resultat:**

- Samma fullständiga visnings- och oskickade formulärgräns som TEXT-08
  fungerar vid denna storlek. Ingen faktisk zoom eller fysisk pekare påstås.

### TEXT-12: markering öppnar och centrerar objekt och samband före bekräftelsen

**Syfte:** Skydda kort smal karta.

**Användare:** Alex.

**Förutsättningar:** Nytt identiskt underlag som TEXT-08, vid 640 × 500.

**Integrationstest:**
[assistant-map.spec.ts](../../tests/integration/assistant-map.spec.ts), TEXT-12.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-map.spec.ts",
    "caseId": "TEXT-12"
  },
  "reference": "640 × 500 CSS-pixlar; kort smal karta.",
  "outcomes": [
    "Objekt och samband visas med läsbara detaljer före bekräftelsen.",
    "Kartans sammanhang och teckenförklaring går att läsa med tangentbord efter ett nytt urval.",
    "Oskickad Till objekt-rättelse bevaras och hindrar ett nytt urval."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXT-08:s steg 1–4 **en gång** vid 640 × 500. Under steg 1–2
   bedöms samtidiga läsbara detaljer; under steg 3–4 bevarat formulär.

**Förväntat resultat:**

- Samma fullständiga visnings- och oskickade formulärgräns som TEXT-08
  fungerar vid denna storlek. Ingen faktisk zoom eller fysisk pekare påstås.

### TEXT-13: markering öppnar och centrerar objekt och samband före bekräftelsen

**Syfte:** Skydda ytterst kort karta och nåbara detaljer.

**Användare:** Alex.

**Förutsättningar:** Nytt identiskt underlag som TEXT-08, vid 320 × 250.

**Integrationstest:**
[assistant-map.spec.ts](../../tests/integration/assistant-map.spec.ts), TEXT-13.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/assistant-map.spec.ts",
    "caseId": "TEXT-13"
  },
  "reference": "320 × 250 CSS-pixlar; ytterst kort karta och nåbara detaljer.",
  "outcomes": [
    "Objekt och samband visas med läsbara detaljer före bekräftelsen.",
    "Kartans sammanhang och teckenförklaring går att läsa med tangentbord efter ett nytt urval.",
    "Oskickad Till objekt-rättelse bevaras och hindrar ett nytt urval."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Utför TEXT-08:s steg 1–4 **en gång** vid 320 × 250. Under steg 1–2
   bedöms samtidiga läsbara detaljer; under steg 3–4 bevarat formulär.

**Förväntat resultat:**

- Samma fullständiga visnings- och oskickade formulärgräns som TEXT-08
  fungerar vid denna storlek. Ingen faktisk zoom eller fysisk pekare påstås.

## Pensionerat ID

TEXT-07 får inte återanvändas. Dess fältvärde 1111 → 2222, nya
sambandstyp och oförändrade sparade värden finns i SAMTALSUTKAST-01.
Den separata generiska granskningen upphör efter demonstrerad överföring.

## Controlled text fixture

Use this launcher for reproducible provider failures and delayed replies.
It runs the actual application, browser authentication, OAuth/MCP and SQLite
against a fresh temporary database. Only the external identity and model
providers are substitutes. It makes no real Google, Microsoft or OpenAI
requests and needs no provider credentials. It never opens your normal
development database or private environment file.

These controls verify application behavior, not a real model's understanding
of Swedish. Keep real-model results separate. Integration tests cover these
controlled scenarios; manual repetition is optional troubleshooting.

### Start and sign in

From the repository root, with dependencies installed, run:

```sh
npm run build
npm run test:env -- node --import tsx scripts/manual-text-assistant.ts
```

Keep this terminal open. The `ready` event prints an `origin` such as
`http://127.0.0.1:43127`. In VS Code's **Ports** panel, forward that printed
port to the same host port, keeping it private. Open the exact printed
origin in a new private browser window. Use `127.0.0.1`, not `localhost`:
authentication and same-origin checks use the printed address.

Choose Google sign-in. The substitute provider signs in **Alex Exempel**
without an external account or password. Complete the normal first-household
form with the name **Textprov**. Create only made-up content. Choose
**Skriv till Skyttel → Nytt samtal** and select **Godkänn och starta**.
The substitute uses that same application consent flow.

Enter the scenario's message and press **Skicka**. Each provider request
stops at the external boundary and prints a `held` event in the terminal.
Its increasing `id` identifies that exact request. The event includes the
synthetic message, draft versions, latest tool result, and available tool
names. The browser must continue showing ongoing work until you release a
response or cancel the task.

### Terminal commands

Enter commands in the launcher terminal, one line at a time. These are
launcher commands, not shell commands. Tool arguments must be one JSON
object using the tool's documented schema. The actual MCP entrance still
validates scope, permissions, versions and domain rules.

<!-- markdownlint-disable MD013 -->
| Command | Effect |
| --- | --- |
| `pending` | Display every held provider request and its original context. |
| `tool REQUEST TOOL JSON` | Return one model tool call for that held request. The application processes it through its actual MCP client. |
| `reply REQUEST TEXT` | Return a final plain-text model reply for that held request. |
| `fail REQUEST` | Fail that held provider request at the external boundary. |
| `restart` | Reject outstanding provider responses, restart the application with the same temporary database and origin, and release old assistant sessions. |
| `quit` | Stop the installation and delete its temporary database. |
<!-- markdownlint-enable MD013 -->

Replace `REQUEST` with the numeric `id` from the relevant `held` event.
For example, when request `1` is held, enter:

```text
tool 1 read_type_catalog {}
```

This releases request `1`. The application runs `read_type_catalog` through
MCP and asks the substitute model what to do next. A new `held` event, `2`,
contains the actual catalog under `lastToolResult`. To finish this simple
read without making a proposal, enter:

```text
reply 2 Typkatalogen är läst. Inget förslag har ändrats.
```

For a proposal, use the exact tool name and JSON arguments specified by the
manual case. Copy type/object IDs from the tool result and use the draft
`version` and `contentVersion` shown when the request was held. The launcher
does not repair, refresh or replace those arguments. A released tool call
does not itself prove that a proposal or save succeeded: inspect the next
`lastToolResult`, browser draft and any durable receipt.

### Delay, failure and restart

For a delayed response, leave the request held while performing the manual
case's browser edit, discard, cancellation or new instruction. Release the
original request by its original ID with its original arguments. Releasing
an old request must not replace newer work. Cancellation may cause the SDK
to ignore the released provider response entirely; confirm the actual
browser and saved/private map state, not just the terminal's `released`
event. `pending` can still show that intentionally retained old response.

For a provider failure, enter `fail` followed by the current held ID. Check
the browser error and preserved draft. Continue ordinary manual map editing
to confirm that it remains available. A new assistant message produces a
new held request that can be answered normally. No real network outage or
API charge is involved.

For restart recovery, enter `restart` and wait for `restarted`. Reload the
browser and start a new assistant session through its normal consent box.
The database and browser login remain, while old conversation memory and
assistant grants are closed. The application reads durable proposals and
operation results through a new ordinary MCP connection. `restart` does
not simulate a missing post-commit response: use the manual case's stated
response-loss control when that fault is required.

### Cleanup

Enter `quit`, or press Ctrl+C. Wait for `closed`, which confirms deletion
of this launcher's temporary database. Close the private browser window
and remove its port-forward entry. Each new launcher process starts empty.
If the process is forcibly killed, stop any remaining process before
deleting only the temporary `directory` printed by its `ready` event.

Do not reuse this fixture for real household data. Terminal output includes
synthetic task context intentionally; do not publish terminal recordings.
No production endpoint, provider-address override or authentication bypass
is added by this development launcher.
