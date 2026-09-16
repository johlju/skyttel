# En portabel applikationscontainer med SQLite och små bilder i databasen

Första Skyttel använder en applikationscontainer med Node.js på Render,
SQLite på beständig disk och små omkodade bildversioner i databasen,
vilket ger en sammanhängande server- och lagringsmodell och förenklar
framtida flytt.
Detta väljs framför det billigare Cloudflare-alternativets större
beroende av leverantörens körmodell och lagringsgränssnitt; SQLite körs
som bibliotek i appen och behöver ingen separat databasserver.
En enda applikationsinstans och korta uppdateringsavbrott accepteras, och
hushållets planerade flyttväg är fullständig export och återimport.
