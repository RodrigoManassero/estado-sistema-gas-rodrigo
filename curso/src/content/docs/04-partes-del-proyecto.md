---
title: "4. Las partes de este proyecto"
description: "Tour del repositorio con links profundos a archivos: la pipeline en Python, la web en React, los datos, las configuraciones."
sidebar:
  order: 4
  badge:
    text: Borrador
    variant: caution
---

> **Próximamente** — este módulo todavía está en borrador. Te dejamos los objetivos y el índice para que veas qué va a haber acá.

## Qué te vas a llevar

- Un **mapa mental** de qué carpeta hace qué cosa.
- Saber dónde buscar **antes** de pedirle un cambio al asistente.

## Lo que va a haber acá

### 1. Tour del repo en 5 minutos

`scripts/`, `src/`, `public/data/`, `raw/`, `docs/`, `.github/` — uno por uno, qué hay y para qué.

### 2. La pipeline en Python ([`scripts/`](https://github.com/mpodeley/estado-red-gas/tree/master/scripts))

- **El organizador**: [`build_data.py`](https://github.com/mpodeley/estado-red-gas/blob/master/scripts/build_data.py) — corre todo en orden.
- **Fetchers** (bajadores): ENARGAS, CAMMESA, Open-Meteo, MEGSA, SMN.
- **Parsers** (interpretadores): PDF/Excel → JSON.
- **Modelos**: [`generate_forecast.py`](https://github.com/mpodeley/estado-red-gas/blob/master/scripts/generate_forecast.py), [`backtest_forecast.py`](https://github.com/mpodeley/estado-red-gas/blob/master/scripts/backtest_forecast.py).
- **Ayudantes**: [`_meta.py`](https://github.com/mpodeley/estado-red-gas/blob/master/scripts/_meta.py) — la envoltura común para todos los JSON.

### 3. La web en React ([`src/`](https://github.com/mpodeley/estado-red-gas/tree/master/src))

- Punto de entrada: [`main.tsx`](https://github.com/mpodeley/estado-red-gas/blob/master/src/main.tsx), [`App.tsx`](https://github.com/mpodeley/estado-red-gas/blob/master/src/App.tsx).
- Páginas (tabs): `OperacionPage`, `MapaPage`, `HistoricoPage`, `GuidePage`, `FuentesPage`, `StatusPage`.
- "Cómo se cargan los datos": [`useData.ts`](https://github.com/mpodeley/estado-red-gas/blob/master/src/hooks/useData.ts).
- Utilidades para los gráficos: [`charts.ts`](https://github.com/mpodeley/estado-red-gas/blob/master/src/utils/charts.ts).
- Colores y espaciados: [`theme.ts`](https://github.com/mpodeley/estado-red-gas/blob/master/src/theme.ts).

### 4. Los datos ([`public/data/`](https://github.com/mpodeley/estado-red-gas/tree/master/public/data))

Todos los archivos JSON con la misma envoltura `{generated_at, source, source_date, data}`.

### 5. Configuraciones

`package.json`, `tsconfig.json`, `vite.config.ts`, `requirements.txt`, `.github/workflows/update-data.yml`.

## Una rebanada de ejemplo, de punta a punta

Para que veas un caso concreto, en el módulo final vamos a recorrer una "rebanada" del sistema, de la fuente externa hasta el gráfico en pantalla:

```
Open-Meteo (servicio público de clima)
  ↓
scripts/fetch_weather.py
  ↓
public/data/weather_regions.json
  ↓
src/hooks/useData.ts → useWeatherRegions()
  ↓
src/components/TemperatureChart.tsx
  ↓
src/components/OperacionPage.tsx
  ↓
Navegador
```

Cuando este módulo esté completo, cada paso va a tener su propio mini-tutorial linkeado al archivo real del repo.
