import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { MedicineResult, RedFlag } from '../../models/medicine.model';

@Component({
  selector: 'app-result-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      *ngIf="result"
      class="rounded-xl bg-white p-6 shadow-lg"
      [ngClass]="{
        'border-l-4 border-green-500': isAuthentic(result),
        'border-l-4 border-red-500': !isAuthentic(result)
      }"
    >
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-sm font-semibold text-slate-600">Authenticity score</p>
          <p
            class="text-5xl font-extrabold tracking-tight"
            [ngClass]="{
              'text-green-600': isAuthentic(result),
              'text-red-600': !isAuthentic(result)
            }"
          >
            {{ result.authenticity_score }}%
          </p>
        </div>

        <div
          class="w-full rounded-lg p-4 text-sm font-semibold sm:max-w-md"
          [ngClass]="{
            'bg-green-50 text-green-800': isAuthentic(result),
            'bg-red-50 text-red-800': !isAuthentic(result)
          }"
        >
          {{ result.summary }}
        </div>
      </div>

      <div class="mt-6">
        <p class="text-sm font-semibold text-slate-700">Red flags</p>

        <div *ngIf="result.red_flags.length === 0" class="mt-2 text-slate-700">
          No red flags detected ✓
        </div>

        <ul *ngIf="result.red_flags.length > 0" class="mt-2 space-y-3">
          <li
            *ngFor="let redFlag of result.red_flags; trackBy: trackByFlag"
            class="rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <div class="flex items-start justify-between gap-4">
              <p class="font-semibold text-slate-900">{{ redFlag.flag }}</p>
              <span class="shrink-0 rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-800">
                {{ redFlag.confidence }}%
              </span>
            </div>
          </li>
        </ul>
      </div>
    </section>
  `
})
export class ResultCardComponent {
  @Input({ required: true }) result: MedicineResult | null = null;

  isAuthentic(result: MedicineResult): boolean {
    return result.authenticity_score >= 75;
  }

  trackByFlag(_index: number, item: RedFlag): string {
    return item.flag;
  }
}

