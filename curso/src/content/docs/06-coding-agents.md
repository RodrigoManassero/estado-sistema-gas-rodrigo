---
title: "6. Coding agents: tu nuevo asistente"
description: "Qué es (y qué no es) un asistente de código. Cómo instalar Claude Code en Windows. Tu primera conversación, paso a paso."
sidebar:
  order: 6
---

> **Lo que te vas a llevar.** Después de este módulo vas a tener Claude Code instalado, vas a saber qué esperar de él (y qué no), y vas a tener una primera conversación productiva sin que toque nada importante.

---

## 1. ¿Qué es un asistente de código?

Es un programa que vive en la <abbr title="la ventana negra donde se escriben comandos a la computadora. En Windows: PowerShell o Windows Terminal">terminal</abbr> de tu compu y entiende lenguaje natural. Le hablás en castellano, él lee los archivos del proyecto, te propone cambios, y los aplica solo después de tu OK.

**Qué hace bien:**

- Leer archivos del proyecto y resumirte qué hacen.
- Buscar dónde se usa una <abbr title="bloque de instrucciones reusable, similar a una función de Excel">función</abbr> o una variable en todo el repo.
- Proponer cambios concretos a archivos.
- Explicar código que vos no entendés.
- Correr comandos (con tu aprobación): tests, instalar dependencias, abrir un PR.
- Buscar en internet documentación de una librería.

**Qué hace mal o no debería hacer:**

- Tomar decisiones de negocio (qué fuente de datos priorizar, qué métrica usar). Eso es tuyo.
- Saber cosas que no están escritas en algún lado. Si no leyó el `CLAUDE.md` ni hay memorias guardadas, no tiene magia.
- "Adivinar" qué querés. Si no le contás, no sabe.
- Recordar cosas entre conversaciones distintas, salvo que estén guardadas en `.claude/memory/` o en `CLAUDE.md`.

> **Una manera útil de pensarlo:** es un practicante muy rápido, con buena cultura general de código, que recién llegó a la empresa hoy. Sabe escribir y leer, pero no sabe el contexto del proyecto hasta que vos se lo das.

## 2. Las opciones disponibles

| Herramienta | De quién | Cómo se usa principalmente |
|---|---|---|
| **Claude Code** | Anthropic | Terminal (`claude` desde la consola). Es la que usamos en este curso. |
| **Codex** | OpenAI | Terminal y extensión de editor. |
| **Cursor** | Cursor | Editor de código completo (como VS Code pero con IA adentro). |

No te peleés con la decisión: las tres son buenas. Empezá con Claude Code porque es la que el `CLAUDE.md` del proyecto y las memorias ya tienen optimizadas — vas a tener menos fricción.

## 3. Instalación de Claude Code (Windows)

### Lo que necesitás antes

