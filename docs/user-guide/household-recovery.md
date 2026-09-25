# Fortsätt med privata uppgifter efter en flytt

[Till användarguidens innehåll](README.md)

En [återimport](household-import.md) återställer hushållets innehåll. Den
skapar inga gamla inloggningar eller medlemskap. En administratör behöver
koppla varje persons historiska innehåll till rätt nuvarande medlem.

1. Låt personen logga in på den nya installationen och acceptera en vanlig
   inbjudan. Kontrollera personens aktuella användar-ID tillsammans med
   personen; samma namn eller e-postadress bevisar ingen koppling.
2. Öppna **Administrera tillgång**, **Koppla historiskt innehåll** och
   **Hämta aktuella innehållskopplingar**.
3. Välj rätt **Historisk innehållsidentitet** med dess stabila ID och rätt
   **Aktuell verifierad medlem**. Läs vem som redan är kopplad och vilka
   privata uppgifter den valda medlemmen lämnar.
4. Bekräfta att du har identifierat rätt person och välj
   **Bekräfta innehållskopplingen**. Läs in hushållet igen. Personen kan nu
   fortsätta med sina återställda utkast, placeringar och visningsinställningar.

Den valda medlemmens tidigare privata arbete bevaras utan aktuell ägare.
Inget slås ihop eller skrivs över. Du kan koppla tillbaka den tidigare
identiteten genom samma uttryckliga granskning. **Ingen aktuell ägare**
tar bort en innehållskoppling utan att ta bort personens medlemskap eller
det historiska innehållet. Historiska författare och kvitton ändras inte.

Alla öppna klienter behöver läsa in nytt underlag. Väntande gamla sparförsök
blir ogiltiga, men deras utkast bevaras. Om svaret saknas, välj **Hämta
aktuella innehållskopplingar** och kontrollera vem som nu är kopplad innan
du fortsätter. En visad aktuell koppling är inte ett kvitto på en tidigare
begäran. Vid misslyckad hämtning förblir formuläret låst tills aktuell
information går att läsa.

Detta ändrar inte inloggningssätt. Att länka Google och Microsoft till samma
nuvarande konto kräver fortfarande att båda inloggningarna bevisas. För en
innehållskoppling behöver ingen kunna logga in med den gamla inloggningen.
Driftansvarig följer [flyttguiden](../operations/recovery.md) för själva
installationen, exporten och bytet av aktiv server.
