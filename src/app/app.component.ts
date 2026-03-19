import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';

import { ImageUploadComponent } from './components/image-upload/image-upload.component';
import { ResultCardComponent } from './components/result-card/result-card.component';
import { SellerInfoComponent } from './components/seller-info/seller-info.component';
import { AiExplanationComponent } from './components/ai-explanation/ai-explanation.component';
import { MedicineResult, SellerInfo } from './models/medicine.model';
import { MedicineService } from './services/medicine.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ImageUploadComponent,
    ResultCardComponent,
    SellerInfoComponent,
    AiExplanationComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Animated Background -->
    <div class="animated-bg">
      <div class="floating-orb orb-1"></div>
      <div class="floating-orb orb-2"></div>
      <div class="floating-orb orb-3"></div>
      <div class="floating-orb orb-4"></div>
    </div>

    <!-- Main Content -->
    <div class="app-container">
      <main class="main-content">
        <!-- Header -->
        <header class="app-header" style="animation: slideInUp 0.5s ease-out both;">
          <div class="header-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            AI-Powered Verification
          </div>
          <h1 class="app-title">
            <span class="title-icon">🏥</span> Medi-Verify
          </h1>
          <p class="app-subtitle">
            Upload a medicine strip photo to instantly verify authenticity using BLIP-2 AI vision analysis
          </p>
        </header>

        <!-- Upload -->
        <app-image-upload (resultFound)="onResultFound($event)"></app-image-upload>

        <!-- Results -->
        <app-result-card *ngIf="medicineResult" [result]="medicineResult"></app-result-card>

        <!-- AI Explanation Panel (Innovation Feature) -->
        <app-ai-explanation
          *ngIf="medicineResult?.ai_explanations?.length"
          [explanations]="medicineResult!.ai_explanations!"
        ></app-ai-explanation>

        <!-- Seller Info -->
        <app-seller-info *ngIf="seller" [seller]="seller"></app-seller-info>

        <!-- Footer -->
        <footer class="app-footer" style="animation: fadeIn 1s ease-out both; animation-delay: 0.5s;">
          <p>Built with <span style="color: var(--accent-red);">♥</span> for hackathon demos — results are advisory only</p>
          <p class="footer-tech">Powered by BLIP-2 Vision AI • Angular 17 • Express.js</p>
        </footer>
      </main>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
    }

    .app-container {
      position: relative;
      z-index: 1;
      min-height: 100vh;
      padding: 1.5rem;
    }

    .main-content {
      max-width: 720px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    /* ─── Header ─── */
    .app-header {
      text-align: center;
      padding: 2rem 0 0.5rem;
    }

    .header-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0.35rem 1rem;
      border-radius: 20px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15));
      border: 1px solid rgba(99, 102, 241, 0.25);
      color: var(--accent-blue);
      font-family: var(--font-display);
      font-size: 0.75rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }

    .app-title {
      font-family: var(--font-display);
      font-size: 3rem;
      font-weight: 900;
      background: linear-gradient(135deg, #fff 0%, #c7d2fe 50%, var(--accent-purple) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      line-height: 1.2;
      letter-spacing: -0.03em;
    }

    .title-icon {
      -webkit-text-fill-color: initial;
    }

    .app-subtitle {
      margin-top: 0.75rem;
      font-size: 1rem;
      color: var(--text-secondary);
      line-height: 1.6;
      max-width: 500px;
      margin-left: auto;
      margin-right: auto;
    }

    /* ─── Footer ─── */
    .app-footer {
      text-align: center;
      padding: 1rem 0 1.5rem;
      color: var(--text-secondary);
      font-size: 0.75rem;
    }
    .footer-tech {
      margin-top: 0.25rem;
      opacity: 0.6;
      font-size: 0.7rem;
    }

    @media (max-width: 640px) {
      .app-title {
        font-size: 2rem;
      }
      .app-subtitle {
        font-size: 0.875rem;
      }
      .app-container {
        padding: 1rem;
      }
    }
  `]
})
export class AppComponent {
  medicineResult: MedicineResult | null = null;
  seller: SellerInfo | null = null;

  constructor(
    private readonly medicineService: MedicineService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  onResultFound(result: MedicineResult): void {
    this.medicineResult = result;
    this.seller = this.medicineService.getSeller();
    this.cdr.markForCheck();
  }
}
