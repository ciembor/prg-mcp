# Wybór narzędzia dla intencji

Ten dokument pomaga modelowi wybrać narzędzie PRG MCP bez zgadywania nazw warstw i bez mieszania PRG z innymi rejestrami.

| Pytanie użytkownika | Narzędzie | Uwagi |
| --- | --- | --- |
| "W jakiej gminie jest ten punkt?" | `locate_point` | grupa `administrative` |
| "Jaki powiat obejmuje miejscowość X?" | `search_areas`, potem `locate_point` lub `get_area` | PRG zwraca granice i identyfikatory |
| "Który sąd rejonowy jest właściwy dla punktu?" | `locate_point` | grupa albo warstwa `S03` |
| "Jaka prokuratura obsługuje ten adres?" | `search_addresses`, potem `locate_point` | warstwy `P01-P03` |
| "Znajdź adres Kraków, Rynek Główny 1" | `search_addresses` | wymaga zainstalowanego zakresu adresowego |
| "Co jest najbliższym adresem dla współrzędnych?" | `reverse_address` | nie zwraca trafienia poza limitem promienia |
| "Pokaż geometrię gminy" | `get_area_geometry` dla małej geometrii, `prg-mcp export` dla pełnej | pełny GeoJSON przez CLI |
| "Jakie warstwy mam lokalnie?" | `list_layers` albo `prg-mcp coverage` | bez sieci |
| "Czy dane źródłowe się zmieniły?" | `source_status` z remote check, jeśli proces ma skonfigurowany probe | nie pobiera dużych danych |

## Granice PRG

Używaj PRG MCP dla granic, punktów adresowych, ulic, właściwości terytorialnej i relacji przestrzennych z oficjalnego PRG.

Nie używaj PRG MCP jako źródła:

- TERYT: pełne słowniki jednostek, historia zmian i klasyfikacje statystyczne poza atrybutami obecnymi w PRG;
- PRNG: nazwy geograficzne, obiekty fizjograficzne i warianty nazw;
- EGiB: działki, budynki, lokale i księgi wieczyste;
- Poczta Polska: walidacja kodów pocztowych. Kod pocztowy w PRG jest tylko atrybutem punktu adresowego.
