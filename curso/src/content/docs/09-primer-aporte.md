---
title: "9. Tu primer aporte de punta a punta"
description: "Caso guiado: agregar Rosario al fetcher de clima. Pedidos copiables al asistente, validación local, propuesta de cambio."
sidebar:
  order: 9
---

> **Lo que te vas a llevar.** Tu primera <abbr title="del inglés 'pull request' — pedido para incorporar tus cambios al proyecto principal con revisión por el medio">propuesta de cambio</abbr> en GitHub. Vamos a hacer una mejora chica, controlada y reversible, con el asistente de copiloto. Calculá 45–60 minutos la primera vez.

---

## El ejercicio

**Objetivo:** agregar **Rosario** a la lista de ciudades que el script de clima consulta a Open-Meteo, y verificar que el promedio de temperatura del forecast la incluye.

Por qué este ejercicio:
- Es **chico**: pocas líneas de código.
- Es **reversible**: si sale mal, basta con tirar la rama.
- Es **observable**: el efecto se ve directo en el gráfico de temperatura del tablero.
- Toca **una sola capa** (la de datos), así que es fácil de revisar.

Si Rosario no te aplica (porque ya está agregada o lo que sea), al final del módulo hay [otras alternativas igual de simples](#alternativas).

---

## Antes de empezar (setup, una sola vez)

### 1. Cloná el repo a tu compu

En PowerShell, en una carpeta donde quieras tener el proyecto:

```powershell
gh repo clone mpodeley/estado-red-gas
cd estado-red-gas
```

(`gh repo clone` requiere que tengas `gh` instalada y autenticada — ver [Módulo 8](/estado-red-gas/curso/08-git-github-deploy/) sección 8.)

### 2. Instalá las dependencias

```powershell
# Librerías de Python (la pipeline)
pip install -r requirements.txt

# Librerías de la web
npm install
```

(Cada uno tarda 1–3 minutos la primera vez.)

### 3. Verificá que levanta el tablero local

```powershell
npm run dev
```

Te abre el tablero en `http://localhost:5173`. Si lo ves con datos cargando, ya está. Cerralo con `Ctrl+C` cuando termines de mirar.

---

## El paso a paso

### Paso 1 — Crear la rama nueva

Antes de tocar nada:

```powershell
git checkout master
git pull
git checkout -b agregar-ciudad-rosario
```

Esto te asegura partir desde la última versión y trabajar en una rama aparte.

### Paso 2 — Hablar con el asistente

Abrí Claude Code en la carpeta del repo:

```powershell
claude
```

Pegá este mensaje, tal cual:

```
Estoy haciendo mi primer aporte al repo. Quiero agregar Rosario a la
lista de ciudades del fetcher de clima (Open-Meteo). Antes de tocar
nada, por favor:

1. Mostrame dónde está la lista actual de ciudades en
   scripts/fetch_weather.py.
2. Verificá que Rosario no esté ya.
3. Proponé el cambio mínimo para sumarla, con coordenadas
   correctas (lat -32.9576, lon -60.6394 — verificalas igual).
4. Identificá si hay que tocar también generate_forecast.py o
   algún otro archivo (por ejemplo, el promedio de las ciudades
   asume una cantidad fija).
5. Esperá mi OK antes de editar.
```

### Paso 3 — Revisar y aprobar el plan

Leé la respuesta entera. Cosas para mirar:

- ✅ ¿Encontró correctamente la lista en `scripts/fetch_weather.py`?
- ✅ ¿Rosario realmente no está ya?
- ✅ ¿Las coordenadas tienen sentido (Rosario está en Santa Fe, sobre el Paraná)?
- ✅ ¿Identificó si `generate_forecast.py` necesita cambios?

Si todo cuadra, decile: *"Dale, hacé los cambios mínimos. Después hago `npm run dev` para verificar."*

Si algo no cuadra, corregilo: *"En realidad la lista de ciudades está en otro archivo, fijate de nuevo"*. Iterá hasta estar conforme.

### Paso 4 — Ver los cambios que aplicó

Cuando termine, en otra terminal (o pidiéndole al asistente):

```powershell
git status
git diff
```

`git status` te muestra qué archivos cambió. `git diff` te muestra **línea por línea** qué se modificó. **Leelo todo.** Si hay alguna línea que no entendés, pedile al asistente que te la explique.

### Paso 5 — Validar localmente

Antes de subir nada, corré la pipeline y la web para confirmar que no se rompió nada:

```powershell
# Correr el fetcher actualizado
python scripts/fetch_weather.py

# Correr el generador de forecast (que usa el promedio de ciudades)
python scripts/generate_forecast.py

# Levantar el tablero
npm run dev
```

En el tablero local (`http://localhost:5173`), andá a la tab **Operación** y revisá:

- El gráfico de **Temperatura** sigue renderizando.
- El gráfico de **Forecast** sigue mostrando datos.
- En **Estado** (la tab de salud), no hay errores nuevos.

Si todo OK, seguís. Si algo se rompió, copiá el mensaje de error y volvés al asistente: *"Después del cambio, esto está fallando: [pegás el error]"*.

### Paso 6 — Guardar (commit)

Pedile al asistente:

> *"Hacé `git status`, agregá los archivos relevantes (no quiero pisar nada accidental), y armá el commit con un mensaje en el estilo del repo. Mostrame qué vas a commitear antes de hacerlo."*

Va a proponerte algo como:

```
weather: agregar Rosario al fetcher de Open-Meteo

Sumar Rosario (-32.96, -60.64) a la lista de ciudades del clima.
No requiere cambios en generate_forecast.py — el promedio se calcula
sobre la lista variable, no sobre nombres fijos.
```

Si te gusta, dale OK. Si no, corregilo.

### Paso 7 — Subir la rama

```powershell
git push -u origin agregar-ciudad-rosario
```

(El asistente puede correrlo por vos.)

### Paso 8 — Abrir la propuesta de cambio

> *"Abrí el PR con `gh pr create`. Título corto y descriptivo. En el cuerpo, contá qué cambia y cómo lo probé localmente."*

El asistente arma el comando y te muestra qué va a poner. Si te gusta, dale OK.

Cuando termina, te devuelve un link de GitHub tipo `https://github.com/mpodeley/estado-red-gas/pull/123`. Cliqueá: vas a ver tu propuesta abierta, con el diff completo y los <abbr title="del inglés 'checks' — verificaciones automáticas que corren en cada push, como verificar tipos o que la web compile">checks</abbr> de GitHub Actions corriéndose.

### Paso 9 — Esperar las verificaciones

GitHub corre la GitHub Action automáticamente sobre tu rama. Toma unos minutos. Verificá que el círculo se ponga **verde**. Si se pone rojo, clickeá para ver el log y volvé al asistente con ese log.

### Paso 10 — Mergear

Cuando los checks están verdes:

```powershell
gh pr merge --squash --delete-branch
```

(O lo hacés desde la web de GitHub clickeando "Squash and merge".)

El `--squash` junta todos tus commits en uno solo (queda más limpio el historial). El `--delete-branch` borra la rama después del merge (ya no la necesitás).

### Paso 11 — Esperar la publicación

El merge dispara el GitHub Action que publica el sitio. En 4–5 minutos, tu cambio está en producción:

- Tablero: https://mpodeley.github.io/estado-red-gas/
- Si querés mirar el gráfico de temperatura, esperá al próximo run de la pipeline (mañana a las 6 AM, o disparado a mano con `gh workflow run "Update data and deploy"`).

**Listo. Hiciste tu primer aporte.** 🎉

---

## Qué hacer si algo sale mal

| Síntoma | Qué hacer |
|---|---|
| El asistente edita algo que no esperabas | `git checkout -- <archivo>` para descartar ese cambio específico. |
| `npm run dev` muestra una página en blanco con un error rojo | Copiá el error, pasáselo al asistente. Suele ser un import mal escrito o un tipo TypeScript. |
| `python scripts/fetch_weather.py` falla | Copiá el error, pasáselo al asistente. Suele ser un problema con las coordenadas o el formato del JSON. |
| Querés tirar todo y arrancar de nuevo | `git checkout master` te lleva a la versión principal. `git branch -D agregar-ciudad-rosario` borra tu rama experimental. No perdés nada porque está pushed. |
| El check de GitHub se puso rojo | Andá al log, copiá el error, pasáselo al asistente con: *"el check tal falló con este mensaje, ¿cómo lo arreglo?"*. |

> **Regla de oro:** si te quedás trabado más de 15 minutos en un paso, pará y consultá. No "forcejees" cambios que no entendés.

---

## Alternativas {#alternativas}

Si Rosario no te aplica, otros primeros aportes igual de simples:

1. **Mejorar el texto de la Guía del tablero.** Cambia algo en `src/components/GuidePage.tsx`. No toca pipeline, no toca datos. Riesgo cero.
2. **Agregar un comentario explicativo** a una función de `scripts/parse_enargas.py` que te pareció no obvia cuando la leíste. Educación pura, beneficio para el próximo que la lea.
3. **Cambiar el orden de los KPIs** en la portada (`src/components/KPICards.tsx`). Es un cambio cosmético reversible, pero tocás un componente real.
4. **Agregar una ciudad a Open-Meteo que no sea Rosario** — el flujo es idéntico (Córdoba, Bahía Blanca, San Juan, etc.).
5. **Mejorar un mensaje de error** en algún gráfico cuando no hay datos. UX puro.

Cualquiera de estos te da el mismo aprendizaje del flujo completo, sin necesidad de tocar lógica del modelo.

---

## Antes de seguir

- [ ] Abriste tu primera propuesta de cambio.
- [ ] Pasaron los checks en verde.
- [ ] El cambio se mergeó y está publicado.
- [ ] Identificás cuál de los pasos te costó más — esa va a ser tu zona de práctica para los próximos aportes.

Cuando los cuatro estén tildados, andá al **[Módulo 10 — Cómo seguir aprendiendo](/estado-red-gas/curso/10-como-seguir/)** para ver dónde profundizar.
