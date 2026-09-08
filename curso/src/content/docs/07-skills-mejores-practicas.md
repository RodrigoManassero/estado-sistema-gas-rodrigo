---
title: "7. Skills y mejores prácticas con coding agents"
description: "Atajos, modo plan, asistentes especializados, memoria persistente. Buenas prácticas y los errores típicos de quien recién arranca."
sidebar:
  order: 7
---

> **Lo que te vas a llevar.** Después de leer esto vas a saber qué *puede* hacer un asistente de código, cómo pedírselo bien, y cuáles son las trampas típicas en las que cae quien recién arranca.

---

## 1. ¿Qué es un "coding agent"?

Un <abbr title="del inglés 'coding agent', literalmente 'agente de código' — un asistente conversacional que entiende y modifica el código de un proyecto, con tu aprobación">**coding agent**</abbr> (le decimos también *asistente de código*) es como un copiloto que:

- Vive en la <abbr title="la ventana negra donde se escriben comandos a la computadora. En Windows, PowerShell o Windows Terminal. Es texto puro, sin gráficos">terminal</abbr> de tu compu o adentro de tu <abbr title="programa donde se escribe código, con resaltado de colores y atajos. Los más conocidos: VS Code, Cursor">editor de código</abbr>.
- Puede **leer** los archivos del proyecto en el que estás trabajando.
- Puede **modificar** archivos (siempre con tu OK).
- Puede **correr <abbr title="instrucciones en texto que se le dan a la compu desde la terminal, tipo 'abrir tal archivo', 'mostrar tal cosa', 'correr tal programa'">comandos</abbr>** (con tu OK).
- Puede **buscar en internet**.
- Puede **abrir <abbr title="del inglés 'pull request' — pedido para incorporar tus cambios al proyecto, con revisión por el medio">propuestas de cambio</abbr>** en GitHub.

Los dos más conocidos son **Claude Code** (de Anthropic) y **Codex** (de OpenAI). En este curso usamos los ejemplos pensando en Claude Code, pero las ideas valen para ambos.

> **Importante: no es magia, es una herramienta.** Si le pedís cosas vagas, te da cosas vagas. Si le das contexto, te devuelve cambios sólidos. La calidad de lo que sale depende muchísimo de cómo lo pedís.

## 2. Capacidades del asistente, en orden de utilidad

### 2.1. Slash commands (atajos)

Son comandos cortos que empiezan con `/` y te ahorran escribir lo mismo cada vez. Los más útiles para empezar:

- **`/help`** — *"¿qué cosas podés hacer?"*. Te muestra una lista de comandos disponibles.
- **`/clear`** — borra la conversación actual y arranca de cero. Útil cuando empezás una tarea nueva y no querés que el asistente arrastre contexto viejo.
- **`/plan`** — entra en **modo plan**: el asistente investiga, te propone un plan **por escrito**, y **no toca ningún archivo** hasta que vos aprobás. Ideal para cambios que tocan varias partes o cuando vas a hacer algo importante.

> Este curso mismo se planeó con `/plan` antes de escribir una sola línea de código. El plan está en un archivo aparte que el asistente armó, y lo aprobaste antes de que arrancara.

### 2.2. Modo plan vs modo ejecución

Hay dos modos de trabajar con el asistente:

| Modo | Cuándo conviene |
|---|---|
| **Ejecución directa** | Cambios chicos y reversibles: arreglar una palabra, cambiar un color, agregar un comentario. |
| **Modo plan** (`/plan`) | Cambios estructurales: agregar una fuente de datos nueva, refactorizar, cosas que tocan varios archivos en distintas capas. |

Cuando dudes, andá al modo plan. Te cuesta 30 segundos extra y te ahorra deshacer un cambio mal pensado.

### 2.3. Sub-agentes (asistentes especializados)

El asistente principal puede *delegar* tareas acotadas a otros asistentes con propósitos específicos. No los invocás vos directamente — el asistente los usa cuando le conviene. Pero conviene saber que existen:

- **Explore** — sale a leer muchos archivos rápido (por ejemplo: *"buscá en todo el repositorio dónde se usa esta función"*). Lo que devuelve no contamina tu conversación principal.
- **Plan** — para diseñar cambios complejos.
- **general-purpose** — para tareas que no calzan en una categoría.

Cuando le pidas algo grande, no tengas miedo de sugerir: *"explorá el repo primero antes de decidir cómo hacerlo"*.

### 2.4. Hooks (avanzado — podés saltearlo por ahora)

Los <abbr title="del inglés 'hook' — anzuelo, gancho. Acá: una automatización que se engancha a un evento (antes de guardar, después de hacer un commit, etc.)">**hooks**</abbr> son automatizaciones que se disparan en ciertos eventos del asistente — por ejemplo, "antes de cada edición, correr el verificador de tipos". Sirven para automatizar verificaciones. No te preocupes por esto al principio; están configurados en un archivo aparte.

