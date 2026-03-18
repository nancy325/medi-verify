import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ImageUploadComponent } from './components/image-upload/image-upload.component';
import { ResultCardComponent } from './components/result-card/result-card.component';
import { SellerInfoComponent } from './components/seller-info/seller-info.component';
import { MedicineResult, SellerInfo } from './models/medicine.model';
import { MedicineService } from './services/medicine.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ImageUploadComponent,
    ResultCardComponent,
    SellerInfoComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 sm:p-6">
      <main class="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header class="text-center">
          <h1 class="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            🏥 Medi-Verify
          </h1>
          <p class="mt-3 text-base text-slate-600 sm:text-lg">
            Upload a medicine strip photo to verify authenticity
          </p>
        </header>

        <app-image-upload (resultFound)="onResultFound($event)"></app-image-upload>

        <app-result-card *ngIf="medicineResult" [result]="medicineResult"></app-result-card>

        <app-seller-info *ngIf="seller" [seller]="seller"></app-seller-info>

        <footer class="pt-2 text-center text-xs text-slate-500">
          Built for hackathon demos — results are advisory only.
        </footer>
      </main>
    </div>
  `
})
export class AppComponent {
  medicineResult: MedicineResult | null = null;
  seller: SellerInfo | null = null;

  constructor(private readonly medicineService: MedicineService) {}

  onResultFound(result: MedicineResult): void {
    this.medicineResult = result;
    this.seller = this.medicineService.getSeller();
  }
}
