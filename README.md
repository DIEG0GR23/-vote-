# VOTE!

Votación de clips de Twitch: el streamer crea categorías, nomina clips y su chat vota.

## Arrancar

Necesitas Node.js 18 o más nuevo. No hay que instalar nada más.

```bash
cd ~/Documents/vote-twitch
node server.js
```

Abre http://localhost:3000/streamer

Si no hay archivo `.env`, arranca en **modo demo**. El login de Twitch es simulado y el título del clip se toma del link.

## Conectar Twitch de verdad

1. Entra a https://dev.twitch.tv/console/apps e inicia sesión con tu cuenta de Twitch. Si te lo pide, activa la verificación en dos pasos.
2. Elige **Register Your Application**:
   - Name: `VOTE` seguido de algo único (ej. `VOTE Antleo78`)
   - OAuth Redirect URLs: `http://localhost:3000/auth/callback`
   - Category: Website Integration
   - Client type: Confidential
3. Abre la app y copia el **Client ID**. Luego presiona **New Secret** y copia el **Client Secret**.
4. Copia `.env.example` como `.env` y pega los dos valores.
5. Reinicia el servidor (`Ctrl+C` y `node server.js`).

Con esto, el login es real y al pegar un link de clip se traen el título, la miniatura, el canal y quién lo clipeó directo de Twitch.

## Qué incluye

- **Panel del streamer** (`/streamer`):
  - inicio con accesos rápidos
  - categorías (crear, renombrar, buscar, nominar y quitar clips)
  - añadir clip con vista previa y "Guardar en"
  - panel en vivo con temporizador, +10s/+30s, reiniciar y terminar
  - resultados con gráfica
  - consola de seguridad
- **Página del viewer** (`/v/<tu_usuario>`): login con Twitch, ver clips, votar. Se permite un voto por cuenta y por categoría.
- **Overlay para OBS** (`/overlay/<tu_usuario>`): gráfica y temporizador con fondo transparente. Agrégalo en OBS como "Fuente de navegador".

Los datos se guardan en `data/db.json`.

## Para que tu chat vote desde internet

`localhost` solo existe en tu computadora. Para que otros voten, sube el proyecto a un hosting de Node, como Render, Railway o Fly.io. Después:

1. Cambia `BASE_URL` en `.env` a tu dominio con https.
2. Agrega `https://tu-dominio/auth/callback` en los Redirect URLs de tu app de Twitch.

Los clips incrustados de Twitch requieren https fuera de localhost.

## Siguientes pasos sugeridos

- Pasar a una base de datos real (SQLite o Postgres) cuando haya muchos votos.
- Revelar al ganador con animación en el overlay.
- Exigir que el viewer siga el canal (requiere permisos extra de Twitch).
