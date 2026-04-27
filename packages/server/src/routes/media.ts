/**
 * media.ts — placeholder route for /api/media. The original routes file
 * was not captured in the recovery transcript, so this stub keeps server
 * boot green. Returns 501 for any request; restore real handlers if/when
 * media features (avatar upload, etc.) are needed.
 */
import { Hono } from 'hono';

export const mediaRoutes = new Hono();

mediaRoutes.all('*', (c) => c.json({ error: 'media route not implemented' }, 501));