1. **Una terminal**. Windows ya viene con **PowerShell** — buscalo en el menú Inicio escribiendo "PowerShell". También sirve **Windows Terminal** (más moderno).
2. **Node.js**. Es un programa que permite correr aplicaciones de JavaScript en tu compu. Si no lo tenés, instalalo desde [nodejs.org](https://nodejs.org/) (versión "LTS" que recomienda la página).
3. **Una cuenta de Anthropic**. Andá a [console.anthropic.com](https://console.anthropic.com), creá cuenta. Hay un plan gratis para arrancar; los planes pagos tienen mejores límites.

### Verificar que Node está instalado

Abrí PowerShell y tipeá:

```powershell
node --version
```

Tiene que mostrar algo como `v20.18.0` o superior. Si te dice "no se reconoce el comando", instalalo desde el link de arriba y volvé a abrir PowerShell.

### Instalar Claude Code

En PowerShell:

```powershell
npm install -g @anthropic-ai/claude-code
```

(El `-g` significa "global" — lo instala una sola vez para toda la máquina, no por proyecto.)

Tarda 1–2 minutos. Cuando termina, verificá con:

```powershell
claude --version
```

### Primer arranque

1. Abrí PowerShell y andá a la carpeta del proyecto:
   ```powershell
   cd C:\Users\mpodeley\Documents\projects\estado_del_sistema
   ```
2. Tipeá `claude` y enter.
3. La primera vez te pide que te autentiques (te abre un navegador para que entres con tu cuenta de Anthropic). Hacé eso una sola vez.
4. Cuando ves un prompt como `>` esperando que escribas, ya estás adentro.

> Si te trabás con la instalación, copiá el mensaje de error completo y pasáselo a ChatGPT o a Claude desde [claude.ai](https://claude.ai) (sí, usar uno para arreglar al otro es totalmente válido). Las guías oficiales más actualizadas viven en [docs.claude.com/en/docs/claude-code](https://docs.claude.com/en/docs/claude-code).

## 4. Tu primera conversación

La idea de esta primera vez es que el asistente **se familiarice con el proyecto** y vos **te familiarices con cómo se conversa con él**. No le pidas que cambie nada todavía.

Copiá y pegá este mensaje, tal cual, en la terminal donde está corriendo `claude`:

```
Hola. Soy analista comercial, primera vez que toco este repositorio.
Antes de hacer nada, por favor:

1. Leé el CLAUDE.md de la raíz del repo.
2. Leé los archivos en .claude/memory/.
3. Resumime en 5 bullets:
   - Qué hace este proyecto.
   - Quién lo usa.
   - Cuáles son las restricciones de diseño que tengo que respetar.
   - Qué hay en cola pendiente.
4. Recomendame un primer cambio chico, reversible, para que lo intente
   yo en una segunda conversación.

No edites ningún archivo. Solo leé y respondé.
```

Va a tardar un poco la primera vez (está leyendo varios archivos). Cuando responda, leelo entero, sin apurarte.

### Qué hacer después de su respuesta

- Si algo no entendiste, **preguntale**: *"contame más sobre el punto 3 — ¿qué quiere decir que es estático?"*.
- Si algo te parece raro o no es el caso, **corregilo**: *"el plan estratégico no está donde decís, fijate de nuevo"*. Le hace bien la corrección.
- Si querés terminar la conversación: tipeá `/clear` para limpiar contexto, o cerrá la terminal.

## 5. Comandos básicos para tener a mano

Mientras estás en una conversación con `claude`:

| Comando | Para qué |
|---|---|
| `/help` | Mostrar todos los comandos disponibles. |
| `/clear` | Limpiar la conversación actual y arrancar de cero. |
| `/plan` | Entrar en **modo plan** — el asistente arma un plan por escrito y no toca nada hasta que lo aprobás. (Ver [Módulo 7](/estado-red-gas/curso/07-skills-mejores-practicas/).) |
| `/exit` o `Ctrl+C` | Salir. |

## 6. Costo y suscripción

Cada mensaje que mandás "consume" parte de tu plan. Para uso ocasional (unas conversaciones por semana), el plan gratuito o el más barato alcanza. Para uso intensivo, hay planes superiores.

**Reglas para cuidar la suscripción:**

- **Usá `/clear` cuando arranques una tarea nueva.** Sin limpiar, el asistente arrastra todo el contexto anterior — y eso cuesta tokens en cada mensaje.
- **No le pidas que lea archivos enormes "por las dudas".** Si vas a tocar `OperacionPage.tsx`, decile que lea ese; no le pidas "leé todo el repo".
- **Usá `/plan`** para tareas grandes. El modo plan investiga una vez, te muestra el plan, y después la ejecución es más eficiente.

> Los detalles de precios y límites están en [docs.claude.com/en/docs/claude-code](https://docs.claude.com/en/docs/claude-code).

## 7. Cosas que **no** esperes en la primera conversación

- **No esperes que adivine.** Si decís "agregale humedad", va a preguntarte dónde. Bien.
- **No te asustes si te pide confirmación** para correr un comando o editar un archivo. Eso está bien: querés esa fricción al principio.
- **No esperes que recuerde la conversación anterior.** Sí recuerda lo que está en `CLAUDE.md` y `.claude/memory/` — eso sobrevive entre charlas.
- **No esperes que sepa de tu negocio.** Las restricciones operativas (qué es importante para Pluspetrol, qué fuentes son confiables, qué decisiones se delegan) las tenés que ir guardando en memorias para que las recuerde.

## 8. Antes de seguir

- [ ] Tenés Claude Code instalado y autenticado.
- [ ] Tuviste una primera conversación donde el asistente te resumió el proyecto.
- [ ] Le hiciste al menos una pregunta de seguimiento.
- [ ] Sabés cómo salir (`/exit`) y cómo limpiar contexto (`/clear`).

Cuando los cuatro estén tildados, andá al **[Módulo 7 — Skills y mejores prácticas](/estado-red-gas/curso/07-skills-mejores-practicas/)** para profundizar el uso, o saltá al **[Módulo 8 — Git, GitHub y deploy](/estado-red-gas/curso/08-git-github-deploy/)** si querés ya armar tu primer aporte.
