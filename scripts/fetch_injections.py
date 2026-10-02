async function buildInjectionsDaily() {
  try {
    // 1. Carga en paralelo de ambos archivos JSON
    const [resPS, resForecast] = await Promise.all([
      fetch('enargas_ps.json'),
      fetch('inyections_forecast.json')
    ]);

    if (!resPS.ok || !resForecast.ok) {
      throw new Error('Error al cargar uno de los archivos JSON');
    }

    const dataPS = await resPS.json();
    const dataForecast = await resForecast.json();

    // Mapa auxiliar para agrupar y fusionar los datos por fecha
    const dailyMap = new Map();

    // 2. Procesar datos Históricos/Reales/Programados de ENARGAS PS
    if (Array.isArray(dataPS.data)) {
      dataPS.data.forEach((item) => {
        if (!item.fecha) return;

        // Determinar origen del registro
        const isReal = item.tipo === 'R';
        const isProgrammed = item.tipo === 'P';

        dailyMap.set(item.fecha, {
          fecha: item.fecha,
          origen: isReal ? 'ENARGAS_PS_REAL' : isProgrammed ? 'ENARGAS_PS_PROGRAMADO' : 'ENARGAS_PS',
          tipo: item.tipo || null,
          temp_prom_ba: item.temp_prom_ba ?? null,
          demanda_total: item.demanda_total ?? null,
          iny_total: item.iny_total ?? null,
          iny_tgs: item.iny_tgs ?? null,
          iny_tgn: item.iny_tgn ?? null,
          iny_gpm: item.iny_gpm ?? null,
          iny_bolivia: item.iny_bolivia ?? null,
          iny_chile: item.iny_chile ?? null,
          iny_escobar: item.iny_escobar ?? null,
          linepack_total: item.linepack_total ?? null,
          source_file: item.source ?? null
        });
      });
    }

    // 3. Procesar o sobreescribir/complementar con las Proyecciones (Forecast)
    if (Array.isArray(dataForecast.data)) {
      dataForecast.data.forEach((item) => {
        if (!item.fecha) return;

        // Si ya existe el día y es de tipo REAL, priorizamos el dato real.
        // Si no existe o era un dato programado/proyectado previo, guardamos el modelo forecast.
        const existing = dailyMap.get(item.fecha);
        
        if (!existing || existing.tipo !== 'R') {
          dailyMap.set(item.fecha, {
            fecha: item.fecha,
            origen: 'MODELO_FORECAST',
            tipo: 'F',
            temp_prom_ba: existing?.temp_prom_ba ?? null,
            demanda_total: item.demanda_estimada ?? null,
            iny_total: item.iny_total ?? null,
            iny_tgs: item.iny_tgs ?? null,
            iny_tgn: item.iny_tgn ?? null,
            iny_gpm: item.iny_gpm ?? null,
            iny_bolivia: item.iny_bolivia ?? 0.0,
            iny_chile: item.iny_chile ?? 0.0,
            iny_escobar: item.iny_escobar ?? 0.0,
            linepack_total: existing?.linepack_total ?? null,
            source_file: dataForecast.source ?? 'Forecast Model'
          });
        }
      });
    }

    // 4. Ordenar la serie cronológicamente por fecha
    const dailySeries = Array.from(dailyMap.values()).sort(
      (a, b) => new Date(a.fecha) - new Date(b.fecha)
    );

    // 5. Armar la estructura final de `injections_daily.json`
    const injectionsDailyJSON = {
      generated_at: new Date().toISOString(),
      description: "Serie diaria unificada de inyecciones y demanda (Histórico ENARGAS + Proyección Modelada)",
      last_ps_date: dataForecast.last_ps_date || dataPS.source_date || null,
      total_records: dailySeries.length,
      data: dailySeries
    };

    console.log("JSON Injections Daily generado exitosamente:", injectionsDailyJSON);
    return injectionsDailyJSON;

  } catch (error) {
    console.error("Error al generar injections_daily.json:", error);
  }
}

// Ejecución
buildInjectionsDaily();
