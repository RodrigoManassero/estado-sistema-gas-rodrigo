---
title: "5. Lenguajes y librerías"
description: "Python, TypeScript, React, Vite — para qué sirve cada uno y por qué se eligió ese y no otro."
sidebar:
  order: 5
  badge:
    text: Borrador
    variant: caution
---

> **Próximamente** — este módulo todavía está en borrador. Te dejamos los objetivos y el índice para que veas qué va a haber acá.

## Qué te vas a llevar

- Saber para qué sirve cada **lenguaje** y cada **librería** que usa el proyecto.
- Tener una analogía con Excel o con algo conocido para cada una, así cuando aparezca el nombre en una conversación con el asistente, ya tenés una intuición de qué es.

## Lo que va a haber acá

### Python (la pipeline)

| Librería | Para qué sirve | Analogía |
|---|---|---|
| **`requests`** | Hacer pedidos a un servidor por internet (descargar archivos, consultar APIs). | `=SERVICIOWEB(...)` de Excel, pero mucho más potente. |
| **`beautifulsoup4`** | Leer páginas HTML y sacarles información (links, tablas, textos). | Como copiar una tabla de una web a Excel, pero programable. |
| **`pdfplumber`** | Extraer texto y tablas de archivos PDF. | Abrir un PDF y copiar la tabla a Excel, pero hecho por un script. |
| **`openpyxl`** / **`xlrd`** | Leer y escribir archivos Excel. | Tener Excel adentro de un programa. |
| **`msoffcrypto-tool`** | Desbloquear archivos de Office "protegidos" con contraseña. | El típico "Quitar contraseña al abrir" en Office. |

Las dependencias están listadas en [`requirements.txt`](https://github.com/mpodeley/estado-red-gas/blob/master/requirements.txt) y se ven usadas en los archivos de [`scripts/`](https://github.com/mpodeley/estado-red-gas/tree/master/scripts).

### TypeScript (la web)

| Tecnología | Qué es | Por qué se usa |
|---|---|---|
| **TypeScript** vs JavaScript | TypeScript es JavaScript con "tipos": le decís qué clase de dato espera cada función (número, texto, fecha) y el compilador te avisa **antes de correr** si te equivocaste. | Para una aplicación de datos donde una columna mal nombrada rompe un gráfico, vale oro. |
| **React** | Una librería para armar interfaces como un árbol de componentes reusables. | Cada gráfico, cada panel, cada KPI es un componente. Se combinan como bloques. |
| **Recharts** | Librería de gráficos basada en React. | Buena para series temporales, simple, sin licencia comercial. |
| **Vite** | La herramienta que arma la web final y la sirve durante el desarrollo. | El "compilador" del lado JavaScript. |

Las dependencias de la web están en [`package.json`](https://github.com/mpodeley/estado-red-gas/blob/master/package.json) y la configuración en [`tsconfig.json`](https://github.com/mpodeley/estado-red-gas/blob/master/tsconfig.json) y [`vite.config.ts`](https://github.com/mpodeley/estado-red-gas/blob/master/vite.config.ts).

### ¿Por qué dos lenguajes y no uno solo?

Porque cada uno tiene su fuerte:

- **Python** tiene el mejor "ecosistema" — la mejor colección de librerías ya hechas — para **traer y procesar datos**: PDFs, Excels, APIs, modelos estadísticos.
- **TypeScript con React** tiene el mejor ecosistema para **mostrar datos en el navegador**: gráficos interactivos, componentes reusables, manejo de estado.

Y el acuerdo (los archivos JSON, ver [Módulo 3](/estado-red-gas/curso/03-diseno-paradigmas/)) hace que la convivencia entre los dos no sea un problema.
