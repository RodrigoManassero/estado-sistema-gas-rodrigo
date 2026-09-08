import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// Production site lives at https://mpodeley.github.io/estado-red-gas/curso/
// In dev, base is honored too — open http://localhost:4321/estado-red-gas/curso/
export default defineConfig({
  site: 'https://mpodeley.github.io',
  base: '/estado-red-gas/curso',
  integrations: [
    starlight({
      title: 'Curso · Estado del Sistema',
      description:
        'Curso introductorio a la programación, diseño de aplicaciones y uso de coding agents, pensado para los usuarios del tablero.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'Español', lang: 'es' },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/mpodeley/estado-red-gas',
        },
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: '← Volver al tablero',
          link: 'https://mpodeley.github.io/estado-red-gas/',
          attrs: { target: '_self' },
        },
        { label: '0. Bienvenida', link: '/' },
        { label: '1. De Excel a una aplicación', link: '/01-de-excel-a-app/' },
        {
          label: '2. Vocabulario',
          link: '/02-vocabulario/',
          badge: { text: 'Completo', variant: 'success' },
        },
        {
          label: '3. Diseño y paradigmas',
          link: '/03-diseno-paradigmas/',
          badge: { text: 'Completo', variant: 'success' },
        },
        { label: '4. Las partes del proyecto', link: '/04-partes-del-proyecto/' },
        { label: '5. Lenguajes y librerías', link: '/05-lenguajes-y-librerias/' },
        {
          label: '6. Coding agents',
          link: '/06-coding-agents/',
          badge: { text: 'Completo', variant: 'success' },
        },
        {
          label: '7. Skills y mejores prácticas',
          link: '/07-skills-mejores-practicas/',
          badge: { text: 'Completo', variant: 'success' },
        },
        {
          label: '8. Git, GitHub y deploy',
          link: '/08-git-github-deploy/',
          badge: { text: 'Completo', variant: 'success' },
        },
        {
          label: '9. Tu primer aporte',
          link: '/09-primer-aporte/',
          badge: { text: 'Completo', variant: 'success' },
        },
        { label: '10. Cómo seguir', link: '/10-como-seguir/' },
      ],
    }),
  ],
})
