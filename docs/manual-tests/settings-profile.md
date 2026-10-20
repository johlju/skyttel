# Manuella testfall för inställningar och profil

Fallen omfattar helsidan, kontots separata profil och gemensamt typförslag.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex är administratör i ett separat provhushåll. Robin är vanlig medlem.
Använd konfigurerade testidentiteter och påhittade uppgifter. För driftens
kostnader krävs installationens särskilda driftbehörighet.

## Allmän förberedelse

INST-12/13 använder
[egna provdata och återställning mellan delprocedurer](workspace-preparation.md#fysiska-enheter-och-egen-provdata).
Faktisk telefon använder samma vanliga HTTPS-ingång; NVDA på dator kan
använda dess lokala provinstallation.

1. Förbered en
   [separat provdatabas](../development/devcontainer.md#disposable-local-database)
   och logga in. Börja varje fall utan utkast eller oskickad text.
2. Behåll fliken under fallet. Använd de mått och teman som varje fall
   anger; faktisk zoom och fysisk inmatning provas i INST-12.
3. Bedöm även skärmläsare, förstoring och fokus på fysiska enheter.
   Redovisa dessa prov separat från automatiserad Chromium-emulering.

## Inställningar

### INST-01: skydda formulärtext och behåll utkastets återkoppling

**Syfte:** Besöka inställningarnas helsida utan att förlora kartarbetet.

**Användare:** Alex.

**Förutsättningar:** Kartan är öppen och inga formulär är påbörjade.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts),
INST-01.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/settings-profile.spec.ts",
    "caseId": "INST-01"
  },
  "reference": "1280 CSS-pixlars bredd: helsida, formulärförlust och återläsning av utkastet.",
  "outcomes": [
    "Oskickat arbete skyddas och inställningar och profil har nåbart innehåll och synligt återställt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Nytt objekt**. Skriv **Oskickad cykel** i **Namn**.
2. Tryck Escape och välj **Fortsätt redigera**. Kontrollera namnet och
   fältfokus. Tryck Escape igen och välj **Kasta ändringarna och fortsätt**.
   Öppna **Inställningar**, på telefon via **Visa verktygens namn**.
3. Kontrollera sidrubrikens fokus. Använd Tab för att följa navigationen.
   Kartan och dess formulär ska vara dolda och inte nås bakom sidan.
4. På mobil: välj **Välj inställning** och kontrollera att **Översikt**
   är aktuell sida. Kontrollera hushållets och administrationens ingångar.
5. Välj **Tillbaka till kartan** och **Nytt objekt**. Namnet är tomt;
   kastad text återkommer inte. Stäng det oförändrade formuläret med Escape.
6. Besök Inställningar igen. Välj **Tillbaka till kartan**.
   Öppna **Nytt objekt** och kontrollera det tomma namnfältet igen.
7. Skriv **Oskickad cykel** och välj **Lägg i utkastet och stäng**.
   Besök Inställningar och läs **Ändringen finns i ditt utkast.
   Kartan sparas separat.** Återkopplingens stängknapp
   får inte täcka texten. Välj **Tillbaka till kartan** och sedan
   **Visa utkastet**. Välj **Visa förslaget: Oskickad cykel**. Läs namnet,
   objekttypen
   och att ingen egenskap Beskrivning är tillagd. Spara inte.

**Förväntat resultat:**

- Inställningar fyller sidan och har egen översikt och sidnavigation.
- Mobilnavigationen börjar hopfälld och går att öppna med tangentbord.
- **Fortsätt redigera** behåller namn och fokus. Ett uttryckligt val
  kastar formulärtexten; nya formulär är tomma. Utkastets återkoppling
  finns kvar och hela det fortfarande privata utkastet
  kan öppnas efter återgången till kartan.

### INST-02: typdefinitioner följer kartans samlade sparande

**Syfte:** Bevara oskickade typer och spara dem tillsammans med objekt.

**Användare:** Alex, administratör. Robin utför det separata INST-08.

**Förutsättningar:** Kartan är tom.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts),
INST-02.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/settings-profile.spec.ts",
    "caseId": "INST-02"
  },
  "reference": "1280 pixlar, administratör.",
  "outcomes": [
    "Oskickad definition bevaras vid sidbyte och sparas tillsammans med objektet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Nytt objekt, ange Cykel i samma utkast i Namn och välj
   Lägg i utkastet och stäng. Spara inte.
2. Öppna **Inställningar** → **Typer** → **Ny objekttyp**.
3. Skriv Oskickad typ och beskrivningen Behåll även definitionens text. Besök
   **Översikt** och gå tillbaka.
4. Kontrollera båda texterna. Välj **Lägg typförslaget i mitt utkast**.
5. Välj **Tillbaka till kartan** och **Visa utkastet**. Granska båda
   förslagen och välj **Spara hela utkastet**.
6. Läs sparbeskedet och ladda om. Öppna definitionerna igen och fäll ut
   **Objekttyper**. Kontrollera den nya typen och objektet.

**Förväntat resultat:**

- Oskickad definitionstext bevaras mellan inställningssidorna.
- Typen och objektet ingår i samma privata utkast innan sparandet.
- Ett uttryckligt samlat sparande sparar båda. De finns efter omladdning.
- Administratörens hela definitions- och objektutkast sparas tillsammans.

### INST-08: vanlig medlem bevarar och sparar typdefinitioner

**Syfte:** Bevara oskickade typer och spara dem tillsammans med objekt.

**Användare:** Robin, vanlig medlem i Alex provhushåll.

**Förutsättningar:** Kartan är tom.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts),
INST-08.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/settings-profile.spec.ts",
    "caseId": "INST-08"
  },
  "reference": "1280 pixlar, vanlig medlem.",
  "outcomes": [
    "Oskickad definition bevaras vid sidbyte och sparas tillsammans med objektet."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Nytt objekt, ange Cykel i samma utkast i Namn och välj
   Lägg i utkastet och stäng. Spara inte.
2. Öppna **Inställningar** → **Typer** → **Ny objekttyp**.
3. Skriv Oskickad typ och beskrivningen Behåll även definitionens text. Besök
   **Översikt** och gå tillbaka.
4. Kontrollera båda texterna. Välj **Lägg typförslaget i mitt utkast**.
5. Välj **Tillbaka till kartan** och **Visa utkastet**. Granska båda
   förslagen och välj **Spara hela utkastet**.
6. Läs sparbeskedet och ladda om. Öppna definitionerna igen och fäll ut
   **Objekttyper**. Kontrollera den nya typen och objektet.

**Förväntat resultat:**

- Oskickad definitionstext bevaras mellan inställningssidorna.
- Typen och objektet ingår i samma privata utkast innan sparandet.
- Ett uttryckligt samlat sparande sparar båda. De finns efter omladdning.
- Vanliga medlemmar har samma möjlighet att föreslå typändringar.

## Din profil

### INST-03: separata kontouppgifter och skyddad formulärtext

**Syfte:** Hantera det egna kontot från profilens verktygsikon.

**Användare:** Alex.

**Förutsättningar:** Kartan är öppen.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts),
INST-03.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/settings-profile.spec.ts",
    "caseId": "INST-03"
  },
  "reference": "Chromium, angiven bredd och destination; ingen faktisk enhetsemulering utlovas.",
  "outcomes": [
    "Oskickat arbete skyddas och inställningar och profil har nåbart innehåll och synligt återställt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna ett nytt objekt. Skriv ett namn. Lägg till egenskapen Beskrivning
   under **Fria egenskaper**, välj datatypen Text och skriv en oskickad text.
2. Tryck Escape och välj **Fortsätt redigera**. Kontrollera båda texterna
   och fokus. Tryck Escape igen och välj **Kasta ändringarna och fortsätt**.
   Öppna **Din profil** i kartans verktyg. Kontrollera rubrikfokus,
   användar-ID, **Inloggningssätt**, **Assistentanslutningar** och **Logga ut**.
3. Välj **Tillbaka till arbetet** och **Nytt objekt**. Kontrollera att
   namnet är tomt. Öppna **Fria egenskaper** och kontrollera att inga egenskaper
   är tillagda. Stäng det
   oförändrade formuläret med Escape.
4. Öppna profilen igen och välj **Inloggningssätt**. Gå tillbaka via
   **Din profil** i kontosidornas navigation, på mobil via **Välj inställning**.
5. Välj **Tillbaka till arbetet** och kontrollera att tabellens rubrik
   får synligt fokus.
6. Öppna profilen igen och välj **Tillbaka till arbetet**. Kontrollera
   samma rubrikfokus och att inget objektformulär öppnas.

**Förväntat resultat:**

- Profilen har en egen ikon och kompakt panel; kontots undersidor har
  egen sida. Kostnader och hushållets administration finns i Inställningar.
- Formulärtexten skyddas före profilbesöket och kastas bara efter ett
  uttryckligt val. Återgången öppnar inte ett dolt formulär.
- Om arbetsytan har stängts återgår fokus till ett synligt verktyg.
- Befintliga prov för [bevarat hushållsarbete](household-work.md) täcker
  mikrofon, samtal, urval, väntande sparande och avslut vid förlorad tillgång.

## Fokus och läsbarhet

### INST-04: återgå till kartans objekt och verktyg

**Syfte:** Bevara fokus även utanför arbetsytans paneler.

**Användare:** Alex.

**Förutsättningar:** Kartan är tom.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts),
INST-04.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/settings-profile.spec.ts",
    "caseId": "INST-04"
  },
  "reference": "Chromium, angiven bredd och destination; ingen faktisk enhetsemulering utlovas.",
  "outcomes": [
    "Oskickat arbete skyddas och inställningar och profil har nåbart innehåll och synligt återställt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Nytt objekt**, skriv **Cykeln** och välj
   **Lägg i utkastet och stäng**. Öppna **Karta**.
2. Fokusera Cykeln med tangentbord. Besök Inställningar och återgå till kartan.
3. Öppna profilen och välj **Tillbaka till arbetet**.
4. Upprepa båda besöken med fokus på verktyget **Prata med Skyttel**.

**Förväntat resultat:**

- Samma kartobjekt eller verktyg återfår fokus efter båda besöken.
- Stängda formulär öppnas inte och tabellen förblir dold.

### INST-05: tangentbordsfokus skyms inte av profilen

**Syfte:** Fortsätta arbetet med tangentbord från den kompakta profilen.

**Användare:** Alex.

**Förutsättningar:** Kartan är öppen på dator.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts),
INST-05.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/settings-profile.spec.ts",
    "caseId": "INST-05"
  },
  "reference": "Chromium, angiven bredd och destination; ingen faktisk enhetsemulering utlovas.",
  "outcomes": [
    "Oskickat arbete skyddas och inställningar och profil har nåbart innehåll och synligt återställt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Nytt objekt** och skriv **Kvar bakom profilen** i namnfältet.
   Välj **Lägg i utkastet och stäng** och öppna **Tabell**.
2. Öppna profilen och gå med Tab till **Tillbaka till arbetet**.
3. Tryck Tab igen och fortsätt till arbetsytans kontroller.

**Förväntat resultat:**

- Profilen stängs när fokus lämnar profilen och kartans verktyg.
- Nästa kontroll har synligt fokus. Ingen kontroll döljs bakom profilen.
- Objektets förslag finns kvar i tabellen och utkastet.
  Mikrofonreglage förblir tillgängliga.

### INST-06: läsbara knappar i båda teman

**Syfte:** Läsa inställningarnas knappar även när pekaren ligger över dem.

**Användare:** Alex som aktuell administratör.

**Förutsättningar:** Kartan är öppen.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts),
INST-06.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/settings-profile.spec.ts",
    "caseId": "INST-06"
  },
  "reference": "Chromium, angiven bredd och destination; ingen faktisk enhetsemulering utlovas.",
  "outcomes": [
    "Oskickat arbete skyddas och inställningar och profil har nåbart innehåll och synligt återställt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna Inställningar och **Administrera tillgång**.
2. Välj mörkt tema. Öppna **Koppla historiskt innehåll** genom
   inställningsmenyn. För pekaren över **Hämta aktuella innehållskopplingar**
   utan att trycka.
3. Återgå till **Administrera tillgång** genom inställningsmenyn.
   Välj **Jag har personens användar-ID** för att öppna skapandesteget.
   För pekaren över **Skapa inbjudan** utan att trycka.
4. Upprepa båda sidornas knappkontroller med ljust tema.

**Förväntat resultat:**

- Vanliga knappar och primära knappar har tydligt läsbar text i båda teman,
  även när pekaren ligger över dem.
- Sidans rubrik får fokus efter varje byte genom inställningsmenyn.
- Pekarrörelsen utför ingen åtgärd och ändrar inga hushållsuppgifter.

### INST-07: bakåt med tangentbord från mobilprofilen

**Syfte:** Nå verktygen utan att fokus döljs bakom profilen.

**Användare:** Alex.

**Förutsättningar:** Kartan är öppen vid 390 CSS-pixlars bredd.
INST-11 anger 320 pixlar.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts),
INST-07.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/settings-profile.spec.ts",
    "caseId": "INST-07"
  },
  "reference": "390 CSS-pixlars bredd: Shift+Tab från profil, följt av Tab till objektets namn.",
  "outcomes": [
    "Oskickat arbete skyddas och inställningar och profil har nåbart innehåll och synligt återställt fokus."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Öppna **Nytt objekt** och skriv **Behåll mobiltexten** i namnfältet.
   Välj **Lägg i utkastet och stäng** och öppna **Tabell**.
2. Välj **Visa verktygens namn** och **Din profil**.
3. Från profilrubriken: tryck Shift+Tab till **Dölj verktygens namn**.
4. Kontrollera att profilen stängs och att verktygets fokus syns.
   Om knappen redan är fri från profilen kan profilen ligga kvar.
   Tryck Enter på **Dölj verktygens namn**. Fortsätt med Tab
   till **Behåll mobiltexten** i tabellen; profilen ska då stängas.

**Förväntat resultat:**

- Profilen stängs när den annars skulle täcka det fokuserade verktyget.
- Verktygets fokus syns och knappen går att använda med tangentbord.
- Objektets förslag finns kvar i tabellen när verktygen fällts ihop.

### INST-09: inställningarnas helsida vid 390 pixlar

**Syfte:** Inställningarnas mobilnavigation och hela återkopplingen är nåbara.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som INST-01.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts), INST-09.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/settings-profile.spec.ts",
    "caseId": "INST-09"
  },
  "reference": "390 CSS-pixlars bredd: mobilnavigation, skyddad formulärtext och läsbar utkaståterkoppling.",
  "outcomes": [
    "Inställningarnas mobilnavigation och hela återkopplingen är nåbara.",
    "Kastad formulärtext återkommer inte, medan det skickade privata förslaget finns kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ INST-01 steg 1–7 en gång vid 390 CSS-pixlars bredd.
   Under steg 4: öppna **Välj inställning**. Under steg 7: kontrollera
   att återkopplingens stängknapp inte täcker texten före återgången
   och läs därefter det kompletta cykelförslaget.

**Förväntat resultat:**

- Inställningarnas mobilnavigation och hela återkopplingen är nåbara.
- Kastad formulärtext återkommer inte, medan det skickade privata förslaget
  finns kvar.

### INST-10: inställningarnas helsida vid 320 pixlar

**Syfte:** Inställningarnas mobilnavigation och hela återkopplingen är nåbara.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som INST-01.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts), INST-10.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/settings-profile.spec.ts",
    "caseId": "INST-10"
  },
  "reference": "320 CSS-pixlars bredd: mobilnavigation, skyddad formulärtext och läsbar utkaståterkoppling.",
  "outcomes": [
    "Inställningarnas mobilnavigation och hela återkopplingen är nåbara.",
    "Kastad formulärtext återkommer inte, medan det skickade privata förslaget finns kvar."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ INST-01 steg 1–7 en gång vid 320 CSS-pixlars bredd.
   Under steg 4: öppna **Välj inställning**. Under steg 7: kontrollera
   att återkopplingens stängknapp inte täcker texten före återgången
   och läs därefter det kompletta cykelförslaget.

**Förväntat resultat:**

- Inställningarnas mobilnavigation och hela återkopplingen är nåbara.
- Kastad formulärtext återkommer inte, medan det skickade privata förslaget
  finns kvar.

### INST-11: bakåt från den smalaste profilen

**Syfte:** Fokus på verktyget är synligt och profilen täcker inte den aktiva
kontrollen.

**Användare:** Alex enligt grundfallet.

**Förutsättningar:** Samma provdata och återställning som INST-07.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts), INST-11.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "counterpart": {
    "spec": "tests/integration/settings-profile.spec.ts",
    "caseId": "INST-11"
  },
  "reference": "320 CSS-pixlars bredd: bakåtfokus och skydd mot täckande profil.",
  "outcomes": [
    "Fokus på verktyget är synligt och profilen täcker inte den aktiva kontrollen.",
    "Objektets förslag ligger kvar i tabellen."
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ INST-07 steg 1–3 en gång vid 320 CSS-pixlars bredd.
2. Gör början av steg 4 fram till och med Enter på **Dölj verktygens namn**.
   Stanna där; fortsätt inte med grundfallets Tab-väg till objektet,
   som ingår endast vid 390 pixlar. Läs objektets namn.

**Förväntat resultat:**

- Fokus på verktyget är synligt och profilen täcker inte den aktiva kontrollen.
- Objektets förslag ligger kvar i tabellen.

### INST-12: fysisk zoom och profilens läsordning

**Syfte:** Faktisk 200 procents webbläsarzoom och fysiskt tangentbord lämnar
inställningarnas mobilnavigation, hela utkastet och profilens båda
Tab-riktningar nåbara.

**Användare:** Alex enligt områdets förberedelse.

**Förutsättningar:** Faktisk webbläsarzoom på dator och fysiskt tangentbord;
tomt provhushåll.

**Kräver mänsklig observation:** Faktisk 200 procents webbläsarzoom och fysiskt
tangentbord lämnar inställningarnas mobilnavigation, hela utkastet och profilens
båda Tab-riktningar nåbara.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "physical-input",
    "observation": "Faktisk 200 procents webbläsarzoom och fysiskt tangentbord lämnar inställningarnas mobilnavigation, hela utkastet och profilens båda Tab-riktningar nåbara."
  },
  "reference": "Faktisk webbläsarzoom på dator och fysiskt tangentbord; tomt provhushåll.",
  "outcomes": [
    "Faktisk 200 procents webbläsarzoom och fysiskt tangentbord lämnar inställningarnas mobilnavigation, hela utkastet och profilens båda Tab-riktningar nåbara."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/settings-profile.spec.ts",
      "caseId": "INST-01",
      "purpose": "Kontrollerat webbläsarunderlag för vanliga kontroller; utför inte den faktiska mänskliga observationen."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/settings-profile.spec.ts",
      "caseId": "INST-05",
      "purpose": "Kontrollerat webbläsarunderlag för vanliga kontroller; utför inte den faktiska mänskliga observationen."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/settings-profile.spec.ts",
      "caseId": "INST-07",
      "purpose": "Kontrollerat webbläsarunderlag för vanliga kontroller; utför inte den faktiska mänskliga observationen."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Aktivera 200 procents webbläsarzoom och följ INST-01 steg 1–7 en gång.
2. Återställ provet och följ INST-05, sedan INST-07, med fysiskt tangentbord.
   Anteckna faktisk zoom, CSS-mått, fokus och nåbarhet.

**Förväntat resultat:**

- Faktisk 200 procents webbläsarzoom och fysiskt tangentbord lämnar
  inställningarnas mobilnavigation, hela utkastet och profilens båda
  Tab-riktningar nåbara.

### INST-13: skärmläsare i inställningar och profil

**Syfte:** NVDA eller VoiceOver läser inställningarnas och profilens rubriker,
länkar och utkastvärden i meningsfull ordning med återställt fokus.

**Användare:** Alex enligt områdets förberedelse.

**Förutsättningar:** Faktisk NVDA eller VoiceOver; kartan är tom och profilen
tillgänglig.

**Kräver mänsklig observation:** NVDA eller VoiceOver läser inställningarnas och
profilens rubriker, länkar och utkastvärden i meningsfull ordning med återställt
fokus.

<!-- markdownlint-disable MD013 -->
<!--
```manual-mapping
{
  "humanObservation": {
    "kind": "screen-reader",
    "observation": "NVDA eller VoiceOver läser inställningarnas och profilens rubriker, länkar och utkastvärden i meningsfull ordning med återställt fokus."
  },
  "reference": "Faktisk NVDA eller VoiceOver; kartan är tom och profilen tillgänglig.",
  "outcomes": [
    "NVDA eller VoiceOver läser inställningarnas och profilens rubriker, länkar och utkastvärden i meningsfull ordning med återställt fokus."
  ],
  "evidence": [
    {
      "kind": "overlap",
      "spec": "tests/integration/settings-profile.spec.ts",
      "caseId": "INST-01",
      "purpose": "Kontrollerad webbläsarobservation; utför inte den faktiska mänskliga observationen."
    },
    {
      "kind": "overlap",
      "spec": "tests/integration/settings-profile.spec.ts",
      "caseId": "INST-03",
      "purpose": "Kontrollerad webbläsarobservation; utför inte den faktiska mänskliga observationen."
    }
  ]
}
```
-->
<!-- markdownlint-enable MD013 -->

**Steg:**

1. Följ INST-01 steg 1–7 en gång och lyssna på hela cykelförslaget.
2. Återställ. Följ INST-03 steg 1–6 och lyssna på rubrik, kontolänkar
   och återställt tabellfokus. Anteckna hjälpmedlets version.

**Förväntat resultat:**

- NVDA eller VoiceOver läser inställningarnas och profilens rubriker, länkar och
  utkastvärden i meningsfull ordning med återställt fokus.
