# Ikonkatalogens ursprung

Skyttel använder hela Lucides officiella katalog från version
1.48.0: 1 854 ikoner. Katalogen innehåller varje SVG:s element och attribut
samt dess engelska taggar, kategorier och alternativa namn. Sökningen
kompletterar dessa med svenska benämningar, sökord och översättningar av
samtliga kategorier i
`../object-icons.ts`.

Underlaget är låst till commit
`f53e5bfff0f909f3f451933538744330650d3ce0`.

- [Officiell utgåva 1.48.0](https://github.com/lucide-icons/lucide/releases/tag/1.48.0)
- [Ikoner och metadata i samma commit](https://github.com/lucide-icons/lucide/tree/f53e5bfff0f909f3f451933538744330650d3ce0/icons)
- [Oförändrad licens i samma commit](https://github.com/lucide-icons/lucide/blob/f53e5bfff0f909f3f451933538744330650d3ce0/LICENSE)
- [Lucides licensbeskrivning](https://lucide.dev/license)

`LICENSE-lucide.txt` innehåller hela originallicensen, inklusive villkoren
för ikoner som kommer från Feather. SVG-noder och metadata i
`lucide-icons.json` är genererade från originalfilerna. Själva bildformerna
ändras inte. Ingen kod från arkivet körs.

Katalogen och bildformerna följer med Skyttel lokalt. Sökning och visning
gör inga anrop till Lucide eller andra externa tjänster. Inga paketberoenden
läggs till. Typers standardikoner använder Skyttels egna SVG-former.

## Återskapa underlaget

Kör från projektroten med Python 3 och curl. Importen kontrollerar arkivets
SHA-256, antalet ikoner och vilka SVG-element och attribut som förekommer.
Den läser endast ikonfiler, deras metadata och licensen ur arkivet.

<!-- markdownlint-disable MD013 -->
```sh
curl -fsSL \
  https://codeload.github.com/lucide-icons/lucide/tar.gz/f53e5bfff0f909f3f451933538744330650d3ce0 \
  -o /tmp/lucide-f53e5bf.tar.gz
python3 src/shared/icon-assets/import-lucide.py \
  /tmp/lucide-f53e5bf.tar.gz
npx --no-install biome format --write \
  src/shared/icon-assets/lucide-icons.json
```
<!-- markdownlint-enable MD013 -->

Arkivets SHA-256:
`4c73bf2709fe2140e527fb4fd9abd1f7c62b6d847081e02077cfc6ac32415679`.

## Beständiga identifierare

Varje kanoniskt ikonnamn är ett stabilt ID. Alias är sökord och får inte
ersätta sparade ID:n. Denna katalog har inga utgångna identifierare.
Vid ett framtida versionsbyte ska befintliga identifierare och deras
bildformer finnas kvar i katalogen, också om uppströms tar bort eller byter
namn på en ikon. Historik, utkast och arkiv måste kunna validera och visa dem.
En ny version får inte tyst ta bort eller ändra ett beständigt val.

Ett objekt utan eget ikon-ID använder typens standardikon. I förslagsanrop
bevarar ett utelämnat `iconId` det aktuella valet. Ett känt ID sätter valet
och `null` återgår till standard. Beständiga standardvärden saknar fältet;
databasens NULL normaliseras vid läsning. Bildbyte och typbyte behåller valet.