## 3. Memoria persistente: lo que el asistente recuerda

El asistente tiene **tres lugares** donde guarda contexto que sobrevive entre conversaciones. Saber qué hay en cada uno te ahorra repetirle cosas.

### 3.1. `CLAUDE.md` (en la raíz del repo)

Es el **manual de instrucciones del repositorio**, pensado específicamente para el asistente. Cualquier conversación que arranque en esa carpeta lo lee primero. Contiene: qué hace el proyecto, comandos clave, cómo está organizado, qué cosas son particulares ("gotchas" — trampas conocidas).

🔗 [`CLAUDE.md` de este proyecto](https://github.com/mpodeley/estado-red-gas/blob/master/CLAUDE.md) — leelo *vos* también, una vez. Te ubica más rápido que cualquier explicación que te pueda dar yo acá.

### 3.2. `.claude/memory/` (notas que sobreviven entre charlas)

Es una carpeta donde el asistente guarda **observaciones** que conviene que recuerde entre sesiones. Hay cuatro tipos:

- **user** — cosas sobre vos (tu rol, qué sabés, qué preferís).
- **feedback** — correcciones tuyas que el asistente tiene que aplicar siempre.
- **project** — contexto del proyecto que no está escrito en el código.
- **reference** — punteros a otros sistemas (links a paneles, dashboards externos, etc.).

🔗 Mirá el [`MEMORY.md`](https://github.com/mpodeley/estado-red-gas/blob/master/.claude/memory/MEMORY.md) para ver ejemplos reales. Algunos que están vigentes en este proyecto:

- [`feedback_simplicity.md`](https://github.com/mpodeley/estado-red-gas/blob/master/.claude/memory/feedback_simplicity.md) — *"mantener la app simple, sin abstracciones especulativas"*.
- [`feedback_macro_data.md`](https://github.com/mpodeley/estado-red-gas/blob/master/.claude/memory/feedback_macro_data.md) — *"priorizar datos macro y automatización total"*.
- [`project_context.md`](https://github.com/mpodeley/estado-red-gas/blob/master/.claude/memory/project_context.md) — *"audiencia no técnica, mantenedor único"*.

### 3.3. `.claude/plans/` (planes en curso)

Cuando usás `/plan`, el asistente escribe el plan como un archivo en esta carpeta. Sobrevive entre sesiones, así que podés *pausar* un plan grande y retomarlo otro día sin perder el hilo.

## 4. Buenas prácticas, ordenadas por impacto

Las que más diferencia hacen entre una experiencia floja y una buena:

### 4.1. Dale contexto explícito

| ❌ Vago | ✅ Específico |
|---|---|
| "Agregale humedad al gráfico." | "Quiero agregar humedad al gráfico de temperatura en `src/components/TemperatureChart.tsx`. El dato vendría de Open-Meteo (ya lo estamos consultando en `scripts/fetch_weather.py`) — habría que ampliarlo para incluir humedad. ¿Empezamos por el script?" |

Fijate la diferencia: archivo concreto, capa concreta, y un siguiente paso propuesto.

### 4.2. Empezá chico

**Una sola cosa por conversación.** Si mezclás "agregar humedad, cambiar colores y arreglar un bug del fin de semana", el cambio resultante es imposible de revisar — y si algo se rompe, no sabés cuál de las tres lo hizo. Cambios chicos y autocontenidos son siempre mejores.

### 4.3. Leé el cambio antes de aceptar

El asistente puede equivocarse en silencio: renombrar mal una variable, borrar una línea que importaba, "limpiar" un comentario que era crucial. **Antes de aprobar una edición, leela.** Si no la entendés, pedile que te la explique línea por línea.

### 4.4. Pedí explicaciones, no solo código

> *"Antes de escribir, contame por qué elegirías esa función y no otra."*

Esto te sirve por tres razones:
- Te enseña.
- Obliga al asistente a pensar primero.
- Te deja detectar planes malos antes de que toque un archivo.

### 4.5. Si algo se rompe, pegale el error literal

Nunca le digas *"no anda"*. Copiá y pegá el mensaje de error completo, con toda la traza. El asistente lee texto, no telepatía.

### 4.6. Cuando dudes, preguntá riesgos

Antes de aprobar un cambio grande:

> *"¿Qué riesgos tiene este cambio? ¿Qué tendría que revisar específicamente antes de mergearlo?"*

El asistente normalmente tiene buena idea de qué puede salir mal — pero solo si le pedís que mire.

### 4.7. Usá el modo plan para cambios estructurales

Cualquier cosa que toque más de un archivo, o más de una capa → `/plan`. Te ahorra horas.

### 4.8. Cuidá las acciones irreversibles

Si te propone <abbr title="comando que reescribe la historia del proyecto en GitHub a la fuerza. Puede borrar trabajo de otra persona. Solo se usa en casos muy puntuales con autorización explícita">`git push --force`</abbr>, <abbr title="comando que tira a la basura los cambios locales sin posibilidad de recuperar. Equivalente a 'cerrá sin guardar' pero más fuerte">`git reset --hard`</abbr>, o cualquier cosa que no puedas deshacer — **pará**. Pedile alternativas. Solo aprobá si entendés exactamente qué hace.

## 5. Anti-patrones (errores típicos de quien recién arranca)

- **Pedir cambios vagos sin abrir el archivo primero.** Si vos no podés señalar el archivo, el asistente tampoco.
- **Aprobar el primer cambio sin leerlo.** Eventualmente vas a pisar trabajo bueno con código malo.
- **Ignorar las advertencias de la <abbr title="cadena de pasos automáticos: descargar datos → procesarlos → revisar que no se hayan roto cosas → publicar la web. Cuando algo se queja en uno de esos pasos, hay que prestarle atención">pipeline</abbr>.** Las advertencias son el código gritándote que algo está raro. No las apagues — entendelas.
- **Encadenar 5 features en una sola conversación.** Imposible de revisar, imposible de revertir si una rompe las otras.
- **Pedirle "magia" en código que vos no entendés.** El asistente puede generar código sofisticado que después vos no podés mantener. Si no entendés lo que produjo, **no lo incorpores al proyecto**. Pedile que te lo simplifique o que te lo explique antes.
- **Pelearte con el asistente.** Si te dice tres veces que algo no se puede como lo estás pidiendo, escuchalo y ajustá el pedido en vez de insistir.

## 6. Cómo este repo te facilita el trabajo

Aprovechá lo que ya está escrito:

1. **Antes de cualquier sesión** — leé el `CLAUDE.md` una vez (15 minutos). El asistente lo va a leer; vos también deberías.
2. **Si vas a tocar arquitectura** — revisá el plan estratégico en `C:\Users\mpodeley\.claude\plans\toasty-gathering-sparkle.md` (ese vive en tu disco, no en GitHub).
3. **Si vas a agregar una fuente de datos** — leé `feedback_macro_data.md` en `.claude/memory/`. Te ahorra una vuelta.
4. **Si te tienta hacer una abstracción "para el futuro"** — leé `feedback_simplicity.md`. La regla del repo es: extraé cuando haya 3 o más repeticiones, no antes.
5. **Si querés contexto histórico** — `git log --oneline | head -50` te muestra los últimos 50 cambios. O pedile al asistente: *"resumime los últimos 20 cambios del proyecto"*.

## 7. Tu primera sesión, paso a paso

Para que tengas una idea concreta — así se ve una primera sesión típica con Claude Code:

1. Instalás Claude Code (las instrucciones están en el [Módulo 6](/estado-red-gas/curso/06-coding-agents/)).
2. Abrís una terminal **en la carpeta del repo**: `cd C:\Users\mpodeley\Documents\projects\estado_del_sistema`.
3. Tipeás `claude` y enter.
4. Tu primer mensaje, copiado tal cual:

   ```
   Hola. Soy analista comercial, primera vez que toco este repo.
   Antes de hacer nada, por favor:
   1. Leé el CLAUDE.md y los archivos en .claude/memory/.
   2. Resumime en 5 bullets qué hace este proyecto y cuáles son las
      restricciones que tengo que respetar.
   3. Después contame cuál sería un buen primer cambio chico para arrancar.
   ```

5. Leés lo que te contesta. Hacés preguntas. **No le pedís que toque nada todavía.**
6. Cuando te sentís cómodo, le pedís un cambio chico (por ejemplo: cambiar una palabra en la Guía del tablero).
7. Le pedís que arme la propuesta de cambio para GitHub (eso lo explica el [Módulo 8](/estado-red-gas/curso/08-git-github-deploy/)).

## 8. Antes de seguir

- Sabés diferenciar **modo plan** de **modo ejecución**, y cuándo conviene cada uno.
- Sabés dónde mira el asistente para tener contexto: `CLAUDE.md`, `.claude/memory/`, `.claude/plans/`.
- Identificás al menos **3 buenas prácticas** que vas a aplicar desde la primera sesión.
- Tenés clara una regla de oro: **leer el cambio antes de aceptar, siempre**.

Cuando estés listo, seguí con el **[Módulo 8 — Git, GitHub y deploy](/estado-red-gas/curso/08-git-github-deploy/)** o saltá directo al **[Módulo 9 — Tu primer aporte](/estado-red-gas/curso/09-primer-aporte/)** cuando esté disponible.
