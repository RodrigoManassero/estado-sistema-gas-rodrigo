---
title: "8. Git, GitHub y el deploy automático"
description: "Cómo se guarda el trabajo, cómo se propone un cambio, y cómo el sitio se publica solo cada noche."
sidebar:
  order: 8
---

> **Lo que te vas a llevar.** Después de este módulo vas a entender el flujo "rama → commit → push → propuesta de cambio → merge → publicación", vas a saber cómo el asistente te ayuda en cada paso, y vas a poder leer una <abbr title="del inglés 'GitHub Action' — automatización que corre en una máquina de GitHub cuando pasa algún evento (horario, push, etc.)">GitHub Action</abbr> sin perderte.

---

## 1. Git en una sola idea

**Git** es un sistema que lleva el historial completo de todos los cambios que se hacen sobre los archivos de un proyecto. Cada cambio que decidís "guardar oficialmente" se llama <abbr title="snapshot guardado con un mensaje describiendo el cambio. Equivalente a un 'Guardar como' con etiqueta">**commit**</abbr> y queda registrado para siempre, con autor, fecha y mensaje.

**GitHub** es un sitio web que aloja repos en internet y le suma cosas encima: propuestas de cambio con discusión, ejecución de automatizaciones, alojamiento de páginas, control de permisos.

> **Analogía Word.** Pensá en el "Control de cambios" de Word. Cada vez que aceptás un cambio, queda registrado. Te podés ir hasta atrás en la historia. Si dos personas trabajaron sobre el mismo archivo, hay una herramienta para mezclar las dos versiones. Git hace eso, pero para cualquier tipo de archivo y mucho más sofisticadamente.

## 2. El flujo de trabajo, en orden

El flujo típico para hacer un cambio se ve así:

```
[1. Bajar la última versión]
     git pull
        ↓
[2. Crear una rama nueva para tu cambio]
     git checkout -b mi-mejora
        ↓
[3. Editar archivos]
     (vos, con la ayuda del asistente)
        ↓
[4. Revisar qué cambió]
     git status / git diff
        ↓
[5. Guardar el cambio con etiqueta]
     git add <archivos>
     git commit -m "descripción"
        ↓
[6. Subir tu rama a GitHub]
     git push -u origin mi-mejora
        ↓
[7. Abrir la propuesta de cambio]
     gh pr create
        ↓
[8. Otro (o vos mismo) revisa y aprueba]
        ↓
[9. Mergear la rama a la principal]
        ↓
[10. La automatización publica el sitio]
```

No tenés que memorizar los comandos exactos — el asistente los conoce. Lo importante es entender **qué paso estás haciendo**.

## 3. Qué significa cada paso (en castellano)

### Pull

> *"Traete a tu disco lo último que hay en GitHub."*

Sirve para arrancar el día con la versión más fresca, antes de tocar nada. Si no lo hacés, podrías editar algo que otra persona ya modificó.

### Branch (rama)

> *"Creá una copia paralela del proyecto para experimentar."*

Las ramas existen para que vos puedas trabajar sin pisarle el código a nadie ni romper la versión principal. La rama principal de este proyecto se llama `master`. Cuando hacés un cambio, lo hacés siempre en una rama nueva: `agregar-rosario`, `arreglar-cammesa`, `mejorar-guia`, etc.

### Commit

> *"Tomá una foto del estado actual y guardala con un mensaje."*

Un commit es **un punto en la historia al que podés volver**. Tiene tres partes:

1. Los archivos que cambiaron.
2. Un mensaje corto (1ª línea) y opcionalmente un mensaje largo (explicación).
3. Un identificador único (un hash, tipo `4760750`).

**Anatomía de un buen mensaje de commit:**

```
weather: agregar Rosario al fetcher de Open-Meteo

Sumar Rosario a la lista de ciudades del clima diario.
Coordenadas: -32.95, -60.65.
No requiere cambios en generate_forecast.py (ya usa todas
las ciudades de la lista, no nombres específicos).
```

La primera línea es la que aparece en todos los logs — tiene que ser corta y descriptiva. El cuerpo de abajo explica el "por qué".

### Push

> *"Subí tu rama desde tu disco a GitHub."*

Hasta que no hacés `push`, tu trabajo solo existe en tu compu. `push` lo sube a la copia online. La primera vez que subís una rama nueva, usás `git push -u origin <rama>` (el `-u` deja la rama "linkeada" con su contraparte online para futuros push).

### Pull Request (propuesta de cambio)

> *"Pedile al proyecto que incorpore tu rama a la principal."*

Una <abbr title="Pull Request en inglés. Pedido para incorporar tu rama al proyecto principal, con revisión por el medio">propuesta de cambio</abbr> es **el pedido formal de mergear tu rama a master**. Vive en la página del proyecto en GitHub, y permite:

- Que otra persona vea el "diff" (qué líneas cambiaron).
- Que dejen comentarios línea por línea.
- Que la automatización corra verificaciones automáticas antes del merge.
- Que se discuta si hace falta antes de aceptar el cambio.

La abrís con:

```bash
gh pr create
```

