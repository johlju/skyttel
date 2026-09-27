# Manuella testfall för markering och detaljer

Testfallen omfattar flerval, tomrumsgester, tillgängliga textkontroller och
objektpanelernas placering. Anteckna commit, webbläsare, enhet, fysisk eller
emulerad inmatning samt godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

Alex Exempel är inloggad medlem i ett separat provhushåll. Använd bara
påhittade uppgifter. Administratörsrollen behövs inte för kartarbetet.

## Allmän förberedelse

1. Starta en isolerad installation enligt
   [provförberedelsen](../development/devcontainer.md#disposable-local-database).
   Använd ett nytt provhushåll mellan fallen.
2. Skapa personerna Lo Exempel, Kim Exempel och Alex Exempel i Lista.
   Lägg till Lo Exempel → Använder → Kim Exempel och Kim Exempel →
   Använder → Alex Exempel. Uppgifterna är syntetiska provdata.
3. Välj Stäng arbetsytan och stäng vägledningen om den täcker kartan.
   Följ [arbetsytornas ingångar](README.md#öppna-arbetsytor) för Lista.

## Markering och kartgester

### MARKERING-01: flerval och uttrycklig detaljöppning

**Syfte:** Skilja markering från detaljöppning utan kamerahopp.

**Användare:** Alex Exempel.

**Förutsättningar:** Alla tre objekt visas på en dator.

**Integrationstest:**
[map-selection.spec.ts](../../tests/integration/map-selection.spec.ts),
testfallet “MARKERING-01: ordinary and modified clicks select objects and
open details separately”.

**Steg:**

1. Klicka Lo. Kontrollera att Lo markeras utan ny panel eller kamerarörelse.
2. Ctrl-klicka Alex. Kontrollera båda markeringarna, antalet och båda
   direkta sambanden. Klicka Lo igen och kontrollera att Alex finns kvar.
3. Cmd-klicka Alex för att ta bort Alex. Klicka det omarkerade Kim och
   kontrollera att Kim ersätter Lo.
4. Dubbelklicka Kim. Kontrollera panelen och oförändrad kamera.
5. Återgå till kartan. Ctrl+Alt-klicka Lo och kontrollera att Kim finns
   kvar. På Mac prövar du också Control+Option och Cmd+Option på Alex.

**Förväntat resultat:**

- Vanligt klick, Ctrl/Cmd-flerval och detaljöppning följer stegen.
- Alla markerade objekts direkta samband framhävs. Grannar blir inte markerade.
- Detaljer återanvänder objektets panel; inget klick flyttar kameran.

### MARKERING-02: tomrumsklick och avbrutna gester

**Syfte:** Avmarkera utan att ändra sökning, kamera eller pågående arbete.

**Användare:** Alex Exempel.

**Förutsättningar:** Kartan och Lista ryms samtidigt på datorn.

**Integrationstest:**
[map-selection.spec.ts](../../tests/integration/map-selection.spec.ts),
testfallet “MARKERING-02: empty clicks clear highlighting while navigation
and cancellation retain selection”.

**Steg:**

1. Markera Lo. Öppna Lista och skriv Exempel i Sök objekt.
   Avmarkera och markera Lo med Control-klick. Kontrollera att söktext
   och kamera finns kvar och att inga detaljer öppnas.
2. Klicka fri bakgrund med en mycket liten rörelse. Kontrollera att
   markeringen släcks medan söktext, panel och kamera finns kvar.
3. Återgå till kartan och markera Lo. Dra bakgrunden för att rotera.
   Kontrollera att Lo förblir markerad. Klicka sedan direkt i tomrummet.
4. Markera Lo igen. Börja en pekgest på bakgrunden och avbryt den genom
   webbläsarens eller enhetens avbrottshandling. Kontrollera urvalet.
5. Välj ett samband och klicka tom bakgrund.

**Förväntat resultat:**

- Ett enda tomrumsklick släcker all framhävning, även efter en dragning.
- Små rörelser flyttar inte kameran. Verklig eller avbruten navigering
  behåller markeringarna. Sökning och öppna paneler består.

## Textalternativ och paneler

### MARKERING-03: tangentbord och synlig detaljpanel

**Syfte:** Arbeta utan kartgester och bevara oskickad text på små skärmar.

**Användare:** Alex Exempel.

**Förutsättningar:** Pröva dator samt 390 och 320 pixlars bredd.

**Integrationstest:**
[map-selection.spec.ts](../../tests/integration/map-selection.spec.ts),
testfallet “MARKERING-03: text selection and detail controls retain work
across desktop and compact panels”.

**Steg:**

1. Öppna Lista och välj Avmarkera alla. Kontrollera att detaljverktyget
   är inaktivt. Fokusera Markera Lo Exempel och tryck mellanslag.
2. Markera också Kim och kontrollera antalet. Välj Visa detaljer i
   verktygen. Kontrollera rubrikfokus och aktiv detaljikon för Kim.
3. Välj Redigera valt objekt och skriv en oskickad beskrivning.
   Återgå till Lista och välj Visa detaljer för Kim Exempel.
4. Växla mellan Lista och Kim i Öppna paneler. Stäng Kims panel och
   öppna den igen. Kontrollera text och detaljikon vid varje steg.
5. Avmarkera alla. Upprepa med tangentbord på varje skärmbredd.
6. På den smala skärmen väljer du Visa verktygens namn och Tema. Välj
   Mörkt och kontrollera tema och fokus tillbaka till temaknappen.
   Välj Dölj verktygens namn.
   För pekaren över Markera och kontrollera att knapptexten är läsbar.

**Förväntat resultat:**

- Markera och Visa detaljer är skilda handlingar. Flerval finns kvar
  när detaljer öppnas, och Avmarkera alla släcker framhävningen.
- Oskickad beskrivning finns kvar. På mobil är detaljikonen aktiv bara
  när Kims panel visas; på dator kan flera paneler visas samtidigt.
- Fokus följer öppnad panel. Kontrollerna går att nå på varje bredd.

### MARKERING-04: placering nära objektet och bevarad manuell flytt

**Syfte:** Hitta nya detaljer nära kartobjektet och behålla egna placeringar.

**Användare:** Alex Exempel.

**Förutsättningar:** Kartan visas på datorn, utan öppna objektpaneler.

**Integrationstest:**
[map-selection.spec.ts](../../tests/integration/map-selection.spec.ts),
testfallet “MARKERING-04: new detail panels open beside their object and
retain manual positions”.

**Steg:**

1. Dubbelklicka Lo och kontrollera att den nya panelen ligger nära Lo
   inom arbetsytan med åtkomliga kontroller.
2. Fokusera panelens flytthandtag och flytta med piltangenterna.
3. Stäng panelen och öppna den med Visa detaljer i verktygen.
4. Gör fönstret mindre och större igen.

**Förväntat resultat:**

- Panelen öppnas nära objektet och ryms inom arbetsytan.
- Den manuella placeringen består efter återöppning och storleksbyte.
- Mindre fönster begränsar panelen utan att radera dess önskade placering.
