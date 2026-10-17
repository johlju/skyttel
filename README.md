# Skyttel

**Skyttel** är en applikation för att samla, strukturera och visualisera ett hushålls digitala och ekonomiska relationer.

I dag är prenumerationer, konton, avtal, betalningsmedel och användare ofta utspridda över olika tjänster och plattformar. Skyttel skapar en sammanhängande bild av dessa delar och visar inte bara vad som finns, utan också hur allt hänger ihop.

Projektet bygger på en vävmetafor:

* **Varpen** representerar de grundläggande objekten – exempelvis personer, konton, tjänster, abonnemang, avtal och betalningsmedel.
* **Väften** representerar relationerna mellan objekten – vem som äger ett konto, vilket kort som används för betalning, vilket abonnemang som hör till vilken tjänst och vilka personer som använder det.
* **Skytteln** är själva verktyget som binder samman varp och väft och gör helheten begriplig.

Ett abonnemang blir därför mer än bara en återkommande kostnad. Skyttel kan visa vem som äger kontot, vilken e-postadress det är kopplat till, vilket betalningsmedel som används, vilka personer i hushållet som använder tjänsten och vilka andra relationer som finns runt abonnemanget.

Målet med Skyttel är att ge hushållet en gemensam, tydlig och sammanhängande bild av sina digitala tjänster, konton, avtal och åtaganden – och därmed göra det enklare att förstå, administrera och förändra dem över tid.

![Konceptillustration](docs/images/shuttle-conceptillustration.png)

[Användarguiden](docs/user-guide/README.md) beskriver hur du kommer igång,
bygger hushållets karta, använder text och röst och administrerar hushållet.
Börja med [Kom igång](docs/user-guide/getting-started.md) eller välj ett
arbetsflöde i guidens innehållsförteckning.

Förbered utvecklingsmiljön med [utvecklingsguiden](docs/development/devcontainer.md).
Registrera egna utvecklingskonton och konfigurera
[lokal inloggning](docs/development/local-authentication.md).
[Testinstruktionerna](docs/development/testing.md) beskriver projektets
kontroller och hur de körs.

[Ordlistan](GLOSSARY.md) definierar produktens begrepp och
[arkitekturbesluten](docs/adr) beskriver vägval och deras skäl.
[Testfallen](docs/manual-tests/README.md) anger förberedelser, steg och
förväntade resultat per område. Verifieringsrapporterna skiljer automatiska
resultat från mänskliga observationer och redovisar kvarstående begränsningar.

[Releaseguiden](docs/operations/container-releases.md) beskriver publicering,
verifiering och bevarande av containerbilder.
