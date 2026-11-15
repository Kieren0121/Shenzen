import { Application } from './core/Application';
import { ShenzhenScene } from './scenes/shenzhen/ShenzhenScene';
import { GroundwaterScene } from './scenes/groundwater/GroundwaterScene';

function boot(): void {
  const root = document.getElementById('app');
  if (!root) return;
  const app = new Application(root, [() => new ShenzhenScene(), () => new GroundwaterScene()]);
  app.start().catch((e: unknown) => {
    console.error(e);
    app.ui.showError('Something went wrong while building the 3D models', String((e as Error)?.message ?? e));
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
