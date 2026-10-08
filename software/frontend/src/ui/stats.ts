import { VEHICLES } from '../sim/vehicles';
import { t, type Key } from '../i18n';

const LABELS: (keyof (typeof VEHICLES)['michi']['stats'])[] = ['speed', 'acceleration', 'handling', 'weight', 'braking', 'boost'];

/** Barras de estadísticas (1..5 estrellas) del vehículo. */
export function renderStats(el: HTMLElement, vehicleId = 'michi') {
  const stats = VEHICLES[vehicleId].stats;
  el.innerHTML = LABELS.map((key) => {
    const label = t(`stat.${key}` as Key);
    const pct = stats[key] * 20;
    return `<div class="stat"><div class="stat-label"><span>${label}</span><span>${'★'.repeat(stats[key])}${'☆'.repeat(5 - stats[key])}</span></div><div class="stat-bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
}
