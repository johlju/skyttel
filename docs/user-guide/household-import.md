# Återimportera ett befintligt hushåll

[Till användarguidens innehåll](README.md)

En aktuell administratör kan ersätta hushållets information med en
fullständig Skyttel-export. Importen ersätter karta, bilder, historik,
alla privata utkast och personliga vyer. Den slår inte ihop två kartor.
Nuvarande medlemmar, administratörer, inbjudningar och inloggningar behålls.

1. Hämta först en [egen export](household-export.md) om du behöver behålla
   det nuvarande innehållet. Be användarna avsluta pågående ändringar.
2. Öppna **Administrera tillgång** och **Återimportera hushållet**.
   Välj den privata ZIP-filen och **Kontrollera importfil**.
3. Läs sammanställningen. Ännu har inget ersatts. Markera bekräftelsen
   först när du vill ersätta allt innehåll i det valda hushållet.
4. Välj **Ersätt hushållets innehåll** och invänta ett tydligt resultat.
   Om svaret saknas: välj **Hämta importens status**. Försök inte spara
   gamla förslag medan resultatet är okänt.
5. Vid slutförd import väljer du **Läs in det återställda hushållet**.
   Alla användare behöver läsa in aktuellt innehåll. Gamla formulär och
   sparförsök avvisas. Nytt underlag kan fortfarande ångra importerad
   historik genom ett nytt granskat utkast.

Om någon ändrar innehållet under förberedelsen måste filen förberedas igen.
En trasig, ofullständig eller okänd export avvisas före ersättning. Stöd
finns för formatversion 1 från databasversion 14, 15 och 16. Gränserna är cirka
1,1 GB för ZIP-filen, 32 MiB för innehållsfilen och 1 GiB för bilddelen.
Förberedda kopior rensas efter tio minuter eller vid serverns nästa start.

Identiteter i exporten ger ingen ny åtkomst. Privata uppgifter från samma
hushåll återkopplas endast när en verifierad koppling redan finns. Privata
uppgifter från en annan installation förblir utan inloggad ägare tills en
administratör uttryckligen kopplar den historiska identiteten till ett
verifierat konto. Att namn eller andra uppgifter råkar stämma räcker inte.
Följ [guiden för innehållskopplingar](household-recovery.md) för att granska
och bekräfta kopplingen utan att skriva över något privat arbete.

Om rensningen inte är klar är innehållet redan ersatt, men kartan hålls
stängd tills rensningen lyckas. Välj **Slutför importens rensning** eller
kontakta driftansvarig. Vid ett uttryckligt misslyckat resultat är det
föregående innehållet kvar.
