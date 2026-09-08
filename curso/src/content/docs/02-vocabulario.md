---
title: "2. Vocabulario"
description: "Glosario para tener a mano. Pensado para no programadores. Volvé a esta página cuando aparezca un término que no te suena."
sidebar:
  order: 2
---

> Esta página es una **referencia rápida**. No hace falta que la leas de corrido — es para volver cuando aparezca una palabra rara. Está agrupada por temas, no en orden alfabético, porque así los términos relacionados aparecen juntos.

---

## Sobre el proyecto

| Término | Qué quiere decir | Analogía |
|---|---|---|
| **Repositorio** (o **repo**) | La carpeta de un proyecto, con todo su historial de cambios guardado. | Una carpeta de OneDrive donde todos los archivos tienen versiones anteriores guardadas. |
| **Git** | La herramienta que lleva ese historial. No tiene interfaz gráfica por defecto; se opera por comandos o desde un editor. | Como el "Control de cambios" de Word, pero para cualquier archivo y mucho más potente. |
| **GitHub** | Un sitio web (de Microsoft) que guarda repos en internet y agrega cosas sociales encima (propuestas, discusiones, automatizaciones). | OneDrive + un foro de comentarios + automatizaciones. |
| **Working tree** o **directorio de trabajo** | Los archivos del proyecto tal como están en tu disco en este momento, antes de guardar nada. | Tu archivo de Excel abierto, con cambios sin guardar. |

## Sobre cambiar el código

| Término | Qué quiere decir | Analogía |
|---|---|---|
| **Commit** | Un guardado, con etiqueta. Sirve para marcar un momento del proyecto al que podés volver. | "Guardar como" con un nombre explícito en cada paso. |
| **Branch** (rama) | Una copia paralela del proyecto donde podés experimentar sin tocar la versión principal. | Hacer "Guardar como copia" para probar algo, sin pisar el original. |
| **Merge** | Mezclar dos ramas en una sola. | Consolidar cambios de dos archivos paralelos en uno solo. |
| **Pull Request** (o **PR**, o **propuesta de cambio**) | Pedido para incorporar tu rama al proyecto principal. Antes de aceptarlo, otra persona (o vos mismo) lo revisa. | Mandar un Word con cambios sugeridos y esperar la aprobación. |
| **Diff** | La diferencia entre dos versiones de un archivo: qué se agregó, qué se borró, qué se cambió. | El panel de comparación de versiones de Word. |
| **Conflict** (conflicto) | Cuando dos ramas tocaron las mismas líneas y git no sabe cuál es la buena. Hay que resolverlo a mano. | Cuando dos personas editan la misma celda de un Excel compartido al mismo tiempo. |

## Sobre el código mismo

| Término | Qué quiere decir | Analogía |
|---|---|---|
| **Lenguaje de programación** | El "idioma" para darle instrucciones a la computadora. Acá usamos Python (para la pipeline) y TypeScript (para la web). | Lenguajes humanos: cada uno tiene su gramática. |
| **Archivo de código** | Un archivo de texto plano con instrucciones, terminado en una extensión específica (`.py`, `.ts`, `.tsx`). | Un archivo de Excel, pero abriéndolo con el Bloc de notas: ves el texto sin formato. |
| **Función** | Un bloque de instrucciones reutilizable, con un nombre. Le pasás algunos valores ("argumentos") y te devuelve un resultado. | Una función de Excel como `=PROMEDIO(A1:A10)`: nombre + argumentos + resultado. |
| **Variable** | Un nombre que apunta a un valor. | Una celda con un nombre amistoso ("ventas_marzo" en vez de "B7"). |
| **Librería** (o **dependencia**) | Código ya hecho por otra persona que vos importás en tu proyecto para no reinventar la rueda. | Como las "macros de un complemento" en Excel: alguien ya armó las herramientas, vos las usás. |

## Sobre la pipeline de datos

