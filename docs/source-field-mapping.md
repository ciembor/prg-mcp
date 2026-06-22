# Mapowanie pól źródłowych PRG do domeny

Ten dokument opisuje kontrakt mapowania skróconych pól z WFS/SHP PRG do kanonicznego modelu areas. Źródła WFS i SHP używają nazw skróconych, w części odziedziczonych po ograniczeniach DBF, dlatego adaptery nie mogą zgadywać znaczenia pola wyłącznie po prefiksie.

## Reguły ogólne

- Wszystkie identyfikatory, kody TERYT/PRG, REGON i elementy IIP są tekstem.
- objectId wybieramy deterministycznie z najlepszego stabilnego identyfikatora warstwy. Preferencja: jawne ID obiektu, następnie IIP_IDENTY, a na końcu hash stabilnych pól i geometrii.
- sourceProperties zachowuje tylko pola potrzebne do audytu, diagnostyki schematu i przyszłych migracji.
- Pola techniczne bufora i duplikaty skrótów, np. ID_BUFORA_, ID_BUFORA1, ID_BUFOR_1, JPT_KOD__1 i JPT_KJ_I_1, pozostają w sourceProperties, chyba że dana warstwa nie ma innego stabilnego identyfikatora.
- Daty ważności WAZNY_* i daty wersji WERSJA_* są rozdzielone. Adapter nie używa daty wersji jako daty obowiązywania obiektu.
- Miary SHAPE_LENG, SHAPE_AREA, JPT_POWIER i podobne są traktowane jako wartości źródłowe. Kanoniczne area_m2 pochodzi z geometrii po walidacji CRS albo z potwierdzonego pola źródłowego z udokumentowaną jednostką.

## Granice administracyjne i większość właściwości terytorialnych

| Pole źródłowe | Kanoniczne pole | Uwagi |
| --- | --- | --- |
| msGeometry | geometry_wkb, bbox, centroid | Geometria GML jest walidowana i zapisywana jako EPSG:2180 WKB. |
| JPT_ID | object_id | Preferowany stabilny identyfikator dla warstw JPT, jeśli obecny. |
| JPT_KOD_JE | code | Kod jednostki jako tekst; zachowuje zera wiodące. |
| JPT_NAZWA_ | name | Podstawowa nazwa obiektu. |
| JPT_NAZWA1 | sourceProperties.previousOrAlternateName | Nie zastępuje name bez jawnej reguły warstwy. |
| JPT_SJR_KO | sourceProperties.unitKindCode | Kod rodzaju jednostki. |
| JPT_ORGAN_, JPT_ORGAN1 | sourceProperties.authority | Nazwa organu lub jednostki prowadzącej w źródle. |
| REGON | regon | Tekst, bez normalizacji numerycznej. |
| WAZNY_OD, WAZNY_DO | valid_from, valid_to | Zakres obowiązywania obiektu. |
| WERSJA_OD, WERSJA_DO | version_from, version_to | Zakres wersji rekordu źródłowego. |
| IIP_PRZEST | sourceProperties.iipNamespace | Część przestrzeni nazw IIP. |
| IIP_IDENTY | iip_id | Lokalny identyfikator IIP; razem z namespace może być pełnym IIP. |
| IIP_WERSJA | sourceProperties.iipVersion | Wersja IIP. |
| JPT_KJ_IIP, JPT_KJ_I_1, JPT_KJ_I_2, JPT_KJ_I_3 | sourceProperties.relatedIip | Skrócone pola relacji IIP; nie są samodzielnym identyfikatorem obiektu. |
| JPT_OPIS | sourceProperties.description | Opis źródłowy. |
| JPT_POWIER, JPT_POWI_1 | sourceProperties.sourceArea | Nie trafia bezpośrednio do area_m2 bez potwierdzenia jednostki. |
| SHAPE_LENG, SHAPE_AREA | sourceProperties.sourceGeometryMetrics | Wartości źródłowe do audytu, nie główne miary domenowe. |

## Warstwy statystyczne

| Pole źródłowe | Kanoniczne pole | Uwagi |
| --- | --- | --- |
| TERYT | code | Kod statystyczny jako tekst. |
| WW, PP, GG | sourceProperties.terytParts | Składowe województwo/powiat/gmina. |
| R, REJ | sourceProperties.statisticalRegion | Rejon statystyczny. |
| OBWOD, OBW | sourceProperties.censusCircuit | Obwód spisowy. |

## Warstwy morskie

| Pole źródłowe | Kanoniczne pole | Uwagi |
| --- | --- | --- |
| GRA_ID | object_id | Identyfikator linii granicznej, jeśli obecny. |
| GRA_* | sourceProperties.maritimeBoundary | Pola specyficzne dla linii podstawowej. |
| FULL_NAME, SHORT_NAME | name, sourceProperties.shortName | FULL_NAME ma pierwszeństwo dla nazwy użytkowej. |
| DOCUMENT_I | sourceProperties.legalDocumentId | Id dokumentu źródłowego. |
| LEGAL_STAT | sourceProperties.legalStatus | Status prawny. |
| SYS_UUID | object_id fallback | Używany tylko, gdy warstwa nie ma stabilniejszego ID. |
| SYS_NODE_C, SYS_VERSIO, SYS_VERS_1, SYS_DATE_A, SYS_DATA_A, SYS_DATA_E | sourceProperties.sourceSystem | Metadane systemowe źródła. |

## Warstwy branżowe bez pełnego JPT

| Pole źródłowe | Kanoniczne pole | Uwagi |
| --- | --- | --- |
| NAZWA, URZAD, RZGW, FULL_NAME | name | Priorytet zależy od warstwy; adapter warstwy musi wskazać wybrane pole. |
| LP, FID, ID, PORT_ID, MARINA_ID, OFFICE_ID, RZGW_KOD | object_id kandydat | Używane jako identyfikator tylko po potwierdzeniu stabilności w adapterze warstwy. |
| MIASTO, RODZAJ, KIERUJACY, ZASIEG | sourceProperties | Atrybuty opisowe, nie kanoniczne pola wspólne. |

## Pola adresowe SHP/GML

Adresy (A07) i ulice (A08) nie pochodzą z WFS AdministrativeBoundaries. Ich pola są mapowane przez osobne adaptery EMUiA/SHP. Wspólne zasady pozostają te same:

- identyfikator IIP i kody TERYT/SIMC/ULIC są tekstem;
- numer porządkowy nie jest normalizowany do liczby;
- kod pocztowy jest atrybutem źródła PRG, nie walidacją Poczty Polskiej;
- geometria punktu adresowego trafia do x, y, a geometria ulicy do WKB/bbox;
- skrócone pola SHP trafiają do sourceProperties tylko wtedy, gdy nie mają kanonicznego odpowiednika.
