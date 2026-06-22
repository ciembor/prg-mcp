# Informacje prawne i źródła danych

## Oprogramowanie

Copyright 2026 Maciej Ciemborowicz.

Kod źródłowy projektu PRG MCP jest udostępniany wyłącznie na warunkach European Union Public Licence, wersja 1.2 (`EUPL-1.2 only`). Pełna treść licencji znajduje się w pliku `LICENSE`.

## Dane PRG

Projekt pobiera i przetwarza informacje sektora publicznego z Państwowego Rejestru Granic i Powierzchni Jednostek Podziałów Terytorialnych Kraju (PRG). Źródłem danych jest Główny Urząd Geodezji i Kartografii:

https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/

Geoportal deklaruje dane PRG jako dostępne bezpłatnie i do dowolnego wykorzystania. Dane nie są częścią kodu źródłowego ani pakietu npm; użytkownik pobiera je z oficjalnych usług GUGiK podczas jawnej synchronizacji.

Każda lokalna migawka będzie przechowywać datę stanu udostępnioną przez źródło, czas pobrania, adres źródłowy i sumę kontrolną. PRG MCP przetwarza dane do lokalnej bazy i indeksów wyszukiwania, ale nie jest systemem GUGiK ani oficjalnym interfejsem Geoportalu. Główny Urząd Geodezji i Kartografii nie odpowiada za działanie projektu ani wyniki przetwarzania.