| Término | Qué quiere decir | Analogía |
|---|---|---|
| **Pipeline** | Una cadena de pasos que se ejecutan en orden, donde la salida de uno alimenta al siguiente. | Una línea de montaje en una fábrica. |
| **Fetcher** | Un script que **baja** datos de algún lado (un PDF, una API, un Excel remoto). | El paso de "abrir el navegador y descargar el archivo de ENARGAS". |
| **Parser** | Un script que **interpreta** un archivo crudo (PDF, Excel) y le saca los datos en formato estructurado. | El paso de "abrir el PDF y copiar la tabla a Excel". |
| **API** | Una forma estructurada de que un programa le pida datos a otro a través de internet. | Como llamar por teléfono a alguien que solo responde preguntas específicas en un orden. |
| **JSON** | Un formato de texto para guardar datos estructurados (con jerarquías, listas, valores). | Una hoja de Excel guardada como texto, pero permitiendo anidar (filas adentro de celdas). |
| **CSV** | Otro formato de datos, más simple: filas separadas por enter, columnas separadas por coma. | Lo más parecido a un Excel sin formato. |

## Sobre la web

| Término | Qué quiere decir | Analogía |
|---|---|---|
| **Frontend** | La parte del programa que ve y usa la persona, en el navegador. | El "frente" del mostrador. |
| **Backend** | La parte del programa que corre en un servidor, sin que la persona la vea directamente. (Este proyecto **no** tiene backend.) | La cocina del restaurante. |
| **Static site** (sitio estático) | Sitio donde todo está armado por adelantado y se sirve como archivos ya hechos. | Una revista impresa: la armás una vez y la distribuís. |
| **Sitio dinámico** | Sitio donde cada vez que entrás, un servidor te arma la página al toque. | Un cajero automático que te calcula el saldo en vivo. |
| **Componente** | Una pieza reusable de interfaz (un gráfico, un botón, una tabla). Se combinan como bloques de Lego. | Las plantillas reutilizables de PowerPoint. |
| **Build** | El proceso de tomar todo el código fuente y dejarlo listo para servir como página web. | "Exportar a PDF" un documento de Word: lo conviertes en algo distribuible. |
| **Deploy** (despliegue) | Subir el resultado del build a internet, donde la gente lo puede ver. | Mandar el PDF al impresor para que la revista llegue a los kioscos. |

## Sobre los asistentes de código

| Término | Qué quiere decir | Analogía |
|---|---|---|
| **Coding agent** | Asistente de programación que entiende y modifica código, con tu aprobación. | Un secretario que escribe lo que vos le dictás, pero técnicamente competente para el dictado. |
| **Slash command** | Atajo que arranca con `/` (ej.: `/help`, `/clear`, `/plan`) y dispara una acción rápida. | Los atajos `Ctrl+B`, `Ctrl+C`. |
| **Modo plan** | El asistente arma un plan por escrito **antes** de tocar nada. Vos lo aprobás y recién ahí ejecuta. | Pedir un presupuesto antes de empezar la obra. |
| **Sub-agente** | Un asistente especializado que el principal delega para tareas acotadas (explorar el repo, planificar). | Un consultor que pide ayuda a un especialista. |
| **Hook** | Una automatización que se dispara en un evento específico (antes de guardar, después de un commit). | Una regla de "movimiento automático" de Outlook. |

## Sobre la automatización del proyecto

| Término | Qué quiere decir |
|---|---|
| **GitHub Action** | Una automatización configurada en GitHub: una receta que se dispara en horario o por un evento (push, PR), corre en una máquina de Microsoft en la nube, hace su trabajo y se apaga. |
| **Cron** | El formato para programar tareas recurrentes (todos los días a tal hora, todos los lunes, etc.). El nombre viene del Unix de los 70. Cron `0 9 * * *` significa "todos los días a las 9 UTC". |
| **GitHub Pages** | El servicio gratuito de GitHub para alojar sitios estáticos. El tablero de este proyecto se publica ahí. |

---

¿Falta algún término? Pedile al asistente que lo agregue a esta tabla — y por mientras, podés saltar al [Módulo 3 — Diseño y paradigmas](/estado-red-gas/curso/03-diseno-paradigmas/), que ya está escrito a fondo y aplica varios de estos conceptos.