`gh` es la <abbr title="herramienta oficial de GitHub para usar desde la terminal. Se instala desde cli.github.com">CLI de GitHub</abbr>. Si no la tenés, instalala desde [cli.github.com](https://cli.github.com/). El asistente puede ayudarte a redactar el título y el cuerpo de la propuesta.

### Merge

> *"Aceptar la propuesta e incorporar la rama al proyecto principal."*

Cuando la propuesta está aprobada y las verificaciones pasaron, hacés "merge": las dos historias se unen y master ahora contiene tu cambio.

## 4. Cómo te ayuda el asistente en cada paso

Vos no tenés que memorizar los comandos. Le decís al asistente qué querés hacer y él los conoce:

| Lo que querés | Lo que le pedís al asistente |
|---|---|
| Saber qué cambió | *"Mostrame `git status` y resumime qué archivos toqué."* |
| Ver el detalle de un cambio | *"Hacé `git diff` y explicame qué cambió en cada archivo."* |
| Crear una rama nueva | *"Creá una rama llamada `agregar-rosario`."* |
| Guardar cambios | *"Agregá los archivos modificados, hacé el commit con un mensaje claro siguiendo el estilo del repo."* |
| Subir | *"Hacé push de la rama actual."* |
| Abrir la propuesta | *"Abrí el PR. Título y cuerpo en castellano, mencionando qué cambia y cómo probarlo."* |
| Ver últimos cambios del proyecto | *"Resumime los últimos 20 commits del repo."* |

## 5. La automatización de este proyecto

El archivo [`.github/workflows/update-data.yml`](https://github.com/mpodeley/estado-red-gas/blob/master/.github/workflows/update-data.yml) define **qué pasa cada noche** y **qué pasa cada vez que alguien mergea un cambio**.

### Cuándo se dispara

```yaml
on:
  schedule:
    - cron: '0 9 * * *'  # todos los días a las 6 AM Argentina (9 UTC)
  workflow_dispatch:      # también se puede disparar a mano
```

- **`schedule`** = "automáticamente, en horario". El formato `0 9 * * *` significa "todos los días a las 9 UTC".
- **`workflow_dispatch`** = "manualmente, desde la pestaña Actions de GitHub o con `gh workflow run`".

### Qué hace, paso a paso

1. Levanta una máquina virtual en la nube de GitHub.
2. Instala Python y Node.
3. Instala las librerías de Python (`pip install -r requirements.txt`).
4. Instala las librerías de la web (`npm ci`).
5. **Corre la pipeline de datos** (`python scripts/build_data.py`) → genera los JSON nuevos.
6. **Verifica tipos** (`npx tsc --noEmit`) → si algo está mal escrito, se cae acá.
7. **Arma la web** (`npm run build`) → genera `dist/`.
8. **Arma el curso** (`npm run build` en `curso/`) → genera `curso/dist/`.
9. **Copia el curso adentro de `dist/curso/`**.
10. **Guarda los datos nuevos** con un commit automático (autor: `github-actions[bot]`).
11. **Publica todo `dist/`** en GitHub Pages.

Cada paso tiene su propio recuadro en la pestaña "Actions" de GitHub. Si algo falla, el icono se pone rojo y podés clickear para ver el log.

## 6. Cuando algo falla

El primer reflejo: **mirá el log del Action**.

1. Andá a [github.com/mpodeley/estado-red-gas/actions](https://github.com/mpodeley/estado-red-gas/actions).
2. Clickeá el run que falló (el rojo).
3. Clickeá el job que falló.
4. Expandí el step que está marcado en rojo.

Cuando lo tengas, **copiá el log entero y pasáselo al asistente**:

> *"El Action 'Update data and deploy' falló en el step 'Type check'. Acá está el log. ¿Qué pasó y cómo lo arreglamos?"*

(Y pegás el texto.)

Si hace falta reproducir el problema en tu máquina:

```bash
# correr la pipeline localmente
python scripts/build_data.py

# verificar tipos
npx tsc --noEmit

# armar la web
npm run build
```

## 7. Cosas que **no** hay que hacer

| Acción | Por qué evitarla |
|---|---|
| `git push --force` a `master` | Reescribe la historia oficial del proyecto. Puede borrar trabajo de otra persona. Solo se usa en casos muy puntuales y con autorización. |
| `git reset --hard` sin pensar | Tira a la basura los cambios locales **sin** posibilidad de recuperar. Antes, hacé `git stash` o un commit. |
| `--no-verify` en un commit | Saltea las verificaciones automáticas. Las verificaciones existen por algo: respetalas. |
| Borrar `public/data/` "para limpiar" | Esos archivos son la data publicada. No son basura. |
| Mergear una propuesta sin leer el diff | Mismo principio que con el asistente: leé los cambios antes de aprobar. |

## 8. Antes de seguir

- [ ] Entendés la diferencia entre tu **disco local**, la **rama**, el **remote** (`origin`) en GitHub, y la **rama principal** (`master`).
- [ ] Sabés qué hace `git pull`, `git commit`, `git push` y `gh pr create` — al menos a nivel de "qué pasa cuando lo corro".
- [ ] Sabés leer la pestaña "Actions" de GitHub.
- [ ] Tenés `gh` (la CLI de GitHub) instalada y autenticada (`gh auth login`).

Cuando estés listo, vamos al **[Módulo 9 — Tu primer aporte de punta a punta](/estado-red-gas/curso/09-primer-aporte/)** para hacer todo esto en la práctica.
