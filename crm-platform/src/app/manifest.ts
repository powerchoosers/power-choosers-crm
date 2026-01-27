import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nodal Point CRM',
    short_name: 'Nodal Point',
    description: 'The forensic engine for the Texas energy market.',
    start_url: '/network',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#09090b',
    icons: [
      {
        src: '/images/nodalpoint-webicon.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  }
}
