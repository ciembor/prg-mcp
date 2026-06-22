# Migracja EMUiA 2012 → 2021 dla PRG MCP

Status decyzji: 2026-06-22.

Źródłem tej tabeli jest oficjalna tabela konwersji EMUiA z modelu 2012 do modelu 2021 udostępniona przy komunikacie Geoportalu o nowej strukturze danych adresowych. Dokument poniżej zawęża ją do pól potrzebnych dla A07 Punkty adresowe i A08 Ulice.

## Mapowanie klas i pól

| Model 2012 | Model 2021 | Kanoniczne pole PRG MCP | Uwagi |
| --- | --- | --- | --- |
| BT_Identyfikator.lokalnyId | AD_IdentyfikatorIIP.lokalnyId | iip_id / object_id kandydat | Identyfikator pozostaje tekstem. |
| BT_Identyfikator.przestrzenNazw | AD_IdentyfikatorIIP.przestrzenNazw | sourceProperties.iipNamespace | Łączone z lokalnyId przy pełnym IIP. |
| BT_Identyfikator.wersjaId | AD_IdentyfikatorIIP.wersjaId | sourceProperties.iipVersion | Nie zastępuje daty wersji obiektu. |
| BT_CyklZyciaInfo.poczatekWersjiObiektu | AD_OgolnyObiekt.poczatekWersjiObiektu | version_from | W 2021 jest dziedziczone bez opakowania cyklZycia. |
| BT_CyklZyciaInfo.koniecWersjiObiektu | AD_OgolnyObiekt.koniecWersjiObiektu | version_to | Opcjonalne. |
| AD_PunktAdresowy.pozycja | AD_PunktAdresowy.georeferencja | x, y | Punkt w EPSG:2180. |
| AD_PunktAdresowy.numerPorzadkowy | AD_PunktAdresowy.numerPorzadkowy | building_number | Tekst, bez konwersji na liczbę. |
| AD_PunktAdresowy.kodPocztowy | AD_PunktAdresowy.kodPocztowy | postal_code | W modelu 2021 opcjonalny. |
| AD_PunktAdresowy.waznyOd / waznyDo | archiwum | sourceProperties.legacyValidity | Nie mapować do valid_from bez jawnej decyzji adaptera. |
| brak | AD_PunktAdresowy.dataNadania | sourceProperties.assignedAt | Nowy atrybut. |
| AD_Ulica | AD_UlicaPlac | streets | Zmiana klasy dla A08. |
| AD_Ulica.geometria | AD_UlicaPlac.geometria | geometry_wkb, bbox | Geometria ulicy pozostaje wymagana dla A08. |
| AD_Ulica.nazwa | AD_UlicaPlac.nazwaPelna | street_name / name | W 2021 nazwa pełna jest atrybutem klasy. |
| AD_NazwaUlicy.nazwaGlownaCzesc | AD_UlicaPlac.TERYTNazwa1 | sourceProperties.terytName1 | Część nazwy TERYT. |
| AD_NazwaUlicy.nazwaCzesc | AD_UlicaPlac.TERYTNazwa2 | sourceProperties.terytName2 | Opcjonalne. |
| AD_NazwaUlicy.idTERYT | AD_UlicaPlac.identyfikatorULIC | street_id | Tekst, zachowuje zera wiodące. |
| AD_Ulica.typ | AD_UlicaPlac.rodzaj | sourceProperties.streetKind | Kod rodzaju obiektu ulicy/placu. |

## Fixture

- test/unit/source-catalog/fixtures/emuia-2012-address.gml zawiera minimalny punkt adresowy i ulicę w modelu 2012.
- test/unit/source-catalog/fixtures/emuia-2021-address.gml zawiera odpowiadający punkt adresowy i AD_UlicaPlac w modelu 2021.
- Fixture nie reprezentują pełnego dumpu PRG. Służą do kontraktu namespace, klas, geometrii, identyfikatorów i pól migracyjnych.
