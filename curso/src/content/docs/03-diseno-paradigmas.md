---
title: "3. Cómo se diseña una aplicación (paradigmas)"
description: "Separar datos, lógica y presentación. El acuerdo (contrato) entre las partes. Sitios estáticos vs dinámicos. Todo con analogías de Excel."
sidebar:
  order: 3
---

> **Lo que te vas a llevar.** Después de este módulo vas a poder mirar el tablero y, sin entrar al código, intuir por qué está partido en pedazos como está, qué hace cada pedazo, y por qué esa división es la que te permite cambiar una cosa sin romper otra.

Antes de arrancar: este módulo no enseña a programar. Enseña a *pensar* una aplicación. Eso es lo que más te va a servir cuando le tengas que pedir cambios a un asistente de código (Módulos 6 y 7).

---

## 1. Arranquemos por algo que conocés: Excel

Pensá en un reporte tuyo, de los que armás semana a semana. Posiblemente tenga, más o menos, tres pedazos:

| En tu Excel típico | Qué hay ahí |
|---|---|
| **Hoja "Datos"** | Los números crudos que pegaste desde ENARGAS, CAMMESA, el clima, etc. |
| **Hoja "Cálculos"** | Tus fórmulas: `=PROMEDIO(...)`, `=SI(...)`, `BUSCARV`, tablas dinámicas. |
| **Hoja "Reporte"** | Los gráficos y la tabla resumen que mostrás. |

Eso funciona perfecto **hasta** que pasa alguna de estas cosas:

1. ENARGAS cambia el formato del PDF y se te rompen tres fórmulas.
2. Querés agregar otra ciudad al promedio de temperatura y tenés que tocar 12 celdas distribuidas.
3. Te vas de vacaciones y nadie más se anima a abrir el archivo.

Lo importante para retener: tu Excel ya hace algo que las aplicaciones grandes hacen también — **separar los datos, los cálculos y lo que se muestra**. Lo que sigue es la misma idea, pero hecha de manera que sobreviva al PDF nuevo, a la ciudad extra, y a las vacaciones.

## 2. Tres capas, una sola idea

Casi todas las aplicaciones del mundo están organizadas en **tres capas**:

| Capa | Qué hace | Equivalente Excel |
|---|---|---|
| **Datos** | Guarda los hechos. Lo que es verdad. | La hoja "Datos" — números crudos |
| **Lógica** | Transforma esos hechos: calcula, modela, valida. | La hoja "Cálculos" — las fórmulas |
| **Presentación** | Le muestra el resultado a una persona. | La hoja "Reporte" — gráficos y tablas |

¿Por qué se separan? Porque cuando una parte tiene que cambiar, querés que las otras dos no se enteren:

- Cambiar el color de un gráfico **no** debería tocar cómo se calcula el promedio.
- Cambiar el modelo del forecast **no** debería romper la importación del PDF.
- Que ENARGAS rediseñe el PDF **no** debería forzarte a rehacer todos los gráficos.

Cuando las capas están **enredadas** (todo mezclado en la misma hoja, todo en el mismo archivo), cualquier cambio chico arrastra cambios en cascada. Es exactamente la sensación de *"toqué una fórmula y se me rompió otra hoja"*. Cuando están **separadas con un acuerdo claro entre ellas**, podés trabajar en una sin pensar en las otras.

### Cómo se ve esto en el tablero

