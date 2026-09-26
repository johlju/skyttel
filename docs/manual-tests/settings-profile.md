# Manuella testfall för inställningar och profil

Fallen omfattar helsidan, kontots separata profil och gemensamt typförslag.
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex är administratör i ett separat provhushåll. Robin är vanlig medlem.
Använd konfigurerade testidentiteter och påhittade uppgifter. För driftens
kostnader krävs installationens särskilda driftbehörighet.

## Allmän förberedelse

1. Förbered en
   [separat provdatabas](../development/devcontainer.md#disposable-local-database)
   och logga in. Börja varje fall utan utkast eller oskickad text.
2. Behåll fliken under fallet. Upprepa navigeringen med tangentbord på
   dator och telefon, med ljust, mörkt och systemstyrt tema.
3. Bedöm även skärmläsare, förstoring och fokus på fysiska enheter.
   Redovisa dessa prov separat från automatiserad Chromium-emulering.

## Inställningar

### INST-01: återgå till samma formulär och fokus

**Syfte:** Besöka inställningarnas helsida utan att förlora kartarbetet.

**Användare:** Alex.

**Förutsättningar:** Kartan är öppen och inga formulär är påbörjade.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts),
testfallen “INST-01: full-page settings preserve the active editor and
focus at 1280px”, “INST-01: full-page settings preserve the active editor
and focus at 390px” samt “INST-01: full-page settings preserve the active
editor and focus at 320px”.

**Steg:**

1. Öppna Lista och **Nytt objekt**. Skriv Oskickad cykel i namnfältet.
2. Öppna **Inställningar**, på telefon via **Visa verktygens namn**.
3. Kontrollera sidrubrikens fokus. Använd Tab för att följa navigationen.
   Kartan och dess formulär ska vara dolda och inte nås bakom sidan.
4. På mobil: välj **Välj inställning** och kontrollera att **Översikt**
   är aktuell sida. Kontrollera hushållets och administrationens ingångar.
5. Välj **Tillbaka till kartan** och fortsätt i samma namnfält.

**Förväntat resultat:**

- Inställningar fyller sidan och har egen översikt och sidnavigation.
- Mobilnavigationen börjar hopfälld och går att öppna med tangentbord.
- Samma objektpanel, oskickade namn och fältfokus återkommer.

### INST-02: typdefinitioner följer kartans samlade sparande

**Syfte:** Bevara oskickade typer och spara dem tillsammans med objekt.

**Användare:** Alex. Upprepa typredigeringen som Robin.

**Förutsättningar:** Kartan är tom.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts),
testfallet “INST-02: type settings retain unsent definitions and save with
the same map draft”.

**Steg:**

1. Lägg objektet Cykel i samma utkast i ditt utkast utan att spara.
2. Öppna **Inställningar** → **Typer och egna fält** → **Ny objekttyp**.
3. Skriv Oskickad typ och en beskrivning. Besök **Översikt** och gå tillbaka.
4. Kontrollera båda texterna. Välj **Lägg typförslaget i mitt utkast**.
5. Välj **Tillbaka till kartan** och Lista. Granska båda förslagen i
   **Hela mitt utkast** och välj **Spara hela utkastet**.
6. Läs sparbeskedet och ladda om. Öppna definitionerna igen och fäll ut
   **Objekttyper och egna fält**. Kontrollera den nya typen och objektet.

**Förväntat resultat:**

- Oskickad definitionstext bevaras mellan inställningssidorna.
- Typen och objektet ingår i samma privata utkast innan sparandet.
- Ett uttryckligt samlat sparande sparar båda. De finns efter omladdning.
- Vanliga medlemmar har samma möjlighet att föreslå typändringar.

## Din profil

### INST-03: separata kontouppgifter och återgång till redigeringsfältet

**Syfte:** Hantera det egna kontot från profilens verktygsikon.

**Användare:** Alex.

**Förutsättningar:** Kartan är öppen.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts),
testfallet “INST-03: the separate profile returns to the active field and
groups personal entries”.

**Steg:**

1. Öppna ett nytt objekt. Skriv ett namn och en oskickad beskrivning.
2. Öppna **Din profil** i kartans verktyg. Kontrollera rubrikfokus,
   användar-ID, **Inloggningssätt**, **Assistentanslutningar** och **Logga ut**.
3. Välj **Tillbaka till arbetet**. Kontrollera beskrivningen och fältfokus.
4. Öppna profilen igen och välj **Inloggningssätt**. Gå tillbaka via
   **Din profil** i kontosidornas navigation, på mobil via **Välj inställning**.
5. Välj **Tillbaka till arbetet** och fortsätt beskrivningen.
6. Stäng arbetsytan, öppna profilen och välj **Tillbaka till arbetet**.
   Kontrollera att Lista får fokus och att formuläret förblir dolt.

**Förväntat resultat:**

- Profilen har en egen ikon och kompakt panel; kontots undersidor har
  egen sida. Kostnader och hushållets administration finns i Inställningar.
- Återgången bevarar aktivt formulär, text och fokus.
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
testfallet “INST-04: settings and profile restore map and toolbar focus
without opening panels”.

**Steg:**

1. Öppna Lista och ett nytt objekt. Lägg Cykeln i utkastet och stäng arbetsytan.
2. Fokusera Cykeln med tangentbord. Besök Inställningar och återgå till kartan.
3. Öppna profilen och välj **Tillbaka till arbetet**.
4. Upprepa båda besöken med fokus på verktyget **Prata med Skyttel**.

**Förväntat resultat:**

- Samma kartobjekt eller verktyg återfår fokus efter båda besöken.
- Arbetsytans stängda paneler öppnas inte.

### INST-05: tangentbordsfokus skyms inte av profilen

**Syfte:** Fortsätta arbetet med tangentbord från den kompakta profilen.

**Användare:** Alex.

**Förutsättningar:** Kartan är öppen på dator.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts),
testfallet “INST-05: leaving the compact profile exposes keyboard focus
in the retained work”.

**Steg:**

1. Öppna ett nytt objekt och skriv Kvar bakom profilen i namnfältet.
2. Öppna profilen och gå med Tab till **Tillbaka till arbetet**.
3. Tryck Tab igen och fortsätt till arbetsytans kontroller.

**Förväntat resultat:**

- Profilen stängs när fokus lämnar profilen och kartans verktyg.
- Nästa kontroll har synligt fokus. Ingen kontroll döljs bakom profilen.
- Objektets oskickade namn finns kvar. Mikrofonreglage förblir tillgängliga.

### INST-06: läsbara knappar i båda teman

**Syfte:** Läsa inställningarnas knappar även när pekaren ligger över dem.

**Användare:** Alex.

**Förutsättningar:** Kartan är öppen.

**Integrationstest:**
[settings-profile.spec.ts](../../tests/integration/settings-profile.spec.ts),
testfallet “INST-06: settings form buttons retain readable contrast when
hovered in both themes”.

**Steg:**

1. Öppna Inställningar och **Administrera tillgång**.
2. Välj mörkt tema. För pekaren över **Hämta aktuella innehållskopplingar**
   och **Skapa inbjudan** utan att trycka.
3. Upprepa med ljust tema.

**Förväntat resultat:**

- Vanliga knappar och primära knappar har tydligt läsbar text i båda teman,
  även när pekaren ligger över dem.
- Pekarrörelsen utför ingen åtgärd och ändrar inga hushållsuppgifter.
