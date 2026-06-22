# Fingerprint schematu źródłowego

Status decyzji: 2026-06-22.

Fingerprint schematu jest liczony jako SHA-256 z kanonicznie posortowanej listy pól: name, type, required. Kolejność pól w źródłowym XML/SHP jest zachowywana w raporcie porównania, ale nie zmienia samego fingerprintu zestawu pól.

Polityka zmian:

- dodatkowe pole: warning; import może kontynuować, a pole trafia do sourceProperties po limicie allowlisty;
- zmiana kolejności pól: warning; import może kontynuować, bo adaptery nie zależą od pozycji kolumny;
- brak pola niekrytycznego: warning; import może kontynuować tylko wtedy, gdy adapter nie używa pola do kanonicznego kontraktu;
- brak pola krytycznego: breaking; import zatrzymuje się przed podmianą bazy i zwraca SOURCE_SCHEMA_CHANGED;
- zmiana typu pola krytycznego: breaking; zmiana typu pola niekrytycznego jest warning i wymaga decyzji adaptera.

Lista pól krytycznych jest osobna dla adaptera. Dla typowego WFS JPT minimum obejmuje msGeometry, JPT_KOD_JE, JPT_NAZWA_, IIP_IDENTY, WERSJA_OD i WAZNY_OD. Dla EMUiA minimum obejmuje identyfikator IIP, georeferencję/pozycję, numer porządkowy oraz pola ulicy wymagane do A08.