| Capa | Dónde vive | En palabras |
|---|---|---|
| Datos | [`raw/`](https://github.com/mpodeley/estado-red-gas/tree/master/raw) y [`public/data/`](https://github.com/mpodeley/estado-red-gas/tree/master/public/data) | Los archivos crudos descargados (PDFs, Excels) y los datos procesados en formato <abbr title="JavaScript Object Notation — un formato de texto para guardar datos estructurados. Pensalo como una hoja de Excel guardada en formato texto plano, anidable, que cualquier sistema puede leer">JSON</abbr>. |
| Lógica | [`scripts/`](https://github.com/mpodeley/estado-red-gas/tree/master/scripts) | Los <abbr title="archivos con instrucciones para la computadora, escritos en lenguaje Python en este caso">scripts</abbr> de Python que bajan los archivos, los leen, calculan promedios, entrenan el modelo de forecast. |
| Presentación | [`src/`](https://github.com/mpodeley/estado-red-gas/tree/master/src) | El <abbr title="del inglés 'front end' — la parte de un programa que ve y usa la persona, en contraste con el 'back end' que corre escondido">frontend</abbr>: la página web con los gráficos, paneles y tabs que ves en el browser. |

## 3. El "acuerdo" entre las capas (el contrato)

Para que dos capas separadas se puedan hablar, necesitan un **acuerdo**: un formato fijo, escrito, que las dos respetan. En el mundo del software a eso se le dice **contrato**.

En este tablero, el acuerdo entre la parte de Python (datos + lógica) y la parte de React (presentación) son los **archivos JSON** que viven en [`public/data/`](https://github.com/mpodeley/estado-red-gas/tree/master/public/data). Todos tienen la misma forma:

```json
{
  "generated_at": "2026-05-19T09:00:31Z",
  "source": "scripts/fetch_weather.py",
  "source_date": "2026-05-19",
  "data": [ ... acá adentro lo que sea ... ]
}
```

Esa "envoltura" (los cuatro campos `generated_at`, `source`, `source_date`, `data`) se aplica desde un solo lugar: la <abbr title="bloque de código reusable que hace una tarea específica, similar a una función de Excel como SUMA() pero programable">función</abbr> `write_json()` en [`scripts/_meta.py`](https://github.com/mpodeley/estado-red-gas/blob/master/scripts/_meta.py). Todos los scripts de Python escriben sus archivos JSON pasando por ahí. Y la web React, en [`src/hooks/useData.ts`](https://github.com/mpodeley/estado-red-gas/blob/master/src/hooks/useData.ts), los lee asumiendo siempre esa misma envoltura.

> **Analogía Excel.** Imaginate que vos y un compañero acuerdan: *"yo te voy a pasar todos los días un archivo con estas mismas columnas, en este mismo orden, a las 9 de la mañana. Vos hacés tu reporte con eso. Si yo después cambio cómo armo mi archivo, no te interesa — sigue saliendo el mismo".* Eso es un contrato.

### ¿Qué ganamos?

- Python puede cambiar **cómo** trae los datos (otra fuente, otra librería, otro algoritmo) sin que la web se entere — mientras siga escribiendo el mismo JSON.
- La web puede rediseñarse de cero sin tocar Python — mientras siga leyendo el mismo JSON.
- Si alguien (vos, el asistente, otro analista) toca uno de los dos lados, **solo necesita conocer ese lado**. No tiene que entender todo el sistema.

## 4. Sitios estáticos vs dinámicos

Hay dos grandes formas de servir una página web en internet:

### Sitios dinámicos (la mayoría)

Cada vez que entrás, hay un **servidor** del otro lado que en ese mismo momento corre código, consulta una base de datos, te arma la página, y te la manda. Si entran 1000 personas al mismo tiempo, el servidor trabaja 1000 veces. Necesitás <abbr title="computadoras y servicios corriendo todo el tiempo, que alguien tiene que pagar y mantener">infraestructura</abbr> prendida las 24 hs y alguien que la cuide.

### Sitios estáticos (este tablero)

La página entera se **arma una sola vez por adelantado** y se sube a un servicio que solo sirve archivos ya hechos. Cuando entrás, te bajás los archivos terminados. No hay código corriendo del lado del servidor — el "trabajo" se hizo antes.

**Este tablero es estático.** El armado lo hace [una GitHub Action](https://github.com/mpodeley/estado-red-gas/blob/master/.github/workflows/update-data.yml) — una <abbr title="una receta automática que se dispara cada tantas horas o cuando pasa algo, sin que nadie la prenda a mano">automatización</abbr> que arranca solita a las 6 de la mañana (hora Argentina) y hace tres cosas:

1. Corre los scripts de Python → escribe los JSON nuevos en `public/data/`.
2. Compila la página web → escribe el resultado final en una carpeta llamada `dist/`.
3. Sube todo eso a [GitHub Pages](https://pages.github.com/), un servicio gratuito que aloja sitios estáticos.

| Ventaja del enfoque estático | Costo |
|---|---|
| Mantenerlo es prácticamente gratis (no hay servidores prendidos) | Los datos están frescos cada 24 hs, no en tiempo real |
| Si la generación falla, el sitio sigue funcionando con los datos del día anterior | No podemos tener funcionalidades que dependan de "el servidor sabe quién sos" (login, permisos por usuario, etc.) |
| Es rápido para el usuario, porque solo descarga archivos | El sitio es el mismo para todos los visitantes |

Para el caso de uso (un reporte operativo diario), esa elección es la correcta. Te ahorra una capa entera de complejidad.

## 5. Cómo se ve aplicado a este repo (el recorrido completo)

```
   Fuentes públicas                Pipeline en Python           El acuerdo           Frontend                Lo que ves
  ─────────────────                ───────────────────          ──────────           ────────                ──────────
  · ENARGAS (PDFs RDS)
  · CAMMESA (PDFs + XLS)  ──→   scripts/fetch_*.py     ──→   public/data/   ──→   src/hooks/         ──→   Navegador
  · Open-Meteo (API)            scripts/parse_*.py            *.json               useData.ts              Gráficos
  · MEGSA (API)                 scripts/generate_forecast.py  *.csv                src/components/         Paneles
  · SMN (zip de alertas)                                                           *.tsx                   KPIs
                                 build_data.py (el "organizador")
```

(El recuadro `scripts/fetch_*.py` quiere decir "todos los archivos del estilo `fetch_algo.py` dentro de la carpeta `scripts/`". El asterisco `*` es comodín, igual que en `*.pdf`.)

Cada flecha es un punto de contacto entre dos capas. Si te ponés a leer el código y te perdés, anclate en este diagrama y preguntate *"¿qué capa estoy mirando?"*:

- ¿Estás tocando un PDF nuevo o una API? → estás en los <abbr title="scripts que bajan archivos o datos desde una fuente — del verbo inglés 'to fetch', traer">**fetchers**</abbr>: [`scripts/fetch_*.py`](https://github.com/mpodeley/estado-red-gas/tree/master/scripts).
- ¿Estás transformando un PDF o un Excel en datos limpios? → estás en los <abbr title="scripts que leen un archivo crudo y le sacan los datos estructurados — del verbo inglés 'to parse', analizar el contenido">**parsers**</abbr>: `scripts/parse_*.py`.
- ¿Estás entrenando un modelo? → [`scripts/generate_forecast.py`](https://github.com/mpodeley/estado-red-gas/blob/master/scripts/generate_forecast.py).
- ¿Estás cambiando cómo se ve algo? → [`src/components/`](https://github.com/mpodeley/estado-red-gas/tree/master/src/components).
- ¿Estás cambiando qué se lee y de dónde? → [`src/hooks/useData.ts`](https://github.com/mpodeley/estado-red-gas/blob/master/src/hooks/useData.ts).

## 6. Por qué te sirve esto

Cuando trabajes con un asistente de código (Módulos 6 y 7), vas a tener que decirle **a qué capa apuntás**. Saber identificar eso es la diferencia entre estas dos versiones del mismo pedido:

> ❌ "Quiero que el gráfico de temperatura muestre también humedad."

> ✅ "Quiero agregar humedad al tablero. Vamos por partes: primero ampliemos el script de clima en `scripts/fetch_weather.py` para que también traiga humedad de Open-Meteo. Después actualicemos el JSON de salida. Y al final agregamos una línea más al gráfico en `src/components/TemperatureChart.tsx`. Empecemos por el script de clima."

La segunda versión es mucho más fácil de ejecutar para el asistente, y muchísimo más fácil de revisar para vos, porque respeta las capas. Y eso es todo lo que necesitamos por ahora: que sepas **qué capa estás tocando**, no el detalle exacto del código.

## 7. Antes de seguir

Sabés que entendiste el módulo si podés contestar estas tres en voz alta:

- ¿Por qué los archivos JSON de `public/data/` son el "acuerdo" entre Python y React?
- ¿Cuál es la diferencia entre un sitio estático y uno dinámico, y por qué este es estático?
- Si quisieras agregar humedad al tablero, ¿en qué capas habría que tocar?

Si pudiste, seguí con el **[Módulo 4 — Las partes de este proyecto](/estado-red-gas/curso/04-partes-del-proyecto/)** para un tour más detallado, o saltá al **[Módulo 7 — Skills y mejores prácticas](/estado-red-gas/curso/07-skills-mejores-practicas/)** si querés ir ya a la parte práctica con el asistente.
