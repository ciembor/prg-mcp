# Macierz zgodności warstw PRG

Każda z 54 warstw PRG ma wpis w statycznym katalogu, źródło, mapowanie kanoniczne i publiczną ścieżkę narzędziową. Fixture kontraktowe są małymi próbkami schematów, a nie pełnymi danymi PRG.

| Layer | Nazwa źródłowa | Fixture/test | Public tool path | Source |
| --- | --- | --- | --- | --- |
| A00 | `A00_Granice_panstwa` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point` | WFS AdministrativeBoundaries |
| A01 | `A01_Granice_wojewodztw` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point` | WFS AdministrativeBoundaries |
| A02 | `A02_Granice_powiatow` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point` | WFS AdministrativeBoundaries |
| A03 | `A03_Granice_gmin` | `area-tools golden queries`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point` | WFS AdministrativeBoundaries |
| A04 | `A04_Granice_miast` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point` | WFS AdministrativeBoundaries |
| A05 | `A05_Granice_jednostek_ewidencyjnych` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point` | WFS AdministrativeBoundaries |
| A06 | `A06_Granice_obrebow_ewidencyjnych` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point` | WFS AdministrativeBoundaries |
| A07 | `A07_Punkty_adresowe` | `address-tools`, `emuia-2012`, `emuia-2021` | `search_addresses`, `get_address`, `reverse_address` | PRG address package |
| A08 | `A08_Ulice` | `address-tools`, `emuia-2012`, `emuia-2021` | `search_streets`, `get_street` | PRG address package |
| R01 | `R01_Granice_rejonow_statystycznych` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point` | WFS AdministrativeBoundaries |
| R02 | `R02_Granice_obwodow_spisowych` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point` | WFS AdministrativeBoundaries |
| S01 | `S01_Sad_apelacyjny` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| S02 | `S02_Sad_okregowy` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| S03 | `S03_Sad_rejonowy` | `area-tools golden queries`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| S04 | `S04_Wojewodzki_sad_administracyjny` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| P01 | `P01_Prokuratura_regionalna` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| P02 | `P02_Prokuratura_okregowa` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| P03 | `P03_Prokuratura_rejonowa` | `area-tools golden queries`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| K01 | `K01_Komenda_wojewodzka_policji` | `area-tools golden queries`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| K02 | `K02_Komenda_powiatowa_policji` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| K03 | `K03_Komenda_stoleczna_policji` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| K04 | `K04_Komenda_rejonowa_policji` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| K05 | `K05_Komisariat_policji` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| K06 | `K06_Komenda_wojewodzka_strazy_pozarnej` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| K07 | `K07_Komenda_powiatowa_strazy_pozarnej` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| K08 | `K08_Oddzial_strazy_granicznej` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| K09 | `K09_Placowka_strazy_granicznej` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| K10 | `K10_Dywizjon_strazy_granicznej` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| K11 | `K11_Obszar_dzialania_szefa_obrony_cywilnej_wojewodztwa` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| K12 | `K12_Obszar_dzialania_szefa_obrony_cywilnej_powiatu` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| K13 | `K13_Obszar_dzialania_szefa_obrony_cywilnej_gminy` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| U01 | `U01_Archiwum_panstwowe` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| U02 | `U02_Urzad_skarbowy` | `area-tools golden queries`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| U03 | `U03_Wyspecjalizowany_urzad_skarbowy` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| U04 | `U04_Urzad_celno-skarbowy` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| U05 | `U05_Izba_administracji_skarbowej` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| U06 | `U06_Nadlesnictwo` | `area-tools golden queries`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| U07 | `U07_Regionalna_dyrekcja_lasow_panstwowych` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| U08 | `U08_Zarzad_zlewni_PGWWP` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| U09 | `U09_Regionalny_zarzad_gospodarki_wodnej_PGWWP` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| U10 | `U10_Urzad_morski` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| U11 | `U11_Urzad_zeglugi_srodladowej` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| W01 | `W01_Linia_podstawowa_morza_terytorialnego` | `area-tools golden queries`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `relate_areas` | WFS AdministrativeBoundaries |
| W02 | `W02_Morze_terytorialne_RP` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| W03 | `W03_Morskie_wody_wewnetrzne` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| W04 | `W04_Wylaczna_strefa_ekonomiczna` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| W05 | `W05_Strefa_przylegla` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| W06 | `W06_Morskie_linie_brzegowe` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `relate_areas` | WFS AdministrativeBoundaries |
| W07 | `W07_Pas_nadbrzezny` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| W08 | `W08_Pas_ochronny` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| W09 | `W09_Pas_techniczny` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| W10 | `W10_Reda` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| W11 | `W11_Port_morski` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
| W12 | `W12_Przystan_morska` | `prg-layer-catalog`, `wfs-schema-shapes` | `search_areas`, `get_area`, `get_area_geometry`, `locate_point`, `relate_areas` | WFS AdministrativeBoundaries |
