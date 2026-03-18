import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { SellerInfo } from '../../models/medicine.model';

@Component({
  selector: 'app-seller-info',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section *ngIf="seller" class="rounded-xl bg-white p-6 shadow-lg">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold text-slate-600">Seller</p>
          <h3 class="mt-1 text-xl font-bold text-slate-900">
            {{ seller.name }}
          </h3>
        </div>

        <span
          class="rounded-full px-3 py-1 text-xs font-semibold"
          [ngClass]="{
            'bg-green-100 text-green-800': seller.isVerified,
            'bg-slate-200 text-slate-800': !seller.isVerified
          }"
        >
          {{ seller.isVerified ? 'Verified' : 'Unverified' }}
        </span>
      </div>

      <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p class="text-xs font-semibold text-slate-600">Rating</p>
          <p class="mt-1 text-lg font-bold text-slate-900">
            {{ seller.rating }} <span class="text-sm font-semibold text-slate-600">/ 5</span>
          </p>
        </div>

        <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p class="text-xs font-semibold text-slate-600">Reviews</p>
          <p class="mt-1 text-lg font-bold text-slate-900">
            {{ seller.reviews }}
          </p>
        </div>

        <div
          class="rounded-lg border border-slate-200 p-4"
          [ngClass]="{
            'bg-green-50': isTrusted(seller),
            'bg-red-50': !isTrusted(seller)
          }"
        >
          <p class="text-xs font-semibold text-slate-600">Trust score</p>
          <p
            class="mt-1 text-lg font-extrabold"
            [ngClass]="{
              'text-green-700': isTrusted(seller),
              'text-red-700': !isTrusted(seller)
            }"
          >
            {{ seller.trustScore }}%
          </p>
        </div>
      </div>
    </section>
  `
})
export class SellerInfoComponent {
  @Input({ required: true }) seller: SellerInfo | null = null;

  isTrusted(seller: SellerInfo): boolean {
    return seller.trustScore >= 70;
  }
}

