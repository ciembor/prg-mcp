# Wybór kanonicznego źródła adresów i ulic PRG

Status decyzji: 2026-06-22.

## Decyzja

Kanonicznym źródłem dla A07 Punkty adresowe i A08 Ulice jest nowy GML EMUiA publikowany w paczkach PRG po zmianie struktury z listopada 2025 r. Adapter importu obsługuje też dotychczasowy GML jako format przejściowy. ESRI Shapefile i adres uniwersalny nie są źródłami kanonicznymi; mogą być użyte wyłącznie jako jawny fallback z osobnym fingerprintem schematu i raportem ograniczeń.

## Porównanie źródeł

| Kryterium | Adres uniwersalny CSV/ZIP | GML EMUiA | ESRI Shapefile |
| --- | --- | --- | --- |
| Zakres | Punkty adresowe w formie zakodowanego rekordu tekstowego. | Punkty adresowe oraz struktura zgodna z EMUiA; paczki od 2025 zawierają stary i nowy GML. | Punkty adresowe i atrybuty w uproszczonym modelu tabelarycznym; paczki od 2025 zawierają stary i nowy SHP. |
| Identyfikatory | Składowe kodowe: kod pocztowy, TERYT, SIMC, ULIC, współrzędne i numer. Brak pełnej struktury obiektu PRG. | Najlepsze źródło identyfikatorów IIP, relacji miejscowość-ulica-adres i dat wersji/ważności. | Identyfikatory mogą być skrócone przez ograniczenia DBF; wymagają mapowania i walidacji. |
| Geometria | Punkt w PUWG 1992, współrzędne całkowite x/y; dobra do fallbacku lokalizacji, słaba do audytu dokładności. | Geometria punktów i potencjalnie geometrii ulic w modelu źródłowym. | Geometria punktów/ulic dostępna, ale z ograniczeniami typów i nazw pól SHP. |
| Daty i wersje | Format tekstowy nie przenosi pełnego kontraktu dat obiektu. | Preferowane źródło dat wersji, ważności i metadanych schematu. | Daty możliwe, ale zależne od skróconych pól i konwersji typów. |
| Obsługa A08 | Niewystarczająca: format adresu uniwersalnego koduje ULIC, ale nie daje pełnej geometrii ani obiektu ulicy. | Kanoniczna, jeśli paczka zawiera ulicę/relacje ulic zgodnie ze schematem EMUiA. | Fallback dla A08 tylko po potwierdzeniu kompletności geometrii i identyfikatorów. |
| Przydatność dla PRG MCP | Fallback do szybkiej lokalizacji punktów, bez deklarowania pełnego pokrycia A07/A08. | Źródło kanoniczne. | Fallback importu, gdy GML jest niedostępny lub odrzucony, ale SHP ma zgodny fingerprint. |

## Uzasadnienie

- Geoportal opisał w listopadzie 2025 r. nowe paczki GML zgodne z aktualnym rozporządzeniem EMUiA oraz paczki zawierające równolegle dotychczasowy i nowy plik GML.
- Analogiczna zmiana została opisana dla ESRI Shapefile, ale SHP pozostaje formatem mniej precyzyjnym dla kontraktu domenowego przez skrócone nazwy pól i typy DBF.
- Adres uniwersalny jest wartościowym formatem wymiany i od 2025 r. ma zbiorczy plik dla Polski, ale jest skompresowanym CSV i nie zastępuje pełnego modelu obiektów PRG.
- Geoportal wskazał zmianę kolejności współrzędnych adresu uniwersalnego na x, y w PUWG 1992; adapter CSV musi to traktować jako jawny kontrakt osi, nie heurystykę.

## Reguły fallbacku

1. Import domyślny próbuje nowy GML EMUiA.
2. Dotychczasowy GML jest obsługiwany tylko przez osobny adapter migracyjny i fingerprint schematu.
3. SHP jest fallbackiem, gdy GML jest niedostępny albo odrzucony z powodu kontrolowanego błędu, a SHP ma znany fingerprint.
4. Adres uniwersalny CSV nie może oznaczyć A08 jako kompletnego. Może zasilać A07 tylko z coverage oznaczonym jako ograniczone, jeśli brakuje pełnego GML/SHP.
5. Brak potwierdzonych dat, identyfikatorów lub geometrii ulic w fallbacku musi trafić do coverage.missingScopes i sourceProperties.importLimitations.
